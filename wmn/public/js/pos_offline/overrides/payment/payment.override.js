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

        wmn_setup_send_to_cashier_button(...args) {
            return methods.FinalMethods.wmn_setup_send_to_cashier_button.apply(this, args);
        }

        wmn_setup_back_to_recent_orders_button(...args) {
            return methods.FinalMethods.wmn_setup_back_to_recent_orders_button.apply(this, args);
        }

        checkout(...args) {
            return methods.FinalMethods.checkout.apply(this, args);
        }
    }

    ns.Overrides.Payment = WMNPaymentOverride;
})();
