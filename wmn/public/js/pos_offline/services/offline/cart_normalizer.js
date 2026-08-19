/* Offline cart normalization and save preparation. */
        function wmn_clean_link_value(value) {
            if (value === null || value === undefined) return "";
            const s = String(value).trim();
            if (!s || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") return "";
            return s;
        }

        function wmn_key(value) {
            return wmn_clean_link_value(value).toLowerCase();
        }

        async function wmn_get_offline_item_master(itemCode) {
            if (!window.wmnPOSOffline || !itemCode) return null;

            try {
                return await window.wmnPOSOffline.get(window.wmnPOSOffline.STORES.items, itemCode);
            } catch (e) {
                return null;
            }
        }

        function wmn_get_known_item_flag(row, master, fieldname) {
            if (master && master[fieldname] !== undefined) return cint(master[fieldname] || 0);
            if (row && row[fieldname] !== undefined) return cint(row[fieldname] || 0);
            return 0;
        }

        function wmn_offline_item_merge_key(row, fallbackWarehouse) {
            row = row || {};
            const wh = wmn_clean_link_value(row.warehouse || fallbackWarehouse || "");
            return [
                wmn_key(row.item_code),
                wmn_key(row.uom || row.stock_uom || "Nos"),
                wmn_key(wh),
                wmn_key(row.batch_no),
                wmn_key(row.serial_no),
                cint(row.is_free_item || 0),
                wmn_key(row.__wmn_promotion_code || "")
            ].join("||");
        }

        function wmn_find_mergeable_offline_item(items, incoming, fallbackWarehouse) {
            const incomingKey = wmn_offline_item_merge_key(incoming, fallbackWarehouse);

            return (items || []).find(row => {
                if (!row || flt(row.qty || 0) <= 0) return false;
                return wmn_offline_item_merge_key(row, fallbackWarehouse) === incomingKey;
            }) || null;
        }

        function wmn_normalize_offline_cart_row(row, doc, idx, fallbackWarehouse) {
            if (!row) return row;

            const childDoctype = wmn_get_invoice_child_doctypes((doc && doc.doctype) || "Sales Invoice").itemDoctype;
            const safeName = row.name || ("OFFLINE-ITEM-" + Date.now() + "-" + (idx || 0));
            const warehouse = wmn_clean_link_value(row.warehouse || fallbackWarehouse || (doc && doc.set_warehouse) || "");

            row.doctype = row.doctype || childDoctype;
            row.name = safeName;
            row.parent = row.parent || (doc && doc.name) || "";
            row.parenttype = row.parenttype || (doc && doc.doctype) || "Sales Invoice";
            row.parentfield = row.parentfield || "items";
            row.idx = row.idx || ((idx || 0) + 1);

            row.item_code = wmn_clean_link_value(row.item_code || "");
            row.item_name = row.item_name || row.item_code || "";
            row.description = row.description || row.item_name || row.item_code || "";
            row.stock_uom = wmn_clean_link_value(row.stock_uom || row.uom || "Nos");
            row.uom = wmn_clean_link_value(row.uom || row.stock_uom || "Nos");
            row.warehouse = warehouse;

            row.batch_no = wmn_clean_link_value(row.batch_no);
            row.serial_no = wmn_clean_link_value(row.serial_no);

            row.conversion_factor = flt(row.conversion_factor || 1);
            row.qty = flt(row.qty || 0);
            row.stock_qty = flt(row.stock_qty || (row.qty * row.conversion_factor));

            row.rate = flt(row.rate || row.price_list_rate || 0);
            row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
            row.amount = flt(row.qty || 0) * flt(row.rate || 0);
            row.net_rate = flt(row.net_rate || row.rate || 0);
            row.net_amount = flt(row.qty || 0) * flt(row.net_rate || row.rate || 0);
            row.base_rate = flt(row.base_rate || row.rate || 0);
            row.base_amount = flt(row.qty || 0) * flt(row.base_rate || row.rate || 0);
            row.base_net_rate = flt(row.base_net_rate || row.net_rate || row.rate || 0);
            row.base_net_amount = flt(row.qty || 0) * flt(row.base_net_rate || row.net_rate || row.rate || 0);

            row.offline_item_tax_map = wmn_normalize_offline_item_tax_map(row);

            row.item_data = Object.assign({}, row.item_data || {}, {
                name: row.item_code,
                item_code: row.item_code,
                item_name: row.item_name,
                description: row.description,
                image: row.image || "",
                stock_uom: row.stock_uom,
                uom: row.uom,
                has_batch_no: row.has_batch_no || 0,
                has_serial_no: row.has_serial_no || 0,
                offline_item_tax_map: row.offline_item_tax_map,
                item_tax_rate: row.item_tax_rate || row.offline_item_tax_map
            });

            return row;
        }

        function wmn_normalize_all_offline_cart_rows(doc, fallbackWarehouse) {
            if (!doc) return doc;

            doc.items = (doc.items || [])
                .filter(row => row && row.item_code && flt(row.qty || 0) > 0)
                .map((row, idx) => wmn_normalize_offline_cart_row(row, doc, idx, fallbackWarehouse));

            return doc;
        }

        async function wmn_clean_doc_batch_serial_for_save(doc) {
            if (!doc) return doc;

            for (const row of (doc.items || [])) {
                if (!row || !row.item_code) continue;

                const master = await wmn_get_offline_item_master(row.item_code);
                const hasBatch = wmn_get_known_item_flag(row, master, "has_batch_no");
                const hasSerial = wmn_get_known_item_flag(row, master, "has_serial_no");

                row.has_batch_no = hasBatch;
                row.has_serial_no = hasSerial;

                if (!hasBatch) {
                    delete row.batch_no;
                } else {
                    row.batch_no = wmn_clean_link_value(row.batch_no);
                }

                if (!hasSerial) {
                    delete row.serial_no;
                } else {
                    row.serial_no = wmn_clean_link_value(row.serial_no);
                }

                row.warehouse = wmn_clean_link_value(row.warehouse || doc.set_warehouse || "");
                row.item_code = wmn_clean_link_value(row.item_code);
                row.uom = wmn_clean_link_value(row.uom || row.stock_uom || "Nos");
                row.stock_uom = wmn_clean_link_value(row.stock_uom || row.uom || "Nos");
            }

            wmn_normalize_current_offline_invoice_child_doctypes(doc);
            wmn_normalize_all_offline_cart_rows(doc, doc.set_warehouse);

            if (typeof wmn_recalculate_offline_doc === "function") {
                wmn_recalculate_offline_doc(doc);
            }

            wmn_fill_offline_tax_cost_centers(doc);

            return doc;
        }
        function wmn_pos_cart_is_empty_for_reload() {
            try {
                const pos = window.cur_pos;
                const doc = pos && pos.frm && pos.frm.doc ? pos.frm.doc : null;
                const items = doc && Array.isArray(doc.items) ? doc.items : [];
                const activeItems = items.filter(row => row && row.item_code && flt(row.qty || 0) !== 0);
                return activeItems.length === 0;
            } catch (e) {
                return false;
            }
        }

        // Online/offline browser events are handled by wmn_on_pos_online_event above.
        // If a cart has items, the current invoice remains offline until Complete Order or New Order.
        function wmn_pos_invoice_doctype(ctrl) {
            ctrl = ctrl || window.cur_pos || {};
            const settings = ctrl.settings || {};
            const doc = ctrl.frm && ctrl.frm.doc ? ctrl.frm.doc : {};
            const profileAsSalesInvoice = window.WMN_POS?.Services?.Settings?.POSProfileSettings?.getEffective?.()?.as_sales_invoice;
            return cint(profileAsSalesInvoice ?? settings.as_sales_invoice ?? doc.as_sales_invoice ?? 0) === 1 ||
                doc.doctype === "Sales Invoice"
                ? "Sales Invoice"
                : "POS Invoice";
        }

        function wmn_pos_item_doctype(invoiceDoctype) {
            return invoiceDoctype === "Sales Invoice" ? "Sales Invoice Item" : "POS Invoice Item";
        }

        function wmn_pos_return_method(invoiceDoctype) {
            return invoiceDoctype === "Sales Invoice"
                ? "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return"
                : "erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return";
        }

        function wmn_safe_settings(settings) {
            settings = settings || {};
            if (settings.print_receipt_on_order_complete === undefined) {
                settings.print_receipt_on_order_complete = 0;
            }
            return settings;
        }



        function wmn_ensure_pos_cart_item_data(row) {
            if (!row || typeof row !== "object") return row;

            const itemCode = row.item_code || (row.item_data && (row.item_data.item_code || row.item_data.name)) || row.name || "";
            const itemName = row.item_name || row.description || itemCode || "";

            if (!row.item_data || typeof row.item_data !== "object") {
                row.item_data = {};
            }

            row.item_data.name = row.item_data.name || itemCode;
            row.item_data.item_code = row.item_data.item_code || itemCode;
            row.item_data.item_name = row.item_data.item_name || itemName;
            row.item_data.description = row.item_data.description || row.description || itemName;
            row.item_data.image = row.item_data.image || row.image || "";
            row.item_data.stock_uom = row.item_data.stock_uom || row.stock_uom || row.uom || "Nos";
            row.item_data.uom = row.item_data.uom || row.uom || row.stock_uom || "Nos";
            row.item_data.has_batch_no = row.item_data.has_batch_no || row.has_batch_no || 0;
            row.item_data.has_serial_no = row.item_data.has_serial_no || row.has_serial_no || 0;

            if (!row.item_code && itemCode) row.item_code = itemCode;
            if (!row.item_name && itemName) row.item_name = itemName;
            if (!row.name) row.name = "WMN-CART-ROW-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);

            return row;
        }

        function wmn_ensure_pos_cart_items_data(doc) {
            if (!doc || !Array.isArray(doc.items)) return doc;
            doc.items = doc.items.filter(row => row && (row.item_code || (row.item_data && row.item_data.name)));
            doc.items.forEach(wmn_ensure_pos_cart_item_data);
            return doc;
        }

        

        if (!window.__wmn_offline_print_delegation_clean) {
            $(document).on("click.wmnOfflinePrintReceiptV32", "button, .btn", function(e) {
                const text = ($(this).text() || "").trim().toLowerCase();

                if (
                    text !== "print receipt" &&
                    text !== String(__("Print Receipt")).toLowerCase()
                ) {
                    return;
                }

                const isOffline = (window.wmn_is_pos_offline ? window.wmn_is_pos_offline() : window.__wmn_pos_effective_offline === true);

                if (!isOffline) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();

                if (
                    window.wmn_print_offline_receipt &&
                    window.cur_pos &&
                    window.cur_pos.frm &&
                    window.cur_pos.frm.doc
                ) {
                    window.wmn_print_offline_receipt(window.cur_pos.frm.doc);
                }

                return false;
            });

            window.__wmn_offline_print_delegation_clean = true;
        }


