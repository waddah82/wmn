const fs = require("fs");
const vm = require("vm");
const path = require("path");

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

global.window = global;
global.document = {};
global.navigator = { onLine: false };
global.flt = (value) => Number(value || 0);
global.cint = (value) => Number.parseInt(value || 0, 10) || 0;
global.__ = (value) => value;
global.format_currency = (value) => String(value);
global.frappe = {
    get_abbr: (value) => String(value || "").slice(0, 2),
};
global.$ = function () { return { on() { return this; }, off() { return this; }, find() { return this; }, text() { return ""; } }; };
global.$.isEmptyObject = (value) => !value || Object.keys(value).length === 0;

class BaseItemCart {
    get_item_from_frm(item) {
        const rows = this.events.get_frm().doc.items || [];
        return rows.find((row) => row && row.name === item?.name);
    }
}

global.WMN_POS = {
    Base: { ItemCart: BaseItemCart },
    UI: {
        Mamsek: {
            ACTIVE_BODY_CLASS: "wmn",
            icon: () => "",
            escape_html: (value) => String(value ?? ""),
            category_emoji: () => "",
            read_item_data: () => ({}),
            parse_quantity: (value) => Number(value),
        },
    },
    OverrideMethods: {},
};

global.wmn_is_pos_offline = () => true;
global.wmn_controller_uses_offline_flow = () => true;

const offlineRoot = path.resolve(__dirname, "..");
const posRoot = path.resolve(__dirname, "../../..");
vm.runInThisContext(fs.readFileSync(path.join(offlineRoot, "cart_normalizer.js"), "utf8"), { filename: "cart_normalizer.js" });
vm.runInThisContext(fs.readFileSync(path.join(posRoot, "overrides/item_cart/item_cart.methods.js"), "utf8"), { filename: "item_cart.methods.js" });

const canonical = {
    name: "ROW-NEW",
    item_code: "ITEM-001",
    item_name: "Canonical item",
    uom: "Nos",
    stock_uom: "Nos",
    warehouse: "WH-1",
    batch_no: "",
    serial_no: "",
    is_free_item: 0,
    qty: 1,
};
const stale = {
    name: "ROW-OLD",
    item_code: "ITEM-001",
    item_name: "Stale item",
    uom: "Nos",
    stock_uom: "Nos",
    warehouse: "WH-1",
    batch_no: "",
    serial_no: "",
    is_free_item: 0,
};
const context = {
    events: { get_frm: () => ({ doc: { items: [canonical] } }) },
};

const resolved = WMN_POS.OverrideMethods.ItemCart.CoreMethods.get_item_from_frm.call(context, stale);
assert(resolved === canonical, "Offline ItemCart must resolve the canonical row when the child-row name changed.");

const freeRow = { ...canonical, name: "FREE-1", is_free_item: 1 };
const paidContext = { events: { get_frm: () => ({ doc: { items: [freeRow, canonical] } }) } };
const paidResolved = WMN_POS.OverrideMethods.ItemCart.CoreMethods.get_item_from_frm.call(paidContext, stale);
assert(paidResolved === canonical, "Offline ItemCart must not confuse paid rows with free-item rows.");

console.log("WMN_OFFLINE_CART_ROW_IDENTITY_PASS");
