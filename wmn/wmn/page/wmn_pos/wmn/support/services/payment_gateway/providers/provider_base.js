/* Transport adapters for payment devices. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};

    function bridge() {
        return window.WMNPaymentBridge || window.AndroidWMNPayment || window.wmnPaymentBridge || null;
    }

    function hasSdkAction(action) {
        const b = bridge();
        return !!(b && typeof b[action] === "function");
    }

    async function invokeSdk(action, payload) {
        const b = bridge();
        if (!b || typeof b[action] !== "function") throw new Error(`Payment SDK bridge does not implement ${action}`);
        const result = await Promise.resolve(b[action](JSON.stringify(payload || {})));
        if (typeof result === "string") {
            try { return JSON.parse(result); } catch (e) { return { status: result }; }
        }
        return result || {};
    }

    async function invokeWebSocket(url, action, payload, timeoutMs) {
        if (!url) throw new Error("ECR WebSocket connector URL is not configured");
        return await new Promise((resolve, reject) => {
            let settled = false;
            const socket = new WebSocket(url);
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { socket.close(); } catch (e) {}
                reject(new Error("Payment terminal timeout"));
            }, Number(timeoutMs || 60000));
            socket.onerror = () => {
                if (settled) return;
                settled = true; clearTimeout(timer); reject(new Error("Could not connect to payment terminal"));
            };
            socket.onopen = () => socket.send(JSON.stringify({ action, ...payload }));
            socket.onmessage = (event) => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                try { socket.close(); } catch (e) {}
                try { resolve(JSON.parse(event.data)); } catch (e) { resolve({ status: String(event.data || "") }); }
            };
        });
    }

    async function invokeHttp(url, action, payload, timeoutMs) {
        if (!url) throw new Error("ECR HTTP connector URL is not configured");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Number(timeoutMs || 60000));
        try {
            const response = await fetch(`${String(url).replace(/\/$/, "")}/${encodeURIComponent(action)}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload || {}),
                signal: controller.signal,
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body?.message || `Payment connector HTTP ${response.status}`);
            return body;
        } finally { clearTimeout(timer); }
    }

    function localBridgeTokenKey(profile) {
        return `payment_gateway_local_bridge_token::${String(profile?.name || profile?.connector_url || "default").trim()}`;
    }

    async function getLocalBridgeToken(profile) {
        const storage = window.wmnPOSOffline;
        if (!storage?.getSetting) return "";
        const token = await storage.getSetting(localBridgeTokenKey(profile));
        return String(token || "").trim();
    }

    async function setLocalBridgeToken(profile, token) {
        const storage = window.wmnPOSOffline;
        if (!storage?.setSetting) throw new Error("WMN offline storage is unavailable for the local payment bridge credential");
        const value = String(token || "").trim();
        await storage.setSetting(localBridgeTokenKey(profile), value);
        return value;
    }

    function makeBridgeError(message, code) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function browserBlocksInsecureLan(url) {
        try {
            const target = new URL(String(url || ""), window.location?.href || undefined);
            if (window.location?.protocol !== "https:" || target.protocol !== "http:") return false;
            const host = String(target.hostname || "").toLowerCase();
            return !["localhost", "127.0.0.1", "::1"].includes(host);
        } catch (e) {
            return false;
        }
    }

    async function invokeAndroidAppBridge(url, action, payload, profile, timeoutMs) {
        const baseUrl = String(url || "").trim().replace(/\/$/, "");
        if (!baseUrl) throw new Error("Local Connector URL is required for Android App Bridge");
        if (browserBlocksInsecureLan(baseUrl)) {
            throw makeBridgeError(
                "The POS is running over HTTPS but the local payment bridge uses HTTP. Configure the bridge with HTTPS/WSS and browser CORS/private-network access so the browser can reach it directly.",
                "WMN_LOCAL_BRIDGE_MIXED_CONTENT"
            );
        }

        const token = await getLocalBridgeToken(profile);
        if (!token) {
            throw makeBridgeError(
                "A local payment bridge token is required on this POS device before Android App Bridge can communicate with the payment device.",
                "WMN_LOCAL_BRIDGE_TOKEN_REQUIRED"
            );
        }

        const endpointByAction = {
            authorize: "/v1/payments/purchase",
            refund: "/v1/payments/refund",
            void: "/v1/payments/reverse",
        };
        const endpoint = endpointByAction[String(action || "")];
        if (!endpoint) throw new Error(`Unsupported Android App Bridge action ${action || ""}`);

        const amountMinor = Math.round(Number(payload?.amount || 0) * 100);
        if (action === "authorize" && amountMinor <= 0) throw new Error("Electronic payment amount must be greater than zero");

        const bridgePayload = {
            request_id: payload?.client_reference || "",
            amount_minor: amountMinor,
            currency: payload?.currency || "SAR",
            invoice: payload?.sales_invoice || payload?.client_reference || "WMN-POS",
            provider: String(profile?.bridge_provider || "TEST").toUpperCase(),
            customer_reference_number: payload?.sales_invoice || payload?.client_reference || "",
        };
        if (["refund", "void"].includes(String(action || ""))) {
            bridgePayload.original_transaction_uuid = payload?.original_transaction_id || "";
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), Number(timeoutMs || profile?.timeout_ms || 60000));
        try {
            let response;
            try {
                response = await fetch(`${baseUrl}${endpoint}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-WMN-Bridge-Token": token,
                    },
                    body: JSON.stringify(bridgePayload),
                    signal: controller.signal,
                });
            } catch (error) {
                if (error?.name === "AbortError") throw new Error("WMN Payment Bridge timeout");
                throw makeBridgeError(
                    `Could not connect directly to the local payment bridge: ${error?.message || error}`,
                    "WMN_LOCAL_BRIDGE_CONNECTION_FAILED"
                );
            }

            const body = await response.json().catch(() => ({}));
            if ([401, 403].includes(Number(response.status))) {
                await setLocalBridgeToken(profile, "").catch(() => {});
                throw makeBridgeError(
                    body?.message || body?.error || "The local payment bridge token was rejected. Enter the device token again.",
                    "WMN_LOCAL_BRIDGE_TOKEN_REJECTED"
                );
            }
            if (!response.ok) {
                throw new Error(body?.message || body?.error || `WMN Payment Bridge HTTP ${response.status}`);
            }

            const result = (body && typeof body === "object") ? { ...body } : {};
            if (result.amount == null && result.amount_minor != null) {
                result.amount = Number(result.amount_minor || 0) / 100;
            }
            return result;
        } finally {
            clearTimeout(timer);
        }
    }

    ns.Services.PaymentGateway.ProviderBase = Object.freeze({
        hasSdkAction,
        invokeSdk,
        invokeWebSocket,
        invokeHttp,
        invokeAndroidAppBridge,
        getLocalBridgeToken,
        setLocalBridgeToken,
        localBridgeTokenKey,
    });
})();
