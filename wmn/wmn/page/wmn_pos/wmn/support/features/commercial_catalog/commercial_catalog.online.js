/* WMN POS cashier commercial catalog Online adapter. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.CommercialCatalog = ns.Features.CommercialCatalog || {};
    ns.Features.CommercialCatalog.Online = ns.Features.CommercialCatalog.Online || {};

    ns.Features.CommercialCatalog.Online.getPromotions = async function getPromotions(controller) {
        if (!controller || typeof controller.wmn_get_active_promotions !== "function") return [];
        return await controller.wmn_get_active_promotions({ force: false });
    };

    ns.Features.CommercialCatalog.Online.getCoupons = async function getCoupons() {
        if (window.wmnPOSOffline && typeof window.wmnPOSOffline.getCoupons === "function") {
            return await window.wmnPOSOffline.getCoupons();
        }
        return [];
    };
})();
