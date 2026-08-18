import json

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import cint


PRINT_SETTINGS_DOCTYPE = "WMN Print Settings"
PRINT_CONFIG_FIELD = "wmn_pos_print_transport_config"
PRINT_DEFAULT_FIELD = "wmn_pos_default"


PRINT_CONFIG_KEYS = {
    "method",
    "fallback_method",
    "bridge_ws_url",
    "cut_paper",
    "feed_lines",
    "escpos_initialize",
    "copies",
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
    "qz_printer_name",
    "qz_host",
    "qz_encoding",
    "qz_connector_mode",
    "qz_connector_url",
    "show_invoice_barcode",
    "invoice_barcode_height",
    "invoice_barcode_module_width",
    "invoice_barcode_human_readable",
    "print_after_cashier_completion",
}


def _get_custom_fields():
    return {
        PRINT_SETTINGS_DOCTYPE: [
            {
                "fieldname": PRINT_DEFAULT_FIELD,
                "label": "Use as POS Default",
                "fieldtype": "Check",
                "default": "0",
                "description": "For non-Single WMN Print Settings, select one record as the default POS printer configuration.",
            },
            {
                "fieldname": PRINT_CONFIG_FIELD,
                "label": "POS Printer Configuration",
                "fieldtype": "Long Text",
                "hidden": 1,
                "no_copy": 1,
                "description": "Managed by WMN POS Printer Settings. Stores the shared printer configuration as JSON.",
            },
        ]
    }


def ensure_pos_print_settings_fields():
    """Attach WMN POS transport persistence fields to the existing print-settings owner."""
    if not frappe.db.exists("DocType", PRINT_SETTINGS_DOCTYPE):
        return False

    create_custom_fields(_get_custom_fields(), update=True)
    frappe.clear_cache(doctype=PRINT_SETTINGS_DOCTYPE)

    meta = frappe.get_meta(PRINT_SETTINGS_DOCTYPE)
    missing = [
        fieldname
        for fieldname in (PRINT_DEFAULT_FIELD, PRINT_CONFIG_FIELD)
        if not meta.get_field(fieldname)
    ]
    if missing:
        frappe.throw(
            _("WMN POS printer settings are not configured. Missing fields on {0}: {1}. Run bench migrate.").format(
                PRINT_SETTINGS_DOCTYPE, ", ".join(missing)
            )
        )

    if not cint(meta.issingle):
        rows = frappe.get_all(
            PRINT_SETTINGS_DOCTYPE,
            fields=["name", PRINT_DEFAULT_FIELD],
            order_by="creation asc",
            limit_page_length=3,
        )
        if len(rows) == 1 and not cint(rows[0].get(PRINT_DEFAULT_FIELD) or 0):
            frappe.db.set_value(
                PRINT_SETTINGS_DOCTYPE,
                rows[0].name,
                PRINT_DEFAULT_FIELD,
                1,
                update_modified=False,
            )

    return True


def resolve_pos_print_settings_doc(for_write=False):
    """Resolve the shared WMN Print Settings document without inventing a second settings owner."""
    if not frappe.db.exists("DocType", PRINT_SETTINGS_DOCTYPE):
        if for_write:
            frappe.throw(_("WMN Print Settings DocType is not installed."))
        return None

    ensure_pos_print_settings_fields()
    meta = frappe.get_meta(PRINT_SETTINGS_DOCTYPE)

    if cint(meta.issingle):
        return frappe.get_single(PRINT_SETTINGS_DOCTYPE)

    default_rows = frappe.get_all(
        PRINT_SETTINGS_DOCTYPE,
        filters={PRINT_DEFAULT_FIELD: 1},
        pluck="name",
        order_by="modified desc",
        limit_page_length=2,
    )
    if len(default_rows) > 1:
        frappe.throw(_("More than one WMN Print Settings record is marked as POS Default."))
    if len(default_rows) == 1:
        return frappe.get_doc(PRINT_SETTINGS_DOCTYPE, default_rows[0])

    rows = frappe.get_all(
        PRINT_SETTINGS_DOCTYPE,
        pluck="name",
        order_by="creation asc",
        limit_page_length=2,
    )
    if len(rows) == 1:
        return frappe.get_doc(PRINT_SETTINGS_DOCTYPE, rows[0])
    if not rows:
        if for_write:
            frappe.throw(_("Create one WMN Print Settings record before saving shared POS printer settings."))
        return None

    frappe.throw(_("Select one WMN Print Settings record as 'Use as POS Default'."))


def normalize_pos_print_config(config):
    if isinstance(config, str):
        try:
            config = json.loads(config or "{}")
        except Exception:
            frappe.throw(_("Printer configuration must be valid JSON."))

    if not isinstance(config, dict):
        config = {}

    return {
        key: config.get(key)
        for key in PRINT_CONFIG_KEYS
        if key in config
    }


def get_pos_print_settings_payload():
    doc = resolve_pos_print_settings_doc(for_write=False)
    if not doc:
        return {
            "available": False,
            "doctype": PRINT_SETTINGS_DOCTYPE,
            "name": "",
            "config": {},
            "can_write": False,
        }

    raw = doc.get(PRINT_CONFIG_FIELD) or "{}"
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        parsed = {}

    config = normalize_pos_print_config(parsed)
    can_write = False
    try:
        doc.check_permission("write")
        can_write = True
    except frappe.PermissionError:
        can_write = False

    return {
        "available": True,
        "doctype": PRINT_SETTINGS_DOCTYPE,
        "name": doc.name,
        "config": config,
        "can_write": can_write,
        "modified": str(getattr(doc, "modified", "") or ""),
    }


def save_pos_print_settings_config(config):
    doc = resolve_pos_print_settings_doc(for_write=True)
    doc.check_permission("write")

    normalized = normalize_pos_print_config(config)
    doc.set(PRINT_CONFIG_FIELD, json.dumps(normalized, ensure_ascii=False, separators=(",", ":")))
    doc.save(ignore_permissions=False)
    frappe.clear_cache(doctype=PRINT_SETTINGS_DOCTYPE)
    return get_pos_print_settings_payload()
