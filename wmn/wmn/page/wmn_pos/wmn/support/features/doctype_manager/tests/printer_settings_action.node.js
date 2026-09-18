const assert = require("assert");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
    path.resolve(__dirname, "../doctype_manager.common.js"),
    "utf8"
);

const printerBranch = source.match(
    /if \(action === "printer"\) \{([\s\S]*?)\n\s*\}\n\s*if \(action === "price-checker"\)/
);

assert.ok(printerBranch, "Printer action branch must exist");
assert.match(
    printerBranch[1],
    /WMN_POS\?\.Services\?\.Printing\?\.PrintService/,
    "Printer button must resolve PrintService directly"
);
assert.match(
    printerBranch[1],
    /await service\.showSettings\(\)/,
    "Printer button must await the direct settings service"
);
assert.match(
    printerBranch[1],
    /wmn_show_printer_settings_dialog/,
    "Legacy global printer dialog fallback must remain available"
);

console.log("WMN_POS16_PRINTER_SETTINGS_ACTION_PASS");
