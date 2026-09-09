const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(__dirname + '/../barcode_printing.offline.js', 'utf8');
const db = {
  STORES: { item_barcodes: 'item_barcodes' },
  async searchItems(args) {
    assert.strictEqual(args.search_term, 'apple');
    assert.strictEqual(args.price_list, 'Retail');
    return [{ item_code: 'ITEM-1', item_name: 'Apple', stock_uom: 'Kg', rate: 25 }];
  },
  async findItem(value, priceList) {
    assert.strictEqual(value, '12345');
    assert.strictEqual(priceList, 'Retail');
    return { item_code: 'ITEM-1', rate: 30, uom: 'Box' };
  },
  async getAllByIndex(store, index, value) {
    assert.deepStrictEqual([store, index, value], ['item_barcodes', 'item_code', 'ITEM-1']);
    return [{ barcode: '12345', barcode_type: 'EAN13', uom: 'Kg' }];
  },
};
const context = {
  window: { WMN_RETAIL_TOOLS: { Context: { async getOfflinePOSContext() { return { db, profile: { name: 'POS-1', selling_price_list: 'Retail', currency: 'YER' }, settings: { currency: 'YER' } }; } } } },
  console,
  __: (s) => s,
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(code, context);

(async () => {
  const adapter = context.window.WMN_RETAIL_TOOLS.BarcodePrinting.Offline;
  const result = await adapter.search('apple', 'POS-1', 30);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].item_code, 'ITEM-1');
  assert.strictEqual(result[0].barcodes[0].barcode, '12345');
  assert.strictEqual(result[0].barcodes[0].uom, 'Kg');
  const resolved = await adapter.resolveBarcode('12345', 'POS-1');
  assert.strictEqual(resolved.rate, 30);
  assert.strictEqual(resolved.uom, 'Box');
  console.log('WMN_BARCODE_PRINTING_OFFLINE_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
