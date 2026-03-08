frappe.query_reports["Quality Report"] = {
    "filters": [

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
            "fieldname": "project",
            "label": "Project",
            "fieldtype": "Link",
            "options": "Project"
        },
        {
            "fieldname": "task",
            "label": "Task",
            "fieldtype": "Link",
            "options": "Task"
        },
        {
            "fieldname": "goal",
            "label": "Quality Goal",
            "fieldtype": "Link",
            "options": "Quality Goal"
        }
    ]
};




