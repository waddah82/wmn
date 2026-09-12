/* WMN Price Checker offline adapter. Reads the existing WMN POS local database only. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.PriceChecker = ns.PriceChecker || {};

    const context = ns.Context;

    ns.PriceChecker.Offline = {
        async getContext() {
            const { profile, settings } = await context.getOfflinePOSContext();
            const name = profile.name || profile.pos_profile || settings.pos_profile || "";
            const normalized = Object.assign({}, profile, {
                name,
                selling_price_list: profile.selling_price_list || settings.selling_price_list || "",
                warehouse: profile.warehouse || settings.warehouse || "",
                currency: profile.currency || settings.currency || "",
            });
            return {
                pos_profiles: name ? [normalized] : [],
                default_pos_profile: name,
            };
        },

        async lookup(value) {
            const { db, profile, settings } = await context.getOfflinePOSContext();
            const priceList = profile.selling_price_list || settings.selling_price_list || "";
            const row = await db.findItem(value, priceList);
            if (!row) return null;

            const itemCode = row.item_code || row.name || "";
            const barcodeRows = itemCode
                ? await db.getAllByIndex(db.STORES.item_barcodes, "item_code", itemCode)
                : [];
            const exactBarcode = (barcodeRows || []).find((bc) => String(bc.barcode || "") === String(value || ""));
            const currency = profile.currency || settings.currency || "";
            const symbol = settings.currency_symbol || settings.symbol || currency;

            return {
                item_code: itemCode,
                item_name: row.item_name || itemCode,
                description: row.description || "",
                item_group: row.item_group || "",
                brand: row.brand || "",
                image: row.image || "",
                uom: exactBarcode?.uom || row.uom || row.stock_uom || "",
                stock_uom: row.stock_uom || row.uom || "",
                rate: Number(row.rate ?? row.price_list_rate ?? 0) || 0,
                currency,
                symbol,
                actual_qty: Number(row.actual_qty ?? row.available_qty ?? 0) || 0,
                is_stock_item: Number(row.is_stock_item || 0) ? 1 : 0,
                is_bundle: Number(row.is_bundle || 0) ? 1 : 0,
                warehouse: row.warehouse || profile.warehouse || settings.warehouse || "",
                barcode: exactBarcode?.barcode || row.barcode || "",
                source: "offline",
            };
        },
    };
})();
