
        /**
         * WMN POS PWA Bridge
         * Registers manifest + Service Worker for opening POS shell offline.
         * Notes:
         * - The service worker file must be served from root: /pos-offline-sw.js
         * - The manifest file should be served from root: /pos-offline-manifest.webmanifest
         */
         
         function registerWMNPOSServiceWorker() {
            try {
                if (!document.querySelector('link[rel="manifest"][href="/pos-offline-manifest.json"]')) {
                    const manifest = document.createElement("link");
                    manifest.rel = "manifest";
                    manifest.href = "/pos-offline-manifest.json";
                    document.head.appendChild(manifest);
                }

                if (!document.querySelector('meta[name="theme-color"]')) {
                    const theme = document.createElement("meta");
                    theme.name = "theme-color";
                    theme.content = "#4F46E5";
                    document.head.appendChild(theme);
                }

                if (!document.querySelector('meta[name="mobile-web-app-capable"]')) {
                    const mobileCapable = document.createElement("meta");
                    mobileCapable.name = "mobile-web-app-capable";
                    mobileCapable.content = "yes";
                    document.head.appendChild(mobileCapable);
                }

                if (!document.querySelector('meta[name="apple-mobile-web-app-capable"]')) {
                    const appleCapable = document.createElement("meta");
                    appleCapable.name = "apple-mobile-web-app-capable";
                    appleCapable.content = "yes";
                    document.head.appendChild(appleCapable);
                }

                if (!document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')) {
                    const appleStatus = document.createElement("meta");
                    appleStatus.name = "apple-mobile-web-app-status-bar-style";
                    appleStatus.content = "default";
                    document.head.appendChild(appleStatus);
                }

                if (!document.querySelector('link[rel="apple-touch-icon"]')) {
                    const appleIcon = document.createElement("link");
                    appleIcon.rel = "apple-touch-icon";
                    appleIcon.href = "/assets/wmn/icons/apple-touch-icon.png";
                    document.head.appendChild(appleIcon);
                }

                if (!document.querySelector('link[rel="icon"][href="/assets/wmn/icons/icon-192.png"]')) {
                    const icon = document.createElement("link");
                    icon.rel = "icon";
                    icon.type = "image/png";
                    icon.sizes = "192x192";
                    icon.href = "/assets/wmn/icons/icon-192.png";
                    document.head.appendChild(icon);
                }

                if (!("serviceWorker" in navigator)) {
                    console.warn("WMN POS Offline: Service Worker is not supported in this browser");
                    return;
                }

                if (location.protocol !== "https:" && location.hostname !== "localhost") {
                    console.warn("WMN POS Offline: Service Worker requires HTTPS or localhost");
                    return;
                }

                if (window.__wmn_pos_sw_register_started) {
                    return;
                }

                window.__wmn_pos_sw_register_started = true;

                const doRegister = function () {
                    navigator.serviceWorker.register("/pos-offline-sw.js", {
                         scope: "/app/point-of-sale",
                        updateViaCache: "none"
                    })
                        .then(function (reg) {

                            if (reg && reg.update) {
                                reg.update().catch(function (e) {
                                    console.warn("WMN POS Service Worker update check failed", e);
                                });
                            }
                        })
                        .catch(function (err) {
                            console.error("WMN POS Service Worker registration failed", err);

                            if (window.frappe && frappe.show_alert) {
                                frappe.show_alert({
                                    message: __("Service Worker registration failed: /pos-offline-sw.js"),
                                    indicator: "orange"
                                });
                            }
                        });
                };

                if (document.readyState === "complete" || document.readyState === "interactive") {
                    doRegister();
                } else {
                    window.addEventListener("load", doRegister, { once: true });
                }

                if (!window.__wmn_sw_controllerchange_v25) {
                    navigator.serviceWorker.addEventListener("controllerchange", function () {
                    });

                    window.__wmn_sw_controllerchange_v25 = true;
                }
            } catch (e) {
                console.error("WMN POS PWA registration error", e);
            }
        }        
        
        
        registerWMNPOSServiceWorker();

