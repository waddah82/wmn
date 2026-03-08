import frappe

def execute(filters=None):
    if not filters or not filters.get("project"):
        frappe.throw("Please select a Project")

    summarized = int(filters.get("summarized") or 0)

    project = filters.get("project")
    docstatus_filter = filters.get("docstatus_filter")
    task_filter = filters.get("task_filter")
    from_date = filters.get("from_date")
    to_date = filters.get("to_date")

    columns = [
        {"label": "Document Name", "fieldname": "document_name", "fieldtype": "Data", "width": 200},
        {"label": "Subject / Detail", "fieldname": "subject", "fieldtype": "Data", "width": 300},
        {"label": "Document Type", "fieldname": "doctype_type", "fieldtype": "Data", "width": 160},
        {"label": "Total Amount", "fieldname": "total_amount", "fieldtype": "Currency", "width": 140},
        {"label": "Linked Task", "fieldname": "linked_task", "fieldtype": "Link", "options": "Task"},
        {"label": "Project", "fieldname": "project", "fieldtype": "Link", "options": "Project"},
        {"label": "Parent Document", "fieldname": "parent_doc_name", "fieldtype": "Data"},
        {"label": "Row Class", "fieldname": "row_css", "fieldtype": "Data", "hidden": 1},
    ]

    if summarized:
        columns = [
            {"label": "Subject / Detail", "fieldname": "subject", "fieldtype": "Data", "width": 300},
            {"label": "Document Type", "fieldname": "doctype_type", "fieldtype": "Data", "width": 160},
            {"label": "Total Amount", "fieldname": "total_amount", "fieldtype": "Currency", "width": 140},
            {"label": "Row Class", "fieldname": "row_css", "fieldtype": "Data", "hidden": 1},
        ]

    all_data = []

    docstatus_cond = f"AND t.docstatus = {docstatus_filter}" if docstatus_filter else "AND t.docstatus = 1"

    date_condition = ""
    if from_date and to_date:
        date_condition = f"AND (t.posting_date BETWEEN '{from_date}' AND '{to_date}')"

    task_filters = {"project": project}
    if task_filter:
        task_filters["name"] = task_filter

    tasks = frappe.get_list(
        "Task",
        filters=task_filters,
        fields=["name", "subject", "project"],
        order_by="name ASC"
    )

    # لكل مهمة ننشئ صف Task (indent=0, is_group=1)
    for task in tasks:
        task_name = task.name
        task_total_amount = 0.0

        ts_total = 0.0
        ec_total = 0.0
        pi_total = 0.0
        se_total = 0.0

        # ----- Timesheet details -----
        ts_date_cond = ""
        if from_date and to_date:
            ts_date_cond = f"AND (t.start_date BETWEEN '{from_date}' AND '{to_date}')"

        time_details = frappe.db.sql(
            f"""
            SELECT td.parent, td.hours, td.costing_rate, td.costing_amount, td.activity_type
            FROM `tabTimesheet Detail` td, `tabTimesheet` t
            WHERE td.parent = t.name
            AND td.task = %(task)s
            {docstatus_cond}
            {ts_date_cond}
            ORDER BY td.parent ASC
            """,
            {"task": task_name},
            as_dict=True
        )

        # ----- Expense Claim -----
        expense_details = frappe.db.sql(
            f"""
            SELECT ecd.parent, ecd.expense_type, ecd.amount
            FROM `tabExpense Claim Detail` ecd, `tabExpense Claim` t
            WHERE ecd.parent = t.name
            AND ecd.task = %(task)s
            {docstatus_cond}
            {date_condition}
            ORDER BY ecd.parent ASC
            """,
            {"task": task_name},
            as_dict=True
        )

        # ----- Purchase Invoice -----
        purchase_items = frappe.db.sql(
            f"""
            SELECT pii.parent, pii.item_name, pii.qty, pii.base_amount
            FROM `tabPurchase Invoice Item` pii, `tabPurchase Invoice` t
            WHERE pii.parent = t.name
            AND pii.task = %(task)s
            {docstatus_cond}
            {date_condition}
            ORDER BY pii.parent ASC
            """,
            {"task": task_name},
            as_dict=True
        )

        # ----- Stock Entry -----
        stock_entry = frappe.db.sql(
            f"""
            SELECT sei.parent, sei.item_name, sei.qty, sei.amount
            FROM `tabStock Entry Detail` sei, `tabStock Entry` t
            WHERE sei.parent = t.name
            AND sei.task = %(task)s
            {docstatus_cond}
            {date_condition}
            ORDER BY sei.parent ASC
            """,
            {"task": task_name},
            as_dict=True
        )

        # احسب المجاميع وجمع المبالغ
        # timesheet rows
        for d in time_details:
            amount = float(d.costing_amount or 0)
            ts_total = ts_total + amount
            task_total_amount = task_total_amount + amount

        for d in expense_details:
            amount = float(d.amount or 0)
            ec_total = ec_total + amount
            task_total_amount = task_total_amount + amount


        for d in purchase_items:
            amount = float(d.base_amount or 0)
            pi_total = pi_total + amount
            task_total_amount = task_total_amount + amount


        for d in stock_entry:
            amount = float(d.amount or 0)
            se_total = se_total + amount
            task_total_amount = task_total_amount + amount

        # ------------------ صف المهمة (Parent) ------------------
        # نجعل Task هو group رئيسي (indent = 0, is_group = 1)
        all_data.append({
            "document_name": task_name,
            "subject": task.subject,
            "doctype_type": "Task",
            "total_amount": task_total_amount,
            "linked_task": task_name,
            "project": task.project,
            "parent_doc_name": None,
            "row_css": "task-header-row",
            "indent": 0,
            "is_group": 1,
            # نحتاج مفتاح فريد للجيت لكل task (نستخدم document_name نفسه)
            "key": task_name
        })

        # ------------------ عقد الأنواع (group nodes) ------------------
        # نستخدم مفاتيح فرعية فريدة لكل مجموعة مرتبطة بالمهمة
        time_group_key = f"Timesheet-{task_name}"
        exp_group_key = f"Expense-{task_name}"
        pi_group_key = f"PI-{task_name}"
        se_group_key = f"SE-{task_name}"

        # Timesheet group (indent=1, is_group=1, parent=task_name)
        if ts_total or not summarized:
            all_data.append({
                "document_name": time_group_key,
                "subject": "Timesheets",
                "doctype_type": "Timesheet Group",
                "total_amount": ts_total,
                "linked_task": task_name,
                "project": task.project,
                "parent_doc_name": task_name,
                "indent": 1,
                "is_group": 1,
                "key": time_group_key,
                "parent": task_name
            })
            for d in time_details:
                amount = float(d.costing_amount or 0)
                all_data.append({
                    "document_name": d.parent,
                    "subject": f"{d.activity_type} ({d.hours} × {d.costing_rate})",
                    "doctype_type": "Timesheet",
                    "total_amount": amount,
                    "linked_task": task_name,
                    "project": task.project,
                    "parent_doc_name": task_name,
                    "indent": 2,
                    "parent": time_group_key,
                    "key": f"TS-{d.parent}"
                })

        # Expense group
        if ec_total or not summarized:
            all_data.append({
                "document_name": exp_group_key,
                "subject": "Expense Claims",
                "doctype_type": "Expense Claim Group",
                "total_amount": ec_total,
                "linked_task": task_name,
                "project": task.project,
                "parent_doc_name": task_name,
                "indent": 1,
                "is_group": 1,
                "key": exp_group_key,
                "parent": task_name
            })
            for d in expense_details:
                amount = float(d.amount or 0)
                all_data.append({
                    "document_name": d.parent,
                    "subject": f"Expense: {d.expense_type}",
                    "doctype_type": "Expense Claim",
                    "total_amount": amount,
                    "linked_task": task_name,
                    "project": task.project,
                    "parent_doc_name": task_name,
                    "indent": 2,
                    "parent": exp_group_key,
                    "key": f"EC-{d.parent}"
                })

        # Purchase Invoice group
        if pi_total or not summarized:
            all_data.append({
                "document_name": pi_group_key,
                "subject": "Purchase Invoices",
                "doctype_type": "Purchase Invoice Group",
                "total_amount": pi_total,
                "linked_task": task_name,
                "project": task.project,
                "parent_doc_name": task_name,
                "indent": 1,
                "is_group": 1,
                "key": pi_group_key,
                "parent": task_name
            })
            for d in purchase_items:
                amount = float(d.base_amount or 0)
                all_data.append({
                    "document_name": d.parent,
                    "subject": f"Item: {d.item_name} ({d.qty})",
                    "doctype_type": "Purchase Invoice",
                    "total_amount": amount,
                    "linked_task": task_name,
                    "project": task.project,
                    "parent_doc_name": task_name,
                    "indent": 2,
                    "parent": pi_group_key,
                    "key": f"PI-{d.parent}-{d.item_name}"
                })

        # Stock Entry group
        if se_total or not summarized:
            all_data.append({
                "document_name": se_group_key,
                "subject": "Stock Entries",
                "doctype_type": "Stock Entry Group",
                "total_amount": se_total,
                "linked_task": task_name,
                "project": task.project,
                "parent_doc_name": task_name,
                "indent": 1,
                "is_group": 1,
                "key": se_group_key,
                "parent": task_name
            })
            for d in stock_entry:
                amount = float(d.amount or 0)
                all_data.append({
                    "document_name": d.parent,
                    "subject": f"Item: {d.item_name} ({d.qty})",
                    "doctype_type": "Stock Entry",
                    "total_amount": amount,
                    "linked_task": task_name,
                    "project": task.project,
                    "parent_doc_name": task_name,
                    "indent": 2,
                    "parent": se_group_key,
                    "key": f"SE-{d.parent}-{d.item_name}"
                })

    

        # ------------------ في حالة summarized نُظهر المجاميع فقط (تمت إضافتها أعلاه كـ group rows) ------------------

    return columns, all_data