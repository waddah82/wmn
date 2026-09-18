const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let html = "";
const frame = {
    setAttribute() {},
    contentDocument: { open() {}, write(value) { html = value; }, close() {} },
    contentWindow: { focus() {}, print() {} },
    remove() {},
};
const context = {
    window: {
        print() {},
        WMN_POS: { Services: { Printing: { Adapters: {} }, Barcode: {
            InvoiceBarcode: { browserRawHtml: (raw, doc) => `<receipt>${raw}:${doc.name}</receipt>` },
        } } },
    },
    document: { createElement: () => frame, body: { appendChild() {} } },
    setTimeout: (fn) => { fn(); return 0; },
    console,
};
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "browser_print_adapter.js"), "utf8"), context);

(async () => {
    await context.window.WMN_POS.Services.Printing.Adapters.Browser.sendRaw(
        "\x1d\x6bBARCODE", {}, { doc: { name: "INV-1" }, raw_text: "HEAD\nprint_inv_barcode,56\nFOOT" },
    );
    assert.ok(html.includes("<receipt>HEAD\nprint_inv_barcode,56\nFOOT:INV-1</receipt>"),
        "Browser RAW printing must render the original receipt, not ESC/POS bytes");
    assert.ok(!html.includes("BARCODE"), "Binary barcode commands must never enter browser HTML");
    console.log("WMN_BROWSER_RAW_ADAPTER_PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
