/* ItemCart override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.ItemCart;
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
            const manualPercent = Math.max(0, flt(doc.additional_discount_percentage || 0));
            const manualAmount = manualPercent > 0.000001 ? Math.max(0, flt(doc.discount_amount || 0)) : 0;
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
                    const manualPercent = Math.max(0, flt(doc.additional_discount_percentage || 0));
                    const manualAmount = manualPercent > 0.000001 ? Math.max(0, flt(doc.discount_amount || 0)) : 0;
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

                    $discount.toggleClass("is-active", summary.manual_percent > 0.000001);
                    $coupon.toggleClass("is-active", Boolean(summary.coupon_code));

                    $discount.attr(
                        "title",
                        summary.manual_percent > 0.000001
                            ? `${__("Manual Discount")}: ${summary.manual_percent}%`
                            : __("Add Discount")
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

    ns.OverrideMethods.ItemCart = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
