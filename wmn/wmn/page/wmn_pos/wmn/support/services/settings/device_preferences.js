/* Persistent device-local WMN POS preferences with localStorage + IndexedDB backup. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Settings = ns.Services.Settings || {};

    const DB_NAME = "wmnPOSDevicePreferences";
    const DB_VERSION = 1;
    const STORE_NAME = "preferences";
    const registry = new Map();
    const memory = new Map();
    let dbPromise = null;
    let initializePromise = null;
    let initialized = false;

    function clone(value) {
        if (value === undefined) return undefined;
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
    }

    function normalizeObject(value, defaults) {
        const base = defaults && typeof defaults === "object" ? clone(defaults) : {};
        const incoming = value && typeof value === "object" && !Array.isArray(value) ? value : {};
        return Object.assign(base || {}, incoming);
    }

    function readLocal(key) {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch (error) {
            console.warn(`WMN device preference local read failed: ${key}`, error);
            return null;
        }
    }

    function writeLocal(key, value) {
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn(`WMN device preference local write failed: ${key}`, error);
            return false;
        }
    }

    function openDb() {
        if (!window.indexedDB) return Promise.resolve(null);
        if (dbPromise) return dbPromise;

        dbPromise = new Promise((resolve) => {
            let request;
            try {
                request = window.indexedDB.open(DB_NAME, DB_VERSION);
            } catch (error) {
                console.warn("WMN device preference database could not be opened", error);
                resolve(null);
                return;
            }

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "key" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.warn("WMN device preference database open failed", request.error);
                resolve(null);
            };
        });

        return dbPromise;
    }

    async function readBackup(key) {
        const db = await openDb();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, "readonly");
                const request = tx.objectStore(STORE_NAME).get(key);
                request.onsuccess = () => resolve(request.result?.value || null);
                request.onerror = () => resolve(null);
            } catch (error) {
                resolve(null);
            }
        });
    }

    async function writeBackup(key, value) {
        const db = await openDb();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(STORE_NAME, "readwrite");
                tx.objectStore(STORE_NAME).put({
                    key,
                    value: clone(value),
                    updated_at: new Date().toISOString(),
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
                tx.onabort = () => resolve(false);
            } catch (error) {
                resolve(false);
            }
        });
    }

    function register(key, defaults) {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey) throw new Error("WMN device preference key is required");
        registry.set(normalizedKey, clone(defaults || {}));
        return normalizedKey;
    }

    function readSync(key, defaults) {
        const normalizedKey = String(key || "").trim();
        const configuredDefaults = defaults || registry.get(normalizedKey) || {};
        const local = readLocal(normalizedKey);
        if (local) {
            const value = normalizeObject(local, configuredDefaults);
            memory.set(normalizedKey, value);
            return clone(value);
        }
        if (memory.has(normalizedKey)) {
            return clone(normalizeObject(memory.get(normalizedKey), configuredDefaults));
        }
        return normalizeObject({}, configuredDefaults);
    }

    function write(key, value, defaults) {
        const normalizedKey = String(key || "").trim();
        const configuredDefaults = defaults || registry.get(normalizedKey) || {};
        const normalized = normalizeObject(value, configuredDefaults);
        memory.set(normalizedKey, normalized);
        writeLocal(normalizedKey, normalized);
        writeBackup(normalizedKey, normalized).catch((error) => {
            console.warn(`WMN device preference backup write failed: ${normalizedKey}`, error);
        });
        return clone(normalized);
    }

    async function restoreKey(key, defaults) {
        const local = readLocal(key);
        const backup = await readBackup(key);

        if (local) {
            const normalized = normalizeObject(local, defaults);
            memory.set(key, normalized);
            if (!backup || JSON.stringify(backup) !== JSON.stringify(normalized)) {
                await writeBackup(key, normalized);
            }
            return normalized;
        }

        if (backup) {
            const normalized = normalizeObject(backup, defaults);
            memory.set(key, normalized);
            writeLocal(key, normalized);
            return normalized;
        }

        const normalized = normalizeObject({}, defaults);
        memory.set(key, normalized);
        return normalized;
    }

    async function initialize() {
        if (initialized) return true;
        if (initializePromise) return initializePromise;

        initializePromise = (async () => {
            for (const [key, defaults] of registry.entries()) {
                await restoreKey(key, defaults);
            }
            initialized = true;
            window.dispatchEvent(new CustomEvent("wmn:device-preferences-ready"));
            return true;
        })().catch((error) => {
            console.warn("WMN device preference initialization failed; localStorage fallback remains active", error);
            initialized = true;
            return false;
        });

        return initializePromise;
    }

    async function syncRegisteredBackups() {
        for (const [key, defaults] of registry.entries()) {
            const current = readSync(key, defaults);
            await writeBackup(key, current);
        }
        return true;
    }

    ns.Services.Settings.DevicePreferences = {
        DB_NAME,
        STORE_NAME,
        register,
        initialize,
        readSync,
        write,
        syncRegisteredBackups,
        isInitialized() { return initialized; },
    };
})();
