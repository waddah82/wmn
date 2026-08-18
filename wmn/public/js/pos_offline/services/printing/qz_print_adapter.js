/* QZ Tray adapter. Supports optional Managed Bundle and the existing connector flow. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    let managedLoadPromise = null;
    let legacyLoadPromise = null;

    const MODE_LABELS = {
        legacy: "Current / Legacy",
        managed: "Managed Bundle",
        auto: "Auto (Managed then Legacy)",
        custom: "Custom URL",
    };

    function connectorMode(value) {
        const text = String(value || "").trim();
        if (MODE_LABELS[text]) return text;
        const found = Object.entries(MODE_LABELS).find(([, label]) => label === text);
        return found ? found[0] : "legacy";
    }

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

    function requireManagedBundle() {
        if (window.WMN_QZ_CLIENT) return Promise.resolve(window.WMN_QZ_CLIENT);
        if (managedLoadPromise) return managedLoadPromise;

        managedLoadPromise = new Promise((resolve, reject) => {
            let settled = false;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeout);
                if (error) {
                    reject(error);
                    return;
                }
                if (!window.WMN_QZ_CLIENT) {
                    reject(new Error("WMN managed QZ bundle loaded without exposing WMN_QZ_CLIENT."));
                    return;
                }
                resolve(window.WMN_QZ_CLIENT);
            };
            const timeout = window.setTimeout(() => finish(new Error("Timed out loading the WMN managed QZ bundle.")), 15000);

            try {
                const result = frappe.require("wmn_qz.bundle.js", () => finish());
                if (result && typeof result.then === "function") {
                    result.then(() => finish()).catch((error) => finish(error));
                }
            } catch (error) {
                finish(error);
            }
        }).finally(() => {
            if (!window.WMN_QZ_CLIENT) managedLoadPromise = null;
        });

        return managedLoadPromise;
    }

    async function loadLegacy(settings, customOnly) {
        if (window.qz && !customOnly) return window.qz;
        if (legacyLoadPromise && !customOnly) return legacyLoadPromise;

        const runner = (async () => {
            const configured = String(settings?.qz_connector_url || "").trim();
            const candidates = customOnly
                ? [configured]
                : [
                    configured,
                    "/assets/wmn/js/vendor/qz-tray.js",
                    navigator.onLine ? "https://demo.qz.io/js/qz-tray.js" : "",
                ];
            const urls = [...new Set(candidates.filter(Boolean))];
            if (!urls.length) {
                throw new Error(customOnly
                    ? "QZ Connector URL is required in Custom URL mode."
                    : "QZ Tray connector (qz-tray.js) is not available.");
            }

            let lastError = null;
            for (const url of urls) {
                try {
                    await loadScript(url);
                    if (window.qz) return window.qz;
                } catch (error) {
                    lastError = error;
                }
            }
            throw lastError || new Error("QZ Tray connector (qz-tray.js) is not available.");
        })();

        if (customOnly) return runner;
        legacyLoadPromise = runner;
        try {
            return await legacyLoadPromise;
        } finally {
            if (!window.qz) legacyLoadPromise = null;
        }
    }

    async function ensureLibrary(settings) {
        const mode = connectorMode(settings?.qz_connector_mode);

        if (mode === "managed") {
            return requireManagedBundle();
        }
        if (mode === "custom") {
            return loadLegacy(settings, true);
        }
        if (mode === "auto") {
            try {
                return await requireManagedBundle();
            } catch (managedError) {
                console.warn("WMN managed QZ client unavailable; falling back to the current connector flow", managedError);
                return loadLegacy(settings, false);
            }
        }
        return loadLegacy(settings, false);
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
        connectorMode,
        ensureLibrary,
        connect,
        printers,
        sendRaw,
        sendPng,
        sendPdf,
    };
})();
