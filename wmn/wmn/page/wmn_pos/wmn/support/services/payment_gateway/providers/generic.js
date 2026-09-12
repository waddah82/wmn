/* Generic payment adapter. Payment-device transports are executed directly by the POS client. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    ns.Services.PaymentGateway.Providers = ns.Services.PaymentGateway.Providers || {};
    const Base = ns.Services.PaymentGateway.ProviderBase;

    function canRunLocally(action, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "SoftPOS SDK") return Base.hasSdkAction(action);
        if (transport === "Android App Bridge") return !!String(profile?.connector_url || "").trim();
        if (transport === "ECR WebSocket Bridge" || transport === "ECR HTTP Bridge") return !!String(profile?.connector_url || "").trim();
        return false;
    }

    async function deviceAction(action, payload, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "Android App Bridge") {
            return await Base.invokeAndroidAppBridge(profile.connector_url, action, payload, profile, profile.timeout_ms);
        }
        if (transport === "SoftPOS SDK") return await Base.invokeSdk(action, payload);
        if (transport === "ECR WebSocket Bridge") return await Base.invokeWebSocket(profile.connector_url, action, payload, profile.timeout_ms);
        if (transport === "ECR HTTP Bridge") return await Base.invokeHttp(profile.connector_url, action, payload, profile.timeout_ms);
        throw new Error(`Generic payment transport ${transport || "(empty)"} requires a configured connector`);
    }

    ns.Services.PaymentGateway.Providers.Generic = Object.freeze({ canRunLocally, deviceAction });
})();
