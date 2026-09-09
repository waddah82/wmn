const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const sourcePath = path.resolve(__dirname, '../barcode_scan_quantity.common.js');
assert.ok(fs.existsSync(sourcePath), 'Barcode scan quantity owner must exist');

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);

const feature = context.window.WMN_POS?.Features?.BarcodeScanQuantity;
assert.ok(feature, 'Barcode scan quantity feature must register in WMN_POS.Features');

const selector = {};
assert.strictEqual(feature.isArmed(selector), false, 'Qty Next Scan must start disarmed');
feature.arm(selector);
assert.strictEqual(feature.isArmed(selector), true, 'arm() must enable one-shot quantity mode');

assert.strictEqual(feature.shouldPrompt(selector, { item_code: 'ITEM-1' }, { fromScan: true }), true, 'Ordinary scanned barcode must prompt while armed');
assert.strictEqual(feature.shouldPrompt(selector, { item_code: 'ITEM-1', __wmn_from_barcode_structure: 1 }, { fromScan: true }), false, 'Structured barcode must never prompt');
assert.strictEqual(feature.shouldPrompt(selector, { item_code: 'ITEM-1', serial_no: 'SER-1' }, { fromScan: true }), false, 'Direct serial scan must not prompt quantity');
assert.strictEqual(feature.shouldPrompt(selector, { item_code: 'ITEM-1' }, { fromScan: false }), false, 'Typed/non-scan search must not consume Qty Next Scan');

feature.finishScan(selector, { success: true, structured: true, prompted: false });
assert.strictEqual(feature.isArmed(selector), true, 'Structured scan must not consume armed state');
feature.finishScan(selector, { success: false, structured: false, prompted: false });
assert.strictEqual(feature.isArmed(selector), true, 'Failed scan must not consume armed state');
feature.finishScan(selector, { success: true, structured: false, prompted: true });
assert.strictEqual(feature.isArmed(selector), false, 'Successful prompted ordinary scan must consume armed state');

feature.arm(selector);
feature.cancel(selector);
assert.strictEqual(feature.isArmed(selector), false, 'cancel() must return to normal mode');

console.log('WMN_BARCODE_SCAN_QUANTITY_ONE_SHOT_PASS');
