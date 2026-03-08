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

    if not filters.from_date:
        filters.from_date = filters.year_start_date

    if not filters.to_date:
        filters.to_date = filters.year_end_date

    filters.from_date = getdate(filters.from_date)
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

    opening_balances = get_opening_balances(filters)
    set_gl_entries_by_account(filters.company, filters.from_date,
        filters.to_date, min_lft, max_rgt, filters, gl_entries_by_account, ignore_closing_entries=not flt(filters.with_period_closing_entry))

    total_row = calculate_values(accounts, gl_entries_by_account, opening_balances, filters, company_currency)
    accumulate_values_into_parents(accounts, accounts_by_name)

    data = prepare_data(accounts, filters, total_row, parent_children_map, company_currency)
    data = filter_out_zero_value_rows(data, parent_children_map, show_zero_values=filters.get("show_zero_values"))

    return data

def get_opening_balances(filters):
    balance_sheet_opening = get_rootwise_opening_balances(filters, "Balance Sheet")
    pl_opening = get_rootwise_opening_balances(filters, "Profit and Loss")

    balance_sheet_opening.update(pl_opening)
    return balance_sheet_opening

def get_rootwise_opening_balances(filters, report_type):
    additional_conditions = ""
    if not filters.show_unclosed_fy_pl_balances:
        additional_conditions = " and posting_date >= %(year_start_date)s" \
            if report_type == "Profit and Loss" else ""

    if not flt(filters.with_period_closing_entry):
        additional_conditions += " and ifnull(voucher_type, '')!='Period Closing Voucher'"

    if filters.cost_center:
        lft, rgt = frappe.db.get_value('Cost Center', filters.cost_center, ['lft', 'rgt'])
        additional_conditions += """ and cost_center in (select name from `tabCost Center`
            where lft >= %s and rgt <= %s)""" % (lft, rgt)

    if filters.finance_book:
        fb_conditions = " and finance_book = %(finance_book)s"
        if filters.include_default_book_entries:
            fb_conditions = " and (finance_book in (%(finance_book)s, %(company_fb)s))"

        additional_conditions += fb_conditions

    accounting_dimensions = get_accounting_dimensions()

    query_filters = {
        "company": filters.company,
        "from_date": filters.from_date,
        "report_type": report_type,
        "year_start_date": filters.year_start_date,
        "finance_book": filters.finance_book,
        "company_fb": frappe.db.get_value("Company", filters.company, 'default_finance_book')
    }

    if accounting_dimensions:
        for dimension in accounting_dimensions:
            if filters.get(dimension):
                additional_conditions += """ and {0} in (%({0})s) """.format(dimension)
                query_filters.update({
                    dimension: filters.get(dimension)
                })

    gle = frappe.db.sql("""
        select
            account, sum(debit) as opening_debit, sum(credit) as opening_credit
        from `tabGL Entry`
        where
            company=%(company)s
            {additional_conditions}
            and (posting_date < %(from_date)s or ifnull(is_opening, 'No') = 'Yes')
            and account in (select name from `tabAccount` where report_type=%(report_type)s)
        group by account""".format(additional_conditions=additional_conditions), query_filters , as_dict=True)

    opening = frappe._dict()
    for d in gle:
        opening.setdefault(d.account, d)

    return opening

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

def calculate_values(accounts, gl_entries_by_account, opening_balances, _filters, company_currency):
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
    needs_conversion = filter_currency != company_currency
    
    # تاريخ افتراضي للأرصدة الافتتاحية
    opening_date = _filters.get("from_date") if _filters else _filters.get("year_start_date")
    
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
        "currency": filter_currency  # استخدام عملة الفلتر
    }

    for d in accounts:
        d.update(init.copy())
        d["currency"] = company_currency  # عملة الحساب الأصلية

        # الحصول على الأرصدة الافتتاحية وتحويلها إذا لزم الأمر
        opening_debit = opening_balances.get(d.name, {}).get("opening_debit", 0)
        opening_credit = opening_balances.get(d.name, {}).get("opening_credit", 0)
        
        if needs_conversion:
            # استخدام سعر صرف واحد للأرصدة الافتتاحية (تاريخ بداية الفترة)
            exchange_rate = get_simple_exchange_rate(
                company_currency, 
                filter_currency, 
                opening_date
            )
            d["opening_debit"] = flt(opening_debit) * exchange_rate
            d["opening_credit"] = flt(opening_credit) * exchange_rate
        else:
            d["opening_debit"] = flt(opening_debit)
            d["opening_credit"] = flt(opening_credit)

        # معالجة القيود اليومية
        for entry in gl_entries_by_account.get(d.name, []):
            if cstr(entry.is_opening) != "Yes":
                debit_amount = flt(entry.debit)
                credit_amount = flt(entry.credit)
                
                # تحويل القيود إذا لزم الأمر
                if needs_conversion:
                    entry_date = entry.get("posting_date") or opening_date
                    
                    # استخدام عملة القيد الأصلية إذا كانت مختلفة
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
                            debit_amount *= exchange_rate
                            
                        if entry.get("credit_in_account_currency") is not None:
                            credit_amount = flt(entry.credit_in_account_currency) * exchange_rate
                        else:
                            credit_amount *= exchange_rate
                
                d["debit"] += debit_amount
                d["credit"] += credit_amount

        # حساب الأرصدة الختامية
        d["closing_debit"] = d["opening_debit"] + d["debit"]
        d["closing_credit"] = d["opening_credit"] + d["credit"]
        
        # تحديث عملة الحساب إلى عملة الفلتر
        d["currency"] = filter_currency

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
            "currency": filter_currency,  # استخدام عملة الفلتر
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