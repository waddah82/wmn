import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


SETTINGS_DOCTYPE = "WMN POS Profile Settings"
PROFILE_RECEIPT_SOURCE_FIELD = "wmn_receipt_print_format_source"
DEFAULT_RECEIPT_SOURCE = "WMN Raw Print Format"
LEGACY_PROFILE_FIELDS = (
    "enable_auto_silent_print",
)

ALLOWED_FIELDS = {
    "ignore_pricing_rule",
    "pricing_rule_promotion_policy",
    "pricing_rule_coupon_policy",
    "promotion_coupon_policy",
    "pricing_rule_promotion_coupon_policy",
    "combined_discount_representation",
    "default_item_view",
    "show_item_cart_counter",
    "enable_auto_silent_print",
    "print_after_cashier_completion",
    "receipt_print_format_source",
    "printing_method",
    "fallback_method",
    "copies",
    "cut_paper",
    "feed_lines",
    "escpos_initialize",
    "show_invoice_barcode",
    "invoice_barcode_height",
    "invoice_barcode_module_width",
    "invoice_barcode_human_readable",
    "qz_printer_name",
    "qz_connector_mode",
    "qz_connector_url",
    "qz_host",
    "qz_encoding",
    "bridge_ws_url",
    "webusb_vendor_id",
    "webusb_product_id",
    "webusb_serial_number",
    "webusb_device_label",
    "webserial_vendor_id",
    "webserial_product_id",
    "webserial_device_label",
    "webserial_baud_rate",
    "webserial_data_bits",
    "webserial_stop_bits",
    "webserial_parity",
    "webserial_flow_control",
}

CHECK_FIELDS = {
    "ignore_pricing_rule",
    "show_item_cart_counter",
    "enable_auto_silent_print",
    "print_after_cashier_completion",
    "cut_paper",
    "escpos_initialize",
    "show_invoice_barcode",
    "invoice_barcode_human_readable",
}

INT_FIELDS = {
    "copies",
    "feed_lines",
    "invoice_barcode_height",
    "invoice_barcode_module_width",
    "webserial_baud_rate",
    "webserial_data_bits",
    "webserial_stop_bits",
}

SELECT_VALUES = {
    "default_item_view": {"Grid View", "Button View"},
    "pricing_rule_promotion_policy": {"Pricing Rule Wins", "Promotion Wins", "Combine"},
    "pricing_rule_coupon_policy": {"Pricing Rule Wins", "Coupon Wins", "Combine"},
    "promotion_coupon_policy": {"Promotion Wins", "Coupon Wins", "Combine"},
    "pricing_rule_promotion_coupon_policy": {"Pricing Rule Wins", "Promotion Wins", "Coupon Wins", "Combine"},
    "combined_discount_representation": {"Amount Only", "Percentage Equivalent (Net Total)"},
    "receipt_print_format_source": {"ERPNext Print Format", "WMN Raw Print Format"},
    "printing_method": {"legacy_bridge", "browser", "webusb", "webserial", "qz"},
    "fallback_method": {"none", "legacy_bridge", "browser", "webusb", "webserial", "qz"},
    "qz_connector_mode": {"legacy", "managed", "auto", "custom"},
    "webserial_parity": {"none", "even", "odd"},
    "webserial_flow_control": {"none", "hardware"},
}


def _normalize_patch(values):
    if not isinstance(values, dict):
        frappe.throw(_("POS Profile settings must be a JSON object."))

    normalized = {}
    for key, value in values.items():
        if key not in ALLOWED_FIELDS:
            continue
        if key in CHECK_FIELDS:
            normalized[key] = cint(value)
        elif key in INT_FIELDS:
            normalized[key] = cint(value)
        elif key in SELECT_VALUES:
            text = str(value or "").strip()
            if text and text not in SELECT_VALUES[key]:
                frappe.throw(_("Invalid value for {0}: {1}").format(key, text))
            normalized[key] = text
        else:
            normalized[key] = str(value or "")
    return normalized


