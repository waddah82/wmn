import frappe
from frappe import _
import json


from frappe.utils import flt, now_datetime
from erpnext.stock.doctype.batch.batch import get_batch_qty


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
        "name", "item_code", "item_name", "item_group", "stock_uom", "description",
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
        it["item_tax_template"] = frappe.db.get_value("Item Tax", {"parent": it.name}, "item_tax_template")

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

    price_filters = {}
    if selling_price_list:
        price_filters["price_list"] = selling_price_list

    item_prices = frappe.get_all(
        "Item Price",
        filters=price_filters,
        fields=["name", "item_code", "price_list", "price_list_rate", "currency", "uom", "valid_from", "valid_upto"],
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

    batches = get_offline_batches(default_warehouse)
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
    }


def get_offline_batches(default_warehouse=None):
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
            })

    return batches


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
    """Create an ERPNext invoice from a browser offline queue row.

    Add a Custom Field named custom_offline_id to POS Invoice and Sales Invoice.
    Make it unique if your ERPNext version allows it.
    """
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
        return {"status": "already_synced", "name": existing}

    # Remove browser/local flags that can break insert.
    clean_invoice = dict(invoice)
    for key in list(clean_invoice.keys()):
        if key.startswith("__"):
            clean_invoice.pop(key, None)

    clean_invoice["doctype"] = doctype
    clean_invoice["docstatus"] = 0

    doc = frappe.get_doc(clean_invoice)
    doc.flags.ignore_permissions = False
    doc.insert()

    # Submit only if you want offline invoices to be finalized immediately.
    # Keep disabled until taxes, payments, warehouse and stock behavior are fully verified.
    doc.submit()

    return {"status": "created", "name": doc.name}








@frappe.whitelist()
def get_past_order_list(search_term, status, limit=20):
	fields = ["name", "grand_total", "currency", "customer", "posting_time", "posting_date"]
	invoice_list = []

	if search_term and status:
		invoices_by_customer = frappe.db.get_all(
			"Sales Invoice",
			filters={"customer": ["like", f"%{search_term}%"], "status": status, "is_pos": 1},
			fields=fields,
			page_length=limit,
		)
		invoices_by_name = frappe.db.get_all(
			"Sales Invoice",
			filters={"name": ["like", f"%{search_term}%"], "status": status, "is_pos": 1},
			fields=fields,
			page_length=limit,
		)

		invoice_list = invoices_by_customer + invoices_by_name
	elif status:
		invoice_list = frappe.db.get_all(
			"Sales Invoice", filters={"status": status, "is_pos": 1}, fields=fields, page_length=limit
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
