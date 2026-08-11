import frappe
from frappe import _
import json


from frappe.utils import flt, now_datetime, cint, getdate, today
from erpnext.stock.doctype.batch.batch import get_batch_qty





@frappe.whitelist()
def get_pos_shift_receipt_counter(
    pos_opening_entry=None,
    pos_profile=None,
    company=None
):
    if not pos_opening_entry:
        return {"counter": 0}

    counter = frappe.db.get_value(
        "POS Opening Entry",
        pos_opening_entry,
        "wmn_last_receipt_counter"
    )

    return {
        "counter": cint(counter or 0)
    }



@frappe.whitelist()
def update_pos_shift_receipt_counter(
    pos_opening_entry=None,
    counter=None,
    pos_profile=None,
    company=None
):
    if not pos_opening_entry:
        frappe.throw(_("POS Opening Entry is required"))

    incoming_counter = cint(counter or 0)

    current_counter = cint(
        frappe.db.get_value(
            "POS Opening Entry",
            pos_opening_entry,
            "wmn_last_receipt_counter"
        ) or 0
    )

    final_counter = max(
        current_counter,
        incoming_counter
    )

    frappe.db.set_value(
        "POS Opening Entry",
        pos_opening_entry,
        "wmn_last_receipt_counter",
        final_counter,
        update_modified=False
    )

    frappe.db.commit()

    return {
        "counter": final_counter,
        "updated": True
    }

@frappe.whitelist(allow_guest=False)
def pos_health_check(ts=None, source=None):
    """Small HTTP application health check for POS online/offline detection.

    This endpoint is intentionally independent from Sales Invoice/POS Invoice
    controllers and does not touch pricing, taxes, customer, or item details.
    The browser calls it with fetch(POST, no-store) before deciding whether
    POS may run online.
    """
    return {
        "ok": 1,
        "service": "wmn_pos",
        "source": source or "",
        "ts": frappe.utils.now(),
    }



@frappe.whitelist()
def get_pos_item_batches(item_code, warehouse=None, price_list=None, uom=None):
    if not item_code:
        frappe.throw(_("Item Code is required"))

    item = frappe.db.get_value(
        "Item",
        item_code,
        ["name", "stock_uom", "has_batch_no"],
        as_dict=True,
    )

    if not item:
        frappe.throw(_("Item {0} not found").format(item_code))

    if not item.has_batch_no:
        return []

    batches = frappe.get_all(
        "Batch",
        filters={
            "item": item_code,
            "disabled": 0,
        },
        fields=[
            "name",
            "item",
            "expiry_date",
            "manufacturing_date",
        ],
        order_by="expiry_date asc, name asc",
    )

    current_date = getdate(today())
    result = []

    for b in batches:
        if b.expiry_date and getdate(b.expiry_date) < current_date:
            continue

        batch_no = b.name

        try:
            qty = flt(
                get_batch_qty(
                    batch_no=batch_no,
                    warehouse=warehouse,
                    item_code=item_code,
                )
            )
        except TypeError:
            qty = flt(get_batch_qty(batch_no, warehouse, item_code))
        except Exception:
            qty = 0

        if qty <= 0:
            continue

        price = None
        if price_list:
            options = _wmn_item_uom_options(
                item_code,
                price_list,
                batch_no=batch_no,
            )
            if uom:
                price = next((row for row in options if row.get("uom") == uom), None)
            if not price:
                price = next((row for row in options if row.get("uom") == item.stock_uom), None)
            if not price and options:
                price = options[0]

        result.append({
            "batch_no": batch_no,
            "warehouse": warehouse or "",
            "actual_qty": qty,
            "expiry_date": b.expiry_date,
            "manufacturing_date": b.manufacturing_date,
            "price_list_rate": flt(price.get("price_list_rate") or 0) if price else 0,
            "rate": flt(price.get("price_list_rate") or 0) if price else 0,
            "currency": price.get("currency") if price else "",
            "uom": price.get("uom") if price else (uom or item.stock_uom),
        })

    return result


def _wmn_parse_item_code_list(item_codes):
    if isinstance(item_codes, str):
        try:
            parsed = frappe.parse_json(item_codes)
            if isinstance(parsed, list):
                item_codes = parsed
            else:
                item_codes = [item_codes]
        except Exception:
            item_codes = [item_codes]
    return [str(code).strip() for code in (item_codes or []) if str(code).strip()]



def _wmn_active_item_price_rows(item_code, price_list, batch_no=None):
    if not item_code or not price_list:
        return []

    current_date = getdate(today())
    rows = frappe.get_all(
        "Item Price",
        filters={
            "item_code": item_code,
            "price_list": price_list,
            "selling": 1,
        },
        fields=[
            "name", "item_code", "price_list", "price_list_rate", "currency",
            "uom", "batch_no", "valid_from", "valid_upto", "modified",
        ],
        order_by="valid_from desc, modified desc",
        limit_page_length=0,
    )

    result = []
    selected_batch = str(batch_no or "").strip()

    for row in rows:
        valid_from = row.get("valid_from")
        valid_upto = row.get("valid_upto")
        if valid_from and getdate(valid_from) > current_date:
            continue
        if valid_upto and getdate(valid_upto) < current_date:
            continue

        row_batch = str(row.get("batch_no") or "").strip()
        if selected_batch:
            if row_batch and row_batch != selected_batch:
                continue
        elif row_batch:
            continue

        result.append(row)

    if selected_batch:
        result.sort(
            key=lambda row: (
                1 if str(row.get("batch_no") or "").strip() == selected_batch else 0,
                getdate(row.get("valid_from")) if row.get("valid_from") else getdate("1900-01-01"),
                str(row.get("modified") or ""),
            ),
            reverse=True,
        )

    return result



def _wmn_item_uom_options(item_code, price_list, batch_no=None):
    item = frappe.db.get_value(
        "Item",
        item_code,
        ["name", "stock_uom", "sales_uom"],
        as_dict=True,
    )
    if not item:
        return []

    conversion_rows = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": item_code},
        fields=["uom", "conversion_factor"],
        limit_page_length=0,
    )
    conversion_map = {
        row.uom: flt(row.conversion_factor or 1)
        for row in conversion_rows
        if row.get("uom")
    }
    if item.stock_uom:
        conversion_map.setdefault(item.stock_uom, 1.0)

    selected_batch = str(batch_no or "").strip()
    price_rows = _wmn_active_item_price_rows(
        item_code,
        price_list,
        batch_no=selected_batch or None,
    )

    grouped = {}
    for row in price_rows:
        uom = row.get("uom") or item.stock_uom
        if not uom:
            continue

        row_batch = str(row.get("batch_no") or "").strip()
        priority = 2 if selected_batch and row_batch == selected_batch else 1

        candidate = {
            "uom": uom,
            "price_list_rate": flt(row.get("price_list_rate") or 0),
            "currency": row.get("currency") or "",
            "conversion_factor": flt(conversion_map.get(uom) or 1),
            "batch_no": row_batch,
            "valid_from": row.get("valid_from"),
            "valid_upto": row.get("valid_upto"),
            "__wmn_price_priority": priority,
        }

        existing = grouped.get(uom)
        if existing is None or priority > cint(existing.get("__wmn_price_priority") or 0):
            grouped[uom] = candidate

    result = []
    for row in grouped.values():
        row.pop("__wmn_price_priority", None)
        result.append(row)

    return result


