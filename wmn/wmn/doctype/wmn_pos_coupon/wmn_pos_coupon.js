frappe.ui.form.on("WMN POS Coupon", {
    refresh(frm) {
        frm.trigger("wmn_refresh_coupon_fields");
    },

    coupon_type(frm) {
        if (frm.doc.coupon_type === "Gift Card" && frm.doc.maximum_use !== 1) {
            frm.set_value("maximum_use", 1);
        }
        frm.trigger("wmn_refresh_coupon_fields");
    },

    discount_type(frm) {
        frm.trigger("wmn_refresh_coupon_fields");
    },

    wmn_refresh_coupon_fields(frm) {
        const isGiftCard = frm.doc.coupon_type === "Gift Card";
        frm.toggle_display("discount_percentage", frm.doc.discount_type === "Percentage");
        frm.toggle_display("discount_amount", frm.doc.discount_type === "Amount");
        frm.toggle_display("maximum_use", !isGiftCard);
        frm.set_df_property("customer", "reqd", isGiftCard ? 1 : 0);
    },
});
