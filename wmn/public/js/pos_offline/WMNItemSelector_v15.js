// WMNItemSelector_v15_clean.js
// Clean override: Online = ERPNext original super methods; Offline = cache replacements only.
// Preserved features: item-group buttons, barcode structure, button/card mode, image fallback, printer/offline buttons.

        const OriginalItemSelector = erpnext.PointOfSale.ItemSelector;
        class MyItemSelector extends OriginalItemSelector {
            constructor(...args) {
                super(...args);

                // Restore the last selected item display mode after the split-file migration.
                // This also allows MamsekItemSelector to inherit the same persistent state.
                try {
                    this.button_mode = localStorage.getItem("wmn_pos_button_mode") === "true";
                } catch (e) {
                    this.button_mode = false;
                }

                if (typeof this.applyDisplayMode === "function") {
                    this.applyDisplayMode();
                }
            }

            wmn_is_offline() {
                try {
                    if (typeof wmn_is_pos_offline === "function") {
                        return !!wmn_is_pos_offline();
                    }
                } catch (e) {}

                return !navigator.onLine;
            }

            async wmn_get_cached_pos_settings() {
                try {
                    if (window.wmnPOSOffline && window.wmnPOSOffline.getFullSettings) {
                        return await window.wmnPOSOffline.getFullSettings();
                    }
                } catch (e) {}

                return (window.cur_pos && window.cur_pos.settings) || {};
            }

            async wmn_get_cached_pos_profile() {
                try {
                    if (window.wmnPOSOffline && window.wmnPOSOffline.getPOSProfile) {
                        const profile = await window.wmnPOSOffline.getPOSProfile();
                        if (profile) return profile;
                    }
                } catch (e) {}

                return (window.cur_pos && window.cur_pos.settings) || {};
            }

            async wmn_enrich_item_tracking_meta(item) {
                if (!item || !item.item_code) return item || {};

                const batchValue = item.has_batch_no ?? item.item_data?.has_batch_no;
                const serialValue = item.has_serial_no ?? item.item_data?.has_serial_no;
                const stockUomValue = item.stock_uom ?? item.item_data?.stock_uom;

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
                                };
                            }
                        } else {
                            const response = await frappe.db.get_value(
                                "Item",
                                cacheKey,
                                ["has_batch_no", "has_serial_no", "stock_uom"]
                            );
                            const message = response?.message || {};
                            meta = {
                                has_batch_no: cint(message.has_batch_no || 0),
                                has_serial_no: cint(message.has_serial_no || 0),
                                stock_uom: message.stock_uom || "",
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
                });
            }

            async wmn_get_offline_parent_item_group() {
                const settings = await this.wmn_get_cached_pos_settings();
                const profile = await this.wmn_get_cached_pos_profile();

                return (
                    settings.parent_item_group ||
                    profile.parent_item_group ||
                    this.parent_item_group ||
                    ""
                );
            }

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
            }

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
            }

            wmn_get_awesomplete_value(value) {
                if (!value) return "";
                if (typeof value === "string") return value;
                if (typeof value.value === "string") return value.value;
                if (typeof value.label === "string") return value.label;
                if (value.text) return this.wmn_get_awesomplete_value(value.text);
                return "";
            }

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
            }

            wmn_set_item_group_filter_label(item_group) {
                const value = item_group || "";
                if (super.set_item_selector_filter_label) {
                    return super.set_item_selector_filter_label(value);
                }

                this.$component.find(".filter-section .label").html(value ? __(value) : __("All Items"));
            }

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
                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", new_qty);

                    if (item.batch_no && existing_item.batch_no !== item.batch_no) {
                        await frappe.model.set_value(existing_item.doctype, existing_item.name, "batch_no", item.batch_no);
                    }

                    if (item.serial_no) {
                        const new_serial_no = existing_item.serial_no
                            ? existing_item.serial_no + "\n" + item.serial_no
                            : item.serial_no;
                        await frappe.model.set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                    }

                    if (pos_ctrl?.update_cart_html) pos_ctrl.update_cart_html(existing_item);
                    if (pos_ctrl?.cart?.update_item_html) pos_ctrl.cart.update_item_html(existing_item);
                    return existing_item;
                }

                this.events.item_selected({
                    field: "qty",
                    value: qty_value,
                    item: item,
                });

                return null;
            }

            get_item_html(item) {
        item = item || {};

        if (!item.item_image && item.image) {
            item.item_image = item.image;
        }

        if (!item.item_image && item.thumbnail) {
            item.item_image = item.thumbnail;
        }

        if (!item.item_image && item.website_image) {
            item.item_image = item.website_image;
        }

        return super.get_item_html(item);
    }

            make_search_bar() {
                super.make_search_bar();

                setTimeout(() => {
                    // Online remains 100% ERPNext original. No Link/Awesomplete override here.
                    this.wmn_render_item_group_buttons();
                }, 100);
            }


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
            }

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
            }

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
            }

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
            }

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
            }

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
                        const context = await this.wmn_get_item_selection_context();
                        const prices = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_prices);
                        const allItems = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items);
                        const currentDate = frappe.datetime.get_today();
                        const uomSets = {};

                        (prices || []).forEach(price => {
                            if (context.price_list && price.price_list !== context.price_list) return;
                            if (price.valid_from && String(price.valid_from) > currentDate) return;
                            if (price.valid_upto && String(price.valid_upto) < currentDate) return;
                            if (!price.item_code) return;
                            const uomKey = price.uom || "__stock_uom__";
                            uomSets[price.item_code] = uomSets[price.item_code] || new Set();
                            uomSets[price.item_code].add(uomKey);
                        });

                        rows.forEach(row => {
                            uomCounts[row.item_code] = uomSets[row.item_code] ? uomSets[row.item_code].size : 0;
                        });

                        const relevantTemplateCodes = new Set();
                        rows.forEach(row => {
                            if (row.variant_of) relevantTemplateCodes.add(row.variant_of);
                            if (cint(row.has_variants || 0)) relevantTemplateCodes.add(row.item_code);
                        });

                        const allItemMap = new Map((allItems || []).map(row => [row.item_code || row.name, row]));
                        relevantTemplateCodes.forEach(code => {
                            const template = allItemMap.get(code);
                            if (template) templateMap[code] = template;
                            variantCounts[code] = 0;
                        });

                        for (const variant of (allItems || [])) {
                            const templateCode = variant.variant_of || "";
                            if (!templateCode || !relevantTemplateCodes.has(templateCode)) continue;
                            if (cint(variant.disabled || 0)) continue;
                            if (!cint(variant.is_sales_item === undefined ? 1 : variant.is_sales_item)) continue;
                            variantCounts[templateCode] = cint(variantCounts[templateCode] || 0) + 1;
                        }
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
            }

            wmn_is_direct_search_result(items, search_term, message) {
                if (message && (message.barcode || message.serial_no || message.batch_no)) return true;
                const rows = Array.isArray(items) ? items : [];
                if (!search_term || rows.length !== 1) return false;

                const term = String(search_term || "").trim().toLowerCase();
                const row = rows[0] || {};
                return [row.barcode, row.serial_no, row.batch_no]
                    .filter(Boolean)
                    .some(value => String(value).trim().toLowerCase() === term);
            }

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
                    return wmn_as_frappe_call_like(promise);
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

                return wmn_as_frappe_call_like(promise);
            }

            wmn_as_frappe_call_like(promise) {
            // ERPNext 15.95 ItemSelector.load_items_data may call:
            // this.get_items(...).then(...).always(...)
            // Native Promise has no always(), while frappe.call returns jqXHR-like object.
            const p = Promise.resolve(promise);

            return {
                then(onFulfilled, onRejected) {
                    const next = p.then(onFulfilled, onRejected);
                    return wmn_as_frappe_call_like(next);
                },
                catch(onRejected) {
                    const next = p.catch(onRejected);
                    return wmn_as_frappe_call_like(next);
                },
                finally(onFinally) {
                    const next = p.finally(onFinally);
                    return wmn_as_frappe_call_like(next);
                },
                always(callback) {
                    p.then(
                        (value) => {
                            if (callback) callback(value);
                            return value;
                        },
                        (error) => {
                            if (callback) callback(error);
                            throw error;
                        }
                    );
                    return this;
                },
                done(callback) {
                    p.then((value) => {
                        if (callback) callback(value);
                    });
                    return this;
                },
                fail(callback) {
                    p.catch((error) => {
                        if (callback) callback(error);
                    });
                    return this;
                },
                promise() {
                    return p;
                },
            };
        }

                        async wmn_scan_barcode_structure_offline(searchValue) {
                if (!window.wmnPOSOffline || !searchValue) return null;

                const barcode = String(searchValue || "").trim();
                const structures = await window.wmnPOSOffline.getAll(
                    window.wmnPOSOffline.STORES.barcode_structures
                );

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
                        const barcodeRows = await window.wmnPOSOffline.getAll(
                            window.wmnPOSOffline.STORES.item_barcodes
                        );

                        const foundBarcode = (barcodeRows || []).find(b =>
                            String(b.barcode || "").trim() === String(itemCode).trim()
                        );

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
            }     

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

                                await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                                if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                                }
                                if (data.serial_no) {
                                    let new_serial_no = existing_item.serial_no ? existing_item.serial_no + "\n" + data.serial_no : data.serial_no;
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
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
            }

            
            
            
            
            
            
            
            
            
            
            
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

                const allItems = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.items);
                const variants = (allItems || []).filter(row =>
                    String(row.variant_of || "") === String(templateCode) &&
                    !cint(row.disabled || 0) &&
                    cint(row.is_sales_item === undefined ? 1 : row.is_sales_item)
                );
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
                    const hasBatch = cint(variant.has_batch_no || 0) === 1;
                    const uomOptions = hasBatch ? [] : await this.wmn_get_uom_choices(variant);
                    const preferred =
                        uomOptions.find(row => row.uom === variant.sales_uom) ||
                        uomOptions.find(row => row.uom === variant.stock_uom) ||
                        uomOptions[0] || {
                            uom: variant.sales_uom || variant.stock_uom || variant.uom || "",
                            price_list_rate: 0,
                            currency: context.currency || "",
                            conversion_factor: 1,
                        };
                    const stock = context.warehouse
                        ? await window.wmnPOSOffline.getStock(variant.item_code, context.warehouse)
                        : null;
                    const actualQty = flt(stock?.actual_qty || variant.actual_qty || 0);

                    let selectionDisabled = 0;
                    let selectionReason = "";
                    if (!uomOptions.length && !hasBatch) {
                        selectionDisabled = 1;
                        selectionReason = __("No active price is available in the selected Price List");
                    } else if (hideUnavailable && cint(variant.is_stock_item || 0) && actualQty <= 0) {
                        selectionDisabled = 1;
                        selectionReason = __("Out of stock");
                    }

                    result.push(Object.assign({}, variant, {
                        actual_qty: actualQty,
                        warehouse: context.warehouse || variant.warehouse || "",
                        uom: preferred.uom || variant.stock_uom || "",
                        price_list_rate: flt(preferred.price_list_rate || 0),
                        rate: flt(preferred.price_list_rate || 0),
                        currency: preferred.currency || context.currency || "",
                        conversion_factor: flt(preferred.conversion_factor || 1),
                        uom_options: uomOptions,
                        __wmn_uom_deferred_until_batch: hasBatch ? 1 : 0,
                        __wmn_selection_disabled: selectionDisabled,
                        __wmn_selection_reason: selectionReason,
                    }));
                }
                return result;
            }

            async wmn_get_uom_choices(item) {
                if (!item?.item_code) return [];
                if (Array.isArray(item.uom_options) && item.uom_options.length) {
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

                if (!window.wmnPOSOffline) return [];

                const prices = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.item_prices);
                const conversions = Array.isArray(item.uom_conversions) ? item.uom_conversions : [];
                const conversionMap = {};
                conversions.forEach(row => {
                    if (row?.uom) conversionMap[row.uom] = flt(row.conversion_factor || 1);
                });
                if (item.stock_uom) conversionMap[item.stock_uom] = conversionMap[item.stock_uom] || 1;

                const today = frappe.datetime.get_today();
                const selectedBatch = String(item.batch_no || "").trim();
                const byUom = new Map();

                const dateValue = value => String(value || "").slice(0, 10);
                const isActive = row => {
                    const validFrom = dateValue(row.valid_from);
                    const validUpto = dateValue(row.valid_upto);
                    if (validFrom && validFrom > today) return false;
                    if (validUpto && validUpto < today) return false;
                    return true;
                };
                const rowRank = row => {
                    const rowBatch = String(row.batch_no || "").trim();
                    const batchRank = selectedBatch && rowBatch === selectedBatch ? 2 : 1;
                    return [
                        batchRank,
                        dateValue(row.valid_from) || "0000-00-00",
                        String(row.modified || ""),
                    ];
                };
                const isBetter = (candidateRow, existingRow) => {
                    if (!existingRow) return true;
                    const a = rowRank(candidateRow);
                    const b = rowRank(existingRow);
                    if (a[0] !== b[0]) return a[0] > b[0];
                    if (a[1] !== b[1]) return a[1] > b[1];
                    return a[2] > b[2];
                };

                (prices || []).forEach(row => {
                    if (row.item_code !== item.item_code) return;
                    if (context.price_list && row.price_list !== context.price_list) return;
                    if (row.selling !== undefined && !cint(row.selling || 0)) return;
                    if (!isActive(row)) return;

                    const rowBatch = String(row.batch_no || "").trim();
                    if (selectedBatch) {
                        if (rowBatch && rowBatch !== selectedBatch) return;
                    } else if (rowBatch) {
                        return;
                    }

                    const uom = row.uom || item.stock_uom || item.uom || "";
                    if (!uom) return;

                    const existing = byUom.get(uom);
                    if (!existing || isBetter(row, existing.__wmn_source_row)) {
                        byUom.set(uom, {
                            uom,
                            price_list_rate: flt(row.price_list_rate || 0),
                            currency: row.currency || context.currency || "",
                            conversion_factor: flt(conversionMap[uom] || 1),
                            batch_no: rowBatch,
                            valid_from: row.valid_from || "",
                            valid_upto: row.valid_upto || "",
                            __wmn_source_row: row,
                        });
                    }
                });

                byUom.forEach(value => {
                    delete value.__wmn_source_row;
                });

                if (!byUom.size && (item.uom || item.stock_uom)) {
                    const uom = item.uom || item.stock_uom;
                    byUom.set(uom, {
                        uom,
                        price_list_rate: flt(item.price_list_rate || item.rate || 0),
                        currency: item.currency || context.currency || "",
                        conversion_factor: flt(conversionMap[uom] || 1),
                        batch_no: "",
                    });
                }

                return Array.from(byUom.values());
            }

            wmn_show_choice_dialog({ title, rows, html }) {
                return new Promise(resolve => {
                    const dialog = new frappe.ui.Dialog({
                        title,
                        fields: [{ fieldtype: "HTML", fieldname: "wmn_choices" }],
                    });
                    let settled = false;

                    const finish = value => {
                        if (settled) return;
                        settled = true;
                        dialog.hide();
                        resolve(value);
                    };

                    dialog.fields_dict.wmn_choices.$wrapper.html(html);
                    dialog.$wrapper
                        .off("click.wmnPosChoice", ".wmn-pos-choice-card")
                        .on("click.wmnPosChoice", ".wmn-pos-choice-card", event => {
                            event.preventDefault();
                            const index = cint($(event.currentTarget).attr("data-index") || -1);
                            if (index >= 0 && rows[index] && !cint(rows[index].__wmn_selection_disabled || 0)) {
                                finish(rows[index]);
                            }
                        });
                    dialog.$wrapper.one("hidden.bs.modal.wmnPosChoice", () => {
                        if (!settled) {
                            settled = true;
                            resolve(null);
                        }
                    });
                    dialog.show();
                });
            }

            async wmn_choose_variant(templateItem) {
                const variants = await this.wmn_get_variant_choices(templateItem);
                if (!variants.length) {
                    frappe.show_alert({
                        message: __("No available variants were found for this item."),
                        indicator: "orange",
                    });
                    return null;
                }
                if (variants.length === 1) {
                    if (cint(variants[0].__wmn_selection_disabled || 0)) {
                        frappe.show_alert({
                            message: variants[0].__wmn_selection_reason || __("This variant is not available for sale."),
                            indicator: "orange",
                        });
                        return null;
                    }
                    return variants[0];
                }

                const context = await this.wmn_get_item_selection_context();
                const html = `<div class="wmn-pos-choice-list wmn-variant-choice-list">
                    ${variants.map((variant, index) => {
                        const attrs = (variant.variant_attributes || [])
                            .map(row => `<span>${frappe.utils.escape_html(row.attribute || "")}: <strong>${frappe.utils.escape_html(row.attribute_value || "")}</strong></span>`)
                            .join("");
                        const price = format_currency(
                            flt(variant.price_list_rate || variant.rate || 0),
                            variant.currency || context.currency || ""
                        );
                        const stock = cint(variant.is_stock_item || 0)
                            ? `<span class="wmn-choice-stock">${__("Stock")}: ${flt(variant.actual_qty || 0)}</span>`
                            : "";
                        const disabled = cint(variant.__wmn_selection_disabled || 0);
                        const reason = variant.__wmn_selection_reason
                            ? `<span class="wmn-choice-unavailable">${frappe.utils.escape_html(variant.__wmn_selection_reason)}</span>`
                            : "";
                        return `<button type="button" class="wmn-pos-choice-card${disabled ? " is-disabled" : ""}" data-index="${index}" ${disabled ? "disabled" : ""}>
                            <span class="wmn-choice-title">${frappe.utils.escape_html(variant.item_name || variant.item_code)}</span>
                            <span class="wmn-choice-code">${frappe.utils.escape_html(variant.item_code || "")}</span>
                            ${attrs ? `<span class="wmn-choice-attributes">${attrs}</span>` : ""}
                            ${reason}
                            <span class="wmn-choice-footer"><strong>${price}</strong>${stock}</span>
                        </button>`;
                    }).join("")}
                </div>`;

                return this.wmn_show_choice_dialog({
                    title: __("Select Variant"),
                    rows: variants,
                    html,
                });
            }

            async wmn_choose_uom(item) {
                if (!item) return null;
                if (item.__wmn_skip_uom_dialog) return item;

                const options = await this.wmn_get_uom_choices(item);
                if (!options.length) {
                    if (cint(item.has_batch_no || 0) && item.batch_no) {
                        frappe.show_alert({
                            message: __("No active price is available for the selected batch."),
                            indicator: "orange",
                        });
                        return null;
                    }
                    return item;
                }

                const applyOption = option => Object.assign({}, item, {
                    uom: option.uom || item.uom || item.stock_uom || "",
                    price_list_rate: flt(option.price_list_rate || 0),
                    rate: flt(option.price_list_rate || 0),
                    currency: option.currency || item.currency || "",
                    conversion_factor: flt(option.conversion_factor || 1),
                    __wmn_uom_selected: 1,
                });

                if (options.length === 1) return applyOption(options[0]);

                const context = await this.wmn_get_item_selection_context();
                const html = `<div class="wmn-pos-choice-list wmn-uom-choice-list">
                    ${options.map((option, index) => {
                        const conversion = flt(option.conversion_factor || 1);
                        const conversionText = item.stock_uom && option.uom !== item.stock_uom
                            ? `<span class="wmn-choice-conversion">1 ${frappe.utils.escape_html(option.uom)} = ${conversion} ${frappe.utils.escape_html(item.stock_uom)}</span>`
                            : `<span class="wmn-choice-conversion">${__("Stock UOM")}: ${frappe.utils.escape_html(item.stock_uom || option.uom || "")}</span>`;
                        return `<button type="button" class="wmn-pos-choice-card" data-index="${index}">
                            <span class="wmn-choice-title">${frappe.utils.escape_html(option.uom || "")}</span>
                            ${conversionText}
                            <span class="wmn-choice-footer"><strong>${format_currency(flt(option.price_list_rate || 0), option.currency || context.currency || "")}</strong></span>
                        </button>`;
                    }).join("")}
                </div>`;

                const selected = await this.wmn_show_choice_dialog({
                    title: __("Select UOM"),
                    rows: options,
                    html,
                });
                return selected ? applyOption(selected) : null;
            }

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
                }

                selectedItem = await this.wmn_enrich_item_tracking_meta(selectedItem);

                const hasBatch = cint(selectedItem.has_batch_no || 0) === 1;

                if (hasBatch && !selectedItem.batch_no) {
                    selectedItem = Object.assign({}, selectedItem, {
                        __wmn_defer_uom_until_batch: 1,
                        __wmn_skip_item_details_for_batch_flow: 1,
                    });
                } else {
                    selectedItem = await this.wmn_choose_uom(selectedItem);
                    if (!selectedItem) return;
                }

                this.events.item_selected({
                    field: "qty",
                    value: "+1",
                    item: selectedItem,
                });

                if (this.search_field && typeof this.search_field.set_focus === "function") {
                    this.search_field.set_focus();
                }
            }

            bind_events() {
                super.bind_events();
                this.$component.off("click", ".item-wrapper");
                this.$component
                    .off("click.wmnItemSelection", ".item-wrapper")
                    .on("click.wmnItemSelection", ".item-wrapper", event => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.wmn_handle_item_wrapper_click($(event.currentTarget)).catch(error => {
                            console.error("WMN item selection failed", error);
                            frappe.show_alert({
                                message: error?.message || __("Unable to select item."),
                                indicator: "red",
                            });
                        });
                    });
            }

            render_item_list(items) {
                super.render_item_list(items);

                if (this.button_mode) {
                    this.$items_container.addClass('wmn-button-mode');
                } else {
                    this.$items_container.removeClass('wmn-button-mode');
                }
            }
            
            prepare_dom() {
                super.prepare_dom();
                
                
               const $toggleContainer = $(`
                    <div class="wmn-view-toggle-container" style="padding: 2px 3px; border-bottom: 1px solid var(--border-color); background: var(--bg-color); display: flex; justify-content: flex-end;">
                        <div class="wmn-toggle-group">
                            <button class="wmn-grid-view-btn btn" title="Grid View" aria-label="Switch to grid view">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                                    <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                                    <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                                </svg>
                                <span>G</span>
                            </button>
                            <button class="wmn-list-view-btn btn" title="Button View" aria-label="Switch to list view">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="5" width="18" height="6" rx="1"></rect>
                                    <rect x="3" y="13" width="18" height="6" rx="1"></rect>
                                </svg>
                                <span>B</span>
                            </button>
                            <button class="btn wmn-list-offline-btn">
                                ${wmn_t("Offline Sync", "\u0645\u0632\u0627\u0645\u0646\u0629")}
                            </button>
                            <button class="btn wmn-printer-btn">
                                ${wmn_t("Printer", "الطابعة")}
                            </button>
                            
                        </div>
                    </div>
                `); 
                
                
                const $toggleContainer1 = $(`
                    <div class="wmn-view-toggle-container" style="padding: 8px 12px; border-bottom: 1px solid var(--border-color); background: var(--bg-color); display: flex; justify-content: flex-end;">
                        <div class="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
                            <button class="wmn-grid-view-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Grid View" aria-label="Switch to grid view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                                </svg>
                            </button>
                            <button class="wmn-list-view-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Button View" aria-label="Switch to list view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>
                            <button class="wmn-list-offline-btn p-1.5 sm:p-2 rounded transition-all duration-75 touch-manipulation" title="Button View" aria-label="Switch to list view">
                                <svg class="w-4 h-4 sm:w-4.5 sm:h-4.5" fill="none" stroke="currentColor" viewBox="0 0 50 50">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `);
             
                this.$component.prepend($toggleContainer);
                this.$offlineBtn = $toggleContainer.find('.wmn-list-offline-btn');
                this.$gridBtn = $toggleContainer.find('.wmn-grid-view-btn');
                this.$listBtn = $toggleContainer.find('.wmn-list-view-btn');
                this.$printerBtn = $toggleContainer.find('.wmn-printer-btn');
                this.updateActiveButton();
                this.$printerBtn.on('click', () => wmn_show_printer_settings_dialog());
                this.$offlineBtn.on('click', () => window.wmnPOSOffline.openInvoiceManagerDialog());
                this.$gridBtn.on('click', () => this.setCardMode());
                this.$listBtn.on('click', () => this.setButtonMode());
                
                if (this.button_mode) {
                    this.setButtonMode();
                } else {
                    this.setCardMode();
                }
            }
            
            
            updateActiveButton() {
                if (this.button_mode) {
                    this.$listBtn.addClass('bg-white shadow-sm');
                    this.$listBtn.removeClass('hover:bg-gray-200');
                    this.$gridBtn.removeClass('bg-white shadow-sm');
                    this.$gridBtn.addClass('hover:bg-gray-200');
                } else {
                    this.$gridBtn.addClass('bg-white shadow-sm');
                    this.$gridBtn.removeClass('hover:bg-gray-200');
                    this.$listBtn.removeClass('bg-white shadow-sm');
                    this.$listBtn.addClass('hover:bg-gray-200');
                }
            }
            
            setCardMode() {
                if (!this.button_mode) return;
                this.button_mode = false;
                localStorage.setItem('wmn_pos_button_mode', 'false');
                this.updateActiveButton();
                this.applyDisplayMode();
            }
            
            setButtonMode() {
                if (this.button_mode) return;
                this.button_mode = true;
                localStorage.setItem('wmn_pos_button_mode', 'true');
                this.updateActiveButton();
                this.applyDisplayMode();
            }
            
            applyDisplayMode() {
                if (this.button_mode) {
                    this.$items_container.addClass('wmn-button-mode');
                } else {
                    this.$items_container.removeClass('wmn-button-mode');
                }
            }
            
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
        
   
        erpnext.PointOfSale.ItemSelector = MyItemSelector;
        
        
        
        
        // Assigning the new class back to the namespace
        erpnext.PointOfSale.ItemSelector = MyItemSelector;
