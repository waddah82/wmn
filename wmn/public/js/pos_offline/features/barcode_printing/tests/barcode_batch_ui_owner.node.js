const fs = require('fs');
const assert = require('assert');
const path = require('path');

const commonPath = path.resolve(__dirname, '../barcode_printing.common.js');
const loaderPath = path.resolve(__dirname, '../../../wmn_pos_loader.js');
const common = fs.readFileSync(commonPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');

assert.ok(common.includes('Add Barcode Range'), 'Barcode Printer UI must expose range entry');
assert.ok(common.includes('Paste Barcode List'), 'Barcode Printer UI must expose pasted barcode entry');
assert.ok(common.includes('one_per_page'), 'Barcode Printer must support one-label-per-page mode');
assert.ok(common.includes('wmn-barcode-page-size'), 'Barcode Printer must expose sheet page size selection');
assert.ok(common.includes('Labels / Page'), 'Barcode Printer must show labels-per-page summary');
assert.ok(common.includes('Total Pages'), 'Barcode Printer must show total page count');

const rangeIndex = loader.indexOf('features/barcode_printing/barcode_printing.range.js');
const importIndex = loader.indexOf('features/barcode_printing/barcode_printing.import.js');
const layoutIndex = loader.indexOf('features/barcode_printing/barcode_printing.print_layout.js');
const commonIndex = loader.indexOf('features/barcode_printing/barcode_printing.common.js');
assert.ok(rangeIndex >= 0 && importIndex >= 0 && layoutIndex >= 0, 'Loader must include all Barcode Printer support modules');
assert.ok(rangeIndex < commonIndex && importIndex < commonIndex && layoutIndex < commonIndex, 'Support modules must load before Barcode Printer common owner');
assert.ok(loader.includes('const version = "20260907_retail_tools_v20"'), 'Global POS asset version must remain unchanged');

console.log('WMN_BARCODE_BATCH_UI_OWNER_PASS');
