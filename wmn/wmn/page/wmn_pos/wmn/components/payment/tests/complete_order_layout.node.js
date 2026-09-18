const assert = require("assert");
const fs = require("fs");
const path = require("path");
const source = fs.readFileSync(path.resolve(__dirname, "../methods.js"), "utf8");

const checkout = source.match(/checkout\(\) \{([\s\S]*?)\n\s*\}\n\s*\};/);
assert.ok(checkout, "WMN checkout override must exist");
assert.match(
    checkout[1],
    /this\.\$component\?\.addClass\?\.\(\s*["'][^"']*wmn-complete-order-layout[^"']*["']/,
    "Checkout must scope the native payment layout on the reused native component"
);
assert.doesNotMatch(checkout[1], /\.html\s*\(/, "Checkout must not replace ERPNext payment HTML");
console.log("WMN_COMPLETE_ORDER_LAYOUT_PASS");
