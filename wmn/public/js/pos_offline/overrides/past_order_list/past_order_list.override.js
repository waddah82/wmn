/* Single production override for ERPNext PointOfSale.PastOrderList. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.PastOrderList;
    const methods = ns.OverrideMethods.PastOrderList;

    class WMNPastOrderListOverride extends Base {
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

    ns.Overrides.PastOrderList = WMNPastOrderListOverride;
})();
