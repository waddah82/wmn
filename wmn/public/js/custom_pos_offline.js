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

                window.addEventListener("load", function() {
                    navigator.serviceWorker.register("/pos-offline-sw.js", { scope: "/" })
                        .then(function(reg) {
                            console.log("✅ WMN POS Service Worker registered", reg.scope);
                        })
                        .catch(function(err) {
                            console.error("❌ WMN POS Service Worker registration failed", err);
                            frappe.show_alert({
                                message: __("تعذر تسجيل Service Worker. تأكد من وجود /pos-offline-sw.js في جذر الموقع"),
                                indicator: "orange"
                            });
                        });
                });
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
            const DB_VERSION = 25;
            const STORES = {
                items: "items",
                customers: "customers",
                item_prices: "item_prices",
                stock: "stock",
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

            async function searchItems({ search_term = "", price_list = "", start = 0, page_length = 40, item_group = "" } = {}) {
                const keyword = String(search_term || "").toLowerCase().trim();
                const ctx = await getPOSItemFilterContext({ price_list, item_group });

                let items = await getAll(STORES.items);
                const prices = await getAll(STORES.item_prices);
                const stockRows = await getAll(STORES.stock);

                if (keyword) {
                    items = items.filter(row => {
                        return String(row.item_code || "").toLowerCase().includes(keyword) ||
                            String(row.item_name || "").toLowerCase().includes(keyword) ||
                            String(row.barcode || "").toLowerCase().includes(keyword);
                    });
                }

                const filtered = [];
                for (const row of items) {
                    const price = getPriceForItem(prices, row.item_code, ctx.priceList, row.uom || row.stock_uom);
                    const stockRow = getStockForItem(stockRows, row.item_code, ctx.warehouse);

                    if (!itemPassesPOSProfileFilters(row, ctx, price, stockRow)) continue;

                    filtered.push(Object.assign({}, row, {
                        price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                        rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                        actual_qty: flt(stockRow && stockRow.actual_qty || row.actual_qty || 0),
                        warehouse: ctx.warehouse || row.warehouse || (stockRow && stockRow.warehouse) || "",
                    }));
                }

                return filtered.slice(start, start + page_length);
            }

            async function findItem(itemCode, price_list = "") {
                if (!itemCode) return null;

                let row = await get(STORES.items, itemCode);
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
                const price = getPriceForItem(prices, row.item_code, ctx.priceList, row.uom || row.stock_uom);
                const stockRow = getStockForItem(stockRows, row.item_code, ctx.warehouse);

                if (!itemPassesPOSProfileFilters(row, ctx, price, stockRow)) return null;

                return Object.assign({}, row, {
                    price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                    rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                    uom: row.uom || row.stock_uom || (price ? price.uom : "") || "",
                    actual_qty: flt(stockRow && stockRow.actual_qty || row.actual_qty || 0),
                    warehouse: ctx.warehouse || row.warehouse || (stockRow && stockRow.warehouse) || "",
                });
            }

            async function getStock(itemCode, warehouse) {
                if (!itemCode || !warehouse) return null;
                return get(STORES.stock, `${itemCode}::${warehouse}`);
            }

            async function saveInvoice(invoice, ctrl) {
                const doc = clone(invoice);
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

            window.addEventListener("online", () => syncInvoices());
            setInterval(() => {
                if (online()) syncInvoices();
            }, 60000);

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

        function wmn_is_pos_offline() {
            return (
                (location.pathname.includes("point-of-sale") || location.hash.includes("point-of-sale")) &&
                window.wmnPOSOffline &&
                (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
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

        async function wmn_make_offline_invoice_doc(ctrl) {
            const settings = await wmn_get_offline_settings();
            const customer = await wmn_find_customer_offline(settings.customer) || {};
            const payments = window.wmnPOSOffline
                ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods)
                : [];
            const today = frappe.datetime.get_today();
            const doc = {
                doctype: "Sales Invoice",
                name: "OFFLINE-SINV-" + Date.now(),
                __islocal: 1,
                __offline_pos: 1,
                offline_pos: 1,
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
                    doctype: "Sales Invoice Payment",
                    name: "OFFLINE-PAY-" + Date.now() + "-" + idx,
                    parenttype: "Sales Invoice",
                    parentfield: "payments",
                    parent: "",
                    mode_of_payment: p.mode_of_payment,
                    account: p.account || "",
                    type: p.type || "",
                    default: p.default,
                    amount: 0,
                    base_amount: 0,
                })),
                taxes: [],
            };
            return wmn_recalculate_offline_doc(doc);
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



        async function wmn_direct_offline_add_or_update(ctrl, args) {
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
                if (existing.qty <= 0) doc.items = doc.items.filter(r => r !== existing);
            } else if (qtyDelta > 0) {
                doc.items.push({
                    doctype: "Sales Invoice Item",
                    name: "OFFLINE-SINV-ITEM-" + Date.now() + "-" + doc.items.length,
                    parenttype: "Sales Invoice",
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
                    doctype: "Sales Invoice Item",
                    name: "OFFLINE-SINV-ITEM-" + Date.now() + "-" + doc.items.length,
                    parenttype: "Sales Invoice",
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

        function wmn_v9_patch_pos_instance(pos) {
            if (!pos || pos.__wmn_v9_instance_patched) return;

            const originalOnCartUpdate = pos.on_cart_update ? pos.on_cart_update.bind(pos) : null;

            pos.wmn_offline_on_cart_update = async function(args) {
                try {
                    await wmn_v9_direct_add_or_update(pos, args);
                    if (pos.cart && pos.cart.load_invoice) {
                        pos.cart.load_invoice();
                    }
                } catch (e) {
                    console.error("WMN v9 offline instance cart update failed", e);
                    frappe.show_alert({
                        message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                        indicator: "red",
                    });
                }
            };

            pos.on_cart_update = async function(args) {
                if (!wmn_v9_is_offline()) {
                    return originalOnCartUpdate ? originalOnCartUpdate(args) : undefined;
                }
                return pos.wmn_offline_on_cart_update(args);
            };

            const patchCart = () => {
                if (pos.cart && !pos.cart.__wmn_v9_cart_patched) {
                    const originalItemSelected = pos.cart.item_selected ? pos.cart.item_selected.bind(pos.cart) : null;

                    pos.cart.item_selected = function(args) {
                        if (!wmn_v9_is_offline()) {
                            return originalItemSelected ? originalItemSelected(args) : undefined;
                        }
                        return pos.wmn_offline_on_cart_update(args);
                    };

                    pos.cart.__wmn_v9_cart_patched = true;
                }
            };

            patchCart();
            const t = setInterval(() => {
                patchCart();
                if (pos.cart && pos.cart.__wmn_v9_cart_patched) clearInterval(t);
            }, 200);
            setTimeout(() => clearInterval(t), 8000);

            pos.__wmn_v9_instance_patched = true;
            console.log("✅ WMN v9 patched wrapper.pos instance cart methods");
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
                    parenttype: "Sales Invoice",
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

            if (!doc) frappe.throw(__("لا توجد فاتورة مفتوحة"));
            if (!doc.items || !doc.items.length) frappe.throw(__("أضف صنفاً واحداً على الأقل قبل الدفع"));

            wmn_recalc_offline_payment_doc(doc);

            const total = flt(doc.rounded_total || doc.grand_total || 0);
            if (total <= 0) frappe.throw(__("إجمالي الفاتورة صفر"));

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
                    title: __("Payment"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "payment_html",
                            options: `
                                <div class="wmn-offline-payment-dialog" style="direction:inherit;">
                                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${__("Grand Total")}</div>
                                            <div style="font-weight:700;font-size:18px;">${format_currency(total, doc.currency || "YER")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${__("Customer")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.customer_name || doc.customer || "")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${__("Invoice")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.name || "")}</div>
                                        </div>
                                    </div>

                                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
                                        ${rowsHtml || `<div class="text-muted">${__("No payment methods found")}</div>`}
                                    </div>

                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                                        <div style="font-size:13px;color:#6b7280;">
                                            ${__("Complete Order will apply payment to the offline invoice then save it offline.")}
                                        </div>
                                        <div style="font-weight:700;">
                                            ${__("Paid")}: <span class="wmn-offline-paid-total">0</span>
                                        </div>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    primary_action_label: __("Complete Order"),
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
                                    title: __("Payment Required"),
                                    indicator: "orange",
                                    message: __("أدخل مبلغ الدفع أولاً")
                                });
                                return;
                            }

                            doc.payments = payments.filter(p => flt(p.amount || 0) > 0 || p.mode_of_payment);
                            wmn_recalc_offline_payment_doc(doc);

                            if (flt(doc.paid_amount || 0) < flt(doc.rounded_total || doc.grand_total || 0)) {
                                frappe.msgprint({
                                    title: __("Payment Amount"),
                                    indicator: "orange",
                                    message: __("مبلغ الدفع أقل من إجمالي الفاتورة")
                                });
                                return;
                            }

                            d.hide();
                            resolve(doc);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    secondary_action_label: __("Cancel"),
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



        function installWMNV9OfflinePaymentDialogRuntimeV2(pos) {
            if (!pos || pos.__wmn_v9_payment_dialog_runtime_v2) return;

            function isOfflinePOS() {
                return (
                    window.wmnPOSOffline &&
                    (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
                );
            }

            async function submitOfflineWithDialog() {
                if (!isOfflinePOS()) {
                    if (pos.frm && pos.frm.savesubmit) {
                        return pos.frm.savesubmit().then((r) => {
                            pos.toggle_components(false);
                            pos.order_summary.toggle_component(true);
                            pos.order_summary.load_summary_of(r.doc, true);
                            pos.recent_order_list.refresh_list();
                            if (window.wmnPOSOffline) window.wmnPOSOffline.syncInvoices();
                        });
                    }
                    return;
                }

                try {
                    await wmn_show_offline_payment_dialog(pos);

                    frappe.dom.freeze(__("Saving offline invoice..."));
                    const row = await window.wmnPOSOffline.saveInvoice(pos.frm.doc, pos);
                    frappe.dom.unfreeze();

                    pos.toggle_components(false);
                    pos.order_summary.toggle_component(true);
                    pos.order_summary.load_summary_of(pos.frm.doc, true);

                    if (pos.recent_order_list && pos.recent_order_list.refresh_list) {
                        pos.recent_order_list.refresh_list();
                    }

                    console.log("WMN POS Offline: invoice saved after payment dialog", row);
                    return row;
                } catch (e) {
                    frappe.dom.unfreeze();

                    if ((e.message || e) === "cancelled") {
                        return;
                    }

                    console.error("Offline invoice payment/save failed", e);
                    frappe.msgprint({
                        title: __("Offline Save Failed"),
                        indicator: "red",
                        message: __("تعذر حفظ الفاتورة أوفلاين: {0}", [e.message || e])
                    });
                }
            }

            function patchPaymentEvents() {
                if (!pos.payment) return false;

                pos.payment.events = pos.payment.events || {};
                pos.payment.events.submit_invoice = submitOfflineWithDialog;

                // Some POS builds bind button events directly to payment.submit_invoice or complete_order
                ["submit_invoice", "complete_order", "save_invoice", "make_invoice", "submit"].forEach((methodName) => {
                    if (typeof pos.payment[methodName] === "function" && !pos.payment["__wmn_dialog_" + methodName + "_v2"]) {
                        pos.payment[methodName] = submitOfflineWithDialog;
                        pos.payment["__wmn_dialog_" + methodName + "_v2"] = true;
                    }
                });

                return true;
            }

            function bindCompleteOrderButton() {
                const roots = [];
                if (pos.payment && pos.payment.wrapper) roots.push($(pos.payment.wrapper));
                if (pos.payment && pos.payment.$component) roots.push(pos.payment.$component);
                if (pos.payment && pos.payment.$body) roots.push(pos.payment.$body);
                if (pos.$components_wrapper) roots.push(pos.$components_wrapper);
                roots.push($(".point-of-sale-app, .pos, .layout-main-section"));

                roots.forEach(($root) => {
                    if (!$root || !$root.length) return;

                    $root.find("button, .btn").each(function () {
                        const $btn = $(this);
                        const text = String($btn.text() || "").trim().toLowerCase();

                        const isComplete =
                            text === "complete order" ||
                            text.includes("complete order") ||
                            text.includes("إكمال الطلب") ||
                            text.includes("اكمال الطلب") ||
                            text.includes("حفظ الفاتورة");

                        if (!isComplete || $btn.attr("data-wmn-payment-dialog-v2")) return;

                        $btn.attr("data-wmn-payment-dialog-v2", "1");
                        $btn.off("click.wmnPaymentDialogV2").on("click.wmnPaymentDialogV2", function (e) {
                            if (!isOfflinePOS()) return;

                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();

                            submitOfflineWithDialog();
                            return false;
                        });
                    });
                });
            }

            patchPaymentEvents();
            bindCompleteOrderButton();

            const t = setInterval(() => {
                patchPaymentEvents();
                bindCompleteOrderButton();
            }, 300);
            setTimeout(() => clearInterval(t), 15000);

            pos.__wmn_v9_payment_dialog_runtime_v2 = true;
            console.log("✅ WMN v9 offline payment dialog runtime v2 installed");
        }



        function installWMNV9PaymentDialogSaveGuardV3(pos) {
            if (!window.wmnPOSOffline || window.wmnPOSOffline.__wmn_payment_dialog_save_guard_v3) return;

            const originalSaveInvoice = window.wmnPOSOffline.saveInvoice.bind(window.wmnPOSOffline);

            window.wmnPOSOffline.saveInvoice = async function(doc, ctrl) {
                const isOfflinePOS = (
                    navigator.onLine === false ||
                    window.__wmn_force_pos_offline === true ||
                    window.__wmn_pos_effective_offline === true
                );

                // إذا الحفظ ليس من POS Offline أو الديالوج اعتمد الدفع مسبقاً، احفظ طبيعي.
                if (!isOfflinePOS || window.__wmn_payment_dialog_confirmed_v3) {
                    return originalSaveInvoice(doc, ctrl);
                }

                const activeCtrl = ctrl || window.cur_pos || pos;
                const activeDoc = doc || (activeCtrl && activeCtrl.frm && activeCtrl.frm.doc);

                if (!activeCtrl || !activeDoc) {
                    return originalSaveInvoice(doc, ctrl);
                }

                // افتح Dialog الدفع قبل أي حفظ مباشر قديم.
                await wmn_show_offline_payment_dialog(activeCtrl);

                try {
                    window.__wmn_payment_dialog_confirmed_v3 = true;
                    return await originalSaveInvoice(activeDoc, activeCtrl);
                } finally {
                    window.__wmn_payment_dialog_confirmed_v3 = false;
                }
            };

            window.wmnPOSOffline.__wmn_payment_dialog_save_guard_v3 = true;
            console.log("✅ WMN v9 payment dialog save guard v3 installed");
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
                        window.wmnPOSOffline.syncInvoices();
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
                if (wmn_is_pos_offline()) {
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
                if (window.wmnPOSOffline) {
                    window.wmnPOSOffline.preload(this, false);
                    window.wmnPOSOffline.syncInvoices();
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
                frappe.dom.freeze();
                let item_row;
                try {
                    let { field, value, item } = args || {};
                    item = await this.wmn_offline_get_full_item(item || {});

                    if (!this.frm || !this.frm.doc) return null;
                    if (!this.frm.doc.customer) return this.raise_customer_selection_alert();
                    if (!item.item_code) return null;

                    const target_warehouse = this.frm.doc.set_warehouse || this.settings.warehouse || item.warehouse || "";
                    item_row = this.get_item_from_frm(item);
                    const item_row_exists = item_row && !$.isEmptyObject(item_row);
                    const from_selector = field === "qty" && value === "+1";

                    if (item_row_exists) {
                        if (from_selector) value = flt(item_row.qty || 0) + 1;
                        if (field === "qty") value = flt(value || 0);

                        if (["qty", "conversion_factor"].includes(field) && value > 0 && !this.allow_negative_stock) {
                            const conversion = field === "conversion_factor" ? flt(value || 1) : flt(item_row.conversion_factor || 1);
                            const qty_needed = field === "qty" ? flt(value || 0) * conversion : flt(item_row.qty || 0) * conversion;
                            const ok = await this.check_stock_availability(item_row, qty_needed, target_warehouse);
                            if (!ok) {
                                frappe.show_alert({ message: __("الكمية غير متوفرة في المخزون الأوفلاين"), indicator: "orange" });
                                return item_row;
                            }
                        }

                        item_row[field] = value;
                        if (field === "qty") item_row.stock_qty = flt(value || 0) * flt(item_row.conversion_factor || 1);
                    } else {
                        let qty = from_selector ? 1 : flt(value || 1);
                        if (field === "serial_no") qty = String(value || "").split("\n").filter(Boolean).length || 0;

                        const ok = this.allow_negative_stock ? true : await this.check_stock_availability(item, qty, target_warehouse);
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
                            warehouse: target_warehouse,
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

                    this.wmn_recalculate_offline_totals();
                    this.frm.dirty();
                    this.update_cart_html(item_row);
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
                    frappe.dom.unfreeze();
                }
            }

            async save_and_checkout() {
                if (!navigator.onLine && window.wmnPOSOffline) {
                    this.wmn_recalculate_offline_totals();
                    this.payment.checkout();
                    return;
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
                        this.frm = this.get_new_frm(null, doctype);
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
                const page = $("<div>");
                const frm = new frappe.ui.form.Form(doctype, page, false);
                const name = frappe.model.make_new_doc_and_get_name(doctype, true);
                frm.refresh(name);
                return frm;
            }

            init_payments() {
                super.init_payments();

                this.payment.events.submit_invoice = async () => {
                    if (!navigator.onLine && window.wmnPOSOffline) {
                        try {
                            await wmn_show_offline_payment_dialog(this);

                            frappe.dom.freeze(__("Saving offline invoice..."));
                            const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);
                            frappe.dom.unfreeze();

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
                                title: __("Offline Save Failed"),
                                indicator: "red",
                                message: __("تعذر حفظ الفاتورة أوفلاين: {0}", [e.message || e])
                            });
                            return;
                        }
                    }

                    this.frm.savesubmit().then((r) => {
                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(r.doc, true);
                        this.recent_order_list.refresh_list();
                        if (window.wmnPOSOffline) window.wmnPOSOffline.syncInvoices();
                    });
                };
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
                                () => this.make_new_invoice(),
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

        function installWMNOfflineDocRuntimePatches() {
            if (window.__wmn_offline_doc_runtime_patches_v2) return;

            const OriginalCart = erpnext.PointOfSale.ItemCart;
            if (OriginalCart && !OriginalCart.prototype.__wmn_offline_doc_cart_v2) {
                const item_selected = OriginalCart.prototype.item_selected;
                OriginalCart.prototype.item_selected = function(args) {
                    if (!wmn_is_pos_offline()) return item_selected.apply(this, arguments);

                    return (async () => {
                        const raw = (args && args.item) || args || {};
                        const rawCode = raw.item_code || raw.item || raw.value || raw.name || raw.item_name || raw.barcode || "";
                        const frm = this.events && this.events.get_frm ? this.events.get_frm() : (window.cur_pos && window.cur_pos.frm);
                        const doc = frm && frm.doc;

                        if (!doc) return;

                        const settings = await wmn_get_offline_settings();
                        const found = await (window.wmnPOSOffline.findItem
                            ? window.wmnPOSOffline.findItem(rawCode, doc.selling_price_list || settings.selling_price_list || "")
                            : null);

                        const itemCode = (found && found.item_code) || raw.item_code || raw.value || raw.name || rawCode;
                        if (!itemCode) return;

                        const price = found ? await wmn_find_price_offline(
                            found.item_code,
                            doc.selling_price_list || settings.selling_price_list || "",
                            found.uom || found.stock_uom || raw.uom
                        ) : null;

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
                            String(row.uom || "").trim() === String((found && (found.uom || found.stock_uom)) || raw.uom || row.uom || "Nos").trim() &&
                            String(row.warehouse || "").trim() === String(doc.set_warehouse || settings.warehouse || (found && found.warehouse) || row.warehouse || "").trim()
                        );

                        if (existing) {
                            existing.qty = flt(existing.qty || 0) + 1;
                            existing.stock_qty = flt(existing.qty || 0) * flt(existing.conversion_factor || 1);
                        } else {
                            const uom = (found && (found.uom || found.stock_uom)) || raw.uom || "Nos";
                            const warehouse = doc.set_warehouse || settings.warehouse || (found && found.warehouse) || "";

                            doc.items.push({
                                doctype: "Sales Invoice Item",
                                name: "OFFLINE-SINV-ITEM-" + Date.now(),
                                parenttype: "Sales Invoice",
                                parentfield: "items",
                                parent: doc.name,
                                item_code: itemCode,
                                item_name: (found && found.item_name) || raw.item_name || itemCode,
                                description: (found && (found.description || found.item_name)) || raw.item_name || itemCode,
                                item_group: (found && found.item_group) || "",
                                stock_uom: (found && (found.stock_uom || found.uom)) || uom,
                                uom,
                                conversion_factor: 1,
                                qty: 1,
                                stock_qty: 1,
                                warehouse,
                                price_list_rate: rate,
                                rate,
                                income_account: (found && found.income_account) || settings.income_account || "",
                                expense_account: (found && found.expense_account) || settings.expense_account || "",
                                cost_center: (found && found.cost_center) || settings.cost_center || "",
                            });
                        }

                        wmn_recalculate_offline_doc(doc);

                        if (this.load_invoice) {
                            this.load_invoice();
                        } else if (window.cur_pos && window.cur_pos.cart && window.cur_pos.cart.load_invoice) {
                            window.cur_pos.cart.load_invoice();
                        }
                    })();
                };
                OriginalCart.prototype.__wmn_offline_doc_cart_v2 = true;
            }

            const OriginalPayment = erpnext.PointOfSale.Payment;
            if (OriginalPayment && !OriginalPayment.prototype.__wmn_offline_doc_payment_v2) {
                const checkout = OriginalPayment.prototype.checkout;
                OriginalPayment.prototype.checkout = async function() {
                    if (!wmn_is_pos_offline()) return checkout.apply(this, arguments);

                    const frm = this.events.get_frm();
                    wmn_recalculate_offline_doc(frm.doc);
                    const row = await window.wmnPOSOffline.saveInvoice(frm.doc, window.cur_pos);
                    frappe.show_alert({
                        message: __("Invoice saved offline") + ": " + row.offline_id,
                        indicator: "green",
                    });

                    frm.doc.items = [];
                    (frm.doc.payments || []).forEach(p => {
                        p.amount = 0;
                        p.base_amount = 0;
                    });
                    wmn_recalculate_offline_doc(frm.doc);
                    if (window.cur_pos && window.cur_pos.cart) window.cur_pos.cart.load_invoice();
                    return row;
                };
                OriginalPayment.prototype.__wmn_offline_doc_payment_v2 = true;
            }

            window.__wmn_offline_doc_runtime_patches_v2 = true;
            console.log("✅ WMN offline Sales Invoice lightweight doc runtime patches v2 installed");
        }

        installWMNOfflineDocRuntimePatches();


        function installWMNOfflineCartMergeGuard() {
            if (window.__wmn_offline_cart_merge_guard_v5) return;

            function isOfflinePOS() {
                return typeof wmn_is_pos_offline === "function"
                    ? wmn_is_pos_offline()
                    : (
                        window.wmnPOSOffline &&
                        (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
                    );
            }

            function mergeAndRefresh(cart) {
                if (!isOfflinePOS()) return;
                const frm = cart && cart.events && cart.events.get_frm
                    ? cart.events.get_frm()
                    : (window.cur_pos && window.cur_pos.frm);

                if (!frm || !frm.doc) return;

                if (window.wmnPOSOffline && window.wmnPOSOffline.mergeDuplicateOfflineItems) {
                    window.wmnPOSOffline.mergeDuplicateOfflineItems(frm.doc);
                } else if (typeof mergeDuplicateOfflineItems === "function") {
                    mergeDuplicateOfflineItems(frm.doc);
                }

                if (window.wmnPOSOffline && window.wmnPOSOffline.recalculateOfflineDoc) {
                    window.wmnPOSOffline.recalculateOfflineDoc(frm.doc);
                } else if (typeof wmn_recalculate_offline_doc === "function") {
                    wmn_recalculate_offline_doc(frm.doc);
                }
            }

            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (Cart && !Cart.prototype.__wmn_merge_guard_v5) {
                const originalLoadInvoice = Cart.prototype.load_invoice;
                Cart.prototype.load_invoice = function() {
                    mergeAndRefresh(this);
                    return originalLoadInvoice.apply(this, arguments);
                };

                const originalUpdateItemQty = Cart.prototype.update_item_qty;
                if (originalUpdateItemQty) {
                    Cart.prototype.update_item_qty = function() {
                        const out = originalUpdateItemQty.apply(this, arguments);
                        mergeAndRefresh(this);
                        return out;
                    };
                }

                Cart.prototype.__wmn_merge_guard_v5 = true;
            }

            const C = erpnext.PointOfSale && erpnext.PointOfSale.Controller;
            if (C && !C.prototype.__wmn_merge_guard_v5) {
                const originalOnCartUpdate = C.prototype.on_cart_update;
                if (originalOnCartUpdate) {
                    C.prototype.on_cart_update = async function(args) {
                        const out = await originalOnCartUpdate.apply(this, arguments);
                        if (isOfflinePOS() && this.frm && this.frm.doc) {
                            if (window.wmnPOSOffline && window.wmnPOSOffline.mergeDuplicateOfflineItems) {
                                window.wmnPOSOffline.mergeDuplicateOfflineItems(this.frm.doc);
                                window.wmnPOSOffline.recalculateOfflineDoc && window.wmnPOSOffline.recalculateOfflineDoc(this.frm.doc);
                            } else if (typeof wmn_recalculate_offline_doc === "function") {
                                wmn_recalculate_offline_doc(this.frm.doc);
                            }
                            if (this.cart && this.cart.load_invoice) this.cart.load_invoice();
                        }
                        return out;
                    };
                }
                C.prototype.__wmn_merge_guard_v5 = true;
            }

            window.__wmn_offline_cart_merge_guard_v5 = true;
            console.log("✅ WMN offline cart duplicate merge guard v5 installed");
        }

        installWMNOfflineCartMergeGuard();


        function installWMNOfflineDirectCartUpdateV6() {
            if (window.__wmn_offline_direct_cart_update_v6) return;

            function isOfflinePOS() {
                return typeof wmn_is_pos_offline === "function"
                    ? wmn_is_pos_offline()
                    : (
                        window.wmnPOSOffline &&
                        (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
                    );
            }

            async function getSettings() {
                if (typeof wmn_get_offline_settings === "function") {
                    return await wmn_get_offline_settings();
                }
                if (window.wmnPOSOffline && window.wmnPOSOffline.getFullSettings) {
                    return await window.wmnPOSOffline.getFullSettings();
                }
                return {};
            }

            async function findItem(rawCode, priceList) {
                if (!rawCode) return null;
                if (window.wmnPOSOffline && window.wmnPOSOffline.findItem) {
                    const found = await window.wmnPOSOffline.findItem(rawCode, priceList || "");
                    if (found) return found;
                }

                const rows = window.wmnPOSOffline && window.wmnPOSOffline.getAll
                    ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items)
                    : [];
                const q = String(rawCode || "").toLowerCase().trim();

                return (rows || []).find(i =>
                    String(i.item_code || "").toLowerCase() === q ||
                    String(i.name || "").toLowerCase() === q ||
                    String(i.barcode || "").toLowerCase() === q ||
                    String(i.item_name || "").toLowerCase() === q
                ) || null;
            }

            async function findPrice(itemCode, priceList, uom) {
                if (typeof wmn_find_price_offline === "function") {
                    return await wmn_find_price_offline(itemCode, priceList, uom);
                }
                if (window.wmnPOSOffline && window.wmnPOSOffline.findPrice) {
                    return await window.wmnPOSOffline.findPrice(itemCode, priceList, uom);
                }

                const rows = window.wmnPOSOffline && window.wmnPOSOffline.getAll
                    ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_prices)
                    : [];
                return (rows || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList) &&
                    (!uom || !p.uom || p.uom === uom)
                ) || (rows || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList)
                ) || null;
            }

            function normalizeRawItem(args) {
                const raw = (args && args.item) || args || {};
                return {
                    raw,
                    code: raw.item_code || raw.item || raw.value || raw.name || raw.item_name || raw.barcode || "",
                    qtyDelta: (
                        args && args.value === "-1" ? -1 :
                        args && args.value === "+1" ? 1 :
                        args && args.field === "qty" && typeof args.value === "number" ? flt(args.value) :
                        1
                    )
                };
            }

            async function addOrIncrement(ctrl, args) {
                const frm = ctrl && ctrl.frm ? ctrl.frm : (window.cur_pos && window.cur_pos.frm);
                const doc = frm && frm.doc;

                if (!doc) return;

                const { raw, code, qtyDelta } = normalizeRawItem(args);
                if (!code && !(raw && raw.item_code)) return;

                const settings = await getSettings();
                const priceList = doc.selling_price_list || settings.selling_price_list || "";
                const found = await findItem(code || raw.item_code, priceList);

                const itemCode = (found && found.item_code) || raw.item_code || raw.value || raw.name || code;
                if (!itemCode) return;

                const uom = (found && (found.uom || found.stock_uom)) || raw.uom || "Nos";
                const warehouse = doc.set_warehouse || settings.warehouse || (found && found.warehouse) || "";
                const price = found ? await findPrice(found.item_code, priceList, uom) : null;
                const rate = flt(raw.price_list_rate || raw.rate || (price && price.price_list_rate) || (found && (found.price_list_rate || found.rate)) || 0);

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

                    // Remove if qty became zero from decrement.
                    if (existing.qty <= 0) {
                        doc.items = doc.items.filter(r => r !== existing);
                    }
                } else if (qtyDelta > 0) {
                    doc.items.push({
                        doctype: "Sales Invoice Item",
                        name: "OFFLINE-SINV-ITEM-" + Date.now() + "-" + doc.items.length,
                        parenttype: "Sales Invoice",
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
                }

                if (ctrl && ctrl.cart && ctrl.cart.load_invoice) {
                    ctrl.cart.load_invoice();
                } else if (window.cur_pos && window.cur_pos.cart && window.cur_pos.cart.load_invoice) {
                    window.cur_pos.cart.load_invoice();
                }
            }

            const C = erpnext.PointOfSale && erpnext.PointOfSale.Controller;
            if (C) {
                const originalOnCartUpdate = C.prototype.on_cart_update;
                C.prototype.on_cart_update = async function(args) {
                    if (!isOfflinePOS()) {
                        return originalOnCartUpdate.apply(this, arguments);
                    }

                    try {
                        await addOrIncrement(this, args);
                    } catch (e) {
                        console.error("WMN POS offline direct cart update failed:", e);
                        frappe.show_alert({
                            message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                            indicator: "red",
                        });
                    }
                };
            }

            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (Cart) {
                const originalItemSelected = Cart.prototype.item_selected;
                Cart.prototype.item_selected = function(args) {
                    if (!isOfflinePOS()) return originalItemSelected.apply(this, arguments);

                    const ctrl = window.cur_pos;
                    return addOrIncrement(ctrl, args).catch((e) => {
                        console.error("WMN POS offline item_selected failed:", e);
                        frappe.show_alert({
                            message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                            indicator: "red",
                        });
                    });
                };
            }

            window.__wmn_offline_direct_cart_update_v6 = true;
            console.log("✅ WMN offline direct cart update v6 installed");
        }

        installWMNOfflineDirectCartUpdateV6();


        function installWMNOfflineCartUpdateBypassV7() {
            if (window.__wmn_offline_cart_update_bypass_v7) return;

            function isOfflinePOS() {
                return typeof wmn_is_pos_offline === "function"
                    ? wmn_is_pos_offline()
                    : (
                        window.wmnPOSOffline &&
                        (navigator.onLine === false || window.__wmn_force_pos_offline === true || window.__wmn_pos_effective_offline === true)
                    );
            }

            async function getSettings() {
                if (typeof wmn_get_offline_settings === "function") return await wmn_get_offline_settings();
                if (window.wmnPOSOffline && window.wmnPOSOffline.getFullSettings) return await window.wmnPOSOffline.getFullSettings();
                return {};
            }

            async function findItemSafe(rawCode, priceList) {
                if (!rawCode) return null;

                if (window.wmnPOSOffline && window.wmnPOSOffline.findItem) {
                    const found = await window.wmnPOSOffline.findItem(rawCode, priceList || "");
                    if (found) return found;
                }

                const rows = window.wmnPOSOffline && window.wmnPOSOffline.getAll
                    ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items)
                    : [];

                const q = String(rawCode || "").toLowerCase().trim();

                return (rows || []).find(i =>
                    String(i.item_code || "").toLowerCase() === q ||
                    String(i.name || "").toLowerCase() === q ||
                    String(i.barcode || "").toLowerCase() === q ||
                    String(i.item_name || "").toLowerCase() === q
                ) || null;
            }

            async function findPriceSafe(itemCode, priceList, uom) {
                if (typeof wmn_find_price_offline === "function") {
                    return await wmn_find_price_offline(itemCode, priceList, uom);
                }
                if (window.wmnPOSOffline && window.wmnPOSOffline.findPrice) {
                    return await window.wmnPOSOffline.findPrice(itemCode, priceList, uom);
                }

                const rows = window.wmnPOSOffline && window.wmnPOSOffline.getAll
                    ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_prices)
                    : [];

                return (rows || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList) &&
                    (!uom || !p.uom || p.uom === uom)
                ) || (rows || []).find(p =>
                    p.item_code === itemCode &&
                    (!priceList || p.price_list === priceList)
                ) || null;
            }

            function normalizeCartArgs(args) {
                const raw = (args && args.item) || args || {};
                const code = raw.item_code || raw.item || raw.value || raw.name || raw.item_name || raw.barcode || "";
                let qtyDelta = 1;

                if (args && args.field === "qty") {
                    if (args.value === "+1") qtyDelta = 1;
                    else if (args.value === "-1") qtyDelta = -1;
                    else if (typeof args.value === "number") qtyDelta = flt(args.value);
                }

                return { raw, code, qtyDelta };
            }

            function recalc(doc) {
                if (window.wmnPOSOffline && window.wmnPOSOffline.mergeDuplicateOfflineItems) {
                    window.wmnPOSOffline.mergeDuplicateOfflineItems(doc);
                } else if (typeof mergeDuplicateOfflineItems === "function") {
                    mergeDuplicateOfflineItems(doc);
                }

                if (window.wmnPOSOffline && window.wmnPOSOffline.recalculateOfflineDoc) {
                    window.wmnPOSOffline.recalculateOfflineDoc(doc);
                } else if (typeof wmn_recalculate_offline_doc === "function") {
                    wmn_recalculate_offline_doc(doc);
                }
            }

            async function directAddOrUpdate(ctrl, args) {
                const frm = (ctrl && ctrl.frm) || (window.cur_pos && window.cur_pos.frm);
                const doc = frm && frm.doc;
                if (!doc) return;

                const { raw, code, qtyDelta } = normalizeCartArgs(args);
                if (!code && !(raw && raw.item_code)) return;

                const settings = await getSettings();
                const priceList = doc.selling_price_list || settings.selling_price_list || "";
                const found = await findItemSafe(code || raw.item_code, priceList);

                const itemCode = (found && found.item_code) || raw.item_code || raw.value || raw.name || code;
                if (!itemCode) return;

                const uom = (found && (found.uom || found.stock_uom)) || raw.uom || "Nos";
                const warehouse = doc.set_warehouse || settings.warehouse || (found && found.warehouse) || "";
                const price = found ? await findPriceSafe(found.item_code, priceList, uom) : null;
                const rate = flt(raw.price_list_rate || raw.rate || (price && price.price_list_rate) || (found && (found.price_list_rate || found.rate)) || 0);

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
                    if (existing.qty <= 0) doc.items = doc.items.filter(r => r !== existing);
                } else if (qtyDelta > 0) {
                    doc.items.push({
                        doctype: "Sales Invoice Item",
                        name: "OFFLINE-SINV-ITEM-" + Date.now() + "-" + doc.items.length,
                        parenttype: "Sales Invoice",
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

                recalc(doc);

                // Important:
                // Do not call old update_cart_html(args.item)
                // because it reaches render_cart_item and expects item.name.
                if (ctrl && ctrl.cart && ctrl.cart.load_invoice) {
                    ctrl.cart.load_invoice();
                } else if (window.cur_pos && window.cur_pos.cart && window.cur_pos.cart.load_invoice) {
                    window.cur_pos.cart.load_invoice();
                }
            }

            const C = erpnext.PointOfSale && erpnext.PointOfSale.Controller;
            if (C) {
                C.prototype.wmn_offline_on_cart_update = async function(args) {
                    if (!isOfflinePOS()) return;
                    try {
                        await directAddOrUpdate(this, args);
                    } catch (e) {
                        console.error("WMN offline bypass update failed", e);
                        frappe.show_alert({
                            message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                            indicator: "red",
                        });
                    }
                };

                const originalOnCartUpdate = C.prototype.on_cart_update;
                C.prototype.on_cart_update = async function(args) {
                    if (!isOfflinePOS()) return originalOnCartUpdate.apply(this, arguments);
                    return this.wmn_offline_on_cart_update(args);
                };
            }

            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (Cart) {
                const originalItemSelected = Cart.prototype.item_selected;
                Cart.prototype.item_selected = function(args) {
                    if (!isOfflinePOS()) return originalItemSelected.apply(this, arguments);
                    const ctrl = window.cur_pos;
                    return directAddOrUpdate(ctrl, args).catch((e) => {
                        console.error("WMN offline bypass item_selected failed", e);
                        frappe.show_alert({
                            message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                            indicator: "red",
                        });
                    });
                };
            }

            window.__wmn_offline_cart_update_bypass_v7 = true;
            console.log("✅ WMN offline cart update bypass v7 installed");
        }

        installWMNOfflineCartUpdateBypassV7();









        setTimeout(() => {
            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (Cart && !Cart.prototype.__wmn_v8_item_selected_after_class) {
                const originalItemSelected = Cart.prototype.item_selected;
                Cart.prototype.item_selected = function(args) {
                    if (!wmn_is_pos_offline()) return originalItemSelected.apply(this, arguments);

                    const ctrl = window.cur_pos;
                    return wmn_direct_offline_add_or_update(ctrl, args)
                        .then(() => {
                            if (ctrl && ctrl.cart && ctrl.cart.load_invoice) ctrl.cart.load_invoice();
                        })
                        .catch((e) => {
                            console.error("WMN v8 item_selected failed", e);
                            frappe.show_alert({
                                message: __("تعذر إضافة الصنف أوفلاين") + ": " + (e.message || e),
                                indicator: "red",
                            });
                        });
                };
                Cart.prototype.__wmn_v8_item_selected_after_class = true;
                console.log("✅ WMN v8 ItemCart.item_selected patched after class load");
            }
        }, 0);


        wrapper.pos = new MyPOSController(wrapper);
        installWMNV9PaymentDialogSaveGuardV3(wrapper.pos);

        function installWMNOfflineOldAlertSuppressorV3() {
            if (window.__wmn_old_offline_alert_suppressor_v3) return;

            const originalShowAlert = frappe.show_alert;
            frappe.show_alert = function(message, seconds) {
                const raw = typeof message === "string"
                    ? message
                    : (message && (message.message || message.title)) || "";

                if (
                    navigator.onLine === false &&
                    String(raw || "").includes("Invoice saved offline")
                ) {
                    // لا تعرض الرسالة القديمة لأن الحفظ يجب أن يمر عبر Dialog الدفع.
                    console.warn("WMN v3 suppressed old offline save alert:", raw);
                    return;
                }

                return originalShowAlert.apply(this, arguments);
            };

            window.__wmn_old_offline_alert_suppressor_v3 = true;
            console.log("✅ WMN old offline save alert suppressor v3 installed");
        }

        installWMNOfflineOldAlertSuppressorV3();


        installWMNV9OfflinePaymentDialogRuntimeV2(wrapper.pos);
        wmn_v9_patch_pos_instance(wrapper.pos);

        setTimeout(() => {
            if (wrapper.pos) wmn_v9_patch_pos_instance(wrapper.pos);
        }, 500);

        window.cur_pos = wrapper.pos;
        
    });
};
console.log("✅ WMN offline direct class cart update v8 installed");
