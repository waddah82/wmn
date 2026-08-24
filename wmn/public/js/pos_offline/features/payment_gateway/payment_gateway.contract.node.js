const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

global.window = { WMN_POS: { Features: {}, Services: {} }, __wmn_pos_effective_offline: false };
global.navigator = { onLine: true };
vm.runInThisContext(fs.readFileSync(__dirname + "/payment_gateway.common.js", "utf8"));
vm.runInThisContext(fs.readFileSync(__dirname + "/../../services/payment_gateway/model_registry.js", "utf8"));
const C = window.WMN_POS.Features.PaymentGateway.Common;
const R = window.WMN_POS.Services.PaymentGateway.ModelRegistry;
assert.equal(C.money(10.129), 10.13);
assert.equal(C.paymentAmount({ payments: [{ mode_of_payment: "Card", amount: 42.5 }] }, "Card"), 42.5);
assert.equal(R.resolve("GEIDEA_SOFTPOS").transport, "SoftPOS SDK");
assert.equal(R.resolve("STC_SOFTPOS_SDK").provider, "STC SoftPOS");
assert.equal(R.resolve("GENERIC_ECR_WS").transport, "ECR WebSocket Bridge");
assert.equal(R.resolve("TEST_APPROVED").provider, "WMN Test Gateway");
assert.equal(R.resolve("TEST_DECLINED").transport, "Cloud Server API");
assert.equal(R.resolve("TEST_TIMEOUT").provider, "WMN Test Gateway");
console.log("WMN_PAYMENT_GATEWAY_CONTRACT_PASS");
