/* Coupon Online adapter. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.Coupon = ns.Features.Coupon || {};
    ns.Features.Coupon.Online = ns.Features.Coupon.Online || {};

    ns.Features.Coupon.Online.ControllerMethods = {
        async wmn_validate_coupon_online(couponCode) {
            const doc = this.frm?.doc || {};
            if (this.__wmn_commercial_refresh_promise) await this.__wmn_commercial_refresh_promise;

            const bases = this.wmn_get_coupon_base_amounts();
            const response = await frappe.call({
                method: "wmn.api.validate_pos_coupon",
                args: {
                    coupon_code: couponCode,
                    customer: doc.customer || "",
                    company: doc.company || this.company || "",
                    net_total: bases.net_total,
                    grand_total: bases.grand_total,
                    is_return: cint(doc.is_return || 0),
                },
                freeze: false,
            });
            return response?.message || null;
        },
    };
})();
