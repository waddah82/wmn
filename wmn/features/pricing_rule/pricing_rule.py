import ast
from collections import defaultdict

import frappe
from frappe.utils import cint, flt, now_datetime


SNAPSHOT_SCHEMA_VERSION = 5

PRICING_RULE_FIELDS = [
    "name", "title", "disable", "apply_on", "price_or_product_discount", "warehouse",
    "mixed_conditions", "is_cumulative", "coupon_code_based", "apply_rule_on_other",
    "other_item_code", "other_item_group", "other_brand", "selling", "buying",
    "applicable_for", "customer", "customer_group", "territory", "sales_partner", "campaign",
    "min_qty", "max_qty", "min_amt", "max_amt", "same_item", "free_item", "free_qty",
    "free_item_rate", "free_item_uom", "round_free_qty", "dont_enforce_free_item_qty",
    "is_recursive", "recurse_for", "apply_recursion_over", "valid_from", "valid_upto",
    "company", "currency", "margin_type", "margin_rate_or_amount", "rate_or_discount",
    "apply_discount_on", "rate", "discount_amount", "discount_percentage", "for_price_list",
    "condition", "apply_multiple_pricing_rules", "apply_discount_on_rate", "threshold_percentage",
    "validate_applied_rule", "has_priority", "priority", "promotional_scheme_id", "promotional_scheme",
]


def force_native_pricing_rule_engine_disabled(doc, method=None):
    """Keep ERPNext native Pricing Rule execution disabled inside WMN POS."""
    if doc and doc.doctype == "POS Profile":
        doc.ignore_pricing_rule = 1


def enforce_all_pos_profiles_native_pricing_disabled():
    """Persist the WMN invariant for existing POS Profiles after migrate."""
    if not frappe.db.exists("DocType", "POS Profile"):
        return
    frappe.db.sql(
        "update `tabPOS Profile` set ignore_pricing_rule = 1 "
        "where ifnull(ignore_pricing_rule, 0) != 1"
    )


def _child_rows(doctype, parents, fields):
    if not parents or not frappe.db.exists("DocType", doctype):
        return {name: [] for name in parents}

    grouped = {name: [] for name in parents}
    rows = frappe.get_all(
        doctype,
        filters={"parent": ["in", parents]},
        fields=["parent", "idx"] + fields,
        order_by="parent asc, idx asc",
        limit_page_length=0,
    )
    for row in rows:
        parent = row.get("parent")
        if parent in grouped:
            grouped[parent].append({field: row.get(field) for field in fields})
    return grouped


def _tree_rows(doctype, parent_field):
    if not frappe.db.exists("DocType", doctype):
        return []
    meta = frappe.get_meta(doctype)
    fields = ["name", parent_field]
    for optional in ("is_group", "lft", "rgt"):
        if meta.get_field(optional):
            fields.append(optional)
    return [dict(row) for row in frappe.get_all(doctype, fields=fields, limit_page_length=0)]


def _tree_descendants(tree_rows, name):
    if not name:
        return []
    by_name = {row.get("name"): row for row in tree_rows if row.get("name")}
    node = by_name.get(name)
    if not node:
        return [name]
    lft, rgt = node.get("lft"), node.get("rgt")
    if lft is not None and rgt is not None:
        return [
            row.get("name")
            for row in tree_rows
            if row.get("name")
            and row.get("lft") is not None
            and row.get("rgt") is not None
            and row.get("lft") >= lft
            and row.get("rgt") <= rgt
        ]

    children = defaultdict(list)
    for row in tree_rows:
        children[row.get(next((k for k in row if k.startswith("parent_")), ""))].append(row.get("name"))
    out, stack, seen = [], [name], set()
    while stack:
        current = stack.pop()
        if not current or current in seen:
            continue
        seen.add(current)
        out.append(current)
        stack.extend(children.get(current, []))
    return out


