const fs = require('fs');
const assert = require('assert');
const path = require('path');

const uiPath = path.resolve(__dirname, '../barcode_scan_quantity.ui.js');
const cssPath = path.resolve(__dirname, '../barcode_scan_quantity.css');
assert.ok(fs.existsSync(uiPath), 'Barcode scan quantity UI owner must exist');
assert.ok(fs.existsSync(cssPath), 'Barcode scan quantity visual state stylesheet must exist');

const ui = fs.readFileSync(uiPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
assert.match(ui, /F8/, 'Qty Next Scan must expose F8 shortcut');
assert.match(ui, /wmn-qty-next-scan/, 'Qty Next Scan must expose a dedicated POS button');
assert.match(ui, /wmn-camera-scan/, 'POS must expose a camera scan button');
assert.match(ui, /requestQuantity/, 'UI owner must provide the quantity dialog');
assert.match(css, /wmn-qty-next-scan-armed/, 'Armed mode must have a visual state class');
assert.match(css, /border/, 'Armed mode must visibly change the search field border');
assert.match(css, /background/, 'Armed mode must visibly change the search field background');

console.log('WMN_BARCODE_SCAN_QUANTITY_UI_PASS');
