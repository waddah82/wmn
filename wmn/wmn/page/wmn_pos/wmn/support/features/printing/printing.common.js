/* Printing common facade. Rendering engines remain under services/printing. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Printing = ns.Features.Printing || {};
    ns.Features.Printing.Common = {
        showSettings() {
            return ns.Services?.Printing?.PrintService?.showSettings?.() ||
                (typeof wmn_show_printer_settings_dialog === "function" ? wmn_show_printer_settings_dialog() : null);
        },
        send(payload, type, url) {
            return typeof wmn_send_to_legacy_bridge === "function"
                ? wmn_send_to_legacy_bridge(payload, type, url)
                : Promise.reject(new Error("WMN legacy printer bridge is not available."));
        },
        getTransportSettings() {
            return ns.Services?.Printing?.PrintService?.getConfig?.() || {};
        },
    };
})();
