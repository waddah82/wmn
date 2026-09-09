const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync(__dirname + '/../price_checker.offline.js', 'utf8');
const rows = [{ barcode: '12345', uom: 'Kg' }];
const db = {
  STORES: { item_barcodes: 'item_barcodes' },
  async findItem(value, priceList) {
    assert.strictEqual(value, '12345');
    assert.strictEqual(priceList, 'Retail');
    return { item_code: 'ITEM-1', item_name: 'Apple', stock_uom: 'Kg', rate: 25, actual_qty: 7, is_stock_item: 1, warehouse: 'Main - C' };
  },
  async getAllByIndex(store, index, value) {
    assert.strictEqual(store, 'item_barcodes');
    assert.strictEqual(index, 'item_code');
    assert.strictEqual(value, 'ITEM-1');
    return rows;
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
  const adapter = context.window.WMN_RETAIL_TOOLS.PriceChecker.Offline;
  const result = await adapter.lookup('12345', 'POS-1');
  assert.strictEqual(result.item_code, 'ITEM-1');
  assert.strictEqual(result.uom, 'Kg');
  assert.strictEqual(result.rate, 25);
  assert.strictEqual(result.actual_qty, 7);
  assert.strictEqual(result.source, 'offline');
  console.log('WMN_PRICE_CHECKER_OFFLINE_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
