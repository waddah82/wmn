frappe.pages["wmn-pos"].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({ parent: wrapper, title: __("WMN POS"), single_column: true, hide_sidebar: true });

    try {
        const version = "20260907_retail_tools_v20";
        window.__wmn_pos_asset_version = version;
        window.wmn_pos_install_owned_source();
        console.info("[WMN POS] page source version:", version);
        window.wmn_pos_page_boot(wrapper);
    } catch (error) {
        console.error("WMN POS page failed", error);
        frappe.msgprint({ title: "WMN POS", indicator: "red", message: error.message || String(error) });
    }
};
frappe.pages["wmn-pos"].refresh = function(wrapper) {
    if (document.scannerDetectionData && wrapper?.pos) {
        try { onScan.detachFrom(document); } catch (e) {}
        wrapper.pos.wrapper?.html?.("");
        wrapper.pos.check_opening_entry();
    }
};
