/* Offline stock movement accounting. */
        function wmn_offline_stock_movement_key(item_code, warehouse) {
            return String(item_code || "") + "::" + String(warehouse || "");
        }

        function wmn_offline_batch_movement_key(item_code, batch_no, warehouse) {
            return String(item_code || "") + "::" + String(batch_no || "") + "::" + String(warehouse || "");
        }

        function wmn_collect_offline_stock_movements(doc) {
            doc = doc || {};
            const stock = {};
            const item = {};
            const batch = {};

            (doc.items || []).forEach(function (row) {
                if (!row || !row.item_code) return;

                const item_code = String(row.item_code || "");
                const warehouse = String(row.warehouse || doc.set_warehouse || doc.warehouse || "");
                const batch_no = String(row.batch_no || "");
                const qty = flt(row.stock_qty || (flt(row.qty || 0) * flt(row.conversion_factor || 1)) || row.qty || 0);

                if (!qty) return;

                item[item_code] = flt(item[item_code] || 0) + qty;

                if (warehouse) {
                    const stockKey = wmn_offline_stock_movement_key(item_code, warehouse);
                    stock[stockKey] = stock[stockKey] || { item_code: item_code, warehouse: warehouse, qty: 0 };
                    stock[stockKey].qty = flt(stock[stockKey].qty || 0) + qty;
                }

                if (batch_no && warehouse) {
                    const batchKey = wmn_offline_batch_movement_key(item_code, batch_no, warehouse);
                    batch[batchKey] = batch[batchKey] || { item_code: item_code, batch_no: batch_no, warehouse: warehouse, qty: 0 };
                    batch[batchKey].qty = flt(batch[batchKey].qty || 0) + qty;
                }
            });

            return { stock: stock, item: item, batch: batch };
        }

        function wmn_subtract_movement_maps(newMap, oldMap) {
            const out = {};
            newMap = newMap || {};
            oldMap = oldMap || {};

            Object.keys(newMap).forEach(function (key) {
                out[key] = Object.assign({}, newMap[key]);
                out[key].qty = flt((newMap[key] && newMap[key].qty) || 0);
            });

            Object.keys(oldMap).forEach(function (key) {
                if (!out[key]) out[key] = Object.assign({}, oldMap[key]);
                out[key].qty = flt(out[key].qty || 0) - flt((oldMap[key] && oldMap[key].qty) || 0);
            });

            Object.keys(out).forEach(function (key) {
                if (Math.abs(flt(out[key].qty || 0)) < 0.000001) {
                    delete out[key];
                }
            });

            return out;
        }

        async function wmn_get_existing_offline_invoice_for_stock(doc) {
            try {
                if (!doc || !doc.custom_offline_id || !window.wmnPOSOffline || !window.wmnPOSOffline.get) return null;
                const oldRow = await window.wmnPOSOffline.get(window.wmnPOSOffline.STORES.invoice_queue, doc.custom_offline_id);
                if (!oldRow) return null;
                if (String(oldRow.queue_kind || "").toLowerCase() === "draft") return null;
                const oldDoc = oldRow.invoice || oldRow.doc || oldRow.data || null;
                if (String(oldDoc?.wmn_pos_stage || "").trim() === "AWAITING_CASHIER") return null;
                return oldDoc;
            } catch (e) {
                console.warn("WMN offline stock old invoice read skipped", e);
                return null;
            }
        }

        async function wmn_apply_offline_available_qty_delta(newDoc, oldDoc) {
            if (!window.wmnPOSOffline || !window.wmnPOSOffline.get || !window.wmnPOSOffline.bulkPut) return false;

            const stores = window.wmnPOSOffline.STORES || {};
            const next = wmn_collect_offline_stock_movements(newDoc || {});
            const prev = wmn_collect_offline_stock_movements(oldDoc || {});

            const stockDelta = wmn_subtract_movement_maps(next.stock, prev.stock);
            const batchDelta = wmn_subtract_movement_maps(next.batch, prev.batch);
            const itemDelta = {};

            Object.keys(next.item || {}).forEach(function (itemCode) {
                itemDelta[itemCode] = flt(next.item[itemCode] || 0);
            });
            Object.keys(prev.item || {}).forEach(function (itemCode) {
                itemDelta[itemCode] = flt(itemDelta[itemCode] || 0) - flt(prev.item[itemCode] || 0);
            });
            Object.keys(itemDelta).forEach(function (itemCode) {
                if (Math.abs(flt(itemDelta[itemCode] || 0)) < 0.000001) delete itemDelta[itemCode];
            });

            const stockRows = [];
            for (const key of Object.keys(stockDelta)) {
                const delta = stockDelta[key];
                const current = await window.wmnPOSOffline.get(stores.stock, key) || {
                    key: key,
                    item_code: delta.item_code,
                    warehouse: delta.warehouse,
                    actual_qty: 0
                };
                current.actual_qty = flt(current.actual_qty || 0) - flt(delta.qty || 0);
                stockRows.push(current);
            }

            const batchRows = [];
            for (const key of Object.keys(batchDelta)) {
                const delta = batchDelta[key];
                const current = await window.wmnPOSOffline.get(stores.batches, key);
                if (!current) continue;
                current.actual_qty = flt(current.actual_qty || 0) - flt(delta.qty || 0);
                batchRows.push(current);
            }

            const itemRows = [];
            for (const itemCode of Object.keys(itemDelta)) {
                const current = await window.wmnPOSOffline.get(stores.items, itemCode);
                if (!current) continue;
                current.actual_qty = flt(current.actual_qty || 0) - flt(itemDelta[itemCode] || 0);
                itemRows.push(current);
            }

            if (stockRows.length) await window.wmnPOSOffline.bulkPut(stores.stock, stockRows);
            if (batchRows.length) await window.wmnPOSOffline.bulkPut(stores.batches, batchRows);
            if (itemRows.length) await window.wmnPOSOffline.bulkPut(stores.items, itemRows);

            return !!(stockRows.length || batchRows.length || itemRows.length);
        }

