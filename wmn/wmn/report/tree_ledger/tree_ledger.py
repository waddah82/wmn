# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, getdate, formatdate, cstr

def execute(filters=None):
    if not filters:
        return [], []

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    company = filters.get("company")
    docstatus = int(filters.get("docstatus_filter") or 1)
    hide_zeros = filters.get("hide_zeros")  # ← الفلتر الجديد

    if not company:
        frappe.throw("Please select a Company")

    # 1) جلب الحسابات
    accounts = frappe.get_all(
        "Account",
        filters={"company": company},
        fields=["name", "account_name", "parent_account", "is_group", "account_number"],
        order_by="lft"
    )

    accounts_dict = {}
    for acc in accounts:
        accounts_dict[acc["name"]] = dict(
            name=acc["name"],
            account_name=acc.get("account_name") or acc["name"],
            account_number=acc.get("account_number") or "",
            parent=acc.get("parent_account"),
            is_group=acc.get("is_group") or 0,
            children=[],
            debit=float(0),
            credit=float(0),
            total_debit=float(0),
            total_credit=float(0),
            entries=[],
            hide=False,
            has_children=False
        )

    # بناء شجرة الأطفال
    for acc in accounts:
        parent = acc.get("parent_account")
        if parent and parent in accounts_dict:
            accounts_dict[parent]["children"].append(acc["name"])

    # 2) شروط التاريخ
    conditions = []
    params = [docstatus, company]

    if from_date and to_date:
        conditions.append("gl.posting_date >= %s AND gl.posting_date <= %s")
        params.extend([from_date, to_date])

    where_clause = (" AND " + " AND ".join(conditions)) if conditions else ""

    # 3) جلب القيود
    gl_entries = frappe.db.sql(
        f"""
        SELECT account, voucher_type, voucher_no, debit, credit
        FROM `tabGL Entry` gl
        WHERE gl.docstatus = %s AND gl.company = %s {where_clause}
        """,
        tuple(params),
        as_dict=True
    )

    # تجميع القيود
    for gl in gl_entries:
        acc = gl.get("account")
        if acc and acc in accounts_dict:

            item = accounts_dict[acc]
            item["debit"] = float(item["debit"]) + float(gl.get("debit") or 0)
            item["credit"] = float(item["credit"]) + float(gl.get("credit") or 0)

            item["entries"].append(dict(
                voucher_type=gl.get("voucher_type"),
                voucher_no=gl.get("voucher_no"),
                debit=float(gl.get("debit") or 0),
                credit=float(gl.get("credit") or 0)
            ))

    # 4) تجميع الأبناء وتحديد has_children
    def sum_children(acc_name):
        item = accounts_dict[acc_name]
        total_debit = float(item["debit"])
        total_credit = float(item["credit"])

        for child in item["children"]:
            child_totals = sum_children(child)
            total_debit = total_debit + child_totals[0]
            total_credit = total_credit + child_totals[1]

        item["total_debit"] = total_debit
        item["total_credit"] = total_credit
        # has_children = إذا الحساب له قيود أو أبناء
        item["has_children"] = bool(item["children"]) or bool(item["entries"])

        return [total_debit, total_credit]

    roots = [x["name"] for x in accounts if not x.get("parent_account")]
    for r in roots:
        sum_children(r)

    # 5) وضع علامة إخفاء للحسابات صفر (مع الأبناء)
    if hide_zeros:
        def mark_hidden(acc_name):
            item = accounts_dict[acc_name]

            if item["total_debit"] == 0 and item["total_credit"] == 0:
                item["hide"] = True

            for child in item["children"]:
                mark_hidden(child)

        for r in roots:
            mark_hidden(r)

    # 6) تجهيز صفوف التقرير
    data = []

    def add_row(acc_name, indent=0, parent=None):
        item = accounts_dict[acc_name]

        if hide_zeros and item["hide"]:
            return
        if item["is_group"]:
            debit = item["total_debit"] - item["debit"]
            credit = item["total_credit"] - item["credit"]
        else:
            debit = item["total_debit"]
            credit = item["total_credit"]


        account_url = f"/app/account/{item["name"].replace(" ", "%20")}"

        data.append(dict(
            key=acc_name,
            parent=parent,
            account_name=f'<a href="{account_url}">{item["name"]}</a>',
            account_number=item["account_number"],
            indent=indent,
            is_group=item["is_group"],
            debit=debit,
            credit=credit,
            has_children=item["has_children"]
        ))

        # قيود مباشرة
        for e in item["entries"]:
            doctype_url = e.get("voucher_type").lower().replace(" ", "-")
            #account_name=f'<a href="/app/{doctype_url}/{e.get("voucher_no")}" target="_blank">{e.get("voucher_type")} : {e.get("voucher_no")}</a>'
            data.append(dict(
                key=f"{acc_name}_{e.get('voucher_no')}",
                parent=acc_name,
                account_name=(
                    f'<a href="/app/{doctype_url}/{e.get("voucher_no")}">'
                    f'{e.get("voucher_no")}</a>'
                ),
                account_number=f"{e.get('voucher_type')}",
                indent=indent + 1,
                is_group=0,
                debit=e.get("debit"),
                credit=e.get("credit"),
                has_children=False
            ))

        # الأبناء
        for child in item["children"]:
            add_row(child, indent + 1, acc_name)

    for r in roots:
        add_row(r)

    # 7) الأعمدة
    columns = [
        {"label": "Account", "fieldname": "account_name", "fieldtype": "Data", "width": 300},
        {"label": "Account Number", "fieldname": "account_number", "fieldtype": "Data", "width": 120},
        {"label": "Debit", "fieldname": "debit", "fieldtype": "Currency", "width": 140},
        {"label": "Credit", "fieldname": "credit", "fieldtype": "Currency", "width": 140},
    ]

    return columns, data


