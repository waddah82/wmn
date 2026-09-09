const fs = require("fs");
const vm = require("vm");
const path = require("path");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

global.window = global;
global.flt = (value) => Number(value || 0);
global.cint = (value) => Number.parseInt(value || 0, 10) || 0;
global.frappe = { datetime: { get_today: () => "2026-08-25" } };

global.navigator = { onLine: false };
global.document = {};
global.$ = function () { return {}; };

const file = path.resolve(__dirname, "../document_adapter.js");
vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: "document_adapter.js" });

assert(wmn_normalize_offline_tax_row_id("On Net Total", 0) === "", "On Net Total must never persist row_id=0.");
assert(wmn_normalize_offline_tax_row_id("On Net Total", "0") === "", "On Net Total must clear string row_id=0.");
assert(wmn_normalize_offline_tax_row_id("Actual", "2") === "", "Actual tax must not retain a previous-row reference.");
assert(wmn_normalize_offline_tax_row_id("On Item Quantity", "3") === "", "On Item Quantity must not retain a previous-row reference.");
assert(wmn_normalize_offline_tax_row_id("On Previous Row Amount", 1) === "1", "Previous Row Amount must preserve a valid reference.");
assert(wmn_normalize_offline_tax_row_id("On Previous Row Total", "2") === "2", "Previous Row Total must preserve a valid reference.");
assert(wmn_normalize_offline_tax_row_id("On Previous Row Total", "0") === "", "Previous-row reference zero is invalid and must be empty.");

const normal = wmn_make_offline_tax_row({ charge_type: "On Net Total", row_id: 0, account_head: "VAT" }, 0, { name: "INV", doctype: "Sales Invoice" });
assert(normal.row_id === "", "Offline tax row factory must store an empty row_id for non-reference taxes.");

const previous = wmn_make_offline_tax_row({ charge_type: "On Previous Row Total", row_id: 1, account_head: "CESS" }, 1, { name: "INV", doctype: "Sales Invoice" });
assert(previous.row_id === "1", "Offline tax row factory must preserve previous-row references as text.");

console.log("WMN_OFFLINE_TAX_ROW_REFERENCE_PASS");
