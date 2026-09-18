/* WMN Barcode Printer offline adapter. Reads indexed WMN POS local data only. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.BarcodePrinting = ns.BarcodePrinting || {};

    ns.BarcodePrinting.Offline = {
        async getContext() {
            const { profile } = await ns.Context.getOfflinePOSContext();
            const name = profile.name || profile.pos_profile || "";
            return {
                pos_profiles: name ? [profile] : [],
                default_pos_profile: name,
            };
        },

        async search(query, posProfile, limit = 30) {
            const { db, profile, settings } = await ns.Context.getOfflinePOSContext();
            const priceList = profile.selling_price_list || settings.selling_price_list || "";
            const rows = await db.searchItems({
                search_term: query,
                price_list: priceList,
                start: 0,
                page_length: Math.min(Math.max(Number(limit) || 30, 1), 60),
            });

            return await Promise.all((rows || []).map(async (row) => {
                const itemCode = row.item_code || row.name || "";
                const barcodes = itemCode
                    ? await db.getAllByIndex(db.STORES.item_barcodes, "item_code", itemCode)
                    : [];
                return {
                    item_code: itemCode,
                    item_name: row.item_name || itemCode,
                    uom: row.uom || row.stock_uom || "",
                    rate: Number(row.rate ?? row.price_list_rate ?? 0) || 0,
                    currency: profile.currency || settings.currency || "",
                    barcodes: (barcodes || []).map((bc) => ({
                        barcode: bc.barcode || "",
                        barcode_type: bc.barcode_type || "",
                        uom: bc.uom || "",
                    })),
                };
            }));
        },

        async resolveBarcode(value) {
            const { db, profile, settings } = await ns.Context.getOfflinePOSContext();
            const priceList = profile.selling_price_list || settings.selling_price_list || "";
            return await db.findItem(value, priceList);
        },
    };
})();
