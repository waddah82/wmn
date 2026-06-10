(function () {
    const OriginalPastOrderList = erpnext.PointOfSale.PastOrderList;

    function wmn_past_order_is_offline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
            if (window.__wmn_pos_effective_offline === true) return true;
            if (navigator.onLine === false) return true;
        } catch (e) {}
        return false;
    }

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
                if (wmn_past_order_is_offline()) return;

                const invoice_name = unescape($(this).attr("data-invoice-name"));
                me.events.open_invoice_data(invoice_name);
            });
        }

        refresh_list() {
            if (wmn_past_order_is_offline()) {
                if (this.events && this.events.reset_summary) {
                    this.events.reset_summary();
                }
                if (this.$invoices_container) {
                    this.$invoices_container.html("");
                }
                return Promise.resolve([]);
            }

            frappe.dom.freeze();
            this.events.reset_summary();
            const search_term = this.search_field.get_value();
            const status = this.status_field.get_value();

            this.$invoices_container.html("");

            const server_method = (cur_pos && cur_pos.settings && cur_pos.settings.as_sales_invoice === 1)
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
})();
