frappe.ui.form.on('Statement of Account', {
    refresh: function (frm) {
        frm.clear_custom_buttons();

        if (frm.doc.party_type === "Customer" && frm.doc.party && frm.doc.from_date && frm.doc.to_date) {
            frm.add_custom_button(__('عرض أعمار الديون'), function () {
                fetch_statement_data(frm, true);
            }, __('إجراءات'));
        }
    },

    party: function (frm) {
        run_script_if_ready(frm);
    },

    from_date: function (frm) {
        run_script_if_ready(frm);
    },

    to_date: function (frm) {
        run_script_if_ready(frm);
    },

    use_transaction_currency: function (frm) {
        run_script_if_ready(frm);
    },

    currency: function (frm) {
        run_script_if_ready(frm);
    },

    party_type: function (frm) {
        if (frm.doc.entries && frm.doc.entries.length > 0) {
            frappe.confirm(
                __('تغيير نوع الطرف سيؤدي إلى مسح البيانات الحالية. هل تريد المتابعة؟'),
                function () {
                    clear_party_and_entries(frm);
                },
                function () { }
            );
        } else {
            clear_party_and_entries(frm);
        }
    }
});

function run_script_if_ready(frm) {
    if (!frm.doc.party || !frm.doc.from_date || !frm.doc.to_date) {
        return;
    }

    if (frm.doc.from_date > frm.doc.to_date) {
        frappe.msgprint(__('تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية'));
        return;
    }

    fetch_statement_data(frm, false);
}

function fetch_statement_data(frm, show_aging_only) {
    if (show_aging_only === undefined) {
        show_aging_only = false;
    }

    if (!show_aging_only) {
        frm.clear_table("entries");
        frm.refresh_field("entries");
        frm.set_value("aging", "");
    }

    frappe.call({
        method: "wmn.statement_report.get_statement_report",
        args: {
            party_type: frm.doc.party_type,
            party: frm.doc.party,
            from_date: frm.doc.from_date,
            to_date: frm.doc.to_date,
            currency: frm.doc.currency,
            use_transaction_currency: frm.doc.use_transaction_currency ? 1 : 0
        },
        freeze: true,
        freeze_message: __('جاري جلب كشف الحساب...'),
        callback: function (r) {
            var msg = r.message;

            if (!msg || msg.ok === false) {
                frappe.msgprint(__('تعذّر جلب البيانات: ') + ((msg && msg.error) || __('تحقق من القيم')));
                return;
            }

            if (frm.doc.party_type === "Customer" && msg.aging_summary) {
                update_aging_field_text(frm, msg.aging_summary);

                if (show_aging_only) {
                    show_aging_dialog(msg.aging_summary, frm);
                    return;
                }
            } else if (show_aging_only) {
                frappe.msgprint(__('لا توجد بيانات أعمار متاحة'));
                return;
            }

            if (!show_aging_only) {
                frm.clear_table("entries");

                if (Array.isArray(msg.data)) {
                    msg.data.forEach(function (row) {
                        var child = frm.add_child("entries");

                        child.date = row.posting_date || "";
                        child.voucher_type = row.voucher_subtype || "";
                        child.voucher_no = row.voucher_no || "";
                        child.remarks = row.remarks || "";

                        child.exchange_rate = flt0(row.exchange_rate);
                        child.running_balance = flt0(row.running_balance);

                        if (frm.doc.use_transaction_currency) {
                            child.currency = row.currency || frm.doc.currency || get_default_currency();
                            child.debit = flt0(row.debit_in_transaction_currency);
                            child.credit = flt0(row.credit_in_transaction_currency);
                            child.debit_in_transaction_currency = flt0(row.debit_in_transaction_currency);
                            child.credit_in_transaction_currency = flt0(row.credit_in_transaction_currency);
                        } else {
                            child.currency = row.currency || frm.doc.currency || get_default_currency();
                            child.debit = flt0(row.debit);
                            child.credit = flt0(row.credit);
                            child.debit_in_transaction_currency = flt0(row.debit_in_transaction_currency);
                            child.credit_in_transaction_currency = flt0(row.credit_in_transaction_currency);
                        }
                    });
                }

                frm.refresh_field("entries");
                make_voucher_links(frm);
            }
        }
    });
}