def _serialize_ast_value(value):
    if isinstance(value, ast.AST):
        payload = {"type": value.__class__.__name__}
        for field_name, field_value in ast.iter_fields(value):
            payload[field_name] = _serialize_ast_value(field_value)
        return payload
    if isinstance(value, list):
        return [_serialize_ast_value(item) for item in value]
    if isinstance(value, tuple):
        return [_serialize_ast_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _compile_condition(expression):
    expression = (expression or "").strip()
    if not expression:
        return None
    try:
        tree = ast.parse(expression, mode="eval")
    except (SyntaxError, ValueError):
        # Native safe_eval skips a rule when its condition cannot be evaluated.
        return None
    return _serialize_ast_value(tree.body)


def _uom_conversion_map():
    if not frappe.db.exists("DocType", "UOM Conversion Detail"):
        return {}
    result = defaultdict(dict)
    for row in frappe.get_all(
        "UOM Conversion Detail",
        fields=["parent", "uom", "conversion_factor"],
        filters={"parenttype": "Item"},
        limit_page_length=0,
    ):
        parent = row.get("parent")
        uom = row.get("uom")
        if parent and uom:
            result[parent][uom] = flt(row.get("conversion_factor")) or 1.0
    return dict(result)


def _cumulative_summary_for_rule(rule, doctype, item_group_tree, warehouse_tree):
    """Pre-aggregate ERPNext cumulative history for local runtime evaluation.

    ERPNext v16.6.1 cumulative lookup sums submitted transaction item stock_qty
    and amount in the rule date window, optionally under the rule warehouse.
    It does not filter the history by customer after the rule itself has been
    selected. The local snapshot reproduces that behavior and groups the
    historical totals by the rule's apply-on field so non-mixed rules can add
    only the current apply-on value while mixed rules can add all rule items.
    """
    if not cint(rule.get("is_cumulative")):
        return {}
    if not (rule.get("valid_from") and rule.get("valid_upto")):
        return {}
    if not frappe.db.exists("DocType", doctype):
        return {}

    child_doctype = f"{doctype} Item"
    if not frappe.db.exists("DocType", child_doctype):
        return {}

    parent_meta = frappe.get_meta(doctype)
    child_meta = frappe.get_meta(child_doctype)
    apply_field = frappe.scrub(rule.get("apply_on") or "")
    if not apply_field or not child_meta.get_field(apply_field):
        return {}

    date_field = "transaction_date" if parent_meta.get_field("transaction_date") else "posting_date"
    params = [rule.get("valid_from"), rule.get("valid_upto")]
    where = [
        f"p.`{date_field}` between %s and %s",
        "p.docstatus = 1",
        "i.parent = p.name",
    ]

    warehouse = rule.get("warehouse")
    if warehouse and child_meta.get_field("warehouse"):
        warehouses = _tree_descendants(warehouse_tree, warehouse) or [warehouse]
        where.append("i.warehouse in ({})".format(",".join(["%s"] * len(warehouses))))
        params.extend(warehouses)

    rows = frappe.db.sql(
        f"""
        select i.`{apply_field}` as apply_value,
               coalesce(sum(i.stock_qty), 0) as stock_qty,
               coalesce(sum(i.amount), 0) as amount
        from `tab{child_doctype}` i
        inner join `tab{doctype}` p on i.parent = p.name
        where {' and '.join(where)}
        group by i.`{apply_field}`
        """,
        tuple(params),
        as_dict=True,
    )

    by_value = {}
    total_qty = total_amount = 0.0
    for row in rows:
        key = str(row.get("apply_value") or "")
        qty = flt(row.get("stock_qty"))
        amount = flt(row.get("amount"))
        by_value[key] = {"stock_qty": qty, "amount": amount}
        total_qty += qty
        total_amount += amount

    return {
        "by_value": by_value,
        "total": {"stock_qty": total_qty, "amount": total_amount},
    }


def _expanded_rule_values(rule, item_group_tree):
    apply_on = rule.get("apply_on")
    if apply_on == "Item Code":
        return [row.get("item_code") for row in rule.get("items", []) if row.get("item_code")]
    if apply_on == "Brand":
        return [row.get("brand") for row in rule.get("brands", []) if row.get("brand")]
    if apply_on == "Item Group":
        values = []
        for row in rule.get("item_groups", []):
            values.extend(_tree_descendants(item_group_tree, row.get("item_group")))
        return sorted(set(value for value in values if value))
    return []


def _referenced_item_metadata(rules):
    """Return only Item metadata needed by local Product/Rate execution."""
    item_codes = set()
    for rule in rules:
        for row in rule.get("items", []):
            if row.get("item_code"):
                item_codes.add(row.get("item_code"))
        if rule.get("free_item"):
            item_codes.add(rule.get("free_item"))

    if not item_codes:
        return {}

    rows = frappe.get_all(
        "Item",
        filters={"name": ["in", sorted(item_codes)]},
        fields=["name", "stock_uom", "variant_of", "item_group", "brand", "has_serial_no", "has_batch_no"],
        limit_page_length=0,
    )
    return {row.get("name"): dict(row) for row in rows if row.get("name")}


def build_pricing_rule_snapshot(company=None, price_list=None):
    """Compile ERPNext Pricing Rule data for the WMN local compatibility engine."""
    pricing_rule_meta = frappe.get_meta("Pricing Rule")
    available_fields = {df.fieldname for df in pricing_rule_meta.fields if df.fieldname}
    fields = [field for field in PRICING_RULE_FIELDS if field == "name" or field in available_fields]

    raw_rules = frappe.get_all(
        "Pricing Rule",
        filters={"disable": 0, "selling": 1},
        fields=fields,
        order_by="priority desc, name desc",
        limit_page_length=0,
    )

    rules = []
    for raw in raw_rules:
        rule = dict(raw)
        rule_company = str(rule.get("company") or "").strip()
        if company and rule_company and rule_company != company:
            continue
        # Item-level ERPNext lookup includes for_price_list in SQL. Transaction
        # rules do not, so do not pre-filter Transaction here.
        rule_price_list = str(rule.get("for_price_list") or "").strip()
        if rule.get("apply_on") != "Transaction" and price_list and rule_price_list and rule_price_list != price_list:
            continue
        rules.append(rule)

    parents = [row["name"] for row in rules]
    item_rows = _child_rows("Pricing Rule Item Code", parents, ["item_code", "uom"])
    group_rows = _child_rows("Pricing Rule Item Group", parents, ["item_group", "uom"])
    brand_rows = _child_rows("Pricing Rule Brand", parents, ["brand"])

    trees = {
        "item_groups": _tree_rows("Item Group", "parent_item_group"),
        "customer_groups": _tree_rows("Customer Group", "parent_customer_group"),
        "territories": _tree_rows("Territory", "parent_territory"),
        "warehouses": _tree_rows("Warehouse", "parent_warehouse"),
    }

    coupon_by_rule = {}
    if parents and frappe.db.exists("DocType", "Coupon Code"):
        for row in frappe.get_all(
            "Coupon Code",
            filters={"pricing_rule": ["in", parents]},
            fields=["name", "pricing_rule", "valid_from", "valid_upto", "maximum_use", "used"],
            limit_page_length=0,
        ):
            pricing_rule = row.get("pricing_rule")
            if pricing_rule:
                coupon_by_rule[pricing_rule] = dict(row)

    transaction_order = {}
    transaction_names = frappe.db.sql_list(
        """
        select name
        from `tabPricing Rule`
        where apply_on = 'Transaction' and disable = 0 and selling = 1
        """
    )
    for index, name in enumerate(transaction_names):
        transaction_order[name] = index

    for rule in rules:
        name = rule["name"]
        rule["items"] = item_rows.get(name, [])
        rule["item_groups"] = group_rows.get(name, [])
        rule["brands"] = brand_rows.get(name, [])
        rule["wmn_expanded_apply_values"] = _expanded_rule_values(rule, trees["item_groups"])

        coupon_data = coupon_by_rule.get(name, {}) or {}
        rule["coupon_code"] = coupon_data.get("name") or ""
        rule["coupon_code_data"] = coupon_data
        rule["condition_ast"] = _compile_condition(rule.get("condition")) if rule.get("condition") else None

        if rule.get("apply_on") == "Transaction":
            rule["wmn_native_transaction_sequence"] = transaction_order.get(name, len(transaction_order))

        if cint(rule.get("is_cumulative")):
            cumulative = {}
            for doctype in ("Sales Invoice", "POS Invoice"):
                summary = _cumulative_summary_for_rule(
                    rule,
                    doctype,
                    trees["item_groups"],
                    trees["warehouses"],
                )
                if summary:
                    cumulative[doctype] = summary
            rule["cumulative_summary"] = cumulative

    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "version": now_datetime().isoformat(),
        "erpnext_reference": "v16.6.1",
        "transaction_order_mode": "erpnext_v16_native",
        "company": company or "",
        "price_list": price_list or "",
        "rules": rules,
        "trees": trees,
        "uom_conversions": _uom_conversion_map(),
        "item_meta": _referenced_item_metadata(rules),
        "condition_ast_mode": "frappe_v16_9_safe_eval_compat_v1",
    }


