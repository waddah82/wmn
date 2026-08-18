/* WMN POS UI preferences resolved from POS Profile defaults plus browser-local overrides. */
(function () {
    "use strict";

    const STORAGE_KEY = "wmn_pos_ui_preferences_v1";
    const DEFAULTS = Object.freeze({
        default_item_view: "Grid View",
        show_item_cart_counter: false,
    });

    function repository() {
        return window.WMN_POS?.Services?.Settings?.POSProfileSettings || null;
    }

    function profile() {
        return repository()?.resolveProfile?.() || "";
    }

    function readAll() {
        const repo = repository();
        const effective = repo?.getEffective?.(profile()) || {};
        return {
            default_item_view: String(effective.default_item_view || DEFAULTS.default_item_view),
            show_item_cart_counter: Boolean(cint(effective.show_item_cart_counter || 0)),
        };
    }

    function writeAll(values) {
        const next = Object.assign({}, readAll(), values || {});
        const repo = repository();
        if (!repo) return next;
        repo.saveLocalPatch({
            default_item_view: next.default_item_view === "Button View" ? "Button View" : "Grid View",
            show_item_cart_counter: next.show_item_cart_counter ? 1 : 0,
        }, profile());
        return readAll();
    }

    async function writeServer(values) {
        const next = Object.assign({}, readAll(), values || {});
        const repo = repository();
        if (!repo) throw new Error(__("POS Profile Settings service is not available."));
        await repo.saveServerPatch({
            default_item_view: next.default_item_view === "Button View" ? "Button View" : "Grid View",
            show_item_cart_counter: next.show_item_cart_counter ? 1 : 0,
        }, profile());
        return readAll();
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
        writeServer,
    };
})();
