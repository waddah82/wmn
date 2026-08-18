/* Single production override for ERPNext PointOfSale.Controller. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.Controller;
    const methods = ns.OverrideMethods.Controller;

    class WMNControllerOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        init_item_details(...args) {
            return methods.FinalMethods.init_item_details.apply(this, args);
        }

        wmn_handle_item_details_visibility(...args) {
            return methods.FinalMethods.wmn_handle_item_details_visibility.apply(this, args);
        }

        init_item_cart(...args) {
            return methods.FinalMethods.init_item_cart.apply(this, args);
        }

        wmn_sync_item_stock_map(...args) {
            return methods.FinalMethods.wmn_sync_item_stock_map.apply(this, args);
        }

        wmn_cache(...args) {
            return methods.FinalMethods.wmn_cache.apply(this, args);
        }

        wmn_is_offline(...args) {
            return methods.FinalMethods.wmn_is_offline.apply(this, args);
        }

        fetch_opening_entry(...args) {
            return methods.FinalMethods.fetch_opening_entry.apply(this, args);
        }

        check_opening_entry(...args) {
            return methods.FinalMethods.check_opening_entry.apply(this, args);
        }

        create_opening_voucher(...args) {
            return methods.FinalMethods.create_opening_voucher.apply(this, args);
        }

        prepare_app_defaults(...args) {
            return methods.FinalMethods.prepare_app_defaults.apply(this, args);
        }

        wmn_start_offline_preload(...args) {
            return methods.FinalMethods.wmn_start_offline_preload.apply(this, args);
        }

        get_item_from_frm(...args) {
            return methods.FinalMethods.get_item_from_frm.apply(this, args);
        }

        update_cart_html(...args) {
            return methods.FinalMethods.update_cart_html.apply(this, args);
        }

        wmn_restore_default_customer_for_new_transaction(...args) {
            return methods.FinalMethods.wmn_restore_default_customer_for_new_transaction.apply(this, args);
        }

        make_new_invoice(...args) {
            return methods.FinalMethods.make_new_invoice.apply(this, args);
        }

        wmn_register_offline_row_in_frappe_model(...args) {
            return methods.FinalMethods.wmn_register_offline_row_in_frappe_model.apply(this, args);
        }

        wmn_ensure_offline_item_stock_map(...args) {
            return methods.FinalMethods.wmn_ensure_offline_item_stock_map.apply(this, args);
        }

        wmn_ensure_item_stock_map_for_cart_rows(...args) {
            return methods.FinalMethods.wmn_ensure_item_stock_map_for_cart_rows.apply(this, args);
        }

        wmn_ensure_item_stock_map_for_item_details(...args) {
            return methods.FinalMethods.wmn_ensure_item_stock_map_for_item_details.apply(this, args);
        }

        edit_item_details_of(...args) {
            return methods.FinalMethods.edit_item_details_of.apply(this, args);
        }

        wmn_get_active_offline_item_detail_row(...args) {
            return methods.FinalMethods.wmn_get_active_offline_item_detail_row.apply(this, args);
        }

        wmn_apply_offline_item_detail_value(...args) {
            return methods.FinalMethods.wmn_apply_offline_item_detail_value.apply(this, args);
        }

        wmn_refresh_offline_cart_from_item_detail(...args) {
            return methods.FinalMethods.wmn_refresh_offline_cart_from_item_detail.apply(this, args);
        }

        wmn_remove_offline_item_detail_row(...args) {
            return methods.FinalMethods.wmn_remove_offline_item_detail_row.apply(this, args);
        }

        wmn_clear_cart(...args) {
            return methods.FinalMethods.wmn_clear_cart.apply(this, args);
        }

        remove_item_from_cart(...args) {
            return methods.FinalMethods.remove_item_from_cart.apply(this, args);
        }

        update_item_field(...args) {
            return methods.FinalMethods.update_item_field.apply(this, args);
        }

        get_available_stock(...args) {
            return methods.FinalMethods.get_available_stock.apply(this, args);
        }

        check_serial_no_availablilty(...args) {
            return methods.FinalMethods.check_serial_no_availablilty.apply(this, args);
        }

        check_stock_availability(...args) {
            return methods.FinalMethods.check_stock_availability.apply(this, args);
        }

        on_cart_update(...args) {
            return methods.FinalMethods.on_cart_update.apply(this, args);
        }

        wmn_restore_online_uom_after_super(...args) {
            return methods.FinalMethods.wmn_restore_online_uom_after_super.apply(this, args);
        }

        wmn_restore_online_batch_price_after_super(...args) {
            return methods.FinalMethods.wmn_restore_online_batch_price_after_super.apply(this, args);
        }

        wmn_get_child_doctype(...args) {
            return methods.FinalMethods.wmn_get_child_doctype.apply(this, args);
        }

        wmn_recalculate_offline_totals(...args) {
            return methods.FinalMethods.wmn_recalculate_offline_totals.apply(this, args);
        }

        wmn_offline_get_full_item(...args) {
            return methods.FinalMethods.wmn_offline_get_full_item.apply(this, args);
        }

        wmn_prepare_online_batch_args_before_super(...args) {
            return methods.FinalMethods.wmn_prepare_online_batch_args_before_super.apply(this, args);
        }

        wmn_apply_online_batch_after_cart_update(...args) {
            return methods.FinalMethods.wmn_apply_online_batch_after_cart_update.apply(this, args);
        }

        wmn_offline_on_cart_update(...args) {
            return methods.FinalMethods.wmn_offline_on_cart_update.apply(this, args);
        }

        wmn_finalize_offline_invoice(...args) {
            return methods.FinalMethods.wmn_finalize_offline_invoice.apply(this, args);
        }

        save_and_checkout(...args) {
            return methods.FinalMethods.save_and_checkout.apply(this, args);
        }

        make_sales_invoice_frm(...args) {
            return methods.FinalMethods.make_sales_invoice_frm.apply(this, args);
        }

        make_return_invoice(...args) {
            return methods.FinalMethods.make_return_invoice.apply(this, args);
        }

        get_new_frm(...args) {
            return methods.FinalMethods.get_new_frm.apply(this, args);
        }

        set_pos_profile_data(...args) {
            return methods.FinalMethods.set_pos_profile_data.apply(this, args);
        }

        wmn_can_sell_on_credit(...args) {
            return methods.FinalMethods.wmn_can_sell_on_credit.apply(this, args);
        }

        wmn_refresh_sell_on_credit_button(...args) {
            return methods.FinalMethods.wmn_refresh_sell_on_credit_button.apply(this, args);
        }

        wmn_setup_sell_on_credit_button(...args) {
            return methods.FinalMethods.wmn_setup_sell_on_credit_button.apply(this, args);
        }

        wmn_sell_on_credit(...args) {
            return methods.FinalMethods.wmn_sell_on_credit.apply(this, args);
        }

        wmn_submit_online_invoice(...args) {
            return methods.FinalMethods.wmn_submit_online_invoice.apply(this, args);
        }

        wmn_return_to_recent_orders(...args) {
            return methods.FinalMethods.wmn_return_to_recent_orders.apply(this, args);
        }

        wmn_send_to_cashier(...args) {
            return methods.FinalMethods.wmn_send_to_cashier.apply(this, args);
        }

        init_payments(...args) {
            return methods.FinalMethods.init_payments.apply(this, args);
        }

        wmn_bind_offline_receipt_buttons(...args) {
            return methods.FinalMethods.wmn_bind_offline_receipt_buttons.apply(this, args);
        }

        wmn_open_scanned_draft_for_payment(...args) {
            return methods.FinalMethods.wmn_open_scanned_draft_for_payment.apply(this, args);
        }

        wmn_route_scanned_invoice(...args) {
            return methods.FinalMethods.wmn_route_scanned_invoice.apply(this, args);
        }

        init_recent_order_list(...args) {
            return methods.FinalMethods.init_recent_order_list.apply(this, args);
        }

        init_order_summary(...args) {
            return methods.FinalMethods.init_order_summary.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        init_item_selector(...args) {
            return methods.FinalMethods.init_item_selector.apply(this, args);
        }

        wmn_setup_adaptive_cart_ui(...args) {
            return methods.FinalMethods.wmn_setup_adaptive_cart_ui.apply(this, args);
        }

        wmn_set_item_details_modal_open(...args) {
            return methods.FinalMethods.wmn_set_item_details_modal_open.apply(this, args);
        }

        wmn_open_cart_drawer(...args) {
            return methods.FinalMethods.wmn_open_cart_drawer.apply(this, args);
        }

        wmn_close_cart_drawer(...args) {
            return methods.FinalMethods.wmn_close_cart_drawer.apply(this, args);
        }

        wmn_update_cart_fab(...args) {
            return methods.FinalMethods.wmn_update_cart_fab.apply(this, args);
        }

        wmn_sync_cart_context(...args) {
            return methods.FinalMethods.wmn_sync_cart_context.apply(this, args);
        }

        wmn_setup_cart_state_observers(...args) {
            return methods.FinalMethods.wmn_setup_cart_state_observers.apply(this, args);
        }

        wmn_restore_cart_width(...args) {
            return methods.FinalMethods.wmn_restore_cart_width.apply(this, args);
        }

        wmn_bind_cart_resizer(...args) {
            return methods.FinalMethods.wmn_bind_cart_resizer.apply(this, args);
        }

        change_item_quantity_from_selector(...args) {
            return methods.FinalMethods.change_item_quantity_from_selector.apply(this, args);
        }

        set_item_quantity_from_selector(...args) {
            return methods.FinalMethods.set_item_quantity_from_selector.apply(this, args);
        }

        wmn_has_manual_additional_discount(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_has_manual_additional_discount.apply(this, args);
        }

        wmn_get_pos_discount_breakdown(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_get_pos_discount_breakdown.apply(this, args);
        }

        wmn_sync_pos_invoice_discount_fields(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_sync_pos_invoice_discount_fields.apply(this, args);
        }

        wmn_refresh_commercial_state_after_cart_change(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_refresh_commercial_state_after_cart_change.apply(this, args);
        }

        wmn_ensure_commercial_state_ready_for_payment(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_ensure_commercial_state_ready_for_payment.apply(this, args);
        }

        wmn_apply_coupon_code(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_apply_coupon_code.apply(this, args);
        }

        wmn_apply_coupon_result(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_apply_coupon_result.apply(this, args);
        }

        wmn_get_coupon_base_amounts(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_get_coupon_base_amounts.apply(this, args);
        }

        wmn_open_coupon_dialog(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_open_coupon_dialog.apply(this, args);
        }

        wmn_refresh_active_coupon_after_cart_change(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_refresh_active_coupon_after_cart_change.apply(this, args);
        }

        wmn_refresh_coupon_ui(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_refresh_coupon_ui.apply(this, args);
        }

        wmn_remove_coupon(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_remove_coupon.apply(this, args);
        }

        wmn_revalidate_active_coupon(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_revalidate_active_coupon.apply(this, args);
        }

        wmn_set_coupon_discount_fields(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_set_coupon_discount_fields.apply(this, args);
        }

        wmn_validate_coupon_offline(...args) {
            return ns.Features.Coupon.Offline.ControllerMethods.wmn_validate_coupon_offline.apply(this, args);
        }

        wmn_validate_coupon_online(...args) {
            return ns.Features.Coupon.Online.ControllerMethods.wmn_validate_coupon_online.apply(this, args);
        }

        wmn_apply_promotion_evaluation(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_apply_promotion_evaluation.apply(this, args);
        }

        wmn_clear_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_clear_promotions.apply(this, args);
        }

        wmn_get_active_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_active_promotions.apply(this, args);
        }

        wmn_get_promotion_context(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_promotion_context.apply(this, args);
        }

        wmn_get_promotion_row_key(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_promotion_row_key.apply(this, args);
        }

        wmn_prepare_promotion_base_rates(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_prepare_promotion_base_rates.apply(this, args);
        }

        wmn_refresh_promotion_ui(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotion_ui.apply(this, args);
        }

        wmn_refresh_promotions_after_cart_change(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotions_after_cart_change.apply(this, args);
        }

        wmn_refresh_promotions_and_coupon(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotions_and_coupon.apply(this, args);
        }

        wmn_revalidate_active_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_revalidate_active_promotions.apply(this, args);
        }

        wmn_sync_promotion_free_items(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_sync_promotion_free_items.apply(this, args);
        }

        wmn_set_offline_promotion_rate(...args) {
            return ns.Features.Promotion.Offline.ControllerMethods.wmn_set_offline_promotion_rate.apply(this, args);
        }

        wmn_set_online_promotion_rate(...args) {
            return ns.Features.Promotion.Online.ControllerMethods.wmn_set_online_promotion_rate.apply(this, args);
        }

        wmn_prepare_online_promotion_free_item_row(...args) {
            return ns.Features.Promotion.Online.ControllerMethods.wmn_prepare_online_promotion_free_item_row.apply(this, args);
        }

        wmn_get_cashier_commercial_catalog(...args) {
            return ns.Features.CommercialCatalog.Common.ControllerMethods.wmn_get_cashier_commercial_catalog.apply(this, args);
        }

        wmn_open_cashier_commercial_catalog(...args) {
            return ns.Features.CommercialCatalog.Common.ControllerMethods.wmn_open_cashier_commercial_catalog.apply(this, args);
        }

        wmn_authorize_pos_action(...args) {
            return ns.Features.Supervisor.Common.ControllerMethods.wmn_authorize_pos_action.apply(this, args);
        }
    }

    ns.Overrides.Controller = WMNControllerOverride;
})();
