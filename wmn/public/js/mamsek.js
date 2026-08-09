/* global frappe, erpnext, $, __, flt, format_currency, escape, unescape */

frappe.provide("wmn.MamsekPOS");

(function () {
	"use strict";

	const PAGE_NAME = "point-of-sale";
	const ACTIVE_BODY_CLASS = "wmn-mamsek-pos-route";
	const STYLE_ID = "wmn-mamsek-pos-style";
	const STYLE_URL = "/assets/wmn/css/mamsek.css?v=20260805-v9-search-category-row-1";

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
		if (document.getElementById(STYLE_ID)) return;

		const link = document.createElement("link");
		link.id = STYLE_ID;
		link.rel = "stylesheet";
		link.href = STYLE_URL;
		document.head.appendChild(link);
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

	function install_overrides() {
		if (wmn.MamsekPOS.installed) return;

		// POSOffline defines MyPOSController before loading this file. Extending it
		// keeps all offline cache/sync behavior while Mamsek changes only the UI.
		const OriginalController =
			typeof MyPOSController !== "undefined"
				? MyPOSController
				: erpnext.PointOfSale.Controller;
		const OriginalItemSelector = erpnext.PointOfSale.ItemSelector;
		const OriginalItemCart = erpnext.PointOfSale.ItemCart;

		wmn.MamsekPOS.originals = {
			Controller: OriginalController,
			ItemSelector: OriginalItemSelector,
			ItemCart: OriginalItemCart,
		};

		class MamsekItemSelector extends OriginalItemSelector {
			constructor(args) {
				super(args);
				this.mamsek_settings = args.settings || {};
				try {
					this.button_mode = localStorage.getItem("wmn_pos_button_mode") === "true";
				} catch (e) {
					this.button_mode = false;
				}
				this.install_category_bar();
				this.applyDisplayMode();
			}

			prepare_dom() {
				this.wrapper.append(
					`<section class="items-selector wmn-items-selector">
						<nav class="wmn-pos-nav" aria-label="${escape_html(__("Point of Sale navigation"))}">
							<div class="wmn-pos-nav-links">
								<button type="button" class="wmn-nav-btn" data-action="open-form-view">${icon("form", 18)}<span>${__("Open Form View")}</span></button>
								<button type="button" class="wmn-nav-btn" data-action="toggle-recent-orders">${icon("history", 18)}<span>${__("Toggle Recent Orders")}</span></button>
								<button type="button" class="wmn-nav-btn" data-action="save-as-draft">${icon("save", 18)}<span>${__("Save as Draft")}</span></button>
								<button type="button" class="wmn-nav-btn is-danger" data-action="close-pos">${icon("close_pos", 18)}<span>${__("Close the POS")}</span></button>
								<div class="wmn-tools-menu">
									<button type="button" class="wmn-nav-btn wmn-tools-menu-toggle" data-action="toggle-tools-menu"
										aria-haspopup="menu" aria-expanded="false" title="${escape_html(__("Menu"))}">
										${icon("menu", 18)}<span>${__("Menu")}</span>
									</button>
									<div class="wmn-tools-menu-panel" role="menu" aria-label="${escape_html(__("Point of Sale tools"))}" hidden>
										<button type="button" class="wmn-tools-menu-item wmn-grid-view-btn" data-tool-action="grid-view" role="menuitemradio" aria-checked="true">
											${icon("grid", 18)}<span>${__("Grid View")}</span><kbd>G</kbd>
										</button>
										<button type="button" class="wmn-tools-menu-item wmn-list-view-btn" data-tool-action="button-view" role="menuitemradio" aria-checked="false">
											${icon("button_view", 18)}<span>${__("Button View")}</span><kbd>B</kbd>
										</button>
										<button type="button" class="wmn-tools-menu-item wmn-list-offline-btn" data-tool-action="offline-sync" role="menuitem">
											${icon("sync", 18)}<span>${__("Offline Sync")}</span>
										</button>
										<button type="button" class="wmn-tools-menu-item wmn-printer-btn" data-tool-action="printer" role="menuitem">
											${icon("printer", 18)}<span>${__("Printer")}</span>
										</button>
									</div>
								</div>
							</div>
						</nav>
						<div class="wmn-items-content">
							<div class="filter-section wmn-category-section">
								<div class="wmn-category-search-row">
									<div class="wmn-menu-search">
										${icon("search", 20)}
										<div class="search-field"></div>
										<span class="wmn-search-shortcut">/</span>
									</div>
								</div>
								<div class="wmn-category-browser">
									<button type="button" class="wmn-category-arrow is-previous" aria-label="${escape_html(__("Previous categories"))}">${icon("chevron", 20)}</button>
									<div class="wmn-category-track"></div>
									<button type="button" class="wmn-category-arrow is-next" aria-label="${escape_html(__("Next categories"))}">${icon("chevron", 20)}</button>
								</div>
								<div class="item-group-field wmn-native-item-group-field"></div>
							</div>
							<div class="items-container"></div>
						</div>
					</section>`
				);

				this.$component = this.wrapper.find(".wmn-items-selector").last();
				this.$items_container = this.$component.find(".items-container");
				this.$tools_menu = this.$component.find(".wmn-tools-menu");
				this.$tools_menu_toggle = this.$tools_menu.find(".wmn-tools-menu-toggle");
				this.$tools_menu_panel = this.$tools_menu.find(".wmn-tools-menu-panel");
				this.$gridBtn = this.$tools_menu.find(".wmn-grid-view-btn");
				this.$listBtn = this.$tools_menu.find(".wmn-list-view-btn");
				this.$offlineBtn = this.$tools_menu.find(".wmn-list-offline-btn");
				this.$printerBtn = this.$tools_menu.find(".wmn-printer-btn");
				this.updateActiveButton();
			}

			applyDisplayMode() {
				const original_apply = super.applyDisplayMode;
				if (typeof original_apply === "function") {
					original_apply.call(this);
				}

				if (!this.$component?.length) return;
				this.$component
					.closest(".wmn-mamsek-shell")
					.toggleClass("wmn-button-view-active", Boolean(this.button_mode));
				this.updateActiveButton();
			}

			updateActiveButton() {
				const original_update = super.updateActiveButton;
				if (typeof original_update === "function") {
					original_update.call(this);
				}

				const button_mode = Boolean(this.button_mode);
				this.$gridBtn
					?.toggleClass("is-selected", !button_mode)
					.attr("aria-checked", String(!button_mode));
				this.$listBtn
					?.toggleClass("is-selected", button_mode)
					.attr("aria-checked", String(button_mode));
			}

			set_tools_menu_open(open) {
				const is_open = Boolean(open);
				this.$tools_menu?.toggleClass("is-open", is_open);
				this.$tools_menu_toggle?.attr("aria-expanded", String(is_open));
				this.$tools_menu_panel?.prop("hidden", !is_open);
			}





			make_search_bar() {
				super.make_search_bar();
				this.search_field.$input.attr("placeholder", __("Search Menu"));
        
        
        
        const is_mobile_or_app =
        				typeof window.wmn_is_mobile_pos_device === "function"
				            ? window.wmn_is_mobile_pos_device()
				            : (
				                window.innerWidth <= 860 ||
				                /Android|iPhone|iPad|iPod|Mobile/i.test(
				                    navigator.userAgent || ""
				                )
				            );

				    if (
				        is_mobile_or_app &&
				        this.search_field &&
				        typeof this.search_field.set_focus === "function" &&
				        !this.search_field.__wmn_disable_auto_focus
				    ) {
 				       const search_field = this.search_field;

 				       search_field.__wmn_original_set_focus =
				            search_field.set_focus.bind(search_field);
				
				        search_field.set_focus = function () {
				            try {
				                search_field.$input?.trigger("blur");

				                const input = search_field.$input?.[0];

				                if (input && document.activeElement === input) {
				                    input.blur();
				                }
				            } catch (error) {
 				               console.warn(
				                    "WMN: could not remove POS search focus",
				                    error
				                );
				            }

				            return;
				        };

 				       search_field.__wmn_disable_auto_focus = true;
				    }
        
			}

			install_category_bar() {
				this.$category_track = this.$component.find(".wmn-category-track");
				const configured_groups = (this.mamsek_settings.item_groups || [])
					.map((row) => row.item_group || row.name)
					.filter(Boolean);

				if (configured_groups.length) {
					this.render_category_bar(configured_groups);
					return;
				}

				frappe.db
					.get_list("Item Group", {
						filters: { is_group: 0 },
						fields: ["name"],
						order_by: "name asc",
						limit: 5,
					})
					.then((rows) => this.render_category_bar(rows.map((row) => row.name)))
					.catch(() => this.render_category_bar([]));
			}

			render_category_bar(groups) {
				const unique_groups = [...new Set(groups)].slice(0, 12);
				const categories = [{ name: "", label: __("All Items"), emoji: "🍽️" }].concat(
					unique_groups.map((name) => ({ name, label: name, emoji: category_emoji(name) }))
				);

				this.$category_track.html(
					categories
						.map(
							(category, index) => `<button type="button" class="wmn-category-card${index === 0 ? " is-active" : ""}" data-item-group="${escape(category.name)}">
								<span class="wmn-category-copy">
									<strong>${escape_html(category.label)}</strong>
									<small>${__("Items")}</small>
								</span>
								<span class="wmn-category-emoji">${category.emoji}</span>
							</button>`
						)
						.join("")
				);
			}

			render_item_list(items) {
				this.items = items || [];
				super.render_item_list(this.items);
				this.update_active_category_count();
				this.sync_card_quantities();
				this.applyDisplayMode();
			}

			get_item_html(item) {
				const {
					item_image,
					serial_no,
					batch_no,
					actual_qty,
					uom,
					price_list_rate,
				} = item;
				const precision = flt(price_list_rate, 2) % 1 !== 0 ? 2 : 0;
				const safe_name = escape_html(item.item_name);
				const safe_abbr = escape_html(frappe.get_abbr(item.item_name));
				const stock_value = item.is_stock_item ? flt(actual_qty) : "";
				const stock_class = flt(actual_qty) <= 0 ? " is-empty" : flt(actual_qty) <= 10 ? " is-low" : "";
				const media = !this.hide_images && item_image
					? `<img onerror="cur_pos.item_selector.handle_broken_image(this)" class="item-img" src="${escape_html(item_image)}" alt="${safe_abbr}">`
					: `<div class="item-display abbr">${safe_abbr}</div>`;

				return `<article class="wmn-item-card"
					data-item-code="${escape(item.item_code)}" data-serial-no="${escape(serial_no)}"
					data-batch-no="${escape(batch_no)}" data-uom="${escape(uom)}"
					data-rate="${escape(price_list_rate || 0)}" data-stock-uom="${escape(item.stock_uom)}">
					<div class="item-wrapper"
						data-item-code="${escape(item.item_code)}" data-serial-no="${escape(serial_no)}"
						data-batch-no="${escape(batch_no)}" data-uom="${escape(uom)}"
						data-rate="${escape(price_list_rate || 0)}" data-stock-uom="${escape(item.stock_uom)}"
						title="${safe_name}">
						<div class="wmn-card-media">
							${media}
							${item.is_stock_item ? `<span class="wmn-stock-pill${stock_class}">${stock_value}</span>` : ""}
						</div>
						<div class="item-detail">
							<div class="item-name">${safe_name}</div>
							<div class="item-rate">${format_currency(price_list_rate, item.currency, precision) || 0}</div>
						</div>
					</div>
					<div class="wmn-item-stepper" aria-label="${escape_html(__("Quantity"))}">
						<button type="button" class="wmn-qty-button is-minus" data-delta="-1" aria-label="${escape_html(__("Decrease quantity"))}">${icon("minus", 18)}</button>
						<input type="text" class="wmn-item-count" value="0" inputmode="decimal"
							autocomplete="off" spellcheck="false" aria-label="${escape_html(__("Quantity"))}">
						<button type="button" class="wmn-qty-button is-plus" data-delta="1" aria-label="${escape_html(__("Increase quantity"))}">${icon("plus", 18)}</button>
					</div>
				</article>`;
			}

			handle_broken_image($img) {
				const item_abbr = escape_html($($img).attr("alt"));
				$($img).replaceWith(`<div class="item-display abbr">${item_abbr}</div>`);
			}

			bind_events() {
				super.bind_events();

				$(document)
					.off("pointerdown.wmnMamsekTools")
					.on("pointerdown.wmnMamsekTools", (event) => {
						const menu_element = this.$tools_menu?.get(0);
						if (menu_element && !menu_element.contains(event.target)) {
							this.set_tools_menu_open(false);
						}
					});

				this.$component.on("keydown.wmnMamsek", ".wmn-tools-menu", (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					this.set_tools_menu_open(false);
					this.$tools_menu_toggle?.trigger("focus");
				});

				this.$component.on("click.wmnMamsek", ".wmn-tools-menu-item", (event) => {
					event.preventDefault();
					event.stopPropagation();
					const action = $(event.currentTarget).attr("data-tool-action");

					if (action === "grid-view" && typeof this.setCardMode === "function") {
						this.setCardMode();
					} else if (action === "button-view" && typeof this.setButtonMode === "function") {
						this.setButtonMode();
					} else if (action === "offline-sync") {
						window.wmnPOSOffline?.openInvoiceManagerDialog?.();
					} else if (action === "printer" && typeof wmn_show_printer_settings_dialog === "function") {
						wmn_show_printer_settings_dialog();
					}

					this.set_tools_menu_open(false);
				});

				this.$component.on("mousedown.wmnMamsek", ".wmn-qty-button", (event) => {
					// Keep an edited quantity from blurring before the button click is handled.
					event.preventDefault();
				});

				this.$component.on("click.wmnMamsek", ".wmn-qty-button", (event) => {
					event.preventDefault();
					event.stopPropagation();
					const $button = $(event.currentTarget);
					const $card = $button.closest(".wmn-item-card");
					const $input = $card.find(".wmn-item-count");
					const item = read_item_data($card);
					const delta = Number($button.attr("data-delta")) || 0;
					const actual_quantity = this.get_cart_quantity(item);
					const typed_quantity = parse_quantity($input.val());

					if (typed_quantity !== null && Math.abs(typed_quantity - actual_quantity) > 0.000001) {
						this.events.item_quantity_set(item, Math.max(0, typed_quantity + delta));
						return;
					}

					this.events.item_quantity_changed(item, delta);
				});

				this.$component.on("click.wmnMamsek focus.wmnMamsek", ".wmn-item-count", (event) => {
					event.stopPropagation();
					if (event.type === "focus") event.currentTarget.select();
				});

				this.$component.on("keydown.wmnMamsek", ".wmn-item-count", (event) => {
					event.stopPropagation();
					if (event.key === "Enter") {
						event.preventDefault();
						event.currentTarget.blur();
					} else if (event.key === "Escape") {
						event.preventDefault();
						this.sync_card_quantities();
						event.currentTarget.blur();
					}
				});

				this.$component.on("change.wmnMamsek", ".wmn-item-count", (event) => {
					event.stopPropagation();
					const $input = $(event.currentTarget);
					const quantity = parse_quantity($input.val());

					if (quantity === null) {
						frappe.show_alert({ message: __("Enter a valid quantity."), indicator: "orange" });
						this.sync_card_quantities();
						return;
					}

					const item = read_item_data($input.closest(".wmn-item-card"));
					this.events.item_quantity_set(item, quantity);
				});

				this.$component.on("click.wmnMamsek", ".wmn-category-card", (event) => {
					const $card = $(event.currentTarget);
					const group = unescape($card.attr("data-item-group"));
					this.$category_track.find(".wmn-category-card").removeClass("is-active");
					$card.addClass("is-active");
					this.item_group = group || this.parent_item_group;
					this.filter_items();
				});

				this.$component.on("click.wmnMamsek", ".wmn-category-arrow", (event) => {
					const direction = $(event.currentTarget).hasClass("is-next") ? 1 : -1;
					this.$category_track.get(0)?.scrollBy({ left: direction * 350, behavior: "smooth" });
				});

				this.$component.on("click.wmnMamsek", ".wmn-nav-btn", (event) => {
					const $button = $(event.currentTarget);
					const action = $button.attr("data-action");

					if (action === "toggle-tools-menu") {
						event.preventDefault();
						event.stopPropagation();
						this.set_tools_menu_open(!this.$tools_menu.hasClass("is-open"));
						return;
					}

					const controller = window.cur_pos;
					if (!controller) return;

					if (action === "open-form-view") {
						controller.open_form_view();
					} else if (action === "toggle-recent-orders") {
						controller.toggle_recent_order();
						window.setTimeout(() => {
							const is_visible = controller.recent_order_list?.$component?.is(":visible");
							$button.toggleClass("is-active", Boolean(is_visible));
						}, 0);
					} else if (action === "save-as-draft") {
						controller.save_draft_invoice();
					} else if (action === "close-pos") {
						controller.close_pos();
					}
				});
			}

			update_active_category_count() {
				const label = `${this.items.length} ${__("Items")}`;
				this.$category_track.find(".wmn-category-card.is-active small").text(label);
			}

			get_cart_rows(item) {
				const frm = this.events.get_frm ? this.events.get_frm() : null;
				const rows = frm && frm.doc ? frm.doc.items || [] : [];
				const has_batch_no = ![undefined, null, "", "null"].includes(item.batch_no);

				return rows.filter(
					(row) =>
						row.item_code === item.item_code &&
						(!has_batch_no || row.batch_no === item.batch_no) &&
						row.uom === item.uom &&
						flt(row.price_list_rate) === flt(item.rate)
				);
			}

			get_cart_quantity(item) {
				return this.get_cart_rows(item).reduce((total, row) => total + flt(row.qty), 0);
			}

			sync_card_quantities() {
				const selector = this;
				this.$items_container.find(".wmn-item-card").each(function () {
					const $card = $(this);
					const item = read_item_data($card);
					const qty = selector.get_cart_quantity(item);
					$card.toggleClass("has-quantity", qty > 0).find(".wmn-item-count").val(qty);
				});
			}

			resize_selector(minimize) {
				this.$component.toggleClass("is-minimized", Boolean(minimize));
			}
		}

		class MamsekItemCart extends OriginalItemCart {
			prepare_dom() {
				this.wrapper.append(
					`<section class="customer-cart-container wmn-order-sidebar">
						<div class="wmn-order-panel">
							<div class="wmn-customer-area">
								<div class="wmn-customer-title-row">
									<div class="wmn-customer-title">${icon("user", 19)}<span>${__("Customer")}</span></div>
									<span class="wmn-customer-hint">${__("Select or change customer")}</span>
								</div>
								<div class="customer-section"></div>
							</div>
							<div class="wmn-order-divider"></div>
							<div class="wmn-cart-slot"></div>
						</div>
					</section>`
				);

				this.$component = this.wrapper.find(".wmn-order-sidebar").last();
			}

			init_customer_selector() {
				this.$customer_section = this.$component.find(".customer-section");
				this.make_customer_selector();
			}

			make_customer_selector() {
				super.make_customer_selector();
				this.$component.find(".wmn-customer-area").removeClass("has-customer");
				this.customer_field?.$input.attr({
					placeholder: __("Select or search customer"),
					"aria-label": __("Customer"),
				});
			}

			init_cart_components() {
				this.$component.find(".wmn-cart-slot").append(
					`<div class="cart-container">
						<div class="abs-cart-container">
							<div class="cart-label">${__("Current Order")}</div>
							<div class="cart-header">
								<div class="name-header">${__("Item")}</div>
								<div class="qty-header">${__("Quantity")}</div>
								<div class="rate-amount-header">${__("Amount")}</div>
							</div>
							<div class="cart-items-section"></div>
							<div class="cart-totals-section"></div>
							<div class="numpad-section"></div>
						</div>
					</div>`
				);

				this.$cart_container = this.$component.find(".cart-container");
				this.make_cart_totals_section();
				this.make_cart_items_section();
				this.make_cart_numpad();
			}

			bind_events() {
				super.bind_events();
				this.$component
					.off("click.wmnMamsekCustomer", ".wmn-change-customer-btn")
					.on("click.wmnMamsekCustomer", ".wmn-change-customer-btn", (event) => {
						event.preventDefault();
						event.stopPropagation();
						this.reset_customer_selector();
					});
			}

			disable_customer_selection() {
				super.disable_customer_selection();
				this.$component.find(".wmn-change-customer-btn").prop("disabled", true);
			}

			enable_customer_selection() {
				super.enable_customer_selection();
				this.$component.find(".wmn-change-customer-btn").prop("disabled", false);
			}

			update_customer_section() {
				super.update_customer_section();
				const has_customer = Boolean(this.customer_info && this.customer_info.customer);
				this.$component.find(".wmn-customer-area").toggleClass("has-customer", has_customer);

				if (has_customer) {
					this.$customer_section.find(".customer-details").append(
						`<button type="button" class="wmn-change-customer-btn">${__("Change Customer")}</button>`
					);
				}
			}

			render_cart_item(item_data, $item_to_update) {
				const currency = this.events.get_frm().doc.currency;
				const safe_name = escape_html(item_data.item_name);
				const safe_abbr = escape_html(frappe.get_abbr(item_data.item_name));

				if (!$item_to_update.length) {
					this.$cart_items_wrapper.append(
						`<div class="cart-item-wrapper" data-row-name="${escape(item_data.name)}"></div><div class="seperator"></div>`
					);
					$item_to_update = this.get_cart_item(item_data);
				}

				const image = !this.hide_images && item_data.image
					? `<div class="item-image"><img onerror="cur_pos.cart.handle_broken_image(this)" src="${escape_html(item_data.image)}" alt="${safe_abbr}"></div>`
					: `<div class="item-image item-abbr">${safe_abbr}</div>`;
				const amount = item_data.amount || flt(item_data.qty) * flt(item_data.rate);
				const old_rate = item_data.discount_percentage
					? `<span class="wmn-cart-old-rate">${format_currency(item_data.price_list_rate, currency)}</span>`
					: "";

				$item_to_update.html(
					`${image}
					<div class="wmn-cart-item-copy">
						<div class="item-name">${safe_name}</div>
						<div class="wmn-cart-item-price">${format_currency(amount, currency)} ${old_rate}</div>
					</div>
					<div class="wmn-cart-qty">${flt(item_data.qty)}X</div>`
				);
			}

			handle_broken_image($img) {
				const item_abbr = escape_html($($img).attr("alt"));
				$($img).parent().replaceWith(`<div class="item-image item-abbr">${item_abbr}</div>`);
			}

			render_net_total(value) {
				super.render_net_total(value);
				this.$totals_section
					.find(".net-total-container > div:first-child")
					.text(__("Subtotal"));
			}

			render_grand_total(value) {
				super.render_grand_total(value);
				const currency = this.events.get_frm().doc.currency;
				const pay_label = `${__("Pay")} ${format_currency(value, currency)}`;
				this.$component.find(".checkout-btn").text(pay_label);
			}

		}

		class MamsekController extends OriginalController {
			prepare_dom() {
				document.body.classList.add(ACTIVE_BODY_CLASS);

				$("body > .wmn-mamsek-shell").remove();
				$(document.body).append(
					`<div class="wmn-mamsek-shell">
						<div class="point-of-sale-app"></div>
					</div>`
				);

				this.$mamsek_shell = $("body > .wmn-mamsek-shell").last();
				this.$components_wrapper = this.$mamsek_shell.find(".point-of-sale-app").last();
			}

			init_item_selector() {
				this.item_selector = new erpnext.PointOfSale.ItemSelector({
					wrapper: this.$components_wrapper,
					pos_profile: this.pos_profile,
					settings: this.settings,
					events: {
						item_selected: (args) => this.on_cart_update(args),
						item_quantity_changed: (item, delta) => this.change_item_quantity_from_selector(item, delta),
						item_quantity_set: (item, quantity) => this.set_item_quantity_from_selector(item, quantity),
						get_frm: () => this.frm || {},
					},
				});
			}

			async on_cart_update(args) {
				const item_row = await super.on_cart_update(args);
				this.item_selector?.sync_card_quantities();
				return item_row;
			}

			async change_item_quantity_from_selector(item, delta) {
				if (!delta) return;

				if (delta > 0) {
					return this.on_cart_update({ field: "qty", value: "+1", item });
				}

				const item_row = this.get_item_from_frm(item);
				if ($.isEmptyObject(item_row)) return;

				const next_qty = Math.max(0, flt(item_row.qty) - 1);
				frappe.dom.freeze();
				try {
					// Keep the existing working decrement exactly as-is.
					await frappe.model.set_value(item_row.doctype, item_row.name, "qty", next_qty);

					if (next_qty === 0) {
						// Keep ERPNext's normal remove sequence.
						frappe.model.clear_doc(item_row.doctype, item_row.name);
						this.update_cart_html(item_row, true);

						// Offline lightweight frm also needs its child row removed from frm.doc.items.
						if (
							typeof wmn_is_pos_offline === "function" &&
							wmn_is_pos_offline() &&
							typeof this.wmn_remove_offline_item_detail_row === "function"
						) {
							this.wmn_remove_offline_item_detail_row(item_row);
						}
					} else {
						this.update_cart_html(item_row, false);
					}

					this.item_selector.sync_card_quantities();
				} finally {
					frappe.dom.unfreeze();
				}
			}

			async set_item_quantity_from_selector(item, requested_quantity) {
				const target_quantity = parse_quantity(requested_quantity);
				if (target_quantity === null) {
					this.item_selector?.sync_card_quantities();
					return;
				}

				const item_rows = this.item_selector?.get_cart_rows(item) || [];
				const current_quantity = item_rows.reduce((total, row) => total + flt(row.qty), 0);

				if (Math.abs(target_quantity - current_quantity) <= 0.000001) {
					this.item_selector?.sync_card_quantities();
					return item_rows[0];
				}

				if (!item_rows.length) {
					if (target_quantity === 0) {
						this.item_selector?.sync_card_quantities();
						return;
					}
					return this.on_cart_update({ field: "qty", value: target_quantity, item });
				}

				frappe.dom.freeze();
				try {
					if (target_quantity > current_quantity) {
						const item_row = item_rows[0];
						const next_quantity = flt(item_row.qty) + (target_quantity - current_quantity);

						if (!this.allow_negative_stock) {
							const qty_needed = next_quantity * flt(item_row.conversion_factor || 1);
							await this.check_stock_availability(item_row, qty_needed, this.frm.doc.set_warehouse);
						}

						await frappe.model.set_value(item_row.doctype, item_row.name, "qty", next_quantity);
						this.update_cart_html(item_row);
					} else {
						let quantity_to_remove = current_quantity - target_quantity;

						for (const item_row of [...item_rows].reverse()) {
							if (quantity_to_remove <= 0) break;
							const row_quantity = flt(item_row.qty);
							const next_quantity = Math.max(0, row_quantity - quantity_to_remove);
							quantity_to_remove -= row_quantity - next_quantity;

							await frappe.model.set_value(item_row.doctype, item_row.name, "qty", next_quantity);
							if (next_quantity === 0) frappe.model.clear_doc(item_row.doctype, item_row.name);
							this.update_cart_html(item_row, next_quantity === 0);
						}
					}
				} catch (error) {
					console.error(error);
				} finally {
					frappe.dom.unfreeze();
					this.item_selector?.sync_card_quantities();
				}

				return item_rows[0];
			}

			update_cart_html(item_row, remove_item) {
				super.update_cart_html(item_row, remove_item);
				this.item_selector?.sync_card_quantities();
			}

			async make_new_invoice() {
				const result = await super.make_new_invoice();
				this.item_selector?.sync_card_quantities();
				return result;
			}
		}

		erpnext.PointOfSale.ItemSelector = MamsekItemSelector;
		erpnext.PointOfSale.ItemCart = MamsekItemCart;
		erpnext.PointOfSale.Controller = MamsekController;
		wmn.MamsekPOS.Controller = MamsekController;
		wmn.MamsekPOS.installed = true;
	}

	function install_mamsek_pos() {
		document.body.classList.add(ACTIVE_BODY_CLASS);
		ensure_stylesheet();
		install_overrides();
		sync_route_class();

		if (!wmn.MamsekPOS.route_listener_installed && frappe.router && typeof frappe.router.on === "function") {
			frappe.router.on("change", () =>
				window.setTimeout(() => {
					sync_route_class();
				}, 0)
			);
			wmn.MamsekPOS.route_listener_installed = true;
		}

		return erpnext.PointOfSale.Controller;
	}

	window.wmn_install_mamsek_pos = install_mamsek_pos;
})();
