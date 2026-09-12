/* Offline payment and partial/credit payment logic. */
function wmn_invoice_payment_total(doc) {
            doc = doc || {};
            const rowTotal = (doc.payments || []).reduce((sum, row) => sum + Math.abs(flt((row && row.amount) || 0)), 0);
            return Math.max(Math.abs(flt(doc.paid_amount || 0)), rowTotal);
        }

        function wmn_source_invoice_payment_state(doc) {
            doc = doc || {};
            if (cint(doc.is_return || 0) === 1) return "return";

            const epsilon = 0.000001;
            const total = Math.abs(flt(doc.rounded_total || doc.grand_total || 0));
            const paid = wmn_invoice_payment_total(doc);
            const outstanding = flt(doc.outstanding_amount || 0);
            const status = String(doc.status || "").trim().toLowerCase();
            const isSubmitted = cint(doc.docstatus || 0) === 1 || doc.__wmn_local_submitted === true;
            const explicitlyCredit = doc.__wmn_credit_sale === true || cint(doc.__wmn_credit_sale || 0) === 1;

            if (explicitlyCredit || (isSubmitted && total > epsilon && paid <= epsilon)) {
                return "unpaid";
            }

            if (
                status === "partly paid" ||
                status === "partly paid and discounted" ||
                (paid > epsilon && outstanding > epsilon) ||
                (total > epsilon && paid > epsilon && paid < total - epsilon)
            ) {
                return "partly_paid";
            }

            if (
                status === "unpaid" ||
                status === "unpaid and discounted" ||
                status === "overdue" ||
                status === "overdue and discounted"
            ) {
                return paid <= epsilon ? "unpaid" : "partly_paid";
            }

            return "paid";
        }

        function wmn_source_invoice_is_credit(doc) {
            return wmn_source_invoice_payment_state(doc) === "unpaid";
        }

        function wmn_source_invoice_requires_zero_return_payment(doc) {
            const state = wmn_source_invoice_payment_state(doc);
            return state === "unpaid" || state === "partly_paid";
        }

        function wmn_mark_offline_credit_sale(doc) {
            if (!doc || cint(doc.is_return || 0) === 1) return doc;

            const total = Math.abs(flt(doc.rounded_total || doc.grand_total || 0));
            doc.__wmn_credit_sale = true;
            doc.paid_amount = 0;
            doc.base_paid_amount = 0;
            doc.outstanding_amount = total;
            doc.__wmn_base_outstanding_amount = total;
            doc.status = "Unpaid";
            return doc;
        }

        function wmn_is_zero_payment_return_doc(doc, ctrl) {
            doc = doc || {};
            if (cint(doc.is_return || 0) !== 1) return false;

            return !!(
                doc.__wmn_return_zero_payment === true ||
                cint(doc.__wmn_return_zero_payment || 0) === 1 ||
                (ctrl && (ctrl.__wmn_return_zero_payment === true || cint(ctrl.__wmn_return_zero_payment || 0) === 1))
            );
        }

        function wmn_prepare_zero_payment_return(doc) {
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

        function wmn_reconcile_offline_return_payment_before_dialog(doc, payments, preservePaymentRows) {
            doc = doc || {};
            payments = payments || [];
            if (cint(doc.is_return || 0) !== 1 || preservePaymentRows) return payments;
            if (wmn_is_zero_payment_return_doc(doc, window.cur_pos)) return payments;

            const epsilon = 0.000001;
            const totalAmountToPay = flt(doc.rounded_total || doc.grand_total || 0);
            const conversionRate = flt(doc.conversion_rate || 1) || 1;
            const paymentAmount = payments.reduce((sum, row) => sum + flt(row?.amount || 0), 0);
            if (Math.abs(paymentAmount - totalAmountToPay) <= epsilon) return payments;

            /*
             * ERPNext v16 set_total_amount_to_default_mop() keeps the source MOP
             * for a partial return when the source invoice has exactly one payment
             * row. Offline uses the cached source-payment snapshot instead of the
             * get_payment_data() server call.
             */
            const sourcePayments = Array.isArray(doc.__wmn_return_source_payment_data)
                ? doc.__wmn_return_source_payment_data
                : [];
            if (sourcePayments.length === 1) {
                const sourceMode = String(sourcePayments[0].mode_of_payment || "");
                payments.forEach((payment) => {
                    const matchesSource = String(payment?.mode_of_payment || "") === sourceMode;
                    payment.amount = matchesSource ? totalAmountToPay : 0;
                    payment.base_amount = payment.amount * conversionRate;
                });
                return payments;
            }

            const defaultPayment = payments.find((payment) => cint(payment?.default || 0) === 1);
            if (defaultPayment) {
                payments.forEach((payment) => {
                    payment.amount = payment === defaultPayment ? totalAmountToPay : 0;
                    payment.base_amount = payment.amount * conversionRate;
                });
            }
            return payments;
        }

        async function wmn_show_offline_payment_dialog(ctrl) {
            const frm = ctrl && ctrl.frm;
            const doc = frm && frm.doc;

            if (!doc) frappe.throw(wmn_t("No open invoice", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0641\u062A\u0648\u062D\u0629"));
            if (!doc.items || !doc.items.length) frappe.throw(wmn_t("Add at least one item before payment", "\u0623\u0636\u0641 \u0635\u0646\u0641\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0642\u0628\u0644 \u0627\u0644\u062F\u0641\u0639"));

            wmn_recalc_offline_payment_doc(doc);

            const total = flt(doc.rounded_total || doc.grand_total || 0);
            const isReturn = cint(doc.is_return || 0) === 1;
            const epsilon = 0.000001;
            if (Math.abs(total) <= epsilon) frappe.throw(wmn_t("Invoice total is zero", "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0635\u0641\u0631"));

            const allowPartialPayment = await wmn_is_partial_payment_allowed(ctrl);
            const canSellOnCredit = (
                doc.doctype === "Sales Invoice" &&
                cint(doc.is_return || 0) !== 1 &&
                allowPartialPayment
            );
            const payments = await wmn_ensure_offline_payment_rows(doc);
            const defaultPayment = payments.find(p => cint(p.default || 0) === 1) || payments[0];
            const gatewayService = window.WMN_POS?.Services?.PaymentGateway?.Service || null;
            const gatewayCommon = window.WMN_POS?.Features?.PaymentGateway?.Common || null;
            const gatewayMappings = gatewayService
                ? await gatewayService.loadConfig(doc.pos_profile, false).catch((error) => {
                    console.warn("WMN offline payment gateway configuration unavailable", error);
                    return [];
                })
                : [];
            const gatewayMappingByMode = new Map(
                (gatewayMappings || [])
                    .filter((row) => row?.enabled && row?.mode_of_payment)
                    .map((row) => [String(row.mode_of_payment), row])
            );
            const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
            const recentOrdersOrigin = ctrl?.__wmn_payment_origin === "recent_orders";
            const preservePaymentRows = handoff?.isAwaitingCashier?.(doc) === true || ctrl?.__wmn_cashier_resume === true;

            payments.forEach((p) => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
            });

            wmn_reconcile_offline_return_payment_before_dialog(doc, payments, preservePaymentRows);

            /*
             * Reconcile the default payment against the CURRENT invoice total
             * every time the offline payment dialog opens.
             *
             * Other payment-method amounts are preserved; the default row covers
             * only the remaining balance.
             */
            if (defaultPayment && !preservePaymentRows && !isReturn) {
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
                const modeOfPayment = String(p.mode_of_payment || "");
                const mode = frappe.utils.escape_html(modeOfPayment);
                const amount = flt(p.amount || 0);
                const mapping = !isReturn ? gatewayMappingByMode.get(modeOfPayment) : null;
                const availability = mapping && gatewayService
                    ? gatewayService.availabilityForMapping(mapping, "authorize")
                    : null;
                const approval = mapping && gatewayService
                    ? gatewayService.getApproval(doc, modeOfPayment)
                    : null;
                const approvedForCurrentAmount = !!(
                    approval &&
                    String(approval.status || "") === String(gatewayCommon?.STATUS?.APPROVED || "Approved") &&
                    Math.abs(flt(approval.amount || 0) - amount) <= epsilon
                );
                let gatewayHtml = "";
                if (mapping) {
                    if (availability?.available) {
                        const gatewayLabel = approvedForCurrentAmount
                            ? wmn_t("Approved", "تمت الموافقة")
                            : wmn_t("Process Electronic Payment", "معالجة الدفع الإلكتروني");
                        gatewayHtml = `
                            <button type="button"
                                    class="btn btn-default btn-xs wmn-offline-gateway-action wmn-offline-payment-button"
                                    data-payment-index="${idx}"
                                    ${approvedForCurrentAmount ? "disabled" : ""}>
                                ${gatewayLabel}
                            </button>
                            <div class="wmn-offline-gateway-status wmn-offline-payment-account" data-payment-index="${idx}">
                                ${approvedForCurrentAmount ? wmn_t("Payment approved", "تم اعتماد الدفع") : ""}
                            </div>
                        `;
                    } else {
                        gatewayHtml = `
                            <div class="wmn-offline-gateway-note">
                                ${frappe.utils.escape_html(availability?.reason || wmn_t("Electronic payment is unavailable", "الدفع الإلكتروني غير متاح"))}
                            </div>
                        `;
                    }
                }
                return `
                    <div class="wmn-offline-payment-row" data-payment-index="${idx}">
                        <div>
                            <div class="wmn-font-bold">${mode}</div>
                            <div class="wmn-offline-payment-account">${frappe.utils.escape_html(p.account || "")}</div>
                            ${gatewayHtml}
                        </div>
                        <input type="number" step="0.01" ${isReturn ? 'max="0"' : 'min="0"'}
                               class="form-control wmn-offline-payment-amount"
                               data-payment-index="${idx}"
                               value="${amount}">
                    </div>
                `;
            }).join("");

            return new Promise((resolve, reject) => {
                const d = new frappe.ui.Dialog({
                    title: isReturn ? wmn_t("Refund", "استرداد") : wmn_t("Payment", "\u0627\u0644\u062F\u0641\u0639"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "payment_html",
                            options: `
                                <div class="wmn-offline-payment-dialog">
                                    <div class="wmn-offline-payment-summary">
                                        <div class="wmn-offline-payment-card">
                                            <div class="wmn-offline-payment-label">${wmn_t("Grand Total", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}</div>
                                            <div class="wmn-offline-payment-value large">${format_currency(total, doc.currency || "YER")}</div>
                                        </div>
                                        <div class="wmn-offline-payment-card">
                                            <div class="wmn-offline-payment-label">${wmn_t("Customer", "\u0627\u0644\u0639\u0645\u064A\u0644")}</div>
                                            <div class="wmn-offline-payment-value">${frappe.utils.escape_html(doc.customer_name || doc.customer || "")}</div>
                                        </div>
                                        <div class="wmn-offline-payment-card">
                                            <div class="wmn-offline-payment-label">${wmn_t("Invoice", "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")}</div>
                                            <div class="wmn-offline-payment-value">${frappe.utils.escape_html(doc.name || "")}</div>
                                        </div>
                                    </div>

                                    <div class="wmn-offline-payment-method-list">
                                        ${rowsHtml || `<div class="text-muted">${wmn_t("No payment methods found", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0637\u0631\u0642 \u062F\u0641\u0639")}</div>`}
                                    </div>

                                    ${canSellOnCredit ? `
                                        <button type="button" class="btn btn-default wmn-offline-sell-on-credit-btn wmn-offline-payment-button">
                                            ${__("Sell on Credit")}
                                        </button>
                                    ` : ""}

                                    ${(handoff?.canSendToCashier?.(doc) && ctrl?.__wmn_cashier_resume !== true) ? `
                                        <button type="button" class="btn btn-default wmn-offline-send-to-cashier-btn wmn-offline-payment-button">
                                            ${wmn_t("Send to Cashier", "إرسال إلى الكاشير")}
                                        </button>
                                    ` : ""}

                                    <div class="wmn-offline-payment-total-row">
                                        <div class="wmn-offline-payment-label">
                                            ${isReturn
                                                ? wmn_t("Complete Order will apply the refund to the offline return then save it offline.", "إكمال الطلب سيطبق الاسترداد على المرتجع ثم يحفظه أوفلاين.")
                                                : wmn_t("Complete Order will apply payment to the offline invoice then save it offline.", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0633\u064A\u0636\u064A\u0641 \u0627\u0644\u062F\u0641\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u062B\u0645 \u064A\u062D\u0641\u0638\u0647\u0627 \u0623\u0648\u0641\u0644\u0627\u064A\u0646.")}
                                        </div>
                                        <div class="wmn-font-bold">
                                            ${isReturn ? wmn_t("Refund", "الاسترداد") : wmn_t("Paid", "\u0627\u0644\u0645\u062F\u0641\u0648\u0639")}: <span class="wmn-offline-paid-total">0</span>
                                        </div>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    primary_action_label: wmn_t("Complete Order", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628"),
                    primary_action: async () => {
                        try {
                            if (!capturePaymentInputs(true, true)) return;
                            if (gatewayService?.validateBeforeSubmit) {
                                try {
                                    await gatewayService.validateBeforeSubmit(doc);
                                } catch (error) {
                                    frappe.msgprint({
                                        title: wmn_t("Electronic Payment", "الدفع الإلكتروني"),
                                        indicator: "red",
                                        message: gatewayCommon?.errorMessage
                                            ? gatewayCommon.errorMessage(error)
                                            : (error?.message || String(error)),
                                    });
                                    return;
                                }
                            }
                            d.hide();
                            resolve(doc);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    secondary_action_label: recentOrdersOrigin
                        ? wmn_t("Back to Recent Orders", "العودة للطلبات الأخيرة")
                        : wmn_t("Cancel", "إلغاء"),
                    secondary_action: () => {
                        d.hide();
                        reject(new Error(recentOrdersOrigin ? "recent_orders_back" : "cancelled"));
                    }
                });

                function capturePaymentInputs(requirePayment, enforceFullPayment) {
                    let paid = 0;
                    d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                        const $input = $(this);
                        const idx = cint($input.attr("data-payment-index"));
                        const rawAmount = flt($input.val() || 0);
                        const amount = isReturn ? Math.min(0, rawAmount) : Math.max(0, rawAmount);
                        const row = payments[idx];
                        if (!row) return;
                        row.amount = amount;
                        row.base_amount = amount;
                        row.parent = doc.name;
                        row.parenttype = doc.doctype;
                        row.parentfield = "payments";
                        paid += amount;
                    });

                    if (requirePayment && Math.abs(paid) <= epsilon) {
                        frappe.msgprint({
                            title: wmn_t("Payment Required", "الدفع مطلوب"),
                            indicator: "orange",
                            message: wmn_t("Enter payment amount first", "أدخل مبلغ الدفع أولاً")
                        });
                        return false;
                    }

                    doc.payments = payments.filter(p => Math.abs(flt(p.amount || 0)) > epsilon || p.mode_of_payment);
                    wmn_recalc_offline_payment_doc(doc);

                    const paidAmount = flt(doc.paid_amount || 0);
                    const invoiceTotal = flt(doc.rounded_total || doc.grand_total || 0);

                    if (isReturn && paidAmount < invoiceTotal - epsilon) {
                        frappe.msgprint({
                            title: wmn_t("Refund Amount", "مبلغ الاسترداد"),
                            indicator: "orange",
                            message: wmn_t("Refund amount cannot exceed the return total", "مبلغ الاسترداد لا يمكن أن يتجاوز إجمالي المرتجع")
                        });
                        return false;
                    }

                    if (enforceFullPayment && !allowPartialPayment) {
                        const invalidFullPayment = isReturn
                            ? Math.abs(paidAmount - invoiceTotal) > epsilon
                            : paidAmount < invoiceTotal - epsilon;
                        if (invalidFullPayment) {
                            frappe.msgprint({
                                title: wmn_t("Payment Amount", "مبلغ الدفع"),
                                indicator: "orange",
                                message: isReturn
                                    ? wmn_t("Refund amount must equal the return total", "مبلغ الاسترداد يجب أن يساوي إجمالي المرتجع")
                                    : wmn_t("Payment amount is less than invoice total", "مبلغ الدفع أقل من إجمالي الفاتورة")
                            });
                            return false;
                        }
                    }
                    return true;
                }

                d.$wrapper.addClass("wmn-pos-app-dialog wmn-offline-payment-modal");
                d.show();

                const updatePaidTotal = () => {
                    let paid = 0;
                    d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                        paid += flt($(this).val() || 0);
                    });
                    d.$wrapper.find(".wmn-offline-paid-total").text(format_currency(paid, doc.currency || "YER"));
                };

                d.$wrapper.on("input", ".wmn-offline-payment-amount", function () {
                    updatePaidTotal();
                    const $input = $(this);
                    const idx = cint($input.attr("data-payment-index"));
                    const row = payments[idx];
                    if (!row || !gatewayMappingByMode.has(String(row.mode_of_payment || ""))) return;
                    const $button = d.$wrapper.find(`.wmn-offline-gateway-action[data-payment-index="${idx}"]`);
                    const $status = d.$wrapper.find(`.wmn-offline-gateway-status[data-payment-index="${idx}"]`);
                    if (!$button.length || $button.attr("data-processing") === "1") return;
                    const currentAmount = flt($input.val() || 0);
                    const approval = gatewayService?.getApproval?.(doc, row.mode_of_payment);
                    const approved = !!(
                        approval &&
                        String(approval.status || "") === String(gatewayCommon?.STATUS?.APPROVED || "Approved") &&
                        Math.abs(flt(approval.amount || 0) - currentAmount) <= epsilon
                    );
                    $button.prop("disabled", approved);
                    $button.text(approved
                        ? wmn_t("Approved", "تمت الموافقة")
                        : wmn_t("Process Electronic Payment", "معالجة الدفع الإلكتروني"));
                    $status.text(approved ? wmn_t("Payment approved", "تم اعتماد الدفع") : "");
                });

                d.$wrapper.on("click", ".wmn-offline-gateway-action", async function (e) {
                    e.preventDefault();
                    e.stopPropagation();

                    const $button = $(this);
                    const idx = cint($button.attr("data-payment-index"));
                    const row = payments[idx];
                    const mapping = row ? gatewayMappingByMode.get(String(row.mode_of_payment || "")) : null;
                    const $status = d.$wrapper.find(`.wmn-offline-gateway-status[data-payment-index="${idx}"]`);
                    if (!row || !mapping || !gatewayService || !gatewayCommon) return;
                    if (!capturePaymentInputs(false, false)) return;
                    if (Math.abs(flt(row.amount || 0)) <= epsilon) {
                        frappe.msgprint({
                            title: wmn_t("Electronic Payment", "الدفع الإلكتروني"),
                            indicator: "orange",
                            message: wmn_t("Enter the electronic payment amount first", "أدخل مبلغ الدفع الإلكتروني أولاً"),
                        });
                        return;
                    }

                    $button.attr("data-processing", "1");
                    $button.prop("disabled", true);
                    $button.text(wmn_t("Processing...", "جاري المعالجة..."));
                    $status.text(wmn_t("Waiting for the payment device...", "بانتظار جهاز الدفع..."));
                    try {
                        const result = await gatewayCommon.authorizeWithLocalCredentialRetry(
                            gatewayService, doc, row.mode_of_payment, mapping
                        );
                        $button.attr("data-processing", "0");
                        $button.text(wmn_t("Approved", "تمت الموافقة"));
                        $status.text(
                            `${wmn_t("Payment approved", "تم اعتماد الدفع")}` +
                            `${result?.reference_number || result?.rrn || result?.transaction_id ? `: ${result.reference_number || result.rrn || result.transaction_id}` : ""}`
                        );
                        frappe.show_alert({
                            message: wmn_t("Electronic payment approved", "تم اعتماد الدفع الإلكتروني"),
                            indicator: "green",
                        });
                    } catch (error) {
                        console.error("WMN offline electronic payment failed", error);
                        $button.attr("data-processing", "0");
                        $button.prop("disabled", false);
                        $button.text(wmn_t("Process Electronic Payment", "معالجة الدفع الإلكتروني"));
                        $status.text("");
                        frappe.msgprint({
                            title: wmn_t("Electronic Payment", "الدفع الإلكتروني"),
                            indicator: "red",
                            message: gatewayCommon.errorMessage(error),
                        });
                    }
                });

                d.$wrapper.on("click", ".wmn-offline-send-to-cashier-btn", async function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const $button = $(this);
                    if (!capturePaymentInputs(false, false)) return;

                    $button.prop("disabled", true);
                    try {
                        const sent = await ctrl.wmn_send_to_cashier();
                        if (!sent) return;
                        d.hide();
                        resolve({ __wmn_handoff_complete: true });
                    } catch (error) {
                        console.error("WMN offline Send to Cashier failed", error);
                    } finally {
                        $button.prop("disabled", false);
                    }
                });

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
                    wmn_mark_offline_credit_sale(doc);
                    wmn_recalc_offline_payment_doc(doc);

                    d.hide();
                    resolve(doc);
                });

                updatePaidTotal();
            });
        }




async function wmn_get_offline_existing_invoice_payment_context(doc) {
    doc = doc || {};
    const offline = window.wmnPOSOffline;
    if (!offline) throw new Error("WMN offline storage is not available");

    const methods = offline.getAllCached
        ? await offline.getAllCached(offline.STORES.payment_methods)
        : await offline.getAll(offline.STORES.payment_methods);
    const paymentMethods = (methods || []).filter(row => row && row.mode_of_payment && row.account);

    return {
        name: doc.__wmn_server_name || doc.__wmn_display_name || doc.name || doc.__wmn_queue_offline_id || "",
        invoice_offline_id: doc.__wmn_queue_offline_id || doc.wmn_offline_sync_id || doc.custom_offline_id || doc.name || "",
        customer: doc.customer || "",
        customer_name: doc.customer_name || doc.customer || "",
        currency: doc.currency || "",
        status: doc.status || "",
        grand_total: flt(doc.grand_total || 0),
        paid_amount: flt(doc.paid_amount || 0),
        outstanding_amount: Math.max(0, flt(doc.outstanding_amount || 0)),
        payment_methods: paymentMethods,
    };
}

async function wmn_open_offline_existing_invoice_payment_dialog(doc) {
    const context = await wmn_get_offline_existing_invoice_payment_context(doc);
    const methods = context.payment_methods || [];
    if (!methods.length) {
        frappe.msgprint({
            title: __("Add Payment"),
            indicator: "orange",
            message: __("No cached POS Profile payment method with an account is available."),
        });
        return null;
    }

    const outstandingAmount = flt(context.outstanding_amount || 0);
    if (outstandingAmount <= 0) {
        frappe.show_alert({ message: __("This invoice has no outstanding amount."), indicator: "orange" });
        return null;
    }

    const defaultMethod = methods.find(row => cint(row.default || 0) === 1) || methods[0];
    const currency = context.currency || "";

    return await new Promise((resolve, reject) => {
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
                    options: methods.map(row => row.mode_of_payment).join("\n"),
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
                    default: context.name || context.invoice_offline_id,
                },
                {
                    fieldname: "reference_date",
                    fieldtype: "Date",
                    label: __("Reference Date"),
                    default: frappe.datetime.get_today(),
                },
            ],
            primary_action_label: __("Add Payment"),
            secondary_action_label: __("Close"),
            secondary_action: () => {
                dialog.hide();
                resolve(null);
            },
            primary_action: async (values) => {
                const amount = flt(values.amount || 0);
                if (amount <= 0) {
                    frappe.show_alert({ message: __("Payment amount must be greater than zero."), indicator: "orange" });
                    return;
                }
                if (amount > outstandingAmount + 0.000001) {
                    frappe.show_alert({
                        message: __("Payment amount cannot exceed outstanding amount {0}.", [format_currency(outstandingAmount, currency)]),
                        indicator: "orange",
                    });
                    return;
                }

                dialog.get_primary_btn().prop("disabled", true);
                try {
                    const row = await window.wmnPOSOffline.savePaymentEntry({
                        invoice_offline_id: context.invoice_offline_id,
                        invoice_name: doc.__wmn_server_name || "",
                        amount,
                        mode_of_payment: values.mode_of_payment,
                        reference_no: values.reference_no || context.name || context.invoice_offline_id,
                        reference_date: values.reference_date || frappe.datetime.get_today(),
                    });
                    dialog.hide();
                    frappe.show_alert({
                        message: __("Payment saved offline and will be synchronized as a Payment Entry."),
                        indicator: "green",
                    });
                    resolve(row);
                } catch (e) {
                    console.error("WMN offline add payment failed", e);
                    dialog.get_primary_btn().prop("disabled", false);
                    frappe.msgprint({
                        title: __("Add Payment"),
                        indicator: "red",
                        message: e.message || String(e),
                    });
                }
            },
        });

        window.WMN_POS?.UI?.Dialogs?.decorate?.(dialog, "wmn-pos-add-payment-dialog");
        dialog.$wrapper.addClass("wmn-add-payment-modal wmn-offline-add-payment-modal");
        dialog.show();
    });
}
