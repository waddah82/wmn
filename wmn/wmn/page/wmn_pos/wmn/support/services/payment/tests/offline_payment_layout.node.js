const assert = require("assert");
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.resolve(__dirname, "../offline_payment.js"), "utf8");

const dialogStart = source.indexOf("async function wmn_show_offline_payment_dialog(ctrl)");
const dialogEnd = source.indexOf("\nasync function wmn_get_offline_existing_invoice_payment_context", dialogStart);
assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, "Offline payment dialog function must exist");
const dialogSource = source.slice(dialogStart, dialogEnd);
const rowsHtmlStart = dialogSource.indexOf("const rowsHtml =");
const rowsHtmlEnd = dialogSource.indexOf("\n\n            return new Promise", rowsHtmlStart);
assert.ok(rowsHtmlStart >= 0 && rowsHtmlEnd > rowsHtmlStart, "Offline payment rows template must exist");
const rowsHtml = dialogSource.slice(rowsHtmlStart, rowsHtmlEnd);
const paymentHtmlStart = dialogSource.indexOf('fieldname: "payment_html"');
const paymentHtmlEnd = dialogSource.indexOf("primary_action_label:", paymentHtmlStart);
assert.ok(paymentHtmlStart >= 0 && paymentHtmlEnd > paymentHtmlStart, "Offline payment HTML field must exist");
const paymentHtml = dialogSource.slice(paymentHtmlStart, paymentHtmlEnd);

for (const className of [
    "wmn-complete-order-layout",
    "wmn-payment-summary",
    "wmn-payment-workspace",
    "wmn-payment-methods",
    "wmn-payment-actions",
    "wmn-payment-paid-total",
    "wmn-payment-balance-total",
]) assert.ok(paymentHtml.includes(className), `Missing offline payment region: ${className}`);

for (const hook of [
    "data-payment-index",
    "wmn-offline-payment-amount",
    "wmn-offline-gateway-action",
]) assert.ok(rowsHtml.includes(hook), `Existing payment-row hook was removed from rowsHtml: ${hook}`);

for (const hook of [
    "wmn-offline-send-to-cashier-btn",
    "wmn-offline-sell-on-credit-btn",
]) assert.ok(paymentHtml.includes(hook), `Existing action hook was removed from payment HTML: ${hook}`);

assert.ok(paymentHtml.includes("wmn-payment-balance-label"), "Balance/change label must be updateable");
const updateStart = dialogSource.indexOf("const updatePaidTotal = () => {");
const updateEnd = dialogSource.indexOf("\n                d.$wrapper.on(\"input\"", updateStart);
assert.ok(updateStart >= 0 && updateEnd > updateStart, "Paid totals updater must exist");
const updateSource = dialogSource.slice(updateStart, updateEnd);
assert.match(updateSource, /const isChange = !isReturn && difference < 0/);
assert.match(updateSource, /const balance = isChange \? -difference : difference/);
assert.match(updateSource, /wmn_t\("Change Amount"/);

console.log("WMN_OFFLINE_PAYMENT_LAYOUT_PASS");
