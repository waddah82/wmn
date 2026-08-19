/* Single production override for ERPNext PointOfSale.ItemCart. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemCart;
    const methods = ns.OverrideMethods.ItemCart;

    class WMNItemCartOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        wmn_get_numpad_supervisor_context(...args) {
            return methods.FinalMethods.wmn_get_numpad_supervisor_context.apply(this, args);
        }

        on_numpad_event(...args) {
            return methods.FinalMethods.on_numpad_event.apply(this, args);
        }

        reset_customer_selector(...args) {
            return methods.FinalMethods.reset_customer_selector.apply(this, args);
        }

        make_customer_selector(...args) {
            return methods.FinalMethods.make_customer_selector.apply(this, args);
        }

        fetch_customer_details(...args) {
            return methods.FinalMethods.fetch_customer_details.apply(this, args);
        }

        wmn_warn_if_customer_previously_purchased(...args) {
            return methods.FinalMethods.wmn_warn_if_customer_previously_purchased.apply(this, args);
        }

        render_customer_fields(...args) {
            return methods.FinalMethods.render_customer_fields.apply(this, args);
        }

        fetch_customer_transactions(...args) {
            return methods.FinalMethods.fetch_customer_transactions.apply(this, args);
        }

        wmn_apply_transaction_discount(...args) {
            return methods.FinalMethods.wmn_apply_transaction_discount.apply(this, args);
        }

        show_discount_control(...args) {
            return methods.FinalMethods.show_discount_control.apply(this, args);
        }

        load_invoice(...args) {
            return methods.FinalMethods.load_invoice.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        init_customer_selector(...args) {
            return methods.FinalMethods.init_customer_selector.apply(this, args);
        }

        wmn_mount_promotion_control(...args) {
            return methods.FinalMethods.wmn_mount_promotion_control.apply(this, args);
        }

        wmn_refresh_promotion_control(...args) {
            return methods.FinalMethods.wmn_refresh_promotion_control.apply(this, args);
        }

        wmn_mount_coupon_control(...args) {
            return methods.FinalMethods.wmn_mount_coupon_control.apply(this, args);
        }

        wmn_refresh_coupon_control(...args) {
            return methods.FinalMethods.wmn_refresh_coupon_control.apply(this, args);
        }

        wmn_set_checkout_commercial_busy(...args) {
            return methods.FinalMethods.wmn_set_checkout_commercial_busy.apply(this, args);
        }

        wmn_mount_discount_breakdown(...args) {
            return methods.FinalMethods.wmn_mount_discount_breakdown.apply(this, args);
        }

        wmn_refresh_discount_breakdown(...args) {
            return methods.FinalMethods.wmn_refresh_discount_breakdown.apply(this, args);
        }

        wmn_mount_compact_cart_footer(...args) {
            return methods.FinalMethods.wmn_mount_compact_cart_footer.apply(this, args);
        }

        wmn_refresh_compact_cart_footer(...args) {
            return methods.FinalMethods.wmn_refresh_compact_cart_footer.apply(this, args);
        }

        wmn_open_transaction_discount_dialog(...args) {
            return methods.FinalMethods.wmn_open_transaction_discount_dialog.apply(this, args);
        }

        wmn_build_cart_details_html(...args) {
            return methods.FinalMethods.wmn_build_cart_details_html.apply(this, args);
        }

        wmn_open_cart_details_dialog(...args) {
            return methods.FinalMethods.wmn_open_cart_details_dialog.apply(this, args);
        }

        wmn_show_cart_details_hint(...args) {
            return methods.FinalMethods.wmn_show_cart_details_hint.apply(this, args);
        }

        wmn_hide_cart_details_hint(...args) {
            return methods.FinalMethods.wmn_hide_cart_details_hint.apply(this, args);
        }

        init_cart_components(...args) {
            return methods.FinalMethods.init_cart_components.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        disable_customer_selection(...args) {
            return methods.FinalMethods.disable_customer_selection.apply(this, args);
        }

        enable_customer_selection(...args) {
            return methods.FinalMethods.enable_customer_selection.apply(this, args);
        }

        update_customer_section(...args) {
            return methods.FinalMethods.update_customer_section.apply(this, args);
        }

        render_cart_item(...args) {
            return methods.FinalMethods.render_cart_item.apply(this, args);
        }

        handle_broken_image(...args) {
            return methods.FinalMethods.handle_broken_image.apply(this, args);
        }

        toggle_numpad(...args) {
            return methods.FinalMethods.toggle_numpad.apply(this, args);
        }

        render_net_total(...args) {
            return methods.FinalMethods.render_net_total.apply(this, args);
        }

        render_grand_total(...args) {
            return methods.FinalMethods.render_grand_total.apply(this, args);
        }
    }

    ns.Overrides.ItemCart = WMNItemCartOverride;
})();
