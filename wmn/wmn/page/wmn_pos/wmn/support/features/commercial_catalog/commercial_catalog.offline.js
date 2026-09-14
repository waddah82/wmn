/* WMN POS cashier commercial catalog Offline adapter. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.CommercialCatalog = ns.Features.CommercialCatalog || {};
    ns.Features.CommercialCatalog.Offline = ns.Features.CommercialCatalog.Offline || {};

    ns.Features.CommercialCatalog.Offline.getPromotions = async function getPromotions() {
        if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getPromotions !== "function") return [];
        return await window.wmnPOSOffline.getPromotions();
    };

    ns.Features.CommercialCatalog.Offline.getCoupons = async function getCoupons() {
        if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getCoupons !== "function") return [];
        return await window.wmnPOSOffline.getCoupons();
    };
})();
