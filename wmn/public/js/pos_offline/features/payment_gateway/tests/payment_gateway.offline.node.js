const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const lanMapping = {
  enabled: 1,
  mode_of_payment: 'LAN Card',
  gateway: {
    name: 'LAN-GATEWAY',
    provider: 'Generic',
    model_family: 'GENERIC_ECR_HTTP',
    transport: 'ECR HTTP Bridge',
    connector_url: 'http://192.168.1.20:8787',
    timeout_ms: 60000,
    allow_refund: 1,
  },
};
const cloudMapping = {
  enabled: 1,
  mode_of_payment: 'Cloud Card',
  gateway: {
    name: 'CLOUD-GATEWAY',
    provider: 'Generic',
    model_family: 'GENERIC_CLOUD',
    transport: 'Cloud Server API',
    timeout_ms: 60000,
  },
};

const settings = {
  'payment_gateway_mappings::POS-TEST': [lanMapping, cloudMapping],
  payment_gateway_mappings: [lanMapping, cloudMapping],
};

global.window = {
  WMN_POS: { Features: { PaymentGateway: {} }, Services: { PaymentGateway: {} } },
  __wmn_pos_effective_offline: true,
  __wmn_pos_server_online: false,
  wmnPOSOffline: {
    getSetting: async (key) => settings[key],
    setSetting: async (key, value) => { settings[key] = value; },
  },
};
global.navigator = { onLine: true }; // LAN is available even though ERPNext is not.
global.wmn_is_pos_offline = () => true;
let serverCalls = 0;
let deviceCalls = 0;
global.frappe = { call: async () => { serverCalls += 1; throw new Error('ERPNext must not be called while offline'); } };

global.__ = (text) => text;

vm.runInThisContext(fs.readFileSync(__dirname + '/../payment_gateway.common.js', 'utf8'));
window.WMN_POS.Services.PaymentGateway.Providers = {
  Generic: {
    canRunLocally: (_action, profile) => profile.transport === 'ECR HTTP Bridge',
    deviceAction: async (_action, payload) => {
      deviceCalls += 1;
      return {
      status: 'Approved',
      transaction_id: 'LAN-TX-1',
      reference_number: 'LAN-RRN-1',
      authorization_code: 'LAN-AUTH',
      amount: payload.amount,
      };
    },
  },
};
vm.runInThisContext(fs.readFileSync(__dirname + '/../../../services/payment_gateway/payment_gateway_service.js', 'utf8'));
const Service = window.WMN_POS.Services.PaymentGateway.Service;

(async () => {
  const doc = {
    name: 'OFFLINE-TEST', pos_profile: 'POS-TEST', currency: 'SAR',
    payments: [{ mode_of_payment: 'LAN Card', amount: 50 }],
  };

  const availability = Service.availabilityForMapping(lanMapping, 'authorize');
  assert.equal(availability.available, true);
  assert.equal(availability.local, true);

  const approved = await Service.authorize(doc, 'LAN Card');
  assert.equal(approved.status, 'Approved');
  assert.equal(approved.amount, 50);
  assert.equal(approved.transaction_id, 'LAN-TX-1');
  assert.equal(approved.__wmn_server_record_pending, 1);
  assert.ok(approved.client_reference);
  assert.equal(serverCalls, 0);
  assert.equal(deviceCalls, 1);
  await Service.validateBeforeSubmit(doc);

  // Re-clicking the same approved LAN amount must not hit the terminal twice.
  const approvedAgain = await Service.authorize(doc, 'LAN Card');
  assert.equal(approvedAgain.transaction_id, 'LAN-TX-1');
  assert.equal(deviceCalls, 1);

  // The local approval must not change the cashier-entered amount.
  assert.equal(doc.payments[0].amount, 50);

  // Cloud/server transport remains unavailable when ERPNext is offline.
  const cloudDoc = {
    name: 'OFFLINE-CLOUD', pos_profile: 'POS-TEST', currency: 'SAR',
    payments: [{ mode_of_payment: 'Cloud Card', amount: 25 }],
  };
  const cloudAvailability = Service.availabilityForMapping(cloudMapping, 'authorize');
  assert.equal(cloudAvailability.available, false);
  await assert.rejects(
    () => Service.authorize(cloudDoc, 'Cloud Card'),
    /requires the ERPNext server connection/
  );
  assert.equal(serverCalls, 0);
  const offlinePaymentSource = fs.readFileSync(__dirname + '/../../../services/payment/offline_payment.js', 'utf8');
  assert.match(offlinePaymentSource, /wmn-offline-gateway-action/);
  assert.match(offlinePaymentSource, /Processing\.\.\./);
  assert.match(offlinePaymentSource, /authorizeWithLocalCredentialRetry/);
  assert.match(offlinePaymentSource, /validateBeforeSubmit/);

  console.log('WMN_PAYMENT_GATEWAY_ERP_OFFLINE_LAN_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
