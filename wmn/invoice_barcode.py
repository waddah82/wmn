import re
import secrets

import frappe
from frappe import _
from frappe.utils import cint

from wmn.setup.invoice_barcode import (
    INVOICE_RECEIPT_OPENING_FIELD,
    INVOICE_UID_DOCTYPES,
    INVOICE_UID_FIELD,
    validate_invoice_barcode_schema,
)


_UID_PATTERN = re.compile(r"^WMNINV-[0-9]{20}$")
_RECEIPT_BARCODE_PATTERN = re.compile(r"^(?P<yy>[0-9]{2})(?P<opening_seq>[0-9]{5})(?P<receipt_no>[0-9]{5})$")
_POS_OPENING_PATTERN = re.compile(r"^POS-OPE-(?P<year>[0-9]{4})-(?P<opening_seq>[0-9]{5})$")
_VALIDATED_SCHEMA = set()


def _validate_schema_once(doctype):
    if doctype not in _VALIDATED_SCHEMA:
        validate_invoice_barcode_schema(doctype)
        _VALIDATED_SCHEMA.add(doctype)


def generate_invoice_uid():
    return "WMNINV-" + str(secrets.randbelow(10**20)).zfill(20)


def normalize_invoice_uid(value):
    value = str(value or "").strip().upper()
    if value.startswith("WMNI:"):
        value = value[5:]
    return value


def normalize_receipt_no(value):
    value = str(value or "").strip()
    if not value.isdigit():
        return ""
    number = int(value)
    if number < 0 or number > 99999:
        return ""
    return str(number).zfill(5)


def build_receipt_barcode(pos_opening_entry, receipt_no):
    """Build YY + opening sequence + receipt number using ERPNext's POS Opening naming series."""
    match = _POS_OPENING_PATTERN.fullmatch(str(pos_opening_entry or "").strip().upper())
    normalized_receipt = normalize_receipt_no(receipt_no)
    if not match or not normalized_receipt:
        return ""
    return match.group("year")[-2:] + match.group("opening_seq") + normalized_receipt


def parse_receipt_barcode(invoice_barcode):
    value = str(invoice_barcode or "").strip()
    match = _RECEIPT_BARCODE_PATTERN.fullmatch(value)
    if not match:
        return None

    pos_opening_entry = "POS-OPE-20{yy}-{opening_seq}".format(**match.groupdict())
    return frappe._dict(
        barcode=value,
        pos_opening_entry=pos_opening_entry,
        receipt_no=match.group("receipt_no"),
    )


def _is_wmn_pos_invoice(doc):
    if doc.doctype == "POS Invoice":
        return True
    if doc.doctype != "Sales Invoice":
        return False
    return cint(doc.get("is_pos") or 0) == 1 or bool(doc.get("pos_profile"))


def ensure_invoice_uid(doc, method=None):
    """Assign the immutable invoice UID before a WMN POS invoice is inserted."""
    if not _is_wmn_pos_invoice(doc):
        return

    _validate_schema_once(doc.doctype)

    current = normalize_invoice_uid(doc.get(INVOICE_UID_FIELD))
    if current:
        if not _UID_PATTERN.fullmatch(current):
            frappe.throw(_("Invalid WMN invoice UID"))
        doc.set(INVOICE_UID_FIELD, current)
        return

    doc.set(INVOICE_UID_FIELD, generate_invoice_uid())


def _get_invoice_matches(filters):
    matches = []
    for doctype in INVOICE_UID_DOCTYPES:
        _validate_schema_once(doctype)
        name = frappe.db.get_value(doctype, filters, "name")
        if name:
            matches.append((doctype, name))
    return matches


def _load_single_invoice(matches, ambiguous_message):
    if not matches:
        return None
    if len(matches) > 1:
        frappe.throw(ambiguous_message)

    doctype, name = matches[0]
    doc = frappe.get_doc(doctype, name)
    doc.check_permission("read")
    return doc.as_dict()


@frappe.whitelist()
def get_invoice_by_uid(invoice_uid):
    invoice_uid = normalize_invoice_uid(invoice_uid)
    if not invoice_uid or not _UID_PATTERN.fullmatch(invoice_uid):
        frappe.throw(_("Invalid WMN invoice barcode"))

    matches = _get_invoice_matches({INVOICE_UID_FIELD: invoice_uid})
    return _load_single_invoice(
        matches,
        _("WMN invoice UID is ambiguous across invoice doctypes"),
    )


@frappe.whitelist()
def get_invoice_by_receipt(pos_opening_entry=None, receipt_no=None):
    """Find one POS invoice by the same opening + receipt identity used by WMN receipt numbering."""
    pos_opening_entry = str(pos_opening_entry or "").strip().upper()
    receipt_no = normalize_receipt_no(receipt_no)

    if not _POS_OPENING_PATTERN.fullmatch(pos_opening_entry) or not receipt_no:
        frappe.throw(_("Invalid WMN receipt barcode"))

    if not frappe.db.exists("POS Opening Entry", pos_opening_entry):
        return None

    matches = _get_invoice_matches(
        {
            INVOICE_RECEIPT_OPENING_FIELD: pos_opening_entry,
            "wmn_receipt_no": receipt_no,
        }
    )
    return _load_single_invoice(
        matches,
        _("WMN receipt barcode is ambiguous across invoice doctypes"),
    )


@frappe.whitelist()
def get_invoice_by_barcode(invoice_barcode):
    """Compatibility endpoint accepting the new short receipt barcode or the legacy WMN invoice UID."""
    value = str(invoice_barcode or "").strip().upper()
    receipt_lookup = parse_receipt_barcode(value)
    if receipt_lookup:
        return get_invoice_by_receipt(
            receipt_lookup.pos_opening_entry,
            receipt_lookup.receipt_no,
        )
    if _UID_PATTERN.fullmatch(value):
        return get_invoice_by_uid(value)
    frappe.throw(_("Invalid WMN invoice barcode"))
