/* Automatic and offline receipt printing orchestration. */
        async function wmn_auto_silent_print_enabled() {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            return !!(settings.enable_auto_silent_print || settings.enable_auto_silent_print == 1);
        }

        async function wmn_try_auto_silent_print_after_order(doc) {
            try {
                if (!doc) return false;
                if (doc.__wmn_auto_silent_print_done) return false;
                if (!(await wmn_auto_silent_print_enabled())) return false;

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

        function wmn_try_silent_print_offline_html(fullHtml, doc) {
            wmn_try_silent_print_offline_doc(doc).catch(function (e) {
                console.warn("WMN silent print skipped", e);
            });
            return true;
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
                win.document.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Print Debug</title></head><body>" + (html || "<h3 style='color:red'>HTML IS EMPTY</h3>") + "</body></html>");
                win.document.close();
            } catch (e) {
                console.error("WMN DEBUG ERROR:", e);
                if (window.frappe && frappe.msgprint) frappe.msgprint("WMN DEBUG ERROR: " + (e.message || e));
            }
        };

async function wmn_get_offline_print_template_from_pos_profile() {
    if (!window.wmnPOSOffline || !window.wmnPOSOffline.getFullSettings) {
        return "";
    }

    const settings = await window.wmnPOSOffline.getFullSettings();

    return (
        settings.custom_offline_print_template ||
        settings.offline_print_template ||
        ""
    );
}



async function wmn_print_offline_receipt_with_pos_profile_template(template, doc) {
    const html = wmn_render_offline_print_template(template, doc);
    const fullHtml = wmn_wrap_offline_receipt_html(html, doc);

    if (wmn_try_silent_print_offline_html(fullHtml, doc)) {
        return;
    }

    const win = window.open("", "_blank");

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
    win.focus();

    setTimeout(() => {
        win.print();
    }, 300);
}







function wmn_render_offline_print_template(template, doc) {
    const currency = doc.currency || "YER";
    
    function get_formatted(doc, fieldname) {
        const value = doc[fieldname];
        if (value === undefined || value === null) return "";
        
        const field = frappe.meta.get_field(doc.doctype, fieldname);
        if (field && field.fieldtype === "Currency") {
            return format_currency(flt(value), currency);
        }
        if (field && field.fieldtype === "Date") {
            return frappe.datetime.str_to_user(value);
        }
        if (field && field.fieldtype === "Time") {
            return value;
        }
        return value;
    }
    
    function process_item(item, doc) {
        let html = `
            <tr>
                <td>
                    ${frappe.utils.escape_html(item.item_code || "")}
                    ${(item.item_name && item.item_name !== item.item_code) ? `<br>${frappe.utils.escape_html(item.item_name)}` : ""}
                    ${item.serial_no ? `<br><b>SR.No:</b><br>${frappe.utils.escape_html(item.serial_no.replace(/\n/g, ", "))}` : ""}
                </td>
                <td class="text-right">${flt(item.qty || 0)}<br>@ ${format_currency(flt(item.rate || 0), currency)}</td>
                <td class="text-right">${format_currency(flt(item.amount || 0), currency)}</td>
            </tr>
        `;
        return html;
    }
    
    function process_taxes(doc) {
        let taxesHtml = "";
        (doc.taxes || []).forEach(row => {
            if (!row.included_in_print_rate || doc.flags?.show_inclusive_tax_in_print) {
                let description = row.description || "";
                if (!description.includes('%') && row.rate) {
                    description = `${description}@${row.rate}%`;
                }
                taxesHtml += `
                    <tr>
                        <td class="text-right" style="width: 70%">${frappe.utils.escape_html(description)}</td>
                        <td class="text-right">${format_currency(flt(row.tax_amount || 0), currency)}</td>
                    </tr>
                `;
            }
        });
        return taxesHtml;
    }
    
    function process_payments(doc) {
        let paymentsHtml = "";
        (doc.payments || []).forEach(row => {
            paymentsHtml += `
                <tr>
                    <td class="text-right" style="width: 70%">${frappe.utils.escape_html(row.mode_of_payment || "")}</td>
                    <td class="text-right">${format_currency(flt(row.amount || 0), currency)}</td>
                </tr>
            `;
        });
        return paymentsHtml;
    }
    
    const itemsHtml = (doc.items || []).map(item => process_item(item, doc)).join("");
    const taxesHtml = process_taxes(doc);
    const paymentsHtml = process_payments(doc);
    
    let html = template || "";
    
    html = html.replace(/\{\%-?\s*for\s+item\s+in\s+doc\.items\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, itemsHtml);
    html = html.replace(/\{\%-?\s*for\s+row\s+in\s+doc\.taxes\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, taxesHtml);
    html = html.replace(/\{\%-?\s*for\s+row\s+in\s+doc\.payments\s*-?\%\}([\s\S]*?)\{\%-?\s*endfor\s*-?\%\}/g, paymentsHtml);
    
    html = html.replace(/\{\%\s*if\s+letter_head\s*\%\}([\s\S]*?)\{\%\s*endif\s*\%\}/g, "");
    
    html = html.replace(/\{\{\s*doc\.get_formatted\("([^"]+)"\)\s*\}\}/g, (match, fieldname) => {
        return get_formatted(doc, fieldname);
    });
    
    html = html.replace(/\{\{\s*doc\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        const value = doc[fieldname];
        if (value === undefined || value === null) return "";
        if (typeof value === "object") return JSON.stringify(value);
        return frappe.utils.escape_html(String(value));
    });
    
    html = html.replace(/\{\{\s*item\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        return `{{ item.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*row\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, fieldname) => {
        return `{{ row.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\.get_formatted\("([^"]+)"\)\s*\}\}/g, (match, obj, fieldname) => {
        return `{{ ${obj}.${fieldname} }}`;
    });
    
    html = html.replace(/\{\{\s*([^|]+)\s*\|\s*replace\("([^"]+)",\s*"([^"]+)"\)\s*\}\}/g, (match, value, search, replace) => {
        return String(value || "").split(search).join(replace);
    });
    
    const simpleReplacements = {
        "doc.name": doc.name || doc.custom_offline_id || "",
        "doc.company": doc.company || "",
        "doc.customer_name": doc.customer_name || doc.customer || "",
        "doc.owner": doc.owner || frappe.session?.user || "",
        "doc.posting_date": doc.posting_date || "",
        "doc.posting_time": doc.posting_time || "",
        "doc.total": format_currency(flt(doc.total || 0), currency),
        "doc.net_total": format_currency(flt(doc.net_total || 0), currency),
        "doc.grand_total": format_currency(flt(doc.grand_total || 0), currency),
        "doc.rounded_total": format_currency(flt(doc.rounded_total || 0), currency),
        "doc.paid_amount": format_currency(flt(doc.paid_amount || 0), currency),
        "doc.change_amount": format_currency(flt(doc.change_amount || 0), currency),
        "doc.discount_amount": format_currency(flt(doc.discount_amount || 0), currency),
        "doc.__wmn_coupon_code": doc.__wmn_coupon_code || "",
        "doc.terms": doc.terms || "",
        "doc.select_print_heading": doc.select_print_heading || __("Invoice"),
    };
    
    Object.keys(simpleReplacements).forEach(key => {
        const re = new RegExp("\\{\\{\\s*" + key.replace(".", "\\.") + "\\s*\\}\\}", "g");
        html = html.replace(re, simpleReplacements[key]);
    });
    
    html = html.replace(/\{\{\s*_\(\"([^\"]+)\"\)\s*\}\}/g, (match, text) => __(text));
    
    html = html.replace(/\{\{[^{}]+\}\}/g, (match) => {
        if (match.includes("item.") || match.includes("row.")) return match;
        return "";
    });
    
    return html;
}









        function wmn_build_offline_receipt_html(doc) {
            doc = doc || {};
            const currency = doc.currency || "";
            const company = doc.company || "";
            const customer = doc.customer_name || doc.customer || "";
            const invoiceNo = doc.name || doc.offline_id || "";
            const date = doc.posting_date || frappe.datetime.get_today();
            const time = doc.posting_time || "";
            const posProfile = doc.pos_profile || "";
            const cashier = (frappe.session && frappe.session.user_fullname) || (frappe.session && frappe.session.user) || "";

            const items = (doc.items || []).map((row, idx) => {
                const name = row.item_name || row.item_code || "";
                const qty = flt(row.qty || 0);
                const uom = row.uom || row.stock_uom || "";
                const rate = flt(row.rate || row.price_list_rate || 0);
                const amount = flt(row.amount || (qty * rate));
                const batch = row.batch_no ? `<div class="muted">${__("Batch No")}: ${wmn_escape_html(row.batch_no)}</div>` : "";
                const serial = row.serial_no ? `<div class="muted">${__("Serial No")}: ${wmn_escape_html(row.serial_no)}</div>` : "";

                return `
                    <tr>
                        <td class="num">${idx + 1}</td>
                        <td>
                            <div class="item-name">${wmn_escape_html(name)}</div>
                            ${batch}
                            ${serial}
                        </td>
                        <td class="center">${qty} ${wmn_escape_html(uom)}</td>
                        <td class="money">${wmn_money(rate, currency)}</td>
                        <td class="money">${wmn_money(amount, currency)}</td>
                    </tr>
                `;
            }).join("");

            const payments = (doc.payments || [])
                .filter(p => flt(p.amount || 0) > 0)
                .map(p => `
                    <tr>
                        <td>${wmn_escape_html(p.mode_of_payment || "")}</td>
                        <td class="money">${wmn_money(p.amount || 0, currency)}</td>
                    </tr>
                `).join("");

            const taxes = (doc.taxes || [])
                .filter(t => flt(t.tax_amount || t.base_tax_amount || 0) !== 0)
                .map(t => `
                    <tr>
                        <td>${wmn_escape_html(t.description || t.account_head || "")}</td>
                        <td class="money">${wmn_money(t.tax_amount || t.base_tax_amount || 0, currency)}</td>
                    </tr>
                `).join("");

            return `<!doctype html>
<html dir="${document.documentElement.dir || "auto"}">
<head>
<meta charset="utf-8">
<title>${wmn_escape_html(invoiceNo)}</title>
<style>
    @page { size: auto; margin: 10mm; }
    body {
        font-family: Arial, Tahoma, sans-serif;
        color: #111827;
        margin: 0;
        padding: 0;
        font-size: 13px;
        direction: ${document.documentElement.dir === "rtl" ? "rtl" : "ltr"};
    }
    .receipt {
        max-width: 760px;
        margin: 0 auto;
        padding: 16px;
    }
    .header {
        text-align: center;
        border-bottom: 2px solid #111827;
        padding-bottom: 10px;
        margin-bottom: 12px;
    }
    .company { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .title { font-size: 15px; font-weight: 700; color: #374151; }
    .meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 16px;
        margin: 12px 0;
        background: #f3f4f6;
        border-radius: 10px;
        padding: 10px;
    }
    .meta div { display: flex; justify-content: space-between; gap: 8px; }
    .label { color: #6b7280; font-weight: 700; }
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
    th {
        background: #111827;
        color: #fff;
        padding: 8px;
        border: 1px solid #111827;
        text-align: start;
    }
    td {
        padding: 8px;
        border: 1px solid #d1d5db;
        vertical-align: top;
    }
    .num { width: 36px; text-align: center; }
    .center { text-align: center; white-space: nowrap; }
    .money { text-align: end; white-space: nowrap; }
    .item-name { font-weight: 700; }
    .muted { color: #6b7280; font-size: 11px; margin-top: 2px; }
    .totals {
        margin-top: 12px;
        margin-inline-start: auto;
        width: 320px;
    }
    .totals td { font-weight: 700; }
    .grand td {
        font-size: 16px;
        background: #f3f4f6;
    }
    .footer {
        text-align: center;
        color: #6b7280;
        margin-top: 18px;
        border-top: 1px dashed #9ca3af;
        padding-top: 10px;
        font-size: 12px;
    }
    @media print {
        .no-print { display: none !important; }
        body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
</style>
</head>
<body>
<div class="receipt">
    <div class="header">
        <div class="company">${wmn_escape_html(company)}</div>
        <div class="title">${__("Offline POS Receipt")}</div>
    </div>

    <div class="meta">
        <div><span class="label">${__("Invoice")}</span><span>${wmn_escape_html(invoiceNo)}</span></div>
        <div><span class="label">${__("Date")}</span><span>${wmn_escape_html(date)} ${wmn_escape_html(time)}</span></div>
        <div><span class="label">${__("Customer")}</span><span>${wmn_escape_html(customer)}</span></div>
        <div><span class="label">${__("Cashier")}</span><span>${wmn_escape_html(cashier)}</span></div>
        <div><span class="label">${__("POS Profile")}</span><span>${wmn_escape_html(posProfile)}</span></div>
        <div><span class="label">${__("Status")}</span><span>${__("Saved Offline")}</span></div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="num">#</th>
                <th>${__("Item")}</th>
                <th class="center">${__("Qty")}</th>
                <th class="money">${__("Rate")}</th>
                <th class="money">${__("Amount")}</th>
            </tr>
        </thead>
        <tbody>
            ${items || `<tr><td colspan="5" class="center">${__("No items")}</td></tr>`}
        </tbody>
    </table>

    ${taxes ? `
    <table class="totals">
        <tbody>
            ${taxes}
        </tbody>
    </table>` : ""}

    <table class="totals">
        <tbody>
            <tr>
                <td>${__("Net Total")}</td>
                <td class="money">${wmn_money(doc.net_total || doc.total || 0, currency)}</td>
            </tr>
            <tr class="grand">
                <td>${__("Grand Total")}</td>
                <td class="money">${wmn_money(doc.grand_total || doc.rounded_total || 0, currency)}</td>
            </tr>
            <tr>
                <td>${__("Paid Amount")}</td>
                <td class="money">${wmn_money(doc.paid_amount || 0, currency)}</td>
            </tr>
        </tbody>
    </table>

    ${payments ? `
    <table>
        <thead>
            <tr>
                <th>${__("Mode of Payment")}</th>
                <th class="money">${__("Amount")}</th>
            </tr>
        </thead>
        <tbody>${payments}</tbody>
    </table>` : ""}

    <div class="footer">
        ${__("This receipt was generated offline and will be synced when connection is available.")}
    </div>
</div>
<script>
    window.onload = function() {
        setTimeout(function() {
            window.focus();
            window.print();
        }, 250);
    };
</script>
</body>
</html>`;
        }

        async function wmn_print_offline_receipt(doc) {
            doc = doc || (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc);
            if (!doc) {
                frappe.show_alert({
                    message: __("No offline invoice available to print"),
                    indicator: "orange"
                });
                return;
            }
            const template = await wmn_get_offline_print_template_from_pos_profile();

            if (template) {
                return window.wmn_print_offline_receipt_with_pos_profile_template(template, doc);
            }

            const html = wmn_build_offline_receipt_html(doc);
            const fullHtml = wmn_wrap_offline_receipt_html(html, doc);

            if (wmn_try_silent_print_offline_html(fullHtml, doc)) {
                return;
            }

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
        window.wmn_print_offline_receipt_with_pos_profile_template = wmn_print_offline_receipt_with_pos_profile_template;
