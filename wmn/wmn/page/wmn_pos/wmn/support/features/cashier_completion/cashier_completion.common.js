/* Cashier completion metadata shared by Online and Offline finalization. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.CashierCompletion = ns.Features.CashierCompletion || {};

    const COMPLETED_BY_FIELD = "wmn_completed_by_cashier";

    function markCompletedByCashier(doc) {
        if (!doc) return doc;
        doc[COMPLETED_BY_FIELD] = window.frappe?.session?.user || "";
        return doc;
    }

    ns.Features.CashierCompletion.Common = {
        COMPLETED_BY_FIELD,
        markCompletedByCashier,
    };
})();
