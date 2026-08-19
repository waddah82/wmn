/* ItemSelector override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemSelector;
    const MamsekUI = ns.UI.Mamsek;
    const Common = ns.Common;
    const ACTIVE_BODY_CLASS = MamsekUI.ACTIVE_BODY_CLASS;
    const icon = MamsekUI.icon;
    const escape_html = MamsekUI.escape_html;
    const category_emoji = MamsekUI.category_emoji;
    const read_item_data = MamsekUI.read_item_data;
    const parse_quantity = MamsekUI.parse_quantity;

    // WMNItemSelector_v15_clean.js
    // POS ItemSelector component: online delegates to ERPNext; offline reads from the local cache.
    // Preserved features: item-group buttons, barcode structure, button/card mode, image fallback, printer/offline buttons.

    function wmn_get_offline_item_display_index(instance, allItems) {
        if (
            instance.__wmn_offline_item_display_index &&
            instance.__wmn_offline_item_display_index.source === allItems
        ) {
            return instance.__wmn_offline_item_display_index;
        }

        const itemByCode = new Map();
        const variantCountByTemplate = new Map();
        const variantsByTemplate = new Map();

        (allItems || []).forEach((row) => {
            const itemCode = String(row?.item_code || row?.name || "").trim();
            if (itemCode) itemByCode.set(itemCode, row);

            const templateCode = String(row?.variant_of || "").trim();
            if (!templateCode || cint(row?.disabled || 0)) return;
            if (!cint(row?.is_sales_item === undefined ? 1 : row.is_sales_item)) return;

            variantCountByTemplate.set(templateCode, cint(variantCountByTemplate.get(templateCode) || 0) + 1);
            if (!variantsByTemplate.has(templateCode)) variantsByTemplate.set(templateCode, []);
            variantsByTemplate.get(templateCode).push(row);
        });

        instance.__wmn_offline_item_display_index = {
            source: allItems,
            itemByCode,
            variantCountByTemplate,
            variantsByTemplate,
        };
        return instance.__wmn_offline_item_display_index;
    }

    const CoreMethods = {
        __proto__: Base.prototype,

        wmn_is_offline() {
                        try {
                            if (typeof wmn_is_pos_offline === "function") {
                                return !!wmn_is_pos_offline();
                            }
                        } catch (e) {}

                        return !navigator.onLine;
                    },

        async wmn_get_cached_pos_settings() {
                        try {
                            if (window.wmnPOSOffline && window.wmnPOSOffline.getFullSettings) {
                                return await window.wmnPOSOffline.getFullSettings();
                            }
                        } catch (e) {}

                        return (window.cur_pos && window.cur_pos.settings) || {};
                    },

        async wmn_get_cached_pos_profile() {
                        try {
                            if (window.wmnPOSOffline && window.wmnPOSOffline.getPOSProfile) {
                                const profile = await window.wmnPOSOffline.getPOSProfile();
                                if (profile) return profile;
                            }
                        } catch (e) {}

                        return (window.cur_pos && window.cur_pos.settings) || {};
                    },

        async wmn_enrich_item_tracking_meta(item) {
                        if (!item || !item.item_code) return item || {};

                        const batchValue = item.has_batch_no ?? item.item_data?.has_batch_no;
                        const serialValue = item.has_serial_no ?? item.item_data?.has_serial_no;
                        const stockUomValue = item.stock_uom ?? item.item_data?.stock_uom;
                        const allowNegativeValue = item.allow_negative_stock ?? item.item_data?.allow_negative_stock;

                        this.__wmn_item_tracking_meta_cache = this.__wmn_item_tracking_meta_cache || new Map();
                        const cacheKey = String(item.item_code || "").trim();
                        let meta = this.__wmn_item_tracking_meta_cache.get(cacheKey) || null;

                        if (!meta) {
                            try {
                                if (this.wmn_is_offline() && window.wmnPOSOffline) {
                                    const cachedItem = await window.wmnPOSOffline.get(
                                        window.wmnPOSOffline.STORES.items,
                                        cacheKey
                                    );
                                    if (cachedItem) {
                                        meta = {
                                            has_batch_no: cint(cachedItem.has_batch_no || 0),
                                            has_serial_no: cint(cachedItem.has_serial_no || 0),
                                            stock_uom: cachedItem.stock_uom || cachedItem.uom || "",
                                            allow_negative_stock: cint(cachedItem.allow_negative_stock || 0),
                                        };
                                    }
                                } else {
                                    const response = await frappe.db.get_value(
                                        "Item",
                                        cacheKey,
                                        ["has_batch_no", "has_serial_no", "stock_uom", "allow_negative_stock"]
                                    );
                                    const message = response?.message || {};
                                    meta = {
                                        has_batch_no: cint(message.has_batch_no || 0),
                                        has_serial_no: cint(message.has_serial_no || 0),
                                        stock_uom: message.stock_uom || "",
                                        allow_negative_stock: cint(message.allow_negative_stock || 0),
                                    };
                                }
                            } catch (e) {
                                console.warn("WMN item tracking metadata lookup skipped", e);
                            }

                            if (meta) {
                                this.__wmn_item_tracking_meta_cache.set(cacheKey, meta);
                            }
                        }

                        return Object.assign({}, item, meta || {}, {
                            has_batch_no: cint((meta?.has_batch_no ?? batchValue) || 0),
                            has_serial_no: cint((meta?.has_serial_no ?? serialValue) || 0),
                            stock_uom: meta?.stock_uom || stockUomValue || item.uom || "",
                            allow_negative_stock: cint((meta?.allow_negative_stock ?? allowNegativeValue) || 0),
                        });
                    },

        async wmn_get_offline_parent_item_group() {
                        const settings = await this.wmn_get_cached_pos_settings();
                        const profile = await this.wmn_get_cached_pos_profile();

                        return (
                            settings.parent_item_group ||
                            profile.parent_item_group ||
                            this.parent_item_group ||
                            ""
                        );
                    },

        async get_parent_item_group() {
                        if (!this.wmn_is_offline()) {
                            if (super.get_parent_item_group) {
                                return await super.get_parent_item_group();
                            }
                            return undefined;
                        }

                        const parent = await this.wmn_get_offline_parent_item_group();
                        if (parent) {
                            this.parent_item_group = parent;
                            // Important: do not force this.item_group in offline.
                            // v16 original sets item_group = parent_item_group, which filters all offline items.
                        }
                        return parent;
                    },

        async load_items_data() {
                        if (!this.wmn_is_offline()) {
                            return await super.load_items_data();
                        }

                        const settings = await this.wmn_get_cached_pos_settings();
                        const parent = await this.wmn_get_offline_parent_item_group();

                        if (parent) this.parent_item_group = parent;
                        if (!this.price_list) {
                            this.price_list =
                                settings.selling_price_list ||
                                window.cur_pos?.frm?.doc?.selling_price_list ||
                                window.cur_pos?.settings?.selling_price_list ||
                                this.price_list ||
                                "";
                        }

                        return this.get_items({}).then(({ message }) => {
                            this.render_item_list((message && message.items) || []);
                        });
                    },

        wmn_get_awesomplete_value(value) {
                        if (!value) return "";
                        if (typeof value === "string") return value;
                        if (typeof value.value === "string") return value.value;
                        if (typeof value.label === "string") return value.label;
                        if (value.text) return this.wmn_get_awesomplete_value(value.text);
                        return "";
                    },

        wmn_get_item_group_filter_for_search() {
                        const explicitValue = String(
                            this.item_group_field?.get_value?.() ||
                            this.item_group_field?.$input?.val?.() ||
                            ""
                        ).trim();

                        const current = String(this.item_group || "").trim();

                        if (!explicitValue && current && current === String(this.parent_item_group || "").trim()) {
                            return "";
                        }

                        return explicitValue || current || "";
                    },

        wmn_set_item_group_filter_label(item_group) {
                        const value = item_group || "";
                        if (super.set_item_selector_filter_label) {
                            return super.set_item_selector_filter_label(value);
                        }

                        this.$component.find(".filter-section .label").html(value ? __(value) : __("All Items"));
                    },

        async wmn_update_existing_cart_item_or_add(item, qty_value) {
                        const pos_ctrl = window.cur_pos;
                        qty_value = flt(qty_value || 1);

                        let existing_item = null;
                        if (pos_ctrl?.frm?.doc?.items) {
                            existing_item = pos_ctrl.frm.doc.items.find(i =>
                                i.item_code === item.item_code &&
                                (i.batch_no === item.batch_no || (!i.batch_no && !item.batch_no)) &&
                                (i.uom === item.uom || (!i.uom && !item.uom))
                            );
                        }

                        if (existing_item) {
                            const new_qty = flt(existing_item.qty || 0) + qty_value;
                            await wmn_pos_set_value(existing_item.doctype, existing_item.name, "qty", new_qty);

                            if (item.batch_no && existing_item.batch_no !== item.batch_no) {
                                await wmn_pos_set_value(existing_item.doctype, existing_item.name, "batch_no", item.batch_no);
                            }

                            if (item.serial_no) {
                                const new_serial_no = existing_item.serial_no
                                    ? existing_item.serial_no + "\n" + item.serial_no
                                    : item.serial_no;
                                await wmn_pos_set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                            }

                            if (pos_ctrl?.update_cart_html) pos_ctrl.update_cart_html(existing_item);
                            if (pos_ctrl?.cart?.update_item_html) pos_ctrl.cart.update_item_html(existing_item);

                            // Item-card clicks use a direct existing-row mutation so UOM,
                            // batch and serial metadata remain intact. Finish that mutation
                            // through the same commercial lifecycle used by the +/- controls.
                            await pos_ctrl?.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });
                            pos_ctrl?.item_selector?.sync_card_quantities?.();
                            return existing_item;
                        }

                        return await Promise.resolve(this.events.item_selected({
                            field: "qty",
                            value: qty_value,
                            item: item,
                        }));
                    },

        get_item_html(item) {
            item = item || {};
            if (!item.item_image && item.image) item.item_image = item.image;
            if (!item.item_image && item.thumbnail) item.item_image = item.thumbnail;
            if (!item.item_image && item.website_image) item.item_image = item.website_image;

            if (cint(item?.__wmn_variant_template || 0)) {
                const item_image = item.item_image || "";
                const safe_name = escape_html(item.item_name || item.item_code || "");
                const safe_abbr = escape_html(frappe.get_abbr(item.item_name || item.item_code || ""));
                const media = !this.hide_images && item_image
                    ? `<img onerror="cur_pos.item_selector.handle_broken_image(this)" class="item-img" src="${escape_html(item_image)}" alt="${safe_abbr}">`
                    : `<div class="item-display abbr">${safe_abbr}</div>`;

                return `<article class="wmn-item-card wmn-variant-template-card"
                    data-item-code="${escape(item.item_code)}" data-wmn-variant-template="1">
                    <div class="item-wrapper"
                        data-item-code="${escape(item.item_code)}" data-uom="${escape(item.uom || item.stock_uom || "")}"
                        data-rate="0" data-stock-uom="${escape(item.stock_uom || item.uom || "")}"
                        title="${safe_name}">
                        <div class="wmn-card-media">
                            ${media}
                            <span class="wmn-item-cart-counter" hidden>0</span>
                            <span class="wmn-variant-pill">${cint(item.__wmn_variant_count || 0) > 0 ? `${cint(item.__wmn_variant_count)} ${__("Variants")}` : __("Variants")}</span>
                        </div>
                        <div class="item-detail">
                            <div class="item-name">${safe_name}</div>
                            <div class="item-rate wmn-variant-select-label">${__("Choose Variant")}</div>
                        </div>
                    </div>
                </article>`;
            }

            if (cint(item?.__wmn_multi_uom || 0)) {
                const item_image = item.item_image || "";
                const safe_name = escape_html(item.item_name || item.item_code || "");
                const safe_abbr = escape_html(frappe.get_abbr(item.item_name || item.item_code || ""));
                const stock_value = item.is_stock_item ? flt(item.actual_qty) : "";
                const stock_class = flt(item.actual_qty) <= 0 ? " is-empty" : flt(item.actual_qty) <= 10 ? " is-low" : "";
                const media = !this.hide_images && item_image
                    ? `<img onerror="cur_pos.item_selector.handle_broken_image(this)" class="item-img" src="${escape_html(item_image)}" alt="${safe_abbr}">`
                    : `<div class="item-display abbr">${safe_abbr}</div>`;

                return `<article class="wmn-item-card wmn-multi-uom-card" data-item-code="${escape(item.item_code)}">
                    <div class="item-wrapper"
                        data-item-code="${escape(item.item_code)}" data-serial-no="${escape(item.serial_no)}"
                        data-batch-no="${escape(item.batch_no)}" data-uom="${escape(item.uom || item.stock_uom || "")}"
                        data-rate="${escape(item.price_list_rate || item.rate || 0)}" data-stock-uom="${escape(item.stock_uom || item.uom || "")}"
                        title="${safe_name}">
                        <div class="wmn-card-media">
                            ${media}
                            <span class="wmn-item-cart-counter" hidden>0</span>
                            ${item.is_stock_item ? `<span class="wmn-stock-pill${stock_class}">${stock_value}</span>` : ""}
                            <span class="wmn-uom-pill">${__("Multiple UOM")}</span>
                        </div>
                        <div class="item-detail">
                            <div class="item-name">${safe_name}</div>
                            <div class="item-rate wmn-variant-select-label">${__("Choose UOM")}</div>
                        </div>
                    </div>
                </article>`;
            }

            const {
                item_image,
                serial_no,
                batch_no,
                actual_qty,
                uom,
                price_list_rate,
            } = item;
            const precision = flt(price_list_rate, 2) % 1 !== 0 ? 2 : 0;
            const safe_name = escape_html(item.item_name || item.item_code || "");
            const safe_abbr = escape_html(frappe.get_abbr(item.item_name || item.item_code || ""));
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
                        <span class="wmn-item-cart-counter" hidden>0</span>
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
        },

        make_search_bar() {
            if (!this.wmn_is_offline()) {
                super.make_search_bar();
            } else {
                const me = this;
                this.$component.find(".search-field").html("");
                this.$component.find(".item-group-field").html("");

                this.search_field = frappe.ui.form.make_control({
                    df: {
                        label: __("Search"),
                        fieldtype: "Data",
                        placeholder: __("Search by item code, serial number or barcode"),
                    },
                    parent: this.$component.find(".search-field"),
                    render_input: true,
                });

                this.item_group_field = frappe.ui.form.make_control({
                    df: {
                        label: __("Item Group"),
                        fieldtype: "Data",
                        placeholder: __("Select item group"),
                        onchange: function () {
                            me.item_group = this.value || me.parent_item_group || "";
                            me.filter_items();
                        },
                    },
                    parent: this.$component.find(".item-group-field"),
                    render_input: true,
                });

                this.search_field.toggle_label(false);
                this.item_group_field.toggle_label(false);
                this.attach_clear_btn();
            }

            setTimeout(() => this.wmn_render_item_group_buttons(), 100);
            this.search_field?.$input?.attr("placeholder", __("Search Menu"));

            const isMobileOrApp =
                typeof window.wmn_is_mobile_pos_device === "function"
                    ? window.wmn_is_mobile_pos_device()
                    : (window.innerWidth <= 860 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ""));

            if (isMobileOrApp) this.search_field?.$input?.trigger("blur");
        },

        async wmn_get_item_group_buttons_from_pos_profile() {
                        try {
                            let profile = null;

                            if (window.wmnPOSOffline && window.wmnPOSOffline.getPOSProfile) {
                                profile = await window.wmnPOSOffline.getPOSProfile();
                            }

                            if (!profile && window.cur_pos && window.cur_pos.settings) {
                                profile = window.cur_pos.settings;
                            }

                            const groups = (profile && profile.item_groups ? profile.item_groups : [])
                                .map(row => row && (row.item_group || row.name || ""))
                                .filter(Boolean);

                            return Array.from(new Set(groups));
                        } catch (e) {
                            console.warn("WMN POS Profile item groups load failed", e);
                            return [];
                        }
                    },

        async wmn_render_item_group_buttons() {
                        try {
                            // Mamsek already owns the category bar. Rendering the legacy strip here
                            // creates the duplicated group-filter buttons reported in the POS screen.
                            if (this.$component?.hasClass("wmn-items-selector") || this.$component?.find(".wmn-category-track").length) {
                                this.$component?.find(".wmn-item-group-buttons").remove();
                                this.__wmn_item_group_buttons_rendered = true;
                                return;
                            }

                            if (this.__wmn_item_group_buttons_rendered) return;
                            this.__wmn_item_group_buttons_rendered = true;

                            const groups = await this.wmn_get_item_group_buttons_from_pos_profile();

                            if (!groups.length) return;

                            const html = `
                                <div class="wmn-item-group-buttons" style="
                                    grid-column: 1 / -1;
                                    display:flex;
                                    gap:8px;
                                    overflow-x:auto;
                                    overflow-y:hidden;
                                    padding:8px 2px 4px 2px;
                                    margin-top:6px;
                                    min-height:42px;
                                    white-space:nowrap;
                                    align-items:center;
                                    scrollbar-width:thin;
                                ">
                                    <button type="button"
                                        class="btn btn-xs btn-primary wmn-item-group-btn active"
                                        style="flex:0 0 auto; height:28px;"
                                        data-item-group="">
                                        ${__("All")}
                                    </button>

                                    ${groups.map(g => `
                                        <button type="button"
                                            class="btn btn-xs btn-default wmn-item-group-btn"
                                            style="flex:0 0 auto; height:28px;"
                                            data-item-group="${frappe.utils.escape_html(g)}">
                                            ${frappe.utils.escape_html(__(g))}
                                        </button>
                                    `).join("")}
                                </div>
                            `;

                            // Keep one strip only if the non-Mamsek selector is rebuilt.
                            this.$component.find(".wmn-item-group-buttons").remove();
                            this.$component.find(".filter-section").append(html);

                            this.$component
                                .off("click.wmnItemGroupButtons", ".wmn-item-group-btn")
                                .on("click.wmnItemGroupButtons", ".wmn-item-group-btn", async (e) => {
                                const $btn = $(e.currentTarget);
                                const item_group = $btn.attr("data-item-group") || "";

                                this.$component.find(".wmn-item-group-btn")
                                    .removeClass("btn-primary active")
                                    .addClass("btn-default");

                                $btn.removeClass("btn-default")
                                    .addClass("btn-primary active");

                                await this.wmn_set_item_group_field_value(item_group);
                            });
                        } catch (e) {
                            console.warn("WMN item group buttons render failed", e);
                        }
                    },

        async wmn_set_item_group_field_value(item_group) {
                        try {
                            item_group = item_group || "";

                            if (!this.wmn_is_offline()) {
                                // Online: keep ERPNext Link field behavior exactly as original.
                                if (this.item_group_field && this.item_group_field.set_value) {
                                    await this.item_group_field.set_value(item_group);
                                    return;
                                }
                            }

                            // Offline: never use Link.set_value because it validates through the server.
                            this.item_group = item_group;

                            if (this.item_group_field && this.item_group_field.set_input) {
                                this.item_group_field.set_input(item_group);
                            } else if (this.item_group_field && this.item_group_field.$input) {
                                this.item_group_field.$input.val(item_group);
                            }

                            this.wmn_set_item_group_filter_label(item_group);
                            this.filter_items();
                        } catch (e) {
                            console.warn("WMN item group button apply failed", e);
                        }
                    },

        async wmn_get_item_selection_context() {
                        const doc = this.events?.get_frm?.().doc || window.cur_pos?.frm?.doc || {};
                        const settings = await this.wmn_get_cached_pos_settings();
                        return {
                            price_list:
                                doc.selling_price_list ||
                                this.price_list ||
                                settings.selling_price_list ||
                                window.cur_pos?.settings?.selling_price_list ||
                                "",
                            warehouse:
                                doc.set_warehouse ||
                                settings.warehouse ||
                                window.cur_pos?.settings?.warehouse ||
                                "",
                            pos_profile:
                                doc.pos_profile ||
                                settings.pos_profile ||
                                window.cur_pos?.pos_profile ||
                                "",
                            currency:
                                doc.currency ||
                                settings.currency ||
                                window.cur_pos?.settings?.currency ||
                                "",
                        };
                    },

        async wmn_get_online_variant_metadata(items) {
                        const rows = Array.isArray(items) ? items : [];
                        const codes = rows.map(row => row && row.item_code).filter(Boolean);
                        if (!codes.length) return { variants: {}, templates: {}, uom_counts: {}, variant_counts: {} };

                        const context = await this.wmn_get_item_selection_context();
                        const priceList = context.price_list || "";
                        const warehouse = context.warehouse || "";
                        const posProfile = context.pos_profile || "";

                        this.__wmn_variant_map_cache = this.__wmn_variant_map_cache || {};
                        this.__wmn_template_cache = this.__wmn_template_cache || {};
                        this.__wmn_uom_count_cache = this.__wmn_uom_count_cache || {};
                        this.__wmn_variant_count_cache = this.__wmn_variant_count_cache || {};

                        const rowMap = new Map(rows.map(row => [row.item_code, row]));
                        const variantCountKey = template => `${priceList}::${warehouse}::${posProfile}::${template}`;

                        const missing = codes.filter(code => {
                            const uomKey = `${priceList}::${code}`;
                            const cachedTemplate = this.__wmn_variant_map_cache[code] || "";
                            const row = rowMap.get(code) || {};
                            const possibleTemplate = cachedTemplate || (cint(row.has_variants || 0) ? code : "");
                            return !(code in this.__wmn_variant_map_cache) ||
                                !(uomKey in this.__wmn_uom_count_cache) ||
                                (possibleTemplate && !(variantCountKey(possibleTemplate) in this.__wmn_variant_count_cache));
                        });

                        if (missing.length) {
                            const response = await frappe.call({
                                method: "wmn.api.get_pos_item_variant_map",
                                args: {
                                    item_codes: missing,
                                    price_list: priceList,
                                    warehouse,
                                    pos_profile: posProfile,
                                },
                                freeze: false,
                            });
                            const message = response?.message || {};
                            const variants = message.variants || {};
                            const templates = message.templates || {};
                            const uomCounts = message.uom_counts || {};
                            const variantCounts = message.variant_counts || {};

                            missing.forEach(code => {
                                this.__wmn_variant_map_cache[code] = variants[code] || "";
                                this.__wmn_uom_count_cache[`${priceList}::${code}`] = cint(uomCounts[code] || 0);
                            });
                            Object.keys(templates).forEach(code => {
                                this.__wmn_template_cache[code] = templates[code];
                            });
                            Object.keys(variantCounts).forEach(code => {
                                this.__wmn_variant_count_cache[variantCountKey(code)] = cint(variantCounts[code] || 0);
                            });
                        }

                        const variants = {};
                        const templates = {};
                        const uom_counts = {};
                        const variant_counts = {};

                        codes.forEach(code => {
                            const row = rowMap.get(code) || {};
                            const template = this.__wmn_variant_map_cache[code] || "";
                            const uomKey = `${priceList}::${code}`;
                            uom_counts[code] = cint(this.__wmn_uom_count_cache[uomKey] || 0);

                            if (template) {
                                variants[code] = template;
                                variant_counts[template] = cint(this.__wmn_variant_count_cache[variantCountKey(template)] || 0);
                                if (this.__wmn_template_cache[template]) {
                                    templates[template] = this.__wmn_template_cache[template];
                                }
                            } else if (cint(row.has_variants || 0)) {
                                variant_counts[code] = cint(this.__wmn_variant_count_cache[variantCountKey(code)] || 0);
                                if (this.__wmn_template_cache[code]) {
                                    templates[code] = this.__wmn_template_cache[code];
                                }
                            }
                        });

                        return { variants, templates, uom_counts, variant_counts };
                    },

        async wmn_prepare_items_for_display(items, { direct_search = false } = {}) {
                        const rows = (Array.isArray(items) ? items : []).map(row => Object.assign({}, row));
                        if (!rows.length || direct_search) return rows;

                        let variantMap = {};
                        let templateMap = {};
                        let uomCounts = {};
                        let variantCounts = {};

                        if (this.wmn_is_offline()) {
                            rows.forEach(row => {
                                if (row.variant_of) variantMap[row.item_code] = row.variant_of;
                            });

                            if (window.wmnPOSOffline) {
                                const allItems = window.wmnPOSOffline.getAllCached
                                    ? await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.items)
                                    : await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items);

                                rows.forEach(row => {
                                    const uoms = new Set();
                                    if (row.stock_uom) uoms.add(row.stock_uom);
                                    (row.uom_conversions || []).forEach(conversion => {
                                        if (conversion?.uom) uoms.add(conversion.uom);
                                    });
                                    uomCounts[row.item_code] = uoms.size;
                                });

                                const relevantTemplateCodes = new Set();
                                rows.forEach(row => {
                                    if (row.variant_of) relevantTemplateCodes.add(row.variant_of);
                                    if (cint(row.has_variants || 0)) relevantTemplateCodes.add(row.item_code);
                                });

                                const offlineIndex = wmn_get_offline_item_display_index(this, allItems || []);
                                relevantTemplateCodes.forEach(code => {
                                    const template = offlineIndex.itemByCode.get(code);
                                    if (template) templateMap[code] = template;
                                    variantCounts[code] = cint(offlineIndex.variantCountByTemplate.get(code) || 0);
                                });
                            }
                        } else {
                            const metadata = await this.wmn_get_online_variant_metadata(rows);
                            variantMap = metadata.variants || {};
                            templateMap = metadata.templates || {};
                            uomCounts = metadata.uom_counts || {};
                            variantCounts = metadata.variant_counts || {};
                        }

                        rows.forEach(row => {
                            row.__wmn_uom_count = cint(uomCounts[row.item_code] || 0);
                            row.__wmn_multi_uom = row.__wmn_uom_count > 1 ? 1 : 0;
                        });

                        const grouped = [];
                        const byTemplate = new Map();
                        const seenStandaloneItems = new Set();

                        for (const row of rows) {
                            const templateCode = row.variant_of || variantMap[row.item_code] || "";

                            if (cint(row.has_variants || 0) && !templateCode) {
                                if (!byTemplate.has(row.item_code)) {
                                    const templateRow = Object.assign({}, row, {
                                        __wmn_variant_template: 1,
                                        __wmn_variant_count: cint(variantCounts[row.item_code] || 0),
                                        __wmn_uom_count: 0,
                                        __wmn_multi_uom: 0,
                                        is_stock_item: 0,
                                        actual_qty: 0,
                                    });
                                    byTemplate.set(row.item_code, templateRow);
                                    grouped.push(templateRow);
                                }
                                continue;
                            }

                            if (!templateCode) {
                                const standaloneKey = String(row.item_code || row.name || "").trim();

                                if (standaloneKey && seenStandaloneItems.has(standaloneKey)) {
                                    continue;
                                }

                                if (standaloneKey) {
                                    seenStandaloneItems.add(standaloneKey);
                                }

                                grouped.push(row);
                                continue;
                            }

                            if (byTemplate.has(templateCode)) {
                                continue;
                            }

                            const template = templateMap[templateCode] || {};
                            const templateRow = Object.assign({}, row, template, {
                                item_code: templateCode,
                                name: templateCode,
                                item_name: template.item_name || templateCode,
                                item_group: template.item_group || row.item_group || "",
                                item_image: template.item_image || template.image || row.item_image || row.image || "",
                                image: template.image || template.item_image || row.image || row.item_image || "",
                                description: template.description || row.description || "",
                                stock_uom: template.stock_uom || row.stock_uom || row.uom || "",
                                uom: template.stock_uom || row.stock_uom || row.uom || "",
                                variant_of: "",
                                has_variants: 1,
                                is_stock_item: 0,
                                actual_qty: 0,
                                __wmn_variant_template: 1,
                                __wmn_variant_count: Math.max(1, cint(variantCounts[templateCode] || 0)),
                                __wmn_uom_count: 0,
                                __wmn_multi_uom: 0,
                            });
                            byTemplate.set(templateCode, templateRow);
                            grouped.push(templateRow);
                        }

                        return grouped;
                    },

        wmn_is_direct_search_result(items, search_term, message) {
                        if (message && (message.barcode || message.serial_no || message.batch_no)) return true;
                        const rows = Array.isArray(items) ? items : [];
                        if (!search_term || rows.length !== 1) return false;

                        const term = String(search_term || "").trim().toLowerCase();
                        const row = rows[0] || {};
                        return [row.barcode, row.serial_no, row.batch_no]
                            .filter(Boolean)
                            .some(value => String(value).trim().toLowerCase() === term);
                    },

        get_items({ start = 0, page_length = 40, search_term = "" } = {}) {
                        if (!this.wmn_is_offline()) {
                            const originalCall = super.get_items({ start, page_length, search_term });
                            const promise = Promise.resolve(originalCall).then(async response => {
                                const message = response?.message || {};
                                const items = Array.isArray(message.items) ? message.items : [];
                                const directSearch = this.wmn_is_direct_search_result(items, search_term, message);
                                message.items = await this.wmn_prepare_items_for_display(items, {
                                    direct_search: directSearch,
                                });
                                if (directSearch) {
                                    message.items = message.items.map(item => Object.assign({}, item, {
                                        __wmn_direct_selection: 1,
                                        __wmn_skip_uom_dialog: Boolean(item.uom),
                                    }));
                                }
                                response.message = message;
                                return response;
                            });
                            return Common.asFrappeCallLike(promise);
                        }

                        if (!window.wmnPOSOffline) {
                            return super.get_items({ start, page_length, search_term });
                        }

                        const doc = this.events?.get_frm?.().doc || window.cur_pos?.frm?.doc || {};
                        const price_list = doc.selling_price_list || this.price_list || window.cur_pos?.settings?.selling_price_list || "";
                        const item_group = this.wmn_get_item_group_filter_for_search();

                        const promise = window.wmnPOSOffline
                            .searchItems({
                                start,
                                page_length,
                                search_term,
                                price_list,
                                item_group,
                            })
                            .then(async items => {
                                const directSearch = this.wmn_is_direct_search_result(items, search_term, {});
                                let prepared = await this.wmn_prepare_items_for_display(items, {
                                    direct_search: directSearch,
                                });
                                if (directSearch) {
                                    prepared = prepared.map(item => Object.assign({}, item, {
                                        __wmn_direct_selection: 1,
                                        __wmn_skip_uom_dialog: Boolean(item.uom),
                                    }));
                                }
                                return {
                                    message: {
                                        items: prepared || [],
                                    },
                                };
                            });

                        return Common.asFrappeCallLike(promise);
                    },

        async wmn_scan_barcode_structure_offline(searchValue) {
                        if (!window.wmnPOSOffline || !searchValue) return null;

                        const barcode = String(searchValue || "").trim();
                        const readAll = window.wmnPOSOffline.getAllCached || window.wmnPOSOffline.getAll;
                        const structures = readAll
                            ? await readAll(window.wmnPOSOffline.STORES.barcode_structures)
                            : [];

                        for (const structure of structures || []) {
                            const prefix = String(structure.prefix || "");
                            const totalLength = cint(structure.total_length || 0);

                            if (!barcode.startsWith(prefix)) continue;
                            if (totalLength && barcode.length !== totalLength) continue;

                            let cursor = prefix.length;
                            const res = { barcode };

                            for (const row of structure.structure_table || []) {
                                const fieldName = row.field_type;
                                const length = cint(row.length || 0);
                                const dataType = row.field_data_type;
                                const divisor = flt(row.divisor || 1);

                                if (!fieldName || !length) continue;

                                const rawValue = barcode.substr(cursor, length);
                                cursor += length;

                                if (dataType === "Float") {
                                    res[fieldName] = flt(rawValue) / divisor;
                                } else {
                                    res[fieldName] = rawValue;
                                }
                            }

                            if (!res.item_code) continue;

                            let itemCode = res.item_code;

                            let item = await window.wmnPOSOffline.get(
                                window.wmnPOSOffline.STORES.items,
                                itemCode
                            );

                            if (!item) {
                                const foundBarcode = window.wmnPOSOffline.getFirstByIndex
                                    ? await window.wmnPOSOffline.getFirstByIndex(
                                        window.wmnPOSOffline.STORES.item_barcodes,
                                        "barcode",
                                        String(itemCode).trim()
                                    )
                                    : null;

                                if (foundBarcode && foundBarcode.item_code) {
                                    itemCode = foundBarcode.item_code;

                                    item = await window.wmnPOSOffline.get(
                                        window.wmnPOSOffline.STORES.items,
                                        itemCode
                                    );

                                    if (foundBarcode.uom) {
                                        res.uom = foundBarcode.uom;
                                    }
                                }
                            }

                            if (!item) return null;

                            const settings = await window.wmnPOSOffline.getFullSettings();
                            const priceList = settings.selling_price_list || "";
                            const uom = res.uom || item.uom || item.stock_uom || "";

                            const price = await wmn_find_price_offline(
                                item.item_code,
                                priceList,
                                uom,
                                res.batch_no || ""
                            );

                            return Object.assign({}, item, {
                                barcode,
                                item_code: item.item_code,
                                item_name: item.item_name || item.item_code,
                                qty: flt(res.qty || 1),
                                uom: uom,
                                stock_uom: item.stock_uom || uom,
                                price_list_rate: price
                                    ? flt(price.price_list_rate)
                                    : flt(item.price_list_rate || item.rate || 0),
                                rate: price
                                    ? flt(price.price_list_rate)
                                    : flt(item.rate || item.price_list_rate || 0),
                                has_batch_no: cint(item.has_batch_no || 0),
                                has_serial_no: cint(item.has_serial_no || 0),
                                __wmn_from_barcode_structure: 1,
                            });
                        }

                        return null;
                    },

        filter_items({ search_term = "" } = {}) {
                        if (this.wmn_is_offline() && window.wmnPOSOffline) {
                            return this.wmn_scan_barcode_structure_offline(search_term).then(async (structured_item) => {
                                if (structured_item && structured_item.item_code && search_term && search_term.length >= 12) {
                                    await this.wmn_update_existing_cart_item_or_add(
                                        structured_item,
                                        structured_item.qty || 1
                                    );

                                    this.set_search_value("");
                                    frappe.utils.play_sound("submit");
                                    return;
                                }

                                return this.get_items({ search_term }).then(async ({ message }) => {
                                    const items = (message && message.items) || [];

                                    if (items.length === 1 && search_term && search_term.length >= 8) {
                                        await this.wmn_update_existing_cart_item_or_add(
                                            items[0],
                                            items[0].qty || 1
                                        );

                                        this.set_search_value("");
                                        frappe.utils.play_sound("submit");
                                        return;
                                    }

                                    this.render_item_list(items);
                                });
                            });
                        }

                        if (search_term && search_term.length >= 12) {
                            const pos_ctrl = window.cur_pos;

                            let pos_profile_name = null;
                            if (pos_ctrl.pos_profile && typeof pos_ctrl.pos_profile === 'string') {
                                pos_profile_name = pos_ctrl.pos_profile;
                            } else if (pos_ctrl.settings && pos_ctrl.settings.name) {
                                pos_profile_name = pos_ctrl.settings.name;
                            } else if (pos_ctrl.frm?.doc?.pos_profile) {
                                pos_profile_name = pos_ctrl.frm.doc.pos_profile;
                            }

                            return frappe.call({
                                method: "wmn.barcode_handler.custom_scan_barcode_pos",
                                args: {
                                    search_value: search_term,
                                    price_list: this.price_list || this.events.get_frm().doc.selling_price_list,
                                    pos_profile: pos_profile_name,
                                }
                            }).then(async (r) => {
                                if (r.message && r.message.item_code) {
                                    const data = r.message;
                                    const pos_ctrl = window.cur_pos;
                                    let qty_value = data.qty || 1;

                                    let existing_item = null;
                                    if (pos_ctrl.frm && pos_ctrl.frm.doc.items) {
                                        existing_item = pos_ctrl.frm.doc.items.find(i =>
                                            i.item_code === data.item_code &&
                                            (i.batch_no === data.batch_no || (!i.batch_no && !data.batch_no))
                                        );
                                    }

                                    if (existing_item) {
                                        frappe.dom.freeze();
                                        const new_qty = flt(existing_item.qty) + flt(qty_value);

                                        await wmn_pos_set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                                        if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                                            await wmn_pos_set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                                        }
                                        if (data.serial_no) {
                                            let new_serial_no = existing_item.serial_no ? existing_item.serial_no + "\n" + data.serial_no : data.serial_no;
                                            await wmn_pos_set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                                        }

                                        if (pos_ctrl.update_cart_html) {
                                            pos_ctrl.update_cart_html(existing_item);
                                        }
                                        frappe.dom.unfreeze();
                                    } else {
                                        let final_rate = data.rate || data.price_list_rate || 0;

                                        if (final_rate === 0 && pos_ctrl.item_selector && pos_ctrl.item_selector.items) {
                                            let ui_item = pos_ctrl.item_selector.items.find(i => i.item_code === data.item_code);
                                            final_rate = ui_item ? (ui_item.price_list_rate || ui_item.rate) : 0;
                                        }

                                        if (pos_ctrl.add_item) {
                                            await pos_ctrl.add_item({
                                                item_code: data.item_code,
                                                qty: qty_value,
                                                rate: final_rate,
                                                price_list_rate: final_rate,
                                                batch_no: data.batch_no,
                                                serial_no: data.serial_no,
                                                uom: data.uom
                                            });
                                        } else {
                                            this.events.item_selected({
                                                field: "qty",
                                                value: qty_value,
                                                item: {
                                                    item_code: data.item_code,
                                                    batch_no: data.batch_no,
                                                    serial_no: data.serial_no,
                                                    uom: data.uom,
                                                    rate: final_rate
                                                },
                                            });
                                        }
                                    }

                                    this.set_search_value("");
                                    frappe.utils.play_sound("submit");
                                    return;
                                }
                                return super.filter_items({ search_term });
                            }).catch(err => {
                                console.error(err);
                                frappe.dom.unfreeze();
                                return super.filter_items({ search_term });
                            });
                        }
                        return super.filter_items({ search_term });
                    },

        async wmn_get_variant_choices(templateItem) {
                        const context = await this.wmn_get_item_selection_context();
                        const templateCode = templateItem?.item_code || "";
                        if (!templateCode) return [];

                        if (!this.wmn_is_offline()) {
                            const response = await frappe.call({
                                method: "wmn.api.get_pos_item_variants",
                                args: {
                                    template_code: templateCode,
                                    price_list: context.price_list,
                                    warehouse: context.warehouse,
                                    pos_profile: context.pos_profile,
                                },
                                freeze: false,
                            });
                            return Array.isArray(response?.message) ? response.message : [];
                        }

                        if (!window.wmnPOSOffline) return [];

                        const allItems = window.wmnPOSOffline.getAllCached
                                    ? await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.items)
                                    : await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items);
                        const offlineIndex = wmn_get_offline_item_display_index(this, allItems || []);
                        const variants = (offlineIndex.variantsByTemplate.get(String(templateCode)) || []).slice();
                        const settings = await this.wmn_get_cached_pos_settings();
                        const hideUnavailable = cint(
                            settings.hide_unavailable_items ||
                            settings.hide_out_of_stock_items ||
                            settings.only_show_available_items ||
                            settings.show_items_in_stock_only ||
                            0
                        );

                        const result = [];
                        for (const variant of variants) {
                            const stock = context.warehouse
                                ? await window.wmnPOSOffline.getStock(variant.item_code, context.warehouse)
                                : null;
                            const actualQty = flt(stock?.actual_qty || variant.actual_qty || 0);
                            const baseOptions = Array.isArray(variant.uom_options)
                                ? variant.uom_options.map(row => Object.assign({}, row))
                                : [];
                            const baseOption =
                                baseOptions.find(row => row.uom === variant.stock_uom) ||
                                baseOptions[0] || {
                                    uom: variant.stock_uom || variant.uom || "",
                                    price_list_rate: flt(variant.price_list_rate || variant.rate || 0),
                                    currency: context.currency || variant.currency || "",
                                    conversion_factor: 1,
                                };

                            let selectionDisabled = 0;
                            let selectionReason = "";
                            if (hideUnavailable && cint(variant.is_stock_item || 0) && actualQty <= 0) {
                                selectionDisabled = 1;
                                selectionReason = __("Out of stock");
                            }

                            result.push(Object.assign({}, variant, {
                                actual_qty: actualQty,
                                warehouse: context.warehouse || variant.warehouse || "",
                                uom: baseOption.uom || variant.stock_uom || "",
                                price_list_rate: flt(baseOption.price_list_rate || 0),
                                rate: flt(baseOption.price_list_rate || 0),
                                currency: baseOption.currency || context.currency || "",
                                conversion_factor: flt(baseOption.conversion_factor || 1),
                                uom_options: baseOptions,
                                __wmn_selection_disabled: selectionDisabled,
                                __wmn_selection_reason: selectionReason,
                            }));
                        }
                        return result;
                    },

        async wmn_get_batch_choices(item) {
                        if (!item?.item_code) return [];
                        const context = await this.wmn_get_item_selection_context();

                        if (!this.wmn_is_offline()) {
                            const response = await frappe.call({
                                method: "wmn.api.get_pos_item_batches",
                                args: {
                                    item_code: item.item_code,
                                    warehouse: context.warehouse,
                                    price_list: context.price_list,
                                    uom: item.stock_uom || item.uom || "",
                                },
                                freeze: false,
                            });
                            return Array.isArray(response?.message) ? response.message : [];
                        }

                        if (!window.wmnPOSOffline) return [];
                        const rows = window.wmnPOSOffline.getAllByIndex
                            ? await window.wmnPOSOffline.getAllByIndex(
                                window.wmnPOSOffline.STORES.batches,
                                "item_code",
                                item.item_code
                            )
                            : [];
                        const today = frappe.datetime.get_today();
                        return (rows || []).filter(row => {
                            if (String(row.item_code || "") !== String(item.item_code || "")) return false;
                            if (context.warehouse && String(row.warehouse || "") !== String(context.warehouse)) return false;
                            if (cint(row.disabled || 0)) return false;
                            if (row.expiry_date && String(row.expiry_date).slice(0, 10) < today) return false;
                            return flt(row.actual_qty || 0) > 0;
                        });
                    },

        async wmn_get_uom_choices(item) {
                        if (!item?.item_code) return [];

                        if (item.batch_no && Array.isArray(item.__wmn_batch_uom_options) && item.__wmn_batch_uom_options.length) {
                            return item.__wmn_batch_uom_options.map(row => Object.assign({}, row));
                        }

                        if (!item.batch_no && Array.isArray(item.uom_options) && item.uom_options.length) {
                            return item.uom_options.map(row => Object.assign({}, row));
                        }

                        const context = await this.wmn_get_item_selection_context();

                        if (!this.wmn_is_offline()) {
                            const response = await frappe.call({
                                method: "wmn.api.get_pos_item_uoms",
                                args: {
                                    item_code: item.item_code,
                                    price_list: context.price_list,
                                    batch_no: item.batch_no || "",
                                },
                                freeze: false,
                            });
                            return Array.isArray(response?.message) ? response.message : [];
                        }

                        if (item.batch_no && window.wmnPOSOffline) {
                            const batches = window.wmnPOSOffline.getAllByIndex
                                ? await window.wmnPOSOffline.getAllByIndex(
                                    window.wmnPOSOffline.STORES.batches,
                                    "batch_no",
                                    item.batch_no
                                )
                                : [];
                            const batch = (batches || []).find(row =>
                                String(row.item_code || "") === String(item.item_code || "") &&
                                String(row.batch_no || "") === String(item.batch_no || "") &&
                                (!context.warehouse || String(row.warehouse || "") === String(context.warehouse))
                            );
                            if (batch && Array.isArray(batch.uom_options) && batch.uom_options.length) {
                                return batch.uom_options.map(row => Object.assign({}, row));
                            }
                        }

                        return Array.isArray(item.uom_options)
                            ? item.uom_options.map(row => Object.assign({}, row))
                            : [];
                    },

        wmn_apply_uom_option(item, option, qty = 1) {
                        return Object.assign({}, item, {
                            uom: option.uom || item.stock_uom || item.uom || "",
                            price_list_rate: flt(option.price_list_rate || 0),
                            rate: flt(option.price_list_rate || 0),
                            currency: option.currency || item.currency || "",
                            conversion_factor: flt(option.conversion_factor || 1),
                            qty: flt(qty || 1),
                            __wmn_selected_qty: flt(qty || 1),
                            __wmn_uom_selected: 1,
                            __wmn_selection_dialog_done: 1,
                        });
                    },

        wmn_config_qty(value) {
                        const qty = flt(value || 0);
                        return qty > 0 ? qty : 1;
                    },

        wmn_config_available_uom_qty(item, option) {
                        const stockQty = flt(item?.__wmn_selected_batch_available_qty || item?.actual_qty || 0);
                        const factor = flt(option?.conversion_factor || 1);
                        if (stockQty <= 0 || factor <= 0) return 0;
                        return stockQty / factor;
                    },

        wmn_config_uom_section_html(item, options, selectedIndex = 0, qty = 1) {
                        const contextCurrency = item.currency || "";
                        const safeOptions = Array.isArray(options) ? options : [];
                        const active = safeOptions[selectedIndex] || safeOptions[0] || {};
                        const rate = flt(active.price_list_rate || 0);
                        const total = flt(qty || 1) * rate;

                        return `
                            <div class="wmn-config-section wmn-config-uom-section">
                                <div class="wmn-config-section-label">${__("Unit of Measure")}</div>
                                <div class="wmn-config-uom-grid">
                                    ${safeOptions.map((option, index) => {
                                        const selected = index === selectedIndex;
                                        return `
                                            <button type="button"
                                                class="wmn-config-uom-card${selected ? " is-selected" : ""}"
                                                data-uom-index="${index}">
                                                <span class="wmn-config-uom-name">${frappe.utils.escape_html(option.uom || "")}</span>
                                                <span class="wmn-config-uom-rate">${format_currency(flt(option.price_list_rate || 0), option.currency || contextCurrency)}</span>
                                            </button>`;
                                    }).join("")}
                                </div>

                                <div class="wmn-config-section-label wmn-config-qty-label">${__("Quantity")}</div>
                                <div class="wmn-config-qty-row">
                                    <button type="button" class="wmn-config-qty-btn" data-delta="-1">−</button>
                                    <input type="number" class="wmn-config-qty-input" min="0.001" step="0.001" value="${this.wmn_config_qty(qty)}">
                                    <button type="button" class="wmn-config-qty-btn" data-delta="1">+</button>
                                </div>
                                <div class="wmn-config-quick-qty">
                                    ${[1, 5, 10, 20].map(value => `<button type="button" class="wmn-config-quick-btn${flt(qty) === value ? " is-selected" : ""}" data-qty="${value}">${value}</button>`).join("")}
                                </div>

                                <div class="wmn-config-total-card">
                                    <span>
                                        <small>${__("Total")}</small>
                                        <em class="wmn-config-total-detail">${this.wmn_config_qty(qty)} × ${format_currency(rate, active.currency || contextCurrency)}</em>
                                    </span>
                                    <strong class="wmn-config-total-value">${format_currency(total, active.currency || contextCurrency)}</strong>
                                </div>
                            </div>`;
                    },

        wmn_bind_config_uom_section(dialog, state) {
                        const $wrapper = dialog.$wrapper;

                        const refresh = () => {
                            const option = state.options[state.selectedUomIndex] || state.options[0] || {};
                            const qty = this.wmn_config_qty(state.qty);
                            state.qty = qty;
                            const rate = flt(option.price_list_rate || 0);
                            $wrapper.find(".wmn-config-qty-input").val(qty);
                            $wrapper.find(".wmn-config-quick-btn").removeClass("is-selected");
                            $wrapper.find(`.wmn-config-quick-btn[data-qty="${qty}"]`).addClass("is-selected");
                            $wrapper.find(".wmn-config-total-detail").text(`${qty} × ${format_currency(rate, option.currency || state.item.currency || "")}`);
                            $wrapper.find(".wmn-config-total-value").text(format_currency(qty * rate, option.currency || state.item.currency || ""));
                        };

                        $wrapper.off("click.wmnConfigUom", ".wmn-config-uom-card")
                            .on("click.wmnConfigUom", ".wmn-config-uom-card", event => {
                                state.selectedUomIndex = cint($(event.currentTarget).attr("data-uom-index") || 0);
                                $wrapper.find(".wmn-config-uom-card").removeClass("is-selected");
                                $(event.currentTarget).addClass("is-selected");
                                refresh();
                            });

                        $wrapper.off("click.wmnConfigQty", ".wmn-config-qty-btn")
                            .on("click.wmnConfigQty", ".wmn-config-qty-btn", event => {
                                const delta = flt($(event.currentTarget).attr("data-delta") || 0);
                                state.qty = Math.max(0.001, this.wmn_config_qty(state.qty) + delta);
                                refresh();
                            });

                        $wrapper.off("input.wmnConfigQty change.wmnConfigQty", ".wmn-config-qty-input")
                            .on("input.wmnConfigQty change.wmnConfigQty", ".wmn-config-qty-input", event => {
                                state.qty = this.wmn_config_qty($(event.currentTarget).val());
                                refresh();
                            });

                        $wrapper.off("click.wmnConfigQuick", ".wmn-config-quick-btn")
                            .on("click.wmnConfigQuick", ".wmn-config-quick-btn", event => {
                                state.qty = this.wmn_config_qty($(event.currentTarget).attr("data-qty"));
                                refresh();
                            });
                    },

        wmn_validate_config_qty(item, option, qty) {
                        const requested = flt(qty || 0);
                        if (requested <= 0) {
                            frappe.show_alert({ message: __("Quantity must be greater than zero"), indicator: "orange" });
                            return false;
                        }

                        return true;
                    },

        async wmn_choose_uom(item) {
                        if (!item) return null;
                        if (item.__wmn_skip_uom_dialog) return item;

                        const options = await this.wmn_get_uom_choices(item);
                        if (!options.length) return item;

                        if (options.length === 1) {
                            return this.wmn_apply_uom_option(item, options[0], item.qty || 1);
                        }

                        return new Promise(resolve => {
                            const baseIndex = Math.max(0, options.findIndex(option => option.uom === item.stock_uom));
                            const state = {
                                item: Object.assign({}, item),
                                options,
                                selectedUomIndex: baseIndex,
                                qty: flt(item.qty || 1),
                            };
                            const dialog = new frappe.ui.Dialog({
                                title: __("Select Unit of Measure"),
                                fields: [{ fieldtype: "HTML", fieldname: "wmn_config" }],
                            });
                            dialog.$wrapper.addClass("wmn-pos-app-dialog wmn-pos-config-dialog");

                            const render = () => {
                                dialog.fields_dict.wmn_config.$wrapper.html(`
                                    <div class="wmn-config-shell">
                                        <div class="wmn-config-item-head">
                                            <div class="wmn-config-item-icon">${frappe.utils.escape_html(String(item.item_name || item.item_code || "").charAt(0).toUpperCase())}</div>
                                            <div><strong>${frappe.utils.escape_html(item.item_name || item.item_code || "")}</strong><small>${frappe.utils.escape_html(item.item_code || "")}</small></div>
                                        </div>
                                        ${this.wmn_config_uom_section_html(item, options, state.selectedUomIndex, state.qty)}
                                        <div class="wmn-config-actions">
                                            <button type="button" class="btn wmn-config-cancel">${__("Cancel")}</button>
                                            <button type="button" class="btn wmn-config-add">${__("Add to Cart")}</button>
                                        </div>
                                    </div>`);
                                this.wmn_bind_config_uom_section(dialog, state);
                            };

                            let settled = false;
                            const finish = value => {
                                if (settled) return;
                                settled = true;
                                dialog.hide();
                                resolve(value);
                            };

                            render();
                            dialog.$wrapper.on("click.wmnConfigCancel", ".wmn-config-cancel", () => finish(null));
                            dialog.$wrapper.on("click.wmnConfigAdd", ".wmn-config-add", () => {
                                const option = state.options[state.selectedUomIndex] || state.options[0];
                                if (!option || !this.wmn_validate_config_qty(state.item, option, state.qty)) return;
                                finish(this.wmn_apply_uom_option(state.item, option, state.qty));
                            });
                            dialog.$wrapper.one("hidden.bs.modal.wmnConfig", () => {
                                if (!settled) {
                                    settled = true;
                                    resolve(null);
                                }
                            });
                            dialog.show();
                        });
                    },

        async wmn_choose_batch_with_uom(item, existingDialog = null, targetWrapper = null) {
                        const batches = await this.wmn_get_batch_choices(item);
                        if (!batches.length) {
                            frappe.show_alert({ message: __("No available batches were found for this item."), indicator: "orange" });
                            return null;
                        }

                        const runEmbedded = async (dialog, $target, finish) => {
                            const state = {
                                item: Object.assign({}, item),
                                batches,
                                selectedBatchIndex: -1,
                                options: [],
                                selectedUomIndex: 0,
                                qty: flt(item.qty || 1),
                            };

                            const renderBatchList = () => {
                                $target.html(`
                                    <div class="wmn-config-section">
                                        <div class="wmn-config-section-label">${__("Batch No")}</div>
                                        <div class="wmn-config-batch-list">
                                            ${batches.map((batch, index) => `
                                                <button type="button" class="wmn-config-batch-card" data-batch-index="${index}">
                                                    <span><strong>${frappe.utils.escape_html(batch.batch_no || "")}</strong><small>${batch.expiry_date ? `${__("Expiry")}: ${frappe.utils.escape_html(String(batch.expiry_date))}` : ""}</small></span>
                                                    <span><strong>${flt(batch.actual_qty || 0)}</strong><small>${__("Available")}</small></span>
                                                </button>`).join("")}
                                        </div>
                                        <div class="wmn-config-batch-uom-target"></div>
                                    </div>`);
                            };

                            const renderUomForBatch = async index => {
                                state.selectedBatchIndex = index;
                                const batch = batches[index];
                                dialog.$wrapper.find(".wmn-config-batch-card").removeClass("is-selected");
                                dialog.$wrapper.find(`.wmn-config-batch-card[data-batch-index="${index}"]`).addClass("is-selected");

                                state.item = Object.assign({}, item, {
                                    batch_no: batch.batch_no,
                                    warehouse: batch.warehouse || item.warehouse || "",
                                    actual_qty: flt(batch.actual_qty || 0),
                                    __wmn_selected_batch_available_qty: flt(batch.actual_qty || 0),
                                    allow_negative_stock: cint(batch.allow_negative_stock ?? item.allow_negative_stock ?? 0),
                                    __wmn_batch_uom_options: Array.isArray(batch.uom_options) ? batch.uom_options : [],
                                    __wmn_batch_dialog_done: 1,
                                    __wmn_skip_item_details_for_batch_flow: 1,
                                    __wmn_selection_dialog_done: 1,
                                });
                                state.options = await this.wmn_get_uom_choices(state.item);
                                if (!state.options.length) {
                                    frappe.show_alert({ message: __("No unit of measure is available for this item."), indicator: "orange" });
                                    return;
                                }
                                state.selectedUomIndex = Math.max(0, state.options.findIndex(option => option.uom === state.item.stock_uom));
                                const $uomTarget = dialog.$wrapper.find(".wmn-config-batch-uom-target");
                                $uomTarget.html(this.wmn_config_uom_section_html(state.item, state.options, state.selectedUomIndex, state.qty));
                                this.wmn_bind_config_uom_section(dialog, state);
                            };

                            renderBatchList();
                            dialog.$wrapper.off("click.wmnConfigBatch", ".wmn-config-batch-card")
                                .on("click.wmnConfigBatch", ".wmn-config-batch-card", event => {
                                    const index = cint($(event.currentTarget).attr("data-batch-index") || 0);
                                    renderUomForBatch(index).catch(error => {
                                        console.error("WMN batch UOM rendering failed", error);
                                    });
                                });

                            return { state, finish };
                        };

                        if (existingDialog && targetWrapper) {
                            return runEmbedded(existingDialog, targetWrapper, null);
                        }

                        return new Promise(resolve => {
                            const dialog = new frappe.ui.Dialog({
                                title: __("Select Batch No"),
                                fields: [{ fieldtype: "HTML", fieldname: "wmn_config" }],
                            });
                            dialog.$wrapper.addClass("wmn-pos-app-dialog wmn-pos-config-dialog");
                            let settled = false;
                            let embedded = null;
                            const finish = value => {
                                if (settled) return;
                                settled = true;
                                dialog.hide();
                                resolve(value);
                            };

                            dialog.fields_dict.wmn_config.$wrapper.html(`
                                <div class="wmn-config-shell">
                                    <div class="wmn-config-item-head">
                                        <div class="wmn-config-item-icon">${frappe.utils.escape_html(String(item.item_name || item.item_code || "").charAt(0).toUpperCase())}</div>
                                        <div><strong>${frappe.utils.escape_html(item.item_name || item.item_code || "")}</strong><small>${frappe.utils.escape_html(item.item_code || "")}</small></div>
                                    </div>
                                    <div class="wmn-config-main-target"></div>
                                    <div class="wmn-config-actions">
                                        <button type="button" class="btn wmn-config-cancel">${__("Cancel")}</button>
                                        <button type="button" class="btn wmn-config-add">${__("Add to Cart")}</button>
                                    </div>
                                </div>`);

                            runEmbedded(dialog, dialog.$wrapper.find(".wmn-config-main-target"), finish).then(value => {
                                embedded = value;
                            });

                            dialog.$wrapper.on("click.wmnConfigCancel", ".wmn-config-cancel", () => finish(null));
                            dialog.$wrapper.on("click.wmnConfigAdd", ".wmn-config-add", () => {
                                const state = embedded?.state;
                                if (!state || state.selectedBatchIndex < 0 || !state.options.length) {
                                    frappe.show_alert({ message: __("Select a batch first."), indicator: "orange" });
                                    return;
                                }
                                const option = state.options[state.selectedUomIndex] || state.options[0];
                                if (!option || !this.wmn_validate_config_qty(state.item, option, state.qty)) return;
                                finish(this.wmn_apply_uom_option(state.item, option, state.qty));
                            });
                            dialog.$wrapper.one("hidden.bs.modal.wmnConfig", () => {
                                if (!settled) {
                                    settled = true;
                                    resolve(null);
                                }
                            });
                            dialog.show();
                        });
                    },

        async wmn_choose_variant(templateItem) {
                        const variants = await this.wmn_get_variant_choices(templateItem);
                        if (!variants.length) {
                            frappe.show_alert({ message: __("No available variants were found for this item."), indicator: "orange" });
                            return null;
                        }

                        return new Promise(resolve => {
                            const dialog = new frappe.ui.Dialog({
                                title: __("Select Variant"),
                                fields: [{ fieldtype: "HTML", fieldname: "wmn_config" }],
                            });
                            dialog.$wrapper.addClass("wmn-pos-app-dialog wmn-pos-config-dialog");
                            const contextCurrency = templateItem.currency || "";
                            const state = {
                                selectedVariantIndex: -1,
                                item: null,
                                options: [],
                                selectedUomIndex: 0,
                                qty: 1,
                                batchEmbedded: null,
                            };
                            let settled = false;

                            const finish = value => {
                                if (settled) return;
                                settled = true;
                                dialog.hide();
                                resolve(value);
                            };

                            const renderBase = () => {
                                dialog.fields_dict.wmn_config.$wrapper.html(`
                                    <div class="wmn-config-shell">
                                        <div class="wmn-config-variant-grid">
                                            ${variants.map((variant, index) => {
                                                const variantLabel = (variant.variant_attributes || [])
                                                    .map(row => frappe.utils.escape_html(row.attribute_value || ""))
                                                    .filter(Boolean)
                                                    .join(" ") || frappe.utils.escape_html(variant.item_name || variant.item_code || "");
                                                const disabled = cint(variant.__wmn_selection_disabled || 0);
                                                return `
                                                    <button type="button" class="wmn-config-variant-card${disabled ? " is-disabled" : ""}" data-variant-index="${index}" ${disabled ? "disabled" : ""}>
                                                        <strong class="wmn-config-variant-title">${variantLabel}</strong>
                                                        <div class="wmn-config-variant-meta">
                                                            <b>${format_currency(flt(variant.price_list_rate || 0), variant.currency || contextCurrency)}</b>
                                                            <em>${flt(variant.actual_qty || 0)}</em>
                                                        </div>
                                                    </button>`;
                                            }).join("")}
                                        </div>
                                        <div class="wmn-config-variant-detail"></div>
                                        <div class="wmn-config-actions">
                                            <button type="button" class="btn wmn-config-cancel">${__("Cancel")}</button>
                                            <button type="button" class="btn wmn-config-add">${__("Add to Cart")}</button>
                                        </div>
                                    </div>`);
                            };

                            const renderVariantDetail = async index => {
                                state.selectedVariantIndex = index;
                                let variant = variants[index];
                                if (!variant || cint(variant.__wmn_selection_disabled || 0)) return;
                                variant = await this.wmn_enrich_item_tracking_meta(variant);
                                state.item = Object.assign({}, variant, {
                                    __wmn_selection_dialog_done: 1,
                                    __wmn_skip_item_details_for_batch_flow: 1,
                                });
                                state.qty = 1;
                                state.batchEmbedded = null;
                                dialog.$wrapper.find(".wmn-config-variant-card").removeClass("is-selected");
                                dialog.$wrapper.find(`.wmn-config-variant-card[data-variant-index="${index}"]`).addClass("is-selected");

                                const $detail = dialog.$wrapper.find(".wmn-config-variant-detail");
                                if (cint(state.item.has_batch_no || 0)) {
                                    $detail.html(`<div class="wmn-config-embedded-title">${__("Choose Batch and Unit of Measure")}</div><div class="wmn-config-embedded-batch"></div>`);
                                    state.batchEmbedded = await this.wmn_choose_batch_with_uom(
                                        state.item,
                                        dialog,
                                        $detail.find(".wmn-config-embedded-batch")
                                    );
                                    return;
                                }

                                state.options = await this.wmn_get_uom_choices(state.item);
                                if (!state.options.length) return;
                                state.selectedUomIndex = Math.max(0, state.options.findIndex(option => option.uom === state.item.stock_uom));
                                $detail.html(this.wmn_config_uom_section_html(state.item, state.options, state.selectedUomIndex, state.qty));
                                this.wmn_bind_config_uom_section(dialog, state);
                            };

                            renderBase();
                            dialog.$wrapper.on("click.wmnConfigVariant", ".wmn-config-variant-card", event => {
                                const index = cint($(event.currentTarget).attr("data-variant-index") || 0);
                                renderVariantDetail(index).catch(error => console.error("WMN variant detail failed", error));
                            });
                            dialog.$wrapper.on("click.wmnConfigCancel", ".wmn-config-cancel", () => finish(null));
                            dialog.$wrapper.on("click.wmnConfigAdd", ".wmn-config-add", () => {
                                if (!state.item) {
                                    frappe.show_alert({ message: __("Select a variant first."), indicator: "orange" });
                                    return;
                                }

                                if (cint(state.item.has_batch_no || 0)) {
                                    const batchState = state.batchEmbedded?.state;
                                    if (!batchState || batchState.selectedBatchIndex < 0 || !batchState.options.length) {
                                        frappe.show_alert({ message: __("Select a batch first."), indicator: "orange" });
                                        return;
                                    }
                                    const option = batchState.options[batchState.selectedUomIndex] || batchState.options[0];
                                    if (!option || !this.wmn_validate_config_qty(batchState.item, option, batchState.qty)) return;
                                    finish(this.wmn_apply_uom_option(batchState.item, option, batchState.qty));
                                    return;
                                }

                                const option = state.options[state.selectedUomIndex] || state.options[0];
                                if (!option || !this.wmn_validate_config_qty(state.item, option, state.qty)) return;
                                finish(this.wmn_apply_uom_option(state.item, option, state.qty));
                            });
                            dialog.$wrapper.one("hidden.bs.modal.wmnConfig", () => {
                                if (!settled) {
                                    settled = true;
                                    resolve(null);
                                }
                            });
                            dialog.show();
                        });
                    },

        async wmn_handle_item_wrapper_click($item) {
                        const itemCode = unescape($item.attr("data-item-code"));
                        let item = (this.items || []).find(row => row && row.item_code === itemCode) || null;

                        if (!item) {
                            let batch_no = unescape($item.attr("data-batch-no"));
                            let serial_no = unescape($item.attr("data-serial-no"));
                            let uom = unescape($item.attr("data-uom"));
                            let rate = unescape($item.attr("data-rate"));
                            let stock_uom = unescape($item.attr("data-stock-uom"));
                            batch_no = batch_no === "undefined" ? undefined : batch_no;
                            serial_no = serial_no === "undefined" ? undefined : serial_no;
                            uom = uom === "undefined" ? undefined : uom;
                            rate = rate === "undefined" ? undefined : rate;
                            stock_uom = stock_uom === "undefined" ? undefined : stock_uom;
                            item = { item_code: itemCode, batch_no, serial_no, uom, rate, price_list_rate: rate, stock_uom };
                        }

                        let selectedItem = item;
                        if (cint(item.__wmn_variant_template || 0)) {
                            selectedItem = await this.wmn_choose_variant(item);
                            if (!selectedItem) return;
                        } else {
                            selectedItem = await this.wmn_enrich_item_tracking_meta(selectedItem);
                            if (cint(selectedItem.has_batch_no || 0) && !selectedItem.batch_no) {
                                selectedItem = await this.wmn_choose_batch_with_uom(selectedItem);
                                if (!selectedItem) return;
                            } else {
                                const options = await this.wmn_get_uom_choices(selectedItem);
                                if (options.length > 1) {
                                    selectedItem = await this.wmn_choose_uom(selectedItem);
                                    if (!selectedItem) return;
                                } else if (options.length === 1) {
                                    selectedItem = this.wmn_apply_uom_option(selectedItem, options[0], 1);
                                }
                            }
                        }

                        selectedItem.__wmn_selection_dialog_done = 1;
                        selectedItem.__wmn_skip_item_details_for_batch_flow = 1;

                        await this.wmn_update_existing_cart_item_or_add(
                            selectedItem,
                            flt(selectedItem.__wmn_selected_qty || selectedItem.qty || 1)
                        );

                        const isMobilePOS = typeof window.wmn_is_mobile_pos_device === "function"
                            ? window.wmn_is_mobile_pos_device()
                            : (window.innerWidth <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ""));

                        if (isMobilePOS) {
                            this.search_field?.$input?.trigger("blur");
                        } else if (this.search_field && typeof this.search_field.set_focus === "function") {
                            this.search_field.set_focus();
                        }
                    },

        wmn_open_ui_settings_dialog() {
                        const prefs = window.WMNPOSUIPreferences;
                        const repo = window.WMN_POS?.Services?.Settings?.POSProfileSettings;
                        const current = prefs?.readAll?.() || { default_item_view: "Grid View", show_item_cart_counter: false };
                        const status = repo?.status?.() || {};
                        const dialog = new frappe.ui.Dialog({
                            title: __("POS Settings"),
                            fields: [
                                {
                                    fieldname: "default_item_view",
                                    fieldtype: "Select",
                                    label: __("Default Item View"),
                                    options: `${__("Grid View")}\n${__("Button View")}`,
                                    default: current.default_item_view === "Button View" ? __("Button View") : __("Grid View"),
                                },
                                {
                                    fieldname: "show_item_cart_counter",
                                    fieldtype: "Check",
                                    label: __("Show item cart quantity counter"),
                                    default: current.show_item_cart_counter ? 1 : 0,
                                },
                                { fieldtype: "Section Break", label: __("Settings Storage") },
                                {
                                    fieldname: "save_target",
                                    fieldtype: "Select",
                                    label: __("Save Changes To"),
                                    reqd: 1,
                                    options: `${__("This Browser")}\n${__("POS Profile Settings")}`,
                                    default: __("This Browser"),
                                },
                                { fieldname: "settings_status", fieldtype: "HTML" },
                            ],
                            primary_action_label: __("Save"),
                            primary_action: async (values) => {
                                try {
                                    const normalized = {
                                        default_item_view: String(values.default_item_view || "") === __("Button View") ? "Button View" : "Grid View",
                                        show_item_cart_counter: Boolean(cint(values.show_item_cart_counter || 0)),
                                    };
                                    const saveToServer = String(values.save_target || "") === __("POS Profile Settings");
                                    if (saveToServer) {
                                        if (!status.online) throw new Error(__("Cannot save POS Profile Settings while offline."));
                                        if (!status.can_write) throw new Error(__("You do not have permission to update this POS Profile."));
                                        await prefs?.writeServer?.(normalized);
                                    } else {
                                        prefs?.writeAll?.(normalized);
                                    }

                                    this.button_mode = normalized.default_item_view === "Button View";
                                    this.applyDisplayMode?.();
                                    this.sync_card_quantities?.();
                                    dialog.hide();
                                    frappe.show_alert({
                                        message: saveToServer ? __("POS settings saved as the POS Profile default.") : __("POS settings saved for this browser and POS Profile."),
                                        indicator: "green",
                                    });
                                } catch (error) {
                                    frappe.msgprint({ title: __("POS Settings"), indicator: "red", message: error?.message || String(error) });
                                }
                            },
                            secondary_action_label: __("Close"),
                            secondary_action: () => dialog.hide(),
                        });

                        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-settings-dialog");
                        dialog.show();
                        const statusField = dialog.get_field("settings_status");
                        if (statusField?.$wrapper) {
                            const profileName = repo?.resolveProfile?.() || "";
                            const source = status.has_local_override ? __("Browser override is active") : __("Using POS Profile defaults");
                            statusField.$wrapper.html(`<div class="alert alert-light border" style="margin:0;padding:10px 12px"><strong>${frappe.utils.escape_html(profileName || __("POS Profile"))}</strong><br>${source}</div>`);
                        }
                        return dialog;
                    },

        bind_events() {
            super.bind_events();

            this.$component.off("click", ".item-wrapper");
            this.$component.off(".wmnItemSelection .wmnMamsek");
            this.$component
                .on("click.wmnItemSelection", ".item-wrapper", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.wmn_handle_item_wrapper_click($(event.currentTarget)).catch((error) => {
                        console.error("WMN item selection failed", error);
                        frappe.show_alert({
                            message: error?.message || __("Unable to select item."),
                            indicator: "red",
                        });
                    });
                });

            this.$component.on("mousedown.wmnMamsek", ".wmn-qty-button", (event) => event.preventDefault());

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
                this.events.item_quantity_set(read_item_data($input.closest(".wmn-item-card")), quantity);
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
                if (action === "open-main-menu") {
                    event.preventDefault();
                    event.stopPropagation();
                    if (window.WMNPOSDoctypeManager?.openMenu) {
                        window.WMNPOSDoctypeManager.openMenu(this).catch((error) => {
                            console.error("WMN POS main menu failed", error);
                            frappe.show_alert({ message: error?.message || __("Unable to open POS menu."), indicator: "red" });
                        });
                    }
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
                } else if (action === "open-settings") {
                    this.wmn_open_ui_settings_dialog();
                }
            });
        },

        render_item_list(items) {
            this.items = items || [];
            super.render_item_list(this.items);
            this.update_active_category_count?.();
            this.sync_card_quantities?.();
            this.applyDisplayMode();
        },

        prepare_dom() {
            this.wrapper.append(
                `<section class="items-selector wmn-items-selector">
                    <nav class="wmn-pos-nav" aria-label="${escape_html(__("Point of Sale navigation"))}">
                        <div class="wmn-pos-nav-links">
                            <button type="button" class="wmn-nav-btn" data-action="open-form-view">${icon("form", 18)}<span>${__("Open Form View")}</span></button>
                            <button type="button" class="wmn-nav-btn" data-action="toggle-recent-orders">${icon("history", 18)}<span>${__("Toggle Recent Orders")}</span></button>
                            <button type="button" class="wmn-nav-btn" data-action="save-as-draft">${icon("save", 18)}<span>${__("Save as Draft")}</span></button>
                            <button type="button" class="wmn-nav-btn is-danger" data-action="close-pos">${icon("close_pos", 18)}<span>${__("Close the POS")}</span></button>
                            <button type="button" class="wmn-nav-btn wmn-settings-btn" data-action="open-settings"
                                aria-label="${escape_html(__("Settings"))}" title="${escape_html(__("Settings"))}">${icon("settings", 18)}</button>
                            <div class="wmn-tools-menu">
                                <button type="button" class="wmn-nav-btn wmn-tools-menu-toggle" data-action="open-main-menu"
                                    aria-haspopup="dialog" title="${escape_html(__("Menu"))}">
                                    ${icon("menu", 18)}<span>${__("Menu")}</span>
                                </button>
                            </div>
                            <button type="button" class="wmn-nav-btn wmn-connectivity-btn is-checking" data-action="check-connectivity"
                                title="${escape_html(__("Check server connection"))}" aria-live="polite">
                                <span class="wmn-connectivity-dot" aria-hidden="true"></span>
                                <span class="wmn-connectivity-label">${__("Checking")}</span>
                                <span class="wmn-pending-badge" hidden>0</span>
                            </button>
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
            this.$connectivityBtn = this.$component.find(".wmn-connectivity-btn");
            this.$connectivityLabel = this.$connectivityBtn.find(".wmn-connectivity-label");
            this.$pendingBadge = this.$connectivityBtn.find(".wmn-pending-badge");
            this.updateActiveButton();
        },

        updateActiveButton() {
            const original_update = super.updateActiveButton;
            if (typeof original_update === "function") original_update.call(this);

            const button_mode = Boolean(this.button_mode);
            this.$gridBtn
                ?.toggleClass("is-selected", !button_mode)
                .toggleClass("bg-white shadow-sm", !button_mode)
                .toggleClass("hover:bg-gray-200", button_mode)
                .attr("aria-checked", String(!button_mode));
            this.$listBtn
                ?.toggleClass("is-selected", button_mode)
                .toggleClass("bg-white shadow-sm", button_mode)
                .toggleClass("hover:bg-gray-200", !button_mode)
                .attr("aria-checked", String(button_mode));
        },

        setCardMode() {
                        if (!this.button_mode) return;
                        this.button_mode = false;
                        window.WMNPOSUIPreferences?.set?.("default_item_view", "Grid View");
                        this.updateActiveButton();
                        this.applyDisplayMode();
                    },

        setButtonMode() {
                        if (this.button_mode) return;
                        this.button_mode = true;
                        window.WMNPOSUIPreferences?.set?.("default_item_view", "Button View");
                        this.updateActiveButton();
                        this.applyDisplayMode();
                    },

        applyDisplayMode() {
            const original_apply = super.applyDisplayMode;
            if (typeof original_apply === "function") original_apply.call(this);

            const button_mode = Boolean(this.button_mode);
            this.$items_container?.toggleClass("wmn-button-mode", button_mode);
            this.$component
                ?.closest(".wmn-mamsek-shell")
                .toggleClass("wmn-button-view-active", button_mode);
            this.updateActiveButton();
        },
    };

    const UIMethods = {
        __proto__: CoreMethods,




        set_connectivity_indicator_state(is_online, checking = false) {
        				if (!this.$connectivityBtn?.length) return;

        				this.$connectivityBtn
        					.removeClass("is-online is-offline is-checking")
        					.addClass(checking ? "is-checking" : (is_online ? "is-online" : "is-offline"));

        				this.$connectivityLabel?.text(
        					checking ? __("Checking") : (is_online ? __("Online") : __("Offline"))
        				);

        				this.$connectivityBtn.attr(
        					"title",
        					checking ? __("Checking server connection") : (is_online ? __("Server is online") : __("Server is offline"))
        				);
        			},

        async refresh_pending_invoice_badge() {
        				if (!this.$pendingBadge?.length) return;

        				let count = 0;
        				try {
        					if (window.wmnPOSOffline?.getPendingInvoices) {
        						const rows = await window.wmnPOSOffline.getPendingInvoices();
        						count += Array.isArray(rows) ? rows.length : 0;
        					}
        					if (window.wmnPOSOffline?.getPendingPaymentEntries) {
        						const rows = await window.wmnPOSOffline.getPendingPaymentEntries();
        						count += Array.isArray(rows) ? rows.length : 0;
        					}
        				} catch (e) {
        					console.warn("WMN pending financial queue count failed", e);
        				}

        				this.$pendingBadge.text(String(count));
        				this.$pendingBadge.prop("hidden", count <= 0);
        				this.$connectivityBtn.attr("data-pending-count", String(count));
        			},

        install_connectivity_indicator() {
        				if (this.__wmn_connectivity_indicator_installed || !this.$connectivityBtn?.length) return;
        				this.__wmn_connectivity_indicator_installed = true;

        				this._wmn_connectivity_status_handler = (event) => {
        					const detail = event?.detail || {};
        					this.set_connectivity_indicator_state(detail.online === true, false);
        				};
        				this._wmn_offline_queue_handler = () => this.refresh_pending_invoice_badge();

        				window.addEventListener("wmn:pos-connectivity-status", this._wmn_connectivity_status_handler);
        				window.addEventListener("wmn:pos-offline-queue-changed", this._wmn_offline_queue_handler);

        				this.$connectivityBtn
        					.off("click.wmnConnectivity")
        					.on("click.wmnConnectivity", async (event) => {
        						event.preventDefault();
        						event.stopPropagation();
        						this.set_connectivity_indicator_state(false, true);

        						if (typeof window.wmn_check_pos_server_connection === "function") {
        							await window.wmn_check_pos_server_connection();
        						}
        						await this.refresh_pending_invoice_badge();
        					});

        				this.refresh_pending_invoice_badge();
        				this.set_connectivity_indicator_state(false, true);

        				if (typeof window.wmn_check_pos_server_connection === "function") {
        					window.wmn_check_pos_server_connection().catch(function () {});
        				}
        			},


        install_category_bar() {
                        this.$category_track = this.$component.find(".wmn-category-track");
                        const configuredGroups = (this.mamsek_settings.item_groups || [])
                            .map((row) => row.item_group || row.name)
                            .filter(Boolean);

                        if (configuredGroups.length) {
                            this.render_category_bar(configuredGroups);
                            return;
                        }

                        if (this.wmn_is_offline() && window.wmnPOSOffline) {
                            const loadGroups = window.wmnPOSOffline.getAllCached
                                ? window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.item_groups)
                                : window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_groups);
                            Promise.resolve(loadGroups)
                                .then((rows) => {
                                    const groups = (rows || [])
                                        .filter((row) => !cint(row.is_group || 0))
                                        .map((row) => String(row.name || "").trim())
                                        .filter(Boolean)
                                        .sort((a, b) => a.localeCompare(b))
                                        .slice(0, 5);
                                    this.render_category_bar(groups);
                                })
                                .catch(() => this.render_category_bar([]));
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
                    },

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
        			},



        handle_broken_image($img) {
        				const item_abbr = escape_html($($img).attr("alt"));
        				$($img).replaceWith(`<div class="item-display abbr">${item_abbr}</div>`);
        			},


        update_active_category_count() {
        				const label = `${this.items.length} ${__("Items")}`;
        				this.$category_track.find(".wmn-category-card.is-active small").text(label);
        			},

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
        			},

        get_cart_quantity(item) {
        				return this.get_cart_rows(item).reduce((total, row) => total + flt(row.qty), 0);
        			},

        sync_card_quantities() {
				const selector = this;
                const frm = this.events?.get_frm?.() || null;
                const cartRows = frm?.doc?.items || [];
                const totalByItemCode = new Map();
                const showCounter = Boolean(window.WMNPOSUIPreferences?.get?.("show_item_cart_counter"));

                for (const row of cartRows) {
                    if (!row) continue;
                    const code = String(row.item_code || "");
                    if (!code) continue;
                    totalByItemCode.set(code, flt(totalByItemCode.get(code) || 0) + flt(row.qty || 0));
                }

				this.$items_container.find(".wmn-item-card").each(function () {
					const $card = $(this);
					const item = read_item_data($card);
					const qty = selector.get_cart_quantity(item);
                    const itemTotalQty = flt(totalByItemCode.get(String(item.item_code || "")) || 0);
                    const $counter = $card.find(".wmn-item-cart-counter").first();

					$card.toggleClass("has-quantity", qty > 0).find(".wmn-item-count").val(qty);
                    if ($counter.length) {
                        $counter.text(itemTotalQty).prop("hidden", !(showCounter && itemTotalQty > 0));
                    }
				});
        			},

        async wmn_refresh_available_stock() {
        				if (!this.$items_container || !this.$items_container.length) return;

        				const currentItems = Array.isArray(this.items) ? this.items : [];
        				const isOffline = typeof this.wmn_is_offline === "function"
        					? this.wmn_is_offline()
        					: (typeof wmn_is_pos_offline === "function" ? wmn_is_pos_offline() : !navigator.onLine);

        				if (isOffline && window.wmnPOSOffline && window.wmnPOSOffline.getStock) {
        					const frm = this.events?.get_frm?.() || window.cur_pos?.frm || null;
        					const defaultWarehouse =
        						frm?.doc?.set_warehouse ||
        						window.cur_pos?.settings?.warehouse ||
        						"";

        					for (const item of currentItems) {
        						if (!item || !item.item_code || !cint(item.is_stock_item || 0)) continue;

        						const warehouse = item.warehouse || defaultWarehouse;
        						if (!warehouse) continue;

        						try {
        							const stock = await window.wmnPOSOffline.getStock(item.item_code, warehouse);
        							if (stock && stock.actual_qty !== undefined && stock.actual_qty !== null) {
        								item.actual_qty = flt(stock.actual_qty || 0);
        							}
        						} catch (e) {
        							console.warn("WMN offline stock pill refresh skipped", item.item_code, e);
        						}
        					}
        				} else if (!isOffline) {
        					try {
        						const searchTerm = String(
        							this.search_field?.get_value?.() ||
        							this.search_field?.$input?.val?.() ||
        							""
        						).trim();

        						const response = await this.get_items({
        							start: 0,
        							page_length: Math.max(currentItems.length, 40),
        							search_term: searchTerm,
        						});

        						const freshItems = response?.message?.items || [];
        						const freshByCode = new Map();

        						for (const fresh of freshItems) {
        							if (!fresh || !fresh.item_code) continue;
        							if (!freshByCode.has(fresh.item_code)) freshByCode.set(fresh.item_code, fresh);
        						}

        						for (const item of currentItems) {
        							const fresh = item?.item_code ? freshByCode.get(item.item_code) : null;
        							if (fresh && fresh.actual_qty !== undefined && fresh.actual_qty !== null) {
        								item.actual_qty = flt(fresh.actual_qty || 0);
        							}
        						}
        					} catch (e) {
        						console.warn("WMN online stock pill refresh skipped", e);
        					}
        				}

        				const selector = this;
        				this.$items_container.find(".wmn-item-card").each(function () {
        					const $card = $(this);
        					const cardData = read_item_data($card);
        					const item = currentItems.find((row) => row && row.item_code === cardData.item_code);

        					if (!item || !cint(item.is_stock_item || 0)) return;

        					const qty = flt(item.actual_qty || 0);
        					let $pill = $card.find(".wmn-stock-pill").first();

        					if (!$pill.length) {
        						$pill = $('<span class="wmn-stock-pill"></span>');
        						$card.find(".wmn-card-media").first().append($pill);
        					}

        					$pill
        						.text(qty)
        						.toggleClass("is-empty", qty <= 0)
        						.toggleClass("is-low", qty > 0 && qty <= 10);
        				});
        			},

        resize_selector(minimize) {
        				this.$component.toggleClass("is-minimized", Boolean(minimize));
        			}
    };

    const FinalMethods = Object.create(null);
    FinalMethods.wmn_is_offline = UIMethods.wmn_is_offline || CoreMethods.wmn_is_offline;
    FinalMethods.wmn_get_cached_pos_settings = UIMethods.wmn_get_cached_pos_settings || CoreMethods.wmn_get_cached_pos_settings;
    FinalMethods.wmn_get_cached_pos_profile = UIMethods.wmn_get_cached_pos_profile || CoreMethods.wmn_get_cached_pos_profile;
    FinalMethods.wmn_enrich_item_tracking_meta = UIMethods.wmn_enrich_item_tracking_meta || CoreMethods.wmn_enrich_item_tracking_meta;
    FinalMethods.wmn_get_offline_parent_item_group = UIMethods.wmn_get_offline_parent_item_group || CoreMethods.wmn_get_offline_parent_item_group;
    FinalMethods.get_parent_item_group = UIMethods.get_parent_item_group || CoreMethods.get_parent_item_group;
    FinalMethods.load_items_data = UIMethods.load_items_data || CoreMethods.load_items_data;
    FinalMethods.wmn_get_awesomplete_value = UIMethods.wmn_get_awesomplete_value || CoreMethods.wmn_get_awesomplete_value;
    FinalMethods.wmn_get_item_group_filter_for_search = UIMethods.wmn_get_item_group_filter_for_search || CoreMethods.wmn_get_item_group_filter_for_search;
    FinalMethods.wmn_set_item_group_filter_label = UIMethods.wmn_set_item_group_filter_label || CoreMethods.wmn_set_item_group_filter_label;
    FinalMethods.wmn_update_existing_cart_item_or_add = UIMethods.wmn_update_existing_cart_item_or_add || CoreMethods.wmn_update_existing_cart_item_or_add;
    FinalMethods.get_item_html = UIMethods.get_item_html || CoreMethods.get_item_html;
    FinalMethods.make_search_bar = UIMethods.make_search_bar || CoreMethods.make_search_bar;
    FinalMethods.wmn_get_item_group_buttons_from_pos_profile = UIMethods.wmn_get_item_group_buttons_from_pos_profile || CoreMethods.wmn_get_item_group_buttons_from_pos_profile;
    FinalMethods.wmn_render_item_group_buttons = UIMethods.wmn_render_item_group_buttons || CoreMethods.wmn_render_item_group_buttons;
    FinalMethods.wmn_set_item_group_field_value = UIMethods.wmn_set_item_group_field_value || CoreMethods.wmn_set_item_group_field_value;
    FinalMethods.wmn_get_item_selection_context = UIMethods.wmn_get_item_selection_context || CoreMethods.wmn_get_item_selection_context;
    FinalMethods.wmn_get_online_variant_metadata = UIMethods.wmn_get_online_variant_metadata || CoreMethods.wmn_get_online_variant_metadata;
    FinalMethods.wmn_prepare_items_for_display = UIMethods.wmn_prepare_items_for_display || CoreMethods.wmn_prepare_items_for_display;
    FinalMethods.wmn_is_direct_search_result = UIMethods.wmn_is_direct_search_result || CoreMethods.wmn_is_direct_search_result;
    FinalMethods.get_items = UIMethods.get_items || CoreMethods.get_items;
    FinalMethods.wmn_scan_barcode_structure_offline = UIMethods.wmn_scan_barcode_structure_offline || CoreMethods.wmn_scan_barcode_structure_offline;
    FinalMethods.filter_items = UIMethods.filter_items || CoreMethods.filter_items;
    FinalMethods.wmn_get_variant_choices = UIMethods.wmn_get_variant_choices || CoreMethods.wmn_get_variant_choices;
    FinalMethods.wmn_get_batch_choices = UIMethods.wmn_get_batch_choices || CoreMethods.wmn_get_batch_choices;
    FinalMethods.wmn_get_uom_choices = UIMethods.wmn_get_uom_choices || CoreMethods.wmn_get_uom_choices;
    FinalMethods.wmn_apply_uom_option = UIMethods.wmn_apply_uom_option || CoreMethods.wmn_apply_uom_option;
    FinalMethods.wmn_config_qty = UIMethods.wmn_config_qty || CoreMethods.wmn_config_qty;
    FinalMethods.wmn_config_available_uom_qty = UIMethods.wmn_config_available_uom_qty || CoreMethods.wmn_config_available_uom_qty;
    FinalMethods.wmn_config_uom_section_html = UIMethods.wmn_config_uom_section_html || CoreMethods.wmn_config_uom_section_html;
    FinalMethods.wmn_bind_config_uom_section = UIMethods.wmn_bind_config_uom_section || CoreMethods.wmn_bind_config_uom_section;
    FinalMethods.wmn_validate_config_qty = UIMethods.wmn_validate_config_qty || CoreMethods.wmn_validate_config_qty;
    FinalMethods.wmn_choose_uom = UIMethods.wmn_choose_uom || CoreMethods.wmn_choose_uom;
    FinalMethods.wmn_choose_batch_with_uom = UIMethods.wmn_choose_batch_with_uom || CoreMethods.wmn_choose_batch_with_uom;
    FinalMethods.wmn_choose_variant = UIMethods.wmn_choose_variant || CoreMethods.wmn_choose_variant;
    FinalMethods.wmn_handle_item_wrapper_click = UIMethods.wmn_handle_item_wrapper_click || CoreMethods.wmn_handle_item_wrapper_click;
    FinalMethods.wmn_open_ui_settings_dialog = UIMethods.wmn_open_ui_settings_dialog || CoreMethods.wmn_open_ui_settings_dialog;
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.render_item_list = UIMethods.render_item_list || CoreMethods.render_item_list;
    FinalMethods.prepare_dom = UIMethods.prepare_dom || CoreMethods.prepare_dom;
    FinalMethods.updateActiveButton = UIMethods.updateActiveButton || CoreMethods.updateActiveButton;
    FinalMethods.setCardMode = UIMethods.setCardMode || CoreMethods.setCardMode;
    FinalMethods.setButtonMode = UIMethods.setButtonMode || CoreMethods.setButtonMode;
    FinalMethods.applyDisplayMode = UIMethods.applyDisplayMode || CoreMethods.applyDisplayMode;
    FinalMethods.set_connectivity_indicator_state = UIMethods.set_connectivity_indicator_state || CoreMethods.set_connectivity_indicator_state;
    FinalMethods.refresh_pending_invoice_badge = UIMethods.refresh_pending_invoice_badge || CoreMethods.refresh_pending_invoice_badge;
    FinalMethods.install_connectivity_indicator = UIMethods.install_connectivity_indicator || CoreMethods.install_connectivity_indicator;
    FinalMethods.install_category_bar = UIMethods.install_category_bar || CoreMethods.install_category_bar;
    FinalMethods.render_category_bar = UIMethods.render_category_bar || CoreMethods.render_category_bar;
    FinalMethods.handle_broken_image = UIMethods.handle_broken_image || CoreMethods.handle_broken_image;
    FinalMethods.update_active_category_count = UIMethods.update_active_category_count || CoreMethods.update_active_category_count;
    FinalMethods.get_cart_rows = UIMethods.get_cart_rows || CoreMethods.get_cart_rows;
    FinalMethods.get_cart_quantity = UIMethods.get_cart_quantity || CoreMethods.get_cart_quantity;
    FinalMethods.sync_card_quantities = UIMethods.sync_card_quantities || CoreMethods.sync_card_quantities;
    FinalMethods.wmn_refresh_available_stock = UIMethods.wmn_refresh_available_stock || CoreMethods.wmn_refresh_available_stock;
    FinalMethods.resize_selector = UIMethods.resize_selector || CoreMethods.resize_selector;

    const initializeCore = function (...args) {
                

                        // Restore the last selected item display mode after the split-file migration.
                        // This also allows MamsekItemSelector to inherit the same persistent state.
                        this.button_mode = window.WMNPOSUIPreferences?.get?.("default_item_view") === "Button View";

                        if (typeof this.applyDisplayMode === "function") {
                            this.applyDisplayMode();
                        }
            
    };
    const initializeUI = function (args) {
				
        				this.mamsek_settings = args.settings || {};
					this.button_mode = window.WMNPOSUIPreferences?.get?.("default_item_view") === "Button View";
        				this.install_category_bar();
        				this.applyDisplayMode();
        				this.install_connectivity_indicator();
			
    };

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    const styleId = 'wmn-button-mode-styles';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
            

                    .items-container.wmn-button-mode .item-wrapper {
                        cursor: pointer;
                        transition: all 0.2s ease;
                        text-align: center;
                    }

                    .items-container.wmn-button-mode .item-wrapper:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                        border-color: var(--primary-color);
                    }
                

                    .items-container.wmn-button-mode .item-wrapper .item-display,
                    .items-container.wmn-button-mode .item-wrapper .indicator-pill {
                        display: none !important;
                    }
                

                    .items-container.wmn-button-mode .item-wrapper .item-detail .item-rate {
                        display: none;
                    }
    .items-container.wmn-button-mode .item-wrapper {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important; 
        justify-content: center !important;
        text-align: center !important;
    }
    .items-container.wmn-button-mode {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        gap: 1px;
        padding: 2px;
        padding-top: 1px;
        overflow-y: scroll;
        overflow-x: hidden;
        white-space: normal !important;
        font-weight: 600 !important;
        overflow: auto;
        text-overflow: ellipsis;
        max-width: 100%;
        vertical-align: middle;
    }

                    .items-container.wmn-button-mode .item-wrapper .item-name {
                        white-space: normal !important;
                        text-align: center !important;
                        font-weight: 600 !important;
                    }
                

                    .items-container.wmn-button-mode .item-wrapper .flex.items-center {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            }

    ns.OverrideMethods.ItemSelector = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
