import frappe
from frappe import _
def execute(filters=None):

    def amount_to_arabic_words(amount, currency_code="SAR"):
        amount_in_words = " "
        
        from num2words import num2words
        currency_map = {
            "SAR": {"main": "ريال سعودي", "sub": "هللة"},
            "YER": {"main": "ريال يمني", "sub": "فلس"},
            "USD": {"main": "دولار أمريكي", "sub": "سنت"},
            "AED": {"main": "درهم إماراتي", "sub": "فلس"}
        }
        curr = currency_map.get(currency_code, {"main": currency_code, "sub": ""})
        
        val = frappe.utils.flt(amount or 0, 2)
        integer_part = int(val)
        decimal_part = int(round((val - integer_part) * 100))

        main_words = num2words(integer_part, lang="ar" ) + " " + curr["main"]
        
        final_output = main_words
        if decimal_part > 0 and curr["sub"]:

            sub_words = num2words(decimal_part, lang="ar" ) +  " " + curr["sub"] 
            final_output = main_words + " و " + sub_words
        
        return final_output 
    def amount_to_arabic_words222222(amount, currency_code="SAR"):
    
        amount_in_words = " "
        original_lang = frappe.local.lang
        
        currency_map = {
            "SAR": {"main": "ريال سعودي", "sub": "هللة"},
            "YER": {"main": "ريال يمني", "sub": "فلس"},
            "USD": {"main": "دولار أمريكي", "sub": "سنت"},
            "AED": {"main": "درهم إماراتي", "sub": "فلس"}
        }
        curr = currency_map.get(currency_code, {"main": currency_code, "sub": ""})
        
        val = frappe.utils.flt(amount or 0, 2)
        integer_part = int(val)
        decimal_part = int(round((val - integer_part) * 100))
        main_words = frappe.utils.money_in_words(integer_part ).replace("فقط" ,"").replace(".","")+ " " + curr["main"]
        
        final_output = main_words
        if decimal_part > 0 and curr["sub"]:
            sub_words = frappe.utils.money_in_words(decimal_part).replace("فقط" ,"").replace(".","") +  " " + curr["sub"] 
            final_output = main_words + " و " + sub_words
        
        return final_output
        
        
        
        
        
        #money_in_words_func = frappe.get_attr("frappe.utils.data.money_in_words")
        #amount_in_words = money_in_words_func(amount, " " + curr["main"], " " + curr["sub"])

        #frappe.local.lang = "ar" # تحويل لغة الجلسة للعربية
        amount_in_words = frappe.utils.money_in_words(amount, " " + curr["main"], " " + curr["sub"])
        
        #frappe.local.lang = original_lang
        return amount_in_words

    def amount_to_arabic_words111(amount, currency_code="SAR"):
        ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
        tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
        hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"]

        def tafqeet_0_99(n):
            if n == 0: return ""
            if n < 10: return ones[n]
            if 10 <= n <= 19:
                if n == 10: return "عشرة"
                if n == 11: return "أحد عشر"
                if n == 12: return "اثنا عشر"
                return ones[n - 10] + " عشر"
            
            u = n % 10
            t = n // 10
            
            if u > 0:
                return ones[u] + " و " + tens[t]
            return tens[t]

        def tafqeet_0_999(n):
            if n == 0: return ""
            h = n // 100
            r = n % 100
            
            parts = []
            if h > 0: 
                parts.append(hundreds[h])
            if r > 0: 
                parts.append(tafqeet_0_99(r))
            return " و ".join(parts)

        def tafqeet_full(n):
            if n == 0: return "صفر"
            
            billions = n // 1000000000
            rem_billions = n % 1000000000
            
            millions = rem_billions // 1000000
            rem_millions = rem_billions % 1000000
            
            thousands = rem_millions // 1000
            rest = rem_millions % 1000
            
            res = []
            
            if billions == 1: res.append("مليار")
            elif billions == 2: res.append("ملياران")
            elif billions > 2:
                b_suffix = "مليارات" if 3 <= billions <= 10 else "مليار"
                res.append(tafqeet_0_999(billions) + " " + b_suffix)

            if millions == 1: res.append("مليون")
            elif millions == 2: res.append("مليونان")
            elif millions > 2:
                m_suffix = "ملايين" if 3 <= millions <= 10 else "مليون"
                res.append(tafqeet_0_999(millions) + " " + m_suffix)

            if thousands == 1: res.append("ألف")
            elif thousands == 2: res.append("ألفان")
            elif thousands > 2:
                t_suffix = "آلاف" if 3 <= thousands <= 10 else "ألف"
                res.append(tafqeet_0_999(thousands) + " " + t_suffix)

            if rest > 0:
                res.append(tafqeet_0_999(rest))
            
            return " و ".join(res)

        val = frappe.utils.flt(amount or 0, 2)
        integer_part = int(val)
        decimal_part = int(round((val - integer_part) * 100))

        if decimal_part == 100:
            integer_part = integer_part + 1
            decimal_part = 0

        currency_map = {
            "SAR": {"main": "ريال سعودي", "sub": "هللة"},
            "YER": {"main": "ريال يمني", "sub": "فلس"},
            "USD": {"main": "دولار أمريكي", "sub": "سنت"},
            "AED": {"main": "درهم إماراتي", "sub": "فلس"}
        }
        curr = currency_map.get(currency_code, {"main": currency_code, "sub": ""})

        main_words = tafqeet_full(integer_part) + " " + curr["main"]
        
        final_output = main_words
        if decimal_part > 0 and curr["sub"]:
            sub_words = tafqeet_full(decimal_part) + " " + curr["sub"]
            final_output = main_words + " و " + sub_words
        
        return final_output + " لا غير"

    # تحقق من الفلاتر الأساسية
    if not filters:
        filters = {}
    
    # جلب الفلاتر
    party_type = filters.get("party_type")
    party = filters.get("party") or []
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    use_transaction_currency = filters.get("use_transaction_currency")
    selected_currency = filters.get("currency") or "SAR"
    company = filters.get("company")
    
    # ⭐⭐⭐ الخيار الجديد: تجاهل إشعارات الدائن والمدين النظامية ⭐⭐⭐
    ignore_cr_dr_notes = filters.get("ignore_cr_dr_notes", False)
    
    # العملة الأساسية
    comp_currency = "SAR"
    
    # ================================================
    # دالة حساب أعمار الديون للعملاء (يجب تعريفها أولاً)
    # ================================================
    def get_customer_ageing_summary(customer, from_date, to_date, ranges=[30, 60, 90, 120]):
        """
        حساب إجماليات أعمار الديون للعميل
        """
        try:
            sql = """
                SELECT 
                    CASE 
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '0-30'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '31-60'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '61-90'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '91-120'
                        ELSE '121+'
                    END as period,
                    SUM(outstanding_amount) as amount
                FROM `tabSales Invoice`
                WHERE docstatus = 1 
                    AND outstanding_amount > 0 
                    AND customer = %s 
                    AND posting_date BETWEEN %s AND %s
                GROUP BY period
            """
            
            params = [
                to_date, ranges[0],
                to_date, ranges[1],  
                to_date, ranges[2],
                to_date, ranges[3],
                customer, from_date, to_date
            ]
            
            data = frappe.db.sql(sql, params, as_dict=True)
            
            result = {
                "0-30": 0.0,
                "31-60": 0.0,
                "61-90": 0.0,
                "91-120": 0.0,
                "121+": 0.0,
                "total": 0.0
            }
            
            for d in data:
                if d.period and d.amount:
                    result[d.period] = float(d.amount)
            
            result["total"] = round(sum([result["0-30"], result["31-60"], result["61-90"], 
                                   result["91-120"], result["121+"]]), 2)
            
            return result
            
        except Exception as e:
            frappe.log_error(f"Error in get_customer_ageing_summary: {str(e)}", "Ageing Summary")
            return {"error": str(e)}
    
    # ================================================
    # دالة الحصول على قيود النظام التي سيتم تجاهلها
    # ================================================
    def get_system_generated_vouchers_to_ignore(company_name):
        """
        جلب أرقام قيود اليومية النظامية (إشعارات دائن ومدين) لتجاهلها
        مشابهة لآلية عمل تقرير General Ledger
        """
        try:
            system_generated_vouchers = frappe.db.get_all(
                "Journal Entry",
                filters={
                    "company": company_name,
                    "docstatus": 1,
                    "voucher_type": ("in", ["Credit Note", "Debit Note"]),
                    "is_system_generated": 1,
                },
                pluck="name"  # جلب الأسماء فقط كقائمة
            )
            return system_generated_vouchers
        except Exception as e:
            frappe.log_error(f"Error getting system generated vouchers: {str(e)}", "Statement Report")
            return []
    
    # ================================================
    # دالة حساب الرصيد السابق (معدلة لدعم تجاهل القيود النظامية)
    # ================================================
    def get_previous_balance(party_type, party, from_date_sql, c_currency, s_currency, ignore_system_vouchers=False, system_vouchers_list=None):
        # جلب القيود المحاسبية
        filterss = {"posting_date": ["<", from_date_sql]}
        if party_type == "Account":
            filterss["account"] = party
        else:
            filterss.update({"party_type": party_type, "party": party})
        filterss["is_cancelled"] = 0
        
        gl_entries = frappe.get_all(
            "GL Entry",
            fields=[
                "posting_date",
                "debit", "credit",
                "transaction_currency",
                "debit_in_transaction_currency", "credit_in_transaction_currency",
                "voucher_no"  # ⭐ نضيف رقم السند للتصفية
            ],
            filters=filterss,
        )
        
        # ⭐ تصفية القيود النظامية إذا كان الخيار مفعلاً
        if ignore_system_vouchers and system_vouchers_list:
            gl_entries = [entry for entry in gl_entries if entry.voucher_no not in system_vouchers_list]

        # حساب الرصيد السابق
        p_balance = 0
        for row in gl_entries:
            rate = 1
            if (row["transaction_currency"] == s_currency
                and (row["debit_in_transaction_currency"] or 0) + (row["credit_in_transaction_currency"] or 0) > 0):
                debit = row["debit_in_transaction_currency"] or 0
                credit = row["credit_in_transaction_currency"] or 0
            else:
                debit = row["debit"] or 0
                credit = row["credit"] or 0
                rate = get_simple_exchange_rate(c_currency, s_currency, row.posting_date) or 1

            p_balance = p_balance + debit * rate - credit * rate

        return p_balance
    
    # ================================================
    # دالة حساب أسعار الصرف
    # ================================================
    def get_simple_exchange_rate(from_currency, to_currency, transaction_date=None):
        if not (from_currency and to_currency):
            return 1
        if from_currency == to_currency:
            return 1

        if not transaction_date:
            transaction_date = frappe.datetime.get_today()

        filterss = [
            ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", from_currency],
            ["to_currency", "=", to_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filterss,
            order_by="date desc",
            limit=1
        )

        if not entries:
            filterss = [
                ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
                ["from_currency", "=", to_currency],
                ["to_currency", "=", from_currency],
            ]
            entries = frappe.get_all(
                "Currency Exchange",
                fields=["exchange_rate", "from_currency", "to_currency"],
                filters=filterss,
                order_by="date desc",
                limit=1
            )
            if entries:
                return 1 / frappe.utils.flt(entries[0].exchange_rate)

        if entries:
            return frappe.utils.flt(entries[0].exchange_rate)

        filterss = [
            ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", from_currency],
            ["to_currency", "=", to_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filterss,
            order_by="date asc",
            limit=1
        )

        if not entries:
            filterss = [
                ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
                ["from_currency", "=", to_currency],
                ["to_currency", "=", from_currency],
            ]
            entries = frappe.get_all(
                "Currency Exchange",
                fields=["exchange_rate", "from_currency", "to_currency"],
                filters=filterss,
                order_by="date asc",
                limit=1
            )
            if entries:
                return 1 / frappe.utils.flt(entries[0].exchange_rate)

        if entries:
            return frappe.utils.flt(entries[0].exchange_rate)

        return 1
    
    # ================================================
    # التحقق من صحة الفلاتر
    # ================================================
    if not party_type or not party or not from_date or not to_date:
        # إذا لم يتم اختيار الطرف أو النوع أو التواريخ، نجعل التقرير فارغ
        columns = [
            {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
            {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
            {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Data", "width": 120},
            {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
        ]

        result = []
        ageing_summary = {}
        final_balance = 0
        party = None
    else:
        # ⭐ جلب قائمة القيود النظامية التي سيتم تجاهلها (مرة واحدة فقط)
        system_vouchers_to_ignore = []
        if ignore_cr_dr_notes and company:
            system_vouchers_to_ignore = get_system_generated_vouchers_to_ignore(company)
            if system_vouchers_to_ignore:
                frappe.msgprint(
                    _("سيتم تجاهل {0} قيد نظامي (إشعارات دائن ومدين) في هذا التقرير").format(
                        len(system_vouchers_to_ignore)
                    ),
                    alert=True,
                    indicator="blue"
                )

        # ================================================
        # تعريف الأعمدة (يمكن إضافة عمود إضافي لتوضيح أن التصفية مفعلة)
        # ================================================
        if use_transaction_currency:
            columns = [
                {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
                {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
                {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
                {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
                {"label": "سعر الصرف", "fieldname": "exchange_rate", "fieldtype": "Float", "width": 100, "precision": 4},
                {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "options": "currency", "width": 120},
                {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "options": "currency", "width": 120},
                {"label": "الرصيد", "fieldname": "running_balance", "fieldtype": "Currency", "options": "currency", "width": 120},
            ]
        else:
            columns = [
                {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
                {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
                {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
                {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
                {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "width": 120},
                {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "width": 120},
                {"label": "الرصيد", "fieldname": "running_balance", "fieldtype": "Currency", "width": 120},
            ]
        
        # إضافة عمود إيضاح إذا كان التصفية مفعلة
        if ignore_cr_dr_notes:
            columns.append({
                "label": "ملاحظة",
                "fieldname": "filter_note", 
                "fieldtype": "Data",
                "width": 150
            })
        
        try:
            # ================================================
            # جلب الرصيد السابق (مع دعم تجاهل القيود النظامية)
            # ================================================
            if use_transaction_currency and selected_currency:    
                prev_balance = get_previous_balance(
                    party_type, party, from_date, comp_currency, selected_currency,
                    ignore_system_vouchers=ignore_cr_dr_notes,
                    system_vouchers_list=system_vouchers_to_ignore
                )
            else:
                # بناء الاستعلام مع أو بدون تجاهل القيود النظامية
                if party_type == "Account":
                    sql_query = """
                        SELECT 
                            COALESCE(SUM(debit),0) AS total_debit,
                            COALESCE(SUM(credit),0) AS total_credit
                        FROM `tabGL Entry`
                        WHERE account=%s AND is_cancelled=0
                          AND posting_date < %s
                    """
                    params = [party, from_date]
                    
                    # ⭐ إضافة شرط تجاهل القيود النظامية
                    if ignore_cr_dr_notes and system_vouchers_to_ignore:
                        placeholders = ','.join(['%s'] * len(system_vouchers_to_ignore))
                        sql_query = sql_query + f" AND voucher_no NOT IN ({placeholders})"
                        params.extend(system_vouchers_to_ignore)
                    
                    prev_balance_row = frappe.db.sql(sql_query, params, as_dict=True)
                else:
                    sql_query = """
                        SELECT 
                            COALESCE(SUM(debit),0) AS total_debit,
                            COALESCE(SUM(credit),0) AS total_credit
                        FROM `tabGL Entry`
                        WHERE party_type=%s AND is_cancelled=0
                          AND party=%s
                          AND posting_date < %s
                    """
                    params = [party_type, party, from_date]
                    
                    # ⭐ إضافة شرط تجاهل القيود النظامية
                    if ignore_cr_dr_notes and system_vouchers_to_ignore:
                        placeholders = ','.join(['%s'] * len(system_vouchers_to_ignore))
                        sql_query = sql_query + f" AND voucher_no NOT IN ({placeholders})"
                        params.extend(system_vouchers_to_ignore)
                    
                    prev_balance_row = frappe.db.sql(sql_query, params, as_dict=True)

                if prev_balance_row:
                    prev_balance = prev_balance_row[0].total_debit - prev_balance_row[0].total_credit
                else:
                    prev_balance = 0

            # ================================================
            # جلب الحركات (مع دعم تجاهل القيود النظامية)
            # ================================================
            if party_type == "Account":
                sql_query = """
                    SELECT posting_date, voucher_subtype, voucher_no, remarks,
                           SUM(debit) as debit, SUM(credit) as credit,
                           SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                           SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                           transaction_exchange_rate, voucher_type,
                           COALESCE(transaction_currency, account_currency, 'SAR') as transaction_currency
                    FROM `tabGL Entry`
                    WHERE account=%s AND is_cancelled=0
                      AND posting_date BETWEEN %s AND %s
                """
                params = [party, from_date, to_date]
                
                # ⭐ إضافة شرط تجاهل القيود النظامية
                if ignore_cr_dr_notes and system_vouchers_to_ignore:
                    placeholders = ','.join(['%s'] * len(system_vouchers_to_ignore))
                    sql_query = sql_query + f" AND voucher_no NOT IN ({placeholders})"
                    params.extend(system_vouchers_to_ignore)
                
                sql_query = sql_query + """
                    GROUP BY 
                        posting_date, voucher_subtype, voucher_no, remarks, 
                        transaction_exchange_rate, voucher_type, transaction_currency, account_currency
                    ORDER BY posting_date ASC
                """
                entries = frappe.db.sql(sql_query, params, as_dict=True)
            else:
                sql_query = """
                    SELECT posting_date, voucher_subtype, voucher_no, remarks,
                           SUM(debit) as debit, SUM(credit) as credit,
                           SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                           SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                           transaction_exchange_rate, voucher_type,
                           COALESCE(transaction_currency, account_currency, 'SAR') as transaction_currency
                    FROM `tabGL Entry`
                    WHERE party_type=%s AND is_cancelled=0
                      AND party=%s
                      AND posting_date BETWEEN %s AND %s
                """
                params = [party_type, party, from_date, to_date]
                
                # ⭐ إضافة شرط تجاهل القيود النظامية
                if ignore_cr_dr_notes and system_vouchers_to_ignore:
                    placeholders = ','.join(['%s'] * len(system_vouchers_to_ignore))
                    sql_query = sql_query + f" AND voucher_no NOT IN ({placeholders})"
                    params.extend(system_vouchers_to_ignore)
                
                sql_query = sql_query + """
                    GROUP BY 
                        posting_date, voucher_subtype, voucher_no, remarks, 
                        transaction_exchange_rate, voucher_type, transaction_currency, account_currency
                    ORDER BY posting_date ASC
                """
                entries = frappe.db.sql(sql_query, params, as_dict=True)

            # ================================================
            # تحضير النتيجة وحساب الرصيد الجاري
            # ================================================
            type_map = {
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "Journal Entry": "قيد محاسبي",
                "Opening Entry": "رصيد افتتاحي",
                "Credit Note": "اشعار دائن",
                "Debit Note": "اشعار مدين"
            }

            result = [{
                "posting_date": from_date,
                "voucher_subtype": "رصيد سابق",
                "voucher_no": "",
                "debit": 0,
                "credit": 0,
                "debit_in_transaction_currency": 0,
                "credit_in_transaction_currency": 0,
                "remarks": "رصيد أول الفترة",
                "running_balance": prev_balance,
                "currency": selected_currency or "SAR",
                "exchange_rate": 1,
                "voucher_type": "",
                "filter_note": "⭐ تم تجاهل القيود النظامية" if ignore_cr_dr_notes and system_vouchers_to_ignore else ""
            }]
            
            currency = comp_currency
            if use_transaction_currency and selected_currency:
                currency = selected_currency

            running_balance = prev_balance
            
            for row in entries:
                exchange_rate = 1
                if use_transaction_currency and selected_currency:
                    if (row["transaction_currency"] == selected_currency
                        and row["transaction_exchange_rate"] != 1
                        and row["transaction_exchange_rate"] != 0
                        and (row["debit_in_transaction_currency"] + row["credit_in_transaction_currency"]) > 0):
                        row["debit"] = row["debit_in_transaction_currency"]
                        row["credit"] = row["credit_in_transaction_currency"]
                    else:
                        exchange_rate = get_simple_exchange_rate(comp_currency, selected_currency, row.posting_date) or 1
                        row["transaction_exchange_rate"] = 1 / exchange_rate
                
                row["debit"] = row["debit"] * exchange_rate
                row["credit"] = row["credit"] * exchange_rate
                
                row["debit_in_transaction_currency"] = row["debit"] 
                row["credit_in_transaction_currency"] = row["credit"] 
                
                debit = row["debit"]
                credit = row["credit"]
                running_balance = running_balance + (debit or 0) - (credit or 0)
                
                if row.remarks and row.remarks == "لا ملاحظات":
                    row.remarks = " "
                if row.remarks:
                    if row.remarks.strip().lower() in ["no remarks", "لا ملاحظات"]:
                        row.remarks = " "
                else:
                    row.remarks = " "
                
                result.append({
                    "posting_date": row.posting_date,
                    "voucher_subtype": type_map.get(row.voucher_subtype, row.voucher_subtype),
                    "voucher_no": row.voucher_no,
                    "debit": row.debit,
                    "credit": row.credit,
                    "debit_in_transaction_currency": row.debit_in_transaction_currency,
                    "credit_in_transaction_currency": row.credit_in_transaction_currency,
                    "remarks": row.remarks or " ",
                    "running_balance": running_balance,
                    "currency": currency,
                    "exchange_rate": row["transaction_exchange_rate"],
                    "voucher_type": row.voucher_type,
                    "filter_note": "مستبعد" if ignore_cr_dr_notes and row.voucher_no in system_vouchers_to_ignore else ""
                })
            
            # إضافة صف المجموع النهائي
            final_balance = running_balance
            balance_type = "مدين" if final_balance >= 0 else "دائن"
            arabic_balance = amount_to_arabic_words(abs(final_balance), selected_currency)
            result.append({
                "posting_date": to_date,
                "voucher_subtype": "المجموع النهائي",
                "voucher_no": "",
                "debit": 0,
                "credit": 0,
                "debit_in_transaction_currency": 0,
                "credit_in_transaction_currency": 0,
                "remarks": f"{balance_type}: {arabic_balance}",
                "running_balance": final_balance,
                "currency": currency,
                "exchange_rate": 1,
                "voucher_type": "",
                "bold": 1,
                "filter_note": ""
            })
            
            # ================================================
            # حساب أعمار الديون إذا كان الطرف عميلاً
            # ================================================
            ageing_summary = {}
            if party_type == "Customer":
                ageing_summary = get_customer_ageing_summary(party, from_date, to_date)
            
        except Exception as e:
            frappe.log_error(f"❌ Exception in Statement Report: {str(e)}", "Statement Script")
            frappe.throw(f"حدث خطأ في إنشاء التقرير: {str(e)}")
    
    # ================================================
    # إعداد نص أعمار الديون للعرض في التقرير
    # ================================================
    ageing_text = ""
    if party_type == "Customer" and ageing_summary:
        if "error" in ageing_summary:
            ageing_text = f"خطأ في حساب أعمار الديون: {ageing_summary['error']}"
        elif ageing_summary.get("total", 0) > 0:
            periods = []
            
            period_list = [
                ("0-30", "(<30)"),
                ("31-60", "(30-60)"),
                ("61-90", "(60-90)"), 
                ("91-120", "(90-120)"),
                ("121+", "(120<)")
            ]
            
            for period_key, period_label in period_list:
                amount = ageing_summary.get(period_key, 0)
                percentage = (amount / ageing_summary["total"] * 100) if ageing_summary["total"] > 0 else 0
                periods.append(f"{period_label}: {amount:,.2f}")
            
            if periods:
                ageing_text = ". . . . . .".join(periods)
            else:
                ageing_text = "......"
        else:
            ageing_text = "......"
    
    # إضافة صف أعمار الديون بعد صف المجموع النهائي
    if ageing_text:
        result.append({
            "posting_date": "",
            "voucher_subtype": "📊 أعمار الديون",
            "voucher_no": "",
            "debit": 0,
            "credit": 0,
            "debit_in_transaction_currency": 0,
            "credit_in_transaction_currency": 0,
            "remarks": ageing_text,
            "running_balance": final_balance,
            "currency": selected_currency,
            "exchange_rate": 1,
            "voucher_type": "",
            "italic": 1,
            "color": "#2c3e50",
            "background_color": "#e3f2fd"
        })
        
    # ================================================
    # إعداد message للبيانات الإضافية
    # ================================================
    message = {
        "report_data": {
            "party_type": party_type,
            "party": party if party else "",
            "party_name": "",
            "from_date": from_date,
            "to_date": to_date,
            "currency": selected_currency,
            "company": company,
            "final_balance": final_balance,
            "ageing_summary": ageing_summary if ageing_summary else {},
            "ignore_cr_dr_notes": ignore_cr_dr_notes,  # ⭐ إضافة معلومات عن التصفية
            "ignored_vouchers_count": len(system_vouchers_to_ignore) if ignore_cr_dr_notes else 0  # ⭐ عدد القيود المستبعدة
        }
    }
    
    # جلب اسم الطرف
    if party and party_type:
        try:
            if party_type == "Customer":
                party_name = frappe.db.get_value("Customer", party, "customer_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
            elif party_type == "Supplier":
                party_name = frappe.db.get_value("Supplier", party, "supplier_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
            elif party_type == "Account":
                party_name = frappe.db.get_value("Account", party, "account_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
        except:
            pass
    
    if not message["report_data"].get("party_name") and party:
        message["report_data"]["party_name"] = party
    
    return columns, result, None, message





def execute111(filters=None):
    # =========================
    # تفقيط عربي بدون import + تقريب رقمين عشريين
    # =========================
    def amount_to_arabic_words(amount, currency_code="SAR"):
        ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
        tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
        hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"]

        def tafqeet_0_99(n):
            if n == 0: return ""
            if n < 10: return ones[n]
            if 10 <= n <= 19:
                if n == 10: return "عشرة"
                if n == 11: return "أحد عشر"
                if n == 12: return "اثنا عشر"
                return ones[n - 10] + " عشر"
            
            # تم فصل المتغيرات لتجنب خطأ _unpack_sequence_
            u = n % 10
            t = n // 10
            
            if u > 0:
                return ones[u] + " و " + tens[t]
            return tens[t]

        def tafqeet_0_999(n):
            if n == 0: return ""
            # تم فصل المتغيرات لتجنب خطأ _unpack_sequence_
            h = n // 100
            r = n % 100
            
            parts = []
            if h > 0: 
                parts.append(hundreds[h])
            if r > 0: 
                parts.append(tafqeet_0_99(r))
            return " و ".join(parts)

        def tafqeet_full(n):
            if n == 0: return "صفر"
            
            # تقسيم يدوي للمجموعات
            billions = n // 1000000000
            rem_billions = n % 1000000000
            
            millions = rem_billions // 1000000
            rem_millions = rem_billions % 1000000
            
            thousands = rem_millions // 1000
            rest = rem_millions % 1000
            
            res = []
            
            if billions == 1: res.append("مليار")
            elif billions == 2: res.append("ملياران")
            elif billions > 2:
                b_suffix = "مليارات" if 3 <= billions <= 10 else "مليار"
                res.append(tafqeet_0_999(billions) + " " + b_suffix)

            if millions == 1: res.append("مليون")
            elif millions == 2: res.append("مليونان")
            elif millions > 2:
                m_suffix = "ملايين" if 3 <= millions <= 10 else "مليون"
                res.append(tafqeet_0_999(millions) + " " + m_suffix)

            if thousands == 1: res.append("ألف")
            elif thousands == 2: res.append("ألفان")
            elif thousands > 2:
                t_suffix = "آلاف" if 3 <= thousands <= 10 else "ألف"
                res.append(tafqeet_0_999(thousands) + " " + t_suffix)

            if rest > 0:
                res.append(tafqeet_0_999(rest))
            
            return " و ".join(res)

        # تحويل الرقم
        val = frappe.utils.flt(amount or 0, 2)
        integer_part = int(val)
        decimal_part = int(round((val - integer_part) * 100))

        if decimal_part == 100:
            integer_part = integer_part + 1
            decimal_part = 0

        currency_map = {
            "SAR": {"main": "ريال سعودي", "sub": "هللة"},
            "YER": {"main": "ريال يمني", "sub": "فلس"},
            "USD": {"main": "دولار أمريكي", "sub": "سنت"},
            "AED": {"main": "درهم إماراتي", "sub": "فلس"}
        }
        curr = currency_map.get(currency_code, {"main": currency_code, "sub": ""})

        main_words = tafqeet_full(integer_part) + " " + curr["main"]
        
        final_output = main_words
        if decimal_part > 0 and curr["sub"]:
            sub_words = tafqeet_full(decimal_part) + " " + curr["sub"]
            final_output = main_words + " و " + sub_words
        
        return final_output + " لا غير"


    # تحقق من الفلاتر الأساسية
    if not filters:
        filters = {}
    
    # جلب الفلاتر
    party_type = filters.get("party_type")
    party = filters.get("party") or []
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    use_transaction_currency = filters.get("use_transaction_currency")
    selected_currency = filters.get("currency") or "YER"
    company = filters.get("company")
    
    # العملة الأساسية
    comp_currency = "YER"
    
    # ================================================
    # دالة حساب أعمار الديون للعملاء (يجب تعريفها أولاً)
    # ================================================
    def get_customer_ageing_summary(customer, from_date, to_date, ranges=[30, 60, 90, 120]):
        """
        حساب إجماليات أعمار الديون للعميل
        """
        try:
            # استعلام مباشر ومصحح
            sql = """
                SELECT 
                    CASE 
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '0-30'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '31-60'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '61-90'
                        WHEN DATEDIFF(%s, due_date) <= %s THEN '91-120'
                        ELSE '121+'
                    END as period,
                    SUM(outstanding_amount) as amount
                FROM `tabSales Invoice`
                WHERE docstatus = 1 
                    AND outstanding_amount > 0 
                    AND customer = %s 
                    AND posting_date BETWEEN %s AND %s
                GROUP BY period
            """
            
            params = [
                to_date, ranges[0],        # 0-30
                to_date, ranges[1],        # 31-60  
                to_date, ranges[2],        # 61-90
                to_date, ranges[3],        # 91-120
                customer, from_date, to_date
            ]
            
            data = frappe.db.sql(sql, params, as_dict=True)
            
            # تهيئة النتائج
            result = {
                "0-30": 0.0,
                "31-60": 0.0,
                "61-90": 0.0,
                "91-120": 0.0,
                "121+": 0.0,
                "total": 0.0
            }
            
            # تعيين القيم
            for d in data:
                if d.period and d.amount:
                    result[d.period] = float(d.amount)
            
            # حساب المجموع
            result["total"] = round(sum([result["0-30"], result["31-60"], result["61-90"], 
                                   result["91-120"], result["121+"]]), 2)
            
            return result
            
        except Exception as e:
            frappe.log_error(f"Error in get_customer_ageing_summary: {str(e)}", "Ageing Summary")
            return {"error": str(e)}
    
    # ================================================
    # دالة حساب أسعار الصرف
    # ================================================
    def get_simple_exchange_rate(from_currency, to_currency, transaction_date=None):
        if not (from_currency and to_currency):
            return 1
        if from_currency == to_currency:
            return 1

        if not transaction_date:
            transaction_date = frappe.datetime.get_today()

        # أولًا: جلب آخر سعر <= التاريخ المطلوب
        filterss = [
            ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", from_currency],
            ["to_currency", "=", to_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filterss,
            order_by="date desc",
            limit=1
        )

        # إذا لم نجد، نبحث بالعكس (to_currency → from_currency)
        if not entries:
            filterss = [
                ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
                ["from_currency", "=", to_currency],
                ["to_currency", "=", from_currency],
            ]
            entries = frappe.get_all(
                "Currency Exchange",
                fields=["exchange_rate", "from_currency", "to_currency"],
                filters=filterss,
                order_by="date desc",
                limit=1
            )
            if entries:
                # عكس السعر
                return 1 / frappe.utils.flt(entries[0].exchange_rate)

        if entries:
            return frappe.utils.flt(entries[0].exchange_rate)

        # إذا لم نجد أي سعر <= التاريخ، نبحث عن أول سعر >= التاريخ
        filterss = [
            ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", from_currency],
            ["to_currency", "=", to_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filterss,
            order_by="date asc",
            limit=1
        )

        if not entries:
            filterss = [
                ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
                ["from_currency", "=", to_currency],
                ["to_currency", "=", from_currency],
            ]
            entries = frappe.get_all(
                "Currency Exchange",
                fields=["exchange_rate", "from_currency", "to_currency"],
                filters=filterss,
                order_by="date asc",
                limit=1
            )
            if entries:
                return 1 / frappe.utils.flt(entries[0].exchange_rate)

        if entries:
            return frappe.utils.flt(entries[0].exchange_rate)

        return 1
    
    # ================================================
    # دالة حساب الرصيد السابق
    # ================================================
    def get_previous_balance(party_type, party, from_date_sql, c_currency, s_currency):
        # جلب القيود المحاسبية
        filterss = {"posting_date": ["<", from_date_sql]}
        if party_type == "Account":
            filterss["account"] = party
        else:
            filterss.update({"party_type": party_type, "party": party})
        filterss["is_cancelled"] = 0
        
        gl_entries = frappe.get_all(
            "GL Entry",
            fields=[
                "posting_date",
                "debit", "credit",
                "transaction_currency",
                "debit_in_transaction_currency", "credit_in_transaction_currency"
            ],
            filters=filterss,
        )

        # حساب الرصيد السابق
        p_balance = 0
        for row in gl_entries:
            rate = 1
            if (
                row["transaction_currency"] == s_currency
                and (row["debit_in_transaction_currency"] or 0) + (row["credit_in_transaction_currency"] or 0) > 0
            ):
                debit = row["debit_in_transaction_currency"] or 0
                credit = row["credit_in_transaction_currency"] or 0
            else:
                debit = row["debit"] or 0
                credit = row["credit"] or 0
                rate = get_simple_exchange_rate(c_currency, s_currency, row.posting_date) or 1

            p_balance = p_balance + debit * rate - credit * rate

        return p_balance
    
    # ================================================
    # التحقق من صحة الفلاتر
    # ================================================
    if not party_type or not party or not from_date or not to_date:
        # إذا لم يتم اختيار الطرف أو النوع أو التواريخ، نجعل التقرير فارغ
        columns = [
            {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
            {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
            {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Data", "width": 120},
            {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
        ]

        result = []  # لا توجد بيانات
        ageing_summary = {}
        final_balance = 0
        party = None
    else:

        # ================================================
        # تعريف الأعمدة
        # ================================================
        if use_transaction_currency:
            columns = [
                {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
                {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
                {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
                {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
                {"label": "سعر الصرف", "fieldname": "exchange_rate", "fieldtype": "Float", "width": 100, "precision": 4},
                {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "options": "currency", "width": 120},
                {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "options": "currency", "width": 120},
                {"label": "الرصيد", "fieldname": "running_balance", "fieldtype": "Currency", "options": "currency", "width": 120},
            ]
        else:
            columns = [
                {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
                {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
                {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
                {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
                {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "width": 120},
                {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "width": 120},
                {"label": "الرصيد", "fieldname": "running_balance", "fieldtype": "Currency", "width": 120},
            ]
        
        try:
            # ================================================
            # جلب الرصيد السابق
            # ================================================
            if use_transaction_currency and selected_currency:    
                prev_balance = get_previous_balance(party_type, party, from_date, comp_currency, selected_currency)
            else:
                if party_type == "Account":
                    prev_balance_row = frappe.db.sql("""
                        SELECT 
                            COALESCE(SUM(debit),0) AS total_debit,
                            COALESCE(SUM(credit),0) AS total_credit
                        FROM `tabGL Entry`
                        WHERE account=%s AND is_cancelled=0
                          AND posting_date < %s
                    """, (party, from_date), as_dict=True)
                else:
                    prev_balance_row = frappe.db.sql("""
                        SELECT 
                            COALESCE(SUM(debit),0) AS total_debit,
                            COALESCE(SUM(credit),0) AS total_credit
                        FROM `tabGL Entry`
                        WHERE party_type=%s AND is_cancelled=0
                          AND party=%s
                          AND posting_date < %s
                    """, (party_type, party, from_date), as_dict=True)

                if prev_balance_row:
                    prev_balance = prev_balance_row[0].total_debit - prev_balance_row[0].total_credit
                else:
                    prev_balance = 0

            # ================================================
            # جلب الحركات
            # ================================================
            if party_type == "Account":
                entries = frappe.db.sql("""
                    SELECT posting_date, voucher_subtype, voucher_no, remarks,
                           SUM(debit) as debit, SUM(credit) as credit,
                           SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                           SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                           transaction_exchange_rate, voucher_type,
                           COALESCE(transaction_currency, account_currency, 'YER') as transaction_currency
                    FROM `tabGL Entry`
                    WHERE account=%s AND is_cancelled=0
                      AND posting_date BETWEEN %s AND %s
                    GROUP BY 
                        posting_date, voucher_subtype, voucher_no, remarks, 
                        transaction_exchange_rate, voucher_type, transaction_currency, account_currency
                    ORDER BY posting_date ASC
                """, (party, from_date, to_date), as_dict=True)
            else:
                entries = frappe.db.sql("""
                    SELECT posting_date, voucher_subtype, voucher_no, remarks,
                           SUM(debit) as debit, SUM(credit) as credit,
                           SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                           SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                           transaction_exchange_rate, voucher_type,
                           COALESCE(transaction_currency, account_currency, 'YER') as transaction_currency
                    FROM `tabGL Entry`
                    WHERE party_type=%s AND is_cancelled=0
                      AND party=%s
                      AND posting_date BETWEEN %s AND %s
                    GROUP BY 
                        posting_date, voucher_subtype, voucher_no, remarks, 
                        transaction_exchange_rate, voucher_type, transaction_currency, account_currency
                    ORDER BY posting_date ASC
                """, (party_type, party, from_date, to_date), as_dict=True)

            # ================================================
            # تحضير النتيجة وحساب الرصيد الجاري
            # ================================================
            type_map1 = {
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "Journal Entry": "قيد محاسبي",
                "Opening Entry": "رصيد افتتاحي",
                "Credit Note": "اشعار دائن/مرتجع"
            }
            type_map = {

                # سندات
                "Pay": "سند صرف",
                "Receive": "سند قبض",
                "Payment Entry": "سند قبض / صرف",
                "Internal Transfer": "تحويل داخلي",
                "Cash Entry": "حركة نقدية",

                # الفواتير
                "Sales Invoice": "فاتورة مبيعات",
                "Purchase Invoice": "فاتورة مشتريات",
                "POS Invoice": "فاتورة نقطة بيع",

                # الطلبات
                "Sales Order": "أمر بيع",
                "Purchase Order": "أمر شراء",

                # المخزون
                "Stock Entry": "قيد مخزني",
                "Stock Reconciliation": "تسوية مخزون",
                "Material Receipt": "استلام مواد",
                "Delivery Note": "إذن تسليم",
                "Purchase Receipt": "إذن استلام",

                # المرتجعات
                "Credit Note": "إشعار دائن / مرتجع مبيعات",
                "Debit Note": "إشعار مدين / مرتجع مشتريات",

                # القيود المحاسبية
                "Journal Entry": "قيد محاسبي",
                "Opening Entry": "رصيد افتتاحي",
                "Contra": "قيد مقابل",
                "Write Off": "شطب",
                "Period Closing Voucher": "قيد إقفال فترة",

                # المصاريف
                "Expense Claim": "مطالبة مصروف",

                # فروقات العملة
                "Exchange Gain/Loss": "أرباح / خسائر فروقات عملة",

                # الأصول
                "Asset Movement": "حركة أصل",
                "Asset Depreciation": "إهلاك أصل",

                # البنوك
                "Bank Reconciliation": "تسوية بنكية"
            }

            result = [{
                "posting_date": from_date,
                "voucher_subtype": "رصيد سابق",
                "voucher_no": "",
                "debit": 0,
                "credit": 0,
                "debit_in_transaction_currency": 0,
                "credit_in_transaction_currency": 0,
                "remarks": "",
                "running_balance": prev_balance,
                "currency": selected_currency or "YER",
                "exchange_rate": 1,
                "voucher_type": ""
            }]
            
            currency = comp_currency
            if use_transaction_currency and selected_currency:
                currency = selected_currency

            running_balance = prev_balance
            
            for row in entries:
                exchange_rate = 1
                if use_transaction_currency and selected_currency:
                    if (
                        row["transaction_currency"] == selected_currency
                        and row["transaction_exchange_rate"] != 1
                        and row["transaction_exchange_rate"] != 0
                        and (row["debit_in_transaction_currency"] + row["credit_in_transaction_currency"]) > 0
                    ):
                        row["debit"] = row["debit_in_transaction_currency"]
                        row["credit"] = row["credit_in_transaction_currency"]
                    else:
                        exchange_rate = get_simple_exchange_rate(comp_currency, selected_currency, row.posting_date) or 1
                        row["transaction_exchange_rate"] = 1 / exchange_rate
                
                row["debit"] = row["debit"] * exchange_rate
                row["credit"] = row["credit"] * exchange_rate
                
                row["debit_in_transaction_currency"] = row["debit"] 
                row["credit_in_transaction_currency"] = row["credit"] 
                
                debit = row["debit"]
                credit = row["credit"]
                running_balance = running_balance + (debit or 0) - (credit or 0)
                
                if row.remarks and row.remarks == "لا ملاحظات" :
                    row.remarks = " ";
                if row.remarks:
                    if row.remarks.strip().lower() in ["no remarks", "لا ملاحظات"]:
                        row.remarks = " "
                else:
                    row.remarks = " "
                result.append({
                    "posting_date": row.posting_date,
                    "voucher_subtype": type_map.get(row.voucher_subtype, row.voucher_subtype),
                    "voucher_no": row.voucher_no,
                    "debit": row.debit,
                    "credit": row.credit,
                    "debit_in_transaction_currency": row.debit_in_transaction_currency,
                    "credit_in_transaction_currency": row.credit_in_transaction_currency,
                    "remarks": row.remarks or " ",
                    "running_balance": running_balance,
                    "currency": currency,
                    "exchange_rate": row["transaction_exchange_rate"],
                    "voucher_type": row.voucher_type
                })
            
            # إضافة صف المجموع النهائي
            final_balance = running_balance
            balance_type = "مدين" if final_balance >= 0 else "دائن"
            arabic_balance = amount_to_arabic_words(abs(final_balance), selected_currency)
            result.append({
                "posting_date": to_date,
                "voucher_subtype": "المجموع النهائي",
                "voucher_no": "",
                "debit": 0,
                "credit": 0,
                "debit_in_transaction_currency": 0,
                "credit_in_transaction_currency": 0,
                "remarks": f"{balance_type}: {arabic_balance}",
                "running_balance": final_balance,
                "currency": currency,
                "exchange_rate": 1,
                "voucher_type": "",
                "bold": 1
            })
            
            # ================================================
            # حساب أعمار الديون إذا كان الطرف عميلاً
            # ================================================
            ageing_summary = {}
            if party_type == "Customer":
                ageing_summary = get_customer_ageing_summary(party, from_date, to_date)
            
        except Exception as e:
            frappe.log_error(f"❌ Exception in Statement Report: {str(e)}", "Statement Script")
            frappe.throw(f"حدث خطأ في إنشاء التقرير: {str(e)}")
    
    # ================================================
    # إعداد نص أعمار الديون للعرض في التقرير
    # ================================================
    ageing_text = ""
    if party_type == "Customer" and ageing_summary:
        # تحقق إذا كان هناك خطأ
        if "error" in ageing_summary:
            ageing_text = f"خطأ في حساب أعمار الديون: {ageing_summary['error']}"
        elif ageing_summary.get("total", 0) > 0:
            #ageing_text = "📊 أعمار الديون:\n"
            periods = []
            
            # جميع الفترات
            period_list = [
                ("0-30", "(<30)"),
                ("31-60", "(30-60)"),
                ("61-90", "(60-90)"), 
                ("91-120", "(90-120)"),
                ("121+", "(120<)")
            ]
            
            for period_key, period_label in period_list:
                amount = ageing_summary.get(period_key, 0)
                #if amount > 0:
                percentage = (amount / ageing_summary["total"] * 100) if ageing_summary["total"] > 0 else 0
                periods.append(f"{period_label}: {amount:,.2f}    ")
            
            if periods:
                ageing_text = ageing_text + ". . . . . .".join(periods)
                ageing_text = ageing_text + f". . . . . .Sum: {ageing_summary['total']:,.2f}"
            else:
                ageing_text = "لا توجد ديون مستحقة للعميل في الفترة المحددة"
        else:
            ageing_text = "لا توجد ديون مستحقة للعميل في الفترة المحددة"
    
    # إضافة صف أعمار الديون بعد صف المجموع النهائي
    if ageing_text:
        result.append({
            "posting_date": "",
            "voucher_subtype": "📊 أعمار الديون",
            "voucher_no": "",
            "debit": 0,
            "credit": 0,
            "debit_in_transaction_currency": 0,
            "credit_in_transaction_currency": 0,
            "remarks": ageing_text,
            "running_balance": final_balance,
            "currency": selected_currency,
            "exchange_rate": 1,
            "voucher_type": "",
            "italic": 1,
            "color": "#2c3e50",
            "background_color": "#e3f2fd"
        })
        
    
    # ================================================
    # إعداد message للبيانات الإضافية
    # ================================================
    message = {
        "report_data": {
            "party_type": party_type,
            "party": party if party else "",
            "party_name": "",
            "from_date": from_date,
            "to_date": to_date,
            "currency": selected_currency,
            "company": company,
            "final_balance": final_balance,
            "ageing_summary": ageing_summary if ageing_summary else {}
        }
    }
    
    # جلب اسم الطرف
    if party and party_type:
        try:
            if party_type == "Customer":
                party_name = frappe.db.get_value("Customer", party, "customer_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
            elif party_type == "Supplier":
                party_name = frappe.db.get_value("Supplier", party, "supplier_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
            elif party_type == "Account":
                party_name = frappe.db.get_value("Account", party, "account_name")
                if party_name:
                    message["report_data"]["party_name"] = party_name
        except:
            pass
    
    # إذا لم يتم الحصول على اسم، استخدم الكود
    if not message["report_data"].get("party_name") and party:
        message["report_data"]["party_name"] = party
    
    # ================================================
    # إرجاع النتائج
    # ================================================
    return columns, result, None, message

