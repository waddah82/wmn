/* Transport adapters for payment devices. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.PaymentGateway = ns.Services.PaymentGateway || {};

    function bridge() {
        return window.WMNPaymentBridge || window.AndroidWMNPayment || window.wmnPaymentBridge || null;
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

    ns.Services.PaymentGateway.ProviderBase = Object.freeze({ invokeSdk, invokeWebSocket, invokeHttp });
})();
