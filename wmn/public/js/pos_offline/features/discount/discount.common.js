/* WMN POS invoice discount composition shared by Online and Offline. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    const EPSILON = 0.000001;

    ns.Features.Discount = ns.Features.Discount || {};
    ns.Features.Discount.Common = ns.Features.Discount.Common || {};
    ns.Features.Discount.Common.ControllerMethods = {
        wmn_has_manual_additional_discount() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : {};
            return Math.abs(flt(doc.additional_discount_percentage || 0)) > EPSILON;
        },

        wmn_get_pos_discount_breakdown() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : {};
            const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_discount_total || 0));
            const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
            const manualAmount = this.wmn_has_manual_additional_discount()
                ? Math.max(0, flt(doc.discount_amount || 0))
                : 0;

            return {
                promotion_amount: promotionAmount,
                coupon_amount: couponAmount,
                manual_amount: manualAmount,
                total_amount: promotionAmount + couponAmount + manualAmount,
            };
        },

        async wmn_sync_pos_invoice_discount_fields() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc) return;

            // A manual additional discount owns the invoice-level ERPNext fields.
            // WMN transaction promotions are suppressed by the promotion evaluator,
            // while item-level promotions and free items remain row-level.
            if (this.wmn_has_manual_additional_discount()) {
                if (wmn_controller_uses_offline_flow(this)) {
                    this.wmn_recalculate_offline_totals();
                }
                this.cart?.wmn_refresh_discount_breakdown?.(doc);
                return;
            }

            const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
            const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
            const totalAmount = promotionAmount + couponAmount;
            const applyOn = couponAmount > EPSILON
                ? (doc.__wmn_coupon_apply_on === "Net Total" ? "Net Total" : "Grand Total")
                : (promotionAmount > EPSILON ? "Net Total" : (doc.apply_discount_on === "Net Total" ? "Net Total" : "Grand Total"));

            doc.apply_discount_on = applyOn;
            doc.additional_discount_percentage = 0;
            doc.discount_amount = totalAmount;
            doc.base_discount_amount = totalAmount;
            doc.__wmn_applied_wmn_invoice_discount_total = totalAmount;

            if (wmn_controller_uses_offline_flow(this)) {
                this.wmn_recalculate_offline_totals();
            } else if (this.frm?.cscript?.calculate_taxes_and_totals) {
                await this.frm.cscript.calculate_taxes_and_totals();
            } else if (this.frm?.trigger) {
                await this.frm.trigger("discount_amount");
            }

            this.frm?.dirty?.();
            this.cart?.update_totals_section?.(this.frm);
            this.cart?.wmn_refresh_discount_breakdown?.(doc);
        },

        async wmn_refresh_commercial_state_after_cart_change(options = {}) {
            this.__wmn_commercial_refresh_requested = true;
            if (this.__wmn_commercial_refresh_promise) {
                return await this.__wmn_commercial_refresh_promise;
            }

            this.cart?.wmn_set_checkout_commercial_busy?.(true);
            const refreshPromise = (async () => {
                let result = null;
                while (this.__wmn_commercial_refresh_requested) {
                    this.__wmn_commercial_refresh_requested = false;
                    if (wmn_controller_uses_offline_flow(this)) {
                        this.wmn_recalculate_offline_totals();
                    }

                    result = await this.wmn_refresh_promotions_and_coupon({
                        silent: options.silent !== false,
                    });

                    this.cart?.update_totals_section?.(this.frm);
                    this.cart?.wmn_refresh_discount_breakdown?.(this.frm?.doc || {});
                    this.__wmn_last_commercial_refresh = result || null;
                }
                return result;
            })();

            this.__wmn_commercial_refresh_promise = refreshPromise;
            try {
                return await refreshPromise;
            } finally {
                if (this.__wmn_commercial_refresh_promise === refreshPromise) {
                    this.__wmn_commercial_refresh_promise = null;
                }
                this.__wmn_commercial_refresh_requested = false;
                this.cart?.wmn_set_checkout_commercial_busy?.(false);
            }
        },

        async wmn_ensure_commercial_state_ready_for_payment() {
            // Pay must never introduce a new promotion/coupon evaluation that changes
            // the amount already shown to the cashier. Only wait for an in-flight cart
            // refresh to finish, then use the already displayed final totals.
            if (this.__wmn_commercial_refresh_promise) {
                await this.__wmn_commercial_refresh_promise;
            }
            this.cart?.update_totals_section?.(this.frm);
            this.cart?.wmn_refresh_discount_breakdown?.(this.frm?.doc || {});
        },
    };
})();
