/* Shared camera barcode adapter. Frappe owns camera access and decoding. */
(function () {
    "use strict";

    window.WMN = window.WMN || {};
    window.WMN.Features = window.WMN.Features || {};

    function extractText(data) {
        return String(
            data?.result?.text ||
            data?.decodedText ||
            data?.text ||
            ""
        ).trim();
    }

    function ensureScanner() {
        if (!window.frappe?.ui?.Scanner) {
            throw new Error(__("Camera barcode scanner is not available in this session."));
        }
        return window.frappe.ui.Scanner;
    }

    function open(options = {}) {
        const Scanner = ensureScanner();
        return new Scanner({
            dialog: true,
            multiple: Boolean(options.multiple),
            on_scan(data) {
                const text = extractText(data);
                if (!text) return;
                options.onScan?.(text, data);
            },
        });
    }

    function openForPOS(selector) {
        return open({
            multiple: false,
            onScan(text) {
                if (!selector?.search_field || typeof selector.set_search_value !== "function") return;
                selector.barcode_scanned = true;
                selector.set_search_value(text);
            },
        });
    }

    window.WMN.Features.MobileBarcodeScanner = {
        extractText,
        open,
        openForPOS,
    };
})();
