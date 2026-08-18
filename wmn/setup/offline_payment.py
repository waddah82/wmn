import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


OFFLINE_PAYMENT_FIELD = "wmn_offline_payment_id"
OFFLINE_PAYMENT_DOCTYPE = "Payment Entry"


def _get_offline_payment_custom_fields():
    return {
        OFFLINE_PAYMENT_DOCTYPE: [
            {
                "fieldname": OFFLINE_PAYMENT_FIELD,
                "label": "WMN Offline Payment ID",
                "fieldtype": "Data",
                "insert_after": "reference_date",
                "read_only": 1,
                "no_copy": 1,
                "hidden": 1,
                "unique": 1,
            }
        ]
    }


def ensure_offline_payment_fields():
    """Ensure the immutable offline Payment Entry identity exists."""
    create_custom_fields(_get_offline_payment_custom_fields(), update=True)
    frappe.clear_cache(doctype=OFFLINE_PAYMENT_DOCTYPE)
    validate_offline_payment_schema()


def validate_offline_payment_schema():
    meta = frappe.get_meta(OFFLINE_PAYMENT_DOCTYPE)
    field = meta.get_field(OFFLINE_PAYMENT_FIELD)
    if not field:
        frappe.throw(
            _("WMN Offline Payment is not configured. Missing field {0}.{1}. Run bench migrate.").format(
                OFFLINE_PAYMENT_DOCTYPE, OFFLINE_PAYMENT_FIELD
            )
        )

    if not cint(field.unique):
        frappe.throw(
            _("WMN Offline Payment field must be unique: {0}.{1}").format(
                OFFLINE_PAYMENT_DOCTYPE, OFFLINE_PAYMENT_FIELD
            )
        )

    columns = set(frappe.db.get_table_columns(OFFLINE_PAYMENT_DOCTYPE) or [])
    if OFFLINE_PAYMENT_FIELD not in columns:
        frappe.throw(
            _("WMN Offline Payment database column is missing: {0}.{1}. Run bench migrate.").format(
                OFFLINE_PAYMENT_DOCTYPE, OFFLINE_PAYMENT_FIELD
            )
        )

    return True
