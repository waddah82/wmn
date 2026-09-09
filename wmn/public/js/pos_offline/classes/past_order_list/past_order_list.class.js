/* Single production WMN POS PastOrderList class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderList;
    const methods = ns.ClassMethods.PastOrderList;

    class WMNPastOrderListClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNPastOrderListClass, args, (instance) => {
                methods.initialize(instance, args);
            });
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

    window.wmn_pos_inherit_source_prototype(WMNPastOrderListClass, Base);
    ns.Classes.PastOrderList = WMNPastOrderListClass;
})();