@frappe.whitelist()
def get_pos_item_variant_map(item_codes=None, price_list=None, warehouse=None, pos_profile=None):
    codes = _wmn_parse_item_code_list(item_codes)
    if not codes:
        return {"variants": {}, "templates": {}, "uom_counts": {}, "variant_counts": {}}

    hide_unavailable = 0
    if pos_profile:
        profile_values = frappe.db.get_value(
            "POS Profile",
            pos_profile,
            ["selling_price_list", "warehouse", "hide_unavailable_items"],
            as_dict=True,
        ) or {}
        price_list = price_list or profile_values.get("selling_price_list")
        warehouse = warehouse or profile_values.get("warehouse")
        hide_unavailable = cint(profile_values.get("hide_unavailable_items") or 0)

    rows = frappe.get_all(
        "Item",
        filters={"name": ["in", codes]},
        fields=[
            "name", "item_name", "variant_of", "has_variants", "stock_uom",
            "image", "is_stock_item",
        ],
        limit_page_length=0,
    )

    variants = {}
    template_codes = set()
    for row in rows:
        if row.get("variant_of"):
            variants[row.name] = row.variant_of
            template_codes.add(row.variant_of)
        elif cint(row.get("has_variants") or 0):
            template_codes.add(row.name)

    templates = {}
    if template_codes:
        for row in frappe.get_all(
            "Item",
            filters={"name": ["in", list(template_codes)]},
            fields=["name", "item_name", "item_group", "stock_uom", "image", "description", "brand"],
            limit_page_length=0,
        ):
            templates[row.name] = row

    uom_sets = {code: set() for code in codes}
    if price_list:
        current_date = getdate(today())
        price_rows = frappe.get_all(
            "Item Price",
            filters={
                "item_code": ["in", codes],
                "price_list": price_list,
                "selling": 1,
            },
            fields=["item_code", "uom", "batch_no", "valid_from", "valid_upto"],
            limit_page_length=0,
        )
        for row in price_rows:
            if row.get("valid_from") and getdate(row.valid_from) > current_date:
                continue
            if row.get("valid_upto") and getdate(row.valid_upto) < current_date:
                continue
            uom_sets.setdefault(row.item_code, set()).add(row.get("uom") or "__stock_uom__")

    uom_counts = {code: len(values) for code, values in uom_sets.items()}

    variant_counts = {code: 0 for code in template_codes}
    if template_codes:
        variant_rows = frappe.get_all(
            "Item",
            filters={
                "variant_of": ["in", list(template_codes)],
                "disabled": 0,
                "is_sales_item": 1,
            },
            fields=["name", "variant_of"],
            limit_page_length=0,
        )
        for row in variant_rows:
            variant_counts[row.variant_of] = cint(variant_counts.get(row.variant_of) or 0) + 1

    return {
        "variants": variants,
        "templates": templates,
        "uom_counts": uom_counts,
        "variant_counts": variant_counts,
    }


@frappe.whitelist()
def get_pos_item_variants(template_code, price_list=None, warehouse=None, pos_profile=None):
    if not template_code:
        frappe.throw(_("Item Template is required"))

    if pos_profile:
        profile_values = frappe.db.get_value(
            "POS Profile",
            pos_profile,
            ["selling_price_list", "warehouse", "hide_unavailable_items"],
            as_dict=True,
        ) or {}
        price_list = price_list or profile_values.get("selling_price_list")
        warehouse = warehouse or profile_values.get("warehouse")
        hide_unavailable = cint(profile_values.get("hide_unavailable_items") or 0)
    else:
        hide_unavailable = 0

    rows = frappe.get_all(
        "Item",
        filters={
            "variant_of": template_code,
            "disabled": 0,
            "is_sales_item": 1,
        },
        fields=[
            "name", "item_code", "item_name", "item_group", "stock_uom", "sales_uom",
            "image", "description", "is_stock_item", "has_batch_no", "has_serial_no",
            "brand", "variant_of",
        ],
        order_by="item_name asc, name asc",
        limit_page_length=0,
    )

    codes = [row.name for row in rows]
    attribute_map = {}
    if codes:
        for row in frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": ["in", codes]},
            fields=["parent", "attribute", "attribute_value", "idx"],
            order_by="parent asc, idx asc",
            limit_page_length=0,
        ):
            attribute_map.setdefault(row.parent, []).append({
                "attribute": row.attribute,
                "attribute_value": row.attribute_value,
            })

    result = []
    for row in rows:
        uom_options = _wmn_item_uom_options(row.name, price_list)
        preferred = next((d for d in uom_options if d.get("uom") == row.sales_uom), None)
        preferred = preferred or next((d for d in uom_options if d.get("uom") == row.stock_uom), None)
        preferred = preferred or (uom_options[0] if uom_options else {
            "uom": row.sales_uom or row.stock_uom,
            "price_list_rate": 0,
            "currency": "",
            "conversion_factor": 1,
        })

        actual_qty = 0
        if cint(row.is_stock_item or 0) and warehouse:
            actual_qty = flt(frappe.db.get_value(
                "Bin",
                {"item_code": row.name, "warehouse": warehouse},
                "actual_qty",
            ) or 0)

        selection_disabled = 0
        selection_reason = ""
        if not uom_options and not cint(row.has_batch_no or 0):
            selection_disabled = 1
            selection_reason = _("No active price is available in the selected Price List")
        elif hide_unavailable and cint(row.is_stock_item or 0) and actual_qty <= 0:
            selection_disabled = 1
            selection_reason = _("Out of stock")

        result.append({
            **row,
            "item_code": row.name,
            "item_image": row.image,
            "variant_attributes": attribute_map.get(row.name, []),
            "actual_qty": actual_qty,
            "uom": preferred.get("uom") or row.stock_uom,
            "price_list_rate": flt(preferred.get("price_list_rate") or 0),
            "rate": flt(preferred.get("price_list_rate") or 0),
            "currency": preferred.get("currency") or "",
            "conversion_factor": flt(preferred.get("conversion_factor") or 1),
            "uom_options": uom_options,
            "__wmn_uom_deferred_until_batch": 1 if cint(row.has_batch_no or 0) else 0,
            "__wmn_selection_disabled": selection_disabled,
            "__wmn_selection_reason": selection_reason,
        })

    return result



@frappe.whitelist()
def get_pos_item_uoms(item_code, price_list=None, batch_no=None):
    if not item_code:
        frappe.throw(_("Item Code is required"))
    return _wmn_item_uom_options(
        item_code,
        price_list,
        batch_no=batch_no,
    )


