(() => {
    "use strict";

    const SUPPORTED_FIELD_TYPES = new Set([
        "Data", "Autocomplete", "Barcode", "Check", "Code", "Color", "Currency", "Date", "Datetime",
        "Duration", "Dynamic Link", "Float", "Int", "JSON", "Link", "Long Text", "Markdown Editor",
        "Percent", "Phone", "Read Only", "Rating", "Select", "Small Text", "Text", "Text Editor", "Time",
    ]);

    function dataFields(doctype) {
        const meta = frappe.get_meta(doctype);
        return (meta?.fields || []).filter((df) =>
            df.fieldname && SUPPORTED_FIELD_TYPES.has(df.fieldtype)
        );
    }

    function normalizeFieldList(value) {
        if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
        return String(value || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function autonameField(meta) {
        const autoname = String(meta?.autoname || "").trim();
        return autoname.startsWith("field:") ? autoname.slice(6).trim() : "";
    }

    function automaticFieldNames(meta, doctype) {
        const names = new Set();
        const available = new Map(dataFields(doctype).map((df) => [df.fieldname, df]));

        for (const df of available.values()) {
            if (cint(df.reqd || 0)) names.add(df.fieldname);
            if (cint(df.in_list_view || 0)) names.add(df.fieldname);
            if (cint(df.in_standard_filter || 0)) names.add(df.fieldname);
        }

        const titleField = String(meta?.title_field || "").trim();
        if (titleField && available.has(titleField)) names.add(titleField);

        const namingField = autonameField(meta);
        if (namingField && available.has(namingField)) names.add(namingField);

        for (const fieldname of normalizeFieldList(meta?.search_fields)) {
            if (available.has(fieldname)) names.add(fieldname);
        }

        for (const fieldname of Array.from(names)) {
            const df = available.get(fieldname);
            if (df?.fieldtype !== "Dynamic Link") continue;
            const dependency = String(df.options || "").trim();
            if (dependency && available.has(dependency)) names.add(dependency);
        }

        if (!names.size) {
            const fallback = Array.from(available.values()).find((df) =>
                !cint(df.read_only || 0) && ["Data", "Link", "Select"].includes(df.fieldtype)
            );
            if (fallback) names.add(fallback.fieldname);
        }

        return names;
    }

    function rowDefaults(meta, df) {
        const searchFields = new Set(normalizeFieldList(meta?.search_fields));
        const titleField = String(meta?.title_field || "").trim();
        const isTitle = df.fieldname === titleField;
        const isList = cint(df.in_list_view || 0) === 1;
        const isSearch = searchFields.has(df.fieldname) || cint(df.in_standard_filter || 0) === 1;
        const editable = !cint(df.read_only || 0) && df.fieldtype !== "Read Only";
        const required = cint(df.reqd || 0) === 1 && editable;

        return {
            fieldname: df.fieldname,
            label: df.label || df.fieldname,
            fieldtype: df.fieldtype || "Data",
            options: df.options || "",
            list_column: isTitle || isList ? 1 : 0,
            searchable: isTitle || isList || isSearch ? 1 : 0,
            editable_offline: editable ? 1 : 0,
            required_offline: required ? 1 : 0,
        };
    }

    async function loadMeta(doctype) {
        await new Promise((resolve) => frappe.model.with_doctype(doctype, resolve));
        return frappe.get_meta(doctype);
    }

    async function refreshFieldOptions(frm) {
        const doctype = String(frm.doc.target_doctype || "").trim();
        const grid = frm.fields_dict.offline_fields?.grid;
        if (!grid) return;

        if (!doctype) {
            grid.update_docfield_property("fieldname", "options", "");
            return;
        }

        await loadMeta(doctype);
        const options = dataFields(doctype).map((df) => df.fieldname).join("\n");
        grid.update_docfield_property("fieldname", "options", options);
        grid.refresh();
    }

    async function populateAutomaticFields(frm, { reset = false, notify = false } = {}) {
        const doctype = String(frm.doc.target_doctype || "").trim();
        if (!doctype || frm.__wmn_populating_offline_fields) return;

        frm.__wmn_populating_offline_fields = true;
        try {
            const meta = await loadMeta(doctype);
            const wanted = automaticFieldNames(meta, doctype);
            const byName = new Map(dataFields(doctype).map((df) => [df.fieldname, df]));

            if (reset) {
                frm.clear_table("offline_fields");
            }

            const existing = new Map(
                (frm.doc.offline_fields || [])
                    .filter((row) => row.fieldname)
                    .map((row) => [row.fieldname, row])
            );

            let added = 0;
            for (const fieldname of wanted) {
                const df = byName.get(fieldname);
                if (!df) continue;

                const defaults = rowDefaults(meta, df);
                const row = existing.get(fieldname);
                if (row) {
                    row.label = defaults.label;
                    row.fieldtype = defaults.fieldtype;
                    row.options = defaults.options;
                    if (cint(df.reqd || 0) && defaults.editable_offline) {
                        row.editable_offline = 1;
                        row.required_offline = 1;
                    }
                    continue;
                }

                frm.add_child("offline_fields", defaults);
                added += 1;
            }

            frm.refresh_field("offline_fields");
            await refreshFieldOptions(frm);

            if (notify) {
                frappe.show_alert({
                    message: added
                        ? __("Added {0} required/recommended offline fields.", [added])
                        : __("Offline fields are already up to date."),
                    indicator: added ? "green" : "blue",
                }, 4);
            }
        } finally {
            frm.__wmn_populating_offline_fields = false;
        }
    }

    frappe.ui.form.on("WMN POS Offline DocType", {
        setup(frm) {
            frm.set_query("target_doctype", () => ({
                filters: { istable: 0 },
            }));
        },

        async refresh(frm) {
            await refreshFieldOptions(frm);

            if (frm.doc.target_doctype && frm.is_new() && !(frm.doc.offline_fields || []).length) {
                await populateAutomaticFields(frm);
            }

            if (frm.doc.target_doctype) {
                frm.add_custom_button(__("Load Required Fields"), async () => {
                    await populateAutomaticFields(frm, { notify: true });
                });
            }
        },

        async target_doctype(frm) {
            frm.clear_table("offline_fields");
            frm.refresh_field("offline_fields");
            await refreshFieldOptions(frm);
            await populateAutomaticFields(frm, { reset: false });
        },

        async offline_mode(frm) {
            if (["Read + Create", "Read + Create + Edit"].includes(frm.doc.offline_mode)) {
                await populateAutomaticFields(frm);
            }
        },
    });

    frappe.ui.form.on("WMN POS Offline Field", {
        async fieldname(frm, cdt, cdn) {
            const row = locals[cdt]?.[cdn];
            const doctype = String(frm.doc.target_doctype || "").trim();
            const fieldname = String(row?.fieldname || "").trim();
            if (!doctype || !fieldname) return;

            const meta = await loadMeta(doctype);
            const df = dataFields(doctype).find((field) => field.fieldname === fieldname);
            if (!df) return;

            const defaults = rowDefaults(meta, df);
            await frappe.model.set_value(cdt, cdn, "label", defaults.label);
            await frappe.model.set_value(cdt, cdn, "fieldtype", defaults.fieldtype);
            await frappe.model.set_value(cdt, cdn, "options", defaults.options);

            if (row.__islocal) {
                await frappe.model.set_value(cdt, cdn, "list_column", defaults.list_column);
                await frappe.model.set_value(cdt, cdn, "searchable", defaults.searchable);
                await frappe.model.set_value(cdt, cdn, "editable_offline", defaults.editable_offline);
                await frappe.model.set_value(cdt, cdn, "required_offline", defaults.required_offline);
            }
        },
    });
})();
