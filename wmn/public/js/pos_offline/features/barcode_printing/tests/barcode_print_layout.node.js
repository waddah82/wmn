const assert = require('assert');
const path = require('path');

const layout = require(path.resolve(__dirname, '../barcode_printing.print_layout.js'));

const a4 = layout.pageDimensions('A4');
assert.deepStrictEqual(a4, { width: 210, height: 297 }, 'A4 must be the default sheet size');
assert.deepStrictEqual(layout.pageDimensions('A5'), { width: 148, height: 210 });
assert.deepStrictEqual(layout.pageDimensions('LETTER'), { width: 215.9, height: 279.4 });
assert.deepStrictEqual(layout.pageDimensions('CUSTOM', 180, 240), { width: 180, height: 240 });

const sheet = layout.calculateLayout({ mode: 'sheet', pageSize: 'A4', labelWidth: 50, labelHeight: 30, margin: 5, gap: 2, totalLabels: 100 });
assert.strictEqual(sheet.columns, 3);
assert.strictEqual(sheet.rows, 9);
assert.strictEqual(sheet.labelsPerPage, 27);
assert.strictEqual(sheet.totalPages, 4);

const one = layout.calculateLayout({ mode: 'one_per_page', labelWidth: 50, labelHeight: 30, totalLabels: 17 });
assert.strictEqual(one.labelsPerPage, 1);
assert.strictEqual(one.totalPages, 17);
assert.strictEqual(one.page.width, 50);
assert.strictEqual(one.page.height, 30);

const pages = layout.paginate(['a', 'b', 'c', 'd', 'e'], 2);
assert.deepStrictEqual(pages, [['a', 'b'], ['c', 'd'], ['e']], 'Sheet labels must split predictably into pages');

console.log('WMN_BARCODE_PRINT_LAYOUT_PASS');
