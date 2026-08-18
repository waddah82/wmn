/* Single production override for ERPNext PointOfSale.ItemSelector. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemSelector;
    const methods = ns.OverrideMethods.ItemSelector;

    class WMNItemSelectorOverride extends Base {
        constructor(...args) {
            super(...args);
            methods.initialize(this, args);
        }

        wmn_is_offline(...args) {
            return methods.FinalMethods.wmn_is_offline.apply(this, args);
        }

        wmn_get_cached_pos_settings(...args) {
            return methods.FinalMethods.wmn_get_cached_pos_settings.apply(this, args);
        }

        wmn_get_cached_pos_profile(...args) {
            return methods.FinalMethods.wmn_get_cached_pos_profile.apply(this, args);
        }

        wmn_enrich_item_tracking_meta(...args) {
            return methods.FinalMethods.wmn_enrich_item_tracking_meta.apply(this, args);
        }

        wmn_get_offline_parent_item_group(...args) {
            return methods.FinalMethods.wmn_get_offline_parent_item_group.apply(this, args);
        }

        get_parent_item_group(...args) {
            return methods.FinalMethods.get_parent_item_group.apply(this, args);
        }

        load_items_data(...args) {
            return methods.FinalMethods.load_items_data.apply(this, args);
        }

        wmn_get_awesomplete_value(...args) {
            return methods.FinalMethods.wmn_get_awesomplete_value.apply(this, args);
        }

        wmn_get_item_group_filter_for_search(...args) {
            return methods.FinalMethods.wmn_get_item_group_filter_for_search.apply(this, args);
        }

        wmn_set_item_group_filter_label(...args) {
            return methods.FinalMethods.wmn_set_item_group_filter_label.apply(this, args);
        }

        wmn_update_existing_cart_item_or_add(...args) {
            return methods.FinalMethods.wmn_update_existing_cart_item_or_add.apply(this, args);
        }

        get_item_html(...args) {
            return methods.FinalMethods.get_item_html.apply(this, args);
        }

        make_search_bar(...args) {
            return methods.FinalMethods.make_search_bar.apply(this, args);
        }

        wmn_get_item_group_buttons_from_pos_profile(...args) {
            return methods.FinalMethods.wmn_get_item_group_buttons_from_pos_profile.apply(this, args);
        }

        wmn_render_item_group_buttons(...args) {
            return methods.FinalMethods.wmn_render_item_group_buttons.apply(this, args);
        }

        wmn_set_item_group_field_value(...args) {
            return methods.FinalMethods.wmn_set_item_group_field_value.apply(this, args);
        }

        wmn_get_item_selection_context(...args) {
            return methods.FinalMethods.wmn_get_item_selection_context.apply(this, args);
        }

        wmn_get_online_variant_metadata(...args) {
            return methods.FinalMethods.wmn_get_online_variant_metadata.apply(this, args);
        }

        wmn_prepare_items_for_display(...args) {
            return methods.FinalMethods.wmn_prepare_items_for_display.apply(this, args);
        }

        wmn_is_direct_search_result(...args) {
            return methods.FinalMethods.wmn_is_direct_search_result.apply(this, args);
        }

        get_items(...args) {
            return methods.FinalMethods.get_items.apply(this, args);
        }

        wmn_scan_barcode_structure_offline(...args) {
            return methods.FinalMethods.wmn_scan_barcode_structure_offline.apply(this, args);
        }

        filter_items(...args) {
            return methods.FinalMethods.filter_items.apply(this, args);
        }

        wmn_get_variant_choices(...args) {
            return methods.FinalMethods.wmn_get_variant_choices.apply(this, args);
        }

        wmn_get_batch_choices(...args) {
            return methods.FinalMethods.wmn_get_batch_choices.apply(this, args);
        }

        wmn_get_uom_choices(...args) {
            return methods.FinalMethods.wmn_get_uom_choices.apply(this, args);
        }

        wmn_apply_uom_option(...args) {
            return methods.FinalMethods.wmn_apply_uom_option.apply(this, args);
        }

        wmn_config_qty(...args) {
            return methods.FinalMethods.wmn_config_qty.apply(this, args);
        }

        wmn_config_available_uom_qty(...args) {
            return methods.FinalMethods.wmn_config_available_uom_qty.apply(this, args);
        }

        wmn_config_uom_section_html(...args) {
            return methods.FinalMethods.wmn_config_uom_section_html.apply(this, args);
        }

        wmn_bind_config_uom_section(...args) {
            return methods.FinalMethods.wmn_bind_config_uom_section.apply(this, args);
        }

        wmn_validate_config_qty(...args) {
            return methods.FinalMethods.wmn_validate_config_qty.apply(this, args);
        }

        wmn_choose_uom(...args) {
            return methods.FinalMethods.wmn_choose_uom.apply(this, args);
        }

        wmn_choose_batch_with_uom(...args) {
            return methods.FinalMethods.wmn_choose_batch_with_uom.apply(this, args);
        }

        wmn_choose_variant(...args) {
            return methods.FinalMethods.wmn_choose_variant.apply(this, args);
        }

        wmn_handle_item_wrapper_click(...args) {
            return methods.FinalMethods.wmn_handle_item_wrapper_click.apply(this, args);
        }

        wmn_open_ui_settings_dialog(...args) {
            return methods.FinalMethods.wmn_open_ui_settings_dialog.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        render_item_list(...args) {
            return methods.FinalMethods.render_item_list.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        updateActiveButton(...args) {
            return methods.FinalMethods.updateActiveButton.apply(this, args);
        }

        setCardMode(...args) {
            return methods.FinalMethods.setCardMode.apply(this, args);
        }

        setButtonMode(...args) {
            return methods.FinalMethods.setButtonMode.apply(this, args);
        }

        applyDisplayMode(...args) {
            return methods.FinalMethods.applyDisplayMode.apply(this, args);
        }

        set_connectivity_indicator_state(...args) {
            return methods.FinalMethods.set_connectivity_indicator_state.apply(this, args);
        }

        refresh_pending_invoice_badge(...args) {
            return methods.FinalMethods.refresh_pending_invoice_badge.apply(this, args);
        }

        install_connectivity_indicator(...args) {
            return methods.FinalMethods.install_connectivity_indicator.apply(this, args);
        }

        install_category_bar(...args) {
            return methods.FinalMethods.install_category_bar.apply(this, args);
        }

        render_category_bar(...args) {
            return methods.FinalMethods.render_category_bar.apply(this, args);
        }

        handle_broken_image(...args) {
            return methods.FinalMethods.handle_broken_image.apply(this, args);
        }

        update_active_category_count(...args) {
            return methods.FinalMethods.update_active_category_count.apply(this, args);
        }

        get_cart_rows(...args) {
            return methods.FinalMethods.get_cart_rows.apply(this, args);
        }

        get_cart_quantity(...args) {
            return methods.FinalMethods.get_cart_quantity.apply(this, args);
        }

        sync_card_quantities(...args) {
            return methods.FinalMethods.sync_card_quantities.apply(this, args);
        }

        wmn_refresh_available_stock(...args) {
            return methods.FinalMethods.wmn_refresh_available_stock.apply(this, args);
        }

        resize_selector(...args) {
            return methods.FinalMethods.resize_selector.apply(this, args);
        }
    }

    ns.Overrides.ItemSelector = WMNItemSelectorOverride;
})();
