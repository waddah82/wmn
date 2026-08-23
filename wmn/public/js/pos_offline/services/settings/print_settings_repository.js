/* Shared WMN Print Settings repository with device-local source selection and offline cache. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Settings = ns.Services.Settings || {};

    const SERVER_CACHE_KEY = "wmn_pos_print_server_cache_v1";
    const SOURCE_KEY = "wmn_pos_print_settings_source_v1";
    const SERVER_DEFAULTS = {
        available: false,
        doctype: "WMN Print Settings",
        name: "",
        config: {},
        can_write: false,
        modified: "",
        cached_at: "",
    };
    const SOURCE_DEFAULTS = { source: "server" };

    let initializePromise = null;
    let refreshPromise = null;

    function preferences() {
        return ns.Services?.Settings?.DevicePreferences || null;
    }

    preferences()?.register?.(SERVER_CACHE_KEY, SERVER_DEFAULTS);
    preferences()?.register?.(SOURCE_KEY, SOURCE_DEFAULTS);

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
    }

    function readServerStateSync() {
        const service = preferences();
        if (!service?.readSync) return clone(SERVER_DEFAULTS);
        return Object.assign({}, SERVER_DEFAULTS, service.readSync(SERVER_CACHE_KEY, SERVER_DEFAULTS) || {});
    }

    function writeServerState(state) {
        const normalized = Object.assign({}, SERVER_DEFAULTS, state || {}, {
            config: Object.assign({}, state?.config || {}),
            cached_at: new Date().toISOString(),
        });
        preferences()?.write?.(SERVER_CACHE_KEY, normalized, SERVER_DEFAULTS);
        return normalized;
    }

    function getSource() {
        let explicitSource = false;
        let legacyLocalPrintConfig = false;
        try {
            explicitSource = !!window.localStorage.getItem(SOURCE_KEY);
            legacyLocalPrintConfig = !!window.localStorage.getItem("wmn_pos_print_transport_v1");
        } catch (e) {}

        // Existing terminals must not lose their already configured printer during
        // the migration to shared server settings. A brand-new browser has no local
        // transport config, so it naturally starts from the server source.
        if (!explicitSource && legacyLocalPrintConfig) {
            const serverConfig = readServerStateSync().config || {};
            if (!Object.keys(serverConfig).length) return "local";
        }

        const value = preferences()?.readSync?.(SOURCE_KEY, SOURCE_DEFAULTS) || SOURCE_DEFAULTS;
        return String(value.source || "server") === "local" ? "local" : "server";
    }

    function setSource(source) {
        const normalized = String(source || "server") === "local" ? "local" : "server";
        preferences()?.write?.(SOURCE_KEY, { source: normalized }, SOURCE_DEFAULTS);
        return normalized;
    }

    function online() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return false;
            if (window.__wmn_pos_effective_offline === true) return false;
        } catch (e) {}
        return navigator.onLine !== false;
    }

    async function refresh() {
        if (!online()) return readServerStateSync();
        if (refreshPromise) return refreshPromise;

        refreshPromise = (async () => {
            try {
                const response = await frappe.call({
                    method: "wmn.api.get_pos_print_transport_settings",
                    freeze: false,
                });
                const payload = response?.message || {};
                return writeServerState(payload);
            } catch (error) {
                console.warn("WMN shared printer settings refresh failed; cached settings remain active", error);
                return readServerStateSync();
            } finally {
                refreshPromise = null;
            }
        })();

        return refreshPromise;
    }

    async function initialize() {
        if (initializePromise) return initializePromise;
        initializePromise = (async () => {
            if (online()) await refresh();
            return readServerStateSync();
        })();
        return initializePromise;
    }

    async function saveServer(config) {
        if (!online()) throw new Error(__("Cannot save WMN Print Settings while offline."));

        const response = await frappe.call({
            method: "wmn.api.save_pos_print_transport_settings",
            args: { config: config || {} },
            freeze: false,
        });
        const payload = response?.message || {};
        const state = writeServerState(payload);
        setSource("server");
        return state;
    }

    function getServerConfig() {
        return Object.assign({}, readServerStateSync().config || {});
    }

    function status() {
        const state = readServerStateSync();
        return {
            source: getSource(),
            online: online(),
            available: !!state.available,
            doctype: state.doctype || "WMN Print Settings",
            name: state.name || "",
            can_write: !!state.can_write,
            modified: state.modified || "",
            cached_at: state.cached_at || "",
        };
    }

    ns.Services.Settings.PrintSettingsRepository = {
        SERVER_CACHE_KEY,
        SOURCE_KEY,
        initialize,
        refresh,
        saveServer,
        getServerConfig,
        getSource,
        setSource,
        status,
        isOnline: online,
    };
})();
