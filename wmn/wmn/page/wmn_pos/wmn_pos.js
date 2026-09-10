/* WMN POS page source. Copied from ERPNext v16 and modified directly for WMN. */
frappe.provide("wmn.PointOfSale");
window.WMN_POS = window.WMN_POS || {};
Object.assign(window.WMN_POS, {
    Source: window.WMN_POS.Source || {},
    Classes: window.WMN_POS.Classes || {},
    ClassMethods: window.WMN_POS.ClassMethods || {},
    Features: window.WMN_POS.Features || {},
    Services: window.WMN_POS.Services || {},
    Common: window.WMN_POS.Common || {},
    UI: window.WMN_POS.UI || {},
});

window.wmn_pos_install_owned_source = function wmn_pos_install_owned_source() {
    if (window.__wmn_pos_owned_source_installed) return;
    window.__wmn_pos_owned_source_installed = true;

/* BEGIN class_registry.js */
/* WMN-owned POS class registry. Creates POS components without replacing ERPNext globals. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    if (!ns) throw new Error("WMN POS namespace is not available");

    ns.Classes = ns.Classes || {};

    function getPOSClass(name) {
        const ClassRef = ns.Classes[name];
        if (typeof ClassRef !== "function") {
            throw new Error(`WMN POS class ${name} is not available`);
        }
        return ClassRef;
    }

    function createPOSComponent(name, options) {
        const ClassRef = getPOSClass(name);
        return new ClassRef(options || {});
    }

    function inheritSourcePrototype(TargetClass, SourceClass) {
        if (typeof TargetClass !== "function" || typeof SourceClass !== "function") {
            throw new Error("WMN POS source inheritance requires valid classes");
        }

        Object.getOwnPropertyNames(SourceClass.prototype).forEach((name) => {
            if (name === "constructor") return;
            if (Object.prototype.hasOwnProperty.call(TargetClass.prototype, name)) return;
            Object.defineProperty(
                TargetClass.prototype,
                name,
                Object.getOwnPropertyDescriptor(SourceClass.prototype, name)
            );
        });
    }

    function constructFromSource(SourceClass, TargetClass, args, initialize) {
        if (typeof SourceClass !== "function" || typeof TargetClass !== "function") {
            throw new Error("WMN POS source construction requires valid classes");
        }

        const instance = Reflect.construct(SourceClass, args || [], TargetClass);
        Object.setPrototypeOf(instance, TargetClass.prototype);
        if (typeof initialize === "function") initialize(instance, args || []);
        return instance;
    }

    ns.getClass = getPOSClass;
    ns.createComponent = createPOSComponent;
    ns.inheritSourcePrototype = inheritSourcePrototype;
    ns.constructFromSource = constructFromSource;
    window.wmn_pos_get_class = getPOSClass;
    window.wmn_pos_create_component = createPOSComponent;
    window.wmn_pos_inherit_source_prototype = inheritSourcePrototype;
    window.wmn_pos_construct_from_source = constructFromSource;
})();

/* END class_registry.js */


/* BEGIN pos_number_pad.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.NumberPad = class {
    constructor({ wrapper, events, cols, keys, css_classes, fieldnames_map }) {
        this.wrapper = wrapper;
        this.events = events;
        this.cols = cols;
        this.keys = keys;
        this.css_classes = css_classes || [];
        this.fieldnames = fieldnames_map || {};

        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.bind_events();
    }

    prepare_dom() {
        const { cols, keys, css_classes, fieldnames } = this;

        function get_keys() {
            return keys.reduce((a, row, i) => {
                return (
                    a +
                    row.reduce((a2, number, j) => {
                        const class_to_append = css_classes && css_classes[i] ? css_classes[i][j] : "";
                        const fieldname =
                            fieldnames && fieldnames[number]
                                ? fieldnames[number]
                                : typeof number === "string"
                                ? frappe.scrub(number)
                                : number;

                        return (
                            a2 +
                            `<div class="numpad-btn ${class_to_append}" data-button-value="${fieldname}">${__(
                                number
                            )}</div>`
                        );
                    }, "")
                );
            }, "");
        }

        this.wrapper.html(
            `<div class="numpad-container">
                ${get_keys()}
            </div>`
        );
    }

    bind_events() {
        const me = this;
        this.wrapper.on("click", ".numpad-btn", function () {
            const $btn = $(this);
            me.events.numpad_event($btn);
        });
    }
};

/* END pos_number_pad.js */


/* BEGIN pos_item_details.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.ItemDetails = class {
    constructor({ wrapper, events, settings }) {
        this.wrapper = wrapper;
        this.events = events;
        this.hide_images = settings.hide_images;
        this.allow_rate_change = settings.allow_rate_change;
        this.allow_discount_change = settings.allow_discount_change;
        this.current_item = {};
        this.frm_doctype = settings.frm_doctype;

        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.init_child_components();
        this.bind_events();
        this.attach_shortcuts();
    }

    prepare_dom() {
        this.wrapper.append(`<section class="item-details-container"></section>`);

        this.$component = this.wrapper.find(".item-details-container");
    }

    init_child_components() {
        this.$component.html(
            `<div class="item-details-header">
                <div class="label">${__("Item Details")}</div>
                <div class="close-btn">
                    <svg width="32" height="32" viewBox="0 0 14 14" fill="none">
                        <path d="M4.93764 4.93759L7.00003 6.99998M9.06243 9.06238L7.00003 6.99998M7.00003 6.99998L4.93764 9.06238L9.06243 4.93759" stroke="#8D99A6"/>
                    </svg>
                </div>
            </div>
            <div class="item-display">
                <div class="item-name-desc-price">
                    <div class="item-name"></div>
                    <div class="item-desc"></div>
                    <div class="item-price"></div>
                </div>
                <div class="item-image"></div>
            </div>
            <div class="discount-section"></div>
            <div class="form-container"></div>
            <div class="serial-batch-container"></div>`
        );

        this.$item_name = this.$component.find(".item-name");
        this.$item_description = this.$component.find(".item-desc");
        this.$item_price = this.$component.find(".item-price");
        this.$item_image = this.$component.find(".item-image");
        this.$form_container = this.$component.find(".form-container");
        this.$dicount_section = this.$component.find(".discount-section");
        this.$serial_batch_container = this.$component.find(".serial-batch-container");
    }

    compare_with_current_item(item) {
        // returns true if `item` is currently being edited
        return item && item.name == this.current_item.name;
    }

    async toggle_item_details_section(item) {
        const current_item_changed = !this.compare_with_current_item(item);

        // if item is null or highlighted cart item is clicked twice
        const hide_item_details = !Boolean(item) || !current_item_changed;

        if ((!hide_item_details && current_item_changed) || hide_item_details) {
            // if item details is being closed OR if item details is opened but item is changed
            // in both cases, if the current item is a serialized item, then validate and remove the item
            await this.validate_serial_batch_item();
        }

        this.events.toggle_item_selector(!hide_item_details);
        this.toggle_component(!hide_item_details);

        if (item && current_item_changed) {
            this.doctype = item.doctype;
            this.item_meta = frappe.get_meta(this.doctype);
            this.name = item.name;
            this.item_row = item;
            this.currency = this.events.get_frm().doc.currency;

            if (item.has_serial_no == null || item.has_batch_no == null) {
                const r = await frappe.db.get_value("Item", item.item_code, [
                    "has_serial_no",
                    "has_batch_no",
                ]);
                if (r && r.message) {
                    item.has_serial_no = r.message.has_serial_no;
                    item.has_batch_no = r.message.has_batch_no;
                }
            }

            this.current_item = item;

            this.render_dom(item);
            this.render_discount_dom(item);
            this.render_form(item);
            this.events.highlight_cart_item(item);
        } else {
            this.current_item = {};
        }
    }

    validate_serial_batch_item() {
        const doc = this.events.get_frm().doc;
        const item_row = doc.items.find((item) => item.name === this.name);

        if (!item_row) return;

        const serialized = item_row.has_serial_no;
        const batched = item_row.has_batch_no;
        const no_bundle_selected =
            !item_row.serial_and_batch_bundle && !item_row.serial_no && !item_row.batch_no;

        if ((serialized && no_bundle_selected) || (batched && no_bundle_selected)) {
            frappe.show_alert({
                message: __("Item is removed since no serial / batch no selected."),
                indicator: "orange",
            });
            frappe.utils.play_sound("cancel");
            return this.events.remove_item_from_cart();
        }
    }

    render_dom(item) {
        let { item_name, description, image, price_list_rate } = item;

        function get_description_html() {
            if (description) {
                description =
                    description.indexOf("...") === -1 && description.length > 140
                        ? description.substr(0, 139) + "..."
                        : description;
                return description;
            }
            return ``;
        }

        this.$item_name.html(frappe.utils.escape_html(item_name));
        this.$item_description.html(get_description_html());
        this.$item_price.html(format_currency(price_list_rate, this.currency));
        if (!this.hide_images && image) {
            this.$item_image.html(
                `<img
                    onerror="cur_pos.item_details.handle_broken_image(this)"
                    class="h-full" src="${frappe.utils.escape_html(image)}"
                    alt="${frappe.utils.escape_html(frappe.get_abbr(item_name))}"
                    style="object-fit: cover;">`
            );
        } else {
            this.$item_image.html(
                `<div class="item-abbr">${frappe.utils.escape_html(frappe.get_abbr(item_name))}</div>`
            );
        }
    }

    handle_broken_image($img) {
        const item_abbr = frappe.utils.escape_html($($img).attr("alt"));
        $($img).replaceWith(`<div class="item-abbr">${item_abbr}</div>`);
    }

    render_discount_dom(item) {
        if (item.discount_percentage) {
            this.$dicount_section.html(
                `<div class="item-rate">${format_currency(item.price_list_rate, this.currency)}</div>
                <div class="item-discount">${item.discount_percentage}% off</div>`
            );
            this.$item_price.html(format_currency(item.rate, this.currency));
        } else {
            this.$dicount_section.html(``);
        }
    }

    render_form(item) {
        const fields_to_display = this.get_form_fields(item);
        this.$form_container.html("");

        fields_to_display.forEach((fieldname, idx) => {
            this.$form_container.append(
                `<div class="${fieldname}-control" data-fieldname="${fieldname}"></div>`
            );

            const field_meta = this.item_meta.fields.find((df) => df.fieldname === fieldname);
            fieldname === "discount_percentage" ? (field_meta.label = __("Discount (%)")) : "";
            const me = this;

            this[`${fieldname}_control`] = frappe.ui.form.make_control({
                df: {
                    ...field_meta,
                    onchange: function () {
                        me.events.form_updated(me.current_item, fieldname, this.value);
                    },
                },
                parent: this.$form_container.find(`.${fieldname}-control`),
                render_input: true,
            });
            this[`${fieldname}_control`].set_value(item[fieldname]);
        });

        this.resize_serial_control(item);
        this.make_auto_serial_selection_btn(item);

        this.bind_custom_control_change_event();
    }

    get_form_fields(item) {
        const fields = [
            "qty",
            "uom",
            "rate",
            "conversion_factor",
            "discount_percentage",
            "warehouse",
            "actual_qty",
            "price_list_rate",
        ];
        if (item.has_serial_no || item.serial_no) fields.push("serial_no");
        if (item.has_batch_no || item.batch_no) fields.push("batch_no");
        return fields;
    }

    resize_serial_control(item) {
        if (item.has_serial_no || item.serial_no) {
            this.$form_container.find(".serial_no-control").find("textarea").css("height", "6rem");
        }
    }

    make_auto_serial_selection_btn(item) {
        const doc = this.events.get_frm().doc;
        if (!doc.is_return && (item.has_serial_no || item.serial_no)) {
            if (!item.has_batch_no) {
                this.$form_container.append(`<div class="grid-filler no-select"></div>`);
            }
            const label = __("Auto Fetch Serial Numbers");
            this.$form_container.append(
                `<div class="btn btn-sm btn-secondary auto-fetch-btn">${label}</div>`
            );
            this.$form_container.find(".serial_no-control").find("textarea").css("height", "6rem");
        }
    }

    bind_custom_control_change_event() {
        const me = this;
        if (this.rate_control) {
            this.rate_control.df.onchange = function () {
                if (this.value || flt(this.value) === 0) {
                    me.events.form_updated(me.current_item, "rate", this.value).then(() => {
                        const item_row = frappe.get_doc(me.doctype, me.name);
                        const doc = me.events.get_frm().doc;
                        me.$item_price.html(format_currency(item_row.rate, doc.currency));
                        me.render_discount_dom(item_row);
                    });
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
            this.warehouse_control.df.onchange = function () {
                if (this.value) {
                    me.events.form_updated(me.current_item, "warehouse", this.value).then(() => {
                        me.item_stock_map = me.events.get_item_stock_map();
                        const available_qty = me.item_stock_map[me.item_row.item_code][this.value][0];
                        const is_stock_item = Boolean(
                            me.item_stock_map[me.item_row.item_code][this.value][1]
                        );
                        if (available_qty === undefined) {
                            me.events.get_available_stock(me.item_row.item_code, this.value).then(() => {
                                // item stock map is updated now reset warehouse
                                me.warehouse_control.set_value(this.value);
                            });
                        } else if (available_qty === 0 && is_stock_item) {
                            me.warehouse_control.set_value("");
                            const bold_item_code = me.item_row.item_code.bold();
                            const bold_warehouse = this.value.bold();
                            frappe.throw(
                                __("Item Code: {0} is not available under warehouse {1}.", [
                                    bold_item_code,
                                    bold_warehouse,
                                ])
                            );
                        }
                        me.actual_qty_control.set_value(available_qty);
                    });
                }
            };
            this.warehouse_control.df.get_query = () => {
                return {
                    filters: { company: this.events.get_frm().doc.company, is_group: 0 },
                };
            };
            this.warehouse_control.refresh();
        }

        if (this.serial_no_control) {
            this.serial_no_control.df.reqd = 1;
            this.serial_no_control.df.onchange = async function () {
                !me.current_item.batch_no && (await me.auto_update_batch_no());
                me.events.form_updated(me.current_item, "serial_no", this.value);
            };
            this.serial_no_control.refresh();
        }

        if (this.batch_no_control) {
            this.batch_no_control.df.reqd = 1;
            this.batch_no_control.df.get_query = () => {
                return {
                    query: "erpnext.controllers.queries.get_batch_no",
                    filters: {
                        item_code: me.item_row.item_code,
                        warehouse: me.item_row.warehouse,
                        posting_date: me.events.get_frm().doc.posting_date,
                    },
                };
            };
            this.batch_no_control.refresh();
        }

        if (this.uom_control) {
            this.uom_control.df.onchange = function () {
                me.events.form_updated(me.current_item, "uom", this.value);

                const item_row = frappe.get_doc(me.doctype, me.name);
                me.conversion_factor_control.df.read_only = item_row.stock_uom == this.value;
                me.conversion_factor_control.refresh();
            };
            this.uom_control.df.get_query = () => {
                return {
                    query: "erpnext.controllers.queries.get_item_uom_query",
                    filters: {
                        item_code: me.current_item.item_code,
                    },
                };
            };
            this.uom_control.refresh();
        }

        const frm_doctype = this.events.get_frm().doc.doctype;

        frappe.model.on(`${frm_doctype} Item`, "*", (fieldname, value, item_row) => {
            const field_control = this[`${fieldname}_control`];
            const item_row_is_being_edited = this.compare_with_current_item(item_row);
            if (
                item_row_is_being_edited &&
                field_control &&
                field_control.get_value() !== value &&
                value == item_row[fieldname]
            ) {
                field_control.set_value(value);
                cur_pos.update_cart_html(item_row);
            }
        });
    }

    async auto_update_batch_no() {
        if (this.serial_no_control && this.batch_no_control) {
            const selected_serial_nos = this.serial_no_control
                .get_value()
                .split(`\n`)
                .filter((s) => s);
            if (!selected_serial_nos.length) return;

            // find batch nos of the selected serial no
            const serials_with_batch_no = await frappe.db.get_list("Serial No", {
                filters: { name: ["in", selected_serial_nos] },
                fields: ["batch_no", "name"],
            });
            const batch_serial_map = serials_with_batch_no.reduce((acc, r) => {
                if (!acc[r.batch_no]) {
                    acc[r.batch_no] = [];
                }
                acc[r.batch_no] = [...acc[r.batch_no], r.name];
                return acc;
            }, {});
            // set current item's batch no and serial no
            const batch_no = Object.keys(batch_serial_map)[0];
            const batch_serial_nos = batch_serial_map[batch_no].join(`\n`);
            // eg. 10 selected serial no. -> 5 belongs to first batch other 5 belongs to second batch
            const serial_nos_belongs_to_other_batch =
                selected_serial_nos.length !== batch_serial_map[batch_no].length;

            const current_batch_no = this.batch_no_control.get_value();
            current_batch_no != batch_no && (await this.batch_no_control.set_value(batch_no));

            if (serial_nos_belongs_to_other_batch) {
                this.serial_no_control.set_value(batch_serial_nos);
                this.qty_control.set_value(batch_serial_map[batch_no].length);

                delete batch_serial_map[batch_no];
                this.events.clone_new_batch_item_in_frm(batch_serial_map, this.current_item);
            }
        }
    }

    bind_events() {
        this.bind_auto_serial_fetch_event();
        this.bind_fields_to_numpad_fields();

        this.$component.on("click", ".close-btn", () => {
            this.events.close_item_details();
        });
    }

    attach_shortcuts() {
        this.wrapper.find(".close-btn").attr("title", "Esc");
        frappe.ui.keys.on("escape", () => {
            const item_details_visible = this.$component.is(":visible");
            if (item_details_visible) {
                this.events.close_item_details();
            }
        });
    }

    bind_fields_to_numpad_fields() {
        const me = this;
        this.$form_container.on("click", ".input-with-feedback", function () {
            const fieldname = $(this).attr("data-fieldname");
            if (this.last_field_focused != fieldname) {
                me.events.item_field_focused(fieldname);
                this.last_field_focused = fieldname;
            }
        });
    }

    bind_auto_serial_fetch_event() {
        this.$form_container.on("click", ".auto-fetch-btn", () => {
            this.batch_no_control && this.batch_no_control.set_value("");
            let qty = this.qty_control.get_value();
            let conversion_factor = this.conversion_factor_control.get_value();
            let expiry_date = this.item_row.has_batch_no ? this.events.get_frm().doc.posting_date : "";

            let numbers = frappe.call({
                method: "erpnext.stock.doctype.serial_no.serial_no.auto_fetch_serial_number",
                args: {
                    qty: qty * conversion_factor,
                    item_code: this.current_item.item_code,
                    warehouse: this.warehouse_control.get_value() || "",
                    batch_nos: this.current_item.batch_no || "",
                    posting_date: expiry_date,
                    for_doctype: this.frm_doctype,
                },
            });

            numbers.then((data) => {
                let auto_fetched_serial_numbers = data.message;
                let records_length = auto_fetched_serial_numbers.length;
                if (!records_length) {
                    const warehouse = this.warehouse_control.get_value().bold();
                    const item_code = this.current_item.item_code.bold();
                    frappe.msgprint(
                        __(
                            "Serial numbers unavailable for Item {0} under warehouse {1}. Please try changing warehouse.",
                            [item_code, warehouse]
                        )
                    );
                } else if (records_length < qty) {
                    frappe.msgprint(__("Fetched only {0} available serial numbers.", [records_length]));
                    this.qty_control.set_value(records_length);
                }
                numbers = auto_fetched_serial_numbers.join(`\n`);
                this.serial_no_control.set_value(numbers);
            });
        });
    }

    toggle_component(show) {
        show ? this.$component.css("display", "flex") : this.$component.css("display", "none");
    }
};

/* END pos_item_details.js */


/* BEGIN pos_item_cart.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.ItemCart = class {
    constructor({ wrapper, events, settings }) {
        this.wrapper = wrapper;
        this.events = events;
        this.customer_info = undefined;
        this.hide_images = settings.hide_images;
        this.allowed_customer_groups = settings.customer_groups;
        this.allow_rate_change = settings.allow_rate_change;
        this.allow_discount_change = settings.allow_discount_change;
        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.init_child_components();
        this.bind_events();
        this.attach_shortcuts();
    }

    prepare_dom() {
        this.wrapper.append(`<section class="customer-cart-container"></section>`);

        this.$component = this.wrapper.find(".customer-cart-container");
    }

    init_child_components() {
        this.init_customer_selector();
        this.init_cart_components();
    }

    init_customer_selector() {
        this.$component.append(`<div class="customer-section"></div>`);
        this.$customer_section = this.$component.find(".customer-section");
        this.make_customer_selector();
    }

    reset_customer_selector() {
        const frm = this.events.get_frm();
        frm.set_value("customer", "");
        this.make_customer_selector();
        this.customer_field.set_focus();
    }

    init_cart_components() {
        this.$component.append(
            `<div class="cart-container">
                <div class="abs-cart-container">
                    <div class="cart-label">${__("Item Cart")}</div>
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

    make_cart_items_section() {
        this.$cart_header = this.$component.find(".cart-header");
        this.$cart_items_wrapper = this.$component.find(".cart-items-section");

        this.make_no_items_placeholder();
    }

    make_no_items_placeholder() {
        this.$cart_header.css("display", "none");
        this.$cart_items_wrapper.html(`<div class="no-item-wrapper">${__("No items in cart")}</div>`);
    }

    get_discount_icon() {
        return `<svg class="discount-icon" width="24" height="24" viewBox="0 0 24 24" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 15.6213C19 15.2235 19.158 14.842 19.4393 14.5607L20.9393 13.0607C21.5251 12.4749 21.5251 11.5251 20.9393 10.9393L19.4393 9.43934C19.158 9.15804 19 8.7765 19 8.37868V6.5C19 5.67157 18.3284 5 17.5 5H15.6213C15.2235 5 14.842 4.84196 14.5607 4.56066L13.0607 3.06066C12.4749 2.47487 11.5251 2.47487 10.9393 3.06066L9.43934 4.56066C9.15804 4.84196 8.7765 5 8.37868 5H6.5C5.67157 5 5 5.67157 5 6.5V8.37868C5 8.7765 4.84196 9.15804 4.56066 9.43934L3.06066 10.9393C2.47487 11.5251 2.47487 12.4749 3.06066 13.0607L4.56066 14.5607C4.84196 14.842 5 15.2235 5 15.6213V17.5C5 18.3284 5.67157 19 6.5 19H8.37868C8.7765 19 9.15804 19.158 9.43934 19.4393L10.9393 20.9393C11.5251 21.5251 12.4749 21.5251 13.0607 20.9393L14.5607 19.4393C14.842 19.158 15.2235 19 15.6213 19H17.5C18.3284 19 19 18.3284 19 17.5V15.6213Z" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15 9L9 15" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10.5 9.5C10.5 10.0523 10.0523 10.5 9.5 10.5C8.94772 10.5 8.5 10.0523 8.5 9.5C8.5 8.94772 8.94772 8.5 9.5 8.5C10.0523 8.5 10.5 8.94772 10.5 9.5Z" fill="white" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M15.5 14.5C15.5 15.0523 15.0523 15.5 14.5 15.5C13.9477 15.5 13.5 15.0523 13.5 14.5C13.5 13.9477 13.9477 13.5 14.5 13.5C15.0523 13.5 15.5 13.9477 15.5 14.5Z" fill="white" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
    }

    make_cart_totals_section() {
        this.$totals_section = this.$component.find(".cart-totals-section");

        this.$totals_section.append(
            `<div class="add-discount-wrapper">
                ${this.get_discount_icon()} ${__("Add Discount")}
            </div>
            <div class="item-qty-total-container">
                <div class="item-qty-total-label">${__("Total Items")}</div>
                <div class="item-qty-total-value">0.00</div>
            </div>
            <div class="net-total-container">
                <div class="net-total-label">${__("Net Total")}</div>
                <div class="net-total-value">0.00</div>
            </div>
            <div class="taxes-container"></div>
            <div class="grand-total-container">
                <div>${__("Grand Total")}</div>
                <div>0.00</div>
            </div>
            <div class="checkout-btn">${__("Checkout")}</div>
            <div class="edit-cart-btn">${__("Edit Cart")}</div>`
        );

        this.$add_discount_elem = this.$component.find(".add-discount-wrapper");
    }

    make_cart_numpad() {
        this.$numpad_section = this.$component.find(".numpad-section");

        this.number_pad = new window.WMN_POS.Source.NumberPad({
            wrapper: this.$numpad_section,
            events: {
                numpad_event: this.on_numpad_event.bind(this),
            },
            cols: 5,
            keys: [
                [1, 2, 3, "Quantity"],
                [4, 5, 6, "Discount"],
                [7, 8, 9, "Rate"],
                [".", 0, "Delete", "Remove"],
            ],
            css_classes: [
                ["", "", "", "col-span-2"],
                ["", "", "", "col-span-2"],
                ["", "", "", "col-span-2"],
                ["", "", "", "col-span-2 remove-btn"],
            ],
            fieldnames_map: { Quantity: "qty", Discount: "discount_percentage" },
        });

        this.$numpad_section.prepend(
            `<div class="numpad-totals">
            <span class="numpad-item-qty-total"></span>
                <span class="numpad-net-total"></span>
                <span class="numpad-grand-total"></span>
            </div>`
        );

        this.$numpad_section.append(
            `<div class="numpad-btn checkout-btn" data-button-value="checkout">${__("Checkout")}</div>`
        );
    }

    bind_events() {
        const me = this;
        this.$customer_section.on("click", ".reset-customer-btn", function () {
            me.reset_customer_selector();
        });

        this.$customer_section.on("click", ".close-details-btn", function () {
            me.toggle_customer_info(false);
        });

        this.$customer_section.on("click", ".customer-display", function (e) {
            if ($(e.target).closest(".reset-customer-btn").length) return;

            const show = me.$cart_container.is(":visible");
            me.toggle_customer_info(show);
        });

        this.$cart_items_wrapper.on("click", ".cart-item-wrapper", function () {
            const $cart_item = $(this);

            me.toggle_item_highlight(this);

            const numpad_section_hidden = !me.$numpad_section.is(":visible");
            if (numpad_section_hidden) {
                const scrollTop = $cart_item.offset().top - me.$cart_items_wrapper.offset().top;
                me.$cart_items_wrapper.animate({ scrollTop });
            }

            const payment_section_hidden = !me.$totals_section.find(".edit-cart-btn").is(":visible");
            if (!payment_section_hidden) {
                // payment section is visible
                // edit cart first and then open item details section
                me.$totals_section.find(".edit-cart-btn").click();
            }

            const item_row_name = $cart_item.attr("data-row-name");
            me.events.cart_item_clicked({ name: item_row_name });
            this.numpad_value = "";
        });

        this.$component.on("click", ".checkout-btn", async function () {
            if ($(this).attr("style").indexOf("--btn-primary") == -1) return;

            await me.events.checkout();
            me.toggle_checkout_btn(false);
            me.disable_customer_selection();

            me.allow_discount_change && me.$add_discount_elem.removeClass("d-none");
        });

        this.$totals_section.on("click", ".edit-cart-btn", () => {
            this.events.edit_cart();
            this.toggle_checkout_btn(true);
            me.enable_customer_selection();
        });

        this.$component.on("click", ".add-discount-wrapper", () => {
            const can_edit_discount = this.$add_discount_elem.find(".edit-discount-btn").length;

            if (!this.discount_field || can_edit_discount) this.show_discount_control();
        });

        frappe.ui.form.on("POS Invoice", "paid_amount", (frm) => {
            // called when discount is applied
            this.update_totals_section(frm);
        });

        frappe.ui.form.on("Sales Invoice", "paid_amount", (frm) => {
            // called when discount is applied
            this.update_totals_section(frm);
        });
    }

    attach_shortcuts() {
        for (let row of this.number_pad.keys) {
            for (let btn of row) {
                if (typeof btn !== "string") continue; // do not make shortcuts for numbers

                let shortcut_key = `ctrl+${frappe.scrub(String(btn))[0]}`;
                if (btn === "Delete") shortcut_key = "ctrl+backspace";
                if (btn === "Remove") shortcut_key = "shift+ctrl+backspace";
                if (btn === ".") shortcut_key = "ctrl+>";

                // to account for fieldname map
                const fieldname = this.number_pad.fieldnames[btn]
                    ? this.number_pad.fieldnames[btn]
                    : typeof btn === "string"
                    ? frappe.scrub(btn)
                    : btn;

                let shortcut_label = shortcut_key.split("+").map(frappe.utils.to_title_case).join("+");
                shortcut_label = frappe.utils.is_mac() ? shortcut_label.replace("Ctrl", "⌘") : shortcut_label;
                this.$numpad_section
                    .find(`.numpad-btn[data-button-value="${fieldname}"]`)
                    .attr("title", shortcut_label);

                frappe.ui.keys.on(`${shortcut_key}`, () => {
                    const cart_is_visible = this.$component.is(":visible");
                    if (cart_is_visible && this.item_is_selected && this.$numpad_section.is(":visible")) {
                        this.$numpad_section.find(`.numpad-btn[data-button-value="${fieldname}"]`).click();
                    }
                });
            }
        }
        const ctrl_label = frappe.utils.is_mac() ? "⌘" : "Ctrl";
        this.$component.find(".checkout-btn").attr("title", `${ctrl_label}+Enter`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+enter",
            action: () => this.$component.find(".checkout-btn").click(),
            condition: () =>
                this.$component.is(":visible") && !this.$totals_section.find(".edit-cart-btn").is(":visible"),
            description: __("Checkout Order / Submit Order / New Order"),
            ignore_inputs: true,
            page: cur_page.page.page,
        });
        this.$component.find(".edit-cart-btn").attr("title", `${ctrl_label}+E`);
        frappe.ui.keys.on("ctrl+e", () => {
            const item_cart_visible = this.$component.is(":visible");
            const checkout_btn_invisible = !this.$totals_section.find(".checkout-btn").is("visible");
            if (item_cart_visible && checkout_btn_invisible) {
                this.$component.find(".edit-cart-btn").click();
            }
        });
        this.$component.find(".add-discount-wrapper").attr("title", `${ctrl_label}+D`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+d",
            action: () => this.$component.find(".add-discount-wrapper").click(),
            condition: () => this.$add_discount_elem.is(":visible"),
            description: __("Add Order Discount"),
            ignore_inputs: true,
            page: cur_page.page.page,
        });
        frappe.ui.keys.on("escape", () => {
            const item_cart_visible = this.$component.is(":visible");
            if (item_cart_visible && this.discount_field && this.discount_field.parent.is(":visible")) {
                this.discount_field.set_value(0);
            }
        });
    }

    toggle_item_highlight(item) {
        const $cart_item = $(item);
        const item_is_highlighted = $cart_item.attr("style") == "background-color: var(--control-bg);";

        if (!item || item_is_highlighted) {
            this.item_is_selected = false;
            this.$cart_container.find(".cart-item-wrapper").css("background-color", "");
        } else {
            $cart_item.css("background-color", "var(--control-bg)");
            this.item_is_selected = true;
            this.$cart_container.find(".cart-item-wrapper").not(item).css("background-color", "");
        }
    }

    make_customer_selector() {
        this.$customer_section.html(`
            <div class="customer-field"></div>
        `);
        const me = this;
        const allowed_customer_group = this.allowed_customer_groups || [];
        let filters = {};
        if (allowed_customer_group.length) {
            filters = {
                customer_group: ["in", allowed_customer_group],
            };
        }
        this.customer_field = frappe.ui.form.make_control({
            df: {
                label: __("Customer"),
                fieldtype: "Link",
                options: "Customer",
                placeholder: __("Search by customer name, phone, email."),
                get_query: function () {
                    return {
                        filters: filters,
                    };
                },
                onchange: function () {
                    if (this.value) {
                        const frm = me.events.get_frm();
                        frappe.dom.freeze();
                        frappe.model.set_value(frm.doc.doctype, frm.doc.name, "customer", this.value);
                        frm.script_manager.trigger("customer", frm.doc.doctype, frm.doc.name).then(() => {
                            frappe.run_serially([
                                () => me.fetch_customer_details(this.value),
                                () => me.events.customer_details_updated(me.customer_info),
                                () => me.update_customer_section(),
                                () => me.update_totals_section(),
                                () => frappe.dom.unfreeze(),
                            ]);
                        });
                    }
                },
            },
            parent: this.$customer_section.find(".customer-field"),
            render_input: true,
        });
        this.customer_field.toggle_label(false);
    }

    fetch_customer_details(customer) {
        if (customer) {
            return new Promise((resolve) => {
                frappe.db
                    .get_value("Customer", customer, [
                        "email_id",
                        "customer_name",
                        "mobile_no",
                        "image",
                        "loyalty_program",
                    ])
                    .then(({ message }) => {
                        const { loyalty_program } = message;
                        // if loyalty program then fetch loyalty points too
                        if (loyalty_program) {
                            frappe.call({
                                method: "erpnext.accounts.doctype.loyalty_program.loyalty_program.get_loyalty_program_details_with_points",
                                args: { customer, loyalty_program, silent: true },
                                callback: (r) => {
                                    const { loyalty_points, conversion_factor } = r.message;
                                    if (!r.exc) {
                                        this.customer_info = {
                                            ...message,
                                            customer,
                                            loyalty_points,
                                            conversion_factor,
                                        };
                                        resolve();
                                    }
                                },
                            });
                        } else {
                            this.customer_info = { ...message, customer };
                            resolve();
                        }
                    });
            });
        } else {
            return new Promise((resolve) => {
                this.customer_info = {};
                resolve();
            });
        }
    }

    show_discount_control() {
        this.$add_discount_elem.css({ padding: "0px", border: "none" });
        this.$add_discount_elem.html(`<div class="add-discount-field"></div>`);
        const me = this;
        const frm = me.events.get_frm();
        let discount = frm.doc.additional_discount_percentage;

        this.discount_field = frappe.ui.form.make_control({
            df: {
                label: __("Discount"),
                fieldtype: "Data",
                placeholder: discount ? discount + "%" : __("Enter discount percentage."),
                input_class: "input-xs",
                onchange: function () {
                    this.value = flt(this.value);
                    if (this.value > 100) {
                        frappe.msgprint({
                            title: __("Invalid Discount"),
                            indicator: "red",
                            message: __("Discount cannot be greater than 100%."),
                        });
                        this.value = 0;
                    }
                    frappe.model.set_value(
                        frm.doc.doctype,
                        frm.doc.name,
                        "additional_discount_percentage",
                        flt(this.value)
                    );
                    me.hide_discount_control(this.value);
                },
            },
            parent: this.$add_discount_elem.find(".add-discount-field"),
            render_input: true,
        });
        this.discount_field.toggle_label(false);
        this.discount_field.set_focus();
    }

    hide_discount_control(discount) {
        if (!flt(discount)) {
            this.$add_discount_elem.css({
                border: "1px dashed var(--gray-500)",
                padding: "var(--padding-sm) var(--padding-md)",
            });
            this.$add_discount_elem.html(`${this.get_discount_icon()} ${__("Add Discount")}`);
            this.discount_field = undefined;
        } else {
            this.$add_discount_elem.css({
                border: "1px dashed var(--dark-green-500)",
                padding: "var(--padding-sm) var(--padding-md)",
            });
            this.$add_discount_elem.html(
                `<div class="edit-discount-btn">
                    ${this.get_discount_icon()} ${__("Additional")}&nbsp;${String(discount).bold()}% ${__("discount applied")}
                </div>`
            );
        }
    }

    update_customer_section() {
        const me = this;
        const { customer, customer_name, email_id = "", mobile_no = "", image } = this.customer_info || {};

        if (customer) {
            this.$customer_section.html(
                `<div class="customer-details">
                    <div class="customer-display">
                        ${this.get_customer_image()}
                        <div class="customer-name-desc">
                            <div class="customer-name">${frappe.utils.escape_html(customer_name)}</div>
                            ${get_customer_description()}
                        </div>
                        <div class="reset-customer-btn" data-customer="${frappe.utils.escape_html(customer)}">
                            <svg width="32" height="32" viewBox="0 0 14 14" fill="none">
                                <path d="M4.93764 4.93759L7.00003 6.99998M9.06243 9.06238L7.00003 6.99998M7.00003 6.99998L4.93764 9.06238L9.06243 4.93759" stroke="#8D99A6"/>
                            </svg>
                        </div>
                    </div>
                </div>`
            );
        } else {
            // reset customer selector
            this.reset_customer_selector();
        }

        function get_customer_description() {
            if (!email_id && !mobile_no) {
                return `<div class="customer-desc">${__("Click to add email / phone")}</div>`;
            } else if (email_id && !mobile_no) {
                return `<div class="customer-desc">${frappe.utils.escape_html(email_id)}</div>`;
            } else if (mobile_no && !email_id) {
                return `<div class="customer-desc">${frappe.utils.escape_html(mobile_no)}</div>`;
            } else {
                return `<div class="customer-desc">${frappe.utils.escape_html(
                    email_id
                )} - ${frappe.utils.escape_html(mobile_no)}</div>`;
            }
        }
    }

    get_customer_image() {
        const { customer, image } = this.customer_info || {};
        if (image) {
            return `<div class="customer-image"><img src="${frappe.utils.escape_html(
                image
            )}" alt="${frappe.utils.escape_html(image)}"></div>`;
        } else {
            return `<div class="customer-image customer-abbr">${frappe.utils.escape_html(
                frappe.get_abbr(customer)
            )}</div>`;
        }
    }

    update_totals_section(frm) {
        if (!frm) frm = this.events.get_frm();

        this.render_net_total(frm.doc.net_total);
        this.render_total_item_qty(frm.doc.items);
        const grand_total = cint(frappe.sys_defaults.disable_rounded_total)
            ? frm.doc.grand_total
            : frm.doc.rounded_total;
        this.render_grand_total(grand_total);

        this.render_taxes(frm.doc.taxes);
    }

    render_net_total(value) {
        const currency = this.events.get_frm().doc.currency;
        this.$totals_section
            .find(".net-total-container")
            .html(`<div>${__("Net Total")}</div><div>${format_currency(value, currency)}</div>`);

        this.$numpad_section
            .find(".numpad-net-total")
            .html(`<div>${__("Net Total")}: <span>${format_currency(value, currency)}</span></div>`);
    }

    render_total_item_qty(items) {
        var total_item_qty = 0;
        items.map((item) => {
            total_item_qty = total_item_qty + item.qty;
        });

        this.$totals_section
            .find(".item-qty-total-container")
            .html(`<div>${__("Total Quantity")}</div><div>${total_item_qty}</div>`);

        this.$numpad_section
            .find(".numpad-item-qty-total")
            .html(`<div>${__("Total Quantity")}: <span>${total_item_qty}</span></div>`);
    }

    render_grand_total(value) {
        const currency = this.events.get_frm().doc.currency;
        this.$totals_section
            .find(".grand-total-container")
            .html(`<div>${__("Grand Total")}</div><div>${format_currency(value, currency)}</div>`);

        this.$numpad_section
            .find(".numpad-grand-total")
            .html(`<div>${__("Grand Total")}: <span>${format_currency(value, currency)}</span></div>`);
    }

    render_taxes(taxes) {
        if (taxes && taxes.length) {
            const currency = this.events.get_frm().doc.currency;
            const taxes_html = taxes
                .map((t) => {
                    if (t.tax_amount_after_discount_amount == 0.0) return;
                    return `<div class="tax-row">
                    <div class="tax-label">${frappe.utils.escape_html(t.description)}</div>
                    <div class="tax-value">${format_currency(t.tax_amount_after_discount_amount, currency)}</div>
                </div>`;
                })
                .join("");
            this.$totals_section.find(".taxes-container").css("display", "flex").html(taxes_html);
        } else {
            this.$totals_section.find(".taxes-container").css("display", "none").html("");
        }
    }

    get_cart_item({ name }) {
        return this.$cart_items_wrapper.find(".cart-item-wrapper").filter(function () {
            return $(this).attr("data-row-name") === name;
        });
    }

    get_item_from_frm(item) {
        const doc = this.events.get_frm().doc;
        return doc.items.find((i) => i.name == item.name);
    }

    update_item_html(item, remove_item) {
        const $item = this.get_cart_item(item);

        if (remove_item) {
            $item && $item.next().remove() && $item.remove();
        } else {
            const item_row = this.get_item_from_frm(item);
            this.render_cart_item(item_row, $item);
        }

        const no_of_cart_items = this.$cart_items_wrapper.find(".cart-item-wrapper").length;
        this.highlight_checkout_btn(no_of_cart_items > 0);

        this.update_empty_cart_section(no_of_cart_items);
    }

    render_cart_item(item_data, $item_to_update) {
        const currency = this.events.get_frm().doc.currency;
        const me = this;

        if (!$item_to_update.length) {
            this.$cart_items_wrapper.append(
                `<div class="cart-item-wrapper" data-row-name="${frappe.utils.escape_html(
                    item_data.name
                )}"></div>
                <div class="seperator"></div>`
            );
            $item_to_update = this.get_cart_item(item_data);
        }

        $item_to_update.html(
            `${get_item_image_html()}
            <div class="item-name-desc">
                <div class="item-name">
                    ${frappe.utils.escape_html(item_data.item_name)}
                </div>
                ${get_description_html()}
            </div>
            ${get_rate_discount_html()}`
        );

        set_dynamic_rate_header_width();

        function set_dynamic_rate_header_width() {
            const rate_cols = Array.from(me.$cart_items_wrapper.find(".item-rate-amount"));
            me.$cart_header.find(".rate-amount-header").css("width", "");
            me.$cart_items_wrapper.find(".item-rate-amount").css("width", "");
            let max_width = rate_cols.reduce((max_width, elm) => {
                if ($(elm).width() > max_width) max_width = $(elm).width();
                return max_width;
            }, 0);

            max_width += 1;
            if (max_width == 1) max_width = "";

            me.$cart_header.find(".rate-amount-header").css("width", max_width);
            me.$cart_items_wrapper.find(".item-rate-amount").css("width", max_width);
        }

        function get_rate_discount_html() {
            if (item_data.rate && item_data.amount && item_data.rate !== item_data.amount) {
                return `
                    <div class="item-qty-rate">
                        <div class="item-qty"><span>${item_data.qty || 0} ${frappe.utils.escape_html(item_data.uom)}</span></div>
                        <div class="item-rate-amount">
                            <div class="item-rate">${format_currency(item_data.amount, currency)}</div>
                            <div class="item-amount">${format_currency(item_data.rate, currency)}</div>
                        </div>
                    </div>`;
            } else {
                return `
                    <div class="item-qty-rate">
                        <div class="item-qty"><span>${item_data.qty || 0} ${frappe.utils.escape_html(item_data.uom)}</span></div>
                        <div class="item-rate-amount">
                            <div class="item-rate">${format_currency(item_data.rate, currency)}</div>
                        </div>
                    </div>`;
            }
        }

        function get_description_html() {
            if (item_data.description) {
                if (item_data.description.indexOf("<div>") != -1) {
                    try {
                        item_data.description = $(item_data.description).text();
                    } catch (error) {
                        item_data.description = item_data.description
                            .replace(/<div>/g, " ")
                            .replace(/<\/div>/g, " ")
                            .replace(/ +/g, " ");
                    }
                }
                item_data.description = frappe.ellipsis(item_data.description, 45);
                return `<div class="item-desc">${frappe.utils.escape_html(item_data.description)}</div>`;
            }
            return ``;
        }

        function get_item_image_html() {
            const { image, item_name } = item_data;
            if (!me.hide_images && image) {
                return `
                    <div class="item-image">
                        <img
                            onerror="cur_pos.cart.handle_broken_image(this)"
                            src="${frappe.utils.escape_html(image)}" alt="${frappe.utils.escape_html(frappe.get_abbr(item_name))}">
                    </div>`;
            } else {
                return `<div class="item-image item-abbr">${frappe.utils.escape_html(
                    frappe.get_abbr(item_name)
                )}</div>`;
            }
        }
    }

    handle_broken_image($img) {
        const item_abbr = frappe.utils.escape_html($($img).attr("alt"));
        $($img).parent().replaceWith(`<div class="item-image item-abbr">${item_abbr}</div>`);
    }

    update_selector_value_in_cart_item(selector, value, item) {
        const $item_to_update = this.get_cart_item(item);
        $item_to_update.attr(`data-${selector}`, value);
    }

    toggle_checkout_btn(show_checkout) {
        if (show_checkout) {
            this.$totals_section.find(".checkout-btn").css("display", "flex");
            this.$totals_section.find(".edit-cart-btn").css("display", "none");
        } else {
            this.$totals_section.find(".checkout-btn").css("display", "none");
            this.$totals_section.find(".edit-cart-btn").css("display", "flex");
        }
    }

    disable_customer_selection() {
        this.$customer_section.find(".reset-customer-btn").css("visibility", "hidden");
        this.$customer_section.off("click", ".customer-display");
        this.$customer_section.off("click", ".reset-customer-btn");
    }

    enable_customer_selection() {
        this.$customer_section.find(".reset-customer-btn").css("visibility", "visible");
        this.$customer_section.on("click", ".customer-display", (e) => {
            if ($(e.target).closest(".reset-customer-btn").length) return;

            const show = this.$cart_container.is(":visible");
            this.toggle_customer_info(show);
        });
        this.$customer_section.on("click", ".reset-customer-btn", () => {
            this.reset_customer_selector();
        });
    }

    highlight_checkout_btn(toggle) {
        if (toggle) {
            this.$add_discount_elem.css("display", "flex");
            this.$cart_container.find(".checkout-btn").css({
                "background-color": "var(--btn-primary)",
                color: "var(--neutral)",
            });
        } else {
            this.$add_discount_elem.css("display", "none");
            this.$cart_container.find(".checkout-btn").css({
                "background-color": "var(--control-bg)",
                color: "",
            });
        }
    }

    update_empty_cart_section(no_of_cart_items) {
        const $no_item_element = this.$cart_items_wrapper.find(".no-item-wrapper");

        // if cart has items and no item is present
        no_of_cart_items > 0 &&
            $no_item_element &&
            $no_item_element.remove() &&
            this.$cart_header.css("display", "flex");

        no_of_cart_items === 0 && !$no_item_element.length && this.make_no_items_placeholder();
    }

    on_numpad_event($btn) {
        const current_action = $btn.attr("data-button-value");
        const action_is_field_edit = ["qty", "discount_percentage", "rate"].includes(current_action);
        const action_is_allowed = action_is_field_edit
            ? (current_action == "rate" && this.allow_rate_change) ||
              (current_action == "discount_percentage" && this.allow_discount_change) ||
              current_action == "qty"
            : true;

        const action_is_pressed_twice = this.prev_action === current_action;
        const first_click_event = !this.prev_action;
        const field_to_edit_changed = this.prev_action && this.prev_action != current_action;

        if (action_is_field_edit) {
            if (!action_is_allowed) {
                const label = current_action == "rate" ? "Rate".bold() : "Discount".bold();
                const message = __("Editing {0} is not allowed as per POS Profile settings", [label]);
                frappe.show_alert({
                    indicator: "red",
                    message: message,
                });
                frappe.utils.play_sound("error");
                return;
            }
            this.highlight_numpad_btn($btn, current_action);

            if (first_click_event || field_to_edit_changed) {
                this.prev_action = current_action;
            } else if (action_is_pressed_twice) {
                this.prev_action = undefined;
            }
            this.numpad_value = "";
        } else if (current_action === "checkout") {
            this.prev_action = undefined;
            this.toggle_item_highlight();
            this.events.numpad_event(undefined, current_action);
            return;
        } else if (current_action === "remove") {
            this.prev_action = undefined;
            this.toggle_item_highlight();
            this.events.numpad_event(undefined, current_action);
            return;
        } else {
            this.numpad_value =
                current_action === "delete"
                    ? this.numpad_value.slice(0, -1)
                    : this.numpad_value + current_action;
            this.numpad_value = this.numpad_value || 0;
        }

        const first_click_event_is_not_field_edit = !action_is_field_edit && first_click_event;

        if (first_click_event_is_not_field_edit) {
            frappe.show_alert({
                indicator: "red",
                message: __("Please select a field to edit from numpad"),
            });
            frappe.utils.play_sound("error");
            return;
        }

        if (flt(this.numpad_value) > 100 && this.prev_action === "discount_percentage") {
            frappe.show_alert({
                message: __("Discount cannot be greater than 100%"),
                indicator: "orange",
            });
            frappe.utils.play_sound("error");
            this.numpad_value = current_action;
        }

        this.events.numpad_event(this.numpad_value, this.prev_action);
    }

    highlight_numpad_btn($btn, curr_action) {
        const curr_action_is_highlighted = $btn.hasClass("highlighted-numpad-btn");
        const curr_action_is_action = ["qty", "discount_percentage", "rate", "done"].includes(curr_action);

        if (!curr_action_is_highlighted) {
            $btn.addClass("highlighted-numpad-btn");
        }
        if (this.prev_action === curr_action && curr_action_is_highlighted) {
            // if Qty is pressed twice
            $btn.removeClass("highlighted-numpad-btn");
        }
        if (this.prev_action && this.prev_action !== curr_action && curr_action_is_action) {
            // Order: Qty -> Rate then remove Qty highlight
            const prev_btn = $(`[data-button-value='${this.prev_action}']`);
            prev_btn.removeClass("highlighted-numpad-btn");
        }
        if (!curr_action_is_action || curr_action === "done") {
            // if numbers are clicked
            setTimeout(() => {
                $btn.removeClass("highlighted-numpad-btn");
            }, 200);
        }
    }

    toggle_numpad(show) {
        if (show) {
            this.$totals_section.css("display", "none");
            this.$numpad_section.css("display", "flex");
        } else {
            this.$totals_section.css("display", "flex");
            this.$numpad_section.css("display", "none");
        }
        this.reset_numpad();
    }

    reset_numpad() {
        this.numpad_value = "";
        this.prev_action = undefined;
        this.$numpad_section.find(".highlighted-numpad-btn").removeClass("highlighted-numpad-btn");
    }

    toggle_numpad_field_edit(fieldname) {
        if (["qty", "discount_percentage", "rate"].includes(fieldname)) {
            this.$numpad_section.find(`[data-button-value="${fieldname}"]`).click();
        }
    }

    toggle_customer_info(show) {
        if (show) {
            const { customer, customer_name } = this.customer_info || {};

            this.$cart_container.css("display", "none");
            this.$customer_section.css({
                height: "100%",
                "padding-top": "0px",
            });
            this.$customer_section.find(".customer-details").html(
                `<div class="header">
                    <div class="label">${__("Contact Details")}</div>
                    <div class="close-details-btn">
                        <svg width="32" height="32" viewBox="0 0 14 14" fill="none">
                            <path d="M4.93764 4.93759L7.00003 6.99998M9.06243 9.06238L7.00003 6.99998M7.00003 6.99998L4.93764 9.06238L9.06243 4.93759" stroke="#8D99A6"/>
                        </svg>
                    </div>
                </div>
                <div class="customer-display">
                    ${this.get_customer_image()}
                    <div class="customer-name-desc">
                        <div class="customer-name">${frappe.utils.escape_html(customer_name)}</div>
                        <div class="customer-desc">${frappe.utils.escape_html(customer)}</div>
                    </div>
                </div>
                <div class="customer-fields-container">
                    <div class="email_id-field"></div>
                    <div class="mobile_no-field"></div>
                    <div class="loyalty_program-field"></div>
                    <div class="loyalty_points-field"></div>
                </div>
                <div class="transactions-section">
                    <div class="recent-transactions">${__("Recent Transactions")}</div>
                    <div class="last-transaction"></div>
                </div>`
            );
            // transactions need to be in diff div from sticky elem for scrolling
            this.$customer_section.append(`<div class="customer-transactions"></div>`);

            this.render_customer_fields();
            this.fetch_customer_transactions();
        } else {
            this.$cart_container.css("display", "flex");
            this.$customer_section.css({
                height: "",
                "padding-top": "",
            });

            this.update_customer_section();
        }
    }

    render_customer_fields() {
        const $customer_form = this.$customer_section.find(".customer-fields-container");

        const dfs = [
            {
                fieldname: "email_id",
                label: __("Email"),
                fieldtype: "Data",
                options: "email",
                placeholder: __("Enter customer's email"),
            },
            {
                fieldname: "mobile_no",
                label: __("Phone Number"),
                fieldtype: "Data",
                placeholder: __("Enter customer's phone number"),
            },
            {
                fieldname: "loyalty_program",
                label: __("Loyalty Program"),
                fieldtype: "Link",
                options: "Loyalty Program",
                placeholder: __("Select Loyalty Program"),
            },
            {
                fieldname: "loyalty_points",
                label: __("Loyalty Points"),
                fieldtype: "Data",
                read_only: 1,
            },
        ];

        const me = this;
        dfs.forEach((df) => {
            this[`customer_${df.fieldname}_field`] = frappe.ui.form.make_control({
                df: df,
                parent: $customer_form.find(`.${df.fieldname}-field`),
                render_input: true,
            });
            this[`customer_${df.fieldname}_field`].$input?.on("blur", () => {
                handle_customer_field_change.apply(this[`customer_${df.fieldname}_field`]);
            });
            this[`customer_${df.fieldname}_field`].set_value(this.customer_info[df.fieldname]);
        });

        function handle_customer_field_change() {
            const current_value = me.customer_info[this.df.fieldname];
            const current_customer = me.customer_info.customer;

            if (this.value && current_value != this.value && this.df.fieldname != "loyalty_points") {
                frappe.call({
                    method: "erpnext.selling.page.point_of_sale.point_of_sale.set_customer_info",
                    args: {
                        fieldname: this.df.fieldname,
                        customer: current_customer,
                        value: this.value,
                    },
                    freeze: true,
                    callback: (r) => {
                        if (!r.exc) {
                            me.customer_info[this.df.fieldname] = this.value;
                            frappe.show_alert({
                                message: __("Customer contact updated successfully."),
                                indicator: "green",
                            });
                            frappe.utils.play_sound("submit");
                        }
                    },
                });
            }
        }
    }

    fetch_customer_transactions() {
        frappe
            .call({
                method: "erpnext.selling.page.point_of_sale.point_of_sale.get_customer_recent_transactions",
                args: { customer: this.customer_info.customer },
            })
            .then((res) => {
                res = res.message;
                const transaction_container = this.$customer_section.find(".customer-transactions");

                if (!res.length) {
                    transaction_container.html(
                        `<div class="no-transactions-placeholder">${__("No recent transactions found")}</div>`
                    );
                    return;
                }

                const elapsed_time = moment(res[0].posting_date + " " + res[0].posting_time).fromNow();
                this.$customer_section
                    .find(".last-transaction")
                    .html(`${__("Last transacted")} ${__(elapsed_time)}`);

                res.forEach((invoice) => {
                    const posting_datetime = frappe.datetime.str_to_user(
                        invoice.posting_date + " " + invoice.posting_time
                    );
                    let indicator_color = {
                        Paid: "green",
                        Draft: "red",
                        Return: "gray",
                        Consolidated: "blue",
                        "Credit Note Issued": "gray",
                        "Partly Paid": "yellow",
                        Overdue: "yellow",
                        Unpaid: "red",
                    };

                    transaction_container.append(
                        `<div class="invoice-wrapper" data-invoice-name="${frappe.utils.escape_html(
                            invoice.name
                        )}">
                        <div class="invoice-name-date">
                            <div class="invoice-name">${frappe.utils.escape_html(invoice.name)}</div>
                            <div class="invoice-date">${posting_datetime}</div>
                        </div>
                        <div class="invoice-total-status">
                            <div class="invoice-total">
                                ${format_currency(invoice.grand_total, invoice.currency, frappe.sys_defaults.currency_precision) || 0}
                            </div>
                            <div class="invoice-status">
                                <span class="indicator-pill whitespace-nowrap ${indicator_color[invoice.status] || ""}">
                                    <span>${__(invoice.status)}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="seperator"></div>`
                    );
                });
            });
    }

    attach_refresh_field_event(frm) {
        $(frm.wrapper).off("refresh-fields");
        $(frm.wrapper).on("refresh-fields", () => {
            if (frm.doc.items.length) {
                this.$cart_items_wrapper.html("");
                frm.doc.items.forEach((item) => {
                    this.update_item_html(item);
                });
            }
            this.update_totals_section(frm);
        });
    }

    load_invoice() {
        const frm = this.events.get_frm();

        this.attach_refresh_field_event(frm);

        this.fetch_customer_details(frm.doc.customer).then(() => {
            this.events.customer_details_updated(this.customer_info);
            this.update_customer_section();
        });

        this.$cart_items_wrapper.html("");
        if (frm.doc.items.length) {
            frm.doc.items.forEach((item) => {
                this.update_item_html(item);
            });
        } else {
            this.make_no_items_placeholder();
            this.highlight_checkout_btn(false);
        }

        this.hide_discount_control(frm.doc.additional_discount_percentage);
        this.update_totals_section(frm);

        if (frm.doc.docstatus === 1) {
            this.$totals_section.find(".checkout-btn").css("display", "none");
            this.$totals_section.find(".edit-cart-btn").css("display", "none");
        } else {
            this.$totals_section.find(".checkout-btn").css("display", "flex");
            this.$totals_section.find(".edit-cart-btn").css("display", "none");
        }

        this.toggle_component(true);
    }

    toggle_component(show) {
        show ? this.$component.css("display", "flex") : this.$component.css("display", "none");
    }
};

/* END pos_item_cart.js */


/* BEGIN pos_item_selector.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
import onScan from "onscan.js";

window.WMN_POS.Source.ItemSelector = class {
    // eslint-disable-next-line no-unused-vars
    constructor({ frm, wrapper, events, pos_profile, settings }) {
        this.wrapper = wrapper;
        this.events = events;
        this.pos_profile = pos_profile;
        this.hide_images = settings.hide_images;
        this.item_display_class = this.hide_images ? "hide-item-image" : "show-item-image";
        this.auto_add_item = settings.auto_add_item_to_cart;

        this.item_ready_group = this.get_parent_item_group();
        this.inti_component();
    }

    inti_component() {
        this.prepare_dom();
        this.make_search_bar();
        this.load_items_data();
        this.bind_events();
        this.attach_shortcuts();
    }

    prepare_dom() {
        this.wrapper.append(
            `<section class="items-selector">
                <div class="filter-section">
                    <div class="label">${__("All Items")}</div>
                    <div class="search-field"></div>
                    <div class="item-group-field"></div>
                </div>
                <div class="items-container"></div>
            </section>`
        );

        this.$component = this.wrapper.find(".items-selector");
        this.$items_container = this.$component.find(".items-container");

        this.$items_container.addClass(this.item_display_class);
    }

    async get_parent_item_group() {
        const r = await frappe.call({
            method: "erpnext.selling.page.point_of_sale.point_of_sale.get_parent_item_group",
            args: {
                pos_profile: this.pos_profile,
            },
        });
        if (r.message) this.item_group = this.parent_item_group = r.message;
    }

    async load_items_data() {
        await this.item_ready_group;

        this.start_item_loading_animation();

        if (!this.price_list) {
            const res = await frappe.db.get_value("POS Profile", this.pos_profile, "selling_price_list");
            this.price_list = res.message.selling_price_list;
        }

        this.get_items({})
            .then(({ message }) => {
                this.render_item_list(message.items);
            })
            .always(() => {
                this.stop_item_loading_animation();
            });
    }

    get_items({ start = 0, page_length = 40, search_term = "" }) {
        const doc = this.events.get_frm().doc;
        const price_list = (doc && doc.selling_price_list) || this.price_list;
        let { item_group, pos_profile } = this;

        return frappe.call({
            method: "erpnext.selling.page.point_of_sale.point_of_sale.get_items",
            freeze: true,
            args: { start, page_length, price_list, item_group, search_term, pos_profile },
        });
    }

    render_item_list(items) {
        this.$items_container.html("");

        if (!items?.length) {
            this.set_items_not_found_banner();
            return;
        }

        if (this.$items_container.hasClass("items-not-found")) {
            this.$items_container.removeClass("items-not-found");
            this.$items_container.addClass(this.item_display_class);
        }

        if (this.hide_images) {
            this.$items_container.append(this.render_item_list_column_header());
        }

        items?.forEach((item) => {
            const item_html = this.get_item_html(item);
            this.$items_container.append(item_html);
        });
    }

    set_items_not_found_banner() {
        this.$items_container.removeClass(this.item_display_class);
        this.$items_container.addClass("items-not-found");
        this.$items_container.html(__("Items not found."));
    }

    render_item_list_column_header() {
        return `<div class="list-column">
            <div class="column-name">${__("Name")}</div>
            <div class="column-price">${__("Price")}</div>
            <div class="column-uom">${__("UOM")}</div>
            <div class="column-qty-available">${__("Quantity Available")}</div>
        </div>`;
    }

    get_item_html(item) {
        const me = this;
        // eslint-disable-next-line no-unused-vars
        function sanitize_item_data(item) {
            return Object.fromEntries(
                Object.entries(item).map(([key, value]) => [
                    key,
                    typeof value === "string" ? frappe.utils.escape_html(value) : value,
                ])
            );
        }
        const sanitize_item = sanitize_item_data(item);
        const {
            item_code,
            stock_uom,
            item_name,
            item_image,
            serial_no,
            batch_no,
            barcode,
            actual_qty,
            uom,
            price_list_rate,
        } = sanitize_item;
        const precision = flt(price_list_rate, 2) % 1 != 0 ? 2 : 0;
        let indicator_color;
        let qty_to_display = actual_qty;

        if (item.is_stock_item) {
            indicator_color = actual_qty > 10 ? "green" : actual_qty <= 0 ? "red" : "orange";

            if (Math.round(qty_to_display) > 999) {
                qty_to_display = Math.round(qty_to_display) / 1000;
                qty_to_display = qty_to_display.toFixed(1) + "K";
            }
        } else {
            indicator_color = "";
            qty_to_display = "";
        }

        function get_item_image_html() {
            if (me.hide_images) return "";
            if (item_image) {
                return `<div class="item-qty-pill">
                            <span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span>
                        </div>
                        <div class="item-display">
                            <img
                                onerror="cur_pos.item_selector.handle_broken_image(this)"
                                class="item-img" src="${item_image}"
                                alt="${item_name}"
                            >
                        </div>`;
            } else {
                return `<div class="item-qty-pill">
                            <span class="indicator-pill whitespace-nowrap ${indicator_color}">${qty_to_display}</span>
                        </div>
                        <div class="item-display abbr">${frappe.get_abbr(item_name)}</div>`;
            }
        }

        return `<div class="item-wrapper"
                data-item-code="${item_code}" data-serial-no="${serial_no}"
                data-batch-no="${batch_no}" data-uom="${uom}"
                data-rate="${price_list_rate || 0}"
                data-stock-uom="${stock_uom}"
                title="${item_name}">

                ${get_item_image_html()}

                <div class="item-detail">
                    <div class="item-name">
                        ${!me.hide_images ? frappe.ellipsis(item_name, 18) : item_name}
                    </div>
                    ${
                        !me.hide_images
                            ? `<div class="item-rate">
                                ${frappe.utils.escape_html(format_currency(price_list_rate, item.currency, precision)) || 0} / ${uom}
                            </div>`
                            : `
                            <div class="item-price">${
                                frappe.utils.escape_html(
                                    format_currency(price_list_rate, item.currency, precision)
                                ) || 0
                            }</div>
                            <div class="item-uom">${uom}</div>
                            <div class="item-qty-available">${qty_to_display || "Non stock item"}</div>
                            `
                    }
                </div>
            </div>`;
    }

    handle_broken_image($img) {
        const item_abbr = frappe.utils.escape_html($($img).attr("alt"));
        $($img).parent().replaceWith(`<div class="item-display abbr">${item_abbr}</div>`);
    }

    make_search_bar() {
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
                fieldtype: "Link",
                options: "Item Group",
                placeholder: __("Select item group"),
                only_select: true,
                onchange: function () {
                    me.item_group = this.value;
                    !me.item_group && (me.item_group = me.parent_item_group);
                    me.filter_items();
                    me.set_item_selector_filter_label(this.value);
                },
                get_query: function () {
                    return {
                        query: "erpnext.selling.page.point_of_sale.point_of_sale.item_group_query",
                        filters: {
                            pos_profile: me.pos_profile,
                        },
                    };
                },
            },
            parent: this.$component.find(".item-group-field"),
            render_input: true,
        });
        this.search_field.toggle_label(false);
        this.item_group_field.toggle_label(false);

        $(this.item_group_field.awesomplete.ul).css("min-width", "unset");

        this.hide_open_link_btn();
        this.attach_clear_btn();
    }

    set_item_selector_filter_label(value) {
        const $filter_label = this.$component.find(".label");

        $filter_label.html(value ? frappe.utils.escape_html(__(value)) : __("All Items"));
    }

    hide_open_link_btn() {
        $(this.item_group_field.$wrapper.find(".btn-open")).css("display", "none");
    }

    attach_clear_btn() {
        this.search_field.$wrapper.find(".control-input").append(
            `<span class="link-btn">
                <a class="btn-open no-decoration" title="${__("Clear")}">
                    ${frappe.utils.icon("close", "sm")}
                </a>
            </span>`
        );

        this.item_group_field.$wrapper.find(".link-btn").append(
            `<a class="btn-clear" tabindex="-1" style="display: inline-block;" title="${__("Clear Link")}">
                ${frappe.utils.icon("close", "xs", "es-icon")}
            </a>`
        );

        this.$clear_search_btn = this.search_field.$wrapper.find(".link-btn");
        this.$clear_item_group_btn = this.item_group_field.$wrapper.find(".btn-clear");

        this.$clear_search_btn.on("click", "a", () => {
            this.set_search_value("");
            this.search_field.set_focus();
        });

        this.$clear_item_group_btn.on("click", () => {
            $(this.item_group_field.$input[0]).val("").trigger("input");
            this.item_group_field.set_focus();
        });
    }

    set_search_value(value) {
        $(this.search_field.$input[0]).val(value).trigger("input");
    }

    bind_events() {
        const me = this;
        window.onScan = onScan;

        onScan.decodeKeyEvent = function (oEvent) {
            var iCode = this._getNormalizedKeyNum(oEvent);
            switch (true) {
                case iCode >= 48 && iCode <= 90: // numbers and letters
                case iCode >= 106 && iCode <= 111: // operations on numeric keypad (+, -, etc.)
                case (iCode >= 160 && iCode <= 164) || iCode == 170: // ^ ! # $ *
                case iCode >= 186 && iCode <= 194: // (; = , - . / `)
                case iCode >= 219 && iCode <= 222: // ([ \ ] ')
                case iCode == 32: // spacebar
                    if (oEvent.key !== undefined && oEvent.key !== "") {
                        return oEvent.key;
                    }

                    var sDecoded = String.fromCharCode(iCode);
                    switch (oEvent.shiftKey) {
                        case false:
                            sDecoded = sDecoded.toLowerCase();
                            break;
                        case true:
                            sDecoded = sDecoded.toUpperCase();
                            break;
                    }
                    return sDecoded;
                case iCode >= 96 && iCode <= 105: // numbers on numeric keypad
                    return 0 + (iCode - 96);
            }
            return "";
        };

        onScan.attachTo(document, {
            onScan: (sScancode) => {
                if (this.search_field && this.$component.is(":visible")) {
                    this.search_field.set_focus();
                    this.set_search_value(sScancode);
                    this.barcode_scanned = true;
                }
            },
        });

        this.$component.on("click", ".item-wrapper", function () {
            const $item = $(this);
            const item_code = $item.attr("data-item-code");
            let batch_no = $item.attr("data-batch-no");
            let serial_no = $item.attr("data-serial-no");
            let uom = $item.attr("data-uom");
            let rate = $item.attr("data-rate");
            let stock_uom = $item.attr("data-stock-uom");

            // escape(undefined) returns "undefined" then unescape returns "undefined"
            batch_no = batch_no === "undefined" ? undefined : batch_no;
            serial_no = serial_no === "undefined" ? undefined : serial_no;
            uom = uom === "undefined" ? undefined : uom;
            rate = rate === "undefined" ? undefined : rate;
            stock_uom = stock_uom === "undefined" ? undefined : stock_uom;

            me.events.item_selected({
                field: "qty",
                value: "+1",
                item: { item_code, batch_no, serial_no, uom, rate, stock_uom },
            });
        });

        this.search_field.$input.on("input", (e) => {
            clearTimeout(this.last_search);
            this.last_search = setTimeout(() => {
                const search_term = e.target.value;
                this.filter_items({ search_term });
            }, 300);

            this.$clear_search_btn.toggle(Boolean(this.search_field.$input.val()));
        });

        this.search_field.$input.on("focus", () => {
            this.$clear_search_btn.toggle(Boolean(this.search_field.$input.val()));
        });
    }

    attach_shortcuts() {
        const ctrl_label = frappe.utils.is_mac() ? "⌘" : "Ctrl";
        this.search_field.parent.attr("title", `${ctrl_label}+I`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+i",
            action: () => this.search_field.set_focus(),
            condition: () => this.$component.is(":visible"),
            description: __("Focus on search input"),
            ignore_inputs: true,
            page: cur_page.page.page,
        });
        this.item_group_field.parent.attr("title", `${ctrl_label}+G`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+g",
            action: () => this.item_group_field.set_focus(),
            condition: () => this.$component.is(":visible"),
            description: __("Focus on Item Group filter"),
            ignore_inputs: true,
            page: cur_page.page.page,
        });

        // for selecting the last filtered item on search
        frappe.ui.keys.on("enter", () => {
            const selector_is_visible = this.$component.is(":visible");
            if (!selector_is_visible || this.search_field.get_value() === "") return;

            if (this.items.length == 1) {
                this.$items_container.find(".item-wrapper").click();
                frappe.utils.play_sound("submit");
                this.set_search_value("");
            } else if (this.items.length == 0 && this.barcode_scanned) {
                // only show alert of barcode is scanned and enter is pressed
                frappe.show_alert({
                    message: __("No items found. Scan barcode again."),
                    indicator: "orange",
                });
                frappe.utils.play_sound("error");
                this.barcode_scanned = false;
                this.set_search_value("");
            }
        });
    }

    filter_items({ search_term = "" } = {}) {
        this.start_item_loading_animation();

        const selling_price_list = this.events.get_frm().doc.selling_price_list;

        if (search_term) {
            search_term = search_term.toLowerCase();

            // memoize
            this.search_index = this.search_index || {};
            this.search_index[selling_price_list] = this.search_index[selling_price_list] || {};
            if (this.search_index[selling_price_list][search_term]) {
                const items = this.search_index[selling_price_list][search_term];
                this.items = items;
                this.render_item_list(items);
                this.auto_add_item &&
                    this.search_field.$input[0].value &&
                    this.items.length == 1 &&
                    this.add_filtered_item_to_cart();
                return;
            }
        }

        this.get_items({ search_term })
            .then(({ message }) => {
                // eslint-disable-next-line no-unused-vars
                const { items, serial_no, batch_no, barcode } = message;
                if (search_term && !barcode) {
                    this.search_index[selling_price_list][search_term] = items;
                }
                this.items = items;
                this.render_item_list(items);
                this.auto_add_item &&
                    this.search_field.$input[0].value &&
                    this.items.length == 1 &&
                    this.add_filtered_item_to_cart();
            })
            .always(() => {
                this.stop_item_loading_animation();
            });
    }

    start_item_loading_animation() {
        this.$items_container.addClass("is-loading");
    }

    stop_item_loading_animation() {
        this.$items_container.removeClass("is-loading");
    }

    add_filtered_item_to_cart() {
        this.$items_container.find(".item-wrapper").click();
        this.set_search_value("");
    }

    toggle_component(show) {
        this.set_search_value("");
        this.$component.css("display", show ? "flex" : "none");
    }
};

/* END pos_item_selector.js */


/* BEGIN pos_payment.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
/* eslint-disable no-unused-vars */
window.WMN_POS.Source.Payment = class {
    constructor({ events, wrapper, settings }) {
        this.wrapper = wrapper;
        this.events = events;
        this.set_gt_to_default_mop = settings.set_grand_total_to_default_mop;
        this.invoice_fields = settings.invoice_fields;
        this.allow_partial_payment = settings.allow_partial_payment;

        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.initialize_numpad();
        this.bind_events();
        this.attach_shortcuts();
    }

    prepare_dom() {
        this.wrapper.append(
            `<section class="payment-container">
                <div class="payment-split-container">
                    <div class="payment-container-left">
                        <div class="section-label payment-section">${__("Payment Method")}</div>
                        <div class="payment-modes"></div>
                    </div>
                    <div class="payment-container-right">
                        <div class="fields-numpad-container">
                            <div class="fields-section">
                                <div class="invoice-fields">
                                    <button class="btn btn-default btn-sm btn-shadow addl-fields hidden">${__(
                                        "Update Additional Information"
                                    )}</button>
                                </div>
                            </div>
                            <div class="number-pad"></div>
                        </div>
                    </div>
                </div>
                <div class="totals-section">
                    <div class="totals"></div>
                </div>
                <div class="submit-order-btn">${__("Complete Order")}</div>
            </section>`
        );
        this.$component = this.wrapper.find(".payment-container");
        this.$payment_modes = this.$component.find(".payment-modes");
        this.$totals_section = this.$component.find(".totals-section");
        this.$totals = this.$component.find(".totals");
        this.$numpad = this.$component.find(".number-pad");
        this.$invoice_fields_section = this.$component.find(".fields-section");
    }

    make_invoice_field_dialog() {
        const me = this;
        if (!me.invoice_fields.length) return;
        me.addl_dlg = new frappe.ui.Dialog({
            title: __("Additional Information"),
            fields: me.invoice_fields,
            size: "small",
            primary_action_label: __("Save"),
            primary_action(values) {
                me.set_values_to_frm(values);
                if (this.complete_order) {
                    me.events.submit_invoice();
                }
                this.hide();
            },
        });
        me.addl_dlg.$wrapper.on("hide.bs.modal", function () {
            me.addl_dlg.complete_order = false;
        });
        me.add_btn_field_click_listener();
        me.set_value_on_dialog_fields();
        me.make_addl_info_dialog_btn_visible();
    }

    set_values_to_frm(values) {
        const frm = this.events.get_frm();
        this.addl_dlg.fields.forEach((df) => {
            frm.set_value(df.fieldname, values[df.fieldname]);
        });
        frappe.show_alert({
            message: __("Additional Information updated successfully."),
            indicator: "green",
        });
    }

    add_btn_field_click_listener() {
        const frm = this.events.get_frm();
        this.addl_dlg.fields.forEach((df) => {
            if (df.fieldtype === "Button") {
                this.addl_dlg.fields_dict[df.fieldname].$input.on("click", function () {
                    if (frm.script_manager.has_handlers(df.fieldname, frm.doc.doctype)) {
                        frm.script_manager.trigger(df.fieldname, frm.doc.doctype, frm.doc.docname);
                    }
                });
            }
        });
    }

    set_value_on_dialog_fields() {
        const doc = this.events.get_frm().doc;
        this.addl_dlg.fields.forEach((df) => {
            if (doc[df.fieldname] || df.default_value) {
                this.addl_dlg.set_value(df.fieldname, doc[df.fieldname] || df.default_value);
            }
        });
    }

    make_addl_info_dialog_btn_visible() {
        this.$invoice_fields_section.find(".addl-fields").removeClass("hidden");
        this.$invoice_fields_section.find(".addl-fields").on("click", () => {
            this.addl_dlg.show();
        });
    }

    initialize_numpad() {
        const me = this;
        this.number_pad = new window.WMN_POS.Source.NumberPad({
            wrapper: this.$numpad,
            events: {
                numpad_event: function ($btn) {
                    me.on_numpad_clicked($btn);
                },
            },
            cols: 3,
            keys: [
                [1, 2, 3],
                [4, 5, 6],
                [7, 8, 9],
                ["+/-", 0, "Delete"],
            ],
        });

        this.numpad_value = "";
    }

    on_numpad_clicked($btn, from_numpad = true) {
        const button_value = from_numpad ? $btn.attr("data-button-value") : $btn;

        from_numpad && highlight_numpad_btn($btn);
        if (!this.selected_mode) {
            frappe.show_alert({
                message: __("Select a Payment Method."),
                indicator: "yellow",
            });
            return;
        }

        const number_format_details = get_number_format_info(frappe.sys_defaults.number_format);
        const precision = frappe.sys_defaults.currency_precision || number_format_details.precision;
        this.numpad_value = "0";
        if (this.selected_mode.get_value()) {
            this.numpad_value = (this.selected_mode.get_value() * 10 ** precision).toFixed(0).toString();
        }

        let valid_input = true;
        if (button_value === "delete" || button_value === "Backspace") {
            this.numpad_value = this.numpad_value.slice(0, -1);
        } else if (button_value === "+/-") {
            this.numpad_value = `${this.numpad_value * -1}`;
        } else if (button_value === "+") {
            this.numpad_value =
                Number(this.numpad_value) >= 0 ? this.numpad_value : `${this.numpad_value * -1}`;
        } else if (button_value === "-") {
            this.numpad_value =
                Number(this.numpad_value) <= 0 ? this.numpad_value : `${this.numpad_value * -1}`;
        } else if (!isNaN(button_value)) {
            this.numpad_value = this.numpad_value + button_value;
        } else {
            valid_input = false;
        }
        valid_input && frappe.utils.play_sound("numpad-touch");

        this.selected_mode.set_value(this.numpad_value / 10 ** precision);

        function highlight_numpad_btn($btn) {
            $btn.addClass("shadow-base-inner bg-selected");
            setTimeout(() => {
                $btn.removeClass("shadow-base-inner bg-selected");
            }, 100);
        }
    }

    bind_events() {
        const me = this;

        this.$payment_modes.on("click", ".mode-of-payment", function (e) {
            const mode_clicked = $(this);
            // if clicked element doesn't have .mode-of-payment class then return
            if (!$(e.target).is(mode_clicked)) return;

            const mode = mode_clicked.attr("data-mode");

            // hide all control fields and shortcuts
            $(`.mode-of-payment-control`).css("display", "none");
            me.$payment_modes.find(`.pay-amount`).css("display", "inline");
            me.$payment_modes.find(`.loyalty-amount-name`).css("display", "none");

            // remove highlight from all mode-of-payments
            $(".mode-of-payment").removeClass("border-primary");

            me.hide_zero_amount();

            if (me.selected_mode?._label === me[`${mode}_control`]?._label) {
                // clicked one is selected then unselect it
                mode_clicked.removeClass("border-primary");
                me.selected_mode = "";
            } else {
                // clicked one is not selected then select it
                mode_clicked.addClass("border-primary");

                me.selected_mode = me[`${mode}_control`];
                const mode_clicked_amount = mode_clicked.find(`.${mode}-amount`).get(0);
                if (!mode_clicked_amount.innerHTML) {
                    mode_clicked_amount.innerHTML = format_currency(0, me.events.get_frm().doc.currency);
                }
                me.auto_set_remaining_amount();
            }
        });

        // change payment amount for selected mode on key press from keyboard
        $(document).on("keydown", function (e) {
            if (me.selected_mode) {
                me.on_numpad_clicked(e.key, false);
            }
        });

        // deselect payment method if mode of payment or numpad is not clicked
        $(document).on("click", function (e) {
            const mode_of_payment_click = $(e.target).closest(".mode-of-payment").length;
            const numpad_btn_click = $(e.target).closest(".numpad-btn").length;

            if (!mode_of_payment_click && !numpad_btn_click && me.selected_mode) {
                me.selected_mode = "";
                me.hide_zero_amount();
                $(".mode-of-payment").removeClass("border-primary");
            }
        });

        frappe.ui.form.on("POS Invoice", "contact_mobile", (frm) => {
            const contact = frm.doc.contact_mobile;
            const request_button = $(this.request_for_payment_field?.$input[0]);
            if (contact) {
                request_button.removeClass("btn-default").addClass("btn-primary");
            } else {
                request_button.removeClass("btn-primary").addClass("btn-default");
            }
        });

        frappe.ui.form.on("POS Invoice", "coupon_code", (frm) => {
            this.bind_coupon_code_event(frm);
        });

        frappe.ui.form.on("Sales Invoice", "coupon_code", (frm) => {
            this.bind_coupon_code_event(frm);
        });

        this.setup_listener_for_payments();

        this.$payment_modes.on("click", ".shortcut", function () {
            const value = $(this).attr("data-value");
            me.selected_mode.set_value(value);
        });

        this.$component.on("click", ".submit-order-btn", () => {
            const doc = this.events.get_frm().doc;
            const paid_amount = doc.paid_amount;
            const items = doc.items;

            if (
                !items.length ||
                (paid_amount == 0 &&
                    doc.additional_discount_percentage != 100 &&
                    this.allow_partial_payment === 0)
            ) {
                const message = items.length
                    ? __("You cannot submit the order without payment.")
                    : __("You cannot submit empty order.");
                frappe.show_alert({ message, indicator: "orange" });
                frappe.utils.play_sound("error");
                return;
            }

            if (!this.validate_reqd_invoice_fields()) {
                return;
            }

            this.events.submit_invoice();
        });

        frappe.ui.form.on("POS Invoice", "paid_amount", (frm) => {
            this.bind_paid_amount_event(frm);
        });

        frappe.ui.form.on("POS Invoice", "loyalty_amount", (frm) => {
            this.bind_loyalty_amount_event(frm);
        });

        frappe.ui.form.on("Sales Invoice", "paid_amount", (frm) => {
            this.bind_paid_amount_event(frm);
        });

        frappe.ui.form.on("Sales Invoice", "loyalty_amount", (frm) => {
            this.bind_loyalty_amount_event(frm);
        });

        frappe.ui.form.on("Sales Invoice Payment", "amount", (frm, cdt, cdn) => {
            // for setting correct amount after loyalty points are redeemed
            const default_mop = locals[cdt][cdn];
            const mode = this.sanitize_mode_of_payment(default_mop.mode_of_payment);
            if (this[`${mode}_control`] && this[`${mode}_control`].get_value() != default_mop.amount) {
                this[`${mode}_control`].set_value(default_mop.amount);
            }
        });
    }

    bind_coupon_code_event(frm) {
        if (frm.doc.coupon_code && !frm.applying_pos_coupon_code) {
            if (!frm.doc.ignore_pricing_rule) {
                frm.applying_pos_coupon_code = true;
                frappe.run_serially([
                    () => (frm.doc.ignore_pricing_rule = 1),
                    () => frm.trigger("ignore_pricing_rule"),
                    () => (frm.doc.ignore_pricing_rule = 0),
                    () => frm.trigger("apply_pricing_rule"),
                    () => frm.save(),
                    () => this.update_totals_section(frm.doc),
                    () => (frm.applying_pos_coupon_code = false),
                ]);
            } else if (frm.doc.ignore_pricing_rule) {
                frappe.show_alert({
                    message: __("Ignore Pricing Rule is enabled. Cannot apply coupon code."),
                    indicator: "orange",
                });
            }
        }
    }

    bind_paid_amount_event(frm) {
        this.update_totals_section(frm.doc);
        this.render_payment_mode_dom();
    }

    bind_loyalty_amount_event(frm) {
        const formatted_currency = format_currency(frm.doc.loyalty_amount, frm.doc.currency);
        this.$payment_modes.find(`.loyalty-amount-amount`).html(formatted_currency);
    }

    setup_listener_for_payments() {
        frappe.realtime.on("process_phone_payment", (data) => {
            const doc = this.events.get_frm().doc;
            const { response, amount, success, failure_message } = data;
            let message, title;

            if (success) {
                title = __("Payment Received");
                const grand_total = cint(frappe.sys_defaults.disable_rounded_total)
                    ? doc.grand_total
                    : doc.rounded_total;
                if (amount >= grand_total) {
                    frappe.dom.unfreeze();
                    message = __("Payment of {0} received successfully.", [
                        format_currency(amount, doc.currency, 0),
                    ]);
                    this.events.submit_invoice();
                    cur_frm.reload_doc();
                } else {
                    message = __(
                        "Payment of {0} received successfully. Waiting for other requests to complete...",
                        [format_currency(amount, doc.currency, 0)]
                    );
                }
            } else if (failure_message) {
                message = failure_message;
                title = __("Payment Failed");
            }

            frappe.msgprint({ message: message, title: title });
        });
    }

    hide_zero_amount() {
        const payment_methods = this.$payment_modes.find(`.mode-of-payment`);
        for (let i = 0; i < payment_methods.length; i++) {
            const mode = payment_methods.get(i).getAttribute("data-mode");
            if (this[`${mode}_control`]?.value === 0) {
                this.$payment_modes.find(`.${mode}-amount`).get(0).innerHTML = "";
            }
        }
    }

    auto_set_remaining_amount() {
        const doc = this.events.get_frm().doc;
        const grand_total = cint(frappe.sys_defaults.disable_rounded_total)
            ? doc.grand_total
            : doc.rounded_total;
        const remaining_amount = grand_total - doc.paid_amount;
        const current_value = this.selected_mode ? this.selected_mode.get_value() : undefined;
        if (!current_value && remaining_amount > 0 && this.selected_mode) {
            this.selected_mode.set_value(remaining_amount);
        }
    }

    attach_shortcuts() {
        const ctrl_label = frappe.utils.is_mac() ? "⌘" : "Ctrl";
        this.$component.find(".submit-order-btn").attr("title", `${ctrl_label}+Enter`);
        frappe.ui.keys.on("ctrl+enter", () => {
            const payment_is_visible = this.$component.is(":visible");
            const active_mode = this.$payment_modes.find(".border-primary");
            if (payment_is_visible && active_mode.length) {
                this.$component.find(".submit-order-btn").click();
            }
        });

        frappe.ui.keys.add_shortcut({
            shortcut: "tab",
            action: () => {
                const payment_is_visible = this.$component.is(":visible");
                let active_mode = this.$payment_modes.find(".border-primary");
                active_mode = active_mode.length ? active_mode.attr("data-mode") : undefined;

                if (!active_mode) return;

                const mode_of_payments = Array.from(this.$payment_modes.find(".mode-of-payment")).map((m) =>
                    $(m).attr("data-mode")
                );
                const mode_index = mode_of_payments.indexOf(active_mode);
                const next_mode_index = (mode_index + 1) % mode_of_payments.length;
                const next_mode_to_be_clicked = this.$payment_modes.find(
                    `.mode-of-payment[data-mode="${mode_of_payments[next_mode_index]}"]`
                );

                if (payment_is_visible && mode_index != next_mode_index) {
                    next_mode_to_be_clicked.click();
                }
            },
            condition: () =>
                this.$component.is(":visible") && this.$payment_modes.find(".border-primary").length,
            description: __("Switch Between Payment Modes"),
            ignore_inputs: true,
            page: cur_page.page.page,
        });
    }

    toggle_numpad() {
        // pass
    }

    render_payment_section() {
        this.render_payment_mode_dom();
        this.make_invoice_field_dialog();
        this.update_totals_section();
        this.focus_on_default_mop();
    }

    after_render() {
        const frm = this.events.get_frm();
        frm.script_manager.trigger("after_payment_render", frm.doc.doctype, frm.doc.docname);
    }

    edit_cart() {
        this.events.toggle_other_sections(false);
        this.toggle_component(false);
    }

    checkout() {
        const frm = this.events.get_frm();
        frm.cscript.calculate_outstanding_amount();
        frm.refresh_field("outstanding_amount");
        frm.refresh_field("paid_amount");
        frm.refresh_field("base_paid_amount");
        this.events.toggle_other_sections(true);
        this.toggle_component(true);

        this.render_payment_section();
        this.after_render();
    }

    toggle_remarks_control() {
        if (this.$remarks.find(".frappe-control").length) {
            this.$remarks.html("+ Add Remark");
        } else {
            this.$remarks.html("");
            this[`remark_control`] = frappe.ui.form.make_control({
                df: {
                    label: __("Remark"),
                    fieldtype: "Data",
                    onchange: function () {},
                },
                parent: this.$totals_section.find(`.remarks`),
                render_input: true,
            });
            this[`remark_control`].set_value("");
        }
    }

    render_payment_mode_dom() {
        const doc = this.events.get_frm().doc;
        const payments = doc.payments;
        const currency = doc.currency;

        if (!this.$payment_modes.is(":visible")) {
            return;
        }

        this.$payment_modes.html(
            `${payments
                .map((p, i) => {
                    const mode = this.sanitize_mode_of_payment(p.mode_of_payment);
                    const payment_type = p.type;
                    const amount =
                        p.mode_of_payment === this.selected_mode?._label || p.amount !== 0
                            ? format_currency(p.amount, currency)
                            : "";

                    return `
                    <div class="payment-mode-wrapper">
                        <div class="mode-of-payment" data-mode="${mode}" data-payment-type="${payment_type}">
                            ${frappe.utils.escape_html(p.mode_of_payment)}
                            <div class="${mode}-amount pay-amount">${amount}</div>
                            <div class="${mode} mode-of-payment-control"></div>
                        </div>
                    </div>
                `;
                })
                .join("")}`
        );

        payments.forEach((p) => {
            const mode = this.sanitize_mode_of_payment(p.mode_of_payment);
            const me = this;
            this[`${mode}_control`] = frappe.ui.form.make_control({
                df: {
                    label: p.mode_of_payment,
                    fieldtype: "Currency",
                    placeholder: __("Enter {0} amount.", [__(p.mode_of_payment)]),
                    onchange: function () {
                        const current_value = frappe.model.get_value(p.doctype, p.name, "amount");
                        if (current_value != this.value) {
                            frappe.model
                                .set_value(p.doctype, p.name, "amount", flt(this.value))
                                .then(() => me.update_totals_section());

                            const formatted_currency = format_currency(this.value, currency);
                            me.$payment_modes.find(`.${mode}-amount`).html(formatted_currency);
                        }
                    },
                },
                parent: this.$payment_modes.find(`.${mode}.mode-of-payment-control`),
                render_input: true,
            });
            this[`${mode}_control`].toggle_label(false);
            this[`${mode}_control`].set_value(p.amount);
        });
        this.highlight_selected_mode();

        this.render_loyalty_points_payment_mode();
    }

    focus_on_default_mop() {
        if (!this.set_gt_to_default_mop) return;
        const doc = this.events.get_frm().doc;
        const payments = doc.payments;
        payments.forEach((p) => {
            const mode = this.sanitize_mode_of_payment(p.mode_of_payment);
            if (p.default) {
                setTimeout(() => {
                    this.$payment_modes.find(`.${mode}.mode-of-payment-control`).parent().click();
                }, 500);
            }
        });
    }

    render_loyalty_points_payment_mode() {
        const me = this;
        const doc = this.events.get_frm().doc;
        const { loyalty_program, loyalty_points, conversion_factor } = this.events.get_customer_details();

        this.$payment_modes.find(`.mode-of-payment[data-mode="loyalty-amount"]`).parent().remove();

        if (!loyalty_program) return;

        let description, read_only, max_redeemable_amount;
        if (!loyalty_points) {
            description = __("You don't have enough points to redeem.");
            read_only = true;
        } else {
            max_redeemable_amount = flt(
                flt(loyalty_points) * flt(conversion_factor),
                precision("loyalty_amount", doc)
            );
            description = __("You can redeem upto {0}.", [format_currency(max_redeemable_amount)]);
            read_only = false;
        }

        const margin = this.$payment_modes.children().length % 2 === 0 ? "pr-2" : "pl-2";
        const amount = doc.loyalty_amount > 0 ? format_currency(doc.loyalty_amount, doc.currency) : "";
        this.$payment_modes.append(
            `<div class="payment-mode-wrapper">
                <div class="mode-of-payment loyalty-card" data-mode="loyalty-amount" data-payment-type="loyalty-amount">
                    Redeem Loyalty Points
                    <div class="loyalty-amount-amount pay-amount">${amount}</div>
                    <div class="loyalty-amount-name">${frappe.utils.escape_html(loyalty_program)}</div>
                    <div class="loyalty-amount mode-of-payment-control"></div>
                </div>
            </div>`
        );

        this["loyalty-amount_control"] = frappe.ui.form.make_control({
            df: {
                label: __("Redeem Loyalty Points"),
                fieldtype: "Currency",
                placeholder: __("Enter amount to be redeemed."),
                options: "company:currency",
                read_only,
                onchange: async function () {
                    if (!loyalty_points) return;

                    if (this.value > max_redeemable_amount) {
                        frappe.show_alert({
                            message: __("You cannot redeem more than {0}.", [
                                format_currency(max_redeemable_amount),
                            ]),
                            indicator: "red",
                        });
                        frappe.utils.play_sound("submit");
                        me["loyalty-amount_control"].set_value(0);
                        return;
                    }
                    const redeem_loyalty_points = this.value > 0 ? 1 : 0;
                    await frappe.model.set_value(
                        doc.doctype,
                        doc.name,
                        "redeem_loyalty_points",
                        redeem_loyalty_points
                    );
                    frappe.model.set_value(
                        doc.doctype,
                        doc.name,
                        "loyalty_points",
                        parseInt(this.value / conversion_factor)
                    );
                },
                description,
            },
            parent: this.$payment_modes.find(`.loyalty-amount.mode-of-payment-control`),
            render_input: true,
        });
        this["loyalty-amount_control"].toggle_label(false);

        this.highlight_selected_mode();
        // this.render_add_payment_method_dom();
    }

    highlight_selected_mode() {
        if (this.selected_mode) {
            const mode = this.sanitize_mode_of_payment(this.selected_mode.df.label);
            this.$payment_modes.find(`.mode-of-payment[data-mode="${mode}"]`).addClass("border-primary");
        }
    }

    render_add_payment_method_dom() {
        const docstatus = this.events.get_frm().doc.docstatus;
        if (docstatus === 0)
            this.$payment_modes.append(
                `<div class="w-full pr-2">
                    <div class="add-mode-of-payment w-half text-grey mb-4 no-select pointer">+ Add Payment Method</div>
                </div>`
            );
    }

    update_totals_section(doc) {
        if (!doc) doc = this.events.get_frm().doc;
        const paid_amount = doc.paid_amount;
        const grand_total = cint(frappe.sys_defaults.disable_rounded_total)
            ? doc.grand_total
            : doc.rounded_total;
        const remaining = grand_total - doc.paid_amount;
        const change = doc.change_amount || remaining <= 0 ? -1 * remaining : undefined;
        const currency = doc.currency;
        const label = doc.paid_amount > grand_total ? __("Change Amount") : __("Remaining Amount");

        if (!this.$totals.is(":visible")) {
            return;
        }

        this.$totals.html(
            `<div class="col">
                <div class="total-label">${__("Grand Total")}</div>
                <div class="value">${format_currency(grand_total, currency)}</div>
            </div>
            <div class="seperator-y"></div>
            <div class="col">
                <div class="total-label">${__("Paid Amount")}</div>
                <div class="value">${format_currency(paid_amount, currency)}</div>
            </div>
            <div class="seperator-y"></div>
            <div class="col">
                <div class="total-label">${label}</div>
                <div class="value ${doc.paid_amount < grand_total ? "text-danger" : "text-success"}">${format_currency(
                change || remaining,
                currency
            )}</div>
            </div>`
        );
    }

    toggle_component(show) {
        show ? this.$component.css("display", "flex") : this.$component.css("display", "none");
    }

    sanitize_mode_of_payment(mode_of_payment) {
        return mode_of_payment
            .replace(/ +/g, "_")
            .replace(/[^\p{L}\p{N}_-]/gu, "")
            .replace(/^[^_a-zA-Z\p{L}]+/u, "")
            .toLowerCase();
    }

    validate_reqd_invoice_fields() {
        if (this.invoice_fields.length === 0) return true;
        const doc = this.events.get_frm().doc;
        for (const df of this.addl_dlg.fields) {
            if (df.reqd && !doc[df.fieldname]) {
                this.addl_dlg.primary_action_label = "Submit";
                this.addl_dlg.complete_order = true;
                this.addl_dlg.show();
                this.addl_dlg.fields_dict[df.fieldname].$input.focus();
                return false;
            }
        }
        return true;
    }
};

/* END pos_payment.js */


/* BEGIN pos_past_order_list.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.PastOrderList = class {
    constructor({ wrapper, events }) {
        this.wrapper = wrapper;
        this.events = events;

        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.make_filter_section();
        this.bind_events();
    }

    prepare_dom() {
        this.wrapper.append(
            `<section class="past-order-list">
                <div class="filter-section">
                    <div class="label">${__("Recent Orders")}</div>
                    <div class="status-search-fields">
                        <div class="status-field"></div>
                        <div class="search-field"></div>
                    </div>
                </div>
                <div class="invoices-container"></div>
            </section>`
        );

        this.$component = this.wrapper.find(".past-order-list");
        this.$invoices_container = this.$component.find(".invoices-container");
    }

    bind_events() {
        this.search_field.$input.on("input", (e) => {
            clearTimeout(this.last_search);
            this.last_search = setTimeout(() => {
                const search_term = e.target.value;
                this.refresh_list(search_term, this.status_field.get_value());
            }, 300);
        });
        const me = this;
        this.$invoices_container.on("click", ".invoice-wrapper", function () {
            const invoice_clicked = $(this);
            const invoice_doctype = invoice_clicked.attr("data-invoice-doctype");
            const invoice_name = invoice_clicked.attr("data-invoice-name");

            $(".invoice-wrapper").removeClass("invoice-selected");
            invoice_clicked.addClass("invoice-selected");

            me.events.open_invoice_data(invoice_doctype, invoice_name);
        });
    }

    make_filter_section() {
        const me = this;
        this.search_field = frappe.ui.form.make_control({
            df: {
                label: __("Search"),
                fieldtype: "Data",
                placeholder: __("Search by invoice id or customer name"),
            },
            parent: this.$component.find(".search-field"),
            render_input: true,
        });
        this.status_field = frappe.ui.form.make_control({
            df: {
                label: __("Invoice Status"),
                fieldtype: "Select",
                options: ["Draft", "Paid", "Consolidated", "Return", "Partly Paid"].join("\n"),
                placeholder: __("Filter by invoice status"),
                onchange: function () {
                    if (me.$component.is(":visible")) me.refresh_list();
                },
            },
            parent: this.$component.find(".status-field"),
            render_input: true,
        });
        this.search_field.toggle_label(false);
        this.status_field.toggle_label(false);
        this.status_field.set_value("Draft");
    }

    refresh_list() {
        frappe.dom.freeze();
        this.events.reset_summary();
        const search_term = this.search_field.get_value();
        const status = this.status_field.get_value();

        this.$invoices_container.html("");

        return frappe.call({
            method: "erpnext.selling.page.point_of_sale.point_of_sale.get_past_order_list",
            freeze: true,
            args: { search_term, status },
            callback: (response) => {
                frappe.dom.unfreeze();
                response.message.forEach((invoice) => {
                    const invoice_html = this.get_invoice_html(invoice);
                    this.$invoices_container.append(invoice_html);
                });
            },
        });
    }

    get_invoice_html(invoice) {
        const posting_datetime = frappe.datetime.str_to_user(
            invoice.posting_date + " " + invoice.posting_time
        );
        return `<div class="invoice-wrapper" data-invoice-doctype="${
            invoice.doctype
        }" data-invoice-name="${frappe.utils.escape_html(invoice.name)}">
                <div class="invoice-name-customer">
                    <div class="invoice-customer">
                        <svg class="mr-2" width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        ${frappe.utils.escape_html(frappe.ellipsis(invoice.customer_name, 20))}
                    </div>
                    <div class="invoice-name">${frappe.utils.escape_html(invoice.name)}</div>
                </div>
                <div class="invoice-total-date">
                    <div class="invoice-total">${format_currency(invoice.grand_total, invoice.currency) || 0}</div>
                    <div class="invoice-date">${posting_datetime}</div>
                </div>
            </div>
            <div class="seperator"></div>`;
    }

    toggle_component(show) {
        show
            ? this.$component.css("display", "flex") && this.refresh_list()
            : this.$component.css("display", "none");
    }
};

/* END pos_past_order_list.js */


/* BEGIN pos_past_order_summary.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.PastOrderSummary = class {
    constructor({ wrapper, settings, events }) {
        this.wrapper = wrapper;
        this.events = events;
        this.print_receipt_on_order_complete = settings.print_receipt_on_order_complete;

        this.init_component();
    }

    init_component() {
        this.prepare_dom();
        this.init_email_print_dialog();
        this.bind_events();
        this.attach_shortcuts();
    }

    prepare_dom() {
        this.wrapper.append(
            `<section class="past-order-summary">
                <div class="no-summary-placeholder">
                    ${__("Select an invoice to load summary data")}
                </div>
                <div class="invoice-summary-wrapper">
                    <div class="abs-container">
                        <div class="upper-section"></div>
                        <div class="label">${__("Items")}</div>
                        <div class="items-container summary-container order-summary-container"></div>
                        <div class="label">${__("Totals")}</div>
                        <div class="totals-container summary-container"></div>
                        <div class="label">${__("Payments")}</div>
                        <div class="payments-container summary-container"></div>
                        <div class="summary-btns"></div>
                    </div>
                </div>
            </section>`
        );

        this.$component = this.wrapper.find(".past-order-summary");
        this.$summary_wrapper = this.$component.find(".invoice-summary-wrapper");
        this.$summary_container = this.$component.find(".abs-container");
        this.$upper_section = this.$summary_container.find(".upper-section");
        this.$items_container = this.$summary_container.find(".items-container");
        this.$totals_container = this.$summary_container.find(".totals-container");
        this.$payment_container = this.$summary_container.find(".payments-container");
        this.$summary_btns = this.$summary_container.find(".summary-btns");
    }

    init_email_print_dialog() {
        const email_dialog = new frappe.ui.Dialog({
            title: __("Email Receipt"),
            fields: [
                { fieldname: "email_id", fieldtype: "Data", options: "Email", label: "Email ID", reqd: 1 },
                { fieldname: "content", fieldtype: "Small Text", label: "Message (if any)" },
            ],
            primary_action: () => {
                this.send_email();
            },
            primary_action_label: __("Send"),
        });
        this.email_dialog = email_dialog;

        const print_dialog = new frappe.ui.Dialog({
            title: __("Print Receipt"),
            fields: [{ fieldname: "print", fieldtype: "Data", label: "Print Preview" }],
            primary_action: () => {
                this.print_receipt();
            },
            primary_action_label: __("Print"),
        });
        this.print_dialog = print_dialog;
    }

    get_upper_section_html(doc) {
        const { status } = doc;
        let indicator_color = "";
        const is_customer_naming_by_customer_name = frappe.sys_defaults.cust_master_name !== "Customer Name";

        ["Paid", "Consolidated"].includes(status) && (indicator_color = "green");
        ["Partly Paid", "Overdue"].includes(status) && (indicator_color = "yellow");
        ["Draft", "Unpaid"].includes(status) && (indicator_color = "red");
        ["Credit Note Issued", "Return"].includes(status) && (indicator_color = "grey");

        return `<div class="left-section">
                    <div class="customer-section">
                        <div class="customer-name">${frappe.utils.escape_html(doc.customer_name)}</div>
                        ${
                            is_customer_naming_by_customer_name
                                ? `<div class="customer-code">${frappe.utils.escape_html(doc.customer)}</div>`
                                : ""
                        }
                        <div class="customer-email">${frappe.utils.escape_html(this.customer_email)}</div>
                    </div>
                    <div class="cashier">${__("Sold by")}: ${frappe.utils.escape_html(doc.owner)}</div>
                </div>
                <div class="right-section">
                    <div class="paid-amount">${format_currency(doc.paid_amount, doc.currency)}</div>
                    <div class="invoice-name">${frappe.utils.escape_html(doc.name)}</div>
                    <span class="indicator-pill whitespace-nowrap ${indicator_color}"><span>${__(doc.status)}</span></span>
                </div>`;
    }

    async get_item_html(doc, item_data) {
        const item_refund_data = doc.is_return || doc.docstatus === 0 ? "" : await get_returned_qty();

        return `<div class="item-row-wrapper">
                <div class="item-row-data">
                    <div class="item-name">${frappe.utils.escape_html(item_data.item_name)}</div>
                    <div class="item-qty">${item_data.qty || 0} ${frappe.utils.escape_html(item_data.uom)}</div>
                    <div class="item-rate-disc">${get_rate_discount_html()}</div>
                </div>

                ${item_refund_data}
        </div>`;

        function get_rate_discount_html() {
            if (item_data.rate && item_data.price_list_rate && item_data.rate !== item_data.price_list_rate) {
                return `<span class="item-disc">(${item_data.discount_percentage}% off)</span>
                        <div class="item-rate">${format_currency(item_data.rate, doc.currency)}</div>`;
            } else {
                return `<div class="item-rate">${format_currency(
                    item_data.price_list_rate || item_data.rate,
                    doc.currency
                )}</div>`;
            }
        }

        async function get_returned_qty() {
            const r = await frappe.call({
                method: "erpnext.controllers.sales_and_purchase_return.get_invoice_item_returned_qty",
                args: {
                    doctype: doc.doctype,
                    invoice: doc.name,
                    customer: doc.customer,
                    item_row_name: item_data.name,
                },
            });

            if (!r.message.qty) {
                return "";
            }

            return `<div class="item-row-refund">
                <strong>${r.message.qty}</strong> ${__("Returned")}
            </div>`;
        }
    }

    get_discount_html(doc) {
        if (doc.discount_amount) {
            return `<div class="summary-row-wrapper">
                        <div>${__("Discount")} (${doc.additional_discount_percentage} %)</div>
                        <div>${format_currency(doc.discount_amount, doc.currency)}</div>
                    </div>`;
        } else {
            return ``;
        }
    }

    get_net_total_html(doc) {
        return `<div class="summary-row-wrapper">
                    <div>${__("Net Total")}</div>
                    <div>${format_currency(doc.net_total, doc.currency)}</div>
                </div>`;
    }

    get_taxes_html(doc) {
        if (!doc.taxes.length) return "";

        let taxes_html = doc.taxes
            .map((t) => {
                return `
                <div class="tax-row">
                    <div class="tax-label">${frappe.utils.escape_html(t.description)}</div>
                    <div class="tax-value">${format_currency(t.tax_amount_after_discount_amount, doc.currency)}</div>
                </div>
            `;
            })
            .join("");

        return `<div class="taxes-wrapper">${taxes_html}</div>`;
    }

    get_grand_total_html(doc) {
        return `<div class="summary-row-wrapper grand-total">
                    <div>${__("Grand Total")}</div>
                    <div>${format_currency(doc.grand_total, doc.currency)}</div>
                </div>`;
    }

    get_payment_html(doc, payment) {
        return `<div class="summary-row-wrapper payments">
                    <div>${frappe.utils.escape_html(__(payment.mode_of_payment))}</div>
                    <div>${format_currency(payment.amount, doc.currency)}</div>
                </div>`;
    }

    bind_events() {
        this.$summary_container.on("click", ".return-btn", async () => {
            const r = await this.is_invoice_returnable(this.doc.doctype, this.doc.name);
            if (!r) {
                frappe.msgprint({
                    title: __("Invalid Return"),
                    indicator: "orange",
                    message: __("All the items have been already returned."),
                });
                return;
            }
            this.events.process_return(this.doc.doctype, this.doc.name);
            this.toggle_component(false);
            this.$component.find(".no-summary-placeholder").css("display", "flex");
            this.$summary_wrapper.css("display", "none");
        });

        this.$summary_container.on("click", ".edit-btn", () => {
            this.events.edit_order(this.doc.doctype, this.doc.name);
            this.toggle_component(false);
            this.$component.find(".no-summary-placeholder").css("display", "flex");
            this.$summary_wrapper.css("display", "none");
        });

        this.$summary_container.on("click", ".delete-btn", () => {
            this.events.delete_order(this.doc.doctype, this.doc.name);
            this.show_summary_placeholder();
        });

        this.$summary_container.on("click", ".delete-btn", () => {
            this.events.delete_order(this.doc.name);
            this.show_summary_placeholder();
            // this.toggle_component(false);
            // this.$component.find('.no-summary-placeholder').removeClass('d-none');
            // this.$summary_wrapper.addClass('d-none');
        });

        this.$summary_container.on("click", ".new-btn", () => {
            this.events.new_order();
            this.toggle_component(false);
            this.$component.find(".no-summary-placeholder").css("display", "flex");
            this.$summary_wrapper.css("display", "none");
        });

        this.$summary_container.on("click", ".email-btn", () => {
            this.email_dialog.fields_dict.email_id.set_value(this.customer_email);
            this.email_dialog.show();
        });

        this.$summary_container.on("click", ".print-btn", () => {
            this.print_receipt();
        });

        this.$summary_container.on("click", ".open-btn", () => {
            this.events.open_in_form_view(this.doc.doctype, this.doc.name);
        });
    }

    print_receipt() {
        const frm = this.events.get_frm();
        frappe.utils.print(
            this.doc.doctype,
            this.doc.name,
            frm.pos_print_format,
            this.doc.letter_head,
            this.doc.language || frappe.boot.lang
        );
    }

    attach_shortcuts() {
        const ctrl_label = frappe.utils.is_mac() ? "⌘" : "Ctrl";
        this.$summary_container.find(".print-btn").attr("title", `${ctrl_label}+P`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+p",
            action: () => this.$summary_container.find(".print-btn").click(),
            condition: () =>
                this.$component.is(":visible") && this.$summary_container.find(".print-btn").is(":visible"),
            description: __("Print Receipt"),
            page: cur_page.page.page,
        });
        this.$summary_container.find(".new-btn").attr("title", `${ctrl_label}+Enter`);
        frappe.ui.keys.on("ctrl+enter", () => {
            const summary_is_visible = this.$component.is(":visible");
            if (summary_is_visible && this.$summary_container.find(".new-btn").is(":visible")) {
                this.$summary_container.find(".new-btn").click();
            }
        });
        this.$summary_container.find(".edit-btn").attr("title", `${ctrl_label}+E`);
        frappe.ui.keys.add_shortcut({
            shortcut: "ctrl+e",
            action: () => this.$summary_container.find(".edit-btn").click(),
            condition: () =>
                this.$component.is(":visible") && this.$summary_container.find(".edit-btn").is(":visible"),
            description: __("Edit Receipt"),
            page: cur_page.page.page,
        });
    }

    send_email() {
        const frm = this.events.get_frm();
        const recipients = this.email_dialog.get_values().email_id;
        const content = this.email_dialog.get_values().content;
        const doc = this.doc || frm.doc;
        const print_format = frm.pos_print_format;

        frappe.call({
            method: "frappe.core.doctype.communication.email.make",
            args: {
                recipients: recipients,
                subject: __(frm.meta.name) + ": " + doc.name,
                content: content ? content : __(frm.meta.name) + ": " + doc.name,
                doctype: doc.doctype,
                name: doc.name,
                send_email: 1,
                print_format,
                sender_full_name: frappe.user.full_name(),
                _lang: doc.language,
            },
            callback: (r) => {
                if (!r.exc) {
                    frappe.utils.play_sound("email");
                    if (r.message["emails_not_sent_to"]) {
                        frappe.msgprint(
                            __("Email not sent to {0} (unsubscribed / disabled)", [
                                frappe.utils.escape_html(r.message["emails_not_sent_to"]),
                            ])
                        );
                    } else {
                        frappe.show_alert({
                            message: __("Email sent successfully."),
                            indicator: "green",
                        });
                    }
                    this.email_dialog.hide();
                } else {
                    frappe.msgprint(__("There were errors while sending email. Please try again."));
                }
            },
        });
    }

    add_summary_btns(map) {
        this.$summary_btns.html("");
        map.forEach((m) => {
            if (m.condition) {
                m.visible_btns.forEach((b) => {
                    const class_name = b.split(" ")[0].toLowerCase();
                    const btn = __(b);
                    this.$summary_btns.append(
                        `<div class="summary-btn btn btn-default ${class_name}-btn">${btn}</div>`
                    );
                });
            }
        });
        this.$summary_btns.children().last().removeClass("mr-4");
    }

    toggle_summary_placeholder(show) {
        if (show) {
            this.$summary_wrapper.css("display", "none");
            this.$component.find(".no-summary-placeholder").css("display", "flex");
        } else {
            this.$summary_wrapper.css("display", "flex");
            this.$component.find(".no-summary-placeholder").css("display", "none");
        }
    }

    get_condition_btn_map(after_submission) {
        if (after_submission)
            return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];

        return [
            { condition: this.doc.docstatus === 0, visible_btns: ["Edit Order", "Delete Order"] },
            {
                condition: ["Partly Paid", "Overdue", "Unpaid"].includes(this.doc.status),
                visible_btns: ["Print Receipt", "Email Receipt", "Open in Form View"],
            },
            {
                condition:
                    !this.doc.is_return &&
                    this.doc.docstatus === 1 &&
                    !["Partly Paid", "Overdue", "Unpaid"].includes(this.doc.status),
                visible_btns: ["Print Receipt", "Email Receipt", "Return"],
            },
            {
                condition: this.doc.is_return && this.doc.docstatus === 1,
                visible_btns: ["Print Receipt", "Email Receipt"],
            },
        ];
    }

    load_summary_of(doc, after_submission = false) {
        after_submission
            ? this.$component.css("grid-column", "span 10 / span 10")
            : this.$component.css("grid-column", "span 6 / span 6");

        this.toggle_summary_placeholder(false);

        this.doc = doc;

        this.attach_document_info(doc);

        this.attach_items_info(doc);

        this.attach_totals_info(doc);

        this.attach_payments_info(doc);

        const condition_btns_map = this.get_condition_btn_map(after_submission);

        this.add_summary_btns(condition_btns_map);

        if (after_submission && this.print_receipt_on_order_complete) {
            this.print_receipt();
        }
    }

    attach_document_info(doc) {
        frappe.db.get_value("Customer", this.doc.customer, "email_id").then(({ message }) => {
            this.customer_email = message.email_id || "";
            const upper_section_dom = this.get_upper_section_html(doc);
            this.$upper_section.html(upper_section_dom);
        });
    }

    async attach_items_info(doc) {
        this.$items_container.html("");
        for (const item of doc.items) {
            const item_dom = await this.get_item_html(doc, item);
            this.$items_container.append(item_dom);
            this.set_dynamic_rate_header_width();
        }
    }

    set_dynamic_rate_header_width() {
        const rate_cols = Array.from(this.$items_container.find(".item-rate-disc"));
        this.$items_container.find(".item-rate-disc").css("width", "");
        let max_width = rate_cols.reduce((max_width, elm) => {
            if ($(elm).width() > max_width) max_width = $(elm).width();
            return max_width;
        }, 0);

        max_width += 1;
        if (max_width == 1) max_width = "";

        this.$items_container.find(".item-rate-disc").css("width", max_width);
    }

    attach_payments_info(doc) {
        this.$payment_container.html("");
        doc.payments.forEach((p) => {
            if (p.amount) {
                const payment_dom = this.get_payment_html(doc, p);
                this.$payment_container.append(payment_dom);
            }
        });
        if (doc.redeem_loyalty_points && doc.loyalty_amount) {
            const payment_dom = this.get_payment_html(doc, {
                mode_of_payment: "Loyalty Points",
                amount: doc.loyalty_amount,
            });
            this.$payment_container.append(payment_dom);
        }
    }

    attach_totals_info(doc) {
        this.$totals_container.html("");

        const net_total_dom = this.get_net_total_html(doc);
        const taxes_dom = this.get_taxes_html(doc);
        const discount_dom = this.get_discount_html(doc);
        const grand_total_dom = this.get_grand_total_html(doc);
        this.$totals_container.append(net_total_dom);
        this.$totals_container.append(taxes_dom);
        this.$totals_container.append(discount_dom);
        this.$totals_container.append(grand_total_dom);
    }

    toggle_component(show) {
        this.$component.css("grid-column", "span 6 / span 6");
        show ? this.$component.css("display", "flex") : this.$component.css("display", "none");
    }

    async is_invoice_returnable(doctype, invoice) {
        const r = await frappe.call({
            method: "erpnext.controllers.sales_and_purchase_return.is_invoice_returnable",
            args: {
                doctype: doctype,
                invoice: invoice,
            },
        });
        return r.message;
    }
};

/* END pos_past_order_summary.js */


/* BEGIN pos_controller.js */
/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */
window.WMN_POS.Source.Controller = class {
    constructor(wrapper) {
        this.wrapper = $(wrapper).find(".layout-main-section");
        this.page = wrapper.page;

        this.check_opening_entry();
    }

    fetch_opening_entry() {
        return frappe.call("erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry", {
            user: frappe.session.user,
        });
    }

    check_opening_entry() {
        this.fetch_opening_entry().then((r) => {
            if (r.message.length) {
                // assuming only one opening voucher is available for the current user
                this.prepare_app_defaults(r.message[0]);
            } else {
                this.create_opening_voucher();
            }
        });
    }

    create_opening_voucher() {
        const me = this;
        const table_fields = [
            {
                fieldname: "mode_of_payment",
                fieldtype: "Link",
                in_list_view: 1,
                label: __("Mode of Payment"),
                options: "Mode of Payment",
                reqd: 1,
            },
            {
                fieldname: "opening_amount",
                fieldtype: "Currency",
                in_list_view: 1,
                label: __("Opening Amount"),
                options: "company:company_currency",
            },
        ];
        const fetch_pos_payment_methods = () => {
            const pos_profile = dialog.fields_dict.pos_profile.get_value();
            if (!pos_profile) return;
            frappe.db.get_doc("POS Profile", pos_profile).then(({ payments }) => {
                dialog.fields_dict.balance_details.df.data = [];
                payments.forEach((pay) => {
                    const { mode_of_payment } = pay;
                    dialog.fields_dict.balance_details.df.data.push({ mode_of_payment, opening_amount: "0" });
                });
                dialog.fields_dict.balance_details.grid.refresh();
            });
        };
        const dialog = new frappe.ui.Dialog({
            title: __("Create POS Opening Entry"),
            static: true,
            fields: [
                {
                    fieldtype: "Link",
                    label: __("Company"),
                    default: frappe.defaults.get_default("company"),
                    options: "Company",
                    fieldname: "company",
                    reqd: 1,
                },
                {
                    fieldtype: "Link",
                    label: __("POS Profile"),
                    options: "POS Profile",
                    fieldname: "pos_profile",
                    reqd: 1,
                    get_query: () => pos_profile_query(),
                    onchange: () => fetch_pos_payment_methods(),
                },
                {
                    fieldname: "balance_details",
                    fieldtype: "Table",
                    label: __("Opening Balance Details"),
                    cannot_add_rows: false,
                    in_place_edit: true,
                    reqd: 1,
                    data: [],
                    fields: table_fields,
                },
            ],
            primary_action: async function ({ company, pos_profile, balance_details }) {
                if (!balance_details.length) {
                    frappe.show_alert({
                        message: __("Please add Mode of payments and opening balance details."),
                        indicator: "red",
                    });
                    return frappe.utils.play_sound("error");
                }

                // filter balance details for empty rows
                balance_details = balance_details.filter((d) => d.mode_of_payment);

                const method = "erpnext.selling.page.point_of_sale.point_of_sale.create_opening_voucher";
                const res = await frappe.call({
                    method,
                    args: { pos_profile, company, balance_details },
                    freeze: true,
                });
                !res.exc && me.prepare_app_defaults(res.message);
                dialog.hide();
            },
            primary_action_label: __("Submit"),
        });
        dialog.show();
        const pos_profile_query = () => {
            return {
                query: "erpnext.accounts.doctype.pos_profile.pos_profile.pos_profile_query",
                filters: { company: dialog.fields_dict.company.get_value() },
            };
        };
    }

    async prepare_app_defaults(data) {
        this.pos_opening = data.name;
        this.company = data.company;
        this.pos_profile = data.pos_profile;
        this.pos_opening_time = data.period_start_date;
        this.item_stock_map = {};
        this.settings = {};

        frappe.db.get_value("Stock Settings", undefined, "allow_negative_stock").then(({ message }) => {
            this.allow_negative_stock = flt(message.allow_negative_stock) || false;
        });

        const invoice_doctype = await frappe.db.get_single_value("POS Settings", "invoice_type");

        frappe.call({
            method: "erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data",
            args: { pos_profile: this.pos_profile },
            callback: (res) => {
                const profile = res.message;
                Object.assign(this.settings, profile);
                this.settings.customer_groups = profile.customer_groups.map((group) => group.name);
                this.settings.frm_doctype = invoice_doctype;
                this.make_app();
            },
        });

        this.fetch_invoice_fields();
        this.setup_listener_for_pos_closing();
        this.check_outdated_pos_opening_entry();
    }

    async fetch_invoice_fields() {
        this.settings.invoice_fields = new Array();
        const pos_settings = await frappe.db.get_doc("POS Settings", undefined);
        pos_settings.invoice_fields.forEach((field) => {
            this.settings.invoice_fields.push({
                fieldname: field.fieldname,
                label: field.label,
                fieldtype: field.fieldtype,
                reqd: field.reqd,
                options: field.options,
                default_value: field.default_value,
                read_only: field.read_only,
            });
        });
    }

    setup_listener_for_pos_closing() {
        frappe.realtime.on(`poe_${this.pos_opening}`, (data) => {
            const route = frappe.get_route_str();
            if (data && route == "point-of-sale") {
                frappe.dom.freeze();
                const title =
                    data.operation === "Closed" ? __("POS Closed") : __("POS Opening Entry Cancelled");
                const msg =
                    data.operation === "Closed"
                        ? __("POS has been closed at {0}. Please refresh the page.", [
                                frappe.datetime.str_to_user(data.doc?.creation).bold(),
                          ])
                        : __("POS Opening Entry has been cancelled. Please refresh the page.");
                frappe.msgprint({
                    title: title,
                    indicator: "orange",
                    message: msg,
                    primary_action_label: __("Refresh"),
                    primary_action: {
                        action() {
                            window.location.reload();
                        },
                    },
                });
            }
        });
    }

    check_outdated_pos_opening_entry() {
        if (frappe.datetime.get_day_diff(frappe.datetime.get_today(), this.pos_opening_time.slice(0, 10))) {
            frappe.msgprint({
                title: __("Outdated POS Opening Entry"),
                message: __(
                    "The current POS opening entry is outdated. Please close it and create a new one."
                ),
                indicator: "yellow",
            });
        }
    }

    set_opening_entry_status() {
        this.page.set_title_sub(
            `<span class="indicator orange">
                <a class="text-muted" href="#Form/POS%20Opening%20Entry/${encodeURIComponent(this.pos_opening)}">
                    Opened at ${frappe.datetime.str_to_user(this.pos_opening_time)}
                </a>
            </span>`
        );
    }

    make_app() {
        this.prepare_dom();
        this.prepare_components();
        this.prepare_menu();
        this.prepare_btns();
        this.make_new_invoice();
    }

    prepare_dom() {
        this.wrapper.append(`<div class="point-of-sale-app"></div>`);

        this.$components_wrapper = this.wrapper.find(".point-of-sale-app");
    }

    prepare_components() {
        this.init_item_selector();
        this.init_item_details();
        this.init_item_cart();
        this.init_payments();
        this.init_recent_order_list();
        this.init_order_summary();
    }

    prepare_menu() {
        this.page.clear_menu();
        this.page.add_menu_item(__("Open Form View"), this.open_form_view.bind(this), false, "Ctrl+F");
        this.page.add_menu_item(__("Close the POS"), this.close_pos.bind(this), false, "Shift+Ctrl+C");
    }

    prepare_btns() {
        this.page.clear_custom_actions();
        this.page.clear_icons();
        this.page.set_primary_action(__("New Invoice"), this.new_invoice_event.bind(this));
        this.page.set_secondary_action(__("Recent Orders"), this.toggle_recent_order.bind(this));
    }

    open_form_view() {
        frappe.model.sync(this.frm.doc);
        frappe.set_route("Form", this.frm.doc.doctype, this.frm.doc.name);
    }

    toggle_recent_order() {
        const show = this.recent_order_list.$component.is(":hidden");
        this.page.btn_secondary.get(0).innerText = show ? __("Hide Recent Orders") : __("Recent Orders");
        this.toggle_recent_order_list(show);
    }

    new_invoice_event() {
        const me = this;
        if (!this.$components_wrapper.is(":visible")) return;

        if (this.frm.doc.items.length !== 0 && (this.frm.is_new() || this.frm.is_dirty())) {
            if (this.settings.action_on_new_invoice === "Always Ask") {
                frappe.confirm(
                    __("You have unsaved changes. Do you want to save the invoice?"),
                    () => {
                        me.frm.save().then(me.load_new_invoice_on_pos.bind(me));
                    },
                    () => {
                        me.load_new_invoice_on_pos();
                    }
                );
                return;
            } else if (this.settings.action_on_new_invoice === "Save Changes and Load New Invoice") {
                this.frm.save().then(me.load_new_invoice_on_pos.bind(me));
                return;
            }

            this.load_new_invoice_on_pos();
            return;
        }

        if (this.payment.$component.is(":visible")) {
            this.load_new_invoice_on_pos();
        }
    }

    load_new_invoice_on_pos() {
        frappe.run_serially([
            () => frappe.dom.freeze(),
            () => this.make_new_invoice(),
            () => this.toggle_recent_order_list(false),
            () => this.toggle_components(true),
            () => frappe.dom.unfreeze(),
        ]);
    }

    close_pos() {
        if (!this.$components_wrapper.is(":visible")) return;

        let voucher = frappe.model.get_new_doc("POS Closing Entry");
        voucher.pos_profile = this.frm.doc.pos_profile;
        voucher.user = frappe.session.user;
        voucher.company = this.frm.doc.company;
        voucher.pos_opening_entry = this.pos_opening;
        voucher.period_end_date = frappe.datetime.now_datetime();
        voucher.posting_date = frappe.datetime.now_date();
        voucher.posting_time = frappe.datetime.now_time();
        frappe.set_route("Form", "POS Closing Entry", voucher.name);
    }

    init_item_selector() {
        this.item_selector = new window.WMN_POS.Source.ItemSelector({
            wrapper: this.$components_wrapper,
            pos_profile: this.pos_profile,
            settings: this.settings,
            events: {
                item_selected: (args) => this.on_cart_update(args),

                get_frm: () => this.frm || {},
            },
        });
    }

    init_item_cart() {
        this.cart = new window.WMN_POS.Source.ItemCart({
            wrapper: this.$components_wrapper,
            settings: this.settings,
            events: {
                get_frm: () => this.frm,

                cart_item_clicked: (item) => {
                    const item_row = this.get_item_from_frm(item);
                    this.item_details.toggle_item_details_section(item_row);
                },

                numpad_event: (value, action) => this.update_item_field(value, action),

                checkout: () => this.save_and_checkout(),

                edit_cart: () => this.payment.edit_cart(),

                customer_details_updated: (details) => {
                    this.item_selector.load_items_data();
                    this.customer_details = details;
                    // will add/remove LP payment method
                    this.payment.render_loyalty_points_payment_mode();
                },
            },
        });
    }

    init_item_details() {
        this.item_details = new window.WMN_POS.Source.ItemDetails({
            wrapper: this.$components_wrapper,
            settings: this.settings,
            events: {
                get_frm: () => this.frm,

                toggle_item_selector: (minimize) => {
                    this.item_selector.toggle_component(!minimize);
                    this.cart.toggle_numpad(minimize);
                },

                form_updated: (item, field, value) => {
                    const item_row = frappe.model.get_doc(item.doctype, item.name);
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
                    // called if serial nos are 'auto_selected' and if those serial nos belongs to multiple batches
                    // for each unique batch new item row is added in the form & cart
                    Object.keys(batch_serial_map).forEach((batch) => {
                        const item_to_clone = this.frm.doc.items.find((i) => i.name == item.name);
                        const new_row = this.frm.add_child("items", { ...item_to_clone });
                        // update new serialno and batch
                        new_row.batch_no = batch;
                        new_row.serial_no = batch_serial_map[batch].join(`\n`);
                        new_row.qty = batch_serial_map[batch].length;
                        this.frm.doc.items.forEach((row) => {
                            if (item.item_code === row.item_code) {
                                this.update_cart_html(row);
                            }
                        });
                    });
                },
                remove_item_from_cart: () => this.remove_item_from_cart(),
                get_item_stock_map: () => this.item_stock_map,
                close_item_details: () => {
                    this.item_details.toggle_item_details_section(null);
                    this.cart.prev_action = null;
                    this.cart.toggle_item_highlight();
                },
                get_available_stock: (item_code, warehouse) => this.get_available_stock(item_code, warehouse),
            },
        });
    }

    init_payments() {
        this.payment = new window.WMN_POS.Source.Payment({
            wrapper: this.$components_wrapper,
            settings: this.settings,
            events: {
                get_frm: () => this.frm || {},

                get_customer_details: () => this.customer_details || {},

                toggle_other_sections: (show) => {
                    if (show) {
                        this.item_details.$component.is(":visible")
                            ? this.item_details.$component.css("display", "none")
                            : "";
                        this.item_selector.toggle_component(false);
                    } else {
                        this.item_selector.toggle_component(true);
                    }
                },

                submit_invoice: () => {
                    this.frm.savesubmit().then((r) => {
                        this.toggle_components(false);
                        this.toggle_submitted_invoice_summary(true);
                        frappe.show_alert({
                            indicator: "green",
                            message: __("POS invoice {0} created successfully", [r.doc.name]),
                        });
                    });
                },
            },
        });
    }

    init_recent_order_list() {
        this.recent_order_list = new window.WMN_POS.Source.PastOrderList({
            wrapper: this.$components_wrapper,
            events: {
                open_invoice_data: (doctype, name) => {
                    if (!["POS Invoice", "Sales Invoice"].includes(doctype)) return;
                    frappe.db.get_doc(doctype, name).then((doc) => {
                        this.order_summary.load_summary_of(doc);
                    });
                },
                reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
            },
        });
    }

    init_order_summary() {
        this.order_summary = new window.WMN_POS.Source.PastOrderSummary({
            wrapper: this.$components_wrapper,
            settings: this.settings,
            events: {
                get_frm: () => this.frm,

                process_return: (doctype, name) => {
                    this.recent_order_list.toggle_component(false);
                    frappe.db.get_doc(doctype, name).then((doc) => {
                        frappe.run_serially([
                            () => frappe.dom.freeze(),
                            () => this.make_invoice_frm(doc.doctype),
                            () => this.make_return_invoice(doc),
                            () => this.cart.load_invoice(),
                            () => this.toggle_components(true),
                            () => frappe.dom.unfreeze(),
                        ]);
                    });
                },
                edit_order: (doctype, name) => {
                    this.toggle_recent_order();
                    frappe.run_serially([
                        () => this.make_invoice_frm(doctype),
                        () => this.sync_draft_invoice_to_frm(doctype, name),
                        () => this.frm.refresh(name),
                        () => this.frm.call("reset_mode_of_payments"),
                        () => this.cart.load_invoice(),
                        () => this.toggle_components(true),
                    ]);
                },
                delete_order: (doctype, name) => {
                    frappe.model.with_doctype(doctype, () => {
                        frappe.model.delete_doc(doctype, name, () => {
                            this.recent_order_list.refresh_list();
                        });
                    });
                },
                new_order: () => {
                    frappe.run_serially([
                        () => frappe.dom.freeze(),
                        () => this.make_new_invoice(),
                        () => this.toggle_components(true),
                        () => frappe.dom.unfreeze(),
                    ]);
                },
                open_in_form_view: (doctype, name) => {
                    frappe.run_serially([
                        () => frappe.dom.freeze(),
                        () => frappe.set_route("Form", doctype, name),
                        () => frappe.dom.unfreeze(),
                    ]);
                },
            },
        });
    }

    toggle_recent_order_list(show) {
        this.frm.doc.docstatus === 1
            ? this.toggle_submitted_invoice_summary(!show)
            : this.toggle_components(!show);

        this.recent_order_list.toggle_component(show);
        if (this.frm.doc.docstatus === 0) this.order_summary.toggle_component(show);
    }

    toggle_components(show) {
        this.cart.toggle_component(show);
        this.cart.toggle_numpad(!show);
        this.cart.toggle_checkout_btn(show);
        this.cart.enable_customer_selection();
        this.item_selector.toggle_component(show);

        // do not show item details or payment if recent order is toggled off
        !show ? this.item_details.toggle_component(false) || this.payment.toggle_component(false) : "";
    }

    toggle_submitted_invoice_summary(show) {
        this.order_summary.toggle_component(show);
        this.order_summary.load_summary_of(this.frm.doc, true);
    }

    make_new_invoice() {
        return frappe.run_serially([
            () => frappe.dom.freeze(),
            () => this.make_invoice_frm(this.settings.frm_doctype),
            () => this.set_pos_profile_data(),
            () => this.set_pos_profile_status(),
            () => this.cart.load_invoice(),
            () => frappe.dom.unfreeze(),
        ]);
    }

    make_invoice_frm(doctype) {
        return new Promise((resolve) => {
            if (this.frm && this.frm.doctype == doctype) {
                this.frm = this.get_new_frm(this.frm, doctype);
                this.frm.doc.items = [];
                this.frm.doc.is_pos = 1;
                if (doctype == "Sales Invoice") this.frm.doc.is_created_using_pos = 1;
                resolve();
            } else {
                frappe.model.with_doctype(doctype, () => {
                    this.frm = this.get_new_frm(undefined, doctype);
                    this.frm.doc.items = [];
                    this.frm.doc.is_pos = 1;
                    if (doctype == "Sales Invoice") this.frm.doc.is_created_using_pos = 1;
                    resolve();
                });
            }
        });
    }

    get_new_frm(_frm, doctype = this.settings.frm_doctype) {
        const page = $("<div>");
        const frm = _frm || new frappe.ui.form.Form(doctype, page, false);
        const name = frappe.model.make_new_doc_and_get_name(doctype, true);
        frm.refresh(name);

        return frm;
    }

    sync_draft_invoice_to_frm(doctype, invoice) {
        return frappe.db.get_doc(doctype, invoice).then((doc) => {
            frappe.model.sync(doc);
        });
    }

    async make_return_invoice(doc) {
        return frappe.call({
            method:
                doc.doctype == "POS Invoice"
                    ? "erpnext.accounts.doctype.pos_invoice.pos_invoice.make_sales_return"
                    : "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
            args: {
                source_name: doc.name,
                target_doc: this.frm.doc,
            },
            callback: (r) => {
                frappe.model.sync(r.message);
                frappe.get_doc(r.message.doctype, r.message.name).__run_link_triggers = false;
                this.set_pos_profile_data();
            },
        });
    }

    set_pos_profile_data() {
        if (this.company && !this.frm.doc.company) this.frm.doc.company = this.company;
        if (
            (this.pos_profile && !this.frm.doc.pos_profile) |
            (this.frm.doc.is_return && this.pos_profile != this.frm.doc.pos_profile)
        ) {
            this.frm.doc.pos_profile = this.pos_profile;
        }
        this.frm.doc.set_warehouse = this.settings.warehouse;

        if (!this.frm.doc.company) return;

        return this.frm.trigger("set_pos_data");
    }

    set_pos_profile_status() {
        this.page.set_indicator(this.pos_profile, "blue");
    }

    async on_cart_update(args) {
        frappe.dom.freeze();
        if (this.frm.doc.set_warehouse !== this.settings.warehouse) {
            this.frm.set_value("set_warehouse", this.settings.warehouse);
        }
        let item_row = undefined;
        try {
            let { field, value, item } = args;
            item_row = this.get_item_from_frm(item);
            const item_row_exists = !$.isEmptyObject(item_row);

            const from_selector = field === "qty" && value === "+1";
            if (from_selector) value = flt(item_row.qty) + flt(value);

            if (item_row_exists) {
                if (field === "qty") value = flt(value);

                if (["qty", "conversion_factor"].includes(field) && value > 0 && !this.allow_negative_stock) {
                    const qty_needed =
                        field === "qty" ? value * item_row.conversion_factor : item_row.qty * value;
                    await this.check_stock_availability(item_row, qty_needed, this.frm.doc.set_warehouse);
                }

                if (this.is_current_item_being_edited(item_row) || from_selector) {
                    await frappe.model.set_value(item_row.doctype, item_row.name, field, value);
                    if (item.serial_no && from_selector) {
                        await frappe.model.set_value(
                            item_row.doctype,
                            item_row.name,
                            "serial_no",
                            item_row.serial_no + `\n${item.serial_no}`
                        );
                    }
                    this.update_cart_html(item_row);
                }
            } else {
                if (!this.frm.doc.customer) return this.raise_customer_selection_alert();

                const { item_code, batch_no, serial_no, rate, uom, stock_uom } = item;

                if (!item_code) return;

                if (rate == undefined || rate == 0) {
                    frappe.show_alert({
                        message: __("Price is not set for the item."),
                        indicator: "orange",
                    });
                    frappe.utils.play_sound("error");
                    return;
                }
                const new_item = { item_code, batch_no, rate, uom, [field]: value, stock_uom };

                if (serial_no) {
                    await this.check_serial_no_availablilty(item_code, this.frm.doc.set_warehouse, serial_no);
                    new_item["serial_no"] = serial_no;
                }

                new_item["use_serial_batch_fields"] = 1;
                new_item["warehouse"] = this.settings.warehouse;
                if (field === "serial_no") new_item["qty"] = value.split(`\n`).length || 0;

                item_row = this.frm.add_child("items", new_item);

                if (field === "qty" && value !== 0 && !this.allow_negative_stock) {
                    const qty_needed = value * item_row.conversion_factor;
                    await this.check_stock_availability(item_row, qty_needed, this.frm.doc.set_warehouse);
                }

                await this.trigger_new_item_events(item_row);

                this.update_cart_html(item_row);

                if (this.item_details.$component.is(":visible")) this.edit_item_details_of(item_row);

                if (
                    this.check_serial_batch_selection_needed(item_row) &&
                    !this.item_details.$component.is(":visible")
                )
                    this.edit_item_details_of(item_row);
            }
        } catch (error) {
            console.log(error);
        } finally {
            frappe.dom.unfreeze();
            return item_row; // eslint-disable-line no-unsafe-finally
        }
    }

    raise_customer_selection_alert() {
        frappe.dom.unfreeze();
        frappe.show_alert({
            message: __("You must select a customer before adding an item."),
            indicator: "orange",
        });
        frappe.utils.play_sound("error");
    }

    get_item_from_frm({ name, item_code, batch_no, uom, rate }) {
        let item_row = null;
        if (name) {
            item_row = this.frm.doc.items.find((i) => i.name == name);
        } else {
            // if item is clicked twice from item selector
            // then "item_code, batch_no, uom, rate" will help in getting the exact item
            // to increase the qty by one
            const has_batch_no = batch_no !== "null" && batch_no !== null;
            item_row = this.frm.doc.items.find(
                (i) =>
                    i.item_code === item_code &&
                    (!has_batch_no || (has_batch_no && i.batch_no === batch_no)) &&
                    i.uom === uom &&
                    i.price_list_rate === flt(rate)
            );
        }

        return item_row || {};
    }

    edit_item_details_of(item_row) {
        this.item_details.toggle_item_details_section(item_row);
    }

    is_current_item_being_edited(item_row) {
        return item_row.name == this.item_details.current_item.name;
    }

    update_cart_html(item_row, remove_item) {
        this.cart.update_item_html(item_row, remove_item);
        this.cart.update_totals_section(this.frm);
    }

    check_serial_batch_selection_needed(item_row) {
        // right now item details is shown for every type of item.
        // if item details is not shown for every item then this fn will be needed
        const serialized = item_row.has_serial_no;
        const batched = item_row.has_batch_no;
        const no_serial_selected = !item_row.serial_no;
        const no_batch_selected = !item_row.batch_no;

        if (
            (serialized && no_serial_selected) ||
            (batched && no_batch_selected) ||
            (serialized && batched && (no_batch_selected || no_serial_selected))
        ) {
            return true;
        }
        return false;
    }

    async trigger_new_item_events(item_row) {
        await this.frm.script_manager.trigger("item_code", item_row.doctype, item_row.name);
        await this.frm.script_manager.trigger("qty", item_row.doctype, item_row.name);
    }

    async check_stock_availability(item_row, qty_needed, warehouse) {
        const resp = (await this.get_available_stock(item_row.item_code, warehouse)).message;
        const available_qty = resp[0];
        const is_stock_item = resp[1];
        const is_negative_stock_allowed = resp[2];

        frappe.dom.unfreeze();
        const bold_uom = item_row.stock_uom.bold();
        const bold_item_code = item_row.item_code.bold();
        const bold_warehouse = warehouse.bold();
        const bold_available_qty = available_qty.toString().bold();

        if (is_negative_stock_allowed) return;

        if (!(available_qty > 0)) {
            if (is_stock_item) {
                frappe.model.clear_doc(item_row.doctype, item_row.name);
                frappe.throw({
                    title: __("Not Available"),
                    message: __("Item Code: {0} is not available under warehouse {1}.", [
                        bold_item_code,
                        bold_warehouse,
                    ]),
                });
            } else {
                return;
            }
        } else if (is_stock_item && available_qty < qty_needed) {
            frappe.throw({
                message: __(
                    "Stock quantity not enough for Item Code: {0} under warehouse {1}. Available quantity {2} {3}.",
                    [bold_item_code, bold_warehouse, bold_available_qty, bold_uom]
                ),
                indicator: "orange",
            });
            frappe.utils.play_sound("error");
        }
        frappe.dom.freeze();
    }

    async check_serial_no_availablilty(item_code, warehouse, serial_no) {
        const method = "erpnext.stock.doctype.serial_no.serial_no.get_pos_reserved_serial_nos";
        const args = { filters: { item_code, warehouse } };
        const res = await frappe.call({ method, args });

        if (res.message.includes(serial_no)) {
            frappe.throw({
                title: __("Not Available"),
                message: __("Serial No: {0} has already been transacted into another POS Invoice.", [
                    serial_no.bold(),
                ]),
            });
        }
    }

    get_available_stock(item_code, warehouse) {
        const me = this;
        return frappe.call({
            method: "erpnext.accounts.doctype.pos_invoice.pos_invoice.get_stock_availability",
            args: {
                item_code: item_code,
                warehouse: warehouse,
            },
            callback(res) {
                if (!me.item_stock_map[item_code]) me.item_stock_map[item_code] = {};
                me.item_stock_map[item_code][warehouse] = res.message;
            },
        });
    }

    update_item_field(value, field_or_action) {
        if (field_or_action === "checkout") {
            this.item_details.toggle_item_details_section(null);
        } else if (field_or_action === "remove") {
            this.remove_item_from_cart();
        } else {
            const field_control = this.item_details[`${field_or_action}_control`];
            if (!field_control) return;
            field_control.set_focus();
            value != "" && field_control.set_value(value);
        }
    }

    remove_item_from_cart() {
        frappe.dom.freeze();
        const { doctype, name, current_item } = this.item_details;

        return frappe.model
            .set_value(doctype, name, "qty", 0)
            .then(() => {
                frappe.model.clear_doc(doctype, name);
                this.update_cart_html(current_item, true);
                this.item_details.toggle_item_details_section(null);
                frappe.dom.unfreeze();
            })
            .catch((e) => console.log(e));
    }

    async save_and_checkout() {
        if (this.frm.is_dirty()) {
            let save_error = false;
            await this.frm.save(null, null, null, () => (save_error = true));
            // only move to payment section if save is successful
            !save_error && this.payment.checkout();
            // show checkout button on error
            save_error &&
                setTimeout(() => {
                    this.cart.toggle_checkout_btn(true);
                }, 300); // wait for save to finish
        } else {
            this.payment.checkout();
        }
    }
};

/* END pos_controller.js */


/* BEGIN pos_data_source.js */
/* WMN POS data-source boundary: Online uses ERPNext, Offline uses local backends only. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services = ns.Services || {};
    ns.Services.Data = ns.Services.Data || {};

    const BACKEND = Object.freeze({
        ONLINE: "online",
        CACHE: "cache",
        LOCAL_STORAGE: "local_storage",
        LOCAL_DB: "local_db",
    });

    const backendRegistry = {};

    function clone(value) {
        if (value === undefined) return undefined;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (error) {
            return value;
        }
    }

    function isOfflineRuntime(ctrl) {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && ctrl) {
                return Boolean(wmn_controller_uses_offline_flow(ctrl));
            }
        } catch (error) {}

        try {
            if (typeof wmn_is_pos_offline === "function") return Boolean(wmn_is_pos_offline());
        } catch (error) {}

        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function asCallLike(message) {
        if (window.WMNPOSControllerCache?.prototype?.asCallLike) {
            return new window.WMNPOSControllerCache(null, "datasource").asCallLike(message);
        }
        const response = { message };
        const promise = Promise.resolve(response);
        promise.done = function (callback) { if (typeof callback === "function") promise.then(callback); return promise; };
        promise.fail = function () { return promise; };
        promise.always = function (callback) { if (typeof callback === "function") promise.finally(callback); return promise; };
        return promise;
    }

    function requireOfflineStorage() {
        if (!window.wmnPOSOffline) {
            throw new Error(__("WMN POS offline storage is not available. Open WMN POS online once to preload local data."));
        }
        return window.wmnPOSOffline;
    }

    class OnlineERPNextBackend {
        constructor(ctrl) {
            this.id = BACKEND.ONLINE;
            this.ctrl = ctrl || null;
        }

        isOffline() {
            return false;
        }

        async call(method, args = {}, options = {}) {
            return frappe.call(Object.assign({}, options || {}, { method, args }));
        }

        async getDoc(doctype, name) {
            return frappe.db.get_doc(doctype, name);
        }

        async getList(doctype, options = {}) {
            return frappe.db.get_list(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            return frappe.db.get_value(doctype, filters, fieldname);
        }
    }

    class OfflineLocalBackend {
        constructor(ctrl, options = {}) {
            this.id = options.id || BACKEND.CACHE;
            this.ctrl = ctrl || null;
            this.storageKind = options.storageKind || BACKEND.CACHE;
            this.driver = options.driver || null;
            this._controllerCache = null;
        }

        isOffline() {
            return true;
        }

        get storage() {
            return requireOfflineStorage();
        }

        get controllerCache() {
            if (!this._controllerCache) {
                this._controllerCache = new window.WMNPOSControllerCache(this.ctrl, this.ctrl?.__wmn_pos_version || "");
            }
            return this._controllerCache;
        }

        async call(method, args = {}) {
            const normalized = String(method || "");
            if (normalized === "erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry") {
                return this.controllerCache.fetchOpeningEntryCallLike();
            }
            if (normalized === "erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data") {
                return asCallLike(await this.controllerCache.getPOSProfileData(args.pos_profile || this.ctrl?.pos_profile || ""));
            }
            if (normalized === "erpnext.stock.doctype.stock_settings.stock_settings.get_enable_stock_uom_editing") {
                return this.controllerCache.getStockSettingsValue("allow_negative_stock");
            }

            throw new Error(__("Offline POS data source has no local method for: {0}", [normalized]));
        }

        async getDoc(doctype, name) {
            if (!doctype || !name) return null;

            if (["Sales Invoice", "POS Invoice"].includes(doctype)) {
                const invoice = await this.controllerCache.getInvoiceFromCache(doctype, name);
                if (invoice) return clone(invoice);
            }

            if (this.storage.getDoc) {
                const doc = await this.storage.getDoc(doctype, name);
                if (doc) return clone(doc);
            }

            const cache = ns.Services.Cache?.PosCacheAdapter;
            const sourceId = this.sourceForDoctype(doctype);
            if (cache && sourceId) return await cache.get(sourceId, name);

            return null;
        }

        async getList(doctype, options = {}) {
            const cache = ns.Services.Cache?.PosCacheAdapter;
            const sourceId = this.sourceForDoctype(doctype);
            if (cache && sourceId) {
                return await cache.list(sourceId, {
                    search: options.search || options.txt || "",
                    limit: options.limit || options.page_length || 0,
                });
            }
            return [];
        }

        async getValue(doctype, filters, fieldname) {
            const name = typeof filters === "string" ? filters : filters?.name;
            const doc = await this.getDoc(doctype, name);
            const value = fieldname ? doc?.[fieldname] : doc;
            return { message: fieldname ? { [fieldname]: value } : value };
        }

        sourceForDoctype(doctype) {
            const map = {
                Item: "items",
                Customer: "customers",
                "Item Price": "item_prices",
                "Bin": "stock",
                Batch: "batches",
                "Item Barcode": "item_barcodes",
                "Serial No": "serials",
                "Mode of Payment": "payment_methods",
                "Coupon Code": "coupons",
                "WMN POS Promotion": "promotions",
                "Item Group": "item_groups",
                "POS Profile": "pos_profile",
                "POS Settings": "pos_settings",
                "POS Opening Entry": "pos_opening_entry",
                DocType: "doctype_meta",
            };
            return map[doctype] || "";
        }

        async getPOSProfileData(posProfile) {
            return this.controllerCache.getPOSProfileData(posProfile);
        }

        async getStockSettings() {
            return this.controllerCache.getStockSettings();
        }

        async getInvoiceFields() {
            return this.controllerCache.getInvoiceFields();
        }

        async getInvoiceDoctype(defaultDoctype) {
            return this.controllerCache.getInvoiceDoctype(defaultDoctype);
        }

        async getInvoice(doctype, name) {
            return this.controllerCache.getInvoiceFromCache(doctype, name);
        }

        async deleteInvoice(doctype, name) {
            return this.controllerCache.deleteInvoiceFromCache(doctype, name);
        }

        async saveInvoice(doc, ctrl) {
            if (this.storage.saveInvoice) return this.storage.saveInvoice(doc, ctrl || this.ctrl);
            return { invoice: clone(doc), status: "pending" };
        }

        async makeReturnInvoice(sourceDoc) {
            return this.controllerCache.makeReturnInvoiceOffline(sourceDoc);
        }

        async getAvailableStockCallLike(itemCode, warehouse) {
            return this.controllerCache.getAvailableStockCallLike(itemCode, warehouse);
        }

        async checkSerialReserved(itemCode, warehouse, serialNo) {
            return this.controllerCache.checkSerialReserved(itemCode, warehouse, serialNo);
        }

        async safeRefreshRecentOrders(ctrl) {
            return this.controllerCache.safeRefreshRecentOrders(ctrl || this.ctrl);
        }
    }

    class LocalStorageBackend {
        constructor(ctrl, options = {}) {
            this.fallback = new OfflineLocalBackend(
                ctrl,
                Object.assign({}, options, {
                    id: BACKEND.LOCAL_STORAGE,
                    storageKind: BACKEND.LOCAL_STORAGE,
                })
            );
            this.id = BACKEND.LOCAL_STORAGE;
            this.ctrl = this.fallback.ctrl;
            this.storageKind = BACKEND.LOCAL_STORAGE;
            this.driver = this.fallback.driver;
            this.prefix = options.prefix || "wmn_pos_local";
        }

        isOffline() {
            return this.fallback.isOffline();
        }

        get storage() {
            return this.fallback.storage;
        }

        get controllerCache() {
            return this.fallback.controllerCache;
        }

        storageKey(doctype, name) {
            return `${this.prefix}:${doctype}:${name}`;
        }

        async getDoc(doctype, name) {
            try {
                const raw = window.localStorage.getItem(this.storageKey(doctype, name));
                if (raw) return JSON.parse(raw);
            } catch (error) {
                console.warn("WMN POS localStorage getDoc skipped", error);
            }
            return this.fallback.getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            const prefix = `${this.prefix}:${doctype}:`;
            const rows = [];
            try {
                for (let index = 0; index < window.localStorage.length; index += 1) {
                    const key = window.localStorage.key(index);
                    if (!key || !key.startsWith(prefix)) continue;
                    const raw = window.localStorage.getItem(key);
                    if (raw) rows.push(JSON.parse(raw));
                }
            } catch (error) {
                console.warn("WMN POS localStorage getList skipped", error);
            }

            if (!rows.length) return this.fallback.getList(doctype, options);

            const query = String(options.search || options.txt || "").toLowerCase().trim();
            const filtered = query
                ? rows.filter(row => JSON.stringify(row || {}).toLowerCase().includes(query))
                : rows;
            const limit = Number(options.limit || options.page_length || 0);
            return limit > 0 ? filtered.slice(0, limit) : filtered;
        }

        async putDoc(doctype, doc) {
            if (!doctype || !doc?.name) throw new Error("doctype and doc.name are required for localStorage POS writes");
            window.localStorage.setItem(this.storageKey(doctype, doc.name), JSON.stringify(doc));
            return clone(doc);
        }

        async call(method, args = {}, options = {}) {
            return this.fallback.call(method, args, options);
        }

        async getValue(doctype, filters, fieldname) {
            return this.fallback.getValue(doctype, filters, fieldname);
        }

        sourceForDoctype(doctype) {
            return this.fallback.sourceForDoctype(doctype);
        }

        async getPOSProfileData(posProfile) {
            return this.fallback.getPOSProfileData(posProfile);
        }

        async getStockSettings() {
            return this.fallback.getStockSettings();
        }

        async getInvoiceFields() {
            return this.fallback.getInvoiceFields();
        }

        async getInvoiceDoctype(defaultDoctype) {
            return this.fallback.getInvoiceDoctype(defaultDoctype);
        }

        async getInvoice(doctype, name) {
            return this.fallback.getInvoice(doctype, name);
        }

        async deleteInvoice(doctype, name) {
            return this.fallback.deleteInvoice(doctype, name);
        }

        async saveInvoice(doc, ctrl) {
            return this.fallback.saveInvoice(doc, ctrl);
        }

        async makeReturnInvoice(sourceDoc) {
            return this.fallback.makeReturnInvoice(sourceDoc);
        }

        async getAvailableStockCallLike(itemCode, warehouse) {
            return this.fallback.getAvailableStockCallLike(itemCode, warehouse);
        }

        async checkSerialReserved(itemCode, warehouse, serialNo) {
            return this.fallback.checkSerialReserved(itemCode, warehouse, serialNo);
        }

        async safeRefreshRecentOrders(ctrl) {
            return this.fallback.safeRefreshRecentOrders(ctrl);
        }
    }

    class LocalDBBackend {
        constructor(ctrl, options = {}) {
            this.fallback = new OfflineLocalBackend(
                ctrl,
                Object.assign({}, options, {
                    id: BACKEND.LOCAL_DB,
                    storageKind: BACKEND.LOCAL_DB,
                })
            );
            this.id = BACKEND.LOCAL_DB;
            this.ctrl = this.fallback.ctrl;
            this.storageKind = BACKEND.LOCAL_DB;
            this.driver = options.driver || null;
        }

        isOffline() {
            return this.fallback.isOffline();
        }

        get storage() {
            return this.fallback.storage;
        }

        get controllerCache() {
            return this.fallback.controllerCache;
        }

        async getDoc(doctype, name) {
            if (this.driver?.getDoc) return this.driver.getDoc(doctype, name);
            return this.fallback.getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            if (this.driver?.getList) return this.driver.getList(doctype, options);
            return this.fallback.getList(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            if (this.driver?.getValue) return this.driver.getValue(doctype, filters, fieldname);
            return this.fallback.getValue(doctype, filters, fieldname);
        }

        async putDoc(doctype, doc) {
            if (!this.driver?.putDoc) throw new Error("WMN POS local DB driver does not implement putDoc");
            return this.driver.putDoc(doctype, doc);
        }

        async call(method, args = {}, options = {}) {
            return this.fallback.call(method, args, options);
        }

        sourceForDoctype(doctype) {
            return this.fallback.sourceForDoctype(doctype);
        }

        async getPOSProfileData(posProfile) {
            return this.fallback.getPOSProfileData(posProfile);
        }

        async getStockSettings() {
            return this.fallback.getStockSettings();
        }

        async getInvoiceFields() {
            return this.fallback.getInvoiceFields();
        }

        async getInvoiceDoctype(defaultDoctype) {
            return this.fallback.getInvoiceDoctype(defaultDoctype);
        }

        async getInvoice(doctype, name) {
            return this.fallback.getInvoice(doctype, name);
        }

        async deleteInvoice(doctype, name) {
            return this.fallback.deleteInvoice(doctype, name);
        }

        async saveInvoice(doc, ctrl) {
            return this.fallback.saveInvoice(doc, ctrl);
        }

        async makeReturnInvoice(sourceDoc) {
            return this.fallback.makeReturnInvoice(sourceDoc);
        }

        async getAvailableStockCallLike(itemCode, warehouse) {
            return this.fallback.getAvailableStockCallLike(itemCode, warehouse);
        }

        async checkSerialReserved(itemCode, warehouse, serialNo) {
            return this.fallback.checkSerialReserved(itemCode, warehouse, serialNo);
        }

        async safeRefreshRecentOrders(ctrl) {
            return this.fallback.safeRefreshRecentOrders(ctrl);
        }
    }

    class WMNPOSDataSource {
        constructor(ctrl, options = {}) {
            this.ctrl = ctrl || null;
            this.online = new OnlineERPNextBackend(ctrl);
            this.offline = new OfflineLocalBackend(ctrl, options.offline || {});
            this.localBackends = backendRegistry;
        }

        isOffline() {
            return isOfflineRuntime(this.ctrl);
        }

        mode() {
            return this.active().id;
        }

        active() {
            if (!this.isOffline()) return this.online;
            const preferred = this.ctrl?.__wmn_local_backend || window.__wmn_pos_local_backend || this.offline.id;
            if (preferred === this.offline.id) return this.offline;
            const registered = this.localBackends[preferred];
            if (typeof registered === "function") return registered(this.ctrl);
            return registered || this.offline;
        }

        backendCapabilities() {
            return {
                mode: this.mode(),
                available_local_backends: Object.keys(this.localBackends),
                supports_cache: true,
                supports_local_storage: Boolean(this.localBackends[BACKEND.LOCAL_STORAGE]),
                supports_local_db: Boolean(this.localBackends[BACKEND.LOCAL_DB]),
            };
        }

        controllerCache() {
            return this.offline.controllerCache;
        }

        async call(method, args = {}, options = {}) {
            return this.active().call(method, args, options);
        }

        async getDoc(doctype, name) {
            return this.active().getDoc(doctype, name);
        }

        async getList(doctype, options = {}) {
            return this.active().getList(doctype, options);
        }

        async getValue(doctype, filters, fieldname) {
            return this.active().getValue(doctype, filters, fieldname);
        }
    }

    function registerBackend(id, backend) {
        if (!id || !backend) throw new Error("WMN POS local backend id and implementation are required");
        backendRegistry[id] = backend;
        return backend;
    }

    function createForController(ctrl, options = {}) {
        const dataSource = new WMNPOSDataSource(ctrl, options);
        if (ctrl) ctrl.wmn_data_source = dataSource;
        window.__wmn_pos_data_source = dataSource;
        return dataSource;
    }

    registerBackend(BACKEND.CACHE, ctrl => new OfflineLocalBackend(ctrl, { id: BACKEND.CACHE, storageKind: BACKEND.CACHE }));
    registerBackend(BACKEND.LOCAL_STORAGE, ctrl => new LocalStorageBackend(ctrl));
    registerBackend(BACKEND.LOCAL_DB, ctrl => new LocalDBBackend(ctrl, { driver: window.__wmn_pos_local_db_driver || null }));

    ns.Services.Data = Object.assign(ns.Services.Data, {
        BACKEND,
        OnlineERPNextBackend,
        OfflineLocalBackend,
        LocalStorageBackend,
        LocalDBBackend,
        WMNPOSDataSource,
        registerBackend,
        createForController,
        getCurrent: () => window.__wmn_pos_data_source || null,
    });
})();

/* END pos_data_source.js */


/* BEGIN wmn_payment_methods.js */
/* Payment class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.Payment;

    /*
     * WMNPayment_v16.js
     * Explicit POS Payment extension.
     * Keeps ERPNext v16 payment behavior while allowing zero-payment credit returns
     * and exposing a clean after_checkout event for WMN UI state updates.
     */


        function wmn_payment_is_zero_return(doc) {
            try {
                return typeof wmn_is_zero_payment_return_doc === "function" && wmn_is_zero_payment_return_doc(doc, window.cur_pos);
            } catch (e) {
                return false;
            }
        }

        function wmn_payment_is_offline() {
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

        function wmn_attach_payment_gateway_ui(payment) {
            const gatewayFeature = wmn_payment_is_offline()
                ? window.WMN_POS?.Features?.PaymentGateway?.Offline
                : window.WMN_POS?.Features?.PaymentGateway?.Online;
            if (!gatewayFeature?.attach) return;
            Promise.resolve(gatewayFeature.attach(payment)).catch((e) => {
                console.warn("WMN payment gateway UI attach failed", e);
            });
        }

        async function wmn_get_cached_invoice_fields() {
            const pos = window.cur_pos;
            try {
                if (pos && typeof pos.wmn_cache === "function") {
                    const cache = pos.wmn_cache();
                    if (cache && typeof cache.getInvoiceFields === "function") {
                        return await cache.getInvoiceFields();
                    }
                }
            } catch (e) {}

            try {
                if (window.wmnPOSOffline) {
                    if (typeof window.wmnPOSOffline.getSetting === "function") {
                        const settings = await window.wmnPOSOffline.getSetting("pos_settings");
                        if (settings && Array.isArray(settings.invoice_fields)) return settings.invoice_fields;
                    }
                    if (typeof window.wmnPOSOffline.getAllCached === "function") {
                        const rows = await window.wmnPOSOffline.getAllCached(window.wmnPOSOffline.STORES.pos_settings);
                        const settings = (rows || [])[0] || {};
                        if (Array.isArray(settings.invoice_fields)) return settings.invoice_fields;
                    }
                }
            } catch (e) {}

            return [];
        }

    const CoreMethods = {
        __proto__: Base.prototype,

        bind_events() {
                    // ERPNext v16 owns payment mode selection, keyboard/numpad behavior,
                    // coupon events, paid amount updates, loyalty and payment listeners.
                    super.bind_events();

                    // Replace only the native Complete Order handler so WMN zero-payment
                    // return behavior is added without duplicating ERPNext v16 payment events.
                    this.$component.off("click", ".submit-order-btn");
                    this.$component.on("click.wmnSubmit", ".submit-order-btn", async () => {
                        const doc = this.events.get_frm().doc;
                        const paidAmount = flt(doc.paid_amount || 0);
                        const items = doc.items || [];
                        const isZeroPaymentReturn = wmn_payment_is_zero_return(doc);
                        const zeroPaymentAllowed =
                            isZeroPaymentReturn ||
                            flt(doc.additional_discount_percentage || 0) === 100 ||
                            cint(this.allow_partial_payment || 0) === 1;

                        if (!items.length || (paidAmount === 0 && !zeroPaymentAllowed)) {
                            const message = items.length
                                ? __("You cannot submit the order without payment.")
                                : __("You cannot submit empty order.");
                            frappe.show_alert({ message, indicator: "orange" });
                            frappe.utils.play_sound("error");
                            return;
                        }

                        if (!this.validate_reqd_invoice_fields()) return;

                        const gatewayService = window.WMN_POS?.Services?.PaymentGateway?.Service;
                        if (gatewayService?.validateBeforeSubmit) {
                            try {
                                await gatewayService.validateBeforeSubmit(doc);
                            } catch (error) {
                                frappe.msgprint({ title: __("Electronic Payment"), indicator: "red", message: window.WMN_POS.Features.PaymentGateway.Common.errorMessage(error) });
                                return;
                            }
                        }

                        if (isZeroPaymentReturn && typeof wmn_prepare_zero_payment_return === "function") {
                            wmn_prepare_zero_payment_return(doc);
                            this.update_totals_section(doc);
                        }

                        await this.events.submit_invoice();
                    });
                },

        wmn_setup_send_to_cashier_button() {
                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                    const frm = this.events?.get_frm?.();
                    const doc = frm?.doc || {};
                    const $submit = this.$component?.find?.(".submit-order-btn").first();
                    if (!$submit?.length) return;

                    let $button = this.$component.find(".wmn-send-to-cashier-btn").first();
                    if (!$button.length) {
                        $button = $(
                            `<button type="button" class="btn btn-default wmn-send-to-cashier-btn" style="margin-inline-end:8px;font-weight:700;">${wmn_t("Send to Cashier", "إرسال إلى الكاشير")}</button>`
                        );
                        $button.insertBefore($submit);
                    }

                    const canShow = !!(
                        handoff?.canSendToCashier?.(doc) &&
                        window.cur_pos?.__wmn_cashier_resume !== true
                    );
                    $button.toggle(canShow);
                    if (!canShow) return;

                    $button.off("click.wmnSendToCashier").on("click.wmnSendToCashier", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (this.validate_reqd_invoice_fields && !this.validate_reqd_invoice_fields()) return;
                        if (!this.events?.send_to_cashier) return;

                        $button.prop("disabled", true);
                        try {
                            await this.events.send_to_cashier();
                        } catch (error) {
                            console.error("WMN Send to Cashier failed", error);
                            if (!String(error?.message || "").includes("printing")) {
                                frappe.show_alert({
                                    message: error?.message || wmn_t("Send to Cashier failed", "تعذر الإرسال إلى الكاشير"),
                                    indicator: "red",
                                });
                            }
                        } finally {
                            $button.prop("disabled", false);
                        }
                    });
                },


        wmn_setup_back_to_recent_orders_button() {
                    const $submit = this.$component?.find?.(".submit-order-btn").first();
                    if (!$submit?.length) return;

                    let $button = this.$component.find(".wmn-payment-back-to-recent-btn").first();
                    if (!$button.length) {
                        $button = $(
                            `<button type="button" class="btn btn-default wmn-payment-back-to-recent-btn" style="margin-inline-end:8px;font-weight:700;">${wmn_t("Back to Recent Orders", "العودة للطلبات الأخيرة")}</button>`
                        );
                        $button.insertBefore($submit);
                    }

                    const canShow = window.cur_pos?.__wmn_payment_origin === "recent_orders";
                    $button.toggle(canShow);
                    if (!canShow) return;

                    $button.off("click.wmnBackRecentOrders").on("click.wmnBackRecentOrders", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!this.events?.back_to_recent_orders) return;

                        $button.prop("disabled", true);
                        try {
                            await this.events.back_to_recent_orders();
                        } catch (error) {
                            console.error("WMN back to Recent Orders failed", error);
                            frappe.show_alert({
                                message: error?.message || wmn_t("Could not return to Recent Orders", "تعذر الرجوع إلى الطلبات الأخيرة"),
                                indicator: "red",
                            });
                        } finally {
                            $button.prop("disabled", false);
                        }
                    });
                },


        render_payment_mode_dom(...args) {
                    const result = super.render_payment_mode_dom(...args);
                    // ERPNext rebuilds the payment-mode DOM when the cashier changes an amount.
                    // Re-attach gateway controls to the newly rendered rows without changing payment data.
                    wmn_attach_payment_gateway_ui(this);
                    return result;
                },


        checkout() {
                    const result = super.checkout();
                    const doc = this.events?.get_frm?.()?.doc || {};

                    if (wmn_payment_is_zero_return(doc) && typeof wmn_prepare_zero_payment_return === "function") {
                        wmn_prepare_zero_payment_return(doc);
                        this.selected_mode = "";
                        this.render_payment_mode_dom();
                        this.update_totals_section(doc);
                        this.$payment_modes.find(".mode-of-payment").removeClass("border-primary");
                        this.$payment_modes.find(".mode-of-payment-control input").prop("disabled", true);
                        this.$payment_modes.find(".cash-shortcuts").hide();
                    }

                    this.wmn_setup_send_to_cashier_button();
                    this.wmn_setup_back_to_recent_orders_button();
                    wmn_attach_payment_gateway_ui(this);
                    if (this.events && typeof this.events.after_checkout === "function") {
                        Promise.resolve(this.events.after_checkout()).catch((e) => {
                            console.warn("WMN Payment after_checkout skipped", e);
                        });
                    }
                    return result;
                }
    };

    const UIMethods = {
        __proto__: CoreMethods
    };

    const FinalMethods = Object.create(null);
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.wmn_setup_send_to_cashier_button = UIMethods.wmn_setup_send_to_cashier_button || CoreMethods.wmn_setup_send_to_cashier_button;
    FinalMethods.wmn_setup_back_to_recent_orders_button = UIMethods.wmn_setup_back_to_recent_orders_button || CoreMethods.wmn_setup_back_to_recent_orders_button;
    FinalMethods.render_payment_mode_dom = UIMethods.render_payment_mode_dom || CoreMethods.render_payment_mode_dom;
    FinalMethods.checkout = UIMethods.checkout || CoreMethods.checkout;

    const initializeCore = null;
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.ClassMethods.Payment = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_payment_methods.js */


/* BEGIN wmn_payment_class.js */
/* Single production WMN POS Payment class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.Payment;
    const methods = ns.ClassMethods.Payment;

    class WMNPaymentClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNPaymentClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        wmn_setup_send_to_cashier_button(...args) {
            return methods.FinalMethods.wmn_setup_send_to_cashier_button.apply(this, args);
        }

        wmn_setup_back_to_recent_orders_button(...args) {
            return methods.FinalMethods.wmn_setup_back_to_recent_orders_button.apply(this, args);
        }

        render_payment_mode_dom(...args) {
            return methods.FinalMethods.render_payment_mode_dom.apply(this, args);
        }

        checkout(...args) {
            return methods.FinalMethods.checkout.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNPaymentClass, Base);
    ns.Classes.Payment = WMNPaymentClass;
})();

/* END wmn_payment_class.js */


/* BEGIN wmn_item_details_methods.js */
/* ItemDetails class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemDetails;

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

                        // ERPNext activates the cart numpad field from a click on the
                        // ItemDetails control. Programmatic focus alone does not run that
                        // lifecycle, so trigger the same field click before focusing.
                        const $field = control.$input?.closest?.(".input-with-feedback");
                        if ($field?.length) {
                            $field.trigger("click");
                        } else if (this.events?.item_field_focused) {
                            this.events.item_field_focused("qty");
                        }

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

    ns.ClassMethods.ItemDetails = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_item_details_methods.js */


/* BEGIN wmn_item_details_class.js */
/* Single production WMN POS ItemDetails class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemDetails;
    const methods = ns.ClassMethods.ItemDetails;

    class WMNItemDetailsClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNItemDetailsClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        wmn_focus_quantity_control(...args) {
            return methods.FinalMethods.wmn_focus_quantity_control.apply(this, args);
        }

        toggle_item_details_section(...args) {
            return methods.FinalMethods.toggle_item_details_section.apply(this, args);
        }

        render_form(...args) {
            return methods.FinalMethods.render_form.apply(this, args);
        }

        wmn_offline_form_updated(...args) {
            return methods.FinalMethods.wmn_offline_form_updated.apply(this, args);
        }

        wmn_refresh_price_display(...args) {
            return methods.FinalMethods.wmn_refresh_price_display.apply(this, args);
        }

        wmn_apply_supervisor_protected_value(...args) {
            return methods.FinalMethods.wmn_apply_supervisor_protected_value.apply(this, args);
        }

        wmn_bind_supervisor_protected_controls(...args) {
            return methods.FinalMethods.wmn_bind_supervisor_protected_controls.apply(this, args);
        }

        wmn_bind_sales_invoice_item_model_events(...args) {
            return methods.FinalMethods.wmn_bind_sales_invoice_item_model_events.apply(this, args);
        }

        bind_custom_control_change_event(...args) {
            return methods.FinalMethods.bind_custom_control_change_event.apply(this, args);
        }

        auto_update_batch_no(...args) {
            return methods.FinalMethods.auto_update_batch_no.apply(this, args);
        }

        bind_auto_serial_fetch_event(...args) {
            return methods.FinalMethods.bind_auto_serial_fetch_event.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNItemDetailsClass, Base);
    ns.Classes.ItemDetails = WMNItemDetailsClass;
})();

/* END wmn_item_details_class.js */


/* BEGIN wmn_past_order_list_methods.js */
/* PastOrderList class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderList;

    function wmn_past_order_is_offline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
            if (window.__wmn_pos_effective_offline === true) return true;
            if (navigator.onLine === false) return true;
        } catch (e) {}
        return false;
    }

    const STATUS_OPTIONS = [
        "Draft",
        "Awaiting Cashier",
        "Paid",
        "Unpaid",
        "Partly Paid",
        "Overdue",
        "Consolidated",
        "Returnable",
        "Return",
    ];

    const CoreMethods = {
        __proto__: Base.prototype,

        make_filter_section() {
            const me = this;
            this.search_field = frappe.ui.form.make_control({
                df: {
                    label: __("Search"),
                    fieldtype: "Data",
                    options: "Barcode",
                    placeholder: __("Search by invoice id, customer name, or scan invoice barcode"),
                    onchange: function () {
                        const value = String(me.search_field?.get_value?.() || "").trim();
                        const invoiceBarcode = ns.Features?.InvoiceBarcode?.Common;
                        if (!invoiceBarcode?.isInvoiceBarcode?.(value)) return;

                        clearTimeout(me.last_search);
                        return me.wmn_handle_invoice_barcode(value);
                    },
                },
                parent: this.$component.find(".search-field"),
                render_input: true,
            });

            this.status_field = frappe.ui.form.make_control({
                df: {
                    label: __("Invoice Status"),
                    fieldtype: "Select",
                    options: STATUS_OPTIONS.join("\n"),
                    placeholder: __("Filter by invoice status"),
                    onchange: function () {
                        if (me.$component.is(":visible")) me.refresh_list();
                    },
                },
                parent: this.$component.find(".status-field"),
                render_input: true,
            });

            this.search_field.toggle_label(false);
            this.status_field.toggle_label(false);
            this.status_field.set_value("Draft");
        },

        bind_events() {
            const $searchInput = this.search_field.$input;

            $searchInput.on("input", (e) => {
                const value = String(e.target.value || "").trim();
                const invoiceBarcode = ns.Features?.InvoiceBarcode?.Common;
                if (invoiceBarcode?.isInvoiceBarcode?.(value)) {
                    clearTimeout(this.last_search);
                    this.wmn_handle_invoice_barcode(value);
                    return;
                }

                clearTimeout(this.last_search);
                this.last_search = setTimeout(() => {
                    this.refresh_list(value, this.status_field.get_value());
                }, 300);
            });

            $searchInput.on("keydown", (e) => {
                if (e.key !== "Enter") return;
                const value = String(e.target.value || "").trim();
                const invoiceBarcode = ns.Features?.InvoiceBarcode?.Common;
                if (!invoiceBarcode?.isInvoiceBarcode?.(value)) return;
                e.preventDefault();
                e.stopPropagation();
                clearTimeout(this.last_search);
                this.wmn_handle_invoice_barcode(value);
            });

            const me = this;
            this.$invoices_container.on("click", ".invoice-wrapper", function () {
                const $invoice = $(this);
                const invoiceDoctype = $invoice.attr("data-invoice-doctype");
                const invoiceName = $invoice.attr("data-invoice-name");
                if (!invoiceName || !me.events?.open_invoice_data) return;

                me.$invoices_container.find(".invoice-wrapper").removeClass("invoice-selected");
                $invoice.addClass("invoice-selected");
                me.events.open_invoice_data(invoiceDoctype, invoiceName);
            });
        },

        async wmn_handle_invoice_barcode(value) {
            const barcode = String(value || "").trim();
            const invoiceBarcode = ns.Features?.InvoiceBarcode?.Common;
            if (!invoiceBarcode?.isInvoiceBarcode?.(barcode)) return false;

            const now = Date.now();
            if (this.__wmn_barcode_in_flight === barcode) return true;
            if (this.__wmn_last_barcode === barcode && now - flt(this.__wmn_last_barcode_at || 0) < 1200) return true;

            this.__wmn_barcode_in_flight = barcode;
            try {
                const result = await invoiceBarcode.findByBarcode(barcode);
                if (!result?.handled) return false;

                if (!result.doc) {
                    frappe.show_alert({
                        message: __("Invoice barcode was not found"),
                        indicator: "orange",
                    });
                    return true;
                }

                this.__wmn_last_barcode = barcode;
                this.__wmn_last_barcode_at = Date.now();
                this.search_field.set_value("");

                if (this.events?.open_invoice_barcode_doc) {
                    await this.events.open_invoice_barcode_doc(result.doc);
                } else if (this.events?.open_invoice_data && result.doc.name) {
                    this.events.open_invoice_data(result.doc.doctype, result.doc.name);
                }

                frappe.utils.play_sound("submit");
                return true;
            } catch (error) {
                console.error("WMN recent orders invoice barcode scan failed", error);
                frappe.show_alert({
                    message: error?.message || __("Invoice barcode scan failed"),
                    indicator: "red",
                });
                return true;
            } finally {
                this.__wmn_barcode_in_flight = "";
            }
        },

        async refresh_list() {
            if (this.events?.reset_summary) this.events.reset_summary();

            const searchTerm = this.search_field?.get_value?.() || "";
            const status = this.status_field?.get_value?.() || "";
            this.$invoices_container.html("");

            if (wmn_past_order_is_offline()) {
                const offline = window.wmnPOSOffline;
                if (!offline?.getOfflineRecentOrders) return [];

                const rows = await offline.getOfflineRecentOrders({
                    search_term: searchTerm,
                    status,
                    limit: 20,
                });
                for (const invoice of rows || []) {
                    this.$invoices_container.append(this.get_invoice_html(invoice));
                }
                return rows || [];
            }

            frappe.dom.freeze();
            try {
                const response = await frappe.call({
                    method: "wmn.api.get_past_order_list",
                    freeze: false,
                    args: { search_term: searchTerm, status },
                });
                const rows = response?.message || [];
                for (const invoice of rows) {
                    this.$invoices_container.append(this.get_invoice_html(invoice));
                }
                return rows;
            } finally {
                frappe.dom.unfreeze();
            }
        },
    };

    const UIMethods = {
        __proto__: CoreMethods,
    };

    const FinalMethods = Object.create(null);
    FinalMethods.make_filter_section = UIMethods.make_filter_section || CoreMethods.make_filter_section;
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.wmn_handle_invoice_barcode = UIMethods.wmn_handle_invoice_barcode || CoreMethods.wmn_handle_invoice_barcode;
    FinalMethods.refresh_list = UIMethods.refresh_list || CoreMethods.refresh_list;

    function initialize() {}

    ns.ClassMethods.PastOrderList = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_past_order_list_methods.js */


/* BEGIN wmn_past_order_list_class.js */
/* Single production WMN POS PastOrderList class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderList;
    const methods = ns.ClassMethods.PastOrderList;

    class WMNPastOrderListClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNPastOrderListClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        make_filter_section(...args) {
            return methods.FinalMethods.make_filter_section.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        wmn_handle_invoice_barcode(...args) {
            return methods.FinalMethods.wmn_handle_invoice_barcode.apply(this, args);
        }

        refresh_list(...args) {
            return methods.FinalMethods.refresh_list.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNPastOrderListClass, Base);
    ns.Classes.PastOrderList = WMNPastOrderListClass;
})();

/* END wmn_past_order_list_class.js */


/* BEGIN wmn_past_order_summary_methods.js */
/* PastOrderSummary class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderSummary;

    /*
     * WMN PastOrderSummary for ERPNext v16.
     * Online paths keep ERPNext behavior; offline receipt actions use cached invoice data.
     */

        function wmn_summary_is_offline() {
            try {
                if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
                if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos && wmn_controller_uses_offline_flow(window.cur_pos)) return true;
                if (window.__wmn_pos_effective_offline === true) return true;
                if (navigator.onLine === false) return true;
            } catch (e) {}
            return false;
        }

        function wmn_summary_customer_email(doc) {
            doc = doc || {};
            return (
                doc.customer_email ||
                doc.email_id ||
                doc.contact_email ||
                doc.contact_mobile ||
                ""
            );
        }

    const CoreMethods = {
        __proto__: Base.prototype,

        toggle_summary_placeholder(show) {
                    if (this.after_submission === true && show === true) return;
                    return super.toggle_summary_placeholder(show);
                },

        load_summary_of(doc, after_submission = false) {
                    this.after_submission = after_submission;
                    const result = super.load_summary_of(doc, after_submission);
                    this.wmn_render_add_payment_button(doc, after_submission);
                    this.wmn_render_discount_summary(doc);
                    return result;
                },

        get_upper_section_html(doc) {
                    const upperSectionHtml = super.get_upper_section_html(doc);
                    const receiptIdentityHtml = this.wmn_get_receipt_identity_html(doc);
                    if (!receiptIdentityHtml) return upperSectionHtml;

                    const rightSectionMarker = '<div class="right-section">';
                    if (upperSectionHtml.includes(rightSectionMarker)) {
                        return upperSectionHtml.replace(
                            rightSectionMarker,
                            `${receiptIdentityHtml}${rightSectionMarker}`
                        );
                    }

                    return `${upperSectionHtml}${receiptIdentityHtml}`;
                },

        wmn_get_receipt_identity_html(doc) {
                    doc = doc || this.doc || {};

                    const barcodeService = window.WMN_POS?.Services?.Barcode?.InvoiceBarcode;
                    const rawReceiptNo = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
                    const receiptNo = String(rawReceiptNo || "").trim();
                    const barcodePayload = barcodeService?.payloadFromDoc
                        ? barcodeService.payloadFromDoc(doc)
                        : "";

                    if (!receiptNo && !barcodePayload) return "";

                    let barcodeHtml = "";
                    if (barcodePayload && barcodeService?.buildHtmlBlock) {
                        const printConfig = window.WMN_POS?.Services?.Printing?.PrintService?.getConfig?.() || {};
                        barcodeHtml = barcodeService.buildHtmlBlock(doc, {
                            ...printConfig,
                            show_invoice_barcode: 1,
                        });
                    }

                    const receiptHtml = receiptNo
                        ? `<div class="wmn-summary-receipt-number" style="display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;font-weight:600;direction:ltr"><span>R NO :</span><strong style="font-family:monospace">${frappe.utils.escape_html(receiptNo)}</strong></div>`
                        : "";

                    return `<div class="wmn-summary-receipt-identity" style="flex:0 1 230px;min-width:150px;max-width:230px;text-align:center;align-self:center;padding:0 10px;box-sizing:border-box;direction:ltr">${receiptHtml}<div class="wmn-summary-barcode-wrap" style="margin:4px auto 0;max-width:220px">${barcodeHtml}</div></div>`;
                },

        bind_events() {
                    super.bind_events();
                    this.$summary_container.on("click", ".wmn-add-payment-btn", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        await this.wmn_open_add_payment_dialog();
                    });
                },

        wmn_render_discount_summary(doc) {
                    if (!this.$summary_container?.length) return;
                    doc = doc || this.doc || {};
                    this.$summary_container.find(".wmn-summary-discount-breakdown").remove();

                    const currency = doc.currency || "";
                    const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_discount_total || 0));
                    const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
                    const isReturn = cint(doc.is_return || 0) === 1;
                    const manualPercent = Math.max(0, Math.abs(flt(doc.additional_discount_percentage || 0)));
                    const manualAmount = isReturn
                        ? Math.abs(flt(doc.discount_amount || 0))
                        : (manualPercent > 0.000001 ? Math.max(0, flt(doc.discount_amount || 0)) : 0);
                    const couponCode = String(doc.__wmn_coupon_code || "").trim();
                    const knownTotal = promotionAmount + couponAmount + manualAmount;
                    const invoiceDiscount = isReturn ? 0 : Math.max(0, flt(doc.discount_amount || 0));
                    const fallbackAmount = knownTotal <= 0.000001 ? invoiceDiscount : 0;

                    const rows = [];
                    if (promotionAmount > 0.000001) {
                        rows.push(`<div class="wmn-summary-discount-row"><span>${__("Promotions")}</span><strong>-${format_currency(promotionAmount, currency)}</strong></div>`);
                    }
                    if (couponCode || couponAmount > 0.000001) {
                        rows.push(`<div class="wmn-summary-discount-row"><span>${__("Coupon")}${couponCode ? ` · ${frappe.utils.escape_html(couponCode)}` : ""}</span><strong>-${format_currency(couponAmount, currency)}</strong></div>`);
                    }
                    if (manualAmount > 0.000001 || manualPercent > 0.000001) {
                        rows.push(`<div class="wmn-summary-discount-row"><span>${__("Manual Discount")}${manualPercent > 0.000001 ? ` · ${manualPercent}%` : ""}</span><strong>-${format_currency(manualAmount, currency)}</strong></div>`);
                    }
                    if (fallbackAmount > 0.000001) {
                        rows.push(`<div class="wmn-summary-discount-row"><span>${__("Invoice Discount")}</span><strong>-${format_currency(fallbackAmount, currency)}</strong></div>`);
                    }

                    const total = knownTotal > 0.000001 ? knownTotal : fallbackAmount;
                    if (total <= 0.000001 && !couponCode) return;
                    rows.push(`<div class="wmn-summary-discount-row is-total"><span>${__("Total Discount")}</span><strong>-${format_currency(total, currency)}</strong></div>`);

                    const $target = this.$summary_container.find(".summary-container, .summary-wrapper, .summary-body").first();
                    const $block = $(`<div class="wmn-summary-discount-breakdown">${rows.join("")}</div>`);
                    if ($target.length) $target.append($block);
                    else this.$summary_container.append($block);
                },

        wmn_can_add_payment(doc) {
                    doc = doc || this.doc || {};
                    if (doc.doctype !== "Sales Invoice") return false;
                    const isSubmitted = cint(doc.docstatus || 0) === 1 || doc.__wmn_local_submitted === true;
                    if (!isSubmitted) return false;
                    if (cint(doc.is_return || 0) === 1) return false;
                    return flt(doc.outstanding_amount || 0) > 0.000001;
                },

        async wmn_open_from_invoice_barcode(doc) {
                    if (!doc) return false;
                    this.load_summary_of(doc, false);
                    if (this.wmn_can_add_payment(doc)) {
                        await this.wmn_open_add_payment_dialog();
                    }
                    return true;
                },

        wmn_render_add_payment_button(doc, after_submission = false) {
                    this.$summary_btns.find(".wmn-add-payment-btn").remove();

                    if (after_submission) return;
                    if (!this.wmn_can_add_payment(doc)) return;

                    this.$summary_btns.append(
                        `<div class="summary-btn btn btn-default wmn-add-payment-btn">${__("Add Payment")}</div>`
                    );
                },

        async wmn_open_add_payment_dialog() {
                    const doc = this.doc || {};
                    if (!doc.name || doc.doctype !== "Sales Invoice") return;
                    if (wmn_summary_is_offline()) {
                        if (typeof wmn_open_offline_existing_invoice_payment_dialog !== "function") {
                            frappe.show_alert({ message: __("Offline payment service is not available."), indicator: "orange" });
                            return;
                        }

                        const queued = await wmn_open_offline_existing_invoice_payment_dialog(doc);
                        if (!queued) return;

                        const identity = doc.__wmn_queue_offline_id || doc.__wmn_server_name || doc.name;
                        const cache = window.cur_pos?.wmn_cache?.();
                        const freshDoc = cache?.getInvoiceFromCache
                            ? await cache.getInvoiceFromCache("Sales Invoice", identity)
                            : await window.wmnPOSOffline?.getOfflineInvoice?.(identity);
                        if (freshDoc) this.load_summary_of(freshDoc, false);
                        if (window.cur_pos?.recent_order_list?.refresh_list) {
                            await window.cur_pos.recent_order_list.refresh_list();
                        }
                        return queued;
                    }

                    frappe.dom.freeze(__("Loading payment details..."));
                    let context;

                    try {
                        const response = await frappe.call({
                            method: "wmn.api.get_sales_invoice_payment_context",
                            args: { invoice_name: doc.name },
                            freeze: false,
                        });
                        context = (response && response.message) || {};
                    } finally {
                        frappe.dom.unfreeze();
                    }

                    const methods = (context.payment_methods || []).filter((row) => row && row.mode_of_payment && row.account);
                    if (!methods.length) {
                        frappe.msgprint({
                            title: __("Add Payment"),
                            indicator: "orange",
                            message: __("No POS Profile payment method with an account is available."),
                        });
                        return;
                    }

                    const defaultMethod = methods.find((row) => cint(row.default || 0) === 1) || methods[0];
                    const outstandingAmount = flt(context.outstanding_amount || 0);
                    const currency = context.currency || doc.currency || "";

                    const dialog = new frappe.ui.Dialog({
                        title: __("Add Payment"),
                        fields: [
                            {
                                fieldname: "invoice_name",
                                fieldtype: "Data",
                                label: __("Sales Invoice"),
                                default: context.name,
                                read_only: 1,
                            },
                            {
                                fieldname: "customer_name",
                                fieldtype: "Data",
                                label: __("Customer"),
                                default: context.customer_name || context.customer,
                                read_only: 1,
                            },
                            {
                                fieldname: "outstanding_amount",
                                fieldtype: "Currency",
                                label: __("Outstanding Amount"),
                                default: outstandingAmount,
                                read_only: 1,
                            },
                            {
                                fieldname: "mode_of_payment",
                                fieldtype: "Select",
                                label: __("Mode of Payment"),
                                options: methods.map((row) => row.mode_of_payment).join("\n"),
                                default: defaultMethod.mode_of_payment,
                                reqd: 1,
                            },
                            {
                                fieldname: "amount",
                                fieldtype: "Currency",
                                label: __("Payment Amount"),
                                default: outstandingAmount,
                                reqd: 1,
                                description: currency ? __("Currency: {0}", [currency]) : "",
                            },
                            {
                                fieldname: "reference_no",
                                fieldtype: "Data",
                                label: __("Reference No"),
                                default: context.name,
                            },
                            {
                                fieldname: "reference_date",
                                fieldtype: "Date",
                                label: __("Reference Date"),
                                default: frappe.datetime.get_today(),
                            },
                        ],
                        primary_action_label: __("Add Payment"),
                        secondary_action_label: __("Close"),
                        secondary_action: () => dialog.hide(),
                        primary_action: async (values) => {
                            const amount = flt(values.amount || 0);
                            if (amount <= 0) {
                                frappe.show_alert({ message: __("Payment amount must be greater than zero."), indicator: "orange" });
                                return;
                            }
                            if (amount > outstandingAmount) {
                                frappe.show_alert({
                                    message: __("Payment amount cannot exceed outstanding amount {0}.", [format_currency(outstandingAmount, currency)]),
                                    indicator: "orange",
                                });
                                return;
                            }

                            dialog.get_primary_btn().prop("disabled", true);
                            frappe.dom.freeze(__("Adding payment..."));

                            try {
                                const response = await frappe.call({
                                    method: "wmn.api.add_payment_to_sales_invoice",
                                    args: {
                                        invoice_name: context.name,
                                        amount,
                                        mode_of_payment: values.mode_of_payment,
                                        reference_no: values.reference_no || context.name,
                                        reference_date: values.reference_date || frappe.datetime.get_today(),
                                    },
                                    freeze: false,
                                });

                                const result = (response && response.message) || {};
                                dialog.hide();

                                const freshDoc = await frappe.db.get_doc("Sales Invoice", context.name);
                                this.load_summary_of(freshDoc, false);

                                if (window.cur_pos && cur_pos.recent_order_list && cur_pos.recent_order_list.refresh_list) {
                                    await cur_pos.recent_order_list.refresh_list();
                                }

                                frappe.show_alert({
                                    message: __("Payment Entry {0} created successfully", [result.payment_entry || ""]),
                                    indicator: "green",
                                });
                            } catch (e) {
                                console.error("WMN add payment failed", e);
                                dialog.get_primary_btn().prop("disabled", false);
                                throw e;
                            } finally {
                                frappe.dom.unfreeze();
                            }
                        },
                    });

                    window.WMN_POS?.UI?.Dialogs?.decorate?.(dialog, "wmn-pos-add-payment-dialog");
                    dialog.$wrapper.addClass("wmn-add-payment-modal");
                    dialog.show();
                },



        async attach_items_info(doc) {
                    if (!wmn_summary_is_offline()) {
                        return super.attach_items_info(doc);
                    }

                    const returnOffline = window.WMN_POS?.Features?.Return?.Offline;
                    this.__wmn_offline_return_state = returnOffline?.getReturnState
                        ? await returnOffline.getReturnState(doc)
                        : null;

                    this.$items_container.html("");
                    for (const item of doc.items || []) {
                        const itemDom = await this.get_item_html(doc, item);
                        this.$items_container.append(itemDom);
                        this.set_dynamic_rate_header_width();
                    }
                },

        async get_item_html(doc, item_data) {
                    if (!wmn_summary_is_offline()) {
                        return super.get_item_html(doc, item_data);
                    }

                    const returnOffline = window.WMN_POS?.Features?.Return?.Offline;
                    const cachedState = this.__wmn_offline_return_state;
                    const cachedItemState = cachedState?.source === doc
                        ? (cachedState.items || []).find((row) => String(row.source_row?.name || "") === String(item_data?.name || ""))
                        : null;
                    const returnedQty = cachedItemState
                        ? flt(cachedItemState.returned_qty || 0)
                        : (returnOffline?.getReturnedQty ? await returnOffline.getReturnedQty(doc, item_data) : 0);
                    const itemRefundData = returnedQty > 0.000001
                        ? `<div class="item-row-refund"><strong>${returnedQty}</strong> ${__("Returned")}</div>`
                        : "";

                    const rateHtml = item_data.rate && item_data.price_list_rate && item_data.rate !== item_data.price_list_rate
                        ? `<span class="item-disc">(${item_data.discount_percentage || 0}% off)</span><div class="item-rate">${format_currency(item_data.rate, doc.currency)}</div>`
                        : `<div class="item-rate">${format_currency(item_data.price_list_rate || item_data.rate, doc.currency)}</div>`;

                    return `<div class="item-row-wrapper">
                        <div class="item-row-data">
                            <div class="item-name">${item_data.item_name}</div>
                            <div class="item-qty">${item_data.qty || 0} ${item_data.uom || ""}</div>
                            <div class="item-rate-disc">${rateHtml}</div>
                        </div>
                        ${itemRefundData}
                    </div>`;
                },

        async is_invoice_returnable(doctype, invoice) {
                    if (!wmn_summary_is_offline()) {
                        return super.is_invoice_returnable(doctype, invoice);
                    }

                    const returnOffline = window.WMN_POS?.Features?.Return?.Offline;
                    if (!returnOffline?.isInvoiceReturnable) return false;

                    let sourceDoc = this.doc || null;
                    const sourceIds = window.WMN_POS?.Features?.Return?.Common?.invoiceIdentities?.(sourceDoc) || new Set();
                    if (!sourceDoc || (invoice && !sourceIds.has(String(invoice)))) {
                        const cache = window.cur_pos?.wmn_cache?.();
                        sourceDoc = cache?.getInvoiceFromCache
                            ? await cache.getInvoiceFromCache(doctype, invoice)
                            : await window.wmnPOSOffline?.getOfflineInvoice?.(invoice);
                    }
                    if (!sourceDoc) return false;
                    if (this.__wmn_offline_return_state?.source === sourceDoc) {
                        return !!this.__wmn_offline_return_state.returnable;
                    }
                    return await returnOffline.isInvoiceReturnable(sourceDoc);
                },

        get_condition_btn_map(after_submission) {
                    if (this.after_submission === true || after_submission === true) {
                        return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
                    }

                    const doc = this.doc || {};
                    if (cint(doc.docstatus || 0) === 0) {
                        return [{ condition: true, visible_btns: ["Edit Order", "Delete Order"] }];
                    }
                    if (cint(doc.is_return || 0) === 1 && cint(doc.docstatus || 0) === 1) {
                        return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt"] }];
                    }
                    if (cint(doc.docstatus || 0) === 1) {
                        const visible = ["Print Receipt", "Email Receipt", "Return"];
                        if (!wmn_summary_is_offline() && ["Partly Paid", "Overdue", "Unpaid"].includes(String(doc.status || ""))) {
                            visible.push("Open in Form View");
                        }
                        return [{ condition: true, visible_btns: visible }];
                    }
                    return super.get_condition_btn_map(after_submission);
                },

        attach_document_info(doc) {
                    if (!wmn_summary_is_offline()) {
                        return super.attach_document_info(doc);
                    }

                    this.customer_email = wmn_summary_customer_email(doc);
                    const upper_section_dom = this.get_upper_section_html(doc || this.doc || {});
                    this.$upper_section.html(upper_section_dom);
                },

        print_receipt() {
                    if (wmn_summary_is_offline()) {
                        const doc = this.doc || (this.events && this.events.get_frm && this.events.get_frm().doc);
                        if (window.wmn_print_offline_receipt) {
                            return window.wmn_print_offline_receipt(doc);
                        }
                        frappe.show_alert({ message: __("Offline receipt printer is not available."), indicator: "orange" });
                        return;
                    }
                    return super.print_receipt();
                },

        send_email() {
                    if (wmn_summary_is_offline()) {
                        frappe.show_alert({ message: __("Email receipt is not available while offline."), indicator: "orange" });
                        if (this.email_dialog) this.email_dialog.hide();
                        return;
                    }
                    return super.send_email();
                }
    };

    const UIMethods = {
        __proto__: CoreMethods
    };

    const FinalMethods = Object.create(null);
    FinalMethods.toggle_summary_placeholder = UIMethods.toggle_summary_placeholder || CoreMethods.toggle_summary_placeholder;
    FinalMethods.load_summary_of = UIMethods.load_summary_of || CoreMethods.load_summary_of;
    FinalMethods.get_upper_section_html = UIMethods.get_upper_section_html || CoreMethods.get_upper_section_html;
    FinalMethods.wmn_get_receipt_identity_html = UIMethods.wmn_get_receipt_identity_html || CoreMethods.wmn_get_receipt_identity_html;
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.wmn_render_discount_summary = UIMethods.wmn_render_discount_summary || CoreMethods.wmn_render_discount_summary;
    FinalMethods.wmn_can_add_payment = UIMethods.wmn_can_add_payment || CoreMethods.wmn_can_add_payment;
    FinalMethods.wmn_open_from_invoice_barcode = UIMethods.wmn_open_from_invoice_barcode || CoreMethods.wmn_open_from_invoice_barcode;
    FinalMethods.wmn_render_add_payment_button = UIMethods.wmn_render_add_payment_button || CoreMethods.wmn_render_add_payment_button;
    FinalMethods.wmn_open_add_payment_dialog = UIMethods.wmn_open_add_payment_dialog || CoreMethods.wmn_open_add_payment_dialog;
    FinalMethods.attach_items_info = UIMethods.attach_items_info || CoreMethods.attach_items_info;
    FinalMethods.get_item_html = UIMethods.get_item_html || CoreMethods.get_item_html;
    FinalMethods.is_invoice_returnable = UIMethods.is_invoice_returnable || CoreMethods.is_invoice_returnable;
    FinalMethods.get_condition_btn_map = UIMethods.get_condition_btn_map || CoreMethods.get_condition_btn_map;
    FinalMethods.attach_document_info = UIMethods.attach_document_info || CoreMethods.attach_document_info;
    FinalMethods.print_receipt = UIMethods.print_receipt || CoreMethods.print_receipt;
    FinalMethods.send_email = UIMethods.send_email || CoreMethods.send_email;

    const initializeCore = null;
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.ClassMethods.PastOrderSummary = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_past_order_summary_methods.js */


/* BEGIN wmn_past_order_summary_class.js */
/* Single production WMN POS PastOrderSummary class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.PastOrderSummary;
    const methods = ns.ClassMethods.PastOrderSummary;

    class WMNPastOrderSummaryClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNPastOrderSummaryClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        toggle_summary_placeholder(...args) {
            return methods.FinalMethods.toggle_summary_placeholder.apply(this, args);
        }

        load_summary_of(...args) {
            return methods.FinalMethods.load_summary_of.apply(this, args);
        }

        get_upper_section_html(...args) {
            return methods.FinalMethods.get_upper_section_html.apply(this, args);
        }

        wmn_get_receipt_identity_html(...args) {
            return methods.FinalMethods.wmn_get_receipt_identity_html.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        wmn_render_discount_summary(...args) {
            return methods.FinalMethods.wmn_render_discount_summary.apply(this, args);
        }

        wmn_can_add_payment(...args) {
            return methods.FinalMethods.wmn_can_add_payment.apply(this, args);
        }

        wmn_open_from_invoice_barcode(...args) {
            return methods.FinalMethods.wmn_open_from_invoice_barcode.apply(this, args);
        }

        wmn_render_add_payment_button(...args) {
            return methods.FinalMethods.wmn_render_add_payment_button.apply(this, args);
        }

        wmn_open_add_payment_dialog(...args) {
            return methods.FinalMethods.wmn_open_add_payment_dialog.apply(this, args);
        }

        attach_items_info(...args) {
            return methods.FinalMethods.attach_items_info.apply(this, args);
        }

        get_item_html(...args) {
            return methods.FinalMethods.get_item_html.apply(this, args);
        }

        is_invoice_returnable(...args) {
            return methods.FinalMethods.is_invoice_returnable.apply(this, args);
        }

        get_condition_btn_map(...args) {
            return methods.FinalMethods.get_condition_btn_map.apply(this, args);
        }

        attach_document_info(...args) {
            return methods.FinalMethods.attach_document_info.apply(this, args);
        }

        print_receipt(...args) {
            return methods.FinalMethods.print_receipt.apply(this, args);
        }

        send_email(...args) {
            return methods.FinalMethods.send_email.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNPastOrderSummaryClass, Base);
    ns.Classes.PastOrderSummary = WMNPastOrderSummaryClass;
})();

/* END wmn_past_order_summary_class.js */


/* BEGIN wmn_item_selector_methods.js */
/* ItemSelector class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemSelector;
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
            } = item;
            const effective_rate = flt(
                item.price_list_rate !== undefined && item.price_list_rate !== null
                    ? item.price_list_rate
                    : item.rate || 0
            );
            const display_currency =
                item.currency ||
                this.events?.get_frm?.()?.doc?.currency ||
                this.mamsek_settings?.currency ||
                window.cur_pos?.frm?.doc?.currency ||
                window.cur_pos?.settings?.currency ||
                "";
            const precision = flt(effective_rate, 2) % 1 !== 0 ? 2 : 0;
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
                data-rate="${escape(effective_rate)}" data-stock-uom="${escape(item.stock_uom)}">
                <div class="item-wrapper"
                    data-item-code="${escape(item.item_code)}" data-serial-no="${escape(serial_no)}"
                    data-batch-no="${escape(batch_no)}" data-uom="${escape(uom)}"
                    data-rate="${escape(effective_rate)}" data-stock-uom="${escape(item.stock_uom)}"
                    title="${safe_name}">
                    <div class="wmn-card-media">
                        ${media}
                        <span class="wmn-item-cart-counter" hidden>0</span>
                        ${item.is_stock_item ? `<span class="wmn-stock-pill${stock_class}">${stock_value}</span>` : ""}
                    </div>
                    <div class="item-detail">
                        <div class="item-name">${safe_name}</div>
                        <div class="item-rate">${format_currency(effective_rate, display_currency, precision) || 0}</div>
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

            window.WMN_POS?.Features?.BarcodeScanQuantityUI?.install?.(this);
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

        wmn_get_pos_profile_name() {
            const pos_ctrl = window.cur_pos;
            if (pos_ctrl?.pos_profile && typeof pos_ctrl.pos_profile === "string") {
                return pos_ctrl.pos_profile;
            }
            if (pos_ctrl?.settings?.name) return pos_ctrl.settings.name;
            if (pos_ctrl?.frm?.doc?.pos_profile) return pos_ctrl.frm.doc.pos_profile;
            return this.pos_profile || "";
        },

        async wmn_add_online_barcode_result(data, qty_value) {
            const pos_ctrl = window.cur_pos;
            qty_value = flt(qty_value || 1);

            let existing_item = null;
            if (pos_ctrl?.frm?.doc?.items) {
                existing_item = pos_ctrl.frm.doc.items.find(i =>
                    i.item_code === data.item_code &&
                    (i.batch_no === data.batch_no || (!i.batch_no && !data.batch_no))
                );
            }

            if (existing_item) {
                frappe.dom.freeze();
                try {
                    const new_qty = flt(existing_item.qty) + qty_value;
                    await wmn_pos_set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                    if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                        await wmn_pos_set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                    }
                    if (data.serial_no) {
                        const new_serial_no = existing_item.serial_no
                            ? existing_item.serial_no + "\n" + data.serial_no
                            : data.serial_no;
                        await wmn_pos_set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                    }
                    if (pos_ctrl.update_cart_html) pos_ctrl.update_cart_html(existing_item);
                } finally {
                    frappe.dom.unfreeze();
                }
                return existing_item;
            }

            let final_rate = data.rate || data.price_list_rate || 0;
            if (final_rate === 0 && pos_ctrl?.item_selector?.items) {
                const ui_item = pos_ctrl.item_selector.items.find(i => i.item_code === data.item_code);
                final_rate = ui_item ? (ui_item.price_list_rate || ui_item.rate) : 0;
            }

            if (pos_ctrl?.add_item) {
                return await pos_ctrl.add_item({
                    item_code: data.item_code,
                    qty: qty_value,
                    rate: final_rate,
                    price_list_rate: final_rate,
                    batch_no: data.batch_no,
                    serial_no: data.serial_no,
                    uom: data.uom,
                });
            }

            return await Promise.resolve(this.events.item_selected({
                field: "qty",
                value: qty_value,
                item: {
                    item_code: data.item_code,
                    batch_no: data.batch_no,
                    serial_no: data.serial_no,
                    uom: data.uom,
                    rate: final_rate,
                },
            }));
        },

        wmn_is_exact_barcode_result(data, search_term) {
            if (!data || !search_term) return false;
            if (data.__wmn_from_barcode_structure) return true;

            const expected = String(search_term || "").trim().toLowerCase();
            const actual = String(data.barcode || "").trim().toLowerCase();
            return Boolean(actual && actual === expected);
        },

        filter_items({ search_term = "" } = {}) {
            const qtyFeature = window.WMN_POS?.Features?.BarcodeScanQuantity;
            const qtyUI = window.WMN_POS?.Features?.BarcodeScanQuantityUI;
            const fromScan = Boolean(this.barcode_scanned);
            const fromTypedBarcode = Boolean(this.__wmn_typed_barcode_submit);
            const fromBarcodeInput = Boolean(fromScan || fromTypedBarcode);
            const armedBarcodeInput = Boolean(fromBarcodeInput && qtyFeature?.isArmed?.(this));
            this.__wmn_typed_barcode_submit = false;

            const syncScanState = () => {
                this.barcode_scanned = false;
                qtyUI?.sync?.(this);
            };

            if (this.wmn_is_offline() && window.wmnPOSOffline) {
                return this.wmn_scan_barcode_structure_offline(search_term).then(async (structured_item) => {
                    if (structured_item && structured_item.item_code && search_term && search_term.length >= 12) {
                        await this.wmn_update_existing_cart_item_or_add(
                            structured_item,
                            structured_item.qty || 1
                        );

                        if (fromBarcodeInput) {
                            qtyFeature?.finishScan?.(this, { success: true, structured: true, prompted: false });
                            syncScanState();
                        }
                        this.set_search_value("");
                        frappe.utils.play_sound("submit");
                        return;
                    }

                    return this.get_items({ search_term }).then(async ({ message }) => {
                        const items = (message && message.items) || [];

                        const exactTypedBarcode = !fromTypedBarcode ||
                            (items.length === 1 && this.wmn_is_exact_barcode_result(items[0], search_term));

                        if (items.length === 1 && search_term && search_term.length >= 8 && exactTypedBarcode) {
                            const item = items[0];
                            let qtyValue = item.qty || 1;
                            let prompted = false;

                            if (qtyFeature?.shouldPrompt?.(this, item, { fromScan, fromTypedBarcode })) {
                                const requestedQty = await qtyUI?.requestQuantity?.(this, item);
                                if (requestedQty == null) {
                                    syncScanState();
                                    this.set_search_value("");
                                    return;
                                }
                                qtyValue = requestedQty;
                                prompted = true;
                            }

                            await this.wmn_update_existing_cart_item_or_add(item, qtyValue);
                            if (fromBarcodeInput) {
                                qtyFeature?.finishScan?.(this, {
                                    success: true,
                                    structured: qtyFeature?.isStructured?.(item),
                                    prompted,
                                });
                                syncScanState();
                            }

                            this.set_search_value("");
                            frappe.utils.play_sound("submit");
                            return;
                        }

                        if (fromScan) syncScanState();
                        qtyUI?.sync?.(this);
                        this.render_item_list(items);
                    });
                });
            }

            const shouldResolveBarcode = Boolean(
                search_term &&
                ((armedBarcodeInput && fromBarcodeInput) || search_term.length >= 12)
            );

            if (shouldResolveBarcode) {
                return frappe.call({
                    method: "wmn.barcode_handler.custom_scan_barcode_pos",
                    args: {
                        search_value: search_term,
                        price_list: this.price_list || this.events.get_frm().doc.selling_price_list,
                        pos_profile: this.wmn_get_pos_profile_name(),
                    },
                }).then(async (r) => {
                    if (r.message && r.message.item_code) {
                        const data = r.message;
                        const structured = Boolean(qtyFeature?.isStructured?.(data));

                        if (fromTypedBarcode && !this.wmn_is_exact_barcode_result(data, search_term)) {
                            qtyUI?.sync?.(this);
                            return super.filter_items({ search_term });
                        }

                        let qtyValue = data.qty || 1;
                        let prompted = false;

                        if (qtyFeature?.shouldPrompt?.(this, data, { fromScan, fromTypedBarcode })) {
                            const requestedQty = await qtyUI?.requestQuantity?.(this, data);
                            if (requestedQty == null) {
                                syncScanState();
                                this.set_search_value("");
                                return;
                            }
                            qtyValue = requestedQty;
                            prompted = true;
                        }

                        await this.wmn_add_online_barcode_result(data, qtyValue);

                        if (fromBarcodeInput) {
                            qtyFeature?.finishScan?.(this, { success: true, structured, prompted });
                            syncScanState();
                        }
                        this.set_search_value("");
                        frappe.utils.play_sound("submit");
                        return;
                    }

                    if (fromScan && armedBarcodeInput) {
                        syncScanState();
                    } else {
                        qtyUI?.sync?.(this);
                    }
                    return super.filter_items({ search_term });
                }).catch((err) => {
                    console.error(err);
                    frappe.dom.unfreeze();
                    if (fromScan && armedBarcodeInput) syncScanState();
                    else qtyUI?.sync?.(this);
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
                            const source = status.has_local_override ? __("Browser preference is active") : __("Using POS Profile defaults");
                            statusField.$wrapper.html(`<div class="alert alert-light border" style="margin:0;padding:10px 12px"><strong>${frappe.utils.escape_html(profileName || __("POS Profile"))}</strong><br>${source}</div>`);
                        }
                        return dialog;
                    },

        bind_events() {
            super.bind_events();

            const qtyFeature = window.WMN_POS?.Features?.BarcodeScanQuantity;
            this.search_field?.$input
                ?.off?.("keydown.wmnQtyTypedBarcode")
                ?.on?.("keydown.wmnQtyTypedBarcode", (event) => {
                    if (event.key !== "Enter") return;
                    if (!qtyFeature?.isArmed?.(this)) return;

                    const searchTerm = String(this.search_field?.get_value?.() || "").trim();
                    if (!searchTerm) return;

                    event.preventDefault();
                    event.stopImmediatePropagation();
                    clearTimeout(this.last_search);
                    this.__wmn_typed_barcode_submit = true;

                    Promise.resolve(this.filter_items({ search_term: searchTerm })).catch((error) => {
                        this.__wmn_typed_barcode_submit = false;
                        console.error("WMN typed barcode submit failed", error);
                        window.WMN_POS?.Features?.BarcodeScanQuantityUI?.sync?.(this);
                    });
                });

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
    FinalMethods.wmn_get_pos_profile_name = UIMethods.wmn_get_pos_profile_name || CoreMethods.wmn_get_pos_profile_name;
    FinalMethods.wmn_add_online_barcode_result = UIMethods.wmn_add_online_barcode_result || CoreMethods.wmn_add_online_barcode_result;
    FinalMethods.wmn_is_exact_barcode_result = UIMethods.wmn_is_exact_barcode_result || CoreMethods.wmn_is_exact_barcode_result;
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
                        display: block;
                        margin-top: 2px;
                        font-size: 11px;
                        line-height: 14px;
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

    ns.ClassMethods.ItemSelector = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_item_selector_methods.js */


/* BEGIN wmn_item_selector_class.js */
/* Single production WMN POS ItemSelector class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemSelector;
    const methods = ns.ClassMethods.ItemSelector;

    class WMNItemSelectorClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNItemSelectorClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        wmn_is_offline(...args) {
            return methods.FinalMethods.wmn_is_offline.apply(this, args);
        }

        wmn_get_cached_pos_settings(...args) {
            return methods.FinalMethods.wmn_get_cached_pos_settings.apply(this, args);
        }

        wmn_get_cached_pos_profile(...args) {
            return methods.FinalMethods.wmn_get_cached_pos_profile.apply(this, args);
        }

        wmn_enrich_item_tracking_meta(...args) {
            return methods.FinalMethods.wmn_enrich_item_tracking_meta.apply(this, args);
        }

        wmn_get_offline_parent_item_group(...args) {
            return methods.FinalMethods.wmn_get_offline_parent_item_group.apply(this, args);
        }

        get_parent_item_group(...args) {
            return methods.FinalMethods.get_parent_item_group.apply(this, args);
        }

        load_items_data(...args) {
            return methods.FinalMethods.load_items_data.apply(this, args);
        }

        wmn_get_awesomplete_value(...args) {
            return methods.FinalMethods.wmn_get_awesomplete_value.apply(this, args);
        }

        wmn_get_item_group_filter_for_search(...args) {
            return methods.FinalMethods.wmn_get_item_group_filter_for_search.apply(this, args);
        }

        wmn_set_item_group_filter_label(...args) {
            return methods.FinalMethods.wmn_set_item_group_filter_label.apply(this, args);
        }

        wmn_update_existing_cart_item_or_add(...args) {
            return methods.FinalMethods.wmn_update_existing_cart_item_or_add.apply(this, args);
        }

        get_item_html(...args) {
            return methods.FinalMethods.get_item_html.apply(this, args);
        }

        make_search_bar(...args) {
            return methods.FinalMethods.make_search_bar.apply(this, args);
        }

        wmn_get_item_group_buttons_from_pos_profile(...args) {
            return methods.FinalMethods.wmn_get_item_group_buttons_from_pos_profile.apply(this, args);
        }

        wmn_render_item_group_buttons(...args) {
            return methods.FinalMethods.wmn_render_item_group_buttons.apply(this, args);
        }

        wmn_set_item_group_field_value(...args) {
            return methods.FinalMethods.wmn_set_item_group_field_value.apply(this, args);
        }

        wmn_get_item_selection_context(...args) {
            return methods.FinalMethods.wmn_get_item_selection_context.apply(this, args);
        }

        wmn_get_online_variant_metadata(...args) {
            return methods.FinalMethods.wmn_get_online_variant_metadata.apply(this, args);
        }

        wmn_prepare_items_for_display(...args) {
            return methods.FinalMethods.wmn_prepare_items_for_display.apply(this, args);
        }

        wmn_is_direct_search_result(...args) {
            return methods.FinalMethods.wmn_is_direct_search_result.apply(this, args);
        }

        get_items(...args) {
            return methods.FinalMethods.get_items.apply(this, args);
        }

        wmn_scan_barcode_structure_offline(...args) {
            return methods.FinalMethods.wmn_scan_barcode_structure_offline.apply(this, args);
        }

        wmn_get_pos_profile_name(...args) {
            return methods.FinalMethods.wmn_get_pos_profile_name.apply(this, args);
        }

        wmn_add_online_barcode_result(...args) {
            return methods.FinalMethods.wmn_add_online_barcode_result.apply(this, args);
        }

        wmn_is_exact_barcode_result(...args) {
            return methods.FinalMethods.wmn_is_exact_barcode_result.apply(this, args);
        }

        filter_items(...args) {
            return methods.FinalMethods.filter_items.apply(this, args);
        }

        wmn_get_variant_choices(...args) {
            return methods.FinalMethods.wmn_get_variant_choices.apply(this, args);
        }

        wmn_get_batch_choices(...args) {
            return methods.FinalMethods.wmn_get_batch_choices.apply(this, args);
        }

        wmn_get_uom_choices(...args) {
            return methods.FinalMethods.wmn_get_uom_choices.apply(this, args);
        }

        wmn_apply_uom_option(...args) {
            return methods.FinalMethods.wmn_apply_uom_option.apply(this, args);
        }

        wmn_config_qty(...args) {
            return methods.FinalMethods.wmn_config_qty.apply(this, args);
        }

        wmn_config_available_uom_qty(...args) {
            return methods.FinalMethods.wmn_config_available_uom_qty.apply(this, args);
        }

        wmn_config_uom_section_html(...args) {
            return methods.FinalMethods.wmn_config_uom_section_html.apply(this, args);
        }

        wmn_bind_config_uom_section(...args) {
            return methods.FinalMethods.wmn_bind_config_uom_section.apply(this, args);
        }

        wmn_validate_config_qty(...args) {
            return methods.FinalMethods.wmn_validate_config_qty.apply(this, args);
        }

        wmn_choose_uom(...args) {
            return methods.FinalMethods.wmn_choose_uom.apply(this, args);
        }

        wmn_choose_batch_with_uom(...args) {
            return methods.FinalMethods.wmn_choose_batch_with_uom.apply(this, args);
        }

        wmn_choose_variant(...args) {
            return methods.FinalMethods.wmn_choose_variant.apply(this, args);
        }

        wmn_handle_item_wrapper_click(...args) {
            return methods.FinalMethods.wmn_handle_item_wrapper_click.apply(this, args);
        }

        wmn_open_ui_settings_dialog(...args) {
            return methods.FinalMethods.wmn_open_ui_settings_dialog.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        render_item_list(...args) {
            return methods.FinalMethods.render_item_list.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        updateActiveButton(...args) {
            return methods.FinalMethods.updateActiveButton.apply(this, args);
        }

        setCardMode(...args) {
            return methods.FinalMethods.setCardMode.apply(this, args);
        }

        setButtonMode(...args) {
            return methods.FinalMethods.setButtonMode.apply(this, args);
        }

        applyDisplayMode(...args) {
            return methods.FinalMethods.applyDisplayMode.apply(this, args);
        }

        set_connectivity_indicator_state(...args) {
            return methods.FinalMethods.set_connectivity_indicator_state.apply(this, args);
        }

        refresh_pending_invoice_badge(...args) {
            return methods.FinalMethods.refresh_pending_invoice_badge.apply(this, args);
        }

        install_connectivity_indicator(...args) {
            return methods.FinalMethods.install_connectivity_indicator.apply(this, args);
        }

        install_category_bar(...args) {
            return methods.FinalMethods.install_category_bar.apply(this, args);
        }

        render_category_bar(...args) {
            return methods.FinalMethods.render_category_bar.apply(this, args);
        }

        handle_broken_image(...args) {
            return methods.FinalMethods.handle_broken_image.apply(this, args);
        }

        update_active_category_count(...args) {
            return methods.FinalMethods.update_active_category_count.apply(this, args);
        }

        get_cart_rows(...args) {
            return methods.FinalMethods.get_cart_rows.apply(this, args);
        }

        get_cart_quantity(...args) {
            return methods.FinalMethods.get_cart_quantity.apply(this, args);
        }

        sync_card_quantities(...args) {
            return methods.FinalMethods.sync_card_quantities.apply(this, args);
        }

        wmn_refresh_available_stock(...args) {
            return methods.FinalMethods.wmn_refresh_available_stock.apply(this, args);
        }

        resize_selector(...args) {
            return methods.FinalMethods.resize_selector.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNItemSelectorClass, Base);
    ns.Classes.ItemSelector = WMNItemSelectorClass;
})();

/* END wmn_item_selector_class.js */


/* BEGIN wmn_item_cart_methods.js */
/* ItemCart class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemCart;
    const MamsekUI = ns.UI.Mamsek;
    const ACTIVE_BODY_CLASS = MamsekUI.ACTIVE_BODY_CLASS;
    const icon = MamsekUI.icon;
    const escape_html = MamsekUI.escape_html;
    const category_emoji = MamsekUI.category_emoji;
    const read_item_data = MamsekUI.read_item_data;
    const parse_quantity = MamsekUI.parse_quantity;

    /*
     * WMN ItemCart for ERPNext v16.
     * Online paths keep ERPNext behavior; offline paths use local document/cache data.
     */

        function wmn_item_cart_is_offline() {
            try {
                if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
                if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos && wmn_controller_uses_offline_flow(window.cur_pos)) return true;
                if (window.__wmn_pos_effective_offline === true) return true;
                if (navigator.onLine === false) return true;
            } catch (e) {}
            return false;
        }

        async function wmn_get_cached_customer(customer) {
            if (!customer || !window.wmnPOSOffline) return null;
            try {
                if (window.wmnPOSOffline.STORES && window.wmnPOSOffline.get) {
                    return await window.wmnPOSOffline.get(window.wmnPOSOffline.STORES.customers, customer);
                }
            } catch (e) {}
            try {
                if (window.wmnPOSOffline.STORES && window.wmnPOSOffline.getFirstByIndex) {
                    const stores = window.wmnPOSOffline.STORES;
                    const byName = await window.wmnPOSOffline.getFirstByIndex(stores.customers, "customer_name", customer);
                    if (byName) return byName;
                    const byMobile = await window.wmnPOSOffline.getFirstByIndex(stores.customers, "mobile_no", customer);
                    if (byMobile) return byMobile;
                }
            } catch (e) {}
            return null;
        }

        function wmn_cart_summary_data(doc) {
            doc = doc || {};
            const currency = doc.currency || "";
            const promotions = Array.isArray(doc.__wmn_pos_promotions) ? doc.__wmn_pos_promotions : [];
            const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_discount_total || 0));
            const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
            const couponCode = String(doc.__wmn_coupon_code || doc.__wmn_pos_coupon_rule?.coupon_code || "").trim();
            const isReturn = cint(doc.is_return || 0) === 1;
            const manualPercent = Math.max(0, Math.abs(flt(doc.additional_discount_percentage || 0)));
            const nativeReturnDiscount = isReturn ? Math.abs(flt(doc.discount_amount || 0)) : 0;
            const manualAmount = isReturn
                ? nativeReturnDiscount
                : (manualPercent > 0.000001 ? Math.max(0, flt(doc.discount_amount || 0)) : 0);
            const taxes = Array.isArray(doc.taxes)
                ? doc.taxes.map((row) => ({
                    label: String(row.description || row.account_head || row.charge_type || __("Tax")).trim(),
                    rate: flt(row.rate || 0),
                    amount: flt(
                        row.tax_amount_after_discount_amount !== undefined
                            ? row.tax_amount_after_discount_amount
                            : row.tax_amount || 0
                    ),
                }))
                : [];

            return {
                currency,
                item_count: Array.isArray(doc.items) ? doc.items.length : 0,
                total_qty: flt(doc.total_qty || (doc.items || []).reduce((sum, row) => sum + flt(row.qty || 0), 0)),
                subtotal: flt(doc.net_total || doc.total || 0),
                promotions,
                promotion_amount: promotionAmount,
                coupon_code: couponCode,
                coupon_amount: couponAmount,
                manual_percent: manualPercent,
                manual_amount: manualAmount,
                total_discount: promotionAmount + couponAmount + manualAmount,
                taxes,
                total_taxes: flt(doc.total_taxes_and_charges || 0),
                grand_total: flt(doc.grand_total || 0),
                rounding_adjustment: flt(doc.rounding_adjustment || 0),
                payable_total: flt(doc.rounded_total || doc.grand_total || 0),
            };
        }

        function wmn_summary_row(label, value, className) {
            const css = className ? ` ${className}` : "";
            return `<div class="wmn-cart-summary-row${css}"><span>${escape_html(label)}</span><strong>${value}</strong></div>`;
        }

    const CoreMethods = {
        __proto__: Base.prototype,

        wmn_get_numpad_supervisor_context(fieldname, afterValue) {
                    const pos = window.cur_pos;
                    const row = pos?.item_details?.item_row || pos?.item_details?.current_item || {};
                    const context = {
                        doc: pos?.frm?.doc || null,
                        item_code: row.item_code || "",
                        row_name: row.name || "",
                        before_value: fieldname ? flt(row[fieldname] || 0) : "",
                        reference_value: flt(row.price_list_rate || row.rate || 0),
                    };
                    if (afterValue !== undefined) context.after_value = afterValue;
                    return context;
                },

        async on_numpad_event($btn) {
                    if (!window.WMNPOSSupervisor || !window.cur_pos) {
                        return super.on_numpad_event($btn);
                    }

                    const currentAction = $btn.attr("data-button-value");
                    const protectedMap = {
                        rate: window.WMNPOSSupervisor.ACTIONS.CHANGE_RATE,
                        discount_percentage: window.WMNPOSSupervisor.ACTIONS.ITEM_DISCOUNT,
                    };
                    const protectedAction = protectedMap[currentAction];
                    const required = protectedAction && window.WMNPOSSupervisor.isActionRequired(protectedAction);
                    const previousAction = this.prev_action;

                    if (required && previousAction !== currentAction) {
                        if (protectedMap[previousAction]) {
                            const previousContext = this.wmn_get_numpad_supervisor_context(previousAction);
                            window.WMNPOSSupervisor.clearGrant(protectedMap[previousAction], previousContext);
                        }

                        const context = this.wmn_get_numpad_supervisor_context(currentAction);
                        context.after_value = "";
                        context.create_grant = true;
                        context.attach_to_doc = false;
                        const approval = await window.cur_pos.wmn_authorize_pos_action(protectedAction, context);
                        if (!approval || !approval.approved) return;
                    }

                    const activeProtectedAction = protectedMap[this.prev_action];
                    if (!protectedAction && activeProtectedAction && window.WMNPOSSupervisor.isActionRequired(activeProtectedAction)) {
                        const isValueKey = currentAction === "delete" || currentAction === "." || /^\d$/.test(String(currentAction));
                        if (isValueKey) {
                            const rawCurrent = String(this.numpad_value || "");
                            let nextValue;
                            if (currentAction === "delete") nextValue = rawCurrent.slice(0, -1) || "0";
                            else nextValue = rawCurrent + String(currentAction);

                            const context = this.wmn_get_numpad_supervisor_context(this.prev_action, flt(nextValue || 0));
                            let validation = window.WMNPOSSupervisor.validateGrant(activeProtectedAction, context);
                            if (!validation.ok) {
                                context.create_grant = true;
                                context.attach_to_doc = false;
                                const approval = await window.cur_pos.wmn_authorize_pos_action(activeProtectedAction, context);
                                if (!approval || !approval.approved) return;
                                validation = window.WMNPOSSupervisor.validateGrant(activeProtectedAction, context);
                            }
                            if (!validation.ok) {
                                frappe.show_alert({ message: validation.message, indicator: "red" });
                                frappe.utils.play_sound("error");
                                return;
                            }
                        }
                    }

                    const result = super.on_numpad_event($btn);

                    if (required && previousAction === currentAction && !this.prev_action) {
                        const context = this.wmn_get_numpad_supervisor_context(currentAction);
                        window.WMNPOSSupervisor.clearGrant(protectedAction, context);
                    } else if (["checkout", "remove"].includes(currentAction) && protectedMap[previousAction]) {
                        const context = this.wmn_get_numpad_supervisor_context(previousAction);
                        window.WMNPOSSupervisor.clearGrant(protectedMap[previousAction], context);
                    }

                    return result;
                },

        reset_customer_selector() {
                    if (!wmn_item_cart_is_offline()) {
                        return super.reset_customer_selector();
                    }

                    const frm = this.events && this.events.get_frm ? this.events.get_frm() : null;
                    if (frm && frm.doc) {
                        frm.doc.customer = "";
                        frm.doc.customer_name = "";
                        if (frm.dirty) frm.dirty();
                    }
                    this.customer_info = undefined;
                    this.make_customer_selector();
                    try { this.customer_field && this.customer_field.set_focus && this.customer_field.set_focus(); } catch (e) {}
                },

        make_customer_selector() {
                    if (!wmn_item_cart_is_offline()) {
                        const result = super.make_customer_selector();
                        this.$component.find(".wmn-customer-area").removeClass("has-customer");
                        this.customer_field?.$input.attr({
                            placeholder: __("Select or search customer"),
                            "aria-label": __("Customer"),
                        });
                        return result;
                    }

                    this.$customer_section.html(`<div class="customer-field"></div>`);
                    const me = this;
                    const frm = this.events && this.events.get_frm ? this.events.get_frm() : null;
                    const currentCustomer = frm && frm.doc ? (frm.doc.customer || "") : "";

                    this.customer_field = frappe.ui.form.make_control({
                        df: {
                            label: __("Customer"),
                            fieldtype: "Data",
                            placeholder: __("Select or search customer"),
                            onchange: async function () {
                                const value = String(this.value || "").trim();
                                const currentFrm = me.events && me.events.get_frm ? me.events.get_frm() : null;
                                if (currentFrm && currentFrm.doc) {
                                    currentFrm.doc.customer = value;
                                    currentFrm.doc.customer_name = value;
                                    currentFrm.dirty?.();
                                }
                                await me.fetch_customer_details(value);
                                if (me.events && me.events.customer_details_updated) {
                                    await me.events.customer_details_updated(me.customer_info);
                                }
                                me.update_customer_section();
                                me.update_totals_section();
                            },
                        },
                        parent: this.$customer_section.find(".customer-field"),
                        render_input: true,
                    });
                    this.customer_field.toggle_label(false);
                    this.customer_field?.$input.attr({
                        placeholder: __("Select or search customer"),
                        "aria-label": __("Customer"),
                    });
                    this.$component.find(".wmn-customer-area").removeClass("has-customer");
                    if (currentCustomer) this.customer_field.set_value(currentCustomer);
                    return this.customer_field;
                },

        async fetch_customer_details(customer) {
                    if (!wmn_item_cart_is_offline()) {
                        return super.fetch_customer_details(customer);
                    }

                    const frm = this.events && this.events.get_frm ? this.events.get_frm() : null;
                    const doc = frm && frm.doc ? frm.doc : {};
                    const cached = await wmn_get_cached_customer(customer);
                    const row = cached || {};

                    this.customer_info = {
                        customer: customer || doc.customer || row.name || "",
                        customer_name: row.customer_name || doc.customer_name || customer || doc.customer || "",
                        customer_group: row.customer_group || doc.customer_group || "",
                        territory: row.territory || doc.territory || "",
                        email_id: row.email_id || doc.contact_email || doc.email_id || "",
                        mobile_no: row.mobile_no || row.contact_mobile || doc.contact_mobile || doc.mobile_no || "",
                        image: row.image || "",
                        loyalty_program: row.loyalty_program || "",
                        loyalty_points: row.loyalty_points || 0,
                        conversion_factor: row.conversion_factor || 0,
                    };
                    return Promise.resolve();
                },

        async wmn_warn_if_customer_previously_purchased(customer) {
                    const pos = window.cur_pos;
                    const target = String(customer || "").trim();
                    const defaultCustomer = String(pos?.settings?.customer || "").trim();
                    if (!target || target === defaultCustomer) return false;

                    const doc = this.events?.get_frm?.()?.doc || {};
                    const warningKey = `${String(doc.name || doc.custom_offline_id || "")}::${target}`;
                    if (this.__wmn_previous_purchase_warning_key === warningKey) return false;

                    const cached = await wmn_get_cached_customer(target);
                    const purchaseCount = cint(cached?.pos_purchase_count || 0);
                    if (purchaseCount <= 0 && !cint(cached?.has_pos_purchase || 0)) return false;

                    this.__wmn_previous_purchase_warning_key = warningKey;
                    const lastDate = String(cached?.last_pos_purchase_date || "").trim();
                    const details = [
                        __("This customer has already purchased from POS."),
                        __("Please confirm that the selected customer is correct before continuing."),
                    ];
                    if (purchaseCount > 0) details.push(__("Previous POS invoices: {0}", [purchaseCount]));
                    if (lastDate) details.push(__("Last POS purchase: {0}", [lastDate]));

                    frappe.msgprint({
                        title: __("Customer Purchase Warning"),
                        indicator: "orange",
                        message: details.join("<br>"),
                    });
                    return true;
                },

        render_customer_fields() {
                    if (!wmn_item_cart_is_offline()) {
                        return super.render_customer_fields();
                    }

                    const $customer_form = this.$customer_section.find(".customer-fields-container");
                    const dfs = [
                        { fieldname: "email_id", label: __("Email"), fieldtype: "Data", options: "email", placeholder: __("Enter customer's email") },
                        { fieldname: "mobile_no", label: __("Phone Number"), fieldtype: "Data", placeholder: __("Enter customer's phone number") },
                        { fieldname: "loyalty_program", label: __("Loyalty Program"), fieldtype: "Data", placeholder: __("Loyalty Program") },
                        { fieldname: "loyalty_points", label: __("Loyalty Points"), fieldtype: "Data", read_only: 1 },
                    ];

                    dfs.forEach((df) => {
                        this[`customer_${df.fieldname}_field`] = frappe.ui.form.make_control({
                            df,
                            parent: $customer_form.find(`.${df.fieldname}-field`),
                            render_input: true,
                        });
                        const control = this[`customer_${df.fieldname}_field`];
                        control.set_value(this.customer_info && this.customer_info[df.fieldname]);
                        if (!df.read_only) {
                            control.$input?.off("blur.wmnOfflineCustomerField").on("blur.wmnOfflineCustomerField", () => {
                                this.customer_info = this.customer_info || {};
                                this.customer_info[df.fieldname] = control.get_value ? control.get_value() : control.value;
                            });
                        }
                    });
                },

        fetch_customer_transactions() {
                    if (wmn_item_cart_is_offline()) {
                        const transaction_container = this.$customer_section.find(".customer-transactions");
                        transaction_container.html(`<div class="no-transactions-placeholder">${__("Customer transactions are not loaded while offline")}</div>`);
                        return Promise.resolve([]);
                    }

                    const pos = window.cur_pos;
                    const invoiceDoctype = typeof wmn_pos_invoice_doctype === "function"
                        ? wmn_pos_invoice_doctype(pos)
                        : (pos?.frm?.doc?.doctype || "POS Invoice");

                    if (invoiceDoctype !== "Sales Invoice" || !this.customer_info?.customer) {
                        return super.fetch_customer_transactions();
                    }

                    return frappe.db.get_list("Sales Invoice", {
                        filters: {
                            customer: this.customer_info.customer,
                            docstatus: 1,
                            is_pos: 1,
                        },
                        fields: ["name", "grand_total", "status", "posting_date", "posting_time", "currency"],
                        limit: 20,
                    }).then((res) => {
                        const transaction_container = this.$customer_section.find(".customer-transactions");

                        if (!res.length) {
                            transaction_container.html(`<div class="no-transactions-placeholder">${__("No recent transactions found")}</div>`);
                            return res;
                        }

                        const elapsedTime = moment(`${res[0].posting_date} ${res[0].posting_time}`).fromNow();
                        this.$customer_section.find(".customer-desc").html(__("Last transacted {0}", [elapsedTime]));
                        transaction_container.html("");

                        const indicatorColor = {
                            Paid: "green",
                            Unpaid: "orange",
                            "Partly Paid": "orange",
                            Overdue: "red",
                            Draft: "red",
                            Return: "gray",
                            Consolidated: "blue",
                        };

                        res.forEach((invoice) => {
                            const postingDatetime = moment(`${invoice.posting_date} ${invoice.posting_time}`).format("Do MMMM, h:mma");
                            transaction_container.append(
                                `<div class="invoice-wrapper" data-invoice-name="${escape(invoice.name)}">
                                    <div class="invoice-name-date">
                                        <div class="invoice-name">${frappe.utils.escape_html(invoice.name)}</div>
                                        <div class="invoice-date">${frappe.utils.escape_html(postingDatetime)}</div>
                                    </div>
                                    <div class="invoice-total-status">
                                        <div class="invoice-total">
                                            ${format_currency(invoice.grand_total, invoice.currency, 0) || 0}
                                        </div>
                                        <div class="invoice-status">
                                            <span class="indicator-pill whitespace-nowrap ${indicatorColor[invoice.status] || "gray"}">
                                                <span>${frappe.utils.escape_html(invoice.status || "")}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div class="seperator"></div>`
                            );
                        });

                        return res;
                    });
                },

        async wmn_apply_transaction_discount(value) {
                    const frm = this.events?.get_frm?.();
                    if (!frm?.doc) return false;

                    const newValue = flt(value || 0);
                    const requestKey = `${String(frm.doc.name || frm.doc.custom_offline_id || "")}::${newValue}`;
                    if (
                        this.__wmn_transaction_discount_request &&
                        this.__wmn_transaction_discount_request_key === requestKey
                    ) {
                        return await this.__wmn_transaction_discount_request;
                    }

                    const request = (async () => {
                        const oldValue = flt(frm.doc.additional_discount_percentage || 0);
                        if (newValue < 0 || newValue > 100) {
                            frappe.show_alert({ message: __("Discount must be between 0 and 100%."), indicator: "red" });
                            return false;
                        }

                        if (Math.abs(newValue - oldValue) <= 0.000001) {
                            this.hide_discount_control(newValue);
                            return true;
                        }

                        const pos = window.cur_pos;
                        const action = window.WMNPOSSupervisor?.ACTIONS?.TRANSACTION_DISCOUNT || "TRANSACTION_DISCOUNT";
                        const approval = pos?.wmn_authorize_pos_action
                            ? await pos.wmn_authorize_pos_action(action, {
                                doc: frm.doc,
                                before_value: oldValue,
                                after_value: newValue,
                            })
                            : { approved: true };

                        if (!approval?.approved) return false;

                        // Manual additional discount owns the invoice-level discount fields.
                        // Remove an active WMN coupon without triggering an intermediate
                        // promotion/totals refresh; one commercial refresh runs after the
                        // manual value is committed.
                        if (newValue > 0.000001 && frm.doc.__wmn_pos_coupon_rule && pos?.wmn_remove_coupon) {
                            await pos.wmn_remove_coupon({ silent: true, defer_refresh: true });
                        }

                        if (wmn_item_cart_is_offline()) {
                            frm.doc.additional_discount_percentage = newValue;
                            frm.dirty?.();
                        } else {
                            await wmn_pos_set_value(
                                frm.doc.doctype,
                                frm.doc.name,
                                "additional_discount_percentage",
                                newValue
                            );
                        }

                        await pos?.wmn_refresh_commercial_state_after_cart_change?.({ silent: true });
                        this.update_totals_section(frm);
                        this.wmn_refresh_discount_breakdown?.(frm.doc);
                        this.hide_discount_control(newValue);
                        return true;
                    })();

                    this.__wmn_transaction_discount_request_key = requestKey;
                    this.__wmn_transaction_discount_request = request;
                    try {
                        return await request;
                    } finally {
                        if (this.__wmn_transaction_discount_request === request) {
                            this.__wmn_transaction_discount_request = null;
                            this.__wmn_transaction_discount_request_key = "";
                        }
                    }
                },

        show_discount_control() {
                    if (!wmn_item_cart_is_offline()) {
                        const result = super.show_discount_control();
                        if (this.discount_field) {
                            const me = this;
                            this.discount_field.df.onchange = async function () {
                                const oldValue = flt(me.events.get_frm().doc.additional_discount_percentage || 0);
                                const newValue = flt(this.value || 0);
                                const applied = await me.wmn_apply_transaction_discount(newValue);
                                if (!applied) {
                                    if (this.set_input) this.set_input(oldValue);
                                    else this.$input?.val(oldValue);
                                }
                            };
                            this.discount_field.refresh();
                            this.discount_field.set_focus();
                        }
                        return result;
                    }

                    const frm = this.events?.get_frm?.();
                    if (!frm?.doc) return;

                    const discount = frm.doc.additional_discount_percentage || 0;
                    this.$add_discount_elem.css("display", "none");
                    this.$discount_control = this.$discount_control || $("<div class='discount-control'></div>").appendTo(this.$totals_section);
                    this.$discount_control.empty();

                    this.discount_field = frappe.ui.form.make_control({
                        df: {
                            label: __("Discount (%)"),
                            fieldtype: "Float",
                            onchange: async () => {
                                const oldValue = flt(frm.doc.additional_discount_percentage || 0);
                                const value = flt(this.discount_field.get_value?.() ?? this.discount_field.value ?? 0);
                                const applied = await this.wmn_apply_transaction_discount(value);
                                if (!applied && this.discount_field) {
                                    if (this.discount_field.set_input) this.discount_field.set_input(oldValue);
                                    else this.discount_field.$input?.val(oldValue);
                                }
                            },
                        },
                        parent: this.$discount_control,
                        render_input: true,
                    });
                    this.discount_field.set_value(discount);
                },

        get_item_from_frm(item) {
                    if (!wmn_item_cart_is_offline()) {
                        return super.get_item_from_frm(item);
                    }

                    const frm = this.events?.get_frm?.();
                    const rows = frm?.doc && Array.isArray(frm.doc.items) ? frm.doc.items : [];
                    return wmn_find_offline_cart_row(rows, item);
                },

        load_invoice() {
                    if (!wmn_item_cart_is_offline()) {
                        return super.load_invoice();
                    }

                    const frm = this.events.get_frm();
                    this.attach_refresh_field_event(frm);

                    return this.fetch_customer_details(frm.doc.customer).then(() => {
                        this.events.customer_details_updated(this.customer_info);
                        this.update_customer_section();

                        this.$cart_items_wrapper.html("");
                        if (frm.doc.items && frm.doc.items.length) {
                            frm.doc.items.forEach((item) => this.update_item_html(item));
                        } else {
                            this.make_no_items_placeholder();
                            this.highlight_checkout_btn(false);
                        }

                        this.hide_discount_control(frm.doc.additional_discount_percentage);
                        this.update_totals_section(frm);

                        if (frm.doc.docstatus === 1) {
                            this.$totals_section.find(".checkout-btn").css("display", "none");
                            this.$totals_section.find(".edit-cart-btn").css("display", "none");
                        } else {
                            this.$totals_section.find(".checkout-btn").css("display", "flex");
                            this.$totals_section.find(".edit-cart-btn").css("display", "none");
                        }

                        this.toggle_component(true);
                    });
                }
    };

    const UIMethods = {
        __proto__: CoreMethods,

        prepare_dom() {
                        this.wrapper.append(
                            `<section class="customer-cart-container wmn-order-sidebar">
                                <div class="wmn-order-panel">
                                    <div class="wmn-customer-area">
                                        <div class="wmn-customer-title-row">
                                            <div class="wmn-customer-title">${icon("user", 19)}<span>${__("Customer")}</span></div>
                                            <span class="wmn-customer-hint">${__("Select or change customer")}</span>
                                    <div class="wmn-cart-quick-actions">
                                        <button type="button" class="btn btn-xs btn-default wmn-clear-cart-btn" title="${escape_html(__("Clear Cart"))}" aria-label="${escape_html(__("Clear Cart"))}">
                                            ${icon("trash", 15)}<span>${__("Clear")}</span>
                                        </button>
                                    </div>
                                        </div>
                                        <div class="customer-section"></div>
                                    </div>
                                    <div class="wmn-order-divider"></div>
                                    <div class="wmn-cart-slot"></div>
                                </div>
                            </section>`
                        );

                        this.$component = this.wrapper.find(".wmn-order-sidebar").last();
                    },

        init_customer_selector() {
                        this.$customer_section = this.$component.find(".customer-section");
                        this.make_customer_selector();
                    },


        wmn_mount_promotion_control() {
                        if (!this.$totals_section || !this.$totals_section.length) return;
                        this.$totals_section.find(".wmn-promotion-control").remove();
                        this.$promotion_control = $(
                            `<div class="wmn-promotion-control" hidden>
                                <div class="wmn-promotion-copy">
                                    <span class="wmn-promotion-label">${__("Promotions")}</span>
                                    <small class="wmn-promotion-names"></small>
                                </div>
                                <strong class="wmn-promotion-value"></strong>
                            </div>`
                        );

                        const $discount = this.$totals_section.find(".add-discount-wrapper").first();
                        if ($discount.length) {
                            this.$promotion_control.insertAfter($discount);
                        } else {
                            this.$promotion_control.prependTo(this.$totals_section);
                        }

                        this.wmn_refresh_promotion_control(this.events.get_frm()?.doc || {});
                    },

        wmn_refresh_promotion_control(doc) {
                    doc = doc || {};
                    if (this.$promotion_control?.length) {
                        const promotions = Array.isArray(doc.__wmn_pos_promotions) ? doc.__wmn_pos_promotions : [];
                        const amount = Math.max(0, flt(doc.__wmn_promotion_discount_total || 0));
                        const currency = doc.currency || "";
                        const active = promotions.length > 0 && amount > 0;
                        const names = promotions
                            .map((row) => row.promotion_name || row.promotion_code || "")
                            .filter(Boolean)
                            .join(" · " );

                        this.$promotion_control.prop("hidden", !active);
                        this.$promotion_control.find(".wmn-promotion-names").text(names);
                        this.$promotion_control.find(".wmn-promotion-value").text(active ? `-${format_currency(amount, currency)}` : "");
                    }
                    this.wmn_refresh_compact_cart_footer?.(doc);
                },

        wmn_mount_coupon_control() {
                        if (!this.$totals_section || !this.$totals_section.length) return;
                        this.$totals_section.find(".wmn-coupon-control").remove();
                        this.$coupon_control = $(
                            `<div class="wmn-coupon-control">
                                <button type="button" class="wmn-coupon-btn">
                                    <span class="wmn-coupon-btn-label">${__("Coupon")}</span>
                                    <span class="wmn-coupon-btn-value"></span>
                                </button>
                                <button type="button" class="wmn-coupon-remove" title="${escape_html(__("Remove Coupon"))}" hidden>×</button>
                            </div>`
                        );

                        const $discount = this.$totals_section.find(".add-discount-wrapper").first();
                        if ($discount.length) {
                            this.$coupon_control.insertAfter($discount);
                        } else {
                            this.$coupon_control.prependTo(this.$totals_section);
                        }

                        this.$coupon_control.on("click.wmnCoupon", ".wmn-coupon-btn", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            window.cur_pos?.wmn_open_coupon_dialog?.();
                        });

                        this.$coupon_control.on("click.wmnCoupon", ".wmn-coupon-remove", async (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            await window.cur_pos?.wmn_remove_coupon?.();
                        });

                        this.wmn_refresh_coupon_control(this.events.get_frm()?.doc || {});
                    },

        wmn_refresh_coupon_control(doc) {
                    doc = doc || {};
                    if (this.$coupon_control?.length) {
                        const rule = doc.__wmn_pos_coupon_rule || null;
                        const code = String((rule && rule.coupon_code) || doc.__wmn_coupon_code || "").trim();
                        const amount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
                        const currency = doc.currency || "";
                        const active = Boolean(code);

                        this.$coupon_control.toggleClass("is-active", active);
                        this.$coupon_control.find(".wmn-coupon-btn-label").text(active ? code : __("Coupon"));
                        this.$coupon_control.find(".wmn-coupon-btn-value").text(active ? `-${format_currency(Math.abs(amount), currency)}` : "");
                        this.$coupon_control.find(".wmn-coupon-remove").prop("hidden", !active);
                    }
                    this.wmn_refresh_compact_cart_footer?.(doc);
                },

        wmn_set_checkout_commercial_busy(busy) {
                    const $button = this.$component?.find?.(".checkout-btn").first();
                    if (!$button?.length) return;

                    if (busy) {
                        if (!$button.data("wmn-commercial-busy")) {
                            $button.data("wmn-commercial-busy", 1);
                            $button.data("wmn-commercial-was-disabled", $button.prop("disabled") ? 1 : 0);
                        }
                        $button.prop("disabled", true).attr("aria-busy", "true");
                        $button.text(__("Updating total..."));
                        return;
                    }

                    if (!$button.data("wmn-commercial-busy")) return;
                    const wasDisabled = cint($button.data("wmn-commercial-was-disabled") || 0) === 1;
                    $button.removeData("wmn-commercial-busy");
                    $button.removeData("wmn-commercial-was-disabled");
                    $button.removeAttr("aria-busy").prop("disabled", wasDisabled);

                    const doc = this.events?.get_frm?.()?.doc || {};
                    const finalTotal = flt(doc.rounded_total || doc.grand_total || 0);
                    this.render_grand_total(finalTotal);
                },

        wmn_mount_discount_breakdown() {
                    if (!this.$totals_section?.length) return;
                    this.$totals_section.find(".wmn-pos-discount-breakdown").remove();
                    this.$discount_breakdown = $('<div class="wmn-pos-discount-breakdown"></div>');

                    if (this.$coupon_control?.length) {
                        this.$discount_breakdown.insertAfter(this.$coupon_control);
                    } else {
                        this.$discount_breakdown.prependTo(this.$totals_section);
                    }
                    this.wmn_refresh_discount_breakdown(this.events.get_frm()?.doc || {});
                },

        wmn_refresh_discount_breakdown(doc) {
                    if (!this.$discount_breakdown?.length) return;
                    doc = doc || {};
                    const currency = doc.currency || "";
                    const promotionAmount = Math.max(0, flt(doc.__wmn_promotion_discount_total || 0));
                    const couponAmount = Math.max(0, flt(doc.__wmn_coupon_discount_total || 0));
                    const isReturn = cint(doc.is_return || 0) === 1;
                    const manualPercent = Math.max(0, Math.abs(flt(doc.additional_discount_percentage || 0)));
                    const manualAmount = isReturn
                        ? Math.abs(flt(doc.discount_amount || 0))
                        : (manualPercent > 0.000001 ? Math.max(0, flt(doc.discount_amount || 0)) : 0);
                    const couponCode = String(doc.__wmn_coupon_code || "").trim();
                    const totalDiscount = promotionAmount + couponAmount + manualAmount;

                    const rows = [];
                    if (promotionAmount > 0.000001) {
                        rows.push(`<div class="wmn-pos-discount-row"><span>${__("Promotions")}</span><strong>-${format_currency(promotionAmount, currency)}</strong></div>`);
                    }
                    if (couponAmount > 0.000001 || couponCode) {
                        rows.push(`<div class="wmn-pos-discount-row"><span>${__("Coupon")}${couponCode ? ` · ${escape_html(couponCode)}` : ""}</span><strong>${couponAmount > 0.000001 ? `-${format_currency(couponAmount, currency)}` : format_currency(0, currency)}</strong></div>`);
                    }
                    if (manualAmount > 0.000001 || manualPercent > 0.000001) {
                        rows.push(`<div class="wmn-pos-discount-row"><span>${__("Manual Discount")}${manualPercent > 0.000001 ? ` · ${manualPercent}%` : ""}</span><strong>${manualAmount > 0.000001 ? `-${format_currency(manualAmount, currency)}` : format_currency(0, currency)}</strong></div>`);
                    }
                    if (rows.length && totalDiscount > 0.000001) {
                        rows.push(`<div class="wmn-pos-discount-row is-total"><span>${__("Total Discount")}</span><strong>-${format_currency(totalDiscount, currency)}</strong></div>`);
                    }

                    this.$discount_breakdown.html(rows.join(""));
                    this.$discount_breakdown.prop("hidden", rows.length === 0);
                },

        wmn_mount_compact_cart_footer() {
                    if (!this.$totals_section?.length) return;

                    this.$totals_section.find(".wmn-cart-compact-actions").remove();
                    this.$compact_cart_actions = $(
                        `<div class="wmn-cart-compact-actions">
                            <button type="button" class="btn btn-default btn-sm wmn-compact-discount-btn">${__("Add Discount")}</button>
                            <button type="button" class="btn btn-default btn-sm wmn-compact-coupon-btn">${__("Coupon")}</button>
                            <button type="button" class="btn btn-default btn-sm wmn-compact-details-btn" aria-haspopup="dialog">${__("Details")}</button>
                        </div>`
                    );

                    const $checkout = this.$totals_section.find(".checkout-btn").first().detach();
                    const $editCart = this.$totals_section.find(".edit-cart-btn").first().detach();

                    this.$totals_section.children().addClass("wmn-cart-native-summary-hidden");
                    this.$compact_cart_actions.appendTo(this.$totals_section);
                    if ($checkout.length) $checkout.removeClass("wmn-cart-native-summary-hidden").appendTo(this.$totals_section);
                    if ($editCart.length) $editCart.removeClass("wmn-cart-native-summary-hidden").appendTo(this.$totals_section);

                    this.wmn_refresh_compact_cart_footer(this.events?.get_frm?.()?.doc || {});
                },

        wmn_refresh_compact_cart_footer(doc) {
                    if (!this.$compact_cart_actions?.length) return;
                    const summary = wmn_cart_summary_data(doc || {});
                    const $discount = this.$compact_cart_actions.find(".wmn-compact-discount-btn");
                    const $coupon = this.$compact_cart_actions.find(".wmn-compact-coupon-btn");
                    const $details = this.$compact_cart_actions.find(".wmn-compact-details-btn");

                    $discount.toggleClass("is-active", summary.manual_percent > 0.000001 || summary.manual_amount > 0.000001);
                    $coupon.toggleClass("is-active", Boolean(summary.coupon_code));

                    $discount.attr(
                        "title",
                        summary.manual_percent > 0.000001
                            ? `${__("Manual Discount")}: ${summary.manual_percent}%`
                            : (summary.manual_amount > 0.000001
                                ? `${__("Manual Discount")}: ${format_currency(summary.manual_amount, summary.currency)}`
                                : __("Add Discount"))
                    );
                    $coupon.attr(
                        "title",
                        summary.coupon_code
                            ? `${__("Coupon")}: ${summary.coupon_code}`
                            : __("Coupon")
                    );
                    $details.attr("aria-label", __("Invoice Details"));
                },

        async wmn_open_transaction_discount_dialog() {
                    const frm = this.events?.get_frm?.();
                    if (!frm?.doc) return;

                    const currentValue = flt(frm.doc.additional_discount_percentage || 0);
                    const dialog = new frappe.ui.Dialog({
                        title: __("Add Discount"),
                        fields: [
                            {
                                fieldname: "discount_percentage",
                                fieldtype: "Float",
                                label: __("Discount (%)"),
                                default: currentValue,
                                description: __("Enter 0 to remove the manual discount."),
                            },
                        ],
                        primary_action_label: __("Apply"),
                        primary_action: async (values) => {
                            const applied = await this.wmn_apply_transaction_discount(values.discount_percentage);
                            if (!applied) return;
                            dialog.hide();
                            this.wmn_refresh_compact_cart_footer(frm.doc);
                        },
                    });
                    dialog.show();
                },

        wmn_build_cart_details_html(doc, compact) {
                    const summary = wmn_cart_summary_data(doc || {});
                    const money = (value) => format_currency(value, summary.currency);
                    const rows = [];

                    rows.push(wmn_summary_row(__("Subtotal"), money(summary.subtotal)));

                    if (summary.promotion_amount > 0.000001) {
                        const promotionNames = summary.promotions
                            .map((row) => row.promotion_name || row.promotion_code || "")
                            .filter(Boolean)
                            .join(" · ");
                        const label = promotionNames ? `${__("Promotions")} · ${promotionNames}` : __("Promotions");
                        rows.push(wmn_summary_row(label, `-${money(summary.promotion_amount)}`, "is-discount"));
                    }

                    if (summary.coupon_code || summary.coupon_amount > 0.000001) {
                        const label = summary.coupon_code ? `${__("Coupon")} · ${summary.coupon_code}` : __("Coupon");
                        rows.push(wmn_summary_row(label, summary.coupon_amount > 0.000001 ? `-${money(summary.coupon_amount)}` : money(0), "is-discount"));
                    }

                    if (summary.manual_percent > 0.000001 || summary.manual_amount > 0.000001) {
                        const label = summary.manual_percent > 0.000001
                            ? `${__("Manual Discount")} · ${summary.manual_percent}%`
                            : __("Manual Discount");
                        rows.push(wmn_summary_row(label, summary.manual_amount > 0.000001 ? `-${money(summary.manual_amount)}` : money(0), "is-discount"));
                    }

                    if (!compact && summary.total_discount > 0.000001) {
                        rows.push(wmn_summary_row(__("Total Discount"), `-${money(summary.total_discount)}`, "is-total-discount"));
                    }

                    if (!compact && summary.taxes.length) {
                        rows.push(`<div class="wmn-cart-summary-section-title">${escape_html(__("Taxes"))}</div>`);
                        summary.taxes.forEach((tax) => {
                            const label = tax.rate ? `${tax.label} · ${tax.rate}%` : tax.label;
                            rows.push(wmn_summary_row(label, money(tax.amount), "is-tax"));
                        });
                    }

                    rows.push(wmn_summary_row(__("Total Taxes"), money(summary.total_taxes), "is-tax-total"));

                    if (!compact && Math.abs(summary.rounding_adjustment) > 0.000001) {
                        rows.push(wmn_summary_row(__("Rounding Adjustment"), money(summary.rounding_adjustment)));
                    }

                    if (!compact) {
                        rows.push(wmn_summary_row(__("Grand Total"), money(summary.grand_total), "is-grand-total"));
                    }
                    rows.push(wmn_summary_row(__("Payable Total"), money(summary.payable_total), "is-payable-total"));

                    const meta = compact
                        ? ""
                        : `<div class="wmn-cart-summary-meta">
                            <span>${escape_html(__("Items"))}: <strong>${summary.item_count}</strong></span>
                            <span>${escape_html(__("Total Qty"))}: <strong>${summary.total_qty}</strong></span>
                        </div>`;

                    return `${meta}<div class="wmn-cart-summary-rows">${rows.join("")}</div>`;
                },

        wmn_open_cart_details_dialog() {
                    const doc = this.events?.get_frm?.()?.doc || {};
                    const html = this.wmn_build_cart_details_html(doc, false);

                    if (!this.__wmn_cart_details_dialog) {
                        this.__wmn_cart_details_dialog = new frappe.ui.Dialog({
                            title: __("Invoice Details"),
                            fields: [{ fieldname: "summary", fieldtype: "HTML" }],
                        });
                        this.__wmn_cart_details_dialog.$wrapper.addClass("wmn-cart-details-dialog");
                    }

                    this.__wmn_cart_details_dialog.fields_dict.summary.$wrapper.html(
                        `<div class="wmn-cart-details-content">${html}</div>`
                    );
                    this.__wmn_cart_details_dialog.show();
                },

        wmn_show_cart_details_hint(anchor) {
                    if (!anchor) return;
                    const doc = this.events?.get_frm?.()?.doc || {};
                    const html = this.wmn_build_cart_details_html(doc, true);

                    if (!this.__wmn_cart_details_hint?.length) {
                        this.__wmn_cart_details_hint = $('<div class="wmn-cart-details-hint" role="tooltip" hidden></div>').appendTo(document.body);
                    }

                    const $hint = this.__wmn_cart_details_hint;
                    $hint.html(html).prop("hidden", false);

                    const rect = anchor.getBoundingClientRect();
                    const hintWidth = Math.min(320, Math.max(240, $hint.outerWidth() || 280));
                    let left = rect.left + (rect.width / 2) - (hintWidth / 2);
                    left = Math.max(8, Math.min(left, window.innerWidth - hintWidth - 8));

                    const hintHeight = $hint.outerHeight() || 160;
                    let top = rect.top - hintHeight - 8;
                    if (top < 8) top = Math.min(window.innerHeight - hintHeight - 8, rect.bottom + 8);

                    $hint.css({ left: `${left}px`, top: `${Math.max(8, top)}px`, width: `${hintWidth}px` });
                },

        wmn_hide_cart_details_hint() {
                    this.__wmn_cart_details_hint?.prop("hidden", true);
                },

        init_cart_components() {
                        this.$component.find(".wmn-cart-slot").append(
                            `<div class="cart-container">
                                <div class="abs-cart-container">
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
                        this.wmn_mount_compact_cart_footer();
                        this.make_cart_items_section();
                        this.make_cart_numpad();
                    },

        bind_events() {
                        super.bind_events();
                        this.$component
                            .off("click.wmnMamsekCustomer", ".wmn-change-customer-btn")
                            .on("click.wmnMamsekCustomer", ".wmn-change-customer-btn", (event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                this.reset_customer_selector();
                            });

                    this.$component
                        .off("click.wmnClearCart", ".wmn-clear-cart-btn")
                        .on("click.wmnClearCart", ".wmn-clear-cart-btn", (event) => {
                            event.preventDefault();
                            event.stopPropagation();

                            const frm = this.events?.get_frm?.();
                            if (!frm?.doc?.items?.length) return;

                            frappe.confirm(
                                __("Clear all items from the current cart?"),
                                () => {
                                    Promise.resolve(this.events?.clear_cart?.()).catch((error) => {
                                        console.error("WMN clear cart failed", error);
                                        frappe.show_alert({ message: error?.message || __("Unable to clear the cart."), indicator: "red" });
                                    });
                                }
                            );
                        });

                    this.$component
                        .off("click.wmnCompactDiscount", ".wmn-compact-discount-btn")
                        .on("click.wmnCompactDiscount", ".wmn-compact-discount-btn", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            this.wmn_open_transaction_discount_dialog();
                        });

                    this.$component
                        .off("click.wmnCompactCoupon", ".wmn-compact-coupon-btn")
                        .on("click.wmnCompactCoupon", ".wmn-compact-coupon-btn", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            window.cur_pos?.wmn_open_coupon_dialog?.();
                        });

                    this.$component
                        .off("click.wmnCartDetails", ".wmn-compact-details-btn")
                        .on("click.wmnCartDetails", ".wmn-compact-details-btn", (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            this.wmn_hide_cart_details_hint();
                            this.wmn_open_cart_details_dialog();
                        })
                        .off("mouseenter.wmnCartDetailsHint focusin.wmnCartDetailsHint", ".wmn-compact-details-btn")
                        .on("mouseenter.wmnCartDetailsHint focusin.wmnCartDetailsHint", ".wmn-compact-details-btn", (event) => {
                            this.wmn_show_cart_details_hint(event.currentTarget);
                        })
                        .off("mouseleave.wmnCartDetailsHint focusout.wmnCartDetailsHint", ".wmn-compact-details-btn")
                        .on("mouseleave.wmnCartDetailsHint focusout.wmnCartDetailsHint", ".wmn-compact-details-btn", () => {
                            this.wmn_hide_cart_details_hint();
                        });

                    $(window)
                        .off("scroll.wmnCartDetailsHint resize.wmnCartDetailsHint")
                        .on("scroll.wmnCartDetailsHint resize.wmnCartDetailsHint", () => this.wmn_hide_cart_details_hint());
                    },

        disable_customer_selection() {
                        super.disable_customer_selection();
                        this.$component.find(".wmn-change-customer-btn").prop("disabled", true);
                    },

        enable_customer_selection() {
                        super.enable_customer_selection();
                        this.$component.find(".wmn-change-customer-btn").prop("disabled", false);
                    },

        update_customer_section() {
                        super.update_customer_section();
                        const has_customer = Boolean(this.customer_info && this.customer_info.customer);
                        this.$component.find(".wmn-customer-area").toggleClass("has-customer", has_customer);

                        if (has_customer) {
                            this.$customer_section.find(".customer-details").append(
                                `<button type="button" class="wmn-change-customer-btn">${__("Change Customer")}</button>`
                            );
                        }
                    },

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
                        const hasPromotionDiscount = flt(item_data.__wmn_promotion_discount_amount || 0) > 0;
                        const oldRateValue = hasPromotionDiscount
                            ? flt(item_data.__wmn_promotion_base_rate || item_data.price_list_rate || 0)
                            : flt(item_data.price_list_rate || 0);
                        const old_rate = (item_data.discount_percentage || hasPromotionDiscount) && oldRateValue > flt(item_data.rate || 0)
                            ? `<span class="wmn-cart-old-rate">${format_currency(oldRateValue, currency)}</span>`
                            : "";

                        $item_to_update.html(
                            `${image}
                            <div class="wmn-cart-item-copy">
                                <div class="item-name">${safe_name}</div>
                                <div class="wmn-cart-item-price">${format_currency(amount, currency)} ${old_rate}</div>
                            </div>
                            <div class="wmn-cart-qty">${flt(item_data.qty)}X</div>`
                        );
                    },

        handle_broken_image($img) {
                        const item_abbr = escape_html($($img).attr("alt"));
                        $($img).parent().replaceWith(`<div class="item-image item-abbr">${item_abbr}</div>`);
                    },

        toggle_numpad(show) {
                        if (this.$totals_section) {
                            this.$totals_section.css("display", "flex");
                        }
                        if (this.$numpad_section) {
                            this.$numpad_section.css("display", show ? "flex" : "none");
                        }
                        if (typeof this.reset_numpad === "function") {
                            this.reset_numpad();
                        }
                    },

        render_net_total(value) {
                        super.render_net_total(value);
                        this.$totals_section
                            .find(".net-total-container > div:first-child")
                            .text(__("Subtotal"));
                    },

        render_grand_total(value) {
                        super.render_grand_total(value);
                        const doc = this.events.get_frm().doc;
                        const currency = doc.currency;
                        const pay_label = `${__("Pay")} ${format_currency(value, currency)}`;
                        this.$component.find(".checkout-btn").text(pay_label);
                        this.wmn_refresh_promotion_control(doc);
                        this.wmn_refresh_coupon_control(doc);
                            this.wmn_refresh_discount_breakdown(doc);
                        this.wmn_refresh_compact_cart_footer(doc);
                    }
    };

    const FinalMethods = Object.create(null);
    FinalMethods.wmn_get_numpad_supervisor_context = UIMethods.wmn_get_numpad_supervisor_context || CoreMethods.wmn_get_numpad_supervisor_context;
    FinalMethods.on_numpad_event = UIMethods.on_numpad_event || CoreMethods.on_numpad_event;
    FinalMethods.reset_customer_selector = UIMethods.reset_customer_selector || CoreMethods.reset_customer_selector;
    FinalMethods.make_customer_selector = UIMethods.make_customer_selector || CoreMethods.make_customer_selector;
    FinalMethods.fetch_customer_details = UIMethods.fetch_customer_details || CoreMethods.fetch_customer_details;
    FinalMethods.wmn_warn_if_customer_previously_purchased = UIMethods.wmn_warn_if_customer_previously_purchased || CoreMethods.wmn_warn_if_customer_previously_purchased;
    FinalMethods.render_customer_fields = UIMethods.render_customer_fields || CoreMethods.render_customer_fields;
    FinalMethods.fetch_customer_transactions = UIMethods.fetch_customer_transactions || CoreMethods.fetch_customer_transactions;
    FinalMethods.wmn_apply_transaction_discount = UIMethods.wmn_apply_transaction_discount || CoreMethods.wmn_apply_transaction_discount;
    FinalMethods.show_discount_control = UIMethods.show_discount_control || CoreMethods.show_discount_control;
    FinalMethods.load_invoice = UIMethods.load_invoice || CoreMethods.load_invoice;
    FinalMethods.prepare_dom = UIMethods.prepare_dom || CoreMethods.prepare_dom;
    FinalMethods.init_customer_selector = UIMethods.init_customer_selector || CoreMethods.init_customer_selector;
    FinalMethods.wmn_mount_promotion_control = UIMethods.wmn_mount_promotion_control || CoreMethods.wmn_mount_promotion_control;
    FinalMethods.wmn_refresh_promotion_control = UIMethods.wmn_refresh_promotion_control || CoreMethods.wmn_refresh_promotion_control;
    FinalMethods.wmn_mount_coupon_control = UIMethods.wmn_mount_coupon_control || CoreMethods.wmn_mount_coupon_control;
    FinalMethods.wmn_refresh_coupon_control = UIMethods.wmn_refresh_coupon_control || CoreMethods.wmn_refresh_coupon_control;
    FinalMethods.wmn_set_checkout_commercial_busy = UIMethods.wmn_set_checkout_commercial_busy || CoreMethods.wmn_set_checkout_commercial_busy;
    FinalMethods.wmn_mount_discount_breakdown = UIMethods.wmn_mount_discount_breakdown || CoreMethods.wmn_mount_discount_breakdown;
    FinalMethods.wmn_refresh_discount_breakdown = UIMethods.wmn_refresh_discount_breakdown || CoreMethods.wmn_refresh_discount_breakdown;
    FinalMethods.wmn_mount_compact_cart_footer = UIMethods.wmn_mount_compact_cart_footer || CoreMethods.wmn_mount_compact_cart_footer;
    FinalMethods.wmn_refresh_compact_cart_footer = UIMethods.wmn_refresh_compact_cart_footer || CoreMethods.wmn_refresh_compact_cart_footer;
    FinalMethods.wmn_open_transaction_discount_dialog = UIMethods.wmn_open_transaction_discount_dialog || CoreMethods.wmn_open_transaction_discount_dialog;
    FinalMethods.wmn_build_cart_details_html = UIMethods.wmn_build_cart_details_html || CoreMethods.wmn_build_cart_details_html;
    FinalMethods.wmn_open_cart_details_dialog = UIMethods.wmn_open_cart_details_dialog || CoreMethods.wmn_open_cart_details_dialog;
    FinalMethods.wmn_show_cart_details_hint = UIMethods.wmn_show_cart_details_hint || CoreMethods.wmn_show_cart_details_hint;
    FinalMethods.wmn_hide_cart_details_hint = UIMethods.wmn_hide_cart_details_hint || CoreMethods.wmn_hide_cart_details_hint;
    FinalMethods.init_cart_components = UIMethods.init_cart_components || CoreMethods.init_cart_components;
    FinalMethods.bind_events = UIMethods.bind_events || CoreMethods.bind_events;
    FinalMethods.disable_customer_selection = UIMethods.disable_customer_selection || CoreMethods.disable_customer_selection;
    FinalMethods.enable_customer_selection = UIMethods.enable_customer_selection || CoreMethods.enable_customer_selection;
    FinalMethods.update_customer_section = UIMethods.update_customer_section || CoreMethods.update_customer_section;
    FinalMethods.get_item_from_frm = UIMethods.get_item_from_frm || CoreMethods.get_item_from_frm;
    FinalMethods.render_cart_item = UIMethods.render_cart_item || CoreMethods.render_cart_item;
    FinalMethods.handle_broken_image = UIMethods.handle_broken_image || CoreMethods.handle_broken_image;
    FinalMethods.toggle_numpad = UIMethods.toggle_numpad || CoreMethods.toggle_numpad;
    FinalMethods.render_net_total = UIMethods.render_net_total || CoreMethods.render_net_total;
    FinalMethods.render_grand_total = UIMethods.render_grand_total || CoreMethods.render_grand_total;

    const initializeCore = function (args) {


                    if (window.WMNPOSSupervisor) {
                        if (window.WMNPOSSupervisor.isActionRequired(window.WMNPOSSupervisor.ACTIONS.CHANGE_RATE)) {
                            this.allow_rate_change = true;
                        }
                        if (window.WMNPOSSupervisor.isActionRequired(window.WMNPOSSupervisor.ACTIONS.ITEM_DISCOUNT)) {
                            this.allow_discount_change = true;
                        }
                    }

    };
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.ClassMethods.ItemCart = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_item_cart_methods.js */


/* BEGIN wmn_item_cart_class.js */
/* Single production WMN POS ItemCart class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.ItemCart;
    const methods = ns.ClassMethods.ItemCart;

    class WMNItemCartClass {
        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNItemCartClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        wmn_get_numpad_supervisor_context(...args) {
            return methods.FinalMethods.wmn_get_numpad_supervisor_context.apply(this, args);
        }

        on_numpad_event(...args) {
            return methods.FinalMethods.on_numpad_event.apply(this, args);
        }

        reset_customer_selector(...args) {
            return methods.FinalMethods.reset_customer_selector.apply(this, args);
        }

        make_customer_selector(...args) {
            return methods.FinalMethods.make_customer_selector.apply(this, args);
        }

        fetch_customer_details(...args) {
            return methods.FinalMethods.fetch_customer_details.apply(this, args);
        }

        wmn_warn_if_customer_previously_purchased(...args) {
            return methods.FinalMethods.wmn_warn_if_customer_previously_purchased.apply(this, args);
        }

        render_customer_fields(...args) {
            return methods.FinalMethods.render_customer_fields.apply(this, args);
        }

        fetch_customer_transactions(...args) {
            return methods.FinalMethods.fetch_customer_transactions.apply(this, args);
        }

        wmn_apply_transaction_discount(...args) {
            return methods.FinalMethods.wmn_apply_transaction_discount.apply(this, args);
        }

        show_discount_control(...args) {
            return methods.FinalMethods.show_discount_control.apply(this, args);
        }

        load_invoice(...args) {
            return methods.FinalMethods.load_invoice.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        init_customer_selector(...args) {
            return methods.FinalMethods.init_customer_selector.apply(this, args);
        }

        wmn_mount_promotion_control(...args) {
            return methods.FinalMethods.wmn_mount_promotion_control.apply(this, args);
        }

        wmn_refresh_promotion_control(...args) {
            return methods.FinalMethods.wmn_refresh_promotion_control.apply(this, args);
        }

        wmn_mount_coupon_control(...args) {
            return methods.FinalMethods.wmn_mount_coupon_control.apply(this, args);
        }

        wmn_refresh_coupon_control(...args) {
            return methods.FinalMethods.wmn_refresh_coupon_control.apply(this, args);
        }

        wmn_set_checkout_commercial_busy(...args) {
            return methods.FinalMethods.wmn_set_checkout_commercial_busy.apply(this, args);
        }

        wmn_mount_discount_breakdown(...args) {
            return methods.FinalMethods.wmn_mount_discount_breakdown.apply(this, args);
        }

        wmn_refresh_discount_breakdown(...args) {
            return methods.FinalMethods.wmn_refresh_discount_breakdown.apply(this, args);
        }

        wmn_mount_compact_cart_footer(...args) {
            return methods.FinalMethods.wmn_mount_compact_cart_footer.apply(this, args);
        }

        wmn_refresh_compact_cart_footer(...args) {
            return methods.FinalMethods.wmn_refresh_compact_cart_footer.apply(this, args);
        }

        wmn_open_transaction_discount_dialog(...args) {
            return methods.FinalMethods.wmn_open_transaction_discount_dialog.apply(this, args);
        }

        wmn_build_cart_details_html(...args) {
            return methods.FinalMethods.wmn_build_cart_details_html.apply(this, args);
        }

        wmn_open_cart_details_dialog(...args) {
            return methods.FinalMethods.wmn_open_cart_details_dialog.apply(this, args);
        }

        wmn_show_cart_details_hint(...args) {
            return methods.FinalMethods.wmn_show_cart_details_hint.apply(this, args);
        }

        wmn_hide_cart_details_hint(...args) {
            return methods.FinalMethods.wmn_hide_cart_details_hint.apply(this, args);
        }

        init_cart_components(...args) {
            return methods.FinalMethods.init_cart_components.apply(this, args);
        }

        bind_events(...args) {
            return methods.FinalMethods.bind_events.apply(this, args);
        }

        disable_customer_selection(...args) {
            return methods.FinalMethods.disable_customer_selection.apply(this, args);
        }

        enable_customer_selection(...args) {
            return methods.FinalMethods.enable_customer_selection.apply(this, args);
        }

        update_customer_section(...args) {
            return methods.FinalMethods.update_customer_section.apply(this, args);
        }

        get_item_from_frm(...args) {
            return methods.FinalMethods.get_item_from_frm.apply(this, args);
        }

        render_cart_item(...args) {
            return methods.FinalMethods.render_cart_item.apply(this, args);
        }

        handle_broken_image(...args) {
            return methods.FinalMethods.handle_broken_image.apply(this, args);
        }

        toggle_numpad(...args) {
            return methods.FinalMethods.toggle_numpad.apply(this, args);
        }

        render_net_total(...args) {
            return methods.FinalMethods.render_net_total.apply(this, args);
        }

        render_grand_total(...args) {
            return methods.FinalMethods.render_grand_total.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNItemCartClass, Base);
    ns.Classes.ItemCart = WMNItemCartClass;
})();

/* END wmn_item_cart_class.js */


/* BEGIN wmn_controller_methods.js */
/* Controller class methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.Controller;
    const MamsekUI = ns.UI.Mamsek;
    const ACTIVE_BODY_CLASS = MamsekUI.ACTIVE_BODY_CLASS;
    const icon = MamsekUI.icon;
    const escape_html = MamsekUI.escape_html;
    const category_emoji = MamsekUI.category_emoji;
    const read_item_data = MamsekUI.read_item_data;
    const parse_quantity = MamsekUI.parse_quantity;
    const createPOSComponent = (name, options) => {
        if (typeof window.wmn_pos_create_component !== "function") {
            throw new Error("WMN POS class registry is not available");
        }
        return window.wmn_pos_create_component(name, options);
    };

    /*
     * WMN POS Controller for ERPNext v16.
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

        wmn_prepare_pos_frm_doc() {
            wmn_prepare_pos_frm_doc(this);
            return this.frm;
        },

        init_item_details() {
                    this.item_details = createPOSComponent("ItemDetails", {
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
                    this.cart = createPOSComponent("ItemCart", {
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
                                if (details && this.frm?.doc) {
                                    if (details.customer_group) this.frm.doc.customer_group = details.customer_group;
                                    if (details.territory) this.frm.doc.territory = details.territory;
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
                        if (!this.wmn_data_source && ns.Services?.Data?.createForController) {
                            this.wmn_data_source = ns.Services.Data.createForController(this);
                        }
                        const cacheFromDataSource = this.wmn_data_source?.controllerCache?.();
                        if (cacheFromDataSource) return cacheFromDataSource;

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
                        const profileSettings = window.WMN_POS?.Services?.Settings?.POSProfileSettings;
                        if (!this.wmn_is_offline()) {
                            const profileName = data?.pos_profile || this.pos_profile || "";
                            if (profileSettings && profileName) {
                                await profileSettings.bootstrap(profileName);
                                this.settings = wmn_safe_settings(this.settings || {});
                                profileSettings.applyLegacySettings?.(this.settings, profileName);
                            }
                            if (window.WMNPOSSupervisor?.bootstrap) {
                                await window.WMNPOSSupervisor.bootstrap(this, profileName);
                            }
                            const result = await super.prepare_app_defaults(data);
                            profileSettings?.applyLegacySettings?.(this.settings, profileName);
                            return result;
                        }

                        this.pos_opening = data.name;
                        this.company = data.company;
                        this.pos_profile = data.pos_profile;
                        if (profileSettings && this.pos_profile) {
                            await profileSettings.bootstrap(this.pos_profile);
                        }
                        this.pos_opening_time = data.period_start_date || data.creation || frappe.datetime.now_datetime();
                        this.item_stock_map = this.item_stock_map || {};
                        this.settings = wmn_safe_settings(this.settings || {});

                        const stockSettings = await this.wmn_cache().getStockSettings();
                        this.allow_negative_stock = stockSettings.allow_negative_stock || 0;

                        const profile = await this.wmn_cache().getPOSProfileData(this.pos_profile);
                        Object.assign(this.settings, profile || {});
                        profileSettings?.applyLegacySettings?.(this.settings, this.pos_profile);

                        const invoiceDoctype = await this.wmn_cache().getInvoiceDoctype("Sales Invoice");
                        this.settings.frm_doctype = invoiceDoctype;
                        this.settings.invoice_type = invoiceDoctype;
                        this.settings.invoice_fields = await this.wmn_cache().getInvoiceFields();
                        window.__wmn_pos_invoice_type = invoiceDoctype;

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
                        return wmn_find_offline_cart_row(rows, item);
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
                            if (this.customer_details?.customer_group) doc.customer_group = this.customer_details.customer_group;
                            if (this.customer_details?.territory) doc.territory = this.customer_details.territory;
                            this.cart.update_customer_section?.();
                        }
                        this.frm?.dirty?.();
                    },

        async make_new_invoice() {
                        this.__wmn_return_against_credit = false;
                        this.__wmn_return_zero_payment = false;
                        this.__wmn_return_source_payment_state = "";
                        this.__wmn_cashier_resume = false;
                        this.__wmn_payment_origin = "";
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
                            // Never create a real ERPNext Form through the online lifecycle while offline.
                            // The offline adapter owns local document creation and cached metadata.

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

                        if (["Sales Invoice", "POS Invoice"].includes(this.settings?.frm_doctype)) {
                            this.settings.invoice_type = this.settings.frm_doctype;
                            window.__wmn_pos_invoice_type = this.settings.frm_doctype;
                        }

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
                        const paymentOrigin = String(this.__wmn_payment_origin || "");
                        const cashierCompletion = this.__wmn_cashier_resume === true;
                        frappe.dom.freeze(wmn_t("Saving offline invoice...", "\u062C\u0627\u0631\u064A \u062D\u0641\u0638 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0623\u0648\u0641\u0644\u0627\u064A\u0646..."));

                        try {
                            // Promotions, coupons, and totals are finalized before the payment UI opens.
                            // From this point onward user-entered payment rows are immutable.
                            window.WMN_POS?.Features?.InvoiceHandoff?.Common?.prepareForCompletion?.(this.frm.doc);
                            window.WMN_POS?.Features?.CashierCompletion?.Common?.markCompletedByCashier?.(this.frm.doc);
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

                            await wmn_try_auto_silent_print_after_order(this.frm.doc, "offline", {
                                cashier_completion: cashierCompletion,
                            });

                            if (paymentOrigin === "recent_orders") {
                                await this.wmn_return_to_recent_orders({ refresh: true, focus_search: true });
                            } else {
                                this.toggle_components(false);
                                this.order_summary.toggle_component(true);
                                this.order_summary.load_summary_of(this.frm.doc, true);
                                this.wmn_bind_offline_receipt_buttons();

                                if (this.wmn_cache && this.wmn_cache()) {
                                    await this.wmn_cache().safeRefreshRecentOrders(this);
                                } else if (this.recent_order_list && this.recent_order_list.refresh_list) {
                                    await Promise.resolve(this.recent_order_list.refresh_list());
                                }
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
                    const isZeroPaymentReturn = typeof wmn_is_zero_payment_return_doc === "function"
                        ? wmn_is_zero_payment_return_doc(checkoutDoc, this)
                        : false;

                    if (offlineCheckout) {
                        try {
                            if (!isZeroPaymentReturn) {
                                await this.wmn_ensure_commercial_state_ready_for_payment();
                            }

                            if (isZeroPaymentReturn) {
                                // Unpaid and partly-paid source invoices return as credit notes.
                                // Do not create an automatic cash/card refund in Offline mode.
                                if (typeof wmn_prepare_zero_payment_return === "function") {
                                    wmn_prepare_zero_payment_return(this.frm.doc);
                                }
                                this.wmn_recalculate_offline_totals();
                                if (typeof wmn_prepare_zero_payment_return === "function") {
                                    wmn_prepare_zero_payment_return(this.frm.doc);
                                }
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

                    if (isZeroPaymentReturn && typeof wmn_prepare_zero_payment_return === "function") {
                        // Keep unpaid/partly-paid returns at zero payment. The Payment owner
                        // enforces the same lock again after ERPNext renders the section.
                        wmn_prepare_zero_payment_return(checkoutDoc);
                    } else {
                        // Pay is a boundary only. It waits for the already-running WMN
                        // commercial refresh and must not start a new pricing calculation.
                        await this.wmn_ensure_commercial_state_ready_for_payment();
                    }

                    return super.save_and_checkout();
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

                        const returnSourcePaymentState = typeof wmn_source_invoice_payment_state === "function"
                            ? wmn_source_invoice_payment_state(doc)
                            : "paid";
                        const returnAgainstCredit = typeof wmn_source_invoice_is_credit === "function"
                            ? wmn_source_invoice_is_credit(doc)
                            : false;
                        const returnZeroPayment = typeof wmn_source_invoice_requires_zero_return_payment === "function"
                            ? wmn_source_invoice_requires_zero_return_payment(doc)
                            : returnAgainstCredit;
                        this.__wmn_return_source_payment_state = returnSourcePaymentState;
                        this.__wmn_return_against_credit = returnAgainstCredit;
                        this.__wmn_return_zero_payment = returnZeroPayment;

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

                        // Online return construction is owned by ERPNext. WMN adds only
                        // authorization and the agreed payment-state metadata around it.
                        const response = await super.make_return_invoice(doc);
                        const returnDoc = response?.message
                            ? frappe.get_doc(response.message.doctype, response.message.name)
                            : this.frm?.doc;

                        [returnDoc, this.frm?.doc].filter(Boolean).forEach((target) => {
                            target.__wmn_return_source_payment_state = returnSourcePaymentState;
                            target.__wmn_return_against_credit = returnAgainstCredit;
                            target.__wmn_return_zero_payment = returnZeroPayment;
                            if (returnZeroPayment && typeof wmn_prepare_zero_payment_return === "function") {
                                wmn_prepare_zero_payment_return(target);
                            }
                        });
                        return response;
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
                        if (target_doctype === "Sales Invoice") frm.doc.is_created_using_pos = 1;
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
                                if (doc.doctype === "Sales Invoice") doc.is_created_using_pos = 1;
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
                            return Promise.resolve(super.set_pos_profile_data()).then((result) => {
                                const doc = this.frm?.doc || null;
                                if (doc && cint(doc.is_return || 0) === 1) {
                                    doc.__wmn_return_source_payment_state = this.__wmn_return_source_payment_state || "paid";
                                    doc.__wmn_return_against_credit = this.__wmn_return_against_credit === true;
                                    doc.__wmn_return_zero_payment = this.__wmn_return_zero_payment === true;
                                    if (this.__wmn_return_zero_payment === true && typeof wmn_prepare_zero_payment_return === "function") {
                                        wmn_prepare_zero_payment_return(doc);
                                    }
                                }
                                return result;
                            });
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
                                if (typeof wmn_mark_offline_credit_sale === "function") {
                                    wmn_mark_offline_credit_sale(doc);
                                }
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
                        const paymentOrigin = String(this.__wmn_payment_origin || "");
                        const cashierCompletion = this.__wmn_cashier_resume === true;
                        window.WMN_POS?.Features?.CashierCompletion?.Common?.markCompletedByCashier?.(doc);

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
                            window.dispatchEvent(new CustomEvent("wmn:pricing-rule-cumulative-history-changed", {
                                detail: { server_committed: true, invoice_name: submittedName, source: "online_submit" },
                            }));

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

                            await wmn_try_auto_silent_print_after_order(submittedDoc, "online", {
                                cashier_completion: cashierCompletion,
                            });

                            if (paymentOrigin === "recent_orders") {
                                await this.wmn_return_to_recent_orders({ refresh: true, focus_search: true });
                            } else {
                                this.toggle_components(false);
                                this.order_summary.toggle_component(true);
                                this.order_summary.load_summary_of(submittedDoc, true);

                                if (this.recent_order_list && this.recent_order_list.refresh_list) {
                                    await Promise.resolve(this.recent_order_list.refresh_list());
                                }
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

        async wmn_return_to_recent_orders(options = {}) {
                    const refresh = options.refresh !== false;
                    const focusSearch = options.focus_search !== false;

                    this.payment?.toggle_component?.(false);
                    this.order_summary?.toggle_component?.(false);

                    // Prepare a clean transaction in the background so Back to Cart never
                    // reopens the draft/submitted invoice that was handled by the cashier.
                    await this.make_new_invoice();
                    this.toggle_recent_order_list(true);
                    this.order_summary?.toggle_summary_placeholder?.(true);

                    if (refresh && this.recent_order_list?.refresh_list) {
                        await Promise.resolve(this.recent_order_list.refresh_list());
                    }

                    if (focusSearch) {
                        setTimeout(() => {
                            const $input = this.recent_order_list?.search_field?.$input;
                            if ($input?.length) {
                                $input.val("");
                                $input.trigger("input");
                                $input.trigger("focus");
                            }
                        }, 0);
                    }

                    return true;
                },

        async wmn_send_to_cashier() {
                    const handoff = window.WMN_POS?.Features?.InvoiceHandoff?.Common;
                    if (!handoff?.sendToCashier) throw new Error("WMN cashier handoff feature is not available");
                    return await handoff.sendToCashier(this);
                },

        init_payments() {
                        this.payment = createPOSComponent("Payment", {
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
                                    const isZeroPaymentReturn = typeof wmn_is_zero_payment_return_doc === "function"
                                        ? wmn_is_zero_payment_return_doc(paymentDoc, this)
                                        : false;

                                    if (isZeroPaymentReturn && typeof wmn_prepare_zero_payment_return === "function") {
                                        wmn_prepare_zero_payment_return(paymentDoc);
                                    }

                                    if (wmn_controller_uses_offline_flow(this)) {
                                        return this.save_and_checkout();
                                    }

                                    return this.wmn_submit_online_invoice();
                                },
                                send_to_cashier: async () => await this.wmn_send_to_cashier(),
                                back_to_recent_orders: async () => await this.wmn_return_to_recent_orders({ refresh: true, focus_search: true }),
                                after_checkout: () => {
                                    this.wmn_refresh_sell_on_credit_button();
                                    this.payment?.wmn_setup_send_to_cashier_button?.();
                                    this.payment?.wmn_setup_back_to_recent_orders_button?.();
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
                    this.__wmn_payment_origin = "recent_orders";
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
                            const reason = String(error?.message || error);
                            if (reason === "recent_orders_back") {
                                await this.wmn_return_to_recent_orders({ refresh: true, focus_search: true });
                                return false;
                            }
                            if (reason === "cancelled") return false;
                            throw error;
                        }
                    }

                    await new Promise((resolve) => frappe.model.with_doctype(targetDoctype, resolve));

                    // Existing server drafts must enter the native Frappe Form lifecycle with
                    // both the document and docinfo loaded. with_doc() is Frappe's owner for
                    // loading existing documents used by Form sidebar consumers such as AssignTo.
                    await frappe.model.with_doc(targetDoctype, doc.name);
                    const modelDoc = frappe.get_doc(targetDoctype, doc.name);
                    if (!modelDoc || !frappe.model.get_docinfo(targetDoctype, doc.name)) {
                        throw new Error("WMN scanned draft invoice did not load through the Frappe document lifecycle");
                    }

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
                    const normalizeInvoiceDoctype = (doctype) => {
                        return ["Sales Invoice", "POS Invoice"].includes(doctype)
                            ? doctype
                            : wmn_pos_invoice_doctype(this);
                    };

                    this.recent_order_list = createPOSComponent("PastOrderList", {
                        wrapper: this.$components_wrapper,
                        events: {
                            open_invoice_data: (doctype, name) => {
                                const targetDoctype = normalizeInvoiceDoctype(doctype);
                                if (!name) return;

                                if (wmn_controller_uses_offline_flow(this)) {
                                    this.wmn_cache().getInvoiceFromCache(targetDoctype, name).then(async (doc) => {
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

                                frappe.db.get_doc(targetDoctype, name).then(async (doc) => {
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
                    const normalizeInvoiceDoctype = (doctype) => {
                        return ["Sales Invoice", "POS Invoice"].includes(doctype)
                            ? doctype
                            : wmn_pos_invoice_doctype(this);
                    };

                    this.settings = wmn_safe_settings(this.settings || {});
                    this.order_summary = createPOSComponent("PastOrderSummary", {
                        wrapper: this.$components_wrapper,
                        settings: wmn_safe_settings(this.settings || {}),
                        events: {
                            get_frm: () => this.frm,

                            process_return: (doctype, name) => {
                                const targetDoctype = normalizeInvoiceDoctype(doctype);
                                this.recent_order_list.toggle_component(false);
                                if (wmn_controller_uses_offline_flow(this)) {
                                    void (async () => {
                                        const doc = await this.wmn_cache().getInvoiceFromCache(targetDoctype, name);
                                        if (!doc) {
                                            frappe.show_alert({ message: __("Return is available offline only for cached invoices."), indicator: "orange" });
                                            return;
                                        }

                                        const result = await this.make_return_invoice(doc);
                                        if (!result) return;
                                        if (this.order_summary?.toggle_component) this.order_summary.toggle_component(false);
                                        if (this.cart?.load_invoice) await this.cart.load_invoice();
                                        if (this.item_selector?.toggle_component) this.item_selector.toggle_component(true);
                                        if (this.cart?.toggle_component) this.cart.toggle_component(true);
                                    })().catch((error) => {
                                        console.error("WMN offline return failed", error);
                                        frappe.msgprint({
                                            title: __("Return Failed"),
                                            indicator: "red",
                                            message: error?.message || String(error),
                                        });
                                    });
                                    return;
                                }

                                frappe.db.get_doc(targetDoctype, name).then((doc) => {
                                    frappe.run_serially([
                                        () => frappe.dom.freeze(),
                                        () => this.make_invoice_frm(targetDoctype),
                                        () => this.make_return_invoice(doc),
                                        () => this.cart.load_invoice(),
                                        () => this.toggle_components(true),
                                        () => frappe.dom.unfreeze(),
                                    ]).catch((error) => {
                                        frappe.dom.unfreeze();
                                        throw error;
                                    });
                                });
                            },

                            edit_order: (doctype, name) => {
                                const targetDoctype = normalizeInvoiceDoctype(doctype);
                                this.recent_order_list.toggle_component(false);
                                if (wmn_controller_uses_offline_flow(this)) {
                                    this.wmn_cache().getInvoiceFromCache(targetDoctype, name).then((doc) => {
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
                                    () => this.make_invoice_frm(targetDoctype),
                                    () => this.sync_draft_invoice_to_frm(targetDoctype, name),
                                    () => this.frm.refresh(name),
                                    () => this.frm.call("reset_mode_of_payments"),
                                    () => this.cart.load_invoice(),
                                    () => this.toggle_components(true),
                                ]);
                            },

                            delete_order: (doctype, name) => {
                                const targetDoctype = normalizeInvoiceDoctype(doctype);
                                if (wmn_controller_uses_offline_flow(this)) {
                                    this.wmn_cache().deleteInvoiceFromCache(targetDoctype, name).then(() => {
                                        this.wmn_cache().safeRefreshRecentOrders(this);
                                    });
                                    return;
                                }
                                frappe.model.with_doctype(targetDoctype, () => {
                                    frappe.model.delete_doc(targetDoctype, name, () => {
                                        this.recent_order_list.refresh_list();
                                    });
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
                                            if (!isOffline) location.reload();
                                        }
                                    },
                                ]).catch((e) => {
                                    frappe.dom.unfreeze();
                                    if (e === "wmn_reload_online_new_order") return;
                                    console.error("WMN new_order failed", e);
                                });
                            },

                            open_in_form_view: (doctype, name) => {
                                const targetDoctype = normalizeInvoiceDoctype(doctype);
                                if (wmn_controller_uses_offline_flow(this)) {
                                    frappe.show_alert({
                                        message: __("Form view is not available while POS is offline."),
                                        indicator: "orange",
                                    });
                                    return;
                                }
                                frappe.set_route("Form", targetDoctype, name);
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
                this.item_selector = createPOSComponent("ItemSelector", {
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
    FinalMethods.wmn_prepare_pos_frm_doc = UIMethods.wmn_prepare_pos_frm_doc || CoreMethods.wmn_prepare_pos_frm_doc;
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
    FinalMethods.make_return_invoice = UIMethods.make_return_invoice || CoreMethods.make_return_invoice;
    FinalMethods.get_new_frm = UIMethods.get_new_frm || CoreMethods.get_new_frm;
    FinalMethods.set_pos_profile_data = UIMethods.set_pos_profile_data || CoreMethods.set_pos_profile_data;
    FinalMethods.wmn_can_sell_on_credit = UIMethods.wmn_can_sell_on_credit || CoreMethods.wmn_can_sell_on_credit;
    FinalMethods.wmn_refresh_sell_on_credit_button = UIMethods.wmn_refresh_sell_on_credit_button || CoreMethods.wmn_refresh_sell_on_credit_button;
    FinalMethods.wmn_setup_sell_on_credit_button = UIMethods.wmn_setup_sell_on_credit_button || CoreMethods.wmn_setup_sell_on_credit_button;
    FinalMethods.wmn_sell_on_credit = UIMethods.wmn_sell_on_credit || CoreMethods.wmn_sell_on_credit;
    FinalMethods.wmn_submit_online_invoice = UIMethods.wmn_submit_online_invoice || CoreMethods.wmn_submit_online_invoice;
    FinalMethods.wmn_return_to_recent_orders = UIMethods.wmn_return_to_recent_orders || CoreMethods.wmn_return_to_recent_orders;
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

                        this.__wmn_pos_version = "v16";
                        this.settings = wmn_safe_settings(this.settings || {});
                        this.wmn_data_source = ns.Services?.Data?.createForController
                            ? ns.Services.Data.createForController(this)
                            : null;
                        this.wmn_start_offline_preload();

    };
    const initializeUI = null;

    function initialize(instance, args) {
        if (initializeCore) initializeCore.apply(instance, args);
        if (initializeUI) initializeUI.apply(instance, args);
    }

    ns.ClassMethods.Controller = { CoreMethods, UIMethods, FinalMethods, initialize };
})();

/* END wmn_controller_methods.js */


/* BEGIN wmn_controller_class.js */
/* Single production WMN POS Controller class. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Source.Controller;
    const methods = ns.ClassMethods.Controller;

    class WMNControllerClass {
        wmn_prepare_pos_frm_doc(...args) {
            return methods.FinalMethods.wmn_prepare_pos_frm_doc.apply(this, args);
        }

        constructor(...args) {
            return window.wmn_pos_construct_from_source(Base, WMNControllerClass, args, (instance) => {
                methods.initialize(instance, args);
            });
        }

        init_item_details(...args) {
            return methods.FinalMethods.init_item_details.apply(this, args);
        }

        wmn_handle_item_details_visibility(...args) {
            return methods.FinalMethods.wmn_handle_item_details_visibility.apply(this, args);
        }

        init_item_cart(...args) {
            return methods.FinalMethods.init_item_cart.apply(this, args);
        }

        wmn_sync_item_stock_map(...args) {
            return methods.FinalMethods.wmn_sync_item_stock_map.apply(this, args);
        }

        wmn_cache(...args) {
            return methods.FinalMethods.wmn_cache.apply(this, args);
        }

        wmn_is_offline(...args) {
            return methods.FinalMethods.wmn_is_offline.apply(this, args);
        }

        fetch_opening_entry(...args) {
            return methods.FinalMethods.fetch_opening_entry.apply(this, args);
        }

        check_opening_entry(...args) {
            return methods.FinalMethods.check_opening_entry.apply(this, args);
        }

        create_opening_voucher(...args) {
            return methods.FinalMethods.create_opening_voucher.apply(this, args);
        }

        prepare_app_defaults(...args) {
            return methods.FinalMethods.prepare_app_defaults.apply(this, args);
        }

        wmn_start_offline_preload(...args) {
            return methods.FinalMethods.wmn_start_offline_preload.apply(this, args);
        }

        get_item_from_frm(...args) {
            return methods.FinalMethods.get_item_from_frm.apply(this, args);
        }

        update_cart_html(...args) {
            return methods.FinalMethods.update_cart_html.apply(this, args);
        }

        wmn_restore_default_customer_for_new_transaction(...args) {
            return methods.FinalMethods.wmn_restore_default_customer_for_new_transaction.apply(this, args);
        }

        make_new_invoice(...args) {
            return methods.FinalMethods.make_new_invoice.apply(this, args);
        }

        wmn_register_offline_row_in_frappe_model(...args) {
            return methods.FinalMethods.wmn_register_offline_row_in_frappe_model.apply(this, args);
        }

        wmn_ensure_offline_item_stock_map(...args) {
            return methods.FinalMethods.wmn_ensure_offline_item_stock_map.apply(this, args);
        }

        wmn_ensure_item_stock_map_for_cart_rows(...args) {
            return methods.FinalMethods.wmn_ensure_item_stock_map_for_cart_rows.apply(this, args);
        }

        wmn_ensure_item_stock_map_for_item_details(...args) {
            return methods.FinalMethods.wmn_ensure_item_stock_map_for_item_details.apply(this, args);
        }

        edit_item_details_of(...args) {
            return methods.FinalMethods.edit_item_details_of.apply(this, args);
        }

        wmn_get_active_offline_item_detail_row(...args) {
            return methods.FinalMethods.wmn_get_active_offline_item_detail_row.apply(this, args);
        }

        wmn_apply_offline_item_detail_value(...args) {
            return methods.FinalMethods.wmn_apply_offline_item_detail_value.apply(this, args);
        }

        wmn_refresh_offline_cart_from_item_detail(...args) {
            return methods.FinalMethods.wmn_refresh_offline_cart_from_item_detail.apply(this, args);
        }

        wmn_remove_offline_item_detail_row(...args) {
            return methods.FinalMethods.wmn_remove_offline_item_detail_row.apply(this, args);
        }

        wmn_clear_cart(...args) {
            return methods.FinalMethods.wmn_clear_cart.apply(this, args);
        }

        remove_item_from_cart(...args) {
            return methods.FinalMethods.remove_item_from_cart.apply(this, args);
        }

        update_item_field(...args) {
            return methods.FinalMethods.update_item_field.apply(this, args);
        }

        get_available_stock(...args) {
            return methods.FinalMethods.get_available_stock.apply(this, args);
        }

        check_serial_no_availablilty(...args) {
            return methods.FinalMethods.check_serial_no_availablilty.apply(this, args);
        }

        check_stock_availability(...args) {
            return methods.FinalMethods.check_stock_availability.apply(this, args);
        }

        on_cart_update(...args) {
            return methods.FinalMethods.on_cart_update.apply(this, args);
        }

        wmn_restore_online_uom_after_super(...args) {
            return methods.FinalMethods.wmn_restore_online_uom_after_super.apply(this, args);
        }

        wmn_restore_online_batch_price_after_super(...args) {
            return methods.FinalMethods.wmn_restore_online_batch_price_after_super.apply(this, args);
        }

        wmn_get_child_doctype(...args) {
            return methods.FinalMethods.wmn_get_child_doctype.apply(this, args);
        }

        wmn_recalculate_offline_totals(...args) {
            return methods.FinalMethods.wmn_recalculate_offline_totals.apply(this, args);
        }

        wmn_offline_get_full_item(...args) {
            return methods.FinalMethods.wmn_offline_get_full_item.apply(this, args);
        }

        wmn_prepare_online_batch_args_before_super(...args) {
            return methods.FinalMethods.wmn_prepare_online_batch_args_before_super.apply(this, args);
        }

        wmn_apply_online_batch_after_cart_update(...args) {
            return methods.FinalMethods.wmn_apply_online_batch_after_cart_update.apply(this, args);
        }

        wmn_offline_on_cart_update(...args) {
            return methods.FinalMethods.wmn_offline_on_cart_update.apply(this, args);
        }

        wmn_finalize_offline_invoice(...args) {
            return methods.FinalMethods.wmn_finalize_offline_invoice.apply(this, args);
        }

        save_and_checkout(...args) {
            return methods.FinalMethods.save_and_checkout.apply(this, args);
        }

        make_return_invoice(...args) {
            return methods.FinalMethods.make_return_invoice.apply(this, args);
        }

        get_new_frm(...args) {
            return methods.FinalMethods.get_new_frm.apply(this, args);
        }

        set_pos_profile_data(...args) {
            return methods.FinalMethods.set_pos_profile_data.apply(this, args);
        }

        wmn_can_sell_on_credit(...args) {
            return methods.FinalMethods.wmn_can_sell_on_credit.apply(this, args);
        }

        wmn_refresh_sell_on_credit_button(...args) {
            return methods.FinalMethods.wmn_refresh_sell_on_credit_button.apply(this, args);
        }

        wmn_setup_sell_on_credit_button(...args) {
            return methods.FinalMethods.wmn_setup_sell_on_credit_button.apply(this, args);
        }

        wmn_sell_on_credit(...args) {
            return methods.FinalMethods.wmn_sell_on_credit.apply(this, args);
        }

        wmn_submit_online_invoice(...args) {
            return methods.FinalMethods.wmn_submit_online_invoice.apply(this, args);
        }

        wmn_return_to_recent_orders(...args) {
            return methods.FinalMethods.wmn_return_to_recent_orders.apply(this, args);
        }

        wmn_send_to_cashier(...args) {
            return methods.FinalMethods.wmn_send_to_cashier.apply(this, args);
        }

        init_payments(...args) {
            return methods.FinalMethods.init_payments.apply(this, args);
        }

        wmn_bind_offline_receipt_buttons(...args) {
            return methods.FinalMethods.wmn_bind_offline_receipt_buttons.apply(this, args);
        }

        wmn_open_scanned_draft_for_payment(...args) {
            return methods.FinalMethods.wmn_open_scanned_draft_for_payment.apply(this, args);
        }

        wmn_route_scanned_invoice(...args) {
            return methods.FinalMethods.wmn_route_scanned_invoice.apply(this, args);
        }

        init_recent_order_list(...args) {
            return methods.FinalMethods.init_recent_order_list.apply(this, args);
        }

        init_order_summary(...args) {
            return methods.FinalMethods.init_order_summary.apply(this, args);
        }

        prepare_dom(...args) {
            return methods.FinalMethods.prepare_dom.apply(this, args);
        }

        init_item_selector(...args) {
            return methods.FinalMethods.init_item_selector.apply(this, args);
        }

        wmn_setup_adaptive_cart_ui(...args) {
            return methods.FinalMethods.wmn_setup_adaptive_cart_ui.apply(this, args);
        }

        wmn_set_item_details_modal_open(...args) {
            return methods.FinalMethods.wmn_set_item_details_modal_open.apply(this, args);
        }

        wmn_open_cart_drawer(...args) {
            return methods.FinalMethods.wmn_open_cart_drawer.apply(this, args);
        }

        wmn_close_cart_drawer(...args) {
            return methods.FinalMethods.wmn_close_cart_drawer.apply(this, args);
        }

        wmn_update_cart_fab(...args) {
            return methods.FinalMethods.wmn_update_cart_fab.apply(this, args);
        }

        wmn_sync_cart_context(...args) {
            return methods.FinalMethods.wmn_sync_cart_context.apply(this, args);
        }

        wmn_setup_cart_state_observers(...args) {
            return methods.FinalMethods.wmn_setup_cart_state_observers.apply(this, args);
        }

        wmn_restore_cart_width(...args) {
            return methods.FinalMethods.wmn_restore_cart_width.apply(this, args);
        }

        wmn_bind_cart_resizer(...args) {
            return methods.FinalMethods.wmn_bind_cart_resizer.apply(this, args);
        }

        change_item_quantity_from_selector(...args) {
            return methods.FinalMethods.change_item_quantity_from_selector.apply(this, args);
        }

        set_item_quantity_from_selector(...args) {
            return methods.FinalMethods.set_item_quantity_from_selector.apply(this, args);
        }

        wmn_is_local_pricing_rule_engine_ignored(...args) {
            return ns.Features.PricingRule.Common.ControllerMethods.wmn_is_local_pricing_rule_engine_ignored.apply(this, args);
        }

        wmn_get_local_pricing_rule_snapshot(...args) {
            return ns.Features.PricingRule.Common.ControllerMethods.wmn_get_local_pricing_rule_snapshot.apply(this, args);
        }

        wmn_refresh_local_pricing_rules(...args) {
            return ns.Features.PricingRule.Common.ControllerMethods.wmn_refresh_local_pricing_rules.apply(this, args);
        }

        wmn_assert_local_pricing_rules_supported(...args) {
            return ns.Features.PricingRule.Common.ControllerMethods.wmn_assert_local_pricing_rules_supported.apply(this, args);
        }

        wmn_has_manual_additional_discount(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_has_manual_additional_discount.apply(this, args);
        }

        wmn_get_pos_discount_breakdown(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_get_pos_discount_breakdown.apply(this, args);
        }

        wmn_sync_pos_invoice_discount_fields(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_sync_pos_invoice_discount_fields.apply(this, args);
        }

        wmn_refresh_commercial_state_after_cart_change(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_refresh_commercial_state_after_cart_change.apply(this, args);
        }

        wmn_ensure_commercial_state_ready_for_payment(...args) {
            return ns.Features.Discount.Common.ControllerMethods.wmn_ensure_commercial_state_ready_for_payment.apply(this, args);
        }

        wmn_apply_coupon_code(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_apply_coupon_code.apply(this, args);
        }

        wmn_apply_coupon_result(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_apply_coupon_result.apply(this, args);
        }

        wmn_get_coupon_base_amounts(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_get_coupon_base_amounts.apply(this, args);
        }

        wmn_open_coupon_dialog(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_open_coupon_dialog.apply(this, args);
        }

        wmn_refresh_active_coupon_after_cart_change(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_refresh_active_coupon_after_cart_change.apply(this, args);
        }

        wmn_refresh_coupon_ui(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_refresh_coupon_ui.apply(this, args);
        }

        wmn_remove_coupon(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_remove_coupon.apply(this, args);
        }

        wmn_revalidate_active_coupon(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_revalidate_active_coupon.apply(this, args);
        }

        wmn_set_coupon_discount_fields(...args) {
            return ns.Features.Coupon.Common.ControllerMethods.wmn_set_coupon_discount_fields.apply(this, args);
        }

        wmn_validate_coupon_offline(...args) {
            return ns.Features.Coupon.Offline.ControllerMethods.wmn_validate_coupon_offline.apply(this, args);
        }

        wmn_validate_coupon_online(...args) {
            return ns.Features.Coupon.Online.ControllerMethods.wmn_validate_coupon_online.apply(this, args);
        }

        wmn_apply_promotion_evaluation(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_apply_promotion_evaluation.apply(this, args);
        }

        wmn_clear_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_clear_promotions.apply(this, args);
        }

        wmn_get_active_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_active_promotions.apply(this, args);
        }

        wmn_get_promotion_context(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_promotion_context.apply(this, args);
        }

        wmn_get_promotion_row_key(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_get_promotion_row_key.apply(this, args);
        }

        wmn_prepare_promotion_base_rates(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_prepare_promotion_base_rates.apply(this, args);
        }

        wmn_refresh_promotion_ui(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotion_ui.apply(this, args);
        }

        wmn_refresh_promotions_after_cart_change(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotions_after_cart_change.apply(this, args);
        }

        wmn_refresh_promotions_and_coupon(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_refresh_promotions_and_coupon.apply(this, args);
        }

        wmn_revalidate_active_promotions(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_revalidate_active_promotions.apply(this, args);
        }

        wmn_sync_promotion_free_items(...args) {
            return ns.Features.Promotion.Common.ControllerMethods.wmn_sync_promotion_free_items.apply(this, args);
        }

        wmn_set_offline_promotion_rate(...args) {
            return ns.Features.Promotion.Offline.ControllerMethods.wmn_set_offline_promotion_rate.apply(this, args);
        }

        wmn_set_online_promotion_rate(...args) {
            return ns.Features.Promotion.Online.ControllerMethods.wmn_set_online_promotion_rate.apply(this, args);
        }

        wmn_prepare_online_promotion_free_item_row(...args) {
            return ns.Features.Promotion.Online.ControllerMethods.wmn_prepare_online_promotion_free_item_row.apply(this, args);
        }

        wmn_get_cashier_commercial_catalog(...args) {
            return ns.Features.CommercialCatalog.Common.ControllerMethods.wmn_get_cashier_commercial_catalog.apply(this, args);
        }

        wmn_open_cashier_commercial_catalog(...args) {
            return ns.Features.CommercialCatalog.Common.ControllerMethods.wmn_open_cashier_commercial_catalog.apply(this, args);
        }

        wmn_authorize_pos_action(...args) {
            return ns.Features.Supervisor.Common.ControllerMethods.wmn_authorize_pos_action.apply(this, args);
        }
    }

    window.wmn_pos_inherit_source_prototype(WMNControllerClass, Base);
    ns.Classes.Controller = WMNControllerClass;
})();

/* END wmn_controller_class.js */


/* BEGIN wmn_page_boot.js */
/* Clean WMN POS page boot. Instantiates WMN classes without ERPNext runtime replacement. */
window.wmn_pos_page_boot = async function wmn_pos_page_boot(wrapper) {
    if (!wrapper) throw new Error("WMN POS wrapper is required");
    const ns = window.WMN_POS;
    if (!ns?.Classes?.Controller) throw new Error("WMN POS Controller class is not available");

    await ns.Services?.Settings?.DevicePreferences?.initialize?.();
    await wmn_bootstrap_detect_effective_offline();
    ns.UI.Mamsek?.setup?.();
    ns.UI.Dialogs?.setup?.();

    wrapper.pos = new ns.Classes.Controller(wrapper);
    wrapper.pos.__wmn_owned_page = true;
    wrapper.pos.__wmn_page_name = "wmn-pos";
    wrapper.pos.wmn_data_source = wrapper.pos.wmn_data_source || ns.Services.Data?.createForController?.(wrapper.pos);
    wrapper.pos.__wmn_data_source_capabilities = wrapper.pos.wmn_data_source?.backendCapabilities?.() || {};
    window.cur_pos = wrapper.pos;
    wmn_init_offline_invoice_manager_dialog(wrapper.pos);
    setTimeout(() => {
        ns.Features.DoctypeManager?.Common?.initialize?.();
    }, 1200);
    setTimeout(() => {
        if (typeof wmn_sync_receipt_counter_on_page_load === "function") wmn_sync_receipt_counter_on_page_load();
    }, 3000);
    return wrapper.pos;
};

/* END wmn_page_boot.js */

};

frappe.pages["wmn-pos"].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({ parent: wrapper, title: __("WMN POS"), single_column: true, hide_sidebar: true });

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-wmn-pos-src="${src}"]`);
            if (existing && existing.__wmn_loaded) return resolve(true);
            if (existing) {
                existing.addEventListener("load", () => resolve(true), { once: true });
                existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
                return;
            }
            const script = document.createElement("script");
            script.src = src; script.async = false; script.defer = false; script.dataset.wmnPosSrc = src;
            script.onload = () => { script.__wmn_loaded = true; resolve(true); };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    const base = "/assets/wmn/js/pos_offline/";
    const version = "20260907_retail_tools_v20";
    window.__wmn_pos_asset_version = version;
    const supportManifest = [
        "services/storage/offline_storage.js",
        "services/retail/retail_context.js",
        "features/price_checker/price_checker.online.js",
        "features/price_checker/price_checker.offline.js",
        "features/price_checker/price_checker.common.js",
        "features/barcode_printing/barcode_printing.online.js",
        "features/barcode_printing/barcode_printing.offline.js",
        "features/barcode_printing/vendor/jsbarcode.wmn.js",
        "features/barcode_printing/barcode_printing.range.js",
        "features/barcode_printing/barcode_printing.import.js",
        "features/barcode_printing/barcode_printing.print_layout.js",
        "features/barcode_printing/barcode_printing.common.js",
        "features/barcode_scan_quantity/barcode_scan_quantity.common.js",
        "features/barcode_scan_quantity/barcode_scan_quantity.ui.js",
        "services/barcode/invoice_barcode.js",
        "services/connectivity/connectivity.js",
        "services/offline/mode_and_settings.js",
        "core/common.js",
        "services/settings/device_preferences.js",
        "services/settings/pos_profile_settings.js",
        "ui/dialog_manager.js",
        "services/offline/document_adapter.js",
        "services/payment/offline_payment.js",
        "features/payment_gateway/payment_gateway.common.js",
        "services/payment_gateway/model_registry.js",
        "services/payment_gateway/providers/provider_base.js",
        "services/payment_gateway/providers/geidea.js",
        "services/payment_gateway/providers/stc_softpos.js",
        "services/payment_gateway/providers/generic.js",
        "services/payment_gateway/payment_gateway_service.js",
        "features/payment_gateway/payment_gateway.online.js",
        "features/payment_gateway/payment_gateway.offline.js",
        "services/stock/offline_stock.js",
        "services/offline/invoice_manager.js",
        "services/printing/raw_renderer.js",
        "services/printing/template_loader.js",
        "services/printing/pdf_renderer.js",
        "services/printing/escpos.js",
        "services/printing/legacy_bridge_adapter.js",
        "services/printing/browser_print_adapter.js",
        "services/printing/webusb_escpos_adapter.js",
        "services/printing/webserial_escpos_adapter.js",
        "services/printing/qz_print_adapter.js",
        "services/printing/print_service.js",
        "services/receipt/receipt_counter.js",
        "services/printing/auto_print.js",
        "features/printing/printing.common.js",
        "features/printing/printing.online.js",
        "features/printing/printing.offline.js",
        "features/receipt/receipt.common.js",
        "features/receipt/receipt.online.js",
        "features/receipt/receipt.offline.js",
        "features/invoice_barcode/invoice_barcode.common.js",
        "features/invoice_barcode/invoice_barcode.online.js",
        "features/invoice_barcode/invoice_barcode.offline.js",
        "features/invoice_handoff/invoice_handoff.common.js",
        "features/invoice_handoff/invoice_handoff.online.js",
        "features/invoice_handoff/invoice_handoff.offline.js",
        "features/return/return.common.js",
        "features/return/return.offline.js",
        "features/cashier_completion/cashier_completion.common.js",
        "features/sync/sync.common.js",
        "features/sync/sync.online.js",
        "features/sync/sync.offline.js",
        "services/offline/cart_normalizer.js",
        "services/cache/controller_cache.js",
        "services/cache/pos_cache_registry.js",
        "services/cache/pos_cache_adapter.js",
        "services/item/free_item_row.js",
        "features/pos_cache_manager/pos_cache_manager.common.js",
        "features/pos_cache_manager/pos_cache_manager.online.js",
        "features/pos_cache_manager/pos_cache_manager.offline.js",
        "features/pricing_rule/pricing_rule.common.js",
        "features/pricing_rule/pricing_rule.controller.common.js",
        "features/discount/discount.common.js",
        "features/ui_preferences/ui_preferences.common.js",
        "features/coupon/coupon.common.js",
        "features/coupon/coupon.controller.common.js",
        "features/coupon/coupon.online.js",
        "features/coupon/coupon.offline.js",
        "features/promotion/promotion.common.js",
        "features/promotion/promotion.controller.common.js",
        "features/promotion/promotion.online.js",
        "features/promotion/promotion.offline.js",
        "features/commercial_catalog/commercial_catalog.common.js",
        "features/commercial_catalog/commercial_catalog.online.js",
        "features/commercial_catalog/commercial_catalog.offline.js",
        "features/supervisor/supervisor.common.js",
        "features/supervisor/supervisor.online.js",
        "features/supervisor/supervisor.offline.js",
        "features/supervisor/supervisor.controller.common.js",
        "features/cash_movement/cash_movement.common.js",
        "features/cash_movement/cash_movement.online.js",
        "features/cash_movement/cash_movement.offline.js",
        "features/doctype_manager/doctype_manager.common.js",
        "features/doctype_manager/doctype_manager.online.js",
        "features/doctype_manager/doctype_manager.offline.js",
        "ui/mamsek_ui.js"
    ];

    supportManifest.reduce((p, name) => p.then(() => loadScript(base + name + "?v=" + encodeURIComponent(version))), Promise.resolve())
        .then(() => {
            window.wmn_pos_install_owned_source();
            console.info("[WMN POS] page source version:", version);
            return window.wmn_pos_page_boot(wrapper);
        })
        .catch((error) => {
            console.error("WMN POS page failed", error);
            frappe.msgprint({ title: "WMN POS", indicator: "red", message: error.message || String(error) });
        });
};

frappe.pages["wmn-pos"].refresh = function(wrapper) {
    if (document.scannerDetectionData && wrapper?.pos) {
        try { onScan.detachFrom(document); } catch (e) {}
        wrapper.pos.wrapper?.html?.("");
        wrapper.pos.check_opening_entry();
    }
};
