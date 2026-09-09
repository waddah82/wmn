/* ERPNext-offline payment gateway UI adapter. Local LAN/SDK transports remain available. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PaymentGateway.Offline = Object.freeze({
        async attach(payment) {
            return await ns.Features.PaymentGateway.Common.attachPaymentControls(payment);
        },
    });
})();
