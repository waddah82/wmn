/* Cash Movement online gateway. Server posting changes belong here. */
(function(){
    "use strict";
    const ns=window.WMN_POS; ns.Features.CashMovement=ns.Features.CashMovement||{};
    ns.Features.CashMovement.OnlineAdapter={ service(){ return window.WMNPOSCashMovement; } };
})();
