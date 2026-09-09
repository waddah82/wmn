/* Single production WMN POS PastOrderSummary class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.PastOrderSummary;
    const methods = ns.OverrideMethods.PastOrderSummary;

    class WMNPastOrderSummaryOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        toggle_summary_placeholder(...args) {
            return methods.FinalMethods.toggle_summary_placeholder.apply(this, args);
        }

        load_summary_of(...args) {
            return methods.FinalMethods.load_summary_of.apply(this, args);
        }

        get_upper_section_html(...args) {
            return methods.FinalMethods.get_upper_section_html.apply(this, args);
        }

        wmn_get_receipt_identity_html(...args) {
            return methods.FinalMethods.wmn_get_receipt_identity_html.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        wmn_render_discount_summary(...args) {
            return methods.FinalMethods.wmn_render_discount_summary.apply(this, args);
        }

        wmn_can_add_payment(...args) {
            return methods.FinalMethods.wmn_can_add_payment.apply(this, args);
        }

        wmn_open_from_invoice_barcode(...args) {
            return methods.FinalMethods.wmn_open_from_invoice_barcode.apply(this, args);
        }

        wmn_render_add_payment_button(...args) {
            return methods.FinalMethods.wmn_render_add_payment_button.apply(this, args);
        }

        wmn_open_add_payment_dialog(...args) {
            return methods.FinalMethods.wmn_open_add_payment_dialog.apply(this, args);
        }

        attach_items_info(...args) {
            return methods.FinalMethods.attach_items_info.apply(this, args);
        }

        get_item_html(...args) {
            return methods.FinalMethods.get_item_html.apply(this, args);
        }

        is_invoice_returnable(...args) {
            return methods.FinalMethods.is_invoice_returnable.apply(this, args);
        }

        get_condition_btn_map(...args) {
            return methods.FinalMethods.get_condition_btn_map.apply(this, args);
        }

        attach_document_info(...args) {
            return methods.FinalMethods.attach_document_info.apply(this, args);
        }

        print_receipt(...args) {
            return methods.FinalMethods.print_receipt.apply(this, args);
        }

        send_email(...args) {
            return methods.FinalMethods.send_email.apply(this, args);
        }
    }

    ns.Classes.PastOrderSummary = WMNPastOrderSummaryOverride;
    ns.Overrides.PastOrderSummary = WMNPastOrderSummaryOverride;
})();