def _settings_doc_name(pos_profile):
    return frappe.db.get_value(SETTINGS_DOCTYPE, {"pos_profile": pos_profile}, "name")


def get_or_create_settings_doc(pos_profile, *, ignore_permissions=False):
    if not pos_profile or not frappe.db.exists("POS Profile", pos_profile):
        frappe.throw(_("POS Profile {0} was not found.").format(pos_profile or ""))

    name = _settings_doc_name(pos_profile)
    if name:
        return frappe.get_doc(SETTINGS_DOCTYPE, name)

    doc = frappe.new_doc(SETTINGS_DOCTYPE)
    doc.pos_profile = pos_profile
    doc.insert(ignore_permissions=ignore_permissions)
    return doc


def _normalize_receipt_source(value):
    text = str(value or "").strip()
    if text not in SELECT_VALUES["receipt_print_format_source"]:
        return DEFAULT_RECEIPT_SOURCE
    return text


def _profile_has_receipt_source_field():
    try:
        return bool(frappe.get_meta("POS Profile").get_field(PROFILE_RECEIPT_SOURCE_FIELD))
    except Exception:
        return False


def _write_profile_receipt_source(pos_profile, value):
    if not pos_profile or not _profile_has_receipt_source_field():
        return
    value = _normalize_receipt_source(value)
    current = frappe.db.get_value("POS Profile", pos_profile, PROFILE_RECEIPT_SOURCE_FIELD)
    if current != value:
        frappe.db.set_value(
            "POS Profile",
            pos_profile,
            PROFILE_RECEIPT_SOURCE_FIELD,
            value,
            update_modified=False,
        )


def _receipt_source_custom_fields():
    return {
        "POS Profile": [
            {
                "fieldname": PROFILE_RECEIPT_SOURCE_FIELD,
                "label": "Receipt Print Format Source",
                "fieldtype": "Select",
                "options": "ERPNext Print Format\nWMN Raw Print Format",
                "default": DEFAULT_RECEIPT_SOURCE,
                "insert_after": "print_format",
                "description": (
                    "WMN Windows Bridge and direct ESC/POS printers always receive RAW text. "
                    "ERPNext Print Format is used for Browser Print and optional QZ PDF output."
                ),
            }
        ]
    }


def ensure_pos_profile_receipt_source_field():
    """Create the POS Profile field users open after migrate, and keep it in sync."""
    if not frappe.db.exists("DocType", "POS Profile"):
        return

    create_custom_fields(_receipt_source_custom_fields(), update=True)
    frappe.clear_cache(doctype="POS Profile")

    if not _profile_has_receipt_source_field():
        frappe.throw(
            _("Missing {0} on POS Profile. Run bench migrate.").format(PROFILE_RECEIPT_SOURCE_FIELD)
        )

    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        return

    for row in frappe.get_all(SETTINGS_DOCTYPE, fields=["pos_profile", "receipt_print_format_source"], limit_page_length=0):
        if not row.pos_profile:
            continue
        _write_profile_receipt_source(row.pos_profile, row.receipt_print_format_source)

    default = DEFAULT_RECEIPT_SOURCE
    frappe.db.sql(
        f"""
        update `tabPOS Profile`
        set `{PROFILE_RECEIPT_SOURCE_FIELD}` = %s
        where ifnull(`{PROFILE_RECEIPT_SOURCE_FIELD}`, '') = ''
        """,
        default,
    )


def sync_receipt_source_from_pos_profile(doc, method=None):
    if not doc or doc.doctype != "POS Profile" or not doc.name:
        return
    if not _profile_has_receipt_source_field():
        return

    value = _normalize_receipt_source(doc.get(PROFILE_RECEIPT_SOURCE_FIELD))
    doc.set(PROFILE_RECEIPT_SOURCE_FIELD, value)

    name = _settings_doc_name(doc.name)
    if name:
        current = frappe.db.get_value(SETTINGS_DOCTYPE, name, "receipt_print_format_source")
        if current != value:
            frappe.db.set_value(SETTINGS_DOCTYPE, name, "receipt_print_format_source", value)
        return

    settings = get_or_create_settings_doc(doc.name, ignore_permissions=True)
    if str(settings.get("receipt_print_format_source") or "") != value:
        settings.receipt_print_format_source = value
        settings.save(ignore_permissions=True)