function make_voucher_links(frm) {
    if (!frm.fields_dict.entries || !frm.fields_dict.entries.grid) {
        return;
    }

    setTimeout(function () {
        (frm.doc.entries || []).forEach(function (row) {
            if (!row.name || !row.voucher_no) {
                return;
            }

            var route_doctype = get_doctype_route_from_backend(row.voucher_type, row.voucher_type);
            if (!route_doctype) {
                return;
            }

            var grid_row = frm.fields_dict.entries.grid.grid_rows_by_docname[row.name];
            if (!grid_row || !grid_row.columns || !grid_row.columns.voucher_no) {
                return;
            }

            var link = '/app/' + get_doctype_route(route_doctype) + '/' + encodeURIComponent(row.voucher_no);
            grid_row.columns.voucher_no.df.options = row.voucher_no;
            $(grid_row.columns.voucher_no.field_area).html(
                '<a href="' + link + '" target="_blank">' + escape_html(row.voucher_no) + '</a>'
            );
        });
    }, 300);
}

function update_aging_field_text(frm, aging_summary) {
    if (!aging_summary || typeof aging_summary !== "object") {
        frm.set_value("aging", "");
        return;
    }

    if (aging_summary.message) {
        frm.set_value("aging", aging_summary.message);
        return;
    }

    if (aging_summary.error) {
        frm.set_value("aging", aging_summary.error);
        return;
    }

    var aging_text = "";
    var has_aging_data = false;

    var periods = [
        { key: "0-30", label: "(-30)" },
        { key: "31-60", label: "(30+)" },
        { key: "61-90", label: "(60+)" },
        { key: "91-120", label: "(90+)" },
        { key: "121+", label: "(120+)" }
    ];

    periods.forEach(function (period) {
        var amount = flt0(aging_summary[period.key]);
        aging_text += period.label + ": " + format_currency_simple(amount) + "    ";
        if (amount > 0) {
            has_aging_data = true;
        }
    });

    var total = flt0(aging_summary.total);

    if (total > 0) {
        aging_text += "  Total: " + format_currency_simple(total);
        has_aging_data = true;
    }

    if (total > 0) {
        if (flt0(aging_summary["121+"]) > total * 0.2) {
            aging_text += "\nملاحظة: أكثر من 20% من الديون متأخرة لأكثر من 4 شهور";
        } else if (flt0(aging_summary["91-120"]) > total * 0.3) {
            aging_text += "\nملاحظة: أكثر من 30% من الديون متأخرة لأكثر من 3 شهور";
        }
    }

    frm.set_value("aging", has_aging_data ? aging_text.trim() : "");
}

function show_aging_dialog(aging_summary, frm) {
    var dialog = new frappe.ui.Dialog({
        title: __('أعمار الديون'),
        fields: [
            {
                fieldname: "aging_table",
                fieldtype: "HTML",
                options: create_aging_html(aging_summary, frm)
            }
        ],
        size: "large"
    });

    dialog.show();
}

