/* WMN Barcode Printer online adapter. Uses the WMN Online item API. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.BarcodePrinting = ns.BarcodePrinting || {};

    function call(method, args = {}) {
        return frappe.call({ method, args, freeze: false }).then((r) => r?.message);
    }

    ns.BarcodePrinting.Online = {
        async getContext() {
            return (await call("wmn.features.price_checker.price_checker.get_context")) || {};
        },

        async search(query, posProfile, limit = 30) {
            return (await call("wmn.features.barcode_printing.barcode_printing.search_items", {
                query,
                pos_profile: posProfile,
                limit,
            })) || [];
        },

        async resolveBarcode(value, posProfile) {
            return await call("wmn.features.price_checker.price_checker.lookup", {
                value,
                pos_profile: posProfile,
            });
        },
    };
})();
