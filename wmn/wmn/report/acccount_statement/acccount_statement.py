import frappe
from frappe import _

def execute(filters=None):
    if not filters:
        filters = {}
    
    columns = get_columns(filters)
    data = get_data(filters)
    
    return columns, data

def get_columns(filters):
    """إرجاع الأعمدة بناءً على الفلاتر"""
    base_columns = [
        {"label": "التاريخ", "fieldname": "posting_date", "fieldtype": "Date", "width": 120},
        {"label": "نوع السند", "fieldname": "voucher_subtype", "fieldtype": "Data", "width": 150},
        {"label": "رقم السند", "fieldname": "voucher_no", "fieldtype": "Dynamic Link", "options": "voucher_type", "width": 180},
        {"label": "ملاحظات", "fieldname": "remarks", "fieldtype": "Data", "width": 200},
    ]
    
    use_transaction_currency = filters.get("use_transaction_currency")
    
    if use_transaction_currency:
        currency = filters.get("currency", "YER")
        columns = base_columns + [
            {"label": "سعر الصرف", "fieldname": "exchange_rate", "fieldtype": "Float", "width": 100, "precision": 6},
            {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "options": "currency", "width": 120},
            {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "options": "currency", "width": 120},
            {"label": "الرصيد", "fieldname": "balance", "fieldtype": "Currency", "options": "currency", "width": 120},
            {"label": "currency", "fieldname": "currency", "fieldtype": "Data", "hidden": 1},
        ]
    else:
        columns = base_columns + [
            {"label": "مدين", "fieldname": "debit", "fieldtype": "Currency", "width": 120},
            {"label": "دائن", "fieldname": "credit", "fieldtype": "Currency", "width": 120},
            {"label": "الرصيد", "fieldname": "balance", "fieldtype": "Currency", "width": 120},
        ]
    
    return columns

