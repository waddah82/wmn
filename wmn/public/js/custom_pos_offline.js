frappe.provide("erpnext.PointOfSale");

frappe.pages['point-of-sale'].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Point of Sale"),
        single_column: true,
    });

    frappe.require("point-of-sale.bundle.js", async function() {

        /**
         * WMN POS PWA Bridge
         * Registers manifest + Service Worker for opening POS shell offline.
         * Notes:
         * - The service worker file must be served from root: /pos-offline-sw.js
         * - The manifest file should be served from root: /pos-offline-manifest.webmanifest
         */
        function registerWMNPOSServiceWorker() {
            try {
                if (!document.querySelector('link[rel="manifest"][href="/pos-offline-manifest.webmanifest"]')) {
                    const manifest = document.createElement("link");
                    manifest.rel = "manifest";
                    manifest.href = "/pos-offline-manifest.webmanifest";
                    document.head.appendChild(manifest);
                }

                if (!document.querySelector('meta[name="theme-color"]')) {
                    const theme = document.createElement("meta");
                    theme.name = "theme-color";
                    theme.content = "#4F46E5";
                    document.head.appendChild(theme);
                }

                if (!("serviceWorker" in navigator)) {
                    console.warn("WMN POS Offline: Service Worker is not supported in this browser");
                    return;
                }

                if (location.protocol !== "https:" && location.hostname !== "localhost") {
                    console.warn("WMN POS Offline: Service Worker requires HTTPS or localhost");
                    return;
                }

                const doRegister = function () {
                    navigator.serviceWorker.register("/pos-offline-sw.js", {
                        scope: "/",
                        updateViaCache: "none"
                    })
                        .then(function(reg) {
                            console.log("✅ WMN POS Service Worker registered", reg.scope);

                            // Force browser to check updated /pos-offline-sw.js now.
                            if (reg && reg.update) {
                                reg.update().catch(function(e) {
                                    console.warn("WMN POS Service Worker update check failed", e);
                                });
                            }
                        })
                        .catch(function(err) {
                            console.error("❌ WMN POS Service Worker registration failed", err);
                            frappe.show_alert({
                                message: __("Service Worker registration failed: /pos-offline-sw.js"),
                                indicator: "orange"
                            });
                        });
                };

                // custom_pos_offline.js may load after window load, so do not rely on load event only.
                if (document.readyState === "complete" || document.readyState === "interactive") {
                    doRegister();
                } else {
                    window.addEventListener("load", doRegister, { once: true });
                }

                if (!window.__wmn_sw_controllerchange_v25) {
                    navigator.serviceWorker.addEventListener("controllerchange", function () {
                        console.log("WMN POS Service Worker controller changed");
                    });
                    window.__wmn_sw_controllerchange_v25 = true;
                }
            } catch (e) {
                console.error("WMN POS PWA registration error", e);
            }
        }

        registerWMNPOSServiceWorker();


        /**
         * WMN POS Offline Bridge
         * - Stores POS master data in IndexedDB
         * - Reads items/stock offline
         * - Queues invoices when the browser is offline
         *
         * Required server methods for full production usage:
         * 1) wmn.api.get_pos_offline_data
         * 2) wmn.api.sync_offline_pos_invoice
         */
        const WMN_POS_OFFLINE = (() => {
            function safeKey(value) {
                return String(value || "")
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]+/g, "_")
                    .replace(/^_+|_+$/g, "") || "default";
            }

            function getSiteKey() {
                const boot = window.frappe && window.frappe.boot ? window.frappe.boot : {};
                const site =
                    boot.sitename ||
                    window.sitename ||
                    (boot.sysdefaults && boot.sysdefaults.site_name) ||
                    location.hostname;

                return safeKey(location.host + "__" + site);
            }

            const LEGACY_DB_NAME = "wmn_erpnext_pos_offline";
            const DB_NAME = "wmn_erpnext_pos_offline__" + getSiteKey();
            const DB_VERSION = 77;
            const STORES = {
                items: "items",
                customers: "customers",
                item_prices: "item_prices",
                stock: "stock",
                batches: "batches",
                item_barcodes: "item_barcodes",
                serials: "serials",
                payment_methods: "payment_methods",
                settings: "settings",
                pos_profile: "pos_profile",
                pos_settings: "pos_settings",
                pos_opening_entry: "pos_opening_entry",
                item_groups: "item_groups",
                doctype_meta: "doctype_meta",
                invoice_queue: "invoice_queue",
                sync_log: "sync_log",
            };

            let dbPromise = null;
            let preloadRunning = false;
            let preloadLoaded = false;
            let lastPreloadKey = "";

            console.log("WMN POS Offline DB:", DB_NAME);

            function online() {
                return navigator.onLine !== false;
            }

            function clone(obj) {
                return JSON.parse(JSON.stringify(obj || {}));
            }

            function openDB() {
                if (dbPromise) return dbPromise;
                dbPromise = new Promise((resolve, reject) => {
                    const req = indexedDB.open(DB_NAME, DB_VERSION);

                    req.onupgradeneeded = function(event) {
                        const db = event.target.result;

                        if (!db.objectStoreNames.contains(STORES.items)) {
                            const store = db.createObjectStore(STORES.items, { keyPath: "item_code" });
                            store.createIndex("item_name", "item_name", { unique: false });
                            store.createIndex("item_group", "item_group", { unique: false });
                            store.createIndex("barcode", "barcode", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.customers)) {
                            const store = db.createObjectStore(STORES.customers, { keyPath: "name" });
                            store.createIndex("customer_name", "customer_name", { unique: false });
                            store.createIndex("mobile_no", "mobile_no", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.item_prices)) {
                            const store = db.createObjectStore(STORES.item_prices, { keyPath: "key" });
                            store.createIndex("item_code", "item_code", { unique: false });
                            store.createIndex("price_list", "price_list", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.stock)) {
                            const store = db.createObjectStore(STORES.stock, { keyPath: "key" });
                            store.createIndex("item_code", "item_code", { unique: false });
                            store.createIndex("warehouse", "warehouse", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.batches)) {
                            const store = db.createObjectStore(STORES.batches, { keyPath: "key" });
                            store.createIndex("batch_no", "batch_no", { unique: false });
                            store.createIndex("item_code", "item_code", { unique: false });
                            store.createIndex("warehouse", "warehouse", { unique: false });
                            store.createIndex("barcode", "barcode", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.item_barcodes)) {
                            const store = db.createObjectStore(STORES.item_barcodes, { keyPath: "key" });
                            store.createIndex("barcode", "barcode", { unique: false });
                            store.createIndex("item_code", "item_code", { unique: false });
                            store.createIndex("uom", "uom", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.serials)) {
                            const store = db.createObjectStore(STORES.serials, { keyPath: "key" });
                            store.createIndex("serial_no", "serial_no", { unique: false });
                            store.createIndex("item_code", "item_code", { unique: false });
                            store.createIndex("warehouse", "warehouse", { unique: false });
                            store.createIndex("barcode", "barcode", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.payment_methods)) {
                            db.createObjectStore(STORES.payment_methods, { keyPath: "mode_of_payment" });
                        }

                        if (!db.objectStoreNames.contains(STORES.settings)) {
                            db.createObjectStore(STORES.settings, { keyPath: "key" });
                        }

                        if (!db.objectStoreNames.contains(STORES.pos_profile)) {
                            db.createObjectStore(STORES.pos_profile, { keyPath: "name" });
                        }

                        if (!db.objectStoreNames.contains(STORES.pos_settings)) {
                            db.createObjectStore(STORES.pos_settings, { keyPath: "key" });
                        }

                        if (!db.objectStoreNames.contains(STORES.pos_opening_entry)) {
                            const store = db.createObjectStore(STORES.pos_opening_entry, { keyPath: "name" });
                            store.createIndex("user", "user", { unique: false });
                            store.createIndex("pos_profile", "pos_profile", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.item_groups)) {
                            const store = db.createObjectStore(STORES.item_groups, { keyPath: "name" });
                            store.createIndex("parent_item_group", "parent_item_group", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.doctype_meta)) {
                            db.createObjectStore(STORES.doctype_meta, { keyPath: "name" });
                        }

                        if (!db.objectStoreNames.contains(STORES.invoice_queue)) {
                            const store = db.createObjectStore(STORES.invoice_queue, { keyPath: "offline_id" });
                            store.createIndex("status", "status", { unique: false });
                            store.createIndex("created_at", "created_at", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.sync_log)) {
                            db.createObjectStore(STORES.sync_log, { keyPath: "key" });
                        }
                    };

                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                return dbPromise;
            }

            async function bulkPut(storeName, rows) {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readwrite");
                    const store = tx.objectStore(storeName);
                    (rows || []).forEach(row => row && store.put(row));
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                });
            }

            async function getAll(storeName) {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readonly");
                    const req = tx.objectStore(storeName).getAll();
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }

            async function get(storeName, key) {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readonly");
                    const req = tx.objectStore(storeName).get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => reject(req.error);
                });
            }

            async function setSetting(key, value) {
                return bulkPut(STORES.settings, [{ key, value }]);
            }

            async function getSetting(key) {
                const row = await get(STORES.settings, key);
                return row ? row.value : null;
            }

            function normalizeItem(row) {
                row = row || {};
                return Object.assign({}, row, {
                    item_code: row.item_code || row.name,
                    item_name: row.item_name || row.item_code || row.name,
                    item_group: row.item_group || "",
                    stock_uom: row.stock_uom || row.uom || "",
                    uom: row.uom || row.stock_uom || "",
                    description: row.description || "",
                    image: row.image || "",
                    barcode: row.barcode || "",
                    price_list_rate: flt(row.price_list_rate || row.rate || 0),
                    rate: flt(row.rate || row.price_list_rate || 0),
                    actual_qty: flt(row.actual_qty || 0),
                    modified: row.modified || "",
                    has_variants: row.has_variants || 0,
                    variant_of: row.variant_of || "",
                    is_sales_item: row.is_sales_item === undefined ? 1 : cint(row.is_sales_item || 0),
                    is_stock_item: cint(row.is_stock_item || 0),
                    has_batch_no: cint(row.has_batch_no || 0),
                    has_serial_no: cint(row.has_serial_no || 0),
                    income_account: row.income_account || row.default_income_account || "",
                    expense_account: row.expense_account || row.default_expense_account || "",
                    cost_center: row.cost_center || row.default_cost_center || "",
                    warehouse: row.warehouse || row.default_warehouse || "",
                    item_tax_template: row.item_tax_template || "",
                    brand: row.brand || "",
                    disabled: cint(row.disabled || 0),
                });
            }

            function normalizePrice(row) {
                row = row || {};
                const itemCode = row.item_code || row.name;
                const priceList = row.price_list || "";
                const uom = row.uom || "";
                return {
                    key: `${priceList}::${itemCode}::${uom}`,
                    item_code: itemCode,
                    price_list: priceList,
                    price_list_rate: flt(row.price_list_rate || row.rate || 0),
                    currency: row.currency || "",
                    uom: uom,
                    modified: row.modified || "",
                };
            }

            function normalizeStock(row) {
                row = row || {};
                return {
                    key: `${row.item_code}::${row.warehouse}`,
                    item_code: row.item_code,
                    warehouse: row.warehouse,
                    actual_qty: flt(row.actual_qty || 0),
                };
            }

            function normalizeBatch(row) {
                row = row || {};
                const itemCode = row.item_code || row.item || "";
                const batchNo = row.batch_no || row.name || "";
                const warehouse = row.warehouse || row.default_warehouse || "";
                return {
                    key: `${itemCode}::${batchNo}::${warehouse}`,
                    item_code: itemCode,
                    batch_no: batchNo,
                    warehouse: warehouse,
                    barcode: row.barcode || row.batch_barcode || "",
                    expiry_date: row.expiry_date || "",
                    manufacturing_date: row.manufacturing_date || "",
                    actual_qty: flt(row.actual_qty || row.qty || row.balance_qty || 0),
                    disabled: cint(row.disabled || 0),
                };
            }

            function normalizeItemBarcode(row) {
                row = row || {};
                const itemCode = row.item_code || row.parent || row.item || "";
                const barcode = row.barcode || "";
                const uom = row.uom || row.stock_uom || "";
                return {
                    key: `${barcode}::${itemCode}::${uom}`,
                    barcode: barcode,
                    item_code: itemCode,
                    uom: uom,
                    barcode_type: row.barcode_type || "",
                };
            }

            function normalizeSerial(row) {
                row = row || {};
                const itemCode = row.item_code || row.item || "";
                const serialNo = row.serial_no || row.name || "";
                const warehouse = row.warehouse || row.current_warehouse || "";
                return {
                    key: `${itemCode}::${serialNo}`,
                    item_code: itemCode,
                    serial_no: serialNo,
                    warehouse: warehouse,
                    barcode: row.barcode || row.serial_barcode || "",
                    batch_no: row.batch_no || "",
                    status: row.status || "",
                    disabled: cint(row.disabled || 0),
                };
            }

            function normalizeCustomer(row) {
                row = row || {};
                return Object.assign({}, row, {
                    name: row.name || row.customer || row.value,
                    customer_name: row.customer_name || row.name || row.customer || row.value,
                    customer_group: row.customer_group || "",
                    territory: row.territory || "",
                    mobile_no: row.mobile_no || "",
                    email_id: row.email_id || "",
                    tax_id: row.tax_id || "",
                    customer_primary_address: row.customer_primary_address || row.primary_address || "",
                    primary_address: row.primary_address || row.customer_primary_address || "",
                    payment_terms_template: row.payment_terms_template || row.payment_terms || "",
                    debit_to: row.debit_to || row.party_account || row.account || row.receivable_account || "",
                    party_account: row.party_account || row.debit_to || row.account || row.receivable_account || "",
                    tax_category: row.tax_category || "",
                    loyalty_program: row.loyalty_program || "",
                });
            }

            function normalizeItemGroup(row) {
                row = row || {};
                return {
                    name: row.name || row.item_group_name,
                    parent_item_group: row.parent_item_group || "",
                    is_group: cint(row.is_group || 0),
                };
            }

            function normalizeOpeningEntry(row) {
                row = row || {};
                return Object.assign({}, row, {
                    name: row.name || "OFFLINE-POS-OPENING",
                    status: row.status || "Open",
                    user: row.user || (frappe.session && frappe.session.user) || "",
                    pos_profile: row.pos_profile || "",
                    company: row.company || "",
                    balance_details: row.balance_details || [],
                });
            }

            function getPOSArgs(ctrl) {
                const settings = ctrl && ctrl.settings ? ctrl.settings : {};
                const doc = ctrl && ctrl.frm ? ctrl.frm.doc : {};
                return {
                    pos_profile: settings.pos_profile || doc.pos_profile || "",
                    price_list: settings.selling_price_list || doc.selling_price_list || "",
                    warehouse: settings.warehouse || doc.set_warehouse || doc.warehouse || "",
                };
            }

            async function fetchMasterData(ctrl) {
                const args = getPOSArgs(ctrl);
                if (!args.pos_profile) {
                    throw new Error("POS Profile is missing; cannot preload offline POS data.");
                }

                const r = await frappe.call({
                    method: "wmn.api.get_pos_offline_data",
                    args: args,
                    freeze: false,
                });

                return r.message || {};
            }

            async function preload(ctrl, force = false) {
                if (!online()) return false;
                if (preloadRunning) return false;

                const args = getPOSArgs(ctrl);

                // لا تعرض خطأ إذا كانت صفحة POS لم تجهز POS Profile بعد.
                // هذا كان سبب ظهور رسالة الخطأ ثم رسالة النجاح مباشرة.
                if (!args.pos_profile) {
                    return false;
                }

                const preloadKey = `${args.pos_profile || ""}::${args.price_list || ""}::${args.warehouse || ""}`;
                if (!force && preloadLoaded && preloadKey && preloadKey === lastPreloadKey) return false;

                preloadRunning = true;
                try {
                    const data = await fetchMasterData(ctrl);

                    const items = (data.items || []).map(normalizeItem).filter(d => d.item_code);
                    const prices = (data.item_prices || data.prices || []).map(normalizePrice).filter(d => d.item_code);
                    const customers = (data.customers || []).map(normalizeCustomer).filter(d => d && d.name);
                    const stock = (data.stock || []).map(normalizeStock).filter(d => d.item_code && d.warehouse);
                    const batches = (data.batches || data.item_batches || data.batch_data || []).map(normalizeBatch).filter(d => d.item_code && d.batch_no);
                    const itemBarcodes = (data.item_barcodes || data.barcodes || data.item_barcode_data || []).map(normalizeItemBarcode).filter(d => d.item_code && d.barcode);
                    const serials = (data.serials || data.serial_nos || data.serial_no_data || []).map(normalizeSerial).filter(d => d.item_code && d.serial_no);
                    const paymentMethods = (data.payment_methods || []).filter(d => d && d.mode_of_payment);
                    const itemGroups = (data.item_groups || []).map(normalizeItemGroup).filter(d => d.name);
                    const liveSettings = ctrl && ctrl.settings ? clone(ctrl.settings) : {};
                    const posProfile = Object.assign(
                        {},
                        data.pos_profile_doc || {},
                        data.pos_profile_data || {},
                        data.settings || {},
                        liveSettings,
                        {
                            name: args.pos_profile || data.pos_profile_name || data.pos_profile || liveSettings.pos_profile || "POS Profile",
                            pos_profile: args.pos_profile || data.pos_profile_name || data.pos_profile || liveSettings.pos_profile || "",
                            selling_price_list: args.price_list || data.price_list || liveSettings.selling_price_list || "",
                            warehouse: args.warehouse || data.warehouse || liveSettings.warehouse || "",
                        }
                    );
                    const posSettings = Object.assign({}, data.pos_settings || {}, { key: "pos_settings" });
                    const openingEntries = []
                        .concat(data.pos_opening_entry ? [data.pos_opening_entry] : [])
                        .concat(data.pos_opening_entries || [])
                        .map(normalizeOpeningEntry)
                        .filter(d => d.name);
                    const doctypeMetaRows = Object.keys(data.doctype_meta || {}).map(name => ({
                        name,
                        meta: data.doctype_meta[name]
                    }));

                    await bulkPut(STORES.items, items);
                    await bulkPut(STORES.item_prices, prices);
                    await bulkPut(STORES.customers, customers);
                    await bulkPut(STORES.stock, stock);
                    await bulkPut(STORES.batches, batches);
                    await bulkPut(STORES.item_barcodes, itemBarcodes);
                    await bulkPut(STORES.serials, serials);
                    await bulkPut(STORES.payment_methods, paymentMethods);
                    await bulkPut(STORES.item_groups, itemGroups);
                    await bulkPut(STORES.pos_profile, [posProfile]);
                    await bulkPut(STORES.pos_settings, [posSettings]);
                    await bulkPut(STORES.pos_opening_entry, openingEntries);
                    await bulkPut(STORES.doctype_meta, doctypeMetaRows);

                    await bulkPut(STORES.settings, [
                        { key: "last_master_sync", value: data.server_time || frappe.datetime.now_datetime() },
                        { key: "pos_profile", value: posProfile.pos_profile || posProfile.name || args.pos_profile || "" },
                        { key: "price_list", value: posProfile.selling_price_list || args.price_list || data.price_list || "" },
                        { key: "warehouse", value: posProfile.warehouse || args.warehouse || data.warehouse || "" },
                        { key: "full_settings", value: posProfile },
                    ]);

                    lastPreloadKey = preloadKey;
                    preloadLoaded = true;

                    if (!window.__wmn_pos_offline_success_alert_shown || force) {
                        window.__wmn_pos_offline_success_alert_shown = true;
                        frappe.show_alert({
                            message: __(`تم تحميل بيانات نقطة البيع للأوفلاين: ${items.length} صنف، ${customers.length} عميل`),
                            indicator: "green",
                        });
                    }
                    return true;
                } catch (e) {
                    console.warn("WMN POS offline preload failed", e);

                    // لا تظهر رسالة الخطأ إذا كان التحميل نجح سابقاً أو إذا كان الخطأ مؤقتاً أثناء تهيئة الصفحة.
                    if (!preloadLoaded && !window.__wmn_pos_offline_success_alert_shown) {
                        frappe.show_alert({
                            message: __("تعذر تحميل بيانات الأوفلاين. تأكد من وجود API: wmn.api.get_pos_offline_data"),
                            indicator: "orange",
                        });
                    }
                    return false;
                } finally {
                    preloadRunning = false;
                }
            }

            async function getFullSettings() {
                const saved = await getSetting("full_settings") || {};
                const live = (window.cur_pos && window.cur_pos.settings) || {};
                const doc = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc) || {};
                return Object.assign({}, saved, live, {
                    company: doc.company || live.company || saved.company || frappe.defaults.get_default("company") || "",
                    currency: doc.currency || live.currency || live.company_currency || saved.currency || saved.company_currency || frappe.defaults.get_default("currency") || "YER",
                    selling_price_list: doc.selling_price_list || live.selling_price_list || saved.selling_price_list || await getSetting("price_list") || "",
                    warehouse: doc.set_warehouse || live.warehouse || saved.warehouse || await getSetting("warehouse") || "",
                    pos_profile: doc.pos_profile || live.pos_profile || saved.pos_profile || saved.name || await getSetting("pos_profile") || "",
                    customer: doc.customer || live.customer || saved.customer || "Guest",
                });
            }

            async function getPOSProfile() {
                const settings = await getFullSettings();
                const rows = await getAll(STORES.pos_profile);
                return rows.find(p => p.name === settings.pos_profile || p.pos_profile === settings.pos_profile) || rows[0] || settings;
            }

            function extractProfileItemGroups(profile) {
                profile = profile || {};
                const rows = []
                    .concat(profile.item_groups || [])
                    .concat(profile.item_group_table || [])
                    .concat(profile.allowed_item_groups || []);

                const groups = rows.map(r =>
                    typeof r === "string" ? r : (r.item_group || r.name || r.parent_item_group || "")
                ).filter(Boolean);

                if (profile.item_group) groups.push(profile.item_group);
                return Array.from(new Set(groups));
            }

            async function expandItemGroups(groups) {
                groups = Array.from(new Set((groups || []).filter(Boolean)));
                if (!groups.length) return [];

                const all = await getAll(STORES.item_groups);
                const allowed = new Set(groups);
                let changed = true;

                while (changed) {
                    changed = false;
                    for (const g of all) {
                        if (g.parent_item_group && allowed.has(g.parent_item_group) && !allowed.has(g.name)) {
                            allowed.add(g.name);
                            changed = true;
                        }
                    }
                }

                return Array.from(allowed);
            }

            function profileRequiresAvailableStock(profile) {
                profile = profile || {};
                return !!(
                    profile.hide_unavailable_items ||
                    profile.hide_out_of_stock_items ||
                    profile.only_show_available_items ||
                    profile.show_items_in_stock_only
                );
            }

            function getPriceForItem(prices, itemCode, priceList, uom) {
                return (prices || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList) &&
                    (!uom || !p.uom || p.uom === uom)
                ) || (prices || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList)
                ) || null;
            }

            function getStockForItem(stockRows, itemCode, warehouse) {
                return (stockRows || []).find(s => s.item_code === itemCode && (!warehouse || s.warehouse === warehouse)) ||
                    (stockRows || []).find(s => s.item_code === itemCode) ||
                    null;
            }

            async function getPOSItemFilterContext({ price_list = "", item_group = "" } = {}) {
                const settings = await getFullSettings();
                const profile = await getPOSProfile();
                const priceList = price_list || settings.selling_price_list || profile.selling_price_list || await getSetting("price_list") || "";
                const warehouse = settings.warehouse || profile.warehouse || await getSetting("warehouse") || "";
                const allowedProfileGroups = await expandItemGroups(extractProfileItemGroups(profile));
                const selectedGroups = item_group && item_group !== "All Item Groups"
                    ? await expandItemGroups([item_group])
                    : [];
                return { settings, profile, priceList, warehouse, allowedProfileGroups, selectedGroups };
            }

            function itemPassesPOSProfileFilters(row, ctx, price, stockRow) {
                if (!row || !row.item_code) return false;
                if (cint(row.disabled || 0)) return false;
                if (row.is_sales_item !== undefined && cint(row.is_sales_item || 0) === 0) return false;

                if (ctx.allowedProfileGroups.length && !ctx.allowedProfileGroups.includes(row.item_group)) {
                    return false;
                }

                if (ctx.selectedGroups.length && !ctx.selectedGroups.includes(row.item_group)) {
                    return false;
                }

                if (ctx.priceList) {
                    const hasRateOnItem = flt(row.price_list_rate || row.rate || 0) > 0;
                    if (!price && !hasRateOnItem) return false;
                }

                if (profileRequiresAvailableStock(ctx.profile)) {
                    const isStockItem = row.is_stock_item === undefined ? true : cint(row.is_stock_item || 0) === 1;
                    if (isStockItem && flt(stockRow && stockRow.actual_qty || row.actual_qty || 0) <= 0) {
                        return false;
                    }
                }

                return true;
            }


            function batchMatchesKeyword(batch, keyword) {
                if (!keyword) return false;
                const q = String(keyword || "").toLowerCase().trim();
                return String(batch.batch_no || "").toLowerCase().includes(q) ||
                    String(batch.barcode || "").toLowerCase().includes(q);
            }

            function chooseBatchForItem(batches, itemCode, warehouse = "") {
                const rows = (batches || []).filter(b => {
                    if (String(b.item_code || "") !== String(itemCode || "")) return false;
                    if (cint(b.disabled || 0)) return false;
                    if (warehouse && b.warehouse && String(b.warehouse) !== String(warehouse)) return false;
                    if (flt(b.actual_qty || 0) <= 0) return false;
                    return true;
                });

                rows.sort((a, b) => {
                    const ea = a.expiry_date || "9999-12-31";
                    const eb = b.expiry_date || "9999-12-31";
                    return String(ea).localeCompare(String(eb));
                });

                return rows[0] || null;
            }

            async function findBatchOffline(searchValue, itemCode = "", warehouse = "") {
                if (!window.wmnPOSOffline || !STORES.batches) return null;

                const batches = await getAll(STORES.batches);
                const q = String(searchValue || "").toLowerCase().trim();

                if (q) {
                    const exact = batches.find(b =>
                        String(b.batch_no || "").toLowerCase() === q ||
                        String(b.barcode || "").toLowerCase() === q
                    );
                    if (exact) return exact;
                }

                if (itemCode) {
                    return chooseBatchForItem(batches, itemCode, warehouse);
                }

                return null;
            }


            function barcodeMatchesKeyword(barcodeRow, keyword) {
                if (!keyword) return false;
                const q = String(keyword || "").toLowerCase().trim();
                return String(barcodeRow.barcode || "").toLowerCase().includes(q);
            }

            function serialMatchesKeyword(serialRow, keyword) {
                if (!keyword) return false;
                const q = String(keyword || "").toLowerCase().trim();
                return String(serialRow.serial_no || "").toLowerCase().includes(q) ||
                    String(serialRow.barcode || "").toLowerCase().includes(q);
            }

            function chooseSerialForItem(serials, itemCode, warehouse = "") {
                const rows = (serials || []).filter(s => {
                    if (String(s.item_code || "") !== String(itemCode || "")) return false;
                    if (cint(s.disabled || 0)) return false;
                    if (warehouse && s.warehouse && String(s.warehouse) !== String(warehouse)) return false;
                    const status = String(s.status || "").toLowerCase();
                    if (status && !["active", "available", "in stock", "delivered"].includes(status)) return false;
                    return true;
                });

                rows.sort((a, b) => String(a.serial_no || "").localeCompare(String(b.serial_no || "")));
                return rows[0] || null;
            }

            async function findSerialOffline(searchValue, itemCode = "", warehouse = "") {
                if (!window.wmnPOSOffline || !STORES.serials) return null;

                const serials = await getAll(STORES.serials);
                const q = String(searchValue || "").toLowerCase().trim();

                if (q) {
                    const exact = serials.find(s =>
                        String(s.serial_no || "").toLowerCase() === q ||
                        String(s.barcode || "").toLowerCase() === q
                    );
                    if (exact) return exact;
                }

                if (itemCode) {
                    return chooseSerialForItem(serials, itemCode, warehouse);
                }

                return null;
            }

            async function findItemCodeByAnyBarcode(searchValue) {
                const q = String(searchValue || "").toLowerCase().trim();
                if (!q || !window.wmnPOSOffline) return null;

                const itemBarcodes = await getAll(STORES.item_barcodes);
                const found = itemBarcodes.find(b => String(b.barcode || "").toLowerCase() === q);
                return found || null;
            }


            function getAvailableBatchesForItem(batches, itemCode, warehouse = "") {
                return (batches || [])
                    .filter(b => {
                        if (String(b.item_code || "") !== String(itemCode || "")) return false;
                        if (cint(b.disabled || 0)) return false;
                        if (warehouse && b.warehouse && String(b.warehouse) !== String(warehouse)) return false;
                        if (flt(b.actual_qty || 0) <= 0) return false;
                        return true;
                    })
                    .sort((a, b) => {
                        const ea = a.expiry_date || "9999-12-31";
                        const eb = b.expiry_date || "9999-12-31";
                        return String(ea).localeCompare(String(eb));
                    });
            }

            async function showBatchSelectionDialog(item, warehouse = "") {
                return new Promise(async (resolve) => {
                    const batches = await getAll(STORES.batches);
                    const rows = getAvailableBatchesForItem(batches, item.item_code, warehouse);

                    if (!rows.length) {
                        resolve(null);
                        return;
                    }

                    const dialog = new frappe.ui.Dialog({
                        title: __("Select Batch No and Quantity"),
                        size: "large",
                        fields: [
                            {
                                fieldtype: "HTML",
                                fieldname: "batch_html",
                                options: `
                                    <div class="wmn-batch-select-dialog">
                                        <div style="margin-bottom:10px;color:#6b7280;">
                                            ${frappe.utils.escape_html(item.item_name || item.item_code || "")}
                                        </div>
                                        <div style="max-height:55vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                            <table class="table table-bordered table-hover" style="margin:0;">
                                                <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                    <tr>
                                                        <th>${__("Batch No")}</th>
                                                        <th>${__("Warehouse")}</th>
                                                        <th>${__("Available Qty")}</th>
                                                        <th>${__("Expiry Date")}</th>
                                                        <th style="width:130px;">${__("Qty")}</th>
                                                        <th style="width:110px;">${__("Action")}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${rows.map((b, idx) => {
                                                        const availableQty = flt(b.actual_qty || 0);
                                                        const defaultQty = Math.min(flt(item.qty || 1), availableQty || 1) || 1;
                                                        return `
                                                            <tr>
                                                                <td style="font-weight:700;">${frappe.utils.escape_html(b.batch_no || "")}</td>
                                                                <td>${frappe.utils.escape_html(b.warehouse || "")}</td>
                                                                <td>${availableQty}</td>
                                                                <td>${frappe.utils.escape_html(b.expiry_date || "")}</td>
                                                                <td>
                                                                    <input type="number"
                                                                        class="form-control input-xs wmn-batch-qty"
                                                                        data-idx="${idx}"
                                                                        min="0.001"
                                                                        step="0.001"
                                                                        max="${availableQty}"
                                                                        value="${defaultQty}">
                                                                </td>
                                                                <td>
                                                                    <button type="button"
                                                                        class="btn btn-xs btn-primary wmn-select-batch"
                                                                        data-idx="${idx}">
                                                                        ${__("Select")}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        `;
                                                    }).join("")}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                `
                            }
                        ],
                        secondary_action_label: __("Cancel"),
                        secondary_action: () => {
                            dialog.hide();
                            resolve(null);
                        }
                    });

                    dialog.show();

                    dialog.$wrapper.on("click", ".wmn-select-batch", function () {
                        const idx = cint($(this).attr("data-idx"));
                        const selected = rows[idx] || null;

                        if (!selected) {
                            dialog.hide();
                            resolve(null);
                            return;
                        }

                        const qtyInput = dialog.$wrapper.find(`.wmn-batch-qty[data-idx="${idx}"]`).val();
                        const qty = flt(qtyInput || 0);
                        const availableQty = flt(selected.actual_qty || 0);

                        if (qty <= 0) {
                            frappe.show_alert({
                                message: __("Quantity must be greater than zero"),
                                indicator: "orange"
                            });
                            return;
                        }

                        if (availableQty > 0 && qty > availableQty) {
                            frappe.show_alert({
                                message: __("Quantity cannot exceed available batch quantity"),
                                indicator: "orange"
                            });
                            return;
                        }

                        selected.__selected_qty = qty;
                        dialog.hide();
                        resolve(selected);
                    });
                });
            }

            async function searchItems({ search_term = "", price_list = "", start = 0, page_length = 40, item_group = "" } = {}) {
                const keyword = String(search_term || "").toLowerCase().trim();
                const ctx = await getPOSItemFilterContext({ price_list, item_group });

                let items = await getAll(STORES.items);
                const prices = await getAll(STORES.item_prices);
                const stockRows = await getAll(STORES.stock);
                const batches = await getAll(STORES.batches);
                const itemBarcodes = await getAll(STORES.item_barcodes);
                const serials = await getAll(STORES.serials);
                const matchingBatchByItem = {};
                const matchingBarcodeByItem = {};
                const matchingSerialByItem = {};

                if (keyword) {
                    batches.forEach(batch => {
                        if (batchMatchesKeyword(batch, keyword)) {
                            matchingBatchByItem[batch.item_code] = batch;
                        }
                    });

                    itemBarcodes.forEach(barcodeRow => {
                        if (barcodeMatchesKeyword(barcodeRow, keyword)) {
                            matchingBarcodeByItem[barcodeRow.item_code] = barcodeRow;
                        }
                    });

                    serials.forEach(serialRow => {
                        if (serialMatchesKeyword(serialRow, keyword)) {
                            matchingSerialByItem[serialRow.item_code] = serialRow;
                        }
                    });

                    items = items.filter(row => {
                        return String(row.item_code || "").toLowerCase().includes(keyword) ||
                            String(row.item_name || "").toLowerCase().includes(keyword) ||
                            String(row.barcode || "").toLowerCase().includes(keyword) ||
                            !!matchingBatchByItem[row.item_code] ||
                            !!matchingBarcodeByItem[row.item_code] ||
                            !!matchingSerialByItem[row.item_code];
                    });
                }

                const filtered = [];
                for (const row of items) {
                    const price = getPriceForItem(prices, row.item_code, ctx.priceList, row.uom || row.stock_uom);
                    const stockRow = getStockForItem(stockRows, row.item_code, ctx.warehouse);

                    if (!itemPassesPOSProfileFilters(row, ctx, price, stockRow)) continue;

                    const selectedBatch = matchingBatchByItem[row.item_code] || null;
                    const selectedSerial = matchingSerialByItem[row.item_code] || null;
                    const selectedBarcode = matchingBarcodeByItem[row.item_code];

                    filtered.push(Object.assign({}, row, {
                        price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                        rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                        actual_qty: selectedSerial ? 1 : (selectedBatch ? flt(selectedBatch.actual_qty || 0) : flt(stockRow && stockRow.actual_qty || row.actual_qty || 0)),
                        warehouse: ctx.warehouse || row.warehouse || (selectedSerial && selectedSerial.warehouse) || (selectedBatch && selectedBatch.warehouse) || (stockRow && stockRow.warehouse) || "",
                        batch_no: selectedSerial && selectedSerial.batch_no ? selectedSerial.batch_no : (selectedBatch ? selectedBatch.batch_no : (row.batch_no || "")),
                        serial_no: selectedSerial ? selectedSerial.serial_no : (row.serial_no || ""),
                        barcode: selectedBarcode ? selectedBarcode.barcode : (row.barcode || ""),
                        uom: selectedBarcode && selectedBarcode.uom ? selectedBarcode.uom : (row.uom || row.stock_uom),
                    }));
                }

                return filtered.slice(start, start + page_length);
            }

            async function findItem(itemCode, price_list = "") {
                if (!itemCode) return null;

                let row = await get(STORES.items, itemCode);
                let foundBatch = null;

                let foundSerial = null;
                let foundBarcode = null;

                if (!row) {
                    foundBarcode = await findItemCodeByAnyBarcode(itemCode);
                    if (foundBarcode && foundBarcode.item_code) {
                        row = await get(STORES.items, foundBarcode.item_code);
                    }
                }

                if (!row) {
                    foundSerial = await findSerialOffline(itemCode);
                    if (foundSerial && foundSerial.item_code) {
                        row = await get(STORES.items, foundSerial.item_code);
                    }
                }

                if (!row) {
                    foundBatch = await findBatchOffline(itemCode);
                    if (foundBatch && foundBatch.item_code) {
                        row = await get(STORES.items, foundBatch.item_code);
                        if (row) row.__wmn_batch_from_scan = 1;
                    }
                }

                if (!row) {
                    const rows = await getAll(STORES.items);
                    const q = String(itemCode || "").toLowerCase().trim();
                    row = rows.find(i =>
                        String(i.item_code || "").toLowerCase() === q ||
                        String(i.name || "").toLowerCase() === q ||
                        String(i.barcode || "").toLowerCase() === q
                    ) || null;
                }
                if (!row) return null;

                const ctx = await getPOSItemFilterContext({ price_list });
                const prices = await getAll(STORES.item_prices);
                const stockRows = await getAll(STORES.stock);
                const batches = await getAll(STORES.batches);
                const serials = await getAll(STORES.serials);
                const price = getPriceForItem(prices, row.item_code, ctx.priceList, (foundBarcode && foundBarcode.uom) || row.uom || row.stock_uom);
                const stockRow = getStockForItem(stockRows, row.item_code, ctx.warehouse);
                // لا تختار Batch تلقائياً هنا، حتى يظهر Dialog الاختيار عند الضغط على الصنف.
                // foundBatch يبقى فقط إذا كان البحث نفسه Batch No / Batch Barcode.
                foundBatch = foundBatch || null;

                // Serial يمكن اختياره إذا كان البحث Serial No، أما غير ذلك يفتح منطق التحقق لاحقاً.
                foundSerial = foundSerial || null;

                if (!itemPassesPOSProfileFilters(row, ctx, price, stockRow)) return null;

                return Object.assign({}, row, {
                    price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                    rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                    uom: row.uom || row.stock_uom || (price ? price.uom : "") || "",
                    actual_qty: foundSerial ? 1 : (foundBatch ? flt(foundBatch.actual_qty || 0) : flt(stockRow && stockRow.actual_qty || row.actual_qty || 0)),
                    warehouse: ctx.warehouse || row.warehouse || (foundSerial && foundSerial.warehouse) || (foundBatch && foundBatch.warehouse) || (stockRow && stockRow.warehouse) || "",
                    batch_no: foundSerial && foundSerial.batch_no ? foundSerial.batch_no : (foundBatch ? foundBatch.batch_no : ""),
                    serial_no: foundSerial ? foundSerial.serial_no : (row.serial_no || ""),
                    barcode: foundBarcode ? foundBarcode.barcode : (row.barcode || ""),
                    uom: foundBarcode && foundBarcode.uom ? foundBarcode.uom : (row.uom || row.stock_uom),
                    __wmn_batch_from_scan: foundBatch ? 1 : 0,
                });
            }

            async function getStock(itemCode, warehouse) {
                if (!itemCode || !warehouse) return null;
                return get(STORES.stock, `${itemCode}::${warehouse}`);
            }

            async function saveInvoice(invoice, ctrl) {
                const doc = clone(invoice);
                await wmn_clean_doc_batch_serial_for_save(doc);
                const offlineId = doc.custom_offline_id || `POS-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                doc.custom_offline_id = offlineId;
                doc.__islocal = 1;
                doc.docstatus = 0;

                const row = {
                    offline_id: offlineId,
                    status: "pending",
                    created_at: new Date().toISOString(),
                    doctype: doc.doctype,
                    pos_profile: doc.pos_profile || (ctrl && ctrl.settings ? ctrl.settings.pos_profile : ""),
                    invoice: doc,
                    last_error: "",
                };

                await bulkPut(STORES.invoice_queue, [row]);
                return row;
            }

            async function getPendingInvoices() {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORES.invoice_queue, "readonly");
                    const req = tx.objectStore(STORES.invoice_queue).index("status").getAll("pending");
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }

            async function updateQueueRow(row) {
                await bulkPut(STORES.invoice_queue, [row]);
            }

            async function syncInvoices() {
                if (!online()) return;
                const pending = await getPendingInvoices();
                if (!pending.length) return;

                for (const row of pending) {
                    try {
                        await wmn_clean_doc_batch_serial_for_save(row.invoice);
                        const r = await frappe.call({
                            method: "wmn.api.sync_offline_pos_invoice",
                            args: { invoice: row.invoice },
                            freeze: false,
                        });
                        const result = r.message || {};
                        row.status = "synced";
                        row.synced_at = new Date().toISOString();
                        row.erpnext_name = result.name || result.erpnext_name || "";
                        row.last_error = "";
                        await updateQueueRow(row);
                        frappe.show_alert({
                            message: __("تمت مزامنة فاتورة أوفلاين: {0}", [row.erpnext_name || row.offline_id]),
                            indicator: "green",
                        });
                    } catch (e) {
                        row.status = "pending";
                        row.last_error = e.message || String(e);
                        row.last_try_at = new Date().toISOString();
                        await updateQueueRow(row);
                        console.error("WMN POS offline invoice sync failed", row.offline_id, e);
                    }
                }
            }

            // clean: automatic online sync removed. Use Offline Invoices dialog.
            // v6: تم تعطيل المزامنة التلقائية الدورية. استخدم Dialog Offline Invoices.

            return {
                STORES,
                online,
                openDB,
                bulkPut,
                getAll,
                get,
                setSetting,
                getSetting,
                preload,
                searchItems,
                findItem,
                getFullSettings,
                getPOSProfile,
                getPOSItemFilterContext,
                getStock,
                saveInvoice,
                getPendingInvoices,
                syncInvoices,
                getDBName: () => DB_NAME,
                getSiteKey: getSiteKey,
                deleteLegacyDB: () => new Promise((resolve, reject) => {
                    const req = indexedDB.deleteDatabase(LEGACY_DB_NAME);
                    req.onsuccess = () => resolve(true);
                    req.onerror = () => reject(req.error);
                    req.onblocked = () => resolve(false);
                }),
            };
        })();

        window.wmnPOSOffline = WMN_POS_OFFLINE;

        

        async function wmn_get_offline_settings() {
            const saved = window.wmnPOSOffline && window.wmnPOSOffline.getSetting
                ? await window.wmnPOSOffline.getSetting("full_settings")
                : {};
            const live = (window.cur_pos && window.cur_pos.settings) || {};
            const doc = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc) || {};
            return Object.assign({}, saved || {}, live || {}, {
                company: doc.company || live.company || (saved && saved.company) || frappe.defaults.get_default("company") || "",
                currency: doc.currency || live.currency || live.company_currency || (saved && (saved.currency || saved.company_currency)) || frappe.defaults.get_default("currency") || "YER",
                selling_price_list: doc.selling_price_list || live.selling_price_list || (saved && saved.selling_price_list) || "",
                warehouse: doc.set_warehouse || live.warehouse || (saved && saved.warehouse) || "",
                pos_profile: doc.pos_profile || live.pos_profile || (saved && (saved.pos_profile || saved.name)) || "",
                customer: doc.customer || live.customer || (saved && saved.customer) || "Guest",
            });
        }

        function wmn_current_doc_is_offline_pos() {
            const pos = window.cur_pos;
            const doc = pos && pos.frm && pos.frm.doc ? pos.frm.doc : null;

            return !!(
                doc &&
                (doc.__offline_pos || doc.offline_pos || String(doc.name || "").startsWith("OFFLINE-"))
            );
        }

        function wmn_is_pos_offline() {
            const in_pos_page = location.pathname.includes("point-of-sale") || location.hash.includes("point-of-sale");

            return !!(
                in_pos_page &&
                window.wmnPOSOffline &&
                (
                    navigator.onLine === false ||
                    window.__wmn_force_pos_offline === true ||
                    window.__wmn_pos_effective_offline === true ||
                    wmn_current_doc_is_offline_pos()
                )
            );
        }

        async function wmn_find_customer_offline(name) {
            if (!name || !window.wmnPOSOffline) return null;
            try {
                const exact = await window.wmnPOSOffline.get(window.wmnPOSOffline.STORES.customers, name);
                if (exact) return exact;
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.customers);
                const q = String(name || "").toLowerCase().trim();
                return (rows || []).find(c =>
                    String(c.name || "").toLowerCase() === q ||
                    String(c.customer_name || "").toLowerCase() === q
                ) || null;
            } catch (e) {
                return null;
            }
        }

        async function wmn_find_price_offline(item_code, price_list, uom) {
            try {
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_prices);
                return (rows || []).find(p =>
                    p.item_code === item_code &&
                    (!price_list || p.price_list === price_list) &&
                    (!uom || !p.uom || p.uom === uom)
                ) || (rows || []).find(p =>
                    p.item_code === item_code &&
                    (!price_list || p.price_list === price_list)
                ) || null;
            } catch (e) {
                return null;
            }
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
                const key = [itemCode, uom, warehouse, rate].join("||");

                if (map.has(key)) {
                const existing = map.get(key);
                existing.qty = flt(existing.qty || 0) + flt(row.qty || 1);
                existing.stock_qty = flt(existing.qty || 0) * flt(existing.conversion_factor || 1);
                } else {
                const copy = Object.assign({}, row);
                copy.qty = flt(copy.qty || 1);
                copy.conversion_factor = flt(copy.conversion_factor || 1);
                copy.stock_qty = flt(copy.stock_qty || copy.qty * copy.conversion_factor);
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


        function wmn_recalculate_offline_doc(doc) {
            if (typeof mergeDuplicateOfflineItems === "function") {
                mergeDuplicateOfflineItems(doc);
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
            doc.total_qty = total_qty;
            doc.total = total;
            doc.net_total = total;
            doc.base_total = total;
            doc.base_net_total = total;
            doc.grand_total = total;
            doc.rounded_total = total;
            doc.base_grand_total = total;
            doc.base_rounded_total = total;
            doc.outstanding_amount = total;
            let paid = 0;
            (doc.payments || []).forEach(p => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
                paid += p.amount;
            });
            doc.paid_amount = paid;
            doc.base_paid_amount = paid;
            doc.change_amount = Math.max(0, paid - total);
            doc.base_change_amount = doc.change_amount;
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
                ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods)
                : [];

            const today = frappe.datetime.get_today();

            const asSalesInvoice = cint(settings.as_sales_invoice || 0) === 1;
            const invoiceDoctype = asSalesInvoice ? "Sales Invoice" : "POS Invoice";
            const childDoctypes = wmn_get_invoice_child_doctypes(invoiceDoctype);
            const offlineName = (asSalesInvoice ? "OFFLINE-SINV-" : "OFFLINE-PINV-") + Date.now();

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
                taxes: [],
            };

            doc.__wmn_item_doctype = childDoctypes.itemDoctype;

            return wmn_recalculate_offline_doc(wmn_normalize_current_offline_invoice_child_doctypes(doc));
        }

        function wmn_make_offline_frm(doc) {
            return {
                doctype: doc.doctype,
                docname: doc.name,
                doc,
                fields_dict: {},
                script_manager: { trigger: () => Promise.resolve(), has_handlers: () => false },
                dashboard: { clear_headline: () => {} },
                page: { set_title: () => {}, clear_indicator: () => {}, set_indicator: () => {} },
                dirty: () => {},
                is_dirty: () => true,
                refresh: () => Promise.resolve(),
                refresh_field: () => {},
                refresh_fields: () => {},
                trigger: () => Promise.resolve(),
                call: () => Promise.resolve({ message: doc }),
                save: () => Promise.resolve({ message: doc }),
                reload_doc: () => Promise.resolve(),
                set_df_property: () => {},
                toggle_display: () => {},
                set_query: () => {},
                add_custom_button: () => {},
                clear_custom_buttons: () => {},
                set_intro: () => {},
                add_child(fieldname, values) {
                    this.doc[fieldname] = this.doc[fieldname] || [];
                    const row = Object.assign({
                        name: "OFFLINE-ROW-" + Date.now() + "-" + this.doc[fieldname].length,
                        parent: this.doc.name,
                        parenttype: this.doc.doctype,
                        parentfield: fieldname,
                        idx: this.doc[fieldname].length + 1,
                    }, values || {});
                    this.doc[fieldname].push(row);
                    wmn_recalculate_offline_doc(this.doc);
                    return row;
                },
                set_value(fieldname, value) {
                    if (typeof fieldname === "object") Object.assign(this.doc, fieldname);
                    else this.doc[fieldname] = value;
                    wmn_recalculate_offline_doc(this.doc);
                    return Promise.resolve();
                },
            };
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

            if (!found && window.wmnPOSOffline && window.wmnPOSOffline.getAll) {
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items);
                const q = String(rawCode || raw.item_code || "").toLowerCase().trim();
                found = (rows || []).find(i =>
                    String(i.item_code || "").toLowerCase() === q ||
                    String(i.name || "").toLowerCase() === q ||
                    String(i.barcode || "").toLowerCase() === q ||
                    String(i.item_name || "").toLowerCase() === q
                ) || null;
            }

            const itemCode = (found && found.item_code) || raw.item_code || raw.value || raw.name || rawCode;
            if (!itemCode) return;

            const uom = (found && (found.uom || found.stock_uom)) || raw.uom || "Nos";
            const warehouse = doc.set_warehouse || settings.warehouse || (found && found.warehouse) || "";

            let price = null;
            if (found && typeof wmn_find_price_offline === "function") {
                price = await wmn_find_price_offline(found.item_code, priceList, uom);
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

        function wmn_v9_is_offline() {
            if (typeof wmn_is_pos_offline === "function") return wmn_is_pos_offline();
            return (
                (location.pathname.includes("point-of-sale") || location.hash.includes("point-of-sale")) &&
                window.wmnPOSOffline &&
                (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
            );
        }


function wmn_recalc_offline_payment_doc(doc) {
            if (!doc) return doc;
            if (window.wmnPOSOffline && window.wmnPOSOffline.recalculateOfflineDoc) {
                window.wmnPOSOffline.recalculateOfflineDoc(doc);
            } else if (typeof wmn_recalculate_offline_doc === "function") {
                wmn_recalculate_offline_doc(doc);
            } else if (typeof recalculateOfflineDoc === "function") {
                recalculateOfflineDoc(doc);
            }
            return doc;
        }

        async function wmn_ensure_offline_payment_rows(doc) {
            doc.payments = doc.payments || [];

            if (!doc.payments.length && window.wmnPOSOffline && window.wmnPOSOffline.getAll) {
                const methods = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods);
                doc.payments = (methods || []).map((p, idx) => ({
                    doctype: "Sales Invoice Payment",
                    name: "OFFLINE-PAY-" + Date.now() + "-" + idx,
                    parenttype: (doc.doctype || "Sales Invoice"),
                    parentfield: "payments",
                    parent: doc.name,
                    mode_of_payment: p.mode_of_payment,
                    account: p.account || "",
                    type: p.type || "",
                    default: p.default,
                    amount: 0,
                    base_amount: 0,
                }));
            }

            return doc.payments;
        }

        async function wmn_show_offline_payment_dialog(ctrl) {
            const frm = ctrl && ctrl.frm;
            const doc = frm && frm.doc;

            if (!doc) frappe.throw(wmn_t("No open invoice", "لا توجد فاتورة مفتوحة"));
            if (!doc.items || !doc.items.length) frappe.throw(wmn_t("Add at least one item before payment", "أضف صنفاً واحداً على الأقل قبل الدفع"));

            wmn_recalc_offline_payment_doc(doc);

            const total = flt(doc.rounded_total || doc.grand_total || 0);
            if (total <= 0) frappe.throw(wmn_t("Invoice total is zero", "إجمالي الفاتورة صفر"));

            const payments = await wmn_ensure_offline_payment_rows(doc);
            const defaultPayment = payments.find(p => cint(p.default || 0) === 1) || payments[0];

            payments.forEach((p) => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
            });

            const paidBefore = payments.reduce((s, p) => s + flt(p.amount || 0), 0);
            if (defaultPayment && paidBefore <= 0) {
                defaultPayment.amount = total;
                defaultPayment.base_amount = total;
            }

            const rowsHtml = payments.map((p, idx) => {
                const mode = frappe.utils.escape_html(p.mode_of_payment || "");
                const amount = flt(p.amount || 0);
                return `
                    <div class="wmn-offline-payment-row" data-payment-index="${idx}"
                         style="display:grid;grid-template-columns:1fr 160px;gap:10px;align-items:center;margin-bottom:10px;">
                        <div>
                            <div style="font-weight:600;">${mode}</div>
                            <div style="font-size:12px;color:#6b7280;">${frappe.utils.escape_html(p.account || "")}</div>
                        </div>
                        <input type="number" step="0.01" min="0"
                               class="form-control wmn-offline-payment-amount"
                               data-payment-index="${idx}"
                               value="${amount}">
                    </div>
                `;
            }).join("");

            return new Promise((resolve, reject) => {
                const d = new frappe.ui.Dialog({
                    title: wmn_t("Payment", "الدفع"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "payment_html",
                            options: `
                                <div class="wmn-offline-payment-dialog" style="direction:inherit;">
                                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Grand Total", "الإجمالي")}</div>
                                            <div style="font-weight:700;font-size:18px;">${format_currency(total, doc.currency || "YER")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Customer", "العميل")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.customer_name || doc.customer || "")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Invoice", "الفاتورة")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.name || "")}</div>
                                        </div>
                                    </div>

                                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
                                        ${rowsHtml || `<div class="text-muted">${wmn_t("No payment methods found", "لا توجد طرق دفع")}</div>`}
                                    </div>

                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                                        <div style="font-size:13px;color:#6b7280;">
                                            ${wmn_t("Complete Order will apply payment to the offline invoice then save it offline.", "إكمال الطلب سيضيف الدفع للفاتورة الأوفلاين ثم يحفظها أوفلاين.")}
                                        </div>
                                        <div style="font-weight:700;">
                                            ${wmn_t("Paid", "المدفوع")}: <span class="wmn-offline-paid-total">0</span>
                                        </div>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    primary_action_label: wmn_t("Complete Order", "إكمال الطلب"),
                    primary_action: async () => {
                        try {
                            let paid = 0;

                            d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                                const $input = $(this);
                                const idx = cint($input.attr("data-payment-index"));
                                const amount = flt($input.val() || 0);
                                const row = payments[idx];

                                if (!row) return;

                                row.amount = amount;
                                row.base_amount = amount;
                                row.parent = doc.name;
                                paid += amount;
                            });

                            if (paid <= 0) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Required", "الدفع مطلوب"),
                                    indicator: "orange",
                                    message: wmn_t("Enter payment amount first", "أدخل مبلغ الدفع أولاً")
                                });
                                return;
                            }

                            doc.payments = payments.filter(p => flt(p.amount || 0) > 0 || p.mode_of_payment);
                            wmn_recalc_offline_payment_doc(doc);

                            if (flt(doc.paid_amount || 0) < flt(doc.rounded_total || doc.grand_total || 0)) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Amount", "مبلغ الدفع"),
                                    indicator: "orange",
                                    message: wmn_t("Payment amount is less than invoice total", "مبلغ الدفع أقل من إجمالي الفاتورة")
                                });
                                return;
                            }

                            d.hide();
                            resolve(doc);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    secondary_action_label: wmn_t("Cancel", "إلغاء"),
                    secondary_action: () => {
                        d.hide();
                        reject(new Error("cancelled"));
                    }
                });

                d.show();

                const updatePaidTotal = () => {
                    let paid = 0;
                    d.$wrapper.find(".wmn-offline-payment-amount").each(function () {
                        paid += flt($(this).val() || 0);
                    });
                    d.$wrapper.find(".wmn-offline-paid-total").text(format_currency(paid, doc.currency || "YER"));
                };

                d.$wrapper.on("input", ".wmn-offline-payment-amount", updatePaidTotal);
                updatePaidTotal();
            });
        }





