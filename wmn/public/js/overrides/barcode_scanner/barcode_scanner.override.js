/* Single production class override for ERPNext erpnext.utils.BarcodeScanner. */
(function () {
    "use strict";

    const Base = window.WMN?.Base?.BarcodeScanner;
    const methods = window.WMN?.OverrideMethods?.BarcodeScanner;
    if (!Base || !methods) throw new Error("WMN BarcodeScanner methods must load before its class override.");

    class WMNBarcodeScannerOverride extends Base {
        update_table(...args) {
            return methods.update_table.apply(this, args);
        }

        set_item(...args) {
            return methods.set_item.apply(this, args);
        }

        show_scan_message(...args) {
            return methods.show_scan_message.apply(this, args);
        }
    }

    erpnext.utils.BarcodeScanner = WMNBarcodeScannerOverride;
})();
