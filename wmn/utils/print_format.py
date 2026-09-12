import base64
import os
import re
from urllib.parse import quote

import frappe
from frappe import _
from frappe.utils import cint
from frappe.utils.pdf import get_pdf
from markupsafe import Markup


def _resolve_print_format(doctype, name, print_format=None):
    print_format = str(print_format or "").strip()
    if print_format:
        return print_format

    if doctype and name:
        doc = frappe.get_doc(doctype, name)
        if doc.get("pos_profile"):
            profile_format = frappe.db.get_value("POS Profile", doc.pos_profile, "print_format")
            if profile_format:
                return profile_format

    return ""


def xpos_barcode(value, barcode_type="Code128"):
    value = str(value or "").strip()
    if not value:
        return Markup("")

    src = (
        "/api/method/frappe.utils.barcode.get_barcode"
        f"?barcode_type={quote(str(barcode_type or 'Code128'), safe='')}&value={quote(value, safe='')}"
    )
    return Markup(
        '<img class="xpos-barcode-img" src="{0}" alt="{1}" />'.format(
            src,
            frappe.utils.escape_html(value),
        )
    )


def _uses_wmn_pos_css(html):
    return "/assets/wmn/css/wmn_pos.css" in str(html or "")


def _strip_wmn_pos_stylesheet_link(html):
    html = str(html or "")
    if not _uses_wmn_pos_css(html):
        return html

    return re.sub(
        r"<link\b[^>]*\bhref=[\"']/assets/wmn/css/wmn_pos\.css(?:\?[^\"']*)?[\"'][^>]*>",
        "",
        html,
        flags=re.IGNORECASE,
    )


def _ensure_pdf_runtime_cache():
    cache_root = "/tmp/wmn-pdf-cache"
    font_cache = os.path.join(cache_root, "fontconfig")
    os.makedirs(font_cache, mode=0o700, exist_ok=True)
    os.environ.setdefault("XDG_CACHE_HOME", cache_root)
    os.environ.setdefault("FONTCONFIG_CACHE", font_cache)


def _get_pdf_options(print_format, html):
    options = {
        "load-error-handling": "ignore",
        "load-media-error-handling": "ignore",
    }

    if _uses_wmn_pos_css(html):
        options.update({
            "user-style-sheet": frappe.get_app_path("wmn", "public", "css", "wmn_pos.css"),
            "enable-local-file-access": None,
        })

    try:
        format_doc = frappe.get_doc("Print Format", print_format)
    except Exception:
        format_doc = None

    if format_doc:
        for fieldname, option_name in (
            ("margin_top", "margin-top"),
            ("margin_right", "margin-right"),
            ("margin_bottom", "margin-bottom"),
            ("margin_left", "margin-left"),
        ):
            value = format_doc.get(fieldname)
            if value is not None:
                options[option_name] = f"{value}mm"

    return options


@frappe.whitelist()
def create_pdf(doctype=None, name=None, print_format=None, doc=None, no_letterhead=1, print_type="RECEIPT"):
    if not doctype or not name:
        frappe.throw(_("Document type and name are required to print."))

    selected_format = _resolve_print_format(doctype, name, print_format)
    if not selected_format:
        frappe.throw(_("POS Profile Print Format is not configured."))

    html = frappe.get_print(
        doctype,
        name,
        selected_format,
        doc=doc,
        no_letterhead=cint(no_letterhead),
    )
    pdf_options = _get_pdf_options(selected_format, html)
    html = _strip_wmn_pos_stylesheet_link(html)
    _ensure_pdf_runtime_cache()
    pdf = get_pdf(html, options=pdf_options)
    return {
        "pdf_base64": base64.b64encode(pdf).decode(),
        "print_format": selected_format,
        "print_type": str(print_type or "RECEIPT"),
    }


@frappe.whitelist()
def create_pdf1(doctype=None, name=None, print_format=None, doc=None, no_letterhead=1, item_group=None):
    return create_pdf(doctype, name, print_format, doc, no_letterhead)


@frappe.whitelist()
def create_pdf2(doctype=None, name=None, print_format=None, doc=None, no_letterhead=1):
    return create_pdf(doctype, name, print_format, doc, no_letterhead)


@frappe.whitelist()
def create_pdf11(doctype=None, name=None, print_format=None, no_letterhead=1, item_group=None):
    return create_pdf(doctype, name, print_format, no_letterhead=no_letterhead)
