const fs = require('fs');
const assert = require('assert');
const path = require('path');

const sourcePath = path.resolve(__dirname, '../mobile_barcode_scanner.common.js');
assert.ok(fs.existsSync(sourcePath), 'Mobile barcode scanner adapter must exist');
const src = fs.readFileSync(sourcePath, 'utf8');

assert.match(src, /frappe\.ui\.Scanner/, 'Mobile scanner must use Frappe v16 frappe.ui.Scanner');
assert.match(src, /facingMode|Scanner/, 'Mobile scanner must delegate camera ownership to Frappe scanner');
assert.match(src, /barcode_scanned\s*=\s*true/, 'Camera scan must enter the same ItemSelector scan lifecycle');
assert.match(src, /set_search_value/, 'Camera scan must feed the existing POS search field');
assert.doesNotMatch(src, /custom_scan_barcode_pos|wmnPOSOffline|get_items\s*\(/, 'Camera adapter must not own item lookup or barcode business logic');

console.log('WMN_MOBILE_BARCODE_SCANNER_ADAPTER_PASS');
