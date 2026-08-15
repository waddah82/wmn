/* Online adapter for WMN POS DocType management. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.DoctypeManager = ns.Features.DoctypeManager || {};

    const MENU_CACHE_KEY = "wmn_doctype_manager_menu";
    const MODEL_CACHE_KEY = "wmn_doctype_manager_models";
    const PRELOAD_CONCURRENCY = 2;

    function normalizeSearch(value) {
        return String(value || "").trim();
    }

    async function getAvailableDoctypes() {
        const response = await frappe.call({
            method: "wmn.pos_doctype_manager.get_available_pos_doctypes",
            args: {},
            freeze: false,
        });
        return Array.isArray(response?.message) ? response.message : [];
    }

    function isPendingLocalRecord(record) {
        return Boolean(record?.sync_status && record.sync_status !== "clean");
    }

    function localRecordMatchesSearch(record, search, titleField) {
        if (!search) return true;
        const needle = String(search || "").toLowerCase();
        const values = record?.values || {};
        const candidates = [record?.name, values.name];
        if (titleField) candidates.push(values[titleField]);
        return candidates.some((value) => String(value ?? "").toLowerCase().includes(needle));
    }

    async function mergePendingLocalDocuments(doctype, rows, search, titleField, limitPageLength) {
        if (!window.wmnPOSOffline?.listOfflineDoctypeRecords) return rows;

        const localRecords = await window.wmnPOSOffline.listOfflineDoctypeRecords(doctype);
        const pendingRows = (localRecords || [])
            .filter(isPendingLocalRecord)
            .filter((record) => localRecordMatchesSearch(record, search, titleField))
            .map((record) => Object.assign({}, record.values || {}, {
                name: record.name,
                modified: record.modified || record.values?.modified || "",
                __wmn_sync_status: record.sync_status || "clean",
                __wmn_local_record: 1,
                __wmn_local_updated_at: record.local_updated_at || "",
            }));

        if (!pendingRows.length) return rows;

        const merged = new Map();
        for (const row of rows || []) {
            if (row?.name) merged.set(String(row.name), row);
        }
        for (const row of pendingRows) {
            if (row?.name) merged.set(String(row.name), row);
        }

        return Array.from(merged.values())
            .sort((a, b) => String(b.__wmn_local_updated_at || b.modified || "")
                .localeCompare(String(a.__wmn_local_updated_at || a.modified || "")))
            .slice(0, Math.max(1, cint(limitPageLength || 50)));
    }

    async function listDocuments(config) {
        const doctype = String(config?.doctype || "").trim();
        const titleField = String(config?.title_field || "").trim();
        const search = normalizeSearch(config?.search);
        const fields = ["name", "modified", "owner"];
        const limitPageLength = cint(config?.limit_page_length || 50);

        if (titleField && !fields.includes(titleField)) fields.push(titleField);

        const options = {
            fields,
            order_by: "modified desc",
            limit_start: cint(config?.limit_start || 0),
            limit_page_length: limitPageLength,
        };

        if (search) {
            const orFilters = [["name", "like", `%${search}%`]];
            if (titleField) orFilters.push([titleField, "like", `%${search}%`]);
            options.or_filters = orFilters;
        }

        let rows;
        try {
            rows = await frappe.db.get_list(doctype, options);
        } catch (error) {
            if (!titleField) throw error;
            delete options.or_filters;
            options.fields = ["name", "modified", "owner"];
            if (search) options.filters = [["name", "like", `%${search}%`]];
            rows = await frappe.db.get_list(doctype, options);
        }

        return mergePendingLocalDocuments(doctype, rows || [], search, titleField, limitPageLength);
    }

    async function getDialogScripts(doctype) {
        const response = await frappe.call({
            method: "wmn.pos_doctype_manager.get_dialog_scripts",
            args: { doctype },
            freeze: false,
        });
        return Array.isArray(response?.message) ? response.message : [];
    }

    async function getOfflineModels(doctype = "") {
        const response = await frappe.call({
            method: "wmn.pos_doctype_manager.get_offline_doctype_models",
            args: { doctype },
            freeze: false,
        });
        return Array.isArray(response?.message) ? response.message : [];
    }

    async function getOfflineSnapshot(doctype) {
        const response = await frappe.call({
            method: "wmn.pos_doctype_manager.get_offline_doctype_snapshot",
            args: { doctype },
            freeze: false,
        });
        return response?.message || null;
    }

    async function syncOfflineDocument(payload) {
        const response = await frappe.call({
            method: "wmn.pos_doctype_manager.sync_offline_doctype_document",
            args: { payload },
            freeze: false,
        });
        return response?.message || null;
    }

    async function cacheConfiguration() {
        if (!window.wmnPOSOffline?.setSetting) return { menu: [], models: [] };
        const [menu, models] = await Promise.all([
            getAvailableDoctypes(),
            getOfflineModels(),
        ]);
        await Promise.all([
            window.wmnPOSOffline.setSetting(MENU_CACHE_KEY, menu),
            window.wmnPOSOffline.setSetting(MODEL_CACHE_KEY, models),
        ]);
        return { menu, models };
    }

    async function cacheDoctype(doctype) {
        if (!window.wmnPOSOffline?.replaceOfflineDoctypeSnapshot) return null;
        const snapshot = await getOfflineSnapshot(doctype);
        if (!snapshot?.model) return snapshot;
        await window.wmnPOSOffline.replaceOfflineDoctypeSnapshot(
            snapshot.model.doctype,
            snapshot.documents || []
        );
        return snapshot;
    }

    async function preloadConfigured(models) {
        const queue = (models || []).filter((model) => model.load_strategy === "On POS Load");
        let index = 0;
        const workers = Array.from({ length: Math.min(PRELOAD_CONCURRENCY, queue.length) }, async () => {
            while (index < queue.length) {
                const current = queue[index++];
                try {
                    await cacheDoctype(current.doctype);
                } catch (error) {
                    console.warn(`WMN POS offline preload failed for ${current.doctype}`, error);
                }
            }
        });
        await Promise.all(workers);
    }

    ns.Features.DoctypeManager.Online = {
        getAvailableDoctypes,
        listDocuments,
        getDialogScripts,
        getOfflineModels,
        getOfflineSnapshot,
        syncOfflineDocument,
        cacheConfiguration,
        cacheDoctype,
        preloadConfigured,
        MENU_CACHE_KEY,
        MODEL_CACHE_KEY,
    };
})();
