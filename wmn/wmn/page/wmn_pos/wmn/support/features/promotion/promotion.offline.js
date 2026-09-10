/* Promotion Offline controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Promotion = ns.Features.Promotion || {};
    ns.Features.Promotion.Offline = ns.Features.Promotion.Offline || {};
    ns.Features.Promotion.Offline.ControllerMethods = {
        wmn_set_offline_promotion_rate(row, newRate) {
                        if (!row) return;
                        const qty = flt(row.qty || 0);
                        const rate = Math.max(0, flt(newRate || 0));
                        row.rate = rate;
                        row.net_rate = rate;
                        row.amount = qty * rate;
                        row.net_amount = qty * rate;
                        row.base_rate = rate;
                        row.base_net_rate = rate;
                        row.base_amount = row.amount;
                        row.base_net_amount = row.net_amount;
                    }
    };
})();
