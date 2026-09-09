const fs = require('fs');
const assert = require('assert');
const path = require('path');

const methodsPath = path.resolve(__dirname, '../barcode_scanner.methods.js');
const overridePath = path.resolve(__dirname, '../barcode_scanner.override.js');
assert.ok(fs.existsSync(methodsPath), 'BarcodeScanner methods owner must exist');
assert.ok(fs.existsSync(overridePath), 'BarcodeScanner class override must exist');

const methods = fs.readFileSync(methodsPath, 'utf8');
const override = fs.readFileSync(overridePath, 'utf8');
const hooks = fs.readFileSync(path.resolve(__dirname, '../../../../../hooks.py'), 'utf8');
const oldPatch = fs.readFileSync(path.resolve(__dirname, '../../../pos_barcode_override.js'), 'utf8');

assert.match(override, /class\s+WMNBarcodeScannerOverride\s+extends\s+Base/, 'BarcodeScanner must be extended as a real class override');
assert.match(override, /erpnext\.utils\.BarcodeScanner\s*=\s*WMNBarcodeScannerOverride/, 'ERPNext BarcodeScanner class owner must be replaced once by the override');
assert.doesNotMatch(override + methods, /\.prototype\.[A-Za-z0-9_]+\s*=/, 'New owner must not monkey patch prototype methods');
assert.match(methods, /scan_qty|wmn_scan_qty/, 'Weighted barcode quantity behavior must move into the class owner');
assert.doesNotMatch(hooks, /pos_barcode_override\.js/, 'Legacy barcode monkey patch must no longer be loaded');
assert.match(hooks, /overrides\/barcode_scanner\/barcode_scanner\.methods\.js/, 'BarcodeScanner methods must be loaded from its owner');
assert.match(hooks, /overrides\/barcode_scanner\/barcode_scanner\.override\.js/, 'BarcodeScanner override must be loaded from its owner');
assert.doesNotMatch(oldPatch, /\.prototype\.[A-Za-z0-9_]+\s*=/, 'Legacy file must no longer contain monkey patches even if stale assets load it');

console.log('WMN_BARCODE_SCANNER_OWNER_MIGRATION_PASS');
