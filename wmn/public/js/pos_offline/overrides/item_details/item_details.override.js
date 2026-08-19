/* Single production override for ERPNext PointOfSale.ItemDetails. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemDetails;
    const methods = ns.OverrideMethods.ItemDetails;

    class WMNItemDetailsOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        wmn_focus_quantity_control(...args) {
            return methods.FinalMethods.wmn_focus_quantity_control.apply(this, args);
        }

        toggle_item_details_section(...args) {
            return methods.FinalMethods.toggle_item_details_section.apply(this, args);
        }

        render_form(...args) {
            return methods.FinalMethods.render_form.apply(this, args);
        }

        wmn_offline_form_updated(...args) {
            return methods.FinalMethods.wmn_offline_form_updated.apply(this, args);
        }

        wmn_refresh_price_display(...args) {
            return methods.FinalMethods.wmn_refresh_price_display.apply(this, args);
        }

        wmn_apply_supervisor_protected_value(...args) {
            return methods.FinalMethods.wmn_apply_supervisor_protected_value.apply(this, args);
        }

        wmn_bind_supervisor_protected_controls(...args) {
            return methods.FinalMethods.wmn_bind_supervisor_protected_controls.apply(this, args);
        }

        wmn_bind_sales_invoice_item_model_events(...args) {
            return methods.FinalMethods.wmn_bind_sales_invoice_item_model_events.apply(this, args);
        }

        bind_custom_control_change_event(...args) {
            return methods.FinalMethods.bind_custom_control_change_event.apply(this, args);
        }

        auto_update_batch_no(...args) {
            return methods.FinalMethods.auto_update_batch_no.apply(this, args);
        }

        bind_auto_serial_fetch_event(...args) {
            return methods.FinalMethods.bind_auto_serial_fetch_event.apply(this, args);
        }
    }

    ns.Overrides.ItemDetails = WMNItemDetailsOverride;
})();
