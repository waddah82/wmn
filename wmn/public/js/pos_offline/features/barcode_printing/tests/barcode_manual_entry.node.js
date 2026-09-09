const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const commonPath = path.resolve(__dirname, '../barcode_printing.common.js');
let common = fs.readFileSync(commonPath, 'utf8');

assert.ok(common.includes('const FRAPPE_AUTO = "__frappe_auto__"'), 'Barcode Printer must define Frappe automatic rendering');
assert.ok(common.includes('entry.value === FRAPPE_AUTO ? " selected" : ""'), 'Frappe Auto must be selected by default');
assert.ok(common.includes('openManualBarcodeDialog'), 'Barcode Printer must support manual barcode rows');
assert.ok(common.includes('Add Manual Barcode'), 'Manual barcode action must be visible in the page');
assert.ok(common.includes('kind: "manual"'), 'Manual barcode rows must not require an Item');
assert.ok(common.includes('Manual barcode must contain numbers only.'), 'Manual barcode entry must validate numeric input');
assert.ok(common.includes('No printable barcode for this item.'), 'Items without Item Barcode must not fall back to an invalid item_code barcode');
assert.ok(!common.includes('format: String($root.find(".wmn-barcode-format").val() || "CODE128")'), 'CODE128 must not be forced as the default');

common = common.replace(
  'ns.BarcodePrinting.Common = { mount, openDialog };',
  'ns.BarcodePrinting.Common = { mount, openDialog, __test: { normalizeBarcodeFormat, effectiveBarcodeFormat, barcodeValue } };'
);
const context = { window: { WMN_RETAIL_TOOLS: {} }, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(common, context);
const helpers = context.window.WMN_RETAIL_TOOLS.BarcodePrinting.Common.__test;

assert.strictEqual(helpers.normalizeBarcodeFormat('__frappe_auto__'), '');
assert.strictEqual(helpers.normalizeBarcodeFormat('EAN-13'), 'EAN13');
assert.strictEqual(helpers.normalizeBarcodeFormat('EAN', '50393305'), 'EAN8', 'ERPNext EAN metadata must follow Frappe length-based EAN8/EAN13 behavior');
assert.strictEqual(helpers.normalizeBarcodeFormat('UPC-A'), 'UPC');
assert.strictEqual(helpers.normalizeBarcodeFormat('CODE-128'), 'CODE128');

const item = {
  kind: 'item',
  selected_barcode: '1234567890123',
  barcodes: [{ barcode: '1234567890123', barcode_type: 'EAN-13' }],
};
assert.strictEqual(helpers.effectiveBarcodeFormat(item, '__frappe_auto__'), '', 'Frappe Auto must remain automatic for Item barcodes and must not be overridden by Item Barcode metadata');
assert.strictEqual(helpers.effectiveBarcodeFormat(item, 'CODE128'), 'EAN13', 'Explicit non-auto mode may still honor ERPNext Item Barcode type');
const ean8Item = { kind: 'item', selected_barcode: '50393305', barcodes: [{ barcode: '50393305', barcode_type: 'EAN' }] };
assert.strictEqual(helpers.effectiveBarcodeFormat(ean8Item, 'CODE128'), 'EAN8', '8-digit ERPNext EAN barcode must render as EAN8');

const manualAuto = { kind: 'manual', selected_barcode: '123456', selected_barcode_type: '__frappe_auto__' };
assert.strictEqual(helpers.effectiveBarcodeFormat(manualAuto, 'EAN13'), '', 'Explicit Frappe Auto on manual barcode must remain Frappe Auto');
assert.strictEqual(helpers.barcodeValue({ kind: 'item', item_code: 'عربي', selected_barcode: '' }), '', 'Item code must not be silently used as barcode');

console.log('WMN_BARCODE_MANUAL_ENTRY_AND_FRAPPE_DEFAULT_PASS');