def execute22222(filters=None):
    if not filters:
        return [], []

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    company = filters.get("company")
    docstatus = int(filters.get("docstatus_filter") or 1)

    if not company:
        frappe.throw("Please select a Company")

    # جلب الحسابات
    accounts = frappe.get_all(
        "Account",
        filters={"company": company},
        fields=["name", "account_name", "parent_account", "is_group", "account_number"],
        order_by="lft"
    )

    accounts_dict = {}
    for acc in accounts:
        accounts_dict[acc["name"]] = dict(
            name=acc["name"],
            account_name=acc.get("account_name") or acc["name"],
            account_number=acc.get("account_number") or "",
            parent=acc.get("parent_account"),
            is_group=acc.get("is_group") or 0,
            children=[],
            debit=float(0),
            credit=float(0),
            total_debit=float(0),
            total_credit=float(0),
            entries=[]
        )

    # بناء شجرة الأبناء
    for acc in accounts:
        parent_name = acc.get("parent_account")
        if parent_name and parent_name in accounts_dict:
            accounts_dict[parent_name]["children"].append(acc["name"])

    # تجهيز شروط التاريخ
    conditions = []
    params = [docstatus, company]

    if from_date and to_date:
        conditions.append("gl.posting_date >= %s AND gl.posting_date <= %s")
        params.extend([from_date, to_date])

    where_clause = ""
    if conditions:
        where_clause = " AND " + " AND ".join(conditions)

    # جلب القيود
    gl_entries = frappe.db.sql(
        f"""
        SELECT account, voucher_type, voucher_no, debit, credit
        FROM `tabGL Entry` gl
        WHERE gl.docstatus = %s AND gl.company = %s {where_clause}
        """,
        tuple(params),
        as_dict=True
    )

    # جمع القيود لكل حساب
    for gl in gl_entries:
        acc_name = gl.get("account")
        if acc_name and acc_name in accounts_dict:
            accounts_dict[acc_name]["debit"] = accounts_dict[acc_name]["debit"] + float(gl.get("debit") or 0)
            accounts_dict[acc_name]["credit"] = accounts_dict[acc_name]["credit"] + float(gl.get("credit") or 0)
            accounts_dict[acc_name]["entries"].append(dict(
                voucher_type=gl.get("voucher_type"),
                voucher_no=gl.get("voucher_no"),
                debit=float(gl.get("debit") or 0),
                credit=float(gl.get("credit") or 0)
            ))

    # تجميع الأبناء
    def sum_children(acc_name):
        acc_item = accounts_dict[acc_name]
        total_debit = float(0)
        total_credit = float(0)

        for child_name in acc_item.get("children") or []:
            child_totals = sum_children(child_name)
            total_debit = total_debit + child_totals[0]
            total_credit = total_credit + child_totals[1]

        total_debit = total_debit + acc_item["debit"]
        total_credit = total_credit + acc_item["credit"]

        acc_item["total_debit"] = total_debit
        acc_item["total_credit"] = total_credit

        # مفتاح لتحديد إذا الحساب له أولاد أو قيود
        acc_item["has_children"] = bool(acc_item["children"]) or bool(acc_item["entries"])

        return [total_debit, total_credit]

    roots = [acc["name"] for acc in accounts if not acc.get("parent_account")]
    for root in roots:
        sum_children(root)

    # تجهيز بيانات التقرير
    data = []

    def add_row(acc_name, indent=0, parent=None):
        acc_item = accounts_dict.get(acc_name)
        if not acc_item:
            return

        row = dict(
            key=acc_name,
            parent=parent,
            account_name=acc_item["account_name"],
            account_number=acc_item["account_number"],
            is_group=acc_item["is_group"],
            indent=indent,
            debit=acc_item["total_debit"] - acc_item["debit"],
            credit=acc_item["total_credit"] - acc_item["credit"],
            has_children=acc_item["has_children"]
        )
        data.append(row)

        # صف Self للـ Group مع قيود مباشرة
        if acc_item["is_group"] and (acc_item["debit"] or acc_item["credit"]):
            self_row = dict(
                key=acc_name + "_self",
                parent=acc_name,
                account_name=acc_item["account_name"] + " (Self)",
                account_number=acc_item["account_number"],
                is_group=0,
                indent=indent + 1,
                debit=acc_item["debit"],
                credit=acc_item["credit"],
                has_children=True
            )
            data.append(self_row)

            for entry in acc_item.get("entries") or []:
                entry_row = dict(
                    key=acc_name + "_" + str(entry.get("voucher_no")),
                    parent=acc_name + "_self",
                    account_name=str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    account_number="",
                    is_group=0,
                    indent=indent + 2,
                    debit=entry.get("debit"),
                    credit=entry.get("credit"),
                    has_children=False
                )
                data.append(entry_row)
        else:
            for entry in acc_item.get("entries") or []:
                entry_row = dict(
                    key=acc_name + "_" + str(entry.get("voucher_no")),
                    parent=acc_name,
                    account_name=str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    account_number="",
                    is_group=0,
                    indent=indent + 1,
                    debit=entry.get("debit"),
                    credit=entry.get("credit"),
                    has_children=False
                )
                data.append(entry_row)

        # الأبناء
        for child_name in acc_item.get("children") or []:
            add_row(child_name, indent + 1, acc_name)

    for root in roots:
        add_row(root)

    columns = [
        {"label": "Account", "fieldname": "account_name", "fieldtype": "Data", "width": 300},
        {"label": "Account Number", "fieldname": "account_number", "fieldtype": "Data", "width": 120},
        {"label": "Debit", "fieldname": "debit", "fieldtype": "Currency", "width": 140},
        {"label": "Credit", "fieldname": "credit", "fieldtype": "Currency", "width": 140}
    ]

    return columns, data







