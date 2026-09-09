const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

class NodeLike {
  constructor(name, ownerDocument) {
    this.nodeName = name;
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.children = [];
    this.firstChild = null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    return child;
  }
  removeChild(child) {
    this.children = this.children.filter((entry) => entry !== child);
    this.firstChild = this.children[0] || null;
  }
}

const document = {
  createElementNS(ns, name) { return new NodeLike(name, document); },
  createTextNode(value) { return { nodeName: '#text', textContent: String(value) }; },
};

const context = { window: {}, document, console };
context.window.window = context.window;
context.window.document = document;
vm.createContext(context);
const vendorPath = path.resolve(__dirname, '../vendor/jsbarcode.wmn.js');
vm.runInContext(fs.readFileSync(vendorPath, 'utf8'), context);

assert.strictEqual(typeof context.window.JsBarcode, 'function', 'Local barcode renderer must expose window.JsBarcode');
assert.strictEqual(context.window.JsBarcode.__wmn_local_renderer, true, 'Barcode Printer must use its owned local renderer');

function render(value, options = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  context.window.JsBarcode(svg, value, options);
  return svg;
}

const auto = render('50393305');
assert.ok(auto.children.length > 0, 'Frappe Auto/CODE128 must render 50393305');
assert.ok(Number.parseFloat(auto.attributes.width) > 0, 'Auto barcode must have width');

const ean8 = render('50393305', { format: 'EAN8' });
assert.ok(ean8.children.length > 0, 'Valid EAN8 50393305 must render');

const eanAlias = render('50393305', { format: 'EAN' });
assert.ok(eanAlias.children.length > 0, 'EAN alias must resolve 8-digit values as EAN8');

assert.throws(() => render('50393304', { format: 'EAN8' }), /not a valid input for EAN8/, 'Invalid EAN8 checksum must be rejected');
assert.ok(render('12345678', { format: 'CODE128' }).children.length > 0, 'Explicit CODE128 must render numeric values');
assert.ok(render('ABC-123', { format: 'CODE39' }).children.length > 0, 'CODE39 must render supported characters');
assert.ok(render('12345670', { format: 'ITF' }).children.length > 0, 'ITF must render even numeric values');

console.log('WMN_BARCODE_LOCAL_RENDERER_RUNTIME_PASS');
