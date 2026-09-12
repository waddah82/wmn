/* Automatic and offline receipt printing orchestration. */
        async function wmn_auto_silent_print_enabled() {
            const repo = window.WMN_POS?.Services?.Settings?.POSProfileSettings;
            const effective = repo?.getEffective?.() || {};
            if (Object.prototype.hasOwnProperty.call(effective, "enable_auto_silent_print")) {
                return cint(effective.enable_auto_silent_print || 0) === 1;
            }
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            return cint(settings.enable_auto_silent_print || 0) === 1;
        }

        async function wmn_try_auto_silent_print_after_order(doc, mode, context = {}) {
            try {
                if (!doc) return false;
                if (doc.__wmn_auto_silent_print_done) return false;

                const cashierCompletion = context?.cashier_completion === true;
                if (cashierCompletion) {
                    const repo = window.WMN_POS?.Services?.Settings?.POSProfileSettings;
                    const effective = repo?.getEffective?.(doc.pos_profile || "") || {};
                    if (!cint(effective.print_after_cashier_completion || 0)) return false;
                } else if (!(await wmn_auto_silent_print_enabled())) {
                    return false;
                }

                doc.__wmn_auto_silent_print_done = 1;
                await wmn_print_raw_receipt(doc);
                return true;
            } catch (e) {
                console.warn("WMN auto silent print failed", e);
                return false;
            }
        }

        async function wmn_try_silent_print_offline_doc(doc) {
            try {
                await wmn_print_raw_receipt(doc);
                return true;
            } catch (e) {
                console.warn("WMN silent print skipped", e);
                return false;
            }
        }

        async function wmn_try_silent_print_online_doc(doc) {
            return await wmn_try_silent_print_offline_doc(doc);
        }


        window.wmn_debug_print_format_html = async function () {
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            if (!doc) {
                console.error("WMN DEBUG: no current POS doc");
                if (window.frappe && frappe.msgprint) frappe.msgprint("No current POS doc");
                return;
            }

            try {
                const cfg = typeof wmn_get_raw_print_template === "function"
                    ? await wmn_get_raw_print_template(doc)
                    : null;

                let html = "";
                if (cfg && cfg.template && typeof wmn_render_raw_print_template === "function") {
                    html = wmn_render_raw_print_template(cfg.template, doc, cfg.printFormat || {});
                }

                html = wmn_normalize_rendered_print_html(html);
                console.log("WMN DEBUG cfg:", cfg);
                console.log("WMN DEBUG normalized html length:", html.length);
                console.log("WMN DEBUG normalized html:", html);

                const win = window.open("", "_blank");
                if (!win) {
                    if (window.frappe && frappe.msgprint) frappe.msgprint("Popup blocked. Allow popups.");
                    return;
                }

                win.document.open();
                win.document.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Print Debug</title></head><body>" + (html || "<h3 class='wmn-print-debug-empty'>HTML IS EMPTY</h3>") + "</body></html>");
                win.document.close();
            } catch (e) {
                console.error("WMN DEBUG ERROR:", e);
                if (window.frappe && frappe.msgprint) frappe.msgprint("WMN DEBUG ERROR: " + (e.message || e));
            }
        };

        async function wmn_print_offline_receipt(doc) {
            doc = doc || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc);
            if (!doc) {
                frappe.show_alert({
                    message: __("No offline invoice available to print"),
                    indicator: "orange"
                });
                return;
            }

            const cfg = typeof wmn_get_raw_print_template === "function"
                ? await wmn_get_raw_print_template(doc)
                : null;
            const template = cfg && cfg.template ? String(cfg.template || "") : "";
            if (!template.trim()) {
                frappe.msgprint({
                    title: __("Print Format Unavailable"),
                    indicator: "orange",
                    message: __("The POS Print Format is not available in offline storage yet. Sync the POS data, then try again.")
                });
                return;
            }

            const html = wmn_normalize_rendered_print_html(
                wmn_render_raw_print_template(template, doc, cfg.printFormat || {})
            );
            const fullHtml = wmn_wrap_offline_receipt_html(html, doc);

            const win = window.open("", "_blank", "width=900,height=700");

            if (!win) {
                frappe.msgprint({
                    title: __("Popup Blocked"),
                    indicator: "orange",
                    message: __("Please allow popups to print the offline receipt.")
                });
                return;
            }

            win.document.open();
            win.document.write(fullHtml);
            win.document.close();
        }

        window.wmn_print_offline_receipt = wmn_print_offline_receipt;
