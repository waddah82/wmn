/* WMN Barcode Printer numeric range owner. */
(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) {
        root.WMN_RETAIL_TOOLS = root.WMN_RETAIL_TOOLS || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting = root.WMN_RETAIL_TOOLS.BarcodePrinting || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting.Range = api;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const LIMITS = Object.freeze({ sheet: 1000, one_per_page: 100 });

    function limitForMode(mode) {
        return String(mode || "sheet") === "one_per_page" ? LIMITS.one_per_page : LIMITS.sheet;
    }

    function normalizeNumeric(value, label) {
        const text = String(value ?? "").trim();
        if (!/^\d+$/.test(text)) throw new Error(`${label || "Barcode"} must contain numbers only.`);
        return text;
    }

    function validateCount(count, mode, copies = 1) {
        const qty = Math.max(1, Number(copies || 1));
        const total = Number(count) * qty;
        const limit = limitForMode(mode);
        if (!Number.isFinite(total) || total < 1) throw new Error("Barcode range is empty.");
        if (total > limit) throw new Error(`Barcode range exceeds the ${limit} label limit for this print mode.`);
        return total;
    }

    function expandRange(fromValue, toValue, options = {}) {
        const fromText = normalizeNumeric(fromValue, "Range start");
        const toText = normalizeNumeric(toValue, "Range end");
        const start = BigInt(fromText);
        const end = BigInt(toText);
        if (end < start) throw new Error("Range end must be greater than or equal to range start.");

        const countBig = end - start + 1n;
        const limit = limitForMode(options.mode);
        const copies = Math.max(1, Number(options.copies || 1));
        if (countBig > BigInt(limit) || countBig * BigInt(copies) > BigInt(limit)) {
            throw new Error(`Barcode range exceeds the ${limit} label limit for this print mode.`);
        }

        const fromCanonical = start.toString();
        const toCanonical = end.toString();
        const fromPaddedWidth = fromText.length > fromCanonical.length ? fromText.length : 0;
        const toPaddedWidth = toText.length > toCanonical.length ? toText.length : 0;
        const width = Math.max(fromPaddedWidth, toPaddedWidth);
        const values = [];
        for (let current = start; current <= end; current += 1n) {
            const value = current.toString();
            values.push(width ? value.padStart(width, "0") : value);
        }
        validateCount(values.length, options.mode, copies);
        return values;
    }

    return { LIMITS, limitForMode, validateCount, expandRange };
});
