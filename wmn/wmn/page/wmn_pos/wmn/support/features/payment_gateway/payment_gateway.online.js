/* Online payment gateway UI adapter. Shared controls decide gateway transport availability. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PaymentGateway.Online = Object.freeze({
        async attach(payment) {
            return await ns.Features.PaymentGateway.Common.attachPaymentControls(payment);
        },
    });
})();
