/* Offline customer/price/document/form adapters and local calculations. */
        async function wmn_find_customer_offline(name) {
            if (!name || !window.wmnPOSOffline) return null;
            try {
                const stores = window.wmnPOSOffline.STORES;
                const exact = await window.wmnPOSOffline.get(stores.customers, name);
                if (exact) return exact;
                if (window.wmnPOSOffline.getFirstByIndex) {
                    const byName = await window.wmnPOSOffline.getFirstByIndex(stores.customers, "customer_name", name);
                    if (byName) return byName;
                    const byMobile = await window.wmnPOSOffline.getFirstByIndex(stores.customers, "mobile_no", name);
                    if (byMobile) return byMobile;
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        async function wmn_find_price_offline(item_code, price_list, uom, batch_no = "") {
            try {
                const rows = window.wmnPOSOffline.getAllByIndex
                    ? await window.wmnPOSOffline.getAllByIndex(window.wmnPOSOffline.STORES.item_prices, "item_code", item_code)
                    : [];
                const today = frappe.datetime.get_today();
                const selectedBatch = String(batch_no || "").trim();
                const selectedUom = String(uom || "").trim();
                const dateValue = value => String(value || "").slice(0, 10);

                const candidates = (rows || []).filter(p => {
                    if (p.item_code !== item_code) return false;
                    if (price_list && p.price_list !== price_list) return false;
                    if (p.selling !== undefined && !cint(p.selling || 0)) return false;

                    const validFrom = dateValue(p.valid_from);
                    const validUpto = dateValue(p.valid_upto);
                    if (validFrom && validFrom > today) return false;
                    if (validUpto && validUpto < today) return false;

                    const rowBatch = String(p.batch_no || "").trim();
                    if (selectedBatch) {
                        if (rowBatch && rowBatch !== selectedBatch) return false;
                    } else if (rowBatch) {
                        return false;
                    }

                    if (selectedUom && p.uom && p.uom !== selectedUom) return false;
                    return true;
                });

                candidates.sort((a, b) => {
                    const aBatch = selectedBatch && String(a.batch_no || "").trim() === selectedBatch ? 2 : 1;
                    const bBatch = selectedBatch && String(b.batch_no || "").trim() === selectedBatch ? 2 : 1;
                    if (aBatch !== bBatch) return bBatch - aBatch;

                    const aUom = selectedUom && String(a.uom || "") === selectedUom ? 2 : 1;
                    const bUom = selectedUom && String(b.uom || "") === selectedUom ? 2 : 1;
                    if (aUom !== bUom) return bUom - aUom;

                    const aFrom = dateValue(a.valid_from) || "0000-00-00";
                    const bFrom = dateValue(b.valid_from) || "0000-00-00";
                    if (aFrom !== bFrom) return bFrom.localeCompare(aFrom);

                    return String(b.modified || "").localeCompare(String(a.modified || ""));
                });

                return candidates[0] || null;
            } catch (e) {
                return null;
            }
        }
            function wmn_prepare_offline_item_detail_row(row, doc, settings) {
                if (!row) return row;

                row.uom = row.uom || row.stock_uom || "Nos";
                row.stock_uom = row.stock_uom || row.uom || "Nos";
                row.conversion_factor = flt(row.conversion_factor || 1);

                row.warehouse =
                    row.warehouse ||
                    doc.set_warehouse ||
                    settings.warehouse ||
                    "";

                row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
                row.rate = flt(row.rate || row.price_list_rate || 0);

                row.qty = flt(row.qty || 1);
                row.stock_qty = flt(row.stock_qty || row.qty * row.conversion_factor);

                row.amount = flt(row.qty * row.rate);
                row.net_amount = row.amount;
                row.base_amount = row.amount;
                row.base_net_amount = row.amount;

                row.item_data = Object.assign({}, row.item_data || {}, {
                    name: row.item_code,
                    item_code: row.item_code,
                    item_name: row.item_name || row.item_code,
                    stock_uom: row.stock_uom,
                    uom: row.uom,
                    has_batch_no: cint(row.has_batch_no || 0),
                    has_serial_no: cint(row.has_serial_no || 0),
                });

                return row;
            }
        function mergeDuplicateOfflineItems(doc) {
            if (!doc || !Array.isArray(doc.items)) return doc;

            const merged = [];
            const map = new Map();

            for (const row of doc.items) {
                const itemCode = String(row.item_code || "").trim();
                if (!itemCode) continue;

                const uom = String(row.uom || row.stock_uom || "Nos").trim();
                const warehouse = String(row.warehouse || doc.set_warehouse || "").trim();
                const rate = String(flt(row.rate || row.price_list_rate || 0));

                const batchNo = String(row.batch_no || "").trim();
                const serialNo = String(row.serial_no || "").trim();

 
                const key = [
                    itemCode,
                    uom,
                    warehouse,
                    rate,
                    batchNo,
                    serialNo,
                    cint(row.is_free_item || 0),
                    String(row.__wmn_promotion_code || "").trim().toUpperCase()
                ].join("||");

                if (map.has(key)) {
                    const existing = map.get(key);

                    existing.qty = flt(existing.qty || 0) + flt(row.qty || 1);
                    existing.conversion_factor = flt(existing.conversion_factor || row.conversion_factor || 1);
                    existing.stock_qty = flt(existing.qty || 0) * flt(existing.conversion_factor || 1);

                    existing.amount = flt(existing.qty || 0) * flt(existing.rate || existing.price_list_rate || 0);
                    existing.net_amount = existing.amount;
                    existing.base_amount = existing.amount;
                    existing.base_net_amount = existing.amount;
                } else {
                    const copy = Object.assign({}, row);

                    copy.qty = flt(copy.qty || 1);
                    copy.conversion_factor = flt(copy.conversion_factor || 1);
                    copy.stock_qty = flt(copy.stock_qty || copy.qty * copy.conversion_factor);

                    copy.batch_no = batchNo;
                    copy.serial_no = serialNo;

                    copy.amount = flt(copy.qty || 0) * flt(copy.rate || copy.price_list_rate || 0);
                    copy.net_amount = copy.amount;
                    copy.base_amount = copy.amount;
                    copy.base_net_amount = copy.amount;

                    map.set(key, copy);
                    merged.push(copy);
                }
            }

            merged.forEach((row, idx) => {
                row.idx = idx + 1;
            });

            doc.items = merged;
            return doc;
        }


        function wmn_parse_json_map(value) {
            if (!value) return {};
            if (typeof value === "object") return value || {};
            try {
                const parsed = JSON.parse(String(value || "{}"));
                return parsed && typeof parsed === "object" ? parsed : {};
            } catch (e) {
                return {};
            }
        }

        function wmn_normalize_offline_item_tax_map(item) {
            item = item || {};
            const taxMap = wmn_parse_json_map(
                item.offline_item_tax_map ||
                item.item_tax_rate ||
                item.item_tax_map ||
                item.__wmn_item_tax_map ||
                (item.item_data && (item.item_data.offline_item_tax_map || item.item_data.item_tax_rate)) ||
                {}
            );
            item.offline_item_tax_map = taxMap;
            item.item_tax_rate = item.item_tax_rate || taxMap;
            return taxMap;
        }

        function wmn_make_offline_tax_row(row, idx, parentDoc) {
            row = row || {};
            return {
                doctype: row.doctype || "Sales Taxes and Charges",
                name: row.name || row.row_id || ("OFFLINE-TAX-" + Date.now() + "-" + idx),
                parent: (parentDoc && parentDoc.name) || row.parent || "",
                parenttype: (parentDoc && parentDoc.doctype) || row.parenttype || "Sales Invoice",
                parentfield: "taxes",
                idx: idx + 1,
                charge_type: row.charge_type || "On Net Total",
                account_head: row.account_head || "",
                description: row.description || row.account_head || "Tax",
                rate: flt(row.rate || 0),
                tax_amount: 0,
                base_tax_amount: 0,
                tax_amount_after_discount_amount: 0,
                base_tax_amount_after_discount_amount: 0,
                total: 0,
                base_total: 0,
                included_in_print_rate: cint(row.included_in_print_rate || 0),
                cost_center: row.cost_center || wmn_get_offline_tax_cost_center(parentDoc, row) || "",
            };
        }

        function wmn_get_offline_tax_cost_center(doc, preferredRow) {
            doc = doc || {};

            return (
                (preferredRow && preferredRow.cost_center) ||
                doc.cost_center ||
                ((doc.items || []).find(r => r && r.cost_center) || {}).cost_center ||
                (window.cur_pos && window.cur_pos.settings && window.cur_pos.settings.cost_center) ||
                ""
            );
        }

        function wmn_fill_offline_tax_cost_centers(doc) {
            if (!doc || !Array.isArray(doc.taxes)) return doc;

            const fallbackCostCenter = wmn_get_offline_tax_cost_center(doc, null);

            (doc.taxes || []).forEach(tax => {
                if (!tax) return;
                if (!tax.cost_center) {
                    tax.cost_center = fallbackCostCenter;
                }
            });

            return doc;
        }

        function wmn_clone_offline_tax_rows(rows, parentDoc) {
            return (rows || [])
                .filter(r => r && (r.account_head || flt(r.rate || 0)))
                .map((r, idx) => wmn_make_offline_tax_row(r, idx, parentDoc));
        }

        async function wmn_get_cached_offline_tax_rows(parentDoc) {
            try {
                if (!window.wmnPOSOffline || !window.wmnPOSOffline.getSetting) return [];
                const rows = await window.wmnPOSOffline.getSetting("pos_tax_rows");
                return wmn_clone_offline_tax_rows(rows || [], parentDoc);
            } catch (e) {
                console.warn("WMN offline tax cache read skipped", e);
                return [];
            }
        }

        async function wmn_refresh_offline_tax_cache_from_online_doc(doc) {
            try {
                if (!window.wmnPOSOffline || !window.wmnPOSOffline.setSetting || !window.wmnPOSOffline.getSetting) return false;
                if (!doc || !Array.isArray(doc.taxes) ) return false;
                if (!doc.taxes.length) {
                    await window.wmnPOSOffline.setSetting("pos_tax_rows", []);
                    await window.wmnPOSOffline.setSetting("pos_tax_signature", "[]");
                    return true;
                }
                const rows = doc.taxes
                    .filter(t => t && (t.account_head || flt(t.rate || 0)))
                    .map((t, idx) => ({
                        idx: idx + 1,
                        charge_type: t.charge_type || "On Net Total",
                        account_head: t.account_head || "",
                        description: t.description || t.account_head || "Tax",
                        rate: flt(t.rate || 0),
                        included_in_print_rate: cint(t.included_in_print_rate || 0),
                        cost_center: t.cost_center || "",
                    }));

                if (!rows.length) return false;

                const signature = JSON.stringify(rows.map(r => ({
                    charge_type: r.charge_type,
                    account_head: r.account_head,
                    rate: r.rate,
                    included_in_print_rate: r.included_in_print_rate,
                })));

                const oldSignature = await window.wmnPOSOffline.getSetting("pos_tax_signature");
                if (oldSignature === signature) return true;

                await window.wmnPOSOffline.setSetting("pos_tax_rows", rows);
                await window.wmnPOSOffline.setSetting("pos_tax_signature", signature);
                return true;
            } catch (e) {
                console.warn("WMN offline tax cache refresh skipped", e);
                return false;
            }
        }

        function wmn_tax_account_key(value) {
            return String(value || "")
                .trim()
                .toLowerCase()
                .replace(/\s+/g, " ");
        }

        function wmn_tax_account_code(value) {
            return String(value || "")
                .split("-")[0]
                .trim()
                .toLowerCase();
        }

        function wmn_get_item_tax_rate_for_account(row, accountHead, defaultRate) {
            const taxMap = wmn_normalize_offline_item_tax_map(row);
            const directKey = String(accountHead || "");

            if (directKey && Object.prototype.hasOwnProperty.call(taxMap, directKey)) {
                return flt(taxMap[directKey] || 0);
            }

            const targetKey = wmn_tax_account_key(accountHead);
            const targetCode = wmn_tax_account_code(accountHead);

            for (const key in taxMap) {
                if (!Object.prototype.hasOwnProperty.call(taxMap, key)) continue;

                if (wmn_tax_account_key(key) === targetKey) {
                    return flt(taxMap[key] || 0);
                }

                if (targetCode && wmn_tax_account_code(key) === targetCode) {
                    return flt(taxMap[key] || 0);
                }
            }

            return flt(defaultRate || 0);
        }

        function wmn_add_missing_item_tax_rows_to_offline_taxes(taxes, items, doc) {
            taxes = taxes || [];
            const existing = {};

            taxes.forEach(tax => {
                const account = tax && tax.account_head;
                if (!account) return;
                existing[wmn_tax_account_key(account)] = true;
                const code = wmn_tax_account_code(account);
                if (code) existing["code::" + code] = true;
            });

            (items || []).forEach(row => {
                const taxMap = wmn_normalize_offline_item_tax_map(row);

                Object.keys(taxMap || {}).forEach(accountHead => {
                    if (!accountHead) return;

                    const normalized = wmn_tax_account_key(accountHead);
                    const code = wmn_tax_account_code(accountHead);

                    if (existing[normalized] || (code && existing["code::" + code])) {
                        return;
                    }

                    taxes.push(wmn_make_offline_tax_row({
                        charge_type: "On Net Total",
                        account_head: accountHead,
                        description: accountHead,
                        rate: 0,
                        included_in_print_rate: 0,
                        cost_center: row.cost_center || (doc && doc.cost_center) || "",
                    }, taxes.length, doc));

                    existing[normalized] = true;
                    if (code) existing["code::" + code] = true;
                });
            });

            return taxes;
        }

        function wmn_apply_offline_taxes_and_discount(doc, total_qty, net_total, round_total) {
            doc = doc || {};
            const items = doc.items || [];
            const taxes = wmn_add_missing_item_tax_rows_to_offline_taxes(
                wmn_clone_offline_tax_rows(doc.taxes || [], doc),
                items,
                doc
            );

            const applyDiscountOn = doc.apply_discount_on === "Net Total" ? "Net Total" : "Grand Total";
            const discountPercentage = flt(doc.additional_discount_percentage || 0);
            let discountAmount = flt(doc.discount_amount || 0);
            const rawNetTotal = flt(net_total || 0);
            const isReturn = cint(doc.is_return || 0) === 1 || rawNetTotal < 0;

            if (applyDiscountOn === "Net Total") {
                if (discountPercentage > 0) {
                    discountAmount = rawNetTotal * discountPercentage / 100;
                } else if (isReturn && discountAmount > 0) {
                    discountAmount = -discountAmount;
                }

                if (isReturn) {
                    discountAmount = Math.min(0, Math.max(rawNetTotal, discountAmount));
                } else {
                    discountAmount = Math.max(0, Math.min(discountAmount, rawNetTotal));
                }
            }

            const adjustedNetForTax = applyDiscountOn === "Net Total"
                ? rawNetTotal - discountAmount
                : rawNetTotal;
            let totalTaxes = 0;
            let runningTotal = adjustedNetForTax;

            taxes.forEach((tax, idx) => {
                let taxAmount = 0;
                const chargeType = String(tax.charge_type || "On Net Total");

                if (chargeType === "Actual") {
                    taxAmount = flt(tax.tax_amount || tax.base_tax_amount || 0);
                } else {
                    items.forEach(row => {
                        const rate = wmn_get_item_tax_rate_for_account(row, tax.account_head, tax.rate);
                        const rowNetAmount = flt(row.net_amount || row.amount || 0);
                        let taxableAmount = rowNetAmount;

                        if (applyDiscountOn === "Net Total" && discountAmount && rawNetTotal) {
                            const distributedDiscount = discountAmount * rowNetAmount / rawNetTotal;
                            taxableAmount = rowNetAmount - distributedDiscount;
                        }

                        taxAmount += taxableAmount * rate / 100;
                    });
                }

                tax.idx = idx + 1;
                tax.tax_amount = taxAmount;
                tax.base_tax_amount = taxAmount;
                tax.tax_amount_after_discount_amount = taxAmount;
                tax.base_tax_amount_after_discount_amount = taxAmount;
                runningTotal += taxAmount;
                tax.total = runningTotal;
                tax.base_total = runningTotal;
                totalTaxes += taxAmount;
            });

            const totalBeforeGrandDiscount = rawNetTotal + flt(totalTaxes || 0);

            if (applyDiscountOn === "Grand Total") {
                if (discountPercentage > 0) {
                    discountAmount = totalBeforeGrandDiscount * discountPercentage / 100;
                } else if (isReturn && discountAmount > 0) {
                    discountAmount = -discountAmount;
                }

                if (isReturn) {
                    discountAmount = Math.min(0, Math.max(totalBeforeGrandDiscount, discountAmount));
                } else {
                    discountAmount = Math.max(0, Math.min(discountAmount, totalBeforeGrandDiscount));
                }
            }

            const grandTotal = applyDiscountOn === "Net Total"
                ? adjustedNetForTax + totalTaxes
                : totalBeforeGrandDiscount - discountAmount;
            const roundedTotal = round_total ? Math.round(grandTotal) : grandTotal;

            doc.taxes = taxes;
            wmn_fill_offline_tax_cost_centers(doc);
            doc.total_taxes_and_charges = totalTaxes;
            doc.base_total_taxes_and_charges = totalTaxes;
            doc.apply_discount_on = applyDiscountOn;
            doc.additional_discount_percentage = discountPercentage;
            doc.discount_amount = discountAmount;
            doc.base_discount_amount = discountAmount;
            doc.total_qty = total_qty;
            doc.total = rawNetTotal;
            doc.net_total = rawNetTotal;
            doc.base_total = rawNetTotal;
            doc.base_net_total = rawNetTotal;
            doc.grand_total = grandTotal;
            doc.rounded_total = roundedTotal;
            doc.base_grand_total = grandTotal;
            doc.base_rounded_total = roundedTotal;

            let paid = 0;
            (doc.payments || []).forEach(p => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
                paid += p.amount;
            });

            const payable = flt(doc.rounded_total || doc.grand_total || 0);
            doc.paid_amount = paid;
            doc.base_paid_amount = paid;
            doc.outstanding_amount = payable - paid;
            doc.change_amount = payable >= 0 ? Math.max(0, paid - payable) : 0;
            doc.base_change_amount = doc.change_amount;
            return doc;
        }

        function wmn_recalculate_offline_doc(doc) {
            if (!doc) return doc;

            if (typeof mergeDuplicateOfflineItems === "function") {
                mergeDuplicateOfflineItems(doc);
            }

            if (typeof wmn_normalize_all_offline_cart_rows === "function") {
                wmn_normalize_all_offline_cart_rows(doc, doc.set_warehouse || doc.warehouse || "");
            }

            let total_qty = 0;
            let total = 0;

            (doc.items || []).forEach((row, idx) => {
                row.idx = idx + 1;
                row.qty = flt(row.qty || 1);
                row.rate = flt(row.rate || row.price_list_rate || 0);
                row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
                row.amount = flt(row.qty * row.rate);
                row.net_rate = flt(row.net_rate || row.rate);
                row.net_amount = flt(row.qty * row.net_rate);
                row.base_rate = flt(row.base_rate || row.rate);
                row.base_amount = flt(row.base_amount || row.amount);
                row.base_net_rate = flt(row.base_net_rate || row.net_rate);
                row.base_net_amount = flt(row.base_net_amount || row.net_amount);
                total_qty += row.qty;
                total += row.net_amount;
            });

            wmn_apply_offline_taxes_and_discount(doc, total_qty, total, false);

            if (typeof wmn_normalize_all_offline_cart_rows === "function") {
                wmn_normalize_all_offline_cart_rows(doc, doc.set_warehouse || doc.warehouse || "");
            }

            return doc;
        }


        function wmn_get_invoice_child_doctypes(invoiceDoctype) {
            return {
                itemDoctype: invoiceDoctype === "POS Invoice" ? "POS Invoice Item" : "Sales Invoice Item",
                paymentDoctype: "Sales Invoice Payment"
            };
        }

        function wmn_normalize_current_offline_invoice_child_doctypes(doc) {
            if (!doc) return doc;

            const childDoctypes = wmn_get_invoice_child_doctypes(doc.doctype || "Sales Invoice");

            (doc.items || []).forEach((row) => {
                row.doctype = childDoctypes.itemDoctype;
                row.parenttype = doc.doctype || "Sales Invoice";
                row.parentfield = "items";
                row.parent = doc.name;
            });

            (doc.payments || []).forEach((row) => {
                row.doctype = childDoctypes.paymentDoctype;
                row.parenttype = doc.doctype || "Sales Invoice";
                row.parentfield = "payments";
                row.parent = doc.name;
            });

            return doc;
        }

async function wmn_make_offline_invoice_doc(ctrl) {
            const settings = await wmn_get_offline_settings();
            const customer = await wmn_find_customer_offline(settings.customer) || {};
            const payments = window.wmnPOSOffline
                ? (window.wmnPOSOffline.getAllCached
                    ? await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.payment_methods)
                    : await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods))
                : [];
            const cachedTaxRows = await wmn_get_cached_offline_tax_rows(null);

            const today = frappe.datetime.get_today();

            let invoiceDoctype = ["Sales Invoice", "POS Invoice"].includes(settings.frm_doctype)
                ? settings.frm_doctype
                : (["Sales Invoice", "POS Invoice"].includes(settings.invoice_type) ? settings.invoice_type : "");
            if (!invoiceDoctype && window.cur_pos?.wmn_cache) {
                try {
                    invoiceDoctype = await window.cur_pos.wmn_cache().getInvoiceDoctype("Sales Invoice");
                } catch (e) {}
            }
            if (!["Sales Invoice", "POS Invoice"].includes(invoiceDoctype)) invoiceDoctype = "Sales Invoice";

            const childDoctypes = wmn_get_invoice_child_doctypes(invoiceDoctype);
            const offlineName = (invoiceDoctype === "Sales Invoice" ? "OFFLINE-SINV-" : "OFFLINE-PINV-") + Date.now();

            const doc = {
                doctype: invoiceDoctype,
                name: offlineName,
                __islocal: 1,
                __offline_pos: 1,
                offline_pos: 1,
                __wmn_target_doctype: invoiceDoctype,
                target_doctype: invoiceDoctype,
                docstatus: 0,
                company: settings.company || "",
                customer: customer.name || settings.customer || "Guest",
                customer_name: customer.customer_name || customer.name || settings.customer || "Guest",
                debit_to: customer.debit_to || customer.party_account || settings.debit_to || "",
                is_pos: 1,
                is_created_using_pos: invoiceDoctype === "Sales Invoice" ? 1 : 0,
                is_return: 0,
                update_stock: settings.update_stock === undefined ? 1 : settings.update_stock,
                pos_profile: settings.pos_profile || "",
                posting_date: today,
                posting_time: frappe.datetime.now_time ? frappe.datetime.now_time() : "00:00:00",
                due_date: today,
                currency: settings.currency || "YER",
                conversion_rate: flt(settings.conversion_rate || 1),
                selling_price_list: settings.selling_price_list || "",
                price_list_currency: settings.price_list_currency || settings.currency || "YER",
                plc_conversion_rate: flt(settings.plc_conversion_rate || 1),
                set_warehouse: settings.warehouse || "",
                items: [],
                payments: (payments || []).map((p, idx) => ({
                    doctype: childDoctypes.paymentDoctype,
                    name: "OFFLINE-PAY-" + Date.now() + "-" + idx,
                    parenttype: invoiceDoctype,
                    parentfield: "payments",
                    parent: offlineName,
                    mode_of_payment: p.mode_of_payment,
                    account: p.account || "",
                    type: p.type || "",
                    default: p.default,
                    amount: 0,
                    base_amount: 0,
                })),
                taxes: wmn_clone_offline_tax_rows(cachedTaxRows, { name: offlineName, doctype: invoiceDoctype }),
            };

            doc.__wmn_item_doctype = childDoctypes.itemDoctype;

            return wmn_recalculate_offline_doc(wmn_normalize_current_offline_invoice_child_doctypes(doc));
        }



        function wmn_register_offline_doc_locals(doc) {
            if (!doc || !window.frappe) return doc;

            frappe.locals = frappe.locals || {};

            const putLocal = function (row) {
                if (!row || !row.doctype || !row.name) return;
                frappe.locals[row.doctype] = frappe.locals[row.doctype] || {};
                frappe.locals[row.doctype][row.name] = row;
            };

            putLocal(doc);
            (doc.items || []).forEach(putLocal);
            (doc.payments || []).forEach(putLocal);
            (doc.taxes || []).forEach(putLocal);

            return doc;
        }

        function wmn_get_offline_child_doc(doc, doctype, name) {
            if (!doc || !doctype || !name) return null;
            if (doc.doctype === doctype && doc.name === name) return doc;

            const tables = [doc.items || [], doc.payments || [], doc.taxes || []];
            for (const rows of tables) {
                const found = (rows || []).find(row => row && row.doctype === doctype && row.name === name);
                if (found) return found;
            }

            return null;
        }

        function wmn_emit_offline_refresh_fields(frm) {
            if (!frm || !frm.doc) return;

            try {
                wmn_register_offline_doc_locals(frm.doc);
            } catch (e) {}

            try {
                if (frm.wrapper && window.jQuery) {
                    $(frm.wrapper).trigger("refresh-fields");
                }
            } catch (e) {
                console.warn("WMN offline refresh-fields event skipped", e);
            }
        }

        function wmn_recalculate_and_emit_offline_form(frm, fieldname) {
            if (!frm || !frm.doc) return Promise.resolve();

            try {
                if (typeof wmn_recalculate_offline_doc === "function") {
                    wmn_recalculate_offline_doc(frm.doc);
                }
            } catch (e) {
                console.warn("WMN offline form recalculation skipped", e);
            }

            if (!fieldname || fieldname === "items" || fieldname === "payments" || fieldname === "taxes") {
                wmn_emit_offline_refresh_fields(frm);
            }

            return Promise.resolve({ message: frm.doc });
        }



        function wmn_make_offline_item_meta(doctype) {
            const make = (fieldname, label, fieldtype, options = "", read_only = 0) => ({
                fieldname,
                label: __(label || fieldname),
                fieldtype,
                options,
                read_only,
            });

            return {
                name: doctype,
                doctype: "DocType",
                module: "Accounts",
                fields: [
                    make("qty", "Quantity", "Float"),
                    make("uom", "UOM", "Link", "UOM"),
                    make("rate", "Rate", "Currency"),
                    make("conversion_factor", "Conversion Factor", "Float"),
                    make("discount_percentage", "Discount (%)", "Percent"),
                    make("warehouse", "Warehouse", "Link", "Warehouse"),
                    make("actual_qty", "Available Qty", "Float", "", 1),
                    make("price_list_rate", "Price List Rate", "Currency", "", 1),
                    make("serial_no", "Serial No", "Small Text"),
                    make("batch_no", "Batch No", "Link", "Batch"),
                ],
            };
        }

        function wmn_pos_get_meta(doctype) {
            const meta = frappe.get_meta(doctype);
            if (meta && Array.isArray(meta.fields) && meta.fields.length) return meta;

            if (
                typeof wmn_is_pos_offline === "function" &&
                wmn_is_pos_offline() &&
                ["POS Invoice Item", "Sales Invoice Item"].includes(doctype)
            ) {
                return wmn_make_offline_item_meta(doctype);
            }

            return meta;
        }

        function wmn_pos_get_doc(doctype, name) {
            if ((typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) || wmn_current_doc_is_offline_pos()) {
                const frm = window.cur_pos && window.cur_pos.frm ? window.cur_pos.frm : null;
                const doc = frm && frm.doc ? frm.doc : null;

                if (doc && doc.doctype === doctype && doc.name === name) return doc;

                const target = wmn_get_offline_child_doc(doc, doctype, name);
                if (target) return target;

                if (frappe.locals?.[doctype]?.[name]) return frappe.locals[doctype][name];
            }

            return typeof frappe.get_doc === "function" ? frappe.get_doc(doctype, name) : null;
        }

        function wmn_pos_set_value(doctype, name, fieldname, value) {
            try {
                if ((typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) || wmn_current_doc_is_offline_pos()) {
                    const frm = window.cur_pos && window.cur_pos.frm ? window.cur_pos.frm : null;
                    const doc = frm && frm.doc ? frm.doc : null;
                    const target = doc && doc.doctype === doctype && doc.name === name
                        ? doc
                        : wmn_get_offline_child_doc(doc, doctype, name);

                    if (target) {
                        if (typeof fieldname === "object") Object.assign(target, fieldname || {});
                        else target[fieldname] = value;

                        if (typeof wmn_recalculate_offline_doc === "function" && doc) {
                            wmn_recalculate_offline_doc(doc);
                        }

                        if (doc) wmn_register_offline_doc_locals(doc);
                        if (frm) wmn_emit_offline_refresh_fields(frm);

                        const pos = window.cur_pos;
                        try {
                            if (pos?.cart?.update_totals_section) pos.cart.update_totals_section(frm);
                            if (pos?.payment?.update_totals_section && doc) pos.payment.update_totals_section(doc);
                        } catch (e) {}

                        return Promise.resolve({ message: target });
                    }
                }
            } catch (e) {
                console.warn("WMN POS set_value adapter skipped", e);
            }

            return frappe.model.set_value(doctype, name, fieldname, value);
        }

        window.wmn_pos_get_meta = wmn_pos_get_meta;
        window.wmn_pos_get_doc = wmn_pos_get_doc;
        window.wmn_pos_set_value = wmn_pos_set_value;

        function wmn_make_offline_frm(doc) {
            const wrapper = document.createElement("div");
            wrapper.className = "wmn-offline-form-wrapper";

            const frm = {
                doctype: doc.doctype,
                docname: doc.name,
                doc,
                wrapper,
                fields_dict: {},
                cscript: {
                    calculate_outstanding_amount: function () {
                        wmn_recalculate_offline_doc(frm.doc);
                        return Promise.resolve(frm.doc);
                    },
                    calculate_taxes_and_totals: function () {
                        wmn_recalculate_offline_doc(frm.doc);
                        return Promise.resolve(frm.doc);
                    },
                    apply_price_list: function () {
                        wmn_recalculate_offline_doc(frm.doc);
                        return Promise.resolve(frm.doc);
                    }
                },
                __wmn_fake_offline_frm: true,
                script_manager: {
                    trigger: (fieldname, doctype, name) => {
                        const target = wmn_get_offline_child_doc(frm.doc, doctype, name) || frm.doc;

                        if (target && target.parentfield === "items") {
                            target.qty = flt(target.qty || 0);
                            target.conversion_factor = flt(target.conversion_factor || 1);
                            target.stock_qty = flt(target.stock_qty || target.qty * target.conversion_factor);
                            target.price_list_rate = flt(target.price_list_rate || target.rate || 0);
                            target.rate = flt(target.rate || target.price_list_rate || 0);
                            target.amount = flt(target.qty || 0) * flt(target.rate || 0);
                            target.net_rate = flt(target.net_rate || target.rate || 0);
                            target.net_amount = flt(target.qty || 0) * flt(target.net_rate || target.rate || 0);
                            target.base_rate = flt(target.base_rate || target.rate || 0);
                            target.base_amount = flt(target.base_amount || target.amount || 0);
                            target.base_net_rate = flt(target.base_net_rate || target.net_rate || 0);
                            target.base_net_amount = flt(target.base_net_amount || target.net_amount || 0);
                        }

                        return wmn_recalculate_and_emit_offline_form(frm, "items");
                    },
                    has_handlers: () => false
                },
                dashboard: { clear_headline: () => {} },
                page: { set_title: () => {}, clear_indicator: () => {}, set_indicator: () => {} },
                dirty: () => { frm.__dirty = true; },
                is_dirty: () => true,
                refresh: () => {
                    wmn_emit_offline_refresh_fields(frm);
                    return Promise.resolve();
                },
                refresh_field: (fieldname) => {
                    if (!fieldname || ["items", "payments", "taxes", "outstanding_amount", "paid_amount", "base_paid_amount"].includes(fieldname)) {
                        wmn_recalculate_offline_doc(frm.doc);
                        wmn_emit_offline_refresh_fields(frm);
                    }
                    return Promise.resolve();
                },
                refresh_fields: () => {
                    wmn_emit_offline_refresh_fields(frm);
                },
                trigger: (fieldname) => {
                    return wmn_recalculate_and_emit_offline_form(frm, fieldname);
                },
                call: () => Promise.resolve({ message: frm.doc }),
                save: () => {
                    wmn_recalculate_offline_doc(frm.doc);
                    wmn_register_offline_doc_locals(frm.doc);
                    return Promise.resolve({ message: frm.doc, doc: frm.doc });
                },
                reload_doc: () => Promise.resolve(),
                set_df_property: () => {},
                toggle_display: () => {},
                set_query: () => {},
                add_custom_button: () => {},
                clear_custom_buttons: () => {},
                set_intro: () => {},
                add_child(fieldname, values) {
                    this.doc[fieldname] = this.doc[fieldname] || [];
                    const childDoctypes = wmn_get_invoice_child_doctypes(this.doc.doctype || "Sales Invoice");
                    const row = Object.assign({
                        doctype: fieldname === "items" ? childDoctypes.itemDoctype : childDoctypes.paymentDoctype,
                        name: "OFFLINE-ROW-" + Date.now() + "-" + this.doc[fieldname].length,
                        parent: this.doc.name,
                        parenttype: this.doc.doctype,
                        parentfield: fieldname,
                        idx: this.doc[fieldname].length + 1,
                    }, values || {});

                    row.doctype = row.doctype || (fieldname === "items" ? childDoctypes.itemDoctype : childDoctypes.paymentDoctype);
                    row.parent = row.parent || this.doc.name;
                    row.parenttype = row.parenttype || this.doc.doctype;
                    row.parentfield = row.parentfield || fieldname;
                    row.idx = row.idx || (this.doc[fieldname].length + 1);

                    this.doc[fieldname].push(row);
                    wmn_recalculate_offline_doc(this.doc);
                    wmn_register_offline_doc_locals(this.doc);
                    return row;
                },
                set_value(fieldname, value) {
                    if (typeof fieldname === "object") Object.assign(this.doc, fieldname);
                    else this.doc[fieldname] = value;
                    return wmn_recalculate_and_emit_offline_form(frm, fieldname);
                },
            };

            wmn_register_offline_doc_locals(doc);

            if (window.frappe) {
                frappe.locals = frappe.locals || {};
                frappe.locals[doc.doctype] = frappe.locals[doc.doctype] || {};
                frappe.locals[doc.doctype][doc.name] = doc;
            }

            return frm;
        }