@frappe.whitelist()
def get_pos_offline_data(pos_profile=None, price_list=None, warehouse=None):
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    profile = frappe.get_doc("POS Profile", pos_profile)
    company = profile.company
    selling_price_list = price_list or getattr(profile, "selling_price_list", None)
    default_warehouse = warehouse or getattr(profile, "warehouse", None)

    profile_dict = profile.as_dict()
    profile_dict["pos_profile"] = profile.name
    profile_dict["selling_price_list"] = selling_price_list
    profile_dict["warehouse"] = default_warehouse
    profile_dict["currency"] = frappe.get_cached_value("Company", company, "default_currency")

    payment_methods = []
    for row in getattr(profile, "payments", []) or []:
        payment_methods.append({
            "mode_of_payment": row.mode_of_payment,
            "default": row.default,
            "account": getattr(row, "account", None),
            "type": getattr(row, "type", None),
            "amount": 0,
            "base_amount": 0,
        })

    opening_entries = frappe.get_all(
        "POS Opening Entry",
        filters={
            "pos_profile": profile.name,
            "user": frappe.session.user,
            "status": "Open",
            "docstatus": 1,
        },
        fields=["name", "pos_profile", "company", "user", "status", "posting_date", "period_start_date"],
        limit=5,
    )

    for oe in opening_entries:
        try:
            doc = frappe.get_doc("POS Opening Entry", oe.name)
            oe["balance_details"] = [d.as_dict() for d in getattr(doc, "balance_details", [])]
        except Exception:
            oe["balance_details"] = []

    customers = frappe.get_all(
        "Customer",
        filters={"disabled": 0},
        fields=[
            "name", "customer_name", "customer_group", "territory", "mobile_no",
            "email_id", "tax_id", "customer_primary_address", "primary_address",
            "payment_terms", "default_price_list", "tax_category", "loyalty_program",
        ],
        limit_page_length=0,
    )

    company_currency = frappe.get_cached_value("Company", company, "default_currency")
    for c in customers:
        c["payment_terms_template"] = c.get("payment_terms")
        account = frappe.db.get_value(
            "Party Account",
            {"parenttype": "Customer", "parent": c.name, "company": company},
            "account",
        )
        if not account:
            account = frappe.db.get_value("Company", company, "default_receivable_account")
        c["debit_to"] = account
        c["party_account"] = account
        c["party_account_currency"] = company_currency

    item_defaults = {}
    for row in frappe.get_all(
        "Item Default",
        filters={"company": company},
        fields=[
            "parent", "default_warehouse", "income_account", "expense_account",
            "buying_cost_center", "selling_cost_center",
        ],
        limit_page_length=0,
    ):
        item_defaults[row.parent] = row

    item_fields = [
        "name", "item_code", "item_name", "item_group", "stock_uom", "sales_uom", "description",
        "image", "disabled", "is_stock_item", "has_batch_no", "has_serial_no",
        "brand", "variant_of", "has_variants", "default_item_manufacturer",
        "default_manufacturer_part_no",
    ]

    items = frappe.get_all(
        "Item",
        filters={"disabled": 0, "is_sales_item": 1},
        fields=item_fields,
        limit_page_length=0,
    )

    for it in items:
        defaults = item_defaults.get(it.name) or {}
        it["uom"] = it.stock_uom
        it["warehouse"] = defaults.get("default_warehouse") or default_warehouse
        it["income_account"] = defaults.get("income_account") or getattr(profile, "income_account", None)
        it["expense_account"] = defaults.get("expense_account")
        it["cost_center"] = (
            defaults.get("selling_cost_center")
            or getattr(profile, "cost_center", None)
            or frappe.db.get_value("Company", company, "cost_center")
        )
        #it["item_tax_template"] = frappe.db.get_value("Item Tax", {"parent": it.name}, "item_tax_template")
        item_tax_template = frappe.db.get_value(
            "Item Tax",
            {"parent": it.name},
            "item_tax_template",
        )

        it["item_tax_template"] = item_tax_template
        it["offline_item_tax_map"] = {}

        if item_tax_template:
            rows = frappe.get_all(
                "Item Tax Template Detail",
                filters={"parent": item_tax_template},
                fields=["tax_type", "tax_rate"],
                limit_page_length=0,
            )

            for r in rows:
                it["offline_item_tax_map"][r.tax_type] = flt(r.tax_rate or 0)
        
    item_codes = [it.name for it in items]
    uom_conversion_map = {}
    variant_attribute_map = {}

    if item_codes:
        for row in frappe.get_all(
            "UOM Conversion Detail",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "uom", "conversion_factor"],
            limit_page_length=0,
        ):
            uom_conversion_map.setdefault(row.parent, []).append({
                "uom": row.uom,
                "conversion_factor": flt(row.conversion_factor or 1),
            })

        for row in frappe.get_all(
            "Item Variant Attribute",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "attribute", "attribute_value"],
            limit_page_length=0,
        ):
            variant_attribute_map.setdefault(row.parent, []).append({
                "attribute": row.attribute,
                "attribute_value": row.attribute_value,
            })

    for it in items:
        conversions = list(uom_conversion_map.get(it.name, []))
        if it.stock_uom and not any(d.get("uom") == it.stock_uom for d in conversions):
            conversions.insert(0, {"uom": it.stock_uom, "conversion_factor": 1.0})
        it["uom_conversions"] = conversions
        it["variant_attributes"] = variant_attribute_map.get(it.name, [])

    barcode_rows = frappe.get_all(
        "Item Barcode",
        fields=["parent", "barcode", "uom", "barcode_type"],
        limit_page_length=0,
    )

    item_barcodes = []
    first_barcode = {}
    for b in barcode_rows:
        if not b.get("parent") or not b.get("barcode"):
            continue
        item_barcodes.append({
            "item_code": b.parent,
            "barcode": b.barcode,
            "uom": b.get("uom"),
            "barcode_type": b.get("barcode_type"),
        })
        first_barcode.setdefault(b.parent, b.barcode)

    for it in items:
        it["barcode"] = first_barcode.get(it.name, "")

    price_filters = {"selling": 1}
    if selling_price_list:
        price_filters["price_list"] = selling_price_list

    item_prices = frappe.get_all(
        "Item Price",
        filters=price_filters,
        fields=[
            "name", "item_code", "price_list", "price_list_rate", "currency",
            "uom", "batch_no", "selling", "valid_from", "valid_upto", "modified",
        ],
        order_by="item_code asc, uom asc, valid_from desc, modified desc",
        limit_page_length=0,
    )

    stock_filters = {}
    if default_warehouse:
        stock_filters["warehouse"] = default_warehouse

    stock = frappe.get_all(
        "Bin",
        filters=stock_filters,
        fields=["item_code", "warehouse", "actual_qty", "projected_qty"],
        limit_page_length=0,
    )

    batches = get_offline_batches(default_warehouse, selling_price_list)
    serial_rows = get_offline_serials(default_warehouse)

    item_groups = frappe.get_all(
        "Item Group",
        fields=["name", "parent_item_group", "is_group"],
        limit_page_length=0,
    )

    doctype_names = [
        "Sales Invoice", "Sales Invoice Item", "POS Invoice", "POS Invoice Item",
        "Customer", "Item", "Mode of Payment", "Batch", "Serial No",
        "Item Group", "Warehouse", "Item Barcode",
    ]
    wmn_print_format_doc = {}

    if getattr(profile, "print_format", None):
        try:
            wmn_print_format_doc = frappe.get_doc(
                "WMN Print Format",
                profile.print_format
            ).as_dict()
        except Exception:
            wmn_print_format_doc = {}
    doctype_meta = {}
    for dt in doctype_names:
        try:
            doctype_meta[dt] = frappe.get_meta(dt).as_dict()
        except Exception:
            pass

    try:
        pos_settings = frappe.get_single("POS Settings").as_dict()
    except Exception:
        pos_settings = {}
    try:
        stock_settings_doc = frappe.get_single("Stock Settings")
        stock_settings = stock_settings_doc.as_dict()
    except Exception:
        stock_settings = {}

    stock_settings["doctype"] = "Stock Settings"
    stock_settings["name"] = "Stock Settings"
    stock_settings["allow_negative_stock"] = cint(stock_settings.get("allow_negative_stock") or 0)
    return {
        "server_time": str(now_datetime()),
        "pos_profile_name": profile.name,
        "pos_profile": profile.name,
        "pos_profile_doc": profile_dict,
        "settings": profile_dict,
        "pos_settings": pos_settings,
        "price_list": selling_price_list,
        "warehouse": default_warehouse,
        "customers": customers,
        "items": items,
        "item_prices": item_prices,
        "stock": stock,
        "item_barcodes": item_barcodes,
        "batches": batches,
        "serials": serial_rows,
        "barcodes": item_barcodes,
        "item_batches": batches,
        "serial_nos": serial_rows,
        "payment_methods": payment_methods,
        "item_groups": item_groups,
        "pos_opening_entries": opening_entries,
        "pos_opening_entry": opening_entries[0] if opening_entries else None,
        "doctype_meta": doctype_meta,
        "barcode_structures": get_barcode_structures(),
        "wmn_print_format": wmn_print_format_doc,
        "stock_settings": stock_settings,
        "stock_settings_doc": stock_settings,
        "allow_negative_stock": cint(stock_settings.get("allow_negative_stock") or 0),
    }

