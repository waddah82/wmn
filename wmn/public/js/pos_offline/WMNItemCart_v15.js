/*
 * WMNItemCart_v15_OFFLINE_SAFE.js
 * v15-specific safe wrapper for ERPNext POS ItemCart.
 * Online: original ERPNext ItemCart behavior.
 * Offline: no Customer/transactions/contact calls to server; uses local doc/cache only.
 */
(function () {
    const BaseItemCart = erpnext.PointOfSale.ItemCart;

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
            if (window.wmnPOSOffline.getAll && window.wmnPOSOffline.STORES) {
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.customers);
                const q = String(customer || "").toLowerCase();
                return (rows || []).find(r =>
                    String(r.name || "").toLowerCase() === q ||
                    String(r.customer_name || "").toLowerCase() === q ||
                    String(r.mobile_no || "").toLowerCase() === q ||
                    String(r.email_id || "").toLowerCase() === q
                ) || null;
            }
        } catch (e) {}
        return null;
    }

    erpnext.PointOfSale.ItemCart = class WMNItemCartV15OfflineSafe extends BaseItemCart {
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
        }

        make_customer_selector() {
            if (!wmn_item_cart_is_offline()) {
                return super.make_customer_selector();
            }

            this.$customer_section.html(`<div class="customer-field"></div>`);
            const me = this;
            const frm = this.events && this.events.get_frm ? this.events.get_frm() : null;
            const currentCustomer = frm && frm.doc ? (frm.doc.customer || "") : "";

            this.customer_field = frappe.ui.form.make_control({
                df: {
                    label: __("Customer"),
                    fieldtype: "Data",
                    placeholder: __("Customer"),
                    onchange: async function () {
                        const value = String(this.value || "").trim();
                        const frm = me.events && me.events.get_frm ? me.events.get_frm() : null;
                        if (frm && frm.doc) {
                            frm.doc.customer = value;
                            frm.doc.customer_name = value;
                            if (frm.dirty) frm.dirty();
                        }
                        await me.fetch_customer_details(value);
                        if (me.events && me.events.customer_details_updated) {
                            me.events.customer_details_updated(me.customer_info);
                        }
                        me.update_customer_section();
                        me.update_totals_section();
                    },
                },
                parent: this.$customer_section.find(".customer-field"),
                render_input: true,
            });
            this.customer_field.toggle_label(false);
            if (currentCustomer) this.customer_field.set_value(currentCustomer);
        }

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
                email_id: row.email_id || doc.contact_email || doc.email_id || "",
                mobile_no: row.mobile_no || row.contact_mobile || doc.contact_mobile || doc.mobile_no || "",
                image: row.image || "",
                loyalty_program: row.loyalty_program || "",
                loyalty_points: row.loyalty_points || 0,
                conversion_factor: row.conversion_factor || 0,
            };
            return Promise.resolve();
        }

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
        }

        fetch_customer_transactions() {
            if (!wmn_item_cart_is_offline()) {
                return super.fetch_customer_transactions();
            }

            const transaction_container = this.$customer_section.find(".customer-transactions");
            transaction_container.html(`<div class="no-transactions-placeholder">${__("Customer transactions are not loaded while offline")}</div>`);
            return Promise.resolve([]);
        }

        show_discount_control() {
            if (!wmn_item_cart_is_offline()) {
                return super.show_discount_control();
            }

            const frm = this.events && this.events.get_frm ? this.events.get_frm() : null;
            if (!frm || !frm.doc) return;

            let discount = frm.doc.additional_discount_percentage || 0;
            this.$add_discount_elem.css("display", "none");
            this.$discount_control = this.$discount_control || $("<div class='discount-control'></div>").appendTo(this.$totals_section);
            this.$discount_control.empty();

            this.discount_field = frappe.ui.form.make_control({
                df: {
                    label: __("Discount (%)"),
                    fieldtype: "Float",
                    onchange: () => {
                        const value = flt(this.discount_field.get_value ? this.discount_field.get_value() : this.discount_field.value || 0);
                        frm.doc.additional_discount_percentage = value;
                        if (window.cur_pos && window.cur_pos.wmn_recalculate_offline_totals) {
                            window.cur_pos.wmn_recalculate_offline_totals();
                        }
                        this.update_totals_section(frm);
                        if (frm.dirty) frm.dirty();
                    },
                },
                parent: this.$discount_control,
                render_input: true,
            });
            this.discount_field.set_value(discount);
        }

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
})();
