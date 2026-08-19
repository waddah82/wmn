/* Supervisor offline adapter. All future cache/PIN-specific supervisor changes belong here. */
(function(){
    "use strict";
    const ns=window.WMN_POS; ns.Features.Supervisor=ns.Features.Supervisor||{};
    ns.Features.Supervisor.OfflineAdapter={
        isAvailable(){ return !!window.wmnPOSOffline; },
        service(){ return window.WMNPOSSupervisor; }
    };
})();
