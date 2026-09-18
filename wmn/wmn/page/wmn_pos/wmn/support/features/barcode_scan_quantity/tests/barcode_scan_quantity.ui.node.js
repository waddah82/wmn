const fs = require("fs");
const assert = require("assert");
const path = require("path");

const sourcePath = path.resolve(__dirname, "../barcode_scan_quantity.ui.js");
assert.ok(fs.existsSync(sourcePath), "Barcode scan quantity UI owner must exist");
const src = fs.readFileSync(sourcePath, "utf8");

assert.match(src, /wmn-menu-search/, "Camera button must attach to the search field shell");
assert.match(src, /wmn-camera-scan/, "Camera scan button must exist");
assert.match(src, /wmn-search-icon-btn/, "Search-row actions must be compact square buttons");
assert.match(src, /wmn-qty-next-scan/, "Qty Next Scan button must exist");
assert.match(src, /wmn-grid-view-btn/, "Grid View must sit beside search");
assert.match(src, /wmn-button-view-btn/, "Button View must sit beside search");
assert.doesNotMatch(src, /Qty Next Scan<\/span>|wmn-qty-next-scan-label|wmn-camera-scan-label|<kbd>/, "Qty and camera controls must be icon-only");
assert.match(src, /MobileBarcodeScanner/, "Camera button must use the shared scanner adapter");
assert.match(src, /wmn_submit_scanned_barcode/, "Camera scan must submit through ItemSelector");

console.log("WMN_BARCODE_SCAN_QUANTITY_UI_PASS");
