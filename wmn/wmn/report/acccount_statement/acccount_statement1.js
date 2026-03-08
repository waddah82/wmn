frappe.query_reports["Acccount Statement"] = {
    "filters": [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            reqd: 1,
            default: frappe.defaults.get_user_default("Company"),
            on_change: function () {
                // تحديث العملة الافتراضية عند تغيير الشركة
                let company = frappe.query_report.get_filter_value("company");
                if (company) {
                    frappe.call({
                        method: "frappe.client.get_value",
                        args: {
                            doctype: "Company",
                            fieldname: "default_currency",
                            filters: { name: company }
                        },
                        callback: function (r) {
                            if (r.message && r.message.default_currency) {
                                frappe.query_report.set_filter_value("currency", r.message.default_currency);
                            }
                        }
                    });
                }
                // تحديث قائمة الأطراف
                frappe.query_report.trigger_refresh_on_filters();
            }
        },
        {
            fieldname: "party_type",
            label: __("Party Type"),
            fieldtype: "Select",
            reqd: 1,
            "default": "Customer",
            options: ["Customer", "Supplier", "Employee", "Account", "Shareholder"],
            on_change: function () {
                // مسح قيمة الطرف عند تغيير النوع
                frappe.query_report.set_filter_value("party", []);
                frappe.query_report.set_filter_value("party_name", "");
                frappe.query_report.set_filter_value("tax_id", "");
            }
        },
        {
            fieldname: "party",
            label: __("Party"),
            fieldtype: "MultiSelectList",
            reqd: 1,
            get_data: function (txt) {
                let party_type = frappe.query_report.get_filter_value("party_type");
                let company = frappe.query_report.get_filter_value("company");

                if (!party_type || !company) return [];

                if (party_type === "Account") {
                    return frappe.call({
                        method: "frappe.desk.search.search_link",
                        args: {
                            doctype: "Account",
                            txt: txt,
                            filters: {
                                "company": company,
                                "is_group": 0
                            }
                        },
                        async: false
                    }).then(r => r.message || []);
                } else {
                    return frappe.call({
                        method: "frappe.desk.search.search_link",
                        args: {
                            doctype: party_type,
                            txt: txt
                        },
                        async: false
                    }).then(r => r.message || []);
                }
            },
            on_change: function () {
                let party_type = frappe.query_report.get_filter_value("party_type");
                let parties = frappe.query_report.get_filter_value("party");
                let company = frappe.query_report.get_filter_value("company");

                if (!party_type || parties.length === 0 || !company) {
                    frappe.query_report.set_filter_value("party_name", "");
                    frappe.query_report.set_filter_value("tax_id", "");
                    return;
                }

                let party = parties[0];
                let fieldname = "name";
                if (party_type === "Customer") fieldname = "customer_name";
                else if (party_type === "Supplier") fieldname = "supplier_name";

                // تحديد الحقول المتاحة حسب نوع الطرف
                let fields_to_fetch = [fieldname];
                if (party_type === "Customer") {
                    fields_to_fetch.push("tax_id");
                } else if (party_type === "Supplier") {
                    fields_to_fetch.push("tax_id");
                }

                frappe.db.get_value(party_type, party, fields_to_fetch, function (value) {
                    frappe.query_report.set_filter_value("party_name", value[fieldname]);

                    // فقط إذا كان حقل tax_id موجوداً في نوع الطرف
                    if (fields_to_fetch.includes("tax_id")) {
                        frappe.query_report.set_filter_value("tax_id", value["tax_id"] || "");
                    } else {
                        frappe.query_report.set_filter_value("tax_id", "");
                    }

                    if (parties.length > 1) {
                        // الاحتفاظ بالعنصر الأخير فقط
                        let last_party = parties[parties.length - 1];
                        frappe.query_report.set_filter_value("party", [last_party]);
                        parties = [last_party];
                    }

                    // تحديث التقرير بعد تعيين القيم
                    frappe.query_report.refresh();
                });
            }
        },
        {
            fieldname: "party_name",
            label: __("Party Name"),
            fieldtype: "Data",
            hidden: 1,
            read_only: 1
        },
        {
            fieldname: "tax_id",
            label: __("Tax Id"),
            fieldtype: "Data",
            hidden: 1,
            read_only: 1
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            "default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            reqd: 1
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            "default": frappe.datetime.get_today(),
            reqd: 1
        },
        {
            "fieldname": "use_transaction_currency",
            "label": "عرض بالعملة",
            "fieldtype": "Check",
            "default": 0,
            on_change: function () {
                let use_transaction_currency = frappe.query_report.get_filter_value("use_transaction_currency");
                if (!use_transaction_currency) {
                    // إذا تم إلغاء الاختيار، نعيد العملة إلى عملة الشركة الافتراضية
                    let company = frappe.query_report.get_filter_value("company");
                    if (company) {
                        frappe.call({
                            method: "frappe.client.get_value",
                            args: {
                                doctype: "Company",
                                fieldname: "default_currency",
                                filters: { name: company }
                            },
                            callback: function (r) {
                                if (r.message && r.message.default_currency) {
                                    frappe.query_report.set_filter_value("currency", r.message.default_currency);
                                }
                            }
                        });
                    }
                }
                frappe.query_report.refresh();
            }
        },
        {
            "fieldname": "currency",
            "label": "العملة",
            "fieldtype": "Link",
            "options": "Currency",
            "default": function () {
                let company = frappe.defaults.get_user_default("Company");
                if (company) {
                    return frappe.db.get_value("Company", company, "default_currency").then(r => {
                        return r.message.default_currency || "SAR";
                    });
                }
                return "SAR";
            },
            depends_on: "use_transaction_currency"
        }
    ],

    onload: function (report) {
        // تعيين قيمة الشركة الافتراضية إذا لم تكن موجودة
        let company_filter = report.get_filter("company");
        if (company_filter && !company_filter.get_value()) {
            let default_company = frappe.defaults.get_user_default("Company");
            if (default_company) {
                company_filter.set_value(default_company);
            }
        }

        report.page.set_primary_action(__('Print'), function () {
            let data = report.data;
            let filters = report.get_values();

            if (!data || data.length === 0) {
                frappe.msgprint("لا توجد بيانات للطباعة.");
                return;
            }

            let party = filters.party ? (filters.party[0] || "العميل") : "العميل";
            let from_date = filters.from_date || "";
            let to_date = filters.to_date || "";
            let company = filters.company || frappe.defaults.get_user_default("Company");

            // جلب شعار الشركة بشكل صحيح باستخدام Promise
            let company_logo = "/files/company_logo.png"; // شعار افتراضي

            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Company",
                    name: company
                },
                callback: function (r) {
                    if (r.message && r.message.logo) {
                        company_logo = r.message.logo;
                    }

                    // جلب اسم الشركة
                    let company_name = r.message ? r.message.company_name : company;

                    // متابعة عملية الطباعة بعد الحصول على الشعار
                    printReport(data, party, from_date, to_date, company_logo, company_name, filters);
                }
            });
        });

        // دالة منفصلة للطباعة
        function printReport(data, party, from_date, to_date, company_logo, company_name, filters) {
            let party_type = filters.party_type || "Customer";
            let party_name = filters.party_name || party;
            let tax_id = filters.tax_id || "";
            let currency = filters.currency || "SAR";
            let use_transaction_currency = filters.use_transaction_currency || 0;

            let report_title = `كشف حركة حساب : ${party_name}`;
            if (tax_id) {
                report_title += ` - الرقم الضريبي: ${tax_id}`;
            }

            let doc_type_map = {
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "Journal Entry": "قيد محاسبي",
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "No Remarks": " ",
                "Payment Entry": "سند دفع/قبض",
                "Expense Claim": "مطالبة مصروفات",
                "Salary Slip": "مسير رواتب"
            };

            // إنشاء iframe للطباعة
            let iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            let doc = iframe.contentWindow.document;

            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html dir="rtl">
                <head>
                    <meta charset="UTF-8">
                    <title>${report_title}</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            margin: 0;
                            padding: 0;
                            direction: rtl;
                            width: 100%;
                        }
                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            margin-bottom: 15px;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #090960;
                        }
                        .header-left { width: 30%; }
                        .header-center { width: 40%; text-align: center; }
                        .header-right { width: 30%; text-align: left; }
                        .company-info {
                            margin-top: 5px;
                            font-size: 12px;
                            color: #666;
                        }
                        table {
                            width: 99%;
                            border-collapse: collapse;
                            margin: 0 auto 15px auto;
                            font-size: 15px;
                            table-layout: fixed;
                        }
                        th, td {
                            border: 1px solid #000;
                            padding: 8px 5px;
                            text-align: center;
                            word-wrap: break-word;
                        }
                        th {
                            background-color: #e8ecf7;
                            font-weight: bold;
                            font-size: 16px;
                            padding: 10px 5px;
                        }
                        tr:nth-child(even) {
                            background-color: #f8f8f8;
                        }

                        /* التحكم في عرض الأعمدة بالنسبة المئوية */
                        th:nth-child(1), td:nth-child(1) { width: 10%; } /* التاريخ */
                        th:nth-child(2), td:nth-child(2) { width: 10%; } /* المستند */
                        th:nth-child(3), td:nth-child(3) { width: 10%; } /* الرقم */
                        th:nth-child(4), td:nth-child(4) { width: 35%; text-align: right; padding-right: 14px; } /* الملاحظات */
                        th:nth-child(5), td:nth-child(5) { width: 10%; font-size: 15px; } /* مدين */
                        th:nth-child(6), td:nth-child(6) { width: 10%; font-size: 15px; } /* دائن */
                        th:nth-child(7), td:nth-child(7) { width: 15%; font-size: 15px; } /* الرصيد */

                        .currency {
                            font-size: 9px;
                            color: #666;
                            margin-left: 3px;
                            font-weight: normal;
                        }

                        .amount {
                            font-size: 14px;
                            font-weight: bold;
                        }

                        .footer {
                            margin-top: 20px;
                            text-align: center;
                            font-size: 12px;
                            color: #666;
                            width: 100%;
                            padding-top: 10px;
                            border-top: 1px solid #ddd;
                        }

                        .filter-info {
                            background-color: #f0f0f0;
                            padding: 8px;
                            margin-bottom: 15px;
                            border-radius: 4px;
                            font-size: 13px;
                            border-right: 3px solid #090960;
                        }
                        .filter-info span {
                            font-weight: bold;
                            color: #090960;
                        }

                        @media print {
                            @page {
                                margin: 0.7cm;
                                size: landscape;
                            }
                            body {
                                margin: 0;
                                padding: 0;
                                width: 100%;
                            }
                            .header {
                                position: running(header);
                            }
                            .footer {
                                position: running(footer);
                            }
                            table {
                                width: 100%;
                                margin: 0 auto 10px auto;
                            }
                            th {
                                background-color: #e8ecf7 !important;
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                                font-size: 16px !important;
                            }
                            tr:nth-child(even) {
                                background-color: #f8f8f8 !important;
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                            }
                            /* التأكد من أن الأعمدة تحافظ على نسبها أثناء الطباعة */
                            th:nth-child(1), td:nth-child(1) { width: 10% !important; }
                            th:nth-child(2), td:nth-child(2) { width: 10% !important; }
                            th:nth-child(3), td:nth-child(3) { width: 10% !important; }
                            th:nth-child(4), td:nth-child(4) { width: 35% !important; text-align: right !important; padding-right: 15px !important; }
                            th:nth-child(5), td:nth-child(5) { width: 10% !important; font-size: 15px !important; }
                            th:nth-child(6), td:nth-child(6) { width: 10% !important; font-size: 15px !important; }
                            th:nth-child(7), td:nth-child(7) { width: 15% !important; font-size: 15px !important; }

                            .currency {
                                font-size: 9px !important;
                            }

                            .amount {
                                font-size: 14px !important;
                            }
                        }
                    </style>
                </head>
                <body>
            `);

            // معلومات الفلاتر
            doc.write(`
                <div class="header">
                    <div class="header-left">
                        <img src="${company_logo}" style="max-height:60px;">
                        <div class="company-info">
                            ${company_name}<br>
                            الشركة: ${filters.company || "غير محدد"}
                        </div>
                    </div>
                    <div class="header-center">
                        <h1 style="font-weight:bold; font-size:18px; color:#090960; margin:0;">
                            ${report_title}
                        </h1>
                        <div style="margin-top:5px; font-size:14px; color:#666;">
                            نوع الطرف: ${party_type === "Customer" ? "عميل" :
                                        party_type === "Supplier" ? "مورد" :
                                        party_type === "Employee" ? "موظف" :
                                        party_type === "Account" ? "حساب" : "مساهم"}
                        </div>
                    </div>
                    <div class="header-right">
                        <div style="color:#090960; font-size:13px;">
                            <div style="margin-bottom:5px;">
                                <strong>من:</strong> ${from_date}
                            </div>
                            <div style="margin-bottom:5px;">
                                <strong>إلى:</strong> ${to_date}
                            </div>
                            <div style="margin-bottom:5px;">
                                <strong>العملة:</strong> ${currency}
                            </div>
                            <div>
                                <strong>عرض بالعملة:</strong> ${use_transaction_currency ? "نعم" : "لا"}
                            </div>
                        </div>
                    </div>
                </div>
            `);

            doc.write(`
                <div class="filter-info">
                    <strong>بيانات التقرير:</strong>
                    الشركة: <span>${company_name}</span> |
                    نوع الطرف: <span>${party_type}</span> |
                    الفترة: <span>${from_date}</span> إلى <span>${to_date}</span>
                    ${use_transaction_currency ? `| العملة المعروضة: <span>${currency}</span>` : ''}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>المستند</th>
                            <th>الرقم</th>
                            <th>ملاحظات</th>
                            <th>مدين</th>
                            <th>دائن</th>
                            <th>الرصيد</th>
                        </tr>
                    </thead>
                    <tbody>
            `);

            data.forEach((row, idx) => {
                let row_currency = row.currency || currency;
                doc.write(`
                    <tr style="background-color: ${idx % 2 === 0 ? '#F8F8F8' : '#FFFFFF'};">
                        <td>${row.posting_date || ''}</td>
                        <td>${doc_type_map[row.voucher_subtype] || row.voucher_subtype || ''}</td>
                        <td>${row.voucher_no || ''}</td>
                        <td style="text-align:right; padding-right:15px;">${row.remarks || ""}</td>
                        <td style="text-align:right;">
                            <span class="amount">${parseFloat(row.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span class="currency">${row_currency}</span>
                        </td>
                        <td style="text-align:right;">
                            <span class="amount">${parseFloat(row.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span class="currency">${row_currency}</span>
                        </td>
                        <td style="text-align:right;">
                            <span class="amount">${parseFloat(row.running_balance || row.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span class="currency">${row_currency}</span>
                        </td>
                    </tr>
                `);
            });

            doc.write(`
                    </tbody>
                </table>

                <div class="footer">
                    شكراً لتعاملكم معنا<br>فارس معوضة - تلفون: 77777777 - سيار: 777777777
                </div>
            `);

            doc.close();

            // الانتظار حتى يتم تحميل المحتوى ثم الطباعة
            setTimeout(function () {
                iframe.contentWindow.focus();
                iframe.contentWindow.onafterprint = function () {
                    document.body.removeChild(iframe);
                };
                iframe.content_window.print();
                setTimeout(function () {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            }, 500);
        }
    },

    // دالة للتحقق من صحة الفلاتر قبل تشغيل التقرير
    before_render: function (report) {
        let filters = report.get_values();
        if (!filters.company) {
            frappe.msgprint(__("الرجاء تحديد الشركة"));
            return false;
        }
        if (!filters.party_type) {
            frappe.msgprint(__("الرجاء تحديد نوع الطرف"));
            return false;
        }
        if (!filters.party || filters.party.length === 0) {
            frappe.msgprint(__("الرجاء تحديد الطرف"));
            return false;
        }
        return true;
    }
};