@frappe.whitelist()
def get_pricing_rule_snapshot(pos_profile):
    if not pos_profile:
        frappe.throw("POS Profile is required")
    profile = frappe.get_doc("POS Profile", pos_profile)
    profile.check_permission("read")
    return build_pricing_rule_snapshot(profile.company, profile.selling_price_list)


@frappe.whitelist()
def get_native_reference_for_item(args, doc=None):
    """Developer diagnostic: execute ERPNext v16 native item rule selection only.

    This method is never used by the WMN POS runtime. It exists solely for
    differential parity tests and intentionally bypasses the WMN POS Profile
    ignore flag by calling the native Pricing Rule function directly.
    """
    frappe.only_for("System Manager")
    from erpnext.accounts.doctype.pricing_rule.pricing_rule import get_pricing_rule_for_item

    if isinstance(args, str):
        args = frappe.parse_json(args)
    if isinstance(doc, str):
        doc = frappe.parse_json(doc)
    args = frappe._dict(args or {})
    args.ignore_pricing_rule = 0
    result = get_pricing_rule_for_item(args, doc=doc)
    return dict(result or {})


@frappe.whitelist()
def get_native_reference_for_transaction(doc):
    """Developer diagnostic for ERPNext v16 native Transaction Pricing Rules.

    Never called by WMN POS runtime. It exists only for System Manager parity
    comparisons and operates on an in-memory document copy.
    """
    frappe.only_for("System Manager")
    from erpnext.accounts.doctype.pricing_rule.utils import apply_pricing_rule_on_transaction

    if isinstance(doc, str):
        doc = frappe.parse_json(doc)
    reference = frappe.get_doc(doc or {})
    reference.ignore_pricing_rule = 0
    reference.calculate_taxes_and_totals()
    apply_pricing_rule_on_transaction(reference)
    return {
        "apply_discount_on": reference.get("apply_discount_on"),
        "additional_discount_percentage": flt(reference.get("additional_discount_percentage")),
        "discount_amount": flt(reference.get("discount_amount")),
        "total": flt(reference.get("total")),
        "net_total": flt(reference.get("net_total")),
        "grand_total": flt(reference.get("grand_total")),
        "items": [
            {
                "item_code": row.get("item_code"),
                "qty": flt(row.get("qty")),
                "rate": flt(row.get("rate")),
                "price_list_rate": flt(row.get("price_list_rate")),
                "discount_percentage": flt(row.get("discount_percentage")),
                "discount_amount": flt(row.get("discount_amount")),
                "pricing_rules": row.get("pricing_rules"),
                "is_free_item": cint(row.get("is_free_item")),
            }
            for row in reference.get("items") or []
        ],
    }
