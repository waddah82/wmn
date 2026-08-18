import frappe
from frappe import _
import json
import base64
import hashlib
import hmac
import secrets


from frappe.utils import flt, now_datetime, cint, getdate, today
from erpnext.stock.doctype.batch.batch import get_batch_qty
from erpnext.accounts.doctype.pos_invoice.pos_invoice import get_item_group as get_pos_profile_item_groups





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
        ["name", "stock_uom", "has_batch_no", "allow_negative_stock"],
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

        allow_negative_stock = cint(
            item.get("allow_negative_stock")
            or frappe.db.get_single_value("Stock Settings", "allow_negative_stock")
            or 0
        )
        if qty <= 0 and not allow_negative_stock:
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
            "allow_negative_stock": allow_negative_stock,
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

    selected_batch = str(batch_no or "").strip()
    result = []

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

    return result


def _wmn_uom_conversion_rows(item_code):
    rows = frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": item_code},
        fields=["uom", "conversion_factor", "idx"],
        order_by="idx asc",
        limit_page_length=0,
    )
    return [row for row in rows if row.get("uom")]


def _wmn_price_row_rank(row, selected_batch=""):
    row_batch = str(row.get("batch_no") or "").strip()
    batch_rank = 2 if selected_batch and row_batch == selected_batch else 1
    valid_from = getdate(row.get("valid_from")) if row.get("valid_from") else getdate("1900-01-01")
    return (batch_rank, valid_from, str(row.get("modified") or ""))


def _wmn_build_item_uom_options(item, conversion_rows, price_rows, batch_no=None):
    if not item:
        return []

    stock_uom = item.get("stock_uom") or ""
    selected_batch = str(batch_no or "").strip()

    allowed = []
    conversion_map = {}

    if stock_uom:
        allowed.append(stock_uom)
        conversion_map[stock_uom] = 1.0

    for row in conversion_rows or []:
        uom = row.get("uom")
        if not uom:
            continue
        if uom not in allowed:
            allowed.append(uom)
        conversion_map[uom] = 1.0 if uom == stock_uom else flt(row.get("conversion_factor") or 1)

    if not allowed:
        return []

    best_direct = {}
    for row in price_rows or []:
        row_uom = row.get("uom") or stock_uom
        if not row_uom or row_uom not in conversion_map:
            continue

        row_batch = str(row.get("batch_no") or "").strip()
        if selected_batch:
            if row_batch and row_batch != selected_batch:
                continue
        elif row_batch:
            continue

        existing = best_direct.get(row_uom)
        if existing is None or _wmn_price_row_rank(row, selected_batch) > _wmn_price_row_rank(existing, selected_batch):
            best_direct[row_uom] = row

    base_price_row = best_direct.get(stock_uom) if stock_uom else None
    base_rate = flt(base_price_row.get("price_list_rate") or 0) if base_price_row else 0
    base_currency = base_price_row.get("currency") or "" if base_price_row else ""

    result = []
    for uom in allowed:
        factor = flt(conversion_map.get(uom) or 1)
        direct = best_direct.get(uom)

        if direct:
            rate = flt(direct.get("price_list_rate") or 0)
            currency = direct.get("currency") or base_currency
            source = "direct"
            valid_from = direct.get("valid_from")
            valid_upto = direct.get("valid_upto")
        elif base_price_row:
            rate = flt(base_rate * factor)
            currency = base_currency
            source = "derived"
            valid_from = base_price_row.get("valid_from")
            valid_upto = base_price_row.get("valid_upto")
        else:
            rate = 0
            currency = ""
            source = "missing"
            valid_from = None
            valid_upto = None

        result.append({
            "uom": uom,
            "price_list_rate": rate,
            "currency": currency,
            "conversion_factor": factor,
            "batch_no": selected_batch,
            "valid_from": valid_from,
            "valid_upto": valid_upto,
            "price_source": source,
        })

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

    conversion_rows = _wmn_uom_conversion_rows(item_code)
    price_rows = _wmn_active_item_price_rows(
        item_code,
        price_list,
        batch_no=batch_no,
    )

    return _wmn_build_item_uom_options(
        item,
        conversion_rows,
        price_rows,
        batch_no=batch_no,
    )


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
    for row in rows:
        if row.get("stock_uom"):
            uom_sets.setdefault(row.name, set()).add(row.stock_uom)

    for row in frappe.get_all(
        "UOM Conversion Detail",
        filters={"parent": ["in", codes]},
        fields=["parent", "uom"],
        limit_page_length=0,
    ):
        if row.get("uom"):
            uom_sets.setdefault(row.parent, set()).add(row.uom)

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
        preferred = next((d for d in uom_options if d.get("uom") == row.stock_uom), None)
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




WMN_POS_COUPON_DOCTYPE = "WMN POS Coupon"
WMN_POS_COUPON_REDEMPTION_DOCTYPE = "WMN POS Coupon Redemption"


def _wmn_pos_coupon_doctype_exists():
    return bool(frappe.db.exists("DocType", WMN_POS_COUPON_DOCTYPE))


def _wmn_get_pos_coupon_by_code(coupon_code):
    code = str(coupon_code or "").strip()
    if not code:
        frappe.throw(_("Coupon Code is required"))

    if not _wmn_pos_coupon_doctype_exists():
        frappe.throw(_("WMN POS Coupon DocType is not installed. Run bench migrate after adding the DocType files."))

    name = frappe.db.get_value(
        WMN_POS_COUPON_DOCTYPE,
        {"coupon_code": code},
        "name",
    )

    if not name:
        name = frappe.db.get_value(
            WMN_POS_COUPON_DOCTYPE,
            {"coupon_code": code.upper()},
            "name",
        )

    if not name:
        frappe.throw(_("Coupon {0} was not found").format(code))

    return frappe.get_doc(WMN_POS_COUPON_DOCTYPE, name)


def _wmn_pos_coupon_redemption_doctype_exists():
    return bool(frappe.db.exists("DocType", WMN_POS_COUPON_REDEMPTION_DOCTYPE))


def _wmn_reconcile_pos_coupon_redemptions(coupon_code):
    if not coupon_code or not _wmn_pos_coupon_redemption_doctype_exists():
        return

    rows = frappe.get_all(
        WMN_POS_COUPON_REDEMPTION_DOCTYPE,
        filters={"coupon": coupon_code, "is_cancelled": 0},
        fields=["name", "reference_doctype", "reference_name"],
        limit_page_length=0,
    )
    if not rows:
        return

    by_doctype = {}
    for row in rows:
        doctype = row.get("reference_doctype")
        reference_name = row.get("reference_name")
        if doctype not in ("Sales Invoice", "POS Invoice") or not reference_name:
            continue
        by_doctype.setdefault(doctype, set()).add(reference_name)

    submitted_by_doctype = {}
    for doctype, names in by_doctype.items():
        status_rows = frappe.get_all(
            doctype,
            filters={"name": ["in", list(names)]},
            fields=["name", "docstatus"],
            limit_page_length=0,
        )
        submitted_by_doctype[doctype] = {
            row.name for row in status_rows if cint(row.docstatus or 0) == 1
        }

    for row in rows:
        doctype = row.get("reference_doctype")
        reference_name = row.get("reference_name")
        if doctype not in submitted_by_doctype or not reference_name:
            continue
        if reference_name not in submitted_by_doctype[doctype]:
            frappe.db.set_value(
                WMN_POS_COUPON_REDEMPTION_DOCTYPE,
                row.name,
                "is_cancelled",
                1,
                update_modified=False,
            )


def _wmn_pos_coupon_usage(coupon_code, customer=None):
    if not _wmn_pos_coupon_redemption_doctype_exists():
        return 0, 0

    _wmn_reconcile_pos_coupon_redemptions(coupon_code)
    filters = {"coupon": coupon_code, "is_cancelled": 0}
    used = cint(frappe.db.count(WMN_POS_COUPON_REDEMPTION_DOCTYPE, filters=filters) or 0)

    customer_used = 0
    if customer:
        customer_filters = dict(filters)
        customer_filters["customer"] = customer
        customer_used = cint(
            frappe.db.count(WMN_POS_COUPON_REDEMPTION_DOCTYPE, filters=customer_filters) or 0
        )

    return used, customer_used


def _wmn_pos_coupon_used_customers(coupon_code, valid_from=None):
    if not coupon_code or not _wmn_pos_coupon_redemption_doctype_exists():
        return []

    filters = {"coupon": coupon_code, "is_cancelled": 0}
    if valid_from:
        filters["redeemed_on"] = [">=", str(getdate(valid_from)) + " 00:00:00"]

    rows = frappe.get_all(
        WMN_POS_COUPON_REDEMPTION_DOCTYPE,
        filters=filters,
        fields=["customer"],
        limit_page_length=0,
    )
    return sorted({row.customer for row in rows if row.get("customer")})


def _wmn_pos_coupon_to_dict(coupon, include_usage=True):
    used = 0
    used_customers = []
    if include_usage:
        used, _ = _wmn_pos_coupon_usage(coupon.coupon_code)
        if cint(coupon.one_use_per_customer or 0):
            used_customers = _wmn_pos_coupon_used_customers(
                coupon.coupon_code,
                coupon.valid_from,
            )

    return {
        "name": coupon.name,
        "coupon_name": coupon.coupon_name or coupon.coupon_code,
        "coupon_code": coupon.coupon_code,
        "coupon_type": coupon.coupon_type or "Promotional",
        "company": coupon.company or "",
        "customer": coupon.customer or "",
        "campaign": coupon.campaign or "",
        "discount_type": coupon.discount_type or "Percentage",
        "discount_percentage": flt(coupon.discount_percentage or 0),
        "discount_amount": flt(coupon.discount_amount or 0),
        "apply_on": coupon.apply_on or "Grand Total",
        "minimum_cart_amount": flt(coupon.minimum_cart_amount or 0),
        "maximum_discount_amount": flt(coupon.maximum_discount_amount or 0),
        "valid_from": coupon.valid_from,
        "valid_upto": coupon.valid_upto,
        "maximum_use": 1 if (coupon.coupon_type or "Promotional") == "Gift Card" else cint(coupon.maximum_use or 0),
        "used": used,
        "one_use_per_customer": cint(coupon.one_use_per_customer or 0),
        "used_customers": used_customers,
        "disabled": cint(coupon.disabled or 0),
    }


def _wmn_validate_pos_coupon(
    coupon_code,
    customer=None,
    company=None,
    net_total=0,
    grand_total=0,
    is_return=0,
):
    coupon = _wmn_get_pos_coupon_by_code(coupon_code)
    if not _wmn_pos_coupon_redemption_doctype_exists():
        frappe.throw(_("WMN POS Coupon Redemption DocType is not installed. Run bench migrate."))
    current_date = getdate(today())

    if cint(coupon.disabled or 0):
        frappe.throw(_("Coupon {0} is disabled").format(coupon.coupon_code))

    coupon_type = coupon.coupon_type or "Promotional"
    if coupon_type not in ("Promotional", "Gift Card"):
        frappe.throw(_("Unsupported coupon type {0}").format(coupon_type))

    if cint(is_return or 0):
        frappe.throw(_("Coupons cannot be applied to return invoices"))

    if coupon.valid_from and current_date < getdate(coupon.valid_from):
        frappe.throw(_("Coupon {0} is not active yet").format(coupon.coupon_code))

    if coupon.valid_upto and current_date > getdate(coupon.valid_upto):
        frappe.throw(_("Coupon {0} has expired").format(coupon.coupon_code))

    if coupon.company and company and coupon.company != company:
        frappe.throw(_("Coupon {0} is not valid for company {1}").format(coupon.coupon_code, company))

    if coupon_type == "Gift Card" and not coupon.customer:
        frappe.throw(_("Gift Card {0} must be assigned to a customer").format(coupon.coupon_code))

    if coupon.customer:
        if not customer:
            frappe.throw(_("Select customer {0} before applying this coupon").format(coupon.customer))
        if coupon.customer != customer:
            if coupon_type == "Gift Card":
                frappe.throw(_("Gift Card {0} is assigned to another customer").format(coupon.coupon_code))
            frappe.throw(_("Coupon {0} is assigned to another customer").format(coupon.coupon_code))

    used, customer_used = _wmn_pos_coupon_usage(coupon.coupon_code, customer)
    maximum_use = 1 if coupon_type == "Gift Card" else cint(coupon.maximum_use or 0)
    if maximum_use > 0 and used >= maximum_use:
        frappe.throw(_("Coupon {0} has reached its maximum number of uses").format(coupon.coupon_code))

    if cint(coupon.one_use_per_customer or 0):
        if not customer:
            frappe.throw(_("A customer is required for one-use-per-customer coupons"))
        if customer_used > 0:
            frappe.throw(_("Customer {0} has already used coupon {1}").format(customer, coupon.coupon_code))

    apply_on = coupon.apply_on or "Grand Total"
    if apply_on not in ("Grand Total", "Net Total"):
        apply_on = "Grand Total"

    base_amount = flt(grand_total if apply_on == "Grand Total" else net_total)
    if base_amount <= 0:
        frappe.throw(_("Coupon cannot be applied to an empty invoice"))

    minimum_cart_amount = flt(coupon.minimum_cart_amount or 0)
    if minimum_cart_amount > 0 and base_amount < minimum_cart_amount:
        frappe.throw(
            _("Coupon {0} requires a minimum amount of {1}").format(
                coupon.coupon_code,
                frappe.utils.fmt_money(minimum_cart_amount),
            )
        )

    discount_type = coupon.discount_type or "Percentage"
    if discount_type == "Percentage":
        percentage = flt(coupon.discount_percentage or 0)
        if percentage <= 0:
            frappe.throw(_("Coupon discount percentage must be greater than zero"))
        calculated_discount = base_amount * percentage / 100.0
    else:
        calculated_discount = flt(coupon.discount_amount or 0)
        if calculated_discount <= 0:
            frappe.throw(_("Coupon discount amount must be greater than zero"))

    maximum_discount_amount = flt(coupon.maximum_discount_amount or 0)
    if maximum_discount_amount > 0:
        calculated_discount = min(calculated_discount, maximum_discount_amount)

    calculated_discount = max(0, min(calculated_discount, base_amount))

    result = _wmn_pos_coupon_to_dict(coupon, include_usage=False)
    result.update({
        "used": used,
        "customer_used": customer_used,
        "base_amount": base_amount,
        "calculated_discount": calculated_discount,
        "remaining_uses": max(0, maximum_use - used) if maximum_use > 0 else None,
    })

    try:
        frappe.db.set_value(
            WMN_POS_COUPON_DOCTYPE,
            coupon.name,
            "used",
            used,
            update_modified=False,
        )
    except Exception:
        pass

    return result


