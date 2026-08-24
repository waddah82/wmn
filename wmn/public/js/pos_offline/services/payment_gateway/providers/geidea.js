/* Geidea payment adapter. HPP owns card entry; WMN only handles session/result state. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};
    ns.Services.PaymentGateway.Providers = ns.Services.PaymentGateway.Providers || {};
    const Base = ns.Services.PaymentGateway.ProviderBase;

    let hppLoadPromise = null;

    function loadCheckoutSdk(url) {
        if (window.GeideaCheckout) return Promise.resolve();
        if (hppLoadPromise) return hppLoadPromise;
        const src = String(url || "https://www.ksamerchant.geidea.net/hpp/geideaCheckout.min.js");
        hppLoadPromise = new Promise((resolve, reject) => {
            const existing = Array.from(document.scripts || []).find((script) => script.src === src);
            if (existing) {
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error("Could not load Geidea Checkout SDK")), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.defer = false;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Could not load Geidea Checkout SDK"));
            document.head.appendChild(script);
        });
        return hppLoadPromise;
    }

    async function completeCloudAction(result) {
        if (String(result?.client_action || "") !== "GeideaCheckout") return result;
        const sessionId = String(result?.session_id || "").trim();
        if (!sessionId) throw new Error("Geidea checkout session ID is missing");

        await loadCheckoutSdk(result.sdk_url);
        if (!window.GeideaCheckout) throw new Error("Geidea Checkout SDK is unavailable");

        return await new Promise((resolve, reject) => {
            const onSuccess = (data) => resolve({ status: "CheckoutSuccess", ...(data || {}) });
            const onError = (data) => reject(new Error(
                data?.detailedResponseMessage || data?.responseMessage || data?.message || "Geidea payment failed"
            ));
            const onCancel = () => reject(new Error("Geidea payment was cancelled"));

            try {
                const checkout = new window.GeideaCheckout(onSuccess, onError, onCancel);
                checkout.startPayment(sessionId);
            } catch (error) {
                reject(error);
            }
        });
    }

    async function deviceAction(action, payload, profile) {
        const transport = String(profile?.transport || "");
        if (transport === "SoftPOS SDK" || transport === "Android App Bridge") return Base.invokeSdk(action, payload);
        if (transport === "ECR WebSocket Bridge") return Base.invokeWebSocket(profile.connector_url, action, payload, profile.timeout_ms);
        if (transport === "ECR HTTP Bridge") return Base.invokeHttp(profile.connector_url, action, payload, profile.timeout_ms);
        throw new Error(`Geidea device transport ${transport || "(empty)"} requires server processing or vendor connector`);
    }

    ns.Services.PaymentGateway.Providers["Geidea"] = Object.freeze({ deviceAction, completeCloudAction });
})();
