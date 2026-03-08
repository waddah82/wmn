# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, getdate, formatdate, cstr
from erpnext.accounts.report.financial_statements \
    import filter_accounts, set_gl_entries_by_account, filter_out_zero_value_rows
from erpnext.accounts.doctype.accounting_dimension.accounting_dimension import get_accounting_dimensions

value_fields = ("opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit")

def execute(filters=None):
    validate_filters(filters)
    data = get_data(filters)
    columns = get_columns()
    return columns, data

def validate_filters(filters):
    if not filters.fiscal_year:
        frappe.throw(_("Fiscal Year {0} is required").format(filters.fiscal_year))

    fiscal_year = frappe.db.get_value("Fiscal Year", filters.fiscal_year, ["year_start_date", "year_end_date"], as_dict=True)
    if not fiscal_year:
        frappe.throw(_("Fiscal Year {0} does not exist").format(filters.fiscal_year))
    else:
        filters.year_start_date = getdate(fiscal_year.year_start_date)
        filters.year_end_date = getdate(fiscal_year.year_end_date)

    # معالجة from_date إذا لم يتم إدخاله
    if not filters.get("from_date"):
        filters.from_date = filters.year_start_date
    else:
        filters.from_date = getdate(filters.from_date)

    # معالجة to_date إذا لم يتم إدخاله
    if not filters.get("to_date"):
        filters.to_date = filters.year_end_date
    else:
        filters.to_date = getdate(filters.to_date)

    if filters.from_date > filters.to_date:
        frappe.throw(_("From Date cannot be greater than To Date"))

    if (filters.from_date < filters.year_start_date) or (filters.from_date > filters.year_end_date):
        frappe.msgprint(_("From Date should be within the Fiscal Year. Assuming From Date = {0}")\
            .format(formatdate(filters.year_start_date)))
        filters.from_date = filters.year_start_date

    if (filters.to_date < filters.year_start_date) or (filters.to_date > filters.year_end_date):
        frappe.msgprint(_("To Date should be within the Fiscal Year. Assuming To Date = {0}")\
            .format(formatdate(filters.year_end_date)))
        filters.to_date = filters.year_end_date

def get_data(filters):
    accounts = frappe.db.sql("""select name, account_number, parent_account, account_name, root_type, report_type, lft, rgt
        from `tabAccount` where company=%s order by lft""", filters.company, as_dict=True)
    company_currency = frappe.db.get_value("Company", filters.company, "default_currency")

    if not accounts:
        return None

    accounts, accounts_by_name, parent_children_map = filter_accounts(accounts)

    min_lft, max_rgt = frappe.db.sql("""select min(lft), max(rgt) from `tabAccount`
        where company=%s""", (filters.company,))[0]

    gl_entries_by_account = {}
    opening_entries_by_account = {}

    # جلب القيود الافتتاحية (قبل from_date) بشكل منفصل مع تواريخها
    # إذا كان from_date = بداية السنة المالية، فلن تكون هناك قيود افتتاحية (كلها ستكون ضمن القيود اليومية)
    if filters.from_date > filters.year_start_date:
        get_opening_entries(filters, opening_entries_by_account, min_lft, max_rgt)
    
    # جلب القيود اليومية (من from_date إلى to_date)
    # إذا كان from_date = بداية السنة المالية، ستشمل هذه القيود جميع القيود من بداية السنة
    set_gl_entries_by_account(filters.company, filters.from_date,
        filters.to_date, min_lft, max_rgt, filters, gl_entries_by_account, ignore_closing_entries=not flt(filters.with_period_closing_entry))

    total_row = calculate_values(accounts, gl_entries_by_account, opening_entries_by_account, filters, company_currency)
    accumulate_values_into_parents(accounts, accounts_by_name)

    data = prepare_data(accounts, filters, total_row, parent_children_map, company_currency)
    data = filter_out_zero_value_rows(data, parent_children_map, show_zero_values=filters.get("show_zero_values"))

    return data

