/*
 * WMNItemDetails_v15_OFFLINE_SAFE.js
 * Safe override for ERPNext POS ItemDetails v15.
 * Online: original ERPNext ItemDetails behavior.
 * Offline: no server calls, no Link search/validation for UOM/Warehouse/Batch/Serial helpers.
 */
(function () {
    if (!window.erpnext || !erpnext.PointOfSale || !erpnext.PointOfSale.ItemDetails) {
        console.warn("WMN ItemDetails v15 override skipped: original ItemDetails not found");
        return;
    }

    const OriginalItemDetails = erpnext.PointOfSale.ItemDetails;

    function wmn_item_details_is_offline() {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos) {
                return !!wmn_controller_uses_offline_flow(window.cur_pos);
            }
        } catch (e) {}
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function wmn_safe_clone_df(df, fieldname) {
        const copy = Object.assign({}, df || { fieldname: fieldname, label: fieldname, fieldtype: "Data" });
        copy.fieldname = copy.fieldname || fieldname;
        if (["uom", "warehouse", "batch_no"].includes(fieldname)) {
            // Convert Link fields to Data in offline so no search_link / validate_link_and_fetch can run.
            copy.fieldtype = "Data";
            delete copy.options;
            delete copy.get_query;
            delete copy.link_filters;
            delete copy.fetch_from;
            delete copy.fetch_if_empty;
        }
        if (fieldname === "actual_qty") copy.read_only = 1;
        if (fieldname === "discount_percentage") copy.label = __("Discount (%)");
        return copy;
    }

    async function wmn_find_serial(searchValue, itemCode, warehouse) {
        if (typeof window.findSerialOffline === "function") {
            return await window.findSerialOffline(searchValue || "", itemCode || "", warehouse || "");
        }
        if (window.wmnPOSOffline && typeof window.wmnPOSOffline.findSerialOffline === "function") {
            return await window.wmnPOSOffline.findSerialOffline(searchValue || "", itemCode || "", warehouse || "");
        }
        return null;
    }

    erpnext.PointOfSale.ItemDetails = class WMNItemDetailsV15OfflineSafe extends OriginalItemDetails {
        render_form(item) {
            if (!wmn_item_details_is_offline()) {
                return super.render_form(item);
            }

            const fields_to_display = this.get_form_fields(item);
            this.$form_container.html("");

            fields_to_display.forEach((fieldname) => {
                this.$form_container.append(`<div class="${fieldname}-control" data-fieldname="${fieldname}"></div>`);

                const source_meta = (this.item_meta && this.item_meta.fields || []).find((df) => df.fieldname === fieldname);
                const field_meta = wmn_safe_clone_df(source_meta, fieldname);
                const me = this;

                this[`${fieldname}_control`] = frappe.ui.form.make_control({
                    df: {
                        ...field_meta,
                        onchange: function () {
                            me.wmn_offline_form_updated(fieldname, this.value);
                        },
                    },
                    parent: this.$form_container.find(`.${fieldname}-control`),
                    render_input: true,
                });

                const ctrl = this[`${fieldname}_control`];
                if (ctrl && ctrl.set_input) ctrl.set_input(item[fieldname] || "");
                else if (ctrl && ctrl.set_value) ctrl.set_value(item[fieldname]);
            });

            this.resize_serial_control(item);
            this.make_auto_serial_selection_btn(item);
            this.bind_custom_control_change_event();
        }

        async wmn_offline_form_updated(fieldname, value) {
            const pos = window.cur_pos;
            const row = this.item_row || this.current_item;
            try {
                if (pos && typeof pos.wmn_apply_offline_item_detail_value === "function" && typeof pos.wmn_refresh_offline_cart_from_item_detail === "function") {
                    pos.wmn_apply_offline_item_detail_value(row, fieldname, value);
                    pos.wmn_refresh_offline_cart_from_item_detail(row);
                    this.wmn_refresh_price_display(row);
                    return row;
                }
                if (this.events && typeof this.events.form_updated === "function") {
                    return await this.events.form_updated(this.current_item, fieldname, value);
                }
            } catch (e) {
                console.warn("WMN offline ItemDetails field update skipped", fieldname, e);
            }
            return row;
        }

        wmn_refresh_price_display(item_row) {
            try {
                const doc = this.events.get_frm().doc;
                if (item_row && this.$item_price) {
                    this.$item_price.html(format_currency(item_row.rate || item_row.price_list_rate || 0, doc.currency));
                }
                if (item_row) this.render_discount_dom(item_row);
            } catch (e) {}
        }

        bind_custom_control_change_event() {
            if (!wmn_item_details_is_offline()) {
                return super.bind_custom_control_change_event();
            }

            const me = this;

            if (this.rate_control) {
                this.rate_control.df.onchange = function () {
                    if (this.value || flt(this.value) === 0) {
                        me.wmn_offline_form_updated("rate", this.value);
                    }
                };
                this.rate_control.df.read_only = !this.allow_rate_change;
                this.rate_control.refresh();
            }

            if (this.discount_percentage_control && !this.allow_discount_change) {
                this.discount_percentage_control.df.read_only = 1;
                this.discount_percentage_control.refresh();
            }

            if (this.warehouse_control) {
                this.warehouse_control.df.reqd = 1;
                this.warehouse_control.df.get_query = () => ({ filters: {} });
                this.warehouse_control.df.onchange = function () {
                    const warehouse = this.value || "";
                    if (!warehouse) return;

                    Promise.resolve(me.wmn_offline_form_updated("warehouse", warehouse)).then(async () => {
                        try {
                            let available_qty;
                            const map = me.events.get_item_stock_map ? (me.events.get_item_stock_map() || {}) : {};
                            available_qty = map?.[me.item_row.item_code]?.[warehouse]?.[0];
                            if (available_qty === undefined && window.wmnPOSOffline && window.wmnPOSOffline.getStock) {
                                const stock = await window.wmnPOSOffline.getStock(me.item_row.item_code, warehouse);
                                available_qty = flt(stock ? stock.actual_qty : 0);
                            }
                            if (me.actual_qty_control && available_qty !== undefined) {
                                if (me.actual_qty_control.set_input) me.actual_qty_control.set_input(available_qty);
                                else me.actual_qty_control.set_value(available_qty);
                            }
                        } catch (e) {
                            console.warn("WMN offline warehouse stock update skipped", e);
                        }
                    });
                };
                this.warehouse_control.refresh();
            }

            if (this.serial_no_control) {
                this.serial_no_control.df.reqd = 1;
                this.serial_no_control.df.onchange = async function () {
                    if (!me.current_item.batch_no) await me.auto_update_batch_no();
                    me.wmn_offline_form_updated("serial_no", this.value);
                };
                this.serial_no_control.refresh();
            }

            if (this.batch_no_control) {
                this.batch_no_control.df.reqd = 1;
                this.batch_no_control.df.get_query = () => ({ filters: {} });
                this.batch_no_control.df.onchange = function () {
                    me.wmn_offline_form_updated("batch_no", this.value || "");
                };
                this.batch_no_control.refresh();
            }

            if (this.uom_control) {
                this.uom_control.df.get_query = () => ({ filters: {} });
                this.uom_control.df.onchange = function () {
                    me.wmn_offline_form_updated("uom", this.value || "");
                    try {
                        const item_row = me.item_row || me.current_item || {};
                        me.conversion_factor_control.df.read_only = item_row.stock_uom == this.value;
                        me.conversion_factor_control.refresh();
                    } catch (e) {}
                };
                this.uom_control.refresh();
            }
        }

        async auto_update_batch_no() {
            if (!wmn_item_details_is_offline()) {
                return await super.auto_update_batch_no();
            }
            if (!(this.serial_no_control && this.batch_no_control)) return;

            const selected_serial_nos = String(this.serial_no_control.get_value() || "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
            if (!selected_serial_nos.length) return;

            const itemCode = this.current_item.item_code || this.item_row.item_code || "";
            const warehouse = this.warehouse_control ? (this.warehouse_control.get_value() || "") : "";
            const serialRows = [];

            for (const serial_no of selected_serial_nos) {
                const row = await wmn_find_serial(serial_no, itemCode, warehouse);
                if (row && row.serial_no) serialRows.push(row);
            }
            if (!serialRows.length) return;

            const batch_no = serialRows[0].batch_no || "";
            const batch_serial_nos = serialRows
                .filter((r) => String(r.batch_no || "") === String(batch_no || ""))
                .map((r) => r.serial_no)
                .join("\n");

            if (batch_no && this.batch_no_control) {
                if (this.batch_no_control.set_input) this.batch_no_control.set_input(batch_no);
                else await this.batch_no_control.set_value(batch_no);
                await this.wmn_offline_form_updated("batch_no", batch_no);
            }
            if (batch_serial_nos && batch_serial_nos !== selected_serial_nos.join("\n")) {
                if (this.serial_no_control.set_input) this.serial_no_control.set_input(batch_serial_nos);
                else this.serial_no_control.set_value(batch_serial_nos);
                await this.wmn_offline_form_updated("serial_no", batch_serial_nos);
            }
            if (this.qty_control && batch_serial_nos) {
                const qty = batch_serial_nos.split("\n").filter(Boolean).length;
                if (this.qty_control.set_input) this.qty_control.set_input(qty);
                else this.qty_control.set_value(qty);
                await this.wmn_offline_form_updated("qty", qty);
            }
        }

        bind_auto_serial_fetch_event() {
            if (!wmn_item_details_is_offline()) {
                return super.bind_auto_serial_fetch_event();
            }

            this.$form_container.off("click.wmnOfflineAutoSerial", ".auto-fetch-btn");
            this.$form_container.on("click.wmnOfflineAutoSerial", ".auto-fetch-btn", async () => {
                try {
                    this.batch_no_control && (this.batch_no_control.set_input ? this.batch_no_control.set_input("") : this.batch_no_control.set_value(""));
                    const qty = flt(this.qty_control ? this.qty_control.get_value() : 1) || 1;
                    const itemCode = this.current_item.item_code || this.item_row.item_code || "";
                    const warehouse = this.warehouse_control ? (this.warehouse_control.get_value() || "") : "";
                    const serials = [];

                    for (let i = 0; i < qty; i++) {
                        const row = await wmn_find_serial("", itemCode, warehouse);
                        if (!row || !row.serial_no || serials.includes(row.serial_no)) break;
                        serials.push(row.serial_no);
                        if (row.batch_no && this.batch_no_control && !this.batch_no_control.get_value()) {
                            this.batch_no_control.set_input ? this.batch_no_control.set_input(row.batch_no) : this.batch_no_control.set_value(row.batch_no);
                            await this.wmn_offline_form_updated("batch_no", row.batch_no);
                        }
                    }

                    if (!serials.length) {
                        frappe.show_alert({ message: __("No Serial No is saved or available for this item offline"), indicator: "orange" });
                        return;
                    }
                    const serialText = serials.join("\n");
                    this.serial_no_control.set_input ? this.serial_no_control.set_input(serialText) : this.serial_no_control.set_value(serialText);
                    await this.wmn_offline_form_updated("serial_no", serialText);
                    if (serials.length < qty) {
                        frappe.show_alert({ message: __("Fetched only {0} available serial numbers.", [serials.length]), indicator: "orange" });
                        this.qty_control && (this.qty_control.set_input ? this.qty_control.set_input(serials.length) : this.qty_control.set_value(serials.length));
                        await this.wmn_offline_form_updated("qty", serials.length);
                    }
                } catch (e) {
                    console.warn("WMN offline auto serial fetch skipped", e);
                    frappe.show_alert({ message: __("Unable to fetch serial numbers offline"), indicator: "orange" });
                }
            });
        }
    };
})();