def get_barcode_structures():
    structures = frappe.get_all(
        "Barcode Structure",
        fields=["name", "prefix", "total_length"]
    )

    result = []

    for s in structures:
        doc = frappe.get_cached_doc("Barcode Structure", s.name)

        result.append({
            "name": doc.name,
            "prefix": doc.prefix,
            "total_length": doc.total_length,
            "structure_table": [
                {
                    "field_type": row.field_type,
                    "length": row.length,
                    "field_data_type": row.field_data_type,
                    "divisor": row.divisor or 1.0,
                }
                for row in doc.structure_table
            ],
        })

    return result
def get_offline_batches(default_warehouse=None, price_list=None ):
    batch_fields = ["name", "item", "batch_id", "expiry_date", "manufacturing_date", "disabled"]

    batch_meta = frappe.get_meta("Batch")
    has_barcode = batch_meta.has_field("barcode")
    if has_barcode:
        batch_fields.append("barcode")

    batches_raw = frappe.get_all(
        "Batch",
        filters={"disabled": 0},
        fields=batch_fields,
        limit_page_length=0,
    )

    if not batches_raw:
        return []

    if default_warehouse:
        warehouses = [default_warehouse]
    else:
        warehouses = [
            w.name for w in frappe.get_all(
                "Warehouse",
                filters={"disabled": 0, "is_group": 0},
                fields=["name"],
                limit_page_length=0,
            )
        ]

    batches = []

    for b in batches_raw:
        item_code = b.get("item")
        batch_no = b.get("name")
        batch_id = b.get("batch_id") or batch_no

        if not item_code or not batch_no:
            continue

        for wh in warehouses:
            qty = get_erpnext_batch_qty(batch_no=batch_no, warehouse=wh, item_code=item_code)
            if flt(qty) <= 0:
                continue
            stock_uom = frappe.db.get_value("Item", item_code, "stock_uom") or ""
            price = get_batch_price(
                item_code=item_code,
                batch_no=batch_no,
                price_list=price_list,
                uom=stock_uom,
            )

            batches.append({
                "item_code": item_code,
                "batch_no": batch_no,
                "batch_id": batch_id,
                "warehouse": wh,
                "actual_qty": flt(qty),
                "expiry_date": b.get("expiry_date"),
                "manufacturing_date": b.get("manufacturing_date"),
                "barcode": b.get("barcode") if has_barcode else "",
                "disabled": b.get("disabled") or 0,
                "price_list_rate": flt(price.price_list_rate) if price else 0,
                "rate": flt(price.price_list_rate) if price else 0,
                "currency": price.currency if price else "",
                "uom": price.uom if price and price.uom else stock_uom,
            })

    return batches

def get_batch_price(item_code, batch_no, price_list, uom=None):
    if not item_code or not batch_no or not price_list:
        return None

    options = _wmn_item_uom_options(
        item_code,
        price_list,
        batch_no=batch_no,
    )

    selected = None
    if uom:
        selected = next((row for row in options if row.get("uom") == uom), None)
    if not selected and options:
        selected = options[0]

    if not selected:
        return None

    return frappe._dict({
        "price_list_rate": flt(selected.get("price_list_rate") or 0),
        "currency": selected.get("currency") or "",
        "uom": selected.get("uom") or uom or "",
    })


def get_erpnext_batch_qty(batch_no, warehouse=None, item_code=None):
    if not batch_no:
        return 0

    # ERPNext versions differ slightly in get_batch_qty signature.
    # Try keyword signatures first, then positional fallbacks.
    try:
        return flt(get_batch_qty(batch_no=batch_no, warehouse=warehouse, item_code=item_code) or 0)
    except TypeError:
        pass

    try:
        return flt(get_batch_qty(batch_no=batch_no, warehouse=warehouse) or 0)
    except TypeError:
        pass

    try:
        return flt(get_batch_qty(batch_no, warehouse, item_code) or 0)
    except TypeError:
        pass

    try:
        return flt(get_batch_qty(batch_no, warehouse) or 0)
    except Exception:
        return 0


def get_offline_serials(default_warehouse=None):
    serial_filters = {}
    if default_warehouse:
        serial_filters["warehouse"] = default_warehouse

    serial_fields = ["name", "item_code", "warehouse", "batch_no", "status"]

    serial_meta = frappe.get_meta("Serial No")
    if serial_meta.has_field("barcode"):
        serial_fields.append("barcode")

    serials = frappe.get_all(
        "Serial No",
        filters=serial_filters,
        fields=serial_fields,
        limit_page_length=0,
    )

    serial_rows = []
    for s in serials:
        status = (s.get("status") or "").lower()
        if status and status not in ("active", "available", "in stock", "delivered"):
            continue

        serial_rows.append({
            "item_code": s.get("item_code"),
            "serial_no": s.get("name"),
            "warehouse": s.get("warehouse"),
            "batch_no": s.get("batch_no"),
            "barcode": s.get("barcode") or "",
            "status": s.get("status") or "",
        })

    return serial_rows







