/* Invoice barcode identity, receipt-based lookup key, and Code 128 rendering helpers. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Barcode = ns.Services.Barcode || {};

    const FIELDNAME = "wmn_invoice_uid";
    const RECEIPT_FIELDNAME = "wmn_receipt_no";
    const RECEIPT_OPENING_FIELDNAME = "wmn_receipt_opening_entry";
    const UID_PREFIX = "WMNINV-";
    const UID_RE = /^WMNINV-[0-9]{20}$/;
    const RECEIPT_BARCODE_RE = /^[0-9]{12}$/;
    const OPENING_NAME_RE = /^POS-OPE-([0-9]{4})-([0-9]{5})$/;

    const CODE128_PATTERNS = [
        "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
        "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
        "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
        "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
        "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
        "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
        "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
        "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
        "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
        "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
        "114131","311141","411131","211412","211214","211232","2331112"
    ];

    function randomDigits(length) {
        const size = Math.max(1, parseInt(length || "20", 10) || 20);
        if (window.crypto?.getRandomValues && typeof BigInt === "function") {
            const bytes = new Uint8Array(9);
            window.crypto.getRandomValues(bytes);
            let value = 0n;
            for (const byte of bytes) value = (value << 8n) | BigInt(byte);
            const modulo = 10n ** BigInt(size);
            return String(value % modulo).padStart(size, "0");
        }

        let digits = "";
        while (digits.length < size) {
            digits += String(Math.floor(Math.random() * 1000000000)).padStart(9, "0");
        }
        return digits.slice(0, size);
    }

    function generateUID() {
        return UID_PREFIX + randomDigits(20);
    }

    function normalizeUID(value) {
        return String(value || "").trim().toUpperCase();
    }

    function normalizeBarcode(value) {
        return String(value || "").trim().toUpperCase();
    }

    function normalizeReceiptNo(value) {
        const text = String(value || "").trim();
        if (!/^[0-9]+$/.test(text)) return "";
        const numeric = parseInt(text, 10);
        if (!Number.isFinite(numeric) || numeric < 0 || numeric > 99999) return "";
        return String(numeric).padStart(5, "0");
    }

    function isValidUID(value) {
        return UID_RE.test(normalizeUID(value));
    }

    function ensureInvoiceUID(doc) {
        if (!doc || typeof doc !== "object") return "";
        let uid = normalizeUID(doc[FIELDNAME]);
        if (!uid) {
            uid = generateUID();
            doc[FIELDNAME] = uid;
        } else if (!UID_RE.test(uid)) {
            throw new Error("Invalid WMN invoice UID");
        } else {
            doc[FIELDNAME] = uid;
        }
        return uid;
    }

    function openingBarcodeKey(openingName) {
        const match = OPENING_NAME_RE.exec(String(openingName || "").trim().toUpperCase());
        if (!match) return "";
        return match[1].slice(-2) + match[2];
    }

    function openingNameFromBarcodeKey(key) {
        const text = String(key || "").trim();
        if (!/^[0-9]{7}$/.test(text)) return "";
        return `POS-OPE-20${text.slice(0, 2)}-${text.slice(2)}`;
    }

    function buildReceiptBarcode(openingName, receiptNo) {
        const openingKey = openingBarcodeKey(openingName);
        const normalizedReceipt = normalizeReceiptNo(receiptNo);
        if (!openingKey || !normalizedReceipt) return "";
        return openingKey + normalizedReceipt;
    }

    function parseReceiptBarcode(value) {
        const barcode = normalizeBarcode(value);
        if (!RECEIPT_BARCODE_RE.test(barcode)) return null;
        const openingKey = barcode.slice(0, 7);
        const receiptNo = barcode.slice(7);
        const posOpeningEntry = openingNameFromBarcodeKey(openingKey);
        if (!posOpeningEntry) return null;
        return {
            type: "receipt",
            barcode,
            pos_opening_entry: posOpeningEntry,
            receipt_no: receiptNo,
        };
    }

    function parseLookup(value) {
        const normalized = normalizeBarcode(value);
        const receiptLookup = parseReceiptBarcode(normalized);
        if (receiptLookup) return receiptLookup;
        if (UID_RE.test(normalized)) {
            return { type: "uid", barcode: normalized, uid: normalized };
        }
        return null;
    }

    function receiptOpeningFromDoc(doc) {
        if (!doc || typeof doc !== "object") return "";
        return String(
            doc[RECEIPT_OPENING_FIELDNAME] ||
            doc.pos_opening_entry ||
            doc.pos_opening ||
            doc.opening_entry ||
            ""
        ).trim();
    }

    function payloadFromUID(uid) {
        uid = normalizeUID(uid);
        return UID_RE.test(uid) ? uid : "";
    }

    function payloadFromDoc(doc) {
        doc = doc || {};
        const receiptPayload = buildReceiptBarcode(
            receiptOpeningFromDoc(doc),
            doc[RECEIPT_FIELDNAME] || doc.__wmn_receipt_no
        );
        if (receiptPayload) return receiptPayload;

        // Backward compatibility for invoices created before receipt-opening binding.
        const uid = normalizeUID(doc[FIELDNAME]);
        return UID_RE.test(uid) ? payloadFromUID(uid) : "";
    }

    function isInvoiceBarcode(value) {
        return !!parseLookup(value);
    }

    function extractUID(value) {
        const lookup = parseLookup(value);
        return lookup?.type === "uid" ? lookup.uid : "";
    }

    function encodeCode128(value) {
        value = String(value || "");
        if (!value) throw new Error("Invoice barcode value is empty");

        let codes;
        if (/^\d+$/.test(value) && value.length % 2 === 0) {
            codes = [105];
            for (let i = 0; i < value.length; i += 2) {
                codes.push(parseInt(value.slice(i, i + 2), 10));
            }
        } else {
            codes = [104];
            for (let i = 0; i < value.length; i += 1) {
                const code = value.charCodeAt(i);
                if (code < 32 || code > 127) {
                    throw new Error("Invoice barcode contains unsupported Code 128 characters");
                }
                codes.push(code - 32);
            }
        }

        let checksum = codes[0];
        for (let i = 1; i < codes.length; i += 1) checksum += codes[i] * i;
        codes.push(checksum % 103);
        codes.push(106);
        return codes;
    }

    function escapeHtml(value) {
        if (window.frappe?.utils?.escape_html) return frappe.utils.escape_html(String(value || ""));
        return String(value || "").replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        }[char]));
    }

    function buildSvg(value, options) {
        options = options || {};
        const codes = encodeCode128(value);
        const quiet = Math.max(8, parseInt(options.quiet_modules || "10", 10) || 10);
        const moduleWidth = Math.max(1, parseFloat(options.module_width || 1));
        const height = Math.max(28, parseInt(options.height || "56", 10) || 56);

        let modules = quiet * 2;
        codes.forEach((code) => {
            const pattern = CODE128_PATTERNS[code];
            for (const digit of pattern) modules += parseInt(digit, 10);
        });

        let x = quiet;
        const bars = [];
        codes.forEach((code) => {
            const pattern = CODE128_PATTERNS[code];
            for (let i = 0; i < pattern.length; i += 1) {
                const width = parseInt(pattern[i], 10);
                if (i % 2 === 0) {
                    bars.push(`<rect x="${x * moduleWidth}" y="0" width="${width * moduleWidth}" height="${height}"/>`);
                }
                x += width;
            }
        });

        const viewWidth = modules * moduleWidth;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${height}" width="${viewWidth}" height="${height}" style="max-width:100%;height:${height}px" preserveAspectRatio="xMidYMid meet" aria-label="${escapeHtml(value)}"><g fill="#000">${bars.join("")}</g></svg>`;
    }

    function getPrintConfig() {
        return ns.Services?.Printing?.PrintService?.getConfig?.() || {};
    }

    function isPrintEnabled(config) {
        config = config || getPrintConfig();
        return cint(config.show_invoice_barcode === undefined ? 1 : config.show_invoice_barcode) === 1;
    }

    function buildHtmlBlock(doc, config) {
        config = config || getPrintConfig();
        if (!isPrintEnabled(config)) return "";
        const payload = payloadFromDoc(doc);
        if (!payload) return "";

        const height = Math.max(28, parseInt(config.invoice_barcode_height || "56", 10) || 56);
        const human = cint(config.invoice_barcode_human_readable === undefined ? 1 : config.invoice_barcode_human_readable) === 1;
        const svg = buildSvg(payload, { height });
        const label = human
            ? `<div style="font:600 9px/1.2 monospace;letter-spacing:.15px;margin-top:3px;word-break:break-all">${escapeHtml(payload)}</div>`
            : "";

        return `<div class="wmn-invoice-barcode" style="margin:10px auto 4px;text-align:center;max-width:360px;direction:ltr">${svg}${label}</div>`;
    }

    function injectIntoHtml(html, doc, config) {
        html = String(html || "");
        const block = buildHtmlBlock(doc, config);
        if (!block || html.includes("wmn-invoice-barcode")) return html;

        if (/<\/body\s*>/i.test(html)) return html.replace(/<\/body\s*>/i, block + "</body>");
        return html + block;
    }

    function decoratePdfDefinition(definition, doc, config) {
        config = config || getPrintConfig();
        if (!definition || !isPrintEnabled(config)) return definition;
        const payload = payloadFromDoc(doc);
        if (!payload) return definition;

        const height = Math.max(28, parseInt(config.invoice_barcode_height || "56", 10) || 56);
        const human = cint(config.invoice_barcode_human_readable === undefined ? 1 : config.invoice_barcode_human_readable) === 1;
        const block = {
            stack: [
                { svg: buildSvg(payload, { height }), fit: [260, height], alignment: "center", margin: [0, 8, 0, 0] },
            ],
        };
        if (human) {
            block.stack.push({ text: payload, alignment: "center", fontSize: 7, margin: [0, 2, 0, 0] });
        }

        if (Array.isArray(definition.content)) definition.content.push(block);
        else if (definition.content) definition.content = [definition.content, block];
        else definition.content = [block];
        return definition;
    }

    function escPosBarcode(value, config) {
        config = config || getPrintConfig();
        const height = Math.max(24, Math.min(255, parseInt(config.invoice_barcode_height || "56", 10) || 56));
        const width = Math.max(2, Math.min(6, parseInt(config.invoice_barcode_module_width || "2", 10) || 2));
        const human = cint(config.invoice_barcode_human_readable === undefined ? 1 : config.invoice_barcode_human_readable) === 1;
        const barcodeValue = String(value || "");
        let data;
        if (/^\d+$/.test(barcodeValue) && barcodeValue.length % 2 === 0) {
            const pairs = [];
            for (let i = 0; i < barcodeValue.length; i += 2) {
                pairs.push(String.fromCharCode(parseInt(barcodeValue.slice(i, i + 2), 10)));
            }
            data = "{C" + pairs.join("");
        } else {
            data = "{B" + barcodeValue;
        }
        if (data.length > 255) throw new Error("Invoice barcode is too long for ESC/POS Code 128");

        const ESC = String.fromCharCode(0x1b);
        const GS = String.fromCharCode(0x1d);
        return [
            "\n",
            ESC + "a" + String.fromCharCode(1),
            GS + "w" + String.fromCharCode(width),
            GS + "h" + String.fromCharCode(height),
            GS + "H" + String.fromCharCode(human ? 2 : 0),
            GS + "k" + String.fromCharCode(73) + String.fromCharCode(data.length) + data,
            "\n",
            ESC + "a" + String.fromCharCode(0),
        ].join("");
    }

    function decorateRawText(rawText, doc, config) {
        config = config || getPrintConfig();
        if (!isPrintEnabled(config)) return String(rawText || "");
        const payload = payloadFromDoc(doc);
        if (!payload) return String(rawText || "");
        return String(rawText || "") + escPosBarcode(payload, config);
    }

    function browserRawHtml(rawText, doc, config) {
        const escaped = escapeHtml(rawText).replace(/\n/g, "<br>");
        return `<div style="font-family:monospace;white-space:pre-wrap;padding:4mm">${escaped}</div>${buildHtmlBlock(doc, config)}`;
    }

    ns.Services.Barcode.InvoiceBarcode = {
        FIELDNAME,
        RECEIPT_FIELDNAME,
        RECEIPT_OPENING_FIELDNAME,
        UID_PREFIX,
        generateUID,
        normalizeUID,
        normalizeBarcode,
        normalizeReceiptNo,
        isValidUID,
        ensureInvoiceUID,
        openingBarcodeKey,
        openingNameFromBarcodeKey,
        buildReceiptBarcode,
        parseReceiptBarcode,
        parseLookup,
        receiptOpeningFromDoc,
        payloadFromUID,
        payloadFromDoc,
        isInvoiceBarcode,
        extractUID,
        buildSvg,
        buildHtmlBlock,
        injectIntoHtml,
        decoratePdfDefinition,
        decorateRawText,
        browserRawHtml,
        isPrintEnabled,
    };
})();
