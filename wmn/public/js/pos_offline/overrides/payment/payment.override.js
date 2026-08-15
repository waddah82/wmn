/* Single production override for ERPNext PointOfSale.Payment. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.Payment;
    const methods = ns.OverrideMethods.Payment;

    class WMNPaymentOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        make_invoice_fields_control(...args) {
            return methods.FinalMethods.make_invoice_fields_control.apply(this, args);
        }

        checkout(...args) {
            return methods.FinalMethods.checkout.apply(this, args);
        }
    }

    ns.Overrides.Payment = WMNPaymentOverride;
})();
