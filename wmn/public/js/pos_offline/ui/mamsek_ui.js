/* Mamsek POS UI helpers only. No ERPNext class is overridden in this file. */
frappe.provide("wmn.MamsekPOS");
(function(){
    "use strict";
	"use strict";

	const PAGE_NAME = "point-of-sale";
	const ACTIVE_BODY_CLASS = "wmn-mamsek-pos-route";
	const STYLE_ID = "wmn-mamsek-pos-style";
	const EXTENSION_STYLE_ID = "wmn-mamsek-pos-extension-style";
	const STYLE_URL = "/assets/wmn/css/mamsek.css?v=20260812-pos-promotion-23-invoice-discount";

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
		const existing = document.getElementById(STYLE_ID);
		if (existing) {
			if (existing.getAttribute("href") !== STYLE_URL) existing.setAttribute("href", STYLE_URL);
			return;
		}

		const link = document.createElement("link");
		link.id = STYLE_ID;
		link.rel = "stylesheet";
		link.href = STYLE_URL;
		document.head.appendChild(link);
	}

    function ensure_extension_styles() {
        let style = document.getElementById(EXTENSION_STYLE_ID);
        if (!style) {
            style = document.createElement("style");
            style.id = EXTENSION_STYLE_ID;
            document.head.appendChild(style);
        }
        style.textContent = `
            body.${ACTIVE_BODY_CLASS} .wmn-card-media { position: relative; }
            body.${ACTIVE_BODY_CLASS} .wmn-item-cart-counter {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                min-width: 64px;
                min-height: 64px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 8px 14px;
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.34);
                color: currentColor;
                font-size: clamp(30px, 4vw, 52px);
                font-weight: 800;
                line-height: 1;
                opacity: 0.72;
                pointer-events: none;
                user-select: none;
                z-index: 5;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-item-cart-counter[hidden] { display: none !important; }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-title-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-quick-actions {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-inline-start: auto;
                flex: 0 0 auto;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-clear-cart-btn {
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                gap: 5px;
                min-height: 28px;
                padding: 3px 8px !important;
                border-radius: 7px;
                white-space: nowrap;
                flex: 0 0 auto;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-clear-cart-btn .wmn-icon { width: 15px; height: 15px; }
            body.${ACTIVE_BODY_CLASS} .wmn-customer-title-row {
                min-height: 32px !important;
                gap: 6px !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-customer-hint { display: none !important; }
            body.${ACTIVE_BODY_CLASS} .wmn-customer-area {
                flex: 0 0 auto !important;
                padding-block: 6px !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-order-divider { margin-block: 2px !important; }

            /* Keep POS navigation on one compact row so it cannot steal item-list height. */
            body.${ACTIVE_BODY_CLASS} .wmn-pos-nav {
                flex: 0 0 auto !important;
                padding-block: 4px !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-pos-nav-links {
                display: flex !important;
                align-items: center !important;
                flex-wrap: nowrap !important;
                gap: 4px !important;
                overflow-x: auto !important;
                overflow-y: hidden !important;
                scrollbar-width: none;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-pos-nav-links::-webkit-scrollbar { display: none; }
            body.${ACTIVE_BODY_CLASS} .wmn-nav-btn {
                min-height: 30px !important;
                padding-block: 4px !important;
                flex: 0 0 auto !important;
            }

            /* Let the item list and cart rows own the remaining vertical space. */
            
            body.${ACTIVE_BODY_CLASS} .point-of-sale-app,
            body.${ACTIVE_BODY_CLASS} .wmn-items-selector,
            body.${ACTIVE_BODY_CLASS} .wmn-order-sidebar {
                height: 100% !important;
                max-height: 100% !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-order-sidebar {
                overflow: hidden !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-items-content,
            body.${ACTIVE_BODY_CLASS} .wmn-order-panel,
            body.${ACTIVE_BODY_CLASS} .wmn-cart-slot,
            body.${ACTIVE_BODY_CLASS} .cart-container,
            body.${ACTIVE_BODY_CLASS} .abs-cart-container {
                display: flex !important;
                flex-direction: column !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-items-content,
            body.${ACTIVE_BODY_CLASS} .wmn-cart-slot,
            body.${ACTIVE_BODY_CLASS} .cart-container,
            body.${ACTIVE_BODY_CLASS} .abs-cart-container {
                flex: 1 1 auto !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-category-section,
            body.${ACTIVE_BODY_CLASS} .cart-header,
            body.${ACTIVE_BODY_CLASS} .cart-totals-section {
                flex: 0 0 auto !important;
            }
            body.${ACTIVE_BODY_CLASS} .items-container,
            body.${ACTIVE_BODY_CLASS} .cart-items-section {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                overscroll-behavior: contain;
            }
            body.${ACTIVE_BODY_CLASS} .cart-totals-section {
                flex: 0 0 auto !important;
                max-height: none !important;
                overflow: visible !important;
                gap: 6px !important;
                padding-top: 6px !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-native-summary-hidden { display: none !important; }
            body.${ACTIVE_BODY_CLASS} .wmn-promotion-control,
            body.${ACTIVE_BODY_CLASS} .wmn-coupon-control,
            body.${ACTIVE_BODY_CLASS} .wmn-pos-discount-breakdown { display: none !important; }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-compact-actions {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 5px;
                width: 100%;
                margin: 0;
                padding: 0;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-compact-actions .btn {
                min-width: 0;
                min-height: 32px;
                padding: 5px 7px !important;
                border-radius: 8px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: 12px;
                line-height: 1.15;
                border: 1px solid #9be2e2;
                background: var(--wmn-teal-soft);
                color: var(--wmn-teal);
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-compact-actions .btn.is-active {
                font-weight: 700;
                box-shadow: inset 0 0 0 1px currentColor;
            }
            body.${ACTIVE_BODY_CLASS} .cart-totals-section .checkout-btn {
                margin-top: 0 !important;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 10px;
                margin-bottom: 8px;
                border-radius: 9px;
                background: var(--control-bg, #f5f7fa);
                font-size: 12px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-rows {
                display: grid;
                gap: 0;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                padding: 8px 2px;
                border-bottom: 1px solid var(--border-color, #d1d8dd);
                font-size: 13px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row:last-child { border-bottom: 0; }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row > span {
                min-width: 0;
                overflow-wrap: anywhere;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row > strong {
                flex: 0 0 auto;
                white-space: nowrap;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row.is-discount strong,
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row.is-total-discount strong {
                font-weight: 700;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row.is-grand-total,
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-row.is-payable-total {
                font-size: 14px;
                font-weight: 700;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-cart-summary-section-title {
                margin-top: 8px;
                padding: 7px 2px 4px;
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: .02em;
            }
            .wmn-cart-details-hint {
                position: fixed;
                z-index: 1065;
                display: block;
                max-width: calc(100vw - 16px);
                padding: 9px 11px;
                border: 1px solid var(--border-color, #d1d8dd);
                border-radius: 10px;
                background: var(--card-bg, #fff);
                color: var(--text-color, #1f272e);
                box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
                pointer-events: none;
            }
            .wmn-cart-details-hint[hidden] { display: none !important; }
            .wmn-cart-details-hint .wmn-cart-summary-row {
                padding: 5px 0;
                font-size: 12px;
            }
            .wmn-cart-details-hint .wmn-cart-summary-row.is-payable-total {
                font-size: 13px;
            }
            .wmn-cart-details-dialog .modal-dialog {
                max-width: min(560px, calc(100vw - 24px));
            }
            .wmn-cart-details-content {
                max-height: min(68vh, 620px);
                overflow-y: auto;
                padding-inline: 2px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-catalog {
                display: grid;
                gap: 18px;
                max-height: min(72vh, 760px);
                overflow: auto;
                padding: 4px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-section-title {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 10px;
                font-size: 15px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-section-title > span {
                min-width: 28px;
                text-align: center;
                border: 1px solid var(--border-color, #d1d8dd);
                border-radius: 999px;
                padding: 2px 8px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 10px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-card,
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-empty {
                border: 1px solid var(--border-color, #d1d8dd);
                border-radius: 12px;
                padding: 12px;
                background: var(--card-bg, #fff);
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-card-head,
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-meta {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-card-head > span,
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-meta {
                color: var(--text-muted, #6c7680);
                font-size: 12px;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-benefit {
                margin: 10px 0;
                font-size: 24px;
                font-weight: 800;
            }
            body.${ACTIVE_BODY_CLASS} .wmn-commercial-meta {
                align-items: flex-start;
                margin-top: 5px;
            }
        `;
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
        PAGE_NAME, ACTIVE_BODY_CLASS, STYLE_ID, EXTENSION_STYLE_ID, STYLE_URL,
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