def execute111(filters=None):
    if not filters:
        return [], []

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    docstatus = int(filters.get("docstatus_filter") or 1)
    company = filters.get("company")

    # جلب الحسابات
    accounts = frappe.get_all(
        "Account",
        filters={"company": company},
        fields=["name", "account_name", "parent_account", "is_group", "account_number"],
        order_by="lft"
    )

    accounts_dict = {}
    for acc in accounts:
        accounts_dict[acc["name"]] = {
            "name": acc["name"],
            "account_name": acc.get("account_name") or acc["name"],
            "account_number": acc.get("account_number") or "",
            "parent": acc.get("parent_account"),
            "is_group": acc.get("is_group") or 0,
            "children": [],
            "debit": 0.0,
            "credit": 0.0,
            "total_debit": 0.0,
            "total_credit": 0.0,
            "entries": []
        }

    # بناء شجرة الأبناء
    for acc in accounts:
        parent_name = acc.get("parent_account")
        if parent_name and parent_name in accounts_dict:
            accounts_dict[parent_name]["children"].append(acc["name"])

    # جلب القيود
    date_condition = ""
    if from_date and to_date:
        date_condition = " AND gl.posting_date >= '" + from_date + "' AND gl.posting_date <= '" + to_date + "' "

    gl_entries = frappe.db.sql(
        "SELECT account, voucher_type, voucher_no, debit, credit "
        "FROM `tabGL Entry` gl "
        "WHERE gl.docstatus = %s AND gl.company = %s %s" % (docstatus, company, date_condition),
        as_dict=True
    )

    # جمع القيود لكل حساب
    for gl in gl_entries:
        acc_name = gl.get("account")
        if acc_name and acc_name in accounts_dict:
            accounts_dict[acc_name]["debit"] = accounts_dict[acc_name]["debit"] + float(gl.get("debit") or 0)
            accounts_dict[acc_name]["credit"] = accounts_dict[acc_name]["credit"] + float(gl.get("credit") or 0)
            accounts_dict[acc_name]["entries"].append({
                "voucher_type": gl.get("voucher_type"),
                "voucher_no": gl.get("voucher_no"),
                "debit": float(gl.get("debit") or 0),
                "credit": float(gl.get("credit") or 0)
            })

    # تجميع الأبناء
    def sum_children(acc_name):
        acc_item = accounts_dict[acc_name]
        total_debit = 0.0
        total_credit = 0.0

        for child_name in acc_item.get("children") or []:
            child_totals = sum_children(child_name)
            total_debit = total_debit + child_totals[0]
            total_credit = total_credit + child_totals[1]

        # مجموع الأبناء + قيود الحساب نفسه
        total_debit = total_debit + acc_item["debit"]
        total_credit = total_credit + acc_item["credit"]


        acc_item["total_debit"] = total_debit
        acc_item["total_credit"] = total_credit

        # إضافة مفتاح لتحديد إذا الحساب له أولاد أو قيود
        acc_item["has_children"] = bool(acc_item["children"]) or bool(acc_item["entries"])

        return [total_debit, total_credit]

    roots = [acc["name"] for acc in accounts if not acc.get("parent_account")]
    for root in roots:
        sum_children(root)

    # تجهيز البيانات للتقرير
    data = []

    def add_row(acc_name, indent=0, parent=None):
        acc_item = accounts_dict.get(acc_name)
        if not acc_item:
            return

        # الحساب الرئيسي → مجموع الأبناء فقط
        row = {
            "key": acc_name,
            "parent": parent,
            "account_name": acc_item["account_name"],
            "account_number": acc_item["account_number"],
            "is_group": acc_item["is_group"],
            "indent": indent,
            "debit": acc_item["total_debit"] - acc_item["debit"],
            "credit": acc_item["total_credit"] - acc_item["credit"],
            "has_children": acc_item["has_children"]
        }
        data.append(row)

        # إذا الحساب Group وله قيود مباشرة → صف Self
        if acc_item["is_group"] and (acc_item["debit"] or acc_item["credit"]):
            self_row = {
                "key": acc_name + "_self",
                "parent": acc_name,
                "account_name": acc_item["account_name"] + " (Self)",
                "account_number": acc_item["account_number"],
                "is_group": 0,
                "indent": indent + 1,
                "debit": acc_item["debit"],
                "credit": acc_item["credit"],
                "has_children": True
            }
            data.append(self_row)

            for entry in acc_item.get("entries") or []:
                entry_row = {
                    "key": acc_name + "_" + str(entry.get("voucher_no")),
                    "parent": acc_name + "_self",
                    "account_name": str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    "account_number": "",
                    "is_group": 0,
                    "indent": indent + 2,
                    "debit": entry.get("debit"),
                    "credit": entry.get("credit"),
                    "has_children": False
                }
                data.append(entry_row)
        else:
            # الحسابات العادية → إضافة القيود مباشرة
            for entry in acc_item.get("entries") or []:
                entry_row = {
                    "key": acc_name + "_" + str(entry.get("voucher_no")),
                    "parent": acc_name,
                    "account_name": str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    "account_number": "",
                    "is_group": 0,
                    "indent": indent + 1,
                    "debit": entry.get("debit"),
                    "credit": entry.get("credit"),
                    "has_children": False
                }
                data.append(entry_row)

        # الأبناء
        for child_name in acc_item.get("children") or []:
            add_row(child_name, indent + 1, acc_name)

    for root in roots:
        add_row(root)

    columns = [
        {"label": "Account", "fieldname": "account_name", "fieldtype": "Data", "width": 300},
        {"label": "Account Number", "fieldname": "account_number", "fieldtype": "Data", "width": 120},
        {"label": "Debit", "fieldname": "debit", "fieldtype": "Currency", "width": 140},
        {"label": "Credit", "fieldname": "credit", "fieldtype": "Currency", "width": 140}
    ]

    return columns, data