function installWMNOfflineInvoiceManagerDialogV5(pos) {
            if (!window.wmnPOSOffline || window.wmnPOSOffline.__wmn_invoice_manager_dialog_v5) return;

            async function deleteInvoiceQueueRow(row) {
                if (!row) return;

                const db = await window.wmnPOSOffline.openDB();
                const tx = db.transaction(window.wmnPOSOffline.STORES.invoice_queue, "readwrite");
                const store = tx.objectStore(window.wmnPOSOffline.STORES.invoice_queue);

                const key = row.offline_id || row.id || row.name;
                if (key) {
                    store.delete(key);
                }

                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error);
                });
            }

            function getInvoiceDoc(row) {
                return row && (row.doc || row.invoice || row.data || row);
            }

            function rowStatus(row) {
                const status = String(row.status || "").toLowerCase();
                if (row.erpnext_name || row.server_name || row.synced || row.synced_at || status === "synced" || status === "submitted" || status === "success") {
                    return "synced";
                }
                if (status === "error" || status === "failed") return "error";
                return status || "pending";
            }

            function statusBadge(status) {
                const map = {
                    synced: ["green", wmn_t("Synced", "تمت المزامنة")],
                    pending: ["orange", wmn_t("Pending", "قيد الانتظار")],
                    error: ["red", wmn_t("Error", "خطأ")],
                    failed: ["red", wmn_t("Failed", "فشل")],
                    syncing: ["blue", wmn_t("Syncing", "جاري المزامنة")]
                };
                const x = map[status] || ["gray", status];
                return `<span class="indicator-pill ${x[0]}">${frappe.utils.escape_html(x[1])}</span>`;
            }

            function money(value, currency) {
                try {
                    return format_currency(flt(value || 0), currency || "YER");
                } catch (e) {
                    return String(flt(value || 0));
                }
            }

            async function syncOne(row) {
                if (!row) return;

                if (window.wmnPOSOffline.syncInvoice && typeof window.wmnPOSOffline.syncInvoice === "function") {
                    return await (window.wmnPOSOffline.syncInvoice ? window.wmnPOSOffline.syncInvoice(row) : window.wmnPOSOffline.syncInvoices());
                }

                // fallback: use bulk sync; it will pick all pending rows.
                if (window.wmnPOSOffline.syncInvoices && typeof window.wmnPOSOffline.syncInvoices === "function") {
                    return await (window.wmnPOSOffline.manualSyncInvoices
                        ? window.wmnPOSOffline.manualSyncInvoices()
                        : window.wmnPOSOffline.syncInvoices());
                }

                throw new Error("syncInvoices غير متاحة");
            }

            async function syncAll() {
                if (!window.wmnPOSOffline.syncInvoices || typeof window.wmnPOSOffline.syncInvoices !== "function") {
                    throw new Error("syncInvoices غير متاحة");
                }

                return await (window.wmnPOSOffline.manualSyncInvoices
                    ? window.wmnPOSOffline.manualSyncInvoices()
                    : window.wmnPOSOffline.syncInvoices());
            }

            async function renderRows(dialog) {
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.invoice_queue);
                rows.sort((a, b) => String(b.created_at || b.modified || b.offline_id || "").localeCompare(String(a.created_at || a.modified || a.offline_id || "")));

                const html = rows.length ? rows.map((row, idx) => {
                    const doc = getInvoiceDoc(row) || {};
                    const id = row.offline_id || row.id || row.name || doc.name || ("ROW-" + idx);
                    const customer = doc.customer_name || doc.customer || row.customer || "";
                    const total = doc.rounded_total || doc.grand_total || row.grand_total || row.total || 0;
                    const currency = doc.currency || row.currency || "YER";
                    const created = row.created_at || row.creation || doc.posting_date || "";
                    const status = rowStatus(row);
                    const erpName = row.erpnext_name || row.server_name || "";

                    return `
                        <tr data-offline-id="${frappe.utils.escape_html(id)}">
                            <td style="min-width:160px;">
                                <div style="font-weight:700;">${frappe.utils.escape_html(id)}</div>
                                ${erpName ? `<div style="font-size:12px;color:#16a34a;">ERP: ${frappe.utils.escape_html(erpName)}</div>` : ""}
                            </td>
                            <td>${frappe.utils.escape_html(customer)}</td>
                            <td style="white-space:nowrap;">${frappe.utils.escape_html(money(total, currency))}</td>
                            <td style="white-space:nowrap;">${statusBadge(status)}</td>
                            <td style="white-space:nowrap;font-size:12px;color:#6b7280;">${frappe.utils.escape_html(created)}</td>
                            <td style="white-space:nowrap;text-align:left;">
                                <button class="btn btn-xs btn-primary wmn-sync-one" data-idx="${idx}">
                                    ${wmn_t("Sync", "مزامنة")}
                                </button>
                                <button class="btn btn-xs btn-danger wmn-delete-one" data-idx="${idx}">
                                    ${wmn_t("Delete", "مسح")}
                                </button>
                            </td>
                        </tr>
                    `;
                }).join("") : `
                    <tr>
                        <td colspan="6" style="text-align:center;color:#6b7280;padding:24px;">
                            ${wmn_t("No offline invoices saved", "لا توجد فواتير أوفلاين محفوظة")}
                        </td>
                    </tr>
                `;

                dialog.__wmn_rows = rows;

                dialog.$wrapper.find(".wmn-offline-invoices-count").text(rows.length);
                dialog.$wrapper.find(".wmn-offline-invoices-body").html(html);
            }

            async function openManagerDialog() {
                const d = new frappe.ui.Dialog({
                    title: wmn_t("Offline Invoices", "فواتير الأوفلاين"),
                    size: "extra-large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "offline_invoices_html",
                            options: `
                                <div class="wmn-offline-invoices-dialog" style="direction:inherit;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                                        <div>
                                            <div style="font-weight:700;font-size:16px;">${wmn_t("Invoices saved in IndexedDB", "الفواتير المحفوظة في IndexedDB")}</div>
                                            <div style="color:#6b7280;font-size:13px;">
                                                ${wmn_t("Count", "العدد")}: <span class="wmn-offline-invoices-count">0</span>
                                            </div>
                                        </div>
                                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                            <button class="btn btn-sm btn-default wmn-refresh-list">${wmn_t("Refresh", "تحديث")}</button>
                                            <button class="btn btn-sm btn-primary wmn-sync-all">${wmn_t("Sync All", "مزامنة الكل")}</button>
                                            <button class="btn btn-sm btn-danger wmn-delete-all">${wmn_t("Delete All", "مسح الكل")}</button>
                                        </div>
                                    </div>

                                    <div style="max-height:65vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${wmn_t("Offline ID", "رقم الأوفلاين")}</th>
                                                    <th>${wmn_t("Customer", "العميل")}</th>
                                                    <th>${wmn_t("Total", "الإجمالي")}</th>
                                                    <th>${wmn_t("Status", "الحالة")}</th>
                                                    <th>${wmn_t("Created", "تاريخ الإنشاء")}</th>
                                                    <th style="text-align:left;">${wmn_t("Actions", "الإجراءات")}</th>
                                                </tr>
                                            </thead>
                                            <tbody class="wmn-offline-invoices-body"></tbody>
                                        </table>
                                    </div>
                                </div>
                            `
                        }
                    ]
                });

                d.show();
                await renderRows(d);

                d.$wrapper.on("click", ".wmn-refresh-list", async () => {
                    await renderRows(d);
                });

                d.$wrapper.on("click", ".wmn-sync-all", async () => {
                    try {
                        frappe.dom.freeze(wmn_t("Syncing offline invoices...", "جاري مزامنة فواتير الأوفلاين..."));
                        await syncAll();
                        frappe.dom.unfreeze();
                        frappe.show_alert({ message: wmn_t("Available invoices synced", "تمت مزامنة الفواتير المتاحة"), indicator: "green" });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        frappe.dom.unfreeze();
                        console.error("WMN sync all offline invoices failed", e);
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "فشلت المزامنة"),
                            indicator: "red",
                            message: __("تعذرت مزامنة الكل: {0}", [e.message || e])
                        });
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-all", async () => {
                    const rows = d.__wmn_rows || [];
                    if (!rows.length) return;

                    frappe.confirm(
                        wmn_t("Delete all offline invoices from IndexedDB?", "هل تريد مسح كل الفواتير الأوفلاين من IndexedDB؟"),
                        async () => {
                            try {
                                frappe.dom.freeze(wmn_t("Deleting...", "جاري المسح..."));
                                for (const row of rows) {
                                    await deleteInvoiceQueueRow(row);
                                }
                                frappe.dom.unfreeze();
                                frappe.show_alert({ message: wmn_t("All offline invoices deleted", "تم مسح كل الفواتير الأوفلاين"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.dom.unfreeze();
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "فشل المسح"),
                                    indicator: "red",
                                    message: wmn_msg("Delete failed: {0}", "تعذر المسح: {0}", [e.message || e])
                                });
                            }
                        }
                    );
                });

                d.$wrapper.on("click", ".wmn-sync-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    try {
                        frappe.dom.freeze(__("Syncing invoice..."));
                        await syncOne(row);
                        frappe.dom.unfreeze();
                        frappe.show_alert({ message: wmn_t("Invoice sync attempted", "تمت محاولة مزامنة الفاتورة"), indicator: "green" });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        frappe.dom.unfreeze();
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "فشلت المزامنة"),
                            indicator: "red",
                            message: wmn_msg("Failed to sync invoice: {0}", "تعذرت مزامنة الفاتورة: {0}", [e.message || e])
                        });
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    frappe.confirm(
                        wmn_t("Delete this invoice from IndexedDB?", "هل تريد مسح هذه الفاتورة من IndexedDB؟"),
                        async () => {
                            try {
                                await deleteInvoiceQueueRow(row);
                                frappe.show_alert({ message: wmn_t("Invoice deleted", "تم مسح الفاتورة"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "فشل المسح"),
                                    indicator: "red",
                                    message: wmn_msg("Failed to delete invoice: {0}", "تعذر مسح الفاتورة: {0}", [e.message || e])
                                });
                            }
                        }
                    );
                });
            }

            function addManagerButton(pos) {
                if (!pos || pos.__wmn_invoice_manager_button_v5) return;

                const add = () => {
                    let $target = null;

                    if (pos.page && pos.page.add_inner_button) {
                        try {
                            pos.page.add_inner_button(wmn_t("Offline Invoices", "فواتير الأوفلاين"), () => openManagerDialog(), __("Offline"));
                            pos.__wmn_invoice_manager_button_v5 = true;
                            return true;
                        } catch (e) {}
                    }

                    if (pos.$components_wrapper && pos.$components_wrapper.length) {
                        $target = pos.$components_wrapper.closest(".page-container").find(".page-actions .standard-actions").first();
                    }

                    if (!$target || !$target.length) {
                        $target = $(".page-actions .standard-actions, .page-actions, .custom-actions, .layout-main-section").first();
                    }

                    if (!$target || !$target.length) return false;
                    if ($target.find(".wmn-offline-invoices-btn").length) return true;

                    const $btn = $(`
                        <button class="btn btn-sm btn-default wmn-offline-invoices-btn" style="margin-inline-start:6px;">
                            ${wmn_t("Offline Invoices", "فواتير الأوفلاين")}
                        </button>
                    `);

                    $btn.on("click", () => openManagerDialog());
                    $target.append($btn);
                    pos.__wmn_invoice_manager_button_v5 = true;
                    return true;
                };

                if (!add()) {
                    const t = setInterval(() => {
                        if (add()) clearInterval(t);
                    }, 500);
                    setTimeout(() => clearInterval(t), 10000);
                }
            }

            window.wmnPOSOffline.openInvoiceManagerDialog = openManagerDialog;
            window.wmnPOSOffline.deleteInvoiceQueueRow = deleteInvoiceQueueRow;

            addManagerButton(pos || window.cur_pos);

            const t = setInterval(() => {
                addManagerButton(window.cur_pos);
            }, 1000);
            setTimeout(() => clearInterval(t), 15000);

            window.wmnPOSOffline.__wmn_invoice_manager_dialog_v5 = true;
            console.log("✅ WMN offline invoice manager dialog v5 installed");
        }





