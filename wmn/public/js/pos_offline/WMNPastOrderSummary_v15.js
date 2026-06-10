/*
 * WMNOrderSummary_v15_SAFE.js
 * Version-specific wrapper for ERPNext v15 POS PastOrderSummary.
 * Online: original v15 behavior is preserved.
 * Offline: blocks server/form calls in summary only; invoice edit/delete/sync stay in Offline Dialog / controller.
 */
(function () {
    const OriginalPastOrderSummary = erpnext.PointOfSale.PastOrderSummary;

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

    class MyPastOrderSummary extends OriginalPastOrderSummary {
        constructor(options = {}, args = {}) {
            let opts = options || {};
            if (!opts.wrapper && args && args.wrapper) opts = args;
            opts.settings = wmn_safe_settings(
                opts.settings ||
                (window.cur_pos && window.cur_pos.settings) ||
                {}
            );
            opts.events = opts.events || {};
            super(opts);
            this.after_submission = false;
        }

        toggle_summary_placeholder(show) {
            if (this.after_submission === true && show === true) return;
            return super.toggle_summary_placeholder(show);
        }

        load_summary_of(doc, after_submission = false) {
            this.after_submission = after_submission;
            return super.load_summary_of(doc, after_submission);
        }

        get_condition_btn_map(after_submission) {
            if (this.after_submission === true || after_submission === true) {
                return [{ condition: true, visible_btns: ["Print Receipt", "Email Receipt", "New Order"] }];
            }
            return super.get_condition_btn_map(after_submission);
        }

        attach_document_info(doc) {
            if (!wmn_summary_is_offline()) {
                return super.attach_document_info(doc);
            }

            this.customer_email = wmn_summary_customer_email(doc);
            const upper_section_dom = this.get_upper_section_html(doc || this.doc || {});
            this.$upper_section.html(upper_section_dom);
        }

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
        }

        send_email() {
            if (wmn_summary_is_offline()) {
                frappe.show_alert({ message: __("Email receipt is not available while offline."), indicator: "orange" });
                if (this.email_dialog) this.email_dialog.hide();
                return;
            }
            return super.send_email();
        }
    }

    erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;
})();
