const fs = require('fs');
const assert = require('assert');
const path = require('path');

const featurePath = path.resolve(__dirname, '../item_barcode_capture.common.js');
assert.ok(fs.existsSync(featurePath), 'Item barcode capture feature must exist');
const src = fs.readFileSync(featurePath, 'utf8');

assert.match(src, /frappe\.ui\.form\.on\(["']Item["']/, 'Feature must attach only to Item DocType');
assert.match(src, /Scan Barcodes/, 'Item form must expose Scan Barcodes action');
assert.match(src, /frm\.add_child\(["']barcodes["']/, 'Scanned value must be added to native Item.barcodes child table');
assert.match(src, /Item Barcode/, 'Feature must check native Item Barcode records for duplicates');
assert.match(src, /MobileBarcodeScanner|frappe\.ui\.Scanner/, 'Item barcode capture must support mobile camera scanning');
assert.doesNotMatch(src, /frm\.save\(|frm\.save_or_update\(/, 'Scanning must not auto-save the Item');

const hooks = fs.readFileSync(path.resolve(__dirname, '../../../../../hooks.py'), 'utf8');
assert.match(hooks, /["']Item["']\s*:\s*["']public\/js\/features\/item_barcode_capture\/item_barcode_capture\.common\.js["']/, 'Item feature must be loaded through doctype_js');

console.log('WMN_ITEM_BARCODE_CAPTURE_OWNER_PASS');