def _wmn_register_pos_coupon_redemption(
    coupon_code,
    invoice_doctype,
    invoice_name,
    customer=None,
    company=None,
    coupon_discount_amount=None,
    promotion_invoice_discount_amount=0,
    offline_id=None,
):
    if not coupon_code or not invoice_doctype or not invoice_name:
        return None
    if not _wmn_pos_coupon_redemption_doctype_exists():
        frappe.throw(_("WMN POS Coupon Redemption DocType is not installed. Run bench migrate."))

    redemption_key = "{0}::{1}".format(invoice_doctype, invoice_name)
    existing = frappe.db.get_value(
        WMN_POS_COUPON_REDEMPTION_DOCTYPE,
        {"redemption_key": redemption_key},
        "name",
    )
    if existing:
        return frappe.get_doc(WMN_POS_COUPON_REDEMPTION_DOCTYPE, existing)

    invoice = frappe.get_doc(invoice_doctype, invoice_name)
    if invoice.docstatus != 1:
        frappe.throw(_("Coupon redemption can only be registered for a submitted invoice"))

    coupon = _wmn_get_pos_coupon_by_code(coupon_code)
    frappe.db.sql(
        "select name from `tabWMN POS Coupon` where name=%s for update",
        (coupon.name,),
    )
    coupon.reload()

    total_invoice_discount = max(0, flt(invoice.get("discount_amount") or 0))
    promotion_discount = max(0, flt(promotion_invoice_discount_amount or 0))
    if coupon_discount_amount is None:
        coupon_discount = max(0, total_invoice_discount - promotion_discount)
    else:
        coupon_discount = max(0, flt(coupon_discount_amount or 0))

    pre_parent_net_total = sum(
        flt(row.get("net_amount") or row.get("amount") or 0) + flt(row.get("distributed_discount_amount") or 0)
        for row in (invoice.get("items") or [])
    )
    coupon_net_total = max(0, pre_parent_net_total - promotion_discount)
    coupon_grand_total = max(0, flt(invoice.get("grand_total") or 0) + coupon_discount)

    validation = _wmn_validate_pos_coupon(
        coupon_code=coupon.coupon_code,
        customer=customer or invoice.get("customer"),
        company=company or invoice.get("company"),
        net_total=coupon_net_total,
        grand_total=coupon_grand_total,
        is_return=invoice.get("is_return"),
    )
    expected_discount = flt(validation.get("calculated_discount") or 0)
    if abs(expected_discount - coupon_discount) > 0.01:
        frappe.throw(
            _("Coupon discount does not match the submitted invoice. Expected {0}, found {1}.").format(
                frappe.utils.fmt_money(expected_discount),
                frappe.utils.fmt_money(coupon_discount),
            )
        )

    doc = frappe.get_doc({
        "doctype": WMN_POS_COUPON_REDEMPTION_DOCTYPE,
        "redemption_key": redemption_key,
        "coupon": coupon.name,
        "coupon_code": coupon.coupon_code,
        "reference_doctype": invoice_doctype,
        "reference_name": invoice_name,
        "customer": customer or invoice.get("customer") or "",
        "company": company or invoice.get("company") or "",
        "discount_amount": coupon_discount,
        "offline_id": offline_id or invoice.get("custom_offline_id") or "",
        "redeemed_on": now_datetime(),
        "is_cancelled": 0,
    })
    doc.insert(ignore_permissions=True)
    _wmn_refresh_pos_coupon_usage_field(coupon.coupon_code)
    return doc


@frappe.whitelist()
def register_pos_coupon_redemption(
    coupon_code,
    invoice_doctype,
    invoice_name,
    coupon_discount_amount=None,
    promotion_invoice_discount_amount=0,
):
    if invoice_doctype not in ("Sales Invoice", "POS Invoice"):
        frappe.throw(_("Invalid invoice doctype"))

    invoice = frappe.get_doc(invoice_doctype, invoice_name)
    invoice.check_permission("read")
    redemption = _wmn_register_pos_coupon_redemption(
        coupon_code=coupon_code,
        invoice_doctype=invoice_doctype,
        invoice_name=invoice_name,
        customer=invoice.get("customer"),
        company=invoice.get("company"),
        coupon_discount_amount=(
            flt(coupon_discount_amount) if coupon_discount_amount is not None else None
        ),
        promotion_invoice_discount_amount=flt(promotion_invoice_discount_amount or 0),
        offline_id=invoice.get("custom_offline_id"),
    )
    return {
        "name": redemption.name if redemption else "",
        "used": _wmn_refresh_pos_coupon_usage_field(coupon_code),
    }


def _wmn_refresh_pos_coupon_usage_field(coupon_code):
    if not coupon_code or not _wmn_pos_coupon_doctype_exists():
        return 0

    try:
        coupon = _wmn_get_pos_coupon_by_code(coupon_code)
        used, _ = _wmn_pos_coupon_usage(coupon.coupon_code)
        frappe.db.set_value(
            WMN_POS_COUPON_DOCTYPE,
            coupon.name,
            "used",
            used,
            update_modified=False,
        )
        return used
    except Exception:
        return 0


@frappe.whitelist()
def refresh_pos_coupon_usage(coupon_code):
    return {"used": _wmn_refresh_pos_coupon_usage_field(coupon_code)}


@frappe.whitelist()
def validate_pos_coupon(
    coupon_code,
    customer=None,
    company=None,
    net_total=0,
    grand_total=0,
    is_return=0,
):
    return _wmn_validate_pos_coupon(
        coupon_code=coupon_code,
        customer=customer,
        company=company,
        net_total=net_total,
        grand_total=grand_total,
        is_return=is_return,
    )


def get_active_pos_coupons_for_offline(company=None):
    if not _wmn_pos_coupon_doctype_exists():
        return []

    current_date = getdate(today())
    rows = frappe.get_all(
        WMN_POS_COUPON_DOCTYPE,
        filters={"disabled": 0},
        fields=["name"],
        limit_page_length=0,
    )

    result = []
    for row in rows:
        coupon = frappe.get_doc(WMN_POS_COUPON_DOCTYPE, row.name)
        coupon_type = coupon.coupon_type or "Promotional"
        if coupon_type not in ("Promotional", "Gift Card"):
            continue
        if coupon_type == "Gift Card" and not coupon.customer:
            continue
        if coupon.company and company and coupon.company != company:
            continue
        if coupon.valid_from and current_date < getdate(coupon.valid_from):
            continue
        if coupon.valid_upto and current_date > getdate(coupon.valid_upto):
            continue

        data = _wmn_pos_coupon_to_dict(coupon, include_usage=True)
        maximum_use = cint(data.get("maximum_use") or 0)
        if maximum_use > 0 and cint(data.get("used") or 0) >= maximum_use:
            continue
        result.append(data)

    return result


def _wmn_apply_coupon_to_offline_invoice_payload(invoice):
    coupon_code = str(invoice.get("__wmn_coupon_code") or "").strip()
    if not coupon_code:
        return invoice

    if abs(flt(invoice.get("additional_discount_percentage") or 0)) > 0.000001:
        frappe.throw(_("WMN Coupon cannot be combined with a manual additional discount."))

    promotion_discount = max(0, flt(invoice.get("__wmn_promotion_invoice_discount_total") or 0))
    coupon_hint = max(0, flt(invoice.get("__wmn_coupon_discount_total") or 0))

    pre_parent_net_total = sum(
        flt(row.get("net_amount") or row.get("amount") or 0) + flt(row.get("distributed_discount_amount") or 0)
        for row in (invoice.get("items") or [])
    )
    coupon_net_total = max(0, pre_parent_net_total - promotion_discount)
    coupon_grand_total = max(0, flt(invoice.get("grand_total") or 0) + coupon_hint)

    validated = _wmn_validate_pos_coupon(
        coupon_code=coupon_code,
        customer=invoice.get("customer"),
        company=invoice.get("company"),
        net_total=coupon_net_total,
        grand_total=coupon_grand_total,
        is_return=invoice.get("is_return"),
    )

    coupon_discount = max(0, flt(validated.get("calculated_discount") or 0))
    total_discount = promotion_discount + coupon_discount
    invoice["__wmn_coupon_discount_total"] = coupon_discount
    invoice["apply_discount_on"] = validated["apply_on"]
    invoice["additional_discount_percentage"] = 0
    invoice["discount_amount"] = total_discount
    invoice["base_discount_amount"] = total_discount
    return invoice



WMN_POS_PROMOTION_DOCTYPE = "WMN POS Promotion"
WMN_POS_PROMOTION_REDEMPTION_DOCTYPE = "WMN POS Promotion Redemption"


def _wmn_pos_promotion_doctype_exists():
    return bool(frappe.db.exists("DocType", WMN_POS_PROMOTION_DOCTYPE))


def _wmn_pos_promotion_redemption_doctype_exists():
    return bool(frappe.db.exists("DocType", WMN_POS_PROMOTION_REDEMPTION_DOCTYPE))


def _wmn_pos_promotion_to_dict(promotion):
    fields = [
        "name", "promotion_name", "promotion_code", "disabled", "auto_apply", "priority", "stackable",
        "company", "pos_profile", "warehouse", "customer", "customer_group", "required_coupon",
        "is_cumulative", "apply_scope", "item_code", "item_group", "brand", "minimum_cart_amount", "minimum_qty",
        "promotion_type", "discount_percentage", "discount_amount", "maximum_discount_amount",
        "buy_qty", "free_qty", "free_item", "repeat_benefit", "max_applications",
        "valid_from", "valid_upto", "start_time", "end_time",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    ]
    data = {field: promotion.get(field) for field in fields}
    data["promotion_code"] = str(data.get("promotion_code") or promotion.name or "").strip().upper()
    data["promotion_name"] = data.get("promotion_name") or data["promotion_code"]
    data["disabled"] = cint(data.get("disabled") or 0)
    data["auto_apply"] = cint(1 if data.get("auto_apply") is None else data.get("auto_apply"))
    data["priority"] = cint(data.get("priority") or 0)
    data["stackable"] = cint(1 if data.get("stackable") is None else data.get("stackable"))
    data["is_cumulative"] = cint(data.get("is_cumulative") or 0)
    data["minimum_cart_amount"] = flt(data.get("minimum_cart_amount") or 0)
    data["minimum_qty"] = flt(data.get("minimum_qty") or 0)
    data["discount_percentage"] = flt(data.get("discount_percentage") or 0)
    data["discount_amount"] = flt(data.get("discount_amount") or 0)
    data["maximum_discount_amount"] = flt(data.get("maximum_discount_amount") or 0)
    data["buy_qty"] = flt(data.get("buy_qty") or 0)
    data["free_qty"] = flt(data.get("free_qty") or 0)
    data["repeat_benefit"] = cint(1 if data.get("repeat_benefit") is None else data.get("repeat_benefit"))
    data["max_applications"] = cint(data.get("max_applications") or 0)
    for weekday in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"):
        data[weekday] = cint(data.get(weekday) or 0)
    if data.get("valid_from"):
        data["valid_from"] = str(data["valid_from"])
    if data.get("valid_upto"):
        data["valid_upto"] = str(data["valid_upto"])
    if data.get("start_time") is not None:
        data["start_time"] = str(data.get("start_time") or "")
    if data.get("end_time") is not None:
        data["end_time"] = str(data.get("end_time") or "")
    return data


