import frappe
from frappe import _
from frappe.utils import cint, flt


SETTINGS_DOCTYPE = "WMN POS Profile Settings"
LEGACY_PROFILE_FIELDS = (
    "as_sales_invoice",
    "enable_auto_silent_print",
    "wmn_silent_print_mode",
)

ALLOWED_FIELDS = {
    "as_sales_invoice",
    "default_item_view",
    "show_item_cart_counter",
    "enable_auto_silent_print",
    "wmn_silent_print_mode",
    "print_after_cashier_completion",
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
    "as_sales_invoice",
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
    "wmn_silent_print_mode": {"raw_text", "html2canvas", "pdfmake"},
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


def settings_payload(pos_profile):
    name = _settings_doc_name(pos_profile)
    if not name:
        return {
            "available": False,
            "pos_profile": pos_profile,
            "name": "",
            "settings": {},
            "can_write": _can_write_pos_profile(pos_profile),
        }

    doc = frappe.get_doc(SETTINGS_DOCTYPE, name)
    return {
        "available": True,
        "pos_profile": pos_profile,
        "name": doc.name,
        "settings": {key: doc.get(key) for key in sorted(ALLOWED_FIELDS)},
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
        if "as_sales_invoice" in legacy_fields:
            doc.as_sales_invoice = cint(row.get("as_sales_invoice") or 0)
        if "enable_auto_silent_print" in legacy_fields:
            doc.enable_auto_silent_print = cint(row.get("enable_auto_silent_print") or 0)
        if "wmn_silent_print_mode" in legacy_fields and row.get("wmn_silent_print_mode"):
            doc.wmn_silent_print_mode = row.get("wmn_silent_print_mode")
        doc.insert(ignore_permissions=True)


def validate_settings_schema():
    if not frappe.db.exists("DocType", SETTINGS_DOCTYPE):
        frappe.throw(_("WMN POS Profile Settings DocType is not installed. Run bench migrate."))
    meta = frappe.get_meta(SETTINGS_DOCTYPE)
    missing = [fieldname for fieldname in ALLOWED_FIELDS | {"pos_profile"} if not meta.get_field(fieldname)]
    if missing:
        frappe.throw(_("WMN POS Profile Settings is missing fields: {0}").format(", ".join(sorted(missing))))
    return True
