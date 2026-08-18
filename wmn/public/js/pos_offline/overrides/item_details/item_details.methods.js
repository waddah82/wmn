/* ItemDetails override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemDetails;

    /*
     * WMN ItemDetails for ERPNext v16.
     * Online paths keep ERPNext behavior; offline fields use local metadata and cache services.
     */


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

        async function wmn_get_serial_rows(serialNumbers, itemCode, warehouse) {
            if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getSerialsByNumbers !== "function") return [];
            return await window.wmnPOSOffline.getSerialsByNumbers(serialNumbers || [], itemCode || "", warehouse || "");
        }

        async function wmn_get_available_serial_rows(itemCode, warehouse, options = {}) {
            if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getAvailableSerialsForItem !== "function") return [];
            return await window.wmnPOSOffline.getAvailableSerialsForItem(itemCode || "", warehouse || "", options);
        }

    const CoreMethods = {
        __proto__: Base.prototype,

        wmn_focus_quantity_control() {
                    const focus = () => {
                        const control = this.qty_control;
                        if (!control) return;
                        control.set_focus?.();
                        const input = control.$input?.get?.(0) || control.$input?.[0] || null;
                        if (input) {
                            input.focus();
                            if (typeof input.select === "function") input.select();
                        }
                    };
                    window.requestAnimationFrame(() => window.setTimeout(focus, 0));
                },

        async toggle_item_details_section(item) {
                    if (!wmn_item_details_is_offline()) {
                        const result = await super.toggle_item_details_section(item);
                        if (item && this.$component?.is(":visible")) this.wmn_focus_quantity_control();
                        return result;
                    }

                    const currentItemChanged = !this.compare_with_current_item(item);
                    const hideItemDetails = !Boolean(item) || !currentItemChanged;

                    if ((!hideItemDetails && currentItemChanged) || hideItemDetails) {
                        await this.validate_serial_batch_item();
                    }

                    this.events.toggle_item_selector(!hideItemDetails);
                    this.toggle_component(!hideItemDetails);

                    if (item && currentItemChanged) {
                        this.doctype = item.doctype;
                        this.item_meta = typeof wmn_pos_get_meta === "function"
                            ? wmn_pos_get_meta(this.doctype)
                            : wmn_make_offline_item_meta(this.doctype);
                        this.name = item.name;
                        this.item_row = item;
                        this.currency = this.events.get_frm().doc.currency;
                        this.current_item = item;

                        this.render_dom(item);
                        this.render_discount_dom(item);
                        this.render_form(item);
                        this.events.highlight_cart_item(item);
                        this.wmn_focus_quantity_control();
                    } else {
                        this.current_item = {};
                    }
                },

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
                },

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
                },

        wmn_refresh_price_display(item_row) {
                    try {
                        const doc = this.events.get_frm().doc;
                        if (item_row && this.$item_price) {
                            this.$item_price.html(format_currency(item_row.rate || item_row.price_list_rate || 0, doc.currency));
                        }
                        if (item_row) this.render_discount_dom(item_row);
                    } catch (e) {}
                },

        async wmn_apply_supervisor_protected_value(fieldname, value) {
                    const pos = window.cur_pos;
                    const row = this.item_row || this.current_item;
                    if (!row || !pos || !window.WMNPOSSupervisor) return false;

                    const action = fieldname === "rate"
                        ? window.WMNPOSSupervisor.ACTIONS.CHANGE_RATE
                        : window.WMNPOSSupervisor.ACTIONS.ITEM_DISCOUNT;
                    const beforeValue = flt(row[fieldname] || 0);
                    const afterValue = flt(value || 0);
                    if (Math.abs(beforeValue - afterValue) <= 0.000001) return true;

                    const approvalContext = {
                        doc: pos.frm?.doc || null,
                        item_code: row.item_code || "",
                        row_name: row.name || "",
                        before_value: beforeValue,
                        after_value: afterValue,
                        reference_value: flt(row.price_list_rate || row.rate || beforeValue || 0),
                    };
                    if (window.WMNPOSSupervisor.hasGrant?.(action, approvalContext)) {
                        approvalContext.reuse_grant = true;
                    }
                    const approval = await pos.wmn_authorize_pos_action(action, approvalContext);
                    if (!approval || !approval.approved) return false;

                    if (wmn_item_details_is_offline()) {
                        await this.wmn_offline_form_updated(fieldname, afterValue);
                    } else {
                        await this.events.form_updated(this.current_item, fieldname, afterValue);
                        const itemRow = frappe.get_doc(this.doctype, this.name);
                        const doc = this.events.get_frm().doc;
                        if (itemRow && this.$item_price) {
                            this.$item_price.html(format_currency(itemRow.rate, doc.currency));
                            this.render_discount_dom(itemRow);
                        }
                    }
                    return true;
                },

        wmn_bind_supervisor_protected_controls() {
                    if (!window.WMNPOSSupervisor || !window.cur_pos) return;
                    const me = this;

                    if (this.rate_control && window.WMNPOSSupervisor.isActionRequired(window.WMNPOSSupervisor.ACTIONS.CHANGE_RATE)) {
                        this.rate_control.df.read_only = 0;
                        this.rate_control.df.onchange = async function () {
                            const row = me.item_row || me.current_item || {};
                            const oldValue = flt(row.rate || 0);
                            const newValue = flt(this.value || 0);
                            const applied = await me.wmn_apply_supervisor_protected_value("rate", newValue);
                            if (!applied) {
                                if (this.set_input) this.set_input(oldValue);
                                else if (this.$input) this.$input.val(oldValue);
                            }
                        };
                        this.rate_control.refresh();
                    }

                    if (this.discount_percentage_control && window.WMNPOSSupervisor.isActionRequired(window.WMNPOSSupervisor.ACTIONS.ITEM_DISCOUNT)) {
                        this.discount_percentage_control.df.read_only = 0;
                        this.discount_percentage_control.df.onchange = async function () {
                            const row = me.item_row || me.current_item || {};
                            const oldValue = flt(row.discount_percentage || 0);
                            const newValue = flt(this.value || 0);
                            if (newValue < 0 || newValue > 100) {
                                frappe.show_alert({ message: __("Discount must be between 0 and 100%."), indicator: "red" });
                                if (this.set_input) this.set_input(oldValue);
                                else if (this.$input) this.$input.val(oldValue);
                                return;
                            }
                            const applied = await me.wmn_apply_supervisor_protected_value("discount_percentage", newValue);
                            if (!applied) {
                                if (this.set_input) this.set_input(oldValue);
                                else if (this.$input) this.$input.val(oldValue);
                            }
                        };
                        this.discount_percentage_control.refresh();
                    }
                },

        wmn_bind_sales_invoice_item_model_events() {
                    if (this.__wmn_sales_invoice_item_events_bound) return;
                    this.__wmn_sales_invoice_item_events_bound = true;

                    frappe.model.on("Sales Invoice Item", "*", (fieldname, value, itemRow) => {
                        const pos = window.cur_pos;
                        if (!pos?.frm?.doc || pos.frm.doc.doctype !== "Sales Invoice") return;
                        if (!itemRow || itemRow.doctype !== "Sales Invoice Item") return;

                        const fieldControl = this[`${fieldname}_control`];
                        const isCurrent = this.compare_with_current_item?.(itemRow);
                        if (isCurrent && fieldControl && fieldControl.get_value() !== value) {
                            fieldControl.set_value(value);
                            pos.update_cart_html?.(itemRow);
                        }
                    });
                },

        bind_custom_control_change_event() {
                    this.wmn_bind_sales_invoice_item_model_events();

                    if (!wmn_item_details_is_offline()) {
                        const result = super.bind_custom_control_change_event();
                        this.wmn_bind_supervisor_protected_controls();
                        return result;
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
                                    let map = me.events.get_item_stock_map ? (me.events.get_item_stock_map() || {}) : {};
                                    let availableQty = map?.[me.item_row.item_code]?.[warehouse]?.[0];
                                    if (availableQty === undefined && me.events.get_available_stock) {
                                        await me.events.get_available_stock(me.item_row.item_code, warehouse);
                                        map = me.events.get_item_stock_map ? (me.events.get_item_stock_map() || {}) : {};
                                        availableQty = map?.[me.item_row.item_code]?.[warehouse]?.[0];
                                    }
                                    if (me.actual_qty_control && availableQty !== undefined) {
                                        if (me.actual_qty_control.set_input) me.actual_qty_control.set_input(availableQty);
                                        else me.actual_qty_control.set_value(availableQty);
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

                    this.wmn_bind_supervisor_protected_controls();
                },

        async auto_update_batch_no() {
                    if (!wmn_item_details_is_offline()) {
                        return await super.auto_update_batch_no();
                    }
                    if (!(this.serial_no_control && this.batch_no_control)) return;

                    const selectedSerialNos = String(this.serial_no_control.get_value() || "")
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean);
                    if (!selectedSerialNos.length) return;

                    const itemCode = this.current_item.item_code || this.item_row.item_code || "";
                    const warehouse = this.warehouse_control ? (this.warehouse_control.get_value() || "") : "";
                    const serialRows = await wmn_get_serial_rows(selectedSerialNos, itemCode, warehouse);
                    if (!serialRows.length) return;

                    const batchSerialMap = {};
                    serialRows.forEach((row) => {
                        const batchNo = String(row.batch_no || "");
                        batchSerialMap[batchNo] = batchSerialMap[batchNo] || [];
                        batchSerialMap[batchNo].push(row.serial_no);
                    });

                    const batchNo = Object.keys(batchSerialMap)[0];
                    const batchSerialNos = (batchSerialMap[batchNo] || []).join("\n");
                    if (batchNo !== undefined && String(this.batch_no_control.get_value() || "") !== String(batchNo || "")) {
                        if (this.batch_no_control.set_input) this.batch_no_control.set_input(batchNo || "");
                        else await this.batch_no_control.set_value(batchNo || "");
                        await this.wmn_offline_form_updated("batch_no", batchNo || "");
                    }

                    const belongsToOtherBatch = selectedSerialNos.length !== (batchSerialMap[batchNo] || []).length;
                    if (belongsToOtherBatch) {
                        if (this.serial_no_control.set_input) this.serial_no_control.set_input(batchSerialNos);
                        else await this.serial_no_control.set_value(batchSerialNos);
                        await this.wmn_offline_form_updated("serial_no", batchSerialNos);

                        const currentBatchQty = (batchSerialMap[batchNo] || []).length;
                        if (this.qty_control?.set_input) this.qty_control.set_input(currentBatchQty);
                        else if (this.qty_control) await this.qty_control.set_value(currentBatchQty);
                        await this.wmn_offline_form_updated("qty", currentBatchQty);

                        delete batchSerialMap[batchNo];
                        if (Object.keys(batchSerialMap).length && this.events?.clone_new_batch_item_in_frm) {
                            this.events.clone_new_batch_item_in_frm(batchSerialMap, this.current_item);
                        }
                    }
                },

        bind_auto_serial_fetch_event() {
                    if (!wmn_item_details_is_offline()) {
                        return super.bind_auto_serial_fetch_event();
                    }

                    this.$form_container.off("click.wmnOfflineAutoSerial", ".auto-fetch-btn");
                    this.$form_container.on("click.wmnOfflineAutoSerial", ".auto-fetch-btn", async () => {
                        try {
                            if (this.batch_no_control) {
                                if (this.batch_no_control.set_input) this.batch_no_control.set_input("");
                                else await this.batch_no_control.set_value("");
                                await this.wmn_offline_form_updated("batch_no", "");
                            }

                            const qty = flt(this.qty_control ? this.qty_control.get_value() : 1) || 1;
                            const conversionFactor = flt(this.conversion_factor_control ? this.conversion_factor_control.get_value() : 1) || 1;
                            const itemCode = this.current_item.item_code || this.item_row.item_code || "";
                            const warehouse = this.warehouse_control ? (this.warehouse_control.get_value() || "") : "";
                            const postingDate = this.item_row.has_batch_no ? (this.events.get_frm().doc.posting_date || "") : "";
                            const requestedStockQty = Math.max(1, cint(qty * conversionFactor));
                            const serialRows = await wmn_get_available_serial_rows(itemCode, warehouse, {
                                limit: requestedStockQty,
                                batch_nos: this.current_item.batch_no || "",
                                posting_date: postingDate,
                            });
                            const serials = (serialRows || []).map((row) => row.serial_no).filter(Boolean);

                            if (!serials.length) {
                                frappe.msgprint(
                                    __("Serial numbers unavailable for Item {0} under warehouse {1}. Please try changing warehouse.", [
                                        String(itemCode || "").bold(),
                                        String(warehouse || "").bold(),
                                    ])
                                );
                                return;
                            }

                            if (serials.length < qty) {
                                frappe.msgprint(__("Fetched only {0} available serial numbers.", [serials.length]));
                                if (this.qty_control?.set_input) this.qty_control.set_input(serials.length);
                                else if (this.qty_control) await this.qty_control.set_value(serials.length);
                                await this.wmn_offline_form_updated("qty", serials.length);
                            }

                            const serialText = serials.join("\n");
                            if (this.serial_no_control.set_input) this.serial_no_control.set_input(serialText);
                            else await this.serial_no_control.set_value(serialText);
                            await this.wmn_offline_form_updated("serial_no", serialText);
                            await this.auto_update_batch_no();
                        } catch (e) {
                            console.warn("WMN offline auto serial fetch skipped", e);
                            frappe.show_alert({ message: __("Unable to fetch serial numbers offline"), indicator: "orange" });
                        }
                    });
                }
    };

    const UIMethods = {
        __proto__: CoreMethods
    };

    const FinalMethods = Object.create(null);
    FinalMethods.wmn_focus_quantity_control = UIMethods.wmn_focus_quantity_control || CoreMethods.wmn_focus_quantity_control;
    FinalMethods.toggle_item_details_section = UIMethods.toggle_item_details_section || CoreMethods.toggle_item_details_section;
    FinalMethods.render_form = UIMethods.render_form || CoreMethods.render_form;
    FinalMethods.wmn_offline_form_updated = UIMethods.wmn_offline_form_updated || CoreMethods.wmn_offline_form_updated;
    FinalMethods.wmn_refresh_price_display = UIMethods.wmn_refresh_price_display || CoreMethods.wmn_refresh_price_display;
    FinalMethods.wmn_apply_supervisor_protected_value = UIMethods.wmn_apply_supervisor_protected_value || CoreMethods.wmn_apply_supervisor_protected_value;
    FinalMethods.wmn_bind_supervisor_protected_controls = UIMethods.wmn_bind_supervisor_protected_controls || CoreMethods.wmn_bind_supervisor_protected_controls;
    FinalMethods.wmn_bind_sales_invoice_item_model_events = UIMethods.wmn_bind_sales_invoice_item_model_events || CoreMethods.wmn_bind_sales_invoice_item_model_events;
    FinalMethods.bind_custom_control_change_event = UIMethods.bind_custom_control_change_event || CoreMethods.bind_custom_control_change_event;
    FinalMethods.auto_update_batch_no = UIMethods.auto_update_batch_no || CoreMethods.auto_update_batch_no;
    FinalMethods.bind_auto_serial_fetch_event = UIMethods.bind_auto_serial_fetch_event || CoreMethods.bind_auto_serial_fetch_event;

    const initializeCore = null;
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.OverrideMethods.ItemDetails = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
