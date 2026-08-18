/* POS mode/settings shared by explicit online/offline adapters. */
        async function wmn_get_offline_settings() {
            const saved = window.wmnPOSOffline && window.wmnPOSOffline.getSetting
                ? await window.wmnPOSOffline.getSetting("full_settings")
                : {};
            const live = (window.cur_pos && window.cur_pos.settings) || {};
            const doc = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc) || {};
            return Object.assign({}, saved || {}, live || {}, {
                company: doc.company || live.company || (saved && saved.company) || frappe.defaults.get_default("company") || "",
                currency: doc.currency || live.currency || live.company_currency || (saved && (saved.currency || saved.company_currency)) || frappe.defaults.get_default("currency") || "YER",
                selling_price_list: doc.selling_price_list || live.selling_price_list || (saved && saved.selling_price_list) || "",
                warehouse: doc.set_warehouse || live.warehouse || (saved && saved.warehouse) || "",
                pos_profile: doc.pos_profile || live.pos_profile || (saved && (saved.pos_profile || saved.name)) || "",
                customer: doc.customer || live.customer || (saved && saved.customer) || "Guest",
            });
        }

        async function wmn_is_partial_payment_allowed(ctrl) {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) {
                const cached = window.wmnPOSOffline && window.wmnPOSOffline.getSetting
                    ? await window.wmnPOSOffline.getSetting("full_settings")
                    : null;

                if (cached && Object.prototype.hasOwnProperty.call(cached, "allow_partial_payment")) {
                    return cint(cached.allow_partial_payment || 0) === 1;
                }
            }

            const live = (ctrl && ctrl.settings) || (window.cur_pos && window.cur_pos.settings) || {};
            if (Object.prototype.hasOwnProperty.call(live, "allow_partial_payment")) {
                return cint(live.allow_partial_payment || 0) === 1;
            }

            const saved = await wmn_get_offline_settings();
            return cint((saved && saved.allow_partial_payment) || 0) === 1;
        }

        function wmn_current_doc_is_offline_pos() {
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            return !!(doc && (doc.__offline_pos || doc.offline_pos || String(doc.name || "").startsWith("OFFLINE-")));
        }

        function wmn_is_offline_invoice_doc_object(doc) {
            doc = doc || {};
            return !!(
                doc.__offline_pos ||
                doc.offline_pos ||
                doc.__is_offline_pos ||
                String(doc.name || "").startsWith("OFFLINE-") ||
                String(doc.custom_offline_id || "").startsWith("POS-OFF-")
            );
        }

        function wmn_controller_uses_offline_flow(ctrl) {
            const doc = ctrl && ctrl.frm && ctrl.frm.doc ? ctrl.frm.doc : (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null);
            return !!(
                (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) ||
                wmn_is_offline_invoice_doc_object(doc) ||
                (ctrl && ctrl.frm && ctrl.frm.__wmn_fake_offline_frm)
            );
        }

        window.__wmn_pos_effective_offline = window.__wmn_pos_effective_offline === true;

        window.wmn_is_pos_offline = function () {
            return (
                window.__wmn_pos_effective_offline === true ||
                navigator.onLine === false
            );
        };

        function wmn_is_pos_offline() {
            return window.wmn_is_pos_offline();
        }


