/* Offline adapter for lightweight WMN POS DocType management. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.DoctypeManager = ns.Features.DoctypeManager || {};

    const MENU_CACHE_KEY = "wmn_doctype_manager_menu";
    const MODEL_CACHE_KEY = "wmn_doctype_manager_models";

    async function getOfflineModels(doctype = "") {
        const rows = await window.wmnPOSOffline?.getSetting?.(MODEL_CACHE_KEY) || [];
        const models = Array.isArray(rows) ? rows : [];
        const key = String(doctype || "").trim();
        return key ? models.filter((model) => model.doctype === key) : models;
    }

    async function getModel(doctype) {
        const rows = await getOfflineModels(doctype);
        return rows[0] || null;
    }

    function modeAllowsCreate(mode) {
        return mode === "Read + Create" || mode === "Read + Create + Edit";
    }

    function modeAllowsEdit(mode) {
        return mode === "Read + Create + Edit";
    }

    async function getAvailableDoctypes() {
        const [menuRows, models] = await Promise.all([
            window.wmnPOSOffline?.getSetting?.(MENU_CACHE_KEY),
            getOfflineModels(),
        ]);
        const modelMap = new Map((models || []).map((model) => [model.doctype, model]));
        return (Array.isArray(menuRows) ? menuRows : [])
            .filter((row) => row && modelMap.has(row.doctype))
            .map((row) => {
                const model = modelMap.get(row.doctype);
                return Object.assign({}, row, {
                    offline_enabled: 1,
                    offline_mode: model.offline_mode,
                    can_create: cint(row.can_create || 0) && cint(model.can_create || 0) && modeAllowsCreate(model.offline_mode) ? 1 : 0,
                    can_write: cint(row.can_write || 0) && cint(model.can_write || 0) && modeAllowsEdit(model.offline_mode) ? 1 : 0,
                    __wmn_offline_model: model,
                });
            });
    }

    function normalizeSearch(value) {
        return String(value || "").trim().toLowerCase();
    }

    async function listDocuments(config) {
        const doctype = String(config?.doctype || "").trim();
        const model = await getModel(doctype);
        if (!model) return [];
        const records = await window.wmnPOSOffline?.listOfflineDoctypeRecords?.(doctype) || [];
        const search = normalizeSearch(config?.search);
        const searchable = new Set(
            (model.fields || []).filter((field) => field.searchable).map((field) => field.fieldname)
        );
        searchable.add("name");
        if (model.title_field) searchable.add(model.title_field);

        const rows = records.map((record) => Object.assign({}, record.values || {}, {
            name: record.name,
            modified: record.modified || record.values?.modified || "",
            __wmn_sync_status: record.sync_status || "clean",
            __wmn_local_updated_at: record.local_updated_at || "",
        }));

        const filtered = !search ? rows : rows.filter((row) => {
            for (const fieldname of searchable) {
                if (String(row?.[fieldname] ?? "").toLowerCase().includes(search)) return true;
            }
            return false;
        });

        filtered.sort((a, b) => String(b.__wmn_local_updated_at || b.modified || "").localeCompare(String(a.__wmn_local_updated_at || a.modified || "")));
        const start = cint(config?.limit_start || 0);
        const length = cint(config?.limit_page_length || 50);
        return filtered.slice(start, start + length);
    }

    async function getDocument(doctype, name) {
        const record = await window.wmnPOSOffline?.getOfflineDoctypeRecord?.(doctype, name);
        return record ? Object.assign({}, record.values || {}, { name: record.name }) : null;
    }

    function validateRequired(model, values) {
        const missing = [];
        for (const field of model?.fields || []) {
            if (!field.required_offline) continue;
            const value = values?.[field.fieldname];
            if (value === undefined || value === null || value === "") missing.push(field.label || field.fieldname);
        }
        if (missing.length) {
            throw new Error(__("Required offline fields: {0}", [missing.join(", ")]));
        }
    }

    async function saveDocument(config) {
        const doctype = String(config?.doctype || "").trim();
        const model = await getModel(doctype);
        if (!model) throw new Error(__("Offline access is not configured for {0}.", [doctype]));
        validateRequired(model, config?.values || {});
        return window.wmnPOSOffline.saveOfflineDoctypeRecord({
            doctype,
            name: config?.name || "",
            values: config?.values || {},
            is_new: Boolean(config?.is_new),
        });
    }

    async function getDialogScripts() {
        return [];
    }

    ns.Features.DoctypeManager.Offline = {
        getAvailableDoctypes,
        listDocuments,
        getDocument,
        saveDocument,
        getDialogScripts,
        getOfflineModels,
        getModel,
        MENU_CACHE_KEY,
        MODEL_CACHE_KEY,
    };
})();