async function wmn_v9_direct_add_or_update(ctrl, args) {
            const frm = (ctrl && ctrl.frm) || (window.cur_pos && window.cur_pos.frm);
            const doc = frm && frm.doc;
            if (!doc) return;

            const raw = (args && args.item) || args || {};
            const rawCode = raw.item_code || raw.item || raw.value || raw.name || raw.item_name || raw.barcode || "";
            let qtyDelta = 1;

            if (args && args.field === "qty") {
                if (args.value === "+1") qtyDelta = 1;
                else if (args.value === "-1") qtyDelta = -1;
                else if (typeof args.value === "number") qtyDelta = flt(args.value);
            }

            if (!rawCode && !raw.item_code) return;

            const settings = typeof wmn_get_offline_settings === "function"
                ? await wmn_get_offline_settings()
                : (window.wmnPOSOffline && window.wmnPOSOffline.getFullSettings ? await window.wmnPOSOffline.getFullSettings() : {});

            const priceList = doc.selling_price_list || settings.selling_price_list || "";
            let found = null;

            if (window.wmnPOSOffline && window.wmnPOSOffline.findItem) {
                found = await window.wmnPOSOffline.findItem(rawCode || raw.item_code, priceList);
            }

            // findItem already uses indexed item, barcode, serial and batch lookups.
            // Do not scan the full item store when an exact interactive lookup misses.

            const itemCode = (found && found.item_code) || raw.item_code || raw.value || raw.name || rawCode;
            if (!itemCode) return;

            const uom = (found && (found.uom || found.stock_uom)) || raw.uom || "Nos";
            const warehouse = doc.set_warehouse || settings.warehouse || (found && found.warehouse) || "";

            let price = null;
            if (found && typeof wmn_find_price_offline === "function") {
                price = await wmn_find_price_offline(
                    found.item_code,
                    priceList,
                    uom,
                    found.batch_no || raw.batch_no || ""
                );
            } else if (found && window.wmnPOSOffline && window.wmnPOSOffline.findPrice) {
                price = await window.wmnPOSOffline.findPrice(found.item_code, priceList, uom);
            }

            const rate = flt(
                raw.price_list_rate ||
                raw.rate ||
                (price && price.price_list_rate) ||
                (found && (found.price_list_rate || found.rate)) ||
                0
            );

            doc.items = doc.items || [];
            const existing = doc.items.find(row =>
                String(row.item_code || "").trim() === String(itemCode || "").trim() &&
                String(row.uom || row.stock_uom || "Nos").trim() === String(uom || "Nos").trim() &&
                String(row.warehouse || "").trim() === String(warehouse || "").trim() &&
                flt(row.rate || row.price_list_rate || 0) === rate
            );

            if (existing) {
                existing.qty = Math.max(0, flt(existing.qty || 0) + flt(qtyDelta || 1));
                existing.stock_qty = flt(existing.qty || 0) * flt(existing.conversion_factor || 1);
                if (existing.qty <= 0) {
                    doc.items = doc.items.filter(r => r !== existing);
                }
            } else if (qtyDelta > 0) {
                doc.items.push({
                    doctype: (doc.__wmn_item_doctype || wmn_get_invoice_child_doctypes(doc.doctype || "Sales Invoice").itemDoctype),
                    name: "OFFLINE-SINV-ITEM-" + Date.now() + "-" + doc.items.length,
                    parenttype: (doc.doctype || "Sales Invoice"),
                    parentfield: "items",
                    parent: doc.name,
                    item_code: itemCode,
                    item_name: (found && found.item_name) || raw.item_name || itemCode,
                    description: (found && (found.description || found.item_name)) || raw.description || raw.item_name || itemCode,
                    item_group: (found && found.item_group) || "",
                    stock_uom: (found && (found.stock_uom || found.uom)) || uom,
                    uom,
                    conversion_factor: 1,
                    qty: flt(qtyDelta || 1),
                    stock_qty: flt(qtyDelta || 1),
                    warehouse,
                    price_list_rate: rate,
                    rate,
                    amount: rate * flt(qtyDelta || 1),
                    net_rate: rate,
                    net_amount: rate * flt(qtyDelta || 1),
                    base_rate: rate,
                    base_amount: rate * flt(qtyDelta || 1),
                    base_net_rate: rate,
                    base_net_amount: rate * flt(qtyDelta || 1),
                    income_account: (found && found.income_account) || settings.income_account || "",
                    expense_account: (found && found.expense_account) || settings.expense_account || "",
                    cost_center: (found && found.cost_center) || settings.cost_center || "",
                });
            }

            if (window.wmnPOSOffline && window.wmnPOSOffline.mergeDuplicateOfflineItems) {
                window.wmnPOSOffline.mergeDuplicateOfflineItems(doc);
            } else if (typeof mergeDuplicateOfflineItems === "function") {
                mergeDuplicateOfflineItems(doc);
            }

            if (window.wmnPOSOffline && window.wmnPOSOffline.recalculateOfflineDoc) {
                window.wmnPOSOffline.recalculateOfflineDoc(doc);
            } else if (typeof wmn_recalculate_offline_doc === "function") {
                wmn_recalculate_offline_doc(doc);
            } else if (typeof recalculateOfflineDoc === "function") {
                recalculateOfflineDoc(doc);
            }
        }

