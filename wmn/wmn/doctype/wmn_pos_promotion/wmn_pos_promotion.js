frappe.ui.form.on("WMN POS Promotion", {
    refresh(frm) {
        frm.trigger("wmn_refresh_promotion_fields");
    },

    apply_scope(frm) {
        frm.trigger("wmn_refresh_promotion_fields");
    },

    promotion_type(frm) {
        frm.trigger("wmn_refresh_promotion_fields");
    },

    wmn_refresh_promotion_fields(frm) {
        const scope = frm.doc.apply_scope || "Transaction";
        const type = frm.doc.promotion_type || "Percentage Discount";

        frm.toggle_display("item_code", scope === "Item");
        frm.toggle_display("item_group", scope === "Item Group");
        frm.toggle_display("brand", scope === "Brand");

        frm.toggle_display("discount_percentage", type === "Percentage Discount");
        frm.toggle_display("discount_amount", type === "Amount Discount");
        frm.toggle_display("buy_qty", type === "Buy X Get Y");
        frm.toggle_display("free_qty", type === "Buy X Get Y" || type === "Free Item");
        frm.toggle_display("free_item", type === "Buy X Get Y" || type === "Free Item");
        frm.toggle_display("repeat_benefit", type === "Buy X Get Y" || type === "Free Item");
    },
});
