const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.resolve(__dirname, "../offline_payment.js"), "utf8");
const start = src.indexOf("function wmn_payment_key_value(");
const end = src.indexOf("function wmn_invoice_payment_total(", start);
assert.ok(start >= 0 && end > start, "Keypad value editor must exist");
const edit = new Function(`${src.slice(start, end)}\nreturn wmn_payment_key_value;`)();

assert.equal(edit("0", "5", false, 0, true), "5", "First key replaces the selected amount");
assert.equal(edit("5", "6", false, 0, false), "56", "Digits append to the active amount");
assert.equal(edit("5", ".", false, 0, false), "5.", "Decimal input remains editable");
assert.equal(edit("56", "back", false, 0, false), "5", "Backspace edits only the active value");
assert.equal(edit("56", "clear", false, 0, false), "0", "Clear resets active value");
assert.equal(edit("0", "remaining", false, 25, false), "25", "Remaining fills the unpaid amount");
assert.equal(edit("0", "remaining", true, 25, false), "-25", "Refund keypad keeps the negative sign");

assert.match(src, /\.wmn-offline-payment-amount"?,\s*function/, "Amount focus must select a keypad target");
assert.match(src, /\.trigger\("input"\)/, "Keypad updates must run normal payment calculations");
const css = fs.readFileSync(path.resolve(__dirname, "../../../../../../../../public/css/wmn_pos.css"), "utf8");
assert.match(css, /\.wmn-payment-keypad\[hidden\]\s*\{/, "Keypad must remain hidden until an amount is selected");
console.log("WMN_OFFLINE_PAYMENT_KEYPAD_PASS");
