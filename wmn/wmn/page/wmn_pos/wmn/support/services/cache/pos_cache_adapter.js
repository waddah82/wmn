/* WMN POS local cache adapter. Manages local cache records only; no server synchronization. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services = ns.Services || {};
    ns.Services.Cache = ns.Services.Cache || {};

    const Registry = ns.Services.Cache.PosCacheRegistry;

    function clone(value) {
        if (value === undefined) return undefined;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function text(value) {
        return String(value ?? "").trim();
    }

    function offlineRuntime() {
        try {
            if (typeof window.wmn_is_pos_offline === "function") return Boolean(window.wmn_is_pos_offline());
        } catch (error) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function storage() {
        if (!window.wmnPOSOffline) throw new Error(__("WMN POS offline storage is not available."));
        return window.wmnPOSOffline;
    }

    function adapter(sourceId) {
        const value = Registry?.get?.(sourceId);
        if (!value) throw new Error(__("Unknown POS cache source: {0}", [sourceId]));
        return value;
    }

    function rowKey(config, row) {
        if (!config || !row) return "";
        const identityField = config.keyFields?.[0] || "";
        if (identityField && text(row[identityField])) return text(row[identityField]);
        if (typeof config.buildKey === "function") return text(config.buildKey(row));
        return "";
    }

    function requiredFieldNames(config) {
        return Array.from(new Set([...(config.requiredFields || []), ...(config.keyFields || []).filter(name => name !== "key")]));
    }

    function normalizeForSave(config, sourceRecord) {
        const row = clone(sourceRecord || {}) || {};
        if (typeof config.buildKey === "function") {
            const generated = text(config.buildKey(row));
            if (generated) row.key = generated;
        }
        return row;
    }

    function validate(config, row) {
        const missing = requiredFieldNames(config).filter(fieldname => !text(row[fieldname]) && row[fieldname] !== 0 && row[fieldname] !== false);
        if (missing.length) {
            throw new Error(__("Required cache fields are missing: {0}", [missing.join(", ")]));
        }

        const identity = rowKey(config, row);
        if (!identity) {
            throw new Error(__("Unable to determine the cache record key."));
        }
        return identity;
    }

    function searchableText(config, row) {
        const fields = new Set([
            ...(config.searchFields || []),
            ...(config.titleFields || []),
            ...(config.keyFields || []),
        ]);
        return Array.from(fields)
            .map(fieldname => {
                const value = row?.[fieldname];
                return value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
            })
            .join(" ")
            .toLowerCase();
    }

    function title(config, row) {
        for (const fieldname of config.titleFields || []) {
            const value = text(row?.[fieldname]);
            if (value) return value;
        }
        return rowKey(config, row) || __("Cache Record");
    }

    function subtitle(config, row) {
        const primary = title(config, row);
        const values = [];
        for (const fieldname of [...(config.searchFields || []), ...(config.keyFields || [])]) {
            const value = row?.[fieldname];
            if (value === undefined || value === null || typeof value === "object") continue;
            const normalized = text(value);
            if (!normalized || normalized === primary || values.includes(normalized)) continue;
            values.push(normalized);
            if (values.length >= 3) break;
        }
        return values.join(" · ");
    }

    function inferType(fieldname, value, hint) {
        if (hint?.type) return hint.type;
        if (Array.isArray(value) || (value && typeof value === "object")) return "JSON";
        if (typeof value === "boolean") return "Check";
        if (typeof value === "number") return Number.isInteger(value) ? "Int" : "Float";

        const name = text(fieldname).toLowerCase();
        if (/^(is_|has_|allow_|enable|enabled$|disabled$|selling$|default$)/.test(name)) return "Check";
        if (/(^|_)date$/.test(name) && !/(datetime|time)/.test(name)) return "Date";
        if (/(creation|modified|datetime|period_start|period_end)/.test(name)) return "Datetime";
        if (/(description|notes|reason|html|json|map|options|fields)/.test(name) || String(value ?? "").length > 140) return "Long Text";
        return "Data";
    }

    function inferFields(sourceId, row = null, sampleRows = []) {
        const config = adapter(sourceId);
        const names = [];
        const seen = new Set();
        const add = name => {
            if (!name || seen.has(name)) return;
            seen.add(name);
            names.push(name);
        };

        (config.keyFields || []).forEach(add);
        (config.requiredFields || []).forEach(add);
        Object.keys(config.fieldHints || {}).forEach(add);
        Object.keys(row || {}).forEach(add);
        (sampleRows || []).slice(0, 25).forEach(sample => Object.keys(sample || {}).forEach(add));

        return names.map((fieldname, index) => {
            const hint = config.fieldHints?.[fieldname] || {};
            let sampleValue = row?.[fieldname];
            if (sampleValue === undefined) {
                const sample = (sampleRows || []).find(candidate => candidate?.[fieldname] !== undefined);
                sampleValue = sample?.[fieldname];
            }
            return {
                fieldname,
                label: hint.label || frappe.unscrub?.(fieldname) || fieldname,
                type: inferType(fieldname, sampleValue, hint),
                required: requiredFieldNames(config).includes(fieldname),
                identity: (config.keyFields || []).includes(fieldname),
                order: index,
            };
        });
    }

    async function list(sourceId, options = {}) {
        const config = adapter(sourceId);
        const data = await (storage().getAllCached
            ? storage().getAllCached(config.storeName)
            : storage().getAll(config.storeName));
        const query = text(options.search).toLowerCase();
        let rows = (data || []).map(row => clone(row));
        if (query) rows = rows.filter(row => searchableText(config, row).includes(query));
        if (Number(options.limit || 0) > 0) rows = rows.slice(0, Number(options.limit));
        return rows;
    }

    async function get(sourceId, key) {
        const config = adapter(sourceId);
        if (!text(key)) return null;
        return clone(await storage().get(config.storeName, key));
    }

    async function count(sourceId) {
        const config = adapter(sourceId);
        const db = await storage().openDB();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(config.storeName, "readonly");
            const request = tx.objectStore(config.storeName).count();
            request.onsuccess = () => resolve(Number(request.result || 0));
            request.onerror = () => reject(request.error);
        });
    }

    async function save(sourceId, record, options = {}) {
        const config = adapter(sourceId);
        const originalKey = text(options.originalKey);
        const isNew = Boolean(options.isNew);
        const sourceRow = clone(record || {}) || {};

        if (!isNew && originalKey && (config.keyFields || [])[0] === "key") {
            sourceRow.key = originalKey;
        }

        const row = normalizeForSave(config, sourceRow);
        if (!isNew && originalKey && (config.keyFields || [])[0] === "key") {
            row.key = originalKey;
        }
        const key = validate(config, row);

        if (!isNew && originalKey && originalKey !== key) {
            throw new Error(__("Cache identity fields cannot be changed while editing. Add a new cache record instead."));
        }

        if (isNew) {
            const existing = await storage().get(config.storeName, key);
            if (existing) throw new Error(__("A cache record with this key already exists."));
        }

        await storage().bulkPut(config.storeName, [row]);
        const detail = {
            source_id: sourceId,
            store_name: config.storeName,
            key,
            is_new: isNew,
            record: clone(row),
            offline_runtime: offlineRuntime(),
        };

        window.dispatchEvent(new CustomEvent("wmn:pos-cache-updated", { detail }));
        return detail;
    }

    async function sourceSummaries() {
        const configs = Registry?.all?.() || [];
        return await Promise.all(configs.map(async config => {
            let countValue = 0;
            try {
                countValue = await count(config.id);
            } catch (error) {
                console.warn(`Unable to count POS cache source ${config.id}`, error);
            }
            return Object.assign({}, config, { count: countValue });
        }));
    }

    ns.Services.Cache.PosCacheAdapter = {
        listSources: sourceSummaries,
        list,
        get,
        count,
        save,
        inferFields,
        getConfig: sourceId => adapter(sourceId),
        getKey: (sourceId, row) => rowKey(adapter(sourceId), row),
        getTitle: (sourceId, row) => title(adapter(sourceId), row),
        getSubtitle: (sourceId, row) => subtitle(adapter(sourceId), row),
        isOfflineRuntime: offlineRuntime,
    };
})();
