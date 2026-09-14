/* WMN owns Pricing Rule execution inside POS. ERPNext native execution stays disabled. */
frappe.ui.form.on("POS Profile", {
    refresh(frm) {
        frm.set_df_property("ignore_pricing_rule", "hidden", 1);
        if (cint(frm.doc.ignore_pricing_rule || 0) !== 1) {
            frm.set_value("ignore_pricing_rule", 1);
        }
        if (frm.fields_dict.wmn_receipt_print_format_source) {
            frm.set_df_property("wmn_receipt_print_format_source", "hidden", 0);
            frm.toggle_display("wmn_receipt_print_format_source", true);
        }
        if (frm.doc.name && !frm.is_new()) {
            frm.add_custom_button(__("WMN POS Profile Settings"), () => {
                frappe.set_route("Form", "WMN POS Profile Settings", frm.doc.name);
            });
        }
    },
    validate(frm) {
        frm.doc.ignore_pricing_rule = 1;
    },
});
