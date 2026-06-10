/*
 * WMN_Controller_v15_VERIFIED_RESTORED.js
 * Built from original pos_offline/WMN_Controller.js.
 * All original project methods/features are preserved; only offline server/form paths are guarded.
 */
        function wmn_prepare_pos_frm_doc(ctrl) {
            if (!ctrl || !ctrl.frm || !ctrl.frm.doc) return;

            const doc = ctrl.frm.doc;
            const settings = ctrl.settings || {};
            const invoiceDoctype = wmn_pos_invoice_doctype(ctrl);

            doc.items = doc.items || [];
            doc.is_pos = 1;
            doc.update_stock = doc.update_stock === undefined ? 1 : doc.update_stock;
            doc.pos_profile = doc.pos_profile || settings.pos_profile || ctrl.pos_profile || "";
            doc.set_warehouse = doc.set_warehouse || settings.warehouse || "";
            doc.selling_price_list = doc.selling_price_list || settings.selling_price_list || "";
            doc.customer = doc.customer || settings.customer || "";
            doc.doctype = doc.doctype || invoiceDoctype;

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

        function wmn_install_v1595_sales_invoice_events() {
            if (window.__wmn_v1595_sales_invoice_events_installed) return;

            // ERPNext POS in v15.95 still has POS Invoice Item model events.
            // Add matching Sales Invoice Item event so item detail/cart refresh works in Sales Invoice mode.
            try {
                frappe.model.on("Sales Invoice Item", "*", (fieldname, value, item_row) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || !pos.frm.doc || pos.frm.doc.doctype !== "Sales Invoice") return;
                    if (!item_row || item_row.doctype !== "Sales Invoice Item") return;
                    if (!pos.item_details) return;

                    const field_control = pos.item_details[`${fieldname}_control`];
                    const is_current =
                        pos.item_details.compare_with_current_item &&
                        pos.item_details.compare_with_current_item(item_row);

                    if (is_current && field_control && field_control.get_value() !== value) {
                        field_control.set_value(value);
                        pos.update_cart_html(item_row);
                    }
                });
            } catch (e) {
                console.warn("WMN v15.95 Sales Invoice Item event bind failed", e);
            }

            try {
                frappe.ui.form.on("Sales Invoice", "paid_amount", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;

                    if (pos.cart && pos.cart.update_totals_section) {
                        pos.cart.update_totals_section(frm);
                    }
                    if (pos.payment && pos.payment.update_totals_section) {
                        pos.payment.update_totals_section(frm.doc);
                    }
                    if (pos.payment && pos.payment.render_payment_mode_dom) {
                        pos.payment.render_payment_mode_dom();
                    }
                });

                frappe.ui.form.on("Sales Invoice", "loyalty_amount", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;
                    if (!pos.payment || !pos.payment.$payment_modes) return;

                    const formatted_currency = format_currency(frm.doc.loyalty_amount, frm.doc.currency);
                    pos.payment.$payment_modes.find(`.loyalty-amount-amount`).html(formatted_currency);
                });

                frappe.ui.form.on("Sales Invoice", "contact_mobile", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;
                    if (!pos.payment || !pos.payment.request_for_payment_field) return;

                    const contact = frm.doc.contact_mobile;
                    const request_button = $(pos.payment.request_for_payment_field?.$input?.[0]);
                    if (contact) {
                        request_button.removeClass("btn-default").addClass("btn-primary");
                    } else {
                        request_button.removeClass("btn-primary").addClass("btn-default");
                    }
                });

                frappe.ui.form.on("Sales Invoice", "coupon_code", (frm) => {
                    const pos = window.cur_pos;
                    if (!pos || !pos.frm || pos.frm.doc.name !== frm.doc.name) return;

                    if (frm.doc.coupon_code && !frm.applying_pos_coupon_code) {
                        if (!frm.doc.ignore_pricing_rule) {
                            frm.applying_pos_coupon_code = true;
                            frappe.run_serially([
                                () => (frm.doc.ignore_pricing_rule = 1),
                                () => frm.trigger("ignore_pricing_rule"),
                                () => (frm.doc.ignore_pricing_rule = 0),
                                () => frm.trigger("apply_pricing_rule"),
                                () => frm.save(),
                                () => pos.payment && pos.payment.update_totals_section && pos.payment.update_totals_section(frm.doc),
                                () => (frm.applying_pos_coupon_code = false),
                            ]);
                        } else {
                            frappe.show_alert({
                                message: __("Ignore Pricing Rule is enabled. Cannot apply coupon code."),
                                indicator: "orange",
                            });
                        }
                    }
                });
            } catch (e) {
                console.warn("WMN v15.95 Sales Invoice form event bind failed", e);
            }

            window.__wmn_v1595_sales_invoice_events_installed = true;
        }

        function wmn_install_v1595_cart_customer_transactions_patch() {
            if (window.__wmn_v1595_cart_customer_transactions_patch) return;

            const Cart = erpnext.PointOfSale && erpnext.PointOfSale.ItemCart;
            if (!Cart || !Cart.prototype || typeof Cart.prototype.fetch_customer_transactions !== "function") return;

            const original = Cart.prototype.fetch_customer_transactions;

            Cart.prototype.fetch_customer_transactions = function() {
                const pos = window.cur_pos;
                const invoiceDoctype = wmn_pos_invoice_doctype(pos);

                if (invoiceDoctype !== "Sales Invoice") {
                    return original.apply(this, arguments);
                }

                if (!this.customer_info || !this.customer_info.customer) {
                    return original.apply(this, arguments);
                }

                frappe.db
                    .get_list("Sales Invoice", {
                        filters: {
                            customer: this.customer_info.customer,
                            docstatus: 1,
                            is_pos: 1,
                        },
                        fields: ["name", "grand_total", "status", "posting_date", "posting_time", "currency"],
                        limit: 20,
                    })
                    .then((res) => {
                        const transaction_container = this.$customer_section.find(".customer-transactions");

                        if (!res.length) {
                            transaction_container.html(`<div class="no-transactions-placeholder">No recent transactions found</div>`);
                            return;
                        }

                        const elapsed_time = moment(res[0].posting_date + " " + res[0].posting_time).fromNow();
                        this.$customer_section.find(".customer-desc").html(`Last transacted ${elapsed_time}`);
                        transaction_container.html("");

                        res.forEach((invoice) => {
                            const posting_datetime = moment(invoice.posting_date + " " + invoice.posting_time).format("Do MMMM, h:mma");
                            const indicator_color = {
                                Paid: "green",
                                Draft: "red",
                                Return: "gray",
                                Consolidated: "blue",
                            };

                            transaction_container.append(
                                `<div class="invoice-wrapper" data-invoice-name="${escape(invoice.name)}">
                                    <div class="invoice-name-date">
                                        <div class="invoice-name">${invoice.name}</div>
                                        <div class="invoice-date">${posting_datetime}</div>
                                    </div>
                                    <div class="invoice-total-status">
                                        <div class="invoice-total">
                                            ${format_currency(invoice.grand_total, invoice.currency, 0) || 0}
                                        </div>
                                        <div class="invoice-status">
                                            <span class="indicator-pill whitespace-nowrap ${indicator_color[invoice.status] || "gray"}">
                                                <span>${invoice.status}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="seperator"></div>`
                            );
                        });
                    });
            };

            window.__wmn_v1595_cart_customer_transactions_patch = true;
        }

        function wmn_install_v1595_pos_compatibility() {
            wmn_install_v1595_sales_invoice_events();
            wmn_install_v1595_cart_customer_transactions_patch();
        }
        function wmn_as_frappe_call_like(promise) {
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
                    uom: item.uom || item.stock_uom || "",
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
                                                const defaultQty = Math.min(flt(item.qty || 1), availableQty || 1) || 1;
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
                                                                max="${availableQty}"
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

                    if (qty > flt(selected.actual_qty || 0)) {
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
class MyPOSController extends erpnext.PointOfSale.Controller {

        init_item_details() {
            const result = super.init_item_details();
            this.wmn_install_item_stock_map_bridge();
            return result;
        }

        init_item_cart() {
            const result = super.init_item_cart();

            try {
                if (this.cart && this.cart.events && !this.cart.events.__wmn_item_stock_map_click_wrapped) {
                    const original_cart_item_clicked = this.cart.events.cart_item_clicked;

                    this.cart.events.cart_item_clicked = (item) => {
                        const item_row = this.get_item_from_frm ? this.get_item_from_frm(item) : item;
                        this.wmn_ensure_item_stock_map_for_cart_rows();
                        this.wmn_ensure_item_stock_map_for_item_details(item_row);
                        this.wmn_install_item_stock_map_bridge();

                        if (typeof original_cart_item_clicked === "function") {
                            return original_cart_item_clicked(item);
                        }

                        if (this.item_details && this.item_details.toggle_item_details_section) {
                            return this.item_details.toggle_item_details_section(item_row);
                        }
                    };

                    this.cart.events.__wmn_item_stock_map_click_wrapped = true;
                }
            } catch (e) {
                console.warn("WMN cart item_stock_map click bridge skipped", e);
            }

            return result;
        }

        wmn_install_item_stock_map_bridge() {
            try {
                this.item_stock_map = this.item_stock_map || {};

                if (!this.item_details) return;

                this.item_details.item_stock_map = this.item_stock_map;

                if (this.item_details.events && !this.item_details.events.__wmn_item_stock_map_getter_wrapped) {
                    const original_get_item_stock_map = this.item_details.events.get_item_stock_map;

                    this.item_details.events.get_item_stock_map = () => {
                        this.wmn_ensure_item_stock_map_for_cart_rows();
                        this.item_details.item_stock_map = this.item_stock_map || {};

                        const original_map = typeof original_get_item_stock_map === "function"
                            ? (original_get_item_stock_map() || {})
                            : {};

                        this.item_stock_map = Object.assign({}, original_map, this.item_stock_map || {});
                        this.item_details.item_stock_map = this.item_stock_map;
                        return this.item_stock_map;
                    };

                    this.item_details.events.__wmn_item_stock_map_getter_wrapped = true;
                }
            } catch (e) {
                console.warn("WMN item_stock_map bridge install skipped", e);
            }
        }

            constructor(wrapper) {
                super(wrapper);
                this.__wmn_pos_version = "v15";
                this.settings = wmn_safe_settings(this.settings || {});
                wmn_install_v1595_pos_compatibility();
                this.wmn_start_offline_preload();
            }


            wmn_cache() {
                if (!this.__wmn_controller_cache) {
                    this.__wmn_controller_cache = new window.WMNPOSControllerCache(this, this.__wmn_pos_version || "");
                }
                return this.__wmn_controller_cache;
            }

            wmn_is_offline() {
                if (typeof wmn_controller_uses_offline_flow === "function") {
                    return !!wmn_controller_uses_offline_flow(this);
                }
                return this.wmn_cache().isOffline();
            }

            fetch_opening_entry() {
                if (!this.wmn_is_offline()) return super.fetch_opening_entry();
                return this.wmn_cache().fetchOpeningEntryCallLike();
            }

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
            }

            create_opening_voucher() {
                if (!this.wmn_is_offline()) return super.create_opening_voucher();
                frappe.show_alert({
                    message: __("Cannot create POS Opening Entry while offline. Use a cached opening entry."),
                    indicator: "red",
                });
                return Promise.resolve();
            }

            async prepare_app_defaults(data) {
                if (!this.wmn_is_offline()) return await super.prepare_app_defaults(data);

                this.pos_opening = data.name;
                this.company = data.company;
                this.pos_profile = data.pos_profile;
                this.pos_opening_time = data.period_start_date || data.creation || frappe.datetime.now_datetime();
                this.item_stock_map = this.item_stock_map || {};
                this.settings = wmn_safe_settings(this.settings || {});

                const stockSettings = await this.wmn_cache().getStockSettings();
                this.allow_negative_stock = flt(stockSettings.allow_negative_stock) || false;

                const profile = await this.wmn_cache().getPOSProfileData(this.pos_profile);
                Object.assign(this.settings, profile || {});
                this.settings.customer_groups = (this.settings.customer_groups || []).map((group) => group.name || group);
                
                const { message } = await this.wmn_cache().getStockSettingsValue("allow_negative_stock");

                this.allow_negative_stock = cint(message?.allow_negative_stock || 0) === 1;
                return this.make_app();
            }

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
            }
            wmn_detach_current_frm_refresh_fields() {
                try {
                    if (this.frm && this.frm.wrapper && window.jQuery) {
                        $(this.frm.wrapper).off("refresh-fields");
                    }
                } catch (e) {}
            }

            get_item_from_frm(item) {
                if (!wmn_controller_uses_offline_flow(this)) {
                    return super.get_item_from_frm(item);
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
                        if (batchNo && String(row.batch_no || "") !== batchNo) return false;
                        if (serialNo && String(row.serial_no || "") !== serialNo) return false;
                        if (uom && String(row.uom || row.stock_uom || "") !== uom) return false;
                        if (warehouse && String(row.warehouse || "") !== warehouse) return false;
                        return true;
                    }) || null;
                }

                return null;
            }

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

                return super.update_cart_html(item, remove_item);
            }

            async make_new_invoice() {
                this.wmn_detach_current_frm_refresh_fields();
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

                    return this.frm;
                }

                const result = await super.make_new_invoice();

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

                return result;
            }
            
            

            wmn_register_offline_row_in_frappe_model(row) {
            if (!row || !row.doctype || !row.name) return row;

            frappe.locals = frappe.locals || {};
            frappe.locals[row.doctype] = frappe.locals[row.doctype] || {};
            frappe.locals[row.doctype][row.name] = row;

            return row;
        }

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
        }

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
        }

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
        }

        edit_item_details_of(item_row) {
            this.wmn_ensure_item_stock_map_for_cart_rows();
            this.wmn_ensure_item_stock_map_for_item_details(item_row);
            this.wmn_install_item_stock_map_bridge();
            return super.edit_item_details_of(item_row);
        }


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
        }

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
        }

        wmn_refresh_offline_cart_from_item_detail(row) {
            if (!row || !this.frm || !this.frm.doc) return;

            try {
                this.wmn_register_offline_row_in_frappe_model(row);
                this.wmn_ensure_offline_item_stock_map(row);
            } catch (e) {}

            try {
                this.wmn_recalculate_offline_totals();
            } catch (e) {
                console.warn("WMN offline detail recalc skipped", e);
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
        }


        wmn_remove_offline_item_detail_row(row) {
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
                this.wmn_recalculate_offline_totals();
            } catch (e) {
                console.warn("WMN offline remove recalc skipped", e);
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
        }

        update_item_field(value, field_or_action) {
            const result = super.update_item_field(value, field_or_action);

            try {
                if (!(wmn_is_pos_offline())) {
                    return result;
                }

                if (field_or_action === "remove") {
                    setTimeout(() => {
                        try {
                            const row = this.wmn_get_active_offline_item_detail_row();
                            if (row) {
                                this.wmn_remove_offline_item_detail_row(row);
                            }
                        } catch (e) {
                            console.warn("WMN offline numpad remove sync skipped", e);
                        }
                    }, 0);
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
        }

            async check_stock_availability(item, qty, warehouse) {
                const target_warehouse = warehouse || (this.settings ? this.settings.warehouse : null);
                if (!target_warehouse) return true;

                if (wmn_controller_uses_offline_flow(this) && window.wmnPOSOffline) {
                    const stock_row = await window.wmnPOSOffline.getStock(item.item_code, target_warehouse);
                    return flt(stock_row ? stock_row.actual_qty : 0) >= flt(qty || 0);
                }

                return frappe.call({
                    method: "erpnext.accounts.doctype.pos_invoice.pos_invoice.get_stock_availability",
                    args: {
                        item_code: item.item_code,
                        warehouse: target_warehouse
                    }
                }).then(r => (r.message || 0) >= qty);
            }

            async on_cart_update(args) {
                if (wmn_is_pos_offline()) {
                    return this.wmn_offline_on_cart_update(args);
                }
                console.log(args);

                args = await this.wmn_prepare_online_batch_args_before_super(args);

                const wmn_batch_item = (args && args.item && args.item.__wmn_batch_dialog_done)
                    ? Object.assign({}, args.item)
                    : null;

                const item_row = await super.on_cart_update(args);

                if (wmn_batch_item && item_row) {
                    await this.wmn_restore_online_batch_price_after_super(item_row, wmn_batch_item);
                }

                return item_row;
            }

            async wmn_restore_online_batch_price_after_super(item_row, item) {
                try {
                    if (!item_row || !item_row.doctype || !item_row.name || !item) return item_row;
                    if (!item.__wmn_batch_dialog_done) return item_row;

                    const rate = flt(item.rate || item.price_list_rate || 0);
                    if (rate <= 0) return item_row;

                    if (item.batch_no && item_row.batch_no !== item.batch_no) {
                        await frappe.model.set_value(item_row.doctype, item_row.name, "batch_no", item.batch_no);
                    }

                    if (item.warehouse && item_row.warehouse !== item.warehouse) {
                        await frappe.model.set_value(item_row.doctype, item_row.name, "warehouse", item.warehouse);
                    }

                    if (flt(item.qty || 0) > 0 && flt(item_row.qty || 0) !== flt(item.qty || 0)) {
                        await frappe.model.set_value(item_row.doctype, item_row.name, "qty", flt(item.qty || 0));
                    }

                    if (flt(item_row.price_list_rate || 0) !== rate) {
                        await frappe.model.set_value(item_row.doctype, item_row.name, "price_list_rate", rate);
                    }

                    if (flt(item_row.rate || 0) !== rate) {
                        await frappe.model.set_value(item_row.doctype, item_row.name, "rate", rate);
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
            }

    


            wmn_get_child_doctype() {
                if (this.frm && this.frm.doc && this.frm.doc.doctype === "Sales Invoice") {
                    return "Sales Invoice Item";
                }
                return "POS Invoice Item";
            }

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
            }

            async wmn_offline_get_full_item(item) {
                const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                const settings = this.settings || {};
                const price_list = doc.selling_price_list || settings.selling_price_list || "";
                const item_code = item && item.item_code;
                if (!item_code) return item || {};

                const offlineItem = await window.wmnPOSOffline.findItem(item_code, price_list);
                return Object.assign({}, offlineItem || {}, item || {});
            }

async wmn_prepare_online_batch_args_before_super(args) {
    try {
        if (!args || !args.item) return args;

        const batchValue = args.item.batch_no;

        const needsBatchDialog =
            batchValue !== undefined &&
            batchValue !== null &&
            String(batchValue) !== "" &&
            String(batchValue).toLowerCase() !== "null" &&
            !args.item.__wmn_batch_dialog_done;

        if (!needsBatchDialog) return args;

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

        args.item.__wmn_batch_dialog_done = 1;

        if (!selected) {
            return args;
        }

        args.item.batch_no = selected.batch_no;

        const selectedQty = flt(selected.__selected_qty || 0);
        if (selectedQty > 0) {
            args.field = "qty";
            args.value = selectedQty;
            args.item.qty = selectedQty;
        }

        const selectedRate = flt(
            selected.price_list_rate ||
            selected.rate ||
            args.item.price_list_rate ||
            args.item.rate ||
            (args.item.item_data && (args.item.item_data.price_list_rate || args.item.item_data.rate)) ||
            0
        );
        if (selectedRate > 0) {
            args.item.rate = selectedRate;
            args.item.price_list_rate = selectedRate;
        }

        if (selected.uom && !args.item.uom) {
            args.item.uom = selected.uom;
        }

        if (selected.warehouse) {
            args.item.warehouse = selected.warehouse;
        }

        return args;

    } catch (e) {
        console.warn("WMN online batch args preparation skipped", e);
        return args;
    }
}

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

        await frappe.model.set_value(
            item_row.doctype,
            item_row.name,
            "batch_no",
            selected.batch_no
        );

        if (selected.__selected_qty) {
            await frappe.model.set_value(
                item_row.doctype,
                item_row.name,
                "qty",
                selected.__selected_qty
            );
        }

        const selectedRate = flt(selected.price_list_rate || selected.rate || 0);
        if (selectedRate > 0) {
            await frappe.model.set_value(
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
}




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

                    if (cint(item.has_batch_no || 0) && !cint(item.__wmn_batch_from_scan || 0)) {
                        const selectedBatch = await window.showBatchSelectionDialog(item, target_warehouse);

                        if (selectedBatch && selectedBatch.batch_no) {
                            item.batch_no = selectedBatch.batch_no;
                            item.warehouse = selectedBatch.warehouse || target_warehouse || item.warehouse || "";
                            item.actual_qty = flt(selectedBatch.actual_qty || item.actual_qty || 0);
                            item.qty = flt(selectedBatch.__selected_qty || item.qty || 1);
                            item.__wmn_selected_batch_qty = item.qty;
                            item = wmn_prepare_offline_item_detail_row(
                                item,
                                this.frm.doc,
                                this.settings || {}
                            );
                            const batch_rate = flt(
                                selectedBatch.price_list_rate ||
                                selectedBatch.rate ||
                                0
                            );

                            if (batch_rate > 0) {
                                item.price_list_rate = batch_rate;
                                item.rate = batch_rate;
                            } else {
                                item.price_list_rate = flt(item.price_list_rate || item.rate || 0);
                                item.rate = flt(item.rate || item.price_list_rate || 0);
                            }

                            if (selectedBatch.currency) {
                                item.currency = selectedBatch.currency;
                            }

                            if (selectedBatch.uom) {
                                item.uom = selectedBatch.uom;
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

                    // \u0644\u0627 \u062A\u0639\u0645\u0644 freeze \u0642\u0628\u0644 Dialog \u0627\u062E\u062A\u064A\u0627\u0631 Batch \u062D\u062A\u0649 \u0644\u0627 \u064A\u0635\u0628\u062D \u0627\u0644\u062F\u064A\u0627\u0644\u0648\u062C \u063A\u064A\u0631 \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u0641\u0627\u0639\u0644.
                    frappe.dom.freeze();
                    did_freeze = true;

                    if (cint(item.has_serial_no || 0) && !item.serial_no) {
                        const autoSerial = await findSerialOffline("", item.item_code, target_warehouse);
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

                        if (["qty", "conversion_factor"].includes(field) && value > 0 && !this.allow_negative_stock) {
                            const conversion = field === "conversion_factor" ? flt(value || 1) : flt(item_row.conversion_factor || 1);
                            const qty_needed = field === "qty" ? flt(value || 0) * conversion : flt(item_row.qty || 0) * conversion;
                            const ok = await this.check_stock_availability(item_row, qty_needed, item_row.warehouse || effective_warehouse);
                            if (!ok) {
                                frappe.show_alert({ message: __("\u0627\u0644\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
                                return item_row;
                            }
                        }

                        if (item && item.offline_item_tax_map && (!item_row.offline_item_tax_map || !Object.keys(wmn_parse_json_map(item_row.offline_item_tax_map)).length)) {
                            item_row.offline_item_tax_map = wmn_parse_json_map(item.offline_item_tax_map);
                            item_row.item_tax_rate = item_row.item_tax_rate || item_row.offline_item_tax_map;
                            item_row.item_tax_template = item_row.item_tax_template || item.item_tax_template || "";
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

                        const ok = this.allow_negative_stock ? true : await this.check_stock_availability(item, qty, effective_warehouse);
                        if (!ok) {
                            frappe.show_alert({ message: __("\u0627\u0644\u0643\u0645\u064A\u0629 \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
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
                            warehouse: effective_warehouse,
                            batch_no: item.batch_no,
                            serial_no: item.serial_no,
                            uom: item.uom || item.stock_uom || "Nos",
                            stock_uom: item.stock_uom || item.uom || "Nos",
                            conversion_factor: 1,
                            qty: qty,
                            stock_qty: qty,
                            price_list_rate: flt(item.price_list_rate || item.rate || 0),
                            rate: flt(item.rate || item.price_list_rate || 0),
                            amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                            net_rate: flt(item.rate || item.price_list_rate || 0),
                            net_amount: flt(qty) * flt(item.rate || item.price_list_rate || 0),
                            has_serial_no: item.has_serial_no || 0,
                            has_batch_no: item.has_batch_no || 0,
                            item_tax_template: item.item_tax_template || "",
                            offline_item_tax_map: wmn_parse_json_map(item.offline_item_tax_map || item.item_tax_rate || item.item_tax_map || {}),
                            item_tax_rate: wmn_parse_json_map(item.item_tax_rate || item.offline_item_tax_map || item.item_tax_map || {}),
                        });
                    }

                    item_row = wmn_normalize_offline_cart_row(item_row, this.frm.doc, (this.frm.doc.items || []).indexOf(item_row), effective_warehouse);
                    wmn_normalize_all_offline_cart_rows(this.frm.doc, effective_warehouse);
                    this.wmn_register_offline_row_in_frappe_model(item_row);
                    
                    
                    this.wmn_ensure_offline_item_stock_map(item_row);



                    this.wmn_recalculate_offline_totals();
                    this.frm.dirty();

                    if (this.cart && this.cart.load_invoice) {
                        //this.cart.load_invoice();
                        this.update_cart_html(item_row);
                    } else {
                        this.update_cart_html(item_row);
                    }

                    if (this.item_details && this.item_details.$component && this.item_details.$component.is(":visible")) {
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
            }

            async save_and_checkout() {
                if (wmn_controller_uses_offline_flow(this)) {
                    try {
                    
                    
                        this.wmn_recalculate_offline_totals();
                        

                        await wmn_show_offline_payment_dialog(this);

                        frappe.dom.freeze(wmn_t("Saving offline invoice...", "\u062C\u0627\u0631\u064A \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646..."));
                        // console.table(
                        //     (this.frm.doc.items || []).map(r => ({
                        //         item_code: r.item_code,
                        //         qty: r.qty,
                        //         batch_no: r.batch_no,
                        //         rate: r.rate,
                        //         amount: r.amount
                        //     }))
                        // );
                        await wmn_assign_receipt_number(this.frm.doc);
                        const previousOfflineInvoice = typeof wmn_get_existing_offline_invoice_for_stock === "function"
                            ? await wmn_get_existing_offline_invoice_for_stock(this.frm.doc)
                            : null;
                        const row = await window.wmnPOSOffline.saveInvoice(this.frm.doc, this);
                        if (typeof wmn_apply_offline_available_qty_delta === "function") {
                            await wmn_apply_offline_available_qty_delta(this.frm.doc, previousOfflineInvoice);
                        }
                        frappe.dom.unfreeze();

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
                    } catch (e) {
                        frappe.dom.unfreeze();

                        if ((e.message || e) === "cancelled") {
                            return;
                        }

                        console.error("Offline invoice payment/save failed", e);
                        frappe.msgprint({
                            title: wmn_t("Offline Save Failed", "\u0641\u0634\u0644 \u0627\u0644\u062D\u0641\u0638 \u0623\u0648\u0641\u0644\u0627\u064A\u0646"),
                            indicator: "red",
                            message: wmn_msg("Failed to save invoice offline: {0}", "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646: {0}", [e.message || e])
                        });
                        return;
                    }
                }

                return super.save_and_checkout();
            }
            async make_sales_invoice_frm() {
                const doctype = wmn_pos_invoice_doctype(this);

                // ERPNext 15.27 fix:
                // Offline must use the lightweight fake frm only.
                if (wmn_controller_uses_offline_flow(this)) {
                    const doc = await wmn_make_offline_invoice_doc(this);
                    this.frm = wmn_make_offline_frm(doc);
                    wmn_prepare_pos_frm_doc(this);
                    window.cur_frm = this.frm;
                    window.cur_pos = this;
                    return this.frm;
                }

                return new Promise((resolve) => {
                    const build = () => {
                        this.frm = this.get_new_frm(null, doctype);
                        wmn_prepare_pos_frm_doc(this);
                        resolve(this.frm);
                    };

                    frappe.model.with_doctype(doctype, build);
                });
            }

            async make_return_invoice(doc) {
                if (wmn_controller_uses_offline_flow(this)) {
                    const frm = await this.wmn_cache().makeReturnInvoiceOffline(doc);
                    this.frm = frm;
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
                        frappe.get_doc(r.message.doctype, r.message.name).__run_link_triggers = false;
                        this.set_pos_profile_data().then(() => {
                            frappe.dom.unfreeze();
                        });
                    },
                });
            }
            get_new_frm(_frm, doctype) {
                const target_doctype = doctype || wmn_pos_invoice_doctype(this);

                // Never create real ERPNext Form while effective offline.
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

                const page = $("<div>");
                const frm = new frappe.ui.form.Form(target_doctype, page, false);
                const name = frappe.model.make_new_doc_and_get_name(target_doctype, true);

                // ERPNext 15.27 Sales Invoice setup may touch child grid rows before POS finishes setup.
                // Guard only during the initial refresh, then restore immediately.
                const txProto = erpnext.TransactionController && erpnext.TransactionController.prototype;
                const originalSetFields = txProto && txProto.set_fields_onload_for_line_item;
                const shouldGuard = target_doctype === "Sales Invoice" && typeof originalSetFields === "function";

                try {
                    if (shouldGuard) {
                        txProto.set_fields_onload_for_line_item = function () { return; };
                    }
                    frm.refresh(name);
                } finally {
                    if (shouldGuard) {
                        txProto.set_fields_onload_for_line_item = originalSetFields;
                    }
                }

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
            }
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
            }

            init_payments() {
                super.init_payments();

                if (!this.payment || !this.payment.events) {
                    return;
                }

                this.payment.events.submit_invoice = async () => {
                    if (wmn_controller_uses_offline_flow(this)) {
                        return this.save_and_checkout();
                    }

                    try {
                        if (this.frm && this.frm.doc) {
                            await wmn_assign_receipt_number(this.frm.doc);
                        }

                        const r = await this.frm.savesubmit();
                        const submittedDoc = (r && r.doc) || (this.frm && this.frm.doc) || {};

                        submittedDoc.wmn_receipt_no = submittedDoc.wmn_receipt_no || (this.frm.doc && this.frm.doc.wmn_receipt_no) || (this.frm.doc && this.frm.doc.__wmn_receipt_no) || "";
                        submittedDoc.__wmn_receipt_no = submittedDoc.__wmn_receipt_no || submittedDoc.wmn_receipt_no || "";

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
                };
            }
            

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
            }

            init_recent_order_list() {
                this.recent_order_list = new erpnext.PointOfSale.PastOrderList({
                    wrapper: this.$components_wrapper,
                    events: {
                        open_invoice_data: (name) => {
                            if (wmn_controller_uses_offline_flow(this)) {
                                this.wmn_cache().getInvoiceFromCache(wmn_pos_invoice_doctype(this), name).then((doc) => {
                                    if (doc) this.order_summary.load_summary_of(doc, true);
                                    else frappe.show_alert({ message: __("Offline invoice not found in cache"), indicator: "orange" });
                                });
                                return;
                            }
                            frappe.db.get_doc(wmn_pos_invoice_doctype(this), name).then((doc) => {
                                this.order_summary.load_summary_of(doc);
                            });
                        },
                        reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
                    },
                });
            }

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

                                () => {
                                    if (window.__wmn_pos_effective_offline === true) {
                                        return null;
                                    }

                                    return this.cart && this.cart.load_invoice
                                        ? this.cart.load_invoice()
                                        : null;
                                },

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

        }

