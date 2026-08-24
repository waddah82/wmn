const fs = require('fs');
const vm = require('vm');
const path = require('path');

function fail(message) { throw new Error(message); }
function eq(a, b, label) { if (a !== b) fail(`${label}: ${a} != ${b}`); }
function approx(a, b, label) { if (Math.abs(Number(a)-Number(b)) > 1e-9) fail(`${label}: ${a} != ${b}`); }

let effectiveSettings = {};
global.window = {
  WMN_POS: {
    Features: { Discount: {} },
    Services: { Settings: { POSProfileSettings: { getEffective: () => effectiveSettings } } },
  },
};
global.flt = (v) => Number(v || 0);
global.cint = (v) => parseInt(v || 0, 10) || 0;
global.wmn_controller_uses_offline_flow = () => false;

const file = path.join(__dirname, '..', 'discount.common.js');
vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
const common = window.WMN_POS.Features.Discount.Common;
const methods = common.ControllerMethods;

function baseDoc() {
  return {
    pos_profile: 'POS-1',
    conversion_rate: 1,
    apply_discount_on: 'Net Total',
    additional_discount_percentage: 10,
    discount_amount: 10,
    base_discount_amount: 10,
    items: [{ amount: 100, net_amount: 90, distributed_discount_amount: 10 }],
    __wmn_pricing_rule_invoice_discount_total: 10,
    __wmn_pricing_rule_apply_on: 'Net Total',
    __wmn_pricing_rule_percentage: 10,
    __wmn_pricing_rule_discount_amount_field: 0,
    __wmn_promotion_invoice_discount_total: 20,
    __wmn_promotion_discount_total: 20,
    __wmn_coupon_discount_total: 5,
    __wmn_coupon_apply_on: 'Net Total',
  };
}

function controller(doc) {
  return {
    frm: {
      doc,
      dirty() {},
      cscript: {
        async calculate_taxes_and_totals() {
          if (doc.additional_discount_percentage) {
            const base = doc.items.reduce((sum, row) => sum + Number(row.net_amount || row.amount || 0) + Number(row.distributed_discount_amount || 0), 0);
            doc.discount_amount = base * Number(doc.additional_discount_percentage || 0) / 100;
          }
        },
      },
    },
    cart: { update_totals_section() {}, wmn_refresh_discount_breakdown() {} },
    wmn_has_manual_additional_discount: methods.wmn_has_manual_additional_discount,
  };
}

async function run() {
  // Legacy/current behavior remains available only when explicitly selected by settings.
  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Combine',
    combined_discount_representation: 'Amount Only',
  };
  let doc = baseDoc();
  let result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  eq(result.mode, 'combine_amount', 'legacy combine mode');
  approx(doc.additional_discount_percentage, 0, 'legacy amount-only percentage');
  approx(doc.discount_amount, 35, 'legacy combined amount');

  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Pricing Rule Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  eq(result.mode, 'winner', 'pricing winner mode');
  approx(doc.additional_discount_percentage, 10, 'pricing percentage preserved');
  approx(doc.discount_amount, 10, 'pricing amount recalculated by totals');

  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Promotion Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  approx(doc.additional_discount_percentage, 0, 'promotion winner amount-only percentage');
  approx(doc.discount_amount, 20, 'promotion winner amount');

  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Coupon Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  approx(doc.discount_amount, 5, 'coupon winner amount');

  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Combine',
    combined_discount_representation: 'Percentage Equivalent (Net Total)',
  };
  doc = baseDoc();
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  eq(result.mode, 'combine_percentage', 'percentage combine mode');
  approx(doc.additional_discount_percentage, 35, 'equivalent percentage');
  approx(doc.discount_amount, 35, 'equivalent amount after totals');
  eq(doc.apply_discount_on, 'Net Total', 'percentage equivalent base');

  // Pair policies are independent.
  effectiveSettings = {
    pricing_rule_promotion_policy: 'Promotion Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  doc.__wmn_coupon_discount_total = 0;
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  approx(doc.discount_amount, 20, 'pricing + promotion policy');

  effectiveSettings = {
    pricing_rule_coupon_policy: 'Pricing Rule Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  doc.__wmn_promotion_invoice_discount_total = 0;
  doc.__wmn_promotion_discount_total = 0;
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  approx(doc.additional_discount_percentage, 10, 'pricing + coupon percentage preserved');
  approx(doc.discount_amount, 10, 'pricing + coupon pricing wins');

  effectiveSettings = {
    promotion_coupon_policy: 'Coupon Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  doc.__wmn_pricing_rule_invoice_discount_total = 0;
  doc.__wmn_pricing_rule_percentage = 0;
  doc.additional_discount_percentage = 0;
  doc.discount_amount = 0;
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  approx(doc.discount_amount, 5, 'promotion + coupon policy');

  // Returns ignore today's policy and preserve source financial fields.
  effectiveSettings = {
    pricing_rule_promotion_coupon_policy: 'Coupon Wins',
    combined_discount_representation: 'Amount Only',
  };
  doc = baseDoc();
  doc.is_return = 1;
  doc.additional_discount_percentage = -10;
  doc.discount_amount = -10;
  result = await methods.wmn_sync_pos_invoice_discount_fields.call(controller(doc));
  eq(result.preserved_return_pricing, true, 'return bypass');
  approx(doc.additional_discount_percentage, -10, 'return percentage preserved');
  approx(doc.discount_amount, -10, 'return amount preserved');

  console.log('WMN_DISCOUNT_COMPOSITION_POLICY_PASS');
}

run().catch((e) => { console.error(e); process.exit(1); });
