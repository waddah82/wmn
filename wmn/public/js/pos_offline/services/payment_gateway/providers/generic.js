/* Generic payment adapter. Provider-specific local bridge details stay behind the backend connector contract. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    ns.Services.PaymentGateway.Providers = ns.Services.PaymentGateway.Providers || {};
    const Base = ns.Services.PaymentGateway.ProviderBase;

    async function backendBridgeAction(action, payload, profile) {
        const response = await frappe.call({
            method: "wmn.payment_gateway.api.bridge_action",
            args: {
                gateway_profile: profile?.name || "",
                action,
                payload: JSON.stringify(payload || {}),
            },
            freeze: false,
        });
        return response?.message || {};
    }

    async function deviceAction(action, payload, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "Android App Bridge") return await backendBridgeAction(action, payload, profile);
        if (transport === "SoftPOS SDK") return await Base.invokeSdk(action, payload);
        if (transport === "ECR WebSocket Bridge") return await Base.invokeWebSocket(profile.connector_url, action, payload, profile.timeout_ms);
        if (transport === "ECR HTTP Bridge") return await Base.invokeHttp(profile.connector_url, action, payload, profile.timeout_ms);
        throw new Error(`Generic payment transport ${transport || "(empty)"} requires a configured connector`);
    }

    ns.Services.PaymentGateway.Providers.Generic = Object.freeze({ deviceAction });
})();
