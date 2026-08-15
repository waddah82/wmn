/* Online adapter for WMN POS DocType management. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.DoctypeManager = ns.Features.DoctypeManager || {};

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

    async function listDocuments(config) {
        const doctype = String(config?.doctype || "").trim();
        const titleField = String(config?.title_field || "").trim();
        const search = normalizeSearch(config?.search);
        const fields = ["name", "modified", "owner"];

        if (titleField && !fields.includes(titleField)) fields.push(titleField);

        const options = {
            fields,
            order_by: "modified desc",
            limit_start: cint(config?.limit_start || 0),
            limit_page_length: cint(config?.limit_page_length || 50),
        };

        if (search) {
            const orFilters = [["name", "like", `%${search}%`]];
            if (titleField) orFilters.push([titleField, "like", `%${search}%`]);
            options.or_filters = orFilters;
        }

        try {
            return await frappe.db.get_list(doctype, options);
        } catch (error) {
            if (!titleField) throw error;
            delete options.or_filters;
            options.fields = ["name", "modified", "owner"];
            if (search) options.filters = [["name", "like", `%${search}%`]];
            return frappe.db.get_list(doctype, options);
        }
    }

    ns.Features.DoctypeManager.Online = {
        getAvailableDoctypes,
        listDocuments,
    };
})();
