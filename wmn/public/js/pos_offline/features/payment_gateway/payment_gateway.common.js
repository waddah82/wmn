/* WMN Payment Gateway common contracts. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PaymentGateway = ns.Features.PaymentGateway || {};

    const STATUS = Object.freeze({
        PENDING: "Pending",
        APPROVED: "Approved",
        DECLINED: "Declined",
        ERROR: "Error",
        CANCELLED: "Cancelled",
        REFUNDED: "Refunded",
        VOIDED: "Voided",
    });

    const TRANSPORT = Object.freeze({
        CLOUD_SERVER: "Cloud Server API",
        SOFTPOS_SDK: "SoftPOS SDK",
        ANDROID_APP: "Android App Bridge",
        ECR_WEBSOCKET: "ECR WebSocket Bridge",
        ECR_HTTP: "ECR HTTP Bridge",
        STANDALONE: "Standalone / Manual Reference",
    });

    function money(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : 0;
    }

    function makeClientReference(doc, modeOfPayment) {
        const base = String(doc?.name || doc?.offline_pos_name || doc?.receipt_number || "POS").replace(/[^A-Za-z0-9_-]/g, "-");
        return `${base}-${String(modeOfPayment || "PAY").replace(/[^A-Za-z0-9_-]/g, "-")}-${Date.now()}`;
    }

    function paymentRow(doc, modeOfPayment) {
        return (doc?.payments || []).find((row) => String(row.mode_of_payment || "") === String(modeOfPayment || "")) || null;
    }

    function paymentAmount(doc, modeOfPayment) {
        return money(paymentRow(doc, modeOfPayment)?.amount || 0);
    }

    function effectiveOffline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function errorMessage(error) {
        if (error == null) return __("Electronic payment failed.");
        if (typeof error === "string") return error;

        const direct = [error.message, error.exception, error.exc, error.error];
        for (const value of direct) {
            if (typeof value === "string" && value.trim()) return value.trim();
        }

        const response = error.responseJSON || error.response || null;
        if (response) {
            const responseValues = [response.message, response.exception, response.exc, response.error];
            for (const value of responseValues) {
                if (typeof value === "string" && value.trim()) return value.trim();
            }
        }

        try {
            const text = JSON.stringify(error);
            if (text && text !== "{}") return text;
        } catch (e) {}
        return String(error);
    }

    ns.Features.PaymentGateway.Common = Object.freeze({
        STATUS,
        TRANSPORT,
        money,
        makeClientReference,
        paymentRow,
        paymentAmount,
        effectiveOffline,
        errorMessage,
    });
})();