@frappe.whitelist()
def get_pos_offline_data3333333(pos_profile=None, price_list=None, warehouse=None):
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    profile = frappe.get_doc("POS Profile", pos_profile)
    company = profile.company

    selling_price_list = price_list or getattr(profile, "selling_price_list", None)
    default_warehouse = warehouse or getattr(profile, "warehouse", None)

    profile_dict = profile.as_dict()
    profile_dict["pos_profile"] = profile.name
    profile_dict["selling_price_list"] = selling_price_list
    profile_dict["warehouse"] = default_warehouse
    profile_dict["currency"] = frappe.get_cached_value("Company", company, "default_currency")

    # Payment methods from POS Profile child table
    payment_methods = []
    for row in getattr(profile, "payments", []) or []:
        payment_methods.append({
            "mode_of_payment": row.mode_of_payment,
            "default": row.default,
            "account": getattr(row, "account", None),
            "type": getattr(row, "type", None),
            "amount": 0,
            "base_amount": 0,
        })

    # POS opening entry for current user/profile if exists
    opening_entries = frappe.get_all(
        "POS Opening Entry",
        filters={
            "pos_profile": profile.name,
            "user": frappe.session.user,
            "status": "Open",
            "docstatus": 1,
        },
        fields=["name", "pos_profile", "company", "user", "status", "posting_date", "period_start_date"],
        limit=5,
    )

    for oe in opening_entries:
        try:
            doc = frappe.get_doc("POS Opening Entry", oe.name)
            oe["balance_details"] = [d.as_dict() for d in getattr(doc, "balance_details", [])]
        except Exception:
            oe["balance_details"] = []

    # Customers with party account/payment fields
    customers = frappe.get_all(
        "Customer",
        filters={"disabled": 0},
        fields=[
            "name",
            "customer_name",
            "customer_group",
            "territory",
            "mobile_no",
            "email_id",
            "tax_id",
            "customer_primary_address",
            "primary_address",
            "payment_terms",
            "default_price_list",
            "tax_category",
            "loyalty_program",
        ],
        limit_page_length=0,
    )

    company_currency = frappe.get_cached_value("Company", company, "default_currency")
    for c in customers:
        c["payment_terms_template"] = c.get("payment_terms")

        account = frappe.db.get_value(
            "Party Account",
            {
                "parenttype": "Customer",
                "parent": c.name,
                "company": company,
            },
            "account",
        )
        if not account:
            account = frappe.db.get_value("Company", company, "default_receivable_account")

        c["debit_to"] = account
        c["party_account"] = account
        c["party_account_currency"] = company_currency

    # Item defaults by item/company
    item_defaults = {}
    for row in frappe.get_all(
        "Item Default",
        filters={"company": company},
        fields=[
            "parent",
            "default_warehouse",
            "income_account",
            "expense_account",
            "buying_cost_center",
            "selling_cost_center",
        ],
        limit_page_length=0,
    ):
        item_defaults[row.parent] = row

    item_fields = [
        "name",
        "item_code",
        "item_name",
        "item_group",
        "stock_uom",
        "description",
        "image",
        "disabled",
        "is_stock_item",
        "has_batch_no",
        "has_serial_no",
        "brand",
        "variant_of",
        "has_variants",
        "default_item_manufacturer",
        "default_manufacturer_part_no",
    ]

    items = frappe.get_all(
        "Item",
        filters={"disabled": 0, "is_sales_item": 1},
        fields=item_fields,
        limit_page_length=0,
    )

    for it in items:
        defaults = item_defaults.get(it.name) or {}
        it["uom"] = it.stock_uom
        it["warehouse"] = defaults.get("default_warehouse") or default_warehouse
        it["income_account"] = defaults.get("income_account") or getattr(profile, "income_account", None)
        it["expense_account"] = defaults.get("expense_account")
        it["cost_center"] = (
            defaults.get("selling_cost_center")
            or getattr(profile, "cost_center", None)
            or frappe.db.get_value("Company", company, "cost_center")
        )
        it["item_tax_template"] = frappe.db.get_value(
            "Item Tax",
            {"parent": it.name},
            "item_tax_template",
        )

    # All item barcodes, not only the first one
    barcode_rows = frappe.get_all(
        "Item Barcode",
        fields=["parent", "barcode", "uom", "barcode_type"],
        limit_page_length=0,
    )

    item_barcodes = []
    first_barcode = {}

    for b in barcode_rows:
        if not b.get("parent") or not b.get("barcode"):
            continue

        item_barcodes.append({
            "item_code": b.parent,
            "barcode": b.barcode,
            "uom": b.get("uom"),
            "barcode_type": b.get("barcode_type"),
        })

        # Keep backward compatibility with old offline JS that reads item.barcode
        first_barcode.setdefault(b.parent, b.barcode)

    for it in items:
        it["barcode"] = first_barcode.get(it.name, "")

    # Prices
    filters = {}
    if selling_price_list:
        filters["price_list"] = selling_price_list

    item_prices = frappe.get_all(
        "Item Price",
        filters=filters,
        fields=[
            "name",
            "item_code",
            "price_list",
            "price_list_rate",
            "currency",
            "uom",
            "valid_from",
            "valid_upto",
        ],
        limit_page_length=0,
    )

    # Stock from Bin
    stock_filters = {}
    if default_warehouse:
        stock_filters["warehouse"] = default_warehouse

    stock = frappe.get_all(
        "Bin",
        filters=stock_filters,
        fields=["item_code", "warehouse", "actual_qty", "projected_qty"],
        limit_page_length=0,
    )

    # Batches for offline has_batch_no support
    batch_filters = {"disabled": 0}
    batch_fields = [
        "name",
        "item",
        "batch_id",
        "expiry_date",
        "manufacturing_date",
        "disabled",
    ]

    batches_raw = frappe.get_all(
        "Batch",
        filters=batch_filters,
        fields=batch_fields,
        limit_page_length=0,
    )

    batches = []
    if batches_raw:
        batch_names = [b.name for b in batches_raw]

        # Batch stock by Batch + Item + Warehouse from Stock Ledger Entry
        # We use SUM(actual_qty_after_transaction/latest balance via Bin is not batch-wise),
        # so for offline purpose we fetch current balance per batch from SLE aggregation.
        batch_qty_map = {}
        try:
            conditions = ["sle.batch_no in %(batch_names)s", "sle.is_cancelled = 0"]
            params = {"batch_names": batch_names}

            if default_warehouse:
                conditions.append("sle.warehouse = %(warehouse)s")
                params["warehouse"] = default_warehouse

            rows = frappe.db.sql(
                """
                SELECT
                    sle.item_code,
                    sle.batch_no,
                    sle.warehouse,
                    SUM(sle.actual_qty) AS actual_qty
                FROM `tabStock Ledger Entry` sle
                WHERE {conditions}
                GROUP BY sle.item_code, sle.batch_no, sle.warehouse
                HAVING actual_qty > 0
                """.format(conditions=" AND ".join(conditions)),
                params,
                as_dict=True,
            )

            for r in rows:
                batch_qty_map[(r.item_code, r.batch_no, r.warehouse)] = r.actual_qty
        except Exception:
            batch_qty_map = {}

        # Optional barcode field on Batch may not exist in all installations
        batch_barcode_map = {}
        if frappe.get_meta("Batch").has_field("barcode"):
            for b in batches_raw:
                batch_barcode_map[b.name] = frappe.db.get_value("Batch", b.name, "barcode")

        for b in batches_raw:
            item_code = b.get("item")
            batch_no = b.get("batch_id") or b.get("name")

            matched_any_stock = False
            for (stock_item, stock_batch, stock_warehouse), qty in batch_qty_map.items():
                if stock_batch == b.name or stock_batch == batch_no:
                    matched_any_stock = True
                    batches.append({
                        "item_code": stock_item or item_code,
                        "batch_no": b.name,
                        "warehouse": stock_warehouse or default_warehouse,
                        "actual_qty": qty or 0,
                        "expiry_date": b.get("expiry_date"),
                        "manufacturing_date": b.get("manufacturing_date"),
                        "barcode": batch_barcode_map.get(b.name) or "",
                        "disabled": b.get("disabled") or 0,
                    })

            # If no SLE balance found, still send batch row with qty 0
            # so barcode/search metadata can exist offline.
            if not matched_any_stock and item_code:
                batches.append({
                    "item_code": item_code,
                    "batch_no": b.name,
                    "warehouse": default_warehouse,
                    "actual_qty": 0,
                    "expiry_date": b.get("expiry_date"),
                    "manufacturing_date": b.get("manufacturing_date"),
                    "barcode": batch_barcode_map.get(b.name) or "",
                    "disabled": b.get("disabled") or 0,
                })

    # Serial numbers for offline has_serial_no support
    serial_filters = {}
    if default_warehouse:
        serial_filters["warehouse"] = default_warehouse

    serial_fields = [
        "name",
        "item_code",
        "warehouse",
        "batch_no",
        "status",
    ]

    # Some custom systems may have barcode on Serial No
    if frappe.get_meta("Serial No").has_field("barcode"):
        serial_fields.append("barcode")

    serials = frappe.get_all(
        "Serial No",
        filters=serial_filters,
        fields=serial_fields,
        limit_page_length=0,
    )

    serial_rows = []
    for s in serials:
        status = (s.get("status") or "").lower()
        # Keep only usable serials where possible
        if status and status not in ("active", "available", "in stock", "delivered"):
            continue

        serial_rows.append({
            "item_code": s.get("item_code"),
            "serial_no": s.get("name"),
            "warehouse": s.get("warehouse"),
            "batch_no": s.get("batch_no"),
            "barcode": s.get("barcode") or "",
            "status": s.get("status") or "",
        })

    # Item groups
    item_groups = frappe.get_all(
        "Item Group",
        fields=["name", "parent_item_group", "is_group"],
        limit_page_length=0,
    )

    # Meta for doctypes used by POS / Link fields
    doctype_names = [
        "Sales Invoice",
        "Sales Invoice Item",
        "POS Invoice",
        "POS Invoice Item",
        "Customer",
        "Item",
        "Mode of Payment",
        "Batch",
        "Serial No",
        "Item Group",
        "Warehouse",
        "Item Barcode",
    ]

    doctype_meta = {}
    for dt in doctype_names:
        try:
            doctype_meta[dt] = frappe.get_meta(dt).as_dict()
        except Exception:
            pass

    # POS Settings
    try:
        pos_settings = frappe.get_single("POS Settings").as_dict()
    except Exception:
        pos_settings = {}

    return {
        "server_time": str(now_datetime()),
        "pos_profile_name": profile.name,
        "pos_profile": profile.name,
        "pos_profile_doc": profile_dict,
        "settings": profile_dict,
        "pos_settings": pos_settings,
        "price_list": selling_price_list,
        "warehouse": default_warehouse,

        "customers": customers,
        "items": items,
        "item_prices": item_prices,
        "stock": stock,

        # New offline datasets
        "item_barcodes": item_barcodes,
        "batches": batches,
        "serials": serial_rows,

        # Backward-compatible names accepted by current JS
        "barcodes": item_barcodes,
        "item_batches": batches,
        "serial_nos": serial_rows,

        "payment_methods": payment_methods,
        "item_groups": item_groups,
        "pos_opening_entries": opening_entries,
        "pos_opening_entry": opening_entries[0] if opening_entries else None,
        "doctype_meta": doctype_meta,
    }








