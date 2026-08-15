/* Promotion Online controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Promotion = ns.Features.Promotion || {};
    ns.Features.Promotion.Online = ns.Features.Promotion.Online || {};
    ns.Features.Promotion.Online.ControllerMethods = {
        async wmn_set_online_promotion_rate(row, newRate) {
                        if (!row || !row.doctype || !row.name) return;
                        if (Math.abs(flt(row.rate || 0) - flt(newRate || 0)) <= 0.000001) return;
                        await wmn_pos_set_value(row.doctype, row.name, "rate", flt(newRate || 0));
                    }
    };
})();
