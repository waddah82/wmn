/* WMN owns Pricing Rule execution inside POS. ERPNext native execution stays disabled. */
frappe.ui.form.on("POS Profile", {
    refresh(frm) {
        frm.set_df_property("ignore_pricing_rule", "hidden", 1);
        if (cint(frm.doc.ignore_pricing_rule || 0) !== 1) {
            frm.set_value("ignore_pricing_rule", 1);
        }
    },
    validate(frm) {
        frm.doc.ignore_pricing_rule = 1;
    },
});
