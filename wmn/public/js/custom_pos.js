frappe.provide("erpnext.PointOfSale");

frappe.pages['point-of-sale'].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Point of Sale"),
        single_column: true,
    });

    frappe.require("point-of-sale.bundle.js", async function() {
        
        class MyPOSController extends erpnext.PointOfSale.Controller {
            constructor(wrapper) {
                super(wrapper);
            }
            
            

            

            check_stock_availability(item, qty, warehouse) {
                const target_warehouse = warehouse || (this.settings ? this.settings.warehouse : null);
                if (!target_warehouse) return Promise.resolve(true);

                return frappe.call({
                    method: "erpnext.accounts.doctype.pos_invoice.pos_invoice.get_stock_availability",
                    args: {
                        item_code: item.item_code,
                        warehouse: target_warehouse
                    }
                }).then(r => (r.message || 0) >= qty);
            }

            make_sales_invoice_frm() {
                //const doctype = this.save_as_sales_invoice ? "Sales Invoice" : "POS Invoice";
                const doctype = this.settings.as_sales_invoice === 1 ? "Sales Invoice" : "POS Invoice";
                console.log("as_sales_invoice value:", this.settings.as_sales_invoice);
                return new Promise((resolve) => {
                    frappe.model.with_doctype(doctype, () => {
                        this.frm = this.get_new_frm(null, doctype);
                        this.frm.doc.items = [];
                        this.frm.doc.is_pos = 1;
                        this.frm.doc.update_stock = 1;
                        this.frm.doc.pos_profile = this.settings.pos_profile;
                        resolve();
                    });
                });
            }

            get_new_frm(_frm, doctype) {
                const page = $("<div>");
                const frm = new frappe.ui.form.Form(doctype, page, false);
                const name = frappe.model.make_new_doc_and_get_name(doctype, true);
                frm.refresh(name);
                return frm;
            }

            init_payments() {
                super.init_payments();
                this.payment.events.submit_invoice = () => {
                    this.frm.savesubmit().then((r) => {
                        this.toggle_components(false);
                        this.order_summary.toggle_component(true);
                        this.order_summary.load_summary_of(r.doc, true);
                        this.recent_order_list.refresh_list();
                    });
                };
            }
            
            init_recent_order_list() {
                const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                this.recent_order_list = new erpnext.PointOfSale.PastOrderList({
                    wrapper: this.$components_wrapper,
                    events: {
                        open_invoice_data: (name) => {
                            frappe.db.get_doc(doctype, name).then((doc) => {
                                this.order_summary.load_summary_of(doc);
                            });
                        },
                        reset_summary: () => this.order_summary.toggle_summary_placeholder(true),
                    },
                });
            }
            init_order_summary() {
                const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                this.order_summary = new erpnext.PointOfSale.PastOrderSummary({
                    wrapper: this.$components_wrapper,
                    events: {
                        get_frm: () => this.frm,
        
                        process_return: (name) => {
                            this.recent_order_list.toggle_component(false);
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
                            frappe.run_serially([
                                () => this.frm.refresh(name),
                                () => this.frm.call("reset_mode_of_payments"),
                                () => this.cart.load_invoice(),
                                () => this.item_selector.toggle_component(true),
                            ]);
                        },
                        delete_order: (name) => {
                            frappe.model.delete_doc(this.frm.doc.doctype, name, () => {
                                this.recent_order_list.refresh_list();
                            });
                        },
                        new_order: () => {
                            frappe.run_serially([
                                () => frappe.dom.freeze(),
                                () => this.make_new_invoice(),
                                () => this.item_selector.toggle_component(true),
                                () => frappe.dom.unfreeze(),
                            ]);
                        },
                    },
                });
            }
        

            init_recent_order_list1111() {
                super.init_recent_order_list();
                this.recent_order_list.events.open_invoice_data = (name) => {
                    const doctype = this.settings.as_sales_invoice === 1  ? "Sales Invoice" : "POS Invoice";
                    frappe.db.get_doc(doctype, name).then((doc) => {
                        this.order_summary.load_summary_of(doc);
                    });
                };
            }
        }

        const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;
        
        
        
        class MyPastOrderSummary extends OriginalPastOrderSummary {
            constructor(wrapper, args) {
                super(wrapper, args);
                this.after_submission = false;
            }
            
            
            refresh_list111() {
                frappe.dom.freeze();
                this.events.reset_summary();
                const search_term = this.search_field.get_value();
                const status = this.status_field.get_value();

                this.$invoices_container.html("");

                const server_method = (this.settings.as_sales_invoice === 1) 
                    ? "wmn.api.get_past_order_list" 
                    : "erpnext.selling.page.point_of_sale.point_of_sale.get_past_order_list";

                return frappe.call({
                    method: server_method,
                    freeze: true,
                    args: { search_term, status },
                    callback: (response) => {
                        frappe.dom.unfreeze();
                        if (response.message) {
                            response.message.forEach((invoice) => {
                                const invoice_html = this.get_invoice_html(invoice);
                                this.$invoices_container.append(invoice_html);
                            });
                        }
                    },
                });
            }

            toggle_summary_placeholder(show) {
                if (this.after_submission === true && show === true) {
                   
                    return;
                }
                super.toggle_summary_placeholder(show);
            }

            load_summary_of(doc, after_submission = false) {
                this.after_submission = after_submission;
                super.load_summary_of(doc, after_submission);
            }

            get_condition_btn_map() {
                if (this.after_submission === true) {
                    return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
                }
                return super.get_condition_btn_map();
            }
        }

        erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;
        const OriginalItemSelector = erpnext.PointOfSale.ItemSelector;
        class MyItemSelector extends OriginalItemSelector {
            constructor(wrapper, args) {
                super(wrapper, args);
            }
            filter_items({ search_term = "" } = {}) {
                if (search_term && search_term.length >= 12) {
                    return frappe.call({
                        method: "wmn.barcode_handler.custom_scan_barcode",
                        args: { search_value: search_term }
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
                                
                                // Directly set value in model to bypass selector logic constraints
                                await frappe.model.set_value(existing_item.doctype, existing_item.name, "qty", new_qty);
                                if (data.batch_no && existing_item.batch_no !== data.batch_no) {
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "batch_no", data.batch_no);
                                }
                                if (data.serial_no) {
                                    let new_serial_no = existing_item.serial_no ? existing_item.serial_no + "\n" + data.serial_no : data.serial_no;
                                    await frappe.model.set_value(existing_item.doctype, existing_item.name, "serial_no", new_serial_no);
                                }
                                // Refresh the UI components
                                pos_ctrl.update_cart_html(existing_item);
                                
                                frappe.dom.unfreeze();
                            } else {
                                this.events.item_selected({
                                    field: "qty",
                                    value: qty_value,
                                    item: {
                                        item_code: data.item_code,
                                        batch_no: data.batch_no,
                                        serial_no: data.serial_no,
                                        uom: data.uom,
                                        rate: data.price_list_rate
                                    },
                                });
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
            
        }
        // Assigning the new class back to the namespace
        erpnext.PointOfSale.ItemSelector = MyItemSelector;
        wrapper.pos = new MyPOSController(wrapper);
        window.cur_pos = wrapper.pos;
        
    });
};
