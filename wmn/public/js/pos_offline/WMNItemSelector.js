        const OriginalItemSelector = erpnext.PointOfSale.ItemSelector;
        class MyItemSelector extends OriginalItemSelector {
            constructor(wrapper, args) {
                super(wrapper, args);
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

                    this.$component.find(".filter-section").append(html);

                    this.$component.on("click", ".wmn-item-group-btn", async (e) => {
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

        if (this.item_group_field && this.item_group_field.set_value) {
            await this.item_group_field.set_value(item_group);
            return;
        }

        if (this.item_group_field && this.item_group_field.$input) {
            this.item_group_field.$input.val(item_group).trigger("input").trigger("change");
            return;
        }

        // Fallback only if the original field control is not available.
        this.item_group = item_group || this.parent_item_group;
        this.filter_items();
        this.set_item_selector_filter_label(item_group);
    } catch (e) {
        console.warn("WMN item group button apply failed", e);
    }
}





            get_items({ start = 0, page_length = 40, search_term = "" } = {}) {
                if (wmn_is_pos_offline() && window.wmnPOSOffline) {
                    const promise = window.wmnPOSOffline
                        .searchItems({
                            start,
                            page_length,
                            search_term,
                            price_list: this.price_list,
                            item_group: this.item_group,
                        })
                        .then((items) => ({
                            message: {
                                items: items || [],
                            },
                        }));

                    return wmn_as_frappe_call_like(promise);
                }

                // Online must return ERPNext original frappe.call/jqXHR object,
                // so load_items_data can safely call .then(...).always(...).
                return super.get_items({ start, page_length, search_term });
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
                        uom
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


                if (!navigator.onLine && window.wmnPOSOffline) {
                    return this.wmn_scan_barcode_structure_offline(search_term).then((structured_item) => {
                        if (structured_item && structured_item.item_code && search_term && search_term.length >= 12) {
                            this.events.item_selected({
                                field: "qty",
                                value: structured_item.qty || 1,
                                item: structured_item,
                            });

                            this.set_search_value("");
                            frappe.utils.play_sound("submit");
                            return;
                        }

                        return this.get_items({ search_term }).then(({ message }) => {
                            const items = (message && message.items) || [];

                            if (items.length === 1 && search_term && search_term.length >= 8) {
                                this.events.item_selected({
                                    field: "qty",
                                    value: items[0].qty || 1,
                                    item: items[0],
                                });

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
                    } else if (pos_ctrl.settings && pos_ctrl.settings) {
                        pos_profile_name = pos_ctrl.settings;
                    } else if (pos_ctrl.frm?.doc?.pos_profile) {
                        pos_profile_name = pos_ctrl.frm.doc.pos_profile;
                    }
                    
                    
                    return frappe.call({
                        method: "wmn.barcode_handler.custom_scan_barcode_pos",
                        args: { 
                            search_value: search_term,
                            //pos_profile: this.pos_profile || this.events.get_frm().doc.pos_profile,
        price_list: this.price_list || this.events.get_frm().doc.selling_price_list,

                            pos_profile: pos_profile_name
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