def _wmn_promotion_is_active_for_snapshot(promotion, company=None, pos_profile=None, warehouse=None, snapshot_date=None):
    if cint(promotion.disabled or 0):
        return False
    if not cint(1 if promotion.auto_apply is None else promotion.auto_apply):
        return False
    if promotion.company and company and promotion.company != company:
        return False
    if promotion.pos_profile and pos_profile and promotion.pos_profile != pos_profile:
        return False
    if promotion.warehouse and warehouse and promotion.warehouse != warehouse:
        return False

    current_date = getdate(snapshot_date or today())
    # Keep future promotions in the POS cache so they can become active while a device is offline.
    if promotion.valid_upto and current_date > getdate(promotion.valid_upto):
        return False
    return True


def get_active_pos_promotions_for_offline(company=None, pos_profile=None, warehouse=None):
    if not _wmn_pos_promotion_doctype_exists():
        return []

    rows = frappe.get_all(
        WMN_POS_PROMOTION_DOCTYPE,
        filters={"disabled": 0, "auto_apply": 1},
        fields=["name"],
        order_by="priority desc, modified desc",
        limit_page_length=0,
    )

    result = []
    for row in rows:
        promotion = frappe.get_doc(WMN_POS_PROMOTION_DOCTYPE, row.name)
        if not _wmn_promotion_is_active_for_snapshot(
            promotion,
            company=company,
            pos_profile=pos_profile,
            warehouse=warehouse,
        ):
            continue
        result.append(_wmn_pos_promotion_to_dict(promotion))
    return result


@frappe.whitelist()
def get_active_pos_promotions(company=None, pos_profile=None, warehouse=None):
    return get_active_pos_promotions_for_offline(
        company=company,
        pos_profile=pos_profile,
        warehouse=warehouse,
    )


def _wmn_normalize_promotion_results(results):
    if isinstance(results, str):
        try:
            results = frappe.parse_json(results)
        except Exception:
            results = []
    if not isinstance(results, list):
        return []

    normalized = []
    for row in results:
        if not isinstance(row, dict):
            continue
        code = str(row.get("promotion_code") or "").strip().upper()
        if not code:
            continue
        normalized.append({
            "promotion_code": code,
            "promotion_name": row.get("promotion_name") or code,
            "discount_amount": flt(row.get("discount_amount") or 0),
            "applications": max(1, cint(row.get("applications") or 1)),
            "promotion_type": row.get("promotion_type") or "",
            "invoice_level": cint(row.get("invoice_level") or 0),
        })
    return normalized


def _wmn_register_pos_promotion_redemptions(
    promotion_results,
    invoice_doctype,
    invoice_name,
    offline_id=None,
):
    results = _wmn_normalize_promotion_results(promotion_results)
    if not results:
        return []
    if not _wmn_pos_promotion_doctype_exists() or not _wmn_pos_promotion_redemption_doctype_exists():
        return []
    if invoice_doctype not in ("Sales Invoice", "POS Invoice") or not invoice_name:
        return []

    invoice = frappe.get_doc(invoice_doctype, invoice_name)
    if cint(invoice.docstatus or 0) != 1:
        frappe.throw(_("Promotion redemption can only be registered for a submitted invoice"))

    created = []
    for result in results:
        promotion_name = frappe.db.get_value(
            WMN_POS_PROMOTION_DOCTYPE,
            {"promotion_code": result["promotion_code"]},
            "name",
        )
        if not promotion_name:
            continue

        redemption_key = "{0}::{1}::{2}".format(promotion_name, invoice_doctype, invoice_name)
        existing = frappe.db.exists(
            WMN_POS_PROMOTION_REDEMPTION_DOCTYPE,
            {"redemption_key": redemption_key},
        )
        if existing:
            created.append(existing)
            continue

        redemption = frappe.get_doc({
            "doctype": WMN_POS_PROMOTION_REDEMPTION_DOCTYPE,
            "redemption_key": redemption_key,
            "promotion": promotion_name,
            "promotion_code": result["promotion_code"],
            "reference_doctype": invoice_doctype,
            "reference_name": invoice_name,
            "customer": invoice.get("customer"),
            "company": invoice.get("company"),
            "discount_amount": flt(result.get("discount_amount") or 0),
            "applications": max(1, cint(result.get("applications") or 1)),
            "redeemed_on": now_datetime(),
            "offline_id": offline_id or "",
            "is_cancelled": 0,
        })
        redemption.insert(ignore_permissions=True)
        created.append(redemption.name)

    return created


@frappe.whitelist()
def register_pos_promotion_redemptions(
    promotion_results,
    invoice_doctype,
    invoice_name,
    offline_id=None,
):
    return {
        "redemptions": _wmn_register_pos_promotion_redemptions(
            promotion_results=promotion_results,
            invoice_doctype=invoice_doctype,
            invoice_name=invoice_name,
            offline_id=offline_id,
        )
    }


def _wmn_strip_promotion_transients(invoice):
    if not isinstance(invoice, dict):
        return invoice
    for row in invoice.get("items") or []:
        if not isinstance(row, dict):
            continue
        for key in list(row.keys()):
            if key.startswith("__wmn_promotion_"):
                row.pop(key, None)
    return invoice




def _wmn_existing_fields(doctype, requested_fields):
    meta = frappe.get_meta(doctype)
    standard_fields = {"name", "parent", "parenttype", "parentfield", "idx", "docstatus", "owner", "modified"}
    return [fieldname for fieldname in requested_fields if fieldname in standard_fields or meta.has_field(fieldname)]


WMN_POS_SUPERVISOR_DOCTYPE = "WMN POS Supervisor"
WMN_POS_CASHIER_PERMISSION_DOCTYPE = "WMN POS Cashier Permission"
WMN_POS_SUPERVISOR_SETTINGS_DOCTYPE = "WMN POS Supervisor Settings"
WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE = "WMN POS Supervisor Approval"
WMN_POS_CASH_MOVEMENT_PROFILE_DOCTYPE = "WMN POS Cash Movement Profile"
WMN_POS_CASH_MOVEMENT_DOCTYPE = "WMN POS Cash Movement"


def _wmn_supervisor_doctype_exists(doctype):
    return bool(frappe.db.exists("DocType", doctype))


def _wmn_get_pos_supervisor_settings():
    defaults = frappe._dict({
        "enabled": 0,
        "require_item_discount": 1,
        "require_transaction_discount": 1,
        "require_rate_change": 1,
        "require_return": 1,
        "require_cash_in": 1,
        "require_cash_expense": 1,
        "require_cash_withdrawal": 1,
        "require_reason": 0,
        "min_pin_length": 4,
        "pin_iterations": 200000,
    })
    if not _wmn_supervisor_doctype_exists(WMN_POS_SUPERVISOR_SETTINGS_DOCTYPE):
        return defaults

    try:
        settings = frappe.get_single(WMN_POS_SUPERVISOR_SETTINGS_DOCTYPE).as_dict()
        defaults.update(settings or {})
    except Exception:
        pass

    defaults.min_pin_length = max(4, min(cint(defaults.min_pin_length or 4), 12))
    defaults.pin_iterations = max(100000, min(cint(defaults.pin_iterations or 200000), 1000000))
    return defaults


def _wmn_get_pos_cashier_permissions(pos_profile=None):
    pos_profile = str(pos_profile or "").strip()
    if not _wmn_supervisor_doctype_exists(WMN_POS_CASHIER_PERMISSION_DOCTYPE):
        return []

    fields = [
        "name",
        "cashier_user",
        "display_name",
        "enabled",
        "pos_profile",
        "allow_item_discount",
        "max_item_discount_percentage",
        "allow_transaction_discount",
        "max_transaction_discount_percentage",
        "allow_rate_change",
        "max_rate_reduction_percentage",
        "allow_return",
        "max_return_amount",
        "allow_cash_in",
        "max_cash_in_amount",
        "allow_cash_expense",
        "max_cash_expense_amount",
        "allow_cash_withdrawal",
        "max_cash_withdrawal_amount",
    ]
    rows = frappe.get_all(
        WMN_POS_CASHIER_PERMISSION_DOCTYPE,
        filters={"enabled": 1},
        fields=fields,
        limit_page_length=0,
    )

    result = []
    for row in rows:
        configured_profile = str(row.get("pos_profile") or "").strip()
        if configured_profile and pos_profile and configured_profile != pos_profile:
            continue
        for fieldname in (
            "max_item_discount_percentage",
            "max_transaction_discount_percentage",
            "max_rate_reduction_percentage",
            "max_return_amount",
            "max_cash_in_amount",
            "max_cash_expense_amount",
            "max_cash_withdrawal_amount",
        ):
            row[fieldname] = flt(row.get(fieldname) or 0)
        result.append(row)
    return result


def _wmn_get_pos_supervisor_bundle(pos_profile=None, include_hashes=False):
    settings = _wmn_get_pos_supervisor_settings()
    cashier_permissions = _wmn_get_pos_cashier_permissions(pos_profile)
    supervisors = []
    if _wmn_supervisor_doctype_exists(WMN_POS_SUPERVISOR_DOCTYPE):
        fields = [
            "name",
            "supervisor_user",
            "display_name",
            "enabled",
            "pos_profile",
            "allow_item_discount",
            "max_item_discount_percentage",
            "allow_transaction_discount",
            "max_transaction_discount_percentage",
            "allow_rate_change",
            "allow_return",
            "allow_cash_in",
            "max_cash_in_amount",
            "allow_cash_expense",
            "max_cash_expense_amount",
            "allow_cash_withdrawal",
            "max_cash_withdrawal_amount",
            "pin_configured",
            "pin_iterations",
        ]
        if include_hashes:
            fields.extend(["pin_salt", "pin_hash"])

        rows = frappe.get_all(
            WMN_POS_SUPERVISOR_DOCTYPE,
            filters={"enabled": 1},
            fields=fields,
            limit_page_length=0,
        )
        for row in rows:
            configured_profile = str(row.get("pos_profile") or "").strip()
            if configured_profile and pos_profile and configured_profile != str(pos_profile):
                continue
            supervisors.append(row)

    return {
        "pos_profile": pos_profile or "",
        "settings": settings,
        "cashier_permissions": cashier_permissions,
        "supervisors": supervisors,
    }


@frappe.whitelist()
def get_pos_supervisor_bundle(pos_profile=None):
    """Return non-secret supervisor configuration used by the online POS UI."""
    return _wmn_get_pos_supervisor_bundle(pos_profile=pos_profile, include_hashes=False)


def _wmn_hash_supervisor_pin(pin, salt_bytes, iterations):
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        str(pin).encode("utf-8"),
        salt_bytes,
        cint(iterations or 200000),
        dklen=32,
    )
    return base64.b64encode(derived).decode("ascii")


@frappe.whitelist()
def set_pos_supervisor_pin(supervisor, pin):
    if not supervisor:
        frappe.throw(_("Supervisor is required"))

    doc = frappe.get_doc(WMN_POS_SUPERVISOR_DOCTYPE, supervisor)
    if not frappe.has_permission(WMN_POS_SUPERVISOR_DOCTYPE, ptype="write", doc=doc):
        frappe.throw(_("Not permitted to change supervisor PIN"), frappe.PermissionError)

    settings = _wmn_get_pos_supervisor_settings()
    pin = str(pin or "").strip()
    if not pin.isdigit():
        frappe.throw(_("Supervisor PIN must contain digits only"))
    if len(pin) < cint(settings.min_pin_length or 4):
        frappe.throw(_("Supervisor PIN must contain at least {0} digits").format(settings.min_pin_length))
    if len(pin) > 12:
        frappe.throw(_("Supervisor PIN cannot contain more than 12 digits"))

    salt = secrets.token_bytes(16)
    iterations = cint(settings.pin_iterations or 200000)
    pin_hash = _wmn_hash_supervisor_pin(pin, salt, iterations)

    frappe.db.set_value(
        WMN_POS_SUPERVISOR_DOCTYPE,
        doc.name,
        {
            "pin_salt": base64.b64encode(salt).decode("ascii"),
            "pin_hash": pin_hash,
            "pin_iterations": iterations,
            "pin_configured": 1,
            "last_pin_change": now_datetime(),
        },
        update_modified=True,
    )
    return {"ok": 1, "supervisor": doc.name}


def _wmn_parse_supervisor_context(context):
    if not context:
        return frappe._dict()
    if isinstance(context, str):
        try:
            context = frappe.parse_json(context)
        except Exception:
            context = {}
    return frappe._dict(context if isinstance(context, dict) else {})