@frappe.whitelist()
def get_pos_offline_data2222(pos_profile=None, price_list=None, warehouse=None):
    
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    profile = frappe.get_doc("POS Profile", pos_profile)
    company = profile.company

    selling_price_list = price_list or getattr(profile, "selling_price_list", None)
    default_warehouse = warehouse or getattr(profile, "warehouse", None)

    profile_dict = profile.as_dict()
    profile_dict["pos_profile"] = profile.name
    profile_dict["selling_price_list"] = selling_price_list
    profile_dict["warehouse"] = default_warehouse
    profile_dict["currency"] = frappe.get_cached_value("Company", company, "default_currency")

    # Payment methods from POS Profile child table
    payment_methods = []
    for row in getattr(profile, "payments", []) or []:
        payment_methods.append({
            "mode_of_payment": row.mode_of_payment,
            "default": row.default,
            "account": getattr(row, "account", None),
            "type": getattr(row, "type", None),
            "amount": 0,
            "base_amount": 0,
        })

    # POS opening entry for current user/profile if exists
    opening_entries = frappe.get_all(
        "POS Opening Entry",
        filters={
            "pos_profile": profile.name,
            "user": frappe.session.user,
            "status": "Open",
            "docstatus": 1,
        },
        fields=["name", "pos_profile", "company", "user", "status", "posting_date", "period_start_date"],
        limit=5,
    )

    for oe in opening_entries:
        try:
            doc = frappe.get_doc("POS Opening Entry", oe.name)
            oe["balance_details"] = [d.as_dict() for d in getattr(doc, "balance_details", [])]
        except Exception:
            oe["balance_details"] = []

    # Customers with party account/payment fields
    customers = frappe.get_all(
        "Customer",
        filters={"disabled": 0},
        fields=[
            "name",
            "customer_name",
            "customer_group",
            "territory",
            "mobile_no",
            "email_id",
            "tax_id",
            "customer_primary_address",
            "primary_address",
            "payment_terms",
            "default_price_list",
            "tax_category",
            "loyalty_program",
        ],
        limit_page_length=0,
    )

    company_currency = frappe.get_cached_value("Company", company, "default_currency")
    for c in customers:
        c["payment_terms_template"] = c.get("payment_terms")
        # Receivable account from Party Account if configured
        account = frappe.db.get_value(
            "Party Account",
            {
                "parenttype": "Customer",
                "parent": c.name,
                "company": company,
            },
            "account",
        )
        if not account:
            account = frappe.db.get_value("Company", company, "default_receivable_account")
        c["debit_to"] = account
        c["party_account"] = account
        c["party_account_currency"] = company_currency

    # Item defaults by item/company
    item_defaults = {}
    for row in frappe.get_all(
        "Item Default",
        filters={"company": company},
        fields=[
            "parent",
            "default_warehouse",
            "income_account",
            "expense_account",
            "buying_cost_center",
            "selling_cost_center",
        ],
        limit_page_length=0,
    ):
        item_defaults[row.parent] = row

    item_fields = [
        "name",
        "item_code",
        "item_name",
        "item_group",
        "stock_uom",
        "description",
        "image",
        "disabled",
        "is_stock_item",
        "has_batch_no",
        "has_serial_no",
        "brand",
        "variant_of",
        "has_variants",
        "default_item_manufacturer",
        "default_manufacturer_part_no",
    ]

    items = frappe.get_all(
        "Item",
        filters={"disabled": 0, "is_sales_item": 1},
        fields=item_fields,
        limit_page_length=0,
    )

    for it in items:
        defaults = item_defaults.get(it.name) or {}
        it["uom"] = it.stock_uom
        it["warehouse"] = defaults.get("default_warehouse") or default_warehouse
        it["income_account"] = defaults.get("income_account") or getattr(profile, "income_account", None)
        it["expense_account"] = defaults.get("expense_account")
        it["cost_center"] = (
            defaults.get("selling_cost_center")
            or getattr(profile, "cost_center", None)
            or frappe.db.get_value("Company", company, "cost_center")
        )
        it["item_tax_template"] = frappe.db.get_value(
            "Item Tax",
            {"parent": it.name},
            "item_tax_template",
        )

    # Barcodes
    barcode_rows = frappe.get_all(
        "Item Barcode",
        fields=["parent", "barcode", "uom"],
        limit_page_length=0,
    )
    first_barcode = {}
    for b in barcode_rows:
        first_barcode.setdefault(b.parent, b.barcode)
    for it in items:
        it["barcode"] = first_barcode.get(it.name, "")

    # Prices
    filters = {}
    if selling_price_list:
        filters["price_list"] = selling_price_list

    item_prices = frappe.get_all(
        "Item Price",
        filters=filters,
        fields=["name", "item_code", "price_list", "price_list_rate", "currency", "uom", "valid_from", "valid_upto"],
        limit_page_length=0,
    )

    # Stock from Bin
    stock_filters = {}
    if default_warehouse:
        stock_filters["warehouse"] = default_warehouse

    stock = frappe.get_all(
        "Bin",
        filters=stock_filters,
        fields=["item_code", "warehouse", "actual_qty", "projected_qty"],
        limit_page_length=0,
    )

    # Item groups
    item_groups = frappe.get_all(
        "Item Group",
        fields=["name", "parent_item_group", "is_group"],
        limit_page_length=0,
    )

    # Meta for doctypes used by POS / Link fields
    doctype_names = [
        "Sales Invoice",
        "Sales Invoice Item",
        "POS Invoice",
        "POS Invoice Item",
        "Customer",
        "Item",
        "Mode of Payment",
        "Batch",
        "Serial No",
        "Item Group",
        "Warehouse",
    ]
    doctype_meta = {}
    for dt in doctype_names:
        try:
            doctype_meta[dt] = frappe.get_meta(dt).as_dict()
        except Exception:
            pass

    # POS Settings (if exists)
    pos_settings = {}
    try:
        pos_settings = frappe.get_single("POS Settings").as_dict()
    except Exception:
        pos_settings = {}

    return {
        "server_time": str(now_datetime()),
        "pos_profile_name": profile.name,
        "pos_profile": profile.name,
        "pos_profile_doc": profile_dict,
        "settings": profile_dict,
        "pos_settings": pos_settings,
        "price_list": selling_price_list,
        "warehouse": default_warehouse,
        "customers": customers,
        "items": items,
        "item_prices": item_prices,
        "stock": stock,
        "payment_methods": payment_methods,
        "item_groups": item_groups,
        "pos_opening_entries": opening_entries,
        "pos_opening_entry": opening_entries[0] if opening_entries else None,
        "doctype_meta": doctype_meta,
    }




