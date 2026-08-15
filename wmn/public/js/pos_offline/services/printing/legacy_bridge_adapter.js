/* Adapter for the existing WMN WebSocket/Windows printing bridge. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    function getPrintType(context) {
        return (context && context.printType) || "RECEIPT";
    }

    function getUrl(settings) {
        return String(
            (settings && settings.bridge_ws_url) ||
            localStorage.getItem("whb_websocket_url") ||
            "ws://127.0.0.1:12212/printer"
        ).trim();
    }

    function submit(payload, settings, context) {
        if (typeof window.wmn_send_to_legacy_bridge !== "function") {
            throw new Error("WMN legacy printer bridge is not available.");
        }
        return window.wmn_send_to_legacy_bridge(payload, getPrintType(context), getUrl(settings));
    }

    ns.Services.Printing.Adapters.LegacyBridge = {
        id: "legacy_bridge",
        label: "WMN Windows Bridge",
        capabilities: { raw: true, png: true, pdf: true, html: false },
        isSupported() { return true; },
        sendRaw(rawText, settings, context) {
            const encoded = btoa(unescape(encodeURIComponent(String(rawText || ""))));
            return submit({ raw_content: encoded }, settings, context);
        },
        sendPng(base64, settings, context) {
            return submit({ url: "receipt.png", file_content: String(base64 || "") }, settings, context);
        },
        sendPdf(base64, settings, context) {
            return submit({ url: "receipt.pdf", file_content: String(base64 || "") }, settings, context);
        },
    };
})();
