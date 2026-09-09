const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function load(rel) {
  vm.runInThisContext(fs.readFileSync(__dirname + '/' + rel, 'utf8'), { filename: rel });
}

global.window = { WMN_POS: { Features: { PaymentGateway: {} }, Services: { PaymentGateway: {} } }, __wmn_pos_effective_offline: false };
global.navigator = { onLine: true };
global.wmn_is_pos_offline = () => false;

const mapping = {
  enabled: 1,
  mode_of_payment: 'Electronic Payment Test',
  gateway: {
    name: 'WMN TEST APPROVED',
    provider: 'WMN Test Gateway',
    model_family: 'TEST_APPROVED',
    transport: 'Cloud Server API',
    terminal_id: '',
    merchant_id: '',
    timeout_ms: 60000,
  },
};

let gatewayMode = 'TEST_APPROVED';
let authorizeCalls = [];
global.frappe = {
  call: async ({ method, args }) => {
    if (method === 'wmn.payment_gateway.api.get_pos_payment_gateways') {
      return { message: [mapping] };
    }
    if (method === 'wmn.payment_gateway.api.authorize') {
      const payload = JSON.parse(args.payload);
      authorizeCalls.push(payload);
      if (gatewayMode === 'TEST_APPROVED') {
        return { message: { status: 'Approved', transaction_id: 'TEST-TX', reference_number: 'TEST-RRN', authorization_code: 'TESTAUTH' } };
      }
      if (gatewayMode === 'TEST_DECLINED') {
        return { message: { status: 'Declined', message: 'Declined by test gateway' } };
      }
      if (gatewayMode === 'TEST_TIMEOUT') {
        return { message: { status: 'Timeout', message: 'Timed out' } };
      }
      throw new Error('Simulated provider error');
    }
    throw new Error(`Unexpected frappe.call: ${method}`);
  },
};

load('../payment_gateway.common.js');
load('../../../services/payment_gateway/payment_gateway_service.js');
const Service = window.WMN_POS.Services.PaymentGateway.Service;

(async () => {
  const full = {
    name: 'ACC-SINV-TEST-1', pos_profile: 'POS-TEST', currency: 'SAR',
    payments: [{ mode_of_payment: 'Electronic Payment Test', amount: 100 }],
  };
  gatewayMode = 'TEST_APPROVED';
  authorizeCalls = [];
  const approved = await Service.authorize(full, 'Electronic Payment Test');
  assert.equal(approved.status, 'Approved');
  assert.equal(approved.amount, 100);
  assert.equal(authorizeCalls.length, 1);
  assert.equal(authorizeCalls[0].amount, 100);
  await Service.validateBeforeSubmit(full);

  // User changes the payment amount after authorization: old approval must not validate.
  full.payments[0].amount = 90;
  await assert.rejects(() => Service.validateBeforeSubmit(full), /must be approved for 90/);

  // Re-authorizing the new user-entered amount must validate without resetting it.
  const approved90 = await Service.authorize(full, 'Electronic Payment Test');
  assert.equal(approved90.amount, 90);
  assert.equal(authorizeCalls[1].amount, 90);
  assert.equal(full.payments[0].amount, 90);
  await Service.validateBeforeSubmit(full);

  // Re-clicking an already approved unchanged amount must not authorize again.
  const approved90Again = await Service.authorize(full, 'Electronic Payment Test');
  assert.equal(approved90Again.amount, 90);
  assert.equal(authorizeCalls.length, 2);

  // Partial payment: gateway receives only its own row amount.
  const partial = {
    name: 'ACC-SINV-TEST-2', pos_profile: 'POS-TEST', currency: 'SAR',
    payments: [
      { mode_of_payment: 'Cash', amount: 40 },
      { mode_of_payment: 'Electronic Payment Test', amount: 60 },
    ],
  };
  const p = await Service.authorize(partial, 'Electronic Payment Test');
  assert.equal(p.amount, 60);
  assert.equal(authorizeCalls[2].amount, 60);
  assert.equal(partial.payments[0].amount, 40);
  assert.equal(partial.payments[1].amount, 60);
  await Service.validateBeforeSubmit(partial);

  // Declined / timeout / provider error must never create an approved authorization.
  for (const mode of ['TEST_DECLINED', 'TEST_TIMEOUT', 'TEST_ERROR']) {
    gatewayMode = mode;
    const doc = {
      name: `ACC-${mode}`, pos_profile: 'POS-TEST', currency: 'SAR',
      payments: [{ mode_of_payment: 'Electronic Payment Test', amount: 42.84 }],
    };
    await assert.rejects(() => Service.authorize(doc, 'Electronic Payment Test'));
    await assert.rejects(() => Service.validateBeforeSubmit(doc), /must be approved/);
  }

  console.log('WMN_PAYMENT_GATEWAY_LIFECYCLE_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
