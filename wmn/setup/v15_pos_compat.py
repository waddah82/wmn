import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


INVOICE_TYPE_FIELD = "invoice_type"
SALES_INVOICE_POS_MARKER_FIELD = "is_created_using_pos"


def _meta_has_field(doctype, fieldname):
    try:
        return frappe.get_meta(doctype).has_field(fieldname)
    except Exception:
        return False


def _custom_fields():
    fields = {}

    if not _meta_has_field("POS Settings", INVOICE_TYPE_FIELD):
        fields.setdefault("POS Settings", []).append(
            {
                "fieldname": INVOICE_TYPE_FIELD,
                "label": "Invoice Type Created via POS Screen",
                "fieldtype": "Select",
                "options": "Sales Invoice\nPOS Invoice",
                "default": "POS Invoice",
                "insert_after": "invoice_fields",
            }
        )

    if not _meta_has_field("Sales Invoice", SALES_INVOICE_POS_MARKER_FIELD):
        fields.setdefault("Sales Invoice", []).append(
            {
                "fieldname": SALES_INVOICE_POS_MARKER_FIELD,
                "label": "Is created using POS",
                "fieldtype": "Check",
                "default": "0",
                "insert_after": "is_pos",
                "read_only": 1,
                "no_copy": 1,
                "hidden": 1,
            }
        )

    return fields


def ensure_v15_pos_invoice_type_fields():
    """Add ERPNext v16 POS invoice-type fields when running this branch on v15."""
    fields = _custom_fields()
    if fields:
        create_custom_fields(fields, update=True)
        for doctype in fields:
            frappe.clear_cache(doctype=doctype)

    if _meta_has_field("POS Settings", INVOICE_TYPE_FIELD):
        current = frappe.db.get_single_value("POS Settings", INVOICE_TYPE_FIELD)
        if not current:
            frappe.db.set_single_value("POS Settings", INVOICE_TYPE_FIELD, "POS Invoice", update_modified=False)
