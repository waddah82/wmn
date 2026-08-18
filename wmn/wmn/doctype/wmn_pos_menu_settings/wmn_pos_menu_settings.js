frappe.ui.form.on("WMN POS Menu Settings", {
    setup(frm) {
        frm.set_query("doctype_name", "menu_items", () => ({
            filters: { istable: 0 },
        }));
    },
});
