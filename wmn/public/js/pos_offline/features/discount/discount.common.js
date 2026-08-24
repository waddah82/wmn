/* WMN POS invoice discount composition shared by Online and Offline. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    const EPSILON = 0.000001;

    ns.Features.Discount = ns.Features.Discount || {};
    ns.Features.Discount.Common = ns.Features.Discount.Common || {};

    const POLICY_DEFAULTS = Object.freeze({
        pricing_rule_promotion_policy: "Combine",
        pricing_rule_coupon_policy: "Combine",
        promotion_coupon_policy: "Combine",
        pricing_rule_promotion_coupon_policy: "Combine",
        combined_discount_representation: "Amount Only",
    });

    function getPolicySettings(controller) {
        const repository = ns.Services?.Settings?.POSProfileSettings;
        const doc = controller?.frm?.doc || {};
        const profile = doc.pos_profile || controller?.pos_profile || controller?.settings?.pos_profile || "";
        const effective = repository?.getEffective?.(profile) || {};
        return Object.assign({}, POLICY_DEFAULTS, effective);
    }

    function sourceState(doc) {
        const pricingRuleAmount = Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_total || 0));
        const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
        const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
        return {
            pricing_rule: {
                key: "pricing_rule",
                amount: pricingRuleAmount,
                apply_on: doc.__wmn_pricing_rule_apply_on === "Net Total" ? "Net Total" : "Grand Total",
                percentage: Math.max(0, flt(doc.__wmn_pricing_rule_percentage || 0)),
                amount_field: Math.max(0, flt(doc.__wmn_pricing_rule_discount_amount_field || 0)),
            },
            promotion: {
                key: "promotion",
                amount: promotionAmount,
                apply_on: "Net Total",
                percentage: 0,
                amount_field: promotionAmount,
            },
            coupon: {
                key: "coupon",
                amount: couponAmount,
                apply_on: doc.__wmn_coupon_apply_on === "Net Total" ? "Net Total" : "Grand Total",
                percentage: 0,
                amount_field: couponAmount,
            },
        };
    }

    function activeSources(sources) {
        return Object.values(sources).filter((source) => source.amount > EPSILON);
    }

    function policyForActiveSources(active, settings) {
        const keys = new Set(active.map((source) => source.key));
        if (keys.size === 3) return settings.pricing_rule_promotion_coupon_policy || "Combine";
        if (keys.has("pricing_rule") && keys.has("promotion")) return settings.pricing_rule_promotion_policy || "Combine";
        if (keys.has("pricing_rule") && keys.has("coupon")) return settings.pricing_rule_coupon_policy || "Combine";
        if (keys.has("promotion") && keys.has("coupon")) return settings.promotion_coupon_policy || "Combine";
        return "Single";
    }

    function winnerKey(policy) {
        if (policy === "Pricing Rule Wins") return "pricing_rule";
        if (policy === "Promotion Wins") return "promotion";
        if (policy === "Coupon Wins") return "coupon";
        return "";
    }

    function getPreInvoiceDiscountNetTotal(doc) {
        const rows = Array.isArray(doc?.items) ? doc.items : [];
        if (!rows.length) return Math.max(0, flt(doc?.total || doc?.net_total || 0));
        return Math.max(0, rows.reduce((sum, row) => {
            return sum + flt(row?.net_amount ?? row?.amount ?? 0) + flt(row?.distributed_discount_amount || 0);
        }, 0));
    }

    function chooseAmountApplyOn(active) {
        const coupon = active.find((source) => source.key === "coupon");
        if (coupon) return coupon.apply_on;
        const pricingRule = active.find((source) => source.key === "pricing_rule");
        if (pricingRule) return pricingRule.apply_on;
        return active.length ? active[0].apply_on : "Grand Total";
    }

    function buildComposition(doc, settings) {
        const sources = sourceState(doc || {});
        const active = activeSources(sources);
        const policy = policyForActiveSources(active, settings || POLICY_DEFAULTS);
        const selectedWinner = winnerKey(policy);

        if (!active.length) {
            return { mode: "none", policy, active, sources, amount: 0 };
        }

        if (active.length === 1 || (selectedWinner && sources[selectedWinner]?.amount > EPSILON)) {
            const winner = active.length === 1 ? active[0] : sources[selectedWinner];
            return {
                mode: "winner",
                policy,
                active,
                sources,
                winner,
                amount: winner.amount,
                apply_on: winner.apply_on,
            };
        }

        const amount = active.reduce((sum, source) => sum + source.amount, 0);
        const representation = settings?.combined_discount_representation || "Amount Only";
        if (representation === "Percentage Equivalent (Net Total)") {
            const base = getPreInvoiceDiscountNetTotal(doc || {});
            if (base > EPSILON && amount <= base + EPSILON) {
                return {
                    mode: "combine_percentage",
                    policy,
                    active,
                    sources,
                    amount,
                    apply_on: "Net Total",
                    percentage: Math.max(0, amount * 100 / base),
                    base,
                };
            }
        }

        return {
            mode: "combine_amount",
            policy,
            active,
            sources,
            amount,
            apply_on: chooseAmountApplyOn(active),
        };
    }

    ns.Features.Discount.Common.PolicyDefaults = POLICY_DEFAULTS;
    ns.Features.Discount.Common.buildComposition = buildComposition;
    ns.Features.Discount.Common.ControllerMethods = {
        wmn_has_manual_additional_discount() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : {};
            return Math.abs(flt(doc.additional_discount_percentage || 0)) > EPSILON;
        },

        wmn_get_pos_discount_breakdown() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : {};
            const rawPricingRuleAmount = Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_total || 0));
            const promotionItemAmount = Math.max(0, flt(doc.__wmn_promotion_item_discount_total || 0));
            const rawPromotionInvoiceAmount = Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
            const rawCouponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
            const composition = buildComposition(doc, getPolicySettings(this));

            let pricingRuleAmount = rawPricingRuleAmount;
            let promotionInvoiceAmount = rawPromotionInvoiceAmount;
            let couponAmount = rawCouponAmount;
            if (composition.mode === "winner") {
                pricingRuleAmount = composition.winner.key === "pricing_rule" ? rawPricingRuleAmount : 0;
                promotionInvoiceAmount = composition.winner.key === "promotion" ? rawPromotionInvoiceAmount : 0;
                couponAmount = composition.winner.key === "coupon" ? rawCouponAmount : 0;
            }

            const manualAmount = rawPricingRuleAmount <= EPSILON && this.wmn_has_manual_additional_discount()
                ? Math.max(0, flt(doc.discount_amount || 0))
                : 0;
            const promotionAmount = promotionItemAmount + promotionInvoiceAmount;

            return {
                pricing_rule_amount: pricingRuleAmount,
                promotion_amount: promotionAmount,
                coupon_amount: couponAmount,
                manual_amount: manualAmount,
                total_amount: pricingRuleAmount + promotionAmount + couponAmount + manualAmount,
            };
        },

        async wmn_sync_pos_invoice_discount_fields() {
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc) return;

            // A return is a reversal of the stored source invoice. It must never be
            // repriced or recomposed using the current Pricing Rule/Promotion/Coupon policy.
            if (cint(doc.is_return || 0) === 1) {
                if (wmn_controller_uses_offline_flow(this)) this.wmn_recalculate_offline_totals();
                this.cart?.update_totals_section?.(this.frm);
                this.cart?.wmn_refresh_discount_breakdown?.(doc);
                return { preserved_return_pricing: true };
            }

            const pricingRuleAmount = Math.max(0, flt(doc.__wmn_pricing_rule_invoice_discount_total || 0));
            if (pricingRuleAmount <= EPSILON && this.wmn_has_manual_additional_discount()) {
                if (wmn_controller_uses_offline_flow(this)) this.wmn_recalculate_offline_totals();
                this.cart?.wmn_refresh_discount_breakdown?.(doc);
                return { preserved_manual_discount: true };
            }

            const composition = buildComposition(doc, getPolicySettings(this));
            if (composition.mode === "none") {
                const hadWMNComposition = !!doc.__wmn_discount_composition_mode;
                doc.__wmn_applied_wmn_invoice_discount_total = 0;
                delete doc.__wmn_discount_composition_policy;
                delete doc.__wmn_discount_composition_mode;
                if (hadWMNComposition) {
                    doc.additional_discount_percentage = 0;
                    doc.discount_amount = 0;
                    doc.base_discount_amount = 0;
                    if (wmn_controller_uses_offline_flow(this)) {
                        this.wmn_recalculate_offline_totals();
                    } else if (this.frm?.cscript?.calculate_taxes_and_totals) {
                        await this.frm.cscript.calculate_taxes_and_totals();
                    }
                }
                this.cart?.wmn_refresh_discount_breakdown?.(doc);
                return composition;
            }

            if (composition.mode === "winner" && composition.winner.key === "pricing_rule") {
                const source = composition.winner;
                doc.apply_discount_on = source.apply_on;
                doc.additional_discount_percentage = source.percentage;
                doc.discount_amount = source.amount;
                doc.base_discount_amount = source.amount * (flt(doc.conversion_rate || 0) || 1);
            } else if (composition.mode === "combine_percentage") {
                doc.apply_discount_on = "Net Total";
                doc.additional_discount_percentage = composition.percentage;
                doc.discount_amount = 0;
                doc.base_discount_amount = 0;
            } else {
                const source = composition.winner || null;
                doc.apply_discount_on = source?.apply_on || composition.apply_on || "Grand Total";
                doc.additional_discount_percentage = 0;
                doc.discount_amount = composition.amount;
                doc.base_discount_amount = composition.amount * (flt(doc.conversion_rate || 0) || 1);
            }

            doc.__wmn_applied_wmn_invoice_discount_total = composition.amount;
            doc.__wmn_discount_composition_policy = composition.policy;
            doc.__wmn_discount_composition_mode = composition.mode;

            if (wmn_controller_uses_offline_flow(this)) {
                this.wmn_recalculate_offline_totals();
            } else if (this.frm?.cscript?.calculate_taxes_and_totals) {
                await this.frm.cscript.calculate_taxes_and_totals();
            } else if (this.frm?.trigger) {
                await this.frm.trigger(composition.mode === "combine_percentage" ? "additional_discount_percentage" : "discount_amount");
            }

            // Keep the composed amount marker aligned with ERPNext totals when a
            // percentage representation asks ERPNext to derive discount_amount.
            if (composition.mode === "combine_percentage") {
                doc.__wmn_applied_wmn_invoice_discount_total = Math.max(0, flt(doc.discount_amount || composition.amount));
            }

            this.frm?.dirty?.();
            this.cart?.update_totals_section?.(this.frm);
            this.cart?.wmn_refresh_discount_breakdown?.(doc);
            return composition;
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
                    const doc = this.frm?.doc || null;
                    if (cint(doc?.is_return || 0) === 1) {
                        // Online returns are recalculated by ERPNext model events.
                        // Offline replaces only those data/model calls with its local
                        // return calculator. Pricing/Promotion/Coupon must not re-run.
                        if (wmn_controller_uses_offline_flow(this)) {
                            this.wmn_recalculate_offline_totals();
                        }
                        this.cart?.update_totals_section?.(this.frm);
                        this.cart?.wmn_refresh_discount_breakdown?.(doc);
                        result = { preserved_return_pricing: true };
                        this.__wmn_last_commercial_refresh = result;
                        continue;
                    }

                    if (wmn_controller_uses_offline_flow(this)) {
                        this.wmn_recalculate_offline_totals();
                    }

                    const pricingRuleResult = await this.wmn_refresh_local_pricing_rules({ silent: true });

                    result = await this.wmn_refresh_promotions_and_coupon({
                        silent: options.silent !== false,
                    });

                    this.cart?.update_totals_section?.(this.frm);
                    this.cart?.wmn_refresh_discount_breakdown?.(this.frm?.doc || {});
                    this.__wmn_last_commercial_refresh = Object.assign({}, result || {}, {
                        pricing_rule: pricingRuleResult || null,
                    });
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
            this.wmn_assert_local_pricing_rules_supported?.();
            this.cart?.update_totals_section?.(this.frm);
            this.cart?.wmn_refresh_discount_breakdown?.(this.frm?.doc || {});
        },
    };
})();
