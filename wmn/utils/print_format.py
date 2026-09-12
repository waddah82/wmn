import base64
import mimetypes
import os
import re
from html import unescape as html_unescape
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urlparse

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


def _resolve_wmn_print_format(print_format):
    print_format = str(print_format or "").strip()
    if not print_format:
        return None

    try:
        return frappe.get_doc("WMN Print Format", print_format)
    except Exception:
        name = frappe.db.get_value("WMN Print Format", {"print_format": print_format}, "name")
        if name:
            return frappe.get_doc("WMN Print Format", name)
    return None


def xpos_barcode(value, barcode_type="Code128"):
    value = str(value or "").strip()
    if not value:
        return Markup("")

    src = _make_barcode_data_uri(value, barcode_type)
    if not src:
        return Markup('<span class="xpos-barcode-text">{0}</span>'.format(frappe.utils.escape_html(value)))

    return Markup(
        '<img class="xpos-barcode-img" src="{0}" alt="{1}" />'.format(
            src,
            frappe.utils.escape_html(value),
        )
    )


def _make_barcode_data_uri(value, barcode_type="Code128"):
    try:
        from barcode import get_barcode_class
        from barcode.writer import SVGWriter
    except Exception:
        return ""

    try:
        barcode_class = get_barcode_class(str(barcode_type or "Code128").lower())
        stream = BytesIO()
        barcode_class(value, writer=SVGWriter()).write(
            stream,
            options={
                "module_width": 0.28,
                "module_height": 9,
                "quiet_zone": 1,
                "write_text": False,
            },
        )
        encoded = base64.b64encode(stream.getvalue()).decode()
        return "data:image/svg+xml;base64," + encoded
    except Exception:
        return ""


def _ensure_pdf_runtime_cache():
    cache_root = "/tmp/wmn-pdf-cache"
    font_cache = os.path.join(cache_root, "fontconfig")
    os.makedirs(font_cache, mode=0o700, exist_ok=True)
    os.environ.setdefault("XDG_CACHE_HOME", cache_root)
    os.environ.setdefault("FONTCONFIG_CACHE", font_cache)


def _get_pdf_options(print_format):
    options = {
        "load-error-handling": "ignore",
        "load-media-error-handling": "ignore",
    }

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


def _strip_pdf_network_dependencies(html):
    html = str(html or "")
    html = re.sub(r"<base\b[^>]*>", "", html, flags=re.IGNORECASE)
    html = re.sub(
        r"<link\b(?=[^>]*\brel=[\"'][^\"']*stylesheet[^\"']*[\"'])[^>]*>",
        "",
        html,
        flags=re.IGNORECASE,
    )
    return _inline_local_image_sources(html)


def _inline_local_image_sources(html):
    def replace_src(match):
        prefix, quote, src = match.group(1), match.group(2), match.group(3)
        data_uri = _local_file_data_uri(src)
        if not data_uri:
            return match.group(0)
        return f"{prefix}{quote}{data_uri}{quote}"

    return re.sub(
        r"(<img\b[^>]*?\bsrc\s*=\s*)([\"'])([^\"']+)\2",
        replace_src,
        html,
        flags=re.IGNORECASE,
    )


def _local_file_data_uri(src):
    path = _local_site_file_path(src)
    if not path or not path.is_file():
        return ""

    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return "data:{0};base64,{1}".format(
        mime_type,
        base64.b64encode(path.read_bytes()).decode(),
    )


def _local_site_file_path(src):
    src = str(src or "").strip()
    if not src or src.startswith(("data:", "blob:")):
        return None

    parsed = urlparse(src)
    path = unquote(parsed.path or src)

    if path.startswith("/files/"):
        return Path(frappe.get_site_path("public", "files", path.removeprefix("/files/").lstrip("/")))
    if path.startswith("/private/files/"):
        return Path(
            frappe.get_site_path("private", "files", path.removeprefix("/private/files/").lstrip("/"))
        )
    return None


def _raw_print_text(value):
    value = str(value or "")
    if not re.search(r"</?[a-z][\s\S]*>", value, flags=re.IGNORECASE):
        return value.strip()

    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"</(p|div|tr|table|thead|tbody|section|h[1-6]|li)>", "\n", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", "", value)
    value = html_unescape(value).replace("\xa0", " ")

    cleaned = []
    last_blank = False
    for line in value.replace("\r", "").split("\n"):
        line = re.sub(r"[ \t]+$", "", line)
        blank = not line.strip()
        if blank and last_blank:
            continue
        cleaned.append(line)
        last_blank = blank
    return "\n".join(cleaned).strip()


@frappe.whitelist()
def render_raw(doctype=None, name=None, print_format=None, doc=None, print_type="RECEIPT"):
    if not doctype or not name:
        frappe.throw(_("Document type and name are required to print."))

    selected_format = _resolve_print_format(doctype, name, print_format)
    if not selected_format:
        frappe.throw(_("POS Profile Print Format is not configured."))

    wmn_format = _resolve_wmn_print_format(selected_format)
    if not wmn_format:
        frappe.throw(_("WMN Print Format is not configured for {0}.").format(selected_format))

    template = str(wmn_format.get("raw_template_code") or "").strip()
    if not template:
        frappe.throw(_("WMN Print Format {0} has no RAW Template Code.").format(wmn_format.name))

    document = frappe.get_doc(doctype, name)
    rendered = frappe.render_template(
        template,
        {
            "doc": document,
            "frappe": frappe,
            "_": _,
            "xpos_barcode": xpos_barcode,
        },
    )
    return {
        "raw_text": _raw_print_text(rendered),
        "print_format": selected_format,
        "wmn_print_format": wmn_format.name,
        "print_type": str(wmn_format.get("default_print_type") or print_type or "RECEIPT"),
    }


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
    html = _strip_pdf_network_dependencies(html)
    pdf_options = _get_pdf_options(selected_format)
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
