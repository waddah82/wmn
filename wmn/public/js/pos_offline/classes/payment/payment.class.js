/* Single production WMN POS Payment class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.Payment;
    const methods = ns.ClassMethods.Payment;

    class WMNPaymentClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNPaymentClass, args, (instance) => {
                methods.initialize(instance, args);
            });
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

        render_payment_mode_dom(...args) {
            return methods.FinalMethods.render_payment_mode_dom.apply(this, args);
        }

        checkout(...args) {
            return methods.FinalMethods.checkout.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNPaymentClass, Base);
    ns.Classes.Payment = WMNPaymentClass;
})();
