/* Payment override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.Payment;

    /*
     * WMNPayment_v15.js
     * Explicit POS Payment extension.
     * Keeps ERPNext v15 payment behavior while allowing zero-payment credit returns
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
                    const me = this;

                    this.$payment_modes.on("click", ".mode-of-payment", function (e) {
                        const mode_clicked = $(this);
                        if (!$(e.target).is(mode_clicked)) return;

                        const scrollLeft =
                            mode_clicked.offset().left - me.$payment_modes.offset().left + me.$payment_modes.scrollLeft();
                        me.$payment_modes.animate({ scrollLeft });

                        const mode = mode_clicked.attr("data-mode");
                        $(".mode-of-payment-control").css("display", "none");
                        $(".cash-shortcuts").css("display", "none");
                        me.$payment_modes.find(".pay-amount").css("display", "inline");
                        me.$payment_modes.find(".loyalty-amount-name").css("display", "none");

                        $(".mode-of-payment").removeClass("border-primary");
                        if (mode_clicked.hasClass("border-primary")) {
                            mode_clicked.removeClass("border-primary");
                            me.selected_mode = "";
                        } else {
                            mode_clicked.addClass("border-primary");
                            mode_clicked.find(".mode-of-payment-control").css("display", "flex");
                            mode_clicked.find(".cash-shortcuts").css("display", "grid");
                            me.$payment_modes.find(`.${mode}-amount`).css("display", "none");
                            me.$payment_modes.find(`.${mode}-name`).css("display", "inline");
                            me.selected_mode = me[`${mode}_control`];
                            me.selected_mode && me.selected_mode.$input.get(0).focus();
                            me.auto_set_remaining_amount();
                        }
                    });

                    frappe.ui.form.on("POS Invoice", "contact_mobile", (frm) => {
                        const contact = frm.doc.contact_mobile;
                        const request_button = $(this.request_for_payment_field?.$input[0]);
                        if (contact) {
                            request_button.removeClass("btn-default").addClass("btn-primary");
                        } else {
                            request_button.removeClass("btn-primary").addClass("btn-default");
                        }
                    });

                    frappe.ui.form.on("Sales Invoice", "paid_amount", (frm) => {
                        const pos = window.cur_pos;
                        if (!pos?.frm || pos.frm.doc.name !== frm.doc.name) return;
                        pos.cart?.update_totals_section?.(frm);
                        this.update_totals_section(frm.doc);
                        this.render_payment_mode_dom();
                    });

                    frappe.ui.form.on("Sales Invoice", "loyalty_amount", (frm) => {
                        const pos = window.cur_pos;
                        if (!pos?.frm || pos.frm.doc.name !== frm.doc.name) return;
                        const formattedCurrency = format_currency(frm.doc.loyalty_amount, frm.doc.currency);
                        this.$payment_modes.find(".loyalty-amount-amount").html(formattedCurrency);
                    });

                    frappe.ui.form.on("Sales Invoice", "contact_mobile", (frm) => {
                        const pos = window.cur_pos;
                        if (!pos?.frm || pos.frm.doc.name !== frm.doc.name) return;
                        const requestButton = $(this.request_for_payment_field?.$input?.[0]);
                        if (frm.doc.contact_mobile) {
                            requestButton.removeClass("btn-default").addClass("btn-primary");
                        } else {
                            requestButton.removeClass("btn-primary").addClass("btn-default");
                        }
                    });

                    this.setup_listener_for_payments();

                    this.$payment_modes.on("click", ".shortcut", function () {
                        const value = $(this).attr("data-value");
                        me.selected_mode.set_value(value);
                    });

                    this.$component.on("click", ".submit-order-btn", async () => {
                        const doc = this.events.get_frm().doc;
                        const paid_amount = doc.paid_amount;
                        const items = doc.items || [];
                        const isCreditReturn = wmn_payment_is_credit_return(doc);

                        if (!this.validate_reqd_invoice_fields()) return;

                        const zeroPaymentAllowed = isCreditReturn || flt(doc.additional_discount_percentage || 0) === 100;
                        if (!items.length || (flt(paid_amount || 0) === 0 && !zeroPaymentAllowed)) {
                            const message = items.length
                                ? __("You cannot submit the order without payment.")
                                : __("You cannot submit empty order.");
                            frappe.show_alert({ message, indicator: "orange" });
                            frappe.utils.play_sound("error");
                            return;
                        }

                        if (isCreditReturn && typeof wmn_prepare_credit_return_without_payment === "function") {
                            wmn_prepare_credit_return_without_payment(doc);
                            this.update_totals_section(doc);
                        }

                        await this.events.submit_invoice();
                    });

                    frappe.ui.form.on("POS Invoice", "paid_amount", (frm) => {
                        this.update_totals_section(frm.doc);
                        const is_cash_shortcuts_invisible = !this.$payment_modes.find(".cash-shortcuts").is(":visible");
                        this.attach_cash_shortcuts(frm.doc);
                        !is_cash_shortcuts_invisible && this.$payment_modes.find(".cash-shortcuts").css("display", "grid");
                        this.render_payment_mode_dom();
                    });

                    frappe.ui.form.on("POS Invoice", "loyalty_amount", (frm) => {
                        const formatted_currency = format_currency(frm.doc.loyalty_amount, frm.doc.currency);
                        this.$payment_modes.find(".loyalty-amount-amount").html(formatted_currency);
                    });

                    frappe.ui.form.on("Sales Invoice Payment", "amount", (frm, cdt, cdn) => {
                        const default_mop = locals[cdt][cdn];
                        const mode = this.sanitize_mode_of_payment(default_mop.mode_of_payment);
                        if (this[`${mode}_control`] && this[`${mode}_control`].get_value() != default_mop.amount) {
                            this[`${mode}_control`].set_value(default_mop.amount);
                        }
                    });
                },

        make_invoice_fields_control() {
                    this.reqd_invoice_fields = [];

                    if (!wmn_payment_is_offline()) {
                        return super.make_invoice_fields_control();
                    }

                    const buildControls = async () => {
                        const fields = await wmn_get_cached_invoice_fields();
                        if (!Array.isArray(fields) || !fields.length) return;

                        this.$invoice_fields = this.$invoice_fields_section.find(".invoice-fields");
                        this.$invoice_fields.html("");
                        const frm = this.events.get_frm();

                        fields.forEach((sourceDf) => {
                            const df = Object.assign({}, sourceDf || {});
                            if (!df.fieldname) return;

                            this.$invoice_fields.append(
                                `<div class="invoice_detail_field ${df.fieldname}-field" data-fieldname="${df.fieldname}"></div>`
                            );

                            let dfEvents = {
                                onchange: function () {
                                    frm.set_value(this.df.fieldname, this.get_value());
                                },
                            };

                            if (df.fieldtype === "Button") {
                                dfEvents = {
                                    click: function () {
                                        if (frm.script_manager.has_handlers(df.fieldname, frm.doc.doctype)) {
                                            frm.script_manager.trigger(df.fieldname, frm.doc.doctype, frm.doc.docname);
                                        }
                                    },
                                };
                            }

                            if (df.reqd && (df.fieldtype !== "Button" || !df.read_only)) {
                                this.reqd_invoice_fields.push({ fieldname: df.fieldname, label: df.label });
                            }

                            this[`${df.fieldname}_field`] = frappe.ui.form.make_control({
                                df: Object.assign({}, df, dfEvents),
                                parent: this.$invoice_fields.find(`.${df.fieldname}-field`),
                                render_input: true,
                            });
                            this[`${df.fieldname}_field`].set_value(frm.doc[df.fieldname]);
                        });
                    };

                    return buildControls().catch((e) => {
                        console.warn("WMN offline invoice fields cache load skipped", e);
                    });
                },

        checkout() {
                    const result = super.checkout();
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
    FinalMethods.make_invoice_fields_control = UIMethods.make_invoice_fields_control || CoreMethods.make_invoice_fields_control;
    FinalMethods.checkout = UIMethods.checkout || CoreMethods.checkout;

    const initializeCore = null;
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.OverrideMethods.Payment = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
