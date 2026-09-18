/* Client-side available-stock preview for the current cart. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Services.Stock = ns.Services.Stock || {};

    function isEnabled() {
        const value = window.WMNPOSUIPreferences?.get?.("decrease_available_qty_in_cart");
        return value === undefined || value === null ? true : Boolean(cint(value));
    }

    function warehouseFor(row, doc, fallbackWarehouse) {
        return String(row?.warehouse || doc?.set_warehouse || fallbackWarehouse || "");
    }

    function reservedByItemWarehouse(doc, fallbackWarehouse) {
        const reserved = new Map();
        for (const row of doc?.items || []) {
            if (!row?.item_code) continue;
            const warehouse = warehouseFor(row, doc, fallbackWarehouse);
            if (!warehouse) continue;
            const qty = row.stock_qty !== undefined
                ? flt(row.stock_qty || 0)
                : flt(row.qty || 0) * flt(row.conversion_factor || 1);
            const key = `${row.item_code}::${warehouse}`;
            reserved.set(key, flt(reserved.get(key) || 0) + qty);
        }
        return reserved;
    }

    function setBase(item, actualQty) {
        if (!item) return 0;
        item.__wmn_available_qty_base = flt(actualQty || 0);
        item.actual_qty = item.__wmn_available_qty_base;
        return item.actual_qty;
    }

    function apply(items, doc, controller, fallbackWarehouse, enabled = isEnabled()) {
        const reserved = reservedByItemWarehouse(doc || {}, fallbackWarehouse);
        for (const item of items || []) {
            if (!item?.item_code || !cint(item.is_stock_item || 0)) continue;
            const warehouse = warehouseFor(item, doc, fallbackWarehouse);
            if (!warehouse) continue;
            if (item.__wmn_available_qty_base === undefined || item.__wmn_available_qty_base === null) {
                item.__wmn_available_qty_base = flt(item.actual_qty || 0);
            }
            const key = `${item.item_code}::${warehouse}`;
            const available = enabled
                ? flt(item.__wmn_available_qty_base) - flt(reserved.get(key) || 0)
                : flt(item.__wmn_available_qty_base);
            item.actual_qty = available;
            if (controller) {
                controller.item_stock_map = controller.item_stock_map || {};
                controller.item_stock_map[item.item_code] = controller.item_stock_map[item.item_code] || {};
                controller.item_stock_map[item.item_code][warehouse] = [available, cint(item.is_stock_item || 0)];
                if (controller.item_details) controller.item_details.item_stock_map = controller.item_stock_map;
            }
        }
        return items || [];
    }

    ns.Services.Stock.CartStockPreview = { isEnabled, reservedByItemWarehouse, setBase, apply };
})();