@frappe.whitelist()
def get_pos_offline_data1(pos_profile, price_list=None, warehouse=None):
    """Return POS master data for browser IndexedDB preload."""
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    profile = frappe.get_doc("POS Profile", pos_profile)
    price_list = price_list or profile.selling_price_list
    warehouse = warehouse or profile.warehouse

    item_filters = {
        "disabled": 0,
        "is_sales_item": 1,
    }

    items = frappe.get_all(
        "Item",
        filters=item_filters,
        fields=[
            "name as item_code",
            "item_name",
            "item_group",
            "stock_uom",
            "description",
            "image",
            "has_variants",
            "variant_of",
            "modified",
        ],
        limit_page_length=0,
    )

    item_codes = [d.item_code for d in items]

    # Add one barcode if available per item. This keeps payload lighter than returning all barcodes.
    if item_codes:
        barcodes = frappe.get_all(
            "Item Barcode",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "barcode"],
            limit_page_length=0,
        )
        barcode_map = {}
        for row in barcodes:
            barcode_map.setdefault(row.parent, row.barcode)
        for item in items:
            item["barcode"] = barcode_map.get(item.item_code, "")

    item_prices = []
    if item_codes and price_list:
        item_prices = frappe.get_all(
            "Item Price",
            filters={
                "item_code": ["in", item_codes],
                "price_list": price_list,
                "selling": 1,
            },
            fields=[
                "name",
                "item_code",
                "price_list",
                "price_list_rate",
                "currency",
                "uom",
                "modified",
            ],
            limit_page_length=0,
        )

    customers = frappe.get_all(
        "Customer",
        filters={"disabled": 0},
        fields=[
            "name",
            "customer_name",
            "customer_group",
            "territory",
            "mobile_no",
            "email_id",
            "modified",
        ],
        limit_page_length=0,
    )

    stock = []
    if item_codes and warehouse:
        stock = frappe.db.sql(
            """
            SELECT item_code, warehouse, actual_qty
            FROM `tabBin`
            WHERE item_code IN %(item_codes)s
              AND warehouse = %(warehouse)s
            """,
            {"item_codes": item_codes, "warehouse": warehouse},
            as_dict=True,
        )

    payment_methods = []
    company = getattr(profile, "company", None) or frappe.defaults.get_user_default("Company")

    for row in profile.payments:
        mode_of_payment = row.get("mode_of_payment") if hasattr(row, "get") else getattr(row, "mode_of_payment", None)
        is_default = row.get("default") if hasattr(row, "get") else getattr(row, "default", 0)

        # Some ERPNext versions do not have account on POS Profile Payment child table.
        # In that case, get the account from Mode of Payment Account for the selected company.
        account = row.get("account") if hasattr(row, "get") else getattr(row, "account", None)
        if not account and mode_of_payment and company:
            account = frappe.db.get_value(
                "Mode of Payment Account",
                {"parent": mode_of_payment, "company": company},
                "default_account",
            )

        payment_methods.append(
            {
                "mode_of_payment": mode_of_payment,
                "default": is_default,
                "account": account or "",
            }
        )

    return {
        "server_time": str(now_datetime()),
        "pos_profile": pos_profile,
        "price_list": price_list,
        "warehouse": warehouse,
        "items": items,
        "item_prices": item_prices,
        "customers": customers,
        "stock": stock,
        "payment_methods": payment_methods,
    }


@frappe.whitelist()
def sync_offline_pos_invoice(invoice):
    """Create or finalize an ERPNext invoice from the browser offline queue."""
    if isinstance(invoice, str):
        invoice = frappe.parse_json(invoice)

    if not isinstance(invoice, dict):
        frappe.throw(_("Invalid invoice payload"))

    offline_id = invoice.get("custom_offline_id")
    if not offline_id:
        frappe.throw(_("Missing custom_offline_id"))

    doctype = invoice.get("doctype") or "POS Invoice"
    if doctype not in ("POS Invoice", "Sales Invoice"):
        frappe.throw(_("Invalid invoice doctype"))

    existing = frappe.db.exists(doctype, {"custom_offline_id": offline_id})
    if existing:
        doc = frappe.get_doc(doctype, existing)

        if doc.docstatus == 2:
            frappe.throw(_("Offline invoice {0} is cancelled").format(existing))

        if doc.docstatus == 0:
            doc.submit()

        doc.reload()
        return {
            "status": "already_synced" if doc.docstatus == 1 else "existing",
            "name": doc.name,
            "docstatus": doc.docstatus,
            "invoice_status": doc.get("status"),
            "paid_amount": flt(doc.get("paid_amount") or 0),
            "outstanding_amount": flt(doc.get("outstanding_amount") or 0),
        }

    clean_invoice = dict(invoice)
    for key in list(clean_invoice.keys()):
        if key.startswith("__"):
            clean_invoice.pop(key, None)

    clean_invoice["doctype"] = doctype
    clean_invoice["docstatus"] = 0

    doc = frappe.get_doc(clean_invoice)
    doc.flags.ignore_permissions = False
    doc.insert()
    doc.submit()
    doc.reload()

    return {
        "status": "submitted",
        "name": doc.name,
        "docstatus": doc.docstatus,
        "invoice_status": doc.get("status"),
        "paid_amount": flt(doc.get("paid_amount") or 0),
        "outstanding_amount": flt(doc.get("outstanding_amount") or 0),
    }


