/* POS Profile-scoped WMN settings with server defaults and browser-local overrides. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Settings = ns.Services.Settings || {};

    const DEFAULTS = Object.freeze({
        default_item_view: "Grid View",
        show_item_cart_counter: 0,
        enable_auto_silent_print: 0,
        wmn_silent_print_mode: "raw_text",
        print_after_cashier_completion: 0,
        printing_method: "legacy_bridge",
        fallback_method: "none",
        copies: 1,
        cut_paper: 1,
        feed_lines: 3,
        escpos_initialize: 1,
        show_invoice_barcode: 1,
        invoice_barcode_height: 56,
        invoice_barcode_module_width: 2,
        invoice_barcode_human_readable: 1,
        qz_printer_name: "",
        qz_connector_mode: "legacy",
        qz_connector_url: "",
        qz_host: "",
        qz_encoding: "UTF8",
        bridge_ws_url: "ws://127.0.0.1:12212/printer",
        webusb_vendor_id: "",
        webusb_product_id: "",
        webusb_serial_number: "",
        webusb_device_label: "",
        webserial_vendor_id: "",
        webserial_product_id: "",
        webserial_device_label: "",
        webserial_baud_rate: 9600,
        webserial_data_bits: 8,
        webserial_stop_bits: 1,
        webserial_parity: "none",
        webserial_flow_control: "none",
    });

    const NUMERIC_KEYS = new Set([
        "show_item_cart_counter",
        "enable_auto_silent_print",
        "print_after_cashier_completion",
        "copies",
        "cut_paper",
        "feed_lines",
        "escpos_initialize",
        "show_invoice_barcode",
        "invoice_barcode_height",
        "invoice_barcode_module_width",
        "invoice_barcode_human_readable",
        "webserial_baud_rate",
        "webserial_data_bits",
        "webserial_stop_bits",
    ]);

    let currentProfile = "";
    let currentServerState = null;
    let bootstrapPromise = null;

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (e) { return value; }
    }

    function keyPart(profile) {
        return encodeURIComponent(String(profile || "").trim());
    }

    function serverCacheKey(profile) {
        return `wmn_pos_profile_settings_server_v1::${keyPart(profile)}`;
    }

    function localOverrideKey(profile) {
        return `wmn_pos_profile_settings_local_v1::${keyPart(profile)}`;
    }

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return clone(fallback);
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : clone(fallback);
        } catch (e) {
            return clone(fallback);
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value || {}));
            return true;
        } catch (e) {
            console.warn("WMN POS Profile settings local write failed", e);
            return false;
        }
    }

    function removeJson(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    }

    function normalize(settings) {
        const out = {};
        Object.entries(settings || {}).forEach(([key, value]) => {
            if (!(key in DEFAULTS)) return;
            if (NUMERIC_KEYS.has(key)) {
                const num = Number(value);
                out[key] = Number.isFinite(num) ? num : Number(DEFAULTS[key] || 0);
            } else {
                out[key] = value == null ? DEFAULTS[key] : String(value);
            }
        });
        return out;
    }

    function isOnline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return false;
            if (window.__wmn_pos_effective_offline === true) return false;
        } catch (e) {}
        return navigator.onLine !== false;
    }

    function resolveProfile(explicitProfile) {
        return String(
            explicitProfile ||
            currentProfile ||
            window.cur_pos?.pos_profile ||
            window.cur_pos?.settings?.pos_profile ||
            window.cur_pos?.frm?.doc?.pos_profile ||
            ""
        ).trim();
    }

    function readServerState(profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) return { available: false, pos_profile: "", settings: {}, can_write: false };
        if (normalizedProfile === currentProfile && currentServerState) return clone(currentServerState);
        return readJson(serverCacheKey(normalizedProfile), {
            available: false,
            pos_profile: normalizedProfile,
            settings: {},
            can_write: false,
        });
    }

    function writeServerState(profile, state) {
        const normalizedProfile = resolveProfile(profile);
        const normalized = Object.assign(
            { available: false, pos_profile: normalizedProfile, settings: {}, can_write: false },
            state || {},
            {
                pos_profile: normalizedProfile,
                settings: normalize(state?.settings || {}),
                cached_at: new Date().toISOString(),
            }
        );
        writeJson(serverCacheKey(normalizedProfile), normalized);
        if (normalizedProfile === currentProfile) currentServerState = normalized;
        return clone(normalized);
    }

    function getLocalOverride(profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) return {};
        return normalize(readJson(localOverrideKey(normalizedProfile), {}));
    }

    function getServerSettings(profile) {
        return normalize(readServerState(profile).settings || {});
    }

    function getEffective(profile) {
        const normalizedProfile = resolveProfile(profile);
        return Object.assign(
            {},
            DEFAULTS,
            getServerSettings(normalizedProfile),
            getLocalOverride(normalizedProfile)
        );
    }


    function migrateLegacyBrowserSettings(profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) return;
        const markerKey = `wmn_pos_profile_settings_migrated_v1::${keyPart(normalizedProfile)}`;
        try {
            if (localStorage.getItem(markerKey)) return;
        } catch (e) {}

        const patch = {};
        try {
            const rawPrint = localStorage.getItem("wmn_pos_print_transport_v1");
            const legacyPrint = rawPrint ? JSON.parse(rawPrint) : {};
            if (legacyPrint && typeof legacyPrint === "object") {
                const map = { method: "printing_method" };
                Object.entries(legacyPrint).forEach(([key, value]) => {
                    const target = map[key] || key;
                    if (target in DEFAULTS) patch[target] = value;
                });
            }
        } catch (e) {}

        try {
            const rawUI = localStorage.getItem("wmn_pos_ui_preferences_v1");
            const legacyUI = rawUI ? JSON.parse(rawUI) : {};
            if (legacyUI && Object.prototype.hasOwnProperty.call(legacyUI, "show_item_cart_counter")) {
                patch.show_item_cart_counter = legacyUI.show_item_cart_counter ? 1 : 0;
            }
            const buttonMode = localStorage.getItem("wmn_pos_button_mode");
            if (buttonMode === "true" || buttonMode === "false") {
                patch.default_item_view = buttonMode === "true" ? "Button View" : "Grid View";
            }
        } catch (e) {}

        if (Object.keys(patch).length && !Object.keys(getLocalOverride(normalizedProfile)).length) {
            writeJson(localOverrideKey(normalizedProfile), normalize(patch));
        }
        try { localStorage.setItem(markerKey, "1"); } catch (e) {}
    }

    async function refresh(profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile || !isOnline()) return readServerState(normalizedProfile);
        const response = await frappe.call({
            method: "wmn.api.get_pos_profile_settings",
            args: { pos_profile: normalizedProfile },
            freeze: false,
        });
        return writeServerState(normalizedProfile, response?.message || {});
    }

    async function bootstrap(profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) return getEffective("");

        if (currentProfile !== normalizedProfile) {
            currentProfile = normalizedProfile;
            migrateLegacyBrowserSettings(normalizedProfile);
            currentServerState = readServerState(normalizedProfile);
            bootstrapPromise = null;
        }

        if (bootstrapPromise) return bootstrapPromise;
        bootstrapPromise = (async () => {
            if (isOnline()) {
                try { await refresh(normalizedProfile); }
                catch (error) {
                    console.warn("WMN POS Profile settings refresh failed; cached settings remain active", error);
                }
            }
            window.dispatchEvent(new CustomEvent("wmn:pos-profile-settings-ready", {
                detail: { pos_profile: normalizedProfile, settings: getEffective(normalizedProfile) },
            }));
            return getEffective(normalizedProfile);
        })();
        return bootstrapPromise;
    }

    function saveLocalPatch(patch, profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) throw new Error("POS Profile is required before saving browser settings.");
        const current = getLocalOverride(normalizedProfile);
        const normalizedPatch = normalize(patch || {});
        const next = Object.assign({}, current, normalizedPatch);
        writeJson(localOverrideKey(normalizedProfile), next);
        window.dispatchEvent(new CustomEvent("wmn:pos-profile-settings-changed", {
            detail: { pos_profile: normalizedProfile, source: "browser", settings: getEffective(normalizedProfile) },
        }));
        return getEffective(normalizedProfile);
    }

    function clearLocalKeys(keys, profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) return {};
        const current = getLocalOverride(normalizedProfile);
        (keys || []).forEach((key) => delete current[key]);
        if (Object.keys(current).length) writeJson(localOverrideKey(normalizedProfile), current);
        else removeJson(localOverrideKey(normalizedProfile));
        return current;
    }

    async function saveServerPatch(patch, profile) {
        const normalizedProfile = resolveProfile(profile);
        if (!normalizedProfile) throw new Error("POS Profile is required before saving server settings.");
        if (!isOnline()) throw new Error(__("Cannot save POS Profile Settings while offline."));
        const normalizedPatch = normalize(patch || {});
        const response = await frappe.call({
            method: "wmn.api.save_pos_profile_settings",
            args: { pos_profile: normalizedProfile, values: normalizedPatch },
            freeze: false,
        });
        writeServerState(normalizedProfile, response?.message || {});
        clearLocalKeys(Object.keys(normalizedPatch), normalizedProfile);
        window.dispatchEvent(new CustomEvent("wmn:pos-profile-settings-changed", {
            detail: { pos_profile: normalizedProfile, source: "server", settings: getEffective(normalizedProfile) },
        }));
        return getEffective(normalizedProfile);
    }

    function status(profile) {
        const normalizedProfile = resolveProfile(profile);
        const server = readServerState(normalizedProfile);
        return {
            pos_profile: normalizedProfile,
            online: isOnline(),
            available: !!server.available,
            can_write: !!server.can_write,
            modified: server.modified || "",
            cached_at: server.cached_at || "",
            has_local_override: Object.keys(getLocalOverride(normalizedProfile)).length > 0,
        };
    }

    function applyLegacySettings(target, profile) {
        const effective = getEffective(profile);
        target = target || {};
        target.enable_auto_silent_print = cint(effective.enable_auto_silent_print || 0);
        target.wmn_silent_print_mode = effective.wmn_silent_print_mode || "raw_text";
        return target;
    }

    ns.Services.Settings.POSProfileSettings = {
        DEFAULTS,
        bootstrap,
        refresh,
        getEffective,
        getServerSettings,
        getLocalOverride,
        saveLocalPatch,
        saveServerPatch,
        clearLocalKeys,
        status,
        isOnline,
        resolveProfile,
        applyLegacySettings,
    };
})();
