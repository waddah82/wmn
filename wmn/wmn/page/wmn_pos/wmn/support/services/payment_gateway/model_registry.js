/* Payment device model-family registry. Business logic must not depend on hardware model names. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};

    const MODELS = Object.freeze({
        "GEIDEA_CLOUD": { provider: "Geidea", transport: "Cloud Server API", label: "Geidea Cloud / Gateway" },
        "GEIDEA_SOFTPOS": { provider: "Geidea", transport: "SoftPOS SDK", label: "Geidea Mobile POS / SoftPOS" },
        "GEIDEA_SMART_POS": { provider: "Geidea", transport: "ECR WebSocket Bridge", label: "Geidea Smart POS / ECR" },
        "GEIDEA_CARD_READER": { provider: "Geidea", transport: "ECR WebSocket Bridge", label: "Geidea Card Reader / ECR" },
        "STC_SOFTPOS_APP": { provider: "STC SoftPOS", transport: "Android App Bridge", label: "stc SoftPOS App" },
        "STC_SOFTPOS_SDK": { provider: "STC SoftPOS", transport: "SoftPOS SDK", label: "stc SoftPOS SDK" },
        "GENERIC_ANDROID_SDK": { provider: "Generic", transport: "SoftPOS SDK", label: "Generic Android Payment SDK" },
        "GENERIC_ANDROID_APP": { provider: "Generic", transport: "Android App Bridge", label: "Generic Android Payment App" },
        "GENERIC_ECR_WS": { provider: "Generic", transport: "ECR WebSocket Bridge", label: "Generic ECR WebSocket" },
        "GENERIC_ECR_HTTP": { provider: "Generic", transport: "ECR HTTP Bridge", label: "Generic ECR HTTP" },
        "GENERIC_CLOUD": { provider: "Generic", transport: "Cloud Server API", label: "Generic Cloud Payment API" },
        "STANDALONE_TERMINAL": { provider: "Generic", transport: "Standalone / Manual Reference", label: "Standalone Payment Terminal" },
        "TEST_APPROVED": { provider: "WMN Test Gateway", transport: "Cloud Server API", label: "WMN Test - Approved" },
        "TEST_DECLINED": { provider: "WMN Test Gateway", transport: "Cloud Server API", label: "WMN Test - Declined" },
        "TEST_TIMEOUT": { provider: "WMN Test Gateway", transport: "Cloud Server API", label: "WMN Test - Timeout" },
        "TEST_ERROR": { provider: "WMN Test Gateway", transport: "Cloud Server API", label: "WMN Test - Provider Error" },
    });

    function resolve(modelFamily, fallbackTransport) {
        const key = String(modelFamily || "").trim();
        return MODELS[key] || { provider: "Generic", transport: fallbackTransport || "Standalone / Manual Reference", label: key || "Payment Terminal" };
    }

    ns.Services.PaymentGateway.ModelRegistry = Object.freeze({ MODELS, resolve });
})();
