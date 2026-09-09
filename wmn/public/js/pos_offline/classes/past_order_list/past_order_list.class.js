/* Single production WMN POS PastOrderList class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderList;
    const methods = ns.ClassMethods.PastOrderList;

    class WMNPastOrderListClass extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        make_filter_section(...args) {
            return methods.FinalMethods.make_filter_section.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        wmn_handle_invoice_barcode(...args) {
            return methods.FinalMethods.wmn_handle_invoice_barcode.apply(this, args);
        }

        refresh_list(...args) {
            return methods.FinalMethods.refresh_list.apply(this, args);
        }
    }

    ns.Classes.PastOrderList = WMNPastOrderListClass;
})();
