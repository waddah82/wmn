/* Controller override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.Controller;
    const MamsekUI = ns.UI.Mamsek;
    const ACTIVE_BODY_CLASS = MamsekUI.ACTIVE_BODY_CLASS;
    const icon = MamsekUI.icon;
    const escape_html = MamsekUI.escape_html;
    const category_emoji = MamsekUI.category_emoji;
    const read_item_data = MamsekUI.read_item_data;
    const parse_quantity = MamsekUI.parse_quantity;

    /*
     * WMN POS Controller for ERPNext v15.
     * Online paths delegate to ERPNext behavior; offline paths use WMN cache/services.
     * Coupon, promotion, supervisor and cash-movement features are integrated as controller methods.
     */
            function wmn_prepare_pos_frm_doc(ctrl) {
                if (!ctrl || !ctrl.frm || !ctrl.frm.doc) return;

                const doc = ctrl.frm.doc;
                const settings = ctrl.settings || {};
                const invoiceDoctype = wmn_pos_invoice_doctype(ctrl);

                doc.items = doc.items || [];
                doc.is_pos = 1;
                doc.ignore_pricing_rule = 1;
                doc.coupon_code = "";
                doc.update_stock = doc.update_stock === undefined ? 1 : doc.update_stock;
                doc.pos_profile = doc.pos_profile || settings.pos_profile || ctrl.pos_profile || "";
                doc.set_warehouse = doc.set_warehouse || settings.warehouse || "";
                doc.selling_price_list = doc.selling_price_list || settings.selling_price_list || "";
                doc.customer = doc.customer || settings.customer || "";
                doc.doctype = doc.doctype || invoiceDoctype;

                const invoiceBarcode = ns.Services?.Barcode?.InvoiceBarcode;
                if (invoiceBarcode?.ensureInvoiceUID) {
                    invoiceBarcode.ensureInvoiceUID(doc);
                }

                const itemDoctype = wmn_pos_item_doctype(doc.doctype);
                wmn_ensure_pos_cart_items_data(doc);
                doc.items.forEach((row) => {
                    if (!row) return;
                    row.doctype = row.doctype || itemDoctype;
                    row.parenttype = doc.doctype;
                    row.parentfield = "items";
                    row.parent = doc.name;
                    wmn_ensure_pos_cart_item_data(row);
                });

                window.cur_pos = ctrl;
                window.cur_frm = ctrl.frm;
            }


            function wmn_pos_allows_negative_stock(item, ctrl) {
                const source = item || {};
                const itemData = source.item_data || {};
                const controller = ctrl || window.cur_pos || null;
                const globalAllow = cint(controller && controller.allow_negative_stock || 0) === 1;
                const itemAllow = cint(source.allow_negative_stock ?? itemData.allow_negative_stock ?? 0) === 1;
                return globalAllow || itemAllow;
            }


            function wmn_collect_doc_serials(doc) {
                const serials = [];
                (doc?.items || []).forEach((row) => {
                    String(row?.serial_no || "")
                        .replace(/,/g, "\n")
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .forEach((serialNo) => serials.push(serialNo));
                });
                return Array.from(new Set(serials));
            }




            /*
             * Online POS is intentionally left native.
             * No item click interception, no online batch dialog, no online cart mutation here.
             * Offline item handling is done only inside MyPOSController.wmn_offline_on_cart_update().
             */

            function wmn_safe_offline_cart_reload(pos) {
                if (!pos || !pos.cart || !pos.cart.load_invoice) {
                    return;
                }

                try {
                    window.__wmn_loading_offline_cart_ui = true;

                    pos.cart.load_invoice();

                    if (pos.cart.$numpad_section) {
                        pos.cart.$numpad_section.css("display", "");
                    }

                    if (pos.cart.$totals_section) {
                        pos.cart.$totals_section.css("display", "flex");
                    }

                    if (pos.cart.$component) {
                        pos.cart.$component.find(".numpad-section").css("display", "");
                        pos.cart.$component.find(".number-pad").css("display", "");
                        pos.cart.$component.find(".cart-item").css("pointer-events", "auto");
                        pos.cart.$component.find(".cart-items, .cart-item-wrapper").css("pointer-events", "auto");
                    }
                } catch (e) {
                    console.warn("WMN offline cart UI reload skipped", e);
                } finally {
                    window.__wmn_loading_offline_cart_ui = false;
                }
            }
            function wmn_get_online_batch_effective_rate(batch, item) {
                batch = batch || {};
                item = item || {};
                const itemData = item.item_data || {};

                return flt(
                    batch.price_list_rate ||
                    batch.rate ||
                    item.price_list_rate ||
                    item.rate ||
                    itemData.price_list_rate ||
                    itemData.rate ||
                    item.standard_rate ||
                    item.valuation_rate ||
                    0
                );
            }

            async function wmn_show_online_batch_selection_dialog(item, warehouse = "", price_list = "") {
                //if (!wmn_can_use_online_batch_dialog()) return null;

                const r = await frappe.call({
                    method: "wmn.api.get_pos_item_batches",
                    args: {
                        item_code: item.item_code,
                        warehouse: warehouse || "",
                        price_list: price_list || "",
                        uom: "",
                    },
                    freeze: false,
                });

                const rows = (r && r.message) || [];
                if (!rows.length) return null;

                return new Promise((resolve) => {
                    const dialog = new frappe.ui.Dialog({
                        title: __("Select Batch No and Quantity"),
                        size: "large",
                        fields: [
                            {
                                fieldtype: "HTML",
                                fieldname: "batch_html",
                                options: `
                                    <div style="max-height:55vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${__("Batch No")}</th>
                                                    <th>${__("Available Qty")}</th>
                                                    <th>${__("Rate")}</th>
                                                    <th>${__("Expiry Date")}</th>
                                                    <th style="width:130px;">${__("Qty")}</th>
                                                    <th style="width:110px;">${__("Action")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${rows.map((b, idx) => {
                                                    const availableQty = flt(b.actual_qty || 0);
                                                    const defaultQty = flt(item.qty || 1) || 1;
                                                    const rate = wmn_get_online_batch_effective_rate(b, item);
                                                    const currency = b.currency || item.currency || frappe.defaults.get_default("currency") || "YER";

                                                    return `
                                                        <tr>
                                                            <td style="font-weight:700;">${frappe.utils.escape_html(b.batch_no || "")}</td>
                                                            <td>${availableQty}</td>
                                                            <td>${format_currency(rate, currency)}</td>
                                                            <td>${frappe.utils.escape_html(b.expiry_date || "")}</td>
                                                            <td>
                                                                <input type="number"
                                                                    class="form-control input-xs wmn-online-batch-qty"
                                                                    data-idx="${idx}"
                                                                    min="0.001"
                                                                    step="0.001"
                                                                    value="${defaultQty}">
                                                            </td>
                                                            <td>
                                                                <button type="button"
                                                                    class="btn btn-xs btn-primary wmn-select-online-batch"
                                                                    data-idx="${idx}">
                                                                    ${__("Select")}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    `;
                                                }).join("")}
                                            </tbody>
                                        </table>
                                    </div>
                                `,
                            },
                        ],
                        secondary_action_label: __("Cancel"),
                        secondary_action: () => {
                            document.activeElement && document.activeElement.blur();
                            dialog.hide();
                            resolve(null);
                        },
                    });

                    dialog.$wrapper.addClass("wmn-pos-app-dialog wmn-pos-batch-legacy-dialog");
                    dialog.show();

                    dialog.$wrapper.on("click", ".wmn-select-online-batch", function () {
                        const idx = cint($(this).attr("data-idx"));
                        const selected = rows[idx];

                        if (!selected) {
                            document.activeElement && document.activeElement.blur();
                            dialog.hide();
                            resolve(null);
                            return;
                        }

                        const qty = flt(dialog.$wrapper.find(`.wmn-online-batch-qty[data-idx="${idx}"]`).val());

                        if (qty <= 0) {
                            frappe.show_alert({ message: __("Quantity must be greater than zero"), indicator: "orange" });
                            return;
                        }

                        if (!wmn_pos_allows_negative_stock(item) && qty > flt(selected.actual_qty || 0)) {
                            frappe.show_alert({ message: __("Quantity cannot exceed available batch quantity"), indicator: "orange" });
                            return;
                        }

                        const effectiveRate = wmn_get_online_batch_effective_rate(selected, item);
                        if (effectiveRate <= 0) {
                            frappe.show_alert({
                                message: __("Price is not set for the item."),
                                indicator: "orange"
                            });
                            frappe.utils.play_sound && frappe.utils.play_sound("error");
                            return;
                        }

                        selected.price_list_rate = effectiveRate;
                        selected.rate = effectiveRate;
                        selected.__selected_qty = qty;
                        document.activeElement && document.activeElement.blur();
                        dialog.hide();
                        resolve(selected);
                    });
                });
            }

    const CoreMethods = {
        __proto__: Base.prototype,

        init_item_details() {
                    this.item_details = new erpnext.PointOfSale.ItemDetails({
                        wrapper: this.$components_wrapper,
                        settings: this.settings,
                        events: {
                            get_frm: () => this.frm,
                            toggle_item_selector: (minimize) => this.wmn_handle_item_details_visibility(minimize),
                            form_updated: (item, field, value) => {
                                const item_row = typeof wmn_pos_get_doc === "function"
                                    ? wmn_pos_get_doc(item.doctype, item.name)
                                    : frappe.model.get_doc(item.doctype, item.name);
                                if (item_row && item_row[field] != value) {
                                    const args = {
                                        field,
                                        value,
                                        item: this.item_details.current_item,
                                    };
                                    return this.on_cart_update(args);
                                }
                                return Promise.resolve();
                            },
                            highlight_cart_item: (item) => {
                                const cart_item = this.cart.get_cart_item(item);
                                this.cart.toggle_item_highlight(cart_item);
                            },
                            item_field_focused: (fieldname) => {
                                this.cart.toggle_numpad_field_edit(fieldname);
                            },
                            set_value_in_current_cart_item: (selector, value) => {
                                this.cart.update_selector_value_in_cart_item(
                                    selector,
                                    value,
                                    this.item_details.current_item
                                );
                            },
                            clone_new_batch_item_in_frm: (batch_serial_map, item) => {
                                Object.keys(batch_serial_map).forEach((batch) => {
                                    const item_to_clone = this.frm.doc.items.find((i) => i.name == item.name);
                                    const new_row = this.frm.add_child("items", { ...item_to_clone });
                                    new_row.batch_no = batch;
                                    new_row.serial_no = batch_serial_map[batch].join(`\n`);
                                    new_row.qty = batch_serial_map[batch].length;
                                    this.frm.doc.items.forEach((row) => {
                                        if (item.item_code === row.item_code) this.update_cart_html(row);
                                    });
                                });
                            },
                            remove_item_from_cart: () => this.remove_item_from_cart(),
                            get_item_stock_map: () => {
                                this.wmn_ensure_item_stock_map_for_cart_rows();
                                this.item_stock_map = this.item_stock_map || {};
                                if (this.item_details) this.item_details.item_stock_map = this.item_stock_map;
                                return this.item_stock_map;
                            },
                            close_item_details: () => {
                                this.item_details.toggle_item_details_section(null);
                                this.cart.prev_action = null;
                                this.cart.toggle_item_highlight();
                            },
                            get_available_stock: (item_code, warehouse) => this.get_available_stock(item_code, warehouse),
                        },
                    });

                    this.wmn_sync_item_stock_map();
                },

        wmn_handle_item_details_visibility(show_details) {
                    try {
                        // Item Details is a dialog in the WMN layout; keep the selector width stable.
                        this.item_selector?.resize_selector(false);
                    } catch (e) {}

                    if (this.cart && typeof this.cart.toggle_numpad === "function") {
                        this.cart.toggle_numpad(Boolean(show_details));
                    }

                    this.wmn_set_item_details_modal_open(Boolean(show_details));
                },

        init_item_cart() {
                    this.cart = new erpnext.PointOfSale.ItemCart({
                        wrapper: this.$components_wrapper,
                        settings: this.settings,
                        events: {
                            get_frm: () => this.frm,
                            cart_item_clicked: (item) => {
                                const item_row = this.get_item_from_frm ? this.get_item_from_frm(item) : item;
                                this.wmn_ensure_item_stock_map_for_cart_rows();
                                this.wmn_ensure_item_stock_map_for_item_details(item_row);
                                this.wmn_sync_item_stock_map();
                                this.item_details.toggle_item_details_section(item_row);
                            },
                            numpad_event: (value, action) => this.update_item_field(value, action),
                            checkout: () => this.save_and_checkout(),
                            edit_cart: () => this.payment.edit_cart(),
                            clear_cart: () => this.wmn_clear_cart(),
                            customer_details_updated: async (details) => {
                                this.item_selector.load_items_data();
                                this.customer_details = details;
                                this.payment.render_loyalty_points_payment_mode();
                                if (details && details.customer_group && this.frm?.doc) {
                                    this.frm.doc.customer_group = details.customer_group;
                                }
                                await this.cart?.wmn_warn_if_customer_previously_purchased?.(this.frm?.doc?.customer);
                                await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });
                            },
                        },
                    });
                    this.wmn_setup_adaptive_cart_ui();
                    return this.cart;
                },

        wmn_sync_item_stock_map() {
                    this.item_stock_map = this.item_stock_map || {};
                    if (this.item_details) this.item_details.item_stock_map = this.item_stock_map;
                },

        wmn_cache() {
                        if (!this.__wmn_controller_cache) {
                            this.__wmn_controller_cache = new window.WMNPOSControllerCache(this, this.__wmn_pos_version || "");
                        }
                        return this.__wmn_controller_cache;
                    },

        wmn_is_offline() {
                        if (typeof wmn_controller_uses_offline_flow === "function") {
                            return !!wmn_controller_uses_offline_flow(this);
                        }
                        return this.wmn_cache().isOffline();
                    },

        fetch_opening_entry() {
                        if (!this.wmn_is_offline()) return super.fetch_opening_entry();
                        return this.wmn_cache().fetchOpeningEntryCallLike();
                    },

        check_opening_entry() {
                        if (!this.wmn_is_offline()) return super.check_opening_entry();
                        return this.fetch_opening_entry().then((r) => {
                            if (r.message && r.message.length) {
                                return this.prepare_app_defaults(r.message[0]);
                            }
                            frappe.show_alert({
                                message: __("No cached POS Opening Entry found. Open POS once while online first."),
                                indicator: "orange",
                            });
                            return null;
                        });
                    },

        create_opening_voucher() {
                        if (!this.wmn_is_offline()) return super.create_opening_voucher();
                        frappe.show_alert({
                            message: __("Cannot create POS Opening Entry while offline. Use a cached opening entry."),
                            indicator: "red",
                        });
                        return Promise.resolve();
                    },

        async prepare_app_defaults(data) {
                        if (!this.wmn_is_offline()) {
                            if (window.WMNPOSSupervisor?.bootstrap) {
                                await window.WMNPOSSupervisor.bootstrap(this, data?.pos_profile || this.pos_profile || "");
                            }
                            return await super.prepare_app_defaults(data);
                        }

                        this.pos_opening = data.name;
                        this.company = data.company;
                        this.pos_profile = data.pos_profile;
                        this.pos_opening_time = data.period_start_date || data.creation || frappe.datetime.now_datetime();
                        this.item_stock_map = this.item_stock_map || {};
                        this.settings = wmn_safe_settings(this.settings || {});

                        const stockSettings = await this.wmn_cache().getStockSettings();
                        this.allow_negative_stock = stockSettings.allow_negative_stock || 0;

                        const profile = await this.wmn_cache().getPOSProfileData(this.pos_profile);
                        Object.assign(this.settings, profile || {});
                        this.settings.customer_groups = (this.settings.customer_groups || []).map((group) => group.name || group);

                        if (window.WMNPOSSupervisor?.bootstrap) {
                            await window.WMNPOSSupervisor.bootstrap(this, this.pos_profile || this.settings.pos_profile || "");
                        }
                
                        //const { message } = await this.wmn_cache().getStockSettingsValue("allow_negative_stock");

                        //this.allow_negative_stock = cint(message?.allow_negative_stock || 0) === 1;
                        return this.make_app();
                    },

        wmn_start_offline_preload() {
                        if (this.__wmn_preload_started) return;
                        this.__wmn_preload_started = true;

                        const try_preload = () => {
                            if (wmn_is_pos_offline()) return true;
                            if (window.wmnPOSOffline && this.settings && this.settings.pos_profile) {
                                window.wmnPOSOffline.preload(this, false);
                                return true;
                            }
                            return false;
                        };

                        if (try_preload()) return;

                        let attempts = 0;
                        const retry = () => {
                            attempts += 1;
                            if (try_preload() || attempts >= 3) return;
                            setTimeout(retry, 1000);
                        };
                        setTimeout(retry, 1000);
                    },

        get_item_from_frm(item) {
                        if (!wmn_controller_uses_offline_flow(this)) {
                            const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                            const rows = doc && Array.isArray(doc.items) ? doc.items : [];

                            if (item && item.__wmn_uom_selected && item.item_code && rows.length) {
                                const itemCode = String(item.item_code || "");
                                const selectedUom = String(item.uom || item.stock_uom || "");
                                const selectedBatch = String(item.batch_no || "");
                                const selectedRate = flt(item.price_list_rate || item.rate || 0);

                                const candidates = rows.filter(row => {
                                    if (!row || String(row.item_code || "") !== itemCode) return false;
                                    if (cint(row.is_free_item || 0) !== cint(item.is_free_item || 0)) return false;
                                    if (selectedUom && String(row.uom || row.stock_uom || "") !== selectedUom) return false;
                                    if (String(row.batch_no || "") !== selectedBatch) return false;
                                    return flt(row.qty || 0) > 0;
                                });

                                if (candidates.length) {
                                    const exactRate = candidates.find(row =>
                                        flt(row.price_list_rate || row.rate || 0) === selectedRate
                                    );
                                    return exactRate || candidates[0];
                                }

                                const fallbackItem = Object.assign({}, item);
                                delete fallbackItem.name;
                                return super.get_item_from_frm(fallbackItem);
                            }

                            const found = super.get_item_from_frm(item);
                            if (found && cint(found.is_free_item || 0) !== cint(item?.is_free_item || 0)) {
                                return rows.find((row) =>
                                    row &&
                                    String(row.item_code || "") === String(item?.item_code || "") &&
                                    cint(row.is_free_item || 0) === cint(item?.is_free_item || 0)
                                ) || {};
                            }
                            return found;
                        }

                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        const rows = doc && Array.isArray(doc.items) ? doc.items : [];
                        if (!item || !rows.length) return null;

                        if (item.name) {
                            const byName = rows.find(row => row && row.name == item.name);
                            if (byName) return byName;
                        }

                        if (item.item_code) {
                            const itemCode = String(item.item_code || "");
                            const batchNo = String(item.batch_no || "");
                            const serialNo = String(item.serial_no || "");
                            const uom = String(item.uom || item.stock_uom || "");
                            const warehouse = String(item.warehouse || "");

                            return rows.find(row => {
                                if (!row || String(row.item_code || "") !== itemCode) return false;
                                if (cint(row.is_free_item || 0) !== cint(item.is_free_item || 0)) return false;
                                if (batchNo && String(row.batch_no || "") !== batchNo) return false;
                                if (serialNo && String(row.serial_no || "") !== serialNo) return false;
                                if (uom && String(row.uom || row.stock_uom || "") !== uom) return false;
                                if (warehouse && String(row.warehouse || "") !== warehouse) return false;
                                return true;
                            }) || null;
                        }

                        return null;
                    },

        update_cart_html(item, remove_item) {
                    if (wmn_controller_uses_offline_flow(this) && this.frm && this.frm.doc) {
                        const warehouse = this.frm.doc.set_warehouse || (this.settings && this.settings.warehouse) || "";
                        wmn_normalize_all_offline_cart_rows(this.frm.doc, warehouse);

                        if (item && item.item_code) {
                            item = wmn_normalize_offline_cart_row(
                                item,
                                this.frm.doc,
                                (this.frm.doc.items || []).indexOf(item),
                                warehouse
                            );
                            this.wmn_register_offline_row_in_frappe_model(item);
                        }
                    }

                    const result = super.update_cart_html(item, remove_item);
                    if (!this.__wmn_bulk_cart_mutation) {
                        this.item_selector?.sync_card_quantities();
                    }
                    return result;
                },

        async wmn_restore_default_customer_for_new_transaction() {
                        const doc = this.frm?.doc;
                        const defaultCustomer = String(this.settings?.customer || "").trim();
                        if (!doc || !defaultCustomer) return;

                        if (this.cart) this.cart.__wmn_previous_purchase_warning_key = "";
                        if (String(doc.customer || "").trim() === defaultCustomer) return;

                        if (!wmn_controller_uses_offline_flow(this) && this.frm?.set_value) {
                            await this.frm.set_value("customer", defaultCustomer);
                            return;
                        }

                        doc.customer = defaultCustomer;
                        doc.customer_name = defaultCustomer;
                        if (this.cart?.fetch_customer_details) {
                            await this.cart.fetch_customer_details(defaultCustomer);
                            this.customer_details = this.cart.customer_info || {};
                            if (this.customer_details?.customer_group) {
                                doc.customer_group = this.customer_details.customer_group;
                            }
                            this.cart.update_customer_section?.();
                        }
                        this.frm?.dirty?.();
                    },

        async make_new_invoice() {
                        this.__wmn_return_against_credit = false;
                        this.__wmn_cashier_resume = false;
                        if (window.__wmn_pos_effective_offline !== true) {
                            await wmn_bootstrap_detect_effective_offline();
                        }

                        const force_online_new_order =
                            this.__wmn_new_order_online === true &&
                            navigator.onLine === true &&
                            !wmn_is_pos_offline();

                        if (force_online_new_order) {
                            window.__wmn_pos_effective_offline = false;
                            this.__wmn_new_order_online = false;
                        }

                        if (!force_online_new_order && wmn_is_pos_offline()) {

                            const doc = await wmn_make_offline_invoice_doc(this);
                            this.frm = wmn_make_offline_frm(doc);

                            wmn_prepare_pos_frm_doc(this);
                            await this.wmn_restore_default_customer_for_new_transaction();

                            window.cur_frm = this.frm;
                            window.cur_pos = this;

                            try {
                                if (this.cart && this.cart.$component) {
                                    this.cart.$component.find(".cart-items, .cart-item-wrapper, .cart-item").empty();
                                }
                                if (this.cart && this.cart.$cart_items_wrapper) {
                                    this.cart.$cart_items_wrapper.html("");
                                }
                                if (this.cart && this.cart.toggle_component) {
                                    this.cart.toggle_component(true);
                                }
                                wmn_safe_offline_cart_reload(this);

                                if (this.order_summary && this.order_summary.toggle_component) {
                                    this.order_summary.toggle_component(false);
                                }
                            } catch (e) {
                                console.warn("WMN offline cart UI reset skipped", e);
                            }

                            // Never call this.cart.load_invoice() offline.
                            // Never call make_sales_invoice_frm() offline.
                            // Both execute DocType/Form scripts and online server methods.

                            if (this.item_selector && this.item_selector.load_items_data) {
                                try {
                                    await this.item_selector.load_items_data();
                                } catch (e) {
                                    console.warn("WMN offline item selector reload skipped", e);
                                }
                            }

                            if (this.wmn_refresh_sell_on_credit_button) {
                                await this.wmn_refresh_sell_on_credit_button();
                            }
                            this.wmn_refresh_coupon_ui();
                            this.item_selector?.sync_card_quantities();

                            return this.frm;
                        }

                        const result = await super.make_new_invoice();

                        if (this.frm && this.frm.doc) {
                            wmn_prepare_pos_frm_doc(this);
                            await this.wmn_restore_default_customer_for_new_transaction();
                        }

                        setTimeout(() => {
                            try {
                                const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                                if (doc && Array.isArray(doc.taxes) && doc.taxes.length) {
                                    wmn_refresh_offline_tax_cache_from_online_doc(doc);
                                }
                            } catch (e) {
                                console.warn("WMN tax cache refresh skipped", e);
                            }
                        }, 1200);

                        if (navigator.onLine !== false) {
                            window.__wmn_pos_effective_offline = false;
                        }
                        this.__wmn_new_order_online = false;

                        if (!wmn_is_pos_offline() && window.wmnPOSOffline) {
                            window.wmnPOSOffline.preload(this, false);
                        }

                        if (this.wmn_refresh_sell_on_credit_button) {
                            await this.wmn_refresh_sell_on_credit_button();
                        }
                        this.wmn_refresh_coupon_ui();
                        this.item_selector?.sync_card_quantities();

                        return result;
                    },

        wmn_register_offline_row_in_frappe_model(row) {
                    if (!row || !row.doctype || !row.name) return row;

                    frappe.locals = frappe.locals || {};
                    frappe.locals[row.doctype] = frappe.locals[row.doctype] || {};
                    frappe.locals[row.doctype][row.name] = row;

                    return row;
                },

        wmn_ensure_offline_item_stock_map(row) {
                    if (!row || !row.item_code) return;

                    this.item_stock_map = this.item_stock_map || {};
                    this.item_stock_map[row.item_code] = this.item_stock_map[row.item_code] || {};

                    const warehouse = row.warehouse || this.frm.doc.set_warehouse || "";
                    if (!warehouse) return;

                    this.item_stock_map[row.item_code][warehouse] = [
                        flt(row.actual_qty || 0),
                        cint(row.is_stock_item || 0)
                    ];

                    if (this.item_details) {
                        this.item_details.item_stock_map = this.item_stock_map;
                    }
                },

        wmn_ensure_item_stock_map_for_cart_rows() {
                    try {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        const rows = doc.items || [];

                        this.item_stock_map = this.item_stock_map || {};

                        rows.forEach(row => {
                            const warehouse =
                                row.warehouse ||
                                doc.set_warehouse ||
                                (this.settings && this.settings.warehouse) ||
                                "";

                            if (!row.item_code || !warehouse) return;

                            const qty = flt(
                                row.actual_qty ||
                                row.available_qty ||
                                row.projected_qty ||
                                0
                            );

                            this.item_stock_map[row.item_code] =
                                this.item_stock_map[row.item_code] || {};

                            this.item_stock_map[row.item_code][warehouse] =
                                this.item_stock_map[row.item_code][warehouse] || [
                                    qty,
                                    cint(row.is_stock_item || 0)
                                ];
                        });

                        if (this.item_details) {
                            this.item_details.item_stock_map = this.item_stock_map;
                        }
                    } catch (e) {
                        console.warn("WMN cart item_stock_map ensure skipped", e);
                    }
                },

        wmn_ensure_item_stock_map_for_item_details(item_row) {
                    try {
                        if (!item_row || !item_row.item_code) return;

                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};

                        const warehouse =
                            item_row.warehouse ||
                            doc.set_warehouse ||
                            (this.settings && this.settings.warehouse) ||
                            "";

                        if (!warehouse) return;

                        const qty = flt(
                            item_row.actual_qty ||
                            item_row.available_qty ||
                            item_row.projected_qty ||
                            0
                        );

                        this.item_stock_map = this.item_stock_map || {};

                        this.item_stock_map[item_row.item_code] =
                            this.item_stock_map[item_row.item_code] || {};

                        this.item_stock_map[item_row.item_code][warehouse] =
                            this.item_stock_map[item_row.item_code][warehouse] || [
                                qty,
                                cint(item_row.is_stock_item || 0)
                            ];

                        if (this.item_details) {
                            this.item_details.item_stock_map = this.item_stock_map;
                        }
                    } catch (e) {
                        console.warn("WMN item_stock_map ensure skipped", e);
                    }
                },

        edit_item_details_of(item_row) {
                    if (this.__wmn_suppress_item_details_during_selection) {
                        return Promise.resolve(item_row);
                    }

                    this.wmn_ensure_item_stock_map_for_cart_rows();
                    this.wmn_ensure_item_stock_map_for_item_details(item_row);
                    this.wmn_sync_item_stock_map();
                    return super.edit_item_details_of(item_row);
                },

        wmn_get_active_offline_item_detail_row() {
                    const details = this.item_details || {};
                    const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                    if (!doc || !Array.isArray(doc.items)) return null;

                    const candidates = [
                        details.current_item,
                        details.item_row,
                        details.item,
                    ].filter(Boolean);

                    const detail_doctype = details.doctype || (candidates[0] && candidates[0].doctype) || "";
                    const detail_name = details.name || (candidates[0] && candidates[0].name) || "";

                    if (detail_doctype && detail_name) {
                        const by_name = doc.items.find(row => row && row.doctype === detail_doctype && row.name === detail_name);
                        if (by_name) return by_name;
                    }

                    for (const candidate of candidates) {
                        if (!candidate) continue;
                        if (candidate.name) {
                            const by_candidate_name = doc.items.find(row => row && row.name === candidate.name);
                            if (by_candidate_name) return by_candidate_name;
                        }
                        if (candidate.item_code) {
                            const by_item_code = doc.items.find(row =>
                                row &&
                                String(row.item_code || "") === String(candidate.item_code || "") &&
                                String(row.batch_no || "") === String(candidate.batch_no || "") &&
                                String(row.serial_no || "") === String(candidate.serial_no || "")
                            );
                            if (by_item_code) return by_item_code;
                        }
                    }

                    return null;
                },

        wmn_apply_offline_item_detail_value(row, fieldname, value) {
                    if (!row || !fieldname) return row;

                    if (["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(fieldname)) {
                        row[fieldname] = flt(value || 0);
                    } else {
                        row[fieldname] = value;
                    }

                    row.qty = flt(row.qty || 0);
                    row.conversion_factor = flt(row.conversion_factor || 1);
                    row.stock_qty = row.qty * row.conversion_factor;

                    row.price_list_rate = flt(row.price_list_rate || row.rate || 0);

                    if (fieldname === "discount_percentage") {
                        const discount_percentage = flt(row.discount_percentage || 0);
                        row.rate = flt(row.price_list_rate || row.rate || 0) * (1 - (discount_percentage / 100));
                    } else if (fieldname === "discount_amount") {
                        const qty = flt(row.qty || 0) || 1;
                        const list_rate = flt(row.price_list_rate || row.rate || 0);
                        row.rate = Math.max(0, list_rate - (flt(row.discount_amount || 0) / qty));
                    } else {
                        row.rate = flt(row.rate || row.price_list_rate || 0);
                    }

                    row.amount = flt(row.qty || 0) * flt(row.rate || 0);
                    row.net_rate = flt(row.net_rate || row.rate || 0);

                    if (["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(fieldname)) {
                        row.net_rate = row.rate;
                    }

                    row.net_amount = flt(row.qty || 0) * flt(row.net_rate || row.rate || 0);
                    row.base_rate = row.rate;
                    row.base_amount = row.amount;
                    row.base_net_rate = row.net_rate;
                    row.base_net_amount = row.net_amount;

                    return row;
                },

        async wmn_refresh_offline_cart_from_item_detail(row) {
                    if (!row || !this.frm || !this.frm.doc) return;

                    try {
                        this.wmn_register_offline_row_in_frappe_model(row);
                        this.wmn_ensure_offline_item_stock_map(row);
                    } catch (e) {}

                    try {
                        await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });
                    } catch (e) {
                        console.warn("WMN offline detail commercial refresh skipped", e);
                    }

                    try {
                        if (this.cart && this.cart.update_item_html) {
                            this.cart.update_item_html(row);
                        } else if (this.update_cart_html) {
                            this.update_cart_html(row);
                        }
                    } catch (e) {
                        console.warn("WMN offline detail cart row refresh skipped", e);
                    }

                    try {
                        if (this.cart && this.cart.update_totals_section) {
                            this.cart.update_totals_section(this.frm);
                        }
                    } catch (e) {
                        console.warn("WMN offline detail totals refresh skipped", e);
                    }

                    try {
                        if (this.payment && this.payment.update_totals_section) {
                            this.payment.update_totals_section(this.frm.doc);
                        }
                    } catch (e) {}

                    try {
                        if (this.frm && this.frm.dirty) {
                            this.frm.dirty();
                        }
                    } catch (e) {}
                },

        async wmn_remove_offline_item_detail_row(row) {
                    if (!row || !this.frm || !this.frm.doc) return false;

                    const doc = this.frm.doc;
                    doc.items = (doc.items || []).filter((candidate) => {
                        if (!candidate) return false;
                        if (row.name && candidate.name === row.name) return false;
                        return !(
                            String(candidate.item_code || "") === String(row.item_code || "") &&
                            String(candidate.batch_no || "") === String(row.batch_no || "") &&
                            String(candidate.serial_no || "") === String(row.serial_no || "") &&
                            String(candidate.uom || candidate.stock_uom || "") === String(row.uom || row.stock_uom || "") &&
                            String(candidate.warehouse || "") === String(row.warehouse || "")
                        );
                    });

                    try {
                        if (window.frappe && frappe.locals && row.doctype && row.name && frappe.locals[row.doctype]) {
                            delete frappe.locals[row.doctype][row.name];
                        }
                    } catch (e) {}

                    try {
                        (doc.items || []).forEach((item, index) => {
                            item.idx = index + 1;
                        });
                        await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });
                    } catch (e) {
                        console.warn("WMN offline remove commercial refresh skipped", e);
                    }

                    try {
                        if (this.update_cart_html) {
                            this.update_cart_html(row, true);
                        } else if (this.cart && this.cart.update_item_html) {
                            this.cart.update_item_html(row, true);
                        }
                    } catch (e) {
                        console.warn("WMN offline remove cart row refresh skipped", e);
                    }

                    try {
                        if (this.cart && this.cart.update_totals_section) {
                            this.cart.update_totals_section(this.frm);
                        }
                    } catch (e) {}

                    try {
                        if (this.payment && this.payment.update_totals_section) {
                            this.payment.update_totals_section(doc);
                        }
                    } catch (e) {}

                    try {
                        if (this.item_details && this.item_details.toggle_item_details_section) {
                            this.item_details.toggle_item_details_section(null);
                        }
                    } catch (e) {}

                    try {
                        if (this.frm && this.frm.dirty) {
                            this.frm.dirty();
                        }
                    } catch (e) {}

                    return true;
                },

        async wmn_clear_cart() {
                    const doc = this.frm?.doc;
                    if (!doc) return false;

                    const rows = Array.isArray(doc.items) ? [...doc.items] : [];
                    if (!rows.length) {
                        this.item_selector?.sync_card_quantities?.();
                        return true;
                    }

                    const previousBulkMutation = Boolean(this.__wmn_bulk_cart_mutation);
                    try {
                        frappe.dom.freeze();
                        this.__wmn_bulk_cart_mutation = true;

                        if (doc.__wmn_pos_coupon_rule && typeof this.wmn_remove_coupon === "function") {
                            await this.wmn_remove_coupon({ silent: true, defer_refresh: true });
                        }

                        doc.additional_discount_percentage = 0;
                        doc.discount_amount = 0;
                        doc.base_discount_amount = 0;

                        for (const row of rows) {
                            try {
                                if (!wmn_controller_uses_offline_flow(this) && row?.doctype && row?.name) {
                                    frappe.model.clear_doc(row.doctype, row.name);
                                }
                            } catch (e) {
                                console.warn("WMN cart row model cleanup skipped", e);
                            }

                            try {
                                if (frappe.locals?.[row?.doctype] && row?.name) {
                                    delete frappe.locals[row.doctype][row.name];
                                }
                            } catch (e) {}

                            this.update_cart_html?.(row, true);
                        }

                        doc.items = [];
                        await this.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });

                        this.__wmn_bulk_cart_mutation = previousBulkMutation;
                        this.item_selector?.sync_card_quantities?.();
                        this.wmn_update_cart_fab?.();
                        this.cart?.update_totals_section?.(this.frm);
                        this.cart?.wmn_refresh_discount_breakdown?.(doc);
                        this.item_details?.toggle_item_details_section?.(null);
                        this.cart?.toggle_item_highlight?.();
                        this.frm?.dirty?.();
                        return true;
                    } finally {
                        this.__wmn_bulk_cart_mutation = previousBulkMutation;
                        frappe.dom.unfreeze();
                    }
                },

        async remove_item_from_cart() {
                    if (this.__wmn_remove_item_promise) {
                        return this.__wmn_remove_item_promise;
                    }

                    const operation = (async () => {
                        const isOfflineFlow = typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline();
                        let row = null;

                        if (isOfflineFlow) {
                            row = this.wmn_get_active_offline_item_detail_row?.() || null;
                            if (!row) return false;
                            const removed = await this.wmn_remove_offline_item_detail_row(row);
                            this.item_selector?.sync_card_quantities?.();
                            this.wmn_update_cart_fab?.();
                            return removed;
                        }

                        const detailDoctype = this.item_details?.doctype;
                        const detailName = this.item_details?.name;
                        try {
                            if (detailDoctype && detailName) {
                                row = frappe.model.get_doc(detailDoctype, detailName) || null;
                            }
                        } catch (e) {}
                        row = row || this.item_details?.current_item || null;
                        if (!row) return false;

                        const rowSnapshot = Object.assign({}, row);
                        const rowDoctype = row.doctype || detailDoctype;
                        const rowName = row.name || detailName;
                        const doc = this.frm?.doc;
                        if (!doc) return false;

                        frappe.dom.freeze();
                        try {
                            // Remove the child row atomically. Do not set qty=0 first because that
                            // starts ERPNext's asynchronous pricing event chain for a row that is
                            // about to be removed from locals.
                            let removedFromModel = false;
                            if (rowDoctype && rowName) {
                                try {
                                    if (frappe.model.get_doc(rowDoctype, rowName)) {
                                        frappe.model.clear_doc(rowDoctype, rowName);
                                        removedFromModel = true;
                                    }
                                } catch (e) {}
                            }

                            if (!removedFromModel) {
                                doc.items = (doc.items || []).filter((candidate) => {
                                    if (!candidate) return false;
                                    if (rowName && candidate.name === rowName) return false;
                                    if (candidate === row) return false;
                                    return !(
                                        String(candidate.item_code || "") === String(row.item_code || "") &&
                                        String(candidate.batch_no || "") === String(row.batch_no || "") &&
                                        String(candidate.serial_no || "") === String(row.serial_no || "") &&
                                        String(candidate.uom || candidate.stock_uom || "") === String(row.uom || row.stock_uom || "") &&
                                        String(candidate.warehouse || "") === String(row.warehouse || "")
                                    );
                                });
                                (doc.items || []).forEach((item, index) => {
                                    item.idx = index + 1;
                                });
                            }

                            await this.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });

                            this.update_cart_html?.(rowSnapshot, true);
                            this.item_selector?.sync_card_quantities?.();
                            this.wmn_update_cart_fab?.();
                            this.cart?.update_totals_section?.(this.frm);
                            this.cart?.wmn_refresh_discount_breakdown?.(doc);
                            this.item_details?.toggle_item_details_section?.(null);
                            this.cart?.toggle_item_highlight?.();
                            this.frm?.dirty?.();
                            return true;
                        } finally {
                            frappe.dom.unfreeze();
                        }
                    })();

                    this.__wmn_remove_item_promise = operation;
                    try {
                        return await operation;
                    } finally {
                        if (this.__wmn_remove_item_promise === operation) {
                            this.__wmn_remove_item_promise = null;
                        }
                    }
                },

        update_item_field(value, field_or_action) {
                    if (field_or_action === "remove") {
                        return this.remove_item_from_cart();
                    }

                    const isOfflineFlow = typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline();
                    const result = super.update_item_field(value, field_or_action);

                    try {
                        if (!isOfflineFlow) {
                            return result;
                        }

                        if (!["qty", "rate", "price_list_rate", "discount_percentage", "discount_amount", "conversion_factor"].includes(field_or_action)) {
                            return result;
                        }

                        setTimeout(() => {
                            try {
                                const row = this.wmn_get_active_offline_item_detail_row();
                                if (!row) return;

                                const control = this.item_details && this.item_details[`${field_or_action}_control`];
                                const control_value = control && control.get_value ? control.get_value() : value;

                                this.wmn_apply_offline_item_detail_value(row, field_or_action, control_value);
                                this.wmn_refresh_offline_cart_from_item_detail(row);
                            } catch (e) {
                                console.warn("WMN offline numpad to cart sync skipped", e);
                            }
                        }, 0);
                    } catch (e) {
                        console.warn("WMN offline update_item_field bridge skipped", e);
                    }

                    return result;
                },

        get_available_stock(item_code, warehouse) {
                        if (!this.wmn_is_offline()) {
                            return super.get_available_stock(item_code, warehouse);
                        }

                        return this.wmn_cache().getAvailableStockCallLike(item_code, warehouse).then((response) => {
                            this.item_stock_map = this.item_stock_map || {};
                            if (!this.item_stock_map[item_code]) this.item_stock_map[item_code] = {};
                            this.item_stock_map[item_code][warehouse] = response.message;
                            this.wmn_sync_item_stock_map();
                            return response;
                        });
                    },

        async check_serial_no_availablilty(item_code, warehouse, serial_no) {
                        if (!this.wmn_is_offline()) {
                            return super.check_serial_no_availablilty(item_code, warehouse, serial_no);
                        }

                        const reserved = await this.wmn_cache().checkSerialReserved(item_code, warehouse, serial_no);
                        if (reserved) {
                            frappe.throw({
                                title: __("Not Available"),
                                message: __("Serial No: {0} has already been transacted into another POS Invoice.", [
                                    String(serial_no).bold(),
                                ]),
                            });
                        }
                    },

        async check_stock_availability(item, qty, warehouse) {
                        // Preserve ERPNext validation and messages. Offline changes only
                        // the data source through get_available_stock().
                        return super.check_stock_availability(item, qty, warehouse);
                    },

        async on_cart_update(args) {
                    if (wmn_is_pos_offline()) {
                        const itemRow = await this.wmn_offline_on_cart_update(args);
                        this.item_selector?.sync_card_quantities();
                        return itemRow;
                    }

                    args = await this.wmn_prepare_online_batch_args_before_super(args);
                    if (!args) return null;

                    if (args.item && flt(args.item.__wmn_selected_qty || 0) > 0) {
                        const addQty = flt(args.item.__wmn_selected_qty || args.item.qty || 1);
                        const existingRow = this.get_item_from_frm(args.item);
                        args.field = "qty";
                        args.value = existingRow && !$.isEmptyObject(existingRow)
                            ? flt(existingRow.qty || 0) + addQty
                            : addQty;
                    }

                    const wmn_batch_item = (args && args.item && args.item.__wmn_batch_dialog_done)
                        ? Object.assign({}, args.item)
                        : null;
                    const wmn_uom_item = (args && args.item && args.item.__wmn_uom_selected)
                        ? Object.assign({}, args.item)
                        : null;
                    const suppressItemDetails = !!(
                        args?.item?.__wmn_selection_dialog_done ||
                        args?.item?.__wmn_skip_item_details_for_batch_flow ||
                        (wmn_batch_item && args.item.__wmn_batch_dialog_done)
                    );

                    if (suppressItemDetails) {
                        this.__wmn_suppress_item_details_during_selection = true;
                        try {
                            if (this.item_details?.$component?.is(":visible") && this.item_details.toggle_item_details_section) {
                                await this.item_details.toggle_item_details_section(null);
                            }
                        } catch (e) {
                            console.warn("WMN item details close before batch selection skipped", e);
                        }
                    }

                    let itemRow = null;
                    try {
                        itemRow = await super.on_cart_update(args);

                        if (wmn_batch_item && itemRow) {
                            await this.wmn_restore_online_batch_price_after_super(itemRow, wmn_batch_item);
                        }

                        if (wmn_uom_item && itemRow) {
                            await this.wmn_restore_online_uom_after_super(itemRow, wmn_uom_item);
                        }

                        await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });
                        this.item_selector?.sync_card_quantities();
                        return itemRow;
                    } finally {
                        if (suppressItemDetails) {
                            this.__wmn_suppress_item_details_during_selection = false;
                        }
                    }
                },

        async wmn_restore_online_uom_after_super(item_row, item) {
                        try {
                            if (!item_row || !item_row.doctype || !item_row.name || !item) return item_row;
                            if (!item.__wmn_uom_selected) return item_row;

                            const selectedUom = item.uom || item.stock_uom || "";
                            const selectedRate = flt(item.price_list_rate || item.rate || 0);
                            const selectedConversion = flt(item.conversion_factor || 1);

                            if (selectedUom && item_row.uom !== selectedUom) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "uom", selectedUom);
                            }

                            if (selectedConversion > 0 && flt(item_row.conversion_factor || 0) !== selectedConversion) {
                                await wmn_pos_set_value(
                                    item_row.doctype,
                                    item_row.name,
                                    "conversion_factor",
                                    selectedConversion
                                );
                            }

                            if (selectedRate >= 0 && flt(item_row.price_list_rate || 0) !== selectedRate) {
                                await wmn_pos_set_value(
                                    item_row.doctype,
                                    item_row.name,
                                    "price_list_rate",
                                    selectedRate
                                );
                            }

                            if (selectedRate >= 0 && flt(item_row.rate || 0) !== selectedRate) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "rate", selectedRate);
                            }

                            item_row.uom = selectedUom || item_row.uom;
                            item_row.conversion_factor = selectedConversion;
                            item_row.price_list_rate = selectedRate;
                            item_row.rate = selectedRate;
                            item_row.stock_qty = flt(item_row.qty || 0) * selectedConversion;

                            if (this.wmn_ensure_item_stock_map_for_item_details) {
                                this.wmn_ensure_item_stock_map_for_item_details(item_row);
                            }

                            this.update_cart_html(item_row);
                            return item_row;
                        } catch (e) {
                            console.warn("WMN online UOM restore skipped", e);
                            return item_row;
                        }
                    },

        async wmn_restore_online_batch_price_after_super(item_row, item) {
                        try {
                            if (!item_row || !item_row.doctype || !item_row.name || !item) return item_row;
                            if (!item.__wmn_batch_dialog_done) return item_row;

                            const rate = flt(item.rate || item.price_list_rate || 0);
                            if (rate <= 0) return item_row;

                            if (item.batch_no && item_row.batch_no !== item.batch_no) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "batch_no", item.batch_no);
                            }

                            if (item.warehouse && item_row.warehouse !== item.warehouse) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "warehouse", item.warehouse);
                            }

                            if (flt(item.qty || 0) > 0 && flt(item_row.qty || 0) !== flt(item.qty || 0)) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "qty", flt(item.qty || 0));
                            }

                            if (flt(item_row.price_list_rate || 0) !== rate) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "price_list_rate", rate);
                            }

                            if (flt(item_row.rate || 0) !== rate) {
                                await wmn_pos_set_value(item_row.doctype, item_row.name, "rate", rate);
                            }

                            item_row.price_list_rate = rate;
                            item_row.rate = rate;

                            if (this.wmn_ensure_item_stock_map_for_item_details) {
                                this.wmn_ensure_item_stock_map_for_item_details(item_row);
                            }

                            this.update_cart_html(item_row);
                            return item_row;
                        } catch (e) {
                            console.warn("WMN online batch rate restore skipped", e);
                            return item_row;
                        }
                    },

        wmn_get_child_doctype() {
                        if (this.frm && this.frm.doc && this.frm.doc.doctype === "Sales Invoice") {
                            return "Sales Invoice Item";
                        }
                        return "POS Invoice Item";
                    },

        wmn_recalculate_offline_totals() {
                        const doc = this.frm.doc;
                        const items = doc.items || [];
                        let total_qty = 0;
                        let net_total = 0;

                        items.forEach((row, index) => {
                            row.idx = index + 1;
                            row.conversion_factor = flt(row.conversion_factor || 1);
                            row.qty = flt(row.qty || 0);
                            row.stock_qty = row.qty * row.conversion_factor;
                            row.price_list_rate = flt(row.price_list_rate || row.rate || 0);
                            row.discount_percentage = flt(row.discount_percentage || 0);
                            row.discount_amount = flt(row.discount_amount || 0);
                            row.rate = flt(row.rate || row.price_list_rate || 0);
                            row.amount = row.qty * row.rate;
                            row.net_rate = flt(row.net_rate || row.rate || 0);
                            row.net_amount = row.qty * row.net_rate;
                            row.base_rate = row.rate;
                            row.base_amount = row.amount;
                            row.base_net_rate = row.net_rate;
                            row.base_net_amount = row.net_amount;
                            total_qty += row.qty;
                            net_total += flt(row.net_amount || row.amount || 0);
                        });

                        wmn_apply_offline_taxes_and_discount(doc, total_qty, net_total, true);
                    },

        async wmn_offline_get_full_item(item) {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        const settings = this.settings || {};
                        const price_list = doc.selling_price_list || settings.selling_price_list || "";
                        const item_code = item && item.item_code;
                        if (!item_code) return item || {};

                        const offlineItem = await window.wmnPOSOffline.findItem(item_code, price_list);
                        return Object.assign({}, offlineItem || {}, item || {});
                    },

        async wmn_prepare_online_batch_args_before_super(args) {
            try {
                if (!args || !args.item) return args;

                const itemData = args.item.item_data || {};
                const hasBatch = cint(
                    args.item.has_batch_no ||
                    itemData.has_batch_no ||
                    0
                ) === 1;

                if (!hasBatch) return args;

                const currentBatch = String(args.item.batch_no || "").trim();
                const needsBatchDialog =
                    !currentBatch &&
                    !cint(args.item.__wmn_batch_dialog_done || 0) &&
                    !cint(args.item.__wmn_batch_from_scan || 0);

                if (needsBatchDialog) {
                    const warehouse =
                        args.item.warehouse ||
                        this.frm?.doc?.set_warehouse ||
                        this.settings?.warehouse ||
                        "";

                    const priceList =
                        this.frm?.doc?.selling_price_list ||
                        this.settings?.selling_price_list ||
                        "";

                    const selected = await wmn_show_online_batch_selection_dialog(
                        args.item,
                        warehouse,
                        priceList
                    );

                    if (!selected) {
                        return null;
                    }

                    args.item.__wmn_batch_dialog_done = 1;
                    args.item.__wmn_skip_item_details_for_batch_flow = 1;
                    args.item.batch_no = selected.batch_no;

                    const selectedQty = flt(selected.__selected_qty || 0);
                    if (selectedQty > 0) {
                        args.field = "qty";
                        args.value = selectedQty;
                        args.item.qty = selectedQty;
                    }

                    if (selected.warehouse) {
                        args.item.warehouse = selected.warehouse;
                    }

                    if (selected.currency) {
                        args.item.currency = selected.currency;
                    }

                    args.item.__wmn_selected_batch_available_qty = flt(selected.actual_qty || 0);
                }

                if (
                    this.item_selector &&
                    typeof this.item_selector.wmn_choose_uom === "function" &&
                    !cint(args.item.__wmn_uom_selected || 0)
                ) {
                    const selectedUomItem = await this.item_selector.wmn_choose_uom(args.item);
                    if (!selectedUomItem) {
                        return null;
                    }
                    args.item = selectedUomItem;
                }

                const availableBatchQty = flt(args.item.__wmn_selected_batch_available_qty || 0);
                const selectedQty = flt(args.item.qty || args.value || 1);
                const conversion = flt(args.item.conversion_factor || 1);
                const requiredStockQty = selectedQty * conversion;

                if (!wmn_pos_allows_negative_stock(args.item, this) && availableBatchQty >= 0 && requiredStockQty > availableBatchQty) {
                    frappe.show_alert({
                        message: __("Quantity cannot exceed available batch quantity"),
                        indicator: "orange",
                    });
                    return null;
                }

                return args;

            } catch (e) {
                console.warn("WMN online batch args preparation skipped", e);
                return args;
            }
        },

        async wmn_apply_online_batch_after_cart_update(args, item_row) {
            try {
                //if (!item_row || !item_row.item_code) return;
                if (item_row.batch_no == null) return;
                console.log("DIALOGING");

                const item = (args && args.item) || {};
        


        

                const warehouse =
                    item_row.warehouse ||
                    this.frm.doc.set_warehouse ||
                    this.settings.warehouse ||
                    "";

                const priceList =
                    this.frm.doc.selling_price_list ||
                    this.settings.selling_price_list ||
                    "";

                const selected = await wmn_show_online_batch_selection_dialog(
                    {
                        item_code: item_row.item_code,
                        item_name: item_row.item_name,
                        qty: item_row.qty || 1,
                        uom: item_row.uom || item_row.stock_uom || item.uom || item.stock_uom || "",
                        stock_uom: item_row.stock_uom || item.stock_uom || "",
                        rate: item_row.rate || item.rate || 0,
                        price_list_rate: item_row.price_list_rate || item.price_list_rate || item_row.rate || 0,
                        currency: this.frm.doc.currency || this.settings.currency || ""
                    },
                    warehouse,
                    priceList
                );

                if (!selected) return;

                await wmn_pos_set_value(
                    item_row.doctype,
                    item_row.name,
                    "batch_no",
                    selected.batch_no
                );

                if (selected.__selected_qty) {
                    await wmn_pos_set_value(
                        item_row.doctype,
                        item_row.name,
                        "qty",
                        selected.__selected_qty
                    );
                }

                const selectedRate = flt(selected.price_list_rate || selected.rate || 0);
                if (selectedRate > 0) {
                    await wmn_pos_set_value(
                        item_row.doctype,
                        item_row.name,
                        "rate",
                        selectedRate
                    );
                }

                this.update_cart_html(item_row);
            } catch (e) {
                console.warn("WMN online batch dialog skipped", e);
            }
        },

        async wmn_offline_on_cart_update(args) {
                        let item_row;
                        let did_freeze = false;
                        try {
                            let { field, value, item } = args || {};
                            item = await this.wmn_offline_get_full_item(item || {});

                            if (!this.frm || !this.frm.doc) return null;
                            if (!this.frm.doc.customer) return this.raise_customer_selection_alert();
                            if (!item.item_code) return null;

                            const target_warehouse = this.frm.doc.set_warehouse || this.settings.warehouse || item.warehouse || "";

                            let selectedBatch = null;
                            const customBatchFlow =
                                cint(item.has_batch_no || 0) &&
                                !String(item.batch_no || "").trim() &&
                                !cint(item.__wmn_batch_dialog_done || 0) &&
                                !cint(item.__wmn_batch_from_scan || 0);

                            if (customBatchFlow) {
                                item.__wmn_skip_item_details_for_batch_flow = 1;
                                try {
                                    if (this.item_details?.$component?.is(":visible") && this.item_details.toggle_item_details_section) {
                                        await this.item_details.toggle_item_details_section(null);
                                    }
                                } catch (e) {
                                    console.warn("WMN offline item details close before batch selection skipped", e);
                                }

                                selectedBatch = await window.showBatchSelectionDialog(item, target_warehouse);

                                if (selectedBatch && selectedBatch.batch_no) {
                                    item.batch_no = selectedBatch.batch_no;
                                    item.warehouse = selectedBatch.warehouse || target_warehouse || item.warehouse || "";
                                    item.actual_qty = flt(selectedBatch.actual_qty || item.actual_qty || 0);
                                    item.qty = flt(selectedBatch.__selected_qty || item.qty || 1);
                                    item.__wmn_selected_batch_qty = item.qty;
                                    item.__wmn_selected_batch_available_qty = flt(selectedBatch.actual_qty || 0);

                                    if (selectedBatch.currency) {
                                        item.currency = selectedBatch.currency;
                                    }
                                } else {
                                    frappe.show_alert({
                                        message: __("Batch No is required for this item"),
                                        indicator: "orange"
                                    });
                                    return null;
                                }
                            }

                            if (cint(item.has_batch_no || 0) && !item.batch_no) {
                                frappe.show_alert({
                                    message: __("Batch No is required for this item"),
                                    indicator: "orange"
                                });
                                return null;
                            }

                            if (
                                cint(item.has_batch_no || 0) &&
                                this.item_selector &&
                                typeof this.item_selector.wmn_choose_uom === "function" &&
                                !cint(item.__wmn_uom_selected || 0)
                            ) {
                                const selectedUomItem = await this.item_selector.wmn_choose_uom(item);
                                if (!selectedUomItem) {
                                    return null;
                                }
                                item = selectedUomItem;
                            }

                            const selectedBatchAvailableQty = flt(
                                item.__wmn_selected_batch_available_qty ||
                                item.actual_qty ||
                                0
                            );
                            const requiredBatchStockQty =
                                flt(item.qty || item.__wmn_selected_batch_qty || 1) *
                                flt(item.conversion_factor || 1);

                            if (
                                cint(item.has_batch_no || 0) &&
                                !wmn_pos_allows_negative_stock(item, this) &&
                                selectedBatchAvailableQty >= 0 &&
                                requiredBatchStockQty > selectedBatchAvailableQty
                            ) {
                                frappe.show_alert({
                                    message: __("Quantity cannot exceed available batch quantity"),
                                    indicator: "orange"
                                });
                                return null;
                            }

                            item = wmn_prepare_offline_item_detail_row(
                                item,
                                this.frm.doc,
                                this.settings || {}
                            );

                            if (!cint(item.__wmn_uom_selected || 0) && selectedBatch) {
                                const batchRate = flt(
                                    selectedBatch.price_list_rate ||
                                    selectedBatch.rate ||
                                    0
                                );
                                if (batchRate > 0) {
                                    item.price_list_rate = batchRate;
                                    item.rate = batchRate;
                                }
                            }

                            // Freeze only after any interactive batch/UOM selection dialog has closed.
                            frappe.dom.freeze();
                            did_freeze = true;

                            if (cint(item.has_serial_no || 0) && !item.serial_no) {
                                const serialRows = window.wmnPOSOffline?.getAvailableSerialsForItem
                                    ? await window.wmnPOSOffline.getAvailableSerialsForItem(
                                        item.item_code,
                                        target_warehouse,
                                        {
                                            limit: 1,
                                            batch_nos: item.batch_no || "",
                                            posting_date: this.frm?.doc?.posting_date || "",
                                            exclude_serials: wmn_collect_doc_serials(this.frm?.doc || {}),
                                        }
                                    )
                                    : [];
                                const autoSerial = (serialRows || [])[0] || null;
                                if (autoSerial && autoSerial.serial_no) {
                                    item.serial_no = autoSerial.serial_no;
                                    item.batch_no = item.batch_no || autoSerial.batch_no || "";
                                    item.warehouse = item.warehouse || autoSerial.warehouse || target_warehouse;
                                }
                            }

                            if (cint(item.has_serial_no || 0) && !item.serial_no) {
                                frappe.show_alert({
                                    message: __("No Serial No is saved or available for this item offline"),
                                    indicator: "orange"
                                });
                                return null;
                            }
                            const effective_warehouse = item.warehouse || target_warehouse || this.frm.doc.set_warehouse || "";

                            const incoming_for_merge = {
                                item_code: item.item_code,
                                uom: item.uom || item.stock_uom || "Nos",
                                stock_uom: item.stock_uom || item.uom || "Nos",
                                warehouse: effective_warehouse,
                                batch_no: item.batch_no || "",
                                serial_no: item.serial_no || ""
                            };

                            wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);
                            item_row = wmn_find_mergeable_offline_item(this.frm.doc.items || [], incoming_for_merge, effective_warehouse);

                            const item_row_exists = item_row && !$.isEmptyObject(item_row);
                            const from_selector = field === "qty" && (value === "+1" || value === 1 || value === "1");

                            if (item_row_exists) {
                                if (from_selector) value = flt(item_row.qty || 0) + flt(item.qty || 1);
                                if (field === "qty") value = flt(value || 0);

                                if (["qty", "conversion_factor"].includes(field) && value > 0 && !wmn_pos_allows_negative_stock(item, this)) {
                                    const conversion = field === "conversion_factor" ? flt(value || 1) : flt(item_row.conversion_factor || 1);
                                    const qty_needed = field === "qty" ? flt(value || 0) * conversion : flt(item_row.qty || 0) * conversion;
                                    const ok = wmn_pos_allows_negative_stock(item, this) ? true : await this.check_stock_availability(item, qty_needed, effective_warehouse);
                                    if (!ok) {
                                        frappe.show_alert({ message: wmn_t("Quantity is not available in offline stock", "الكمية غير متوفرة في المخزون الأوفلاين"), indicator: "orange" });
                                        return item_row;
                                    }
                                }

                                if (item && item.offline_item_tax_map && (!item_row.offline_item_tax_map || !Object.keys(wmn_parse_json_map(item_row.offline_item_tax_map)).length)) {
                                    item_row.offline_item_tax_map = wmn_parse_json_map(item.offline_item_tax_map);
                                    item_row.item_tax_rate = item_row.item_tax_rate || item_row.offline_item_tax_map;
                                    item_row.item_tax_template = item_row.item_tax_template || item.item_tax_template || "";
                                }
                                if (item_row.__wmn_item_max_discount === undefined) {
                                    item_row.__wmn_item_max_discount = flt(item.max_discount || 0);
                                }

                                item_row[field] = value;
                                if (field === "qty") {
                                    item_row.stock_qty = flt(value || 0) * flt(item_row.conversion_factor || 1);
                                    item_row.amount = flt(item_row.qty || 0) * flt(item_row.rate || item_row.price_list_rate || 0);
                                    item_row.net_amount = item_row.amount;
                                    item_row.base_amount = item_row.amount;
                                    item_row.base_net_amount = item_row.amount;
                                }
                            } else {
                                let qty = from_selector ? flt(item.qty || item.__wmn_selected_batch_qty || 1) : flt(value || item.qty || 1);
                                if (field === "serial_no") qty = String(value || "").split("\n").filter(Boolean).length || 0;

                                const item_conversion_factor = flt(item.conversion_factor || 1);
                                const qty_needed = flt(qty || 0) * item_conversion_factor;
                                const ok = wmn_pos_allows_negative_stock(item, this) ? true : await this.check_stock_availability(item, qty_needed, effective_warehouse);
                                if (!ok) {
                                    frappe.show_alert({ message: wmn_t("Quantity is not available in offline stock", "الكمية غير متوفرة في المخزون الأوفلاين"), indicator: "orange" });
                                    return null;
                                }

                                const child_doctype = this.wmn_get_child_doctype();
                                item_row = this.frm.add_child("items", {
                                    doctype: child_doctype,
                                    parenttype: this.frm.doc.doctype,
                                    parent: this.frm.doc.name,
                                    parentfield: "items",
                                    item_code: item.item_code,
                                    item_name: item.item_name || item.item_code,
                                    description: item.description || item.item_name || item.item_code,
                                    image: item.image || "",
                                    item_group: item.item_group || "",
                                    brand: item.brand || "",
                                    variant_of: item.variant_of || "",
                                    warehouse: effective_warehouse,
                                    batch_no: item.batch_no,
                                    serial_no: item.serial_no,
                                    uom: item.uom || item.stock_uom || "Nos",
                                    stock_uom: item.stock_uom || item.uom || "Nos",
                                    conversion_factor: flt(item.conversion_factor || 1),
                                    qty: qty,
                                    stock_qty: flt(qty) * flt(item.conversion_factor || 1),
                                    price_list_rate: flt(item.price_list_rate || item.rate || 0),
                                    rate: flt(item.rate || item.price_list_rate || 0),
                                    amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                                    net_rate: flt(item.rate || item.price_list_rate || 0),
                                    net_amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                                    has_serial_no: item.has_serial_no || 0,
                                    has_batch_no: item.has_batch_no || 0,
                                    allow_negative_stock: item.allow_negative_stock || 0,
                                    __wmn_item_max_discount: flt(item.max_discount || 0),
                                    item_tax_template: item.item_tax_template || "",
                                    offline_item_tax_map: wmn_parse_json_map(item.offline_item_tax_map || item.item_tax_rate || item.item_tax_map || {}),
                                    item_tax_rate: wmn_parse_json_map(item.item_tax_rate || item.offline_item_tax_map || item.item_tax_map || {}),
                                });
                            }

                            item_row = wmn_normalize_offline_cart_row(item_row, this.frm.doc, (this.frm.doc.items || []).indexOf(item_row), effective_warehouse);
                            wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);
                            this.wmn_register_offline_row_in_frappe_model(item_row);
                    
                    
                            this.wmn_ensure_offline_item_stock_map(item_row);



                            await this.wmn_refresh_commercial_state_after_cart_change({ silent: true });
                            this.frm.dirty();
                            this.update_cart_html(item_row);

                            if (
                                !cint(item.__wmn_skip_item_details_for_batch_flow || 0) &&
                                !cint(item.__wmn_selection_dialog_done || 0) &&
                                this.item_details &&
                                this.item_details.$component &&
                                this.item_details.$component.is(":visible")
                            ) {
                                this.edit_item_details_of(item_row);
                            }

                            if (this.payment && this.payment.update_totals_section) {
                                this.payment.update_totals_section(this.frm.doc);
                            }

                            if (this.frm && this.frm.refresh_field) {
                                this.frm.refresh_field("items");
                            }
                            frappe.utils.play_sound("submit");
                            return item_row;
                        } catch (error) {
                            console.error("WMN offline cart update failed", error);
                            frappe.show_alert({ message: __("\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0635\u0646\u0641 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [error.message || error]), indicator: "red" });
                            return null;
                        } finally {
                            if (did_freeze) {
                                frappe.dom.unfreeze();
                            }
                        }
                    },

        async wmn_finalize_offline_invoice() {
                        frappe.dom.freeze(wmn_t("Saving offline invoice...", "\u062C\u0627\u0631\u064A \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646..."));

                        try {
                            // Promotions, coupons, and totals are finalized before the payment UI opens.
                            // From this point onward user-entered payment rows are immutable.
                            window.WMN_POS?.Features?.InvoiceHandoff?.Common?.prepareForCompletion?.(this.frm.doc);
                            await wmn_assign_receipt_number(this.frm.doc);
                            const previousOfflineInvoice = typeof wmn_get_existing_offline_invoice_for_stock === "function"
                                ? await wmn_get_existing_offline_invoice_for_stock(this.frm.doc)
                                : null;
                            const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);

                            if (typeof wmn_apply_offline_available_qty_delta === "function") {
                                await wmn_apply_offline_available_qty_delta(this.frm.doc, previousOfflineInvoice);
                            }

                            if (this.item_selector && typeof this.item_selector.wmn_refresh_available_stock === "function") {
                                await this.item_selector.wmn_refresh_available_stock();
                            }

                            frappe.show_alert({
                                message: wmn_msg("Invoice added offline successfully: {0}", "\u062A\u0645\u062A \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0628\u0646\u062C\u0627\u062D: {0}", [row.offline_id || row.name || this.frm.doc.name]),
                                indicator: "orange"
                            });

                            this.toggle_components(false);
                            this.order_summary.toggle_component(true);
                            this.order_summary.load_summary_of(this.frm.doc, true);
                            wmn_try_auto_silent_print_after_order(this.frm.doc, "offline");
                            this.wmn_bind_offline_receipt_buttons();

                            if (this.wmn_cache && this.wmn_cache()) {
                                await this.wmn_cache().safeRefreshRecentOrders(this);
                            } else if (this.recent_order_list && this.recent_order_list.refresh_list) {
                                this.recent_order_list.refresh_list();
                            }

                            return row;
                        } finally {
                            frappe.dom.unfreeze();
                        }
                    },

        async save_and_checkout() {
                    // Close Item Details through its owner before checkout so its pending
                    // field validation is completed without creating a second checkout path.
                    if (this.item_details?.$component?.is(":visible")) {
                        await this.item_details.toggle_item_details_section(null);
                    }

                    const checkoutDoc = this.frm && this.frm.doc ? this.frm.doc : null;
                    const offlineCheckout = wmn_controller_uses_offline_flow(this);
                    const isCreditReturn = typeof wmn_is_credit_return_doc === "function"
                        ? wmn_is_credit_return_doc(checkoutDoc, this)
                        : false;

                    if (offlineCheckout) {
                        try {
                            if (!isCreditReturn) {
                                await this.wmn_ensure_commercial_state_ready_for_payment();
                            }

                            if (isCreditReturn) {
                                // A return against a pure credit invoice is a credit note against
                                // receivables. There is no cash/card refund to collect or require.
                                if (typeof wmn_prepare_credit_return_without_payment === "function") {
                                    wmn_prepare_credit_return_without_payment(this.frm.doc);
                                }
                                this.wmn_recalculate_offline_totals();
                                return await this.wmn_finalize_offline_invoice();
                            }

                            const paymentResult = await wmn_show_offline_payment_dialog(this);
                            if (paymentResult?.__wmn_handoff_complete === true) return paymentResult;
                            return await this.wmn_finalize_offline_invoice();
                        } catch (e) {
                            frappe.dom.unfreeze();

                            if ((e.message || e) === "cancelled") {
                                return;
                            }

                            console.error("Offline invoice payment/save failed", e);
                            frappe.msgprint({
                                title: wmn_t("Offline Save Failed", "فشل الحفظ أوفلاين"),
                                indicator: "red",
                                message: wmn_msg("Failed to save invoice offline: {0}", "تعذر حفظ الفاتورة أوفلاين: {0}", [e.message || e])
                            });
                            return;
                        }
                    }

                    if (isCreditReturn && typeof wmn_prepare_credit_return_without_payment === "function") {
                        // Keep a pure credit return at zero payment, but still use ERPNext's
                        // normal checkout flow so the Payment section is rendered first.
                        wmn_prepare_credit_return_without_payment(checkoutDoc);
                    } else {
                        // Pay is a boundary only. It waits for the already-running WMN
                        // commercial refresh and must not start a new pricing calculation.
                        await this.wmn_ensure_commercial_state_ready_for_payment();
                    }

                    return super.save_and_checkout();
                },

        async make_sales_invoice_frm() {
                        this.__wmn_return_against_credit = false;
                        const doctype = wmn_pos_invoice_doctype(this);

                        // Offline keeps its lightweight form model. Online follows ERPNext's
                        // lifecycle and reuses the existing Form instance for each new order.
                        if (wmn_controller_uses_offline_flow(this)) {
                            const doc = await wmn_make_offline_invoice_doc(this);
                            this.frm = wmn_make_offline_frm(doc);
                            wmn_prepare_pos_frm_doc(this);
                            window.cur_frm = this.frm;
                            window.cur_pos = this;
                            return this.frm;
                        }

                        return new Promise((resolve) => {
                            const currentDoctype = String(
                                this.frm?.doctype || this.frm?.doc?.doctype || ""
                            );
                            const reusableFrm =
                                this.frm && currentDoctype === doctype ? this.frm : null;

                            const build = () => {
                                this.frm = this.get_new_frm(reusableFrm, doctype);
                                this.frm.doc.items = [];
                                this.frm.doc.is_pos = 1;
                                wmn_prepare_pos_frm_doc(this);
                                window.cur_frm = this.frm;
                                window.cur_pos = this;
                                resolve(this.frm);
                            };

                            // ERPNext reuses the current Form after the first invoice. Only load
                            // DocType metadata when no compatible Form exists yet.
                            if (reusableFrm) {
                                build();
                            } else {
                                frappe.model.with_doctype(doctype, build);
                            }
                        });
                    },

        async make_return_invoice(doc) {
                        const returnApproval = await this.wmn_authorize_pos_action(
                            window.WMNPOSSupervisor?.ACTIONS?.RETURN || "RETURN",
                            {
                                doc: doc || null,
                                pos_profile: this.pos_profile || this.settings?.pos_profile || doc?.pos_profile || "",
                                before_value: doc?.grand_total ?? doc?.rounded_total ?? "",
                                after_value: doc?.grand_total ?? doc?.rounded_total ?? "",
                                return_amount: Math.abs(flt(doc?.rounded_total ?? doc?.grand_total ?? 0)),
                                attach_to_doc: false,
                            }
                        );
                        if (!returnApproval || !returnApproval.approved) return null;

                        const returnAgainstCredit = typeof wmn_source_invoice_is_credit === "function"
                            ? wmn_source_invoice_is_credit(doc)
                            : false;
                        this.__wmn_return_against_credit = returnAgainstCredit;

                        if (wmn_controller_uses_offline_flow(this)) {
                            const frm = await this.wmn_cache().makeReturnInvoiceOffline(doc);
                            this.frm = frm;
                            if (returnApproval.offline && window.WMNPOSSupervisor?.attachApproval) {
                                window.WMNPOSSupervisor.attachApproval(this.frm.doc, returnApproval);
                            }
                            wmn_prepare_pos_frm_doc(this);
                            if (this.set_pos_profile_data) await this.set_pos_profile_data();
                            return this.wmn_cache().asCallLike(frm.doc);
                        }

                        frappe.dom.freeze();

                        const invoiceDoctype = wmn_pos_invoice_doctype(this);
                        this.frm = this.get_new_frm(this.frm, invoiceDoctype);
                        this.frm.doc.items = [];

                        return frappe.call({
                            method: wmn_pos_return_method(invoiceDoctype),
                            args: {
                                source_name: doc.name,
                                target_doc: this.frm.doc,
                            },
                            callback: (r) => {
                                frappe.model.sync(r.message);
                                const returnDoc = frappe.get_doc(r.message.doctype, r.message.name);
                                returnDoc.__run_link_triggers = false;
                                returnDoc.__wmn_return_against_credit = returnAgainstCredit;
                                if (this.frm && this.frm.doc) {
                                    this.frm.doc.__wmn_return_against_credit = returnAgainstCredit;
                                }
                                if (returnAgainstCredit && typeof wmn_prepare_credit_return_without_payment === "function") {
                                    wmn_prepare_credit_return_without_payment(returnDoc);
                                    if (this.frm && this.frm.doc) {
                                        wmn_prepare_credit_return_without_payment(this.frm.doc);
                                    }
                                }
                                this.set_pos_profile_data().then(() => {
                                    frappe.dom.unfreeze();
                                });
                            },
                        });
                    },

        get_new_frm(_frm, doctype) {
                        const target_doctype = doctype || wmn_pos_invoice_doctype(this);

                        // Never create a real ERPNext Form while effective offline.
                        if (wmn_controller_uses_offline_flow(this)) {
                            const doc = {
                                doctype: target_doctype,
                                name: (target_doctype === "Sales Invoice" ? "OFFLINE-SINV-" : "OFFLINE-PINV-") + Date.now(),
                                __islocal: 1,
                                __offline_pos: 1,
                                offline_pos: 1,
                                items: [],
                                payments: []
                            };
                            this.frm = wmn_make_offline_frm(doc);
                            wmn_prepare_pos_frm_doc(this);
                            return this.frm;
                        }

                        const currentDoctype = String(
                            _frm?.doctype || _frm?.doc?.doctype || ""
                        );
                        const reusableFrm =
                            _frm && currentDoctype === target_doctype ? _frm : null;

                        // Match ERPNext's original lifecycle: keep the same Form object and only
                        // refresh it with a newly-created local document for the next order.
                        const page = reusableFrm ? null : $("<div>");
                        const frm = reusableFrm || new frappe.ui.form.Form(target_doctype, page, false);
                        const name = frappe.model.make_new_doc_and_get_name(target_doctype, true);

                        // Keep the new document clean before Form refresh. This is required for
                        // both POS Invoice and WMN's Sales Invoice mode.
                        const localDoc = frappe.locals?.[target_doctype]?.[name];
                        if (localDoc) localDoc.items = [];

                        frm.refresh(name);

                        frm.doc.items = [];
                        frm.doc.is_pos = 1;
                        frm.doc.update_stock = frm.doc.update_stock === undefined ? 1 : frm.doc.update_stock;
                        frm.doc.pos_profile = this.settings && this.settings.pos_profile ? this.settings.pos_profile : frm.doc.pos_profile;
                        frm.doc.currency = frm.doc.currency || this.settings.currency || this.settings.company_currency || frappe.defaults.get_default("currency") || "YER";
                        frm.doc.company_currency = frm.doc.company_currency || this.settings.company_currency || frm.doc.currency || "YER";
                        frm.doc.conversion_rate = flt(frm.doc.conversion_rate || 1);
                        frm.doc.price_list_currency = frm.doc.price_list_currency || this.settings.price_list_currency || frm.doc.currency || "YER";
                        frm.doc.plc_conversion_rate = flt(frm.doc.plc_conversion_rate || 1);

                        window.cur_frm = frm;
                        window.cur_pos = this;

                        return frm;
                    },

        set_pos_profile_data() {
                        if (wmn_controller_uses_offline_flow(this)) {

                            const doc = this.frm && this.frm.doc;
                            const settings = this.settings || {};

                            if (doc) {
                                doc.is_pos = 1;
                                doc.update_stock = doc.update_stock === undefined ? 1 : doc.update_stock;
                                doc.pos_profile = doc.pos_profile || settings.pos_profile || "";
                                doc.company = doc.company || settings.company || frappe.defaults.get_default("company") || "";
                                doc.currency = doc.currency || settings.currency || settings.company_currency || frappe.defaults.get_default("currency") || "YER";
                                doc.company_currency = doc.company_currency || settings.company_currency || doc.currency || "YER";
                                doc.conversion_rate = flt(doc.conversion_rate || 1);
                                doc.price_list_currency = doc.price_list_currency || settings.price_list_currency || doc.currency || "YER";
                                doc.plc_conversion_rate = flt(doc.plc_conversion_rate || 1);
                                doc.selling_price_list = doc.selling_price_list || settings.selling_price_list || "";
                                doc.set_warehouse = doc.set_warehouse || settings.warehouse || "";
                            }

                            return Promise.resolve();
                        }

                        if (super.set_pos_profile_data) {
                            return super.set_pos_profile_data();
                        }

                        return Promise.resolve();
                    },

        async wmn_can_sell_on_credit() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return false;
                        if (doc.doctype !== "Sales Invoice") return false;
                        if (cint(doc.docstatus || 0) !== 0) return false;
                        if (cint(doc.is_return || 0) === 1) return false;
                        return await wmn_is_partial_payment_allowed(this);
                    },

        async wmn_refresh_sell_on_credit_button() {
                        if (!this.payment || !this.payment.$component) return;
                        const allowed = await this.wmn_can_sell_on_credit();
                        this.payment.$component.find(".wmn-sell-on-credit-btn").toggle(allowed);
                    },

        wmn_setup_sell_on_credit_button() {
                        if (!this.payment || !this.payment.$component) return;

                        const $component = this.payment.$component;
                        let $button = $component.find(".wmn-sell-on-credit-btn");

                        if (!$button.length) {
                            $button = $(`<div class="wmn-sell-on-credit-btn">${__("Sell on Credit")}</div>`);
                            const $submit = $component.find(".submit-order-btn").first();

                            if ($submit.length) {
                                $button.insertBefore($submit);
                            } else {
                                $component.append($button);
                            }

                            $button.on("click.wmnSellOnCredit", async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                await this.wmn_sell_on_credit();
                            });
                        }

                        this.wmn_refresh_sell_on_credit_button();
                    },

        async wmn_sell_on_credit() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc || !Array.isArray(doc.items) || !doc.items.length) {
                            frappe.show_alert({ message: __("You cannot submit empty order."), indicator: "orange" });
                            return;
                        }

                        if (this.payment && this.payment.validate_reqd_invoice_fields && !this.payment.validate_reqd_invoice_fields()) {
                            return;
                        }

                        if (!(await this.wmn_can_sell_on_credit())) {
                            frappe.show_alert({ message: __("Sell on Credit is not allowed for this invoice."), indicator: "orange" });
                            return;
                        }

                        await this.wmn_ensure_commercial_state_ready_for_payment();

                        if (wmn_controller_uses_offline_flow(this)) {
                            try {
                                this.wmn_recalculate_offline_totals();
                                const payments = await wmn_ensure_offline_payment_rows(doc);

                                if (!payments.length) {
                                    frappe.show_alert({ message: __("No payment mode is configured for the POS Profile."), indicator: "orange" });
                                    return;
                                }

                                payments.forEach((row) => {
                                    row.amount = 0;
                                    row.base_amount = 0;
                                    row.parent = doc.name;
                                    row.parenttype = doc.doctype;
                                    row.parentfield = "payments";
                                });

                                doc.payments = payments;
                                wmn_recalc_offline_payment_doc(doc);
                                return await this.wmn_finalize_offline_invoice();
                            } catch (e) {
                                frappe.dom.unfreeze();
                                console.error("WMN offline credit sale failed", e);
                                frappe.msgprint({
                                    title: wmn_t("Offline Save Failed", "\u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638 \u0623\u0648\u0641\u0644\u0627\u064A\u0646"),
                                    indicator: "red",
                                    message: wmn_msg("Failed to save invoice offline: {0}", "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [e.message || e])
                                });
                                return;
                            }
                        }

                        if (!Array.isArray(doc.payments) || !doc.payments.length) {
                            frappe.show_alert({ message: __("No payment mode is configured for the POS Profile."), indicator: "orange" });
                            return;
                        }

                        for (const row of doc.payments) {
                            await wmn_pos_set_value(row.doctype, row.name, "amount", 0);
                            if (Object.prototype.hasOwnProperty.call(row, "base_amount")) {
                                row.base_amount = 0;
                            }
                        }

                        await this.frm.set_value("paid_amount", 0);
                        await this.frm.set_value("base_paid_amount", 0);
                        await this.frm.set_value("change_amount", 0);
                        await this.frm.set_value("base_change_amount", 0);

                        return await this.wmn_submit_online_invoice();
                    },

        async wmn_submit_online_invoice() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return;

                        if (doc.doctype === "Sales Invoice") {
                            const allowPartialPayment = await wmn_is_partial_payment_allowed(this);
                            const payable = flt(doc.rounded_total || doc.grand_total || 0);
                            const paid = (doc.payments || []).reduce((sum, row) => sum + flt(row.amount || 0), 0);

                            if (
                                !allowPartialPayment &&
                                paid < payable &&
                                flt(doc.additional_discount_percentage || 0) !== 100
                            ) {
                                frappe.msgprint({
                                    title: wmn_t("Payment Amount", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639"),
                                    indicator: "orange",
                                    message: wmn_t("Payment amount is less than invoice total", "\u0645\u0628\u0644\u063A \u0627\u0644\u062F\u0641\u0639 \u0623\u0642\u0644 \u0645\u0646 \u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629")
                                });
                                return;
                            }
                        }

                        try {
                            // Payment is already finalized by the user. Submit must not run any
                            // pricing, discount, tax or outstanding recalculation at this stage.
                            window.WMN_POS?.Features?.InvoiceHandoff?.Common?.prepareForCompletion?.(doc);
                            doc.is_pos = 1;
                            doc.ignore_pricing_rule = 1;
                            doc.coupon_code = "";
                            await wmn_assign_receipt_number(doc);
                            const receiptNo = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
                            const couponCode = String(doc.__wmn_coupon_code || "").trim();
                            const couponDiscountAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
                            const promotionInvoiceDiscountAmount = Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
                            const promotionResults = Array.isArray(doc.__wmn_pos_promotions)
                                ? doc.__wmn_pos_promotions.map((row) => Object.assign({}, row))
                                : [];
                            const r = await this.frm.savesubmit();

                            let submittedDoc = (r && r.doc) || (this.frm && this.frm.doc) || {};
                            const submittedDoctype = submittedDoc.doctype || doc.doctype;
                            const submittedName = submittedDoc.name || doc.name;

                            if (submittedDoctype && submittedName) {
                                try {
                                    submittedDoc = await frappe.db.get_doc(submittedDoctype, submittedName);
                                } catch (fetchError) {
                                    console.warn("WMN could not reload submitted invoice from server", fetchError);
                                }
                            }

                            submittedDoc.wmn_receipt_no = submittedDoc.wmn_receipt_no || receiptNo;
                            submittedDoc.__wmn_receipt_no = submittedDoc.__wmn_receipt_no || receiptNo;

                            const defaultCustomer = String(this.settings?.customer || "").trim();
                            const submittedCustomer = String(submittedDoc.customer || "").trim();
                            if (
                                !cint(submittedDoc.is_return || 0) &&
                                submittedCustomer &&
                                submittedCustomer !== defaultCustomer &&
                                window.wmnPOSOffline?.markCustomerPOSPurchase
                            ) {
                                await window.wmnPOSOffline.markCustomerPOSPurchase(
                                    submittedCustomer,
                                    submittedDoc.posting_date
                                );
                            }
                            if (couponCode) {
                                submittedDoc.__wmn_coupon_code = couponCode;
                                try {
                                    await frappe.call({
                                        method: "wmn.api.register_pos_coupon_redemption",
                                        args: {
                                            coupon_code: couponCode,
                                            invoice_doctype: submittedDoctype,
                                            invoice_name: submittedName,
                                            coupon_discount_amount: couponDiscountAmount,
                                            promotion_invoice_discount_amount: promotionInvoiceDiscountAmount,
                                        },
                                        freeze: false,
                                    });
                                } catch (couponRegisterError) {
                                    console.error("WMN coupon redemption registration failed", couponRegisterError);
                                    frappe.msgprint({
                                        title: __("Coupon Usage"),
                                        indicator: "orange",
                                        message: __("The invoice was submitted, but coupon usage registration failed. Please retry coupon usage synchronization."),
                                    });
                                }
                            }
                            if (promotionResults.length) {
                                submittedDoc.__wmn_pos_promotions = promotionResults;
                                try {
                                    await frappe.call({
                                        method: "wmn.api.register_pos_promotion_redemptions",
                                        args: {
                                            promotion_results: promotionResults,
                                            invoice_doctype: submittedDoctype,
                                            invoice_name: submittedName,
                                        },
                                        freeze: false,
                                    });
                                } catch (promotionRegisterError) {
                                    console.error("WMN promotion redemption registration failed", promotionRegisterError);
                                    frappe.show_alert({
                                        message: __("Invoice submitted, but promotion usage logging failed."),
                                        indicator: "orange",
                                    });
                                }
                            }

                            if (this.item_selector && typeof this.item_selector.wmn_refresh_available_stock === "function") {
                                await this.item_selector.wmn_refresh_available_stock();
                            }

                            this.toggle_components(false);
                            this.order_summary.toggle_component(true);
                            this.order_summary.load_summary_of(submittedDoc, true);
                            wmn_try_auto_silent_print_after_order(submittedDoc, "online");

                            if (this.recent_order_list && this.recent_order_list.refresh_list) {
                                this.recent_order_list.refresh_list();
                            }

                            frappe.show_alert({
                                indicator: "green",
                                message: __("POS invoice {0} created successfully", [submittedDoc.name])
                            });

                            return r;
                        } catch (e) {
                            console.error("WMN online submit invoice failed", e);
                            throw e;
                        }
                    },

        async wmn_send_to_cashier() {
                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                    if (!handoff?.sendToCashier) throw new Error("WMN cashier handoff feature is not available");
                    return await handoff.sendToCashier(this);
                },

        init_payments() {
                        this.payment = new erpnext.PointOfSale.Payment({
                            wrapper: this.$components_wrapper,
                            settings: this.settings,
                            events: {
                                get_frm: () => this.frm || {},
                                get_customer_details: () => this.customer_details || {},
                                toggle_other_sections: (show) => {
                                    if (show) {
                                        if (this.item_details && this.item_details.$component && this.item_details.$component.is(":visible")) {
                                            this.item_details.$component.css("display", "none");
                                        }
                                        this.item_selector.toggle_component(false);
                                    } else {
                                        this.item_selector.toggle_component(true);
                                    }
                                },
                                submit_invoice: async () => {
                                    const paymentDoc = this.frm && this.frm.doc ? this.frm.doc : null;
                                    const isCreditReturn = typeof wmn_is_credit_return_doc === "function"
                                        ? wmn_is_credit_return_doc(paymentDoc, this)
                                        : false;

                                    if (isCreditReturn && typeof wmn_prepare_credit_return_without_payment === "function") {
                                        wmn_prepare_credit_return_without_payment(paymentDoc);
                                    }

                                    if (wmn_controller_uses_offline_flow(this)) {
                                        return this.save_and_checkout();
                                    }

                                    return this.wmn_submit_online_invoice();
                                },
                                send_to_cashier: async () => await this.wmn_send_to_cashier(),
                                after_checkout: () => {
                                    this.wmn_refresh_sell_on_credit_button();
                                    this.payment?.wmn_setup_send_to_cashier_button?.();
                                },
                            },
                        });

                        this.wmn_setup_sell_on_credit_button();
                    },

        wmn_bind_offline_receipt_buttons() {
                        if (!wmn_is_pos_offline || !wmn_is_pos_offline()) return;

                        const bind = () => {
                            const $wrapper = this.order_summary && this.order_summary.$component
                                ? this.order_summary.$component
                                : $(this.$components_wrapper || document);

                            const labels = [
                                "Print Receipt",
                                __("Print Receipt")
                            ];

                            $wrapper.find("button, .btn").each((idx, el) => {
                                const $btn = $(el);
                                const text = ($btn.text() || "").trim();

                                if (labels.includes(text) || text.toLowerCase() === "print receipt") {
                                    if ($btn.attr("data-wmn-offline-print-bound")) return;

                                    $btn.attr("data-wmn-offline-print-bound", "1");
                                    $btn.off("click.wmnOfflinePrint");
                                    $btn.on("click.wmnOfflinePrint", (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.wmn_print_offline_receipt(this.frm && this.frm.doc);
                                        return false;
                                    });
                                }
                            });
                        };

                        bind();
                        setTimeout(bind, 300);
                        setTimeout(bind, 1000);
                    },

        async wmn_open_scanned_draft_for_payment(doc) {
                    doc = doc || {};
                    if (cint(doc.docstatus || 0) !== 0 || !doc.name) return false;

                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                    this.__wmn_cashier_resume = handoff?.isAwaitingCashier?.(doc) === true;
                    const cashierPaymentSnapshot = this.__wmn_cashier_resume
                        ? handoff?.capturePaymentSnapshot?.(doc)
                        : null;
                    const targetDoctype = String(doc.doctype || wmn_pos_invoice_doctype(this));
                    this.recent_order_list?.toggle_component(false);
                    this.order_summary?.toggle_component(false);

                    if (wmn_controller_uses_offline_flow(this)) {
                        const offlineDoc = JSON.parse(JSON.stringify(doc));
                        offlineDoc.items = Array.isArray(offlineDoc.items) ? offlineDoc.items : [];
                        offlineDoc.payments = Array.isArray(offlineDoc.payments) ? offlineDoc.payments : [];

                        this.frm = wmn_make_offline_frm(offlineDoc);
                        window.cur_frm = this.frm;
                        window.cur_pos = this;

                        if (this.cart?.load_invoice) {
                            await Promise.resolve(this.cart.load_invoice());
                        }

                        try {
                            const paymentResult = await wmn_show_offline_payment_dialog(this);
                            if (paymentResult?.__wmn_handoff_complete === true) return true;
                            return await this.wmn_finalize_offline_invoice();
                        } catch (error) {
                            if (String(error?.message || error) === "cancelled") return false;
                            throw error;
                        }
                    }

                    await new Promise((resolve) => frappe.model.with_doctype(targetDoctype, resolve));

                    let modelDoc = frappe.get_doc(targetDoctype, doc.name);
                    if (!modelDoc && window.frappe?.model?.sync) {
                        frappe.model.sync(doc);
                        modelDoc = frappe.get_doc(targetDoctype, doc.name);
                    }
                    if (!modelDoc) throw new Error("WMN scanned draft invoice is not loaded in Frappe model");

                    modelDoc.items = Array.isArray(modelDoc.items) ? modelDoc.items : [];
                    modelDoc.payments = Array.isArray(modelDoc.payments) ? modelDoc.payments : [];

                    const currentDoctype = String(this.frm?.doctype || this.frm?.doc?.doctype || "");
                    if (!this.frm || currentDoctype !== targetDoctype) {
                        this.frm = new frappe.ui.form.Form(targetDoctype, $("<div>"), false);
                    }

                    this.frm.refresh(doc.name);
                    window.cur_frm = this.frm;
                    window.cur_pos = this;

                    if (this.cart?.load_invoice) {
                        await Promise.resolve(this.cart.load_invoice());
                    }

                    this.toggle_components(true);
                    this.order_summary?.toggle_component(false);
                    this.payment?.checkout?.();
                    if (cashierPaymentSnapshot) {
                        handoff?.restorePaymentSnapshot?.(this.frm.doc, cashierPaymentSnapshot);
                        this.frm?.refresh_field?.("payments");
                        this.payment?.update_totals_section?.(this.frm.doc);
                        this.payment?.render_payment_mode_dom?.();
                    }
                    return true;
                },

        async wmn_route_scanned_invoice(doc) {
                    if (!doc) return false;

                    if (cint(doc.docstatus || 0) === 0) {
                        return await this.wmn_open_scanned_draft_for_payment(doc);
                    }

                    if (typeof this.order_summary?.wmn_open_from_invoice_barcode === "function") {
                        await this.order_summary.wmn_open_from_invoice_barcode(doc);
                        return true;
                    }

                    this.order_summary?.load_summary_of?.(doc, false);
                    return true;
                },

        init_recent_order_list() {
                    this.recent_order_list = new erpnext.PointOfSale.PastOrderList({
                        wrapper: this.$components_wrapper,
                        events: {
                            open_invoice_data: (name) => {
                                if (wmn_controller_uses_offline_flow(this)) {
                                    this.wmn_cache().getInvoiceFromCache(wmn_pos_invoice_doctype(this), name).then(async (doc) => {
                                        if (!doc) {
                                            frappe.show_alert({ message: __("Offline invoice not found in cache"), indicator: "orange" });
                                            return;
                                        }
                                        const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                                        if (handoff?.isAwaitingCashier?.(doc)) {
                                            await this.wmn_open_scanned_draft_for_payment(doc);
                                            return;
                                        }
                                        this.order_summary.load_summary_of(doc, false);
                                    });
                                    return;
                                }
                                frappe.db.get_doc(wmn_pos_invoice_doctype(this), name).then(async (doc) => {
                                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                                    if (handoff?.isAwaitingCashier?.(doc)) {
                                        await this.wmn_open_scanned_draft_for_payment(doc);
                                        return;
                                    }
                                    this.order_summary.load_summary_of(doc);
                                });
                            },
                            open_invoice_barcode_doc: async (doc) => {
                                if (!doc) return;
                                await this.wmn_route_scanned_invoice(doc);
                            },
                            reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
                        },
                    });

                    const $component = this.recent_order_list?.$component;
                    if (!$component?.length) return this.recent_order_list;

                    const $filter = $component.find(".filter-section").first();
                    if (!$filter.length || $filter.find(".wmn-recent-orders-back").length) {
                        return this.recent_order_list;
                    }

                    const $label = $filter.children(".label").first();
                    const $titleRow = $(`
                        <div class="wmn-recent-orders-title-row">
                            <div class="wmn-recent-orders-title"></div>
                            <button type="button" class="wmn-recent-orders-back">
                                <svg width="18" height="18" viewBox="0 0 24 24"
                                    fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M15 18l-6-6 6-6"></path>
                                </svg>
                                <span>${__("Back to Cart")}</span>
                            </button>
                        </div>
                    `);

                    $filter.prepend($titleRow);
                    if ($label.length) $titleRow.find(".wmn-recent-orders-title").append($label);
                    $titleRow.find(".wmn-recent-orders-back").on("click.wmnMamsek", (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        this.toggle_recent_order_list(false);
                        this.item_selector?.sync_card_quantities?.();
                    });
                    return this.recent_order_list;
                },

        init_order_summary() {
                        const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                        this.settings = wmn_safe_settings(this.settings || {});
                        this.order_summary = new erpnext.PointOfSale.PastOrderSummary({
                            wrapper: this.$components_wrapper,
                            settings: wmn_safe_settings(this.settings || {}),
                            events: {
                                get_frm: () => this.frm,
        
                                process_return: (name) => {
                                    this.recent_order_list.toggle_component(false);
                                    if (wmn_controller_uses_offline_flow(this)) {
                                        this.wmn_cache().getInvoiceFromCache(doctype, name).then((doc) => {
                                            if (!doc) {
                                                frappe.show_alert({ message: __("Return is available offline only for cached invoices."), indicator: "orange" });
                                                return;
                                            }
                                            frappe.run_serially([
                                                () => this.make_return_invoice(doc),
                                                () => this.cart && this.cart.load_invoice ? this.cart.load_invoice() : null,
                                                () => this.item_selector.toggle_component(true),
                                            ]);
                                        });
                                        return;
                                    }
                                    frappe.db.get_doc(doctype, name).then((doc) => {
                                        frappe.run_serially([
                                            () => this.make_return_invoice(doc),
                                            () => this.cart.load_invoice(),
                                            () => this.item_selector.toggle_component(true),
                                        ]);
                                    });
                                },
                                edit_order: (name) => {
                                    this.recent_order_list.toggle_component(false);
                                    if (wmn_controller_uses_offline_flow(this)) {
                                        this.wmn_cache().getInvoiceFromCache(doctype, name).then((doc) => {
                                            if (!doc) {
                                                frappe.show_alert({ message: __("Offline invoice not found in cache"), indicator: "orange" });
                                                return;
                                            }
                                            this.frm = wmn_make_offline_frm(doc);
                                            wmn_prepare_pos_frm_doc(this);
                                            frappe.run_serially([
                                                () => this.cart && this.cart.load_invoice ? this.cart.load_invoice() : wmn_safe_offline_cart_reload(this),
                                                () => this.item_selector.toggle_component(true),
                                            ]);
                                        });
                                        return;
                                    }
                                    frappe.run_serially([
                                        () => this.frm.refresh(name),
                                        () => this.frm.call("reset_mode_of_payments"),
                                        () => this.cart.load_invoice(),
                                        () => this.item_selector.toggle_component(true),
                                    ]);
                                },
                                delete_order: (name) => {
                                    if (wmn_controller_uses_offline_flow(this)) {
                                        this.wmn_cache().deleteInvoiceFromCache(this.frm.doc.doctype, name).then(() => {
                                            this.wmn_cache().safeRefreshRecentOrders(this);
                                        });
                                        return;
                                    }
                                    frappe.model.delete_doc(this.frm.doc.doctype, name, () => {
                                        this.recent_order_list.refresh_list();
                                    });
                                },
                                new_order: () => {
                                    frappe.run_serially([
                                        () => frappe.dom.freeze(),

                                

                                        () => this.make_new_invoice(),

                                        () => this.item_selector.toggle_component(true),

                                        () => this.cart.$numpad_section.css("display", "none"),
                                        () => this.cart.$totals_section.css("display", "flex"),
                                
                                

                                        () => frappe.dom.unfreeze(),
                                
                                        async () => {
                                            if (window.__wmn_pos_effective_offline === true) {
                                            const isOffline = await wmn_bootstrap_detect_effective_offline();

                                            this.__wmn_new_order_online = !isOffline;

                                    

                                            if (!isOffline) {
                                        
                                                location.reload();
                                        
                                            }
                                            }
                                        },
                                
                                    ]).catch((e) => {
                                        frappe.dom.unfreeze();

                                        if (e === "wmn_reload_online_new_order") {
                                            return;
                                        }

                                        console.error("WMN new_order failed", e);
                                    });
                                },
                        
                            },
                        });
                    }
    };

    const UIMethods = {
        __proto__: CoreMethods,

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
        			},

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
        			},




        wmn_setup_adaptive_cart_ui() {
        				if (!this.$mamsek_shell || !this.cart || !this.item_details) return;
        				if (this.__wmn_adaptive_cart_ui_ready) return;
        				this.__wmn_adaptive_cart_ui_ready = true;

        				const shell = this.$mamsek_shell;
        				const app = this.$components_wrapper;
        				shell.addClass("wmn-cart-resize-enabled");

        				// Item Details modal. The original ERPNext component and numpad are
        				// moved, not cloned, so Online and Offline continue using the same
        				// controls, validation and event handlers.
        				this.$wmn_item_details_layer = $(
        					`<div class="wmn-item-details-layer" aria-hidden="true">
        						<div class="wmn-item-details-backdrop"></div>
        						<div class="wmn-item-details-modal" role="dialog" aria-modal="true" aria-label="${__("Item Details")}">
        							<div class="wmn-item-details-host"></div>
        							<div class="wmn-item-details-numpad-host"></div>
        						</div>
        					</div>`
        				).appendTo(shell);

        				this.item_details.$component
        					.detach()
        					.appendTo(this.$wmn_item_details_layer.find(".wmn-item-details-host"));

        				if (this.cart.$numpad_section && this.cart.$numpad_section.length) {
        					this.cart.$numpad_section
        						.detach()
        						.addClass("wmn-modal-numpad")
        						.appendTo(this.$wmn_item_details_layer.find(".wmn-item-details-numpad-host"));
        				}

        				// ERPNext normally hides cart totals while the numpad is visible.
        				// In modal mode the numpad is no longer inside the cart, so totals
        				// remain visible and only the numpad itself is toggled.

        				// Resizable cart divider for desktop/tablet layouts where cart is a
        				// fixed side column.
        				this.$wmn_cart_resizer = $('<div class="wmn-cart-resizer" role="separator" aria-orientation="vertical" tabindex="0"></div>')
        					.appendTo(app);

        				this.wmn_restore_cart_width();
        				this.wmn_bind_cart_resizer();

        				// Mobile drawer controls.
        				this.$wmn_cart_backdrop = $('<button type="button" class="wmn-cart-drawer-backdrop" aria-label="' + __("Close Cart") + '"></button>')
        					.appendTo(shell);

        				this.$wmn_cart_fab = $(
        					`<button type="button" class="wmn-cart-fab" aria-label="${__("Open Cart")}" aria-expanded="false">
        						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 7H7.1M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm8 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        						<span class="wmn-cart-fab-badge">0</span>
        					</button>`
        				).appendTo(shell);

        				this.$wmn_cart_drawer_close = $(
        					`<button type="button" class="wmn-cart-drawer-close" aria-label="${__("Close Cart")}">×</button>`
        				).appendTo(this.cart.$component.find(".wmn-customer-title-row"));

        				this.$wmn_cart_fab.on("click.wmnAdaptiveCart", () => this.wmn_open_cart_drawer());
        				this.$wmn_cart_backdrop.on("click.wmnAdaptiveCart", () => this.wmn_close_cart_drawer());
        				this.$wmn_cart_drawer_close.on("click.wmnAdaptiveCart", () => this.wmn_close_cart_drawer());

        				this.wmn_setup_cart_state_observers();
        				this.wmn_sync_cart_context();
        			},

        wmn_set_item_details_modal_open(show) {
        				if (!this.$wmn_item_details_layer) return;
        				this.$wmn_item_details_layer
        					.toggleClass("is-open", Boolean(show))
        					.attr("aria-hidden", show ? "false" : "true");
        				this.$mamsek_shell?.toggleClass("wmn-item-details-open", Boolean(show));
        			},

        wmn_open_cart_drawer() {
        				if (!this.$mamsek_shell?.hasClass("wmn-cart-context-active")) return;
        				this.$mamsek_shell.addClass("wmn-cart-drawer-open");
        				this.$wmn_cart_fab?.attr("aria-expanded", "true");
        			},

        wmn_close_cart_drawer() {
        				this.$mamsek_shell?.removeClass("wmn-cart-drawer-open");
        				this.$wmn_cart_fab?.attr("aria-expanded", "false");
        			},

        wmn_update_cart_fab() {
        				if (!this.$wmn_cart_fab) return;
        				const rows = this.frm?.doc?.items || [];
        				const qty = rows.reduce((total, row) => total + Math.max(0, flt(row?.qty || 0)), 0);
        				const badge = this.$wmn_cart_fab.find(".wmn-cart-fab-badge");
        				badge.text(qty);
        				badge.toggleClass("is-empty", qty <= 0);
        			},

        wmn_sync_cart_context() {
        				if (!this.$mamsek_shell || !this.item_selector?.$component || !this.cart?.$component) return;
        				const items_visible = this.item_selector.$component.css("display") !== "none";
        				const cart_visible = this.cart.$component.css("display") !== "none";
        				const details_visible = this.item_details?.$component?.css("display") !== "none";
        				const active = items_visible && cart_visible;

        				this.$mamsek_shell.toggleClass("wmn-cart-context-active", active);
        				if (!active) this.wmn_close_cart_drawer();

        				// Some ERPNext flows hide ItemDetails directly (for example Recent
        				// Orders/Payment). Mirror that direct state into the modal layer.
        				this.wmn_set_item_details_modal_open(Boolean(details_visible));
        				if (!details_visible && this.cart.$numpad_section) {
        					this.cart.$numpad_section.css("display", "none");
        				}

        				this.wmn_update_cart_fab();
        			},

        wmn_setup_cart_state_observers() {
        				if (typeof MutationObserver !== "function") return;

        				const schedule_sync = () => {
        					window.clearTimeout(this.__wmn_cart_ui_sync_timer);
        					this.__wmn_cart_ui_sync_timer = window.setTimeout(() => this.wmn_sync_cart_context(), 0);
        				};

        				this.__wmn_cart_state_observer = new MutationObserver(schedule_sync);
        				[
        					this.item_selector.$component?.[0],
        					this.cart.$component?.[0],
        					this.item_details.$component?.[0],
        				].filter(Boolean).forEach((node) => {
        					this.__wmn_cart_state_observer.observe(node, { attributes: true, attributeFilter: ["style", "class"] });
        				});

        				if (this.cart.$cart_items_wrapper?.[0]) {
        					this.__wmn_cart_items_observer = new MutationObserver(schedule_sync);
        					this.__wmn_cart_items_observer.observe(this.cart.$cart_items_wrapper[0], {
        						childList: true,
        						subtree: true,
        						characterData: true,
        					});
        				}

        				window.addEventListener("resize", () => {
        					if (window.innerWidth > 720) this.wmn_close_cart_drawer();
        					this.wmn_sync_cart_context();
        				}, { passive: true });
        			},

        wmn_restore_cart_width() {
        				let saved = 0;
        				try {
        					saved = parseFloat(window.localStorage.getItem("wmn_pos_cart_width") || "0");
        				} catch (e) {}
        				if (Number.isFinite(saved) && saved >= 300 && saved <= 620) {
        					this.$mamsek_shell?.[0]?.style.setProperty("--wmn-cart-width", `${saved}px`);
        				}
        			},

        wmn_bind_cart_resizer() {
        				const handle = this.$wmn_cart_resizer?.[0];
        				const cart_el = this.cart?.$component?.[0];
        				const app_el = this.$components_wrapper?.[0];
        				if (!handle || !cart_el || !app_el) return;

        				let start_x = 0;
        				let start_width = 0;
        				let cart_on_right = true;

        				const clamp_width = (value) => {
        					const app_width = app_el.getBoundingClientRect().width || window.innerWidth;
        					const max_width = Math.max(300, Math.min(620, app_width - 420));
        					return Math.min(max_width, Math.max(300, value));
        				};

        				const apply_width = (value, save) => {
        					const width = clamp_width(value);
        					this.$mamsek_shell?.[0]?.style.setProperty("--wmn-cart-width", `${width}px`);
        					if (save) {
        						try { window.localStorage.setItem("wmn_pos_cart_width", String(Math.round(width))); } catch (e) {}
        					}
        					return width;
        				};

        				const on_move = (event) => {
        					if (!start_width) return;
        					const delta = cart_on_right ? (start_x - event.clientX) : (event.clientX - start_x);
        					apply_width(start_width + delta, false);
        				};

        				const on_up = () => {
        					if (!start_width) return;
        					start_width = 0;
        					document.body.classList.remove("wmn-cart-is-resizing");
        					const width = cart_el.getBoundingClientRect().width;
        					apply_width(width, true);
        					window.removeEventListener("pointermove", on_move);
        					window.removeEventListener("pointerup", on_up);
        				};

        				handle.addEventListener("pointerdown", (event) => {
        					if (window.innerWidth <= 720) return;
        					event.preventDefault();
        					const app_rect = app_el.getBoundingClientRect();
        					const cart_rect = cart_el.getBoundingClientRect();
        					cart_on_right = cart_rect.left >= app_rect.left + (app_rect.width / 2);
        					start_x = event.clientX;
        					start_width = cart_rect.width;
        					document.body.classList.add("wmn-cart-is-resizing");
        					window.addEventListener("pointermove", on_move);
        					window.addEventListener("pointerup", on_up, { once: true });
        				});

        				handle.addEventListener("dblclick", () => {
        					try { window.localStorage.removeItem("wmn_pos_cart_width"); } catch (e) {}
        					this.$mamsek_shell?.[0]?.style.removeProperty("--wmn-cart-width");
        				});
        			},


        async change_item_quantity_from_selector(item, delta) {
        				if (!delta) return;

        				if (delta > 0) {
        					return this.on_cart_update({ field: "qty", value: "+1", item });
        				}

        				const item_row = this.get_item_from_frm(item);
        				if ($.isEmptyObject(item_row)) return;

        				const next_qty = Math.max(0, flt(item_row.qty) - 1);
        				const isOfflineFlow = wmn_controller_uses_offline_flow(this);
        				let commercialStateRefreshed = false;

        				frappe.dom.freeze();
        				try {
        					if (next_qty > 0 || isOfflineFlow) {
        						await wmn_pos_set_value(item_row.doctype, item_row.name, "qty", next_qty);
        					}

        					if (next_qty === 0) {
        						frappe.model.clear_doc(item_row.doctype, item_row.name);
        						this.update_cart_html(item_row, true);

        						if (isOfflineFlow && typeof this.wmn_remove_offline_item_detail_row === "function") {
        							await this.wmn_remove_offline_item_detail_row(item_row);
        							commercialStateRefreshed = true;
        						}
        					} else {
        						this.update_cart_html(item_row, false);
        					}

        					if (!commercialStateRefreshed) {
        						await this.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });
        					}
                        this.item_selector.sync_card_quantities();
        				} finally {
        					frappe.dom.unfreeze();
        				}
        			},

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

        						const allowNegativeStock = cint(this.allow_negative_stock || 0) === 1 || cint(item_row.allow_negative_stock || item.allow_negative_stock || 0) === 1;
        						if (!allowNegativeStock) {
        							const qty_needed = next_quantity * flt(item_row.conversion_factor || 1);
        							await this.check_stock_availability(item_row, qty_needed, this.frm.doc.set_warehouse);
        						}

        						await wmn_pos_set_value(item_row.doctype, item_row.name, "qty", next_quantity);
        						this.update_cart_html(item_row);
        					} else {
        						let quantity_to_remove = current_quantity - target_quantity;

        						for (const item_row of [...item_rows].reverse()) {
        							if (quantity_to_remove <= 0) break;
        							const row_quantity = flt(item_row.qty);
        							const next_quantity = Math.max(0, row_quantity - quantity_to_remove);
        							quantity_to_remove -= row_quantity - next_quantity;

        							if (next_quantity > 0 || wmn_controller_uses_offline_flow(this)) {
        								await wmn_pos_set_value(item_row.doctype, item_row.name, "qty", next_quantity);
        							}
        							if (next_quantity === 0) frappe.model.clear_doc(item_row.doctype, item_row.name);
        							this.update_cart_html(item_row, next_quantity === 0);
        						}
        					}
        				} catch (error) {
        					console.error(error);
        				} finally {
        					frappe.dom.unfreeze();
        					await this.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });
                        this.item_selector?.sync_card_quantities();
        				}

        				return item_rows[0];
        			},



    };

    const FinalMethods = Object.create(null);
    FinalMethods.init_item_details = UIMethods.init_item_details || CoreMethods.init_item_details;
    FinalMethods.wmn_handle_item_details_visibility = UIMethods.wmn_handle_item_details_visibility || CoreMethods.wmn_handle_item_details_visibility;
    FinalMethods.init_item_cart = UIMethods.init_item_cart || CoreMethods.init_item_cart;
    FinalMethods.wmn_sync_item_stock_map = UIMethods.wmn_sync_item_stock_map || CoreMethods.wmn_sync_item_stock_map;
    FinalMethods.wmn_cache = UIMethods.wmn_cache || CoreMethods.wmn_cache;
    FinalMethods.wmn_is_offline = UIMethods.wmn_is_offline || CoreMethods.wmn_is_offline;
    FinalMethods.fetch_opening_entry = UIMethods.fetch_opening_entry || CoreMethods.fetch_opening_entry;
    FinalMethods.check_opening_entry = UIMethods.check_opening_entry || CoreMethods.check_opening_entry;
    FinalMethods.create_opening_voucher = UIMethods.create_opening_voucher || CoreMethods.create_opening_voucher;
    FinalMethods.prepare_app_defaults = UIMethods.prepare_app_defaults || CoreMethods.prepare_app_defaults;
    FinalMethods.wmn_start_offline_preload = UIMethods.wmn_start_offline_preload || CoreMethods.wmn_start_offline_preload;
    FinalMethods.get_item_from_frm = UIMethods.get_item_from_frm || CoreMethods.get_item_from_frm;
    FinalMethods.update_cart_html = UIMethods.update_cart_html || CoreMethods.update_cart_html;
    FinalMethods.wmn_restore_default_customer_for_new_transaction = UIMethods.wmn_restore_default_customer_for_new_transaction || CoreMethods.wmn_restore_default_customer_for_new_transaction;
    FinalMethods.make_new_invoice = UIMethods.make_new_invoice || CoreMethods.make_new_invoice;
    FinalMethods.wmn_register_offline_row_in_frappe_model = UIMethods.wmn_register_offline_row_in_frappe_model || CoreMethods.wmn_register_offline_row_in_frappe_model;
    FinalMethods.wmn_ensure_offline_item_stock_map = UIMethods.wmn_ensure_offline_item_stock_map || CoreMethods.wmn_ensure_offline_item_stock_map;
    FinalMethods.wmn_ensure_item_stock_map_for_cart_rows = UIMethods.wmn_ensure_item_stock_map_for_cart_rows || CoreMethods.wmn_ensure_item_stock_map_for_cart_rows;
    FinalMethods.wmn_ensure_item_stock_map_for_item_details = UIMethods.wmn_ensure_item_stock_map_for_item_details || CoreMethods.wmn_ensure_item_stock_map_for_item_details;
    FinalMethods.edit_item_details_of = UIMethods.edit_item_details_of || CoreMethods.edit_item_details_of;
    FinalMethods.wmn_get_active_offline_item_detail_row = UIMethods.wmn_get_active_offline_item_detail_row || CoreMethods.wmn_get_active_offline_item_detail_row;
    FinalMethods.wmn_apply_offline_item_detail_value = UIMethods.wmn_apply_offline_item_detail_value || CoreMethods.wmn_apply_offline_item_detail_value;
    FinalMethods.wmn_refresh_offline_cart_from_item_detail = UIMethods.wmn_refresh_offline_cart_from_item_detail || CoreMethods.wmn_refresh_offline_cart_from_item_detail;
    FinalMethods.wmn_remove_offline_item_detail_row = UIMethods.wmn_remove_offline_item_detail_row || CoreMethods.wmn_remove_offline_item_detail_row;
    FinalMethods.wmn_clear_cart = UIMethods.wmn_clear_cart || CoreMethods.wmn_clear_cart;
    FinalMethods.remove_item_from_cart = UIMethods.remove_item_from_cart || CoreMethods.remove_item_from_cart;
    FinalMethods.update_item_field = UIMethods.update_item_field || CoreMethods.update_item_field;
    FinalMethods.get_available_stock = UIMethods.get_available_stock || CoreMethods.get_available_stock;
    FinalMethods.check_serial_no_availablilty = UIMethods.check_serial_no_availablilty || CoreMethods.check_serial_no_availablilty;
    FinalMethods.check_stock_availability = UIMethods.check_stock_availability || CoreMethods.check_stock_availability;
    FinalMethods.on_cart_update = UIMethods.on_cart_update || CoreMethods.on_cart_update;
    FinalMethods.wmn_restore_online_uom_after_super = UIMethods.wmn_restore_online_uom_after_super || CoreMethods.wmn_restore_online_uom_after_super;
    FinalMethods.wmn_restore_online_batch_price_after_super = UIMethods.wmn_restore_online_batch_price_after_super || CoreMethods.wmn_restore_online_batch_price_after_super;
    FinalMethods.wmn_get_child_doctype = UIMethods.wmn_get_child_doctype || CoreMethods.wmn_get_child_doctype;
    FinalMethods.wmn_recalculate_offline_totals = UIMethods.wmn_recalculate_offline_totals || CoreMethods.wmn_recalculate_offline_totals;
    FinalMethods.wmn_offline_get_full_item = UIMethods.wmn_offline_get_full_item || CoreMethods.wmn_offline_get_full_item;
    FinalMethods.wmn_prepare_online_batch_args_before_super = UIMethods.wmn_prepare_online_batch_args_before_super || CoreMethods.wmn_prepare_online_batch_args_before_super;
    FinalMethods.wmn_apply_online_batch_after_cart_update = UIMethods.wmn_apply_online_batch_after_cart_update || CoreMethods.wmn_apply_online_batch_after_cart_update;
    FinalMethods.wmn_offline_on_cart_update = UIMethods.wmn_offline_on_cart_update || CoreMethods.wmn_offline_on_cart_update;
    FinalMethods.wmn_finalize_offline_invoice = UIMethods.wmn_finalize_offline_invoice || CoreMethods.wmn_finalize_offline_invoice;
    FinalMethods.save_and_checkout = UIMethods.save_and_checkout || CoreMethods.save_and_checkout;
    FinalMethods.make_sales_invoice_frm = UIMethods.make_sales_invoice_frm || CoreMethods.make_sales_invoice_frm;
    FinalMethods.make_return_invoice = UIMethods.make_return_invoice || CoreMethods.make_return_invoice;
    FinalMethods.get_new_frm = UIMethods.get_new_frm || CoreMethods.get_new_frm;
    FinalMethods.set_pos_profile_data = UIMethods.set_pos_profile_data || CoreMethods.set_pos_profile_data;
    FinalMethods.wmn_can_sell_on_credit = UIMethods.wmn_can_sell_on_credit || CoreMethods.wmn_can_sell_on_credit;
    FinalMethods.wmn_refresh_sell_on_credit_button = UIMethods.wmn_refresh_sell_on_credit_button || CoreMethods.wmn_refresh_sell_on_credit_button;
    FinalMethods.wmn_setup_sell_on_credit_button = UIMethods.wmn_setup_sell_on_credit_button || CoreMethods.wmn_setup_sell_on_credit_button;
    FinalMethods.wmn_sell_on_credit = UIMethods.wmn_sell_on_credit || CoreMethods.wmn_sell_on_credit;
    FinalMethods.wmn_submit_online_invoice = UIMethods.wmn_submit_online_invoice || CoreMethods.wmn_submit_online_invoice;
    FinalMethods.wmn_send_to_cashier = UIMethods.wmn_send_to_cashier || CoreMethods.wmn_send_to_cashier;
    FinalMethods.init_payments = UIMethods.init_payments || CoreMethods.init_payments;
    FinalMethods.wmn_bind_offline_receipt_buttons = UIMethods.wmn_bind_offline_receipt_buttons || CoreMethods.wmn_bind_offline_receipt_buttons;
    FinalMethods.wmn_open_scanned_draft_for_payment = UIMethods.wmn_open_scanned_draft_for_payment || CoreMethods.wmn_open_scanned_draft_for_payment;
    FinalMethods.wmn_route_scanned_invoice = UIMethods.wmn_route_scanned_invoice || CoreMethods.wmn_route_scanned_invoice;
    FinalMethods.init_recent_order_list = UIMethods.init_recent_order_list || CoreMethods.init_recent_order_list;
    FinalMethods.init_order_summary = UIMethods.init_order_summary || CoreMethods.init_order_summary;
    FinalMethods.prepare_dom = UIMethods.prepare_dom || CoreMethods.prepare_dom;
    FinalMethods.init_item_selector = UIMethods.init_item_selector || CoreMethods.init_item_selector;
    FinalMethods.wmn_setup_adaptive_cart_ui = UIMethods.wmn_setup_adaptive_cart_ui || CoreMethods.wmn_setup_adaptive_cart_ui;
    FinalMethods.wmn_set_item_details_modal_open = UIMethods.wmn_set_item_details_modal_open || CoreMethods.wmn_set_item_details_modal_open;
    FinalMethods.wmn_open_cart_drawer = UIMethods.wmn_open_cart_drawer || CoreMethods.wmn_open_cart_drawer;
    FinalMethods.wmn_close_cart_drawer = UIMethods.wmn_close_cart_drawer || CoreMethods.wmn_close_cart_drawer;
    FinalMethods.wmn_update_cart_fab = UIMethods.wmn_update_cart_fab || CoreMethods.wmn_update_cart_fab;
    FinalMethods.wmn_sync_cart_context = UIMethods.wmn_sync_cart_context || CoreMethods.wmn_sync_cart_context;
    FinalMethods.wmn_setup_cart_state_observers = UIMethods.wmn_setup_cart_state_observers || CoreMethods.wmn_setup_cart_state_observers;
    FinalMethods.wmn_restore_cart_width = UIMethods.wmn_restore_cart_width || CoreMethods.wmn_restore_cart_width;
    FinalMethods.wmn_bind_cart_resizer = UIMethods.wmn_bind_cart_resizer || CoreMethods.wmn_bind_cart_resizer;
    FinalMethods.change_item_quantity_from_selector = UIMethods.change_item_quantity_from_selector || CoreMethods.change_item_quantity_from_selector;
    FinalMethods.set_item_quantity_from_selector = UIMethods.set_item_quantity_from_selector || CoreMethods.set_item_quantity_from_selector;

    const initializeCore = function (wrapper) {
                
                        this.__wmn_pos_version = "v15";
                        this.settings = wmn_safe_settings(this.settings || {});
                        this.wmn_start_offline_preload();
            
    };
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.OverrideMethods.Controller = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
