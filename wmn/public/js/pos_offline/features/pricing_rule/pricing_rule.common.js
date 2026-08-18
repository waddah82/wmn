/* PricingRule common controller integration methods. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    const EPSILON = 0.000001;

    ns.Features.PricingRule = ns.Features.PricingRule || {};
    ns.Features.PricingRule.Common = ns.Features.PricingRule.Common || {};
    ns.Features.PricingRule.Common.ControllerMethods = {
        wmn_get_authoritative_invoice_discount_state() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc) {
                return {
                    active: false,
                    amount: 0,
                    percentage: 0,
                    apply_on: "Grand Total",
                    source: "",
                };
            }

            if (wmn_controller_uses_offline_flow(this)) {
                const amount = Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_total || 0));
                const transactionRule = String(doc.__wmn_offline_pricing_transaction_rule || "").trim();
                return {
                    active: amount > EPSILON && !!transactionRule,
                    amount,
                    percentage: Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_percentage || 0)),
                    apply_on: doc.__wmn_pricing_rule_apply_on === "Net Total" ? "Net Total" : "Grand Total",
                    source: transactionRule ? "transaction_pricing_rule" : "",
                };
            }

            const amount = Math.max(0, flt(this.wmn_get_erpnext_invoice_discount_base?.() || 0));
            return {
                active: amount > EPSILON,
                amount,
                percentage: Math.max(0, flt(doc.__wmn_erpnext_invoice_discount_percentage || 0)),
                apply_on: doc.__wmn_erpnext_invoice_discount_apply_on === "Net Total" ? "Net Total" : "Grand Total",
                source: amount > EPSILON ? "erpnext_invoice_discount" : "",
            };
        },

        async wmn_reconcile_invoice_discount_ownership() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc) return false;

            const owner = this.wmn_get_authoritative_invoice_discount_state();
            if (!owner.active) return false;

            // ERPNext Online owns the final invoice-level discount state. When that
            // state exists, WMN invoice-level coupon/promotion discounts must not be
            // kept in Offline because Online would overwrite the same fields.
            if (typeof this.wmn_deactivate_coupon_for_authoritative_discount === "function") {
                await this.wmn_deactivate_coupon_for_authoritative_discount({ silent: true });
            }
            if (typeof this.wmn_deactivate_invoice_level_promotions_for_authoritative_discount === "function") {
                await this.wmn_deactivate_invoice_level_promotions_for_authoritative_discount({ silent: true });
            }

            await this.wmn_sync_managed_invoice_discount_fields();
            return true;
        },

        async wmn_sync_managed_invoice_discount_fields() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc) return;

            const offline = wmn_controller_uses_offline_flow(this);
            const previousWmnAmount = Math.max(0, flt(doc.__wmn_applied_wmn_invoice_discount_total || 0));
            const owner = this.wmn_get_authoritative_invoice_discount_state();
            const erpnextBaseAmount = offline ? 0 : owner.amount;
            const pricingRuleAmount = offline
                ? Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_total || 0))
                : 0;

            // Transaction-level ERPNext pricing owns the same invoice discount fields.
            // When it is active, invoice-level Coupon and Promotion are not composed
            // with it. Item-level promotion/rate changes and free items remain intact.
            const promotionAmount = owner.active
                ? 0
                : Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
            const couponAmount = owner.active
                ? 0
                : Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));

            const wmnAmount = owner.active
                ? (offline ? pricingRuleAmount : 0)
                : (pricingRuleAmount + promotionAmount + couponAmount);
            const totalAmount = owner.active
                ? owner.amount
                : (erpnextBaseAmount + wmnAmount);

            const erpnextApplyOn = owner.apply_on;
            const applyOn = owner.active
                ? owner.apply_on
                : (couponAmount > 0
                    ? (doc.__wmn_coupon_apply_on === "Net Total" ? "Net Total" : "Grand Total")
                    : (pricingRuleAmount > 0
                        ? (doc.__wmn_pricing_rule_apply_on === "Net Total" ? "Net Total" : "Grand Total")
                        : (promotionAmount > 0 ? "Net Total" : erpnextApplyOn)));

            if (!offline && !owner.active && wmnAmount <= EPSILON && previousWmnAmount <= EPSILON) {
                // ERPNext-only pricing is owned entirely by ERPNext. Do not rewrite
                // transaction discount fields or recalculate payments from WMN code.
                doc.__wmn_applied_wmn_invoice_discount_total = 0;
                doc.__wmn_applied_total_invoice_discount = erpnextBaseAmount;
                return;
            }

            doc.__wmn_applied_wmn_invoice_discount_total = owner.active ? 0 : wmnAmount;
            doc.__wmn_applied_total_invoice_discount = totalAmount;

            if (offline) {
                doc.apply_discount_on = applyOn;
                doc.additional_discount_percentage = owner.active
                    ? owner.percentage
                    : 0;
                doc.discount_amount = totalAmount;
                doc.base_discount_amount = totalAmount;
                this.wmn_recalculate_offline_totals();
                if (this.frm.dirty) this.frm.dirty();
                return;
            }

            this.frm.applying_pos_coupon_code = true;
            try {
                doc.apply_discount_on = applyOn;
                doc.additional_discount_percentage = owner.active
                    ? owner.percentage
                    : (wmnAmount > 0
                        ? 0
                        : Math.max(0, flt(doc.__wmn_erpnext_invoice_discount_percentage || 0)));
                doc.discount_amount = totalAmount;

                if (this.frm?.cscript?.calculate_taxes_and_totals) {
                    await this.frm.cscript.calculate_taxes_and_totals();
                } else if (this.frm.trigger) {
                    await this.frm.trigger("discount_amount");
                }

                await this.wmn_wait_for_erpnext_pricing_to_settle();
                if (this.frm.dirty) this.frm.dirty();
            } finally {
                this.frm.applying_pos_coupon_code = false;
            }
        },

        async wmn_refresh_pricing_state_after_native_update(options = {}) {
            if (wmn_controller_uses_offline_flow(this)) {
                // Offline mirrors the approved Online lifecycle: Pricing Rules are
                // finalized at the Pay boundary, not on every cart mutation.
                // Cart changes only recalculate local totals and refresh WMN
                // Promotion/Coupon state that is intentionally visible in the cart.
                this.wmn_recalculate_offline_totals();
                await this.wmn_refresh_promotions_and_coupon({
                    silent: options.silent !== false,
                });
                return null;
            }

            await this.wmn_wait_for_erpnext_pricing_to_settle();
            this.wmn_store_erpnext_invoice_discount_base();
            await this.wmn_refresh_promotions_and_coupon({
                silent: options.silent !== false,
            });
            await this.wmn_reconcile_invoice_discount_ownership();
            await this.wmn_wait_for_erpnext_pricing_to_settle();
            return null;
        },

        async wmn_finalize_pricing_before_payment() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc || cint(doc.is_return || 0)) return;

            if (wmn_controller_uses_offline_flow(this)) {
                await this.wmn_refresh_offline_pricing_state({ silent: true });
                return;
            }

            await this.wmn_wait_for_erpnext_pricing_to_settle();
            await this.wmn_revalidate_active_promotions();
            await this.wmn_revalidate_active_coupon();
            await this.wmn_wait_for_erpnext_pricing_to_settle();

            // Before Payment opens, restore the final ERPNext-owned invoice discount
            // state so Payment sees the same totals that server validation will keep.
            await this.wmn_reconcile_invoice_discount_ownership();
            await this.wmn_wait_for_erpnext_pricing_to_settle();
        }
    };
})();