def _wmn_validate_supervisor_action(supervisor_doc, action, context):
    action = str(action or "").strip().upper()
    permission_fields = {
        "ITEM_DISCOUNT": "allow_item_discount",
        "TRANSACTION_DISCOUNT": "allow_transaction_discount",
        "CHANGE_RATE": "allow_rate_change",
        "RETURN": "allow_return",
        "CASH_IN": "allow_cash_in",
        "CASH_EXPENSE": "allow_cash_expense",
        "CASH_WITHDRAWAL": "allow_cash_withdrawal",
    }
    fieldname = permission_fields.get(action)
    if not fieldname:
        frappe.throw(_("Unknown supervisor action: {0}").format(action))
    if not cint(supervisor_doc.enabled or 0) or not cint(supervisor_doc.pin_configured or 0):
        frappe.throw(_("Supervisor is disabled or has no PIN configured"))
    if not cint(supervisor_doc.get(fieldname) or 0):
        frappe.throw(_("Supervisor is not permitted to approve this action"))

    current_profile = str(context.get("pos_profile") or "").strip()
    configured_profile = str(supervisor_doc.pos_profile or "").strip()
    if configured_profile and current_profile and configured_profile != current_profile:
        frappe.throw(_("Supervisor is not assigned to the current POS Profile"))

    after_value = abs(flt(context.get("after_value") or 0))
    if action == "ITEM_DISCOUNT":
        maximum = flt(supervisor_doc.max_item_discount_percentage or 0)
        if maximum > 0 and after_value > maximum + 0.000001:
            frappe.throw(_("Maximum item discount for this supervisor is {0}%").format(maximum))
    elif action == "TRANSACTION_DISCOUNT":
        maximum = flt(supervisor_doc.max_transaction_discount_percentage or 0)
        if maximum > 0 and after_value > maximum + 0.000001:
            frappe.throw(_("Maximum transaction discount for this supervisor is {0}%").format(maximum))
    elif action in ("CASH_IN", "CASH_EXPENSE", "CASH_WITHDRAWAL"):
        maximum_field = {
            "CASH_IN": "max_cash_in_amount",
            "CASH_EXPENSE": "max_cash_expense_amount",
            "CASH_WITHDRAWAL": "max_cash_withdrawal_amount",
        }[action]
        maximum = flt(supervisor_doc.get(maximum_field) or 0)
        if maximum > 0 and after_value > maximum + 0.000001:
            frappe.throw(_("Maximum amount for this supervisor is {0}").format(maximum))

    settings = _wmn_get_pos_supervisor_settings()
    if cint(settings.require_reason or 0) and not str(context.get("reason") or "").strip():
        frappe.throw(_("Approval reason is required"))


def _wmn_insert_supervisor_approval(supervisor_user, action, context, offline_approval=False, offline_approval_id=None):
    if not _wmn_supervisor_doctype_exists(WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE):
        return None

    approval_id = str(offline_approval_id or "").strip() or "SUP-ON-" + frappe.generate_hash(length=20)
    existing = frappe.db.exists(WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE, {"offline_approval_id": approval_id})
    if existing:
        return existing

    row = frappe.get_doc({
        "doctype": WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE,
        "posting_datetime": now_datetime(),
        "status": "Approved",
        "action": str(action or "").strip().upper(),
        "cashier_user": context.get("cashier_user") or frappe.session.user,
        "supervisor_user": supervisor_user,
        "pos_profile": context.get("pos_profile") or "",
        "invoice_doctype": context.get("invoice_doctype") or "",
        "invoice_name": context.get("invoice_name") or "",
        "offline_invoice_id": context.get("offline_invoice_id") or "",
        "offline_approval_id": approval_id,
        "item_code": context.get("item_code") or "",
        "row_name": context.get("row_name") or "",
        "before_value": "" if context.get("before_value") is None else str(context.get("before_value")),
        "after_value": "" if context.get("after_value") is None else str(context.get("after_value")),
        "reason": context.get("reason") or "",
        "offline_approval": 1 if offline_approval else 0,
    })
    row.insert(ignore_permissions=True)
    return row.name


@frappe.whitelist()
def verify_pos_supervisor_pin(supervisor, pin, action, context=None):
    settings = _wmn_get_pos_supervisor_settings()
    if not cint(settings.enabled or 0):
        frappe.throw(_("POS Supervisor Authorization is disabled"))

    context = _wmn_parse_supervisor_context(context)
    context.cashier_user = frappe.session.user
    supervisor_doc = frappe.get_doc(WMN_POS_SUPERVISOR_DOCTYPE, supervisor)
    _wmn_validate_supervisor_action(supervisor_doc, action, context)

    pin = str(pin or "").strip()
    if not pin or not supervisor_doc.pin_salt or not supervisor_doc.pin_hash:
        frappe.throw(_("Invalid supervisor PIN"))

    try:
        salt = base64.b64decode(supervisor_doc.pin_salt)
    except Exception:
        frappe.throw(_("Supervisor PIN configuration is invalid"))

    derived = _wmn_hash_supervisor_pin(pin, salt, supervisor_doc.pin_iterations or settings.pin_iterations)
    if not hmac.compare_digest(derived, str(supervisor_doc.pin_hash or "")):
        frappe.throw(_("Invalid supervisor PIN"))

    approval_name = _wmn_insert_supervisor_approval(
        supervisor_user=supervisor_doc.supervisor_user,
        action=action,
        context=context,
        offline_approval=False,
    )
    return {
        "approved": True,
        "required": True,
        "offline": False,
        "action": str(action or "").strip().upper(),
        "supervisor_user": supervisor_doc.supervisor_user,
        "cashier_user": frappe.session.user,
        "approval_name": approval_name,
    }


def _wmn_register_offline_supervisor_approvals(approvals, invoice_doctype, invoice_name, offline_invoice_id):
    if not approvals or not _wmn_supervisor_doctype_exists(WMN_POS_SUPERVISOR_DOCTYPE):
        return

    for approval in approvals:
        if not isinstance(approval, dict):
            continue
        supervisor_user = str(approval.get("supervisor_user") or "").strip()
        action = str(approval.get("action") or "").strip().upper()
        if not supervisor_user or not action:
            continue

        supervisor_name = frappe.db.exists(WMN_POS_SUPERVISOR_DOCTYPE, {"supervisor_user": supervisor_user})
        if not supervisor_name:
            continue

        supervisor_doc = frappe.get_doc(WMN_POS_SUPERVISOR_DOCTYPE, supervisor_name)
        context = frappe._dict({
            "cashier_user": approval.get("cashier_user") or "",
            "pos_profile": approval.get("pos_profile") or "",
            "invoice_doctype": invoice_doctype,
            "invoice_name": invoice_name,
            "offline_invoice_id": offline_invoice_id,
            "item_code": approval.get("item_code") or "",
            "row_name": approval.get("row_name") or "",
            "before_value": approval.get("before_value"),
            "after_value": approval.get("after_value"),
            "reason": approval.get("reason") or "",
        })

        try:
            _wmn_validate_supervisor_action(supervisor_doc, action, context)
        except Exception:
            continue

        _wmn_insert_supervisor_approval(
            supervisor_user=supervisor_user,
            action=action,
            context=context,
            offline_approval=True,
            offline_approval_id=approval.get("offline_approval_id"),
        )

def _wmn_get_mode_of_payment_company_account(mode_of_payment, company):
    mode_of_payment = str(mode_of_payment or "").strip()
    company = str(company or "").strip()
    if not mode_of_payment or not company:
        return frappe._dict()

    # Use ERPNext's own Mode of Payment resolver so POS Cash Movement
    # follows the same enabled/company/default-account rules as POS invoices.
    from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_mode_of_payment_info

    rows = get_mode_of_payment_info(mode_of_payment, company) or []
    if not rows:
        return frappe._dict()

    row = frappe._dict(rows[0])
    return frappe._dict({
        "mode_of_payment": mode_of_payment,
        "type": str(row.get("type") or "").strip(),
        "enabled": 1,
        "account": str(row.get("default_account") or "").strip(),
    })


def _wmn_get_pos_cash_modes(pos_profile):
    pos_profile = str(pos_profile or "").strip()
    if not pos_profile:
        return []

    profile = frappe.get_cached_doc("POS Profile", pos_profile)
    company = profile.company
    result = []
    seen = set()

    for row in getattr(profile, "payments", []) or []:
        mode_of_payment = str(row.mode_of_payment or "").strip()
        if not mode_of_payment or mode_of_payment in seen:
            continue
        seen.add(mode_of_payment)

        details = _wmn_get_mode_of_payment_company_account(mode_of_payment, company)
        if not details or not cint(details.enabled or 0) or details.type != "Cash" or not details.account:
            continue

        result.append({
            "mode_of_payment": mode_of_payment,
            "type": "Cash",
            "account": details.account,
            "default": cint(getattr(row, "default", 0) or 0),
        })

    return result


def _wmn_validate_pos_cash_mode(pos_profile, company, mode_of_payment):
    mode_of_payment = str(mode_of_payment or "").strip()
    if not mode_of_payment:
        frappe.throw(_("Mode of Payment is required for POS Cash Movement"))

    for row in _wmn_get_pos_cash_modes(pos_profile):
        if row.get("mode_of_payment") == mode_of_payment:
            details = frappe._dict(row)
            account_details = _wmn_validate_cash_movement_account(details.account, company, expected_root_type="Asset")
            details["account_details"] = account_details
            return details

    frappe.throw(
        _("Mode of Payment {0} is not an enabled Cash payment method with a Company account in POS Profile {1}").format(
            mode_of_payment, pos_profile
        )
    )


def _wmn_get_cash_movement_profile(pos_profile):
    pos_profile = str(pos_profile or "").strip()
    if not pos_profile or not _wmn_supervisor_doctype_exists(WMN_POS_CASH_MOVEMENT_PROFILE_DOCTYPE):
        return frappe._dict()

    name = frappe.db.exists(WMN_POS_CASH_MOVEMENT_PROFILE_DOCTYPE, {"pos_profile": pos_profile, "enabled": 1})
    if not name:
        return frappe._dict()

    doc = frappe.get_cached_doc(WMN_POS_CASH_MOVEMENT_PROFILE_DOCTYPE, name)
    profile = frappe.get_cached_doc("POS Profile", pos_profile)
    company = profile.company
    currency = frappe.get_cached_value("Company", company, "default_currency")
    cost_center = doc.cost_center or getattr(profile, "cost_center", None) or frappe.db.get_value("Company", company, "cost_center")

    return frappe._dict({
        "name": doc.name,
        "enabled": cint(doc.enabled or 0),
        "pos_profile": pos_profile,
        "company": company,
        "currency": currency,
        "cash_modes": _wmn_get_pos_cash_modes(pos_profile),
        "cash_in_offset_account": doc.cash_in_offset_account,
        "default_expense_account": doc.default_expense_account,
        "withdrawal_offset_account": doc.withdrawal_offset_account,
        "cost_center": cost_center,
    })


def _wmn_cash_movement_action(movement_type):
    return {
        "Cash In": "CASH_IN",
        "Cash Expense": "CASH_EXPENSE",
        "Cash Withdrawal": "CASH_WITHDRAWAL",
    }.get(str(movement_type or "").strip(), "")


def _wmn_get_cashier_permission_for_user(cashier_user, pos_profile):
    cashier_user = str(cashier_user or "").strip()
    pos_profile = str(pos_profile or "").strip()
    if not cashier_user:
        return frappe._dict()

    specific = None
    generic = None
    for row in _wmn_get_pos_cashier_permissions(pos_profile):
        if str(row.get("cashier_user") or "").strip() != cashier_user:
            continue
        configured = str(row.get("pos_profile") or "").strip()
        if configured and configured == pos_profile:
            specific = row
            break
        if not configured and generic is None:
            generic = row
    return frappe._dict(specific or generic or {})


def _wmn_validate_cashier_cash_movement(cashier_user, pos_profile, action, amount):
    settings = _wmn_get_pos_supervisor_settings()
    control_field = {
        "CASH_IN": "require_cash_in",
        "CASH_EXPENSE": "require_cash_expense",
        "CASH_WITHDRAWAL": "require_cash_withdrawal",
    }.get(action)
    if not cint(settings.enabled or 0) or not control_field or not cint(settings.get(control_field) or 0):
        return True

    permission = _wmn_get_cashier_permission_for_user(cashier_user, pos_profile)
    allow_field = {
        "CASH_IN": "allow_cash_in",
        "CASH_EXPENSE": "allow_cash_expense",
        "CASH_WITHDRAWAL": "allow_cash_withdrawal",
    }[action]
    limit_field = {
        "CASH_IN": "max_cash_in_amount",
        "CASH_EXPENSE": "max_cash_expense_amount",
        "CASH_WITHDRAWAL": "max_cash_withdrawal_amount",
    }[action]

    if not permission or not cint(permission.get("enabled") or 0) or not cint(permission.get(allow_field) or 0):
        return False

    maximum = flt(permission.get(limit_field) or 0)
    return not (maximum > 0 and flt(amount) > maximum + 0.000001)


def _wmn_validate_cash_movement_account(account, company, expected_root_type=None):
    details = frappe.db.get_value(
        "Account",
        account,
        ["company", "is_group", "root_type", "account_currency", "account_type"],
        as_dict=True,
    )
    if not details:
        frappe.throw(_("Account {0} was not found").format(account))
    if details.company != company:
        frappe.throw(_("Account {0} does not belong to Company {1}").format(account, company))
    if cint(details.is_group or 0):
        frappe.throw(_("Account {0} must be a ledger account").format(account))
    if details.account_type in ("Receivable", "Payable"):
        frappe.throw(
            _("Account {0} is a {1} account. POS Cash Movement requires a non-party ledger account.").format(
                account, details.account_type
            )
        )
    if expected_root_type and details.root_type != expected_root_type:
        frappe.throw(_("Account {0} must be a {1} account").format(account, expected_root_type))
    return details


