import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


INVOICE_UID_FIELD = "wmn_invoice_uid"
INVOICE_RECEIPT_OPENING_FIELD = "wmn_receipt_opening_entry"
INVOICE_UID_DOCTYPES = ("Sales Invoice", "POS Invoice")


def _get_invoice_barcode_custom_fields():
    return {
        doctype: [
            {
                "fieldname": INVOICE_UID_FIELD,
                "label": "WMN Invoice UID",
                "fieldtype": "Data",
                "insert_after": "wmn_receipt_no",
                "read_only": 1,
                "no_copy": 1,
                "hidden": 1,
                "unique": 1,
            },
            {
                "fieldname": INVOICE_RECEIPT_OPENING_FIELD,
                "label": "WMN Receipt POS Opening Entry",
                "fieldtype": "Link",
                "options": "POS Opening Entry",
                "insert_after": INVOICE_UID_FIELD,
                "read_only": 1,
                "no_copy": 1,
                "hidden": 1,
                "search_index": 1,
            },
        ]
        for doctype in INVOICE_UID_DOCTYPES
    }


def ensure_invoice_barcode_fields():
    """Ensure immutable invoice identity and receipt-opening context fields exist."""
    create_custom_fields(_get_invoice_barcode_custom_fields(), update=True)

    for doctype in INVOICE_UID_DOCTYPES:
        frappe.clear_cache(doctype=doctype)
        validate_invoice_barcode_schema(doctype)


def validate_invoice_barcode_schema(doctype):
    if doctype not in INVOICE_UID_DOCTYPES:
        frappe.throw(_("Unsupported invoice barcode doctype: {0}").format(doctype))

    meta = frappe.get_meta(doctype)
    uid_field = meta.get_field(INVOICE_UID_FIELD)
    opening_field = meta.get_field(INVOICE_RECEIPT_OPENING_FIELD)

    if not uid_field:
        frappe.throw(
            _("WMN invoice barcode is not configured. Missing field {0}.{1}. Run bench migrate.").format(
                doctype, INVOICE_UID_FIELD
            )
        )

    if not cint(uid_field.unique):
        frappe.throw(
            _("WMN invoice UID field must be unique: {0}.{1}").format(
                doctype, INVOICE_UID_FIELD
            )
        )

    if not opening_field:
        frappe.throw(
            _("WMN receipt opening field is missing: {0}.{1}. Run bench migrate.").format(
                doctype, INVOICE_RECEIPT_OPENING_FIELD
            )
        )

    columns = set(frappe.db.get_table_columns(doctype) or [])
    for fieldname in (INVOICE_UID_FIELD, INVOICE_RECEIPT_OPENING_FIELD):
        if fieldname not in columns:
            frappe.throw(
                _("WMN invoice barcode database column is missing: {0}.{1}. Run bench migrate.").format(
                    doctype, fieldname
                )
            )

    return True
