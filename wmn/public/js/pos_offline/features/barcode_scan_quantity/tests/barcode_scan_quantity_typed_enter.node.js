const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const commonPath = path.resolve(__dirname, '../barcode_scan_quantity.common.js');
const methodsPath = path.resolve(__dirname, '../../../overrides/item_selector/item_selector.methods.js');

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(commonPath, 'utf8'), context);

const feature = context.window.WMN_POS?.Features?.BarcodeScanQuantity;
assert.ok(feature, 'Barcode scan quantity feature must register');

const selector = {};
feature.arm(selector);
assert.strictEqual(
    feature.shouldPrompt(selector, { item_code: 'ITEM-1', barcode: '50393305' }, { fromTypedBarcode: true }),
    true,
    'Armed typed barcode submitted with Enter must prompt quantity'
);
assert.strictEqual(
    feature.shouldPrompt(selector, { item_code: 'ITEM-1' }, { fromTypedBarcode: false, fromScan: false }),
    false,
    'Ordinary item-card/manual selection must not prompt quantity'
);

const methods = fs.readFileSync(methodsPath, 'utf8');
assert.match(
    methods,
    /keydown\.wmnQtyTypedBarcode/,
    'ItemSelector owner must intercept Enter on the search input while Qty Next Scan is armed'
);
assert.match(
    methods,
    /__wmn_typed_barcode_submit/,
    'Typed barcode Enter must use an explicit one-shot barcode-submit marker'
);
assert.match(
    methods,
    /fromTypedBarcode/,
    'ItemSelector barcode pipeline must distinguish typed Enter from item-card selection'
);
assert.match(
    methods,
    /wmn_is_exact_barcode_result/,
    'Typed Enter must verify an exact barcode result rather than treating item-code search as a barcode'
);

console.log('WMN_BARCODE_SCAN_QUANTITY_TYPED_ENTER_PASS');
