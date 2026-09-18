/* WMN Price Checker online adapter. ERPNext/WMN Online remains the behavioral reference. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.PriceChecker = ns.PriceChecker || {};

    function call(method, args = {}) {
        return frappe.call({ method, args, freeze: false }).then((r) => r?.message);
    }

    ns.PriceChecker.Online = {
        async getContext() {
            return (await call("wmn.features.price_checker.price_checker.get_context")) || {};
        },

        async lookup(value, posProfile) {
            return await call("wmn.features.price_checker.price_checker.lookup", {
                value,
                pos_profile: posProfile,
            });
        },
    };
})();
