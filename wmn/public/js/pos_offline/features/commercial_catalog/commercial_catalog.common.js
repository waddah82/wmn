/* WMN POS cashier-facing active promotions and coupons catalog. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.CommercialCatalog = ns.Features.CommercialCatalog || {};
    ns.Features.CommercialCatalog.Common = ns.Features.CommercialCatalog.Common || {};

    function escapeHtml(value) {
        if (frappe?.utils?.escape_html) return frappe.utils.escape_html(String(value || ""));
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function dateRange(row) {
        const from = String(row?.valid_from || "").slice(0, 10);
        const upto = String(row?.valid_upto || "").slice(0, 10);
        if (from && upto) return `${from} → ${upto}`;
        if (from) return `${__("From")} ${from}`;
        if (upto) return `${__("Until")} ${upto}`;
        return __("No date limit");
    }

    function promotionBenefit(rule, currency) {
        const type = rule?.promotion_type || "";
        if (type === "Percentage Discount") return `${flt(rule.discount_percentage || 0)}%`;
        if (type === "Amount Discount") return format_currency(flt(rule.discount_amount || 0), currency);
        if (type === "Buy X Get Y") {
            const freeItem = String(rule.free_item || "").trim();
            return freeItem
                ? `${flt(rule.buy_qty || 0)} + ${flt(rule.free_qty || 0)} ${escapeHtml(freeItem)}`
                : `${flt(rule.buy_qty || 0)} + ${flt(rule.free_qty || 0)}`;
        }
        if (type === "Free Item") {
            return `${flt(rule.free_qty || 0)} × ${escapeHtml(rule.free_item || "")}`;
        }
        return type || __("Promotion");
    }

    function promotionTarget(rule) {
        const scope = rule?.apply_scope || "Transaction";
        if (scope === "Item") return `${__("Item")}: ${escapeHtml(rule.item_code || "")}`;
        if (scope === "Item Group") return `${__("Item Group")}: ${escapeHtml(rule.item_group || "")}`;
        if (scope === "Brand") return `${__("Brand")}: ${escapeHtml(rule.brand || "")}`;
        return __("Transaction");
    }

    function promotionConditions(rule, currency) {
        const parts = [];
        if (flt(rule?.minimum_cart_amount || 0) > 0) {
            parts.push(`${__("Minimum Cart Amount")}: ${format_currency(flt(rule.minimum_cart_amount), currency)}`);
        }
        if (flt(rule?.minimum_qty || 0) > 0) {
            parts.push(`${__("Minimum Quantity")}: ${flt(rule.minimum_qty)}`);
        }
        if (String(rule?.required_coupon || "").trim()) {
            parts.push(`${__("Required Coupon")}: ${escapeHtml(rule.required_coupon)}`);
        }
        if (String(rule?.customer || "").trim()) {
            parts.push(`${__("Customer")}: ${escapeHtml(rule.customer)}`);
        }
        if (String(rule?.customer_group || "").trim()) {
            parts.push(`${__("Customer Group")}: ${escapeHtml(rule.customer_group)}`);
        }
        return parts.length ? parts.join(" · ") : __("No minimum cart condition");
    }

    function couponBenefit(coupon, currency) {
        if ((coupon?.discount_type || "Percentage") === "Percentage") {
            return `${flt(coupon.discount_percentage || 0)}%`;
        }
        return format_currency(flt(coupon?.discount_amount || 0), currency);
    }

    function couponConditions(coupon, currency) {
        const parts = [];
        if (flt(coupon?.minimum_cart_amount || 0) > 0) {
            parts.push(`${__("Minimum Cart Amount")}: ${format_currency(flt(coupon.minimum_cart_amount), currency)}`);
        }
        if (flt(coupon?.maximum_discount_amount || 0) > 0) {
            parts.push(`${__("Maximum Discount")}: ${format_currency(flt(coupon.maximum_discount_amount), currency)}`);
        }
        if (String(coupon?.customer || "").trim()) {
            parts.push(`${__("Customer")}: ${escapeHtml(coupon.customer)}`);
        }
        return parts.length ? parts.join(" · ") : __("No minimum cart condition");
    }

    function activePromotions(controller, rows) {
        const doc = controller?.frm?.doc || {};
        const context = controller?.wmn_get_promotion_context?.() || {};
        return (Array.isArray(rows) ? rows : []).filter((rule) => {
            if (!rule) return false;
            if (window.WMNPOSPromotion?.isRuleVisibleForPOSCatalog) {
                return window.WMNPOSPromotion.isRuleVisibleForPOSCatalog(rule, doc, context);
            }
            if (window.WMNPOSPromotion?.isRuleActiveForContext) {
                return window.WMNPOSPromotion.isRuleActiveForContext(rule, doc, context);
            }
            return !cint(rule.disabled || 0) && cint(rule.auto_apply === undefined ? 1 : rule.auto_apply) === 1;
        });
    }

    function activeCoupons(controller, rows) {
        const doc = controller?.frm?.doc || {};
        return (Array.isArray(rows) ? rows : []).filter((coupon) => {
            if (!coupon) return false;
            if (window.WMNPOSCoupon?.isCouponActiveForContext) {
                return window.WMNPOSCoupon.isCouponActiveForContext(coupon, doc);
            }
            return !cint(coupon.disabled || 0);
        });
    }

    function renderPromotionCards(rows, currency) {
        if (!rows.length) return `<div class="wmn-commercial-empty">${__("No active promotions are available for the current POS context.")}</div>`;
        return rows.map((rule) => `
            <article class="wmn-commercial-card">
                <div class="wmn-commercial-card-head">
                    <strong>${escapeHtml(rule.promotion_name || rule.promotion_code || __("Promotion"))}</strong>
                    <span>${escapeHtml(rule.promotion_code || "")}</span>
                </div>
                <div class="wmn-commercial-benefit">${promotionBenefit(rule, currency)}</div>
                <div class="wmn-commercial-meta"><b>${escapeHtml(rule.promotion_type || __("Promotion"))}</b><span>${promotionTarget(rule)}</span></div>
                <div class="wmn-commercial-meta"><span>${promotionConditions(rule, currency)}</span></div>
                <div class="wmn-commercial-meta"><span>${escapeHtml(dateRange(rule))}</span></div>
            </article>`).join("");
    }

    function renderCouponCards(rows, currency) {
        if (!rows.length) return `<div class="wmn-commercial-empty">${__("No active coupons are available in the current POS cache.")}</div>`;
        return rows.map((coupon) => `
            <article class="wmn-commercial-card">
                <div class="wmn-commercial-card-head">
                    <strong>${escapeHtml(coupon.coupon_name || coupon.coupon_code || __("Coupon"))}</strong>
                    <span>${escapeHtml(coupon.coupon_code || "")}</span>
                </div>
                <div class="wmn-commercial-benefit">${couponBenefit(coupon, currency)}</div>
                <div class="wmn-commercial-meta"><b>${escapeHtml(coupon.coupon_type || __("Promotional"))}</b><span>${escapeHtml(coupon.apply_on || __("Grand Total"))}</span></div>
                <div class="wmn-commercial-meta"><span>${couponConditions(coupon, currency)}</span></div>
                <div class="wmn-commercial-meta"><span>${escapeHtml(dateRange(coupon))}</span></div>
            </article>`).join("");
    }

    ns.Features.CommercialCatalog.Common.ControllerMethods = {
        async wmn_get_cashier_commercial_catalog() {
            const offline = typeof wmn_controller_uses_offline_flow === "function"
                ? wmn_controller_uses_offline_flow(this)
                : !navigator.onLine;
            const adapter = offline
                ? ns.Features.CommercialCatalog.Offline
                : ns.Features.CommercialCatalog.Online;

            const [promotionRows, couponRows] = await Promise.all([
                adapter?.getPromotions?.(this) || [],
                adapter?.getCoupons?.(this) || [],
            ]);

            return {
                promotions: activePromotions(this, promotionRows),
                coupons: activeCoupons(this, couponRows),
                offline,
            };
        },

        async wmn_open_cashier_commercial_catalog() {
            const catalog = await this.wmn_get_cashier_commercial_catalog();
            const doc = this.frm?.doc || {};
            const currency = doc.currency || this.settings?.currency || "";
            const dialog = new frappe.ui.Dialog({
                title: __("Active Promotions & Coupons"),
                size: "extra-large",
                fields: [{ fieldname: "commercial_catalog", fieldtype: "HTML" }],
                primary_action_label: __("Close"),
                primary_action: () => dialog.hide(),
            });

            dialog.fields_dict.commercial_catalog.$wrapper.html(`
                <div class="wmn-commercial-catalog">
                    <section>
                        <div class="wmn-commercial-section-title">
                            <strong>${__("Active Promotions")}</strong>
                            <span>${catalog.promotions.length}</span>
                        </div>
                        <div class="wmn-commercial-grid">${renderPromotionCards(catalog.promotions, currency)}</div>
                    </section>
                    <section>
                        <div class="wmn-commercial-section-title">
                            <strong>${__("Active Coupons")}</strong>
                            <span>${catalog.coupons.length}</span>
                        </div>
                        <div class="wmn-commercial-grid">${renderCouponCards(catalog.coupons, currency)}</div>
                    </section>
                </div>`);

            ns.UI.Dialogs?.decorate?.(dialog, "wmn-commercial-catalog-dialog");
            dialog.show();
            return dialog;
        },
    };
})();
