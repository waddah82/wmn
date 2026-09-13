import base64
import mimetypes
import os
import re
from html import unescape as html_unescape
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


_CODE128_PATTERNS = (
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
)


def xpos_barcode(value, barcode_type="Code128"):
    value = str(value or "").strip()
    if not value:
        return Markup("")

    svg = _code128_svg(value)
    if not svg:
        return Markup('<span class="xpos-barcode-text">{0}</span>'.format(frappe.utils.escape_html(value)))

    return Markup(svg)


def _code128_codes(value):
    if value.isdigit() and len(value) % 2 == 0:
        codes = [105]
        for index in range(0, len(value), 2):
            codes.append(int(value[index:index + 2]))
        return codes

    codes = [104]
    for char in value:
        code = ord(char)
        if code < 32 or code > 127:
            return []
        codes.append(code - 32)
    return codes


def _code128_svg(value, height=44, module_width=1.4, quiet=10):
    codes = _code128_codes(value)
    if not codes:
        return ""

    checksum = codes[0]
    for index, code in enumerate(codes[1:], start=1):
        checksum += code * index
    codes.extend((checksum % 103, 106))

    modules = quiet * 2
    for code in codes:
        for digit in _CODE128_PATTERNS[code]:
            modules += int(digit)

    x = quiet
    bars = []
    for code in codes:
        for index, digit in enumerate(_CODE128_PATTERNS[code]):
            width = int(digit)
            if index % 2 == 0:
                bars.append(
                    '<rect x="{0}" y="0" width="{1}" height="{2}"/>'.format(
                        round(x * module_width, 2),
                        round(width * module_width, 2),
                        height,
                    )
                )
            x += width

    view_width = round(modules * module_width, 2)
    return (
        '<svg class="xpos-barcode-img" xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 {0} {1}" width="{0}" height="{1}" '
        'preserveAspectRatio="xMidYMid meet" aria-label="{2}">'
        '<g fill="#000">{3}</g></svg>'
    ).format(view_width, height, frappe.utils.escape_html(value), "".join(bars))


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
