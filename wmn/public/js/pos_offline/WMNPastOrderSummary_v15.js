/*
 * WMNOrderSummary_v15_SAFE.js
 * Version-specific wrapper for ERPNext v15 POS PastOrderSummary.
 * Online: original v15 behavior is preserved.
 * Offline: blocks server/form calls in summary only; invoice edit/delete/sync stay in Offline Dialog / controller.
 */
(function () {
    const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;

    function wmn_summary_is_offline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
            if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos && wmn_controller_uses_offline_flow(window.cur_pos)) return true;
            if (window.__wmn_pos_effective_offline === true) return true;
            if (navigator.onLine === false) return true;
        } catch (e) {}
        return false;
    }

    function wmn_summary_customer_email(doc) {
        doc = doc || {};
        return (
            doc.customer_email ||
            doc.email_id ||
            doc.contact_email ||
            doc.contact_mobile ||
            ""
        );
    }

    class MyPastOrderSummary extends OriginalPastOrderSummary {
        constructor(options = {}, args = {}) {
            let opts = options || {};
            if (!opts.wrapper && args && args.wrapper) opts = args;
            opts.settings = wmn_safe_settings(
                opts.settings ||
                (window.cur_pos && window.cur_pos.settings) ||
                {}
            );
            opts.events = opts.events || {};
            super(opts);
            this.after_submission = false;
        }

        toggle_summary_placeholder(show) {
            if (this.after_submission === true && show === true) return;
            return super.toggle_summary_placeholder(show);
        }

        load_summary_of(doc, after_submission = false) {
            this.after_submission = after_submission;
            const result = super.load_summary_of(doc, after_submission);
            this.wmn_render_add_payment_button(doc, after_submission);
            return result;
        }

        bind_events() {
            super.bind_events();
            this.$summary_container.on("click", ".wmn-add-payment-btn", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                await this.wmn_open_add_payment_dialog();
            });
        }

        wmn_render_add_payment_button(doc, after_submission = false) {
            this.$summary_btns.find(".wmn-add-payment-btn").remove();

            if (after_submission) return;
            if (wmn_summary_is_offline()) return;
            if (!doc || doc.doctype !== "Sales Invoice") return;
            if (cint(doc.docstatus || 0) !== 1) return;
            if (cint(doc.is_return || 0) === 1) return;
            if (flt(doc.outstanding_amount || 0) <= 0) return;

            this.$summary_btns.append(
                `<div class="summary-btn btn btn-default wmn-add-payment-btn">${__("Add Payment")}</div>`
            );
        }

        async wmn_open_add_payment_dialog() {
            const doc = this.doc || {};
            if (!doc.name || doc.doctype !== "Sales Invoice") return;
            if (wmn_summary_is_offline()) {
                frappe.show_alert({ message: __("Payment Entry is not available while offline."), indicator: "orange" });
                return;
            }

            frappe.dom.freeze(__("Loading payment details..."));
            let context;

            try {
                const response = await frappe.call({
                    method: "wmn.api.get_sales_invoice_payment_context",
                    args: { invoice_name: doc.name },
                    freeze: false,
                });
                context = (response && response.message) || {};
            } finally {
                frappe.dom.unfreeze();
            }

            const methods = (context.payment_methods || []).filter((row) => row && row.mode_of_payment && row.account);
            if (!methods.length) {
                frappe.msgprint({
                    title: __("Add Payment"),
                    indicator: "orange",
                    message: __("No POS Profile payment method with an account is available."),
                });
                return;
            }

            const defaultMethod = methods.find((row) => cint(row.default || 0) === 1) || methods[0];
            const outstandingAmount = flt(context.outstanding_amount || 0);
            const currency = context.currency || doc.currency || "";

            const dialog = new frappe.ui.Dialog({
                title: __("Add Payment"),
                fields: [
                    {
                        fieldname: "invoice_name",
                        fieldtype: "Data",
                        label: __("Sales Invoice"),
                        default: context.name,
                        read_only: 1,
                    },
                    {
                        fieldname: "customer_name",
                        fieldtype: "Data",
                        label: __("Customer"),
                        default: context.customer_name || context.customer,
                        read_only: 1,
                    },
                    {
                        fieldname: "outstanding_amount",
                        fieldtype: "Currency",
                        label: __("Outstanding Amount"),
                        default: outstandingAmount,
                        read_only: 1,
                    },
                    {
                        fieldname: "mode_of_payment",
                        fieldtype: "Select",
                        label: __("Mode of Payment"),
                        options: methods.map((row) => row.mode_of_payment).join("\n"),
                        default: defaultMethod.mode_of_payment,
                        reqd: 1,
                    },
                    {
                        fieldname: "amount",
                        fieldtype: "Currency",
                        label: __("Payment Amount"),
                        default: outstandingAmount,
                        reqd: 1,
                        description: currency ? __("Currency: {0}", [currency]) : "",
                    },
                    {
                        fieldname: "reference_no",
                        fieldtype: "Data",
                        label: __("Reference No"),
                        default: context.name,
                    },
                    {
                        fieldname: "reference_date",
                        fieldtype: "Date",
                        label: __("Reference Date"),
                        default: frappe.datetime.get_today(),
                    },
                ],
                primary_action_label: __("Add Payment"),
                primary_action: async (values) => {
                    const amount = flt(values.amount || 0);
                    if (amount <= 0) {
                        frappe.show_alert({ message: __("Payment amount must be greater than zero."), indicator: "orange" });
                        return;
                    }
                    if (amount > outstandingAmount) {
                        frappe.show_alert({
                            message: __("Payment amount cannot exceed outstanding amount {0}.", [format_currency(outstandingAmount, currency)]),
                            indicator: "orange",
                        });
                        return;
                    }

                    dialog.get_primary_btn().prop("disabled", true);
                    frappe.dom.freeze(__("Adding payment..."));

                    try {
                        const response = await frappe.call({
                            method: "wmn.api.add_payment_to_sales_invoice",
                            args: {
                                invoice_name: context.name,
                                amount,
                                mode_of_payment: values.mode_of_payment,
                                reference_no: values.reference_no || context.name,
                                reference_date: values.reference_date || frappe.datetime.get_today(),
                            },
                            freeze: false,
                        });

                        const result = (response && response.message) || {};
                        dialog.hide();

                        const freshDoc = await frappe.db.get_doc("Sales Invoice", context.name);
                        this.load_summary_of(freshDoc, false);

                        if (window.cur_pos && cur_pos.recent_order_list && cur_pos.recent_order_list.refresh_list) {
                            await cur_pos.recent_order_list.refresh_list();
                        }

                        frappe.show_alert({
                            message: __("Payment Entry {0} created successfully", [result.payment_entry || ""]),
                            indicator: "green",
                        });
                    } catch (e) {
                        console.error("WMN add payment failed", e);
                        dialog.get_primary_btn().prop("disabled", false);
                        throw e;
                    } finally {
                        frappe.dom.unfreeze();
                    }
                },
            });

            dialog.show();
        }

        get_condition_btn_map(after_submission) {
            if (this.after_submission === true || after_submission === true) {
                return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
            }
            return super.get_condition_btn_map(after_submission);
        }

        attach_document_info(doc) {
            if (!wmn_summary_is_offline()) {
                return super.attach_document_info(doc);
            }

            this.customer_email = wmn_summary_customer_email(doc);
            const upper_section_dom = this.get_upper_section_html(doc || this.doc || {});
            this.$upper_section.html(upper_section_dom);
        }

        print_receipt() {
            if (wmn_summary_is_offline()) {
                const doc = this.doc || (this.events && this.events.get_frm && this.events.get_frm().doc);
                if (window.wmn_print_offline_receipt) {
                    return window.wmn_print_offline_receipt(doc);
                }
                frappe.show_alert({ message: __("Offline receipt printer is not available."), indicator: "orange" });
                return;
            }
            return super.print_receipt();
        }

        send_email() {
            if (wmn_summary_is_offline()) {
                frappe.show_alert({ message: __("Email receipt is not available while offline."), indicator: "orange" });
                if (this.email_dialog) this.email_dialog.hide();
                return;
            }
            return super.send_email();
        }
    }

    erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;
})();
