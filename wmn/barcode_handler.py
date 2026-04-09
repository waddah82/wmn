

import re
import json
import frappe
from erpnext.stock.utils import scan_barcode as original_scan_barcode
from erpnext.stock.utils import _update_item_info
from erpnext.stock.get_item_details import get_item_details as original_get_item_details

from frappe import _
from frappe.utils import flt
from frappe.query_builder import DocType

# Import standard get_item_detail from the original app context
#from pos_next.api.items import get_item_detail

@frappe.whitelist()
def custom_search_by_barcode(barcode, pos_profile):
    """Your working code here"""
    try:
        # Standardize pos_profile
        if isinstance(pos_profile, str):
            try:
                pos_profile = json.loads(pos_profile)
            except:
                pass 
        if isinstance(pos_profile, dict):
            pos_profile = pos_profile.get("name") or pos_profile.get("pos_profile")

        resolved_data = custom_scan_barcode(barcode)
        
        if not resolved_data or not resolved_data.get("item_code"):
            frappe.throw(_("Barcode {0} not found").format(barcode))

        item_code = resolved_data.get("item_code")
        pos_profile_doc = frappe.get_cached_doc("POS Profile", pos_profile)
        item_doc = frappe.get_cached_doc("Item", item_code)
        
        try:
            get_item_detail = frappe.get_attr("pos_next.api.items.get_item_detail")
        except ImportError:
            frappe.throw(_("Application 'pos_next' is not installed"))

        item_payload = {
            "item_code": item_code,
            "has_batch_no": item_doc.has_batch_no or 0,
            "has_serial_no": item_doc.has_serial_no or 0,
            "is_stock_item": item_doc.is_stock_item or 0,
            "pos_profile": pos_profile,
        }

        item_details = get_item_detail(
            item=json.dumps(item_payload),
            warehouse=pos_profile_doc.warehouse,
            price_list=pos_profile_doc.selling_price_list,
            company=pos_profile_doc.company,
        )
        uom_prices = {}
        ItemPrice = DocType("Item Price")
        prices = (
            frappe.qb.from_(ItemPrice)
            .select(ItemPrice.uom, ItemPrice.price_list_rate)
            .where(ItemPrice.item_code == item_code)
            .where(ItemPrice.price_list == pos_profile_doc.selling_price_list)
            .run(as_dict=True)
        )
        for p in prices:
            if p["uom"]:
                uom_prices[p["uom"]] = p["price_list_rate"]
        
        item_details["uom_prices"] = uom_prices
        

        qty = flt(resolved_data.get("qty"))
        uom = resolved_data.get("uom") or item_details.get("uom") or item_doc.stock_uom
        price = flt(uom_prices.get(uom) or item_details.get("rate") or 0)
        barcode_type = "Weighted" if qty > 0 else "Priced"

        resolved_item_data = {
            "resolved_qty": qty,
            "resolved_uom": uom,
            "resolved_price": price,
            "resolved_barcode_type": barcode_type,
        }
        
        

        item_details.update(resolved_item_data)
        
        if qty > 0:
            item_details.update({
                "qty": qty,
                "rate": price,
                "price_list_rate": price,
                "stock_qty": qty,
                "uom_qty": qty,
                "amount": flt(qty * price),
                "total": flt(qty * price),
                "is_weighted": True,
                "weighted": True,
                "use_barcode_qty": True,
                "allow_decimal": 1,
                "barcode_type": barcode_type
            })

        item_details["warehouse"] = pos_profile_doc.warehouse
        return item_details
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Custom Barcode Override Error")
        frappe.throw(_("Error: {0}").format(str(e)))







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
