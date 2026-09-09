/* WMN Barcode Printer print-layout owner. */
(function (root, factory) {
    "use strict";
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) {
        root.WMN_RETAIL_TOOLS = root.WMN_RETAIL_TOOLS || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting = root.WMN_RETAIL_TOOLS.BarcodePrinting || {};
        root.WMN_RETAIL_TOOLS.BarcodePrinting.PrintLayout = api;
    }
})(typeof window !== "undefined" ? window : globalThis, function () {
    "use strict";

    const PAGE_SIZES = Object.freeze({
        A4: Object.freeze({ width: 210, height: 297 }),
        A5: Object.freeze({ width: 148, height: 210 }),
        LETTER: Object.freeze({ width: 215.9, height: 279.4 }),
    });

    function positive(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    function pageDimensions(size = "A4", customWidth, customHeight) {
        const key = String(size || "A4").toUpperCase();
        if (key === "CUSTOM") {
            return { width: positive(customWidth, 210), height: positive(customHeight, 297) };
        }
        const page = PAGE_SIZES[key] || PAGE_SIZES.A4;
        return { width: page.width, height: page.height };
    }

    function calculateLayout(options = {}) {
        const mode = String(options.mode || "sheet");
        const labelWidth = positive(options.labelWidth, 50);
        const labelHeight = positive(options.labelHeight, 30);
        const totalLabels = Math.max(0, Number(options.totalLabels || 0));

        if (mode === "one_per_page") {
            return {
                mode,
                page: { width: labelWidth, height: labelHeight },
                columns: 1,
                rows: 1,
                labelsPerPage: 1,
                totalPages: totalLabels,
                margin: 0,
                gap: 0,
            };
        }

        const page = pageDimensions(options.pageSize || "A4", options.customPageWidth, options.customPageHeight);
        const margin = Math.max(0, Number(options.margin ?? 5));
        const gap = Math.max(0, Number(options.gap ?? 2));
        const availableWidth = Math.max(labelWidth, page.width - (margin * 2));
        const availableHeight = Math.max(labelHeight, page.height - (margin * 2));
        const columns = Math.max(1, Math.floor((availableWidth + gap) / (labelWidth + gap)));
        const rows = Math.max(1, Math.floor((availableHeight + gap) / (labelHeight + gap)));
        const labelsPerPage = columns * rows;

        return {
            mode,
            page,
            columns,
            rows,
            labelsPerPage,
            totalPages: totalLabels ? Math.ceil(totalLabels / labelsPerPage) : 0,
            margin,
            gap,
        };
    }

    function paginate(values, perPage) {
        const size = Math.max(1, Number(perPage || 1));
        const pages = [];
        for (let index = 0; index < values.length; index += size) pages.push(values.slice(index, index + size));
        return pages;
    }

    return { PAGE_SIZES, pageDimensions, calculateLayout, paginate };
});
