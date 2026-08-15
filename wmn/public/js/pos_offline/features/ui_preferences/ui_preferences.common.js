/* WMN POS local UI preferences. */
(function () {
    "use strict";

    const STORAGE_KEY = "wmn_pos_ui_preferences_v1";
    const DEFAULTS = Object.freeze({
        show_item_cart_counter: false,
    });

    function readAll() {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            const stored = raw ? JSON.parse(raw) : {};
            return Object.assign({}, DEFAULTS, stored && typeof stored === "object" ? stored : {});
        } catch (e) {
            return Object.assign({}, DEFAULTS);
        }
    }

    function writeAll(values) {
        const next = Object.assign({}, DEFAULTS, values || {});
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn("WMN POS UI preferences could not be saved", e);
        }
        return next;
    }

    function get(key) {
        return readAll()[key];
    }

    function set(key, value) {
        const next = readAll();
        next[key] = value;
        return writeAll(next);
    }

    window.WMNPOSUIPreferences = {
        STORAGE_KEY,
        DEFAULTS,
        get,
        set,
        readAll,
        writeAll,
    };
})();
