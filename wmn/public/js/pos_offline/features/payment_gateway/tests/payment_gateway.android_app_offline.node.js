const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function load(path) {
  vm.runInThisContext(fs.readFileSync(path, 'utf8'), { filename: path });
}

const mapping = {
  enabled: 1,
  mode_of_payment: 'geidea',
  gateway: {
    name: 'GEIDEA-LAN',
    provider: 'Generic',
    model_family: 'GENERIC_ANDROID_APP',
    transport: 'Android App Bridge',
    connector_url: 'http://192.168.43.37:8787',
    bridge_provider: 'NEARPAY',
    timeout_ms: 60000,
    allow_partial_payment: 1,
    allow_refund: 1,
  },
};

const settings = {
  'payment_gateway_mappings::restaurant': [mapping],
  payment_gateway_mappings: [mapping],
  'payment_gateway_local_bridge_token::GEIDEA-LAN': 'DEVICE-SCOPED-TOKEN',
};

let serverCalls = 0;
let fetchCalls = [];

global.window = {
  WMN_POS: { Features: { PaymentGateway: {} }, Services: { PaymentGateway: {} } },
  __wmn_pos_effective_offline: true,
  __wmn_pos_server_online: false,
  location: { protocol: 'http:', href: 'http://erp.local/app' },
  wmnPOSOffline: {
    getSetting: async (key) => settings[key],
    setSetting: async (key, value) => { settings[key] = value; },
  },
};
global.navigator = { onLine: true };
global.wmn_is_pos_offline = () => true;
global.__ = (text) => text;
global.frappe = {
  call: async () => {
    serverCalls += 1;
    throw new Error('ERPNext must not be called by direct LAN Android App Bridge');
  },
};

global.fetch = async (url, options) => {
  fetchCalls.push({ url, options });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      status: 'approved',
      transaction_id: 'LOCAL-TX-1',
      rrn: 'LOCAL-RRN-1',
      authorization_code: 'LOCAL-AUTH-1',
      amount_minor: 4284,
    }),
  };
};

load(__dirname + '/../payment_gateway.common.js');
load(__dirname + '/../../../services/payment_gateway/providers/provider_base.js');
load(__dirname + '/../../../services/payment_gateway/providers/generic.js');
load(__dirname + '/../../../services/payment_gateway/payment_gateway_service.js');

const Service = window.WMN_POS.Services.PaymentGateway.Service;

(async () => {
  const doc = {
    name: 'OFFLINE-ANDROID-APP-1',
    pos_profile: 'restaurant',
    currency: 'SAR',
    payments: [{ mode_of_payment: 'geidea', amount: 42.84 }],
  };

  const availability = Service.availabilityForMapping(mapping, 'authorize');
  assert.equal(availability.available, true);
  assert.equal(availability.local, true);

  const result = await Service.authorize(doc, 'geidea');
  assert.equal(result.status, 'Approved');
  assert.equal(result.amount, 42.84);
  assert.equal(result.transaction_id, 'LOCAL-TX-1');
  assert.equal(result.__wmn_server_record_pending, 1);
  assert.equal(serverCalls, 0);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'http://192.168.43.37:8787/v1/payments/purchase');
  assert.equal(fetchCalls[0].options.headers['X-WMN-Bridge-Token'], 'DEVICE-SCOPED-TOKEN');

  const bridgePayload = JSON.parse(fetchCalls[0].options.body);
  assert.equal(bridgePayload.amount_minor, 4284);
  assert.equal(bridgePayload.currency, 'SAR');
  assert.equal(bridgePayload.provider, 'NEARPAY');
  assert.ok(bridgePayload.request_id);

  // Same approved amount must never hit the payment bridge twice.
  const again = await Service.authorize(doc, 'geidea');
  assert.equal(again.transaction_id, 'LOCAL-TX-1');
  assert.equal(fetchCalls.length, 1);
  assert.equal(doc.payments[0].amount, 42.84);
  await Service.validateBeforeSubmit(doc);

  // Missing local credential is an explicit local-device setup state, not an ERPNext call.
  settings['payment_gateway_local_bridge_token::GEIDEA-LAN'] = '';
  const missingTokenDoc = {
    name: 'OFFLINE-ANDROID-APP-2',
    pos_profile: 'restaurant',
    currency: 'SAR',
    payments: [{ mode_of_payment: 'geidea', amount: 10 }],
  };
  await assert.rejects(
    () => Service.authorize(missingTokenDoc, 'geidea'),
    (error) => error && error.code === 'WMN_LOCAL_BRIDGE_TOKEN_REQUIRED'
  );
  assert.equal(serverCalls, 0);
  assert.equal(fetchCalls.length, 1);

  // Online and Offline use the same direct device adapter. ERPNext is not part of authorization.
  global.wmn_is_pos_offline = () => false;
  window.__wmn_pos_effective_offline = false;
  window.__wmn_pos_server_online = true;
  frappe.call = async ({ method }) => {
    serverCalls += 1;
    if (method === 'wmn.payment_gateway.api.record_device_result') return { message: { status: 'Approved' } };
    throw new Error(`ERPNext must not authorize Android App Bridge payment: ${method}`);
  };
  settings['payment_gateway_local_bridge_token::GEIDEA-LAN'] = 'DEVICE-SCOPED-TOKEN';
  const onlineDoc = {
    name: 'ONLINE-ANDROID-APP-1',
    pos_profile: 'restaurant',
    currency: 'SAR',
    payments: [{ mode_of_payment: 'geidea', amount: 15 }],
  };
  const beforeOnlineFetch = fetchCalls.length;
  const onlineResult = await Service.authorize(onlineDoc, 'geidea');
  assert.equal(onlineResult.transaction_id, 'LOCAL-TX-1');
  assert.equal(fetchCalls.length, beforeOnlineFetch + 1);
  assert.equal(fetchCalls.at(-1).url, 'http://192.168.43.37:8787/v1/payments/purchase');
  const onlineBridgePayload = JSON.parse(fetchCalls.at(-1).options.body);
  assert.equal(onlineBridgePayload.amount_minor, 1500);

  // Server-side transaction logging is best-effort and happens only after device approval.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(serverCalls, 1);

  console.log('WMN_PAYMENT_GATEWAY_ANDROID_APP_DIRECT_DEVICE_PASS');
})().catch((error) => { console.error(error); process.exit(1); });
