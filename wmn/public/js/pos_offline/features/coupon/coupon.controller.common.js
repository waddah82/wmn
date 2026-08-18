/* Coupon controller integration shared by Online and Offline. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.Coupon = ns.Features.Coupon || {};
    ns.Features.Coupon.Common = ns.Features.Coupon.Common || {};

    ns.Features.Coupon.Common.ControllerMethods = {
        wmn_get_coupon_base_amounts() {
            const doc = this.frm?.doc || {};
            if (window.WMNPOSCoupon?.getBaseAmounts) return window.WMNPOSCoupon.getBaseAmounts(doc);
            return {
                net_total: flt(doc.net_total || doc.total || 0),
                grand_total: flt(doc.grand_total || doc.rounded_total || 0),
            };
        },

        async wmn_set_coupon_discount_fields(result, options = {}) {
            const doc = this.frm?.doc;
            if (!doc || !result) return;

            doc.__wmn_coupon_discount_total = Math.max(0, flt(result.calculated_discount || 0));
            doc.__wmn_coupon_apply_on = result.apply_on === "Net Total" ? "Net Total" : "Grand Total";
            if (!options.defer_sync) await this.wmn_sync_pos_invoice_discount_fields();
        },

        async wmn_apply_coupon_result(result, options = {}) {
            const doc = this.frm?.doc;
            if (!doc || !result) return false;

            doc.__wmn_pos_coupon_rule = Object.assign({}, result);
            doc.__wmn_coupon_code = result.coupon_code || "";
            doc.__wmn_coupon_apply_on = result.apply_on === "Net Total" ? "Net Total" : "Grand Total";
            doc.__wmn_coupon_pending_validation = cint(result.__offline_validation || 0);
            await this.wmn_set_coupon_discount_fields(result, options);
            this.wmn_refresh_coupon_ui();

            if (!options.silent) {
                frappe.show_alert({
                    message: __("Coupon {0} applied", [result.coupon_code]),
                    indicator: "green",
                });
            }
            return true;
        },

        async wmn_remove_coupon(options = {}) {
            const doc = this.frm?.doc;
            if (!doc) return;

            const oldCode = String(doc.__wmn_coupon_code || "").trim();
            delete doc.__wmn_pos_coupon_rule;
            delete doc.__wmn_coupon_code;
            delete doc.__wmn_coupon_apply_on;
            delete doc.__wmn_coupon_pending_validation;
            doc.__wmn_coupon_discount_total = 0;

            // Promotions that require a coupon must be removed before the final
            // invoice discount state is composed.
            if (!options.defer_refresh) {
                if (oldCode && !this.__wmn_promotion_refreshing) {
                    await this.wmn_refresh_promotions_after_cart_change({ silent: true });
                }
                await this.wmn_sync_pos_invoice_discount_fields();
            }
            this.wmn_refresh_coupon_ui();

            if (!options.silent && oldCode) {
                frappe.show_alert({ message: __("Coupon {0} removed", [oldCode]), indicator: "blue" });
            }
        },

        async wmn_apply_coupon_code(couponCode, options = {}) {
            const doc = this.frm?.doc;
            const code = window.WMNPOSCoupon
                ? window.WMNPOSCoupon.normalizeCode(couponCode)
                : String(couponCode || "").trim().toUpperCase();

            if (!doc) return false;
            if (!code) {
                frappe.show_alert({ message: __("Enter Coupon Code"), indicator: "orange" });
                return false;
            }
            if (!Array.isArray(doc.items) || !doc.items.length) {
                frappe.show_alert({ message: __("Add items before applying a coupon"), indicator: "orange" });
                return false;
            }
            if (cint(doc.is_return || 0)) {
                frappe.show_alert({ message: __("Coupons cannot be applied to return invoices"), indicator: "orange" });
                return false;
            }
            if (this.wmn_has_manual_additional_discount()) {
                frappe.msgprint({
                    title: __("Coupon"),
                    indicator: "orange",
                    message: __("Remove the current additional discount before applying a coupon."),
                });
                return false;
            }

            try {
                if (this.__wmn_commercial_refresh_promise) await this.__wmn_commercial_refresh_promise;
                const result = wmn_controller_uses_offline_flow(this)
                    ? await this.wmn_validate_coupon_offline(code)
                    : await this.wmn_validate_coupon_online(code);

                if (!result) throw new Error(__("Coupon validation returned no data"));

                // Store coupon state first so required-coupon promotions can evaluate,
                // then run the normal commercial refresh once.
                await this.wmn_apply_coupon_result(result, { silent: true, defer_sync: true });
                await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });

                if (!options.silent) {
                    frappe.show_alert({ message: __("Coupon {0} applied", [code]), indicator: "green" });
                }
                return true;
            } catch (e) {
                console.error("WMN coupon validation failed", e);
                frappe.msgprint({
                    title: __("Coupon"),
                    indicator: "red",
                    message: e.message || String(e),
                });
                return false;
            }
        },

        async wmn_refresh_active_coupon_after_cart_change(options = {}) {
            const doc = this.frm?.doc;
            const rule = doc?.__wmn_pos_coupon_rule;
            if (!doc || !rule || !window.WMNPOSCoupon) return;

            try {
                const refreshed = wmn_controller_uses_offline_flow(this)
                    ? await this.wmn_validate_coupon_offline(doc.__wmn_coupon_code)
                    : window.WMNPOSCoupon.validateLocal(rule, doc);
                await this.wmn_apply_coupon_result(refreshed, {
                    silent: true,
                    defer_sync: !!options.defer_sync,
                });
            } catch (e) {
                await this.wmn_remove_coupon({
                    silent: true,
                    defer_refresh: true,
                });
                if (!options.defer_sync) {
                    await this.wmn_sync_pos_invoice_discount_fields();
                }
                frappe.show_alert({
                    message: e.message || __("Coupon was removed because the cart no longer meets its conditions"),
                    indicator: "orange",
                });
            }
        },

        async wmn_revalidate_active_coupon() {
            const doc = this.frm?.doc;
            const couponCode = String(doc?.__wmn_coupon_code || "").trim();
            if (!doc?.__wmn_pos_coupon_rule || !couponCode) return true;

            const refreshed = wmn_controller_uses_offline_flow(this)
                ? await this.wmn_validate_coupon_offline(couponCode)
                : await this.wmn_validate_coupon_online(couponCode);
            await this.wmn_apply_coupon_result(refreshed, { silent: true });
            return true;
        },

        wmn_refresh_coupon_ui() {
            try {
                this.cart?.wmn_refresh_coupon_control?.(this.frm?.doc || {});
                this.cart?.wmn_refresh_discount_breakdown?.(this.frm?.doc || {});
            } catch (e) {
                console.warn("WMN coupon UI refresh skipped", e);
            }
        },

        wmn_open_coupon_dialog() {
            const doc = this.frm?.doc || {};
            const activeRule = doc.__wmn_pos_coupon_rule || null;
            const currency = doc.currency || this.settings?.currency || "";

            const dialog = new frappe.ui.Dialog({
                title: __("Coupon"),
                fields: [
                    {
                        fieldname: "coupon_code",
                        fieldtype: "Data",
                        label: __("Coupon Code"),
                        reqd: 1,
                        default: activeRule?.coupon_code || "",
                    },
                    { fieldname: "coupon_status", fieldtype: "HTML" },
                ],
                primary_action_label: __("Apply Coupon"),
                primary_action: async (values) => {
                    const applied = await this.wmn_apply_coupon_code(values.coupon_code);
                    if (applied) dialog.hide();
                },
                secondary_action_label: __("Close"),
                secondary_action: () => dialog.hide(),
            });

            const $status = dialog.fields_dict.coupon_status.$wrapper;
            if (activeRule) {
                const description = window.WMNPOSCoupon
                    ? window.WMNPOSCoupon.describe(activeRule, currency)
                    : { label: activeRule.coupon_code, discount: "", calculated: "" };
                $status.html(`
                    <div class="wmn-coupon-dialog-active">
                        <div class="wmn-coupon-dialog-copy">
                            <strong>${frappe.utils.escape_html(description.label || activeRule.coupon_code || "")}</strong>
                            <span>${frappe.utils.escape_html(description.discount || "")}</span>
                            <small>${__("Current discount")}: ${frappe.utils.escape_html(description.calculated || "")}</small>
                        </div>
                        <button type="button" class="btn btn-sm btn-default wmn-coupon-dialog-remove">${__("Remove")}</button>
                    </div>
                `);
                $status.find(".wmn-coupon-dialog-remove").on("click", async () => {
                    await this.wmn_remove_coupon();
                    dialog.hide();
                });
            }

            ns.UI.Dialogs?.decorate?.(dialog, "wmn-coupon-dialog");
            dialog.show();
            setTimeout(() => dialog.fields_dict.coupon_code.$input?.trigger("focus").select(), 50);
            return dialog;
        },
    };
})();
