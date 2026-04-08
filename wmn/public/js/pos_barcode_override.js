// wmn/public/js/pos_barcode_override.js


window.last_scanned_weight = null;


const original_scan_api_call = erpnext.utils.BarcodeScanner.prototype.scan_api_call;
erpnext.utils.BarcodeScanner.prototype.scan_api_call = function(input, callback) {
    return original_scan_api_call.call(this, input, (r) => {
        if (r.message && r.message.qty && r.message.qty !== 1) {
            window.last_scanned_weight = r.message.qty;
            
        }
        else
            window.last_scanned_weight = 1;
        callback(r);
    });
};


const original_set_item = erpnext.utils.BarcodeScanner.prototype.set_item;


erpnext.utils.BarcodeScanner.prototype.set_item = function(row, item_code, barcode, batch_no, serial_no) {
    let me = this;
    let weight = window.last_scanned_weight;
    //return original_set_item (row, item_code, barcode, batch_no, serial_no);
    const increment = async (value = weight && weight !== 1 ? weight : 1) => {
        const item_data = { item_code: item_code, use_serial_batch_fields: 1.0 };
        frappe.flags.trigger_from_barcode_scanner = true;
        item_data[me.qty_field] = Number(row[me.qty_field] || 0) + Number(value);
        await frappe.model.set_value(row.doctype, row.name, item_data);
        if (batch_no) {
            await frappe.model.set_value(row.doctype, row.name, me.batch_no_field, batch_no);
        }
        
        if (serial_no) {
            await frappe.model.set_value(row.doctype, row.name, me.serial_no_field, serial_no);
        }
        
        if (value !== 1 && value === weight) {
            me.show_alert(__("Added {0}  of {1}", [value, item_code]), "green");
            window.last_scanned_weight = null;
        }
        return value;
    };
    
    if (this.prompt_qty) {
        frappe.prompt(__("Please enter quantity for item {0}", [item_code]), ({ value }) => {
            increment(value);
        });
    } else if (this.frm.has_items) {
        this.prepare_item_for_scan(row, item_code, barcode, batch_no, serial_no);
    } else {
        increment();
    }
};


const original_show_scan_message = erpnext.utils.BarcodeScanner.prototype.show_scan_message;
erpnext.utils.BarcodeScanner.prototype.show_scan_message = function(idx, exist, qty) {
    if (qty && qty !== 1 && qty % 1 !== 0) {
        return;
    }
    original_show_scan_message.call(this, idx, exist, qty);
};

//console.log("POS Barcode Override loaded successfully");
