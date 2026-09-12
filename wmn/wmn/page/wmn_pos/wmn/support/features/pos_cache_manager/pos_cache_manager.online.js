/* WMN POS cache manager online adapter. It intentionally edits local cache only. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PosCacheManager = ns.Features.PosCacheManager || {};
    ns.Features.PosCacheManager.Online = {
        open() {
            return ns.Features.PosCacheManager.Common.open();
        },
    };
})();