function wmn_install_pos_pwa_app_css() {
    if (window.__wmn_pos_pwa_app_css_installed) return;
    window.__wmn_pos_pwa_app_css_installed = true;

    const style = document.createElement("style");
    style.id = "wmn-pos-pwa-app-css";

    style.textContent = `
    @media (display-mode: standalone) {
            body > div.main-section > div.sticky-top {
                display: none !important;
            }
            body > div.global-workspace-header {
                display: none !important;
            }
            .page-head {
                display: none !important;
            }

            #page-point-of-sale .page-body,
            #page-point-of-sale .layout-main-section,
            #page-point-of-sale .point-of-sale-app {
                padding-top: 0 !important;
                margin-top: 0 !important;
            }
        }
    `;

    document.head.appendChild(style);

    const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    if (isStandalone) {
        document.body.classList.add("wmn-pos-pwa-app");
    }
}

wmn_install_pos_pwa_app_css();
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
            const DB_VERSION = 80;
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
                barcode_structures: "barcode_structures",
            };

            let dbPromise = null;
            let preloadRunning = false;
            let preloadLoaded = false;
            let lastPreloadKey = "";
            let autoSyncBeforePreloadRunning = false;
            let autoSyncBeforePreloadDone = false;


            function online() {
                return !wmn_is_pos_offline();
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
                        if (!db.objectStoreNames.contains(STORES.barcode_structures)) {
                            const store = db.createObjectStore(STORES.barcode_structures, { keyPath: "name" });
                            store.createIndex("prefix", "prefix", { unique: false });
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

            async function replaceAll(storeName, rows) {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readwrite");
                    const store = tx.objectStore(storeName);
                    store.clear();
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

            const OFFLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
            const OFFLINE_IMAGE_CONCURRENCY = 4;

            function wmnImageSource(row) {
                row = row || {};
                return row.offline_image || row.image || row.item_image || row.thumbnail || row.website_image || "";
            }

            function wmnBlobToDataURL(blob) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.onerror = () => reject(reader.error || new Error("Unable to read image blob"));
                    reader.readAsDataURL(blob);
                });
            }

            async function wmnFetchImageAsDataURL(source) {
                source = String(source || "").trim();
                if (!source) return "";
                if (/^data:image\//i.test(source)) return source;
                if (/^blob:/i.test(source)) return "";

                const url = new URL(source, window.location.origin).href;
                const response = await fetch(url, {
                    method: "GET",
                    credentials: "include",
                    cache: "reload",
                });

                if (!response.ok) {
                    throw new Error(`Image request failed (${response.status}): ${url}`);
                }

                const blob = await response.blob();
                if (!blob || !blob.size) return "";
                if (blob.size > OFFLINE_IMAGE_MAX_BYTES) {
                    throw new Error(`Image is larger than ${OFFLINE_IMAGE_MAX_BYTES} bytes: ${url}`);
                }
                if (blob.type && !String(blob.type).toLowerCase().startsWith("image/")) {
                    throw new Error(`Response is not an image: ${url}`);
                }

                return await wmnBlobToDataURL(blob);
            }

            async function wmnCacheOfflineItemImages(items) {
                const rows = Array.isArray(items) ? items : [];
                let cursor = 0;
                let cached = 0;
                let failed = 0;
                let skipped = 0;

                async function worker() {
                    while (true) {
                        const index = cursor++;
                        if (index >= rows.length) return;

                        const row = rows[index];
                        const source = wmnImageSource(row);
                        if (!row || !source) {
                            skipped += 1;
                            continue;
                        }

                        row.image_original = row.image_original || source;

                        if (/^data:image\//i.test(source)) {
                            row.offline_image = source;
                            row.image = source;
                            row.item_image = source;
                            cached += 1;
                            continue;
                        }

                        try {
                            const dataURL = await wmnFetchImageAsDataURL(source);
                            if (!dataURL) {
                                failed += 1;
                                continue;
                            }

                            row.offline_image = dataURL;
                            row.image = dataURL;
                            row.item_image = dataURL;
                            cached += 1;
                        } catch (error) {
                            failed += 1;
                            // Keep the original URL as a fallback. A single broken image must
                            // never stop the POS master-data preload.
                            console.warn("WMN POS offline image cache skipped", row.item_code || row.name || source, error);
                        }
                    }
                }

                const workers = Array.from(
                    { length: Math.min(OFFLINE_IMAGE_CONCURRENCY, Math.max(rows.length, 1)) },
                    () => worker()
                );
                await Promise.all(workers);

                return { cached, failed, skipped, total: rows.length };
            }

            function normalizeItem(row) {
                row = row || {};

                let offlineItemTaxMap = row.offline_item_tax_map
                    || row.item_tax_rate
                    || row.item_tax_map
                    || row.__wmn_item_tax_map
                    || {};

                try {
                    if (typeof offlineItemTaxMap === "string") {
                        offlineItemTaxMap = JSON.parse(offlineItemTaxMap || "{}");
                    }
                } catch (e) {
                    offlineItemTaxMap = {};
                }

                if (!offlineItemTaxMap || typeof offlineItemTaxMap !== "object") {
                    offlineItemTaxMap = {};
                }

                const imageSource = wmnImageSource(row);

                return Object.assign({}, row, {
                    item_code: row.item_code || row.name,
                    item_name: row.item_name || row.item_code || row.name,
                    item_group: row.item_group || "",
                    stock_uom: row.stock_uom || row.uom || "",
                    uom: row.uom || row.stock_uom || "",
                    description: row.description || "",
                    image: imageSource,
                    item_image: imageSource,
                    offline_image: row.offline_image || "",
                    image_original: row.image_original || row.image || row.item_image || row.thumbnail || row.website_image || "",
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
                    offline_item_tax_map: offlineItemTaxMap,
                    item_tax_rate: row.item_tax_rate || row.item_tax_map || row.__wmn_item_tax_map || offlineItemTaxMap,
                    brand: row.brand || "",
                    disabled: cint(row.disabled || 0),
                });
            }

            function normalizePrice(row) {
                row = row || {};
                const itemCode = row.item_code || row.name;
                const priceList = row.price_list || "";
                const uom = row.uom || "";
                const batchNo = row.batch_no || "";
                const validFrom = row.valid_from || "";
                const validUpto = row.valid_upto || "";
                const sourceName = row.name || "";
                const modified = row.modified || "";
                return {
                    key: [
                        priceList,
                        itemCode,
                        uom,
                        batchNo,
                        validFrom,
                        validUpto,
                        sourceName || modified || String(row.price_list_rate || row.rate || 0),
                    ].join("::"),
                    name: sourceName,
                    item_code: itemCode,
                    price_list: priceList,
                    price_list_rate: flt(row.price_list_rate || row.rate || 0),
                    currency: row.currency || "",
                    uom: uom,
                    batch_no: batchNo,
                    selling: row.selling === undefined ? 1 : cint(row.selling || 0),
                    valid_from: validFrom,
                    valid_upto: validUpto,
                    modified: modified,
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
                    price_list_rate: flt(row.price_list_rate || row.rate || 0),
                    rate: flt(row.rate || row.price_list_rate || 0),
                    currency: row.currency || "",
                    uom: row.uom || "",
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


            function wmnOfflineTruthSetting(value) {
                if (value === true || value === 1) return true;
                const s = String(value == null ? "" : value).trim().toLowerCase();
                return ["1", "true", "yes", "y", "on", "enabled", "enable"].includes(s);
            }

            function wmnOfflineHasOwnSetting(source, fieldname) {
                return !!(source && Object.prototype.hasOwnProperty.call(source, fieldname));
            }

            async function autoSyncOfflineInvoicesEnabled(ctrl) {
                const fieldname = "auto_sync_offline_invoices";
                const sources = [
                    ctrl && ctrl.settings,
                    ctrl && ctrl.frm && ctrl.frm.doc,
                    window.cur_pos && window.cur_pos.settings,
                    window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc,
                ];

                for (const source of sources) {
                    if (wmnOfflineHasOwnSetting(source, fieldname)) {
                        return cint(source[fieldname] || 0) === 1 || wmnOfflineTruthSetting(source[fieldname]);
                    }
                }

                try {
                    const settings = await getSetting("full_settings") || {};
                    if (wmnOfflineHasOwnSetting(settings, fieldname)) {
                        return cint(settings[fieldname] || 0) === 1 || wmnOfflineTruthSetting(settings[fieldname]);
                    }
                } catch (e) {}

                try {
                    const profiles = await getAll(STORES.pos_profile);
                    const args = getPOSArgs(ctrl);
                    const profile = (profiles || []).find(p =>
                        p && (p.name === args.pos_profile || p.pos_profile === args.pos_profile)
                    ) || (profiles || [])[0] || {};

                    if (wmnOfflineHasOwnSetting(profile, fieldname)) {
                        return cint(profile[fieldname] || 0) === 1 || wmnOfflineTruthSetting(profile[fieldname]);
                    }
                } catch (e) {}

                return false;
            }

            async function autoSyncOfflineInvoicesBeforePreload(ctrl) {
                try {
                    if (autoSyncBeforePreloadDone || autoSyncBeforePreloadRunning) return false;
                    if (!online()) return false;
                    if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return false;
                    if (navigator.onLine === false) return false;

                    const enabled = await autoSyncOfflineInvoicesEnabled(ctrl);
                    if (!enabled) {
                        autoSyncBeforePreloadDone = true;
                        return false;
                    }

                    autoSyncBeforePreloadRunning = true;
                    autoSyncBeforePreloadDone = true;

                    const pending = await getPendingInvoices();
                    if (!pending || !pending.length) return false;

                    await syncInvoices();
                    return true;
                } catch (e) {
                    console.warn("WMN auto sync before offline data preload skipped", e);
                    return false;
                } finally {
                    autoSyncBeforePreloadRunning = false;
                }
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

                // \u0644\u0627 \u062A\u0639\u0631\u0636 \u062E\u0637\u0623 \u0625\u0630\u0627 \u0643\u0627\u0646\u062A \u0635\u0641\u062D\u0629 POS \u0644\u0645 \u062A\u062C\u0647\u0632 POS Profile \u0628\u0639\u062F.
                // \u0647\u0630\u0627 \u0643\u0627\u0646 \u0633\u0628\u0628 \u0638\u0647\u0648\u0631 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062E\u0637\u0623 \u062B\u0645 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0646\u062C\u0627\u062D \u0645\u0628\u0627\u0634\u0631\u0629.
                if (!args.pos_profile) {
                    return false;
                }

                const preloadKey = `${args.pos_profile || ""}::${args.price_list || ""}::${args.warehouse || ""}`;
                if (!force && preloadLoaded && preloadKey && preloadKey === lastPreloadKey) return false;

                preloadRunning = true;
                try {
                    await autoSyncOfflineInvoicesBeforePreload(ctrl);
                    const data = await fetchMasterData(ctrl);
                    const barcodeStructures = (data.barcode_structures || [])
                        .filter(d => d && d.name && d.prefix);

                    const items = (data.items || []).map(normalizeItem).filter(d => d.item_code);
                    const imageCacheStats = await wmnCacheOfflineItemImages(items);
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
                    const stockSettings = Object.assign(
                        {},
                        data.stock_settings || {},
                        data.stock_settings_doc || {},
                        {
                            key: "stock_settings",
                            doctype: "Stock Settings",
                            name: "Stock Settings",
                            allow_negative_stock: cint(
                                data.stock_settings?.allow_negative_stock ??
                                data.stock_settings_doc?.allow_negative_stock ??
                                data.allow_negative_stock ??
                                frappe.boot?.sysdefaults?.allow_negative_stock ??
                                0
                            ),
                        }
                    );

                    window.__wmn_stock_settings = stockSettings;
                    window.__wmn_pos_stock_settings = stockSettings;
                    let wmnPrintFormat = data.wmn_print_format || data.wmn_print_format_doc || data.wmn_print_format_data || {};
                    const wmnPrintFormatName =
                        (wmnPrintFormat && wmnPrintFormat.name) ||
                        posProfile.print_format ||
                        liveSettings.print_format ||
                        liveSettings.wmn_print_format ||
                        "";

                    if ((!wmnPrintFormat || !wmnPrintFormat.name) && wmnPrintFormatName) {
                        try {
                            const pfRes = await frappe.call({
                                method: "frappe.client.get",
                                args: {
                                    doctype: "WMN Print Format",
                                    name: wmnPrintFormatName
                                },
                                freeze: false,
                            });
                            wmnPrintFormat = pfRes && pfRes.message ? pfRes.message : {};
                        } catch (e) {
                            wmnPrintFormat = {};
                        }
                    }

                    let printFormatDoc = data.print_format_doc || data.print_format || data.erpnext_print_format || {};
                    const printFormatName =
                        (printFormatDoc && printFormatDoc.name) ||
                        (wmnPrintFormat && (wmnPrintFormat.wmn_print_format || wmnPrintFormat.print_format || wmnPrintFormat.print_format_name)) ||
                        wmnPrintFormatName ||
                        posProfile.print_format ||
                        liveSettings.print_format ||
                        "";

                    if ((!printFormatDoc || !printFormatDoc.name) && printFormatName) {
                        try {
                            const pfDocRes = await frappe.call({
                                method: "frappe.client.get",
                                args: {
                                    doctype: "Print Format",
                                    name: printFormatName
                                },
                                freeze: false,
                            });
                            printFormatDoc = pfDocRes && pfDocRes.message ? pfDocRes.message : {};
                        } catch (e) {
                            printFormatDoc = {};
                        }
                    }

                    if (printFormatDoc && printFormatDoc.name) {
                        wmnPrintFormat.print_format_doc = printFormatDoc;
                        wmnPrintFormat.print_format_name = wmnPrintFormat.print_format_name || printFormatDoc.name;
                        wmnPrintFormat.print_format_html =
                            printFormatDoc.html ||
                            printFormatDoc.custom_html ||
                            printFormatDoc.print_format ||
                            printFormatDoc.format_data ||
                            wmnPrintFormat.print_format_html ||
                            "";
                    }

                    if (wmnPrintFormat && wmnPrintFormat.name) {
                        posProfile.wmn_print_format = wmnPrintFormat;
                        posProfile.default_print_type = posProfile.default_print_type || wmnPrintFormat.default_print_type || wmnPrintFormat.print_type || "";
                    }
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
                    await bulkPut(STORES.barcode_structures, barcodeStructures);
                    await replaceAll(STORES.item_prices, prices);
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

                    const settingsRows = [
                        { key: "last_master_sync", value: data.server_time || frappe.datetime.now_datetime() },
                        { key: "pos_profile", value: posProfile.pos_profile || posProfile.name || args.pos_profile || "" },
                        { key: "price_list", value: posProfile.selling_price_list || args.price_list || data.price_list || "" },
                        { key: "warehouse", value: posProfile.warehouse || args.warehouse || data.warehouse || "" },
                        { key: "offline_image_cache_stats", value: imageCacheStats },
                        
                        { key: "full_settings", value: posProfile },
                        { key: "stock_settings", value: stockSettings },
                        { key: "Stock Settings", value: stockSettings },
                        { key: "allow_negative_stock", value: stockSettings.allow_negative_stock },
                    ];

                    if (wmnPrintFormat && wmnPrintFormat.name) {
                        settingsRows.push({ key: "wmn_print_format", value: wmnPrintFormat });
                        settingsRows.push({ key: "wmn_print_format::" + wmnPrintFormat.name, value: wmnPrintFormat });
                    }

                    if (printFormatDoc && printFormatDoc.name) {
                        settingsRows.push({ key: "print_format_doc", value: printFormatDoc });
                        settingsRows.push({ key: "print_format_doc::" + printFormatDoc.name, value: printFormatDoc });
                    }

                    await bulkPut(STORES.settings, settingsRows);

                    lastPreloadKey = preloadKey;
                    preloadLoaded = true;

                    if (!window.__wmn_pos_offline_success_alert_shown || force) {
                        window.__wmn_pos_offline_success_alert_shown = true;
                        frappe.show_alert({
                            message: __(`\u062A\u0645 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064A\u0639 \u0644\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646: ${items.length} \u0635\u0646\u0641\u060C ${customers.length} \u0639\u0645\u064A\u0644`),
                            indicator: "green",
                        });
                    }
                    return true;
                } catch (e) {
                    console.warn("WMN POS offline preload failed", e);

                    // \u0644\u0627 \u062A\u0638\u0647\u0631 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u062E\u0637\u0623 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \u0646\u062C\u062D \u0633\u0627\u0628\u0642\u0627\u064B \u0623\u0648 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u062E\u0637\u0623 \u0645\u0624\u0642\u062A\u0627\u064B \u0623\u062B\u0646\u0627\u0621 \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u0635\u0641\u062D\u0629.
                    if (!preloadLoaded && !window.__wmn_pos_offline_success_alert_shown) {
                        frappe.show_alert({
                            message: __("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646. \u062A\u0623\u0643\u062F \u0645\u0646 \u0648\u062C\u0648\u062F API: wmn.api.get_pos_offline_data"),
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

            function getPriceForItem(prices, itemCode, priceList, uom, batchNo = "") {
                const today = frappe.datetime.get_today();
                const selectedBatch = String(batchNo || "").trim();
                const selectedUom = String(uom || "").trim();
                const dateValue = value => String(value || "").slice(0, 10);

                const candidates = (prices || []).filter(p => {
                    if (p.item_code !== itemCode) return false;
                    if (priceList && p.price_list !== priceList) return false;
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
                    const canResolveAfterBatch = cint(row.has_batch_no || 0) === 1;
                    if (!price && !hasRateOnItem && !canResolveAfterBatch) return false;
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
                // \u0644\u0627 \u062A\u062E\u062A\u0627\u0631 Batch \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0647\u0646\u0627\u060C \u062D\u062A\u0649 \u064A\u0638\u0647\u0631 Dialog \u0627\u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0639\u0646\u062F \u0627\u0644\u0636\u063A\u0637 \u0639\u0644\u0649 \u0627\u0644\u0635\u0646\u0641.
                // foundBatch \u064A\u0628\u0642\u0649 \u0641\u0642\u0637 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0628\u062D\u062B \u0646\u0641\u0633\u0647 Batch No / Batch Barcode.
                foundBatch = foundBatch || null;

                // Serial \u064A\u0645\u0643\u0646 \u0627\u062E\u062A\u064A\u0627\u0631\u0647 \u0625\u0630\u0627 \u0643\u0627\u0646 \u0627\u0644\u0628\u062D\u062B Serial No\u060C \u0623\u0645\u0627 \u063A\u064A\u0631 \u0630\u0644\u0643 \u064A\u0641\u062A\u062D \u0645\u0646\u0637\u0642 \u0627\u0644\u062A\u062D\u0642\u0642 \u0644\u0627\u062D\u0642\u0627\u064B.
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
                if (typeof wmn_assign_receipt_number === "function") {
                    await wmn_assign_receipt_number(doc);
                }
                doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
                doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || "";
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
                if (typeof window.wmn_notify_offline_queue_changed === "function") {
                    window.wmn_notify_offline_queue_changed();
                }
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
                if (typeof window.wmn_notify_offline_queue_changed === "function") {
                    window.wmn_notify_offline_queue_changed();
                }
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
                        if (cint(result.docstatus || 0) !== 1) {
                            throw new Error("Server invoice was not submitted");
                        }
                        row.status = "synced";
                        row.synced_at = new Date().toISOString();
                        row.erpnext_name = result.name || result.erpnext_name || "";
                        row.last_error = "";
                        await updateQueueRow(row);
                        frappe.show_alert({
                            message: __("\u062A\u0645\u062A \u0645\u0632\u0627\u0645\u0646\u0629 \u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [row.erpnext_name || row.offline_id]),
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
            // v6: \u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u062A\u0644\u0642\u0627\u0626\u064A\u0629 \u0627\u0644\u062F\u0648\u0631\u064A\u0629. \u0627\u0633\u062A\u062E\u062F\u0645 Dialog Offline Invoices.

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
                cacheOfflineItemImages: wmnCacheOfflineItemImages,
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
