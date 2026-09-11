/* Mamsek POS UI helpers only. No ERPNext class is overridden in this file. */
frappe.provide("wmn.MamsekPOS");
(function(){
    "use strict";
    "use strict";

    const PAGE_NAME = "wmn-pos";
    const ACTIVE_BODY_CLASS = "wmn-mamsek-pos-route";
    const STYLE_ID = "wmn-mamsek-pos-style";
    const EXTENSION_STYLE_ID = "wmn-mamsek-pos-extension-style";
    // CSS lives in wmn_pos.css and is loaded as standard page CSS.

    function escape_html(value) {
        if (frappe.utils && frappe.utils.escape_html) {
            return frappe.utils.escape_html(String(value || ""));
        }

        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function current_route_is_pos() {
        const route = frappe.get_route_str ? frappe.get_route_str() : "";
        return route === PAGE_NAME;
    }

    function sync_route_class() {
        document.body.classList.toggle(ACTIVE_BODY_CLASS, current_route_is_pos());
    }

    function ensure_stylesheet() {
        // Kept for callers; page-owned CSS lives in wmn_pos.css.
    }

    function ensure_extension_styles() {
        // Kept for callers; page-owned CSS lives in wmn_pos.css.
    }

    function icon(name, size = 20) {
        const paths = {
            brand:
                '<path d="M5 11h22c0 7.18-4.92 13-11 13S5 18.18 5 11Z"/><path d="M8 8.2c1.15-2.35 3.07-3.7 5.75-4.05M15 8c1.35-2.52 3.35-3.75 6-3.68M11 27h10"/>',
            settings:
                '<path d="M8.5 3.7 9.4 2h5.2l.9 1.7 2 .82 1.85-.55 2.68 4.5-1.3 1.42.25 2.13 1.28 1.4-2.66 4.53-1.88-.56-1.96.82-.92 1.79H9.45l-.92-1.79-1.96-.82-1.88.56-2.66-4.53 1.28-1.4.25-2.13-1.3-1.42 2.68-4.5 1.85.55 1.71-.82Z"/><circle cx="12" cy="11" r="3.15"/>',
            notification:
                '<path d="M6 9a6 6 0 0 1 12 0v4.1l1.55 2.4H4.45L6 13.1V9Z"/><path d="M9.5 18a2.75 2.75 0 0 0 5 0"/>',
            dashboard:
                '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
            reservation:
                '<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
            menu: '<path d="M5 6h14M5 12h14M5 18h14"/><path d="m3 6 .01 0M3 12h.01M3 18h.01"/>',
            grid:
                '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
            button_view:
                '<rect x="3" y="5" width="18" height="6" rx="1"/><rect x="3" y="13" width="18" height="6" rx="1"/>',
            sync:
                '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M6.1 8A7 7 0 0 1 18.6 5.4L20 7M4 17l1.4 1.6A7 7 0 0 0 17.9 16"/>',
            printer:
                '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
            delivery:
                '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
            accounting:
                '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h3M8 16h8M15 11v3"/>',
            form:
                '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
            history:
                '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
            save:
                '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
            close_pos:
                '<path d="M4 3h10v18H4zM14 7h4l3 3v7h-7"/><path d="m10 12-3 3m0 0 3 3m-3-3h10"/>',
            search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
            user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
            clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
            hash: '<path d="M9 3 7 21M17 3l-2 18M4 9h17M3 15h17"/>',
            more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
            chevron: '<path d="m9 18 6-6-6-6"/>',
            minus: '<path d="M5 12h14"/>',
            plus: '<path d="M5 12h14M12 5v14"/>',
            trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
        };

        return `<svg class="wmn-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ""}</svg>`;
    }

    function category_emoji(name) {
        const value = String(name || "").toLowerCase();
        if (value.includes("burger")) return "🍔";
        if (value.includes("pizza")) return "🍕";
        if (value.includes("cake") || value.includes("sweet")) return "🍰";
        if (value.includes("juice") || value.includes("drink")) return "🥤";
        if (value.includes("coffee") || value.includes("tea")) return "☕";
        if (value.includes("food") || value.includes("meal")) return "🍽️";
        return "◈";
    }

    function read_item_data($element) {
        const read = (name) => {
            let value = unescape($element.attr(`data-${name}`));
            return value === "undefined" ? undefined : value;
        };

        return {
            item_code: read("item-code"),
            batch_no: read("batch-no"),
            serial_no: read("serial-no"),
            uom: read("uom"),
            rate: read("rate"),
            stock_uom: read("stock-uom"),
        };
    }

    function parse_quantity(value) {
        const arabic_digits = "٠١٢٣٤٥٦٧٨٩";
        const persian_digits = "۰۱۲۳۴۵۶۷۸۹";
        const normalized = String(value ?? "")
            .trim()
            .replace(/[٠-٩]/g, (digit) => arabic_digits.indexOf(digit))
            .replace(/[۰-۹]/g, (digit) => persian_digits.indexOf(digit))
            .replace(/[٫,]/g, ".");

        if (!normalized) return null;
        const quantity = Number(normalized);
        return Number.isFinite(quantity) && quantity >= 0 ? flt(quantity, 6) : null;
    }

    window.WMN_POS.UI.Mamsek = {
        PAGE_NAME, ACTIVE_BODY_CLASS, STYLE_ID, EXTENSION_STYLE_ID,
        escape_html, current_route_is_pos, sync_route_class, ensure_stylesheet, ensure_extension_styles, icon,
        category_emoji, read_item_data, parse_quantity,
        setup() {
            document.body.classList.add(ACTIVE_BODY_CLASS);
            ensure_stylesheet();
            ensure_extension_styles();
            sync_route_class();
            if (!wmn.MamsekPOS.route_listener_installed && frappe.router && typeof frappe.router.on === "function") {
                frappe.router.on("change", () => window.setTimeout(sync_route_class, 0));
                wmn.MamsekPOS.route_listener_installed = true;
            }
        }
    };
})();
