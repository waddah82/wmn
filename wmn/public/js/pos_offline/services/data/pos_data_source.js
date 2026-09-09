/* WMN POS data-source boundary: Online uses ERPNext, Offline uses local backends only. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services = ns.Services || {};
    ns.Services.Data = ns.Services.Data || {};

    const BACKEND = Object.freeze({
        ONLINE: "online",
        CACHE: "cache",
        LOCAL_STORAGE: "local_storage",
        LOCAL_DB: "local_db",
    });

    const backendRegistry = {};

    function clone(value) {
        if (value === undefined) return undefined;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function isOfflineRuntime(ctrl) {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && ctrl) {
                return Boolean(wmn_controller_uses_offline_flow(ctrl));
            }
        } catch (error) {}

        try {
            if (typeof wmn_is_pos_offline === "function") return Boolean(wmn_is_pos_offline());
        } catch (error) {}

        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function asCallLike(message) {
        if (window.WMNPOSControllerCache?.prototype?.asCallLike) {
            return new window.WMNPOSControllerCache(null, "datasource").asCallLike(message);
        }
        const response = { message };
        const promise = Promise.resolve(response);
        promise.done = function (callback) { if (typeof callback === "function") promise.then(callback); return promise; };
        promise.fail = function () { return promise; };
        promise.always = function (callback) { if (typeof callback === "function") promise.finally(callback); return promise; };
        return promise;
    }

    function requireOfflineStorage() {
        if (!window.wmnPOSOffline) {
            throw new Error(__("WMN POS offline storage is not available. Open WMN POS online once to preload local data."));
        }
        return window.wmnPOSOffline;
    }

    class OnlineERPNextBackend {
        constructor(ctrl) {
            this.id = BACKEND.ONLINE;
            this.ctrl = ctrl || null;
        }

        isOffline() {
            return false;
        }

        async call(method, args = {}, options = {}) {
            return frappe.call(Object.assign({}, options || {}, { method, args }));
        }

        async getDoc(doctype, name) {
            return frappe.db.get_doc(doctype, name);
        }

        async getList(doctype, options = {}) {
            return frappe.db.get_list(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            return frappe.db.get_value(doctype, filters, fieldname);
        }
    }

    class OfflineLocalBackend {
        constructor(ctrl, options = {}) {
            this.id = options.id || BACKEND.CACHE;
            this.ctrl = ctrl || null;
            this.storageKind = options.storageKind || BACKEND.CACHE;
            this.driver = options.driver || null;
            this._controllerCache = null;
        }

        isOffline() {
            return true;
        }

        get storage() {
            return requireOfflineStorage();
        }

        get controllerCache() {
            if (!this._controllerCache) {
                this._controllerCache = new window.WMNPOSControllerCache(this.ctrl, this.ctrl?.__wmn_pos_version || "");
            }
            return this._controllerCache;
        }

        async call(method, args = {}) {
            const normalized = String(method || "");
            if (normalized === "erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry") {
                return this.controllerCache.fetchOpeningEntryCallLike();
            }
            if (normalized === "erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data") {
                return asCallLike(await this.controllerCache.getPOSProfileData(args.pos_profile || this.ctrl?.pos_profile || ""));
            }
            if (normalized === "erpnext.stock.doctype.stock_settings.stock_settings.get_enable_stock_uom_editing") {
                return this.controllerCache.getStockSettingsValue("allow_negative_stock");
            }

            throw new Error(__("Offline POS data source has no local method for: {0}", [normalized]));
        }

        async getDoc(doctype, name) {
            if (!doctype || !name) return null;

            if (["Sales Invoice", "POS Invoice"].includes(doctype)) {
                const invoice = await this.controllerCache.getInvoiceFromCache(doctype, name);
                if (invoice) return clone(invoice);
            }

            if (this.storage.getDoc) {
                const doc = await this.storage.getDoc(doctype, name);
                if (doc) return clone(doc);
            }

            const cache = ns.Services.Cache?.PosCacheAdapter;
            const sourceId = this.sourceForDoctype(doctype);
            if (cache && sourceId) return await cache.get(sourceId, name);

            return null;
        }

        async getList(doctype, options = {}) {
            const cache = ns.Services.Cache?.PosCacheAdapter;
            const sourceId = this.sourceForDoctype(doctype);
            if (cache && sourceId) {
                return await cache.list(sourceId, {
                    search: options.search || options.txt || "",
                    limit: options.limit || options.page_length || 0,
                });
            }
            return [];
        }

        async getValue(doctype, filters, fieldname) {
            const name = typeof filters === "string" ? filters : filters?.name;
            const doc = await this.getDoc(doctype, name);
            const value = fieldname ? doc?.[fieldname] : doc;
            return { message: fieldname ? { [fieldname]: value } : value };
        }

        sourceForDoctype(doctype) {
            const map = {
                Item: "items",
                Customer: "customers",
                "Item Price": "item_prices",
                "Bin": "stock",
                Batch: "batches",
                "Item Barcode": "item_barcodes",
                "Serial No": "serials",
                "Mode of Payment": "payment_methods",
                "Coupon Code": "coupons",
                "WMN POS Promotion": "promotions",
                "Item Group": "item_groups",
                "POS Profile": "pos_profile",
                "POS Settings": "pos_settings",
                "POS Opening Entry": "pos_opening_entry",
                DocType: "doctype_meta",
            };
            return map[doctype] || "";
        }

        async getPOSProfileData(posProfile) {
            return this.controllerCache.getPOSProfileData(posProfile);
        }

        async getStockSettings() {
            return this.controllerCache.getStockSettings();
        }

        async getInvoiceFields() {
            return this.controllerCache.getInvoiceFields();
        }

        async getInvoiceDoctype(defaultDoctype) {
            return this.controllerCache.getInvoiceDoctype(defaultDoctype);
        }

        async getInvoice(doctype, name) {
            return this.controllerCache.getInvoiceFromCache(doctype, name);
        }

        async deleteInvoice(doctype, name) {
            return this.controllerCache.deleteInvoiceFromCache(doctype, name);
        }

        async saveInvoice(doc, ctrl) {
            if (this.storage.saveInvoice) return this.storage.saveInvoice(doc, ctrl || this.ctrl);
            return { invoice: clone(doc), status: "pending" };
        }

        async makeReturnInvoice(sourceDoc) {
            return this.controllerCache.makeReturnInvoiceOffline(sourceDoc);
        }

        async getAvailableStockCallLike(itemCode, warehouse) {
            return this.controllerCache.getAvailableStockCallLike(itemCode, warehouse);
        }

        async checkSerialReserved(itemCode, warehouse, serialNo) {
            return this.controllerCache.checkSerialReserved(itemCode, warehouse, serialNo);
        }

        async safeRefreshRecentOrders(ctrl) {
            return this.controllerCache.safeRefreshRecentOrders(ctrl || this.ctrl);
        }
    }

    class LocalStorageBackend extends OfflineLocalBackend {
        constructor(ctrl, options = {}) {
            super(ctrl, Object.assign({}, options, { id: BACKEND.LOCAL_STORAGE, storageKind: BACKEND.LOCAL_STORAGE }));
            this.prefix = options.prefix || "wmn_pos_local";
        }

        storageKey(doctype, name) {
            return `${this.prefix}:${doctype}:${name}`;
        }

        async getDoc(doctype, name) {
            try {
                const raw = window.localStorage.getItem(this.storageKey(doctype, name));
                if (raw) return JSON.parse(raw);
            } catch (error) {
                console.warn("WMN POS localStorage getDoc skipped", error);
            }
            return super.getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            const prefix = `${this.prefix}:${doctype}:`;
            const rows = [];
            try {
                for (let index = 0; index < window.localStorage.length; index += 1) {
                    const key = window.localStorage.key(index);
                    if (!key || !key.startsWith(prefix)) continue;
                    const raw = window.localStorage.getItem(key);
                    if (raw) rows.push(JSON.parse(raw));
                }
            } catch (error) {
                console.warn("WMN POS localStorage getList skipped", error);
            }

            if (!rows.length) return super.getList(doctype, options);

            const query = String(options.search || options.txt || "").toLowerCase().trim();
            const filtered = query
                ? rows.filter(row => JSON.stringify(row || {}).toLowerCase().includes(query))
                : rows;
            const limit = Number(options.limit || options.page_length || 0);
            return limit > 0 ? filtered.slice(0, limit) : filtered;
        }

        async putDoc(doctype, doc) {
            if (!doctype || !doc?.name) throw new Error("doctype and doc.name are required for localStorage POS writes");
            window.localStorage.setItem(this.storageKey(doctype, doc.name), JSON.stringify(doc));
            return clone(doc);
        }
    }

    class LocalDBBackend extends OfflineLocalBackend {
        constructor(ctrl, options = {}) {
            super(ctrl, Object.assign({}, options, { id: BACKEND.LOCAL_DB, storageKind: BACKEND.LOCAL_DB }));
            this.driver = options.driver || null;
        }

        async getDoc(doctype, name) {
            if (this.driver?.getDoc) return this.driver.getDoc(doctype, name);
            return super.getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            if (this.driver?.getList) return this.driver.getList(doctype, options);
            return super.getList(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            if (this.driver?.getValue) return this.driver.getValue(doctype, filters, fieldname);
            return super.getValue(doctype, filters, fieldname);
        }

        async putDoc(doctype, doc) {
            if (!this.driver?.putDoc) throw new Error("WMN POS local DB driver does not implement putDoc");
            return this.driver.putDoc(doctype, doc);
        }
    }

    class WMNPOSDataSource {
        constructor(ctrl, options = {}) {
            this.ctrl = ctrl || null;
            this.online = new OnlineERPNextBackend(ctrl);
            this.offline = new OfflineLocalBackend(ctrl, options.offline || {});
            this.localBackends = backendRegistry;
        }

        isOffline() {
            return isOfflineRuntime(this.ctrl);
        }

        mode() {
            return this.active().id;
        }

        active() {
            if (!this.isOffline()) return this.online;
            const preferred = this.ctrl?.__wmn_local_backend || window.__wmn_pos_local_backend || this.offline.id;
            if (preferred === this.offline.id) return this.offline;
            const registered = this.localBackends[preferred];
            if (typeof registered === "function") return registered(this.ctrl);
            return registered || this.offline;
        }

        backendCapabilities() {
            return {
                mode: this.mode(),
                available_local_backends: Object.keys(this.localBackends),
                supports_cache: true,
                supports_local_storage: Boolean(this.localBackends[BACKEND.LOCAL_STORAGE]),
                supports_local_db: Boolean(this.localBackends[BACKEND.LOCAL_DB]),
            };
        }

        controllerCache() {
            return this.offline.controllerCache;
        }

        async call(method, args = {}, options = {}) {
            return this.active().call(method, args, options);
        }

        async getDoc(doctype, name) {
            return this.active().getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            return this.active().getList(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            return this.active().getValue(doctype, filters, fieldname);
        }
    }

    function registerBackend(id, backend) {
        if (!id || !backend) throw new Error("WMN POS local backend id and implementation are required");
        backendRegistry[id] = backend;
        return backend;
    }

    function createForController(ctrl, options = {}) {
        const dataSource = new WMNPOSDataSource(ctrl, options);
        if (ctrl) ctrl.wmn_data_source = dataSource;
        window.__wmn_pos_data_source = dataSource;
        return dataSource;
    }

    registerBackend(BACKEND.CACHE, ctrl => new OfflineLocalBackend(ctrl, { id: BACKEND.CACHE, storageKind: BACKEND.CACHE }));
    registerBackend(BACKEND.LOCAL_STORAGE, ctrl => new LocalStorageBackend(ctrl));
    registerBackend(BACKEND.LOCAL_DB, ctrl => new LocalDBBackend(ctrl, { driver: window.__wmn_pos_local_db_driver || null }));

    ns.Services.Data = Object.assign(ns.Services.Data, {
        BACKEND,
        OnlineERPNextBackend,
        OfflineLocalBackend,
        LocalStorageBackend,
        LocalDBBackend,
        WMNPOSDataSource,
        registerBackend,
        createForController,
        getCurrent: () => window.__wmn_pos_data_source || null,
    });
})();
