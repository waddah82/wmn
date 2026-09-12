/* Coupon Offline controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Coupon = ns.Features.Coupon || {};
    ns.Features.Coupon.Offline = ns.Features.Coupon.Offline || {};
    ns.Features.Coupon.Offline.ControllerMethods = {
        async wmn_validate_coupon_offline(couponCode) {
                        if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getCoupon !== "function") {
                            throw new Error(__("Offline coupon cache is not available. Sync offline data while online first."));
                        }

                        const coupon = await window.wmnPOSOffline.getCoupon(
                            couponCode,
                            this.frm?.doc?.custom_offline_id || ""
                        );
                        if (!coupon) {
                            throw new Error(__("Coupon {0} is not available in the offline cache", [couponCode]));
                        }

                        if (!window.WMNPOSCoupon || typeof window.WMNPOSCoupon.validateLocal !== "function") {
                            throw new Error(__("Coupon validator is not loaded"));
                        }

                        return window.WMNPOSCoupon.validateLocal(coupon, this.frm.doc);
                    }
    };
})();
