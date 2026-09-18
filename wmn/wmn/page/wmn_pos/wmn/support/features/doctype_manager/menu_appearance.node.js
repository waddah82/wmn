const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "doctype_manager.common.js"), "utf8");
const start = src.indexOf("function menuColor(value)");
const end = src.indexOf("function menuHtml(doctypes)", start);
assert.ok(start >= 0 && end > start);
const render = new Function("frappe", "icon", "escapeHtml", "__",
    `${src.slice(start, end)}\nreturn managerButtonHtml;`)(
    { utils: { icon: () => "<svg></svg>" } }, () => "<svg></svg>",
    (value) => String(value), (value) => value,
);

const button = render({ doctype: "Item", label: "Items", button_color: "#123456", text_color: "#ABCDEF" });
assert.match(button, /--wmn-pos-menu-bg:\s*#123456/,
    "Configured background must reach the actual button");
assert.match(button, /--wmn-pos-menu-text:\s*#ABCDEF/,
    "Configured text color must reach the actual button");
const unsafe = render({ doctype: "Item", label: "Items", button_color: "url(evil)", text_color: "red;opacity:0" });
assert.doesNotMatch(unsafe, /url\(|opacity:0/, "Unsafe CSS must not enter the button style");

assert.ok(src.includes("await window.wmnPOSOffline.setSetting(MENU_CACHE_KEY, doctypes)"),
    "Opening an online menu must refresh the offline menu cache");
const css = fs.readFileSync(path.resolve(__dirname, "../../../../../../../public/css/wmn_pos.css"), "utf8");
assert.match(css, /\.wmn-pos-manager-button\.wmn-pos-manager-colored:focus-visible\s*\{/,
    "Keyboard focus must retain configured menu colors");
console.log("WMN_MENU_APPEARANCE_PASS");
