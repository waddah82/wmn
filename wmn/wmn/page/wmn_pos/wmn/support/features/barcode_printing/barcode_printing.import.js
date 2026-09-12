/* WMN Barcode Printer pasted-list owner. */
(function (root, factory) {
    "use strict";
    const api = factory(root);
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) {
        root.WMN_RETAIL_TOOLS = root.WMN_RETAIL_TOOLS || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting = root.WMN_RETAIL_TOOLS.BarcodePrinting || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting.Import = api;
    }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
    "use strict";

    function fallbackLimit(mode) {
        return String(mode || "sheet") === "one_per_page" ? 100 : 1000;
    }

    function limitForMode(mode) {
        return root?.WMN_RETAIL_TOOLS?.BarcodePrinting?.Range?.limitForMode?.(mode) || fallbackLimit(mode);
    }

    function parseBarcodeText(text) {
        const tokens = String(text ?? "").split(/[\r\n,،]/);
        const values = [];
        const seen = new Set();
        let duplicates = 0;
        let empty = 0;

        for (const token of tokens) {
            const value = String(token || "").trim();
            if (!value) {
                empty += 1;
                continue;
            }
            if (seen.has(value)) {
                duplicates += 1;
                continue;
            }
            seen.add(value);
            values.push(value);
        }
        return { values, duplicates, empty };
    }

    function validateImportCount(count, mode, copies = 1) {
        const qty = Math.max(1, Number(copies || 1));
        const total = Number(count) * qty;
        const limit = limitForMode(mode);
        if (!Number.isFinite(total) || total < 1) throw new Error("No barcode values were found.");
        if (total > limit) throw new Error(`Barcode list exceeds the ${limit} label limit for this print mode.`);
        return total;
    }

    return { parseBarcodeText, validateImportCount };
});
