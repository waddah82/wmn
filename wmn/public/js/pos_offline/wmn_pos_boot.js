window.wmn_pos_boot = async function(wrapper) {
await wmn_bootstrap_detect_effective_offline();
wmn_install_offline_server_call_guard();
wmn_install_offline_doctype_script_guard();
wrapper.pos = new MyPOSController(wrapper);
wmn_init_offline_invoice_manager_dialog(wrapper.pos);
window.cur_pos = wrapper.pos;
setTimeout(function () {
    if (typeof wmn_sync_receipt_counter_on_page_load === "function") {
        wmn_sync_receipt_counter_on_page_load();
    }
}, 3000);

















};