def settings_payload(pos_profile):
    name = _settings_doc_name(pos_profile)
    if not name:
        profile_source = ""
        if _profile_has_receipt_source_field():
            profile_source = frappe.db.get_value("POS Profile", pos_profile, PROFILE_RECEIPT_SOURCE_FIELD) or ""
        return {
            "available": False,
            "pos_profile": pos_profile,
            "name": "",
            "settings": {
                "receipt_print_format_source": _normalize_receipt_source(profile_source),
            }
            if profile_source
            else {},
            "can_write": _can_write_pos_profile(pos_profile),
        }

    doc = frappe.get_doc(SETTINGS_DOCTYPE, name)
    settings = {key: doc.get(key) for key in sorted(ALLOWED_FIELDS)}
    if _profile_has_receipt_source_field():
        profile_source = frappe.db.get_value("POS Profile", pos_profile, PROFILE_RECEIPT_SOURCE_FIELD)
        if profile_source:
            settings["receipt_print_format_source"] = _normalize_receipt_source(profile_source)
    return {
        "available": True,
        "pos_profile": pos_profile,
        "name": doc.name,
        "settings": settings,
        "modified": str(doc.modified or ""),
        "can_write": _can_write_pos_profile(pos_profile),
    }


def _can_write_pos_profile(pos_profile):
    if frappe.session.user == "Guest":
        return False
    try:
        profile_doc = frappe.get_doc("POS Profile", pos_profile)
        return bool(frappe.has_permission("POS Profile", ptype="write", doc=profile_doc))
    except Exception:
        return False


def save_settings_patch(pos_profile, values):
    if not _can_write_pos_profile(pos_profile):
        frappe.throw(_("You do not have permission to update settings for POS Profile {0}.").format(pos_profile), frappe.PermissionError)

    patch = _normalize_patch(values)
    doc = get_or_create_settings_doc(pos_profile, ignore_permissions=True)
    for key, value in patch.items():
        doc.set(key, value)
    doc.save(ignore_permissions=True)
    if "receipt_print_format_source" in patch:
        _write_profile_receipt_source(pos_profile, patch["receipt_print_format_source"])
    frappe.clear_cache(doctype=SETTINGS_DOCTYPE)
    return settings_payload(pos_profile)


def migrate_legacy_pos_profile_settings():
    """Create one settings document per POS Profile and copy legacy WMN fields once."""
    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        return

    profile_meta = frappe.get_meta("POS Profile")
    legacy_fields = [fieldname for fieldname in LEGACY_PROFILE_FIELDS if profile_meta.get_field(fieldname)]
    fields = ["name"] + legacy_fields

    for row in frappe.get_all("POS Profile", fields=fields, limit_page_length=0):
        if _settings_doc_name(row.name):
            continue

        doc = frappe.new_doc(SETTINGS_DOCTYPE)
        doc.pos_profile = row.name
        if "enable_auto_silent_print" in legacy_fields:
            doc.enable_auto_silent_print = cint(row.get("enable_auto_silent_print") or 0)
        doc.insert(ignore_permissions=True)


def validate_settings_schema():
    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        frappe.throw(_("WMN POS Profile Settings DocType is not installed. Run bench migrate."))
    meta = frappe.get_meta(SETTINGS_DOCTYPE)
    missing = [fieldname for fieldname in ALLOWED_FIELDS | {"pos_profile"} if not meta.get_field(fieldname)]
    if missing:
        frappe.throw(_("WMN POS Profile Settings is missing fields: {0}").format(", ".join(sorted(missing))))
    return True
