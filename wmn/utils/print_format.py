import base64
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


def _read_linked_wmn_pos_css(html):
    if "/assets/wmn/css/wmn_pos.css" not in str(html or ""):
        return ""
    try:
        with open(frappe.get_app_path("wmn", "public", "css", "wmn_pos.css"), encoding="utf-8") as css_file:
            return css_file.read()
    except OSError:
        return ""


def _extract_pdf_options_from_css(css):
    css = str(css or "")
    options = {}

    size_match = re.search(
        r"@page\s*{[^}]*\bsize\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*(mm|cm|in|px)",
        css,
        flags=re.IGNORECASE,
    )
    if size_match:
        options["page-width"] = f"{size_match.group(1)}{size_match.group(2)}"

    margin_match = re.search(r"@page\s*{[^}]*\bmargin\s*:\s*([^;]+)", css, flags=re.IGNORECASE)
    if margin_match and margin_match.group(1).strip() in {"0", "0mm", "0px", "0in", "0cm"}:
        options.update({
            "margin-top": "0mm",
            "margin-right": "0mm",
            "margin-bottom": "0mm",
            "margin-left": "0mm",
        })

    return options


def _get_pdf_options(print_format, html):
    combined_css = str(html or "") + "\n" + _read_linked_wmn_pos_css(html)
    options = _extract_pdf_options_from_css(combined_css)

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
    pdf = get_pdf(html, options=_get_pdf_options(selected_format, html))
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
