/* Offline payment and partial/credit payment logic. */
function wmn_invoice_payment_total(doc) {
            doc = doc || {};
            const rowTotal = (doc.payments || []).reduce((sum, row) => sum + Math.abs(flt((row && row.amount) || 0)), 0);
            return Math.max(Math.abs(flt(doc.paid_amount || 0)), rowTotal);
        }

        function wmn_source_invoice_is_credit(doc) {
            doc = doc || {};

            if (cint(doc.is_return || 0) === 1) return false;

            const total = Math.abs(flt(doc.rounded_total || doc.grand_total || 0));
            const paid = wmn_invoice_payment_total(doc);
            const outstanding = Math.abs(flt(doc.outstanding_amount || 0));
            const epsilon = 0.000001;

            // A pure credit sale has an invoice balance but no collected payment.
            // This matches the WMN "Sell on Credit" flow where payment rows are kept at zero.
            return total > epsilon && paid <= epsilon && outstanding > epsilon;
        }

        function wmn_is_credit_return_doc(doc, ctrl) {
            doc = doc || {};
            if (cint(doc.is_return || 0) !== 1) return false;

            return !!(
                doc.__wmn_return_against_credit === true ||
                (ctrl && ctrl.__wmn_return_against_credit === true)
            );
        }

        function wmn_prepare_credit_return_without_payment(doc) {
            if (!doc) return doc;

            (doc.payments || []).forEach((row) => {
                if (!row) return;
                row.amount = 0;
                row.base_amount = 0;
                row.parent = doc.name;
                row.parenttype = doc.doctype;
                row.parentfield = "payments";
            });

            doc.paid_amount = 0;
            doc.base_paid_amount = 0;
            doc.change_amount = 0;
            doc.base_change_amount = 0;
            return doc;
        }

        function wmn_recalc_offline_payment_doc(doc) {
            if (!doc) return doc;
            if (window.wmnPOSOffline && window.wmnPOSOffline.recalculateOfflineDoc) {
                window.wmnPOSOffline.recalculateOfflineDoc(doc);
            } else if (typeof wmn_recalculate_offline_doc === "function") {
                wmn_recalculate_offline_doc(doc);
            } else if (typeof recalculateOfflineDoc === "function") {
                recalculateOfflineDoc(doc);
            }
            return doc;
        }

        async function wmn_ensure_offline_payment_rows(doc) {
            doc.payments = doc.payments || [];

            if (!doc.payments.length && window.wmnPOSOffline && window.wmnPOSOffline.getAll) {
                const methods = window.wmnPOSOffline.getAllCached
                    ? await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.payment_methods)
                    : await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods);
                doc.payments = (methods || []).map((p, idx) => ({
                    doctype: "Sales Invoice Payment",
                    name: "OFFLINE-PAY-" + Date.now() + "-" + idx,
                    parenttype: (doc.doctype || "Sales Invoice"),
                    parentfield: "payments",
                    parent: doc.name,
                    mode_of_payment: p.mode_of_payment,
                    account: p.account || "",
                    type: p.type || "",
                    default: p.default,
                    amount: 0,
                    base_amount: 0,
                }));
            }

            return doc.payments;
        }

        async function wmn_show_offline_payment_dialog(ctrl) {
            const frm = ctrl && ctrl.frm;
            const doc = frm && frm.doc;

            if (!doc) frappe.throw(wmn_t("No open invoice", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0641\u062A\u0648\u062D\u0629"));
            if (!doc.items || !doc.items.length) frappe.throw(wmn_t("Add at least one item before payment", "\u0623\u0636\u0641 \u0635\u0646\u0641\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0642\u0628\u0644 \u0627\u0644\u062F\u0641\u0639"));

            wmn_recalc_offline_payment_doc(doc);

            const total = flt(doc.rounded_total || doc.grand_total || 0);
            if (total <= 0) frappe.throw(wmn_t("Invoice total is zero", "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0635\u0641\u0631"));

            const allowPartialPayment = await wmn_is_partial_payment_allowed(ctrl);
            const canSellOnCredit = (
                doc.doctype === "Sales Invoice" &&
                cint(doc.is_return || 0) !== 1 &&
                allowPartialPayment
            );
            const payments = await wmn_ensure_offline_payment_rows(doc);
            const defaultPayment = payments.find(p => cint(p.default || 0) === 1) || payments[0];

            payments.forEach((p) => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
            });

            /*
             * Reconcile the default payment against the CURRENT invoice total
             * every time the offline payment dialog opens.
             *
             * Other payment-method amounts are preserved; the default row covers
             * only the remaining balance.
             */
            if (defaultPayment) {
                const otherPaid = payments.reduce((sum, p) => {
                    if (p === defaultPayment) return sum;
                    return sum + flt(p.amount || 0);
                }, 0);

                const requiredDefaultAmount = Math.max(0, total - otherPaid);
                defaultPayment.amount = requiredDefaultAmount;
                defaultPayment.base_amount = requiredDefaultAmount;
            }

            delete doc.__wmn_default_payment_autofilled;
            wmn_recalc_offline_payment_doc(doc);

            const rowsHtml = payments.map((p, idx) => {
                const mode = frappe.utils.escape_html(p.mode_of_payment || "");
                const amount = flt(p.amount || 0);
                return `
                    <div class="wmn-offline-payment-row" data-payment-index="${idx}"
                         style="display:grid;grid-template-columns:1fr 160px;gap:10px;align-items:center;margin-bottom:10px;">
                        <div>
                            <div style="font-weight:600;">${mode}</div>
                            <div style="font-size:12px;color:#6b7280;">${frappe.utils.escape_html(p.account || "")}</div>
                        </div>
                        <input type="number" step="0.01" min="0"
                               class="form-control wmn-offline-payment-amount"
                               data-payment-index="${idx}"
                               value="${amount}">
                    </div>
                `;
            }).join("");

            return new Promise((resolve, reject) => {
                const d = new frappe.ui.Dialog({
                    title: wmn_t("Payment", "\u0627\u0644\u062F\u0641\u0639"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "payment_html",
                            options: `
                                <div class="wmn-offline-payment-dialog" style="direction:inherit;">
                                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Grand Total", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}</div>
                                            <div style="font-weight:700;font-size:18px;">${format_currency(total, doc.currency || "YER")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Customer", "\u0627\u0644\u0639\u0645\u064A\u0644")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.customer_name || doc.customer || "")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Invoice", "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.name || "")}</div>
                                        </div>
                                    </div>

                                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
                                        ${rowsHtml || `<div class="text-muted">${wmn_t("No payment methods found", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0637\u0631\u0642 \u062F\u0641\u0639")}</div>`}
                                    </div>

                                    ${canSellOnCredit ? `
                                        <button type="button" class="btn btn-default wmn-offline-sell-on-credit-btn"
                                                style="width:100%;margin-top:12px;font-weight:700;">
                                            ${__("Sell on Credit")}
                                        </button>
                                    ` : ""}

                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                                        <div style="font-size:13px;color:#6b7280;">
                                            ${wmn_t("Complete Order will apply payment to the offline invoice then save it offline.", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0633\u064A\u0636\u064A\u0641 \u0627\u0644\u062F\u0641\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u062B\u0645 \u064A\u062D\u0641\u0638\u0647\u0627 \u0623\u0648\u0641\u0644\u0627\u064A\u0646.")}
                                        </div>
                                        <div style="font-weight:700;">
                                            ${wmn_t("Paid", "\u0627\u0644\u0645\u062F\u0641\u0648\u0639")}: <span class="wmn-offline-paid-total">0</span>
                                        </div>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    primary_action_label: wmn_t("Complete Order", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628"),
                    primary_action: async () => {
                        try {
                            let paid = 0;

                            d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                                const $input = $(this);
                                const idx = cint($input.attr("data-payment-index"));
                                const amount = flt($input.val() || 0);
                                const row = payments[idx];

                                if (!row) return;

                                row.amount = amount;
                                row.base_amount = amount;
                                row.parent = doc.name;
                                paid += amount;
                            });

                            if (paid <= 0) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Required", "\u0627\u0644\u062F\u0641\u0639 \u0645\u0637\u0644\u0648\u0628"),
                                    indicator: "orange",
                                    message: wmn_t("Enter payment amount first", "\u0623\u062F\u062E\u0644 \u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u0623\u0648\u0644\u0627\u064B")
                                });
                                return;
                            }

                            doc.payments = payments.filter(p => flt(p.amount || 0) > 0 || p.mode_of_payment);
                            wmn_recalc_offline_payment_doc(doc);

                            if (
                                !allowPartialPayment &&
                                flt(doc.paid_amount || 0) < flt(doc.rounded_total || doc.grand_total || 0)
                            ) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Amount", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639"),
                                    indicator: "orange",
                                    message: wmn_t("Payment amount is less than invoice total", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u0623\u0642\u0644 \u0645\u0646 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")
                                });
                                return;
                            }

                            d.hide();
                            resolve(doc);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    secondary_action_label: wmn_t("Cancel", "\u0625\u0644\u063A\u0627\u0621"),
                    secondary_action: () => {
                        d.hide();
                        reject(new Error("cancelled"));
                    }
                });

                d.$wrapper.addClass("wmn-pos-app-dialog wmn-offline-payment-modal");
                d.show();

                const updatePaidTotal = () => {
                    let paid = 0;
                    d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                        paid += flt($(this).val() || 0);
                    });
                    d.$wrapper.find(".wmn-offline-paid-total").text(format_currency(paid, doc.currency || "YER"));
                };

                d.$wrapper.on("input", ".wmn-offline-payment-amount", updatePaidTotal);

                d.$wrapper.on("click", ".wmn-offline-sell-on-credit-btn", function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    payments.forEach((row) => {
                        row.amount = 0;
                        row.base_amount = 0;
                        row.parent = doc.name;
                        row.parenttype = doc.doctype;
                        row.parentfield = "payments";
                    });

                    doc.payments = payments;
                    wmn_recalc_offline_payment_doc(doc);

                    d.hide();
                    resolve(doc);
                });

                updatePaidTotal();
            });
        }