def _wmn_get_pos_payment_methods_for_invoice(invoice):
    methods = []
    pos_profile = invoice.get("pos_profile")

    if not pos_profile:
        return methods

    profile = frappe.get_doc("POS Profile", pos_profile)
    for row in getattr(profile, "payments", []) or []:
        mode_of_payment = row.get("mode_of_payment") if hasattr(row, "get") else getattr(row, "mode_of_payment", None)
        if not mode_of_payment:
            continue

        account = row.get("account") if hasattr(row, "get") else getattr(row, "account", None)
        if not account:
            account = frappe.db.get_value(
                "Mode of Payment Account",
                {"parent": mode_of_payment, "company": invoice.company},
                "default_account",
            )

        methods.append({
            "mode_of_payment": mode_of_payment,
            "default": cint(row.get("default") if hasattr(row, "get") else getattr(row, "default", 0)),
            "account": account or "",
        })

    return methods


@frappe.whitelist()
def get_sales_invoice_payment_context(invoice_name):
    if not invoice_name:
        frappe.throw(_("Sales Invoice is required"))

    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    invoice.check_permission("read")

    if invoice.docstatus != 1:
        frappe.throw(_("Sales Invoice {0} is not submitted").format(invoice.name))

    if cint(invoice.get("is_return") or 0):
        frappe.throw(_("Payment cannot be added to a return invoice from POS"))

    outstanding_amount = flt(invoice.get("outstanding_amount") or 0)
    if outstanding_amount <= 0:
        frappe.throw(_("Sales Invoice {0} has no outstanding amount").format(invoice.name))

    payment_methods = _wmn_get_pos_payment_methods_for_invoice(invoice)

    return {
        "name": invoice.name,
        "customer": invoice.customer,
        "customer_name": invoice.customer_name,
        "company": invoice.company,
        "currency": invoice.currency,
        "status": invoice.status,
        "grand_total": flt(invoice.grand_total or 0),
        "paid_amount": flt(invoice.paid_amount or 0),
        "outstanding_amount": outstanding_amount,
        "pos_profile": invoice.pos_profile,
        "payment_methods": payment_methods,
    }


@frappe.whitelist()
def add_payment_to_sales_invoice(
    invoice_name,
    amount,
    mode_of_payment,
    reference_no=None,
    reference_date=None,
):
    if not invoice_name:
        frappe.throw(_("Sales Invoice is required"))
    if not mode_of_payment:
        frappe.throw(_("Mode of Payment is required"))

    frappe.has_permission("Payment Entry", "create", throw=True)

    invoice = frappe.get_doc("Sales Invoice", invoice_name)
    invoice.check_permission("read")

    if invoice.docstatus != 1:
        frappe.throw(_("Sales Invoice {0} is not submitted").format(invoice.name))
    if cint(invoice.get("is_return") or 0):
        frappe.throw(_("Payment cannot be added to a return invoice from POS"))

    outstanding_amount = flt(invoice.get("outstanding_amount") or 0)
    payment_amount = flt(amount or 0)

    if outstanding_amount <= 0:
        frappe.throw(_("Sales Invoice {0} has no outstanding amount").format(invoice.name))
    if payment_amount <= 0:
        frappe.throw(_("Payment amount must be greater than zero"))

    precision = invoice.precision("outstanding_amount") or 2
    if flt(payment_amount, precision) > flt(outstanding_amount, precision):
        frappe.throw(
            _("Payment amount cannot exceed outstanding amount {0}").format(
                frappe.utils.fmt_money(outstanding_amount, currency=invoice.currency)
            )
        )

    payment_methods = _wmn_get_pos_payment_methods_for_invoice(invoice)
    selected_method = next(
        (row for row in payment_methods if row.get("mode_of_payment") == mode_of_payment),
        None,
    )

    if not selected_method:
        frappe.throw(
            _("Mode of Payment {0} is not configured in POS Profile {1}").format(
                mode_of_payment,
                invoice.pos_profile or "",
            )
        )

    payment_account = selected_method.get("account")
    if not payment_account:
        frappe.throw(
            _("No account is configured for Mode of Payment {0} in company {1}").format(
                mode_of_payment,
                invoice.company,
            )
        )

    from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
    from frappe.utils import nowdate

    payment_entry = get_payment_entry(
        "Sales Invoice",
        invoice.name,
        party_amount=payment_amount,
        bank_account=payment_account,
        reference_date=reference_date or nowdate(),
    )

    payment_entry.mode_of_payment = mode_of_payment
    payment_entry.reference_no = reference_no or invoice.name
    payment_entry.reference_date = reference_date or nowdate()

    payment_entry.insert()
    payment_entry.submit()

    invoice.reload()

    return {
        "payment_entry": payment_entry.name,
        "payment_entry_docstatus": payment_entry.docstatus,
        "invoice": invoice.name,
        "invoice_status": invoice.status,
        "paid_amount": flt(invoice.paid_amount or 0),
        "outstanding_amount": flt(invoice.outstanding_amount or 0),
    }







@frappe.whitelist()
def get_past_order_list(search_term, status, limit=20):
    fields = [
        "name",
        "grand_total",
        "currency",
        "customer",
        "customer_name",
        "posting_time",
        "posting_date",
        "status",
        "paid_amount",
        "outstanding_amount",
        "docstatus",
        "is_return",
    ]
    filters = {"is_pos": 1}

    if status:
        filters["status"] = status

    if not status:
        return []

    invoice_list = []

    if search_term:
        by_customer_filters = dict(filters)
        by_customer_filters["customer"] = ["like", f"%{search_term}%"]
        by_name_filters = dict(filters)
        by_name_filters["name"] = ["like", f"%{search_term}%"]

        invoices_by_customer = frappe.db.get_all(
            "Sales Invoice",
            filters=by_customer_filters,
            fields=fields,
            page_length=limit,
            order_by="posting_date desc, posting_time desc",
        )
        invoices_by_name = frappe.db.get_all(
            "Sales Invoice",
            filters=by_name_filters,
            fields=fields,
            page_length=limit,
            order_by="posting_date desc, posting_time desc",
        )

        seen = set()
        for row in invoices_by_customer + invoices_by_name:
            if row.name in seen:
                continue
            seen.add(row.name)
            invoice_list.append(row)
            if len(invoice_list) >= cint(limit or 20):
                break
    else:
        invoice_list = frappe.db.get_all(
            "Sales Invoice",
            filters=filters,
            fields=fields,
            page_length=limit,
            order_by="posting_date desc, posting_time desc",
        )

    return invoice_list





@frappe.whitelist(allow_guest=True)
def get_translated_workspaces():
 
    workspaces = frappe.get_all("Workspace", 
        filters={"public": 1, "parent_page": ""},
        fields=["name", "label", "icon"],
        order_by="sequence_id asc"
    )
    
 
    for ws in workspaces:

        ws['translated_label'] = _(ws.get('label') or ws.get('name'))
        
    return workspaces