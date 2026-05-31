/* ============================================================================
 * WMN POS Offline Clean for ERPNext 15.27.x
 * Reference behavior: v53 adapted for ERPNext 15.27 offline form isolation
 * Purpose:
 * - Same runtime behavior as last verified working build.
 * - Removed old unused duplicate functions and dead 1111 helpers.
 * - Centralized POS offline state detection to reduce repeated checks.
 * - No feature behavior changed in this refactor.
 * ============================================================================ */

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
                if (!document.querySelector('link[rel="manifest"][href="/assets/wmn/pos-offline-manifest.webmanifest"]')) {
                    const manifest = document.createElement("link");
                    manifest.rel = "manifest";
                    manifest.href = "/assets/wmn/pos-offline-manifest.webmanifest";
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
                        scope: "/",
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
                    const data = await fetchMasterData(ctrl);
                    const barcodeStructures = (data.barcode_structures || [])
                        .filter(d => d && d.name && d.prefix);

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

                    const settingsRows = [
                        { key: "last_master_sync", value: data.server_time || frappe.datetime.now_datetime() },
                        { key: "pos_profile", value: posProfile.pos_profile || posProfile.name || args.pos_profile || "" },
                        { key: "price_list", value: posProfile.selling_price_list || args.price_list || data.price_list || "" },
                        { key: "warehouse", value: posProfile.warehouse || args.warehouse || data.warehouse || "" },
                        { key: "full_settings", value: posProfile },
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


        /* ============================================================================
         * WMN ERPNext 15.27 Offline Isolation Guard
         * - Detects "effective offline" before POS Controller starts.
         * - Blocks online-only DocType/Form calls while POS is offline.
         * - Prevents Sales Invoice / POS Invoice scripts from throwing exchange-rate
         *   errors during offline mode.
         * ============================================================================ */

        function wmn_pos_is_page() {
            return !!(
                location.pathname.includes("point-of-sale") ||
                location.hash.includes("point-of-sale")
            );
        }

        function wmn_pos_call_method_name(opts) {
            if (!opts) return "";
            if (typeof opts === "string") return opts;
            if (typeof opts.method === "string") return opts.method;
            if (opts.args && typeof opts.args.method === "string") return opts.args.method;
            if (opts.args && typeof opts.args.cmd === "string") return opts.args.cmd;
            if (typeof opts.cmd === "string") return opts.cmd;
            return "";
        }

        function wmn_pos_call_text(opts) {
            try {
                return JSON.stringify({
                    method: wmn_pos_call_method_name(opts),
                    args: opts && opts.args ? opts.args : {},
                    doctype: opts && opts.doc ? opts.doc.doctype : "",
                }).toLowerCase();
            } catch (e) {
                return String(wmn_pos_call_method_name(opts) || "").toLowerCase();
            }
        }

        function wmn_pos_is_online_form_call(opts) {
            const text = wmn_pos_call_text(opts);

            return (
                text.includes("set_pos_data") ||
                text.includes("get_party_details") ||
                text.includes("apply_price_list") ||
                text.includes("get_item_details") ||
                text.includes("get_fiscal_year") ||
                text.includes("calculate_taxes_and_totals") ||
                text.includes("validate_conversion_rate") ||
                text.includes("frappe.desk.form.run_method") ||
                text.includes("frappe.desk.form.save.savedocs")
            );
        }

        function wmn_fake_frappe_call_response(message = null) {
            const response = { message: message };

            const p = Promise.resolve(response);

            p.done = function (cb) {
                if (typeof cb === "function") p.then(cb);
                return p;
            };

            p.fail = function () {
                return p;
            };

            p.always = function (cb) {
                if (typeof cb === "function") p.finally(cb);
                return p;
            };

            return p;
        }

        function wmn_install_offline_server_call_guard() {
            if (window.__wmn_pos_offline_server_call_guard_installed) return;
            if (!window.frappe || !frappe.call) return;

            const original_call = frappe.call;

            frappe.call = function (opts) {
                const pos_state = wmn_pos_runtime_state();
                const in_pos = pos_state.in_pos_page;
                const effective_offline = pos_state.browser_offline || pos_state.forced_offline || pos_state.effective_offline;

                if (in_pos && effective_offline && wmn_pos_is_online_form_call(opts)) {
                    console.warn("WMN 15.27 OFFLINE: blocked online form call", wmn_pos_call_method_name(opts), opts);

                    // Do not call opts.callback / original_callback.
                    // These callbacks are exactly what run Sales Invoice/POS Invoice online scripts.
                    return wmn_fake_frappe_call_response(null);
                }

                const out = original_call.apply(this, arguments);

                // If any POS server call fails, immediately switch current POS session to effective offline.
                const mark_failed = function (e) {
                    const reason = (e && (e.message || e.statusText || e.responseText)) || e || wmn_pos_call_method_name(opts);
                    wmn_mark_offline_from_xhr(e, reason);
                };

                if (in_pos && out) {
                    if (typeof out.catch === "function") {
                        out.catch(mark_failed);
                    }
                    if (typeof out.fail === "function") {
                        out.fail(mark_failed);
                    }
                }

                return out;
            };

            window.__wmn_pos_offline_server_call_guard_installed = true;
        }

        function wmn_install_offline_doctype_script_guard() {
            if (window.__wmn_pos_offline_doctype_script_guard_installed) return;

            const install = function () {
                if (!window.frappe || !frappe.ui || !frappe.ui.form || !frappe.ui.form.Controller) {
                    return false;
                }

                const proto = frappe.ui.form.Controller.prototype;
                if (!proto) return false;

                [
                    "validate_conversion_rate",
                    "calculate_taxes_and_totals",
                    "_calculate_taxes_and_totals",
                    "apply_price_list",
                ].forEach(function (name) {
                    if (typeof proto[name] !== "function") return;
                    if (proto[name].__wmn_offline_guarded) return;

                    const original = proto[name];

                    proto[name] = function () {
                        const pos_state = wmn_pos_runtime_state();
                        if (pos_state.in_pos_page && (pos_state.forced_offline || pos_state.effective_offline || pos_state.browser_offline || pos_state.offline_doc)) {
                            console.warn("WMN 15.27 OFFLINE: skipped doctype script", name);
                            return Promise.resolve();
                        }

                        return original.apply(this, arguments);
                    };

                    proto[name].__wmn_offline_guarded = true;
                });

                return true;
            };

            if (!install()) {
                setTimeout(install, 500);
                setTimeout(install, 1500);
            }

            window.__wmn_pos_offline_doctype_script_guard_installed = true;
        }

        function wmn_set_pos_effective_offline(reason) {
            window.__wmn_pos_effective_offline = true;
            console.warn("WMN 15.27 OFFLINE:", reason || "effective offline");
        }

        function wmn_is_network_failure_text(value) {
            const text = String(value || "").toLowerCase();
            return (
                text.includes("err_internet_disconnected") ||
                text.includes("err_address_unreachable") ||
                text.includes("err_network_changed") ||
                text.includes("service unavailable") ||
                text.includes("networkerror") ||
                text.includes("failed to fetch") ||
                text.includes("connection") ||
                text.includes("timeout") ||
                text.includes("abort") ||
                text.includes("503") ||
                text.includes("status 0")
            );
        }

        function wmn_mark_offline_from_xhr(xhr, reason) {
            const status = xhr && typeof xhr.status !== "undefined" ? cint(xhr.status) : 0;
            const statusText = xhr && xhr.statusText ? xhr.statusText : "";
            const responseText = xhr && xhr.responseText ? xhr.responseText : "";

            if (
                status === 0 ||
                status === 503 ||
                wmn_is_network_failure_text(reason) ||
                wmn_is_network_failure_text(statusText) ||
                wmn_is_network_failure_text(responseText)
            ) {
                wmn_set_pos_effective_offline(reason || statusText || ("HTTP " + status));
                return true;
            }

            return false;
        }

        async function wmn_bootstrap_detect_effective_offline() {
            if (!wmn_pos_is_page() || !window.wmnPOSOffline) return false;

            if (navigator.onLine === false) {
                wmn_set_pos_effective_offline("navigator.onLine false");
                return true;
            }

            const controller = new AbortController();
            const timer = setTimeout(function () {
                try { controller.abort(); } catch (e) {}
            }, 2500);

            try {
                const response = await fetch("/api/method/wmn.api.pos_health_check?ts=" + Date.now(), {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: controller.signal,
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                        "Pragma": "no-cache",
                        "X-Frappe-CSRF-Token": (frappe.csrf_token || "")
                    },
                    body: JSON.stringify({ source: "pos_health" })
                });

                clearTimeout(timer);

                const data = await response.json().catch(function () { return null; });
                if (!response.ok || (data && data._wmn_offline === true)) {
                    wmn_set_pos_effective_offline("health check failed HTTP " + response.status);
                    return true;
                }

                window.__wmn_pos_effective_offline = false;
                return false;
            } catch (e) {
                clearTimeout(timer);
                wmn_set_pos_effective_offline((e && (e.name || e.message)) || "health check network failure");
                return true;
            }
        }

        function wmn_pos_cart_has_items() {
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            const items = doc && Array.isArray(doc.items) ? doc.items : [];
            return items.some(row => row && row.item_code && flt(row.qty || 0) > 0);
        }

        async function wmn_on_pos_online_event() {
            if (wmn_pos_cart_has_items()) {
                window.__wmn_pos_effective_offline = true;
                return;
            }

            const isOffline = await wmn_bootstrap_detect_effective_offline();
            if (!isOffline && !wmn_is_pos_offline()) {
                setTimeout(function () {
                    try { location.reload(); } catch (e) {}
                }, 250);
            }
        }

        window.addEventListener("offline", function () {
            wmn_set_pos_effective_offline("browser offline event");
        });

        window.addEventListener("online", function () {
            wmn_on_pos_online_event();
        });

        if (window.jQuery) {
            jQuery(document).ajaxError(function (_event, xhr, settings, thrownError) {
                if (!wmn_pos_is_page()) return;
                const url = settings && settings.url ? settings.url : "";
                wmn_mark_offline_from_xhr(xhr, thrownError || url);
            });
        }



        function wmn_install_frappe_connection_lost_watcher() {
            if (window.__wmn_frappe_connection_lost_watcher_installed) return;
            if (!window.frappe || !frappe.show_alert) return;

            const original_show_alert = frappe.show_alert;

            frappe.show_alert = function (message, seconds) {
                try {
                    const text = typeof message === "string"
                        ? message
                        : ((message && message.message) || "");

                    if (
                        String(text).includes("Connection lost") ||
                        String(text).includes("Some features might not work") ||
                        String(text).includes("\u0627\u0646\u0642\u0637\u0639 \u0627\u0644\u0627\u062A\u0635\u0627\u0644")
                    ) {
                        wmn_set_pos_effective_offline("frappe connection lost message");
                    }
                } catch (e) {}

                return original_show_alert.apply(this, arguments);
            };

            window.__wmn_frappe_connection_lost_watcher_installed = true;
        }


        wmn_install_offline_server_call_guard();
        wmn_install_offline_doctype_script_guard();
        wmn_install_frappe_connection_lost_watcher();

        

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
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            return !!(doc && (doc.__offline_pos || doc.offline_pos || String(doc.name || "").startsWith("OFFLINE-")));
        }

        function wmn_is_offline_invoice_doc_object(doc) {
            doc = doc || {};
            return !!(
                doc.__offline_pos ||
                doc.offline_pos ||
                doc.__is_offline_pos ||
                String(doc.name || "").startsWith("OFFLINE-") ||
                String(doc.custom_offline_id || "").startsWith("POS-OFF-")
            );
        }

        function wmn_controller_uses_offline_flow(ctrl) {
            const doc = ctrl && ctrl.frm && ctrl.frm.doc ? ctrl.frm.doc : (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null);
            return !!(
                (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) ||
                wmn_is_offline_invoice_doc_object(doc) ||
                (ctrl && ctrl.frm && ctrl.frm.__wmn_fake_offline_frm)
            );
        }

        function wmn_pos_runtime_state() {
            const in_pos_page = wmn_pos_is_page();
            const effective_offline = window.__wmn_pos_effective_offline === true;
            return {
                in_pos_page,
                browser_offline: false,
                forced_offline: false,
                effective_offline,
                offline_doc: effective_offline,
                has_offline_db: !!window.wmnPOSOffline,
                is_offline: !!(in_pos_page && effective_offline)
            };
        }

        window.__wmn_pos_effective_offline = window.__wmn_pos_effective_offline === true;

        window.wmn_is_pos_offline = function () {
            return window.__wmn_pos_effective_offline === true;
        };

        function wmn_is_pos_offline() {
            return window.wmn_is_pos_offline();
        }

        wmn_install_offline_meta_adapter();
        wmn_install_offline_form_model_adapter();

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
                    serialNo
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
            let total_taxes = 0;
            let running_total = flt(net_total || 0);

            taxes.forEach((tax, idx) => {
                let tax_amount = 0;
                const chargeType = String(tax.charge_type || "On Net Total");

                if (chargeType === "Actual") {
                    tax_amount = flt(tax.tax_amount || tax.base_tax_amount || 0);
                } else {
                    items.forEach(row => {
                        const rate = wmn_get_item_tax_rate_for_account(row, tax.account_head, tax.rate);
                        tax_amount += flt(row.net_amount || row.amount || 0) * rate / 100;
                    });
                }

                tax.idx = idx + 1;
                tax.tax_amount = tax_amount;
                tax.base_tax_amount = tax_amount;
                tax.tax_amount_after_discount_amount = tax_amount;
                tax.base_tax_amount_after_discount_amount = tax_amount;
                running_total += tax_amount;
                tax.total = running_total;
                tax.base_total = running_total;
                total_taxes += tax_amount;
            });

            const discount_percentage = flt(doc.additional_discount_percentage || 0);
            let discount_amount = flt(doc.discount_amount || 0);
            const before_discount = flt(net_total || 0) + flt(total_taxes || 0);

            if (discount_percentage > 0) {
                discount_amount = before_discount * discount_percentage / 100;
            }

            discount_amount = Math.max(0, Math.min(discount_amount, before_discount));
            const grand_total = Math.max(0, before_discount - discount_amount);
            const rounded_total = round_total ? Math.round(grand_total) : grand_total;

            doc.taxes = taxes;
            wmn_fill_offline_tax_cost_centers(doc);
            doc.total_taxes_and_charges = total_taxes;
            doc.base_total_taxes_and_charges = total_taxes;
            doc.apply_discount_on = doc.apply_discount_on || "Grand Total";
            doc.additional_discount_percentage = discount_percentage;
            doc.discount_amount = discount_amount;
            doc.base_discount_amount = discount_amount;
            doc.total_qty = total_qty;
            doc.total = net_total;
            doc.net_total = net_total;
            doc.base_total = net_total;
            doc.base_net_total = net_total;
            doc.grand_total = grand_total;
            doc.rounded_total = rounded_total;
            doc.base_grand_total = grand_total;
            doc.base_rounded_total = rounded_total;

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
            doc.change_amount = Math.max(0, paid - payable);
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
                ? await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.payment_methods)
                : [];
            const cachedTaxRows = await wmn_get_cached_offline_tax_rows(null);

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

        function wmn_install_offline_meta_adapter() {
            if (window.__wmn_offline_meta_adapter_installed) return;
            if (!window.frappe || !frappe.get_meta) return;

            const original_get_meta = frappe.get_meta;
            const fallbackChildDoctypes = {
                "POS Invoice Item": true,
                "Sales Invoice Item": true,
            };

            frappe.get_meta = function (doctype) {
                const meta = original_get_meta.apply(this, arguments);

                if (meta && Array.isArray(meta.fields) && meta.fields.length) {
                    return meta;
                }

                try {
                    if (
                        typeof wmn_is_pos_offline === "function" &&
                        wmn_is_pos_offline() &&
                        fallbackChildDoctypes[doctype]
                    ) {
                        return wmn_make_offline_item_meta(doctype);
                    }
                } catch (e) {}

                return meta;
            };

            window.__wmn_offline_meta_adapter_installed = true;
        }

        function wmn_install_offline_form_model_adapter() {
            if (window.__wmn_offline_form_model_adapter_installed) return;
            if (!window.frappe || !frappe.model || !frappe.model.set_value) return;

            const original_set_value = frappe.model.set_value;
            const original_get_doc = frappe.get_doc;

            frappe.model.set_value = function (doctype, name, fieldname, value) {
                try {
                    if ((typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) || wmn_current_doc_is_offline_pos()) {
                        const frm = window.cur_pos && window.cur_pos.frm ? window.cur_pos.frm : null;
                        const doc = frm && frm.doc ? frm.doc : null;
                        const target = wmn_get_offline_child_doc(doc, doctype, name);

                        if (doc && doc.doctype === doctype && doc.name === name) {
                            if (typeof fieldname === "object") {
                                Object.assign(doc, fieldname || {});
                            } else {
                                doc[fieldname] = value;
                            }

                            if (typeof wmn_recalculate_offline_doc === "function") {
                                wmn_recalculate_offline_doc(doc);
                            }

                            wmn_register_offline_doc_locals(doc);
                            wmn_emit_offline_refresh_fields(frm);

                            const pos = window.cur_pos;
                            try {
                                if (pos && pos.cart && pos.cart.update_totals_section) {
                                    pos.cart.update_totals_section(frm);
                                }
                                if (pos && pos.payment && pos.payment.update_totals_section) {
                                    pos.payment.update_totals_section(doc);
                                }
                            } catch (e) {}

                            return Promise.resolve({ message: doc });
                        }

                        if (target) {
                            if (typeof fieldname === "object") {
                                Object.assign(target, fieldname || {});
                            } else {
                                target[fieldname] = value;
                            }

                            if (typeof wmn_recalculate_offline_doc === "function") {
                                wmn_recalculate_offline_doc(doc);
                            }

                            wmn_register_offline_doc_locals(doc);
                            wmn_emit_offline_refresh_fields(frm);

                            return Promise.resolve({ message: target });
                        }
                    }
                } catch (e) {
                    console.warn("WMN offline model.set_value adapter skipped", e);
                }

                return original_set_value.apply(this, arguments);
            };

            frappe.get_doc = function (doctype, name) {
                try {
                    if ((typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) || wmn_current_doc_is_offline_pos()) {
                        const frm = window.cur_pos && window.cur_pos.frm ? window.cur_pos.frm : null;
                        const doc = frm && frm.doc ? frm.doc : null;

                        if (doc && doc.doctype === doctype && doc.name === name) {
                            return doc;
                        }

                        const target = wmn_get_offline_child_doc(doc, doctype, name);
                        if (target) {
                            return target;
                        }

                        if (
                            window.frappe &&
                            frappe.locals &&
                            frappe.locals[doctype] &&
                            frappe.locals[doctype][name]
                        ) {
                            return frappe.locals[doctype][name];
                        }
                    }
                } catch (e) {
                    console.warn("WMN offline get_doc adapter skipped", e);
                }

                if (typeof original_get_doc === "function") {
                    return original_get_doc.apply(this, arguments);
                }

                return null;
            };

            window.__wmn_offline_form_model_adapter_installed = true;
        }

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

            if (!doc) frappe.throw(wmn_t("No open invoice", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0641\u062A\u0648\u062D\u0629"));
            if (!doc.items || !doc.items.length) frappe.throw(wmn_t("Add at least one item before payment", "\u0623\u0636\u0641 \u0635\u0646\u0641\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0642\u0628\u0644 \u0627\u0644\u062F\u0641\u0639"));

            wmn_recalc_offline_payment_doc(doc);

            const total = flt(doc.rounded_total || doc.grand_total || 0);
            if (total <= 0) frappe.throw(wmn_t("Invoice total is zero", "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0635\u0641\u0631"));

            const payments = await wmn_ensure_offline_payment_rows(doc);
            const defaultPayment = payments.find(p => cint(p.default || 0) === 1) || payments[0];

            payments.forEach((p) => {
                p.amount = flt(p.amount || 0);
                p.base_amount = flt(p.base_amount || p.amount || 0);
            });

            const paidBefore = payments.reduce((s, p) => s + flt(p.amount || 0), 0);
            const difference = Math.max(0, total - paidBefore);
            
            //if (defaultPayment && paidBefore <= 0)
            if (defaultPayment && difference > 0 && !doc.__wmn_default_payment_autofilled ) {
                //defaultPayment.amount = total;
                //defaultPayment.base_amount = total;
                defaultPayment.amount = flt(defaultPayment.amount || 0) + difference;
                defaultPayment.base_amount = flt(defaultPayment.base_amount || 0) + difference;
                doc.__wmn_default_payment_autofilled = 1;
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
                    title: wmn_t("Payment", "\u0627\u0644\u062F\u0641\u0639"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "payment_html",
                            options: `
                                <div class="wmn-offline-payment-dialog" style="direction:inherit;">
                                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Grand Total", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}</div>
                                            <div style="font-weight:700;font-size:18px;">${format_currency(total, doc.currency || "YER")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Customer", "\u0627\u0644\u0639\u0645\u064A\u0644")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.customer_name || doc.customer || "")}</div>
                                        </div>
                                        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
                                            <div style="font-size:12px;color:#6b7280;">${wmn_t("Invoice", "\u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")}</div>
                                            <div style="font-weight:700;font-size:15px;">${frappe.utils.escape_html(doc.name || "")}</div>
                                        </div>
                                    </div>

                                    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;">
                                        ${rowsHtml || `<div class="text-muted">${wmn_t("No payment methods found", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0637\u0631\u0642 \u062F\u0641\u0639")}</div>`}
                                    </div>

                                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
                                        <div style="font-size:13px;color:#6b7280;">
                                            ${wmn_t("Complete Order will apply payment to the offline invoice then save it offline.", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0633\u064A\u0636\u064A\u0641 \u0627\u0644\u062F\u0641\u0639 \u0644\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u062B\u0645 \u064A\u062D\u0641\u0638\u0647\u0627 \u0623\u0648\u0641\u0644\u0627\u064A\u0646.")}
                                        </div>
                                        <div style="font-weight:700;">
                                            ${wmn_t("Paid", "\u0627\u0644\u0645\u062F\u0641\u0648\u0639")}: <span class="wmn-offline-paid-total">0</span>
                                        </div>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    primary_action_label: wmn_t("Complete Order", "\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0637\u0644\u0628"),
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
                                    title: wmn_t("Payment Required", "\u0627\u0644\u062F\u0641\u0639 \u0645\u0637\u0644\u0648\u0628"),
                                    indicator: "orange",
                                    message: wmn_t("Enter payment amount first", "\u0623\u062F\u062E\u0644 \u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u0623\u0648\u0644\u0627\u064B")
                                });
                                return;
                            }

                            doc.payments = payments.filter(p => flt(p.amount || 0) > 0 || p.mode_of_payment);
                            wmn_recalc_offline_payment_doc(doc);

                            if (flt(doc.paid_amount || 0) < flt(doc.rounded_total || doc.grand_total || 0)) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Amount", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639"),
                                    indicator: "orange",
                                    message: wmn_t("Payment amount is less than invoice total", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u0623\u0642\u0644 \u0645\u0646 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")
                                });
                                return;
                            }

                            d.hide();
                            resolve(doc);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    secondary_action_label: wmn_t("Cancel", "\u0625\u0644\u063A\u0627\u0621"),
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


function wmn_init_offline_invoice_manager_dialog(pos) {
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
                    synced: ["green", wmn_t("Synced", "\u062A\u0645\u062A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629")],
                    pending: ["orange", wmn_t("Pending", "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631")],
                    error: ["red", wmn_t("Error", "\u062E\u0637\u0623")],
                    failed: ["red", wmn_t("Failed", "\u0641\u0634\u0644")],
                    syncing: ["blue", wmn_t("Syncing", "\u062C\u0627\u0631\u064A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629")]
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

            async function updateInvoiceQueueRow(row) {
                if (!row || !row.offline_id) return row;
                await window.wmnPOSOffline.bulkPut(window.wmnPOSOffline.STORES.invoice_queue, [row]);
                return row;
            }

            async function syncOne(row) {
                if (!row) return;

                const invoice = getInvoiceDoc(row);
                if (!invoice) {
                    throw new Error("Offline invoice data is missing");
                }

                if (!window.wmnPOSOffline || !window.wmnPOSOffline.bulkPut) {
                    throw new Error("Offline invoice store is not available");
                }

                if (!frappe || !frappe.call) {
                    throw new Error("Server call is not available");
                }

                try {
                    if (typeof wmn_clean_doc_batch_serial_for_save === "function") {
                        await wmn_clean_doc_batch_serial_for_save(invoice);
                    }

                    row.status = "syncing";
                    row.last_try_at = new Date().toISOString();
                    row.invoice = invoice;
                    await updateInvoiceQueueRow(row);

                    const r = await frappe.call({
                        method: "wmn.api.sync_offline_pos_invoice",
                        args: { invoice: invoice },
                        freeze: false,
                    });

                    const result = (r && r.message) || {};
                    row.status = "synced";
                    row.synced_at = new Date().toISOString();
                    row.erpnext_name = result.name || result.erpnext_name || row.erpnext_name || "";
                    row.last_error = "";
                    await updateInvoiceQueueRow(row);
                    return row;
                } catch (e) {
                    row.status = "pending";
                    row.last_error = e.message || String(e);
                    row.last_try_at = new Date().toISOString();
                    row.invoice = invoice;
                    await updateInvoiceQueueRow(row);
                    throw e;
                }
            }

            async function editOfflineInvoice(row, dialog) {
                if (!row || !pos) return;

                const sourceDoc = getInvoiceDoc(row);
                if (!sourceDoc) {
                    frappe.msgprint({
                        title: wmn_t("Edit Offline Invoice", "تعديل فاتورة أوفلاين"),
                        indicator: "orange",
                        message: wmn_t("Offline invoice data is missing", "بيانات الفاتورة الأوفلاين غير موجودة")
                    });
                    return;
                }

                const doc = JSON.parse(JSON.stringify(sourceDoc || {}));
                doc.custom_offline_id = doc.custom_offline_id || row.offline_id || row.id || row.name || "";
                doc.__islocal = 1;
                doc.docstatus = 0;
                doc.__offline_pos = 1;
                doc.offline_pos = 1;

                window.__wmn_pos_effective_offline = true;

                if (pos.wmn_detach_current_frm_refresh_fields) {
                    try { pos.wmn_detach_current_frm_refresh_fields(); } catch (e) {}
                }

                pos.frm = wmn_make_offline_frm(doc);
                wmn_prepare_pos_frm_doc(pos);

                window.cur_frm = pos.frm;
                window.cur_pos = pos;

                if (dialog && dialog.hide) {
                    dialog.hide();
                }

                try {
                    if (pos.order_summary && pos.order_summary.toggle_component) {
                        pos.order_summary.toggle_component(false);
                    }
                    if (pos.recent_order_list && pos.recent_order_list.toggle_component) {
                        pos.recent_order_list.toggle_component(false);
                    }
                    if (pos.item_selector && pos.item_selector.toggle_component) {
                        pos.item_selector.toggle_component(true);
                    }
                    if (pos.cart && pos.cart.toggle_component) {
                        pos.cart.toggle_component(true);
                    }
                    wmn_safe_offline_cart_reload(pos);
                } catch (e) {
                    console.warn("WMN offline invoice edit UI reload skipped", e);
                }

                frappe.show_alert({
                    message: wmn_t("Offline invoice loaded for editing", "تم فتح الفاتورة الأوفلاين للتعديل"),
                    indicator: "orange"
                });
            }

            async function syncAll() {
                if (!window.wmnPOSOffline.syncInvoices || typeof window.wmnPOSOffline.syncInvoices !== "function") {
                    throw new Error("syncInvoices \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629");
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
                                    ${wmn_t("Sync", "\u0645\u0632\u0627\u0645\u0646\u0629")}
                                </button>
                                <button class="btn btn-xs btn-default wmn-edit-one" data-idx="${idx}">
                                    ${wmn_t("Edit", "تعديل")}
                                </button>
                                <button class="btn btn-xs btn-danger wmn-delete-one" data-idx="${idx}">
                                    ${wmn_t("Delete", "\u0645\u0633\u062D")}
                                </button>
                            </td>
                        </tr>
                    `;
                }).join("") : `
                    <tr>
                        <td colspan="6" style="text-align:center;color:#6b7280;padding:24px;">
                            ${wmn_t("No offline invoices saved", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0648\u0627\u062A\u064A\u0631 \u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0645\u062D\u0641\u0648\u0638\u0629")}
                        </td>
                    </tr>
                `;

                dialog.__wmn_rows = rows;

                dialog.$wrapper.find(".wmn-offline-invoices-count").text(rows.length);
                dialog.$wrapper.find(".wmn-offline-invoices-body").html(html);
            }

            async function openManagerDialog() {
                const d = new frappe.ui.Dialog({
                    title: wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"),
                    size: "extra-large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "offline_invoices_html",
                            options: `
                                <div class="wmn-offline-invoices-dialog" style="direction:inherit;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                                        <div>
                                            <div style="font-weight:700;font-size:16px;">${wmn_t("Invoices saved in IndexedDB", "\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0641\u064A IndexedDB")}</div>
                                            <div style="color:#6b7280;font-size:13px;">
                                                ${wmn_t("Count", "\u0627\u0644\u0639\u062F\u062F")}: <span class="wmn-offline-invoices-count">0</span>
                                            </div>
                                        </div>
                                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                            <button class="btn btn-sm btn-default wmn-refresh-list">${wmn_t("Refresh", "\u062A\u062D\u062F\u064A\u062B")}</button>
                                            <button class="btn btn-sm btn-primary wmn-sync-all">${wmn_t("Sync All", "\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0643\u0644")}</button>
                                            <button class="btn btn-sm btn-danger wmn-delete-all">${wmn_t("Delete All", "\u0645\u0633\u062D \u0627\u0644\u0643\u0644")}</button>
                                        </div>
                                    </div>

                                    <div style="max-height:65vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${wmn_t("Offline ID", "\u0631\u0642\u0645 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646")}</th>
                                                    <th>${wmn_t("Customer", "\u0627\u0644\u0639\u0645\u064A\u0644")}</th>
                                                    <th>${wmn_t("Total", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}</th>
                                                    <th>${wmn_t("Status", "\u0627\u0644\u062D\u0627\u0644\u0629")}</th>
                                                    <th>${wmn_t("Created", "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621")}</th>
                                                    <th style="text-align:left;">${wmn_t("Actions", "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A")}</th>
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
                        frappe.dom.freeze(wmn_t("Syncing offline invoices...", "\u062C\u0627\u0631\u064A \u0645\u0632\u0627\u0645\u0646\u0629 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646..."));
                        await syncAll();
                        frappe.dom.unfreeze();
                        frappe.show_alert({ message: wmn_t("Available invoices synced", "\u062A\u0645\u062A \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u062A\u0627\u062D\u0629"), indicator: "green" });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        frappe.dom.unfreeze();
                        console.error("WMN sync all offline invoices failed", e);
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629"),
                            indicator: "red",
                            message: __("\u062A\u0639\u0630\u0631\u062A \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0643\u0644: {0}", [e.message || e])
                        });
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-all", async () => {
                    const rows = d.__wmn_rows || [];
                    if (!rows.length) return;

                    frappe.confirm(
                        wmn_t("Delete all offline invoices from IndexedDB?", "\u0647\u0644 \u062A\u0631\u064A\u062F \u0645\u0633\u062D \u0643\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0645\u0646 IndexedDB\u061F"),
                        async () => {
                            try {
                                frappe.dom.freeze(wmn_t("Deleting...", "\u062C\u0627\u0631\u064A \u0627\u0644\u0645\u0633\u062D..."));
                                for (const row of rows) {
                                    await deleteInvoiceQueueRow(row);
                                }
                                frappe.dom.unfreeze();
                                frappe.show_alert({ message: wmn_t("All offline invoices deleted", "\u062A\u0645 \u0645\u0633\u062D \u0643\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.dom.unfreeze();
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "\u0641\u0634\u0644 \u0627\u0644\u0645\u0633\u062D"),
                                    indicator: "red",
                                    message: wmn_msg("Delete failed: {0}", "\u062A\u0639\u0630\u0631 \u0627\u0644\u0645\u0633\u062D: {0}", [e.message || e])
                                });
                            }
                        }
                    );
                });

                d.$wrapper.on("click", ".wmn-edit-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    await editOfflineInvoice(row, d);
                });

                d.$wrapper.on("click", ".wmn-sync-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    try {
                        frappe.dom.freeze(__("Syncing invoice..."));
                        await syncOne(row);
                        frappe.dom.unfreeze();
                        frappe.show_alert({ message: wmn_t("Invoice sync attempted", "\u062A\u0645\u062A \u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"), indicator: "green" });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        frappe.dom.unfreeze();
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "\u0641\u0634\u0644\u062A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629"),
                            indicator: "red",
                            message: wmn_msg("Failed to sync invoice: {0}", "\u062A\u0639\u0630\u0631\u062A \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: {0}", [e.message || e])
                        });
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    frappe.confirm(
                        wmn_t("Delete this invoice from IndexedDB?", "\u0647\u0644 \u062A\u0631\u064A\u062F \u0645\u0633\u062D \u0647\u0630\u0647 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0646 IndexedDB\u061F"),
                        async () => {
                            try {
                                await deleteInvoiceQueueRow(row);
                                frappe.show_alert({ message: wmn_t("Invoice deleted", "\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "\u0641\u0634\u0644 \u0627\u0644\u0645\u0633\u062D"),
                                    indicator: "red",
                                    message: wmn_msg("Failed to delete invoice: {0}", "\u062A\u0639\u0630\u0631 \u0645\u0633\u062D \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: {0}", [e.message || e])
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
                            pos.page.add_inner_button(wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), () => openManagerDialog(), __("Offline"));
                            pos.page.add_inner_button(wmn_t("Printer", "الطابعة"), () => wmn_show_printer_settings_dialog(), __("Offline"));
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
                            ${wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646")}
                        </button>
                    `);

                    $btn.on("click", () => openManagerDialog());

                    const $printerBtn = $(`
                        <button class="btn btn-sm btn-default wmn-printer-settings-btn" style="margin-inline-start:6px;">
                            ${wmn_t("Printer", "الطابعة")}
                        </button>
                    `);

                    $printerBtn.on("click", () => wmn_show_printer_settings_dialog());

                    $target.append($btn);
                    $target.append($printerBtn);
                    pos.__wmn_invoice_manager_button_v5 = true;
                    return true;
                };

                if (!add()) {
                    let attempts = 0;
                    const retry = () => {
                        attempts += 1;
                        if (add() || attempts >= 6) return;
                        setTimeout(retry, 500);
                    };
                    setTimeout(retry, 500);
                }
            }

            window.wmnPOSOffline.openInvoiceManagerDialog = openManagerDialog;
            window.wmnPOSOffline.deleteInvoiceQueueRow = deleteInvoiceQueueRow;

            addManagerButton(pos || window.cur_pos);

            window.wmnPOSOffline.__wmn_invoice_manager_dialog_v5 = true;
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


        function wmn_base64_utf8(value) {
            try {
                return btoa(unescape(encodeURIComponent(String(value || ""))));
            } catch (e) {
                try {
                    return btoa(String(value || ""));
                } catch (_e) {
                    return "";
                }
            }
        }

        function wmn_wrap_offline_receipt_html(html, doc) {
            return `
                <!doctype html>
                <html>
                    <head>
                        <meta charset="utf-8">
                        <title>${frappe.utils.escape_html((doc && (doc.name || doc.custom_offline_id)) || "Offline Receipt")}</title>
                        <style>
                            body { font-family: Arial, sans-serif; direction: rtl; font-size: 12px; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { border-bottom: 1px solid #ddd; padding: 4px; text-align: right; }
                            @media print { body { margin: 0; } }
                        </style>
                    </head>
                    <body>${html || ""}</body>
                </html>
            `;
        }

        function wmn_format_offline_raw_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return currency ? (amount + " " + currency) : amount;
        }

        function wmn_raw_receipt_pad_left(value, width) {
            value = String(value == null ? "" : value);
            if (value.length >= width) return value.slice(0, width);
            return " ".repeat(width - value.length) + value;
        }

        function wmn_raw_receipt_pad_right(value, width) {
            value = String(value == null ? "" : value);
            if (value.length >= width) return value.slice(0, width);
            return value + " ".repeat(width - value.length);
        }

        function wmn_raw_receipt_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return currency ? (amount + " " + currency) : amount;
        }

        function wmn_raw_receipt_label_amount(label, amount, currency) {
            const width = 42;
            const left = String(label || "");
            const right = wmn_raw_receipt_money(amount || 0, currency || "");
            const space = Math.max(1, width - left.length - right.length);
            return left + " ".repeat(space) + right;
        }

        function wmn_raw_receipt_center(text) {
            const width = 42;
            text = String(text || "");
            if (text.length >= width) return text;
            const left = Math.floor((width - text.length) / 2);
            return " ".repeat(left) + text;
        }

        function wmn_raw_receipt_line() {
            return "------------------------------------------";
        }

function wmn_raw_template_get_value(source, path) {
    source = source || {};
    path = String(path || "").trim();
    if (!path) return "";

    const parts = path.split(".");
    let cur = source;

    for (const part of parts) {
        const key = String(part || "").trim();
        if (!key) continue;
        if (cur === undefined || cur === null) return "";
        cur = cur[key];
    }

    if (cur === undefined || cur === null) return "";
    if (typeof cur === "number") return String(cur);
    if (typeof cur === "boolean") return cur ? "1" : "";
    if (typeof cur === "object") return JSON.stringify(cur);
    return String(cur);
}

function wmn_prepare_raw_template_doc(doc) {
    doc = doc || {};

    const postingTime = String(doc.posting_time || "");
    const postingDate = String(doc.posting_date || "");

    doc._wmn_date = doc._wmn_date || postingDate;
    doc._wmn_time_hm = doc._wmn_time_hm || postingTime.substring(0, 5);
    doc._wmn_time_hms = doc._wmn_time_hms || postingTime.substring(0, 8);
    doc._wmn_cashier = doc._wmn_cashier || doc.owner || (frappe.session && frappe.session.user) || "";
    doc._wmn_customer = doc._wmn_customer || doc.customer_name || doc.customer || "";
    doc._wmn_grand_total = doc._wmn_grand_total || doc.grand_total || doc.rounded_total || 0;
    doc._wmn_paid_amount = doc._wmn_paid_amount || doc.paid_amount || 0;

    return doc;
}

function wmn_replace_raw_object_fields(html, alias, row) {
    const re = new RegExp("{{\\\\s*" + alias + "\\\\.([a-zA-Z0-9_]+(?:\\\\.[a-zA-Z0-9_]+)*)\\\\s*}}", "g");
    return String(html || "").replace(re, function (_match, path) {
        return wmn_raw_template_get_value(row, path);
    });
}

function wmn_replace_raw_doc_fields(html, doc) {
    return wmn_replace_raw_object_fields(html, "doc", doc || {});
}

function wmn_render_raw_print_temp(template, doc) {

    doc = doc || {};
    const currency = doc.currency || doc.company_currency || "YER";

    function rawValue(value) {
        if (value === undefined || value === null) return "";
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return value ? "1" : "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    }

    function moneyValue(value) {
        return flt(value || 0).toFixed(2) + (currency ? " " + currency : "");
    }

    function numberValue(value, digits) {
        return flt(value || 0).toFixed(digits == null ? 2 : cint(digits));
    }

    function padLeft(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        return " ".repeat(width - value.length) + value;
    }

    function padRight(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        return value + " ".repeat(width - value.length);
    }

    function padCenter(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        const total = width - value.length;
        const left = Math.floor(total / 2);
        const right = total - left;
        return " ".repeat(left) + value + " ".repeat(right);
    }

    function getPath(scope, path) {
        path = String(path || "").trim();
        if (!path) return "";

        if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
            return path.slice(1, -1);
        }

        if (/^-?\d+(\.\d+)?$/.test(path)) return flt(path);

        const parts = path.split(".").map(x => x.trim()).filter(Boolean);
        let cur = scope;
        for (const part of parts) {
            if (cur == null) return "";
            cur = cur[part];
        }
        return cur == null ? "" : cur;
    }

    function applyFilters(value, filters) {
        let out = value;
        (filters || []).forEach(function(filterRaw) {
            const filter = String(filterRaw || "").trim();
            if (!filter) return;

            let m = filter.match(/^(l|left)(\d+)$/i);
            if (m) { out = padRight(out, m[2]); return; }

            m = filter.match(/^(r|right)(\d+)$/i);
            if (m) { out = padLeft(out, m[2]); return; }

            m = filter.match(/^(c|center)(\d+)$/i);
            if (m) { out = padCenter(out, m[2]); return; }

            if (/^(money|currency)$/i.test(filter)) { out = moneyValue(out); return; }
            if (/^(number|f2)$/i.test(filter)) { out = numberValue(out, 2); return; }
            if (/^(qty|f1)$/i.test(filter)) { out = numberValue(out, 1); return; }
            if (/^int$/i.test(filter)) { out = String(cint(out || 0)); return; }
            if (/^hm$/i.test(filter)) { out = rawValue(out).substring(0, 5); return; }
            if (/^hms$/i.test(filter)) { out = rawValue(out).substring(0, 8); return; }
            if (/^upper$/i.test(filter)) { out = rawValue(out).toUpperCase(); return; }
            if (/^lower$/i.test(filter)) { out = rawValue(out).toLowerCase(); return; }
        });
        return rawValue(out);
    }

    function renderExpression(expr, scope) {
        expr = String(expr || "").trim();
        if (!expr) return "";

        if (/^_\(['"]([^'"]+)['"]\)$/.test(expr)) {
            return __(expr.match(/^_\(['"]([^'"]+)['"]\)$/)[1]);
        }

        const parts = expr.split("|").map(x => x.trim());
        const base = parts.shift();
        const value = getPath(scope, base);
        return applyFilters(value, parts);
    }

    function evalCondition(condition, scope) {
        condition = String(condition || "").trim();
        if (!condition) return false;
        if (condition.startsWith("not ")) return !evalCondition(condition.slice(4), scope);
        if (condition.indexOf(" and ") !== -1) return condition.split(/\s+and\s+/).every(x => evalCondition(x, scope));
        if (condition.indexOf(" or ") !== -1) return condition.split(/\s+or\s+/).some(x => evalCondition(x, scope));

        let m = condition.match(/^(.*?)\s*!=\s*(.*?)$/);
        if (m) return rawValue(getPath(scope, m[1])) !== rawValue(getPath(scope, m[2]));

        m = condition.match(/^(.*?)\s*==\s*(.*?)$/);
        if (m) return rawValue(getPath(scope, m[1])) === rawValue(getPath(scope, m[2]));

        return !!getPath(scope, condition);
    }

    function renderBlock(text, scope) {
        text = String(text || "");

        text = text.replace(
            /\{%-?\s*for\s+(\w+)\s+in\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}/g,
            function (_m, varName, collectionExpr, body) {
                const rows = getPath(scope, collectionExpr.trim()) || [];
                if (!Array.isArray(rows)) return "";
                return rows.map(function(row) {
                    const childScope = Object.assign({}, scope);
                    childScope[varName] = row || {};
                    return renderBlock(body, childScope);
                }).join("");
            }
        );

        text = text.replace(
            /\{%-?\s*if\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g,
            function (_m, condition, body) {
                return evalCondition(condition, scope) ? renderBlock(body, scope) : "";
            }
        );

        text = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_m, expr) {
            return renderExpression(expr, scope);
        });

        return text;
    }

    doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || doc.name || "";
    doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
    doc.posting_time_hm = String(doc.posting_time || "").substring(0, 5);
    doc.posting_time_hms = String(doc.posting_time || "").substring(0, 8);

    let html = renderBlock(template || "", { doc: doc });
    html = html.replace(/\{%-?[\s\S]*?-?%\}/g, "");
    html = html.replace(/<[^>]*>/g, "");

    const cleanedLines = [];
    let lastWasEmpty = false;
    String(html || "").replace(/\r/g, "").split("\n").forEach(function(line) {
        line = line.replace(/[\t ]+$/g, "");
        const isEmpty = line.trim() === "";
        if (isEmpty && lastWasEmpty) return;
        cleanedLines.push(line);
        lastWasEmpty = isEmpty;
    });

    return cleanedLines.join("\n").trim();

}

        function wmn_build_offline_raw_receipt_text(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const currency = doc.currency || settings.currency || "";
            const lines = [];

            const company = doc.company || settings.company || "";
            const heading = doc.select_print_heading || "Invoice";
            const receiptNo = doc.name || doc.custom_offline_id || "";
            const cashier = doc.owner || frappe.session.user || "";
            const customer = doc.customer_name || doc.customer || "";
            const postingDate = doc.posting_date || frappe.datetime.get_today();
            const postingTime = doc.posting_time || "";

            if (company) lines.push(wmn_raw_receipt_center(company));
            lines.push(wmn_raw_receipt_center(heading));
            lines.push("");

            lines.push("Receipt No: " + receiptNo);
            lines.push("Cashier: " + cashier);
            lines.push("Customer: " + customer);
            lines.push("Date: " + postingDate);
            if (postingTime) lines.push("Time: " + postingTime);

            lines.push(wmn_raw_receipt_line());
            lines.push(
                wmn_raw_receipt_pad_right("Item", 20) +
                wmn_raw_receipt_pad_left("Qty", 7) +
                wmn_raw_receipt_pad_left("Amount", 15)
            );
            lines.push(wmn_raw_receipt_line());

            (doc.items || []).forEach(function (item) {
                const code = item.item_code || "";
                const name = item.item_name || "";
                const label = code || name;
                const qtyRate = flt(item.qty || 0) + " @ " + wmn_raw_receipt_money(item.rate || 0, currency);
                const amount = wmn_raw_receipt_money(item.amount || item.net_amount || 0, currency);

                lines.push(
                    wmn_raw_receipt_pad_right(label, 20) +
                    wmn_raw_receipt_pad_left(flt(item.qty || 0), 7) +
                    wmn_raw_receipt_pad_left(amount, 15)
                );

                if (name && name !== code) {
                    lines.push("  " + name);
                }

                lines.push("  @ " + wmn_raw_receipt_money(item.rate || 0, currency));

                if (item.serial_no) {
                    lines.push("  SR.No: " + String(item.serial_no || "").replace(/\n/g, ", "));
                }
            });

            lines.push(wmn_raw_receipt_line());

            if (doc.flags && doc.flags.show_inclusive_tax_in_print) {
                lines.push(wmn_raw_receipt_label_amount("Total Excl. Tax", doc.net_total || 0, currency));
            } else {
                lines.push(wmn_raw_receipt_label_amount("Total", doc.total || doc.net_total || 0, currency));
            }

            (doc.taxes || []).forEach(function (row) {
                if (row.included_in_print_rate && !(doc.flags && doc.flags.show_inclusive_tax_in_print)) {
                    return;
                }

                const amount = flt(row.tax_amount_after_discount_amount || row.tax_amount || 0);
                if (!amount) return;

                let description = row.description || row.account_head || "Tax";
                if (description.indexOf("%") === -1 && flt(row.rate || 0)) {
                    description = description + "@" + flt(row.rate || 0) + "%";
                }

                lines.push(wmn_raw_receipt_label_amount(description, amount, currency));
            });

            if (flt(doc.discount_amount || 0)) {
                lines.push(wmn_raw_receipt_label_amount("Discount", doc.discount_amount || 0, currency));
            }

            lines.push(wmn_raw_receipt_label_amount("Grand Total", doc.grand_total || 0, currency));

            if (flt(doc.rounded_total || 0)) {
                lines.push(wmn_raw_receipt_label_amount("Rounded Total", doc.rounded_total || 0, currency));
            }

            (doc.payments || []).forEach(function (row) {
                if (!row || !row.mode_of_payment) return;
                lines.push(wmn_raw_receipt_label_amount(row.mode_of_payment, row.amount || 0, currency));
            });

            lines.push(wmn_raw_receipt_label_amount("Paid Amount", doc.paid_amount || 0, currency));

            if (flt(doc.change_amount || 0)) {
                lines.push(wmn_raw_receipt_label_amount("Change Amount", doc.change_amount || 0, currency));
            }

            lines.push(wmn_raw_receipt_line());

            if (doc.terms) {
                lines.push(String(doc.terms || ""));
            }

            lines.push(wmn_raw_receipt_center("Thank you, please visit again."));
            lines.push("\n\n\n");

            return lines.filter(function (line) {
                return line !== null && line !== undefined;
            }).join("\n");
        }

        function wmn_truthy_setting(value) {
            if (value === true || value === 1) return true;
            const s = String(value == null ? "" : value).trim().toLowerCase();
            return ["1", "true", "yes", "y", "on", "enabled", "enable"].includes(s);
        }

        function wmn_pick_first_setting(source, names) {
            source = source || {};
            for (const name of names || []) {
                if (Object.prototype.hasOwnProperty.call(source, name)) {
                    return source[name];
                }
            }
            return undefined;
        }

        async function wmn_get_cached_wmn_print_format(formatName) {
            try {
                if (!window.wmnPOSOffline || !window.wmnPOSOffline.getSetting) return null;

                let cached = null;
                if (formatName) {
                    cached = await window.wmnPOSOffline.getSetting("wmn_print_format::" + formatName);
                }
                if (!cached) {
                    cached = await window.wmnPOSOffline.getSetting("wmn_print_format");
                }
                return cached || null;
            } catch (e) {
                return null;
            }
        }

        function wmn_get_raw_value(scope, path) {
            path = String(path || "").trim();
            if (!path) return "";

            const parts = path.split(".");
            let cur = scope;

            for (const part of parts) {
                const key = String(part || "").trim();
                if (!key) continue;
                if (cur == null) return "";
                cur = cur[key];
            }

            return cur == null ? "" : cur;
        }

        function wmn_split_raw_args(argsText) {
            const args = [];
            let cur = "";
            let quote = "";
            let depth = 0;
            const text = String(argsText || "");

            for (let i = 0; i < text.length; i++) {
                const ch = text[i];

                if (quote) {
                    cur += ch;
                    if (ch === quote && text[i - 1] !== "\\") quote = "";
                    continue;
                }

                if (ch === "'" || ch === '"') {
                    quote = ch;
                    cur += ch;
                    continue;
                }

                if (ch === "(") depth += 1;
                if (ch === ")") depth = Math.max(0, depth - 1);

                if (ch === "," && depth === 0) {
                    args.push(cur.trim());
                    cur = "";
                    continue;
                }

                cur += ch;
            }

            if (cur.trim() || text.trim()) args.push(cur.trim());
            return args;
        }

        function wmn_raw_width(value) {
            return Array.from(String(value || "")).length;
        }

        function wmn_raw_clip(value, width) {
            return Array.from(String(value || "")).slice(0, Math.max(0, width)).join("");
        }

        async function wmn_get_raw_print_template(doc) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const formatName = settings.print_format || (doc && doc.print_format) || "";
            const printFormat = await wmn_get_cached_wmn_print_format(formatName) || {};

            let printFormatDoc = null;
            const printFormatName =
                printFormat.print_format_name ||
                printFormat.wmn_print_format ||
                printFormat.print_format ||
                formatName ||
                "";

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                    if (printFormatName) {
                        printFormatDoc = await window.wmnPOSOffline.getSetting("print_format_doc::" + printFormatName);
                    }
                    if (!printFormatDoc) {
                        printFormatDoc = await window.wmnPOSOffline.getSetting("print_format_doc");
                    }
                }
            } catch (e) {
                printFormatDoc = null;
            }

            if (!printFormat.print_format_doc && printFormatDoc) {
                printFormat.print_format_doc = printFormatDoc;
            }


            const template =
                printFormat.raw_template_code ||
                printFormat.raw_template ||
                printFormat.raw_receipt_template ||
                (printFormat.print_format_doc && printFormat.print_format_doc.raw_template_code) ||
                (printFormatDoc && printFormatDoc.raw_template_code) ||
                printFormat.print_format_html ||
                printFormat.html ||
                printFormat.custom_html ||
                printFormat.html_template_code ||
                printFormat.html_receipt_template ||
                printFormat.offline_html_template ||
                printFormat.receipt_html_template ||
                (printFormat.print_format_doc && (
                    printFormat.print_format_doc.html ||
                    printFormat.print_format_doc.custom_html ||
                    printFormat.print_format_doc.print_format ||
                    printFormat.print_format_doc.format_data
                )) ||
                (printFormatDoc && (
                    printFormatDoc.html ||
                    printFormatDoc.custom_html ||
                    printFormatDoc.print_format ||
                    printFormatDoc.format_data
                )) ||
                "";

            return {
                printFormat,
                printFormatDoc,
                template,
                printType: (
                    printFormat.default_print_type ||
                    printFormat.print_type ||
                    "RECEIPT"
                )
            };
        }

        function wmn_is_js_print_format(printFormat) {
            printFormat = printFormat || {};

            const doc = printFormat.print_format_doc || {};
            const type = String(
                printFormat.print_format_type ||
                printFormat.format_type ||
                doc.print_format_type ||
                doc.format_type ||
                ""
            ).toLowerCase();

            return type === "js" || type === "javascript";
        }

        function wmn_render_raw_print_template(template, doc, printFormat) {
            template = String(template || "");
            doc = doc || {};
            printFormat = printFormat || {};

            function wmn_format_print_value(value, fieldname, parentDoc) {
                const currency = (parentDoc && parentDoc.currency) || doc.currency || "";
                if (value === undefined || value === null) return "";
                try {
                    const meta = parentDoc && parentDoc.doctype && frappe.meta
                        ? frappe.meta.get_field(parentDoc.doctype, fieldname)
                        : null;
                    if (meta && meta.fieldtype === "Currency") {
                        return format_currency(flt(value || 0), currency);
                    }
                    if (meta && meta.fieldtype === "Date") {
                        return frappe.datetime.str_to_user(value);
                    }
                } catch (e) {}
                if (typeof value === "number") return money(value);
                return String(value);
            }

            function attachGetFormatted(obj, parentDoc) {
                if (!obj || typeof obj !== "object" || obj.get_formatted) return obj;
                Object.defineProperty(obj, "get_formatted", {
                    enumerable: false,
                    configurable: true,
                    value: function(fieldname) {
                        return wmn_format_print_value(this[fieldname], fieldname, parentDoc || doc);
                    }
                });
                return obj;
            }

            attachGetFormatted(doc, doc);
            (doc.items || []).forEach(function(row){ attachGetFormatted(row, doc); });
            (doc.taxes || []).forEach(function(row){ attachGetFormatted(row, doc); });
            (doc.payments || []).forEach(function(row){ attachGetFormatted(row, doc); });
            doc.flags = doc.flags || {};

            /*
             * Prefer Frappe's real print-format renderer when available.
             * This keeps the HTML/CSS/Jinja print format as the source of truth.
             * The lightweight renderer below remains only as a fallback for offline edge cases.
             */
            try {
                if (window.frappe && typeof frappe.render_template === "function") {
                    const rendered = frappe.render_template(template, {
                        doc: doc,
                        letter_head: "",
                        no_letterhead: 1,
                        _: window.__ || function(v) { return v; },
                        frappe: window.frappe,
                        cur_pos: window.cur_pos
                    });

                    if (rendered && String(rendered).trim()) {
                        return String(rendered).trim();
                    }
                }
            } catch (e) {
                console.warn("WMN print format render_template fallback", e);
            }

            function money(value) {
                const n = parseFloat(value);
                return isNaN(n) ? "0.00" : n.toFixed(2);
            }

            function raw(value) {
                return value == null ? "" : String(value);
            }

            function getValue(obj, path) {
                path = String(path || "").trim();
                if (!path) return "";

                const parts = path.split(".");
                let current = obj;

                for (const part of parts) {
                    const key = String(part || "").trim();
                    if (!key) continue;
                    if (current == null) return "";
                    current = current[key];
                }

                return current == null ? "" : current;
            }

            function formatValue(value) {
                if (value == null) return "";
                if (typeof value === "number") return String(value);
                if (typeof value === "boolean") return value ? "1" : "";
                if (typeof value === "object") return JSON.stringify(value);
                return String(value);
            }

            const helpers = { money, raw };

            function evalSafeJS(expr, scope) {
                try {
                    return Function(
                        "doc",
                        "money",
                        "raw",
                        "__",
                        "format_currency",
                        "flt",
                        "return (" + expr + ");"
                    )(scope.doc, money, raw, __, format_currency, flt);
                } catch (e) {
                    return undefined;
                }
            }

            function evalExpr(expr, scope) {
                expr = String(expr || "").trim();
                if (!expr) return "";

                expr = expr.replace(/\s*\|\s*replace\("\\n"\s*,\s*",\s*"\)\s*$/, ".__replace_newline_comma");

                let replaceNewline = false;
                if (expr.endsWith(".__replace_newline_comma")) {
                    replaceNewline = true;
                    expr = expr.replace(".__replace_newline_comma", "");
                }

                if (expr === '_("Invoice")') return __("Invoice");
                if (expr === '_("Thank you, please visit again.")') return __("Thank you, please visit again.");

                if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
                    return expr.slice(1, -1);
                }

                if (/^-?\d+(\.\d+)?$/.test(expr)) return flt(expr);

                if (expr.indexOf(".get_formatted(") !== -1 || expr.indexOf("?") !== -1) {
                    const jsValue = evalSafeJS(expr, scope);
                    if (jsValue !== undefined) return jsValue;
                }

                if (expr.indexOf("||") !== -1) {
                    const options = expr.split(/\s*\|\|\s*/);
                    for (const opt of options) {
                        const v = evalExpr(opt.trim(), scope);
                        if (v) return v;
                    }
                    return "";
                }

                if (expr.indexOf(" or ") !== -1) {
                    const options = expr.split(/\s+or\s+/);
                    for (const opt of options) {
                        const v = evalExpr(opt.trim(), scope);
                        if (v) return v;
                    }
                    return "";
                }

                if (expr.indexOf("~") !== -1) {
                    return expr.split("~").map(part => formatValue(evalExpr(part.trim(), scope))).join("");
                }

                const fnMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
                if (fnMatch && helpers[fnMatch[1]]) {
                    const args = wmn_split_raw_args(fnMatch[2]).map(arg => evalExpr(arg, scope));
                    return helpers[fnMatch[1]].apply(null, args);
                }

                let value = getValue(scope, expr);
                if (replaceNewline) value = String(value || "").replace(/\n/g, ", ");
                return value;
            }

            function evalCondition(expr, scope) {
                expr = String(expr || "").trim();
                if (!expr) return false;

                if (expr.indexOf(".get_formatted(") !== -1 || expr.indexOf("?") !== -1) {
                    const jsValue = evalSafeJS(expr, scope);
                    if (jsValue !== undefined) return !!jsValue;
                }

                if (expr.startsWith("not ")) return !evalCondition(expr.slice(4), scope);
                if (expr.indexOf(" and ") !== -1) return expr.split(/\s+and\s+/).every(part => evalCondition(part, scope));
                if (expr.indexOf(" or ") !== -1) return expr.split(/\s+or\s+/).some(part => evalCondition(part, scope));
                if (expr.indexOf("||") !== -1) return expr.split(/\s*\|\|\s*/).some(part => evalCondition(part, scope));

                let m = expr.match(/^(.*?)\s+not\s+in\s+(.*?)$/);
                if (m) return String(evalExpr(m[2], scope)).indexOf(String(evalExpr(m[1], scope))) === -1;

                m = expr.match(/^(.*?)\s+in\s+(.*?)$/);
                if (m) return String(evalExpr(m[2], scope)).indexOf(String(evalExpr(m[1], scope))) !== -1;

                m = expr.match(/^(.*?)\s*!=\s*(.*?)$/);
                if (m) return String(evalExpr(m[1], scope)) !== String(evalExpr(m[2], scope));

                m = expr.match(/^(.*?)\s*==\s*(.*?)$/);
                if (m) return String(evalExpr(m[1], scope)) === String(evalExpr(m[2], scope));

                return !!evalExpr(expr, scope);
            }

            function renderBlock(text, scope) {
                text = String(text || "");

                text = text.replace(
                    /\{%-?\s*for\s+(\w+)\s+in\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}/g,
                    function (_m, varName, collectionExpr, body) {
                        const rows = evalExpr(collectionExpr.trim(), scope) || [];
                        if (!Array.isArray(rows)) return "";

                        return rows.map(function (rowObj) {
                            const childScope = Object.assign({}, scope);
                            childScope[varName] = rowObj;
                            return renderBlock(body, childScope);
                        }).join("");
                    }
                );

                text = text.replace(
                    /\{%-?\s*if\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g,
                    function (_m, condition, body) {
                        return evalCondition(condition, scope) ? renderBlock(body, scope) : "";
                    }
                );

                text = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_m, expr) {
                    return formatValue(evalExpr(expr, scope));
                });

                return text;
            }

            // HTML receipt renderer: keep HTML/CSS/images as-is. Avoid remote images in offline mode.
            let output = renderBlock(template, { doc });
            output = output.replace(/\{%-?[\s\S]*?-?%\}/g, "");
            return output.trim();
        }

        function wmn_mm_to_pt(mm) {
            return flt(mm || 0) * 72 / 25.4;
        }

        function wmn_pdf_money(value) {
            const n = parseFloat(value);
            return isNaN(n) ? "0.00" : n.toFixed(2);
        }

        function wmn_pdf_text(value) {
            if (value === undefined || value === null) return "";
            return String(value);
        }

        function wmn_pdf_strip_html(value) {
            const div = document.createElement("div");
            div.innerHTML = String(value || "");
            return (div.innerText || div.textContent || "").trim();
        }

        function wmn_pdf_get_currency(doc) {
            return doc.currency || doc.company_currency || "";
        }

        function wmn_pdf_build_items_table(doc) {
            const body = [[
                { text: "Item", bold: true },
                { text: "Qty", bold: true, alignment: "right" },
                { text: "Amount", bold: true, alignment: "right" }
            ]];

            (doc.items || []).forEach(function (item) {
                const itemTitle =
                    item.item_name ||
                    item.item_code ||
                    "";

                const rateLine = "@ " + wmn_pdf_money(item.rate || 0) + (wmn_pdf_get_currency(doc) ? " " + wmn_pdf_get_currency(doc) : "");

                body.push([
                    {
                        stack: [
                            { text: wmn_pdf_text(itemTitle), margin: [0, 0, 0, 1] },
                            { text: rateLine, fontSize: 8, color: "#444" },
                            item.serial_no ? { text: "SR.No: " + String(item.serial_no).replace(/\n/g, ", "), fontSize: 8 } : { text: "" }
                        ]
                    },
                    { text: wmn_pdf_text(item.qty || 0), alignment: "right" },
                    { text: wmn_pdf_money(item.amount || 0), alignment: "right" }
                ]);
            });

            return {
                table: {
                    headerRows: 1,
                    widths: ["*", 35, 55],
                    body: body
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0; },
                    hLineColor: function () { return "#999"; },
                    paddingLeft: function () { return 0; },
                    paddingRight: function () { return 0; },
                    paddingTop: function () { return 3; },
                    paddingBottom: function () { return 3; }
                },
                margin: [0, 6, 0, 6]
            };
        }

        function wmn_pdf_detail_row(label, value, opts) {
            opts = opts || {};
            return [
                { text: wmn_pdf_text(label), bold: !!opts.bold },
                { text: wmn_pdf_text(value), alignment: "right", bold: !!opts.bold }
            ];
        }

        function wmn_pdf_build_totals_table(doc) {
            const currency = wmn_pdf_get_currency(doc);
            const withCur = function (v) {
                return wmn_pdf_money(v || 0) + (currency ? " " + currency : "");
            };

            const body = [];

            body.push(wmn_pdf_detail_row("Total", withCur(doc.total || doc.net_total || 0)));

            (doc.taxes || []).forEach(function (tax) {
                const amount = flt(tax.tax_amount || 0);
                if (!amount) return;

                let label = tax.description || tax.account_head || "Tax";
                if (tax.rate && String(label).indexOf("%") === -1 && String(label).indexOf("@") === -1) {
                    label += " @" + wmn_pdf_money(tax.rate) + "%";
                }

                body.push(wmn_pdf_detail_row(label, withCur(amount)));
            });

            if (flt(doc.discount_amount || 0)) {
                body.push(wmn_pdf_detail_row("Discount", withCur(doc.discount_amount)));
            }

            body.push(wmn_pdf_detail_row("Grand Total", withCur(doc.grand_total || doc.rounded_total || 0), { bold: true }));

            if (flt(doc.rounded_total || 0)) {
                body.push(wmn_pdf_detail_row("Rounded Total", withCur(doc.rounded_total), { bold: true }));
            }

            (doc.payments || []).forEach(function (p) {
                if (!flt(p.amount || 0)) return;
                body.push(wmn_pdf_detail_row(p.mode_of_payment || "Payment", withCur(p.amount)));
            });

            body.push(wmn_pdf_detail_row("Paid Amount", withCur(doc.paid_amount || doc.grand_total || 0), { bold: true }));

            if (flt(doc.change_amount || 0)) {
                body.push(wmn_pdf_detail_row("Change Amount", withCur(doc.change_amount), { bold: true }));
            }

            return {
                table: {
                    widths: ["*", 75],
                    body: body
                },
                layout: "noBorders",
                margin: [0, 4, 0, 4]
            };
        }

        function wmn_build_pdfmake_receipt_definition(doc, printFormat) {
            doc = doc || {};
            printFormat = printFormat || {};

            const pageWidth = wmn_mm_to_pt(wmn_get_pdf_paper_width_mm(printFormat));
            const pageMargins = [8, 8, 8, 8];
            const receiptNo = doc.wmn_receipt_no || doc.__wmn_receipt_no || doc.name || "";
            const heading = doc.select_print_heading || "Invoice";

            const content = [
                { text: wmn_pdf_text(doc.company || ""), alignment: "center", bold: true, fontSize: 12, margin: [0, 0, 0, 2] },
                { text: wmn_pdf_text(heading), alignment: "center", bold: true, fontSize: 10, margin: [0, 0, 0, 8] },
                {
                    table: {
                        widths: [55, "*"],
                        body: [
                            ["Receipt No", wmn_pdf_text(receiptNo)],
                            ["Cashier", wmn_pdf_text(doc.owner || "")],
                            ["Customer", wmn_pdf_text(doc.customer_name || doc.customer || "")],
                            ["Date", wmn_pdf_text(doc.posting_date || "")],
                            ["Time", wmn_pdf_text(doc.posting_time || "")]
                        ]
                    },
                    layout: "noBorders",
                    fontSize: 8,
                    margin: [0, 0, 0, 6]
                },
                wmn_pdf_build_items_table(doc),
                wmn_pdf_build_totals_table(doc)
            ];

            const terms = wmn_pdf_strip_html(doc.terms || "");
            if (terms) {
                content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth - pageMargins[0] - pageMargins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] });
                content.push({ text: terms, fontSize: 8, margin: [0, 2, 0, 6] });
            }

            content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth - pageMargins[0] - pageMargins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 6] });
            content.push({ text: "Thank you, please visit again.", alignment: "center", fontSize: 9, margin: [0, 2, 0, 0] });

            return {
                pageSize: {
                    width: pageWidth,
                    height: "auto"
                },
                pageMargins: pageMargins,
                content: content,
                defaultStyle: {
                    font: (printFormat.pdf_font || printFormat.font || "Roboto"),
                    fontSize: cint(printFormat.pdf_font_size || printFormat.font_size || 9) || 9
                }
            };
        }

        function wmn_pdfmake_to_base64(docDefinition) {
            return new Promise(function (resolve, reject) {
                try {
                    if (!window.pdfMake) {
                        reject(new Error("pdfMake is not loaded. Add /assets/wmn/js/pdfmake.min.js and /assets/wmn/js/vfs_fonts.js before custom_pos_offline.js"));
                        return;
                    }

                    window.pdfMake.createPdf(docDefinition).getBase64(function (base64) {
                        resolve(base64);
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

        function wmn_clean_base64_for_printer(value) {
            value = String(value || "");

            if (value.indexOf(",") !== -1) {
                value = value.split(",").pop();
            }

            value = value.replace(/\s/g, "");

            while (value.length % 4 !== 0) {
                value += "=";
            }

            return value;
        }

        const WMN_SILENT_PRINT_MODE_FIELD = "wmn_silent_print_mode";
        const WMN_SILENT_PRINT_MODE_VALUES = ["raw_text", "html2canvas", "pdfmake"];

        function wmn_get_silent_print_mode(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            const rawMode =
                wmn_pick_first_setting(settings, [
                    WMN_SILENT_PRINT_MODE_FIELD,
                    "silent_print_mode",
                    "wmn_print_mode",
                    "print_output_mode",
                    "wmn_auto_print_mode",
                    "auto_silent_print_mode"
                ]) ||
                wmn_pick_first_setting(printFormat, [
                    "wmn_silent_print_mode",
                    "silent_print_mode",
                    "wmn_print_mode",
                    "print_output_mode"
                ]) ||
                "html2canvas";

            let mode = String(rawMode || "html2canvas").trim().toLowerCase();
            mode = mode.replace(/[-\s]+/g, "_");

            if (["raw", "raw_text", "text", "escpos", "esc_pos"].includes(mode)) return "raw_text";
            if (["html", "html2canvas", "canvas", "image", "png", "html_png"].includes(mode)) return "html2canvas";
            if (["pdf", "pdfmake", "pdf_make", "js_pdf", "doc_definition"].includes(mode)) return "pdfmake";

            return "html2canvas";
        }

        window.wmn_get_silent_print_mode = wmn_get_silent_print_mode;
        window.WMN_SILENT_PRINT_MODE_FIELD = WMN_SILENT_PRINT_MODE_FIELD;
        window.WMN_SILENT_PRINT_MODE_VALUES = WMN_SILENT_PRINT_MODE_VALUES;

        function wmn_get_print_type(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};
            return (
                settings.wmn_silent_print_type ||
                settings.default_print_type ||
                settings.print_type ||
                printFormat.default_print_type ||
                printFormat.print_type ||
                "RECEIPT"
            );
        }
function wmn_get_printer_ws_url() {
    let savedUrl = String(localStorage.getItem("whb_websocket_url") || "").trim();

    if (savedUrl === "ws://127.0.0.1:12212" || savedUrl === "ws://localhost:12212") {
        savedUrl = savedUrl + "/printer";
        localStorage.setItem("whb_websocket_url", savedUrl);
    }

    return savedUrl || "ws://127.0.0.1:12212/printer";
}

function wmn_show_printer_settings_dialog() {
    frappe.prompt(
        [{
            fieldname: "ws_url",
            label: "Printer WebSocket URL",
            fieldtype: "Data",
            reqd: 1,
            default: wmn_get_printer_ws_url()
        }],
        function(values) {
            const url = String((values && values.ws_url) || "").trim() || "ws://127.0.0.1:12212/printer";
            localStorage.setItem("whb_websocket_url", url);
            frappe.show_alert({
                message: wmn_t("Printer URL saved", "تم حفظ رابط الطابعة"),
                indicator: "green"
            });
        },
        wmn_t("Printer Settings", "إعدادات الطابعة"),
        wmn_t("Save", "حفظ")
    );
}

function wmn_send_to_printer(payload, printType, wsUrl = null) {
    payload = payload || {};
    const finalWsUrl = (wsUrl && String(wsUrl).trim()) || wmn_get_printer_ws_url();

    return new Promise(function (resolve, reject) {
        if (!window.wmn || !wmn.utils || !wmn.utils.WebSocketPrinter) {
            reject(new Error("WebSocketPrinter not available"));
            return;
        }

        const printer = new wmn.utils.WebSocketPrinter({
            url: finalWsUrl,
            onConnect: function () {
                try {
                    const submitPayload = Object.assign({
                        type: printType || "RECEIPT"
                    }, payload);

                    printer.submit(submitPayload);
                    resolve(true);
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
}
        
        function wmn_send_pdf_to_printer(pdfBase64, printType) {
            return wmn_send_to_printer({
                url: "receipt.pdf",
                file_content: wmn_clean_base64_for_printer(pdfBase64)
            }, printType);
        }

        function wmn_send_png_to_printer(pngBase64, printType) {
            return wmn_send_to_printer({
                url: "receipt.png",
                file_content: wmn_clean_base64_for_printer(pngBase64)
            }, printType);
        }

        function wmn_send_raw_text_to_printer(rawText, printType) {
            return wmn_send_to_printer({
                raw_content: btoa(unescape(encodeURIComponent(String(rawText || ""))))
            }, printType);
        }

        // Backward-compatible name used by older hooks. It sends raw text only.
        function wmn_send_raw_to_printer(rawText, printType) {
            return wmn_send_raw_text_to_printer(rawText, printType);
        }

        function wmn_is_offline_invoice_doc(doc) {
            doc = doc || {};
            const name = String(doc.name || "");
            return (
                (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) ||
                name.indexOf("OFFLINE-") === 0 ||
                name.indexOf("new-") === 0
            );
        }

        function wmn_extract_print_format_from_printview(fullHtml) {
            fullHtml = String(fullHtml || "");
            const parser = new DOMParser();
            const parsed = parser.parseFromString(fullHtml, "text/html");

            const styles = Array.from(
                parsed.querySelectorAll("style, link[rel='stylesheet']")
            ).map(function(node) {
                return node.outerHTML || "";
            }).join("\n");

            const printFormats = parsed.querySelectorAll(".print-format");
            if (printFormats && printFormats.length) {
                return styles + "\n" + printFormats[0].outerHTML;
            }

            const pageBreaks = parsed.querySelectorAll(".page-break");
            if (pageBreaks && pageBreaks.length) {
                const firstPrint = pageBreaks[0].querySelector(".print-format") || pageBreaks[0];
                return styles + "\n" + firstPrint.outerHTML;
            }

            const builder = parsed.querySelector(".print-format-builder");
            if (builder) {
                return styles + "\n" + builder.outerHTML;
            }

            const bodyHtml = parsed.body ? parsed.body.innerHTML : fullHtml;
            return bodyHtml || fullHtml;
        }

        async function wmn_get_online_printview_html(doc, printFormat) {
            doc = doc || {};
            printFormat = printFormat || {};

            if (!doc.doctype || !doc.name) {
                throw new Error("Cannot load printview without doc.doctype and doc.name");
            }

            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const formatName =
                settings.print_format ||
                printFormat.print_format_name ||
                printFormat.wmn_print_format ||
                printFormat.print_format ||
                doc.print_format ||
                "";

            if (!formatName) {
                throw new Error("POS Profile print_format is empty");
            }

            const noLetterhead = (
                settings.no_letterhead !== undefined
                    ? settings.no_letterhead
                    : (printFormat.no_letterhead !== undefined ? printFormat.no_letterhead : 1)
            );

            const lang =
                settings.language ||
                printFormat.language ||
                (frappe && frappe.boot && frappe.boot.lang) ||
                "en";

            const params = new URLSearchParams({
                doctype: doc.doctype,
                name: doc.name,
                trigger_print: "0",
                format: formatName,
                no_letterhead: String(noLetterhead ? 1 : 0),
                _lang: lang
            });

            if (settings.letter_head || printFormat.letter_head) {
                params.set("letterhead", settings.letter_head || printFormat.letter_head);
            }

            const res = await fetch("/printview?" + params.toString(), {
                credentials: "include",
                cache: "no-store"
            });

            if (!res.ok) {
                throw new Error("Failed to load printview: HTTP " + res.status);
            }

            const fullHtml = await res.text();
            const rendered = wmn_extract_print_format_from_printview(fullHtml);

            if (!String(rendered || "").trim()) {
                throw new Error("printview returned empty HTML");
            }

            return rendered;
        }

        function wmn_extract_print_width_css_from_html(html, printFormat) {
            html = String(html || "");
            printFormat = printFormat || {};

            const directCss =
                printFormat.paper_width_css ||
                printFormat.width_css ||
                printFormat.print_width_css;

            if (directCss) return String(directCss);

            const directMm =
                printFormat.paper_width_mm ||
                printFormat.width_mm ||
                printFormat.print_width_mm;

            if (directMm) return flt(directMm) + "mm";

            const directInch =
                printFormat.paper_width_in ||
                printFormat.width_in ||
                printFormat.print_width_in;

            if (directInch) return flt(directInch) + "in";

            const m = html.match(/\.print-format[\s\S]*?width\s*:\s*([0-9.]+)\s*(mm|in|px)/i) ||
                      html.match(/width\s*:\s*([0-9.]+)\s*(mm|in|px)/i);

            if (m) return String(m[1]) + String(m[2]);

            return "80mm";
        }

        function wmn_extract_print_width_pt_from_html(html, printFormat) {
            const cssWidth = wmn_extract_print_width_css_from_html(html, printFormat);

            function mmToPt(mm) { return flt(mm || 0) * 2.8346456693; }
            function inchToPt(inch) { return flt(inch || 0) * 72; }
            function pxToPt(px) { return flt(px || 0) * 0.75; }

            const m = String(cssWidth || "").match(/^([0-9.]+)\s*(mm|in|px)$/i);
            if (!m) return null;

            const value = flt(m[1]);
            const unit = String(m[2] || "").toLowerCase();

            if (unit === "mm") return mmToPt(value);
            if (unit === "in") return inchToPt(value);
            if (unit === "px") return pxToPt(value);
            return null;
        }

        function wmn_clean_print_html_for_pdfmake(html) {
            html = String(html || "");
            html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
            return html;
        }

        function wmn_normalize_rendered_print_html(renderedHtml) {
            renderedHtml = String(renderedHtml || "").trim();

            if (!renderedHtml) {
                return "";
            }

            /*
             * The offline renderer can return the inner HTML of the Print Format
             * without the ERPNext wrapper. Most receipt CSS is written as:
             *   .print-format table { ... }
             *   .print-format td { ... }
             * If the wrapper is missing, CSS does not apply and html2canvas may
             * capture a blank/unstyled page. Always guarantee one visible wrapper.
             */
            if (
                renderedHtml.indexOf('class="print-format"') !== -1 ||
                renderedHtml.indexOf("class='print-format'") !== -1 ||
                /class\s*=\s*["'][^"']*\bprint-format\b/i.test(renderedHtml)
            ) {
                return renderedHtml;
            }

            return '<div class="print-format">' + renderedHtml + '</div>';
        }

        function wmn_normalize_page_size_name(value) {
            return String(value || "")
                .trim()
                .toUpperCase()
                .replace(/\s+/g, "")
                .replace(/-/g, "");
        }

        function wmn_get_wmn_print_page_size(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            return (
                printFormat.page_size ||
                printFormat.paper_size ||
                printFormat.print_page_size ||
                printFormat.pageSize ||
                settings.wmn_page_size ||
                settings.page_size ||
                "A5"
            );
        }

        function wmn_get_wmn_print_orientation(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            return (
                printFormat.orientation ||
                printFormat.print_orientation ||
                settings.wmn_orientation ||
                settings.orientation ||
                "Portrait"
            );
        }

        function wmn_get_page_size_mm(pageSize, orientation, printFormat) {
            printFormat = printFormat || {};

            const explicitWidth =
                printFormat.page_width_mm ||
                printFormat.paper_width_mm ||
                printFormat.width_mm ||
                printFormat.print_width_mm;

            const explicitHeight =
                printFormat.page_height_mm ||
                printFormat.paper_height_mm ||
                printFormat.height_mm ||
                printFormat.print_height_mm;

            if (explicitWidth) {
                return {
                    name: "CUSTOM",
                    width_mm: flt(explicitWidth),
                    height_mm: explicitHeight ? flt(explicitHeight) : null
                };
            }

            let name = wmn_normalize_page_size_name(pageSize || "A5");

            const standard = {
                A0: [841, 1189],
                A1: [594, 841],
                A2: [420, 594],
                A3: [297, 420],
                A4: [210, 297],
                A5: [148, 210],
                A6: [105, 148],
                A7: [74, 105],
                A8: [52, 74],
                LETTER: [216, 279],
                LEGAL: [216, 356],
                RECEIPT80: [80, null],
                THERMAL80: [80, null],
                "80MM": [80, null],
                RECEIPT58: [58, null],
                THERMAL58: [58, null],
                "58MM": [58, null]
            };

            let size = standard[name];

            if (!size) {
                const custom = name.match(/^([0-9.]+)(MM|IN|PX)$/);
                if (custom) {
                    const value = flt(custom[1]);
                    const unit = custom[2];
                    if (unit === "MM") size = [value, null];
                    if (unit === "IN") size = [value * 25.4, null];
                    if (unit === "PX") size = [value * 25.4 / 96, null];
                }
            }

            if (!size) {
                size = standard.A5;
                name = "A5";
            }

            let width = flt(size[0]);
            let height = size[1] === null ? null : flt(size[1]);

            const o = String(orientation || "Portrait").trim().toLowerCase();
            if ((o === "landscape" || o === "horizontal") && height) {
                const tmp = width;
                width = height;
                height = tmp;
            }

            return {
                name: name,
                width_mm: width,
                height_mm: height
            };
        }

        function wmn_mm_to_px(mm) {
            return Math.round(flt(mm || 0) * 96 / 25.4);
        }

        function wmn_get_html2canvas_page(printFormat) {
            return wmn_get_page_size_mm(
                wmn_get_wmn_print_page_size(printFormat),
                wmn_get_wmn_print_orientation(printFormat),
                printFormat
            );
        }

        function wmn_get_html2canvas_options(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            const page = wmn_get_html2canvas_page(printFormat);
            const widthPx = wmn_mm_to_px(page.width_mm);
            const heightPx = page.height_mm ? wmn_mm_to_px(page.height_mm) : null;

            const scaleSetting =
                settings.wmn_html2canvas_scale ||
                printFormat.html2canvas_scale ||
                printFormat.canvas_scale ||
                1;

            let scale = flt(scaleSetting || 1);
            if (!scale || scale < 0.5) scale = 1;
            if (scale > 4) scale = 4;

            const options = {
                scale: scale,
                backgroundColor: "#ffffff",
                useCORS: false,
                foreignObjectRendering: true,
                allowTaint: true,
                logging: false,
                removeContainer: true,
                imageTimeout: 0,
                scrollX: 0,
                scrollY: 0,
                windowWidth: widthPx,
                windowHeight: heightPx || document.documentElement.clientHeight,
                width: widthPx
            };

            if (heightPx) {
                options.height = heightPx;
            }

            return options;
        }

        async function wmn_print_format_html_to_png_base64(renderedHtml, printFormat) {
            renderedHtml = wmn_normalize_rendered_print_html(renderedHtml);
            printFormat = printFormat || {};

            if (!String(renderedHtml || "").trim()) {
                throw new Error("Rendered Print Format HTML is empty before html2canvas capture");
            }

            if (!window.html2canvas) {
                throw new Error("html2canvas is not loaded. Add /assets/wmn/js/html2canvas.min.js before custom_pos_offline.js");
            }

            const holder = document.createElement("div");
            holder.className = "wmn-print-capture-holder";

            /*
             * Important:
             * Do not use opacity:0 / visibility:hidden / display:none.
             * Do not put the holder at -100000px because some browsers/html2canvas
             * versions return a white canvas for very far offscreen nodes.
             * We render it visibly at 0,0 for a few frames, capture it, then remove it.
             */
            holder.style.position = "fixed";
            holder.style.left = "0";
            holder.style.top = "0";
            holder.style.background = "#ffffff";
            holder.style.overflow = "visible";
            holder.style.zIndex = "2147483647";
            holder.style.pointerEvents = "none";
            holder.style.opacity = "1";
            holder.style.visibility = "visible";
            holder.style.display = "block";

            holder.innerHTML = renderedHtml;
            document.body.appendChild(holder);

            try {
                const target =
                    holder.querySelector(".print-format") ||
                    holder.querySelector(".wmn-print-format") ||
                    holder.querySelector(".receipt") ||
                    holder.firstElementChild ||
                    holder;

                if (document.fonts && document.fonts.ready) {
                    try { await document.fonts.ready; } catch (e) {}
                }

                const images = Array.from(target.querySelectorAll ? target.querySelectorAll("img") : []);
                await Promise.all(images.map(function(img) {
                    if (img.complete) return Promise.resolve();
                    return new Promise(function(resolve) {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                }));

                await new Promise(function(resolve) {
                    requestAnimationFrame(function() {
                        requestAnimationFrame(resolve);
                    });
                });

                await new Promise(function(resolve) {
                    setTimeout(resolve, 300);
                });

                const rect = target.getBoundingClientRect();
                const targetWidth = Math.max(
                    1,
                    Math.ceil(target.scrollWidth || rect.width || holder.scrollWidth || 576)
                );
                const targetHeight = Math.max(
                    1,
                    Math.ceil(target.scrollHeight || rect.height || holder.scrollHeight || 1)
                );

                if (targetWidth <= 1 || targetHeight <= 1) {
                    throw new Error("html2canvas target size is empty: " + targetWidth + "x" + targetHeight);
                }

                const canvas = await window.html2canvas(target, {
                    scale: flt((printFormat && printFormat.canvas_scale) || (printFormat && printFormat.html2canvas_scale) || 2) || 2,
                    backgroundColor: "#ffffff",
                    useCORS: false,
                    foreignObjectRendering: true,
                    allowTaint: true,
                    logging: false,
                    scrollX: 0,
                    scrollY: 0,
                    width: targetWidth,
                    height: targetHeight,
                    windowWidth: targetWidth,
                    windowHeight: targetHeight
                });

                if (!canvas || !canvas.width || !canvas.height) {
                    throw new Error("html2canvas returned an empty canvas");
                }

                return canvas.toDataURL("image/png").split(",").pop();
            } finally {
                if (holder && holder.parentNode) {
                    holder.parentNode.removeChild(holder);
                }
            }
        }

        async function wmn_print_format_html_to_pdf_base64(renderedHtml, printFormat) {
            renderedHtml = wmn_clean_print_html_for_pdfmake(renderedHtml);
            printFormat = printFormat || {};

            return new Promise(function(resolve, reject) {
                try {
                    if (!window.pdfMake) {
                        reject(new Error("pdfMake is not loaded"));
                        return;
                    }

                    if (typeof window.htmlToPdfmake !== "function") {
                        reject(new Error("html-to-pdfmake is not loaded. Load html-to-pdfmake before custom_pos_offline.js, or use server PDF online."));
                        return;
                    }

                    const wrapper = document.createElement("div");
                    wrapper.innerHTML = renderedHtml;

                    const printRoot =
                        wrapper.querySelector(".print-format") ||
                        wrapper.querySelector(".print-format-builder") ||
                        wrapper;

                    const pdfContent = window.htmlToPdfmake(printRoot.innerHTML || renderedHtml, {
                        window: window
                    });

                    const docDefinition = {
                        content: pdfContent
                    };

                    const pageWidth = wmn_extract_print_width_pt_from_html(renderedHtml, printFormat);
                    if (pageWidth) {
                        docDefinition.pageSize = {
                            width: pageWidth,
                            height: "auto"
                        };
                        docDefinition.pageMargins = [0, 0, 0, 0];
                    }

                    window.pdfMake.createPdf(docDefinition).getBase64(function(base64) {
                        resolve(base64);
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

        async function wmn_print_raw_receipt(doc) {
            if (typeof wmn_assign_receipt_number === "function") {
                await wmn_assign_receipt_number(doc);
            }
            doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || doc.name || "";
            doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || doc.name || "";

            const cfg = await wmn_get_raw_print_template(doc);
            const mode = wmn_get_silent_print_mode(cfg.printFormat);
            const printType = wmn_get_print_type(cfg.printFormat) || cfg.printType;
            const isOfflineDoc = wmn_is_offline_invoice_doc(doc);

            try { console.info("WMN silent print mode:", mode, "offline:", isOfflineDoc); } catch(e) {}

            if (mode === "raw_text") {
                //const rawText = wmn_build_offline_raw_receipt_text(doc);
                const rawText = wmn_render_raw_print_temp(cfg.template, doc);
                
                return await wmn_send_raw_text_to_printer(rawText, printType);
            }

            let renderedHtml = "";

            /*
             * Main fix:
             * Use the cached Jinja/HTML renderer for BOTH online and offline first.
             * This is the same path from the reference file where Arabic item names were clear.
             * Online printview remains only a fallback, because it was the path that produced broken Arabic.
             */
            if (cfg.template && String(cfg.template || "").trim()) {
                try {
                    const rendered = wmn_render_raw_print_template(
                        cfg.template,
                        doc,
                        cfg.printFormat
                    );

                    if (rendered && typeof rendered === "object") {
                        const pdfBase64 = await wmn_pdfmake_to_base64(rendered);
                        return await wmn_send_pdf_to_printer(pdfBase64, printType);
                    }

                    renderedHtml = String(rendered || "").trim();
                } catch (e) {
                    console.warn("WMN local Print Format render failed, will try fallback", e);
                    renderedHtml = "";
                }
            }

            /*
             * If local render is empty or still contains unresolved Jinja, use printview online only.
             */
            if ((!renderedHtml || /\{[%{#]/.test(renderedHtml)) && !isOfflineDoc) {
                try {
                    renderedHtml = await wmn_get_online_printview_html(doc, cfg.printFormat);
                } catch (e) {
                    console.warn("WMN online printview fallback failed", e);
                }
            }

            /*
             * Offline must never send empty canvas. If cached Print Format is missing or not fully rendered,
             * use the internal offline HTML receipt fallback instead of printing a blank page.
             */
            if (!renderedHtml || /\{[%{#]/.test(renderedHtml)) {
                if (typeof wmn_build_offline_receipt_html === "function") {
                    renderedHtml = wmn_build_offline_receipt_html(doc);
                } else {
                    renderedHtml = wmn_wrap_offline_receipt_html(
                        "<div class='receipt'>" + wmn_escape_html(wmn_build_offline_raw_receipt_text(doc)).replace(/\n/g, "<br>") + "</div>",
                        doc
                    );
                }
            }

            if (!renderedHtml || !String(renderedHtml).trim()) {
                throw new Error("Rendered Print Format output is empty");
            }

            if (mode === "pdfmake") {
                const pdfBase64 = await wmn_print_format_html_to_pdf_base64(renderedHtml, cfg.printFormat);
                return await wmn_send_pdf_to_printer(pdfBase64, printType);
            }

            const pngBase64 = await wmn_print_format_html_to_png_base64(renderedHtml, cfg.printFormat);
            return await wmn_send_png_to_printer(pngBase64, printType);
        }

        function wmn_get_current_pos_opening_name(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const pos = window.cur_pos || {};

            return String(
                doc.pos_opening ||
                doc.pos_opening_entry ||
                doc.opening_entry ||
                settings.pos_opening ||
                settings.pos_opening_entry ||
                pos.pos_opening ||
                (pos.opening_entry && pos.opening_entry.name) ||
                (pos.pos_opening_entry && pos.pos_opening_entry.name) ||
                ""
            ).trim();
        }

        function wmn_get_current_receipt_shift_key(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const opening =
                wmn_get_current_pos_opening_name(doc) ||
                settings.pos_profile ||
                doc.pos_profile ||
                "DEFAULT_SHIFT";

            return "wmn_receipt_counter::" + String(opening || "DEFAULT_SHIFT");
        }

        async function wmn_assign_receipt_number(doc) {
            if (!doc) return "";

            if (doc.wmn_receipt_no || doc.__wmn_receipt_no) {
                doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no;
                doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no;
                return doc.wmn_receipt_no;
            }

            const key = wmn_get_current_receipt_shift_key(doc);
            let localCounter = 0;
            let serverCounter = 0;

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                    localCounter = cint(await window.wmnPOSOffline.getSetting(key) || 0);
                } else {
                    localCounter = cint(localStorage.getItem(key) || 0);
                }
            } catch (e) {
                localCounter = cint(localStorage.getItem(key) || 0);
            }

            const shiftName = wmn_get_current_pos_opening_name(doc);

            try {
                if (!wmn_is_pos_offline() && shiftName) {
                    const r = await frappe.call({
                        method: "wmn.api.get_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || ""
                        },
                        freeze: false
                    });
                    serverCounter = cint((r.message && r.message.counter) || r.message || 0);
                }
            } catch (e) {
                console.warn("WMN receipt counter server read skipped", e);
            }

            const nextCounter = Math.max(localCounter, serverCounter) + 1;

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.setSetting) {
                    await window.wmnPOSOffline.setSetting(key, nextCounter);
                } else {
                    localStorage.setItem(key, String(nextCounter));
                }
            } catch (e) {
                localStorage.setItem(key, String(nextCounter));
            }

            try {
                if (!wmn_is_pos_offline() && shiftName) {
                    await frappe.call({
                        method: "wmn.api.update_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || "",
                            counter: nextCounter
                        },
                        freeze: false
                    });
                }
            } catch (e) {
                console.warn("WMN receipt counter server update skipped", e);
            }

            const receiptNo = String(nextCounter).padStart(5, "0");
            doc.wmn_receipt_no = receiptNo;
            doc.__wmn_receipt_no = receiptNo;
            return receiptNo;
        }


        async function wmn_sync_receipt_counter_on_page_load() {
            try {
                const doc = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc) || {};
                const key = wmn_get_current_receipt_shift_key(doc);
                const shiftName = wmn_get_current_pos_opening_name(doc);

                let localCounter = 0;
                try {
                    if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                        localCounter = cint(await window.wmnPOSOffline.getSetting(key) || 0);
                    } else {
                        localCounter = cint(localStorage.getItem(key) || 0);
                    }
                } catch (e) {
                    localCounter = cint(localStorage.getItem(key) || 0);
                }

                let serverCounter = 0;
                if (!wmn_is_pos_offline() && shiftName) {
                    const r = await frappe.call({
                        method: "wmn.api.get_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || ""
                        },
                        freeze: false
                    });
                    serverCounter = cint((r.message && r.message.counter) || r.message || 0);
                }

                const finalCounter = Math.max(localCounter, serverCounter);

                if (window.wmnPOSOffline && window.wmnPOSOffline.setSetting) {
                    await window.wmnPOSOffline.setSetting(key, finalCounter);
                } else {
                    localStorage.setItem(key, String(finalCounter));
                }

                if (!wmn_is_pos_offline() && shiftName && finalCounter > serverCounter) {
                    await frappe.call({
                        method: "wmn.api.update_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || "",
                            counter: finalCounter
                        },
                        freeze: false
                    });
                }

                console.log("WMN receipt counter synced", { localCounter, serverCounter, finalCounter });
                return finalCounter;
            } catch (e) {
                console.warn("WMN receipt counter page-load sync skipped", e);
                return 0;
            }
        }

        async function wmn_auto_silent_print_enabled() {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            return !!(settings.enable_auto_silent_print || settings.enable_auto_silent_print == 1);
        }

        async function wmn_try_auto_silent_print_after_order(doc) {
            try {
                if (!doc) return false;
                if (doc.__wmn_auto_silent_print_done) return false;
                if (!(await wmn_auto_silent_print_enabled())) return false;

                doc.__wmn_auto_silent_print_done = 1;
                await wmn_print_raw_receipt(doc);
                return true;
            } catch (e) {
                console.warn("WMN auto silent print failed", e);
                return false;
            }
        }

        async function wmn_try_silent_print_offline_doc(doc) {
            try {
                await wmn_print_raw_receipt(doc);
                return true;
            } catch (e) {
                console.warn("WMN silent print skipped", e);
                return false;
            }
        }

        function wmn_try_silent_print_offline_html(fullHtml, doc) {
            wmn_try_silent_print_offline_doc(doc).catch(function (e) {
                console.warn("WMN silent print skipped", e);
            });
            return true;
        }

        async function wmn_try_silent_print_online_doc(doc) {
            return await wmn_try_silent_print_offline_doc(doc);
        }


        window.wmn_debug_print_format_html = async function () {
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            if (!doc) {
                console.error("WMN DEBUG: no current POS doc");
                if (window.frappe && frappe.msgprint) frappe.msgprint("No current POS doc");
                return;
            }

            try {
                const cfg = typeof wmn_get_raw_print_template === "function"
                    ? await wmn_get_raw_print_template(doc)
                    : null;

                let html = "";
                if (cfg && cfg.template && typeof wmn_render_raw_print_template === "function") {
                    html = wmn_render_raw_print_template(cfg.template, doc, cfg.printFormat || {});
                }

                html = wmn_normalize_rendered_print_html(html);
                console.log("WMN DEBUG cfg:", cfg);
                console.log("WMN DEBUG normalized html length:", html.length);
                console.log("WMN DEBUG normalized html:", html);

                const win = window.open("", "_blank");
                if (!win) {
                    if (window.frappe && frappe.msgprint) frappe.msgprint("Popup blocked. Allow popups.");
                    return;
                }

                win.document.open();
                win.document.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Print Debug</title></head><body>" + (html || "<h3 style='color:red'>HTML IS EMPTY</h3>") + "</body></html>");
                win.document.close();
            } catch (e) {
                console.error("WMN DEBUG ERROR:", e);
                if (window.frappe && frappe.msgprint) frappe.msgprint("WMN DEBUG ERROR: " + (e.message || e));
            }
        };

async function wmn_get_offline_print_template_from_pos_profile() {
    if (!window.wmnPOSOffline || !window.wmnPOSOffline.getFullSettings) {
        return "";
    }

    const settings = await window.wmnPOSOffline.getFullSettings();

    return (
        settings.custom_offline_print_template ||
        settings.offline_print_template ||
        ""
    );
}



async function wmn_print_offline_receipt_with_pos_profile_template(template, doc) {
    const html = wmn_render_offline_print_template(template, doc);
    const fullHtml = wmn_wrap_offline_receipt_html(html, doc);

    if (wmn_try_silent_print_offline_html(fullHtml, doc)) {
        return;
    }

    const win = window.open("", "_blank");

    if (!win) {
        frappe.msgprint({
            title: __("Popup Blocked"),
            indicator: "orange",
            message: __("Please allow popups to print the offline receipt.")
        });
        return;
    }

    win.document.open();
    win.document.write(fullHtml);
    win.document.close();
    win.focus();

    setTimeout(() => {
        win.print();
    }, 300);
}







function wmn_render_offline_print_template(template, doc) {
    const currency = doc.currency || "YER";
    
    function get_formatted(doc, fieldname) {
        const value = doc[fieldname];
        if (value === undefined || value === null) return "";
        
        const field = frappe.meta.get_field(doc.doctype, fieldname);
        if (field && field.fieldtype === "Currency") {
            return format_currency(flt(value), currency);
        }
        if (field && field.fieldtype === "Date") {
            return frappe.datetime.str_to_user(value);
        }
        if (field && field.fieldtype === "Time") {
            return value;
        }
        return value;
    }
    
    function process_item(item, doc) {
        let html = `
            <tr>
                <td>
                    ${frappe.utils.escape_html(item.item_code || "")}
                    ${(item.item_name && item.item_name !== item.item_code) ? `<br>${frappe.utils.escape_html(item.item_name)}` : ""}
                    ${item.serial_no ? `<br><b>SR.No:</b><br>${frappe.utils.escape_html(item.serial_no.replace(/\n/g, ", "))}` : ""}
                </td>
                <td class="text-right">${flt(item.qty || 0)}<br>@ ${format_currency(flt(item.rate || 0), currency)}</td>
                <td class="text-right">${format_currency(flt(item.amount || 0), currency)}</td>
            </tr>
        `;
        return html;
    }
    
    function process_taxes(doc) {
        let taxesHtml = "";
        (doc.taxes || []).forEach(row => {
            if (!row.included_in_print_rate || doc.flags?.show_inclusive_tax_in_print) {
                let description = row.description || "";
                if (!description.includes('%') && row.rate) {
                    description = `${description}@${row.rate}%`;
                }
                taxesHtml += `
                    <tr>
                        <td class="text-right" style="width: 70%">${frappe.utils.escape_html(description)}</td>
                        <td class="text-right">${format_currency(flt(row.tax_amount || 0), currency)}</td>
                    </tr>
                `;
            }
        });
        return taxesHtml;
    }
    
    function process_payments(doc) {
        let paymentsHtml = "";
        (doc.payments || []).forEach(row => {
            paymentsHtml += `
                <tr>
                    <td class="text-right" style="width: 70%">${frappe.utils.escape_html(row.mode_of_payment || "")}</td>
                    <td class="text-right">${format_currency(flt(row.amount || 0), currency)}</td>
                </tr>
            `;
        });
        return paymentsHtml;
    }
    
    const itemsHtml = (doc.items || []).map(item => process_item(item, doc)).join("");
    const taxesHtml = process_taxes(doc);
    const paymentsHtml = process_payments(doc);
    
    let html = template || "";
    
    html = html.replace(/\{\%-?\s*for\s+item\s+in\s+doc\.items\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, itemsHtml);
    html = html.replace(/\{\%-?\s*for\s+row\s+in\s+doc\.taxes\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, taxesHtml);
    html = html.replace(/\{\%-?\s*for\s+row\s+in\s+doc\.payments\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, paymentsHtml);
    
    html = html.replace(/\{\%\s*if\s+letter_head\s*\%\}([\s\S]*?)\{\%\s*endif\s*\%\}/g, "");
    
    html = html.replace(/\{\{\s*doc\.get_formatted\("([^"]+)"\)\s*\}\}/g, (match, fieldname) => {
        return get_formatted(doc, fieldname);
    });
    
    html = html.replace(/\{\{\s*doc\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        const value = doc[fieldname];
        if (value === undefined || value === null) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return frappe.utils.escape_html(String(value));
    });
    
    html = html.replace(/\{\{\s*item\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        return `{{ item.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*row\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        return `{{ row.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\.get_formatted\("([^"]+)"\)\s*\}\}/g, (match, obj, fieldname) => {
        return `{{ ${obj}.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*([^|]+)\s*\|\s*replace\("([^"]+)",\s*"([^"]+)"\)\s*\}\}/g, (match, value, search, replace) => {
        return String(value || "").split(search).join(replace);
    });
    
    const simpleReplacements = {
        "doc.name": doc.name || doc.custom_offline_id || "",
        "doc.company": doc.company || "",
        "doc.customer_name": doc.customer_name || doc.customer || "",
        "doc.owner": doc.owner || frappe.session?.user || "",
        "doc.posting_date": doc.posting_date || "",
        "doc.posting_time": doc.posting_time || "",
        "doc.total": format_currency(flt(doc.total || 0), currency),
        "doc.net_total": format_currency(flt(doc.net_total || 0), currency),
        "doc.grand_total": format_currency(flt(doc.grand_total || 0), currency),
        "doc.rounded_total": format_currency(flt(doc.rounded_total || 0), currency),
        "doc.paid_amount": format_currency(flt(doc.paid_amount || 0), currency),
        "doc.change_amount": format_currency(flt(doc.change_amount || 0), currency),
        "doc.discount_amount": format_currency(flt(doc.discount_amount || 0), currency),
        "doc.terms": doc.terms || "",
        "doc.select_print_heading": doc.select_print_heading || __("Invoice"),
    };
    
    Object.keys(simpleReplacements).forEach(key => {
        const re = new RegExp("\\{\\{\\s*" + key.replace(".", "\\.") + "\\s*\\}\\}", "g");
        html = html.replace(re, simpleReplacements[key]);
    });
    
    html = html.replace(/\{\{\s*_\(\"([^\"]+)\"\)\s*\}\}/g, (match, text) => __(text));
    
    html = html.replace(/\{\{[^{}]+\}\}/g, (match) => {
        if (match.includes("item.") || match.includes("row.")) return match;
        return "";
    });
    
    return html;
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

        async function wmn_print_offline_receipt(doc) {
            doc = doc || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc);
            if (!doc) {
                frappe.show_alert({
                    message: __("No offline invoice available to print"),
                    indicator: "orange"
                });
                return;
            }
            const template = await wmn_get_offline_print_template_from_pos_profile();

            if (template) {
                return window.wmn_print_offline_receipt_with_pos_profile_template(template, doc);
            }

            const html = wmn_build_offline_receipt_html(doc);
            const fullHtml = wmn_wrap_offline_receipt_html(html, doc);

            if (wmn_try_silent_print_offline_html(fullHtml, doc)) {
                return;
            }

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
            win.document.write(fullHtml);
            win.document.close();
        }

        window.wmn_print_offline_receipt = wmn_print_offline_receipt;
        window.wmn_print_offline_receipt_with_pos_profile_template = wmn_print_offline_receipt_with_pos_profile_template;
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
            return cint(settings.as_sales_invoice || doc.as_sales_invoice || 0) === 1 ||
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

        
        function wmn_prepare_pos_frm_doc(ctrl) {
            if (!ctrl || !ctrl.frm || !ctrl.frm.doc) return;

            const doc = ctrl.frm.doc;
            const settings = ctrl.settings || {};
            const invoiceDoctype = wmn_pos_invoice_doctype(ctrl);

            doc.items = doc.items || [];
            doc.is_pos = 1;
            doc.update_stock = doc.update_stock === undefined ? 1 : doc.update_stock;
            doc.pos_profile = doc.pos_profile || settings.pos_profile || ctrl.pos_profile || "";
            doc.set_warehouse = doc.set_warehouse || settings.warehouse || "";
            doc.selling_price_list = doc.selling_price_list || settings.selling_price_list || "";
            doc.customer = doc.customer || settings.customer || "";
            doc.doctype = doc.doctype || invoiceDoctype;

            const itemDoctype = wmn_pos_item_doctype(doc.doctype);
            wmn_ensure_pos_cart_items_data(doc);
            doc.items.forEach((row) => {
                if (!row) return;
                row.doctype = row.doctype || itemDoctype;
                row.parenttype = doc.doctype;
                row.parentfield = "items";
                row.parent = doc.name;
                wmn_ensure_pos_cart_item_data(row);
            });

            window.cur_pos = ctrl;
            window.cur_frm = ctrl.frm;
        }

        function wmn_install_v1595_sales_invoice_events() {
            if (window.__wmn_v1595_sales_invoice_events_installed) return;

            // ERPNext POS in v15.95 still has POS Invoice Item model events.
            // Add matching Sales Invoice Item event so item detail/cart refresh works in Sales Invoice mode.
            try {
                frappe.model.on("Sales Invoice Item", "*", (fieldname, value, item_row) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || !pos.frm.doc || pos.frm.doc.doctype !== "Sales Invoice") return;
                    if (!item_row || item_row.doctype !== "Sales Invoice Item") return;
                    if (!pos.item_details) return;

                    const field_control = pos.item_details[`${fieldname}_control`];
                    const is_current =
                        pos.item_details.compare_with_current_item &&
                        pos.item_details.compare_with_current_item(item_row);

                    if (is_current && field_control && field_control.get_value() !== value) {
                        field_control.set_value(value);
                        pos.update_cart_html(item_row);
                    }
                });
            } catch (e) {
                console.warn("WMN v15.95 Sales Invoice Item event bind failed", e);
            }

            try {
                frappe.ui.form.on("Sales Invoice", "paid_amount", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;

                    if (pos.cart && pos.cart.update_totals_section) {
                        pos.cart.update_totals_section(frm);
                    }
                    if (pos.payment && pos.payment.update_totals_section) {
                        pos.payment.update_totals_section(frm.doc);
                    }
                    if (pos.payment && pos.payment.render_payment_mode_dom) {
                        pos.payment.render_payment_mode_dom();
                    }
                });

                frappe.ui.form.on("Sales Invoice", "loyalty_amount", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;
                    if (!pos.payment || !pos.payment.$payment_modes) return;

                    const formatted_currency = format_currency(frm.doc.loyalty_amount, frm.doc.currency);
                    pos.payment.$payment_modes.find(`.loyalty-amount-amount`).html(formatted_currency);
                });

                frappe.ui.form.on("Sales Invoice", "contact_mobile", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;
                    if (!pos.payment || !pos.payment.request_for_payment_field) return;

                    const contact = frm.doc.contact_mobile;
                    const request_button = $(pos.payment.request_for_payment_field?.$input?.[0]);
                    if (contact) {
                        request_button.removeClass("btn-default").addClass("btn-primary");
                    } else {
                        request_button.removeClass("btn-primary").addClass("btn-default");
                    }
                });

                frappe.ui.form.on("Sales Invoice", "coupon_code", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;

                    if (frm.doc.coupon_code && !frm.applying_pos_coupon_code) {
                        if (!frm.doc.ignore_pricing_rule) {
                            frm.applying_pos_coupon_code = true;
                            frappe.run_serially([
                                () => (frm.doc.ignore_pricing_rule = 1),
                                () => frm.trigger("ignore_pricing_rule"),
                                () => (frm.doc.ignore_pricing_rule = 0),
                                () => frm.trigger("apply_pricing_rule"),
                                () => frm.save(),
                                () => pos.payment && pos.payment.update_totals_section && pos.payment.update_totals_section(frm.doc),
                                () => (frm.applying_pos_coupon_code = false),
                            ]);
                        } else {
                            frappe.show_alert({
                                message: __("Ignore Pricing Rule is enabled. Cannot apply coupon code."),
                                indicator: "orange",
                            });
                        }
                    }
                });
            } catch (e) {
                console.warn("WMN v15.95 Sales Invoice form event bind failed", e);
            }

            window.__wmn_v1595_sales_invoice_events_installed = true;
        }

        function wmn_install_v1595_cart_customer_transactions_patch() {
            if (window.__wmn_v1595_cart_customer_transactions_patch) return;

            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (!Cart || !Cart.prototype || typeof Cart.prototype.fetch_customer_transactions !== "function") return;

            const original = Cart.prototype.fetch_customer_transactions;

            Cart.prototype.fetch_customer_transactions = function() {
                const pos = window.cur_pos;
                const invoiceDoctype = wmn_pos_invoice_doctype(pos);

                if (invoiceDoctype !== "Sales Invoice") {
                    return original.apply(this, arguments);
                }

                if (!this.customer_info || !this.customer_info.customer) {
                    return original.apply(this, arguments);
                }

                frappe.db
                    .get_list("Sales Invoice", {
                        filters: {
                            customer: this.customer_info.customer,
                            docstatus: 1,
                            is_pos: 1,
                        },
                        fields: ["name", "grand_total", "status", "posting_date", "posting_time", "currency"],
                        limit: 20,
                    })
                    .then((res) => {
                        const transaction_container = this.$customer_section.find(".customer-transactions");

                        if (!res.length) {
                            transaction_container.html(`<div class="no-transactions-placeholder">No recent transactions found</div>`);
                            return;
                        }

                        const elapsed_time = moment(res[0].posting_date + " " + res[0].posting_time).fromNow();
                        this.$customer_section.find(".customer-desc").html(`Last transacted ${elapsed_time}`);
                        transaction_container.html("");

                        res.forEach((invoice) => {
                            const posting_datetime = moment(invoice.posting_date + " " + invoice.posting_time).format("Do MMMM, h:mma");
                            const indicator_color = {
                                Paid: "green",
                                Draft: "red",
                                Return: "gray",
                                Consolidated: "blue",
                            };

                            transaction_container.append(
                                `<div class="invoice-wrapper" data-invoice-name="${escape(invoice.name)}">
                                    <div class="invoice-name-date">
                                        <div class="invoice-name">${invoice.name}</div>
                                        <div class="invoice-date">${posting_datetime}</div>
                                    </div>
                                    <div class="invoice-total-status">
                                        <div class="invoice-total">
                                            ${format_currency(invoice.grand_total, invoice.currency, 0) || 0}
                                        </div>
                                        <div class="invoice-status">
                                            <span class="indicator-pill whitespace-nowrap ${indicator_color[invoice.status] || "gray"}">
                                                <span>${invoice.status}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="seperator"></div>`
                            );
                        });
                    });
            };

            window.__wmn_v1595_cart_customer_transactions_patch = true;
        }

        function wmn_install_v1595_pos_compatibility() {
            wmn_install_v1595_sales_invoice_events();
            wmn_install_v1595_cart_customer_transactions_patch();
        }
        function wmn_as_frappe_call_like(promise) {
            // ERPNext 15.95 ItemSelector.load_items_data may call:
            // this.get_items(...).then(...).always(...)
            // Native Promise has no always(), while frappe.call returns jqXHR-like object.
            const p = Promise.resolve(promise);

            return {
                then(onFulfilled, onRejected) {
                    const next = p.then(onFulfilled, onRejected);
                    return wmn_as_frappe_call_like(next);
                },
                catch(onRejected) {
                    const next = p.catch(onRejected);
                    return wmn_as_frappe_call_like(next);
                },
                finally(onFinally) {
                    const next = p.finally(onFinally);
                    return wmn_as_frappe_call_like(next);
                },
                always(callback) {
                    p.then(
                        (value) => {
                            if (callback) callback(value);
                            return value;
                        },
                        (error) => {
                            if (callback) callback(error);
                            throw error;
                        }
                    );
                    return this;
                },
                done(callback) {
                    p.then((value) => {
                        if (callback) callback(value);
                    });
                    return this;
                },
                fail(callback) {
                    p.catch((error) => {
                        if (callback) callback(error);
                    });
                    return this;
                },
                promise() {
                    return p;
                },
            };
        }




        /*
         * Online POS is intentionally left native.
         * No item click interception, no online batch dialog, no online cart mutation here.
         * Offline item handling is done only inside MyPOSController.wmn_offline_on_cart_update().
         */

        function wmn_safe_offline_cart_reload(pos) {
            if (!pos || !pos.cart || !pos.cart.load_invoice) {
                return;
            }

            try {
                window.__wmn_loading_offline_cart_ui = true;

                pos.cart.load_invoice();

                if (pos.cart.$numpad_section) {
                    pos.cart.$numpad_section.css("display", "");
                }

                if (pos.cart.$totals_section) {
                    pos.cart.$totals_section.css("display", "flex");
                }

                if (pos.cart.$component) {
                    pos.cart.$component.find(".numpad-section").css("display", "");
                    pos.cart.$component.find(".number-pad").css("display", "");
                    pos.cart.$component.find(".cart-item").css("pointer-events", "auto");
                    pos.cart.$component.find(".cart-items, .cart-item-wrapper").css("pointer-events", "auto");
                }
            } catch (e) {
                console.warn("WMN offline cart UI reload skipped", e);
            } finally {
                window.__wmn_loading_offline_cart_ui = false;
            }
        }
        async function wmn_show_online_batch_selection_dialog(item, warehouse = "", price_list = "") {
            //if (!wmn_can_use_online_batch_dialog()) return null;

            const r = await frappe.call({
                method: "wmn.api.get_pos_item_batches",
                args: {
                    item_code: item.item_code,
                    warehouse: warehouse || "",
                    price_list: price_list || "",
                    uom: item.uom || item.stock_uom || "",
                },
                freeze: false,
            });

            const rows = (r && r.message) || [];
            if (!rows.length) return null;

            return new Promise((resolve) => {
                const dialog = new frappe.ui.Dialog({
                    title: __("Select Batch No and Quantity"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "batch_html",
                            options: `
                                <div style="max-height:55vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                    <table class="table table-bordered table-hover" style="margin:0;">
                                        <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                            <tr>
                                                <th>${__("Batch No")}</th>
                                                <th>${__("Available Qty")}</th>
                                                <th>${__("Rate")}</th>
                                                <th>${__("Expiry Date")}</th>
                                                <th style="width:130px;">${__("Qty")}</th>
                                                <th style="width:110px;">${__("Action")}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${rows.map((b, idx) => {
                                                const availableQty = flt(b.actual_qty || 0);
                                                const defaultQty = Math.min(flt(item.qty || 1), availableQty || 1) || 1;
                                                const rate = flt(b.price_list_rate || b.rate || item.price_list_rate || item.rate || 0);
                                                const currency = b.currency || item.currency || frappe.defaults.get_default("currency") || "YER";

                                                return `
                                                    <tr>
                                                        <td style="font-weight:700;">${frappe.utils.escape_html(b.batch_no || "")}</td>
                                                        <td>${availableQty}</td>
                                                        <td>${format_currency(rate, currency)}</td>
                                                        <td>${frappe.utils.escape_html(b.expiry_date || "")}</td>
                                                        <td>
                                                            <input type="number"
                                                                class="form-control input-xs wmn-online-batch-qty"
                                                                data-idx="${idx}"
                                                                min="0.001"
                                                                step="0.001"
                                                                max="${availableQty}"
                                                                value="${defaultQty}">
                                                        </td>
                                                        <td>
                                                            <button type="button"
                                                                class="btn btn-xs btn-primary wmn-select-online-batch"
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
                            `,
                        },
                    ],
                    secondary_action_label: __("Cancel"),
                    secondary_action: () => {
                        document.activeElement && document.activeElement.blur();
                        dialog.hide();
                        resolve(null);
                    },
                });

                dialog.show();

                dialog.$wrapper.on("click", ".wmn-select-online-batch", function () {
                    const idx = cint($(this).attr("data-idx"));
                    const selected = rows[idx];

                    if (!selected) {
                        document.activeElement && document.activeElement.blur();
                        dialog.hide();
                        resolve(null);
                        return;
                    }

                    const qty = flt(dialog.$wrapper.find(`.wmn-online-batch-qty[data-idx="${idx}"]`).val());

                    if (qty <= 0) {
                        frappe.show_alert({ message: __("Quantity must be greater than zero"), indicator: "orange" });
                        return;
                    }

                    if (qty > flt(selected.actual_qty || 0)) {
                        frappe.show_alert({ message: __("Quantity cannot exceed available batch quantity"), indicator: "orange" });
                        return;
                    }

                    selected.__selected_qty = qty;
                    document.activeElement && document.activeElement.blur();
                    dialog.hide();
                    resolve(selected);
                });
            });
        }
class MyPOSController extends erpnext.PointOfSale.Controller {
            constructor(wrapper) {
                super(wrapper);
                this.settings = wmn_safe_settings(this.settings || {});
                wmn_install_v1595_pos_compatibility();
                this.wmn_start_offline_preload();
            }

            wmn_start_offline_preload() {
                if (this.__wmn_preload_started) return;
                this.__wmn_preload_started = true;

                const try_preload = () => {
                    if (wmn_is_pos_offline()) return true;
                    if (window.wmnPOSOffline && this.settings && this.settings.pos_profile) {
                        window.wmnPOSOffline.preload(this, false);
                        return true;
                    }
                    return false;
                };

                if (try_preload()) return;

                let attempts = 0;
                const retry = () => {
                    attempts += 1;
                    if (try_preload() || attempts >= 3) return;
                    setTimeout(retry, 1000);
                };
                setTimeout(retry, 1000);
            }
            wmn_detach_current_frm_refresh_fields() {
                try {
                    if (this.frm && this.frm.wrapper && window.jQuery) {
                        $(this.frm.wrapper).off("refresh-fields");
                    }
                } catch (e) {}
            }

            get_item_from_frm(item) {
                if (!wmn_controller_uses_offline_flow(this)) {
                    return super.get_item_from_frm(item);
                }

                const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                const rows = doc && Array.isArray(doc.items) ? doc.items : [];
                if (!item || !rows.length) return null;

                if (item.name) {
                    const byName = rows.find(row => row && row.name == item.name);
                    if (byName) return byName;
                }

                if (item.item_code) {
                    const itemCode = String(item.item_code || "");
                    const batchNo = String(item.batch_no || "");
                    const serialNo = String(item.serial_no || "");
                    const uom = String(item.uom || item.stock_uom || "");
                    const warehouse = String(item.warehouse || "");

                    return rows.find(row => {
                        if (!row || String(row.item_code || "") !== itemCode) return false;
                        if (batchNo && String(row.batch_no || "") !== batchNo) return false;
                        if (serialNo && String(row.serial_no || "") !== serialNo) return false;
                        if (uom && String(row.uom || row.stock_uom || "") !== uom) return false;
                        if (warehouse && String(row.warehouse || "") !== warehouse) return false;
                        return true;
                    }) || null;
                }

                return null;
            }

            update_cart_html(item, remove_item) {
                if (wmn_controller_uses_offline_flow(this) && this.frm && this.frm.doc) {
                    const warehouse = this.frm.doc.set_warehouse || (this.settings && this.settings.warehouse) || "";
                    wmn_normalize_all_offline_cart_rows(this.frm.doc, warehouse);

                    if (item && item.item_code) {
                        item = wmn_normalize_offline_cart_row(
                            item,
                            this.frm.doc,
                            (this.frm.doc.items || []).indexOf(item),
                            warehouse
                        );
                        this.wmn_register_offline_row_in_frappe_model(item);
                    }
                }

                return super.update_cart_html(item, remove_item);
            }

            async make_new_invoice() {
                this.wmn_detach_current_frm_refresh_fields();
                await wmn_bootstrap_detect_effective_offline();

                const force_online_new_order =
                    this.__wmn_new_order_online === true &&
                    navigator.onLine === true &&
                    !wmn_is_pos_offline();

                if (force_online_new_order) {
                    window.__wmn_pos_effective_offline = false;
                    this.__wmn_new_order_online = false;
                }

                if (!force_online_new_order && wmn_is_pos_offline()) {

                    const doc = await wmn_make_offline_invoice_doc(this);
                    this.frm = wmn_make_offline_frm(doc);

                    wmn_prepare_pos_frm_doc(this);

                    window.cur_frm = this.frm;
                    window.cur_pos = this;

                    try {
                        if (this.cart && this.cart.$component) {
                            this.cart.$component.find(".cart-items, .cart-item-wrapper, .cart-item").empty();
                        }
                        if (this.cart && this.cart.$cart_items_wrapper) {
                            this.cart.$cart_items_wrapper.html("");
                        }
                        if (this.cart && this.cart.toggle_component) {
                            this.cart.toggle_component(true);
                        }
                        wmn_safe_offline_cart_reload(this);

                        if (this.order_summary && this.order_summary.toggle_component) {
                            this.order_summary.toggle_component(false);
                        }
                    } catch (e) {
                        console.warn("WMN offline cart UI reset skipped", e);
                    }

                    // Never call this.cart.load_invoice() offline.
                    // Never call make_sales_invoice_frm() offline.
                    // Both execute DocType/Form scripts and online server methods.

                    if (this.item_selector && this.item_selector.load_items_data) {
                        try {
                            await this.item_selector.load_items_data();
                        } catch (e) {
                            console.warn("WMN offline item selector reload skipped", e);
                        }
                    }

                    return this.frm;
                }

                const result = await super.make_new_invoice();

                setTimeout(() => {
                    try {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (doc && Array.isArray(doc.taxes) && doc.taxes.length) {
                            wmn_refresh_offline_tax_cache_from_online_doc(doc);
                        }
                    } catch (e) {
                        console.warn("WMN tax cache refresh skipped", e);
                    }
                }, 1200);

                if (navigator.onLine !== false) {
                    window.__wmn_pos_effective_offline = false;
                }
                this.__wmn_new_order_online = false;

                if (!wmn_is_pos_offline() && window.wmnPOSOffline) {
                    window.wmnPOSOffline.preload(this, false);
                }

                return result;
            }
            
            

            wmn_register_offline_row_in_frappe_model(row) {
            if (!row || !row.doctype || !row.name) return row;

            frappe.locals = frappe.locals || {};
            frappe.locals[row.doctype] = frappe.locals[row.doctype] || {};
            frappe.locals[row.doctype][row.name] = row;

            return row;
        }

        wmn_ensure_offline_item_stock_map(row) {
            if (!row || !row.item_code) return;

            this.item_stock_map = this.item_stock_map || {};
            this.item_stock_map[row.item_code] = this.item_stock_map[row.item_code] || {};

            const warehouse = row.warehouse || this.frm.doc.set_warehouse || "";
            if (!warehouse) return;

            this.item_stock_map[row.item_code][warehouse] = [
                flt(row.actual_qty || 0),
                cint(row.is_stock_item || 0)
            ];
        }


        wmn_get_active_offline_item_detail_row() {
            const details = this.item_details || {};
            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
            if (!doc || !Array.isArray(doc.items)) return null;

            const candidates = [
                details.current_item,
                details.item_row,
                details.item,
            ].filter(Boolean);

            const detail_doctype = details.doctype || (candidates[0] && candidates[0].doctype) || "";
            const detail_name = details.name || (candidates[0] && candidates[0].name) || "";

            if (detail_doctype && detail_name) {
                const by_name = doc.items.find(row => row && row.doctype === detail_doctype && row.name === detail_name);
                if (by_name) return by_name;
            }

            for (const candidate of candidates) {
                if (!candidate) continue;
                if (candidate.name) {
                    const by_candidate_name = doc.items.find(row => row && row.name === candidate.name);
                    if (by_candidate_name) return by_candidate_name;
                }
                if (candidate.item_code) {
                    const by_item_code = doc.items.find(row =>
                        row &&
                        String(row.item_code || "") === String(candidate.item_code || "") &&
                        String(row.batch_no || "") === String(candidate.batch_no || "") &&
                        String(row.serial_no || "") === String(candidate.serial_no || "")
                    );
                    if (by_item_code) return by_item_code;
                }
            }

            return null;
        }

        wmn_apply_offline_item_detail_value(row, fieldname, value) {
            if (!row || !fieldname) return row;

            if (["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(fieldname)) {
                row[fieldname] = flt(value || 0);
            } else {
                row[fieldname] = value;
            }

            row.qty = flt(row.qty || 0);
            row.conversion_factor = flt(row.conversion_factor || 1);
            row.stock_qty = row.qty * row.conversion_factor;

            row.price_list_rate = flt(row.price_list_rate || row.rate || 0);

            if (fieldname === "discount_percentage") {
                const discount_percentage = flt(row.discount_percentage || 0);
                row.rate = flt(row.price_list_rate || row.rate || 0) * (1 - (discount_percentage / 100));
            } else if (fieldname === "discount_amount") {
                const qty = flt(row.qty || 0) || 1;
                const list_rate = flt(row.price_list_rate || row.rate || 0);
                row.rate = Math.max(0, list_rate - (flt(row.discount_amount || 0) / qty));
            } else {
                row.rate = flt(row.rate || row.price_list_rate || 0);
            }

            row.amount = flt(row.qty || 0) * flt(row.rate || 0);
            row.net_rate = flt(row.net_rate || row.rate || 0);

            if (["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(fieldname)) {
                row.net_rate = row.rate;
            }

            row.net_amount = flt(row.qty || 0) * flt(row.net_rate || row.rate || 0);
            row.base_rate = row.rate;
            row.base_amount = row.amount;
            row.base_net_rate = row.net_rate;
            row.base_net_amount = row.net_amount;

            return row;
        }

        wmn_refresh_offline_cart_from_item_detail(row) {
            if (!row || !this.frm || !this.frm.doc) return;

            try {
                this.wmn_register_offline_row_in_frappe_model(row);
                this.wmn_ensure_offline_item_stock_map(row);
            } catch (e) {}

            try {
                this.wmn_recalculate_offline_totals();
            } catch (e) {
                console.warn("WMN offline detail recalc skipped", e);
            }

            try {
                if (this.cart && this.cart.update_item_html) {
                    this.cart.update_item_html(row);
                } else if (this.update_cart_html) {
                    this.update_cart_html(row);
                }
            } catch (e) {
                console.warn("WMN offline detail cart row refresh skipped", e);
            }

            try {
                if (this.cart && this.cart.update_totals_section) {
                    this.cart.update_totals_section(this.frm);
                }
            } catch (e) {
                console.warn("WMN offline detail totals refresh skipped", e);
            }

            try {
                if (this.payment && this.payment.update_totals_section) {
                    this.payment.update_totals_section(this.frm.doc);
                }
            } catch (e) {}

            try {
                if (this.frm && this.frm.dirty) {
                    this.frm.dirty();
                }
            } catch (e) {}
        }


        wmn_remove_offline_item_detail_row(row) {
            if (!row || !this.frm || !this.frm.doc) return false;

            const doc = this.frm.doc;
            doc.items = (doc.items || []).filter((candidate) => {
                if (!candidate) return false;
                if (row.name && candidate.name === row.name) return false;
                return !(
                    String(candidate.item_code || "") === String(row.item_code || "") &&
                    String(candidate.batch_no || "") === String(row.batch_no || "") &&
                    String(candidate.serial_no || "") === String(row.serial_no || "") &&
                    String(candidate.uom || candidate.stock_uom || "") === String(row.uom || row.stock_uom || "") &&
                    String(candidate.warehouse || "") === String(row.warehouse || "")
                );
            });

            try {
                if (window.frappe && frappe.locals && row.doctype && row.name && frappe.locals[row.doctype]) {
                    delete frappe.locals[row.doctype][row.name];
                }
            } catch (e) {}

            try {
                (doc.items || []).forEach((item, index) => {
                    item.idx = index + 1;
                });
                this.wmn_recalculate_offline_totals();
            } catch (e) {
                console.warn("WMN offline remove recalc skipped", e);
            }

            try {
                if (this.update_cart_html) {
                    this.update_cart_html(row, true);
                } else if (this.cart && this.cart.update_item_html) {
                    this.cart.update_item_html(row, true);
                }
            } catch (e) {
                console.warn("WMN offline remove cart row refresh skipped", e);
            }

            try {
                if (this.cart && this.cart.update_totals_section) {
                    this.cart.update_totals_section(this.frm);
                }
            } catch (e) {}

            try {
                if (this.payment && this.payment.update_totals_section) {
                    this.payment.update_totals_section(doc);
                }
            } catch (e) {}

            try {
                if (this.item_details && this.item_details.toggle_item_details_section) {
                    this.item_details.toggle_item_details_section(null);
                }
            } catch (e) {}

            try {
                if (this.frm && this.frm.dirty) {
                    this.frm.dirty();
                }
            } catch (e) {}

            return true;
        }

        update_item_field(value, field_or_action) {
            const result = super.update_item_field(value, field_or_action);

            try {
                if (!(wmn_is_pos_offline())) {
                    return result;
                }

                if (field_or_action === "remove") {
                    setTimeout(() => {
                        try {
                            const row = this.wmn_get_active_offline_item_detail_row();
                            if (row) {
                                this.wmn_remove_offline_item_detail_row(row);
                            }
                        } catch (e) {
                            console.warn("WMN offline numpad remove sync skipped", e);
                        }
                    }, 0);
                    return result;
                }

                if (!["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(field_or_action)) {
                    return result;
                }

                setTimeout(() => {
                    try {
                        const row = this.wmn_get_active_offline_item_detail_row();
                        if (!row) return;

                        const control = this.item_details && this.item_details[`${field_or_action}_control`];
                        const control_value = control && control.get_value ? control.get_value() : value;

                        this.wmn_apply_offline_item_detail_value(row, field_or_action, control_value);
                        this.wmn_refresh_offline_cart_from_item_detail(row);
                    } catch (e) {
                        console.warn("WMN offline numpad to cart sync skipped", e);
                    }
                }, 0);
            } catch (e) {
                console.warn("WMN offline update_item_field bridge skipped", e);
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
                if (wmn_is_pos_offline()) {
                    return this.wmn_offline_on_cart_update(args);
                }
                console.log(args);

                args = await this.wmn_prepare_online_batch_args_before_super(args);

                return await super.on_cart_update(args);
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
                    row.qty = flt(row.qty || 0);
                    row.stock_qty = row.qty * row.conversion_factor;
                    row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
                    row.discount_percentage = flt(row.discount_percentage || 0);
                    row.discount_amount = flt(row.discount_amount || 0);
                    row.rate = flt(row.rate || row.price_list_rate || 0);
                    row.amount = row.qty * row.rate;
                    row.net_rate = flt(row.net_rate || row.rate || 0);
                    row.net_amount = row.qty * row.net_rate;
                    row.base_rate = row.rate;
                    row.base_amount = row.amount;
                    row.base_net_rate = row.net_rate;
                    row.base_net_amount = row.net_amount;
                    total_qty += row.qty;
                    net_total += flt(row.net_amount || row.amount || 0);
                });

                wmn_apply_offline_taxes_and_discount(doc, total_qty, net_total, true);
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

async wmn_prepare_online_batch_args_before_super(args) {
    try {
        if (!args || !args.item) return args;

        const batchValue = args.item.batch_no;

        const needsBatchDialog =
            batchValue !== undefined &&
            batchValue !== null &&
            String(batchValue) !== "" &&
            String(batchValue).toLowerCase() !== "null" &&
            !args.item.__wmn_batch_dialog_done;

        if (!needsBatchDialog) return args;

        const warehouse =
            args.item.warehouse ||
            this.frm?.doc?.set_warehouse ||
            this.settings?.warehouse ||
            "";

        const priceList =
            this.frm?.doc?.selling_price_list ||
            this.settings?.selling_price_list ||
            "";

        const selected = await wmn_show_online_batch_selection_dialog(
            args.item,
            warehouse,
            priceList
        );

        args.item.__wmn_batch_dialog_done = 1;

        if (!selected) {
            return args;
        }

        args.item.batch_no = selected.batch_no;

        const selectedQty = flt(selected.__selected_qty || 0);
        if (selectedQty > 0) {
            args.field = "qty";
            args.value = selectedQty;
            args.item.qty = selectedQty;
        }

        const selectedRate = flt(selected.price_list_rate || selected.rate || 0);
        if (selectedRate > 0) {
            args.item.rate = selectedRate;
            args.item.price_list_rate = selectedRate;
        }

        if (selected.uom && !args.item.uom) {
            args.item.uom = selected.uom;
        }

        if (selected.warehouse) {
            args.item.warehouse = selected.warehouse;
        }

        return args;

    } catch (e) {
        console.warn("WMN online batch args preparation skipped", e);
        return args;
    }
}

async wmn_apply_online_batch_after_cart_update(args, item_row) {
    try {
        //if (!item_row || !item_row.item_code) return;
        if (item_row.batch_no == null) return;
        console.log("DIALOGING");

        const item = (args && args.item) || {};
        


        

        const warehouse =
            item_row.warehouse ||
            this.frm.doc.set_warehouse ||
            this.settings.warehouse ||
            "";

        const priceList =
            this.frm.doc.selling_price_list ||
            this.settings.selling_price_list ||
            "";

        const selected = await wmn_show_online_batch_selection_dialog(
            {
                item_code: item_row.item_code,
                item_name: item_row.item_name,
                qty: item_row.qty || 1,
                uom: item_row.uom || item_row.stock_uom || item.uom || item.stock_uom || "",
                stock_uom: item_row.stock_uom || item.stock_uom || "",
                rate: item_row.rate || item.rate || 0,
                price_list_rate: item_row.price_list_rate || item.price_list_rate || item_row.rate || 0,
                currency: this.frm.doc.currency || this.settings.currency || ""
            },
            warehouse,
            priceList
        );

        if (!selected) return;

        await frappe.model.set_value(
            item_row.doctype,
            item_row.name,
            "batch_no",
            selected.batch_no
        );

        if (selected.__selected_qty) {
            await frappe.model.set_value(
                item_row.doctype,
                item_row.name,
                "qty",
                selected.__selected_qty
            );
        }

        const selectedRate = flt(selected.price_list_rate || selected.rate || 0);
        if (selectedRate > 0) {
            await frappe.model.set_value(
                item_row.doctype,
                item_row.name,
                "rate",
                selectedRate
            );
        }

        this.update_cart_html(item_row);
    } catch (e) {
        console.warn("WMN online batch dialog skipped", e);
    }
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
                            item = wmn_prepare_offline_item_detail_row(
                                item,
                                this.frm.doc,
                                this.settings || {}
                            );
                            const batch_rate = flt(
                                selectedBatch.price_list_rate ||
                                selectedBatch.rate ||
                                0
                            );

                            if (batch_rate > 0) {
                                item.price_list_rate = batch_rate;
                                item.rate = batch_rate;
                            } else {
                                item.price_list_rate = flt(item.price_list_rate || item.rate || 0);
                                item.rate = flt(item.rate || item.price_list_rate || 0);
                            }

                            if (selectedBatch.currency) {
                                item.currency = selectedBatch.currency;
                            }

                            if (selectedBatch.uom) {
                                item.uom = selectedBatch.uom;
                            }
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

                    // \u0644\u0627 \u062A\u0639\u0645\u0644 freeze \u0642\u0628\u0644 Dialog \u0627\u062E\u062A\u064A\u0627\u0631 Batch \u062D\u062A\u0649 \u0644\u0627 \u064A\u0635\u0628\u062D \u0627\u0644\u062F\u064A\u0627\u0644\u0648\u062C \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0641\u0627\u0639\u0644.
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
                                frappe.show_alert({ message: __("\u0627\u0644\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
                                return item_row;
                            }
                        }

                        if (item && item.offline_item_tax_map && (!item_row.offline_item_tax_map || !Object.keys(wmn_parse_json_map(item_row.offline_item_tax_map)).length)) {
                            item_row.offline_item_tax_map = wmn_parse_json_map(item.offline_item_tax_map);
                            item_row.item_tax_rate = item_row.item_tax_rate || item_row.offline_item_tax_map;
                            item_row.item_tax_template = item_row.item_tax_template || item.item_tax_template || "";
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
                            frappe.show_alert({ message: __("\u0627\u0644\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
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
                            item_tax_template: item.item_tax_template || "",
                            offline_item_tax_map: wmn_parse_json_map(item.offline_item_tax_map || item.item_tax_rate || item.item_tax_map || {}),
                            item_tax_rate: wmn_parse_json_map(item.item_tax_rate || item.offline_item_tax_map || item.item_tax_map || {}),
                        });
                    }

                    item_row = wmn_normalize_offline_cart_row(item_row, this.frm.doc, (this.frm.doc.items || []).indexOf(item_row), effective_warehouse);
                    wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);
                    this.wmn_register_offline_row_in_frappe_model(item_row);
                    
                    
                    this.wmn_ensure_offline_item_stock_map(item_row);



                    this.wmn_recalculate_offline_totals();
                    this.frm.dirty();

                    if (this.cart && this.cart.load_invoice) {
                        //this.cart.load_invoice();
                        this.update_cart_html(item_row);
                    } else {
                        this.update_cart_html(item_row);
                    }

                    if (this.item_details && this.item_details.$component && this.item_details.$component.is(":visible")) {
                        this.edit_item_details_of(item_row);
                    }

                    if (this.payment && this.payment.update_totals_section) {
                        this.payment.update_totals_section(this.frm.doc);
                    }

                    if (this.frm && this.frm.refresh_field) {
                        this.frm.refresh_field("items");
                    }
                    frappe.utils.play_sound("submit");
                    return item_row;
                } catch (error) {
                    console.error("WMN offline cart update failed", error);
                    frappe.show_alert({ message: __("\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0635\u0646\u0641 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [error.message || error]), indicator: "red" });
                    return null;
                } finally {
                    if (did_freeze) {
                        frappe.dom.unfreeze();
                    }
                }
            }

            async save_and_checkout() {
                if (wmn_controller_uses_offline_flow(this)) {
                    try {
                    
                    
                        this.wmn_recalculate_offline_totals();
                        

                        await wmn_show_offline_payment_dialog(this);

                        frappe.dom.freeze(wmn_t("Saving offline invoice...", "\u062C\u0627\u0631\u064A \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646..."));
                        // console.table(
                        //     (this.frm.doc.items || []).map(r => ({
                        //         item_code: r.item_code,
                        //         qty: r.qty,
                        //         batch_no: r.batch_no,
                        //         rate: r.rate,
                        //         amount: r.amount
                        //     }))
                        // );
                        await wmn_assign_receipt_number(this.frm.doc);
                        const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);
                        frappe.dom.unfreeze();

                        frappe.show_alert({
                            message: wmn_msg("Invoice added offline successfully: {0}", "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0628\u0646\u062C\u0627\u062D: {0}", [row.offline_id || row.name || this.frm.doc.name]),
                            indicator: "orange"
                        });

                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(this.frm.doc, true);
                        wmn_try_auto_silent_print_after_order(this.frm.doc, "offline");
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
                            title: wmn_t("Offline Save Failed", "\u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638 \u0623\u0648\u0641\u0644\u0627\u064A\u0646"),
                            indicator: "red",
                            message: wmn_msg("Failed to save invoice offline: {0}", "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [e.message || e])
                        });
                        return;
                    }
                }

                return super.save_and_checkout();
            }
            async make_sales_invoice_frm() {
                const doctype = wmn_pos_invoice_doctype(this);

                // ERPNext 15.27 fix:
                // Offline must use the lightweight fake frm only.
                if (wmn_controller_uses_offline_flow(this)) {
                    const doc = await wmn_make_offline_invoice_doc(this);
                    this.frm = wmn_make_offline_frm(doc);
                    wmn_prepare_pos_frm_doc(this);
                    window.cur_frm = this.frm;
                    window.cur_pos = this;
                    return this.frm;
                }

                return new Promise((resolve) => {
                    const build = () => {
                        this.frm = this.get_new_frm(null, doctype);
                        wmn_prepare_pos_frm_doc(this);
                        resolve(this.frm);
                    };

                    frappe.model.with_doctype(doctype, build);
                });
            }
            async make_return_invoice(doc) {
                frappe.dom.freeze();

                const invoiceDoctype = wmn_pos_invoice_doctype(this);
                this.frm = this.get_new_frm(this.frm, invoiceDoctype);
                this.frm.doc.items = [];

                return frappe.call({
                    method: wmn_pos_return_method(invoiceDoctype),
                    args: {
                        source_name: doc.name,
                        target_doc: this.frm.doc,
                    },
                    callback: (r) => {
                        frappe.model.sync(r.message);
                        frappe.get_doc(r.message.doctype, r.message.name).__run_link_triggers = false;
                        this.set_pos_profile_data().then(() => {
                            frappe.dom.unfreeze();
                        });
                    },
                });
            }
            get_new_frm(_frm, doctype) {
                const target_doctype = doctype || wmn_pos_invoice_doctype(this);

                // Never create real ERPNext Form while effective offline.
                if (wmn_controller_uses_offline_flow(this)) {
                    const doc = {
                        doctype: target_doctype,
                        name: (target_doctype === "Sales Invoice" ? "OFFLINE-SINV-" : "OFFLINE-PINV-") + Date.now(),
                        __islocal: 1,
                        __offline_pos: 1,
                        offline_pos: 1,
                        items: [],
                        payments: []
                    };
                    this.frm = wmn_make_offline_frm(doc);
                    wmn_prepare_pos_frm_doc(this);
                    return this.frm;
                }

                const page = $("<div>");
                const frm = new frappe.ui.form.Form(target_doctype, page, false);
                const name = frappe.model.make_new_doc_and_get_name(target_doctype, true);

                // ERPNext 15.27 Sales Invoice setup may touch child grid rows before POS finishes setup.
                // Guard only during the initial refresh, then restore immediately.
                const txProto = erpnext.TransactionController && erpnext.TransactionController.prototype;
                const originalSetFields = txProto && txProto.set_fields_onload_for_line_item;
                const shouldGuard = target_doctype === "Sales Invoice" && typeof originalSetFields === "function";

                try {
                    if (shouldGuard) {
                        txProto.set_fields_onload_for_line_item = function () { return; };
                    }
                    frm.refresh(name);
                } finally {
                    if (shouldGuard) {
                        txProto.set_fields_onload_for_line_item = originalSetFields;
                    }
                }

                frm.doc.items = [];
                frm.doc.is_pos = 1;
                frm.doc.update_stock = frm.doc.update_stock === undefined ? 1 : frm.doc.update_stock;
                frm.doc.pos_profile = this.settings && this.settings.pos_profile ? this.settings.pos_profile : frm.doc.pos_profile;
                frm.doc.currency = frm.doc.currency || this.settings.currency || this.settings.company_currency || frappe.defaults.get_default("currency") || "YER";
                frm.doc.company_currency = frm.doc.company_currency || this.settings.company_currency || frm.doc.currency || "YER";
                frm.doc.conversion_rate = flt(frm.doc.conversion_rate || 1);
                frm.doc.price_list_currency = frm.doc.price_list_currency || this.settings.price_list_currency || frm.doc.currency || "YER";
                frm.doc.plc_conversion_rate = flt(frm.doc.plc_conversion_rate || 1);

                window.cur_frm = frm;
                window.cur_pos = this;

                return frm;
            }
set_pos_profile_data() {
                if (wmn_controller_uses_offline_flow(this)) {

                    const doc = this.frm && this.frm.doc;
                    const settings = this.settings || {};

                    if (doc) {
                        doc.is_pos = 1;
                        doc.update_stock = doc.update_stock === undefined ? 1 : doc.update_stock;
                        doc.pos_profile = doc.pos_profile || settings.pos_profile || "";
                        doc.company = doc.company || settings.company || frappe.defaults.get_default("company") || "";
                        doc.currency = doc.currency || settings.currency || settings.company_currency || frappe.defaults.get_default("currency") || "YER";
                        doc.company_currency = doc.company_currency || settings.company_currency || doc.currency || "YER";
                        doc.conversion_rate = flt(doc.conversion_rate || 1);
                        doc.price_list_currency = doc.price_list_currency || settings.price_list_currency || doc.currency || "YER";
                        doc.plc_conversion_rate = flt(doc.plc_conversion_rate || 1);
                        doc.selling_price_list = doc.selling_price_list || settings.selling_price_list || "";
                        doc.set_warehouse = doc.set_warehouse || settings.warehouse || "";
                    }

                    return Promise.resolve();
                }

                if (super.set_pos_profile_data) {
                    return super.set_pos_profile_data();
                }

                return Promise.resolve();
            }

            init_payments() {
                super.init_payments();

                if (!this.payment || !this.payment.events) {
                    return;
                }

                this.payment.events.submit_invoice = async () => {
                    if (wmn_controller_uses_offline_flow(this)) {
                        return this.save_and_checkout();
                    }

                    try {
                        if (this.frm && this.frm.doc) {
                            await wmn_assign_receipt_number(this.frm.doc);
                        }

                        const r = await this.frm.savesubmit();
                        const submittedDoc = (r && r.doc) || (this.frm && this.frm.doc) || {};

                        submittedDoc.wmn_receipt_no = submittedDoc.wmn_receipt_no || (this.frm.doc && this.frm.doc.wmn_receipt_no) || (this.frm.doc && this.frm.doc.__wmn_receipt_no) || "";
                        submittedDoc.__wmn_receipt_no = submittedDoc.__wmn_receipt_no || submittedDoc.wmn_receipt_no || "";

                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(submittedDoc, true);
                        wmn_try_auto_silent_print_after_order(submittedDoc, "online");

                        if (this.recent_order_list && this.recent_order_list.refresh_list) {
                            this.recent_order_list.refresh_list();
                        }

                        frappe.show_alert({
                            indicator: "green",
                            message: __("POS invoice {0} created successfully", [submittedDoc.name])
                        });

                        return r;
                    } catch (e) {
                        console.error("WMN online submit invoice failed", e);
                        throw e;
                    }
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
                this.recent_order_list = new erpnext.PointOfSale.PastOrderList({
                    wrapper: this.$components_wrapper,
                    events: {
                        open_invoice_data: (name) => {
                            frappe.db.get_doc(wmn_pos_invoice_doctype(this), name).then((doc) => {
                                this.order_summary.load_summary_of(doc);
                            });
                        },
                        reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
                    },
                });
            }
            init_order_summary() {
                const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                this.settings = wmn_safe_settings(this.settings || {});
                this.order_summary = new erpnext.PointOfSale.PastOrderSummary({
                    wrapper: this.$components_wrapper,
                    settings: wmn_safe_settings(this.settings || {}),
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

                                () => {
                                    if (window.__wmn_pos_effective_offline === true) {
                                        return null;
                                    }

                                    return this.cart && this.cart.load_invoice
                                        ? this.cart.load_invoice()
                                        : null;
                                },

                                () => this.item_selector.toggle_component(true),

                                () => this.cart.$numpad_section.css("display", "none"),
                                () => this.cart.$totals_section.css("display", "flex"),
                                
                                

                                () => frappe.dom.unfreeze(),
                                
                                async () => {
                                    if (window.__wmn_pos_effective_offline === true) {
                                    const isOffline = await wmn_bootstrap_detect_effective_offline();

                                    this.__wmn_new_order_online = !isOffline;

                                    

                                    if (!isOffline) {
                                        
                                        location.reload();
                                        
                                    }
                                    }
                                },
                                
                            ]).catch((e) => {
                                frappe.dom.unfreeze();

                                if (e === "wmn_reload_online_new_order") {
                                    return;
                                }

                                console.error("WMN new_order failed", e);
                            });
                        },
                        
                    },
                });
            }

        }

        const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;
        
        
        
        class MyPastOrderSummary extends OriginalPastOrderSummary {
            constructor(options = {}, args = {}) {
                // ERPNext 15.95 PastOrderSummary constructor expects one object:
                // { wrapper, settings, events }.
                let opts = options || {};

                if (!opts.wrapper && args && args.wrapper) {
                    opts = args;
                }

                opts.settings = wmn_safe_settings(
                    opts.settings ||
                    (window.cur_pos && window.cur_pos.settings) ||
                    {}
                );

                opts.events = opts.events || {};

                super(opts);
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
            constructor(options = {}, args = {}) {
                let opts = options || {};

                if (!opts.wrapper && args && args.wrapper) {
                    opts = args;
                }

                opts.events = opts.events || {};
                super(opts);
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
            get_items({ start = 0, page_length = 40, search_term = "" } = {}) {
                if (wmn_is_pos_offline() && window.wmnPOSOffline) {
                    const promise = window.wmnPOSOffline
                        .searchItems({
                            start,
                            page_length,
                            search_term,
                            price_list: this.price_list,
                            item_group: this.item_group,
                        })
                        .then((items) => ({
                            message: {
                                items: items || [],
                            },
                        }));

                    return wmn_as_frappe_call_like(promise);
                }

                // Online must return ERPNext original frappe.call/jqXHR object,
                // so load_items_data can safely call .then(...).always(...).
                return super.get_items({ start, page_length, search_term });
            }
            
                        async wmn_scan_barcode_structure_offline(searchValue) {
                if (!window.wmnPOSOffline || !searchValue) return null;

                const barcode = String(searchValue || "").trim();
                const structures = await window.wmnPOSOffline.getAll(
                    window.wmnPOSOffline.STORES.barcode_structures
                );

                for (const structure of structures || []) {
                    const prefix = String(structure.prefix || "");
                    const totalLength = cint(structure.total_length || 0);

                    if (!barcode.startsWith(prefix)) continue;
                    if (totalLength && barcode.length !== totalLength) continue;

                    let cursor = prefix.length;
                    const res = { barcode };

                    for (const row of structure.structure_table || []) {
                        const fieldName = row.field_type;
                        const length = cint(row.length || 0);
                        const dataType = row.field_data_type;
                        const divisor = flt(row.divisor || 1);

                        if (!fieldName || !length) continue;

                        const rawValue = barcode.substr(cursor, length);
                        cursor += length;

                        if (dataType === "Float") {
                            res[fieldName] = flt(rawValue) / divisor;
                        } else {
                            res[fieldName] = rawValue;
                        }
                    }

                    if (!res.item_code) continue;

                    let itemCode = res.item_code;

                    let item = await window.wmnPOSOffline.get(
                        window.wmnPOSOffline.STORES.items,
                        itemCode
                    );

                    if (!item) {
                        const barcodeRows = await window.wmnPOSOffline.getAll(
                            window.wmnPOSOffline.STORES.item_barcodes
                        );

                        const foundBarcode = (barcodeRows || []).find(b =>
                            String(b.barcode || "").trim() === String(itemCode).trim()
                        );

                        if (foundBarcode && foundBarcode.item_code) {
                            itemCode = foundBarcode.item_code;

                            item = await window.wmnPOSOffline.get(
                                window.wmnPOSOffline.STORES.items,
                                itemCode
                            );

                            if (foundBarcode.uom) {
                                res.uom = foundBarcode.uom;
                            }
                        }
                    }

                    if (!item) return null;

                    const settings = await window.wmnPOSOffline.getFullSettings();
                    const priceList = settings.selling_price_list || "";
                    const uom = res.uom || item.uom || item.stock_uom || "";

                    const price = await wmn_find_price_offline(
                        item.item_code,
                        priceList,
                        uom
                    );

                    return Object.assign({}, item, {
                        barcode,
                        item_code: item.item_code,
                        item_name: item.item_name || item.item_code,
                        qty: flt(res.qty || 1),
                        uom: uom,
                        stock_uom: item.stock_uom || uom,
                        price_list_rate: price
                            ? flt(price.price_list_rate)
                            : flt(item.price_list_rate || item.rate || 0),
                        rate: price
                            ? flt(price.price_list_rate)
                            : flt(item.rate || item.price_list_rate || 0),
                        has_batch_no: cint(item.has_batch_no || 0),
                        has_serial_no: cint(item.has_serial_no || 0),
                        __wmn_from_barcode_structure: 1,
                    });
                }

                return null;
            }     
            
            filter_items({ search_term = "" } = {}) {


                if (!navigator.onLine && window.wmnPOSOffline) {
                    return this.wmn_scan_barcode_structure_offline(search_term).then((structured_item) => {
                        if (structured_item && structured_item.item_code && search_term && search_term.length >= 12) {
                            this.events.item_selected({
                                field: "qty",
                                value: structured_item.qty || 1,
                                item: structured_item,
                            });

                            this.set_search_value("");
                            frappe.utils.play_sound("submit");
                            return;
                        }

                        return this.get_items({ search_term }).then(({ message }) => {
                            const items = (message && message.items) || [];

                            if (items.length === 1 && search_term && search_term.length >= 8) {
                                this.events.item_selected({
                                    field: "qty",
                                    value: items[0].qty || 1,
                                    item: items[0],
                                });

                                this.set_search_value("");
                                frappe.utils.play_sound("submit");
                                return;
                            }

                            this.render_item_list(items);
                        });
                    });
                }
                if (search_term && search_term.length >= 12) {
                    const pos_ctrl = window.cur_pos;
                    
                    let pos_profile_name = null;
                    if (pos_ctrl.pos_profile && typeof pos_ctrl.pos_profile === 'string') {
                        pos_profile_name = pos_ctrl.pos_profile;
                    } else if (pos_ctrl.settings && pos_ctrl.settings) {
                        pos_profile_name = pos_ctrl.settings;
                    } else if (pos_ctrl.frm?.doc?.pos_profile) {
                        pos_profile_name = pos_ctrl.frm.doc.pos_profile;
                    }
                    
                    
                    return frappe.call({
                        method: "wmn.barcode_handler.custom_scan_barcode_pos",
                        args: { 
                            search_value: search_term,
                            //pos_profile: this.pos_profile || this.events.get_frm().doc.pos_profile,
        price_list: this.price_list || this.events.get_frm().doc.selling_price_list,

                            pos_profile: pos_profile_name
                        }
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
                                
                                await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                                if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                                }
                                if (data.serial_no) {
                                    let new_serial_no = existing_item.serial_no ? existing_item.serial_no + "\n" + data.serial_no : data.serial_no;
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                                }
                                
                                if (pos_ctrl.update_cart_html) {
                                    pos_ctrl.update_cart_html(existing_item);
                                }
                                frappe.dom.unfreeze();
                            } else {
                                let final_rate = data.rate || data.price_list_rate || 0;
                                
                                if (final_rate === 0 && pos_ctrl.item_selector && pos_ctrl.item_selector.items) {
                                    let ui_item = pos_ctrl.item_selector.items.find(i => i.item_code === data.item_code);
                                    final_rate = ui_item ? (ui_item.price_list_rate || ui_item.rate) : 0;
                                }
                                
                                
                                if (pos_ctrl.add_item) {
                                    await pos_ctrl.add_item({
                                        item_code: data.item_code,
                                        qty: qty_value,
                                        rate: final_rate,
                                        price_list_rate: final_rate,
                                        batch_no: data.batch_no,
                                        serial_no: data.serial_no,
                                        uom: data.uom
                                    });
                                } else {
                                    this.events.item_selected({
                                        field: "qty",
                                        value: qty_value,
                                        item: {
                                            item_code: data.item_code,
                                            batch_no: data.batch_no,
                                            serial_no: data.serial_no,
                                            uom: data.uom,
                                            rate: final_rate
                                        },
                                    });
                                }
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
                            <button class="btn wmn-list-offline-btn">
                                ${wmn_t("Offline Sync", "\u0645\u0632\u0627\u0645\u0646\u0629")}
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
                            <button class="wmn-list-offline-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Button View" aria-label="Switch to list view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `);
                
                this.$component.prepend($toggleContainer);
                this.$offlineBtn = $toggleContainer.find('.wmn-list-offline-btn');
                this.$gridBtn = $toggleContainer.find('.wmn-grid-view-btn');
                this.$listBtn = $toggleContainer.find('.wmn-list-view-btn');
                
                this.updateActiveButton();
                
                this.$offlineBtn.on('click', () => window.wmnPOSOffline.openInvoiceManagerDialog());
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
await wmn_bootstrap_detect_effective_offline();
wmn_install_offline_server_call_guard();
wmn_install_offline_doctype_script_guard();
wrapper.pos = new MyPOSController(wrapper);
wmn_init_offline_invoice_manager_dialog(wrapper.pos);
window.cur_pos = wrapper.pos;
setTimeout(function () {
    if (typeof wmn_sync_receipt_counter_on_page_load === "function") {
        wmn_sync_receipt_counter_on_page_load();
    }
}, 3000);
















    });
};


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


function wmn_is_mobile_pos_device() {
    return (
        window.innerWidth <= 768 ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );
}

function wmn_is_pos_page() {
    return (
        location.pathname.includes("point-of-sale") ||
        location.hash.includes("point-of-sale")
    );
}

function wmn_block_pos_search_focus_for(ms) {
    window.__wmn_block_pos_search_focus_until = Date.now() + (ms || 1200);
}

function wmn_should_block_pos_search_focus() {
    return (
        wmn_is_pos_page() &&
        wmn_is_mobile_pos_device() &&
        Date.now() < flt(window.__wmn_block_pos_search_focus_until || 0)
    );
}

function wmn_is_pos_search_input(el) {
    if (!el) return false;

    return !!(
        el.closest(".items-selector") ||
        el.closest(".item-selector") ||
        el.closest(".item-search") ||
        el.closest(".search-field") ||
        el.closest(".pos-items") ||
        el.getAttribute("data-fieldname") === "search_term"
    );
}

function wmn_install_mobile_pos_search_focus_guard() {
    if (window.__wmn_mobile_pos_search_focus_guard_installed) return;
    window.__wmn_mobile_pos_search_focus_guard_installed = true;

    // ??? ????? ??? ?? Item? ???? ??????? ???????? ???? ?????
    document.addEventListener("click", function (e) {
        if (!wmn_is_pos_page() || !wmn_is_mobile_pos_device()) return;

        if (e.target.closest(".item-wrapper")) {
            wmn_block_pos_search_focus_for(1500);
        }
    }, true);

    // ??? ???? ItemSelector ?????? ???? focus ??? ???????? ?????
    document.addEventListener("focusin", function (e) {
        if (!wmn_should_block_pos_search_focus()) return;

        const el = e.target;
        if (!wmn_is_pos_search_input(el)) return;

        setTimeout(function () {
            try {
                el.blur();
                if (document.activeElement && document.activeElement.blur) {
                    document.activeElement.blur();
                }
            } catch (err) {}
        }, 0);
    }, true);

    // ????? ??????: ??? set_focus ???? ????? ???? ?????
    function patch_set_focus(proto) {
        if (!proto || !proto.set_focus || proto.__wmn_mobile_focus_patched) return;

        const original_set_focus = proto.set_focus;

        proto.set_focus = function () {
            try {
                const input =
                    this.$input && this.$input[0]
                        ? this.$input[0]
                        : null;

                if (
                    wmn_should_block_pos_search_focus() &&
                    (
                        wmn_is_pos_search_input(input) ||
                        this.df?.fieldname === "search_term"
                    )
                ) {
                    if (input && input.blur) input.blur();

                    if (document.activeElement && document.activeElement.blur) {
                        document.activeElement.blur();
                    }

                    return;
                }
            } catch (e) {}

            return original_set_focus.apply(this, arguments);
        };

        proto.__wmn_mobile_focus_patched = true;
    }

    // Patch ??? ERPNext ??????? ?????? ControlData ???????? ControlAutocomplete
    patch_set_focus(frappe.ui?.form?.ControlData?.prototype);
    patch_set_focus(frappe.ui?.form?.ControlAutocomplete?.prototype);
    patch_set_focus(frappe.ui?.form?.ControlLink?.prototype);

}

wmn_install_mobile_pos_search_focus_guard();


