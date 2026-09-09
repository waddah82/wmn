const fs = require('fs');
const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '../../../../../..');
const methods = fs.readFileSync(path.join(root, 'public/js/pos_offline/overrides/item_selector/item_selector.methods.js'), 'utf8');
const override = fs.readFileSync(path.join(root, 'public/js/pos_offline/overrides/item_selector/item_selector.override.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/js/pos_offline/wmn_pos_loader.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'barcode_handler.py'), 'utf8');

assert.match(methods, /BarcodeScanQuantityUI\?\.install/, 'ItemSelector search owner must install Qty/Camera UI');
assert.match(methods, /shouldPrompt\?\.\(this, item, \{ fromScan, fromTypedBarcode \}\)/, 'Offline direct scan must consult one-shot prompt policy');
assert.match(methods, /shouldPrompt\?\.\(this, data, \{ fromScan, fromTypedBarcode \}\)/, 'Online resolved scan must consult one-shot prompt policy');
assert.match(methods, /finishScan\?\.\(this/, 'ItemSelector must report successful barcode completion to one-shot state owner');
assert.match(methods, /wmn_is_exact_barcode_result/, 'Typed Enter must require an exact barcode result');
assert.match(methods, /custom_scan_barcode_pos/, 'Online armed scan must use the existing WMN barcode resolver');
assert.match(server, /__wmn_from_barcode_structure/, 'Server structured barcode result must carry an explicit structure marker');
assert.match(override, /wmn_add_online_barcode_result/, 'ItemSelector class override must expose the online barcode adapter owned by methods');

const commonIndex = loader.indexOf('features/barcode_scan_quantity/barcode_scan_quantity.common.js');
const uiIndex = loader.indexOf('features/barcode_scan_quantity/barcode_scan_quantity.ui.js');
const selectorIndex = loader.indexOf('overrides/item_selector/item_selector.methods.js');
assert.ok(commonIndex >= 0 && uiIndex > commonIndex && selectorIndex > uiIndex, 'Qty feature must load before ItemSelector methods');

console.log('WMN_BARCODE_SCAN_QUANTITY_INTEGRATION_PASS');