def get_opening_entries(filters, opening_entries_by_account, min_lft, max_rgt):
    """جلب جميع القيود الافتتاحية (قبل from_date) مع تواريخها"""
    additional_conditions = get_additional_conditions(filters)
    
    # فقط إذا كان from_date > بداية السنة المالية
    if filters.from_date <= filters.year_start_date:
        return
    
    # جلب جميع القيود قبل from_date (بما في ذلك قيود الافتتاح)
    gle = frappe.db.sql("""
        select
            account,
            posting_date,
            debit,
            credit,
            debit_in_account_currency,
            credit_in_account_currency,
            account_currency,
            is_opening,
            fiscal_year
        from `tabGL Entry`
        where
            company=%(company)s
            {additional_conditions}
            and posting_date < %(from_date)s
            and posting_date >= %(year_start_date)s  # فقط من بداية السنة المالية
            and is_cancelled = 0
            and account in (
                select name from `tabAccount`
                where company=%(company)s
                and lft >= %(min_lft)s
                and rgt <= %(max_rgt)s
            )
        order by posting_date, account
    """.format(additional_conditions=additional_conditions), {
        "company": filters.company,
        "from_date": filters.from_date,
        "year_start_date": filters.year_start_date,
        "min_lft": min_lft,
        "max_rgt": max_rgt
    }, as_dict=True)
    
    for entry in gle:
        opening_entries_by_account.setdefault(entry.account, []).append(entry)

def get_additional_conditions(filters):
    """إنشاء شروط إضافية للاستعلام"""
    conditions = []
    
    if not flt(filters.with_period_closing_entry):
        conditions.append("ifnull(voucher_type, '')!='Period Closing Voucher'")
    
    if filters.get("cost_center"):
        lft, rgt = frappe.db.get_value('Cost Center', filters.cost_center, ['lft', 'rgt'])
        conditions.append("""cost_center in (select name from `tabCost Center`
            where lft >= {lft} and rgt <= {rgt})""".format(lft=lft, rgt=rgt))
    
    if filters.get("finance_book"):
        fb_conditions = "finance_book = '{finance_book}'".format(finance_book=filters.finance_book)
        if filters.get("include_default_book_entries"):
            company_fb = frappe.db.get_value("Company", filters.company, 'default_finance_book')
            fb_conditions = "(finance_book in ('{finance_book}', '{company_fb}'))".format(
                finance_book=filters.finance_book, company_fb=company_fb
            )
        conditions.append(fb_conditions)
    
    accounting_dimensions = get_accounting_dimensions()
    for dimension in accounting_dimensions:
        if filters.get(dimension):
            conditions.append("{dimension} = '{value}'".format(
                dimension=dimension, value=filters.get(dimension)
            ))
    
    return " and " + " and ".join(conditions) if conditions else ""

