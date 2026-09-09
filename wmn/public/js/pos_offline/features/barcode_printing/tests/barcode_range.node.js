const assert = require('assert');
const path = require('path');

const range = require(path.resolve(__dirname, '../barcode_printing.range.js'));

assert.strictEqual(range.limitForMode('sheet'), 1000, 'Sheet/Grid range limit must be 1000 labels');
assert.strictEqual(range.limitForMode('one_per_page'), 100, 'One-label-per-page range limit must be 100 labels');
assert.deepStrictEqual(range.expandRange('0007', '0010', { mode: 'sheet', copies: 1 }), ['0007', '0008', '0009', '0010'], 'Range must preserve leading zero width');
assert.deepStrictEqual(range.expandRange('98', '102', { mode: 'sheet', copies: 1 }), ['98', '99', '100', '101', '102'], 'Range must not invent leading zeros when the endpoints do not use them');
assert.deepStrictEqual(range.expandRange('001', '1000', { mode: 'sheet', copies: 1 }).slice(0, 3), ['001', '002', '003'], 'Leading-zero width must come from explicitly padded endpoints, not from a longer natural end value');
assert.throws(() => range.expandRange('1', '1001', { mode: 'sheet', copies: 1 }), /1000/, 'Sheet range must reject more than 1000 labels');
assert.throws(() => range.expandRange('1', '101', { mode: 'one_per_page', copies: 1 }), /100/, 'One-per-page range must reject more than 100 labels');
assert.throws(() => range.expandRange('100', '1', { mode: 'sheet', copies: 1 }), /greater than or equal/i, 'Descending range must be rejected');
assert.throws(() => range.expandRange('1', '600', { mode: 'sheet', copies: 2 }), /1000/, 'Copies must count toward the operation limit');

const long = range.expandRange('90071992547409920', '90071992547409922', { mode: 'sheet', copies: 1 });
assert.deepStrictEqual(long, ['90071992547409920', '90071992547409921', '90071992547409922'], 'Range must not lose precision for long barcode values');

console.log('WMN_BARCODE_RANGE_PASS');
