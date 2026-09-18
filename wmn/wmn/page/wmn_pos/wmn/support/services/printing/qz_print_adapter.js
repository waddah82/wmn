/* QZ Tray adapter. Supports optional Managed Bundle and the existing connector flow. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

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
        if (window.qz) return Promise.resolve(window.qz);
        return Promise.reject(new Error("QZ connector is not embedded in this WMN POS page."));
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
                    "",
                    "",
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
        if (String(settings?.qz_destination || "printer") === "tcp") {
            const host = String(settings?.qz_tcp_host || "").trim();
            const port = Number(settings?.qz_tcp_port);
            if (!host) throw new Error("QZ TCP printer host is required.");
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error("QZ TCP printer port must be between 1 and 65535.");
            }
            return { qz, target: { host, port } };
        }
        let name = String(settings?.qz_printer_name || "").trim();
        if (!name) name = await qz.printers.getDefault();
        if (!name) throw new Error("No QZ printer is configured and no default printer was found.");
        return { qz, target: name };
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

    function rawToBase64(rawText) {
        const bytes = new TextEncoder().encode(String(rawText || ""));
        let binary = "";
        const chunk = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk));
        }
        return btoa(binary);
    }

    function isIBM864Encoding(value) {
        const name = String(value || "").trim().toLowerCase().replace(/[-_\s]/g, "");
        return name === "ibm864" || name === "cp864" || name === "864" || name === "csibm864";
    }

    function splitIBM864Raw(rawText) {
        const input = String(rawText || "");
        const chunks = [];
        let text = "";
        let afterCommandControl = false;

        const flushText = () => {
            if (!text) return;
            chunks.push(text);
            text = "";
        };

        for (let i = 0; i < input.length; i += 1) {
            const ch = input[i];
            const code = input.charCodeAt(i);

            // QZ applies IBM864 Arabic Bidi/shaping per RAW item. Keep LF/CR and
            // ESC/POS control bytes outside Arabic text. This preserves the byte
            // stream while preventing QZ from moving a line break across RTL text.
            if (code < 0x20 || code === 0x7f) {
                flushText();
                chunks.push(ch);
                afterCommandControl = code === 0x10 || code === 0x1b || code === 0x1c || code === 0x1d;
                continue;
            }

            // Command opcode/arguments are byte-oriented. If Arabic text follows a
            // command directly (for example ESC t n + Arabic), isolate the ASCII
            // command tail before letting QZ shape the Arabic text. Normal mixed
            // text such as "UOM: طبق" remains one text item.
            if (afterCommandControl && code > 0xff && text) {
                flushText();
                afterCommandControl = false;
            }

            text += ch;
            if (code > 0xff) afterCommandControl = false;
        }
        flushText();
        return chunks;
    }

    function rawDataItem(data, flavor) {
        return {
            type: "raw",
            format: "command",
            flavor,
            data: flavor === "base64" ? rawToBase64(data) : data,
        };
    }

    function rawDataItems(output, flavor, encoding) {
        if (flavor !== "plain" || !isIBM864Encoding(encoding)) {
            return [rawDataItem(output, flavor)];
        }

        return splitIBM864Raw(output).map((data) => rawDataItem(data, "plain"));
    }

    async function sendRaw(rawText, settings, context) {
        const { qz, target } = await resolvePrinter(settings);
        const config = qz.configs.create(target, configOptions(settings, context));
        const tcp = String(settings?.qz_destination || "printer") === "tcp";
        const flavor = String(settings?.qz_raw_flavor || "auto") === "auto"
            ? (tcp ? "base64" : "plain") : String(settings.qz_raw_flavor);
        if (!['plain', 'base64'].includes(flavor)) throw new Error("QZ RAW flavor must be plain or base64.");
        if (flavor === "base64" && !/^(utf-?8)?$/i.test(String(settings?.qz_encoding || "UTF8"))) {
            throw new Error("QZ base64 RAW sends UTF-8 bytes; select plain to use another text encoding.");
        }
        const codepage = String(settings?.escpos_codepage || "").trim();
        if (codepage && (!/^\d+$/.test(codepage) || Number(codepage) > 255)) {
            throw new Error("ESC/POS codepage must be a number between 0 and 255.");
        }
        let output = String(rawText || "");
        if (codepage) {
            const command = "\x1Bt" + String.fromCharCode(Number(codepage));
            output = output.startsWith("\x1b@") ? "\x1b@" + command + output.slice(2) : command + output;
        }
        const data = rawDataItems(output, flavor, settings?.qz_encoding);

        // QZ RAW bypasses EscPos.buildRawJob(), so apply the same receipt
        // lifecycle settings here. Keep feed/cut as independent RAW items so
        // IBM864 shaping cannot move them across Arabic text.
        const EscPos = ns.Services?.Printing?.EscPos;
        const feedLines = EscPos?.clampInt
            ? EscPos.clampInt(settings?.feed_lines, 0, 12, 3)
            : Math.max(0, Math.min(12, parseInt(settings?.feed_lines ?? 3, 10) || 0));
        const cutPaper = EscPos?.toBoolean
            ? EscPos.toBoolean(settings?.cut_paper, true)
            : !["0", "false", "no", "off"].includes(String(settings?.cut_paper ?? 1).trim().toLowerCase());

        if (feedLines > 0) {
            data.push(rawDataItem("\n".repeat(feedLines), flavor));
        }
        if (cutPaper) {
            data.push(rawDataItem("\x1d\x56\x00", flavor)); // GS V 0
        }

        await qz.print(config, data);
        return true;
    }

    async function sendPdf(base64, settings, context) {
        const { qz, target } = await resolvePrinter(settings);
        const config = qz.configs.create(target, configOptions(settings, context));
        const tcp = String(settings?.qz_destination || "printer") === "tcp";
        const data = [{
            type: tcp ? "raw" : "pixel",
            format: "pdf",
            flavor: "base64",
            data: String(base64 || ""),
            ...(tcp ? { options: { language: "ESCPOS" } } : {}),
        }];
        await qz.print(config, data);
        return true;
    }

    async function sendPng(base64, settings, context) {
        const { qz, target } = await resolvePrinter(settings);
        const config = qz.configs.create(target, configOptions(settings, context));
        const tcp = String(settings?.qz_destination || "printer") === "tcp";
        const data = [{
            type: tcp ? "raw" : "pixel",
            format: "image",
            flavor: "base64",
            data: String(base64 || ""),
            ...(tcp ? { options: { language: "ESCPOS" } } : {}),
        }];
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
