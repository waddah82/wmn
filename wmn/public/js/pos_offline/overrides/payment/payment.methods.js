/* Payment override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.Payment;

    /*
     * WMNPayment_v16.js
     * Explicit POS Payment extension.
     * Keeps ERPNext v16 payment behavior while allowing zero-payment credit returns
     * and exposing a clean after_checkout event for WMN UI state updates.
     */


        function wmn_payment_is_credit_return(doc) {
            try {
                return typeof wmn_is_credit_return_doc === "function" && wmn_is_credit_return_doc(doc, window.cur_pos);
            } catch (e) {
                return false;
            }
        }

        function wmn_payment_is_offline() {
            try {
                if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos) {
                    return !!wmn_controller_uses_offline_flow(window.cur_pos);
                }
            } catch (e) {}
            try {
                if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
            } catch (e) {}
            return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
        }

        async function wmn_get_cached_invoice_fields() {
            const pos = window.cur_pos;
            try {
                if (pos && typeof pos.wmn_cache === "function") {
                    const cache = pos.wmn_cache();
                    if (cache && typeof cache.getInvoiceFields === "function") {
                        return await cache.getInvoiceFields();
                    }
                }
            } catch (e) {}

            try {
                if (window.wmnPOSOffline) {
                    if (typeof window.wmnPOSOffline.getSetting === "function") {
                        const settings = await window.wmnPOSOffline.getSetting("pos_settings");
                        if (settings && Array.isArray(settings.invoice_fields)) return settings.invoice_fields;
                    }
                    if (typeof window.wmnPOSOffline.getAllCached === "function") {
                        const rows = await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.pos_settings);
                        const settings = (rows || [])[0] || {};
                        if (Array.isArray(settings.invoice_fields)) return settings.invoice_fields;
                    }
                }
            } catch (e) {}

            return [];
        }

    const CoreMethods = {
        __proto__: Base.prototype,

        bind_events() {
                    // ERPNext v16 owns payment mode selection, keyboard/numpad behavior,
                    // coupon events, paid amount updates, loyalty and payment listeners.
                    super.bind_events();

                    // Replace only the native Complete Order handler so WMN credit-return
                    // behavior is added without duplicating the rest of ERPNext's lifecycle.
                    this.$component.off("click", ".submit-order-btn");
                    this.$component.on("click.wmnSubmit", ".submit-order-btn", async () => {
                        const doc = this.events.get_frm().doc;
                        const paidAmount = flt(doc.paid_amount || 0);
                        const items = doc.items || [];
                        const isCreditReturn = wmn_payment_is_credit_return(doc);
                        const zeroPaymentAllowed =
                            isCreditReturn ||
                            flt(doc.additional_discount_percentage || 0) === 100 ||
                            cint(this.allow_partial_payment || 0) === 1;

                        if (!items.length || (paidAmount === 0 && !zeroPaymentAllowed)) {
                            const message = items.length
                                ? __("You cannot submit the order without payment.")
                                : __("You cannot submit empty order.");
                            frappe.show_alert({ message, indicator: "orange" });
                            frappe.utils.play_sound("error");
                            return;
                        }

                        if (!this.validate_reqd_invoice_fields()) return;

                        if (isCreditReturn && typeof wmn_prepare_credit_return_without_payment === "function") {
                            wmn_prepare_credit_return_without_payment(doc);
                            this.update_totals_section(doc);
                        }

                        await this.events.submit_invoice();
                    });
                },

        wmn_setup_send_to_cashier_button() {
                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                    const frm = this.events?.get_frm?.();
                    const doc = frm?.doc || {};
                    const $submit = this.$component?.find?.(".submit-order-btn").first();
                    if (!$submit?.length) return;

                    let $button = this.$component.find(".wmn-send-to-cashier-btn").first();
                    if (!$button.length) {
                        $button = $(
                            `<button type="button" class="btn btn-default wmn-send-to-cashier-btn" style="margin-inline-end:8px;font-weight:700;">${wmn_t("Send to Cashier", "إرسال إلى الكاشير")}</button>`
                        );
                        $button.insertBefore($submit);
                    }

                    const canShow = !!(
                        handoff?.canSendToCashier?.(doc) &&
                        window.cur_pos?.__wmn_cashier_resume !== true
                    );
                    $button.toggle(canShow);
                    if (!canShow) return;

                    $button.off("click.wmnSendToCashier").on("click.wmnSendToCashier", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (this.validate_reqd_invoice_fields && !this.validate_reqd_invoice_fields()) return;
                        if (!this.events?.send_to_cashier) return;

                        $button.prop("disabled", true);
                        try {
                            await this.events.send_to_cashier();
                        } catch (error) {
                            console.error("WMN Send to Cashier failed", error);
                            if (!String(error?.message || "").includes("printing")) {
                                frappe.show_alert({
                                    message: error?.message || wmn_t("Send to Cashier failed", "تعذر الإرسال إلى الكاشير"),
                                    indicator: "red",
                                });
                            }
                        } finally {
                            $button.prop("disabled", false);
                        }
                    });
                },


        wmn_setup_back_to_recent_orders_button() {
                    const $submit = this.$component?.find?.(".submit-order-btn").first();
                    if (!$submit?.length) return;

                    let $button = this.$component.find(".wmn-payment-back-to-recent-btn").first();
                    if (!$button.length) {
                        $button = $(
                            `<button type="button" class="btn btn-default wmn-payment-back-to-recent-btn" style="margin-inline-end:8px;font-weight:700;">${wmn_t("Back to Recent Orders", "العودة للطلبات الأخيرة")}</button>`
                        );
                        $button.insertBefore($submit);
                    }

                    const canShow = window.cur_pos?.__wmn_payment_origin === "recent_orders";
                    $button.toggle(canShow);
                    if (!canShow) return;

                    $button.off("click.wmnBackRecentOrders").on("click.wmnBackRecentOrders", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!this.events?.back_to_recent_orders) return;

                        $button.prop("disabled", true);
                        try {
                            await this.events.back_to_recent_orders();
                        } catch (error) {
                            console.error("WMN back to Recent Orders failed", error);
                            frappe.show_alert({
                                message: error?.message || wmn_t("Could not return to Recent Orders", "تعذر الرجوع إلى الطلبات الأخيرة"),
                                indicator: "red",
                            });
                        } finally {
                            $button.prop("disabled", false);
                        }
                    });
                },


        checkout() {
                    const result = super.checkout();
                    this.wmn_setup_send_to_cashier_button();
                    this.wmn_setup_back_to_recent_orders_button();
                    if (this.events && typeof this.events.after_checkout === "function") {
                        Promise.resolve(this.events.after_checkout()).catch((e) => {
                            console.warn("WMN Payment after_checkout skipped", e);
                        });
                    }
                    return result;
                }
    };

    const UIMethods = {
        __proto__: CoreMethods
    };

    const FinalMethods = Object.create(null);
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.wmn_setup_send_to_cashier_button = UIMethods.wmn_setup_send_to_cashier_button || CoreMethods.wmn_setup_send_to_cashier_button;
    FinalMethods.wmn_setup_back_to_recent_orders_button = UIMethods.wmn_setup_back_to_recent_orders_button || CoreMethods.wmn_setup_back_to_recent_orders_button;
    FinalMethods.checkout = UIMethods.checkout || CoreMethods.checkout;

    const initializeCore = null;
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.OverrideMethods.Payment = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
