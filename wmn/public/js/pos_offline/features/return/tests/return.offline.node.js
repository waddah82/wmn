/* Node regression tests for the Offline return state owner. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
}

global.window = { WMN_POS: { Features: {} } };
global.cint = (value) => parseInt(value || 0, 10) || 0;
global.flt = (value) => Number(value || 0) || 0;

const source = {
    doctype: "Sales Invoice",
    name: "SINV-0001",
    __wmn_queue_offline_id: "POS-OFF-1",
    docstatus: 1,
    __wmn_local_submitted: true,
    is_return: 0,
    items: [
        { name: "SRC-1", idx: 1, item_code: "A", uom: "Nos", warehouse: "Main", qty: 5 },
        { name: "SRC-2", idx: 2, item_code: "B", uom: "Nos", warehouse: "Main", qty: 2 },
    ],
};

const rows = [
    {
        invoice: {
            is_return: 1,
            return_against: "SINV-0001",
            items: [
                { item_code: "A", uom: "Nos", warehouse: "Main", qty: -2, sales_invoice_item: "SRC-1" },
            ],
        },
    },
];

window.wmnPOSOffline = {
    STORES: { invoice_queue: "invoice_queue" },
    async getAllCached(storeName) {
        assert(storeName === "invoice_queue", "Unexpected store");
        return rows;
    },
};

const featureRoot = path.resolve(__dirname, "..");
vm.runInThisContext(fs.readFileSync(path.join(featureRoot, "return.common.js"), "utf8"));
vm.runInThisContext(fs.readFileSync(path.join(featureRoot, "return.offline.js"), "utf8"));

(async () => {
    const offlineReturn = window.WMN_POS.Features.Return.Offline;
    let state = await offlineReturn.getReturnState(source);

    assert(state.returnable === true, "Partially returned source must remain returnable");
    assert(state.items[0].returned_qty === 2, "Returned quantity must come from local return rows");
    assert(state.items[0].remaining_qty === 3, "Remaining quantity must be source minus returns");
    assert(state.items[1].remaining_qty === 2, "Unrelated item quantity must remain unchanged");

    rows.push({
        invoice: {
            is_return: 1,
            return_against: "SERVER-NAME",
            __wmn_return_against_offline_id: "POS-OFF-1",
            items: [
                { item_code: "A", uom: "Nos", warehouse: "Main", qty: -3, sales_invoice_item: "SRC-1" },
                { item_code: "B", uom: "Nos", warehouse: "Main", qty: -2, sales_invoice_item: "SRC-2" },
            ],
        },
    });

    state = await offlineReturn.getReturnState(source);
    assert(state.returnable === false, "Fully returned source must not remain returnable");
    assert(state.items.every((row) => row.remaining_qty === 0), "All remaining quantities must be zero");

    const financialSource = {
        doctype: "Sales Invoice",
        name: "SINV-FIN-1",
        customer: "CUST-1",
        customer_name: "Customer 1",
        docstatus: 1,
        is_return: 0,
        apply_discount_on: "Grand Total",
        additional_discount_percentage: 0,
        discount_amount: 11,
        base_discount_amount: 11,
        total_qty: 1,
        total: 100,
        net_total: 90,
        base_total: 100,
        base_net_total: 90,
        total_taxes_and_charges: 9,
        base_total_taxes_and_charges: 9,
        grand_total: 99,
        base_grand_total: 99,
        rounded_total: 99,
        base_rounded_total: 99,
        paid_amount: 99,
        base_paid_amount: 99,
        outstanding_amount: 0,
        items: [{
            name: "FIN-ROW-1",
            item_code: "A",
            uom: "Nos",
            warehouse: "Main",
            qty: 1,
            stock_qty: 1,
            rate: 100,
            price_list_rate: 100,
            amount: 100,
            net_rate: 90,
            net_amount: 90,
            distributed_discount_amount: 10,
            base_rate: 100,
            base_amount: 100,
            base_net_rate: 90,
            base_net_amount: 90,
            conversion_factor: 1,
        }],
        taxes: [{
            idx: 1,
            charge_type: "On Net Total",
            account_head: "VAT - TC",
            rate: 10,
            tax_amount: 10,
            base_tax_amount: 10,
            tax_amount_after_discount_amount: 9,
            base_tax_amount_after_discount_amount: 9,
            total: 99,
            base_total: 99,
        }],
        payments: [{
            mode_of_payment: "Cash",
            type: "Cash",
            account: "Cash - TC",
            amount: 99,
            base_amount: 99,
        }],
    };
    const fullFinancialState = {
        items: [{
            source_row: financialSource.items[0],
            source_qty: 1,
            returned_qty: 0,
            remaining_qty: 1,
        }],
    };
    const returnDoc = { doctype: "Sales Invoice", name: "OFFLINE-RETURN-1", items: [], taxes: [], payments: [] };
    offlineReturn.buildReturnDocument(financialSource, returnDoc, fullFinancialState, { zero_payment_return: false });

    assert(returnDoc.ignore_pricing_rule === 1, "Offline return must ignore current pricing rules like ERPNext");
    assert(returnDoc.discount_amount === -11, "Fixed invoice discount must be reversed");
    assert(returnDoc.items[0].qty === -1, "Return quantity must be negative");
    assert(returnDoc.items[0].net_rate === 100, "Return must start before invoice-level distributed discount");
    assert(returnDoc.items[0].distributed_discount_amount === 0, "Source distributed discount must not be applied twice");
    assert(returnDoc.payments[0].amount === -99, "Paid return payment must be reversed");
    assert(offlineReturn.applyExactFinancialSnapshotIfEligible(returnDoc) === true, "Full return must use exact source financial snapshot");
    assert(returnDoc.total === -100, "Full return total must exactly reverse source total");
    assert(returnDoc.net_total === -90, "Full return net total must exactly reverse source net total");
    assert(returnDoc.total_taxes_and_charges === -9, "Full return taxes must exactly reverse source taxes");
    assert(returnDoc.grand_total === -99, "Full return grand total must exactly reverse source grand total");
    assert(returnDoc.taxes[0].tax_amount_after_discount_amount === -9, "Tax after discount must be reversed");
    assert(returnDoc.paid_amount === -99, "Paid amount must remain the negative payment rows total");

    const partialReturnDoc = { doctype: "Sales Invoice", name: "OFFLINE-RETURN-2", items: [], taxes: [], payments: [] };
    offlineReturn.buildReturnDocument(financialSource, partialReturnDoc, {
        items: [{
            source_row: financialSource.items[0],
            source_qty: 1,
            returned_qty: 0,
            remaining_qty: 0.5,
        }],
    });
    assert(partialReturnDoc.items[0].qty === -0.5, "Partial return must preserve requested negative quantity");
    assert(partialReturnDoc.__wmn_return_exact_source_snapshot_eligible === false, "Partial return must be recalculated, not forced to full snapshot");
    assert(offlineReturn.applyExactFinancialSnapshotIfEligible(partialReturnDoc) === false, "Partial return cannot use full source totals");

    const projectRoot = path.resolve(__dirname, "../../..");
    const discountOwner = fs.readFileSync(path.join(projectRoot, "features/discount/discount.common.js"), "utf8");
    const controllerOwner = fs.readFileSync(path.join(projectRoot, "overrides/controller/controller.methods.js"), "utf8");
    assert(discountOwner.includes("preserved_return_pricing: true"), "Discount composer must preserve return pricing");
    assert(controllerOwner.includes("await super.make_return_invoice(doc)"), "Online return must delegate construction to ERPNext");
    console.log("WMN_RETURN_OFFLINE_REGRESSION_PASS");
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
