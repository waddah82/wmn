/* Payment Gateway orchestration service. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    const Common = ns.Features.PaymentGateway.Common;

    let configCache = { profile: "", rows: [], loadedAt: 0 };
    const approvals = new Map();

    async function loadConfig(posProfile, force) {
        const profile = String(posProfile || window.cur_pos?.pos_profile || window.cur_pos?.settings?.pos_profile || "").trim();
        if (!profile) return [];
        if (!force && configCache.profile === profile && Date.now() - configCache.loadedAt < 60000) return configCache.rows.slice();
        const response = await frappe.call({ method: "wmn.payment_gateway.api.get_pos_payment_gateways", args: { pos_profile: profile }, freeze: false });
        configCache = { profile, rows: Array.isArray(response?.message) ? response.message : [], loadedAt: Date.now() };
        return configCache.rows.slice();
    }

    async function mappingForMode(posProfile, modeOfPayment) {
        const rows = await loadConfig(posProfile, false);
        return rows.find((row) => row.enabled && String(row.mode_of_payment || "") === String(modeOfPayment || "")) || null;
    }

    function approvalKey(doc, modeOfPayment) {
        return `${String(doc?.name || doc?.offline_pos_name || "")}|${String(modeOfPayment || "")}`;
    }

    function setApproval(doc, modeOfPayment, result) {
        approvals.set(approvalKey(doc, modeOfPayment), Object.assign({}, result || {}));
        doc.__wmn_gateway_authorizations = doc.__wmn_gateway_authorizations || {};
        doc.__wmn_gateway_authorizations[modeOfPayment] = Object.assign({}, result || {});
    }

    function getApproval(doc, modeOfPayment) {
        return doc?.__wmn_gateway_authorizations?.[modeOfPayment] || approvals.get(approvalKey(doc, modeOfPayment)) || null;
    }

    async function process(action, doc, modeOfPayment, mapping, amount, extra) {
        const profile = mapping?.gateway || {};
        const payload = {
            client_reference: Common.makeClientReference(doc, modeOfPayment),
            mode_of_payment: modeOfPayment,
            amount: Common.money(amount),
            currency: doc?.currency || "SAR",
            pos_profile: doc?.pos_profile || window.cur_pos?.pos_profile || "",
            terminal_id: profile.terminal_id || "",
            merchant_id: profile.merchant_id || "",
            sales_invoice: doc?.name || "",
            ...extra,
        };
        if (payload.amount <= 0 && action === "authorize") throw new Error("Electronic payment amount must be greater than zero");

        let result;
        const transport = String(profile.transport || "");
        if (transport === "Cloud Server API") {
            const response = await frappe.call({
                method: `wmn.payment_gateway.api.${action}`,
                args: { gateway_profile: profile.name, payload: JSON.stringify(payload) },
                freeze: false,
            });
            result = response?.message || {};
        } else if (transport === "Standalone / Manual Reference") {
            throw new Error("Standalone terminals cannot be auto-authorized. Use a gateway profile with an ECR/SDK connector for automatic payment.");
        } else {
            const provider = ns.Services.PaymentGateway.Providers?.[profile.provider];
            if (!provider) throw new Error(`Payment provider adapter not loaded: ${profile.provider}`);
            result = await provider.deviceAction(action, payload, profile);
            await frappe.call({
                method: "wmn.payment_gateway.api.record_device_result",
                args: { gateway_profile: profile.name, action, payload: JSON.stringify(payload), result: JSON.stringify(result || {}) },
                freeze: false,
            });
        }
        return result || {};
    }

    async function authorize(doc, modeOfPayment) {
        if (Common.effectiveOffline()) throw new Error("Electronic payment authorization requires an online/provider connection unless the certified provider SDK explicitly supports offline authorization.");
        const mapping = await mappingForMode(doc?.pos_profile, modeOfPayment);
        if (!mapping) throw new Error(`No payment gateway is mapped to ${modeOfPayment}`);
        const amount = Common.paymentAmount(doc, modeOfPayment);
        let result = await process("authorize", doc, modeOfPayment, mapping, amount, {});

        if (result?.requires_client_action) {
            const provider = ns.Services.PaymentGateway.Providers?.[mapping.gateway?.provider];
            if (!provider?.completeCloudAction) {
                throw new Error(`Payment provider ${mapping.gateway?.provider || ""} requires a client action adapter`);
            }
            const clientResult = await provider.completeCloudAction(result, mapping.gateway);
            const response = await frappe.call({
                method: "wmn.payment_gateway.api.status",
                args: {
                    gateway_profile: mapping.gateway?.name,
                    payload: JSON.stringify({
                        client_reference: Common.makeClientReference(doc, modeOfPayment),
                        mode_of_payment: modeOfPayment,
                        amount,
                        currency: doc?.currency || "SAR",
                        pos_profile: doc?.pos_profile || window.cur_pos?.pos_profile || "",
                        sales_invoice: doc?.name || "",
                        order_id: clientResult?.orderId || clientResult?.order_id || "",
                        merchant_reference_id: result?.merchant_reference_id || "",
                    }),
                },
                freeze: false,
            });
            result = response?.message || {};
        }

        const status = String(result.status || result.payment_status || "").toLowerCase();
        if (!['approved','success','succeeded','authorized'].includes(status)) {
            throw new Error(result.message || result.error || `Payment was not approved (${result.status || "unknown"})`);
        }
        setApproval(doc, modeOfPayment, { ...result, amount, status: "Approved", gateway_profile: mapping.gateway?.name });
        return getApproval(doc, modeOfPayment);
    }

    async function validateBeforeSubmit(doc) {
        const rows = await loadConfig(doc?.pos_profile, false);
        for (const mapping of rows.filter((r) => r.enabled)) {
            const amount = Common.paymentAmount(doc, mapping.mode_of_payment);
            if (amount <= 0) continue;
            const approval = getApproval(doc, mapping.mode_of_payment);
            if (!approval || String(approval.status) !== "Approved" || Common.money(approval.amount) !== Common.money(amount)) {
                throw new Error(`Electronic payment ${mapping.mode_of_payment} must be approved for ${amount} before completing the order.`);
            }
        }
        return true;
    }

    async function refund(doc, modeOfPayment, amount, originalTransactionId) {
        const mapping = await mappingForMode(doc?.pos_profile, modeOfPayment);
        if (!mapping) throw new Error(`No payment gateway is mapped to ${modeOfPayment}`);
        return await process("refund", doc, modeOfPayment, mapping, Math.abs(Common.money(amount)), { original_transaction_id: originalTransactionId || "" });
    }

    ns.Services.PaymentGateway.Service = Object.freeze({ loadConfig, mappingForMode, authorize, refund, validateBeforeSubmit, getApproval });
})();
