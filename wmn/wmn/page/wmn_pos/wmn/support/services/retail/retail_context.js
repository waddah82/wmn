/* Shared runtime context for WMN retail tools. No business calculations live here. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;

    function isOffline() {
        try {
            if (typeof window.wmn_is_pos_offline === "function") return Boolean(window.wmn_is_pos_offline());
        } catch (error) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function offlineStorage() {
        if (!window.wmnPOSOffline) {
            throw new Error(__("WMN offline POS data is not loaded. Open POS online once to preload local data."));
        }
        return window.wmnPOSOffline;
    }

    async function getOfflinePOSContext() {
        const db = offlineStorage();
        const [profile, settings] = await Promise.all([
            db.getPOSProfile(),
            db.getFullSettings(),
        ]);
        const currentProfile = profile || {};
        const currentSettings = settings || {};
        const name = currentProfile.name || currentProfile.pos_profile || currentSettings.pos_profile || "";
        return {
            db,
            profile: Object.assign({}, currentProfile, {
                name,
                selling_price_list: currentProfile.selling_price_list || currentSettings.selling_price_list || "",
                warehouse: currentProfile.warehouse || currentSettings.warehouse || "",
                currency: currentProfile.currency || currentSettings.currency || "",
            }),
            settings: currentSettings,
        };
    }

    ns.Context = { isOffline, offlineStorage, getOfflinePOSContext };
})();
