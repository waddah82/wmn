const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function flt(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function cint(value) {
    const number = parseInt(value, 10);
    return Number.isFinite(number) ? number : 0;
}

global.flt = flt;
global.cint = cint;
global.cstr = (value) => String(value ?? "");
global.window = {
    WMN_POS: { Features: { Return: {} } },
    cur_pos: null,
};
global.frappe = {
    utils: { escape_html: (value) => String(value ?? "") },
    throw: (value) => { throw new Error(String(value)); },
};
global.document = { createElement: () => ({}) };
global.navigator = { onLine: false };
global.__ = (value) => value;
global.format_currency = (value) => String(value);
global.wmn_t = (en) => en;
global.wmn_msg = (en) => en;

const posRoot = path.resolve(__dirname, "../../..");
function load(relativePath) {
    vm.runInThisContext(
        fs.readFileSync(path.join(posRoot, relativePath), "utf8"),
        { filename: relativePath }
    );
}

load("features/return/return.common.js");
load("features/return/return.offline.js");
load("services/offline/document_adapter.js");
load("services/payment/offline_payment.js");

const ReturnOffline = window.WMN_POS.Features.Return.Offline;

function makeSource(overrides = {}) {
    return Object.assign({
        doctype: "Sales Invoice",
        name: "SINV-FIN-PARTIAL",
        customer: "CUST-1",
        customer_name: "Customer 1",
        docstatus: 1,
        is_return: 0,
        is_pos: 1,
        conversion_rate: 1,
        apply_discount_on: "Grand Total",
        additional_discount_percentage: 0,
        discount_amount: 22,
        base_discount_amount: 22,
        total_qty: 2,
        total: 200,
        net_total: 180,
        base_total: 200,
        base_net_total: 180,
        total_taxes_and_charges: 18,
        base_total_taxes_and_charges: 18,
        grand_total: 198,
        base_grand_total: 198,
        rounded_total: 198,
        base_rounded_total: 198,
        paid_amount: 198,
        base_paid_amount: 198,
        outstanding_amount: 0,
        items: [{
            name: "SRC-ROW-1",
            item_code: "A",
            qty: 2,
            stock_qty: 2,
            conversion_factor: 1,
            rate: 100,
            price_list_rate: 100,
            amount: 200,
            net_rate: 90,
            net_amount: 180,
            distributed_discount_amount: 20,
            base_rate: 100,
            base_amount: 200,
            base_net_rate: 90,
            base_net_amount: 180,
        }],
        taxes: [{
            idx: 1,
            charge_type: "On Net Total",
            account_head: "VAT - TC",
            rate: 10,
            tax_amount: 20,
            base_tax_amount: 20,
            tax_amount_after_discount_amount: 18,
            base_tax_amount_after_discount_amount: 18,
            total: 198,
            base_total: 198,
        }],
        payments: [{
            mode_of_payment: "Cash",
            type: "Cash",
            account: "Cash - TC",
            default: 1,
            amount: 198,
            base_amount: 198,
        }],
    }, overrides);
}

const source = makeSource();
const returnDoc = {
    doctype: "Sales Invoice",
    name: "OFFLINE-RETURN-PARTIAL",
    is_pos: 1,
    conversion_rate: 1,
    items: [],
    taxes: [],
    payments: [],
};
ReturnOffline.buildReturnDocument(source, returnDoc, {
    items: [{
        source_row: source.items[0],
        source_qty: 2,
        returned_qty: 0,
        remaining_qty: 1,
    }],
});
wmn_recalculate_offline_doc(returnDoc);

assert(returnDoc.total === -100, "Partial return gross total must follow negative source rate");
assert(returnDoc.discount_amount === -22, "Native fixed return discount must remain negative");
assert(returnDoc.net_total === -80, "Fixed Grand Total discount must be distributed once");
assert(returnDoc.total_taxes_and_charges === -8, "Tax after return discount must be negative");
assert(returnDoc.grand_total === -88, "Partial return grand total must match native-style calculation");
assert(returnDoc.items[0].distributed_discount_amount === -20, "Return row distributed discount must be negative");
assert(returnDoc.items[0].net_rate === 80, "Return item net rate must not double-apply source discount");

wmn_reconcile_offline_return_payment_before_dialog(returnDoc, returnDoc.payments, false);
assert(returnDoc.payments[0].amount === -88, "Single source MOP must receive current partial refund total");
wmn_recalculate_offline_doc(returnDoc);
assert(returnDoc.paid_amount === -88, "Partial return paid amount must follow reconciled refund");
assert(returnDoc.outstanding_amount === 0, "Full refund of partial return must have zero outstanding");

const multiSource = makeSource({
    name: "SINV-MULTI-MOP",
    payments: [
        { mode_of_payment: "Cash", type: "Cash", account: "Cash - TC", default: 1, amount: 100, base_amount: 100 },
        { mode_of_payment: "Card", type: "Bank", account: "Bank - TC", default: 0, amount: 98, base_amount: 98 },
    ],
});
const multiReturn = {
    doctype: "Sales Invoice",
    name: "OFFLINE-RETURN-MULTI",
    is_pos: 1,
    conversion_rate: 1,
    items: [],
    taxes: [],
    payments: [],
};
ReturnOffline.buildReturnDocument(multiSource, multiReturn, {
    items: [{ source_row: multiSource.items[0], source_qty: 2, returned_qty: 0, remaining_qty: 1 }],
});
wmn_recalculate_offline_doc(multiReturn);
wmn_reconcile_offline_return_payment_before_dialog(multiReturn, multiReturn.payments, false);
assert(multiReturn.payments.find((row) => row.mode_of_payment === "Cash").amount === -88,
    "Multiple source MOPs must fall back to default MOP like ERPNext");
assert(multiReturn.payments.find((row) => row.mode_of_payment === "Card").amount === 0,
    "Non-default MOP must be zeroed during initial partial-return reconciliation");

const deductSource = makeSource({
    name: "SINV-DEDUCT-TAX",
    discount_amount: 0,
    base_discount_amount: 0,
    total: 200,
    net_total: 200,
    grand_total: 180,
    rounded_total: 180,
    paid_amount: 180,
    base_paid_amount: 180,
    items: [{
        name: "SRC-ROW-D",
        item_code: "D",
        qty: 2,
        stock_qty: 2,
        conversion_factor: 1,
        rate: 100,
        price_list_rate: 100,
        amount: 200,
        net_rate: 100,
        net_amount: 200,
        distributed_discount_amount: 0,
        base_rate: 100,
        base_amount: 200,
        base_net_rate: 100,
        base_net_amount: 200,
    }],
    taxes: [{
        idx: 1,
        charge_type: "On Net Total",
        account_head: "Deduction - TC",
        rate: 10,
        add_deduct_tax: "Deduct",
        tax_amount: 20,
        tax_amount_after_discount_amount: 20,
        total: 180,
    }],
    payments: [{ mode_of_payment: "Cash", default: 1, amount: 180, base_amount: 180 }],
});
const deductReturn = {
    doctype: "Sales Invoice",
    name: "OFFLINE-RETURN-DEDUCT",
    is_pos: 1,
    conversion_rate: 1,
    items: [], taxes: [], payments: [],
};
ReturnOffline.buildReturnDocument(deductSource, deductReturn, {
    items: [{ source_row: deductSource.items[0], source_qty: 2, returned_qty: 0, remaining_qty: 1 }],
});
wmn_recalculate_offline_doc(deductReturn);
assert(deductReturn.net_total === -100, "Deduction-tax return net total must remain negative");
assert(deductReturn.total_taxes_and_charges === 10, "Deduct tax contribution must reverse sign in return total");
assert(deductReturn.grand_total === -90, "Deduct tax must match ERPNext cumulative-total sign semantics");

console.log("WMN_RETURN_FINANCIAL_REGRESSION_PASS");