def _wmn_get_cash_movement_summary(pos_opening_entry):
    summary = {
        "cash_in": 0.0,
        "cash_expense": 0.0,
        "cash_withdrawal": 0.0,
        "net_cash_movement": 0.0,
        "count": 0,
        "by_mode_of_payment": {},
    }
    if not pos_opening_entry or not _wmn_supervisor_doctype_exists(WMN_POS_CASH_MOVEMENT_DOCTYPE):
        return summary

    rows = frappe.get_all(
        WMN_POS_CASH_MOVEMENT_DOCTYPE,
        filters={"pos_opening_entry": pos_opening_entry, "docstatus": 1},
        fields=["movement_type", "amount", "mode_of_payment", "cash_account"],
        limit_page_length=0,
    )
    for row in rows:
        amount = flt(row.amount or 0)
        mode_of_payment = str(row.mode_of_payment or "").strip() or _("Unspecified")
        mode_summary = summary["by_mode_of_payment"].setdefault(
            mode_of_payment,
            {
                "mode_of_payment": mode_of_payment,
                "cash_account": str(row.cash_account or "").strip(),
                "cash_in": 0.0,
                "cash_expense": 0.0,
                "cash_withdrawal": 0.0,
                "net_cash_movement": 0.0,
                "count": 0,
            },
        )
        if not mode_summary.get("cash_account") and row.cash_account:
            mode_summary["cash_account"] = row.cash_account

        if row.movement_type == "Cash In":
            summary["cash_in"] += amount
            mode_summary["cash_in"] += amount
        elif row.movement_type == "Cash Expense":
            summary["cash_expense"] += amount
            mode_summary["cash_expense"] += amount
        elif row.movement_type == "Cash Withdrawal":
            summary["cash_withdrawal"] += amount
            mode_summary["cash_withdrawal"] += amount

        summary["count"] += 1
        mode_summary["count"] += 1

    summary["net_cash_movement"] = summary["cash_in"] - summary["cash_expense"] - summary["cash_withdrawal"]
    for mode_summary in summary["by_mode_of_payment"].values():
        mode_summary["net_cash_movement"] = (
            flt(mode_summary["cash_in"])
            - flt(mode_summary["cash_expense"])
            - flt(mode_summary["cash_withdrawal"])
        )
    return summary


def _wmn_validate_cash_movement_approval(payload, action, cashier_user, pos_profile, amount, movement_name=""):
    approval = payload.get("supervisor_approval") or {}
    if isinstance(approval, str):
        try:
            approval = frappe.parse_json(approval)
        except Exception:
            approval = {}
    approval = approval if isinstance(approval, dict) else {}

    if not approval or not approval.get("required"):
        if _wmn_validate_cashier_cash_movement(cashier_user, pos_profile, action, amount):
            return None
        frappe.throw(_("Supervisor authorization is required for this cash movement"))

    if approval.get("offline"):
        supervisor_user = str(approval.get("supervisor_user") or "").strip()
        supervisor_name = frappe.db.exists(WMN_POS_SUPERVISOR_DOCTYPE, {"supervisor_user": supervisor_user})
        if not supervisor_name:
            frappe.throw(_("Supervisor was not found"))
        supervisor_doc = frappe.get_doc(WMN_POS_SUPERVISOR_DOCTYPE, supervisor_name)
        context = frappe._dict({
            "cashier_user": cashier_user,
            "pos_profile": pos_profile,
            "invoice_doctype": WMN_POS_CASH_MOVEMENT_DOCTYPE,
            "invoice_name": movement_name,
            "offline_invoice_id": payload.get("offline_id") or "",
            "before_value": "",
            "after_value": amount,
            "reason": approval.get("reason") or payload.get("reason") or "",
        })
        _wmn_validate_supervisor_action(supervisor_doc, action, context)
        return _wmn_insert_supervisor_approval(
            supervisor_user=supervisor_user,
            action=action,
            context=context,
            offline_approval=True,
            offline_approval_id=approval.get("offline_approval_id"),
        )

    approval_name = str(approval.get("approval_name") or "").strip()
    if not approval_name or not frappe.db.exists(WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE, approval_name):
        frappe.throw(_("Valid supervisor approval was not found"))

    approval_doc = frappe.get_doc(WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE, approval_name)
    if str(approval_doc.action or "").upper() != action:
        frappe.throw(_("Supervisor approval does not match this action"))
    if approval_doc.cashier_user and approval_doc.cashier_user != cashier_user:
        frappe.throw(_("Supervisor approval belongs to another cashier"))
    if approval_doc.pos_profile and approval_doc.pos_profile != pos_profile:
        frappe.throw(_("Supervisor approval belongs to another POS Profile"))
    if approval_doc.invoice_name and approval_doc.invoice_name != movement_name:
        frappe.throw(_("Supervisor approval is already linked to another transaction"))
    if abs(flt(approval_doc.after_value or 0) - flt(amount)) > 0.000001:
        frappe.throw(_("Supervisor approval amount does not match this cash movement"))
    frappe.db.set_value(
        WMN_POS_SUPERVISOR_APPROVAL_DOCTYPE,
        approval_doc.name,
        {
            "invoice_doctype": WMN_POS_CASH_MOVEMENT_DOCTYPE,
            "invoice_name": movement_name,
            "offline_invoice_id": payload.get("offline_id") or "",
        },
        update_modified=False,
    )
    return approval_doc.name


def _wmn_create_pos_cash_movement(payload, offline_created=False):
    if isinstance(payload, str):
        payload = frappe.parse_json(payload)
    payload = frappe._dict(payload or {})

    movement_type = str(payload.get("movement_type") or "").strip()
    action = _wmn_cash_movement_action(movement_type)
    if not action:
        frappe.throw(_("Invalid Cash Movement Type"))

    amount = flt(payload.get("amount") or 0)
    if amount <= 0:
        frappe.throw(_("Cash Movement Amount must be greater than zero"))

    reason = str(payload.get("reason") or "").strip()
    if not reason:
        frappe.throw(_("Reason is required"))

    pos_profile = str(payload.get("pos_profile") or "").strip()
    pos_opening_entry = str(payload.get("pos_opening_entry") or "").strip()
    if not pos_profile or not pos_opening_entry:
        frappe.throw(_("POS Profile and POS Opening Entry are required"))

    offline_id = str(payload.get("offline_id") or "").strip()
    if offline_id:
        existing = frappe.db.exists(WMN_POS_CASH_MOVEMENT_DOCTYPE, {"offline_id": offline_id})
        if existing:
            doc = frappe.get_doc(WMN_POS_CASH_MOVEMENT_DOCTYPE, existing)
            return {
                "name": doc.name,
                "docstatus": doc.docstatus,
                "journal_entry": doc.journal_entry,
                "offline_id": offline_id,
                "summary": _wmn_get_cash_movement_summary(doc.pos_opening_entry),
            }

    opening = frappe.get_doc("POS Opening Entry", pos_opening_entry)
    if opening.docstatus != 1 or getattr(opening, "pos_closing_entry", None):
        frappe.throw(_("POS Opening Entry is not open"))
    if opening.pos_profile != pos_profile:
        frappe.throw(_("POS Opening Entry does not belong to the selected POS Profile"))

    cashier_user = str(payload.get("cashier_user") or frappe.session.user).strip()
    if cashier_user != opening.user:
        frappe.throw(_("Cashier does not match the POS Opening Entry"))
    if not offline_created and cashier_user != frappe.session.user:
        frappe.throw(_("Current user does not own the POS Opening Entry"))

    config = _wmn_get_cash_movement_profile(pos_profile)
    if not config or not cint(config.enabled or 0):
        frappe.throw(_("WMN POS Cash Movement Profile is not configured for POS Profile {0}").format(pos_profile))

    company = opening.company or config.company
    if company != config.company:
        frappe.throw(_("Cash Movement configuration belongs to another Company"))

    currency = config.currency or frappe.get_cached_value("Company", company, "default_currency")
    mode_of_payment = str(payload.get("mode_of_payment") or "").strip()
    cash_mode = _wmn_validate_pos_cash_mode(pos_profile, company, mode_of_payment)
    cash_account = cash_mode.account
    if movement_type == "Cash In":
        offset_account = config.cash_in_offset_account
    elif movement_type == "Cash Expense":
        offset_account = config.default_expense_account
    else:
        offset_account = config.withdrawal_offset_account

    cash_details = cash_mode.account_details
    offset_details = _wmn_validate_cash_movement_account(
        offset_account,
        company,
        expected_root_type="Expense" if movement_type == "Cash Expense" else None,
    )
    for details, account in ((cash_details, cash_account), (offset_details, offset_account)):
        if details.account_currency and currency and details.account_currency != currency:
            frappe.throw(_("Account {0} currency must be {1}").format(account, currency))

    now_dt = now_datetime()
    posting_date = getdate(payload.get("posting_date") or now_dt.date())
    posting_time = str(payload.get("posting_time") or now_dt.time()).split(".")[0]
    if posting_date < getdate(opening.posting_date):
        frappe.throw(_("Cash Movement cannot be dated before the POS Opening Entry"))

    movement = frappe.get_doc({
        "doctype": WMN_POS_CASH_MOVEMENT_DOCTYPE,
        "movement_type": movement_type,
        "amount": amount,
        "currency": currency,
        "status": "Posted",
        "company": company,
        "pos_profile": pos_profile,
        "pos_opening_entry": pos_opening_entry,
        "cashier_user": cashier_user,
        "mode_of_payment": mode_of_payment,
        "posting_date": posting_date,
        "posting_time": posting_time,
        "cash_account": cash_account,
        "offset_account": offset_account,
        "cost_center": config.cost_center,
        "reason": reason,
        "reference_no": str(payload.get("reference_no") or "").strip(),
        "offline_id": offline_id or "POS-CASH-" + frappe.generate_hash(length=20),
        "offline_created": 1 if offline_created else 0,
    })
    movement.insert(ignore_permissions=True)

    approval_name = _wmn_validate_cash_movement_approval(
        payload,
        action,
        cashier_user,
        pos_profile,
        amount,
        movement.name,
    )

    cost_center = config.cost_center
    debit_row = None
    credit_row = None
    if movement_type == "Cash In":
        debit_row = {"account": cash_account, "debit_in_account_currency": amount}
        credit_row = {"account": offset_account, "credit_in_account_currency": amount}
    else:
        debit_row = {"account": offset_account, "debit_in_account_currency": amount}
        credit_row = {"account": cash_account, "credit_in_account_currency": amount}

    if cost_center:
        if (movement_type == "Cash Expense") or offset_details.root_type in ("Expense", "Income"):
            if debit_row["account"] == offset_account:
                debit_row["cost_center"] = cost_center
            if credit_row["account"] == offset_account:
                credit_row["cost_center"] = cost_center
        if cash_details.root_type in ("Expense", "Income"):
            if debit_row["account"] == cash_account:
                debit_row["cost_center"] = cost_center
            if credit_row["account"] == cash_account:
                credit_row["cost_center"] = cost_center

    journal_entry = frappe.get_doc({
        "doctype": "Journal Entry",
        "voucher_type": "Cash Entry",
        "company": company,
        "posting_date": posting_date,
        "user_remark": _("POS {0}: {1}").format(movement_type, reason),
        "accounts": [debit_row, credit_row],
    })
    journal_entry.insert(ignore_permissions=True)
    journal_entry.submit()

    movement.db_set("journal_entry", journal_entry.name, update_modified=False)
    if approval_name:
        movement.db_set("supervisor_approval", approval_name, update_modified=False)
    movement.submit()

    return {
        "name": movement.name,
        "docstatus": movement.docstatus,
        "journal_entry": journal_entry.name,
        "offline_id": movement.offline_id,
        "supervisor_approval": approval_name or "",
        "summary": _wmn_get_cash_movement_summary(pos_opening_entry),
    }


@frappe.whitelist()
def get_pos_cash_movement_context(pos_profile=None, pos_opening_entry=None):
    config = _wmn_get_cash_movement_profile(pos_profile)
    return {
        "config": config,
        "summary": _wmn_get_cash_movement_summary(pos_opening_entry),
        "pos_opening_entry": pos_opening_entry or "",
    }


@frappe.whitelist()
def create_pos_cash_movement(movement):
    return _wmn_create_pos_cash_movement(movement, offline_created=False)


@frappe.whitelist()
def sync_offline_pos_cash_movement(movement):
    return _wmn_create_pos_cash_movement(movement, offline_created=True)



