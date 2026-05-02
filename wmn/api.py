import frappe
from frappe import _
import json



from frappe.utils import flt




@frappe.whitelist()
def get_past_order_list(search_term, status, limit=20):
	fields = ["name", "grand_total", "currency", "customer", "posting_time", "posting_date"]
	invoice_list = []

	if search_term and status:
		invoices_by_customer = frappe.db.get_all(
			"Sales Invoice",
			filters={"customer": ["like", f"%{search_term}%"], "status": status},
			fields=fields,
			page_length=limit,
		)
		invoices_by_name = frappe.db.get_all(
			"Sales Invoice",
			filters={"name": ["like", f"%{search_term}%"], "status": status},
			fields=fields,
			page_length=limit,
		)

		invoice_list = invoices_by_customer + invoices_by_name
	elif status:
		invoice_list = frappe.db.get_all(
			"Sales Invoice", filters={"status": status}, fields=fields, page_length=limit
		)

	return invoice_list


@frappe.whitelist(allow_guest=True)
def get_translated_workspaces():
 
    workspaces = frappe.get_all("Workspace", 
        filters={"public": 1, "parent_page": ""},
        fields=["name", "label", "icon"],
        order_by="sequence_id asc"
    )
    
 
    for ws in workspaces:

        ws['translated_label'] = _(ws.get('label') or ws.get('name'))
        
    return workspaces