/* Cashier handoff lifecycle for draft POS invoices. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceHandoff = ns.Features.InvoiceHandoff || {};

    const AWAITING_CASHIER = "AWAITING_CASHIER";
    const STAGE_FIELD = "wmn_pos_stage";
    const SENT_AT_FIELD = "wmn_sent_to_cashier_at";
    const SENT_BY_FIELD = "wmn_sent_to_cashier_by";

    function isOffline(ctrl) {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && ctrl) {
                return !!wmn_controller_uses_offline_flow(ctrl);
            }
        } catch (e) {}
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function isAwaitingCashier(doc) {
        return String(doc?.[STAGE_FIELD] || "").trim() === AWAITING_CASHIER;
    }

    function canSendToCashier(doc) {
        doc = doc || {};
        if (cint(doc.docstatus || 0) !== 0) return false;
        if (cint(doc.is_return || 0) === 1) return false;
        return Array.isArray(doc.items) && doc.items.length > 0;
    }

    function nowDatetime() {
        if (window.frappe?.datetime?.now_datetime) return frappe.datetime.now_datetime();
        return new Date().toISOString().slice(0, 19).replace("T", " ");
    }

    function markAwaitingCashier(doc) {
        if (!doc) return doc;
        doc[STAGE_FIELD] = AWAITING_CASHIER;
        doc[SENT_AT_FIELD] = nowDatetime();
        doc[SENT_BY_FIELD] = window.frappe?.session?.user || "";
        doc.__wmn_saved_as_draft = true;
        return doc;
    }

    function prepareForCompletion(doc) {
        if (!doc) return doc;
        doc[STAGE_FIELD] = "";
        if (String(doc.status || "").trim() === "Awaiting Cashier") {
            doc.status = "Draft";
        }
        delete doc.__wmn_saved_as_draft;
        delete doc.__wmn_display_status;
        return doc;
    }

    function capturePaymentSnapshot(doc) {
        doc = doc || {};
        return {
            paid_amount: doc.paid_amount,
            base_paid_amount: doc.base_paid_amount,
            change_amount: doc.change_amount,
            base_change_amount: doc.base_change_amount,
            payments: (doc.payments || []).map((row) => ({
                name: row.name || "",
                mode_of_payment: row.mode_of_payment || "",
                account: row.account || "",
                amount: row.amount,
                base_amount: row.base_amount,
            })),
        };
    }

    function restorePaymentSnapshot(doc, snapshot) {
        if (!doc || !snapshot) return doc;
        const used = new Set();
        (doc.payments || []).forEach((row) => {
            let source = snapshot.payments.find((saved, index) => {
                if (used.has(index)) return false;
                if (saved.name && row.name && saved.name === row.name) return true;
                return saved.mode_of_payment === (row.mode_of_payment || "") &&
                    saved.account === (row.account || "");
            });
            if (!source) return;
            const index = snapshot.payments.indexOf(source);
            if (index >= 0) used.add(index);
            row.amount = source.amount;
            row.base_amount = source.base_amount;
        });
        doc.paid_amount = snapshot.paid_amount;
        doc.base_paid_amount = snapshot.base_paid_amount;
        doc.change_amount = snapshot.change_amount;
        doc.base_change_amount = snapshot.base_change_amount;
        return doc;
    }

    async function ensureIdentity(doc) {
        const barcode = ns.Services?.Barcode?.InvoiceBarcode;
        if (barcode?.ensureInvoiceUID) barcode.ensureInvoiceUID(doc);
        if (typeof wmn_assign_receipt_number === "function") {
            await wmn_assign_receipt_number(doc);
        }
        return doc;
    }

    async function printHandoff(doc) {
        if (typeof wmn_print_raw_receipt !== "function") {
            throw new Error("WMN receipt printing service is not available");
        }
        return await wmn_print_raw_receipt(doc);
    }

    async function resetToNewOrder(ctrl) {
        ctrl.__wmn_cashier_resume = false;
        ctrl.payment?.toggle_component?.(false);
        ctrl.order_summary?.toggle_component?.(false);
        ctrl.recent_order_list?.toggle_component?.(false);

        await ctrl.make_new_invoice();

        ctrl.item_selector?.toggle_component?.(true);
        ctrl.cart?.toggle_component?.(true);
        ctrl.cart?.$numpad_section?.css?.("display", "none");
        ctrl.cart?.$totals_section?.css?.("display", "flex");
        ctrl.item_selector?.sync_card_quantities?.();
    }

    async function sendToCashier(ctrl) {
        if (!ctrl?.frm?.doc) throw new Error("No open POS invoice");
        if (ctrl.__wmn_handoff_in_flight) return false;

        const doc = ctrl.frm.doc;
        if (!canSendToCashier(doc)) {
            frappe.show_alert({
                message: wmn_t("This invoice cannot be sent to cashier.", "لا يمكن إرسال هذه الفاتورة إلى الكاشير."),
                indicator: "orange",
            });
            return false;
        }

        ctrl.__wmn_handoff_in_flight = true;
        try {
            await ensureIdentity(doc);
            markAwaitingCashier(doc);

            const adapter = isOffline(ctrl)
                ? ns.Features.InvoiceHandoff.Offline
                : ns.Features.InvoiceHandoff.Online;
            if (!adapter?.saveDraft) throw new Error("WMN cashier handoff adapter is not available");

            const savedDoc = await adapter.saveDraft(ctrl, doc);

            try {
                await printHandoff(savedDoc || doc);
            } catch (printError) {
                frappe.msgprint({
                    title: wmn_t("Cashier Handoff Saved", "تم حفظ الإرسال للكاشير"),
                    indicator: "orange",
                    message: wmn_t(
                        "The draft was saved for the cashier, but printing failed. Retry Send to Cashier to print it before starting a new order.",
                        "تم حفظ المسودة للكاشير، لكن الطباعة فشلت. أعد الضغط على إرسال إلى الكاشير لطباعة السند قبل بدء طلب جديد."
                    ) + "<br><br>" + frappe.utils.escape_html(printError?.message || String(printError)),
                });
                throw printError;
            }

            if (ctrl.recent_order_list?.refresh_list) {
                try { await ctrl.recent_order_list.refresh_list(); } catch (e) {}
            }

            await resetToNewOrder(ctrl);
            frappe.show_alert({
                message: wmn_t("Invoice sent to cashier and printed.", "تم إرسال الفاتورة إلى الكاشير وطباعتها."),
                indicator: "green",
            });
            return true;
        } finally {
            ctrl.__wmn_handoff_in_flight = false;
        }
    }

    ns.Features.InvoiceHandoff.Common = {
        AWAITING_CASHIER,
        STAGE_FIELD,
        SENT_AT_FIELD,
        SENT_BY_FIELD,
        isOffline,
        isAwaitingCashier,
        canSendToCashier,
        markAwaitingCashier,
        prepareForCompletion,
        capturePaymentSnapshot,
        restorePaymentSnapshot,
        sendToCashier,
    };
})();
