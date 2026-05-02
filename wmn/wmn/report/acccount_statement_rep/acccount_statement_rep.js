frappe.query_reports["Acccount Statement Rep"] = {
    "filters": [

        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            reqd: 1
        },

        {
            fieldname: "party_type",
            label: __("Party Type"),
            fieldtype: "Select",
            reqd: 1,
            default: "",
            options: ["", "Customer", "Supplier", "Employee", "Account", "Shareholder"],

            on_change: function () {

                let party_type = frappe.query_report.get_filter_value("party_type");
                let party_filter = frappe.query_report.get_filter("party");

                // مسح القيم السابقة
                frappe.query_report.set_filter_value("party", "");
                frappe.query_report.set_filter_value("party_name", "");
                frappe.query_report.set_filter_value("tax_id", "");

                if (!party_type) {
                    // تعطيل الحقل إذا لم يتم اختيار النوع
                    party_filter.df.options = "";
                    party_filter.df.read_only = 1;
                } else {
                    // تفعيل الحقل وتغيير نوعه
                    party_filter.df.options = party_type;
                    party_filter.df.read_only = 0;
                }

                party_filter.refresh();
            }
        },

        {
            fieldname: "party",
            label: __("Party"),
            fieldtype: "Link",
            options: "",
            reqd: 1,
            read_only: 1,

            on_change: function () {

                let party_type = frappe.query_report.get_filter_value("party_type");
                let party = frappe.query_report.get_filter_value("party");

                if (!party_type || !party) {
                    frappe.query_report.set_filter_value("party_name", "");
                    frappe.query_report.set_filter_value("tax_id", "");
                    return;
                }

                let name_field = "name";
                if (party_type === "Customer") name_field = "customer_name";
                else if (party_type === "Supplier") name_field = "supplier_name";
                else if (party_type === "Employee") name_field = "employee_name";

                frappe.model.with_doctype(party_type, function () {

                    let meta = frappe.get_meta(party_type);
                    let has_tax_id = meta.fields.some(df => df.fieldname === "tax_id");

                    let fields = [name_field];
                    if (has_tax_id) fields.push("tax_id");

                    frappe.db.get_value(party_type, party, fields, function (value) {

                        frappe.query_report.set_filter_value(
                            "party_name",
                            value[name_field] || ""
                        );

                        frappe.query_report.set_filter_value(
                            "tax_id",
                            has_tax_id ? (value.tax_id || "") : ""
                        );

                        // تحديث التقرير
                        frappe.query_report.refresh();
                    });
                });
            }
        },

        {
            fieldname: "party_name",
            label: __("Party Name"),
            fieldtype: "Data",
            hidden: 1
        },

        {
            fieldname: "tax_id",
            label: __("Tax Id"),
            fieldtype: "Data",
            hidden: 1
        },

        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.add_months(frappe.datetime.get_today(), -1),
            reqd: 1
        },

        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.get_today(),
            reqd: 1
        },

        {
            fieldname: "use_transaction_currency",
            label: "عرض بالعملة",
            fieldtype: "Check",
            default: 0,
            hidden: 0
        },

        {
            fieldname: "currency",
            label: "Currency",
            fieldtype: "Select",
            options: ["SAR", "USD"],
            default: "SAR",
            hidden: 0
        },
        
        {
            fieldname: "ignore_cr_dr_notes",
            label: __("Ignore System Generated Credit / Debit Notes"),
            fieldtype: "Check",
            default: 0
        }


    ],

    onload: function (report) {
        report.page.add_inner_button(__(`<span style="display:inline-flex; align-items:center; gap:6px; background:#153351; color:#fff; font-weight:bold; padding:8px 18px; border-radius:8px; box-shadow:0 3px 8px rgba(0,0,0,0.25); font-size:14px;"><i class="fa fa-print"></i> طباعة</span>`), function () {
            let data = report.data;

            if (!data || data.length === 0) {
                frappe.msgprint("لا توجد بيانات للطباعة.");
                return;
            }

            let filters = report.get_values();
            let party = filters.party || "العميل";
            let party_name = filters.party_name || party;
            let from_date = filters.from_date || "";
            let to_date = filters.to_date || "";
            let party_type = filters.party_type || "Customer";
            let currency = filters.currency || "YER";

            // استخراج نص الأعمار من آخر صف إذا كان موجوداً
            let ageing_text = "";
            let last_row = data[data.length - 1];

            // إذا كان الصف الأخير يحتوي على نص الأعمار في حقل remarks
            if (last_row && last_row.voucher_subtype && last_row.voucher_subtype.includes("أعمار الديون")) {
                ageing_text = last_row.remarks;
                // إزالة الصف الأخير من البيانات المعروضة
                data = data.slice(0, data.length - 1);
            }

            // جلب شعار الشركة
            let company_name = filters.company;
            let company_logo = "/files/logo.png";

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

                    // استخراج معلومات الشركة
                    let company_address = r.message ? (r.message.address_line1 || "") : "";
                    let company_phone = r.message ? (r.message.phone_no || "") : "";
                    let company_email = r.message ? (r.message.email || "") : "";

                    printReport(data, party, party_name, from_date, to_date,
                               company_logo, ageing_text, party_type, currency,
                               company_address, company_phone, company_email);
                }
            });
        });

        function printReport(data, party, party_name, from_date, to_date, company_logo,
                           ageing_text, party_type, currency, company_address,
                           company_phone, company_email) {

            let report_title = `كشف حساب ${party_type === "Customer" ? "العميل" :
                                                    party_type === "Supplier" ? "المورد" :
                                                    party_type === "Employee" ? "الموظف" : "الحساب"
            }: ${party_name}`;

            let doc_type_map = {
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "Journal Entry": "قيد محاسبي",
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "رصيد سابق": "رصيد سابق",
                "المجموع النهائي": "المجموع النهائي"
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
                    <link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Almarai:wght@300;400;700;800&family=Cairo:wght@200..1000&family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&family=IBM+Plex+Sans+Arabic:wght@100;200;300;400;500;600;700&family=Noto+Kufi+Arabic:wght@100..900&family=Scheherazade+New:wght@400;500;600;700&family=Tajawal:wght@200;300;400;500;700;800;900&display=swap" rel="stylesheet">
                    <title>${report_title}</title>
                    <style>
                        @page {
                            margin: 1cm 0.8cm 2.54cm 0.8cm;
                            size: A4 portrait;
                        }

                        body {
                            font-family: Cairo,Arial, sans-serif;
                            margin: 0px;
                            padding: 0;
                            direction: rtl;
                            width: 100%;
                            font-size: 12px;
                        }

                        /* إزالة المسافات العلوية */
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }

                        /* رأس التقرير - مضغوط */
                        .header-container {
                            width: 100%;
                            margin: 0 0 10px 0;
                            padding: 0;
                        }

                        .header-row {
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            margin: 0;
                            padding: 5px 0;
                            border-bottom: 2px solid #2c3e50;
                        }

                        .logo-section {
                            width: 25%;
                        }

                        .logo-section img {
                            max-height: 60px;
                            max-width: 100%;
                        }

                        .title-section {
                            width: 50%;
                            text-align: center;
                        }

                        .title-section h1 {
                            font-weight: bold;
                            font-size: 14px;
                            color: #2c3e50;
                            margin: 0;
                            padding: 0;
                        }

                        .date-section {
                            width: 25%;
                            text-align: right;
                            font-size: 11px;
                            color: #34495e;
                        }

                        /* معلومات الطرف - مضغوطة */
                        .party-info {
                            background-color: #f8f9fa;
                            padding: 8px;
                            margin: 8px 0;
                            border: 1px solid #dee2e6;
                        }

                        .party-info table {
                            width: 100%;
                            border-collapse: collapse;
                        }

                        .party-info td {
                            padding: 3px 8px;
                            text-align: right;
                            font-size: 11px;
                        }

                        .party-info .label {
                            font-weight: bold;
                            color: #2c3e50;
                            min-width: 100px;
                        }

                        /* الجدول الرئيسي */
                        .table-container {
                            width: 100%;
                            margin: 10px 0;
                            overflow: hidden;
                        }

                        .main-table {
                            width: 100%;
                            border-collapse: collapse;
                            font-size: 11px;
                            table-layout: fixed;
                            /*border: 2px solid #2c3e50;*/
                        }

                        .main-table th {
                            background-color: #2c3e50;
                            color: white;
                            font-weight: bold;
                            padding: 6px 3px;
                            text-align: center;
                            border: 1px solid #bdc3c7;
                            font-size: 13px;
                        }

                        .main-table td {
                            padding: 5px 3px;
                            border: 1px solid #bdc3c7;
                            text-align: center;
                            word-wrap: break-word;
                        }

                        /* تحديد عرض الأعمدة */
                        .col-date { width: 10%; }
                        .col-doc-type { width: 10%; }
                        .col-doc-no { width: 18%; }
                        .col-remarks { width: 30%; text-align: right; padding-right: 5px !important; }
                        .col-debit { width: 9%; text-align: left; direction: ltr; }
                        .col-credit { width: 9%; text-align: left; direction: ltr; }
                        .col-balance { width: 9%; text-align: left; direction: ltr; }

                        /* صفوف زوجية */
                        .main-table tr:nth-child(even) {
                            background-color: #f8f9fa;
                        }

                        /* صف المجموع النهائي */
                        .total-row {
                            background-color: #778792 !important;
                            color: #111111 !important;
                            font-weight: bold;
                        }

                        .total-row td {
                            /*border: 1px solid #34495e !important;*/
                            font-size: 11px;
                        }

                        /* قسم أعمار الديون - مضغوط */
                        .aging-content {
                            width: 100%;
                            margin: 5px 0;
                            padding: 8px;
                            background-color: #e3f2fd;
                            border: 2px solid #1565c0;
                            border-radius: 5px;
                            font-size: 12px;
                            text-align: right;
                        }

                        /* التوقيعات - مضغوطة */
                        .signatures-section {
                            width: 100%;
                            margin-top: 20px;
                            padding-top: 10px;
                            border-top: 2px solid #2c3e50;
                            display: flex;
                            justify-content: space-between;
                        }

                        .signature-box {
                            width: 30%;
                            text-align: center;
                        }

                        .signature-line {
                            width: 80%;
                            height: 1px;
                            background-color: #2c3e50;
                            margin: 5px auto;
                        }

                        .signature-title {
                            font-weight: bold;
                            font-size: 12px;
                            color: #2c3e50;
                        }

                        /* طباعة */
                        @media print {
                            body {
                                margin: 0;
                                padding: 0;
                            }

                            /* إزالة أي مسافات علوية */
                            body > *:first-child {
                                margin-top: 0 !important;
                                padding-top: 0 !important;
                            }

                            /* منع انقسام الصفوف */
                            tr {
                                page-break-inside: avoid;
                            }

                            /* التحكم في فواصل الصفحات */
                            thead {
                                display: table-header-group;
                            }

                            tfoot {
                                display: table-footer-group;
                            }

                            /* تثبيت الألوان للطباعة */
                            .main-table th {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                                background-color: #7D84B0 !important;
                            }

                            .total-row td {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                                background-color: #eeeeee !important;
                            }

                            .aging-content {
                                -webkit-print-color-adjust: exact;
                                print-color-adjust: exact;
                                background-color: #e3f2fd !important;
                            }

                            /* منع تكرار رأس الجدول */
                            .main-table {
                                page-break-after: auto;
                            }
                        }

                        /* ألوان المبالغ */
                        .amount-debit {
                            color: #27ae60;
                            font-weight: bold;
                        }

                        .amount-credit {
                            color: #e74c3c;
                            font-weight: bold;
                        }

                        .amount-balance {
                            color: #2c3e50;
                            font-weight: bold;
                        }

                        .text-right { text-align: right; }
                        .text-left { text-align: left; direction: ltr; }
                        .text-center { text-align: center; }
                        .bold { font-weight: bold; }
                    </style>
                </head>
                <body>
                    <!-- رأس التقرير -->
                    <div class="header-container">
                        <div class="header-row">
                            <div class="logo-section">
                                <img src="${company_logo}" alt="شعار الشركة">
                            </div>
                            <div class="title-section">
                                <h1>${report_title}</h1>
                                <!--<div style="color: #3498db; font-size: 14px; margin-top: 2px;">
                                    ${party} (${party_type})
                                </div>-->
                            </div>
                            <div class="date-section">
                                <div><strong>من:</strong> ${from_date}</div>
                                <div><strong>إلى:</strong> ${to_date}</div>
                                <div><strong>العملة:</strong> ${currency}</div>
                            </div>
                        </div>

                        <!-- معلومات الطرف
                        <div class="party-info">
                            <table>
                                <tr>
                                    <td class="label">الطرف:</td>
                                    <td>${party_name}</td>
                                    <td class="label">نوع الطرف:</td>
                                    <td>${party_type}</td>
                                </tr>
                            </table>
                        </div>-->
                    </div>

                    <!-- جدول البيانات -->
                    <div class="table-container">
                        <table class="main-table">
                            <thead>
                                <tr>
                                    <th class="col-date">التاريخ</th>
                                    <th class="col-doc-type">نوع المستند</th>
                                    <th class="col-doc-no">رقم المستند</th>
                                    <th class="col-remarks">البيان</th>
                                    <th class="col-debit">مدين</th>
                                    <th class="col-credit">دائن</th>
                                    <th class="col-balance">الرصيد</th>
                                </tr>
                            </thead>
                            <tbody>
            `);

            // عرض البيانات مع تنسيق
            data.forEach((row, idx) => {
                let voucher_type = doc_type_map[row.voucher_subtype] || row.voucher_subtype;
                let remarks = row.remarks || "";
                let debit = parseFloat(row.debit || 0);
                let credit = parseFloat(row.credit || 0);
                let balance = parseFloat(row.running_balance || 0);

                let row_class = (idx % 2 === 0) ? '' : ' style="background-color: #eeeeee;"';

                // تحديد إذا كان صف المجموع النهائي
                if (row.voucher_subtype === "المجموع النهائي") {
                    row_class = ' class="total-row"';
                }

                doc.write(`
                    <tr${row_class}>
                        <td class="col-date">${row.posting_date || ""}</td>
                        <td class="col-doc-type">${voucher_type}</td>
                        <td class="col-doc-no">${row.voucher_no || ""}</td>
                        <td class="col-remarks text-right">${remarks}</td>
                        <td class="col-debit text-left amount-debit">${debit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
                        <td class="col-credit text-left amount-credit">${credit.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
                        <td class="col-balance text-left amount-balance">${balance.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</td>
                    </tr>
                `);
            });

            doc.write(`
                            </tbody>
                        </table>
                    </div>

                    <!-- قسم أعمار الديون (إذا كان موجوداً) -->
                    ${ageing_text && ageing_text.trim() !== "" ? `<div class="aging-content">${ageing_text}</div>` : ''}

                    <!-- التوقيعات -->
                    <div class="signatures-section">
                        <div class="signature-box">
                            <div class="signature-line"></div>
                            <div class="signature-title">المحاسب</div>
                        </div>
                        <div class="signature-box">
                            <div class="signature-line"></div>
                            <div class="signature-title">المراجع</div>
                        </div>
                        <div class="signature-box">
                            <div class="signature-line"></div>
                            <div class="signature-title">المدير العام</div>
                        </div>
                    </div>
                </body>
                </html>
            `);

            doc.close();

            // الطباعة بعد تحميل المحتوى
            setTimeout(function () {
                iframe.contentWindow.focus();
                iframe.contentWindow.onafterprint = function () {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                };

                // إضافة تأكيد الطباعة
                setTimeout(function () {
                    iframe.contentWindow.print();

                    // إزالة الـ iframe بعد فترة
                    setTimeout(function () {
                        if (document.body.contains(iframe)) {
                            document.body.removeChild(iframe);
                        }
                    }, 2000);
                }, 500);

            }, 500);
        }
    }
};
