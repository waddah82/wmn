const fs = require('fs');
const vm = require('vm');
const path = require('path');

function fail(message) { throw new Error(message); }
function approx(a, b, label) { if (Math.abs(Number(a)-Number(b)) > 1e-9) fail(`${label}: ${a} != ${b}`); }

global.window = {
  WMN_POS: { Features: { Discount: {} } },
};
global.flt = (v) => Number(v || 0);
global.cint = (v) => parseInt(v || 0, 10) || 0;
global.wmn_controller_uses_offline_flow = () => false;

const file = path.join(__dirname, '..', 'discount.common.js');
vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
const methods = window.WMN_POS.Features.Discount.Common.ControllerMethods;

async function run() {
  const doc = {
    additional_discount_percentage: 50,
    discount_amount: 110,
    base_discount_amount: 110,
    apply_discount_on: 'Grand Total',
    __wmn_pricing_rule_invoice_discount_total: 110,
    __wmn_pricing_rule_apply_on: 'Grand Total',
    __wmn_pricing_rule_percentage: 50,
    __wmn_pricing_rule_discount_amount_field: 0,
    __wmn_promotion_invoice_discount_total: 0,
    __wmn_coupon_discount_total: 0,
  };
  const ctrl = {
    frm: { doc },
    cart: { update_totals_section() {}, wmn_refresh_discount_breakdown() {} },
    wmn_has_manual_additional_discount: methods.wmn_has_manual_additional_discount,
  };
  await methods.wmn_sync_pos_invoice_discount_fields.call(ctrl);
  approx(doc.additional_discount_percentage, 50, 'Transaction Pricing Rule percentage must be preserved');
  approx(doc.discount_amount, 110, 'Transaction Pricing Rule amount must be preserved');

  const amountRuleDoc = {
    additional_discount_percentage: 0,
    discount_amount: 25,
    base_discount_amount: 25,
    apply_discount_on: 'Grand Total',
    __wmn_pricing_rule_invoice_discount_total: 25,
    __wmn_pricing_rule_apply_on: 'Grand Total',
    __wmn_pricing_rule_percentage: 0,
    __wmn_pricing_rule_discount_amount_field: 25,
    __wmn_promotion_invoice_discount_total: 0,
    __wmn_coupon_discount_total: 0,
  };
  const ctrl2 = {
    frm: { doc: amountRuleDoc },
    cart: { update_totals_section() {}, wmn_refresh_discount_breakdown() {} },
    wmn_has_manual_additional_discount: methods.wmn_has_manual_additional_discount,
  };
  await methods.wmn_sync_pos_invoice_discount_fields.call(ctrl2);
  approx(amountRuleDoc.additional_discount_percentage, 0, 'Fixed-amount Pricing Rule percentage remains zero');
  approx(amountRuleDoc.discount_amount, 25, 'Fixed-amount Pricing Rule amount must be preserved');

  console.log('WMN_DISCOUNT_NATIVE_TRANSACTION_FIELDS_PASS');
}
run().catch((e) => { console.error(e); process.exit(1); });
