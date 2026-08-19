import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


HANDOFF_STAGE_FIELD = "wmn_pos_stage"
HANDOFF_SENT_AT_FIELD = "wmn_sent_to_cashier_at"
HANDOFF_DOCTYPES = ("Sales Invoice", "POS Invoice")
AWAITING_CASHIER = "AWAITING_CASHIER"


def _get_invoice_handoff_custom_fields():
    return {
        doctype: [
            {
                "fieldname": HANDOFF_STAGE_FIELD,
                "label": "WMN POS Stage",
                "fieldtype": "Select",
                "options": f"\n{AWAITING_CASHIER}",
                "insert_after": "wmn_invoice_uid",
                "read_only": 1,
                "hidden": 1,
                "no_copy": 1,
            },
            {
                "fieldname": HANDOFF_SENT_AT_FIELD,
                "label": "WMN Sent to Cashier At",
                "fieldtype": "Datetime",
                "insert_after": HANDOFF_STAGE_FIELD,
                "read_only": 1,
                "hidden": 1,
                "no_copy": 1,
            },
        ]
        for doctype in HANDOFF_DOCTYPES
    }


def ensure_invoice_handoff_fields():
    """Ensure WMN cashier handoff fields exist on POS invoice doctypes."""
    create_custom_fields(_get_invoice_handoff_custom_fields(), update=True)
    for doctype in HANDOFF_DOCTYPES:
        frappe.clear_cache(doctype=doctype)
        validate_invoice_handoff_schema(doctype)


def validate_invoice_handoff_schema(doctype):
    if doctype not in HANDOFF_DOCTYPES:
        frappe.throw(_("Unsupported invoice handoff doctype: {0}").format(doctype))

    meta = frappe.get_meta(doctype)
    missing = [
        fieldname
        for fieldname in (
            HANDOFF_STAGE_FIELD,
            HANDOFF_SENT_AT_FIELD,
        )
        if not meta.get_field(fieldname)
    ]
    if missing:
        frappe.throw(
            _("WMN invoice handoff is not configured. Missing fields on {0}: {1}. Run bench migrate.").format(
                doctype, ", ".join(missing)
            )
        )

    return True
