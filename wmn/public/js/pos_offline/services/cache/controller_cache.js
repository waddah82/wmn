/*
 * WMNPOSControllerCache.js
 * Single POS data access layer for IndexedDB/cache while offline.
 * This file does not change the POS UI; it returns the response shape expected by callers.
 */
(function () {
    if (window.WMNPOSControllerCache) return;

    function _clone(obj) {
        try { return JSON.parse(JSON.stringify(obj || {})); }
        catch (e) { return obj || {}; }
    }

    function _asCallLike(message) {
        const response = { message };
        const p = Promise.resolve(response);
        p.done = function (cb) { if (typeof cb === "function") p.then(cb); return p; };
        p.fail = function () { return p; };
        p.always = function (cb) { if (typeof cb === "function") p.finally(cb); return p; };
        return p;
    }

    function _offline() {
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return !navigator.onLine;
    }

    class WMNPOSControllerCache {
        constructor(ctrl, version) {
            this.ctrl = ctrl;
            this.version = version || "";
        }

        isOffline() {
            return _offline();
        }

        asCallLike(message) {
            return _asCallLike(message);
        }

        get offline() {
            return window.wmnPOSOffline || null;
        }

        async getSetting(key, fallback) {
            if (this.offline && this.offline.getSetting) {
                const value = await this.offline.getSetting(key);
                return value === undefined || value === null ? fallback : value;
            }
            return fallback;
        }

        async getAll(store) {
            if (!this.offline || !store) return [];
            if (this.offline.getAllCached) return await this.offline.getAllCached(store);
            if (!this.offline.getAll) return [];
            return await this.offline.getAll(store);
        }

        async get(store, key) {
            if (!this.offline || !this.offline.get || !store || !key) return null;
            return await this.offline.get(store, key);
        }

        async getFullSettings() {
            if (this.offline && this.offline.getFullSettings) {
                return await this.offline.getFullSettings();
            }
            return await this.getSetting("full_settings", {}) || {};
        }
        async getStockSettingsValue(fieldname = "allow_negative_stock") {
            let settings = null;

            try {
                if (window.wmnPOSOffline?.getDoc) {
                    settings = await window.wmnPOSOffline.getDoc("Stock Settings", "Stock Settings");
                }
            } catch (e) {
                settings = null;
            }

            settings = settings || window.__wmn_stock_settings || window.__wmn_pos_stock_settings || {};

            return {
                message: {
                    [fieldname]: cint(settings[fieldname] || 0)
                }
            };
        }
        async getPOSProfile(profileName) {
            if (this.offline && this.offline.getPOSProfile) {
                const profile = await this.offline.getPOSProfile(profileName);
                if (profile) return profile;
            }
            const stores = (this.offline && this.offline.STORES) || {};
            return await this.get(stores.pos_profile, profileName) || await this.getSetting("pos_profile", {}) || {};
        }

        async getCachedOpeningEntry() {
            const stores = (this.offline && this.offline.STORES) || {};
            let opening = null;
            if (this.offline?.getFirstByIndex && stores.pos_opening_entry) {
                opening = await this.offline.getFirstByIndex(
                    stores.pos_opening_entry,
                    "user",
                    frappe.session.user
                );
            }
            if (!opening) {
                const rows = await this.getAll(stores.pos_opening_entry);
                opening = (rows || []).find(r =>
                    String(r.user || r.owner || r.modified_by || "") === String(frappe.session.user || "") ||
                    String(r.status || "").toLowerCase() === "open"
                ) || rows[0];
            }
            if (!opening) {
                const settings = await this.getFullSettings();
                if (settings && settings.pos_opening) {
                    opening = {
                        name: settings.pos_opening,
                        company: settings.company,
                        pos_profile: settings.pos_profile,
                        period_start_date: settings.pos_opening_time || frappe.datetime.now_datetime(),
                        status: "Open",
                    };
                }
            }
            return opening || null;
        }

        async fetchOpeningEntryCallLike() {
            const opening = await this.getCachedOpeningEntry();
            return this.asCallLike(opening ? [opening] : []);
        }

        async getStockSettings() {
            const settings = await this.getSetting("stock_settings", {}) || {};
            return {
                allow_negative_stock: cint(settings.allow_negative_stock || 0),
            };
        }

        async getPOSProfileData(posProfile) {
            const profile = await this.getPOSProfile(posProfile);
            const settings = await this.getFullSettings();
            const merged = Object.assign({}, settings || {}, profile || {});
            merged.name = merged.name || posProfile;
            merged.pos_profile = merged.pos_profile || posProfile || merged.name;
            merged.warehouse = merged.warehouse || settings.warehouse || "";
            merged.customer = merged.customer || settings.customer || "";
            merged.company = merged.company || settings.company || "";
            merged.selling_price_list = merged.selling_price_list || settings.selling_price_list || "";
            merged.customer_groups = (merged.customer_groups || []).map(g => typeof g === "string" ? { name: g } : g);
            merged.payments = merged.payments || await this.getPaymentMethods();
            return merged;
        }

        async getPaymentMethods() {
            const stores = (this.offline && this.offline.STORES) || {};
            if (this.offline?.getAllCached) {
                return await this.offline.getAllCached(stores.payment_methods) || [];
            }
            return await this.getAll(stores.payment_methods) || [];
        }

        async getPOSSettings() {
            const stores = (this.offline && this.offline.STORES) || {};
            const posRows = this.offline?.getAllCached
                ? await this.offline.getAllCached(stores.pos_settings)
                : await this.getAll(stores.pos_settings);
            const posSettings = await this.getSetting("pos_settings", null) || (posRows || [])[0] || {};
            return posSettings || {};
        }

        async getInvoiceFields() {
            const posSettings = await this.getPOSSettings();
            return posSettings.invoice_fields || [];
        }

        async getInvoiceDoctype(defaultDoctype) {
            const posSettings = await this.getPOSSettings();
            if (["Sales Invoice", "POS Invoice"].includes(posSettings.invoice_type)) return posSettings.invoice_type;

            const settings = await this.getFullSettings();
            if (["Sales Invoice", "POS Invoice"].includes(settings.frm_doctype)) return settings.frm_doctype;
            if (["Sales Invoice", "POS Invoice"].includes(settings.invoice_type)) return settings.invoice_type;

            return defaultDoctype || "Sales Invoice";
        }

        async makeOfflineFrm(doctype) {
            let doc = null;
            if (typeof wmn_make_offline_invoice_doc === "function") {
                doc = await wmn_make_offline_invoice_doc(this.ctrl);
            } else {
                const settings = await this.getFullSettings();
                const invoiceDoctype = doctype || await this.getInvoiceDoctype("POS Invoice");
                const name = "OFFLINE-" + invoiceDoctype.replace(/\s+/g, "-").toUpperCase() + "-" + Date.now();
                doc = {
                    doctype: invoiceDoctype,
                    name,
                    __islocal: 1,
                    __offline_pos: 1,
                    docstatus: 0,
                    company: settings.company || "",
                    customer: settings.customer || "Guest",
                    customer_name: settings.customer || "Guest",
                    is_pos: 1,
                    pos_profile: settings.pos_profile || "",
                    set_warehouse: settings.warehouse || "",
                    selling_price_list: settings.selling_price_list || "",
                    posting_date: frappe.datetime.get_today(),
                    posting_time: frappe.datetime.now_time ? frappe.datetime.now_time() : "00:00:00",
                    items: [],
                    payments: [],
                    taxes: [],
                };
            }

            if (typeof wmn_make_offline_frm === "function") {
                return wmn_make_offline_frm(doc);
            }

            // Fallback fake frm if common.js helper is not loaded yet.
            return {
                doctype: doc.doctype,
                docname: doc.name,
                doc,
                __wmn_fake_offline_frm: true,
                wrapper: document.createElement("div"),
                is_dirty: () => true,
                dirty: () => {},
                refresh: () => Promise.resolve({ message: doc }),
                reload_doc: () => Promise.resolve({ message: doc }),
                call: () => Promise.resolve({ message: doc }),
                save: () => Promise.resolve({ message: doc, doc }),
                trigger: () => Promise.resolve({ message: doc }),
                refresh_field: () => Promise.resolve({ message: doc }),
                refresh_fields: () => {},
                set_value(fieldname, value) {
                    if (typeof fieldname === "object") Object.assign(doc, fieldname || {});
                    else doc[fieldname] = value;
                    return Promise.resolve({ message: doc });
                },
                add_child(fieldname, values) {
                    doc[fieldname] = doc[fieldname] || [];
                    const row = Object.assign({
                        doctype: fieldname === "items" ? (doc.doctype === "Sales Invoice" ? "Sales Invoice Item" : "POS Invoice Item") : "Sales Invoice Payment",
                        name: "OFFLINE-ROW-" + Date.now() + "-" + doc[fieldname].length,
                        parent: doc.name,
                        parenttype: doc.doctype,
                        parentfield: fieldname,
                        idx: doc[fieldname].length + 1,
                    }, values || {});
                    doc[fieldname].push(row);
                    return row;
                },
                script_manager: { trigger: () => Promise.resolve({ message: doc }), has_handlers: () => false },
                dashboard: { clear_headline: () => {} },
                page: { set_title: () => {}, clear_indicator: () => {}, set_indicator: () => {} },
            };
        }

        async getInvoiceFromCache(doctype, name) {
            if (!name) return null;
            if (this.offline?.getOfflineInvoice) {
                return await this.offline.getOfflineInvoice(name);
            }

            const stores = (this.offline && this.offline.STORES) || {};
            const rows = await this.getAll(stores.invoice_queue);
            const row = (rows || []).find(r => {
                const inv = r.invoice || r.doc || r;
                return String(r.offline_id || "") === String(name) ||
                    String(r.erpnext_name || r.server_name || "") === String(name) ||
                    String(inv.name || "") === String(name) ||
                    String(inv.wmn_offline_sync_id || inv.custom_offline_id || "") === String(name);
            });
            return row ? _clone(row.invoice || row.doc || row) : null;
        }

        async deleteInvoiceFromCache(doctype, name) {
            if (!this.offline || !this.offline.openDB) return false;
            const stores = this.offline.STORES || {};
            const db = await this.offline.openDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(stores.invoice_queue, "readwrite");
                const store = tx.objectStore(stores.invoice_queue);
                const req = store.getAll();
                req.onsuccess = () => {
                    const rows = req.result || [];
                    const row = rows.find(r => {
                        const inv = r.invoice || r.doc || r;
                        return String(r.offline_id || "") === String(name) ||
                            String(r.erpnext_name || r.server_name || "") === String(name) ||
                            String(inv.name || "") === String(name) ||
                            String(inv.wmn_offline_sync_id || inv.custom_offline_id || "") === String(name);
                    });
                    if (!row) return resolve(false);
                    store.delete(row.offline_id || row.name || name);
                    resolve(true);
                };
                req.onerror = () => reject(req.error);
            });
        }

        async getAvailableStockCallLike(itemCode, warehouse) {
            const stores = (this.offline && this.offline.STORES) || {};
            const item = await this.get(stores.items, itemCode) || {};
            const isProductBundle = cint(item.is_product_bundle || 0) === 1;

            if (isProductBundle) {
                let bundleQty = 1000000;
                let hasStockComponent = false;
                for (const component of (item.product_bundle_items || [])) {
                    if (!cint(component.is_stock_item || 0)) continue;
                    const requiredPerBundle = flt(component.qty || 0);
                    if (requiredPerBundle <= 0) continue;

                    hasStockComponent = true;
                    const componentStock = this.offline?.getStock
                        ? await this.offline.getStock(component.item_code, warehouse)
                        : await this.get(stores.stock, `${component.item_code}::${warehouse}`);
                    const componentActual = flt(componentStock?.actual_qty || 0);
                    bundleQty = Math.min(bundleQty, componentActual / requiredPerBundle);
                }

                if (!hasStockComponent) bundleQty = 1000000;
                const serverReserved = flt(
                    item.product_bundle_reserved_by_warehouse?.[warehouse] || 0
                );
                const pendingReserved = this.offline?.getPendingReservedQty
                    ? flt(await this.offline.getPendingReservedQty(itemCode, warehouse) || 0)
                    : 0;
                return this.asCallLike([bundleQty - serverReserved - pendingReserved, true, false]);
            }

            let stockRow = null;
            if (this.offline && this.offline.getStock) {
                stockRow = await this.offline.getStock(itemCode, warehouse);
            }
            if (!stockRow) {
                stockRow = await this.get(stores.stock, `${itemCode}::${warehouse}`);
            }

            const isStockItem = cint(item.is_stock_item === undefined ? 1 : item.is_stock_item);
            const stockSettings = await this.getStockSettings();
            const allowNegative = cint(stockSettings.allow_negative_stock || item.allow_negative_stock || 0);

            const cachedAvailableQty = stockRow && stockRow.available_qty !== undefined
                ? flt(stockRow.available_qty || 0)
                : flt(stockRow && stockRow.actual_qty || item.actual_qty || 0);
            const pendingReservedQty = this.offline?.getPendingReservedQty
                ? flt(await this.offline.getPendingReservedQty(itemCode, warehouse) || 0)
                : 0;
            const availableQty = cachedAvailableQty - pendingReservedQty;

            return this.asCallLike([availableQty, isStockItem, allowNegative]);
        }

        async checkSerialReserved(itemCode, warehouse, serialNo) {
            if (!itemCode || !warehouse || !serialNo) return false;
            if (!this.offline?.getPendingReservedSerialNos) return false;
            const reservedSerials = await this.offline.getPendingReservedSerialNos(itemCode, warehouse);
            return (reservedSerials || []).includes(String(serialNo));
        }

        async saveCurrentInvoice() {
            if (!this.ctrl || !this.ctrl.frm || !this.ctrl.frm.doc) return null;
            const doc = this.ctrl.frm.doc;
            if (typeof wmn_recalculate_offline_doc === "function") wmn_recalculate_offline_doc(doc);
            if (this.offline && this.offline.saveInvoice) {
                return await this.offline.saveInvoice(doc, this.ctrl);
            }
            return { invoice: _clone(doc), status: "pending" };
        }

        async makeReturnInvoiceOffline(sourceDoc) {
            // Base stage: no server call. Return locally only if sourceDoc is already a cached/local invoice.
            if (!sourceDoc || !sourceDoc.__offline_pos) {
                frappe.throw({
                    title: __("Offline"),
                    message: __("Return invoice is available offline only for locally cached invoices."),
                });
            }
            const frm = await this.makeOfflineFrm(sourceDoc.doctype || (this.ctrl && this.ctrl.settings && this.ctrl.settings.frm_doctype) || "POS Invoice");
            frm.doc.is_return = 1;
            frm.doc.return_against = sourceDoc.name;
            frm.doc.__wmn_return_against_credit = typeof wmn_source_invoice_is_credit === "function"
                ? wmn_source_invoice_is_credit(sourceDoc)
                : false;
            if (this.ctrl) {
                this.ctrl.__wmn_return_against_credit = frm.doc.__wmn_return_against_credit === true;
            }
            frm.doc.customer = sourceDoc.customer;
            frm.doc.customer_name = sourceDoc.customer_name;
            frm.doc.items = (sourceDoc.items || []).map((row, idx) => Object.assign({}, row, {
                name: "OFFLINE-RETURN-ROW-" + Date.now() + "-" + idx,
                qty: -Math.abs(flt(row.qty || 0)),
                amount: -Math.abs(flt(row.amount || 0)),
                parent: frm.doc.name,
                parenttype: frm.doc.doctype,
                idx: idx + 1,
            }));

            if (typeof wmn_recalculate_offline_doc === "function") {
                wmn_recalculate_offline_doc(frm.doc);
            }
            return frm;
        }

        async safeRefreshRecentOrders(ctrl) {
            try {
                if (ctrl && ctrl.recent_order_list && ctrl.recent_order_list.refresh_list) {
                    return ctrl.recent_order_list.refresh_list();
                }
                if (ctrl && ctrl.order_summary && ctrl.order_summary.toggle_summary_placeholder) {
                    ctrl.order_summary.toggle_summary_placeholder(true);
                }
            } catch (e) {
                console.warn("WMN offline recent orders refresh skipped", e);
            }
            return null;
        }
    }

    window.WMNPOSControllerCache = WMNPOSControllerCache;
})();