function wmn_user_lang() {
            return String(
                (frappe.boot && frappe.boot.lang) ||
                (frappe.boot && frappe.boot.user && frappe.boot.user.language) ||
                (frappe.session && frappe.session.user_language) ||
                document.documentElement.lang ||
                document.body.getAttribute("lang") ||
                "en"
            ).toLowerCase();
        }

        function wmn_is_arabic() {
            const lang = wmn_user_lang();
            return lang.startsWith("ar") || document.documentElement.dir === "rtl" || document.body.dir === "rtl";
        }

        function wmn_t(en, ar) {
            const text = wmn_is_arabic() ? (ar || en) : en;
            return __(text);
        }

        function wmn_msg(en, ar, values) {
            const text = wmn_t(en, ar);
            if (values && Array.isArray(values)) {
                return __(text, values);
            }
            return text;
        }









        window.getAvailableBatchesForItem = function(batches, itemCode, warehouse = "") {
            return (batches || [])
                .filter(b => {
                    if (String(b.item_code || "") !== String(itemCode || "")) return false;
                    if (cint(b.disabled || 0)) return false;
                    if (warehouse && b.warehouse && String(b.warehouse) !== String(warehouse)) return false;
                    if (flt(b.actual_qty || 0) <= 0) return false;
                    return true;
                })
                .sort((a, b) => {
                    const ea = a.expiry_date || "9999-12-31";
                    const eb = b.expiry_date || "9999-12-31";
                    return String(ea).localeCompare(String(eb));
                });
        };

        window.showBatchSelectionDialog = async function(item, warehouse = "") {
            const batches = window.wmnPOSOffline
                ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.batches)
                : [];

            const rows = window.getAvailableBatchesForItem(batches, item.item_code, warehouse);

            if (!rows.length) {
                return null;
            }

            return await new Promise((resolve) => {
                const dialog = new frappe.ui.Dialog({
                    title: __("Select Batch No and Quantity"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "batch_html",
                            options: `
                                <div class="wmn-batch-select-dialog">
                                    <div style="margin-bottom:10px;color:#6b7280;">
                                        ${frappe.utils.escape_html(item.item_name || item.item_code || "")}
                                    </div>
                                    <div style="max-height:55vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${__("Batch No")}</th>
                                                    <th>${__("Warehouse")}</th>
                                                    <th>${__("Available Qty")}</th>
                                                    <th>${__("Expiry Date")}</th>
                                                    <th style="width:130px;">${__("Qty")}</th>
                                                    <th style="width:110px;">${__("Action")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${rows.map((b, idx) => {
                                                    const availableQty = flt(b.actual_qty || 0);
                                                    const defaultQty = Math.min(flt(item.qty || 1), availableQty || 1) || 1;

                                                    return `
                                                        <tr>
                                                            <td style="font-weight:700;">${frappe.utils.escape_html(b.batch_no || "")}</td>
                                                            <td>${frappe.utils.escape_html(b.warehouse || "")}</td>
                                                            <td>${availableQty}</td>
                                                            <td>${frappe.utils.escape_html(b.expiry_date || "")}</td>
                                                            <td>
                                                                <input type="number"
                                                                    class="form-control input-xs wmn-batch-qty"
                                                                    data-idx="${idx}"
                                                                    min="0.001"
                                                                    step="0.001"
                                                                    max="${availableQty}"
                                                                    value="${defaultQty}">
                                                            </td>
                                                            <td>
                                                                <button type="button"
                                                                    class="btn btn-xs btn-primary wmn-select-batch"
                                                                    data-idx="${idx}">
                                                                    ${__("Select")}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    `;
                                                }).join("")}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    secondary_action_label: __("Cancel"),
                    secondary_action: () => {
                        dialog.hide();
                        resolve(null);
                    }
                });

                dialog.show();

                dialog.$wrapper.on("click", ".wmn-select-batch", function () {
                    const idx = cint($(this).attr("data-idx"));
                    const selected = rows[idx] || null;

                    if (!selected) {
                        dialog.hide();
                        resolve(null);
                        return;
                    }

                    const qtyInput = dialog.$wrapper.find(`.wmn-batch-qty[data-idx="${idx}"]`).val();
                    const qty = flt(qtyInput || 0);
                    const availableQty = flt(selected.actual_qty || 0);

                    if (qty <= 0) {
                        frappe.show_alert({
                            message: __("Quantity must be greater than zero"),
                            indicator: "orange"
                        });
                        return;
                    }

                    if (availableQty > 0 && qty > availableQty) {
                        frappe.show_alert({
                            message: __("Quantity cannot exceed available batch quantity"),
                            indicator: "orange"
                        });
                        return;
                    }

                    selected.__selected_qty = qty;
                    dialog.hide();
                    resolve(selected);
                });
            });
        };



        function wmn_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return amount + " " + (currency || "");
        }

        function wmn_escape_html(value) {
            return frappe.utils.escape_html(value == null ? "" : String(value));
        }

        function wmn_build_offline_receipt_html(doc) {
            doc = doc || {};
            const currency = doc.currency || "";
            const company = doc.company || "";
            const customer = doc.customer_name || doc.customer || "";
            const invoiceNo = doc.name || doc.offline_id || "";
            const date = doc.posting_date || frappe.datetime.get_today();
            const time = doc.posting_time || "";
            const posProfile = doc.pos_profile || "";
            const cashier = (frappe.session && frappe.session.user_fullname) || (frappe.session && frappe.session.user) || "";

            const items = (doc.items || []).map((row, idx) => {
                const name = row.item_name || row.item_code || "";
                const qty = flt(row.qty || 0);
                const uom = row.uom || row.stock_uom || "";
                const rate = flt(row.rate || row.price_list_rate || 0);
                const amount = flt(row.amount || (qty * rate));
                const batch = row.batch_no ? `<div class="muted">${__("Batch No")}: ${wmn_escape_html(row.batch_no)}</div>` : "";
                const serial = row.serial_no ? `<div class="muted">${__("Serial No")}: ${wmn_escape_html(row.serial_no)}</div>` : "";

                return `
                    <tr>
                        <td class="num">${idx + 1}</td>
                        <td>
                            <div class="item-name">${wmn_escape_html(name)}</div>
                            ${batch}
                            ${serial}
                        </td>
                        <td class="center">${qty} ${wmn_escape_html(uom)}</td>
                        <td class="money">${wmn_money(rate, currency)}</td>
                        <td class="money">${wmn_money(amount, currency)}</td>
                    </tr>
                `;
            }).join("");

            const payments = (doc.payments || [])
                .filter(p => flt(p.amount || 0) > 0)
                .map(p => `
                    <tr>
                        <td>${wmn_escape_html(p.mode_of_payment || "")}</td>
                        <td class="money">${wmn_money(p.amount || 0, currency)}</td>
                    </tr>
                `).join("");

            const taxes = (doc.taxes || [])
                .filter(t => flt(t.tax_amount || t.base_tax_amount || 0) !== 0)
                .map(t => `
                    <tr>
                        <td>${wmn_escape_html(t.description || t.account_head || "")}</td>
                        <td class="money">${wmn_money(t.tax_amount || t.base_tax_amount || 0, currency)}</td>
                    </tr>
                `).join("");

            return `<!doctype html>
<html dir="${document.documentElement.dir || "auto"}">
<head>
<meta charset="utf-8">
<title>${wmn_escape_html(invoiceNo)}</title>
<style>
    @page { size: auto; margin: 10mm; }
    body {
        font-family: Arial, Tahoma, sans-serif;
        color: #111827;
        margin: 0;
        padding: 0;
        font-size: 13px;
        direction: ${document.documentElement.dir === "rtl" ? "rtl" : "ltr"};
    }
    .receipt {
        max-width: 760px;
        margin: 0 auto;
        padding: 16px;
    }
    .header {
        text-align: center;
        border-bottom: 2px solid #111827;
        padding-bottom: 10px;
        margin-bottom: 12px;
    }
    .company { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .title { font-size: 15px; font-weight: 700; color: #374151; }
    .meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 16px;
        margin: 12px 0;
        background: #f3f4f6;
        border-radius: 10px;
        padding: 10px;
    }
    .meta div { display: flex; justify-content: space-between; gap: 8px; }
    .label { color: #6b7280; font-weight: 700; }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
    th {
        background: #111827;
        color: #fff;
        padding: 8px;
        border: 1px solid #111827;
        text-align: start;
    }
    td {
        padding: 8px;
        border: 1px solid #d1d5db;
        vertical-align: top;
    }
    .num { width: 36px; text-align: center; }
    .center { text-align: center; white-space: nowrap; }
    .money { text-align: end; white-space: nowrap; }
    .item-name { font-weight: 700; }
    .muted { color: #6b7280; font-size: 11px; margin-top: 2px; }
    .totals {
        margin-top: 12px;
        margin-inline-start: auto;
        width: 320px;
    }
    .totals td { font-weight: 700; }
    .grand td {
        font-size: 16px;
        background: #f3f4f6;
    }
    .footer {
        text-align: center;
        color: #6b7280;
        margin-top: 18px;
        border-top: 1px dashed #9ca3af;
        padding-top: 10px;
        font-size: 12px;
    }
    @media print {
        .no-print { display: none !important; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
</style>
</head>
<body>
<div class="receipt">
    <div class="header">
        <div class="company">${wmn_escape_html(company)}</div>
        <div class="title">${__("Offline POS Receipt")}</div>
    </div>

    <div class="meta">
        <div><span class="label">${__("Invoice")}</span><span>${wmn_escape_html(invoiceNo)}</span></div>
        <div><span class="label">${__("Date")}</span><span>${wmn_escape_html(date)} ${wmn_escape_html(time)}</span></div>
        <div><span class="label">${__("Customer")}</span><span>${wmn_escape_html(customer)}</span></div>
        <div><span class="label">${__("Cashier")}</span><span>${wmn_escape_html(cashier)}</span></div>
        <div><span class="label">${__("POS Profile")}</span><span>${wmn_escape_html(posProfile)}</span></div>
        <div><span class="label">${__("Status")}</span><span>${__("Saved Offline")}</span></div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="num">#</th>
                <th>${__("Item")}</th>
                <th class="center">${__("Qty")}</th>
                <th class="money">${__("Rate")}</th>
                <th class="money">${__("Amount")}</th>
            </tr>
        </thead>
        <tbody>
            ${items || `<tr><td colspan="5" class="center">${__("No items")}</td></tr>`}
        </tbody>
    </table>

    ${taxes ? `
    <table class="totals">
        <tbody>
            ${taxes}
        </tbody>
    </table>` : ""}

    <table class="totals">
        <tbody>
            <tr>
                <td>${__("Net Total")}</td>
                <td class="money">${wmn_money(doc.net_total || doc.total || 0, currency)}</td>
            </tr>
            <tr class="grand">
                <td>${__("Grand Total")}</td>
                <td class="money">${wmn_money(doc.grand_total || doc.rounded_total || 0, currency)}</td>
            </tr>
            <tr>
                <td>${__("Paid Amount")}</td>
                <td class="money">${wmn_money(doc.paid_amount || 0, currency)}</td>
            </tr>
        </tbody>
    </table>

    ${payments ? `
    <table>
        <thead>
            <tr>
                <th>${__("Mode of Payment")}</th>
                <th class="money">${__("Amount")}</th>
            </tr>
        </thead>
        <tbody>${payments}</tbody>
    </table>` : ""}

    <div class="footer">
        ${__("This receipt was generated offline and will be synced when connection is available.")}
    </div>
</div>
<script>
    window.onload = function() {
        setTimeout(function() {
            window.focus();
            window.print();
        }, 250);
    };
</script>
</body>
</html>`;
        }

        function wmn_print_offline_receipt(doc) {
            doc = doc || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc);
            if (!doc) {
                frappe.show_alert({
                    message: __("No offline invoice available to print"),
                    indicator: "orange"
                });
                return;
            }

            const html = wmn_build_offline_receipt_html(doc);
            const win = window.open("", "_blank", "width=900,height=700");

            if (!win) {
                frappe.msgprint({
                    title: __("Popup Blocked"),
                    indicator: "orange",
                    message: __("Please allow popups to print the offline receipt.")
                });
                return;
            }

            win.document.open();
            win.document.write(html);
            win.document.close();
        }

        window.wmn_print_offline_receipt = wmn_print_offline_receipt;
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
                wmn_key(row.serial_no)
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

            row.item_data = Object.assign({}, row.item_data || {}, {
                name: row.item_code,
                item_code: row.item_code,
                item_name: row.item_name,
                description: row.description,
                image: row.image || "",
                stock_uom: row.stock_uom,
                uom: row.uom,
                has_batch_no: row.has_batch_no || 0,
                has_serial_no: row.has_serial_no || 0
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

            return doc;
        }
        if (!window.__wmn_keep_offline_doc_after_online_v50) {
            window.addEventListener("online", function () {
                if (wmn_current_doc_is_offline_pos()) {
                    window.__wmn_pos_effective_offline = true;
                    console.log("WMN POS: connection restored, current offline invoice will remain offline until New Order/Complete Order");
                }
            });

            window.addEventListener("offline", function () {
                window.__wmn_pos_effective_offline = true;
            });

            window.__wmn_keep_offline_doc_after_online_v50 = true;
        }








class MyPOSController extends erpnext.PointOfSale.Controller {
            constructor(wrapper) {
                super(wrapper);
                this.wmn_start_offline_preload();
            }

            wmn_start_offline_preload() {
                const try_preload = () => {
                    if (window.wmnPOSOffline && this.settings && this.settings.pos_profile) {
                        window.wmnPOSOffline.preload(this, false);
                        return true;
                    }
                    return false;
                };

                if (try_preload()) return;
                let attempts = 0;
                const timer = setInterval(() => {
                    attempts += 1;
                    if (try_preload() || attempts > 30) {
                        clearInterval(timer);
                    }
                }, 1000);
            }

            async make_new_invoice() {
                const force_online_new_order =
                    this.__wmn_new_order_online === true &&
                    navigator.onLine === true &&
                    window.__wmn_force_pos_offline !== true;

                if (force_online_new_order) {
                    window.__wmn_pos_effective_offline = false;
                    this.__wmn_new_order_online = false;
                }

                if (!force_online_new_order && wmn_is_pos_offline()) {
                    await this.make_sales_invoice_frm();

                    if (this.item_selector && this.item_selector.load_items_data) {
                        await this.item_selector.load_items_data();
                    }

                    if (this.cart && this.cart.load_invoice) {
                        this.cart.load_invoice();
                    }

                    return this.frm;
                }

                const result = await super.make_new_invoice();

                window.__wmn_pos_effective_offline = false;
                this.__wmn_new_order_online = false;

                if (window.wmnPOSOffline) {
                    window.wmnPOSOffline.preload(this, false);
                }

                return result;
            }
            
            

            

            async check_stock_availability(item, qty, warehouse) {
                const target_warehouse = warehouse || (this.settings ? this.settings.warehouse : null);
                if (!target_warehouse) return true;

                if (!navigator.onLine && window.wmnPOSOffline) {
                    const stock_row = await window.wmnPOSOffline.getStock(item.item_code, target_warehouse);
                    return flt(stock_row ? stock_row.actual_qty : 0) >= flt(qty || 0);
                }

                return frappe.call({
                    method: "erpnext.accounts.doctype.pos_invoice.pos_invoice.get_stock_availability",
                    args: {
                        item_code: item.item_code,
                        warehouse: target_warehouse
                    }
                }).then(r => (r.message || 0) >= qty);
            }

            async on_cart_update(args) {
                if (wmn_is_pos_offline && wmn_is_pos_offline()) {
                    return this.wmn_offline_on_cart_update(args);
                }
                return super.on_cart_update(args);
            }

            wmn_get_child_doctype() {
                if (this.frm && this.frm.doc && this.frm.doc.doctype === "Sales Invoice") {
                    return "Sales Invoice Item";
                }
                return "POS Invoice Item";
            }

            wmn_recalculate_offline_totals() {
                const doc = this.frm.doc;
                const items = doc.items || [];
                let total_qty = 0;
                let net_total = 0;

                items.forEach((row, index) => {
                    row.idx = index + 1;
                    row.conversion_factor = flt(row.conversion_factor || 1);
                    row.stock_qty = flt(row.qty || 0) * row.conversion_factor;
                    row.rate = flt(row.rate || row.price_list_rate || 0);
                    row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
                    row.discount_percentage = flt(row.discount_percentage || 0);
                    row.discount_amount = flt(row.discount_amount || 0);
                    row.amount = flt(row.qty || 0) * flt(row.rate || 0);
                    row.net_rate = row.rate;
                    row.net_amount = row.amount;
                    row.base_rate = row.rate;
                    row.base_amount = row.amount;
                    row.base_net_rate = row.net_rate;
                    row.base_net_amount = row.net_amount;
                    total_qty += flt(row.qty || 0);
                    net_total += flt(row.net_amount || row.amount || 0);
                });

                doc.total_qty = total_qty;
                doc.total = net_total;
                doc.net_total = net_total;
                doc.base_total = net_total;
                doc.base_net_total = net_total;
                doc.grand_total = net_total;
                doc.rounded_total = Math.round(net_total);
                doc.base_grand_total = net_total;
                doc.base_rounded_total = Math.round(net_total);
                doc.outstanding_amount = doc.rounded_total || doc.grand_total || 0;

                if (doc.payments && doc.payments.length) {
                    let paid = 0;
                    doc.payments.forEach((p) => paid += flt(p.amount || p.base_amount || 0));
                    doc.paid_amount = paid;
                    doc.base_paid_amount = paid;
                    doc.outstanding_amount = flt(doc.grand_total || 0) - paid;
                }
            }

            async wmn_offline_get_full_item(item) {
                const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                const settings = this.settings || {};
                const price_list = doc.selling_price_list || settings.selling_price_list || "";
                const item_code = item && item.item_code;
                if (!item_code) return item || {};

                const offlineItem = await window.wmnPOSOffline.findItem(item_code, price_list);
                return Object.assign({}, offlineItem || {}, item || {});
            }

            async wmn_offline_on_cart_update(args) {
                let item_row;
                let did_freeze = false;
                try {
                    let { field, value, item } = args || {};
                    item = await this.wmn_offline_get_full_item(item || {});

                    if (!this.frm || !this.frm.doc) return null;
                    if (!this.frm.doc.customer) return this.raise_customer_selection_alert();
                    if (!item.item_code) return null;

                    const target_warehouse = this.frm.doc.set_warehouse || this.settings.warehouse || item.warehouse || "";

                    if (cint(item.has_batch_no || 0) && !cint(item.__wmn_batch_from_scan || 0)) {
                        const selectedBatch = await window.showBatchSelectionDialog(item, target_warehouse);

                        if (selectedBatch && selectedBatch.batch_no) {
                            item.batch_no = selectedBatch.batch_no;
                            item.warehouse = selectedBatch.warehouse || target_warehouse || item.warehouse || "";
                            item.actual_qty = flt(selectedBatch.actual_qty || item.actual_qty || 0);
                            item.qty = flt(selectedBatch.__selected_qty || item.qty || 1);
                            item.__wmn_selected_batch_qty = item.qty;
                        } else {
                            frappe.show_alert({
                                message: __("Batch No is required for this item"),
                                indicator: "orange"
                            });
                            return null;
                        }
                    }

                    if (cint(item.has_batch_no || 0) && !item.batch_no) {
                        frappe.show_alert({
                            message: __("Batch No is required for this item"),
                            indicator: "orange"
                        });
                        return null;
                    }

                    // لا تعمل freeze قبل Dialog اختيار Batch حتى لا يصبح الديالوج غير قابل للتفاعل.
                    frappe.dom.freeze();
                    did_freeze = true;

                    if (cint(item.has_serial_no || 0) && !item.serial_no) {
                        const autoSerial = await findSerialOffline("", item.item_code, target_warehouse);
                        if (autoSerial && autoSerial.serial_no) {
                            item.serial_no = autoSerial.serial_no;
                            item.batch_no = item.batch_no || autoSerial.batch_no || "";
                            item.warehouse = item.warehouse || autoSerial.warehouse || target_warehouse;
                        }
                    }

                    if (cint(item.has_serial_no || 0) && !item.serial_no) {
                        frappe.show_alert({
                            message: __("No Serial No is saved or available for this item offline"),
                            indicator: "orange"
                        });
                        return null;
                    }
                    const effective_warehouse = item.warehouse || target_warehouse || this.frm.doc.set_warehouse || "";

                    const incoming_for_merge = {
                        item_code: item.item_code,
                        uom: item.uom || item.stock_uom || "Nos",
                        stock_uom: item.stock_uom || item.uom || "Nos",
                        warehouse: effective_warehouse,
                        batch_no: item.batch_no || "",
                        serial_no: item.serial_no || ""
                    };

                    wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);
                    item_row = wmn_find_mergeable_offline_item(this.frm.doc.items || [], incoming_for_merge, effective_warehouse);

                    const item_row_exists = item_row && !$.isEmptyObject(item_row);
                    const from_selector = field === "qty" && (value === "+1" || value === 1 || value === "1");

                    if (item_row_exists) {
                        if (from_selector) value = flt(item_row.qty || 0) + flt(item.qty || 1);
                        if (field === "qty") value = flt(value || 0);

                        if (["qty", "conversion_factor"].includes(field) && value > 0 && !this.allow_negative_stock) {
                            const conversion = field === "conversion_factor" ? flt(value || 1) : flt(item_row.conversion_factor || 1);
                            const qty_needed = field === "qty" ? flt(value || 0) * conversion : flt(item_row.qty || 0) * conversion;
                            const ok = await this.check_stock_availability(item_row, qty_needed, item_row.warehouse || effective_warehouse);
                            if (!ok) {
                                frappe.show_alert({ message: __("الكمية غير متوفرة في المخزون الأوفلاين"), indicator: "orange" });
                                return item_row;
                            }
                        }

                        item_row[field] = value;
                        if (field === "qty") {
                            item_row.stock_qty = flt(value || 0) * flt(item_row.conversion_factor || 1);
                            item_row.amount = flt(item_row.qty || 0) * flt(item_row.rate || item_row.price_list_rate || 0);
                            item_row.net_amount = item_row.amount;
                            item_row.base_amount = item_row.amount;
                            item_row.base_net_amount = item_row.amount;
                        }
                    } else {
                        let qty = from_selector ? 1 : flt(value || 1);
                        if (field === "serial_no") qty = String(value || "").split("\n").filter(Boolean).length || 0;

                        const ok = this.allow_negative_stock ? true : await this.check_stock_availability(item, qty, effective_warehouse);
                        if (!ok) {
                            frappe.show_alert({ message: __("الكمية غير متوفرة في المخزون الأوفلاين"), indicator: "orange" });
                            return null;
                        }

                        const child_doctype = this.wmn_get_child_doctype();
                        item_row = this.frm.add_child("items", {
                            doctype: child_doctype,
                            parenttype: this.frm.doc.doctype,
                            parent: this.frm.doc.name,
                            parentfield: "items",
                            item_code: item.item_code,
                            item_name: item.item_name || item.item_code,
                            description: item.description || item.item_name || item.item_code,
                            image: item.image || "",
                            item_group: item.item_group || "",
                            warehouse: effective_warehouse,
                            batch_no: item.batch_no,
                            serial_no: item.serial_no,
                            uom: item.uom || item.stock_uom || "Nos",
                            stock_uom: item.stock_uom || item.uom || "Nos",
                            conversion_factor: 1,
                            qty: qty,
                            stock_qty: qty,
                            price_list_rate: flt(item.price_list_rate || item.rate || 0),
                            rate: flt(item.rate || item.price_list_rate || 0),
                            amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                            net_rate: flt(item.rate || item.price_list_rate || 0),
                            net_amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                            has_serial_no: item.has_serial_no || 0,
                            has_batch_no: item.has_batch_no || 0,
                        });
                    }

                    item_row = wmn_normalize_offline_cart_row(item_row, this.frm.doc, (this.frm.doc.items || []).indexOf(item_row), effective_warehouse);
                    wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);

                    this.wmn_recalculate_offline_totals();
                    this.frm.dirty();

                    if (this.cart && this.cart.load_invoice) {
                        this.cart.load_invoice();
                    } else {
                        this.update_cart_html(item_row);
                    }

                    if (this.item_details && this.item_details.$component && this.item_details.$component.is(":visible")) {
                        this.edit_item_details_of(item_row);
                    }
                    frappe.utils.play_sound("submit");
                    return item_row;
                } catch (error) {
                    console.error("WMN offline cart update failed", error);
                    frappe.show_alert({ message: __("تعذر إضافة الصنف أوفلاين: {0}", [error.message || error]), indicator: "red" });
                    return null;
                } finally {
                    if (did_freeze) {
                        frappe.dom.unfreeze();
                    }
                }
            }

            async save_and_checkout() {
                if (wmn_is_pos_offline && wmn_is_pos_offline()) {
                    try {
                        this.wmn_recalculate_offline_totals();

                        await wmn_show_offline_payment_dialog(this);

                        frappe.dom.freeze(wmn_t("Saving offline invoice...", "جاري حفظ الفاتورة أوفلاين..."));
                        const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);
                        frappe.dom.unfreeze();

                        frappe.show_alert({
                            message: wmn_msg("Invoice added offline successfully: {0}", "تمت إضافة الفاتورة أوفلاين بنجاح: {0}", [row.offline_id || row.name || this.frm.doc.name]),
                            indicator: "orange"
                        });

                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(this.frm.doc, true);
                        this.wmn_bind_offline_receipt_buttons();

                        if (this.recent_order_list && this.recent_order_list.refresh_list) {
                            this.recent_order_list.refresh_list();
                        }

                        return row;
                    } catch (e) {
                        frappe.dom.unfreeze();

                        if ((e.message || e) === "cancelled") {
                            return;
                        }

                        console.error("Offline invoice payment/save failed", e);
                        frappe.msgprint({
                            title: wmn_t("Offline Save Failed", "فشل الحفظ أوفلاين"),
                            indicator: "red",
                            message: wmn_msg("Failed to save invoice offline: {0}", "تعذر حفظ الفاتورة أوفلاين: {0}", [e.message || e])
                        });
                        return;
                    }
                }

                return super.save_and_checkout();
            }

            make_sales_invoice_frm() {
                if (wmn_is_pos_offline()) {
                    return wmn_make_offline_invoice_doc(this).then((doc) => {
                        this.frm = wmn_make_offline_frm(doc);
                        window.cur_frm = this.frm;
                        window.cur_pos = this;
                        console.log("WMN POS Offline: using lightweight offline Sales Invoice doc", doc.name);
                        return this.frm;
                    });
                }

                //const doctype = this.save_as_sales_invoice ? "Sales Invoice" : "POS Invoice";
                const doctype = this.settings.as_sales_invoice === 1 ? "Sales Invoice" : "POS Invoice";
                console.log("as_sales_invoice value:", this.settings.as_sales_invoice);
                return new Promise((resolve) => {
                    frappe.model.with_doctype(doctype, () => {
                        this.frm = this.get_new_frm(this.frm, doctype);
                        this.frm.doc.items = [];
                        this.frm.doc.is_pos = 1;
                        this.frm.doc.update_stock = 1;
                        this.frm.doc.pos_profile = this.settings.pos_profile;
                        resolve();
                    });
                });
            }
            
            async make_return_invoice(doc) {
                frappe.dom.freeze();
                this.frm = this.get_new_frm(this.frm, doc.doctype);
                this.frm.doc.items = [];
    
                let method = "";
                let args = {};
    
                // Check if the original document is Sales Invoice or POS Invoice
                if (doc.doctype === "Sales Invoice") {
                    method = "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return";
                    args = {
                        source_name: doc.name,
                        target_doc: this.frm.doc,
                    };
                } else {
                    method = "erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return";
                    args = {
                        source_name: doc.name,
                        target_doc: this.frm.doc,
                    };
                }
    
                return frappe.call({
                    method: method,
                    args: args,
                    callback: (r) => {
                        if (r.message) {
                            frappe.model.sync(r.message);
                            frappe.get_doc(r.message.doctype, r.message.name).__run_link_triggers = false;
                            this.set_pos_profile_data().then(() => {
                                            frappe.dom.unfreeze();
                            });
                        } else {
                            frappe.dom.unfreeze();
                            frappe.msgprint(__("Could not create return invoice"));
                        }
                    },
                    error: (err) => {
                        frappe.dom.unfreeze();
                        console.error("Error making return invoice:", err);
                        frappe.msgprint(__("Error creating return: {0}", [err.message]));
                    }
                });
            }

            get_new_frm(_frm, doctype) {
                const target_doctype = doctype || "POS Invoice";
                const can_reuse =
                    _frm &&
                    (
                        _frm.doctype === target_doctype ||
                        (_frm.doc && _frm.doc.doctype === target_doctype)
                    );

                // ERPNext POS الأصلي يعيد استخدام نفس Form عند New Order.
                // في Sales Invoice كان v42 ينشئ Form جديد كل مرة، فيبقى refresh-fields
                // مربوطاً بالـ wrapper القديم ويسبب خطأ أول item بعد New Order.
                if (!can_reuse && _frm && _frm.wrapper) {
                    try {
                        $(_frm.wrapper).off("refresh-fields");
                    } catch (e) {}
                }

                const page = can_reuse ? $(_frm.wrapper || "<div>") : $("<div>");
                const frm = can_reuse ? _frm : new frappe.ui.form.Form(target_doctype, page, false);

                const name = frappe.model.make_new_doc_and_get_name(target_doctype, true);
                frm.refresh(name);

                frm.doc.items = [];
                frm.doc.is_pos = 1;
                frm.doc.update_stock = frm.doc.update_stock === undefined ? 1 : frm.doc.update_stock;
                frm.doc.pos_profile = this.settings && this.settings.pos_profile ? this.settings.pos_profile : frm.doc.pos_profile;

                window.cur_frm = frm;
                window.cur_pos = this;

                return frm;
            }

            init_payments() {
                super.init_payments();

                this.payment.events.submit_invoice = async () => {
                    if (!navigator.onLine && window.wmnPOSOffline) {
                        try {
                            await wmn_show_offline_payment_dialog(this);

                            frappe.dom.freeze(wmn_t("Saving offline invoice...", "جاري حفظ الفاتورة أوفلاين..."));
                            const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);
                            frappe.dom.unfreeze();

                            frappe.show_alert({
                                message: wmn_msg("Invoice added offline successfully: {0}", "تمت إضافة الفاتورة أوفلاين بنجاح: {0}", [row.offline_id || row.name || this.frm.doc.name]),
                                indicator: "orange"
                            });

                            this.toggle_components(false);
                            this.order_summary.toggle_component(true);
                            this.order_summary.load_summary_of(this.frm.doc, true);

                            if (this.recent_order_list && this.recent_order_list.refresh_list) {
                                this.recent_order_list.refresh_list();
                            }

                            return row;
                        } catch (e) {
                            frappe.dom.unfreeze();

                            if ((e.message || e) === "cancelled") {
                                return;
                            }

                            console.error("Offline invoice payment/save failed", e);
                            frappe.msgprint({
                                title: wmn_t("Offline Save Failed", "فشل الحفظ أوفلاين"),
                                indicator: "red",
                                message: wmn_msg("Failed to save invoice offline: {0}", "تعذر حفظ الفاتورة أوفلاين: {0}", [e.message || e])
                            });
                            return;
                        }
                    }

                    this.frm.savesubmit().then((r) => {
                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(r.doc, true);
                        this.recent_order_list.refresh_list();
                        
});
                };
            }
            

            wmn_bind_offline_receipt_buttons() {
                if (!wmn_is_pos_offline || !wmn_is_pos_offline()) return;

                const bind = () => {
                    const $wrapper = this.order_summary && this.order_summary.$component
                        ? this.order_summary.$component
                        : $(this.$components_wrapper || document);

                    const labels = [
                        "Print Receipt",
                        __("Print Receipt")
                    ];

                    $wrapper.find("button, .btn").each((idx, el) => {
                        const $btn = $(el);
                        const text = ($btn.text() || "").trim();

                        if (labels.includes(text) || text.toLowerCase() === "print receipt") {
                            if ($btn.attr("data-wmn-offline-print-bound")) return;

                            $btn.attr("data-wmn-offline-print-bound", "1");
                            $btn.off("click.wmnOfflinePrint");
                            $btn.on("click.wmnOfflinePrint", (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.wmn_print_offline_receipt(this.frm && this.frm.doc);
                                return false;
                            });
                        }
                    });
                };

                bind();
                setTimeout(bind, 300);
                setTimeout(bind, 1000);
            }


            init_recent_order_list() {
                const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                this.recent_order_list = new erpnext.PointOfSale.PastOrderList({
                    wrapper: this.$components_wrapper,
                    events: {
                        open_invoice_data: (name) => {
                            frappe.db.get_doc(doctype, name).then((doc) => {
                                this.order_summary.load_summary_of(doc);
                            });
                        },
                        reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
                    },
                });
            }
            init_order_summary() {
                const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                this.order_summary = new erpnext.PointOfSale.PastOrderSummary({
                    wrapper: this.$components_wrapper,
                    events: {
                        get_frm: () => this.frm,
        
                        process_return: (name) => {
                            this.recent_order_list.toggle_component(false);
                            frappe.db.get_doc(doctype, name).then((doc) => {
                                frappe.run_serially([
                                    () => this.make_return_invoice(doc),
                                    () => this.cart.load_invoice(),
                                    () => this.item_selector.toggle_component(true),
                                ]);
                            });
                        },
                        edit_order: (name) => {
                            this.recent_order_list.toggle_component(false);
                            frappe.run_serially([
                                () => this.frm.refresh(name),
                                () => this.frm.call("reset_mode_of_payments"),
                                () => this.cart.load_invoice(),
                                () => this.item_selector.toggle_component(true),
                            ]);
                        },
                        delete_order: (name) => {
                            frappe.model.delete_doc(this.frm.doc.doctype, name, () => {
                                this.recent_order_list.refresh_list();
                            });
                        },
                        new_order: () => {
                            frappe.run_serially([
                                () => frappe.dom.freeze(),
                                () => {
                                    this.__wmn_new_order_online =
                                        navigator.onLine === true &&
                                        window.__wmn_force_pos_offline !== true;
                                },
                                () => this.make_new_invoice(),
                                () => this.cart && this.cart.load_invoice ? this.cart.load_invoice() : null,
                                () => this.item_selector.toggle_component(true),
                                () => frappe.dom.unfreeze(),
                            ]);
                        },
                    },
                });
            }
        

            init_recent_order_list1111() {
                super.init_recent_order_list();
                this.recent_order_list.events.open_invoice_data = (name) => {
                    const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                    frappe.db.get_doc(doctype, name).then((doc) => {
                        this.order_summary.load_summary_of(doc);
                    });
                };
            }
        }

        const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;
        
        
        
        class MyPastOrderSummary extends OriginalPastOrderSummary {
            constructor(wrapper, args) {
                super(wrapper, args);
                this.after_submission = false;
            }
            
            
            

            toggle_summary_placeholder(show) {
                if (this.after_submission === true && show === true) {
                   
                    return;
                }
                super.toggle_summary_placeholder(show);
            }

            load_summary_of(doc, after_submission = false) {
                this.after_submission = after_submission;
                super.load_summary_of(doc, after_submission);
            }

            get_condition_btn_map() {
                if (this.after_submission === true) {
                    return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
                }
                return super.get_condition_btn_map();
            }
        }

        erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;

        const OriginalPastOrderList = erpnext.PointOfSale.PastOrderList;
        
        
        
        class MyPastOrderList extends OriginalPastOrderList {
            constructor(wrapper, args) {
                super(wrapper, args);
                this.after_submission = false;
            }
            
            
            async refresh_list() {
                frappe.dom.freeze();
                this.events.reset_summary();
                const search_term = this.search_field.get_value();
                const status = this.status_field.get_value();

                this.$invoices_container.html("");

                if (!navigator.onLine && window.wmnPOSOffline) {
                    const pending = await window.wmnPOSOffline.getPendingInvoices();
                    frappe.dom.unfreeze();
                    pending.forEach((row) => {
                        const doc = row.invoice || {};
                        const invoice = {
                            name: row.offline_id,
                            customer: doc.customer,
                            grand_total: doc.grand_total,
                            status: "Offline Pending",
                            posting_date: doc.posting_date || frappe.datetime.get_today(),
                            posting_time: doc.posting_time || "",
                            currency: doc.currency,
                        };
                        const invoice_html = this.get_invoice_html(invoice);
                        this.$invoices_container.append(invoice_html);
                    });
                    return;
                }

                const server_method = (cur_pos.settings.as_sales_invoice === 1) 
                    ? "wmn.api.get_past_order_list" 
                    : "erpnext.selling.page.point_of_sale.point_of_sale.get_past_order_list";

                return frappe.call({
                    method: server_method,
                    freeze: true,
                    args: { search_term, status },
                    callback: (response) => {
                        frappe.dom.unfreeze();
                        if (response.message) {
                            response.message.forEach((invoice) => {
                                const invoice_html = this.get_invoice_html(invoice);
                                this.$invoices_container.append(invoice_html);
                            });
                        }
                    },
                    error: () => frappe.dom.unfreeze(),
                });
            }

            

            
            
        }

        erpnext.PointOfSale.PastOrderList = MyPastOrderList;



        const OriginalItemSelector = erpnext.PointOfSale.ItemSelector;
        class MyItemSelector extends OriginalItemSelector {
            constructor(wrapper, args) {
                super(wrapper, args);
            }

            async get_items({ start = 0, page_length = 40, search_term = "" } = {}) {
                if (!navigator.onLine && window.wmnPOSOffline) {
                    const pos_ctrl = window.cur_pos;
                    const doc = pos_ctrl && pos_ctrl.frm ? pos_ctrl.frm.doc : {};
                    const settings = pos_ctrl && pos_ctrl.settings ? pos_ctrl.settings : {};
                    const price_list = doc.selling_price_list || settings.selling_price_list || this.price_list || "";
                    const item_group = this.item_group || this.parent_item_group || "";
                    const items = await window.wmnPOSOffline.searchItems({
                        search_term,
                        price_list,
                        start,
                        page_length,
                        item_group
                    });
                    return { message: { items } };
                }

                if (window.wmnPOSOffline && navigator.onLine) {
                    window.wmnPOSOffline.preload(window.cur_pos, false);
                }

                return super.get_items({ start, page_length, search_term });
            }

            filter_items({ search_term = "" } = {}) {
                if (!navigator.onLine && window.wmnPOSOffline) {
                    return this.get_items({ search_term }).then(({ message }) => {
                        const items = (message && message.items) || [];
                        if (items.length === 1 && search_term && search_term.length >= 8) {
                            this.events.item_selected({
                                field: "qty",
                                value: 1,
                                item: items[0],
                            });
                            this.set_search_value("");
                            frappe.utils.play_sound("submit");
                            return;
                        }
                        this.render_item_list(items);
                    });
                }

                if (search_term && search_term.length >= 12) {
                    return frappe.call({
                        method: "wmn.barcode_handler.custom_scan_barcode",
                        args: { search_value: search_term }
                    }).then(async (r) => {
                        if (r.message && r.message.item_code) {
                            const data = r.message;
                            const pos_ctrl = window.cur_pos;
                            let qty_value = data.qty || 1;

                            let existing_item = null;
                            if (pos_ctrl.frm && pos_ctrl.frm.doc.items) {
                                existing_item = pos_ctrl.frm.doc.items.find(i => 
                                    i.item_code === data.item_code && 
                                    (i.batch_no === data.batch_no || (!i.batch_no && !data.batch_no))
                                );
                            }

                            if (existing_item) {
                                frappe.dom.freeze();
                                const new_qty = flt(existing_item.qty) + flt(qty_value);
                                
                                // Directly set value in model to bypass selector logic constraints
                                await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                                if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                                }
                                if (data.serial_no) {
                                    let new_serial_no = existing_item.serial_no ? existing_item.serial_no + "\n" + data.serial_no : data.serial_no;
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                                }
                                // Refresh the UI components
                                pos_ctrl.update_cart_html(existing_item);
                                
                                frappe.dom.unfreeze();
                            } else {
                                this.events.item_selected({
                                    field: "qty",
                                    value: qty_value,
                                    item: {
                                        item_code: data.item_code,
                                        batch_no: data.batch_no,
                                        serial_no: data.serial_no,
                                        uom: data.uom,
                                        rate: data.price_list_rate
                                    },
                                });
                            }

                            this.set_search_value("");
                            frappe.utils.play_sound("submit");
                            return;
                        }
                        return super.filter_items({ search_term });
                    }).catch(err => {
                        console.error(err);
                        frappe.dom.unfreeze();
                        return super.filter_items({ search_term });
                    });
                }
                return super.filter_items({ search_term });
            }
            
            
            
            
            
            
            
            
            
            
            
            render_item_list(items) {
                super.render_item_list(items);

                if (this.button_mode) {
                    this.$items_container.addClass('wmn-button-mode');
                } else {
                    this.$items_container.removeClass('wmn-button-mode');
                }
            }
            
            prepare_dom() {
                super.prepare_dom();
                
                
               const $toggleContainer = $(`
                    <div class="wmn-view-toggle-container" style="padding: 2px 3px; border-bottom: 1px solid var(--border-color); background: var(--bg-color); display: flex; justify-content: flex-end;">
                        <div class="wmn-toggle-group">
                            <button class="wmn-grid-view-btn btn" title="Grid View" aria-label="Switch to grid view">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                                </svg>
                                <span>G</span>
                            </button>
                            <button class="wmn-list-view-btn btn" title="Button View" aria-label="Switch to list view">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="5" width="18" height="6" rx="1"></rect>
                                    <rect x="3" y="13" width="18" height="6" rx="1"></rect>
                                </svg>
                                <span>B</span>
                            </button>
                        </div>
                    </div>
                `); 
                
                
                const $toggleContainer1 = $(`
                    <div class="wmn-view-toggle-container" style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-color); display: flex; justify-content: flex-end;">
                        <div class="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                            <button class="wmn-grid-view-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Grid View" aria-label="Switch to grid view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                                </svg>
                            </button>
                            <button class="wmn-list-view-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Button View" aria-label="Switch to list view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `);
                
                this.$component.prepend($toggleContainer);
                
                this.$gridBtn = $toggleContainer.find('.wmn-grid-view-btn');
                this.$listBtn = $toggleContainer.find('.wmn-list-view-btn');
                
                this.updateActiveButton();
                
                this.$gridBtn.on('click', () => this.setCardMode());
                this.$listBtn.on('click', () => this.setButtonMode());
                
                if (this.button_mode) {
                    this.setButtonMode();
                } else {
                    this.setCardMode();
                }
            }
            
            updateActiveButton() {
                if (this.button_mode) {
                    this.$listBtn.addClass('bg-white shadow-sm');
                    this.$listBtn.removeClass('hover:bg-gray-200');
                    this.$gridBtn.removeClass('bg-white shadow-sm');
                    this.$gridBtn.addClass('hover:bg-gray-200');
                } else {
                    this.$gridBtn.addClass('bg-white shadow-sm');
                    this.$gridBtn.removeClass('hover:bg-gray-200');
                    this.$listBtn.removeClass('bg-white shadow-sm');
                    this.$listBtn.addClass('hover:bg-gray-200');
                }
            }
            
            setCardMode() {
                if (!this.button_mode) return;
                this.button_mode = false;
                localStorage.setItem('wmn_pos_button_mode', 'false');
                this.updateActiveButton();
                this.applyDisplayMode();
            }
            
            setButtonMode() {
                if (this.button_mode) return;
                this.button_mode = true;
                localStorage.setItem('wmn_pos_button_mode', 'true');
                this.updateActiveButton();
                this.applyDisplayMode();
            }
            
            applyDisplayMode() {
                if (this.button_mode) {
                    this.$items_container.addClass('wmn-button-mode');
                } else {
                    this.$items_container.removeClass('wmn-button-mode');
                }
            }
            
        }
        

        const styleId = 'wmn-button-mode-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
            

                .items-container.wmn-button-mode .item-wrapper {
                    cursor: pointer;
                    transition: all 0.2s ease;
                    text-align: center;
                }

                .items-container.wmn-button-mode .item-wrapper:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    border-color: var(--primary-color);
                }
                

                .items-container.wmn-button-mode .item-wrapper .item-display,
                .items-container.wmn-button-mode .item-wrapper .indicator-pill {
                    display: none !important;
                }
                

                .items-container.wmn-button-mode .item-wrapper .item-detail .item-rate {
                    display: none;
                }
.items-container.wmn-button-mode .item-wrapper {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important; 
    justify-content: center !important;
    text-align: center !important;
}
.items-container.wmn-button-mode {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
    gap: 1px;
    padding: 2px;
    padding-top: 1px;
    overflow-y: scroll;
    overflow-x: hidden;
    white-space: normal !important;
    font-weight: 600 !important;
    overflow: auto;
    text-overflow: ellipsis;
    max-width: 100%;
    vertical-align: middle;
}

                .items-container.wmn-button-mode .item-wrapper .item-name {
                    white-space: normal !important;
                    text-align: center !important;
                    font-weight: 600 !important;
                }
                

                .items-container.wmn-button-mode .item-wrapper .flex.items-center {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        }
        
   
        erpnext.PointOfSale.ItemSelector = MyItemSelector;
        
        
        
        
        // Assigning the new class back to the namespace
        erpnext.PointOfSale.ItemSelector = MyItemSelector;
wrapper.pos = new MyPOSController(wrapper);
installWMNOfflineInvoiceManagerDialogV5(wrapper.pos);

console.log("✅ WMN clean integrated POS offline v27 loaded");

window.cur_pos = wrapper.pos;

    });
};





        if (!window.__wmn_offline_print_delegation_v32) {
            $(document).on("click.wmnOfflinePrintReceiptV32", "button, .btn", function(e) {
                const text = ($(this).text() || "").trim().toLowerCase();
                if (text !== "print receipt" && text !== String(__("Print Receipt")).toLowerCase()) return;

                if (!wmn_is_pos_offline || !wmn_is_pos_offline()) return;

                e.preventDefault();
                e.stopPropagation();
                window.wmn_print_offline_receipt(window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc);
                return false;
            });
            window.__wmn_offline_print_delegation_v32 = true;
        }



console.log("✅ WMN v32 offline receipt print installed");



console.log("✅ WMN v50 offline invoice stays offline after reconnect fixed");
