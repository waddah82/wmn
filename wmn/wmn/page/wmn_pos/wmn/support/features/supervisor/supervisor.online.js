/* Supervisor online adapter. All future server-specific supervisor changes belong here. */
(function(){
    "use strict";
    const ns=window.WMN_POS; ns.Features.Supervisor=ns.Features.Supervisor||{};
    ns.Features.Supervisor.OnlineAdapter={
        isAvailable(){ return !wmn_is_pos_offline(); },
        service(){ return window.WMNPOSSupervisor; }
    };
})();
