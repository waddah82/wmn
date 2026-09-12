/* STC SoftPOS payment adapter. Model-specific SDK/protocol details stay behind transport contracts. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    ns.Services.PaymentGateway.Providers = ns.Services.PaymentGateway.Providers || {};
    const Base = ns.Services.PaymentGateway.ProviderBase;

    function canRunLocally(action, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "SoftPOS SDK" || transport === "Android App Bridge") return Base.hasSdkAction(action);
        if (transport === "ECR WebSocket Bridge" || transport === "ECR HTTP Bridge") return !!String(profile?.connector_url || "").trim();
        return false;
    }

    async function deviceAction(action, payload, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "SoftPOS SDK" || transport === "Android App Bridge") return Base.invokeSdk(action, payload);
        if (transport === "ECR WebSocket Bridge") return Base.invokeWebSocket(profile.connector_url, action, payload, profile.timeout_ms);
        if (transport === "ECR HTTP Bridge") return Base.invokeHttp(profile.connector_url, action, payload, profile.timeout_ms);
        throw new Error(`STC SoftPOS device transport ${transport || "(empty)"} requires server processing or vendor connector`);
    }

    ns.Services.PaymentGateway.Providers["STC SoftPOS"] = Object.freeze({ canRunLocally, deviceAction });
})();
