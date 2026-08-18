/* Offline/raw receipt rendering helpers. */
        function wmn_wrap_offline_receipt_html(html, doc) {
            return `
                <!doctype html>
                <html>
                    <head>
                        <meta charset="utf-8">
                        <title>${frappe.utils.escape_html((doc && (doc.name || doc.custom_offline_id)) || "Offline Receipt")}</title>
                        <style>
                            body { font-family: Arial, sans-serif; direction: rtl; font-size: 12px; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { border-bottom: 1px solid #ddd; padding: 4px; text-align: right; }
                            @media print { body { margin: 0; } }
                        </style>
                    </head>
                    <body>${html || ""}</body>
                </html>
            `;
        }

        function wmn_format_offline_raw_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return currency ? (amount + " " + currency) : amount;
        }

        function wmn_raw_receipt_pad_left(value, width) {
            value = String(value == null ? "" : value);
            if (value.length >= width) return value.slice(0, width);
            return " ".repeat(width - value.length) + value;
        }

        function wmn_raw_receipt_pad_right(value, width) {
            value = String(value == null ? "" : value);
            if (value.length >= width) return value.slice(0, width);
            return value + " ".repeat(width - value.length);
        }

        function wmn_raw_receipt_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return currency ? (amount + " " + currency) : amount;
        }

        function wmn_raw_receipt_label_amount(label, amount, currency) {
            const width = 42;
            const left = String(label || "");
            const right = wmn_raw_receipt_money(amount || 0, currency || "");
            const space = Math.max(1, width - left.length - right.length);
            return left + " ".repeat(space) + right;
        }

        function wmn_raw_receipt_center(text) {
            const width = 42;
            text = String(text || "");
            if (text.length >= width) return text;
            const left = Math.floor((width - text.length) / 2);
            return " ".repeat(left) + text;
        }

        function wmn_raw_receipt_line() {
            return "------------------------------------------";
        }

function wmn_raw_template_get_value(source, path) {
    source = source || {};
    path = String(path || "").trim();
    if (!path) return "";

    const parts = path.split(".");
    let cur = source;

    for (const part of parts) {
        const key = String(part || "").trim();
        if (!key) continue;
        if (cur === undefined || cur === null) return "";
        cur = cur[key];
    }

    if (cur === undefined || cur === null) return "";
    if (typeof cur === "number") return String(cur);
    if (typeof cur === "boolean") return cur ? "1" : "";
    if (typeof cur === "object") return JSON.stringify(cur);
    return String(cur);
}

function wmn_prepare_raw_template_doc(doc) {
    doc = doc || {};

    const postingTime = String(doc.posting_time || "");
    const postingDate = String(doc.posting_date || "");

    doc._wmn_date = doc._wmn_date || postingDate;
    doc._wmn_time_hm = doc._wmn_time_hm || postingTime.substring(0, 5);
    doc._wmn_time_hms = doc._wmn_time_hms || postingTime.substring(0, 8);
    doc._wmn_cashier = doc._wmn_cashier || doc.owner || (frappe.session && frappe.session.user) || "";
    doc._wmn_customer = doc._wmn_customer || doc.customer_name || doc.customer || "";
    doc._wmn_grand_total = doc._wmn_grand_total || doc.grand_total || doc.rounded_total || 0;
    doc._wmn_paid_amount = doc._wmn_paid_amount || doc.paid_amount || 0;

    return doc;
}

function wmn_replace_raw_object_fields(html, alias, row) {
    const re = new RegExp("{{\\\\s*" + alias + "\\\\.([a-zA-Z0-9_]+(?:\\\\.[a-zA-Z0-9_]+)*)\\\\s*}}", "g");
    return String(html || "").replace(re, function (_match, path) {
        return wmn_raw_template_get_value(row, path);
    });
}

function wmn_replace_raw_doc_fields(html, doc) {
    return wmn_replace_raw_object_fields(html, "doc", doc || {});
}

