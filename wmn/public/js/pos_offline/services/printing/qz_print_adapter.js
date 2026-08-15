/* QZ Tray adapter. Supports raw ESC/POS and pixel PDF/PNG printing. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    let loadPromise = null;

    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-wmn-qz-src="${url}"]`);
            if (existing?.dataset.loaded === "1") return resolve(true);
            if (existing) {
                existing.addEventListener("load", () => resolve(true), { once: true });
                existing.addEventListener("error", () => reject(new Error("Unable to load QZ connector.")), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = url;
            script.async = true;
            script.dataset.wmnQzSrc = url;
            script.onload = () => { script.dataset.loaded = "1"; resolve(true); };
            script.onerror = () => reject(new Error("Unable to load QZ connector from " + url));
            document.head.appendChild(script);
        });
    }

    async function ensureLibrary(settings) {
        if (window.qz) return window.qz;
        if (loadPromise) return loadPromise;

        loadPromise = (async () => {
            const configured = String(settings?.qz_connector_url || "").trim();
            const candidates = [
                configured,
                "/assets/wmn/js/vendor/qz-tray.js",
                navigator.onLine ? "https://demo.qz.io/js/qz-tray.js" : "",
            ].filter(Boolean);

            let lastError = null;
            for (const url of [...new Set(candidates)]) {
                try {
                    await loadScript(url);
                    if (window.qz) return window.qz;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error("QZ Tray connector (qz-tray.js) is not available.");
        })();

        try {
            return await loadPromise;
        } finally {
            if (!window.qz) loadPromise = null;
        }
    }

    async function connect(settings) {
        const qz = await ensureLibrary(settings);
        if (qz.websocket.isActive()) return qz;
        const host = String(settings?.qz_host || "").trim();
        if (host) await qz.websocket.connect({ host });
        else await qz.websocket.connect();
        return qz;
    }

    async function printers(settings) {
        const qz = await connect(settings);
        const found = await qz.printers.find();
        return Array.isArray(found) ? found : (found ? [found] : []);
    }

    async function resolvePrinter(settings) {
        const qz = await connect(settings);
        let name = String(settings?.qz_printer_name || "").trim();
        if (!name) name = await qz.printers.getDefault();
        if (!name) throw new Error("No QZ printer is configured and no default printer was found.");
        return { qz, name };
    }

    function configOptions(settings, context) {
        const options = {
            copies: Math.max(1, parseInt(settings?.copies || "1", 10) || 1),
            jobName: String(context?.jobName || "WMN POS Receipt"),
        };
        const encoding = String(settings?.qz_encoding || "").trim();
        if (encoding) options.encoding = encoding;
        return options;
    }

    async function sendRaw(rawText, settings, context) {
        const { qz, name } = await resolvePrinter(settings);
        const config = qz.configs.create(name, configOptions(settings, context));
        const data = [{ type: "raw", format: "command", flavor: "plain", data: String(rawText || "") }];
        await qz.print(config, data);
        return true;
    }

    async function sendPdf(base64, settings, context) {
        const { qz, name } = await resolvePrinter(settings);
        const config = qz.configs.create(name, configOptions(settings, context));
        const data = [{ type: "pixel", format: "pdf", flavor: "base64", data: String(base64 || "") }];
        await qz.print(config, data);
        return true;
    }

    async function sendPng(base64, settings, context) {
        const { qz, name } = await resolvePrinter(settings);
        const config = qz.configs.create(name, configOptions(settings, context));
        const data = [{ type: "pixel", format: "image", flavor: "base64", data: String(base64 || "") }];
        await qz.print(config, data);
        return true;
    }

    ns.Services.Printing.Adapters.QZ = {
        id: "qz",
        label: "QZ Tray",
        capabilities: { raw: true, png: true, pdf: true, html: false },
        isSupported() { return true; },
        ensureLibrary,
        connect,
        printers,
        sendRaw,
        sendPng,
        sendPdf,
    };
})();
