        const OriginalPastOrderList = erpnext.PointOfSale.PastOrderList;
        
        
        
        class MyPastOrderList extends OriginalPastOrderList {
            constructor(options = {}, args = {}) {
                let opts = options || {};

                if (!opts.wrapper && args && args.wrapper) {
                    opts = args;
                }

                opts.events = opts.events || {};
                super(opts);
                this.after_submission = false;
            }
            
            
            async refresh_list() {
                frappe.dom.freeze();
                this.events.reset_summary();
                const search_term = this.search_field.get_value();
                const status = this.status_field.get_value();

                this.$invoices_container.html("");

                if (!navigator.onLine && window.wmnPOSOffline) {
                    const pending = await window.wmnPOSOffline.getPendingInvoices();
                    frappe.dom.unfreeze();
                    pending.forEach((row) => {
                        const doc = row.invoice || {};
                        const invoice = {
                            name: row.offline_id,
                            customer: doc.customer,
                            grand_total: doc.grand_total,
                            status: "Offline Pending",
                            posting_date: doc.posting_date || frappe.datetime.get_today(),
                            posting_time: doc.posting_time || "",
                            currency: doc.currency,
                        };
                        const invoice_html = this.get_invoice_html(invoice);
                        this.$invoices_container.append(invoice_html);
                    });
                    return;
                }

                const server_method = (cur_pos.settings.as_sales_invoice === 1) 
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
                    error: () => frappe.dom.unfreeze(),
                });
            }

            

            
            
        }

        erpnext.PointOfSale.PastOrderList = MyPastOrderList;




