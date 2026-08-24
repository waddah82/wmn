const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

global.window = { WMN_POS: { Features: { PaymentGateway: {} }, Services: { PaymentGateway: {} } }, __wmn_pos_effective_offline: true };
global.navigator = { onLine: false };
global.wmn_is_pos_offline = () => true;
global.frappe = { call: async () => { throw new Error('Network must not be called while offline'); } };

vm.runInThisContext(fs.readFileSync(__dirname + '/../payment_gateway.common.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(__dirname + '/../../../services/payment_gateway/payment_gateway_service.js', 'utf8'));
const Service = window.WMN_POS.Services.PaymentGateway.Service;

(async () => {
  const doc = {
    name: 'OFFLINE-TEST', pos_profile: 'POS-TEST', currency: 'SAR',
    payments: [{ mode_of_payment: 'Electronic Payment Test', amount: 50 }],
  };
  await assert.rejects(
    () => Service.authorize(doc, 'Electronic Payment Test'),
    /requires an online\/provider connection/
  );
  console.log('WMN_PAYMENT_GATEWAY_OFFLINE_FAIL_CLOSED_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
