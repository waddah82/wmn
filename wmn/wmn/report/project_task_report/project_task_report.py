import frappe



def execute(filters=None):
    if not filters:
        return [], []

    project = filters.get("project")
    if not project:
        frappe.throw("Please select a Project")

    # ------------------ جلب جميع Tasks ------------------
    tasks_all = frappe.get_all("Task",
        fields=["name", "subject", "parent_task as parent", "is_group"],
        filters={"project": project},
        order_by="name"
    )

    # ------------------ ترتيب Tasks في هيكل شجري ------------------
    tasks_dict = {}
    for t in tasks_all:
        tasks_dict[t["name"]] = t
        tasks_dict[t["name"]]["children"] = []

    for t in tasks_all:
        parent = t["parent"]
        if parent:
            tasks_dict[parent]["children"].append(t["name"])

    # ------------------ دالة لحساب المبلغ لكل Task من المصادر المختلفة ------------------
    def get_task_amount(task_name):
        from_date = filters.get("from_date")
        to_date = filters.get("to_date")
        docstatus_filter = filters.get("docstatus_filter") or 1

        docstatus_cond = f"AND t.docstatus = {docstatus_filter}"

        date_condition = ""
        if from_date and to_date:
            date_condition = f"AND (t.posting_date BETWEEN '{from_date}' AND '{to_date}')"

        # ----- Timesheet -----
        ts_date_cond = ""
        if from_date and to_date:
            ts_date_cond = f"AND (t.start_date BETWEEN '{from_date}' AND '{to_date}')"

        time_details = frappe.db.sql(
            f"""
            SELECT td.costing_amount
            FROM `tabTimesheet Detail` td, `tabTimesheet` t
            WHERE td.parent = t.name
            AND td.task = %(task)s
            {docstatus_cond}
            {ts_date_cond}
            """,
            {"task": task_name},
            as_dict=True
        )

        expense_details = frappe.db.sql(
            f"""
            SELECT ecd.amount
            FROM `tabExpense Claim Detail` ecd, `tabExpense Claim` t
            WHERE ecd.parent = t.name
            AND ecd.task = %(task)s
            {docstatus_cond}
            {date_condition}
            """,
            {"task": task_name},
            as_dict=True
        )

        purchase_items = frappe.db.sql(
            f"""
            SELECT pii.base_amount
            FROM `tabPurchase Invoice Item` pii, `tabPurchase Invoice` t
            WHERE pii.parent = t.name
            AND pii.task = %(task)s
            {docstatus_cond}
            {date_condition}
            """,
            {"task": task_name},
            as_dict=True
        )

        stock_entry = frappe.db.sql(
            f"""
            SELECT sei.amount
            FROM `tabStock Entry Detail` sei, `tabStock Entry` t
            WHERE sei.parent = t.name
            AND sei.task = %(task)s
            {docstatus_cond}
            {date_condition}
            """,
            {"task": task_name},
            as_dict=True
        )

        # ----- اجمع المبالغ بدون استخدام += -----
        ts_total = sum([float(d.costing_amount or 0) for d in time_details])
        ec_total = sum([float(d.amount or 0) for d in expense_details])
        pi_total = sum([float(d.base_amount or 0) for d in purchase_items])
        se_total = sum([float(d.amount or 0) for d in stock_entry])

        task_total_amount = ts_total + ec_total + pi_total + se_total

        return task_total_amount

    # ------------------ دالة لبناء الصفوف الشجرية ------------------
    data = []

    def add_task_row(task_name, indent_level=0):
        t = tasks_dict[task_name]
        amount = get_task_amount(task_name)

        # إضافة الصف نفسه
        row = {
            "key": t["name"],
            "parent": t["parent"] or None,
            "document_name": t["name"],
            "subject": t["subject"],
            "doctype_type": "Task Group" if t["is_group"] else "Task",
            "total_amount": amount,
            "is_group": t["is_group"],
            "indent": indent_level
        }
        data.append(row)
        if t["is_group"]:
            data.append({
                "key": t["name"],
                "parent": t["name"] or None,
                "document_name": t["name"],
                "subject": t["subject"],
                "doctype_type": "Task",
                "total_amount": amount,
                "is_group": 0,
                "indent": indent_level+1
            })


        # إذا كان Task Group، أضف الأبناء
        for child_name in t["children"]:
            add_task_row(child_name, indent_level + 1)

        # بعد إضافة الأبناء، حدث المبلغ للجروب ليشمل الأبناء
        if t["is_group"]:
            children_total = sum([d["total_amount"] for d in data if d["parent"] == t["name"]])
            row["total_amount"] =  children_total

    # ------------------ ابدأ من Tasks الرئيسية فقط ------------------
    root_tasks = [t["name"] for t in tasks_all if not t["parent"]]
    for root in root_tasks:
        add_task_row(root, indent_level=0)

    # ------------------ Columns التقرير ------------------
    columns = [
        {"label": "Task", "fieldname": "document_name", "fieldtype": "Data", "width": 200},
        {"label": "Subject", "fieldname": "subject", "fieldtype": "Data", "width": 300},
        {"label": "Type", "fieldname": "doctype_type", "fieldtype": "Data", "width": 120},
        {"label": "Amount", "fieldname": "total_amount", "fieldtype": "Currency", "width": 120},
    ]

    return columns, data


