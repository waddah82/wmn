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
            
            async prepare_app_defaults(data) {
                await super.prepare_app_defaults(data);
                
                let save_as_sales_invoice = 0;
                const pos_settings = await frappe.db.get_single_value('POS Settings', 'custom_u_save_as_sales_invoice');
                if (pos_settings === 1) {
                    save_as_sales_invoice = 1;
                }
                this.save_as_sales_invoice = save_as_sales_invoice;
               
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
                const doctype = this.save_as_sales_invoice ? "Sales Invoice" : "POS Invoice";
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
                super.init_recent_order_list();
                this.recent_order_list.events.open_invoice_data = (name) => {
                    const doctype = this.save_as_sales_invoice ? "Sales Invoice" : "POS Invoice";
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

        wrapper.pos = new MyPOSController(wrapper);
        window.cur_pos = wrapper.pos;
        
    });
};
