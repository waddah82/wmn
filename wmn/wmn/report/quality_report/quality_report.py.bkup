# Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
# License: GNU General Public License v3. See license.txt

from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, getdate, formatdate, cstr



def execute(filters=None):
    filters = filters or {}

    columns = [
        {"label": _("Goal"), "fieldname": "goal", "fieldtype": "Link", "options": "Quality Goal", "width": 250},
        {"label": _("Procedure"), "fieldname": "procedure", "fieldtype": "Link", "options": "Quality Procedure", "width": 200},
        {"label": _("Project"), "fieldname": "project", "fieldtype": "Link", "options": "Project", "width": 180},
        {"label": _("Task"), "fieldname": "task", "fieldtype": "Link", "options": "Task", "width": 200},
        {"label": _("Reviews"), "fieldname": "total_reviews", "fieldtype": "Int", "width": 100},
        {"label": _("Passed"), "fieldname": "passed", "fieldtype": "Int", "width": 100},
        {"label": _("Failed"), "fieldname": "failed", "fieldtype": "Int", "width": 100},
        {"label": _("Actions"), "fieldname": "actions", "fieldtype": "Int", "width": 100},
        {"label": _("Quality %"), "fieldname": "quality_percent", "fieldtype": "Percent", "width": 120},
    ]

    conditions = []
    values = {}

    if filters.get("from_date"):
        conditions.append("qr.date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("qr.date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    if filters.get("goal"):
        conditions.append("qr.goal = %(goal)s")
        values["goal"] = filters["goal"]

    if filters.get("project"):
        conditions.append("qr.project = %(project)s")
        values["project"] = filters["project"]

    if filters.get("task"):
        conditions.append("qr.task = %(task)s")
        values["task"] = filters["task"]

    condition_sql = " AND ".join(conditions)
    if condition_sql:
        condition_sql = "WHERE " + condition_sql

    reviews = frappe.db.sql(f"""
        SELECT
            qr.goal,
            qr.procedure,
            qr.project,
            qr.task,
            COUNT(qr.name) AS total_reviews,
            SUM(CASE WHEN qr.status = 'Passed' THEN 1 ELSE 0 END) AS passed,
            SUM(CASE WHEN qr.status = 'Failed' THEN 1 ELSE 0 END) AS failed
        FROM `tabQuality Review` qr
        {condition_sql}
        GROUP BY qr.goal, qr.procedure, qr.project, qr.task
    """, values, as_dict=True)

    data = []

    for r in reviews:
        action_count = frappe.db.sql("""
            SELECT COUNT(qa.name)
            FROM `tabQuality Action` qa
            WHERE qa.review IN (
                SELECT qr.name
                FROM `tabQuality Review` qr
                WHERE
                    qr.goal = %(goal)s
                    AND qr.procedure = %(procedure)s
                    AND IFNULL(qr.project,'') = IFNULL(%(project)s,'')
                    AND IFNULL(qr.task,'') = IFNULL(%(task)s,'')
            )
        """, {
            "goal": r.goal,
            "procedure": r.procedure,
            "project": r.project,
            "task": r.task
        })[0][0]

        quality_percent = (
            (r.passed / r.total_reviews) * 100
            if r.total_reviews else 0
        )

        data.append({
            "goal": r.goal,
            "procedure": r.procedure,
            "project": r.project,
            "task": r.task,
            "total_reviews": r.total_reviews,
            "passed": r.passed,
            "failed": r.failed,
            "actions": action_count,
            "quality_percent": round(quality_percent, 2)
        })

    return columns, data



        

