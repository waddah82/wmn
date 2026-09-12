/* WMN Payment Gateway shared contracts and UI integration. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PaymentGateway = ns.Features.PaymentGateway || {};

    const STATUS = Object.freeze({
        PENDING: "Pending",
        APPROVED: "Approved",
        DECLINED: "Declined",
        ERROR: "Error",
        UNKNOWN: "Unknown",
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
        return `${base}-${String(modeOfPayment || "PAY").replace(/[^A-Za-z0-9_-]/g, "-")}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function ensureClientReference(doc, modeOfPayment, amount) {
        if (!doc) return makeClientReference(doc, modeOfPayment);
        const normalizedAmount = money(amount);
        doc.__wmn_gateway_request_refs = doc.__wmn_gateway_request_refs || {};
        const existing = doc.__wmn_gateway_request_refs[modeOfPayment] || null;
        if (existing && money(existing.amount) === normalizedAmount && existing.reference) {
            return existing.reference;
        }
        const reference = makeClientReference(doc, modeOfPayment);
        doc.__wmn_gateway_request_refs[modeOfPayment] = { reference, amount: normalizedAmount };
        return reference;
    }

    function paymentRow(doc, modeOfPayment) {
        return (doc?.payments || []).find((row) => String(row.mode_of_payment || "") === String(modeOfPayment || "")) || null;
    }

    function paymentAmount(doc, modeOfPayment) {
        return money(paymentRow(doc, modeOfPayment)?.amount || 0);
    }

    function erpnextOffline() {
        try {
            const connectivity = window.WMN_POS?.Services?.Connectivity;
            if (connectivity?.isERPNextOnline) return !connectivity.isERPNextOnline();
        } catch (e) {}
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || window.__wmn_pos_server_online === false;
    }

    // Backward-compatible name. In Payment Gateway code "offline" means only
    // ERPNext server unavailability, not local LAN/device availability.
    function effectiveOffline() {
        return erpnextOffline();
    }

    function transportRequiresERPNext(transport) {
        return String(transport || "") === TRANSPORT.CLOUD_SERVER;
    }

    function localTransport(transport) {
        return [
            TRANSPORT.SOFTPOS_SDK,
            TRANSPORT.ECR_WEBSOCKET,
            TRANSPORT.ECR_HTTP,
        ].includes(String(transport || ""));
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


    async function promptLocalBridgeToken(profile, rejected) {
        const Base = ns.Services.PaymentGateway.ProviderBase;
        if (!Base?.setLocalBridgeToken) throw new Error("Local payment bridge credential storage is unavailable");
        if (!window.frappe?.ui?.Dialog) {
            throw new Error("Enter the local payment bridge token on this POS device, then retry the electronic payment.");
        }

        return await new Promise((resolve, reject) => {
            let settled = false;
            const dialog = new frappe.ui.Dialog({
                title: rejected ? __("Local Payment Bridge Token Rejected") : __("Local Payment Bridge Token"),
                fields: [
                    {
                        fieldname: "token",
                        fieldtype: "Password",
                        label: __("Device Bridge Token"),
                        reqd: 1,
                        description: __("This credential is stored only on this POS device and is used only for direct communication with the payment device."),
                    },
                ],
                primary_action_label: __("Save and Continue"),
                primary_action: async (values) => {
                    try {
                        const token = String(values?.token || "").trim();
                        if (!token) return;
                        await Base.setLocalBridgeToken(profile, token);
                        settled = true;
                        dialog.hide();
                        resolve(token);
                    } catch (error) {
                        frappe.msgprint({ title: __("Electronic Payment"), indicator: "red", message: errorMessage(error) });
                    }
                },
            });
            dialog.$wrapper?.one?.("hidden.bs.modal", () => {
                if (settled) return;
                settled = true;
                reject(new Error("Local payment bridge credential entry was cancelled"));
            });
            dialog.show();
        });
    }

    async function authorizeWithLocalCredentialRetry(service, doc, modeOfPayment, mapping) {
        try {
            return await service.authorize(doc, modeOfPayment);
        } catch (error) {
            if (!["WMN_LOCAL_BRIDGE_TOKEN_REQUIRED", "WMN_LOCAL_BRIDGE_TOKEN_REJECTED"].includes(String(error?.code || ""))) {
                throw error;
            }
            await promptLocalBridgeToken(mapping?.gateway || {}, error.code === "WMN_LOCAL_BRIDGE_TOKEN_REJECTED");
            return await service.authorize(doc, modeOfPayment);
        }
    }

    function modeLabel($mode) {
        const explicit = $mode.attr("data-mode-of-payment") || $mode.data("mode-of-payment") || $mode.data("mode");
        if (explicit) return String(explicit).trim();
        const clone = $mode.clone();
        clone.find("input,button,.cash-shortcuts,.wmn-gateway-action,.wmn-gateway-note").remove();
        return String(clone.text() || "").replace(/\s+/g, " ").trim();
    }

    async function attachPaymentControls(payment) {
        const service = ns.Services.PaymentGateway.Service;
        const doc = payment?.events?.get_frm?.()?.doc;
        if (!service || !payment?.$payment_modes?.length || !doc) return;

        const mappings = await service.loadConfig(doc.pos_profile, false).catch((error) => {
            console.warn("WMN payment gateway configuration unavailable", error);
            return [];
        });
        if (!mappings.length) return;

        const paymentRows = Array.isArray(doc.payments) ? doc.payments : [];
        payment.$payment_modes.find(".mode-of-payment").each((index, el) => {
            const $mode = $(el);
            const rowMode = String(paymentRows[index]?.mode_of_payment || "").trim();
            const domMode = modeLabel($mode);
            const modeOfPayment = rowMode || domMode;
            const mapping = mappings.find((row) =>
                row.enabled && String(row.mode_of_payment || "").trim() === modeOfPayment
            );
            if (!mapping) return;

            $mode.find(".wmn-gateway-action,.wmn-gateway-note").remove();
            const availability = service.availabilityForMapping(mapping, "authorize");
            const amount = paymentAmount(doc, modeOfPayment);
            const approval = service.getApproval(doc, modeOfPayment);
            const approvedForCurrentAmount = !!(
                approval &&
                String(approval.status || "") === STATUS.APPROVED &&
                money(approval.amount) === amount
            );

            if (!availability.available) {
                $mode.append(
                    `<div class="small text-muted wmn-gateway-note">${__(availability.reason || "Electronic payment gateway is unavailable")}</div>`
                );
                return;
            }

            const label = approvedForCurrentAmount
                ? __("Approved")
                : __("Process Electronic Payment");
            const $button = $(`<button type="button" class="btn btn-xs btn-default wmn-gateway-action">${label}</button>`);
            $mode.append($button);
            if (approvedForCurrentAmount) {
                $button.prop("disabled", true);
                return;
            }

            $button.on("click.wmnGateway", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                $button.prop("disabled", true);
                try {
                    const result = await authorizeWithLocalCredentialRetry(service, doc, modeOfPayment, mapping);
                    frappe.show_alert({
                        message: `${__("Payment approved")}: ${result.reference_number || result.rrn || result.transaction_id || ""}`,
                        indicator: "green",
                    });
                    $button.text(__("Approved"));
                } catch (error) {
                    console.error("WMN electronic payment failed", error);
                    frappe.msgprint({
                        title: __("Electronic Payment"),
                        indicator: "red",
                        message: errorMessage(error),
                    });
                    $button.prop("disabled", false);
                }
            });
        });
    }

    ns.Features.PaymentGateway.Common = Object.freeze({
        STATUS,
        TRANSPORT,
        money,
        makeClientReference,
        ensureClientReference,
        paymentRow,
        paymentAmount,
        erpnextOffline,
        effectiveOffline,
        transportRequiresERPNext,
        localTransport,
        errorMessage,
        authorizeWithLocalCredentialRetry,
        attachPaymentControls,
    });
})();
