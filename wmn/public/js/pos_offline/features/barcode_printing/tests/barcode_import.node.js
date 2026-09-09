const assert = require('assert');
const path = require('path');

const importer = require(path.resolve(__dirname, '../barcode_printing.import.js'));

const parsed = importer.parseBarcodeText('50393305\n79956666,44225666،11234\n\n423, 50393305');
assert.deepStrictEqual(parsed.values, ['50393305', '79956666', '44225666', '11234', '423'], 'Paste input must support newline, comma and Arabic comma while preserving order');
assert.strictEqual(parsed.duplicates, 1, 'Duplicate count must be reported');
assert.strictEqual(parsed.empty, 1, 'Empty tokens must be reported');

const long = importer.parseBarcodeText('000123\n90071992547409921');
assert.deepStrictEqual(long.values, ['000123', '90071992547409921'], 'Paste parser must preserve leading zeros and long barcode strings');
assert.throws(() => importer.validateImportCount(1001, 'sheet', 1), /1000/, 'Sheet paste list must be limited to 1000 labels');
assert.throws(() => importer.validateImportCount(101, 'one_per_page', 1), /100/, 'One-per-page paste list must be limited to 100 labels');
assert.throws(() => importer.validateImportCount(600, 'sheet', 2), /1000/, 'Copies must count toward paste operation limit');
assert.strictEqual(importer.validateImportCount(500, 'sheet', 2), 1000);

console.log('WMN_BARCODE_IMPORT_PASS');
