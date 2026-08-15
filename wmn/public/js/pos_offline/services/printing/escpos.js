/* Shared ESC/POS byte helpers for direct thermal printer adapters. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};

    function toBoolean(value, fallback) {
        if (value === undefined || value === null || value === "") return !!fallback;
        if (typeof value === "boolean") return value;
        if (typeof value === "number") return value !== 0;
        return !["0", "false", "no", "off"].includes(String(value).trim().toLowerCase());
    }

    function clampInt(value, min, max, fallback) {
        const number = parseInt(value, 10);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(min, Math.min(max, number));
    }

    function concatByteArrays(parts) {
        const arrays = (parts || []).filter(Boolean).map((part) => (
            part instanceof Uint8Array ? part : new Uint8Array(part)
        ));
        const total = arrays.reduce((sum, part) => sum + part.byteLength, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        arrays.forEach((part) => {
            output.set(part, offset);
            offset += part.byteLength;
        });
        return output;
    }

    function encodeText(text) {
        if (!window.TextEncoder) {
            throw new Error("TextEncoder is not supported by this browser.");
        }
        return new TextEncoder().encode(String(text || "").replace(/\r\n/g, "\n"));
    }

    function buildRawJob(rawText, options) {
        options = options || {};
        const parts = [];
        const initialize = toBoolean(options.escpos_initialize, true);
        const cutPaper = toBoolean(options.cut_paper, true);
        const feedLines = clampInt(options.feed_lines, 0, 12, 3);

        if (initialize) {
            parts.push(new Uint8Array([0x1b, 0x40])); // ESC @
        }

        parts.push(encodeText(rawText));

        if (feedLines > 0) {
            parts.push(new Uint8Array(Array(feedLines).fill(0x0a)));
        }

        if (cutPaper) {
            parts.push(new Uint8Array([0x1d, 0x56, 0x00])); // GS V 0
        }

        return concatByteArrays(parts);
    }

    function parseUsbId(value) {
        if (value === undefined || value === null || value === "") return null;
        const text = String(value).trim().toLowerCase();
        const radix = text.startsWith("0x") ? 16 : (/^[0-9a-f]+$/.test(text) && /[a-f]/.test(text) ? 16 : 10);
        const parsed = parseInt(text.replace(/^0x/, ""), radix);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatUsbId(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return "";
        return "0x" + number.toString(16).padStart(4, "0");
    }

    ns.Services.Printing.EscPos = {
        buildRawJob,
        concatByteArrays,
        parseUsbId,
        formatUsbId,
        toBoolean,
        clampInt,
    };
})();
