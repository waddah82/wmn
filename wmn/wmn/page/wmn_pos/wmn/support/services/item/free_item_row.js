/* Shared technical service for controlled free-item row hydration. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services = ns.Services || {};
    ns.Services.Item = ns.Services.Item || {};

    function text(value) { return String(value == null ? "" : value).trim(); }
    function num(value) {
        try { return typeof flt === "function" ? flt(value || 0) : Number(value || 0) || 0; }
        catch (e) { return Number(value || 0) || 0; }
    }
    function int(value) {
        try { return typeof cint === "function" ? cint(value || 0) : parseInt(value || 0, 10) || 0; }
        catch (e) { return parseInt(value || 0, 10) || 0; }
    }

    function usesOffline(ctrl) {
        return typeof wmn_controller_uses_offline_flow === "function" && wmn_controller_uses_offline_flow(ctrl);
    }

    function conversionFactor(seed, uom) {
        seed = seed || {};
        const wanted = text(uom);
        const stockUom = text(seed.stock_uom || seed.uom);
        if (!wanted || wanted === stockUom) return 1;
        if (text(seed.uom) === wanted && num(seed.conversion_factor) > 0) return num(seed.conversion_factor);
        const rows = []
            .concat(Array.isArray(seed.item_uoms) ? seed.item_uoms : [])
            .concat(Array.isArray(seed.item_data?.item_uoms) ? seed.item_data.item_uoms : []);
        const match = rows.find((row) => text(row?.uom) === wanted);
        return Math.max(0.000001, num(match?.conversion_factor) || 1);
    }

    async function resolveSeed(ctrl, itemCode) {
        const doc = ctrl?.frm?.doc || {};
        const existing = (doc.items || []).find((row) => !int(row?.is_free_item) && text(row?.item_code) === text(itemCode));
        if (existing) return existing;

        if (usesOffline(ctrl) && window.wmnPOSOffline?.findItem) {
            return await window.wmnPOSOffline.findItem(
                itemCode,
                doc.selling_price_list || ctrl?.settings?.selling_price_list || ""
            );
        }

        return (ctrl?.item_selector?.items || []).find((item) => text(item?.item_code) === text(itemCode)) || null;
    }

    function taxMap(seed) {
        const raw = seed?.item_tax_rate || seed?.offline_item_tax_map || {};
        if (raw && typeof raw === "object") return raw;
        try {
            const parsed = JSON.parse(raw || "{}");
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    async function hydrateOnline(ctrl, row, seed, preserve = {}) {
        if (!row) return row;
        const doc = ctrl?.frm?.doc || {};
        const seedIsTransactionRow = Boolean(
            seed && seed.doctype && seed.name && text(seed.item_code) === text(row.item_code) &&
            (doc.items || []).some((candidate) => candidate === seed || candidate?.name === seed.name)
        );

        const requestedUom = text(preserve.uom || row.uom);
        const seedUom = text(seed?.uom || seed?.stock_uom);
        const seedConversions = []
            .concat(Array.isArray(seed?.item_uoms) ? seed.item_uoms : [])
            .concat(Array.isArray(seed?.item_data?.item_uoms) ? seed.item_data.item_uoms : []);
        const canResolveRequestedUomFromSeed = !requestedUom || requestedUom === seedUom ||
            requestedUom === text(seed?.stock_uom) ||
            seedConversions.some((entry) => text(entry?.uom) === requestedUom);

        if (seedIsTransactionRow && canResolveRequestedUomFromSeed) {
            const fields = [
                "item_name", "description", "image", "item_group", "brand", "warehouse", "stock_uom",
                "income_account", "expense_account", "discount_account", "cost_center", "item_tax_template",
                "item_tax_rate", "weight_per_unit", "weight_uom", "has_batch_no", "has_serial_no",
                "allow_negative_stock"
            ];
            fields.forEach((fieldname) => {
                if (seed[fieldname] !== undefined && seed[fieldname] !== null) row[fieldname] = seed[fieldname];
            });
            row.uom = preserve.uom || row.uom || seed.uom || seed.stock_uom || "Nos";
            row.conversion_factor = conversionFactor(seed, row.uom);
            Object.assign(row, preserve);
            return row;
        }

        const response = await frappe.call({
            method: "erpnext.stock.get_item_details.get_item_details",
            args: {
                doc,
                args: {
                    item_code: row.item_code,
                    barcode: row.barcode || "",
                    serial_no: row.serial_no || "",
                    batch_no: row.batch_no || "",
                    set_warehouse: doc.set_warehouse || "",
                    warehouse: row.warehouse || doc.set_warehouse || ctrl?.settings?.warehouse || "",
                    customer: doc.customer || doc.party_name || "",
                    currency: doc.currency || "",
                    update_stock: int(doc.update_stock || 0),
                    conversion_rate: num(doc.conversion_rate || 1),
                    price_list: doc.selling_price_list || doc.buying_price_list || "",
                    price_list_currency: doc.price_list_currency || "",
                    plc_conversion_rate: num(doc.plc_conversion_rate || 1),
                    company: doc.company || ctrl?.company || "",
                    order_type: doc.order_type || "",
                    is_pos: int(doc.is_pos || 0),
                    is_return: int(doc.is_return || 0),
                    ignore_pricing_rule: 1,
                    doctype: doc.doctype,
                    name: doc.name,
                    project: row.project || doc.project || "",
                    qty: num(preserve.qty ?? row.qty ?? 1),
                    stock_qty: num(row.stock_qty || 0),
                    conversion_factor: num(row.conversion_factor || 1),
                    uom: preserve.uom || row.uom || "",
                    stock_uom: row.stock_uom || "",
                    pos_profile: int(doc.is_pos || 0) ? (doc.pos_profile || ctrl?.pos_profile || "") : "",
                    cost_center: row.cost_center || doc.cost_center || ctrl?.settings?.cost_center || "",
                    tax_category: doc.tax_category || "",
                    item_tax_template: row.item_tax_template || "",
                    child_doctype: row.doctype,
                    child_docname: row.name,
                    use_serial_batch_fields: int(row.use_serial_batch_fields || 0),
                },
            },
            freeze: false,
        });
        const details = response?.message && typeof response.message === "object" ? response.message : {};
        Object.assign(row, details, preserve);
        return row;
    }

    ns.Services.Item.FreeItemRow = {
        usesOffline,
        resolveSeed,
        conversionFactor,
        taxMap,
        hydrateOnline,
    };
})();
