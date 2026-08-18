
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
                         scope: "/desk/point-of-sale",
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
            const DB_VERSION = 85;
            const STORES = {
                items: "items",
                customers: "customers",
                item_prices: "item_prices",
                stock: "stock",
                batches: "batches",
                item_barcodes: "item_barcodes",
                serials: "serials",
                payment_methods: "payment_methods",
                coupons: "coupons",
                promotions: "promotions",
                settings: "settings",
                pos_profile: "pos_profile",
                pos_settings: "pos_settings",
                pos_opening_entry: "pos_opening_entry",
                item_groups: "item_groups",
                doctype_meta: "doctype_meta",
                invoice_queue: "invoice_queue",
                payment_entry_queue: "payment_entry_queue",
                cash_movement_queue: "cash_movement_queue",
                sync_log: "sync_log",
                barcode_structures: "barcode_structures",
                doctype_documents: "doctype_documents",
            };

            let dbPromise = null;
            let preloadRunning = false;
            let preloadLoaded = false;
            let lastPreloadKey = "";
            let autoSyncBeforePreloadRunning = false;
            let autoSyncBeforePreloadDone = false;
            let supervisorBundleMemory = null;
            let invoiceSyncRunPromise = null;
            const invoiceSyncFlights = new Map();
            let paymentSyncRunPromise = null;
            const paymentSyncFlights = new Map();
            const masterReadCache = new Map();
            const rowsByItemIndexCache = new WeakMap();
            const CACHEABLE_MASTER_STORES = new Set([
                STORES.items,
                STORES.item_prices,
                STORES.stock,
                STORES.batches,
                STORES.item_barcodes,
                STORES.serials,
                STORES.customers,
                STORES.item_groups,
                STORES.pos_profile,
                STORES.payment_methods,
                STORES.pos_settings,
                STORES.barcode_structures,
                STORES.coupons,
                STORES.promotions,
            ]);

            function invalidateMasterReadCache(storeName) {
                if (storeName) masterReadCache.delete(storeName);
            }

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

                        if (!db.objectStoreNames.contains(STORES.coupons)) {
                            const store = db.createObjectStore(STORES.coupons, { keyPath: "coupon_code" });
                            store.createIndex("company", "company", { unique: false });
                            store.createIndex("customer", "customer", { unique: false });
                            store.createIndex("valid_upto", "valid_upto", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.promotions)) {
                            const store = db.createObjectStore(STORES.promotions, { keyPath: "promotion_code" });
                            store.createIndex("company", "company", { unique: false });
                            store.createIndex("pos_profile", "pos_profile", { unique: false });
                            store.createIndex("apply_scope", "apply_scope", { unique: false });
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

                        if (!db.objectStoreNames.contains(STORES.payment_entry_queue)) {
                            const store = db.createObjectStore(STORES.payment_entry_queue, { keyPath: "offline_payment_id" });
                            store.createIndex("status", "status", { unique: false });
                            store.createIndex("invoice_offline_id", "invoice_offline_id", { unique: false });
                            store.createIndex("invoice_name", "invoice_name", { unique: false });
                            store.createIndex("created_at", "created_at", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.cash_movement_queue)) {
                            const store = db.createObjectStore(STORES.cash_movement_queue, { keyPath: "offline_id" });
                            store.createIndex("status", "status", { unique: false });
                            store.createIndex("created_at", "created_at", { unique: false });
                            store.createIndex("pos_opening_entry", "pos_opening_entry", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.sync_log)) {
                            db.createObjectStore(STORES.sync_log, { keyPath: "key" });
                        }
                        if (!db.objectStoreNames.contains(STORES.barcode_structures)) {
                            const store = db.createObjectStore(STORES.barcode_structures, { keyPath: "name" });
                            store.createIndex("prefix", "prefix", { unique: false });
                        }

                        if (!db.objectStoreNames.contains(STORES.doctype_documents)) {
                            const store = db.createObjectStore(STORES.doctype_documents, { keyPath: "key" });
                            store.createIndex("doctype", "doctype", { unique: false });
                            store.createIndex("sync_status", "sync_status", { unique: false });
                            store.createIndex("local_updated_at", "local_updated_at", { unique: false });
                        }
                    };

                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => reject(req.error);
                });
                return dbPromise;
            }

            async function bulkPut(storeName, rows) {
                invalidateMasterReadCache(storeName);
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
                invalidateMasterReadCache(storeName);
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

            async function getAllCached(storeName) {
                if (!CACHEABLE_MASTER_STORES.has(storeName)) return getAll(storeName);
                if (masterReadCache.has(storeName)) return masterReadCache.get(storeName);
                const rows = await getAll(storeName);
                masterReadCache.set(storeName, rows || []);
                return rows || [];
            }

            async function getAllByIndex(storeName, indexName, value) {
                if (value === undefined || value === null || value === "") return [];
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readonly");
                    const store = tx.objectStore(storeName);
                    if (!store.indexNames.contains(indexName)) {
                        resolve([]);
                        return;
                    }
                    const req = store.index(indexName).getAll(value);
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }

            async function getFirstByIndex(storeName, indexName, value) {
                if (value === undefined || value === null || value === "") return null;
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(storeName, "readonly");
                    const store = tx.objectStore(storeName);
                    if (!store.indexNames.contains(indexName)) {
                        resolve(null);
                        return;
                    }
                    const req = store.index(indexName).get(value);
                    req.onsuccess = () => resolve(req.result || null);
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

            function offlineDoctypeKey(doctype, name) {
                return `${String(doctype || "").trim()}::${String(name || "").trim()}`;
            }

            function offlineDoctypeLocalName(doctype) {
                const slug = String(doctype || "document")
                    .trim()
                    .toUpperCase()
                    .replace(/[^A-Z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "") || "DOCUMENT";
                return `WMN-OFF-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            }

            function isOfflineDoctypeLocalName(name) {
                return /^WMN-OFF-[A-Z0-9-]+-\d+-[A-Z0-9]+$/i.test(String(name || "").trim());
            }

            function resolveOfflineDoctypeOperation(record, isNew = false) {
                if (isNew) return "create";
                if (!record) return "update";
                if (record.operation === "create" || record.sync_status === "pending_create") return "create";
                if (isOfflineDoctypeLocalName(record.name) && !record.base_modified) return "create";
                return "update";
            }

            async function listOfflineDoctypeRecords(doctype) {
                return getAllByIndex(STORES.doctype_documents, "doctype", String(doctype || "").trim());
            }

            async function getOfflineDoctypeRecord(doctype, name) {
                return get(STORES.doctype_documents, offlineDoctypeKey(doctype, name));
            }

            async function putOfflineDoctypeRecord(record) {
                if (!record || !record.doctype || !record.name) return false;
                const row = Object.assign({}, record, {
                    key: offlineDoctypeKey(record.doctype, record.name),
                });
                return bulkPut(STORES.doctype_documents, [row]);
            }

            async function deleteOfflineDoctypeRecord(doctype, name) {
                const db = await openDB();
                const key = offlineDoctypeKey(doctype, name);
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORES.doctype_documents, "readwrite");
                    tx.objectStore(STORES.doctype_documents).delete(key);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                });
            }

            async function replaceOfflineDoctypeSnapshot(doctype, documents) {
                doctype = String(doctype || "").trim();
                if (!doctype) return false;
                const existing = await listOfflineDoctypeRecords(doctype);
                const protectedKeys = new Set(
                    (existing || [])
                        .filter((row) => row && row.sync_status && row.sync_status !== "clean")
                        .map((row) => row.key)
                );
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORES.doctype_documents, "readwrite");
                    const store = tx.objectStore(STORES.doctype_documents);
                    for (const row of existing || []) {
                        if (!row || protectedKeys.has(row.key)) continue;
                        store.delete(row.key);
                    }
                    for (const doc of documents || []) {
                        if (!doc || !doc.name) continue;
                        const key = offlineDoctypeKey(doctype, doc.name);
                        if (protectedKeys.has(key)) continue;
                        store.put({
                            key,
                            doctype,
                            name: doc.name,
                            modified: doc.modified || "",
                            base_modified: doc.modified || "",
                            sync_status: "clean",
                            operation: "",
                            values: clone(doc),
                            local_created_at: "",
                            local_updated_at: new Date().toISOString(),
                            last_error: "",
                            server_document: null,
                        });
                    }
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => reject(tx.error);
                });
            }

            async function saveOfflineDoctypeRecord({ doctype, name, values, is_new }) {
                doctype = String(doctype || "").trim();
                if (!doctype) throw new Error("DocType is required");
                const now = new Date().toISOString();
                const documentName = String(name || "").trim() || offlineDoctypeLocalName(doctype);
                const existing = await getOfflineDoctypeRecord(doctype, documentName);
                const operation = resolveOfflineDoctypeOperation(
                    existing || { name: documentName, base_modified: "" },
                    Boolean(is_new)
                );
                const mergedValues = Object.assign({}, existing?.values || {}, values || {}, { name: documentName });
                const row = {
                    key: offlineDoctypeKey(doctype, documentName),
                    doctype,
                    name: documentName,
                    modified: existing?.modified || mergedValues.modified || "",
                    base_modified: existing?.base_modified || existing?.modified || mergedValues.modified || "",
                    sync_status: operation === "create" ? "pending_create" : "pending_update",
                    operation,
                    values: mergedValues,
                    local_created_at: existing?.local_created_at || now,
                    local_updated_at: now,
                    last_error: "",
                    server_document: null,
                };
                await putOfflineDoctypeRecord(row);
                return row;
            }

            async function getPendingOfflineDoctypeRecords() {
                const rows = await getAll(STORES.doctype_documents);
                return (rows || []).filter((row) => row && row.sync_status && row.sync_status !== "clean");
            }

            async function remapOfflineDoctypeLinkReference(targetDoctype, oldName, newName, models) {
                targetDoctype = String(targetDoctype || "").trim();
                oldName = String(oldName || "").trim();
                newName = String(newName || "").trim();
                if (!targetDoctype || !oldName || !newName || oldName === newName) return 0;

                const modelMap = new Map((models || []).map((model) => [model.doctype, model]));
                const pending = await getPendingOfflineDoctypeRecords();
                let changed = 0;
                for (const record of pending) {
                    const model = modelMap.get(record.doctype);
                    if (!model) continue;
                    const values = Object.assign({}, record.values || {});
                    let rowChanged = false;
                    for (const field of model.fields || []) {
                        if (field.fieldtype !== "Link" || String(field.options || "").trim() !== targetDoctype) continue;
                        if (String(values[field.fieldname] || "") !== oldName) continue;
                        values[field.fieldname] = newName;
                        rowChanged = true;
                    }
                    if (!rowChanged) continue;
                    record.values = values;
                    record.local_updated_at = new Date().toISOString();
                    await putOfflineDoctypeRecord(record);
                    changed += 1;
                }
                return changed;
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
                    max_discount: flt(row.max_discount || 0),
                    allow_negative_stock: cint(row.allow_negative_stock || 0),
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
                    conversion_factor: flt(row.conversion_factor || 1),
                    price_source: row.price_source || "",
                };
            }

            function normalizeStock(row) {
                row = row || {};
                const actualQty = flt(row.actual_qty || 0);
                const reservedQty = flt(row.pos_reserved_qty || 0);
                return {
                    key: `${row.item_code}::${row.warehouse}`,
                    item_code: row.item_code,
                    warehouse: row.warehouse,
                    actual_qty: actualQty,
                    pos_reserved_qty: reservedQty,
                    available_qty: row.available_qty === undefined
                        ? actualQty - reservedQty
                        : flt(row.available_qty || 0),
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
                    uom_options: Array.isArray(row.uom_options)
                        ? row.uom_options.map(option => Object.assign({}, option))
                        : [],
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
                    creation: row.creation || "",
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

            function normalizeCoupon(row) {
                row = row || {};
                const code = String(row.coupon_code || row.name || "").trim().toUpperCase();
                return Object.assign({}, row, {
                    coupon_code: code,
                    coupon_name: row.coupon_name || code,
                    coupon_type: row.coupon_type || "Promotional",
                    company: row.company || "",
                    customer: row.customer || "",
                    campaign: row.campaign || "",
                    discount_type: row.discount_type || "Percentage",
                    discount_percentage: flt(row.discount_percentage || 0),
                    discount_amount: flt(row.discount_amount || 0),
                    apply_on: row.apply_on || "Grand Total",
                    minimum_cart_amount: flt(row.minimum_cart_amount || 0),
                    maximum_discount_amount: flt(row.maximum_discount_amount || 0),
                    maximum_use: cint(row.maximum_use || 0),
                    used: cint(row.used || 0),
                    one_use_per_customer: cint(row.one_use_per_customer || 0),
                    used_customers: Array.isArray(row.used_customers) ? row.used_customers.slice() : [],
                    disabled: cint(row.disabled || 0),
                    valid_from: row.valid_from || "",
                    valid_upto: row.valid_upto || "",
                });
            }

            function normalizePromotion(row) {
                row = row || {};
                const code = String(row.promotion_code || row.name || "").trim().toUpperCase();
                return Object.assign({}, row, {
                    promotion_code: code,
                    promotion_name: row.promotion_name || code,
                    disabled: cint(row.disabled || 0),
                    auto_apply: cint(row.auto_apply === undefined ? 1 : row.auto_apply),
                    priority: cint(row.priority || 0),
                    stackable: cint(row.stackable === undefined ? 1 : row.stackable),
                    company: row.company || "",
                    pos_profile: row.pos_profile || "",
                    warehouse: row.warehouse || "",
                    customer: row.customer || "",
                    customer_group: row.customer_group || "",
                    required_coupon: row.required_coupon || "",
                    apply_scope: row.apply_scope || "Transaction",
                    item_code: row.item_code || "",
                    item_group: row.item_group || "",
                    brand: row.brand || "",
                    minimum_cart_amount: flt(row.minimum_cart_amount || 0),
                    minimum_qty: flt(row.minimum_qty || 0),
                    promotion_type: row.promotion_type || "Percentage Discount",
                    discount_percentage: flt(row.discount_percentage || 0),
                    discount_amount: flt(row.discount_amount || 0),
                    maximum_discount_amount: flt(row.maximum_discount_amount || 0),
                    buy_qty: flt(row.buy_qty || 0),
                    free_qty: flt(row.free_qty || 0),
                    free_item: row.free_item || "",
                    repeat_benefit: cint(row.repeat_benefit === undefined ? 1 : row.repeat_benefit),
                    max_applications: cint(row.max_applications || 0),
                    valid_from: row.valid_from || "",
                    valid_upto: row.valid_upto || "",
                    start_time: row.start_time || "",
                    end_time: row.end_time || "",
                    monday: cint(row.monday || 0),
                    tuesday: cint(row.tuesday || 0),
                    wednesday: cint(row.wednesday || 0),
                    thursday: cint(row.thursday || 0),
                    friday: cint(row.friday || 0),
                    saturday: cint(row.saturday || 0),
                    sunday: cint(row.sunday || 0),
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
                    const profiles = await getAllCached(STORES.pos_profile);
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

                    const syncableInvoices = await getSyncableInvoices();
                    const pendingMovements = await getPendingCashMovements();
                    if ((!syncableInvoices || !syncableInvoices.length) && (!pendingMovements || !pendingMovements.length)) return false;

                    if (syncableInvoices && syncableInvoices.length) await syncInvoices();
                    if (pendingMovements && pendingMovements.length) await syncCashMovements();
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

                // Do not show an error while the POS Profile is still being initialized.
                // Starting preload too early previously caused an error alert followed by a success alert.
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
                    const coupons = (data.pos_coupons || data.coupons || []).map(normalizeCoupon).filter(d => d.coupon_code);
                    const promotions = (data.pos_promotions || data.promotions || []).map(normalizePromotion).filter(d => d.promotion_code);
                    const supervisorBundle = clone(data.pos_supervisor_bundle || {});
                    supervisorBundleMemory = supervisorBundle;
                    window.__wmn_pos_supervisor_bundle = supervisorBundle;
                    const cashMovementContext = clone(data.cash_movement_context || {});
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
                    await replaceAll(STORES.coupons, coupons);
                    await replaceAll(STORES.promotions, promotions);
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
                        { key: "pos_supervisor_bundle", value: supervisorBundle },
                        { key: "cash_movement_context", value: cashMovementContext },
                        { key: "cash_movement_summary", value: clone(cashMovementContext.summary || {}) },
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

                    // Suppress preload errors when data was already loaded or the failure is temporary during page initialization.
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
                const rows = await getAllCached(STORES.pos_profile);
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

                const all = await getAllCached(STORES.item_groups);
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

            function getRowsByItemMap(rows) {
                if (!Array.isArray(rows)) return new Map();
                const cached = rowsByItemIndexCache.get(rows);
                if (cached) return cached;

                const map = new Map();
                rows.forEach((row) => {
                    const itemCode = String(row?.item_code || "").trim();
                    if (!itemCode) return;
                    if (!map.has(itemCode)) map.set(itemCode, []);
                    map.get(itemCode).push(row);
                });
                rowsByItemIndexCache.set(rows, map);
                return map;
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

                const raw = String(searchValue || "").trim();
                if (raw) {
                    const byNumber = await getFirstByIndex(STORES.batches, "batch_no", raw);
                    if (byNumber) return byNumber;
                    const byBarcode = await getFirstByIndex(STORES.batches, "barcode", raw);
                    if (byBarcode) return byBarcode;
                }

                if (itemCode) {
                    const batches = await getAllByIndex(STORES.batches, "item_code", itemCode);
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

            function serialRowMatchesContext(serialRow, itemCode = "", warehouse = "") {
                if (!serialRow) return false;
                if (itemCode && String(serialRow.item_code || "") !== String(itemCode)) return false;
                if (warehouse && String(serialRow.warehouse || "") !== String(warehouse)) return false;
                if (cint(serialRow.disabled || 0)) return false;
                const status = String(serialRow.status || "").toLowerCase();
                if (status && !["active", "available", "in stock"].includes(status)) return false;
                return true;
            }

            function normalizeSerialExclusions(values) {
                const rows = Array.isArray(values)
                    ? values
                    : String(values || "").replace(/,/g, "\n").split("\n");
                return new Set(rows.map((value) => String(value || "").trim()).filter(Boolean));
            }

            function normalizeBatchFilter(value) {
                if (Array.isArray(value)) {
                    return new Set(value.map((row) => String(row || "").trim()).filter(Boolean));
                }
                const raw = String(value || "").trim();
                if (!raw) return new Set();
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        return new Set(parsed.map((row) => String(row || "").trim()).filter(Boolean));
                    }
                } catch (e) {}
                return new Set(raw.replace(/,/g, "\n").split("\n").map((row) => row.trim()).filter(Boolean));
            }

            async function getAvailableSerialsForItem(itemCode, warehouse = "", options = {}) {
                const code = String(itemCode || "").trim();
                if (!code) return [];

                const exclude = normalizeSerialExclusions(options.exclude_serials || options.exclude_sr_nos || []);
                const pendingReservedSerials = await getPendingReservedSerialNos(code, warehouse);
                for (const serialNo of pendingReservedSerials) exclude.add(String(serialNo || ""));
                const batchFilter = normalizeBatchFilter(options.batch_nos || options.batch_no || "");
                const postingDate = String(options.posting_date || "").slice(0, 10);
                const requestedLimit = cint(options.limit || 0);
                let rows = await getAllByIndex(STORES.serials, "item_code", code);

                let batchExpiryMap = null;
                if (postingDate) {
                    const batches = await getAllByIndex(STORES.batches, "item_code", code);
                    batchExpiryMap = new Map();
                    (batches || []).forEach((batch) => {
                        if (!batch?.batch_no) return;
                        if (warehouse && String(batch.warehouse || "") !== String(warehouse)) return;
                        batchExpiryMap.set(String(batch.batch_no), String(batch.expiry_date || "").slice(0, 10));
                    });
                }

                rows = (rows || []).filter((row) => {
                    if (!serialRowMatchesContext(row, code, warehouse)) return false;
                    if (exclude.has(String(row.serial_no || ""))) return false;
                    if (batchFilter.size && !batchFilter.has(String(row.batch_no || ""))) return false;
                    if (postingDate && row.batch_no && batchExpiryMap) {
                        const expiryDate = batchExpiryMap.get(String(row.batch_no || "")) || "";
                        if (expiryDate && expiryDate < postingDate) return false;
                    }
                    return true;
                });

                rows.sort((a, b) => {
                    const creationCompare = String(a.creation || "9999-12-31 23:59:59").localeCompare(
                        String(b.creation || "9999-12-31 23:59:59")
                    );
                    if (creationCompare !== 0) return creationCompare;
                    return String(a.serial_no || "").localeCompare(String(b.serial_no || ""));
                });

                const selected = requestedLimit > 0 ? rows.slice(0, requestedLimit) : rows;
                return selected.slice().sort((a, b) => String(a.serial_no || "").localeCompare(String(b.serial_no || "")));
            }

            async function getSerialsByNumbers(serialNumbers, itemCode = "", warehouse = "") {
                const wanted = normalizeSerialExclusions(serialNumbers);
                if (!wanted.size) return [];

                let rows = [];
                if (itemCode) {
                    rows = await getAllByIndex(STORES.serials, "item_code", itemCode);
                } else {
                    rows = await Promise.all(Array.from(wanted).map((serialNo) => getFirstByIndex(STORES.serials, "serial_no", serialNo)));
                }

                const bySerial = new Map();
                (rows || []).forEach((row) => {
                    if (!row || !wanted.has(String(row.serial_no || ""))) return;
                    if (!serialRowMatchesContext(row, itemCode, warehouse)) return;
                    bySerial.set(String(row.serial_no || ""), row);
                });
                return Array.from(wanted).map((serialNo) => bySerial.get(serialNo)).filter(Boolean);
            }

            async function findSerialOffline(searchValue, itemCode = "", warehouse = "") {
                const raw = String(searchValue || "").trim();
                if (raw) {
                    const bySerial = await getFirstByIndex(STORES.serials, "serial_no", raw);
                    if (serialRowMatchesContext(bySerial, itemCode, warehouse)) return bySerial;
                    const byBarcode = await getFirstByIndex(STORES.serials, "barcode", raw);
                    if (serialRowMatchesContext(byBarcode, itemCode, warehouse)) return byBarcode;
                    return null;
                }

                const rows = await getAvailableSerialsForItem(itemCode, warehouse, { limit: 1 });
                return rows[0] || null;
            }

            async function findItemCodeByAnyBarcode(searchValue) {
                const raw = String(searchValue || "").trim();
                if (!raw || !window.wmnPOSOffline) return null;
                return await getFirstByIndex(STORES.item_barcodes, "barcode", raw);
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

            async function searchItems({ search_term = "", price_list = "", start = 0, page_length = 40, item_group = "" } = {}) {
                const keyword = String(search_term || "").toLowerCase().trim();
                const ctx = await getPOSItemFilterContext({ price_list, item_group });

                const baseReads = await Promise.all([
                    getAllCached(STORES.items),
                    getAllCached(STORES.item_prices),
                    getAllCached(STORES.stock),
                    getPendingInvoices(),
                ]);
                let items = baseReads[0] || [];
                const prices = baseReads[1] || [];
                const stockRows = baseReads[2] || [];
                const pendingReservedMap = buildPendingReservedQtyMap(baseReads[3] || []);
                let batches = [];
                let itemBarcodes = [];
                let serials = [];
                if (keyword) {
                    [batches, itemBarcodes, serials] = await Promise.all([
                        getAllCached(STORES.batches),
                        getAllCached(STORES.item_barcodes),
                        getAllCached(STORES.serials),
                    ]);
                }
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

                const priceRowsByItem = getRowsByItemMap(prices);
                const stockRowsByItem = getRowsByItemMap(stockRows);
                const filtered = [];
                for (const row of items) {
                    const itemPrices = priceRowsByItem.get(String(row.item_code || "")) || [];
                    const itemStockRows = stockRowsByItem.get(String(row.item_code || "")) || [];
                    const price = getPriceForItem(itemPrices, row.item_code, ctx.priceList, row.uom || row.stock_uom);
                    const stockRow = getStockForItem(itemStockRows, row.item_code, ctx.warehouse);
                    const effectiveQty = getEffectiveAvailableQty(stockRow, row.item_code, ctx.warehouse, pendingReservedMap);
                    const effectiveStockRow = stockRow ? Object.assign({}, stockRow, { actual_qty: effectiveQty, available_qty: effectiveQty }) : null;

                    if (!itemPassesPOSProfileFilters(row, ctx, price, effectiveStockRow)) continue;

                    const selectedBatch = matchingBatchByItem[row.item_code] || null;
                    const selectedSerial = matchingSerialByItem[row.item_code] || null;
                    const selectedBarcode = matchingBarcodeByItem[row.item_code];

                    filtered.push(Object.assign({}, row, {
                        price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                        rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                        actual_qty: selectedSerial ? 1 : (selectedBatch ? flt(selectedBatch.actual_qty || 0) : effectiveQty),
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

                // Exact item, barcode, serial and batch lookups above are all indexed.
                // Do not fall back to a full item-store scan in the interactive add-item path.
                if (!row) return null;

                const ctx = await getPOSItemFilterContext({ price_list });
                const [prices, stockRows] = await Promise.all([
                    getAllByIndex(STORES.item_prices, "item_code", row.item_code),
                    getAllByIndex(STORES.stock, "item_code", row.item_code),
                ]);
                const price = getPriceForItem(prices, row.item_code, ctx.priceList, (foundBarcode && foundBarcode.uom) || row.uom || row.stock_uom);
                const stockRow = getStockForItem(stockRows, row.item_code, ctx.warehouse);
                const pendingReservedQty = await getPendingReservedQty(row.item_code, ctx.warehouse);
                const baseAvailableQty = stockRow && stockRow.available_qty !== undefined
                    ? flt(stockRow.available_qty || 0)
                    : flt(stockRow?.actual_qty || 0);
                const effectiveQty = baseAvailableQty - flt(pendingReservedQty || 0);
                const effectiveStockRow = stockRow
                    ? Object.assign({}, stockRow, { actual_qty: effectiveQty, available_qty: effectiveQty })
                    : null;

                // Keep automatic batch selection disabled here so normal item clicks can open the batch selector.
                // foundBatch is retained only when the lookup itself matched a Batch No or Batch barcode.
                foundBatch = foundBatch || null;

                // A serial is selected here only when the lookup itself matched a Serial No or Serial barcode.
                foundSerial = foundSerial || null;

                if (!itemPassesPOSProfileFilters(row, ctx, price, effectiveStockRow)) return null;

                return Object.assign({}, row, {
                    price_list_rate: price ? flt(price.price_list_rate) : flt(row.price_list_rate || row.rate || 0),
                    rate: price ? flt(price.price_list_rate) : flt(row.rate || row.price_list_rate || 0),
                    uom: row.uom || row.stock_uom || (price ? price.uom : "") || "",
                    actual_qty: foundSerial ? 1 : (foundBatch ? flt(foundBatch.actual_qty || 0) : effectiveQty),
                    warehouse: ctx.warehouse || row.warehouse || (foundSerial && foundSerial.warehouse) || (foundBatch && foundBatch.warehouse) || (stockRow && stockRow.warehouse) || "",
                    batch_no: foundSerial && foundSerial.batch_no ? foundSerial.batch_no : (foundBatch ? foundBatch.batch_no : ""),
                    serial_no: foundSerial ? foundSerial.serial_no : (row.serial_no || ""),
                    barcode: foundBarcode ? foundBarcode.barcode : (row.barcode || ""),
                    uom: foundBarcode && foundBarcode.uom ? foundBarcode.uom : (row.uom || row.stock_uom),
                    __wmn_batch_from_scan: foundBatch ? 1 : 0,
                });
            }

            async function getCoupon(couponCode, excludeOfflineId = "") {
                const code = String(couponCode || "").trim().toUpperCase();
                if (!code) return null;

                const coupon = await get(STORES.coupons, code);
                if (!coupon) return null;

                const queueRows = await getPendingInvoices();
                const pendingRows = (queueRows || []).filter(row => {
                    if (!row) return false;
                    if (excludeOfflineId && String(row.offline_id || "") === String(excludeOfflineId)) return false;
                    const invoice = row.invoice || {};
                    return String(invoice.__wmn_coupon_code || "").trim().toUpperCase() === code;
                });

                if (!pendingRows.length) return coupon;

                const usedCustomers = new Set(Array.isArray(coupon.used_customers) ? coupon.used_customers : []);
                for (const row of pendingRows) {
                    const customer = String(row?.invoice?.customer || "").trim();
                    if (customer) usedCustomers.add(customer);
                }

                return Object.assign({}, coupon, {
                    used: cint(coupon.used || 0) + pendingRows.length,
                    used_customers: Array.from(usedCustomers),
                    __wmn_pending_offline_uses: pendingRows.length,
                });
            }

            async function getSupervisorBundle() {
                if (supervisorBundleMemory && typeof supervisorBundleMemory === "object") return supervisorBundleMemory;
                const saved = await getSetting("pos_supervisor_bundle");
                supervisorBundleMemory = saved && typeof saved === "object" ? saved : {};
                window.__wmn_pos_supervisor_bundle = supervisorBundleMemory;
                return supervisorBundleMemory;
            }

            async function getCashMovementContext() {
                const saved = await getSetting("cash_movement_context");
                return saved && typeof saved === "object" ? clone(saved) : {};
            }

            function summarizeCashMovements(base, rows) {
                const summary = Object.assign({
                    cash_in: 0,
                    cash_expense: 0,
                    cash_withdrawal: 0,
                    net_cash_movement: 0,
                    count: 0,
                    by_mode_of_payment: {},
                }, clone(base || {}));
                summary.by_mode_of_payment = clone(summary.by_mode_of_payment || {});

                for (const row of rows || []) {
                    const movement = row?.movement || row || {};
                    const amount = Math.abs(flt(movement.amount || 0));
                    const modeOfPayment = String(movement.mode_of_payment || "Unspecified").trim() || "Unspecified";
                    const modeSummary = Object.assign({
                        mode_of_payment: modeOfPayment,
                        cash_account: String(movement.cash_account || "").trim(),
                        cash_in: 0,
                        cash_expense: 0,
                        cash_withdrawal: 0,
                        net_cash_movement: 0,
                        count: 0,
                    }, clone(summary.by_mode_of_payment[modeOfPayment] || {}));
                    if (!modeSummary.cash_account && movement.cash_account) modeSummary.cash_account = movement.cash_account;

                    if (movement.movement_type === "Cash In") {
                        summary.cash_in = flt(summary.cash_in || 0) + amount;
                        modeSummary.cash_in = flt(modeSummary.cash_in || 0) + amount;
                    }
                    if (movement.movement_type === "Cash Expense") {
                        summary.cash_expense = flt(summary.cash_expense || 0) + amount;
                        modeSummary.cash_expense = flt(modeSummary.cash_expense || 0) + amount;
                    }
                    if (movement.movement_type === "Cash Withdrawal") {
                        summary.cash_withdrawal = flt(summary.cash_withdrawal || 0) + amount;
                        modeSummary.cash_withdrawal = flt(modeSummary.cash_withdrawal || 0) + amount;
                    }
                    summary.count = cint(summary.count || 0) + 1;
                    modeSummary.count = cint(modeSummary.count || 0) + 1;
                    modeSummary.net_cash_movement = flt(modeSummary.cash_in || 0) - flt(modeSummary.cash_expense || 0) - flt(modeSummary.cash_withdrawal || 0);
                    summary.by_mode_of_payment[modeOfPayment] = modeSummary;
                }
                summary.net_cash_movement = flt(summary.cash_in || 0) - flt(summary.cash_expense || 0) - flt(summary.cash_withdrawal || 0);
                return summary;
            }

            async function getCashMovementSummary(posOpeningEntry) {
                const base = await getSetting("cash_movement_summary") || {};
                const pending = await getPendingCashMovements();
                const rows = (pending || []).filter(row =>
                    !posOpeningEntry || String(row.pos_opening_entry || row?.movement?.pos_opening_entry || "") === String(posOpeningEntry)
                );
                return summarizeCashMovements(base, rows);
            }

            async function getCoupons() {
                return await getAllCached(STORES.coupons);
            }

            async function getPromotions() {
                return await getAllCached(STORES.promotions);
            }

            async function markCustomerPOSPurchase(customer, postingDate) {
                const customerName = String(customer || "").trim();
                if (!customerName) return null;

                const row = await get(STORES.customers, customerName);
                if (!row) return null;

                const currentCount = Math.max(0, cint(row.pos_purchase_count || 0));
                row.pos_purchase_count = currentCount + 1;
                row.has_pos_purchase = 1;
                const dateValue = String(postingDate || frappe.datetime.get_today() || "").slice(0, 10);
                if (!row.last_pos_purchase_date || String(row.last_pos_purchase_date) < dateValue) {
                    row.last_pos_purchase_date = dateValue;
                }
                await bulkPut(STORES.customers, [row]);
                return row;
            }

            async function getStock(itemCode, warehouse) {
                if (!itemCode || !warehouse) return null;
                return get(STORES.stock, `${itemCode}::${warehouse}`);
            }

            async function saveCashMovement(movement) {
                const doc = clone(movement || {});
                const offlineId = doc.offline_id || `POS-CASH-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                doc.offline_id = offlineId;
                const row = {
                    offline_id: offlineId,
                    status: "pending",
                    created_at: doc.created_at || new Date().toISOString(),
                    pos_profile: doc.pos_profile || "",
                    pos_opening_entry: doc.pos_opening_entry || "",
                    movement: doc,
                    last_error: "",
                };
                await bulkPut(STORES.cash_movement_queue, [row]);
                if (typeof window.wmn_notify_offline_queue_changed === "function") window.wmn_notify_offline_queue_changed();
                return row;
            }

            async function getPendingCashMovements() {
                const db = await openDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORES.cash_movement_queue, "readonly");
                    const req = tx.objectStore(STORES.cash_movement_queue).index("status").getAll("pending");
                    req.onsuccess = () => resolve(req.result || []);
                    req.onerror = () => reject(req.error);
                });
            }

            async function updateCashMovementQueueRow(row) {
                await bulkPut(STORES.cash_movement_queue, [row]);
                if (typeof window.wmn_notify_offline_queue_changed === "function") window.wmn_notify_offline_queue_changed();
            }

            async function syncCashMovements() {
                if (!online()) return [];
                const pending = await getPendingCashMovements();
                const synced = [];
                for (const row of pending || []) {
                    try {
                        const response = await frappe.call({
                            method: "wmn.api.sync_offline_pos_cash_movement",
                            args: { movement: row.movement },
                            freeze: false,
                        });
                        const result = response?.message || {};
                        if (cint(result.docstatus || 0) !== 1) throw new Error("Server cash movement was not submitted");
                        row.status = "synced";
                        row.synced_at = new Date().toISOString();
                        row.erpnext_name = result.name || "";
                        row.journal_entry = result.journal_entry || "";
                        row.last_error = "";
                        await updateCashMovementQueueRow(row);
                        if (result.summary) await setSetting("cash_movement_summary", clone(result.summary));
                        synced.push(result);
                    } catch (e) {
                        row.status = "pending";
                        row.last_error = e.message || String(e);
                        row.last_try_at = new Date().toISOString();
                        await updateCashMovementQueueRow(row);
                        console.error("WMN POS offline cash movement sync failed", row.offline_id, e);
                    }
                }
                return synced;
            }

            async function saveInvoice(invoice, ctrl) {
                const doc = clone(invoice);
                const invoiceBarcode = window.WMN_POS?.Services?.Barcode?.InvoiceBarcode;
                if (invoiceBarcode?.ensureInvoiceUID) {
                    invoiceBarcode.ensureInvoiceUID(doc);
                }
                if (typeof wmn_assign_receipt_number === "function") {
                    await wmn_assign_receipt_number(doc);
                }
                doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
                doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || "";
                await wmn_clean_doc_batch_serial_for_save(doc);
                const offlineId = doc.wmn_offline_sync_id
                    || doc.custom_offline_id
                    || `POS-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                doc.wmn_offline_sync_id = offlineId;
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

                const existingQueueRow = await get(STORES.invoice_queue, offlineId);
                await bulkPut(STORES.invoice_queue, [row]);

                const defaultCustomer = String(ctrl?.settings?.customer || "").trim();
                const invoiceCustomer = String(doc.customer || "").trim();
                if (
                    !existingQueueRow &&
                    !cint(doc.is_return || 0) &&
                    invoiceCustomer &&
                    invoiceCustomer !== defaultCustomer
                ) {
                    await markCustomerPOSPurchase(invoiceCustomer, doc.posting_date);
                }

                if (typeof window.wmn_notify_offline_queue_changed === "function") {
                    window.wmn_notify_offline_queue_changed();
                }
                return row;
            }

            async function getPendingInvoices() {
                const rows = await getAll(STORES.invoice_queue);
                return (rows || []).filter((row) => {
                    const status = String(row?.status || "pending").toLowerCase();
                    const queueKind = String(row?.queue_kind || "").toLowerCase();
                    const invoice = row?.invoice || row?.doc || row?.data || {};
                    const stage = String(invoice?.wmn_pos_stage || "").trim();
                    if (queueKind === "draft" || stage === "AWAITING_CASHIER") return false;
                    return !row?.erpnext_name
                        && !row?.server_name
                        && !row?.synced
                        && !row?.synced_at
                        && !["synced", "submitted", "success"].includes(status);
                });
            }

            async function getSyncableInvoices() {
                const rows = await getAll(STORES.invoice_queue);
                return (rows || []).filter((row) => {
                    const status = getInvoiceQueueStatus(row);
                    return !["synced", "draft_synced"].includes(status);
                });
            }

            async function getPendingReservedQty(itemCode, warehouse) {
                if (!itemCode || !warehouse) return 0;
                const pending = await getPendingInvoices();
                let reservedQty = 0;
                for (const queueRow of pending || []) {
                    const invoice = queueRow?.invoice || queueRow?.doc || queueRow || {};
                    for (const row of invoice.items || []) {
                        if (String(row.item_code || "") !== String(itemCode)) continue;
                        if (String(row.warehouse || invoice.set_warehouse || "") !== String(warehouse)) continue;
                        const stockQty = row.stock_qty !== undefined
                            ? flt(row.stock_qty || 0)
                            : flt(row.qty || 0) * flt(row.conversion_factor || 1);
                        reservedQty += stockQty;
                    }
                }
                return reservedQty;
            }

            async function getPendingReservedSerialNos(itemCode, warehouse) {
                if (!itemCode || !warehouse) return [];
                const pending = await getPendingInvoices();
                const reserved = [];
                const returned = [];
                for (const queueRow of pending || []) {
                    const invoice = queueRow?.invoice || queueRow?.doc || queueRow || {};
                    const target = cint(invoice.is_return || 0) ? returned : reserved;
                    for (const row of invoice.items || []) {
                        if (String(row.item_code || "") !== String(itemCode)) continue;
                        if (String(row.warehouse || invoice.set_warehouse || "") !== String(warehouse)) continue;
                        String(row.serial_no || "")
                            .split(/[\n,]+/)
                            .map(value => value.trim())
                            .filter(Boolean)
                            .forEach(serialNo => target.push(serialNo));
                    }
                }
                for (const serialNo of returned) {
                    const index = reserved.indexOf(serialNo);
                    if (index !== -1) reserved.splice(index, 1);
                }
                return reserved;
            }

            function buildPendingReservedQtyMap(pendingRows) {
                const map = new Map();
                for (const queueRow of pendingRows || []) {
                    const invoice = queueRow?.invoice || queueRow?.doc || queueRow || {};
                    for (const row of invoice.items || []) {
                        const itemCode = String(row.item_code || "");
                        const warehouse = String(row.warehouse || invoice.set_warehouse || "");
                        if (!itemCode || !warehouse) continue;
                        const stockQty = row.stock_qty !== undefined
                            ? flt(row.stock_qty || 0)
                            : flt(row.qty || 0) * flt(row.conversion_factor || 1);
                        const key = `${itemCode}::${warehouse}`;
                        map.set(key, flt(map.get(key) || 0) + stockQty);
                    }
                }
                return map;
            }

            function getEffectiveAvailableQty(stockRow, itemCode, warehouse, pendingReservedMap) {
                const cached = stockRow && stockRow.available_qty !== undefined
                    ? flt(stockRow.available_qty || 0)
                    : flt(stockRow && stockRow.actual_qty || 0);
                const pending = pendingReservedMap
                    ? flt(pendingReservedMap.get(`${itemCode}::${warehouse}`) || 0)
                    : 0;
                return cached - pending;
            }

            async function updateQueueRow(row) {
                await bulkPut(STORES.invoice_queue, [row]);
                if (typeof window.wmn_notify_offline_queue_changed === "function") {
                    window.wmn_notify_offline_queue_changed();
                }
            }

            function getPaymentQueueStatus(row) {
                const status = String(row?.status || "pending").toLowerCase();
                if (row?.payment_entry || row?.synced_at || ["synced", "submitted", "success"].includes(status)) {
                    return "synced";
                }
                return status || "pending";
            }

            function invoiceQueueMatchesIdentity(row, identity) {
                const target = String(identity || "").trim();
                if (!target || !row) return false;
                const invoice = row.invoice || row.doc || row.data || row || {};
                return [
                    row.offline_id,
                    row.erpnext_name,
                    row.server_name,
                    invoice.name,
                    invoice.wmn_offline_sync_id,
                    invoice.custom_offline_id,
                    invoice.__wmn_server_name,
                ].some(value => String(value || "").trim() === target);
            }

            async function findInvoiceQueueRow(identity) {
                const target = String(identity || "").trim();
                if (!target) return null;
                const direct = await get(STORES.invoice_queue, target);
                if (direct) return direct;
                const rows = await getAll(STORES.invoice_queue);
                return (rows || []).find(row => invoiceQueueMatchesIdentity(row, target)) || null;
            }

            function paymentQueueMatchesInvoice(paymentRow, invoiceRow) {
                if (!paymentRow || !invoiceRow) return false;
                const invoice = invoiceRow.invoice || invoiceRow.doc || invoiceRow.data || invoiceRow || {};
                const identities = new Set([
                    invoiceRow.offline_id,
                    invoiceRow.erpnext_name,
                    invoiceRow.server_name,
                    invoice.name,
                    invoice.wmn_offline_sync_id,
                    invoice.custom_offline_id,
                    invoice.__wmn_server_name,
                ].map(value => String(value || "").trim()).filter(Boolean));
                return identities.has(String(paymentRow.invoice_offline_id || "").trim())
                    || identities.has(String(paymentRow.invoice_name || "").trim());
            }

            function getQueuedPaymentAmount(invoiceRow, paymentRows) {
                return (paymentRows || []).reduce((total, paymentRow) => {
                    if (getPaymentQueueStatus(paymentRow) === "synced") return total;
                    if (!paymentQueueMatchesInvoice(paymentRow, invoiceRow)) return total;
                    return total + Math.max(0, flt(paymentRow.amount || 0));
                }, 0);
            }

            function getInvoicePaymentStatus(doc, row, pendingPaymentAmount = 0) {
                doc = doc || {};
                row = row || {};
                if (cint(doc.is_return || 0) === 1) return "Return";
                if (doc.__wmn_saved_as_draft === true || row.queue_kind === "draft") return "Draft";

                const specialStatus = String(doc.status || "").trim();
                if (["Cancelled", "Consolidated"].includes(specialStatus)) return specialStatus;

                const total = Math.abs(flt(doc.rounded_total || doc.grand_total || 0));
                const baseOutstanding = Math.max(0, flt(doc.__wmn_server_outstanding_amount !== undefined
                    ? doc.__wmn_server_outstanding_amount
                    : doc.outstanding_amount || 0));
                const effectiveOutstanding = Math.max(0, baseOutstanding - Math.max(0, flt(pendingPaymentAmount || 0)));
                const basePaid = Math.max(0, flt(doc.__wmn_server_paid_amount !== undefined
                    ? doc.__wmn_server_paid_amount
                    : doc.paid_amount || 0));
                const effectivePaid = Math.max(basePaid + Math.max(0, flt(pendingPaymentAmount || 0)), total - effectiveOutstanding);
                const epsilon = 0.000001;

                if (effectiveOutstanding <= epsilon) return "Paid";
                if (effectivePaid > epsilon) return "Partly Paid";

                const dueDate = String(doc.due_date || "").slice(0, 10);
                const today = String(frappe.datetime.get_today() || "").slice(0, 10);
                if (dueDate && today && dueDate < today) return "Overdue";
                return "Unpaid";
            }

            function getInvoiceDisplayStatus(doc, row, pendingPaymentAmount = 0) {
                if (String(doc?.wmn_pos_stage || "").trim() === "AWAITING_CASHIER") {
                    return "Awaiting Cashier";
                }
                return getInvoicePaymentStatus(doc, row, pendingPaymentAmount);
            }

            function decorateInvoiceQueueRow(invoiceRow, paymentRows = []) {
                if (!invoiceRow) return null;
                const doc = clone(invoiceRow.invoice || invoiceRow.doc || invoiceRow.data || invoiceRow || {});
                const pendingPaymentAmount = getQueuedPaymentAmount(invoiceRow, paymentRows);
                const baseOutstanding = Math.max(0, flt(doc.outstanding_amount || 0));
                const basePaid = Math.max(0, flt(doc.paid_amount || 0));
                const effectiveOutstanding = Math.max(0, baseOutstanding - pendingPaymentAmount);
                const effectivePaid = basePaid + pendingPaymentAmount;
                const displayName = String(invoiceRow.erpnext_name || invoiceRow.server_name || invoiceRow.offline_id || doc.name || "");

                doc.__wmn_queue_offline_id = invoiceRow.offline_id || "";
                doc.__wmn_queue_status = getInvoiceQueueStatus(invoiceRow);
                doc.__wmn_server_name = invoiceRow.erpnext_name || invoiceRow.server_name || "";
                doc.__wmn_local_submitted = invoiceRow.queue_kind !== "draft";
                doc.__wmn_original_docstatus = cint(doc.docstatus || 0);
                if (doc.__wmn_local_submitted === true) doc.docstatus = 1;
                doc.__wmn_pending_payment_amount = pendingPaymentAmount;
                doc.__wmn_base_paid_amount = basePaid;
                doc.__wmn_base_outstanding_amount = baseOutstanding;
                doc.__wmn_original_name = doc.name || "";
                if (displayName) doc.name = displayName;
                doc.paid_amount = effectivePaid;
                doc.outstanding_amount = effectiveOutstanding;
                doc.status = getInvoicePaymentStatus(doc, invoiceRow, 0);
                doc.__wmn_display_status = getInvoiceDisplayStatus(doc, invoiceRow, 0);
                doc.__wmn_display_name = displayName;
                return doc;
            }

            async function getOfflineRecentOrders({ search_term = "", status = "", limit = 20 } = {}) {
                const invoiceRows = await getAll(STORES.invoice_queue);
                const paymentRows = await getAll(STORES.payment_entry_queue);
                const search = String(search_term || "").trim().toLowerCase();
                const wantedStatus = String(status || "").trim();
                const result = [];

                const sorted = (invoiceRows || []).slice().sort((a, b) => {
                    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
                });

                for (const invoiceRow of sorted) {
                    const doc = decorateInvoiceQueueRow(invoiceRow, paymentRows);
                    if (!doc) continue;
                    const invoiceStatus = String(doc.__wmn_display_status || doc.status || "").trim();
                    if (wantedStatus && invoiceStatus !== wantedStatus) continue;

                    const displayName = String(doc.__wmn_display_name || invoiceRow.offline_id || doc.name || "");
                    if (search) {
                        const haystack = [
                            displayName,
                            invoiceRow.offline_id,
                            invoiceRow.erpnext_name,
                            doc.name,
                            doc.customer,
                            doc.customer_name,
                            doc.wmn_receipt_no,
                            doc.wmn_invoice_uid,
                        ].map(value => String(value || "").toLowerCase()).join(" ");
                        if (!haystack.includes(search)) continue;
                    }

                    result.push(Object.assign({}, doc, {
                        name: displayName,
                        status: invoiceStatus,
                    }));
                    if (result.length >= Math.max(1, cint(limit || 20))) break;
                }
                return result;
            }

            async function getOfflineInvoice(identity) {
                const invoiceRow = await findInvoiceQueueRow(identity);
                if (!invoiceRow) return null;
                const paymentRows = await getAll(STORES.payment_entry_queue);
                return decorateInvoiceQueueRow(invoiceRow, paymentRows);
            }

            async function getPendingPaymentEntries(invoiceOfflineId = "") {
                const rows = invoiceOfflineId
                    ? await getAllByIndex(STORES.payment_entry_queue, "invoice_offline_id", invoiceOfflineId)
                    : await getAll(STORES.payment_entry_queue);
                return (rows || []).filter(row => getPaymentQueueStatus(row) !== "synced");
            }

            async function updatePaymentQueueRow(row) {
                await bulkPut(STORES.payment_entry_queue, [row]);
                if (typeof window.wmn_notify_offline_queue_changed === "function") {
                    window.wmn_notify_offline_queue_changed();
                }
                return row;
            }

            async function savePaymentEntry(payment) {
                const payload = clone(payment || {});
                const invoiceIdentity = String(payload.invoice_offline_id || payload.invoice_name || "").trim();
                const invoiceRow = await findInvoiceQueueRow(invoiceIdentity);
                if (!invoiceRow) throw new Error("Offline invoice was not found in local storage");

                const invoice = invoiceRow.invoice || invoiceRow.doc || invoiceRow.data || {};
                if (String(invoice.doctype || invoiceRow.doctype || "") !== "Sales Invoice") {
                    throw new Error("Offline Payment Entry is supported only for Sales Invoice");
                }
                if (cint(invoice.is_return || 0) === 1) throw new Error("Payment cannot be added to a return invoice");

                const amount = flt(payload.amount || 0);
                if (amount <= 0) throw new Error("Payment amount must be greater than zero");

                const paymentRows = await getAll(STORES.payment_entry_queue);
                const queuedAmount = getQueuedPaymentAmount(invoiceRow, paymentRows);
                const baseOutstanding = Math.max(0, flt(invoice.outstanding_amount || 0));
                const availableOutstanding = Math.max(0, baseOutstanding - queuedAmount);
                const precision = 0.000001;
                if (amount - availableOutstanding > precision) {
                    throw new Error(`Payment amount cannot exceed outstanding amount ${availableOutstanding}`);
                }

                const offlinePaymentId = String(
                    payload.wmn_offline_payment_id
                    || payload.offline_payment_id
                    || `PAY-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
                ).trim();
                const row = {
                    offline_payment_id: offlinePaymentId,
                    wmn_offline_payment_id: offlinePaymentId,
                    status: "pending",
                    created_at: payload.created_at || new Date().toISOString(),
                    invoice_offline_id: invoiceRow.offline_id || invoiceIdentity,
                    invoice_name: invoiceRow.erpnext_name || invoiceRow.server_name || "",
                    amount,
                    mode_of_payment: payload.mode_of_payment || "",
                    reference_no: payload.reference_no || invoiceRow.erpnext_name || invoiceRow.offline_id || invoice.name || "",
                    reference_date: payload.reference_date || frappe.datetime.get_today(),
                    last_error: "",
                };

                await updatePaymentQueueRow(row);
                return row;
            }

            async function syncPaymentEntry(row) {
                if (!online()) throw new Error("POS is offline");
                if (!row) return row;

                const offlinePaymentId = String(row.wmn_offline_payment_id || row.offline_payment_id || "").trim();
                if (!offlinePaymentId) throw new Error("Offline payment ID is missing");
                if (getPaymentQueueStatus(row) === "synced") return row;
                if (paymentSyncFlights.has(offlinePaymentId)) return await paymentSyncFlights.get(offlinePaymentId);

                const flight = (async () => {
                    try {
                        row.status = "syncing";
                        row.last_try_at = new Date().toISOString();
                        await updatePaymentQueueRow(row);

                        const invoiceRow = await findInvoiceQueueRow(row.invoice_offline_id || row.invoice_name);
                        if (!invoiceRow) throw new Error("Offline invoice was not found for Payment Entry sync");

                        let serverInvoiceName = String(invoiceRow.erpnext_name || invoiceRow.server_name || "").trim();
                        if (!serverInvoiceName) {
                            const syncedInvoiceRow = await syncInvoice(invoiceRow);
                            serverInvoiceName = String(syncedInvoiceRow.erpnext_name || syncedInvoiceRow.server_name || "").trim();
                        }
                        if (!serverInvoiceName) throw new Error("Server Sales Invoice name is missing");

                        row.invoice_name = serverInvoiceName;
                        const response = await frappe.call({
                            method: "wmn.api.sync_offline_payment_entry",
                            args: {
                                payment: {
                                    wmn_offline_payment_id: offlinePaymentId,
                                    invoice_name: serverInvoiceName,
                                    amount: row.amount,
                                    mode_of_payment: row.mode_of_payment,
                                    reference_no: row.reference_no || serverInvoiceName,
                                    reference_date: row.reference_date || frappe.datetime.get_today(),
                                },
                            },
                            freeze: false,
                        });
                        const result = response?.message || {};
                        if (cint(result.payment_entry_docstatus || 0) !== 1) {
                            throw new Error("Server Payment Entry was not submitted");
                        }

                        row.status = "synced";
                        row.synced_at = new Date().toISOString();
                        row.payment_entry = result.payment_entry || row.payment_entry || "";
                        row.last_error = "";
                        await updatePaymentQueueRow(row);

                        const currentInvoiceRow = await findInvoiceQueueRow(invoiceRow.offline_id || serverInvoiceName);
                        if (currentInvoiceRow && currentInvoiceRow.invoice) {
                            currentInvoiceRow.invoice.status = result.invoice_status || currentInvoiceRow.invoice.status || "";
                            currentInvoiceRow.invoice.paid_amount = flt(result.paid_amount || 0);
                            currentInvoiceRow.invoice.outstanding_amount = flt(result.outstanding_amount || 0);
                            currentInvoiceRow.invoice.__wmn_server_name = serverInvoiceName;
                            await updateQueueRow(currentInvoiceRow);
                        }
                        return row;
                    } catch (e) {
                        row.status = "pending";
                        row.last_error = e.message || String(e);
                        row.last_try_at = new Date().toISOString();
                        await updatePaymentQueueRow(row);
                        throw e;
                    } finally {
                        paymentSyncFlights.delete(offlinePaymentId);
                    }
                })();

                paymentSyncFlights.set(offlinePaymentId, flight);
                return await flight;
            }

            async function syncPaymentEntries(invoiceOfflineId = "") {
                if (!online()) return [];
                if (paymentSyncRunPromise) return await paymentSyncRunPromise;

                paymentSyncRunPromise = (async () => {
                    const pending = await getPendingPaymentEntries(invoiceOfflineId);
                    const synced = [];
                    for (const row of pending) {
                        try {
                            const result = await syncPaymentEntry(row);
                            if (getPaymentQueueStatus(result) === "synced") {
                                synced.push(result);
                                frappe.show_alert({
                                    message: __("Offline payment synchronized: {0}", [result.payment_entry || result.offline_payment_id]),
                                    indicator: "green",
                                });
                            }
                        } catch (e) {
                            console.error("WMN POS offline Payment Entry sync failed", row.offline_payment_id, e);
                        }
                    }
                    return synced;
                })();

                try {
                    return await paymentSyncRunPromise;
                } finally {
                    paymentSyncRunPromise = null;
                }
            }

            function getInvoiceQueueStatus(row) {
                const status = String(row?.status || "pending").toLowerCase();
                const queueKind = String(row?.queue_kind || "").toLowerCase();
                const invoice = row?.invoice || row?.doc || row?.data || {};
                const stage = String(invoice?.wmn_pos_stage || "").trim();
                const isDraft = queueKind === "draft" || stage === "AWAITING_CASHIER";

                if (
                    isDraft
                    && (row?.erpnext_name || row?.server_name || status === "draft_synced")
                ) {
                    return "draft_synced";
                }

                if (row?.erpnext_name || row?.server_name || row?.synced || row?.synced_at
                    || ["synced", "submitted", "success"].includes(status)) {
                    return "synced";
                }
                return status || "pending";
            }

            function ensureInvoiceSyncIdentity(row) {
                if (!row) throw new Error("Offline invoice queue row is missing");

                const invoice = row.invoice || row.doc || row.data || row;
                if (!invoice) throw new Error("Offline invoice data is missing");

                const syncId = String(
                    invoice.wmn_offline_sync_id
                    || invoice.custom_offline_id
                    || row.offline_id
                    || row.id
                    || row.name
                    || ""
                ).trim();

                if (!syncId) throw new Error("Offline invoice sync ID is missing");

                row.offline_id = row.offline_id || syncId;
                invoice.wmn_offline_sync_id = syncId;
                invoice.custom_offline_id = syncId;
                row.invoice = invoice;

                return { syncId, invoice };
            }

            async function syncInvoice(row) {
                if (!online()) throw new Error("POS is offline");
                if (!row) return row;

                const { syncId, invoice } = ensureInvoiceSyncIdentity(row);
                const queueKind = String(row.queue_kind || "").toLowerCase();
                const stage = String(invoice.wmn_pos_stage || "").trim();
                const syncAsDraft = queueKind === "draft" || stage === "AWAITING_CASHIER";
                const currentStatus = getInvoiceQueueStatus(row);
                if (currentStatus === "synced" || currentStatus === "draft_synced") return row;

                if (invoiceSyncFlights.has(syncId)) {
                    return await invoiceSyncFlights.get(syncId);
                }

                const flight = (async () => {
                    try {
                        await wmn_clean_doc_batch_serial_for_save(invoice);
                        row.status = "syncing";
                        row.last_try_at = new Date().toISOString();
                        row.invoice = invoice;
                        await updateQueueRow(row);

                        const r = await frappe.call({
                            method: "wmn.api.sync_offline_pos_invoice",
                            args: {
                                invoice,
                                submit: syncAsDraft ? 0 : 1,
                            },
                            freeze: false,
                        });
                        const result = r.message || {};
                        const serverDocstatus = cint(result.docstatus || 0);

                        if (syncAsDraft) {
                            if (serverDocstatus !== 0) {
                                throw new Error("Server invoice was not saved as Draft");
                            }

                            row.status = "draft_synced";
                            row.draft_synced_at = new Date().toISOString();
                            delete row.synced_at;
                        } else {
                            if (serverDocstatus !== 1) {
                                throw new Error("Server invoice was not submitted");
                            }

                            row.status = "synced";
                            row.synced_at = new Date().toISOString();
                            delete row.draft_synced_at;
                        }

                        row.erpnext_name = result.name || result.erpnext_name || row.erpnext_name || "";
                        row.server_name = row.erpnext_name || row.server_name || "";
                        row.last_error = "";
                        invoice.__wmn_server_name = row.erpnext_name || "";
                        invoice.status = result.invoice_status || invoice.status || (syncAsDraft ? "Draft" : "");
                        invoice.docstatus = syncAsDraft ? 0 : 1;
                        invoice.paid_amount = flt(result.paid_amount || invoice.paid_amount || 0);
                        invoice.outstanding_amount = flt(
                            result.outstanding_amount !== undefined
                                ? result.outstanding_amount
                                : invoice.outstanding_amount || 0
                        );
                        row.invoice = invoice;
                        await updateQueueRow(row);
                        return row;
                    } catch (e) {
                        row.status = "pending";
                        row.last_error = e.message || String(e);
                        row.last_try_at = new Date().toISOString();
                        row.invoice = invoice;
                        await updateQueueRow(row);
                        throw e;
                    } finally {
                        invoiceSyncFlights.delete(syncId);
                    }
                })();

                invoiceSyncFlights.set(syncId, flight);
                return await flight;
            }

            async function syncInvoices() {
                if (!online()) return [];
                if (invoiceSyncRunPromise) return await invoiceSyncRunPromise;

                invoiceSyncRunPromise = (async () => {
                    const pending = await getSyncableInvoices();
                    const synced = [];
                    for (const row of pending) {
                        try {
                            const result = await syncInvoice(row);
                            const resultStatus = getInvoiceQueueStatus(result);
                            if (resultStatus === "synced" || resultStatus === "draft_synced") {
                                synced.push(result);
                                frappe.show_alert({
                                    message: resultStatus === "draft_synced"
                                        ? __("Offline draft synchronized: {0}", [result.erpnext_name || result.offline_id])
                                        : __("تمت مزامنة فاتورة أوفلاين: {0}", [result.erpnext_name || result.offline_id]),
                                    indicator: "green",
                                });
                            }
                        } catch (e) {
                            console.error("WMN POS offline invoice sync failed", row.offline_id, e);
                        }
                    }
                    await syncPaymentEntries();
                    return synced;
                })();

                try {
                    return await invoiceSyncRunPromise;
                } finally {
                    invoiceSyncRunPromise = null;
                }
            }

            // clean: automatic online sync removed. Use Offline Invoices dialog.
            // Periodic automatic sync is disabled; use the Offline Invoices dialog instead.

            return {
                STORES,
                online,
                openDB,
                bulkPut,
                getAll,
                getAllCached,
                getAllByIndex,
                getFirstByIndex,
                get,
                listOfflineDoctypeRecords,
                getOfflineDoctypeRecord,
                putOfflineDoctypeRecord,
                deleteOfflineDoctypeRecord,
                replaceOfflineDoctypeSnapshot,
                saveOfflineDoctypeRecord,
                isOfflineDoctypeLocalName,
                resolveOfflineDoctypeOperation,
                getPendingOfflineDoctypeRecords,
                remapOfflineDoctypeLinkReference,
                findSerialOffline,
                getAvailableSerialsForItem,
                getSerialsByNumbers,
                setSetting,
                getSetting,
                preload,
                cacheOfflineItemImages: wmnCacheOfflineItemImages,
                searchItems,
                findItem,
                getFullSettings,
                getPOSProfile,
                getPOSItemFilterContext,
                getCoupon,
                getCoupons,
                getPromotions,
                markCustomerPOSPurchase,
                getSupervisorBundle,
                getCashMovementContext,
                getCashMovementSummary,
                saveCashMovement,
                getPendingCashMovements,
                syncCashMovements,
                getStock,
                saveInvoice,
                getPendingInvoices,
                getSyncableInvoices,
                findInvoiceQueueRow,
                decorateInvoiceQueueRow,
                getOfflineRecentOrders,
                getOfflineInvoice,
                savePaymentEntry,
                getPendingPaymentEntries,
                syncPaymentEntry,
                syncPaymentEntries,
                getPendingReservedQty,
                getPendingReservedSerialNos,
                syncInvoice,
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
