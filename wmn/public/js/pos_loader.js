frappe.provide("frappe.pages");
frappe.pages["point-of-sale"] = frappe.pages["point-of-sale"] || {};

frappe.pages["point-of-sale"].on_page_load = async function(wrapper) {
    "use strict";

    const WMN_POS_LOADER = {
        settingsDoctype: "WMN Settings",

        // غيّر اسم الحقل هنا إذا كان مختلفاً عندك
        offlineCheckField: "enable_pos_offline",

        onlineScript: "/assets/wmn/js/custom_pos.js",
        offlineScript: "/assets/wmn/js/custom_pos_offline.js",

        cacheKey: "wmn_pos_script_mode_v2",
        cacheMs: 60 * 1000
    };

    function getVersion() {
        try {
            return (frappe.boot && frappe.boot.versions && frappe.boot.versions.wmn) || Date.now();
        } catch (e) {
            return Date.now();
        }
    }

    function getCachedMode() {
        try {
            const raw = localStorage.getItem(WMN_POS_LOADER.cacheKey);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data || !data.mode || !data.ts) return null;

            if (Date.now() - data.ts > WMN_POS_LOADER.cacheMs) return null;
            return data.mode;
        } catch (e) {
            return null;
        }
    }

    function setCachedMode(mode) {
        try {
            localStorage.setItem(
                WMN_POS_LOADER.cacheKey,
                JSON.stringify({ mode, ts: Date.now() })
            );
        } catch (e) {}
    }

    async function getMode() {
        const cached = getCachedMode();

        try {
            const value = await frappe.db.get_single_value(
                WMN_POS_LOADER.settingsDoctype,
                WMN_POS_LOADER.offlineCheckField
            );

            const mode = Number(value) === 1 ? "offline" : "online";
            setCachedMode(mode);
            return mode;
        } catch (e) {
            console.warn("WMN POS Loader: cannot read WMN Settings, using cache/default", e);
            return cached || "online";
        }
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const fullSrc = src + "?v=" + encodeURIComponent(getVersion());

            // قبل تحميل custom_pos.js أو custom_pos_offline.js نضمن وجود page object
            frappe.pages["point-of-sale"] = frappe.pages["point-of-sale"] || {};

            const existing = document.querySelector(`script[data-wmn-pos-script="${src}"]`);
            if (existing) {
                resolve();
                return;
            }

            const s = document.createElement("script");
            s.src = fullSrc;
            s.async = false;
            s.defer = false;
            s.setAttribute("data-wmn-pos-script", src);

            s.onload = resolve;
            s.onerror = () => reject(new Error("Failed to load POS script: " + src));

            document.head.appendChild(s);
        });
    }

    async function runSelectedPOS() {
        const mode = await getMode();
        const script = mode === "offline"
            ? WMN_POS_LOADER.offlineScript
            : WMN_POS_LOADER.onlineScript;

        console.log("WMN POS Loader: loading " + (mode === "offline" ? "custom_pos_offline.js" : "custom_pos.js"));

        // احفظ handler الحالي للّودر
        const loaderHandler = frappe.pages["point-of-sale"].on_page_load;

        await loadScript(script);

        const selectedHandler = frappe.pages["point-of-sale"] && frappe.pages["point-of-sale"].on_page_load;

        if (!selectedHandler || selectedHandler === loaderHandler) {
            throw new Error("Selected POS script did not register point-of-sale on_page_load: " + script);
        }

        // شغّل handler الخاص بالملف المختار الآن، لأن Frappe كان قد شغّل loader فقط.
        return selectedHandler(wrapper);
    }

    try {
        return await runSelectedPOS();
    } catch (e) {
        console.error("WMN POS Loader failed", e);

        frappe.msgprint({
            title: __("POS Loader Failed"),
            indicator: "red",
            message: e.message || String(e)
        });
    }
};
