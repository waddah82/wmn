/* Payment Gateway orchestration service. ERPNext connectivity and local payment connectivity are independent. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    const Common = ns.Features.PaymentGateway.Common;

    let configCache = { profile: "", rows: [], loadedAt: 0 };
    const approvals = new Map();
    const authorizationFlights = new Map();

    function configSettingKey(profile) {
        return `payment_gateway_mappings::${String(profile || "").trim()}`;
    }

    async function readStoredConfig(profile) {
        try {
            const storage = window.wmnPOSOffline;
            if (!storage?.getSetting) return [];
            const rows = await storage.getSetting(configSettingKey(profile));
            if (Array.isArray(rows) && rows.length) return rows;
            const current = await storage.getSetting("payment_gateway_mappings");
            return Array.isArray(current) ? current : [];
        } catch (error) {
            console.warn("WMN payment gateway stored configuration read failed", error);
            return [];
        }
    }

    async function persistConfig(profile, rows) {
        try {
            const storage = window.wmnPOSOffline;
            if (!storage?.setSetting) return;
            const safeRows = Array.isArray(rows) ? rows : [];
            await storage.setSetting(configSettingKey(profile), safeRows);
            await storage.setSetting("payment_gateway_mappings", safeRows);
        } catch (error) {
            console.warn("WMN payment gateway configuration snapshot write failed", error);
        }
    }

    async function loadConfig(posProfile, force) {
        const profile = String(posProfile || window.cur_pos?.pos_profile || window.cur_pos?.settings?.pos_profile || "").trim();
        if (!profile) return [];
        if (!force && configCache.profile === profile && Date.now() - configCache.loadedAt < 60000) {
            return configCache.rows.slice();
        }

        if (!Common.erpnextOffline() && typeof frappe?.call === "function") {
            try {
                const response = await frappe.call({
                    method: "wmn.wmn.page.wmn_pos.wmn_pos.get_pos_payment_gateways",
                    args: { pos_profile: profile },
                    freeze: false,
                });
                const rows = Array.isArray(response?.message) ? response.message : [];
                configCache = { profile, rows, loadedAt: Date.now() };
                await persistConfig(profile, rows);
                return rows.slice();
            } catch (error) {
                // A server failure must not discard a previously downloaded local gateway mapping.
                console.warn("WMN payment gateway server configuration unavailable; using local snapshot", error);
            }
        }

        const storedRows = await readStoredConfig(profile);
        configCache = { profile, rows: storedRows, loadedAt: Date.now() };
        return storedRows.slice();
    }

    async function mappingForMode(posProfile, modeOfPayment) {
        const rows = await loadConfig(posProfile, false);
        return rows.find((row) => row.enabled && String(row.mode_of_payment || "") === String(modeOfPayment || "")) || null;
    }

    function approvalKey(doc, modeOfPayment) {
        return `${String(doc?.name || doc?.offline_pos_name || doc?.wmn_offline_sync_id || "")}|${String(modeOfPayment || "")}`;
    }

    function setApproval(doc, modeOfPayment, result) {
        const value = Object.assign({}, result || {});
        approvals.set(approvalKey(doc, modeOfPayment), value);
        doc.__wmn_gateway_authorizations = doc.__wmn_gateway_authorizations || {};
        doc.__wmn_gateway_authorizations[modeOfPayment] = value;
    }

    function getApproval(doc, modeOfPayment) {
        return doc?.__wmn_gateway_authorizations?.[modeOfPayment] || approvals.get(approvalKey(doc, modeOfPayment)) || null;
    }

    function providerFor(mapping) {
        return ns.Services.PaymentGateway.Providers?.[mapping?.gateway?.provider] || null;
    }

    function availabilityForMapping(mapping, action) {
        const profile = mapping?.gateway || {};
        const transport = String(profile.transport || "");
        if (!mapping?.enabled) return { available: false, local: false, reason: "Payment gateway is disabled" };
        if (!transport) return { available: false, local: false, reason: "Payment gateway transport is not configured" };

        if (transport === Common.TRANSPORT.STANDALONE) {
            return {
                available: false,
                local: true,
                reason: "Standalone terminals require manual reference; automatic authorization is unavailable",
            };
        }

        if (Common.transportRequiresERPNext(transport)) {
            return Common.erpnextOffline()
                ? { available: false, local: false, reason: "This electronic payment gateway requires the ERPNext server connection" }
                : { available: true, local: false, reason: "" };
        }

        const provider = providerFor(mapping);
        if (!provider) {
            return { available: false, local: true, reason: `Payment provider adapter not loaded: ${profile.provider || ""}` };
        }

        if (Common.erpnextOffline()) {
            const localSupported = typeof provider.canRunLocally === "function"
                ? !!provider.canRunLocally(action || "authorize", profile)
                : Common.localTransport(transport);
            if (!localSupported) {
                return {
                    available: false,
                    local: true,
                    reason: "This payment connector depends on ERPNext and cannot run through the local network while the server is offline",
                };
            }
        }

        return { available: true, local: true, reason: "" };
    }

    function approvedStatus(result) {
        const status = String(result?.status || result?.payment_status || "").trim().toLowerCase();
        return ["approved", "success", "succeeded", "authorized"].includes(status);
    }

    async function recordDeviceResultWhenServerAvailable(mapping, action, payload, result) {
        if (Common.erpnextOffline()) return false;
        try {
            await frappe.call({
                method: "wmn.wmn.page.wmn_pos.wmn_pos.record_device_result",
                args: {
                    gateway_profile: mapping?.gateway?.name || "",
                    action,
                    payload: JSON.stringify(payload || {}),
                    result: JSON.stringify(result || {}),
                },
                freeze: false,
            });
            return true;
        } catch (error) {
            // Device approval remains authoritative. The approved result is retained on
            // the invoice and is recorded server-side during offline invoice sync.
            console.warn("WMN payment device result will be recorded during invoice sync", error);
            return false;
        }
    }

    async function process(action, doc, modeOfPayment, mapping, amount, extra) {
        const profile = mapping?.gateway || {};
        const clientReference = Common.ensureClientReference(doc, modeOfPayment, amount);
        const payload = {
            client_reference: clientReference,
            mode_of_payment: modeOfPayment,
            amount: Common.money(amount),
            currency: doc?.currency || "SAR",
            pos_profile: doc?.pos_profile || window.cur_pos?.pos_profile || "",
            terminal_id: profile.terminal_id || "",
            merchant_id: profile.merchant_id || "",
            sales_invoice: doc?.name || doc?.wmn_offline_sync_id || "",
            ...extra,
        };
        if (payload.amount <= 0 && action === "authorize") {
            throw new Error("Electronic payment amount must be greater than zero");
        }

        const availability = availabilityForMapping(mapping, action);
        if (!availability.available) throw new Error(availability.reason || "Electronic payment gateway is unavailable");

        let result;
        const transport = String(profile.transport || "");
        if (transport === Common.TRANSPORT.CLOUD_SERVER) {
            const response = await frappe.call({
                method: `wmn.wmn.page.wmn_pos.wmn_pos.${action}`,
                args: { gateway_profile: profile.name, payload: JSON.stringify(payload) },
                freeze: false,
            });
            result = response?.message || {};
        } else if (transport === Common.TRANSPORT.STANDALONE) {
            throw new Error("Standalone terminals cannot be auto-authorized. Use a gateway profile with an ECR/SDK connector for automatic payment.");
        } else {
            const provider = providerFor(mapping);
            if (!provider) throw new Error(`Payment provider adapter not loaded: ${profile.provider}`);
            result = await provider.deviceAction(action, payload, profile);
            result = Object.assign({}, result || {}, { client_reference: clientReference });

            // Payment authorization is owned by the local device adapter. ERPNext logging
            // is best-effort metadata and must never delay or change the device result.
            if (!Common.erpnextOffline()) {
                Promise.resolve(recordDeviceResultWhenServerAvailable(mapping, action, payload, result))
                    .catch((error) => console.warn("WMN payment device result background recording skipped", error));
            } else {
                result.__wmn_server_record_pending = 1;
            }
        }

        return Object.assign({}, result || {}, { client_reference: clientReference });
    }

    async function authorizeOnce(doc, modeOfPayment) {
        const mapping = await mappingForMode(doc?.pos_profile, modeOfPayment);
        if (!mapping) throw new Error(`No payment gateway is mapped to ${modeOfPayment}`);
        const amount = Common.paymentAmount(doc, modeOfPayment);
        const existing = getApproval(doc, modeOfPayment);
        if (
            existing &&
            String(existing.status || "") === Common.STATUS.APPROVED &&
            Common.money(existing.amount) === Common.money(amount)
        ) {
            return existing;
        }

        let result = await process("authorize", doc, modeOfPayment, mapping, amount, {});

        if (result?.requires_client_action) {
            if (Common.erpnextOffline()) {
                throw new Error("This electronic payment requires a server-side client action and cannot continue while ERPNext is offline");
            }
            const provider = providerFor(mapping);
            if (!provider?.completeCloudAction) {
                throw new Error(`Payment provider ${mapping.gateway?.provider || ""} requires a client action adapter`);
            }
            const clientResult = await provider.completeCloudAction(result, mapping.gateway);
            const response = await frappe.call({
                method: "wmn.wmn.page.wmn_pos.wmn_pos.status",
                args: {
                    gateway_profile: mapping.gateway?.name,
                    payload: JSON.stringify({
                        client_reference: result.client_reference || Common.ensureClientReference(doc, modeOfPayment, amount),
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
            result = Object.assign({}, response?.message || {}, {
                client_reference: result.client_reference || Common.ensureClientReference(doc, modeOfPayment, amount),
            });
        }

        if (!approvedStatus(result)) {
            throw new Error(result.message || result.error || `Payment was not approved (${result.status || "unknown"})`);
        }

        const approval = {
            ...result,
            amount,
            status: Common.STATUS.APPROVED,
            gateway_profile: mapping.gateway?.name || "",
            provider: mapping.gateway?.provider || "",
            transport: mapping.gateway?.transport || "",
            mode_of_payment: modeOfPayment,
            currency: doc?.currency || "SAR",
            pos_profile: doc?.pos_profile || window.cur_pos?.pos_profile || "",
            terminal_id: mapping.gateway?.terminal_id || "",
            merchant_id: mapping.gateway?.merchant_id || "",
            authorized_at: new Date().toISOString(),
        };
        setApproval(doc, modeOfPayment, approval);
        return getApproval(doc, modeOfPayment);
    }

    async function authorize(doc, modeOfPayment) {
        const amount = Common.paymentAmount(doc, modeOfPayment);
        const key = `${approvalKey(doc, modeOfPayment)}|${Common.money(amount)}`;
        if (authorizationFlights.has(key)) return await authorizationFlights.get(key);
        const flight = authorizeOnce(doc, modeOfPayment);
        authorizationFlights.set(key, flight);
        try {
            return await flight;
        } finally {
            authorizationFlights.delete(key);
        }
    }

    async function validateBeforeSubmit(doc) {
        const rows = await loadConfig(doc?.pos_profile, false);
        for (const mapping of rows.filter((r) => r.enabled)) {
            const amount = Common.paymentAmount(doc, mapping.mode_of_payment);
            if (amount <= 0) continue;
            const approval = getApproval(doc, mapping.mode_of_payment);
            if (!approval || String(approval.status) !== Common.STATUS.APPROVED || Common.money(approval.amount) !== Common.money(amount)) {
                throw new Error(`Electronic payment ${mapping.mode_of_payment} must be approved for ${amount} before completing the order.`);
            }
        }
        return true;
    }

    async function refund(doc, modeOfPayment, amount, originalTransactionId) {
        const mapping = await mappingForMode(doc?.pos_profile, modeOfPayment);
        if (!mapping) throw new Error(`No payment gateway is mapped to ${modeOfPayment}`);
        if (!mapping.gateway?.allow_refund) throw new Error(`Refund is disabled for ${modeOfPayment}`);
        return await process("refund", doc, modeOfPayment, mapping, Math.abs(Common.money(amount)), {
            original_transaction_id: originalTransactionId || "",
        });
    }

    ns.Services.PaymentGateway.Service = Object.freeze({
        loadConfig,
        mappingForMode,
        availabilityForMapping,
        authorize,
        refund,
        validateBeforeSubmit,
        getApproval,
    });
})();