def _wmn_get_customer_pos_purchase_summary(company, default_customer=None):
    """Return compact POS purchase flags for customer-selection safety.

    One grouped query is used for the whole company. All customers configured as
    POS Profile defaults are excluded because they represent general sales, not
    individual customer purchase history.
    """
    if not company:
        return {}

    excluded_customers = {
        str(default_customer or "").strip(),
    }
    for row in frappe.get_all(
        "POS Profile",
        filters={"company": company},
        fields=["customer"],
        limit_page_length=0,
    ):
        customer = str(row.get("customer") or "").strip()
        if customer:
            excluded_customers.add(customer)
    excluded_customers.discard("")

    params = [company]
    exclusion_filter = ""
    if excluded_customers:
        placeholders = ", ".join(["%s"] * len(excluded_customers))
        exclusion_filter = f" and customer not in ({placeholders})"
        params.extend(sorted(excluded_customers))

    rows = frappe.db.sql(
        """
        select
            customer,
            count(name) as pos_purchase_count,
            max(posting_date) as last_pos_purchase_date
        from `tabSales Invoice`
        where docstatus = 1
          and ifnull(is_pos, 0) = 1
          and ifnull(is_return, 0) = 0
          and company = %s
          and ifnull(customer, '') != ''
          {exclusion_filter}
        group by customer
        """.format(exclusion_filter=exclusion_filter),
        tuple(params),
        as_dict=True,
    )

    return {
        row.customer: {
            "pos_purchase_count": cint(row.pos_purchase_count or 0),
            "has_pos_purchase": 1 if cint(row.pos_purchase_count or 0) > 0 else 0,
            "last_pos_purchase_date": str(row.last_pos_purchase_date or ""),
        }
        for row in rows
        if row.get("customer")
    }


def _wmn_customer_group_contains(group_name, customer_group):
    """Return whether ``customer_group`` belongs to the configured group tree."""
    group_name = str(group_name or "").strip()
    customer_group = str(customer_group or "").strip()
    if not group_name or not customer_group:
        return False
    if group_name == customer_group:
        return True

    bounds = frappe.db.get_value("Customer Group", group_name, ["lft", "rgt"], as_dict=True)
    customer_bounds = frappe.db.get_value("Customer Group", customer_group, ["lft", "rgt"], as_dict=True)
    if not bounds or not customer_bounds:
        return False
    return cint(customer_bounds.lft or 0) >= cint(bounds.lft or 0) and cint(customer_bounds.rgt or 0) <= cint(bounds.rgt or 0)


def validate_wmn_pos_promotion_cumulative(doc, method=None):
    """Validate cumulative WMN Promotion scope without scanning sales history.

    Cumulative promotions in WMN POS are customer-targeted backend summaries.
    General-sales default customers must never enter that scope.
    """
    if not cint(doc.get("is_cumulative") or 0):
        return

    valid_from = doc.get("valid_from")
    valid_upto = doc.get("valid_upto")
    if not valid_from or not valid_upto:
        frappe.throw(
            _("Cumulative WMN Promotions require Valid From and Valid Upto."),
            title=_("Invalid Cumulative Promotion"),
        )
    if getdate(valid_from) > getdate(valid_upto):
        frappe.throw(
            _("Valid From cannot be after Valid Upto for a cumulative WMN Promotion."),
            title=_("Invalid Cumulative Promotion"),
        )

    target_customer = str(doc.get("customer") or "").strip()
    target_group = str(doc.get("customer_group") or "").strip()
    if not target_customer and not target_group:
        frappe.throw(
            _("A cumulative WMN Promotion must target a Customer or Customer Group."),
            title=_("Invalid Cumulative Promotion"),
        )

    profile_filters = {}
    company = str(doc.get("company") or "").strip()
    pos_profile = str(doc.get("pos_profile") or "").strip()
    if company:
        profile_filters["company"] = company
    if pos_profile:
        profile_filters["name"] = pos_profile

    default_customers = [
        str(row.customer or "").strip()
        for row in frappe.get_all(
            "POS Profile",
            filters=profile_filters,
            fields=["name", "customer"],
            limit_page_length=0,
        )
        if row.get("customer")
    ]
    if not default_customers:
        return

    if target_customer and target_customer in default_customers:
        frappe.throw(
            _("POS Profile Default Customer {0} cannot be targeted by a cumulative WMN Promotion.").format(
                frappe.bold(target_customer)
            ),
            title=_("Invalid Cumulative Promotion"),
        )

    if target_group:
        default_groups = frappe.get_all(
            "Customer",
            filters={"name": ["in", default_customers]},
            fields=["name", "customer_group"],
            limit_page_length=0,
        )
        for row in default_groups:
            if _wmn_customer_group_contains(target_group, row.get("customer_group")):
                frappe.throw(
                    _("Customer Group {0} includes POS Profile Default Customer {1} and cannot be used by a cumulative WMN Promotion.").format(
                        frappe.bold(target_group),
                        frappe.bold(row.name),
                    ),
                    title=_("Invalid Cumulative Promotion"),
                )


def validate_pos_profile_default_customer_cumulative(doc, method=None):
    """Reject a POS Profile default customer that is targeted by a cumulative WMN promotion.

    This function is intended for the POS Profile ``validate`` doc_event. It is
    metadata-aware so deployments that have not yet added the cumulative field
    are not broken by the validation helper itself.
    """
    default_customer = str(doc.get("customer") or "").strip()
    if not default_customer or not _wmn_pos_promotion_doctype_exists():
        return

    meta = frappe.get_meta(WMN_POS_PROMOTION_DOCTYPE)
    fieldnames = {df.fieldname for df in (meta.fields or []) if df.fieldname}
    if "is_cumulative" not in fieldnames:
        return

    wanted_fields = [
        "name", "promotion_name", "company", "pos_profile", "customer",
        "customer_group", "valid_from", "valid_upto",
    ]
    fields = [field for field in wanted_fields if field == "name" or field in fieldnames]
    filters = {"is_cumulative": 1}
    if "disabled" in fieldnames:
        filters["disabled"] = 0

    today_date = getdate(today())
    default_customer_group = frappe.get_cached_value("Customer", default_customer, "customer_group") or ""
    profile_company = str(doc.get("company") or "").strip()
    profile_name = str(doc.get("name") or "").strip()

    for promotion in frappe.get_all(
        WMN_POS_PROMOTION_DOCTYPE,
        filters=filters,
        fields=fields,
        limit_page_length=0,
    ):
        if promotion.get("company") and profile_company and promotion.company != profile_company:
            continue
        if promotion.get("pos_profile") and profile_name and promotion.pos_profile != profile_name:
            continue
        if promotion.get("valid_from") and today_date < getdate(promotion.valid_from):
            continue
        if promotion.get("valid_upto") and today_date > getdate(promotion.valid_upto):
            continue

        target_customer = str(promotion.get("customer") or "").strip()
        target_group = str(promotion.get("customer_group") or "").strip()
        customer_matches = bool(target_customer and target_customer == default_customer)
        group_matches = bool(
            target_group
            and default_customer_group
            and _wmn_customer_group_contains(target_group, default_customer_group)
        )
        targets_all_customers = not target_customer and not target_group

        if customer_matches or group_matches or targets_all_customers:
            label = promotion.get("promotion_name") or promotion.get("name")
            frappe.throw(
                _("Default Customer {0} cannot be targeted by cumulative WMN Promotion {1}.").format(
                    frappe.bold(default_customer),
                    frappe.bold(label),
                ),
                title=_("Invalid POS Profile Default Customer"),
            )

