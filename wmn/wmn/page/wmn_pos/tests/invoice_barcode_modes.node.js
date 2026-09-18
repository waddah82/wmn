const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = {
    window: { WMN_POS: { Services: {} } },
    cint: Number,
    __: (value) => value,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../wmn/support/services/barcode/invoice_barcode.js"), "utf8"), context);
const barcode = context.window.WMN_POS.Services.Barcode.InvoiceBarcode;
const doc = { wmn_receipt_opening_entry: "POS-OPE-2026-00001", wmn_receipt_no: "23" };
const render = (mode) => barcode.decorateRawText("print_inv_barcode,56", doc, {
    show_invoice_barcode: 1,
    invoice_barcode_symbology: mode,
});

assert.ok(render("code39").includes("\x1dk\x45\x0c260000100023"), "Code39 must encode the numeric receipt directly");
assert.ok(render("code128_b").includes("\x1dk\x49\x0e{B260000100023"), "Code128-B must encode the full receipt text");
assert.ok(render("code128_c").includes("\x1dk\x49\x08{C\x1a\x00\x00\x0a\x00\x17"), "Code128-C must encode numeric pairs");
assert.ok(render("auto").includes("\x1dk\x49\x08{C"), "Default automatic mode must remain Code128-C for even digits");
assert.throws(() => barcode.decorateRawText("print_inv_barcode,56", { wmn_invoice_uid: "WMNINV-12345678901234567890" }, {
    show_invoice_barcode: 1, invoice_barcode_symbology: "code128_c",
}), /digits/i, "Code128-C must reject non-numeric receipts");
console.log("WMN_INVOICE_BARCODE_MODES_PASS");
