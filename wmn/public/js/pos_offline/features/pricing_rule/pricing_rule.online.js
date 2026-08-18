/* PricingRule Online controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PricingRule = ns.Features.PricingRule || {};
    ns.Features.PricingRule.Online = ns.Features.PricingRule.Online || {};
    ns.Features.PricingRule.Online.ControllerMethods = {
        async wmn_wait_for_erpnext_pricing_to_settle() {
                        if (wmn_controller_uses_offline_flow(this)) return;
                        if (window.frappe && typeof frappe.after_ajax === "function") {
                            await frappe.after_ajax();
                        }
                        await Promise.resolve();
                    },

        wmn_prepare_erpnext_invoice_discount_state() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc || wmn_controller_uses_offline_flow(this)) return 0;

                        const hasStoredBase =
                            doc.__wmn_erpnext_invoice_discount_total !== undefined &&
                            doc.__wmn_erpnext_invoice_discount_total !== null;
                        const appliedWmn = Math.max(0, flt(doc.__wmn_applied_wmn_invoice_discount_total || 0));
                        const current = Math.max(0, flt(doc.discount_amount || 0));
                        const baseAmount = hasStoredBase
                            ? Math.max(0, flt(doc.__wmn_erpnext_invoice_discount_total || 0))
                            : (appliedWmn > 0 ? 0 : current);
                        const applyOn = doc.__wmn_erpnext_invoice_discount_apply_on === "Net Total"
                            ? "Net Total"
                            : (doc.apply_discount_on === "Net Total" ? "Net Total" : "Grand Total");
                        const basePercentage = hasStoredBase
                            ? Math.max(0, flt(doc.__wmn_erpnext_invoice_discount_percentage || 0))
                            : Math.max(0, flt(doc.additional_discount_percentage || 0));

                        doc.apply_discount_on = applyOn;
                        doc.additional_discount_percentage = basePercentage;
                        doc.discount_amount = baseAmount;
                        doc.base_discount_amount = baseAmount;
                        doc.__wmn_applied_wmn_invoice_discount_total = 0;
                        doc.__wmn_applied_total_invoice_discount = baseAmount;
                        return baseAmount;
                    },

        wmn_store_erpnext_invoice_discount_base() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc || wmn_controller_uses_offline_flow(this)) return 0;

                        const baseAmount = Math.max(0, flt(doc.discount_amount || 0));
                        doc.__wmn_erpnext_invoice_discount_total = baseAmount;
                        doc.__wmn_erpnext_invoice_discount_percentage = Math.max(
                            0,
                            flt(doc.additional_discount_percentage || 0)
                        );
                        doc.__wmn_erpnext_invoice_discount_apply_on =
                            doc.apply_discount_on === "Net Total" ? "Net Total" : "Grand Total";
                        return baseAmount;
                    },

        wmn_get_erpnext_invoice_discount_base() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        if (wmn_controller_uses_offline_flow(this)) return 0;
                        return Math.max(0, flt(doc.__wmn_erpnext_invoice_discount_total || 0));
                    },

        wmn_has_manual_additional_discount() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        // A percentage entered through ERPNext's transaction discount control is
                        // explicitly manual. A fixed discount amount may legitimately be produced
                        // by an ERPNext Pricing Rule, so it must not block a WMN coupon.
                        return flt(doc.additional_discount_percentage || 0) > 0;
                    }
    };
})();
