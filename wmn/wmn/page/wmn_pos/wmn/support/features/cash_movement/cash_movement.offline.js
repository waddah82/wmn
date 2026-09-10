/* Cash Movement offline gateway. Queue/cache changes belong here. */
(function(){
    "use strict";
    const ns=window.WMN_POS; ns.Features.CashMovement=ns.Features.CashMovement||{};
    ns.Features.CashMovement.OfflineAdapter={ service(){ return window.WMNPOSCashMovement; } };
})();
