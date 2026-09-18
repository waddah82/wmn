const assert = require("assert");
const fs = require("fs");
const path = require("path");
const css = fs.readFileSync(path.resolve(__dirname, "../../../../../../../public/css/wmn_pos.css"), "utf8");

for (const selector of [
    ".wmn-complete-order-layout",
    ".wmn-payment-summary",
    ".wmn-payment-workspace",
    ".wmn-payment-methods",
    ".wmn-payment-actions",
    ".wmn-complete-order-online",
    ".wmn-complete-order-offline",
]) assert.ok(css.includes(selector), `Missing payment CSS selector: ${selector}`);

assert.match(css, /@media\s*\(max-width:\s*991px\)/);
assert.match(css, /@media\s*\(max-width:\s*767px\)/);
assert.match(css, /\[dir=["']rtl["']\][\s\S]*wmn-complete-order-layout/);

const unifiedStart = css.indexOf("WMN unified Complete Order payment layout");
assert.ok(unifiedStart >= 0, "Unified payment CSS section must exist");
assert.doesNotMatch(
    css.slice(0, unifiedStart),
    /WMN POS payment layout\./,
    "Legacy unscoped online payment layout must not override the unified layout"
);

const unifiedEnd = css.indexOf(".wmn-offline-invoices-dialog", unifiedStart);
assert.ok(unifiedEnd > unifiedStart, "Unified payment CSS section must have a bounded end");
const unifiedCss = css.slice(unifiedStart, unifiedEnd);
assert.doesNotMatch(
    unifiedCss,
    /overflow:\s*hidden\s*;/,
    "Unified mobile payment geometry must not clip summary, guidance, or actions"
);
assert.match(
    unifiedCss,
    /wmn-pos-app-dialog\.wmn-offline-payment-modal \.modal-body\s*\{[\s\S]*?overflow-y:\s*auto\s*;/,
    "The offline dialog body must scroll when mobile content exceeds the viewport"
);
assert.match(
    unifiedCss,
    /wmn-complete-order-offline \.wmn-payment-summary/,
    "Offline summary rules must be scoped to the explicit offline root"
);
assert.match(
    unifiedCss,
    /wmn-complete-order-offline \.wmn-payment-actions/,
    "Offline action rules must be scoped to the explicit offline root"
);
const onlineControlRule = unifiedCss.match(
    /body\.wmn-mamsek-pos-route \.wmn-complete-order-online \.mode-of-payment-control\s*\{([^}]*)\}/
);
assert.ok(onlineControlRule, "Online payment controls must have a root-scoped default rule");
assert.match(
    onlineControlRule[1],
    /display:\s*none\s*;/,
    "Online payment controls must be hidden before a payment mode is selected"
);
assert.doesNotMatch(
    onlineControlRule[1],
    /!important/,
    "Online payment controls must allow native inline jQuery show/hide behavior"
);

// The native renderer contributes two separators between the three monetary cells.
const nativePayment = fs.readFileSync(
    path.resolve(__dirname, "../../../../upstream_v16/pos_payment.js"), "utf8"
);
const totalsMarkup = nativePayment.match(/this\.\$totals\.html\(\s*`([\s\S]*?)`\s*\)/);
assert.ok(totalsMarkup, "Native online totals markup must be available");
assert.strictEqual((totalsMarkup[1].match(/class="col"/g) || []).length, 3);
assert.strictEqual((totalsMarkup[1].match(/class="seperator-y"/g) || []).length, 2);
const totalsSelector = "body.wmn-mamsek-pos-route .wmn-complete-order-online .totals-section .totals";
const totalsRules = [...unifiedCss.matchAll(
    new RegExp(totalsSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}", "g")
)];
assert.ok(totalsRules.length >= 2, "Desktop and mobile totals grid rules must exist");
assert.match(totalsRules[0][1], /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
    "Desktop totals must use three columns");
assert.match(totalsRules[1][1], /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    "Mobile totals must use one column");
const separatorRule = unifiedCss.match(
    /body\.wmn-mamsek-pos-route \.wmn-complete-order-online \.totals-section \.totals > \.seperator-y\s*\{([^}]*)\}/
);
assert.ok(separatorRule, "Native separators must have a totals-scoped rule");
assert.match(separatorRule[1], /display:\s*none\s*;/, "Separators must not consume grid tracks");
console.log("WMN_COMPLETE_ORDER_CSS_PASS");
