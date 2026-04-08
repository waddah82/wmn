

import re
import json
import frappe
from erpnext.stock.utils import scan_barcode as original_scan_barcode
from erpnext.stock.utils import _update_item_info
from erpnext.stock.get_item_details import get_item_details as original_get_item_details


@frappe.whitelist()
def custom_scan_barcode(search_value: str):
    all_structures = frappe.get_all("Barcode Structure", fields=["name", "prefix", "total_length"])
    for s in all_structures:
        if search_value.startswith(s.prefix) and len(search_value) == s.total_length:
            structure_doc = frappe.get_cached_doc("Barcode Structure", s.name)
            regex_pattern = f"^{re.escape(structure_doc.prefix)}"
            field_meta = {}
            for row in structure_doc.structure_table:
                regex_pattern += f"(?P<{row.field_type}>\\d{{{row.length}}})"
                field_meta[row.field_type] = {"type": row.field_data_type, "divisor": row.divisor or 1.0}
            match = re.match(regex_pattern, search_value)
            if match:
                extracted = match.groupdict()
                res = {"barcode": search_value}
                for field_name, value in extracted.items():
                    meta = field_meta.get(field_name)
                    if meta["type"] == "Float":
                        res[field_name] = float(value) / meta["divisor"]
                    else:
                        res[field_name] = value
                if res.get("item_code"):
                    item_code = res["item_code"]
                    if not frappe.db.exists("Item", item_code):
                        item_code = frappe.db.get_value("Item Barcode", {"barcode": item_code}, "parent")
                    if item_code:
                        res["item_code"] = item_code
                        _update_item_info(res)
                        frappe.cache().hset("weighted_barcode_qty", frappe.session.user, res.get("qty"))
                        return res
    return original_scan_barcode(search_value)

@frappe.whitelist()
def custom_get_item_details(args=None, doc=None, for_validate=False, overwrite_warehouse=True):
    out = original_get_item_details(args, doc, for_validate, overwrite_warehouse)
    cached_qty = frappe.cache().hget("weighted_barcode_qty", frappe.session.user)
    if cached_qty:
        out["qty"] = frappe.utils.flt(cached_qty)
        out["stock_qty"] = frappe.utils.flt(cached_qty)
        frappe.cache().hdel("weighted_barcode_qty", frappe.session.user)
    return out









@frappe.whitelist()
def custom_scan_barcode11(search_value: str):
    all_structures = frappe.get_all("Barcode Structure", fields=["name", "prefix", "total_length"])
    
    for s in all_structures:
        if search_value.startswith(s.prefix) and len(search_value) == s.total_length:
            structure_doc = frappe.get_cached_doc("Barcode Structure", s.name)
            
            regex_pattern = f"^{re.escape(structure_doc.prefix)}"
            field_meta = {}
            
            for row in structure_doc.structure_table:
                regex_pattern += f"(?P<{row.field_type}>\\d{{{row.length}}})"
                field_meta[row.field_type] = {
                    "type": row.field_data_type,
                    "divisor": row.divisor or 1.0
                }

            match = re.match(regex_pattern, search_value)
            if match:
                extracted = match.groupdict()
                res = {"barcode": search_value}

                for field_name, value in extracted.items():
                    meta = field_meta.get(field_name)
                    if meta["type"] == "Float":
                        res[field_name] = float(value) / meta["divisor"]
                        if field_name in ["qty", "stock_qty"]:
                            res["is_weighted"] = True
                    elif meta["type"] == "Date":
                        res[field_name] = f"20{value[0:2]}-{value[2:4]}-{value[4:6]}"
                    else:
                        res[field_name] = value

                if res.get("item_code"):
                    item_code = res["item_code"]
                    if not frappe.db.exists("Item", item_code):
                        item_code = frappe.db.get_value("Item Barcode", {"barcode": item_code}, "parent")
                    
                    if item_code:
                        res["item_code"] = item_code
                        _update_item_info(res)
                        return res

    return original_scan_barcode(search_value)
    
    
    
    
@frappe.whitelist()
def custom_get_item_details11(args=None, doc=None, for_validate=False, overwrite_warehouse=True):

    out = original_get_item_details(args, doc, for_validate, overwrite_warehouse)
    

    if isinstance(args, str):
        try:
            args = frappe._dict(json.loads(args))
        except Exception:
            args = frappe._dict()
    elif isinstance(args, dict):
        args = frappe._dict(args)

    if args.get("qty"):
        qty_value = frappe.utils.flt(args.get("qty"))
        
        if qty_value > 0:
            out["qty"] = qty_value
            out["stock_qty"] = qty_value
            
            if out.get("weight_per_unit"):
                out["total_weight"] = qty_value * out["weight_per_unit"]

    return out