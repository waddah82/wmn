/* WMN POS split runtime boot. This file was missing from the supplied package. */
window.wmn_pos_boot = async function wmn_pos_boot(wrapper) {
    if (!wrapper) throw new Error("WMN POS wrapper is required");

    await wmn_bootstrap_detect_effective_offline();
    wmn_install_offline_server_call_guard();
    wmn_install_offline_doctype_script_guard();

    if (typeof window.wmn_install_mamsek_pos !== "function") {
        throw new Error("WMN Mamsek POS installer is not available");
    }

    window.wmn_install_mamsek_pos();

    // Mamsek Controller extends MyPOSController, so this single instance owns
    // both the redesigned interface and the complete POSOffline runtime.
    wrapper.pos = new erpnext.PointOfSale.Controller(wrapper);
    window.cur_pos = wrapper.pos;
    wmn_init_offline_invoice_manager_dialog(wrapper.pos);
    setTimeout(function () {
        if (typeof wmn_sync_receipt_counter_on_page_load === "function") {
            wmn_sync_receipt_counter_on_page_load();
        }
    }, 3000);

    return wrapper.pos;
};
