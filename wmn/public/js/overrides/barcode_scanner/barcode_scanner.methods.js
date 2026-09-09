/* ERPNext BarcodeScanner methods owner. Migrates the legacy weighted-qty patch into a real class override. */
(function () {
    "use strict";

    window.WMN = window.WMN || {};
    window.WMN.OverrideMethods = window.WMN.OverrideMethods || {};
    window.WMN.Base = window.WMN.Base || {};

    const Base = erpnext?.utils?.BarcodeScanner;
    if (!Base) throw new Error("ERPNext BarcodeScanner must exist before WMN BarcodeScanner methods load.");
    window.WMN.Base.BarcodeScanner = Base;

    function normalizeScanQty(data) {
        const value = Number(data?.qty);
        return Number.isFinite(value) && value > 0 ? value : 1;
    }

    const methods = {
        async update_table(data) {
            this.wmn_scan_qty = normalizeScanQty(data);
            try {
                return await Base.prototype.update_table.call(this, data);
            } finally {
                this.wmn_scan_qty = null;
            }
        },

        set_item(row, item_code, barcode, batch_no, serial_no) {
            const scanQty = Number(this.wmn_scan_qty || 1);
            const weightedScan = Number.isFinite(scanQty) && scanQty > 0 && Math.abs(scanQty - 1) > 0.000001;

            // Native ERPNext remains authoritative for prompt_qty and demand/scan-dialog lifecycles.
            if (!weightedScan || this.prompt_qty || this.frm?.has_items) {
                return Base.prototype.set_item.call(this, row, item_code, barcode, batch_no, serial_no);
            }

            return new Promise((resolve, reject) => {
                const itemData = { item_code, use_serial_batch_fields: 1.0 };
                frappe.flags.trigger_from_barcode_scanner = true;
                itemData[this.qty_field] = Number(row[this.qty_field] || 0) + scanQty;
                frappe.model
                    .set_value(row.doctype, row.name, itemData)
                    .then(() => resolve(scanQty))
                    .catch(reject);
            });
        },

        show_scan_message(idx, exist, qty) {
            if (qty && qty !== 1 && qty % 1 !== 0) return;
            return Base.prototype.show_scan_message.call(this, idx, exist, qty);
        },
    };

    window.WMN.OverrideMethods.BarcodeScanner = methods;
})();
