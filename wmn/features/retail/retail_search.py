import frappe
from frappe.utils import cint, flt

from erpnext.selling.page.point_of_sale.point_of_sale import (
    get_items as erpnext_get_items,
    get_parent_item_group,
)
from wmn.barcode_handler import custom_scan_barcode_pos


def _rows(result):
    if isinstance(result, dict):
        return result.get("items") or []
    return result or []


def _profile(pos_profile):
    return frappe.get_cached_doc("POS Profile", pos_profile)


def _native_search(search_term, pos_profile, limit=30):
    profile = _profile(pos_profile)
    item_group = get_parent_item_group(pos_profile)
    if not item_group:
        return []

    result = erpnext_get_items(
        start=0,
        page_length=min(max(cint(limit or 30), 1), 60),
        price_list=profile.selling_price_list,
        item_group=item_group,
        pos_profile=pos_profile,
        search_term=search_term or "",
    )
    return _rows(result)


def _resolve_barcode(value, pos_profile):
    profile = _profile(pos_profile)
    resolved = custom_scan_barcode_pos(
        search_value=value,
        pos_profile=pos_profile,
        price_list=profile.selling_price_list,
    )
    return resolved if isinstance(resolved, dict) and resolved.get("item_code") else None


def _merge_resolved(row, resolved):
    if not resolved:
        return row

    merged = dict(row or {})
    for fieldname in (
        "barcode",
        "batch_no",
        "serial_no",
        "uom",
        "stock_uom",
        "conversion_factor",
        "qty",
        "rate",
        "price_list_rate",
        "currency",
    ):
        value = resolved.get(fieldname)
        if value not in (None, ""):
            merged[fieldname] = value
    return merged


def search_items(query, pos_profile, limit=30):
    query = str(query or "").strip()
    pos_profile = str(pos_profile or "").strip()
    if not pos_profile:
        return []

    if query:
        resolved = _resolve_barcode(query, pos_profile)
        if resolved:
            rows = _native_search(resolved.get("item_code"), pos_profile, 8)
            exact = next(
                (row for row in rows if row.get("item_code") == resolved.get("item_code")),
                rows[0] if rows else {},
            )
            return [_merge_resolved(exact, resolved)] if exact or resolved else []

    return _native_search(query, pos_profile, limit)


def lookup_item(value, pos_profile):
    value = str(value or "").strip()
    pos_profile = str(pos_profile or "").strip()
    if not value or not pos_profile:
        return None

    profile = _profile(pos_profile)
    resolved = _resolve_barcode(value, pos_profile)
    search_value = resolved.get("item_code") if resolved else value
    rows = _native_search(search_value, pos_profile, 8)

    if resolved:
        item_code = resolved.get("item_code")
        row = next((candidate for candidate in rows if candidate.get("item_code") == item_code), rows[0] if rows else {})
        row = _merge_resolved(row, resolved)
    else:
        row = next((candidate for candidate in rows if candidate.get("item_code") == value), rows[0] if rows else None)

    if not row or not row.get("item_code"):
        return None

    item_code = row.get("item_code")
    item = frappe.get_cached_doc("Item", item_code)
    barcode_uom = frappe.db.get_value(
        "Item Barcode",
        {"parent": item_code, "barcode": value},
        "uom",
    )

    is_bundle = 0
    try:
        is_bundle = cint(bool(frappe.db.exists("Product Bundle", {"new_item_code": item_code, "disabled": 0})))
    except Exception:
        is_bundle = 0

    currency = row.get("currency") or profile.currency or frappe.defaults.get_global_default("currency") or ""
    symbol = frappe.db.get_value("Currency", currency, "symbol") if currency else ""

    return {
        "item_code": item_code,
        "item_name": row.get("item_name") or item.item_name,
        "description": frappe.utils.strip_html_tags(row.get("description") or item.description or "")[:240],
        "item_group": item.item_group,
        "brand": item.brand,
        "image": row.get("image") or row.get("item_image") or item.image,
        "uom": barcode_uom or row.get("uom") or item.stock_uom,
        "stock_uom": row.get("stock_uom") or item.stock_uom,
        "rate": flt(row.get("rate") or row.get("price_list_rate") or 0),
        "price_list_rate": flt(row.get("price_list_rate") or row.get("rate") or 0),
        "currency": currency,
        "symbol": symbol or currency,
        "actual_qty": flt(row.get("actual_qty") or 0),
        "is_stock_item": cint(row.get("is_stock_item") if row.get("is_stock_item") is not None else item.is_stock_item),
        "is_bundle": is_bundle,
        "warehouse": profile.warehouse,
        "barcode": resolved.get("barcode") if resolved else (value if barcode_uom else row.get("barcode")),
        "batch_no": row.get("batch_no"),
        "serial_no": row.get("serial_no"),
        "qty": flt(row.get("qty") or 0),
        "source": "online",
    }
