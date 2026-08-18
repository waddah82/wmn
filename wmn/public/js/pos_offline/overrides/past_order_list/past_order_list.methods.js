/* PastOrderList override methods. One ERPNext class -> one methods file. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Base = ns.Base.PastOrderList;

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
                const invoiceName = unescape($(this).attr("data-invoice-name"));
                if (!invoiceName || !me.events?.open_invoice_data) return;
                me.events.open_invoice_data(invoiceName);
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
                    this.events.open_invoice_data(result.doc.name);
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
            const serverMethod = (window.cur_pos?.settings?.as_sales_invoice === 1)
                ? "wmn.api.get_past_order_list"
                : "erpnext.selling.page.point_of_sale.point_of_sale.get_past_order_list";

            try {
                const response = await frappe.call({
                    method: serverMethod,
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

    ns.OverrideMethods.PastOrderList = { CoreMethods, UIMethods, FinalMethods, initialize };
})();
