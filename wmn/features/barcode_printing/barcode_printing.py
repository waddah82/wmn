import frappe
from frappe import _
from frappe.utils import flt

from wmn.features.retail.retail_search import search_items as retail_search_items
from wmn.features.price_checker.price_checker import _ensure_profile_allowed


@frappe.whitelist()
def search_items(query, pos_profile, limit=30):
    query = str(query or "").strip()
    pos_profile = str(pos_profile or "").strip()
    if not pos_profile:
        return []
    _ensure_profile_allowed(pos_profile)
    profile = frappe.get_cached_doc("POS Profile", pos_profile)
    currency = profile.currency or frappe.defaults.get_global_default("currency") or ""

    rows = retail_search_items(
        query=query,
        pos_profile=pos_profile,
        limit=min(max(int(limit or 30), 1), 60),
    )

    item_codes = [row.get("item_code") for row in rows if row.get("item_code")]
    barcode_map = {code: [] for code in item_codes}
    if item_codes:
        barcode_rows = frappe.get_all(
            "Item Barcode",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "barcode", "barcode_type", "uom", "idx"],
            order_by="parent asc, idx asc",
        )
        for bc in barcode_rows:
            barcode_map.setdefault(bc.parent, []).append({
                "barcode": bc.barcode,
                "barcode_type": bc.barcode_type,
                "uom": bc.uom,
            })

    return [
        {
            "item_code": row.get("item_code"),
            "item_name": row.get("item_name"),
            "uom": row.get("uom") or row.get("stock_uom"),
            "rate": flt(row.get("rate") or row.get("price_list_rate") or 0),
            "currency": currency,
            "barcodes": barcode_map.get(row.get("item_code"), []),
        }
        for row in rows
    ]