def get_simple_exchange_rate(from_currency, to_currency, transaction_date=None):
    """الحصول على سعر صرف بين عملتين في تاريخ معين"""
    if not (from_currency and to_currency):
        return 1
    if from_currency == to_currency:
        return 1
    if not transaction_date:
        transaction_date = frappe.utils.get_today()
    
    # البحث عن سعر صرف قبل أو في تاريخ المعاملة
    filters = [
        ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
        ["from_currency", "=", from_currency],
        ["to_currency", "=", to_currency],
    ]
    entries = frappe.get_all(
        "Currency Exchange",
        fields=["exchange_rate", "from_currency", "to_currency"],
        filters=filters,
        order_by="date desc",
        limit=1
    )
    
    if not entries:
        # البحث في الاتجاه المعاكس
        filters = [
            ["date", "<=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", to_currency],
            ["to_currency", "=", from_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filters,
            order_by="date desc",
            limit=1
        )
        if entries:
            return 1 / frappe.utils.flt(entries[0].exchange_rate)
    
    if entries:
        return frappe.utils.flt(entries[0].exchange_rate)
    
    # إذا لم يتم العثور على سعر صرف قبل التاريخ، ابحث عن سعر بعد التاريخ
    filters = [
        ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
        ["from_currency", "=", from_currency],
        ["to_currency", "=", to_currency],
    ]
    entries = frappe.get_all(
        "Currency Exchange",
        fields=["exchange_rate", "from_currency", "to_currency"],
        filters=filters,
        order_by="date asc",
        limit=1
    )
    
    if not entries:
        # البحث في الاتجاه المعاكس
        filters = [
            ["date", ">=", frappe.utils.get_datetime_str(transaction_date)],
            ["from_currency", "=", to_currency],
            ["to_currency", "=", from_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filters,
            order_by="date asc",
            limit=1
        )
        if entries:
            return 1 / frappe.utils.flt(entries[0].exchange_rate)
    
    if entries:
        return frappe.utils.flt(entries[0].exchange_rate)
    
    # إذا لم يتم العثور على أي سعر صرف
    frappe.msgprint(_("لم يتم العثور على سعر صرف لـ {0} إلى {1} في تاريخ {2}. سيتم استخدام سعر 1.0").format(
        from_currency, to_currency, transaction_date
    ))
    return 1

def calculate_values(accounts, gl_entries_by_account, opening_entries_by_account, _filters, company_currency):
    init = {
        "opening_debit": 0.0,
        "opening_credit": 0.0,
        "debit": 0.0,
        "credit": 0.0,
        "closing_debit": 0.0,
        "closing_credit": 0.0
    }

    # الحصول على عملة الفلتر
    filter_currency = _filters.get("currency") if _filters else company_currency
    from_date = _filters.get("from_date")
    year_start_date = _filters.get("year_start_date")
    
    total_row = {
        "account": "'" + _("Total") + "'",
        "account_name": "'" + _("Total") + "'",
        "warn_if_negative": True,
        "opening_debit": 0.0,
        "opening_credit": 0.0,
        "debit": 0.0,
        "credit": 0.0,
        "closing_debit": 0.0,
        "closing_credit": 0.0,
        "parent_account": None,
        "indent": 0,
        "has_value": True,
        "currency": filter_currency
    }

    for d in accounts:
        d.update(init.copy())
        d["currency"] = filter_currency

        # إذا كان from_date = بداية السنة المالية، فلا توجد قيود افتتاحية
        # لأن جميع القيود من بداية السنة ستكون في القيود اليومية
        if from_date > year_start_date:
            # حساب الأرصدة الافتتاحية من القيود الافتتاحية (كل قيد على حدة)
            opening_entries = opening_entries_by_account.get(d.name, [])
            for entry in opening_entries:
                debit_amount = flt(entry.debit)
                credit_amount = flt(entry.credit)
                
                # تحويل القيود الافتتاحية إذا لزم الأمر
                if filter_currency != company_currency:
                    entry_date = entry.get("posting_date")
                    entry_currency = entry.get("account_currency") or company_currency
                    
                    if entry_currency != filter_currency:
                        exchange_rate = get_simple_exchange_rate(
                            entry_currency, 
                            filter_currency, 
                            entry_date
                        )
                        
                        # استخدام القيم في عملة الحساب إذا كانت متاحة
                        if entry.get("debit_in_account_currency") is not None:
                            debit_amount = flt(entry.debit_in_account_currency) * exchange_rate
                        else:
                            debit_amount = flt(entry.debit) * exchange_rate
                            
                        if entry.get("credit_in_account_currency") is not None:
                            credit_amount = flt(entry.credit_in_account_currency) * exchange_rate
                        else:
                            credit_amount = flt(entry.credit) * exchange_rate
                    elif entry_currency == company_currency and entry_currency != filter_currency:
                        exchange_rate = get_simple_exchange_rate(
                            company_currency, 
                            filter_currency, 
                            entry_date
                        )
                        debit_amount *= exchange_rate
                        credit_amount *= exchange_rate
                
                d["opening_debit"] += debit_amount
                d["opening_credit"] += credit_amount

        # معالجة القيود اليومية
        daily_entries = gl_entries_by_account.get(d.name, [])
        for entry in daily_entries:
            debit_amount = flt(entry.debit)
            credit_amount = flt(entry.credit)
            
            # تحويل القيود اليومية إذا لزم الأمر
            if filter_currency != company_currency:
                entry_date = entry.get("posting_date")
                entry_currency = entry.get("account_currency") or company_currency
                
                if entry_currency != filter_currency:
                    exchange_rate = get_simple_exchange_rate(
                        entry_currency, 
                        filter_currency, 
                        entry_date
                    )
                    
                    # استخدام القيم في عملة الحساب إذا كانت متاحة
                    if entry.get("debit_in_account_currency") is not None:
                        debit_amount = flt(entry.debit_in_account_currency) * exchange_rate
                    else:
                        debit_amount = flt(entry.debit) * exchange_rate
                        
                    if entry.get("credit_in_account_currency") is not None:
                        credit_amount = flt(entry.credit_in_account_currency) * exchange_rate
                    else:
                        credit_amount = flt(entry.credit) * exchange_rate
                elif entry_currency == company_currency and entry_currency != filter_currency:
                    exchange_rate = get_simple_exchange_rate(
                        company_currency, 
                        filter_currency, 
                        entry_date
                    )
                    debit_amount *= exchange_rate
                    credit_amount *= exchange_rate
            
            # إذا كان from_date = بداية السنة المالية، نعتبر جميع القيود قيود يومية
            if from_date <= year_start_date:
                # جميع القيود من بداية السنة هي قيود يومية
                d["debit"] += debit_amount
                d["credit"] += credit_amount
            else:
                # فقط القيود غير الافتتاحية هي قيود يومية
                if cstr(entry.is_opening) != "Yes":
                    d["debit"] += debit_amount
                    d["credit"] += credit_amount

        # حساب الأرصدة الختامية
        d["closing_debit"] = d["opening_debit"] + d["debit"]
        d["closing_credit"] = d["opening_credit"] + d["credit"]

        # إعداد الأرصدة حسب نوع الحساب
        prepare_opening_closing(d)

        # تجميع القيم في صف المجموع
        for field in value_fields:
            total_row[field] += d.get(field, 0.0)

    return total_row

def accumulate_values_into_parents(accounts, accounts_by_name):
    for d in reversed(accounts):
        if d.parent_account:
            for key in value_fields:
                accounts_by_name[d.parent_account][key] += d.get(key, 0.0)

def prepare_data(accounts, filters, total_row, parent_children_map, company_currency):
    data = []
    
    # الحصول على عملة الفلتر
    filter_currency = filters.get("currency") or company_currency
    
    for d in accounts:
        # إعداد الأرصدة للحسابات المجمعة
        if parent_children_map.get(d.account):
            prepare_opening_closing(d)

        has_value = False
        row = {
            "account": d.name,
            "parent_account": d.parent_account,
            "indent": d.indent,
            "from_date": filters.from_date,
            "to_date": filters.to_date,
            "currency": filter_currency,
            "account_name": ('{} - {}'.format(d.account_number, d.account_name)
                if d.account_number else d.account_name)
        }

        # إضافة القيم المحولة بالفعل
        for key in value_fields:
            row[key] = flt(d.get(key, 0.0), 3)
            
            if abs(row[key]) >= 0.005:
                has_value = True

        row["has_value"] = has_value
        data.append(row)

    # إضافة صف المجموع
    total_row_copy = total_row.copy()
    total_row_copy["currency"] = filter_currency
    total_row_copy["account_name"] = _("Total")
    
    # القيم في total_row محولة بالفعل
    for key in value_fields:
        total_row_copy[key] = flt(total_row.get(key, 0.0), 3)
    
    data.extend([{}, total_row_copy])

    return data

def get_columns():
    return [
        {
            "fieldname": "account",
            "label": _("Account"),
            "fieldtype": "Link",
            "options": "Account",
            "width": 300
        },
        {
            "fieldname": "currency",
            "label": _("Currency"),
            "fieldtype": "Link",
            "options": "Currency",
            "hidden": 1
        },
        {
            "fieldname": "opening_debit",
            "label": _("Opening (Dr)"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        },
        {
            "fieldname": "opening_credit",
            "label": _("Opening (Cr)"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        },
        {
            "fieldname": "debit",
            "label": _("Debit"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        },
        {
            "fieldname": "credit",
            "label": _("Credit"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        },
        {
            "fieldname": "closing_debit",
            "label": _("Closing (Dr)"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        },
        {
            "fieldname": "closing_credit",
            "label": _("Closing (Cr)"),
            "fieldtype": "Currency",
            "options": "currency",
            "width": 120
        }
    ]

def prepare_opening_closing(row):
    dr_or_cr = "debit" if row.get("root_type") in ["Asset", "Equity", "Expense"] else "credit"
    reverse_dr_or_cr = "credit" if dr_or_cr == "debit" else "debit"

    for col_type in ["opening", "closing"]:
        valid_col = col_type + "_" + dr_or_cr
        reverse_col = col_type + "_" + reverse_dr_or_cr
        
        # التأكد من وجود القيم
        row_value = row.get(valid_col, 0)
        reverse_value = row.get(reverse_col, 0)
        
        row[valid_col] = row_value - reverse_value
        if row[valid_col] < 0:
            row[reverse_col] = abs(row[valid_col])
            row[valid_col] = 0.0
        else:
            row[reverse_col] = 0.0