const fs = require('fs');
const assert = require('assert');
const path = require('path');

const sourcePath = path.resolve(__dirname, '../mobile_barcode_scanner.common.js');
assert.ok(fs.existsSync(sourcePath), 'Mobile barcode scanner adapter must exist');
const src = fs.readFileSync(sourcePath, 'utf8');

assert.match(src, /BarcodeDetector/, 'Offline camera scan must use the native BarcodeDetector path');
assert.match(src, /getUserMedia/, 'Offline camera scan must open the device camera locally');
assert.match(src, /wmn_is_pos_offline|navigator\.onLine/, 'Camera adapter must detect POS offline mode');
assert.match(src, /frappe\.ui\.Scanner/, 'Online fallback may still use Frappe Scanner when the local decoder is missing');
assert.match(src, /barcode_scanned\s*=\s*true/, 'Camera scan must enter the same ItemSelector scan lifecycle');
assert.match(src, /set_search_value/, 'Camera scan must feed the existing POS search field');
assert.match(src, /wmn_submit_scanned_barcode/, 'Camera scan must submit through the ItemSelector barcode owner');
assert.doesNotMatch(src, /frappe\.require/, 'Camera adapter must not fetch html5-qrcode while opening the scanner');
assert.doesNotMatch(src, /custom_scan_barcode_pos|wmnPOSOffline|get_items\s*\(/, 'Camera adapter must not own item lookup or barcode business logic');

console.log('WMN_MOBILE_BARCODE_SCANNER_ADAPTER_PASS');
