const fs = require('fs');
const assert = require('assert');
const path = require('path');

const commonPath = path.resolve(__dirname, '../barcode_printing.common.js');
const loaderPath = path.resolve(__dirname, '../../../wmn_pos_loader.js');
const vendorPath = path.resolve(__dirname, '../vendor/jsbarcode.wmn.js');
const common = fs.readFileSync(commonPath, 'utf8');
const loader = fs.readFileSync(loaderPath, 'utf8');
const vendor = fs.readFileSync(vendorPath, 'utf8');

assert.ok(common.includes('window.JsBarcode'), 'Barcode Printer must use its local barcode renderer directly');
assert.ok(!common.includes('ControlBarcode'), 'Barcode Printer must not depend on Frappe ControlBarcode internals');
assert.ok(!common.includes('get_barcode_html'), 'Barcode Printer must not call ControlBarcode.get_barcode_html');
assert.ok(!common.includes('form.bundle.js'), 'Barcode Printer must not load form.bundle.js for rendering');
assert.ok(common.includes('document.createElementNS("http://www.w3.org/2000/svg", "svg")'), 'Barcode Printer must render to its own SVG element');
assert.ok(common.includes('if (format) rendererOptions.format = format;'), 'Frappe Auto must omit format so the renderer keeps CODE128 as the native default');
assert.ok(vendor.includes('Frappe-compatible default: omitted/auto format renders CODE128.'), 'Local renderer must document the Frappe default contract');
const vendorIndex = loader.indexOf('features/barcode_printing/vendor/jsbarcode.wmn.js');
const commonIndex = loader.indexOf('features/barcode_printing/barcode_printing.common.js');
assert.ok(vendorIndex >= 0 && commonIndex >= 0 && vendorIndex < commonIndex, 'Loader must load the local barcode renderer before barcode_printing.common.js');
assert.ok(loader.includes('const version = "20260907_retail_tools_v20"'), 'Global POS asset version must remain unchanged');
console.log('WMN_BARCODE_LOCAL_RENDERER_OWNER_PASS');
