const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const calls = [];
const qz = {
    websocket: { isActive: () => true, connect: async () => {} },
    printers: {
        getDefault: async () => "Default Printer",
        find: async () => ["Named Printer"],
    },
    configs: { create: (target, options) => ({ target, options }) },
    print: async (config, data) => { calls.push({ config, data }); },
};
const context = {
    window: {
        WMN_POS: { Services: { Printing: { Adapters: {} } } },
        qz,
    },
    document: {},
    localStorage: { getItem: () => null },
    TextEncoder,
    btoa,
    console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "qz_print_adapter.js"), "utf8"), context);
const adapter = context.window.WMN_POS.Services.Printing.Adapters.QZ;
const serviceSource = fs.readFileSync(path.join(__dirname, "print_service.js"), "utf8");
const validationStart = serviceSource.indexOf("function validateQZPrinterSelection(values)");
const validationEnd = serviceSource.indexOf("function renderActionButtons", validationStart);
assert.ok(validationStart >= 0 && validationEnd > validationStart);
const validate = new Function("methodId", "qzConnectorModeId", "qzDestinationId",
    `${serviceSource.slice(validationStart, validationEnd)}\nreturn validateQZPrinterSelection;`)(
    () => "qz", () => "legacy", (value) => value === "TCP/IP Host" ? "tcp" : value,
);

assert.doesNotThrow(() => validate({ method: "qz", qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 9101 }),
    "TCP destination must not require a Windows printer name");
assert.throws(() => validate({ method: "qz", qz_destination: "tcp", qz_tcp_host: "", qz_tcp_port: 9101 }), /host/i);
assert.throws(() => validate({ method: "qz", qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 70000 }), /port/i);
assert.throws(() => validate({ method: "qz", qz_destination: "printer", qz_printer_name: "" }), /printer/i);

(async () => {
    await adapter.sendRaw("ABC", {
        qz_destination: "tcp",
        qz_tcp_host: "127.0.0.1",
        qz_tcp_port: 9101,
    }, {});
    assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].config.target)),
        { host: "127.0.0.1", port: 9101 }, "TCP destination must bypass the Windows printer name");
    assert.equal(calls[0].data[0].flavor, "base64", "TCP RAW must use the byte-preserving route proven with QZ");
    assert.equal(Buffer.from(calls[0].data[0].data, "base64").toString("utf8"), "ABC");

    await adapter.sendRaw("XYZ", { qz_destination: "printer", qz_printer_name: "Named Printer" }, {});
    assert.equal(calls[1].config.target, "Named Printer", "Existing named-printer route must remain intact");
    assert.equal(calls[1].data[0].flavor, "plain", "Existing printer-name route must remain unchanged");

    await adapter.sendRaw("ABC", { qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 9101, qz_raw_flavor: "plain", qz_encoding: "IBM864" }, {});
    assert.equal(calls[2].data[0].flavor, "plain", "Explicit plain mode must be selectable for TCP");
    assert.equal(calls[2].config.options.encoding, "IBM864", "Selected QZ encoding must reach QZ");
    calls.pop();

    const GS = String.fromCharCode(0x1d);
    const mixedRaw = "عريكة\n3.0 x 16.0          48.0\n" +
        GS + "k" + String.fromCharCode(73) + String.fromCharCode(3) +
        "{C" + String.fromCharCode(10);
    await adapter.sendRaw(mixedRaw, {
        qz_destination: "tcp",
        qz_tcp_host: "127.0.0.1",
        qz_tcp_port: 9101,
        qz_raw_flavor: "plain",
        qz_encoding: "IBM864",
        escpos_codepage: "37",
    }, {});
    const ibm864Call = calls[2];
    const ibm864Stream = ibm864Call.data.slice(0, -2).map((item) => item.data).join("");
    assert.equal(ibm864Stream, "\x1bt\x25" + mixedRaw,
        "IBM864 chunking must preserve the exact receipt ESC/POS byte-oriented string before feed/cut");
    assert.ok(ibm864Call.data.some((item) => item.data === "\n"),
        "IBM864 LF must be sent as an independent RAW item");
    assert.ok(ibm864Call.data.some((item) => item.data === "عريكة"),
        "IBM864 Arabic text must be isolated from LF/control bytes for QZ shaping");
    assert.ok(ibm864Call.data.length > 4,
        "IBM864 RAW must be segmented so QZ cannot reorder adjacent lines");
    assert.equal(ibm864Call.data.at(-2).data, "\n\n\n",
        "QZ RAW must append the configured feed lines before cutting");
    assert.equal(ibm864Call.data.at(-1).data, "\x1d\x56\x00",
        "QZ RAW must append GS V 0 when Cut Paper is enabled");
    calls.pop();

    await adapter.sendRaw("ABC", {
        qz_destination: "tcp",
        qz_tcp_host: "127.0.0.1",
        qz_tcp_port: 9101,
        qz_raw_flavor: "plain",
        qz_encoding: "IBM864",
        cut_paper: 0,
        feed_lines: 0,
    }, {});
    assert.ok(!calls[2].data.some((item) => item.data === "\x1d\x56\x00"),
        "QZ RAW must respect Cut Paper being disabled");
    calls.pop();

    await adapter.sendRaw("ABC", { qz_destination: "printer", qz_printer_name: "Named Printer", qz_raw_flavor: "base64", cut_paper: 0, feed_lines: 0 }, {});
    assert.equal(calls[2].data[0].flavor, "base64", "Explicit base64 mode must be selectable for named printers");
    calls.pop();

    await adapter.sendRaw("\x1b@\x1dkABC", { qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 9101, escpos_codepage: "37" }, {});
    assert.equal(Buffer.from(calls[2].data[0].data, "base64").toString("binary"), "\x1b@\x1bt\x25\x1dkABC",
        "ESC/POS codepage selection must follow initialization without damaging later binary commands");
    calls.pop();

    const tcpSettings = { qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 9101 };
    await adapter.sendPdf("PDF_BASE64", tcpSettings, {});
    assert.equal(calls[2].data[0].type, "raw", "TCP PDF must be converted to ESC/POS instead of PIXEL");
    assert.equal(calls[2].data[0].format, "pdf");
    assert.equal(calls[2].data[0].options.language, "ESCPOS");

    await adapter.sendPng("PNG_BASE64", tcpSettings, {});
    assert.equal(calls[3].data[0].type, "raw", "TCP PNG must be converted to ESC/POS instead of PIXEL");
    assert.equal(calls[3].data[0].format, "image");
    assert.equal(calls[3].data[0].options.language, "ESCPOS");

    await adapter.sendPdf("PDF_BASE64", { qz_destination: "printer", qz_printer_name: "Named Printer" }, {});
    assert.equal(calls[4].data[0].type, "pixel", "Named-printer PDF route must stay unchanged");

    await assert.rejects(
        adapter.sendRaw("BAD", { qz_destination: "tcp", qz_tcp_host: "127.0.0.1", qz_tcp_port: 70000 }, {}),
        /port/i,
        "Invalid TCP port must be rejected before sending",
    );
    assert.equal(calls.length, 5, "Invalid TCP destination must not print");
    console.log("WMN_QZ_TCP_DESTINATION_PASS");
})().catch((error) => { console.error(error); process.exitCode = 1; });
