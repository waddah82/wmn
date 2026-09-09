/* Clean WMN POS page boot. Instantiates WMN classes without ERPNext runtime replacement. */
window.wmn_pos_page_boot = async function wmn_pos_page_boot(wrapper) {
    if (!wrapper) throw new Error("WMN POS wrapper is required");
    const ns = window.WMN_POS;
    if (!ns?.Classes?.Controller) throw new Error("WMN POS Controller class is not available");

    await ns.Services?.Settings?.DevicePreferences?.initialize?.();
    await wmn_bootstrap_detect_effective_offline();
    ns.UI.Mamsek?.setup?.();
    ns.UI.Dialogs?.setup?.();

    wrapper.pos = new ns.Classes.Controller(wrapper);
    wrapper.pos.__wmn_owned_page = true;
    wrapper.pos.__wmn_page_name = "wmn-pos";
    window.cur_pos = wrapper.pos;
    wmn_init_offline_invoice_manager_dialog(wrapper.pos);
    setTimeout(() => {
        ns.Features.DoctypeManager?.Common?.initialize?.();
    }, 1200);
    setTimeout(() => {
        if (typeof wmn_sync_receipt_counter_on_page_load === "function") wmn_sync_receipt_counter_on_page_load();
    }, 3000);
    return wrapper.pos;
};
