import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


COMPLETED_BY_FIELD = "wmn_completed_by_cashier"
INVOICE_DOCTYPES = ("Sales Invoice", "POS Invoice")


def _custom_fields():
    return {
        doctype: [
            {
                "fieldname": COMPLETED_BY_FIELD,
                "label": "Completed By Cashier",
                "fieldtype": "Link",
                "options": "User",
                "insert_after": "wmn_sent_to_cashier_at",
                "read_only": 1,
                "no_copy": 1,
                "description": "User who completed the POS transaction using Complete Order.",
            }
        ]
        for doctype in INVOICE_DOCTYPES
    }


def ensure_cashier_completion_fields():
    create_custom_fields(_custom_fields(), update=True)
    for doctype in INVOICE_DOCTYPES:
        frappe.clear_cache(doctype=doctype)
        if not frappe.get_meta(doctype).get_field(COMPLETED_BY_FIELD):
            frappe.throw(_("Missing {0} on {1}. Run bench migrate.").format(COMPLETED_BY_FIELD, doctype))
