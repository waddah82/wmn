frappe.ui.form.on("WMN POS Dialog Script", {
    setup(frm) {
        frm.set_query("target_doctype", () => ({
            filters: { istable: 0 },
        }));
    },
});
