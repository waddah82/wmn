/* Promotion Online controller integration methods. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    const COPYABLE_FREE_ROW_FIELDS = [
        "item_name",
        "description",
        "image",
        "item_group",
        "brand",
        "warehouse",
        "uom",
        "stock_uom",
        "conversion_factor",
        "income_account",
        "expense_account",
        "discount_account",
        "cost_center",
        "item_tax_template",
        "item_tax_rate",
        "weight_per_unit",
        "weight_uom",
        "has_batch_no",
        "has_serial_no",
        "allow_negative_stock",
    ];

    ns.Features.Promotion = ns.Features.Promotion || {};
    ns.Features.Promotion.Online = ns.Features.Promotion.Online || {};
    ns.Features.Promotion.Online.ControllerMethods = {
        async wmn_set_online_promotion_rate(row, newRate) {
            if (!row || !row.doctype || !row.name) return;
            if (Math.abs(flt(row.rate || 0) - flt(newRate || 0)) <= 0.000001) return;
            await wmn_pos_set_value(row.doctype, row.name, "rate", flt(newRate || 0));
        },

        async wmn_prepare_online_promotion_free_item_row(row, seed) {
            if (!row) return row;

            // A missing seed means the item is outside the selector's rendered page.
            // Resolve that single item from ERPNext; never expand the selector page/catalog.

            const doc = this.frm?.doc || {};
            const seedIsTransactionRow = Boolean(
                seed &&
                seed.doctype &&
                seed.name &&
                String(seed.item_code || "") === String(row.item_code || "") &&
                (doc.items || []).some((candidate) => candidate === seed || candidate?.name === seed.name)
            );

            if (seedIsTransactionRow) {
                for (const fieldname of COPYABLE_FREE_ROW_FIELDS) {
                    if (seed[fieldname] !== undefined && seed[fieldname] !== null) {
                        row[fieldname] = seed[fieldname];
                    }
                }
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
                        warehouse: row.warehouse || doc.set_warehouse || this.settings?.warehouse || "",
                        customer: doc.customer || doc.party_name || "",
                        currency: doc.currency || "",
                        update_stock: cint(doc.update_stock || 0),
                        conversion_rate: flt(doc.conversion_rate || 1),
                        price_list: doc.selling_price_list || doc.buying_price_list || "",
                        price_list_currency: doc.price_list_currency || "",
                        plc_conversion_rate: flt(doc.plc_conversion_rate || 1),
                        company: doc.company || this.company || "",
                        order_type: doc.order_type || "",
                        is_pos: cint(doc.is_pos || 0),
                        is_return: cint(doc.is_return || 0),
                        ignore_pricing_rule: 1,
                        doctype: doc.doctype,
                        name: doc.name,
                        project: row.project || doc.project || "",
                        qty: flt(row.qty || 1),
                        stock_qty: flt(row.stock_qty || 0),
                        conversion_factor: flt(row.conversion_factor || 1),
                        uom: row.uom || "",
                        stock_uom: row.stock_uom || "",
                        pos_profile: cint(doc.is_pos || 0) ? (doc.pos_profile || this.pos_profile || "") : "",
                        cost_center: row.cost_center || doc.cost_center || this.settings?.cost_center || "",
                        tax_category: doc.tax_category || "",
                        item_tax_template: row.item_tax_template || "",
                        child_doctype: row.doctype,
                        child_docname: row.name,
                        use_serial_batch_fields: cint(row.use_serial_batch_fields || 0),
                    },
                },
                freeze: false,
            });

            const details = response?.message && typeof response.message === "object"
                ? response.message
                : {};

            const preserved = {
                qty: flt(row.qty || 0),
                batch_no: row.batch_no || "",
                serial_no: row.serial_no || "",
                is_free_item: 1,
                use_serial_batch_fields: cint(row.use_serial_batch_fields || 0),
                __wmn_promotion_free_row: 1,
                __wmn_promotion_code: row.__wmn_promotion_code || "",
            };

            Object.assign(row, details, preserved);
            return row;
        },
    };
})();
