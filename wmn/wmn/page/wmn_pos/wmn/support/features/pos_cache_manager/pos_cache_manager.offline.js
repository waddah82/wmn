/* WMN POS cache manager offline adapter. It edits the same local cache and performs no sync. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PosCacheManager = ns.Features.PosCacheManager || {};
    ns.Features.PosCacheManager.Offline = {
        open() {
            return ns.Features.PosCacheManager.Common.open();
        },
    };
})();