function create_aging_html(aging_summary, frm) {
    if (!aging_summary || aging_summary.message) {
        return '<div style="padding:20px; font-size:14px;">' +
            escape_html((aging_summary && aging_summary.message) || 'لا توجد بيانات أعمار متاحة') +
            '</div>';
    }

    if (aging_summary.error) {
        return '<div style="padding:20px; color:#c0392b; font-size:14px;">' +
            escape_html(aging_summary.error) +
            '</div>';
    }

    var periods = [
        { key: "0-30", label: "0-30 يوم", color: "#27ae60" },
        { key: "31-60", label: "31-60 يوم", color: "#3498db" },
        { key: "61-90", label: "61-90 يوم", color: "#f39c12" },
        { key: "91-120", label: "91-120 يوم", color: "#e74c3c" },
        { key: "121+", label: "121+ يوم", color: "#8e44ad" }
    ];

    var total = flt0(aging_summary.total);
    var currency = (frm && frm.doc && frm.doc.currency) || get_default_currency();

    var html = ''
        + '<div style="padding:20px; font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;">'
        + '  <h4 style="margin:0 0 20px 0; color:#2c3e50; border-bottom:2px solid #3498db; padding-bottom:10px;">'
        + '    📊 ملخص أعمار الديون'
        + '  </h4>'
        + '  <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">'
        + '    <thead>'
        + '      <tr style="background:#f8f9fa;">'
        + '        <th style="padding:12px; text-align:right; border:1px solid #dee2e6;">الفترة</th>'
        + '        <th style="padding:12px; text-align:right; border:1px solid #dee2e6;">المبلغ</th>'
        + '        <th style="padding:12px; text-align:center; border:1px solid #dee2e6;">النسبة</th>'
        + '      </tr>'
        + '    </thead>'
        + '    <tbody>';

    periods.forEach(function (period) {
        var amount = flt0(aging_summary[period.key]);
        var percentage = total > 0 ? ((amount / total) * 100).toFixed(1) : "0.0";

        html += ''
            + '<tr>'
            + '  <td style="padding:10px; border:1px solid #dee2e6; color:' + period.color + '; font-weight:bold;">' + period.label + '</td>'
            + '  <td style="padding:10px; border:1px solid #dee2e6; text-align:right; font-weight:bold;">' + format_currency_with_code(amount, currency) + '</td>'
            + '  <td style="padding:10px; border:1px solid #dee2e6; text-align:center;">'
            + '    <div style="background:' + period.color + '20; padding:5px; border-radius:3px;">' + percentage + '%</div>'
            + '  </td>'
            + '</tr>';
    });

    html += ''
        + '    </tbody>'
        + '  </table>'
        + '  <div style="background:linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:15px; border-radius:8px; color:white; text-align:center;">'
        + '    <div style="font-size:18px; font-weight:bold;">المجموع الكلي</div>'
        + '    <div style="font-size:24px; margin-top:10px;">' + format_currency_with_code(total, currency) + '</div>'
        + '  </div>'
        + '</div>';

    return html;
}

function clear_party_and_entries(frm) {
    frm.set_value("party", "");
    frm.clear_table("entries");
    frm.refresh_field("entries");
    frm.set_value("aging", "");
}

function get_default_currency() {
    return frappe.defaults.get_default("currency") || "SAR";
}

function format_currency_simple(amount) {
    return flt0(amount).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

function format_currency_with_code(amount, currency) {
    return format_currency_simple(amount) + " " + (currency || get_default_currency());
}

function flt0(value) {
    var n = parseFloat(value);
    return isNaN(n) ? 0 : n;
}

function get_doctype_route(doctype) {
    return String(doctype || "").toLowerCase().replace(/\s+/g, '-');
}

function get_doctype_route_from_backend(voucher_type, voucher_subtype) {
    if (voucher_type) {
        return voucher_type;
    }

    var map = {
        "فاتورة مبيعات": "Sales Invoice",
        "فاتورة مشتريات": "Purchase Invoice",
        "قيد محاسبي": "Journal Entry",
        "سند صرف": "Payment Entry",
        "سند قبض": "Payment Entry",
        "سند قبض / صرف": "Payment Entry",
        "فاتورة نقطة بيع": "POS Invoice",
        "إذن تسليم": "Delivery Note",
        "إذن استلام": "Purchase Receipt",
        "أمر بيع": "Sales Order",
        "أمر شراء": "Purchase Order",
        "قيد مخزني": "Stock Entry",
        "رصيد سابق": "",
        "المجموع النهائي": ""
    };

    return map[voucher_subtype] || "";
}

function escape_html(text) {
    if (text === null || text === undefined) {
        return "";
    }

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}