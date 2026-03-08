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
                frappe.query_report.refresh();
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
            "default": 0
        },
        {
            "fieldname": "currency",
            "label": "currency",
            "fieldtype": "Link",
            "options": "Currency",
            "default": "SAR"
        }
    ],


    onload: function (report) {
        report.page.set_primary_action(__('Print'), function () {
            let data = report.data;

            if (!data || data.length === 0) {
                frappe.msgprint("لا توجد بيانات للطباعة.");
                return;
            }

            let party = report.get_values().party || "العميل";
            let from_date = report.get_values().from_date || "";
            let to_date = report.get_values().to_date || "";

            // جلب شعار الشركة بشكل صحيح باستخدام Promise
            let company_name = report.get_values().company;
            let company_logo = "/files/company_logo.png"; // شعار افتراضي

            // استخدام Promise للتعامل مع الطلب غير المتزامن
            frappe.call({
                method: "frappe.client.get",
                args: {
                    doctype: "Company",
                    name: company_name
                },
                callback: function (r) {
                    if (r.message && r.message.company_logo) {
                        company_logo = r.message.company_logo;
                    }

                    // متابعة عملية الطباعة بعد الحصول على الشعار
                    printReport(data, party, from_date, to_date, company_logo);
                }
            });
        });

        // دالة منفصلة للطباعة
        function printReport(data, party, from_date, to_date, company_logo) {
            let report_title = `كشف حركة حساب : ${party}`;
            let doc_type_map = {
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "Journal Entry": "قيد محاسبي",
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "No Remarks": " "
            };

            // إنشاء iframe للطباعة
            let iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            let doc = iframe.contentWindow.document;

            // عدد الصفوف في كل صفحة
            const rowsPerPage = 25;
            const totalPages = Math.ceil(data.length / rowsPerPage);

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
                            align-items: center;
                            margin-bottom: 15px;
                            padding-bottom: 10px;
                            border-bottom: 2px solid #090960;
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

                        .page-break {
                            page-break-after: always;
                            break-after: page;
                        }

                        .pagination {
                            text-align: center;
                            margin: 10px 0;
                            font-size: 12px;
                            color: #666;
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

                            .page-break {
                                page-break-after: always !important;
                                break-after: page !important;
                            }
                        }
                    </style>
                </head>
                <body>
            `);

            // تقسيم البيانات إلى صفحات
            doc.write(`
    <div class="header">
        <div style="width:30%;">
            <img src="${company_logo}" style="max-height:60px;">
        </div>
        <div style="width:50%; text-align:center;">
            <h1 style="font-weight:bold; font-size:18px; color:#090960; margin:0;">
                ${report_title}
            </h1>
        </div>
        <div style="width:20%; text-align:right; color:#090960; font-size:13px;">
            <div style="margin-bottom:5px;">
                <strong>من:</strong> ${from_date}
            </div>
            <div>
                <strong>إلى:</strong> ${to_date}
            </div>
        </div>
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
                let currency = row.currency || "YER";
                doc.write(`
        <tr style="background-color: ${idx % 2 === 0 ? '#F8F8F8' : '#FFFFFF'};">
            <td>${row.posting_date}</td>
            <td>${doc_type_map[row.voucher_subtype] || row.voucher_subtype}</td>
            <td>${row.voucher_no}</td>
            <td style="text-align:right; padding-right:15px;">${row.remarks || ""}</td>
            <td style="text-align:right;">
                <span class="amount">${parseFloat(row.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="currency">${currency}</span>
            </td>
            <td style="text-align:right;">
                <span class="amount">${parseFloat(row.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span class="currency">${currency}</span>
            </td>
            <td style="text-align:right;">
                <span class ="amount">${parseFloat(row.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                <span class="currency">${currency}</span>
            </td>
        </tr>
    `);
            });

            doc.write(`
        </tbody>
    </table>

    <div class="footer">
        المحاسب                    المراجع                        المدير العام
    </div>
`);
            doc.close();

            // الانتظار حتى يتم تحميل المحتوى ثم الطباعة
            setTimeout(function () {
                iframe.contentWindow.focus();
                iframe.contentWindow.onafterprint = function () {
                    document.body.removeChild(iframe);
                };
                iframe.contentWindow.print();
                setTimeout(function () {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            }, 500);
        }
    }
};