def execute11111(filters=None):
    if not filters:
        return [], []

    from_date = filters.get("from_date")
    to_date = filters.get("to_date")
    docstatus = int(filters.get("docstatus_filter") or 1)

    # جلب الحسابات
    accounts = frappe.get_all(
        "Account",
        fields=["name", "account_name", "parent_account", "is_group", "account_number"],
        order_by="lft"
    )

    accounts_dict = {}
    for acc in accounts:
        accounts_dict[acc["name"]] = {
            "name": acc["name"],
            "account_name": acc.get("account_name") or acc["name"],
            "account_number": acc.get("account_number") or "",
            "parent": acc.get("parent_account"),
            "is_group": acc.get("is_group") or 0,
            "children": [],
            "debit": 0.0,
            "credit": 0.0,
            "total_debit": 0.0,
            "total_credit": 0.0,
            "entries": []
        }

    # بناء شجرة الأبناء
    for acc in accounts:
        parent_name = acc.get("parent_account")
        if parent_name and parent_name in accounts_dict:
            accounts_dict[parent_name]["children"].append(acc["name"])

    # جلب القيود
    date_condition = ""
    if from_date and to_date:
        date_condition = " AND gl.posting_date >= '" + from_date + "' AND gl.posting_date <= '" + to_date + "' "

    gl_entries = frappe.db.sql(
        "SELECT account, voucher_type, voucher_no, debit, credit "
        "FROM `tabGL Entry` gl "
        "WHERE gl.docstatus = " + str(docstatus) + " " + date_condition,
        as_dict=True
    )

    # جمع القيود لكل حساب
    for gl in gl_entries:
        acc_name = gl.get("account")
        if acc_name and acc_name in accounts_dict:
            accounts_dict[acc_name]["debit"] = accounts_dict[acc_name]["debit"] + float(gl.get("debit") or 0)
            accounts_dict[acc_name]["credit"] = accounts_dict[acc_name]["credit"] + float(gl.get("credit") or 0)
            accounts_dict[acc_name]["entries"].append({
                "voucher_type": gl.get("voucher_type"),
                "voucher_no": gl.get("voucher_no"),
                "debit": float(gl.get("debit") or 0),
                "credit": float(gl.get("credit") or 0)
            })

    # تجميع الأبناء
    def sum_children(acc_name):
        acc_item = accounts_dict[acc_name]
        total_debit = 0.0
        total_credit = 0.0

        for child_name in acc_item.get("children") or []:
            child_totals = sum_children(child_name)
            total_debit = total_debit + child_totals[0]
            total_credit = total_credit + child_totals[1]

        # مجموع الأبناء + قيود الحساب نفسه
        total_debit = total_debit + acc_item["debit"]
        total_credit = total_credit + acc_item["credit"]

        accounts_dict[acc_name]["total_debit"] = total_debit
        accounts_dict[acc_name]["total_credit"] = total_credit
        return [total_debit, total_credit]

    roots = [acc["name"] for acc in accounts if not acc.get("parent_account")]
    for root in roots:
        sum_children(root)

    # تجهيز البيانات للتقرير
    data = []

    def add_row(acc_name, indent=0, parent=None):
        acc_item = accounts_dict.get(acc_name)
        if not acc_item:
            return

        # حساب رئيسي → مجموع الأبناء فقط، لا تشمل القيود المباشرة
        row = {
            "key": acc_name,
            "parent": parent,
            "account_name": acc_item["account_name"],
            "account_number": acc_item["account_number"],
            "is_group": acc_item["is_group"],
            "indent": indent,
            "debit": acc_item["total_debit"] - acc_item["debit"],
            "credit": acc_item["total_credit"] - acc_item["credit"]
        }
        data.append(row)

        # إذا الحساب Group وله قيود مباشرة → صف Self
        if acc_item["is_group"] and (acc_item["debit"] or acc_item["credit"]):
            self_row = {
                "key": acc_name + "_self",
                "parent": acc_name,
                "account_name": acc_item["account_name"] + " (Self)",
                "account_number": acc_item["account_number"],
                "is_group": 0,
                "indent": indent + 1,
                "debit": acc_item["debit"],
                "credit": acc_item["credit"]
            }
            data.append(self_row)

            # إضافة القيود التفصيلية تحت Self
            for entry in acc_item.get("entries") or []:
                entry_row = {
                    "key": acc_name + "_" + str(entry.get("voucher_no")),
                    "parent": acc_name + "_self",
                    "account_name": str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    "account_number": "",
                    "is_group": 0,
                    "indent": indent + 2,
                    "debit": entry.get("debit"),
                    "credit": entry.get("credit")
                }
                data.append(entry_row)
        else:
            # إذا الحساب ليس Group أو لا يوجد قيود مباشرة → إضافة القيود مباشرة تحت الحساب الرئيسي
            for entry in acc_item.get("entries") or []:
                entry_row = {
                    "key": acc_name + "_" + str(entry.get("voucher_no")),
                    "parent": acc_name,
                    "account_name": str(entry.get("voucher_type")) + " : " + str(entry.get("voucher_no")),
                    "account_number": "",
                    "is_group": 0,
                    "indent": indent + 1,
                    "debit": entry.get("debit"),
                    "credit": entry.get("credit")
                }
                data.append(entry_row)

        # الأبناء
        for child_name in acc_item.get("children") or []:
            add_row(child_name, indent + 1, acc_name)

    for root in roots:
        add_row(root)

    columns = [
        {"label": "Account", "fieldname": "account_name", "fieldtype": "Data", "width": 300},
        {"label": "Account Number", "fieldname": "account_number", "fieldtype": "Data", "width": 120},
        {"label": "Debit", "fieldname": "debit", "fieldtype": "Currency", "width": 140},
        {"label": "Credit", "fieldname": "credit", "fieldtype": "Currency", "width": 140}
    ]

    return columns, data
