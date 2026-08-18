import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


OFFLINE_SYNC_FIELD = "wmn_offline_sync_id"
OFFLINE_SYNC_DOCTYPES = ("Sales Invoice", "POS Invoice")


def _get_offline_sync_custom_fields():
    return {
        doctype: [
            {
                "fieldname": OFFLINE_SYNC_FIELD,
                "label": "WMN Offline Sync ID",
                "fieldtype": "Data",
                "insert_after": "wmn_receipt_no",
                "read_only": 1,
                "no_copy": 1,
                "hidden": 1,
                "unique": 1,
            }
        ]
        for doctype in OFFLINE_SYNC_DOCTYPES
    }


def ensure_offline_sync_fields():
    """Ensure the immutable offline sync identity exists on invoice doctypes."""
    create_custom_fields(_get_offline_sync_custom_fields(), update=True)

    for doctype in OFFLINE_SYNC_DOCTYPES:
        frappe.clear_cache(doctype=doctype)
        validate_offline_sync_schema(doctype)


def validate_offline_sync_schema(doctype):
    if doctype not in OFFLINE_SYNC_DOCTYPES:
        frappe.throw(_("Unsupported offline sync doctype: {0}").format(doctype))

    meta = frappe.get_meta(doctype)
    field = meta.get_field(OFFLINE_SYNC_FIELD)
    if not field:
        frappe.throw(
            _("WMN Offline Sync is not configured. Missing field {0}.{1}. Run bench migrate.").format(
                doctype, OFFLINE_SYNC_FIELD
            )
        )

    if not cint(field.unique):
        frappe.throw(
            _("WMN Offline Sync field must be unique: {0}.{1}").format(
                doctype, OFFLINE_SYNC_FIELD
            )
        )

    columns = set(frappe.db.get_table_columns(doctype) or [])
    if OFFLINE_SYNC_FIELD not in columns:
        frappe.throw(
            _("WMN Offline Sync database column is missing: {0}.{1}. Run bench migrate.").format(
                doctype, OFFLINE_SYNC_FIELD
            )
        )

    return True
