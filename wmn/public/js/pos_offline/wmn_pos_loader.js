frappe.provide("erpnext.PointOfSale");
frappe.pages["point-of-sale"].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({ parent: wrapper, title: __("Point of Sale"), single_column: true });

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-wmn-pos-src="${src}"]`);
            if (existing && existing.__wmn_loaded) return resolve(true);
            if (existing) {
                existing.addEventListener("load", () => resolve(true), { once: true });
                existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src; script.async = false; script.defer = false; script.dataset.wmnPosSrc = src;
            script.onload = () => { script.__wmn_loaded = true; resolve(true); };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    frappe.require("point-of-sale.bundle.js", function() {
        const base = "/assets/wmn/js/pos_offline/";
        const version = "20260818_cashier_recent_orders_server_print_settings";
        window.__wmn_pos_asset_version = version;
        const manifest = [
            "core/namespace.js",
            "core/base_registry.js",
            "patches/patch_registry.js",
            "services/storage/offline_storage.js",
            "services/barcode/invoice_barcode.js",
            "services/connectivity/connectivity.js",
            "services/offline/mode_and_settings.js",
            "core/common.js",
            "services/settings/device_preferences.js",
            "services/settings/print_settings_repository.js",
            "ui/dialog_manager.js",
            "services/offline/document_adapter.js",
            "services/payment/offline_payment.js",
            "services/stock/offline_stock.js",
            "services/offline/invoice_manager.js",
            "services/printing/raw_renderer.js",
            "services/printing/template_loader.js",
            "services/printing/pdf_renderer.js",
            "services/printing/escpos.js",
            "services/printing/legacy_bridge_adapter.js",
            "services/printing/browser_print_adapter.js",
            "services/printing/webusb_escpos_adapter.js",
            "services/printing/webserial_escpos_adapter.js",
            "services/printing/qz_print_adapter.js",
            "services/printing/print_service.js",
            "services/receipt/receipt_counter.js",
            "services/printing/auto_print.js",
            "features/printing/printing.common.js",
            "features/printing/printing.online.js",
            "features/printing/printing.offline.js",
            "features/receipt/receipt.common.js",
            "features/receipt/receipt.online.js",
            "features/receipt/receipt.offline.js",
            "features/invoice_barcode/invoice_barcode.common.js",
            "features/invoice_barcode/invoice_barcode.online.js",
            "features/invoice_barcode/invoice_barcode.offline.js",
            "features/invoice_handoff/invoice_handoff.common.js",
            "features/invoice_handoff/invoice_handoff.online.js",
            "features/invoice_handoff/invoice_handoff.offline.js",
            "features/sync/sync.common.js",
            "features/sync/sync.online.js",
            "features/sync/sync.offline.js",
            "services/offline/cart_normalizer.js",
            "services/cache/controller_cache.js",
            "services/cache/pos_cache_registry.js",
            "services/cache/pos_cache_adapter.js",
            "features/pos_cache_manager/pos_cache_manager.common.js",
            "features/pos_cache_manager/pos_cache_manager.online.js",
            "features/pos_cache_manager/pos_cache_manager.offline.js",
            "features/discount/discount.common.js",
            "features/ui_preferences/ui_preferences.common.js",
            "features/coupon/coupon.common.js",
            "features/coupon/coupon.controller.common.js",
            "features/coupon/coupon.online.js",
            "features/coupon/coupon.offline.js",
            "features/promotion/promotion.common.js",
            "features/promotion/promotion.controller.common.js",
            "features/promotion/promotion.online.js",
            "features/promotion/promotion.offline.js",
            "features/commercial_catalog/commercial_catalog.common.js",
            "features/commercial_catalog/commercial_catalog.online.js",
            "features/commercial_catalog/commercial_catalog.offline.js",
            "features/supervisor/supervisor.common.js",
            "features/supervisor/supervisor.online.js",
            "features/supervisor/supervisor.offline.js",
            "features/supervisor/supervisor.controller.common.js",
            "features/cash_movement/cash_movement.common.js",
            "features/cash_movement/cash_movement.online.js",
            "features/cash_movement/cash_movement.offline.js",
            "features/doctype_manager/doctype_manager.common.js",
            "features/doctype_manager/doctype_manager.online.js",
            "features/doctype_manager/doctype_manager.offline.js",
            "ui/mamsek_ui.js",
            "overrides/payment/payment.methods.js",
            "overrides/payment/payment.override.js",
            "overrides/item_details/item_details.methods.js",
            "overrides/item_details/item_details.override.js",
            "overrides/past_order_list/past_order_list.methods.js",
            "overrides/past_order_list/past_order_list.override.js",
            "overrides/past_order_summary/past_order_summary.methods.js",
            "overrides/past_order_summary/past_order_summary.override.js",
            "overrides/item_selector/item_selector.methods.js",
            "overrides/item_selector/item_selector.override.js",
            "overrides/item_cart/item_cart.methods.js",
            "overrides/item_cart/item_cart.override.js",
            "overrides/controller/controller.methods.js",
            "overrides/controller/controller.override.js",
            "core/boot.js"
];
        manifest.reduce((p, name) => p.then(() => loadScript(base + name + "?v=" + encodeURIComponent(version))), Promise.resolve())
            .then(() => {
                console.info("[WMN POS] asset version:", version);
                return window.wmn_pos_boot(wrapper);
            })
            .catch((error) => {
                console.error("WMN POS architecture runtime failed", error);
                frappe.msgprint({ title: "WMN POS Offline", indicator: "red", message: error.message || String(error) });
            });
    });
};