function wmn_render_raw_print_temp(template, doc) {

    doc = doc || {};
    const currency = doc.currency || doc.company_currency || "YER";

    function rawValue(value) {
        if (value === undefined || value === null) return "";
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return value ? "1" : "";
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    }

    function moneyValue(value) {
        return flt(value || 0).toFixed(2) + (currency ? " " + currency : "");
    }

    function numberValue(value, digits) {
        return flt(value || 0).toFixed(digits == null ? 2 : cint(digits));
    }

    function padLeft(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        return " ".repeat(width - value.length) + value;
    }

    function padRight(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        return value + " ".repeat(width - value.length);
    }

    function padCenter(value, width) {
        value = rawValue(value);
        width = cint(width || 0);
        if (!width || value.length >= width) return value;
        const total = width - value.length;
        const left = Math.floor(total / 2);
        const right = total - left;
        return " ".repeat(left) + value + " ".repeat(right);
    }

    function getPath(scope, path) {
        path = String(path || "").trim();
        if (!path) return "";

        if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
            return path.slice(1, -1);
        }

        if (/^-?\d+(\.\d+)?$/.test(path)) return flt(path);

        const parts = path.split(".").map(x => x.trim()).filter(Boolean);
        let cur = scope;
        for (const part of parts) {
            if (cur == null) return "";
            cur = cur[part];
        }
        return cur == null ? "" : cur;
    }

    function applyFilters(value, filters) {
        let out = value;
        (filters || []).forEach(function(filterRaw) {
            const filter = String(filterRaw || "").trim();
            if (!filter) return;

            let m = filter.match(/^(l|left)(\d+)$/i);
            if (m) { out = padRight(out, m[2]); return; }

            m = filter.match(/^(r|right)(\d+)$/i);
            if (m) { out = padLeft(out, m[2]); return; }

            m = filter.match(/^(c|center)(\d+)$/i);
            if (m) { out = padCenter(out, m[2]); return; }

            if (/^(money|currency)$/i.test(filter)) { out = moneyValue(out); return; }
            if (/^(number|f2)$/i.test(filter)) { out = numberValue(out, 2); return; }
            if (/^(qty|f1)$/i.test(filter)) { out = numberValue(out, 1); return; }
            if (/^int$/i.test(filter)) { out = String(cint(out || 0)); return; }
            if (/^hm$/i.test(filter)) { out = rawValue(out).substring(0, 5); return; }
            if (/^hms$/i.test(filter)) { out = rawValue(out).substring(0, 8); return; }
            if (/^upper$/i.test(filter)) { out = rawValue(out).toUpperCase(); return; }
            if (/^lower$/i.test(filter)) { out = rawValue(out).toLowerCase(); return; }
        });
        return rawValue(out);
    }

    function renderExpression(expr, scope) {
        expr = String(expr || "").trim();
        if (!expr) return "";

        if (/^_\(['"]([^'"]+)['"]\)$/.test(expr)) {
            return __(expr.match(/^_\(['"]([^'"]+)['"]\)$/)[1]);
        }

        const parts = expr.split("|").map(x => x.trim());
        const base = parts.shift();
        const value = getPath(scope, base);
        return applyFilters(value, parts);
    }

    function evalCondition(condition, scope) {
        condition = String(condition || "").trim();
        if (!condition) return false;
        if (condition.startsWith("not ")) return !evalCondition(condition.slice(4), scope);
        if (condition.indexOf(" and ") !== -1) return condition.split(/\s+and\s+/).every(x => evalCondition(x, scope));
        if (condition.indexOf(" or ") !== -1) return condition.split(/\s+or\s+/).some(x => evalCondition(x, scope));

        let m = condition.match(/^(.*?)\s*!=\s*(.*?)$/);
        if (m) return rawValue(getPath(scope, m[1])) !== rawValue(getPath(scope, m[2]));

        m = condition.match(/^(.*?)\s*==\s*(.*?)$/);
        if (m) return rawValue(getPath(scope, m[1])) === rawValue(getPath(scope, m[2]));

        return !!getPath(scope, condition);
    }

    function renderBlock(text, scope) {
        text = String(text || "");

        text = text.replace(
            /\{%-?\s*for\s+(\w+)\s+in\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}/g,
            function (_m, varName, collectionExpr, body) {
                const rows = getPath(scope, collectionExpr.trim()) || [];
                if (!Array.isArray(rows)) return "";
                return rows.map(function(row) {
                    const childScope = Object.assign({}, scope);
                    childScope[varName] = row || {};
                    return renderBlock(body, childScope);
                }).join("");
            }
        );

        text = text.replace(
            /\{%-?\s*if\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g,
            function (_m, condition, body) {
                return evalCondition(condition, scope) ? renderBlock(body, scope) : "";
            }
        );

        text = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_m, expr) {
            return renderExpression(expr, scope);
        });

        return text;
    }

    doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || doc.name || "";
    doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || "";
    doc.posting_time_hm = String(doc.posting_time || "").substring(0, 5);
    doc.posting_time_hms = String(doc.posting_time || "").substring(0, 8);

    let html = renderBlock(template || "", { doc: doc });
    html = html.replace(/\{%-?[\s\S]*?-?%\}/g, "");
    html = html.replace(/<[^>]*>/g, "");

    const cleanedLines = [];
    let lastWasEmpty = false;
    String(html || "").replace(/\r/g, "").split("\n").forEach(function(line) {
        line = line.replace(/[\t ]+$/g, "");
        const isEmpty = line.trim() === "";
        if (isEmpty && lastWasEmpty) return;
        cleanedLines.push(line);
        lastWasEmpty = isEmpty;
    });

    return cleanedLines.join("\n").trim();

}

        function wmn_build_offline_raw_receipt_text(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const currency = doc.currency || settings.currency || "";
            const lines = [];

            const company = doc.company || settings.company || "";
            const heading = doc.select_print_heading || "Invoice";
            const receiptNo = doc.name || doc.custom_offline_id || "";
            const cashier = doc.owner || frappe.session.user || "";
            const customer = doc.customer_name || doc.customer || "";
            const postingDate = doc.posting_date || frappe.datetime.get_today();
            const postingTime = doc.posting_time || "";

            if (company) lines.push(wmn_raw_receipt_center(company));
            lines.push(wmn_raw_receipt_center(heading));
            lines.push("");

            lines.push("Receipt No: " + receiptNo);
            lines.push("Cashier: " + cashier);
            lines.push("Customer: " + customer);
            lines.push("Date: " + postingDate);
            if (postingTime) lines.push("Time: " + postingTime);

            lines.push(wmn_raw_receipt_line());
            lines.push(
                wmn_raw_receipt_pad_right("Item", 20) +
                wmn_raw_receipt_pad_left("Qty", 7) +
                wmn_raw_receipt_pad_left("Amount", 15)
            );
            lines.push(wmn_raw_receipt_line());

            (doc.items || []).forEach(function (item) {
                const code = item.item_code || "";
                const name = item.item_name || "";
                const label = code || name;
                const qtyRate = flt(item.qty || 0) + " @ " + wmn_raw_receipt_money(item.rate || 0, currency);
                const amount = wmn_raw_receipt_money(item.amount || item.net_amount || 0, currency);

                lines.push(
                    wmn_raw_receipt_pad_right(label, 20) +
                    wmn_raw_receipt_pad_left(flt(item.qty || 0), 7) +
                    wmn_raw_receipt_pad_left(amount, 15)
                );

                if (name && name !== code) {
                    lines.push("  " + name);
                }

                lines.push("  @ " + wmn_raw_receipt_money(item.rate || 0, currency));

                if (item.serial_no) {
                    lines.push("  SR.No: " + String(item.serial_no || "").replace(/\n/g, ", "));
                }
            });

            lines.push(wmn_raw_receipt_line());

            if (doc.flags && doc.flags.show_inclusive_tax_in_print) {
                lines.push(wmn_raw_receipt_label_amount("Total Excl. Tax", doc.net_total || 0, currency));
            } else {
                lines.push(wmn_raw_receipt_label_amount("Total", doc.total || doc.net_total || 0, currency));
            }

            (doc.taxes || []).forEach(function (row) {
                if (row.included_in_print_rate && !(doc.flags && doc.flags.show_inclusive_tax_in_print)) {
                    return;
                }

                const amount = flt(row.tax_amount_after_discount_amount || row.tax_amount || 0);
                if (!amount) return;

                let description = row.description || row.account_head || "Tax";
                if (description.indexOf("%") === -1 && flt(row.rate || 0)) {
                    description = description + "@" + flt(row.rate || 0) + "%";
                }

                lines.push(wmn_raw_receipt_label_amount(description, amount, currency));
            });

            if (flt(doc.discount_amount || 0)) {
                const discountLabel = doc.__wmn_coupon_code
                    ? `${__("Coupon")} ${doc.__wmn_coupon_code}`
                    : __("Discount");
                lines.push(wmn_raw_receipt_label_amount(discountLabel, doc.discount_amount || 0, currency));
            }

            lines.push(wmn_raw_receipt_label_amount("Grand Total", doc.grand_total || 0, currency));

            if (flt(doc.rounded_total || 0)) {
                lines.push(wmn_raw_receipt_label_amount("Rounded Total", doc.rounded_total || 0, currency));
            }

            (doc.payments || []).forEach(function (row) {
                if (!row || !row.mode_of_payment) return;
                lines.push(wmn_raw_receipt_label_amount(row.mode_of_payment, row.amount || 0, currency));
            });

            lines.push(wmn_raw_receipt_label_amount("Paid Amount", doc.paid_amount || 0, currency));

            if (flt(doc.change_amount || 0)) {
                lines.push(wmn_raw_receipt_label_amount("Change Amount", doc.change_amount || 0, currency));
            }

            lines.push(wmn_raw_receipt_line());

            if (doc.terms) {
                lines.push(String(doc.terms || ""));
            }

            lines.push(wmn_raw_receipt_center("Thank you, please visit again."));
            lines.push("\n\n\n");

            return lines.filter(function (line) {
                return line !== null && line !== undefined;
            }).join("\n");
        }

