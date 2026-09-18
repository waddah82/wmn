const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const renderer = fs.readFileSync(path.join(__dirname, "pdf_renderer.js"), "utf8");
const start = renderer.indexOf("function wmn_get_receipt_print_format_source(printConfig, printFormat)");
const end = renderer.indexOf("function wmn_uses_wmn_raw_receipt", start);
assert.ok(start >= 0 && end > start, "Receipt routing functions must exist");
const source = renderer.slice(start, end);
const route = new Function("window", `${source}\nreturn wmn_get_receipt_print_format_source;`)({
    cur_pos: { settings: { print_format: "pos raw" } },
});

assert.equal(route({ method: "legacy_bridge" }, { name: "pos raw", raw_printing: 0 }),
    "erpnext_print_format", "A printer method or format name must not force RAW");
assert.equal(route({ method: "browser" }, { name: "Receipt", raw_printing: 1 }),
    "erpnext_raw", "The selected ERPNext Print Format checkbox must enable RAW");
assert.equal(route({ method: "legacy_bridge", receipt_print_format_source: "WMN Raw Print Format" },
    { name: "Receipt", raw_printing: 0 }), "erpnext_print_format",
    "Old saved printer source must not override the Print Format checkbox");

const printSettings = fs.readFileSync(path.join(__dirname, "print_service.js"), "utf8");
assert.ok(!printSettings.includes('options: "ERPNext Print Format\\nWMN Raw Print Format"'),
    "Printer settings must not offer a misleading WMN RAW source selector");
const pastSummary = fs.readFileSync(path.resolve(__dirname, "../../../components/past_order_summary/methods.js"), "utf8");
assert.ok(!pastSummary.includes("wmn_uses_wmn_raw_receipt()"),
    "Recent-order printing must not bypass the selected Print Format checkbox");

const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../../../../../../fixtures/print_format.json"), "utf8"));
const receipt = fixture.find((row) => row.name === "pos raw");
assert.ok(receipt, "Supplied POS receipt must exist");
assert.ok(!receipt.html.includes("Powered by XPOS"), "Supplied receipt must not advertise XPOS");
assert.ok(String(receipt.raw_commands || "").trim(), "Supplied receipt needs an ERPNext RAW template");
assert.ok(receipt.raw_commands.includes("Invoice: {{ doc.name }}"),
    "RAW receipt must show the ERPNext invoice number, not only the counter");
for (const field of ["item.item_code", "doc.loyalty_points", "doc.pos_notes"]) {
    assert.ok(receipt.raw_commands.includes(field), `RAW receipt must preserve ${field} content from HTML`);
}
assert.ok(receipt.raw_commands.indexOf("print_inv_barcode,56") < receipt.raw_commands.indexOf("Thank you"),
    "RAW barcode should appear before the footer like HTML");
const barcodeSource = fs.readFileSync(path.resolve(__dirname, "../barcode/invoice_barcode.js"), "utf8");
const barcodeStart = barcodeSource.indexOf("function decorateRawText(rawText, doc, config)");
const barcodeEnd = barcodeSource.indexOf("function browserRawHtml(", barcodeStart);
assert.ok(barcodeStart >= 0 && barcodeEnd > barcodeStart);
const decorate = new Function("getPrintConfig", "isPrintEnabled", "payloadFromDoc", "escPosBarcode",
    `${barcodeSource.slice(barcodeStart, barcodeEnd)}\nreturn decorateRawText;`)(
    () => ({}), () => true, () => "INV-1", (_payload, cfg) => `<BAR:${cfg.invoice_barcode_height}>`,
);
assert.equal(decorate("HEAD\nprint_inv_barcode,56\nFOOT", {}, {}), "HEAD\n<BAR:56>\nFOOT",
    "RAW barcode marker must print once at its position, not as literal text plus a second barcode");
const browserStart = barcodeSource.indexOf("function browserRawHtml(rawText, doc, config)");
const browserEnd = barcodeSource.indexOf("ns.Services.Barcode.InvoiceBarcode =", browserStart);
const browserRawHtml = new Function("getPrintConfig", "escapeHtml", "buildHtmlBlock",
    `${barcodeSource.slice(browserStart, browserEnd)}\nreturn browserRawHtml;`)(
    () => ({}), (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
    () => '<div class="wmn-invoice-barcode">BAR</div>',
);
const browserReceipt = browserRawHtml("HEAD\nprint_inv_barcode,56\nFOOT", {}, {});
assert.ok(!browserReceipt.includes("print_inv_barcode"), "Browser receipt must not print the barcode command literally");
assert.ok(browserReceipt.indexOf("HEAD") < browserReceipt.indexOf("wmn-invoice-barcode") &&
    browserReceipt.indexOf("wmn-invoice-barcode") < browserReceipt.indexOf("FOOT"),
    "Browser barcode must occupy the RAW marker position");
assert.match(browserReceipt, /width:\s*80mm/, "Browser RAW receipt must use thermal-paper width");
console.log("WMN_RECEIPT_PARITY_PASS");
