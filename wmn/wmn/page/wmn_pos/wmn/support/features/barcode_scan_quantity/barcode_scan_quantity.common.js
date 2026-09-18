/* WMN POS one-shot quantity prompt state for the next ordinary barcode scan. */
(function () {
    "use strict";

    window.WMN_POS = window.WMN_POS || {};
    window.WMN_POS.Features = window.WMN_POS.Features || {};

    const state = new WeakMap();

    function getState(selector) {
        if (!selector || (typeof selector !== "object" && typeof selector !== "function")) {
            return { armed: false };
        }
        if (!state.has(selector)) state.set(selector, { armed: false });
        return state.get(selector);
    }

    function isStructured(item) {
        return Boolean(
            item?.__wmn_from_barcode_structure ||
            item?.is_weighted ||
            item?.weighted ||
            item?.use_barcode_qty ||
            item?.resolved_barcode_type === "Weighted" ||
            item?.resolved_barcode_type === "Priced"
        );
    }

    const api = {
        isArmed(selector) {
            return Boolean(getState(selector).armed);
        },

        arm(selector) {
            getState(selector).armed = true;
            return true;
        },

        cancel(selector) {
            getState(selector).armed = false;
            return false;
        },

        toggle(selector) {
            return this.isArmed(selector) ? this.cancel(selector) : this.arm(selector);
        },

        isStructured,

        shouldPrompt(selector, item, context = {}) {
            if (!this.isArmed(selector)) return false;
            const fromBarcodeInput = Boolean(context.fromScan || context.fromTypedBarcode);
            if (!fromBarcodeInput) return false;
            if (!item || !item.item_code) return false;
            if (isStructured(item)) return false;
            // A direct serial-number scan represents one physical serial and must remain quantity 1.
            if (item.serial_no) return false;
            return true;
        },

        finishScan(selector, result = {}) {
            const shouldConsume = Boolean(
                result.success &&
                result.prompted &&
                !result.structured
            );
            if (shouldConsume) this.cancel(selector);
            return this.isArmed(selector);
        },
    };

    window.WMN_POS.Features.BarcodeScanQuantity = api;
})();
