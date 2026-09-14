/* WMN POS local cache registry. Defines cache ownership and record identity only. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services = ns.Services || {};
    ns.Services.Cache = ns.Services.Cache || {};

    function text(value) {
        return String(value ?? "").trim();
    }

    function joinKey(parts) {
        return parts.map(value => text(value)).join("::");
    }

    function hint(label, type = "Data", options = {}) {
        return Object.assign({ label, type }, options || {});
    }

    function buildAdapters() {
        const storage = window.wmnPOSOffline;
        const stores = storage?.STORES || {};

        return [
            {
                id: "items",
                storeName: stores.items,
                label: __("Items Cache"),
                description: __("Items used by POS item selection and offline item lookup."),
                keyFields: ["item_code"],
                requiredFields: ["item_code"],
                titleFields: ["item_name", "item_code"],
                searchFields: ["item_code", "item_name", "item_group", "barcode", "brand"],
                fieldHints: {
                    item_code: hint(__("Item Code"), "Data"),
                    item_name: hint(__("Item Name"), "Data"),
                    item_group: hint(__("Item Group"), "Data"),
                    stock_uom: hint(__("Stock UOM"), "Data"),
                    uom: hint(__("UOM"), "Data"),
                    description: hint(__("Description"), "Long Text"),
                    barcode: hint(__("Barcode"), "Data"),
                    price_list_rate: hint(__("Price List Rate"), "Float"),
                    rate: hint(__("Rate"), "Float"),
                    actual_qty: hint(__("Actual Qty"), "Float"),
                    disabled: hint(__("Disabled"), "Check"),
                    has_variants: hint(__("Has Variants"), "Check"),
                    is_stock_item: hint(__("Is Stock Item"), "Check"),
                    has_batch_no: hint(__("Has Batch No"), "Check"),
                    has_serial_no: hint(__("Has Serial No"), "Check"),
                    allow_negative_stock: hint(__("Allow Negative Stock"), "Check"),
                },
            },
            {
                id: "customers",
                storeName: stores.customers,
                label: __("Customers Cache"),
                description: __("Customers available to the POS while offline."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["customer_name", "name"],
                searchFields: ["name", "customer_name", "mobile_no", "email_id", "tax_id"],
                fieldHints: {
                    name: hint(__("Customer"), "Data"),
                    customer_name: hint(__("Customer Name"), "Data"),
                    customer_group: hint(__("Customer Group"), "Data"),
                    territory: hint(__("Territory"), "Data"),
                    mobile_no: hint(__("Mobile No"), "Data"),
                    email_id: hint(__("Email"), "Data"),
                    tax_id: hint(__("Tax ID"), "Data"),
                    disabled: hint(__("Disabled"), "Check"),
                },
            },
            {
                id: "item_prices",
                storeName: stores.item_prices,
                label: __("Item Prices Cache"),
                description: __("Cached price-list rows used by offline POS pricing."),
                keyFields: ["key"],
                requiredFields: ["item_code", "price_list"],
                identitySourceFields: ["price_list", "item_code", "uom", "batch_no", "valid_from", "valid_upto", "name", "modified", "price_list_rate"],
                titleFields: ["item_code", "price_list_rate"],
                searchFields: ["item_code", "price_list", "uom", "batch_no", "name"],
                buildKey(record) {
                    return joinKey([
                        record.price_list,
                        record.item_code,
                        record.uom,
                        record.batch_no,
                        record.valid_from,
                        record.valid_upto,
                        record.name || record.modified || record.price_list_rate || record.rate,
                    ]);
                },
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    name: hint(__("Item Price Name"), "Data"),
                    item_code: hint(__("Item Code"), "Data"),
                    price_list: hint(__("Price List"), "Data"),
                    price_list_rate: hint(__("Price List Rate"), "Float"),
                    currency: hint(__("Currency"), "Data"),
                    uom: hint(__("UOM"), "Data"),
                    batch_no: hint(__("Batch No"), "Data"),
                    selling: hint(__("Selling"), "Check"),
                    valid_from: hint(__("Valid From"), "Date"),
                    valid_upto: hint(__("Valid Upto"), "Date"),
                    conversion_factor: hint(__("Conversion Factor"), "Float"),
                },
            },
            {
                id: "stock",
                storeName: stores.stock,
                label: __("Stock Cache"),
                description: __("Cached warehouse quantities used by offline stock validation."),
                keyFields: ["key"],
                requiredFields: ["item_code", "warehouse"],
                identitySourceFields: ["item_code", "warehouse"],
                titleFields: ["item_code", "warehouse"],
                searchFields: ["item_code", "warehouse"],
                buildKey(record) {
                    return joinKey([record.item_code, record.warehouse]);
                },
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    item_code: hint(__("Item Code"), "Data"),
                    warehouse: hint(__("Warehouse"), "Data"),
                    actual_qty: hint(__("Actual Qty"), "Float"),
                    pos_reserved_qty: hint(__("POS Reserved Qty"), "Float"),
                    available_qty: hint(__("Available Qty"), "Float"),
                },
            },
            {
                id: "batches",
                storeName: stores.batches,
                label: __("Batches Cache"),
                description: __("Batch records and quantities used by offline item selection."),
                keyFields: ["key"],
                requiredFields: ["item_code", "batch_no"],
                identitySourceFields: ["item_code", "batch_no", "warehouse"],
                titleFields: ["batch_no", "item_code"],
                searchFields: ["batch_no", "item_code", "warehouse", "barcode"],
                buildKey(record) {
                    return joinKey([record.item_code, record.batch_no, record.warehouse]);
                },
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    item_code: hint(__("Item Code"), "Data"),
                    batch_no: hint(__("Batch No"), "Data"),
                    warehouse: hint(__("Warehouse"), "Data"),
                    barcode: hint(__("Barcode"), "Data"),
                    expiry_date: hint(__("Expiry Date"), "Date"),
                    manufacturing_date: hint(__("Manufacturing Date"), "Date"),
                    actual_qty: hint(__("Actual Qty"), "Float"),
                    disabled: hint(__("Disabled"), "Check"),
                    price_list_rate: hint(__("Price List Rate"), "Float"),
                    rate: hint(__("Rate"), "Float"),
                    currency: hint(__("Currency"), "Data"),
                    uom: hint(__("UOM"), "Data"),
                    uom_options: hint(__("UOM Options"), "JSON"),
                },
            },
            {
                id: "item_barcodes",
                storeName: stores.item_barcodes,
                label: __("Item Barcodes Cache"),
                description: __("Barcode-to-item mappings used by POS search."),
                keyFields: ["key"],
                requiredFields: ["barcode", "item_code"],
                identitySourceFields: ["barcode", "item_code", "uom"],
                titleFields: ["barcode", "item_code"],
                searchFields: ["barcode", "item_code", "uom"],
                buildKey(record) {
                    return joinKey([record.barcode, record.item_code, record.uom]);
                },
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    barcode: hint(__("Barcode"), "Data"),
                    item_code: hint(__("Item Code"), "Data"),
                    uom: hint(__("UOM"), "Data"),
                    barcode_type: hint(__("Barcode Type"), "Data"),
                },
            },
            {
                id: "serials",
                storeName: stores.serials,
                label: __("Serial Numbers Cache"),
                description: __("Serial numbers used by offline serial selection and validation."),
                keyFields: ["key"],
                requiredFields: ["item_code", "serial_no"],
                identitySourceFields: ["item_code", "serial_no"],
                titleFields: ["serial_no", "item_code"],
                searchFields: ["serial_no", "item_code", "warehouse", "barcode", "batch_no"],
                buildKey(record) {
                    return joinKey([record.item_code, record.serial_no]);
                },
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    item_code: hint(__("Item Code"), "Data"),
                    serial_no: hint(__("Serial No"), "Data"),
                    warehouse: hint(__("Warehouse"), "Data"),
                    barcode: hint(__("Barcode"), "Data"),
                    batch_no: hint(__("Batch No"), "Data"),
                    status: hint(__("Status"), "Data"),
                    disabled: hint(__("Disabled"), "Check"),
                },
            },
            {
                id: "payment_methods",
                storeName: stores.payment_methods,
                label: __("Payment Methods Cache"),
                description: __("POS payment modes stored for offline payment."),
                keyFields: ["mode_of_payment"],
                requiredFields: ["mode_of_payment"],
                titleFields: ["mode_of_payment"],
                searchFields: ["mode_of_payment", "account"],
                fieldHints: {
                    mode_of_payment: hint(__("Mode of Payment"), "Data"),
                    account: hint(__("Account"), "Data"),
                    type: hint(__("Type"), "Data"),
                    default: hint(__("Default"), "Check"),
                },
            },
            {
                id: "coupons",
                storeName: stores.coupons,
                label: __("Coupons Cache"),
                description: __("Active coupon configuration cached for POS."),
                keyFields: ["coupon_code"],
                requiredFields: ["coupon_code"],
                titleFields: ["coupon_code", "coupon_name"],
                searchFields: ["coupon_code", "coupon_name", "company", "customer"],
                fieldHints: {
                    coupon_code: hint(__("Coupon Code"), "Data"),
                    coupon_name: hint(__("Coupon Name"), "Data"),
                    company: hint(__("Company"), "Data"),
                    customer: hint(__("Customer"), "Data"),
                    valid_from: hint(__("Valid From"), "Date"),
                    valid_upto: hint(__("Valid Upto"), "Date"),
                    enabled: hint(__("Enabled"), "Check"),
                    disabled: hint(__("Disabled"), "Check"),
                },
            },
            {
                id: "promotions",
                storeName: stores.promotions,
                label: __("Promotions Cache"),
                description: __("WMN POS Promotion data cached for offline evaluation."),
                keyFields: ["promotion_code"],
                requiredFields: ["promotion_code"],
                titleFields: ["promotion_name", "promotion_code"],
                searchFields: ["promotion_code", "promotion_name", "company", "pos_profile", "apply_scope"],
                fieldHints: {
                    promotion_code: hint(__("Promotion Code"), "Data"),
                    promotion_name: hint(__("Promotion Name"), "Data"),
                    company: hint(__("Company"), "Data"),
                    pos_profile: hint(__("POS Profile"), "Data"),
                    apply_scope: hint(__("Apply Scope"), "Data"),
                    valid_from: hint(__("Valid From"), "Date"),
                    valid_upto: hint(__("Valid Upto"), "Date"),
                    enabled: hint(__("Enabled"), "Check"),
                    disabled: hint(__("Disabled"), "Check"),
                },
            },
            {
                id: "item_groups",
                storeName: stores.item_groups,
                label: __("Item Groups Cache"),
                description: __("Item groups used by offline item filtering."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["name"],
                searchFields: ["name", "parent_item_group"],
                fieldHints: {
                    name: hint(__("Item Group"), "Data"),
                    parent_item_group: hint(__("Parent Item Group"), "Data"),
                    is_group: hint(__("Is Group"), "Check"),
                },
            },
            {
                id: "pos_profile",
                storeName: stores.pos_profile,
                label: __("POS Profile Cache"),
                description: __("Cached POS Profile configuration used by offline POS."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["name"],
                searchFields: ["name", "company", "warehouse", "selling_price_list", "customer"],
                fieldHints: {
                    name: hint(__("POS Profile"), "Data"),
                    company: hint(__("Company"), "Data"),
                    warehouse: hint(__("Warehouse"), "Data"),
                    selling_price_list: hint(__("Selling Price List"), "Data"),
                    customer: hint(__("Customer"), "Data"),
                },
            },
            {
                id: "pos_settings",
                storeName: stores.pos_settings,
                label: __("POS Settings Cache"),
                description: __("Cached POS settings used by the offline runtime."),
                keyFields: ["key"],
                requiredFields: ["key"],
                titleFields: ["key", "name"],
                searchFields: ["key", "name"],
                fieldHints: {
                    key: hint(__("Cache Key"), "Data"),
                    name: hint(__("Name"), "Data"),
                },
            },
            {
                id: "pos_opening_entry",
                storeName: stores.pos_opening_entry,
                label: __("POS Opening Entries Cache"),
                description: __("Cached POS Opening Entry data used by offline sessions."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["name", "pos_profile"],
                searchFields: ["name", "user", "pos_profile", "company", "status"],
                fieldHints: {
                    name: hint(__("Opening Entry"), "Data"),
                    user: hint(__("User"), "Data"),
                    pos_profile: hint(__("POS Profile"), "Data"),
                    company: hint(__("Company"), "Data"),
                    status: hint(__("Status"), "Data"),
                    period_start_date: hint(__("Period Start"), "Datetime"),
                },
            },
            {
                id: "barcode_structures",
                storeName: stores.barcode_structures,
                label: __("Barcode Structures Cache"),
                description: __("Cached barcode structures used by POS barcode parsing."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["name", "prefix"],
                searchFields: ["name", "prefix"],
                fieldHints: {
                    name: hint(__("Name"), "Data"),
                    prefix: hint(__("Prefix"), "Data"),
                },
            },
            {
                id: "settings",
                storeName: stores.settings,
                label: __("Runtime Settings Cache"),
                description: __("Internal POS runtime settings stored locally."),
                keyFields: ["key"],
                requiredFields: ["key"],
                titleFields: ["key"],
                searchFields: ["key"],
                fieldHints: {
                    key: hint(__("Setting Key"), "Data"),
                    value: hint(__("Value"), "JSON"),
                },
            },
            {
                id: "doctype_meta",
                storeName: stores.doctype_meta,
                label: __("DocType Meta Cache"),
                description: __("Cached lightweight DocType metadata used by offline forms."),
                keyFields: ["name"],
                requiredFields: ["name"],
                titleFields: ["name"],
                searchFields: ["name", "module"],
                fieldHints: {
                    name: hint(__("DocType"), "Data"),
                    module: hint(__("Module"), "Data"),
                    fields: hint(__("Fields"), "JSON"),
                },
            },
        ].filter(adapter => adapter.storeName);
    }

    const Registry = {
        _adapters: null,

        reset() {
            this._adapters = null;
        },

        all() {
            if (!this._adapters) this._adapters = buildAdapters();
            return this._adapters.slice();
        },

        get(id) {
            return this.all().find(adapter => adapter.id === id) || null;
        },

        getByStore(storeName) {
            return this.all().find(adapter => adapter.storeName === storeName) || null;
        },
    };

    ns.Services.Cache.PosCacheRegistry = Registry;
})();