def get_filters(filters):
    """بناء فلتر Script Report"""
    return [
        {
            "fieldname": "company",
            "label": _("الشركة"),
            "fieldtype": "Link",
            "options": "Company",
            "reqd": 1,
            "default": frappe.defaults.get_user_default("Company")
        },
        {
            "fieldname": "party_type",
            "label": _("نوع الطرف"),
            "fieldtype": "Select",
            "options": "\nCustomer\nSupplier\nEmployee\nAccount",
            "reqd": 1
        },
        {
            "fieldname": "party",
            "label": _("الطرف"),
            "fieldtype": "MultiSelectList",
            "get_data": get_party_options,
            "reqd": 1
        },
        {
            "fieldname": "from_date",
            "label": _("من تاريخ"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": frappe.utils.nowdate()
        },
        {
            "fieldname": "to_date",
            "label": _("إلى تاريخ"),
            "fieldtype": "Date",
            "reqd": 1,
            "default": frappe.utils.nowdate()
        },
        {
            "fieldname": "use_transaction_currency",
            "label": _("عرض بعملة أخرى"),
            "fieldtype": "Check",
            "default": 0
        },
        {
            "fieldname": "currency",
            "label": _("العملة"),
            "fieldtype": "Link",
            "options": "Currency",
            "depends_on": "use_transaction_currency",
            "mandatory_depends_on": "use_transaction_currency",
            "default": frappe.db.get_value("Company", frappe.defaults.get_user_default("Company"), "default_currency")
        }
    ]

def get_party_options(doctype, txt, searchfield, start, page_len, filters):
    """جلب قائمة الأطراف بناءً على نوع الطرف المحدد"""
    party_type = filters.get("party_type")
    
    if not party_type:
        return []
    
    if party_type == "Account":
        return frappe.db.sql("""
            SELECT name, name 
            FROM `tabAccount`
            WHERE is_group = 0
              AND (name LIKE %s OR account_name LIKE %s)
              AND company = %s
            ORDER BY name
            LIMIT %s, %s
        """, (f"%{txt}%", f"%{txt}%", filters.get("company"), start, page_len))
    
    else:
        # لـ Customer, Supplier, Employee
        party_doctype_map = {
            "Customer": "Customer",
            "Supplier": "Supplier",
            "Employee": "Employee"
        }
        
        party_doctype = party_doctype_map.get(party_type)
        if not party_doctype:
            return []
        
        return frappe.db.sql("""
            SELECT name, name 
            FROM `tab{0}`
            WHERE name LIKE %s 
               OR customer_name LIKE %s
            ORDER BY name
            LIMIT %s, %s
        """.format(party_doctype), (f"%{txt}%", f"%{txt}%", start, page_len))

def validate_filters(filters):
    """التحقق من صحة الفلاتر"""
    if not filters.get("company"):
        frappe.throw(_("الرجاء تحديد الشركة"))
    
    if not filters.get("party_type"):
        frappe.throw(_("الرجاء تحديد نوع الطرف"))
    
    if not filters.get("party") or len(filters.get("party", [])) == 0:
        frappe.throw(_("الرجاء تحديد طرف واحد على الأقل"))
    
    if len(filters.get("party", [])) > 1:
        frappe.throw(_("الرجاء اختيار طرف واحد فقط للعرض في التقرير"))

def get_exchange_rate_simple(from_currency, to_currency, date, company):
    """نسخة مبسطة من دالة سعر الصرف مع مراعاة الشركة"""
    if from_currency == to_currency:
        return 1.0
    
    try:
        # جلب سعر الصرف من جدول Currency Exchange مع مراعاة الشركة
        rate = frappe.db.get_value(
            "Currency Exchange",
            filters={
                "date": ["<=", date],
                "from_currency": from_currency,
                "to_currency": to_currency
            },
            fieldname="exchange_rate",
            order_by="date desc"
        )
        
        if rate:
            return float(rate)
        
        # محاولة العكس
        rate = frappe.db.get_value(
            "Currency Exchange",
            filters={
                "date": ["<=", date],
                "from_currency": to_currency,
                "to_currency": from_currency
            },
            fieldname="exchange_rate",
            order_by="date desc"
        )
        
        if rate:
            return 1.0 / float(rate)
            
    except Exception:
        pass
    
    # السعر الافتراضي
    frappe.msgprint(_("تحذير: لم يتم العثور على سعر صرف لـ {0} إلى {1} بتاريخ {2}").format(
        from_currency, to_currency, date
    ))
    return 1.0

def get_previous_balance(party_type, party, from_date, company, company_currency, selected_currency):
    """حساب الرصيد السابق مع مراعاة الشركة"""
    # بناء الفلاتر
    filters = {
        "posting_date": ["<", from_date],
        "is_cancelled": 0,
        "company": company
    }
    
    if party_type == "Account":
        filters["account"] = party
    else:
        filters.update({
            "party_type": party_type,
            "party": party
        })
    
    # جلب البيانات
    gl_entries = frappe.get_all(
        "GL Entry",
        fields=[
            "posting_date",
            "debit", "credit",
            "debit_in_transaction_currency", 
            "credit_in_transaction_currency",
            "transaction_currency"
        ],
        filters=filters
    )
    
    balance = 0.0
    
    for entry in gl_entries:
        if (entry.transaction_currency == selected_currency and 
            (entry.debit_in_transaction_currency or 0) + (entry.credit_in_transaction_currency or 0) > 0):
            debit = entry.debit_in_transaction_currency or 0
            credit = entry.credit_in_transaction_currency or 0
            rate = 1.0
        else:
            debit = entry.debit or 0
            credit = entry.credit or 0
            rate = get_exchange_rate_simple(
                company_currency, 
                selected_currency, 
                entry.posting_date,
                company
            ) or 1.0
        
        balance += (debit * rate) - (credit * rate)
    
    return balance

def get_data(filters):
    """جلب البيانات الرئيسية للتقرير"""
    validate_filters(filters)
    
    company = filters.get("company")
    party_type = filters.get("party_type")
    party = filters.get("party")[0]  # نأخذ الطرف الأول فقط
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    use_transaction_currency = filters.get("use_transaction_currency", False)
    selected_currency = filters.get("currency")
    
    # الحصول على العملة الأساسية للشركة
    company_currency = frappe.db.get_value("Company", company, "default_currency") or "YER"
    
    if not selected_currency:
        selected_currency = company_currency
    
    result = []
    
    # 1. حساب الرصيد السابق
    previous_balance = 0
    
    if use_transaction_currency and selected_currency != company_currency:
        previous_balance = get_previous_balance(
            party_type, party, from_date, company, company_currency, selected_currency
        )
    else:
        # حساب الرصيد باستخدام العملة الأساسية
        if party_type == "Account":
            prev_data = frappe.db.sql("""
                SELECT COALESCE(SUM(debit - credit), 0) as balance
                FROM `tabGL Entry`
                WHERE account = %s 
                  AND company = %s
                  AND is_cancelled = 0
                  AND posting_date < %s
            """, (party, company, from_date), as_dict=True)
        else:
            prev_data = frappe.db.sql("""
                SELECT COALESCE(SUM(debit - credit), 0) as balance
                FROM `tabGL Entry`
                WHERE party_type = %s
                  AND party = %s
                  AND company = %s
                  AND is_cancelled = 0
                  AND posting_date < %s
            """, (party_type, party, company, from_date), as_dict=True)
        
        previous_balance = prev_data[0].balance if prev_data else 0
    
    # إضافة سطر الرصيد السابق
    result.append({
        "posting_date": from_date,
        "voucher_subtype": "رصيد سابق",
        "voucher_no": "",
        "debit": 0,
        "credit": 0,
        "remarks": "",
        "balance": previous_balance,
        "currency": selected_currency if use_transaction_currency else company_currency,
        "exchange_rate": 1.0,
        "voucher_type": ""
    })
    
    # 2. جلب الحركات في الفترة
    if party_type == "Account":
        entries_query = """
            SELECT 
                posting_date,
                voucher_subtype,
                voucher_no,
                voucher_type,
                remarks,
                SUM(debit) as debit,
                SUM(credit) as credit,
                SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                AVG(transaction_exchange_rate) as transaction_exchange_rate,
                MAX(transaction_currency) as transaction_currency
            FROM `tabGL Entry`
            WHERE account = %s
              AND company = %s
              AND is_cancelled = 0
              AND posting_date BETWEEN %s AND %s
            GROUP BY posting_date, voucher_subtype, voucher_no, voucher_type, remarks
            ORDER BY posting_date ASC, voucher_no ASC
        """
        params = (party, company, from_date, to_date)
    else:
        entries_query = """
            SELECT 
                posting_date,
                voucher_subtype,
                voucher_no,
                voucher_type,
                remarks,
                SUM(debit) as debit,
                SUM(credit) as credit,
                SUM(debit_in_transaction_currency) as debit_in_transaction_currency,
                SUM(credit_in_transaction_currency) as credit_in_transaction_currency,
                AVG(transaction_exchange_rate) as transaction_exchange_rate,
                MAX(transaction_currency) as transaction_currency
            FROM `tabGL Entry`
            WHERE party_type = %s
              AND party = %s
              AND company = %s
              AND is_cancelled = 0
              AND posting_date BETWEEN %s AND %s
            GROUP BY posting_date, voucher_subtype, voucher_no, voucher_type, remarks
            ORDER BY posting_date ASC, voucher_no ASC
        """
        params = (party_type, party, company, from_date, to_date)
    
    entries = frappe.db.sql(entries_query, params, as_dict=True)
    
    # 3. معالجة الحركات وإضافة الرصيد الجاري
    running_balance = previous_balance
    type_map = {
        "Pay": "سند صرف",
        "Receive": "سند قبض",
        "Sales Invoice": "فاتورة مبيعات",
        "Purchase Invoice": "فاتورة مشتريات",
        "Journal Entry": "قيد محاسبي",
        "Payment Entry": "سند دفع/قبض",
        "Expense Claim": "مطالبة مصروفات",
        "Salary Slip": "مسير رواتب"
    }
    
    for entry in entries:
        exchange_rate = 1.0
        debit = entry.debit or 0
        credit = entry.credit or 0
        
        if use_transaction_currency and selected_currency != company_currency:
            if (entry.transaction_currency == selected_currency and
                entry.transaction_exchange_rate and
                (entry.debit_in_transaction_currency or 0) + (entry.credit_in_transaction_currency or 0) > 0):
                
                debit = entry.debit_in_transaction_currency or 0
                credit = entry.credit_in_transaction_currency or 0
                exchange_rate = 1.0
            else:
                exchange_rate = get_exchange_rate_simple(
                    company_currency, 
                    selected_currency, 
                    entry.posting_date,
                    company
                )
                debit = debit * exchange_rate
                credit = credit * exchange_rate
        
        running_balance += debit - credit
        
        result.append({
            "posting_date": entry.posting_date,
            "voucher_subtype": type_map.get(entry.voucher_subtype, entry.voucher_subtype),
            "voucher_no": entry.voucher_no,
            "voucher_type": entry.voucher_type,
            "remarks": entry.remarks or "",
            "debit": debit,
            "credit": credit,
            "balance": running_balance,
            "currency": selected_currency if use_transaction_currency else company_currency,
            "exchange_rate": exchange_rate
        })
    
    return result

def get_chart_data(data, filters):
    """إنشاء رسم بياني للبيانات"""
    if not data or len(data) <= 1:
        return None
    
    company = filters.get("company")
    party_type = filters.get("party_type")
    party = filters.get("party")[0] if filters.get("party") else ""
    
    chart = {
        "data": {
            "labels": [d.get("posting_date") for d in data if d.get("posting_date")],
            "datasets": [
                {
                    "name": _("الرصيد"),
                    "values": [d.get("balance") for d in data if d.get("balance")],
                    "chartType": "line"
                }
            ]
        },
        "type": "line",
        "title": _("تقرير حركات الطرف: {0} - {1}").format(party_type, party),
        "height": 300
    }
    
    return chart