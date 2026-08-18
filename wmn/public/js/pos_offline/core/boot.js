/* Single WMN POS installation point. */
window.wmn_pos_boot = async function wmn_pos_boot(wrapper) {
    if (!wrapper) throw new Error("WMN POS wrapper is required");
    const ns = window.WMN_POS;

    await ns.Services?.Settings?.DevicePreferences?.initialize?.();
    await wmn_bootstrap_detect_effective_offline();
    ns.UI.Mamsek?.setup?.();
    ns.UI.Dialogs?.setup?.();
    ns.Patches.EnabledPatches.applyAll();

    const pos = erpnext.PointOfSale;
    ["Payment", "ItemDetails", "PastOrderList", "PastOrderSummary", "ItemSelector", "ItemCart", "Controller"].forEach((name) => {
        const Override = ns.Overrides[name];
        if (typeof Override !== "function") throw new Error(`WMN ${name} override is not available`);
        pos[name] = Override;
    });

    wrapper.pos = new pos.Controller(wrapper);
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