@frappe.whitelist()
def get_pos_offline_data(pos_profile=None, price_list=None, warehouse=None):
    if not pos_profile:
        frappe.throw(_("POS Profile is required"))

    profile = frappe.get_doc("POS Profile", pos_profile)
    validate_pos_profile_default_customer_cumulative(profile)
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
        mode_of_payment = str(row.mode_of_payment or "").strip()
        if not mode_of_payment:
            continue
        mop_details = _wmn_get_mode_of_payment_company_account(mode_of_payment, company)
        payment_methods.append({
            "mode_of_payment": mode_of_payment,
            "default": cint(row.default or 0),
            "allow_in_returns": cint(getattr(row, "allow_in_returns", 0) or 0),
            "account": mop_details.account or "",
            "type": mop_details.type or "",
            "enabled": cint(mop_details.enabled or 0),
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

    default_customer = str(getattr(profile, "customer", None) or "").strip()
    purchase_summary = _wmn_get_customer_pos_purchase_summary(company, default_customer)
    for customer in customers:
        customer_name = str(customer.get("name") or "").strip()
        summary = purchase_summary.get(customer_name, {}) if customer_name != default_customer else {}
        customer["pos_purchase_count"] = cint(summary.get("pos_purchase_count") or 0)
        customer["has_pos_purchase"] = cint(summary.get("has_pos_purchase") or 0)
        customer["last_pos_purchase_date"] = summary.get("last_pos_purchase_date") or ""

    company_defaults = frappe.db.get_value(
        "Company",
        company,
        ["default_currency", "default_receivable_account", "cost_center"],
        as_dict=True,
    ) or {}
    company_currency = company_defaults.get("default_currency") or profile_dict.get("currency") or ""
    default_receivable_account = company_defaults.get("default_receivable_account") or ""
    company_cost_center = company_defaults.get("cost_center") or ""

    customer_names = [row.name for row in customers if row.get("name")]
    party_account_map = {}
    if customer_names:
        for row in frappe.get_all(
            "Party Account",
            filters={
                "parenttype": "Customer",
                "parent": ["in", customer_names],
                "company": company,
            },
            fields=["parent", "account"],
            limit_page_length=0,
        ):
            if row.get("parent") and row.get("account") and row.parent not in party_account_map:
                party_account_map[row.parent] = row.account

    for c in customers:
        c["payment_terms_template"] = c.get("payment_terms")
        account = party_account_map.get(c.name) or default_receivable_account
        c["debit_to"] = account
        c["party_account"] = account
        c["party_account_currency"] = company_currency

    item_fields = [
        "name", "item_code", "item_name", "item_group", "stock_uom", "sales_uom", "description",
        "image", "disabled", "is_stock_item", "has_batch_no", "has_serial_no",
        "brand", "variant_of", "has_variants", "default_item_manufacturer",
        "default_manufacturer_part_no", "allow_negative_stock", "max_discount",
    ]

    item_filters = {"disabled": 0, "is_sales_item": 1}
    allowed_item_groups = get_pos_profile_item_groups(profile) or []
    if allowed_item_groups:
        item_filters["item_group"] = ["in", allowed_item_groups]

    items = frappe.get_all(
        "Item",
        filters=item_filters,
        fields=item_fields,
        limit_page_length=0,
    )

    item_codes = [it.name for it in items]

    item_defaults = {}
    if item_codes:
        for row in frappe.get_all(
            "Item Default",
            filters={"company": company, "parent": ["in", item_codes]},
            fields=[
                "parent", "default_warehouse", "income_account", "expense_account",
                "buying_cost_center", "selling_cost_center",
            ],
            limit_page_length=0,
        ):
            item_defaults[row.parent] = row

    item_tax_template_map = {}
    item_tax_rate_map = {}

    if item_codes:
        item_tax_rows = frappe.get_all(
            "Item Tax",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "item_tax_template"],
            order_by="parent asc, idx asc",
            limit_page_length=0,
        )
        for row in item_tax_rows:
            if row.get("parent") and row.get("item_tax_template") and row.parent not in item_tax_template_map:
                item_tax_template_map[row.parent] = row.item_tax_template

        tax_templates = sorted({name for name in item_tax_template_map.values() if name})
        if tax_templates:
            for row in frappe.get_all(
                "Item Tax Template Detail",
                filters={"parent": ["in", tax_templates]},
                fields=["parent", "tax_type", "tax_rate"],
                order_by="parent asc, idx asc",
                limit_page_length=0,
            ):
                if row.get("parent") and row.get("tax_type"):
                    item_tax_rate_map.setdefault(row.parent, {})[row.tax_type] = flt(row.tax_rate or 0)

    profile_cost_center = getattr(profile, "cost_center", None)
    for it in items:
        defaults = item_defaults.get(it.name) or {}
        it["uom"] = it.stock_uom
        it["warehouse"] = defaults.get("default_warehouse") or default_warehouse
        it["income_account"] = defaults.get("income_account") or getattr(profile, "income_account", None)
        it["expense_account"] = defaults.get("expense_account")
        it["cost_center"] = defaults.get("selling_cost_center") or profile_cost_center or company_cost_center

        item_tax_template = item_tax_template_map.get(it.name) or ""
        it["item_tax_template"] = item_tax_template
        it["offline_item_tax_map"] = dict(item_tax_rate_map.get(item_tax_template) or {})
    uom_conversion_map = {}
    variant_attribute_map = {}

    if item_codes:
        for row in frappe.get_all(
            "UOM Conversion Detail",
            filters={"parent": ["in", item_codes]},
            fields=["parent", "uom", "conversion_factor", "idx"],
            order_by="parent asc, idx asc",
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

    active_price_rows_by_item = {}
    if item_codes and selling_price_list:
        current_date = getdate(today())
        for row in frappe.get_all(
            "Item Price",
            filters={
                "item_code": ["in", item_codes],
                "price_list": selling_price_list,
                "selling": 1,
            },
            fields=[
                "name", "item_code", "price_list", "price_list_rate", "currency",
                "uom", "batch_no", "selling", "valid_from", "valid_upto", "modified",
            ],
            order_by="item_code asc, valid_from desc, modified desc",
            limit_page_length=0,
        ):
            if row.get("valid_from") and getdate(row.valid_from) > current_date:
                continue
            if row.get("valid_upto") and getdate(row.valid_upto) < current_date:
                continue
            active_price_rows_by_item.setdefault(row.item_code, []).append(row)

    compact_item_prices = []
    for it in items:
        conversions = list(uom_conversion_map.get(it.name, []))
        if it.stock_uom and not any(d.get("uom") == it.stock_uom for d in conversions):
            conversions.insert(0, {"uom": it.stock_uom, "conversion_factor": 1.0})

        it["uom_conversions"] = conversions
        it["variant_attributes"] = variant_attribute_map.get(it.name, [])
        it["uom_options"] = _wmn_build_item_uom_options(
            it,
            conversions,
            active_price_rows_by_item.get(it.name, []),
            batch_no=None,
        )

        base_option = next(
            (row for row in it["uom_options"] if row.get("uom") == it.stock_uom),
            it["uom_options"][0] if it["uom_options"] else None,
        )
        if base_option:
            it["price_list_rate"] = flt(base_option.get("price_list_rate") or 0)
            it["rate"] = flt(base_option.get("price_list_rate") or 0)
            it["currency"] = base_option.get("currency") or profile_dict.get("currency") or ""

        for option in it["uom_options"]:
            compact_item_prices.append({
                "name": "effective::{0}::{1}".format(it.name, option.get("uom") or ""),
                "item_code": it.name,
                "price_list": selling_price_list,
                "price_list_rate": flt(option.get("price_list_rate") or 0),
                "currency": option.get("currency") or profile_dict.get("currency") or "",
                "uom": option.get("uom") or it.stock_uom,
                "batch_no": "",
                "selling": 1,
                "valid_from": option.get("valid_from") or "",
                "valid_upto": option.get("valid_upto") or "",
                "modified": str(now_datetime()),
                "conversion_factor": flt(option.get("conversion_factor") or 1),
                "price_source": option.get("price_source") or "",
            })

    barcode_rows = frappe.get_all(
        "Item Barcode",
        filters={"parent": ["in", item_codes]} if item_codes else {"parent": ""},
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

    item_prices = compact_item_prices

    stock_filters = {}
    if default_warehouse:
        stock_filters["warehouse"] = default_warehouse

    stock = frappe.get_all(
        "Bin",
        filters=stock_filters,
        fields=["item_code", "warehouse", "actual_qty", "projected_qty"],
        limit_page_length=0,
    )

    # ERPNext POS availability is Bin actual_qty minus quantities reserved by
    # submitted, unconsolidated POS Invoices (including packed items). Build
    # the same reservation snapshot in two aggregate queries instead of an
    # item-by-item server loop so the offline preload remains lightweight.
    reserved_qty_map = {}
    for child_table, qty_field in (("POS Invoice Item", "stock_qty"), ("Packed Item", "qty")):
        try:
            rows = frappe.db.sql(
                f"""
                select
                    i.item_code,
                    i.warehouse,
                    coalesce(sum(i.`{qty_field}`), 0) as reserved_qty
                from `tabPOS Invoice` p
                inner join `tab{child_table}` i on i.parent = p.name
                where
                    ifnull(p.consolidated_invoice, '') = ''
                    and i.docstatus = 1
                    and i.item_code is not null
                    and i.item_code != ''
                    and i.warehouse is not null
                    and i.warehouse != ''
                    {"and i.warehouse = %s" if default_warehouse else ""}
                group by i.item_code, i.warehouse
                """,
                (default_warehouse,) if default_warehouse else (),
                as_dict=True,
            )
            for row in rows:
                key = (row.item_code, row.warehouse)
                reserved_qty_map[key] = flt(reserved_qty_map.get(key) or 0) + flt(row.reserved_qty or 0)
        except Exception:
            # Keep preload available on installations where optional tables or
            # fields differ; the server remains authoritative at sync/submit.
            continue

    for row in stock:
        reserved_qty = flt(reserved_qty_map.get((row.item_code, row.warehouse)) or 0)
        row["pos_reserved_qty"] = reserved_qty
        row["available_qty"] = flt(row.actual_qty or 0) - reserved_qty

    # Cache Product Bundle composition in the parent Item record. ERPNext POS
    # reports bundle availability even though the parent Item is non-stock.
    # Load bundle definitions and component stock flags in bulk so Offline can
    # reproduce get_stock_availability() without per-click server/database work.
    if item_codes:
        bundle_rows = frappe.get_all(
            "Product Bundle",
            filters={"new_item_code": ["in", item_codes], "disabled": 0},
            fields=["name", "new_item_code"],
            limit_page_length=0,
        )
        bundle_by_name = {row.name: row for row in bundle_rows if row.get("name")}
        bundle_item_rows = []
        if bundle_by_name:
            bundle_item_rows = frappe.get_all(
                "Product Bundle Item",
                filters={"parent": ["in", list(bundle_by_name)]},
                fields=["parent", "item_code", "qty", "uom", "idx"],
                order_by="parent asc, idx asc",
                limit_page_length=0,
            )

        component_codes = sorted({
            row.item_code for row in bundle_item_rows if row.get("item_code")
        })
        component_stock_flags = {}
        if component_codes:
            for row in frappe.get_all(
                "Item",
                filters={"name": ["in", component_codes]},
                fields=["name", "is_stock_item"],
                limit_page_length=0,
            ):
                component_stock_flags[row.name] = cint(row.is_stock_item or 0)

        bundle_components = {}
        for row in bundle_item_rows:
            if not row.get("item_code"):
                continue
            bundle_components.setdefault(row.parent, []).append({
                "item_code": row.item_code,
                "qty": flt(row.qty or 0),
                "uom": row.get("uom") or "",
                "is_stock_item": cint(component_stock_flags.get(row.item_code) or 0),
            })

        items_by_code = {row.name: row for row in items}
        for bundle_name, bundle in bundle_by_name.items():
            parent_code = bundle.get("new_item_code") or bundle_name
            item = items_by_code.get(parent_code)
            if not item:
                continue
            item["is_product_bundle"] = 1
            item["product_bundle_name"] = bundle_name
            item["product_bundle_items"] = bundle_components.get(bundle_name, [])
            item["product_bundle_reserved_by_warehouse"] = {
                warehouse_name: flt(qty or 0)
                for (reserved_item, warehouse_name), qty in reserved_qty_map.items()
                if reserved_item == parent_code
            }

    item_master_map = {it.name: it for it in items}
    batches = get_offline_batches(
        default_warehouse,
        selling_price_list,
        item_meta_map=item_master_map,
        uom_conversion_map=uom_conversion_map,
        price_rows_by_item=active_price_rows_by_item,
        item_codes=item_codes,
    )
    serial_rows = get_offline_serials(default_warehouse, item_codes=item_codes)

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
    stock_settings["allow_negative_stock_for_batch"] = cint(stock_settings.get("allow_negative_stock_for_batch") or 0)
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
        "pos_coupons": get_active_pos_coupons_for_offline(company),
        "pos_promotions": get_active_pos_promotions_for_offline(company, profile.name, default_warehouse),
        "pos_supervisor_bundle": _wmn_get_pos_supervisor_bundle(profile.name, include_hashes=True),
        "cash_movement_context": {
            "config": _wmn_get_cash_movement_profile(profile.name),
            "summary": _wmn_get_cash_movement_summary(opening_entries[0].name if opening_entries else None),
            "pos_opening_entry": opening_entries[0].name if opening_entries else "",
        },
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
def get_offline_batches(
    default_warehouse=None,
    price_list=None,
    item_meta_map=None,
    uom_conversion_map=None,
    price_rows_by_item=None,
    item_codes=None,
):
    batch_fields = ["name", "item", "batch_id", "expiry_date", "manufacturing_date", "disabled"]

    batch_meta = frappe.get_meta("Batch")
    has_barcode = batch_meta.has_field("barcode")
    if has_barcode:
        batch_fields.append("barcode")

    batch_filters = {"disabled": 0}
    if item_codes:
        batch_filters["item"] = ["in", item_codes]

    batches_raw = frappe.get_all(
        "Batch",
        filters=batch_filters,
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
    global_allow_negative_stock = cint(
        frappe.db.get_single_value("Stock Settings", "allow_negative_stock") or 0
    )

    # Use ERPNext's own batch resolver, but fetch all batches for an Item +
    # Warehouse in one call instead of one database resolution per Batch row.
    # This preserves ERPNext batch semantics while avoiding an N-by-batch
    # preload pattern on POS startup.
    batch_qty_map = {}
    batch_qty_failed = set()
    batch_items = sorted({row.get("item") for row in batches_raw if row.get("item")})
    for item_code in batch_items:
        for wh in warehouses:
            try:
                resolved = get_batch_qty(item_code=item_code, warehouse=wh) or []
                for row in resolved:
                    batch_no = row.get("batch_no") if hasattr(row, "get") else None
                    if batch_no:
                        batch_qty_map[(item_code, wh, batch_no)] = flt(
                            row.get("qty") if hasattr(row, "get") else 0
                        )
            except Exception:
                batch_qty_failed.add((item_code, wh))

    for b in batches_raw:
        item_code = b.get("item")
        batch_no = b.get("name")
        batch_id = b.get("batch_id") or batch_no

        if not item_code or not batch_no:
            continue

        for wh in warehouses:
            if (item_code, wh) in batch_qty_failed:
                qty = get_erpnext_batch_qty(batch_no=batch_no, warehouse=wh, item_code=item_code)
            else:
                qty = flt(batch_qty_map.get((item_code, wh, batch_no)) or 0)
            item_meta = (item_meta_map or {}).get(item_code) if item_meta_map else None
            if not item_meta:
                item_meta = frappe.db.get_value(
                    "Item",
                    item_code,
                    ["name", "stock_uom", "sales_uom", "allow_negative_stock"],
                    as_dict=True,
                ) or {}

            stock_uom = item_meta.get("stock_uom") or ""
            allow_negative_stock = cint(
                item_meta.get("allow_negative_stock")
                or global_allow_negative_stock
                or 0
            )
            if flt(qty) <= 0 and not allow_negative_stock:
                continue

            if uom_conversion_map is not None and price_rows_by_item is not None:
                conversions = list((uom_conversion_map or {}).get(item_code, []))
                if stock_uom and not any(row.get("uom") == stock_uom for row in conversions):
                    conversions.insert(0, {"uom": stock_uom, "conversion_factor": 1.0})
                uom_options = _wmn_build_item_uom_options(
                    item_meta,
                    conversions,
                    (price_rows_by_item or {}).get(item_code, []),
                    batch_no=batch_no,
                )
            else:
                uom_options = _wmn_item_uom_options(
                    item_code,
                    price_list,
                    batch_no=batch_no,
                )
            price = next((row for row in uom_options if row.get("uom") == stock_uom), None)
            price = price or (uom_options[0] if uom_options else None)

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
                "price_list_rate": flt(price.get("price_list_rate") or 0) if price else 0,
                "rate": flt(price.get("price_list_rate") or 0) if price else 0,
                "currency": price.get("currency") if price else "",
                "uom": price.get("uom") if price and price.get("uom") else stock_uom,
                "uom_options": uom_options,
                "allow_negative_stock": allow_negative_stock,
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


def get_offline_serials(default_warehouse=None, item_codes=None):
    serial_filters = {}
    if default_warehouse:
        serial_filters["warehouse"] = default_warehouse
    if item_codes:
        serial_filters["item_code"] = ["in", item_codes]

    serial_fields = ["name", "item_code", "warehouse", "batch_no", "status", "creation"]

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
            "creation": s.get("creation") or "",
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


WMN_OFFLINE_SYNC_FIELD = "wmn_offline_sync_id"


def _wmn_validate_offline_invoice_sync_schema(doctype):
    from wmn.setup.offline_sync import validate_offline_sync_schema

    return validate_offline_sync_schema(doctype)


def _wmn_get_offline_invoice_sync_id(invoice):
    return str(
        invoice.get(WMN_OFFLINE_SYNC_FIELD)
        or invoice.get("custom_offline_id")
        or ""
    ).strip()


def _wmn_prepare_offline_invoice_sync_payload(invoice, doctype, offline_id):
    clean_invoice = dict(invoice)
    clean_invoice = _wmn_apply_coupon_to_offline_invoice_payload(clean_invoice)
    clean_invoice = _wmn_strip_promotion_transients(clean_invoice)
    for key in list(clean_invoice.keys()):
        if key.startswith("__"):
            clean_invoice.pop(key, None)

    clean_invoice["doctype"] = doctype
    clean_invoice["docstatus"] = 0
    clean_invoice["is_pos"] = 1
    clean_invoice["ignore_pricing_rule"] = 1
    clean_invoice["coupon_code"] = ""
    clean_invoice[WMN_OFFLINE_SYNC_FIELD] = offline_id
    clean_invoice.pop("custom_offline_id", None)

    # WMN operational stages must never be stored in ERPNext's native status field.
    if str(clean_invoice.get("status") or "").strip() == "Awaiting Cashier":
        clean_invoice["status"] = "Draft"

    # Offline rows can be created without all accounting defaults that ERPNext
    # normally fills during the online item_code event. Resolve only missing
    # mandatory/default fields at sync time using ERPNext's own item-details
    # logic, without applying pricing rules again.
    from erpnext.stock.get_item_details import get_item_details

    company = clean_invoice.get("company")
    for row in clean_invoice.get("items") or []:
        if not isinstance(row, dict) or not row.get("item_code"):
            continue

        item_tax_rate = row.get("item_tax_rate")
        if isinstance(item_tax_rate, dict):
            row["item_tax_rate"] = frappe.as_json(item_tax_rate)

        needs_defaults = any(
            not row.get(fieldname)
            for fieldname in ("income_account", "expense_account", "cost_center", "warehouse")
        )
        if not needs_defaults:
            continue

        detail_args = {
            "item_code": row.get("item_code"),
            "company": company,
            "doctype": doctype,
            "name": clean_invoice.get("name") or "",
            "customer": clean_invoice.get("customer"),
            "selling_price_list": clean_invoice.get("selling_price_list"),
            "price_list_currency": clean_invoice.get("price_list_currency") or clean_invoice.get("currency"),
            "plc_conversion_rate": flt(clean_invoice.get("plc_conversion_rate") or 1),
            "conversion_rate": flt(clean_invoice.get("conversion_rate") or 1),
            "currency": clean_invoice.get("currency"),
            "uom": row.get("uom"),
            "conversion_factor": flt(row.get("conversion_factor") or 1),
            "qty": flt(row.get("qty") or 1),
            "warehouse": row.get("warehouse") or clean_invoice.get("set_warehouse"),
            "set_warehouse": clean_invoice.get("set_warehouse"),
            "is_pos": cint(clean_invoice.get("is_pos") or doctype == "POS Invoice"),
            "update_stock": cint(clean_invoice.get("update_stock") or 0),
            "ignore_pricing_rule": 1,
            "batch_no": row.get("batch_no"),
            "serial_no": row.get("serial_no"),
            "use_serial_batch_fields": 1,
        }

        details = get_item_details(detail_args, doc=clean_invoice, overwrite_warehouse=False) or {}
        for fieldname in ("income_account", "expense_account", "cost_center", "warehouse", "item_tax_template"):
            if not row.get(fieldname) and details.get(fieldname):
                row[fieldname] = details.get(fieldname)

        if not row.get("item_tax_rate") and details.get("item_tax_rate") is not None:
            value = details.get("item_tax_rate")
            row["item_tax_rate"] = frappe.as_json(value) if isinstance(value, dict) else value

    return clean_invoice


def _wmn_replace_offline_invoice_draft_payload(doc, clean_invoice):
    """Replace an existing server Draft with the latest offline payload."""
    protected_fields = {
        "doctype",
        "name",
        "docstatus",
        "owner",
        "creation",
        "modified",
        "modified_by",
        "_user_tags",
        "_comments",
        "_assign",
        "_liked_by",
    }
    child_identity_fields = {
        "name",
        "parent",
        "parenttype",
        "parentfield",
        "owner",
        "creation",
        "modified",
        "modified_by",
        "docstatus",
    }
    table_fields = {
        df.fieldname
        for df in (doc.meta.get_table_fields() or [])
        if getattr(df, "fieldname", None)
    }

    for fieldname, value in clean_invoice.items():
        if fieldname in protected_fields or fieldname in table_fields:
            continue
        if doc.meta.has_field(fieldname):
            doc.set(fieldname, value)

    for fieldname in table_fields:
        if fieldname not in clean_invoice:
            continue
        doc.set(fieldname, [])
        for child in clean_invoice.get(fieldname) or []:
            if not isinstance(child, dict):
                continue
            child_data = dict(child)
            for key in child_identity_fields:
                child_data.pop(key, None)
            doc.append(fieldname, child_data)

    doc.docstatus = 0
    doc.is_pos = 1
    doc.ignore_pricing_rule = 1
    if doc.meta.has_field("coupon_code"):
        doc.coupon_code = ""
    return doc


@frappe.whitelist()
def sync_offline_pos_invoice(invoice, submit=1):
    """Synchronize an offline invoice as Draft or finalize it by Submit."""
    if isinstance(invoice, str):
        invoice = frappe.parse_json(invoice)

    if not isinstance(invoice, dict):
        frappe.throw(_("Invalid invoice payload"))

    submit_invoice = cint(submit) == 1
    offline_id = _wmn_get_offline_invoice_sync_id(invoice)
    if not offline_id:
        frappe.throw(_("Missing WMN offline sync ID"))

    supervisor_approvals = invoice.get("__wmn_supervisor_approvals") or []
    coupon_code = str(invoice.get("__wmn_coupon_code") or "").strip()
    coupon_discount_amount = max(0, flt(invoice.get("__wmn_coupon_discount_total") or 0))
    promotion_invoice_discount_amount = max(0, flt(invoice.get("__wmn_promotion_invoice_discount_total") or 0))
    promotion_results = _wmn_normalize_promotion_results(invoice.get("__wmn_pos_promotions") or [])
    if coupon_code:
        locked_coupon = _wmn_get_pos_coupon_by_code(coupon_code)
        frappe.db.sql(
            "select name from `tabWMN POS Coupon` where name=%s for update",
            (locked_coupon.name,),
        )

    doctype = invoice.get("doctype") or "POS Invoice"
    if doctype not in ("POS Invoice", "Sales Invoice"):
        frappe.throw(_("Invalid invoice doctype"))

    stage = str(invoice.get("wmn_pos_stage") or "").strip()
    if stage == "AWAITING_CASHIER" and submit_invoice:
        frappe.throw(_("Awaiting Cashier draft cannot be submitted before Complete Order"))

    _wmn_validate_offline_invoice_sync_schema(doctype)
    clean_invoice = _wmn_prepare_offline_invoice_sync_payload(invoice, doctype, offline_id)

    existing = frappe.db.exists(doctype, {WMN_OFFLINE_SYNC_FIELD: offline_id})
    if existing:
        doc = frappe.get_doc(doctype, existing)

        if doc.docstatus == 2:
            frappe.throw(_("Offline invoice {0} is cancelled").format(existing))

        if doc.docstatus == 0:
            _wmn_replace_offline_invoice_draft_payload(doc, clean_invoice)
            doc.save()
            if submit_invoice:
                doc.submit()

        doc.reload()
        if coupon_code and doc.docstatus == 1:
            _wmn_register_pos_coupon_redemption(
                coupon_code=coupon_code,
                invoice_doctype=doctype,
                invoice_name=doc.name,
                customer=doc.get("customer"),
                company=doc.get("company"),
                coupon_discount_amount=coupon_discount_amount,
                promotion_invoice_discount_amount=promotion_invoice_discount_amount,
                offline_id=offline_id,
            )
        if promotion_results and doc.docstatus == 1:
            _wmn_register_pos_promotion_redemptions(
                promotion_results=promotion_results,
                invoice_doctype=doctype,
                invoice_name=doc.name,
                offline_id=offline_id,
            )
        if supervisor_approvals and doc.docstatus == 1:
            _wmn_register_offline_supervisor_approvals(
                supervisor_approvals, doctype, doc.name, offline_id
            )

        return {
            "status": (
                "already_synced"
                if doc.docstatus == 1
                else "draft_synced"
            ),
            "name": doc.name,
            "docstatus": doc.docstatus,
            "invoice_status": doc.get("status"),
            "paid_amount": flt(doc.get("paid_amount") or 0),
            "outstanding_amount": flt(doc.get("outstanding_amount") or 0),
        }

    doc = frappe.get_doc(clean_invoice)
    doc.flags.ignore_permissions = False
    try:
        doc.insert()
    except frappe.UniqueValidationError:
        existing = frappe.db.exists(doctype, {WMN_OFFLINE_SYNC_FIELD: offline_id})
        if not existing:
            raise
        doc = frappe.get_doc(doctype, existing)

    if doc.docstatus == 2:
        frappe.throw(_("Offline invoice {0} is cancelled").format(doc.name))

    if doc.docstatus == 0 and submit_invoice:
        doc.submit()

    doc.reload()
    if coupon_code and doc.docstatus == 1:
        _wmn_register_pos_coupon_redemption(
            coupon_code=coupon_code,
            invoice_doctype=doctype,
            invoice_name=doc.name,
            customer=doc.get("customer"),
            company=doc.get("company"),
            coupon_discount_amount=coupon_discount_amount,
            promotion_invoice_discount_amount=promotion_invoice_discount_amount,
            offline_id=offline_id,
        )
    if promotion_results and doc.docstatus == 1:
        _wmn_register_pos_promotion_redemptions(
            promotion_results=promotion_results,
            invoice_doctype=doctype,
            invoice_name=doc.name,
            offline_id=offline_id,
        )
    if supervisor_approvals and doc.docstatus == 1:
        _wmn_register_offline_supervisor_approvals(
            supervisor_approvals, doctype, doc.name, offline_id
        )

    return {
        "status": "submitted" if doc.docstatus == 1 else "draft_synced",
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


WMN_OFFLINE_PAYMENT_FIELD = "wmn_offline_payment_id"


def _wmn_validate_offline_payment_schema():
    from wmn.setup.offline_payment import validate_offline_payment_schema

    return validate_offline_payment_schema()


def _wmn_create_sales_invoice_payment_entry(
    invoice_name,
    amount,
    mode_of_payment,
    reference_no=None,
    reference_date=None,
    offline_payment_id=None,
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
    if offline_payment_id:
        payment_entry.set(WMN_OFFLINE_PAYMENT_FIELD, offline_payment_id)

    payment_entry.insert()
    payment_entry.submit()

    invoice.reload()

    return payment_entry, invoice


def _wmn_payment_result(payment_entry, invoice, status=None):
    return {
        "status": status or "created",
        "payment_entry": payment_entry.name,
        "payment_entry_docstatus": payment_entry.docstatus,
        "invoice": invoice.name,
        "invoice_status": invoice.status,
        "paid_amount": flt(invoice.paid_amount or 0),
        "outstanding_amount": flt(invoice.outstanding_amount or 0),
    }


@frappe.whitelist()
def add_payment_to_sales_invoice(
    invoice_name,
    amount,
    mode_of_payment,
    reference_no=None,
    reference_date=None,
):
    payment_entry, invoice = _wmn_create_sales_invoice_payment_entry(
        invoice_name=invoice_name,
        amount=amount,
        mode_of_payment=mode_of_payment,
        reference_no=reference_no,
        reference_date=reference_date,
    )
    return _wmn_payment_result(payment_entry, invoice)


@frappe.whitelist()
def sync_offline_payment_entry(payment):
    if isinstance(payment, str):
        payment = frappe.parse_json(payment)
    if not isinstance(payment, dict):
        frappe.throw(_("Invalid offline payment payload"))

    offline_payment_id = str(
        payment.get(WMN_OFFLINE_PAYMENT_FIELD)
        or payment.get("offline_payment_id")
        or ""
    ).strip()
    if not offline_payment_id:
        frappe.throw(_("Missing offline payment ID"))

    _wmn_validate_offline_payment_schema()

    existing = frappe.db.exists(
        "Payment Entry",
        {WMN_OFFLINE_PAYMENT_FIELD: offline_payment_id},
    )
    if existing:
        payment_entry = frappe.get_doc("Payment Entry", existing)
        payment_entry.check_permission("read")
        invoice_name = payment.get("invoice_name") or ""
        invoice = frappe.get_doc("Sales Invoice", invoice_name) if invoice_name else None
        if invoice:
            invoice.check_permission("read")
        return _wmn_payment_result(
            payment_entry,
            invoice,
            status="already_synced",
        ) if invoice else {
            "status": "already_synced",
            "payment_entry": payment_entry.name,
            "payment_entry_docstatus": payment_entry.docstatus,
            "invoice": invoice_name,
        }

    try:
        payment_entry, invoice = _wmn_create_sales_invoice_payment_entry(
            invoice_name=payment.get("invoice_name"),
            amount=payment.get("amount"),
            mode_of_payment=payment.get("mode_of_payment"),
            reference_no=payment.get("reference_no"),
            reference_date=payment.get("reference_date"),
            offline_payment_id=offline_payment_id,
        )
    except frappe.UniqueValidationError:
        existing = frappe.db.exists(
            "Payment Entry",
            {WMN_OFFLINE_PAYMENT_FIELD: offline_payment_id},
        )
        if not existing:
            raise
        payment_entry = frappe.get_doc("Payment Entry", existing)
        payment_entry.check_permission("read")
        invoice = frappe.get_doc("Sales Invoice", payment.get("invoice_name"))
        invoice.check_permission("read")
        return _wmn_payment_result(payment_entry, invoice, status="already_synced")

    return _wmn_payment_result(payment_entry, invoice, status="synced")






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
        "wmn_pos_stage",
        "wmn_invoice_uid",
    ]
    filters = {"is_pos": 1}

    if not status:
        return []

    if status == "Awaiting Cashier":
        filters["docstatus"] = 0
        filters["wmn_pos_stage"] = "AWAITING_CASHIER"
    else:
        filters["status"] = status

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

    if status == "Draft":
        invoice_list = [
            row for row in invoice_list
            if str(row.get("wmn_pos_stage") or "").strip() != "AWAITING_CASHIER"
        ]

    for row in invoice_list:
        if str(row.get("wmn_pos_stage") or "").strip() == "AWAITING_CASHIER":
            row["status"] = "Awaiting Cashier"

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
