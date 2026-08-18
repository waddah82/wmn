import frappe
from frappe.utils import cint


LEGACY_CHILD_DOCTYPE = "WMN POS Closing Sales Invoice"
LEGACY_CUSTOM_FIELDS = (
    ("POS Profile", "as_sales_invoice"),
    ("POS Closing Entry", "wmn_sales_invoices_section"),
    ("POS Closing Entry", "wmn_sales_invoices"),
)


def _legacy_invoice_type_values():
    """Read the v15 WMN per-profile flag directly from legacy columns before they are removed."""
    sources = (
        ("WMN POS Profile Settings", "as_sales_invoice"),
        ("POS Profile", "as_sales_invoice"),
    )
    for doctype, fieldname in sources:
        if not frappe.db.table_exists(doctype, cached=False):
            continue
        columns = set(frappe.db.get_table_columns(doctype) or [])
        if fieldname not in columns:
            continue
        rows = frappe.db.sql(
            f"select distinct `{fieldname}` from `tab{doctype}` where `{fieldname}` is not null"
        )
        values = {cint(row[0] or 0) for row in rows}
        if values:
            return values
    return set()


def _migrate_native_invoice_type_setting():
    """Move an unambiguous v15 WMN invoice choice to ERPNext v16 POS Settings."""
    values = _legacy_invoice_type_values()
    if len(values) == 1:
        target = "Sales Invoice" if 1 in values else "POS Invoice"
        frappe.db.set_single_value("POS Settings", "invoice_type", target, update_modified=False)
        return target

    if len(values) > 1:
        frappe.log_error(
            title="WMN POS v16 invoice type migration",
            message=(
                "Legacy POS Profiles contain mixed as_sales_invoice values. "
                "ERPNext v16 uses one global POS Settings.invoice_type value, so the existing native setting was preserved."
            ),
        )
    return None


def _mark_wmn_sales_invoices_as_pos_created():
    """Mark invoices created by the WMN POS so ERPNext v16 can own them natively."""
    meta = frappe.get_meta("Sales Invoice")
    if not meta.has_field("is_created_using_pos") or not meta.has_field("wmn_invoice_uid"):
        return 0

    return frappe.db.sql(
        """
        update `tabSales Invoice`
           set is_created_using_pos = 1
         where ifnull(is_pos, 0) = 1
           and ifnull(wmn_invoice_uid, '') != ''
           and ifnull(is_created_using_pos, 0) = 0
        """
    )


def _legacy_closing_rows():
    if not frappe.db.table_exists(LEGACY_CHILD_DOCTYPE, cached=False):
        return []

    columns = set(frappe.db.get_table_columns(LEGACY_CHILD_DOCTYPE) or [])
    required = {"parent", "sales_invoice"}
    if not required.issubset(columns):
        return []

    def select_column(fieldname, fallback="null"):
        return f"`{fieldname}`" if fieldname in columns else fallback

    return frappe.db.sql(
        f"""
        select
            parent,
            {select_column('idx', '0')} as idx,
            sales_invoice,
            {select_column('posting_date')} as posting_date,
            {select_column('customer')} as customer,
            {select_column('grand_total', '0')} as grand_total,
            {select_column('is_return', '0')} as is_return,
            {select_column('return_against')} as return_against
        from `tab{LEGACY_CHILD_DOCTYPE}`
        where ifnull(parent, '') != ''
          and ifnull(sales_invoice, '') != ''
          and (ifnull(parenttype, '') in ('', 'POS Closing Entry'))
          and (ifnull(parentfield, '') in ('', 'wmn_sales_invoices'))
        order by parent, idx
        """,
        as_dict=True,
    )


def _migrate_legacy_closing_history():
    """Move v15 WMN closing references into ERPNext v16 native sales_invoices rows."""
    if not frappe.db.table_exists("Sales Invoice Reference", cached=False):
        return 0

    rows = _legacy_closing_rows()
    if not rows:
        return 0

    migrated = 0
    max_idx_by_parent = {}
    parent_docstatus = {}

    for row in rows:
        parent = str(row.get("parent") or "").strip()
        invoice_name = str(row.get("sales_invoice") or "").strip()
        if not parent or not invoice_name:
            continue
        if not frappe.db.exists("POS Closing Entry", parent):
            continue
        if not frappe.db.exists("Sales Invoice", invoice_name):
            continue

        already_linked = frappe.db.exists(
            "Sales Invoice Reference",
            {
                "parent": parent,
                "parenttype": "POS Closing Entry",
                "parentfield": "sales_invoices",
                "sales_invoice": invoice_name,
            },
        )

        invoice = frappe.db.get_value(
            "Sales Invoice",
            invoice_name,
            [
                "posting_date",
                "customer",
                "grand_total",
                "is_return",
                "return_against",
                "pos_closing_entry",
                "is_created_using_pos",
            ],
            as_dict=True,
        )
        if not invoice:
            continue

        if not already_linked:
            if parent not in max_idx_by_parent:
                max_idx_by_parent[parent] = cint(
                    frappe.db.sql(
                        """
                        select ifnull(max(idx), 0)
                          from `tabSales Invoice Reference`
                         where parent = %s
                           and parenttype = 'POS Closing Entry'
                           and parentfield = 'sales_invoices'
                        """,
                        (parent,),
                    )[0][0]
                )
            max_idx_by_parent[parent] += 1

            child = frappe.get_doc(
                {
                    "doctype": "Sales Invoice Reference",
                    "parent": parent,
                    "parenttype": "POS Closing Entry",
                    "parentfield": "sales_invoices",
                    "idx": max_idx_by_parent[parent],
                    "sales_invoice": invoice_name,
                    "posting_date": row.get("posting_date") or invoice.posting_date,
                    "customer": row.get("customer") or invoice.customer,
                    "grand_total": row.get("grand_total") if row.get("grand_total") is not None else invoice.grand_total,
                    "is_return": cint(row.get("is_return") if row.get("is_return") is not None else invoice.is_return),
                    "return_against": row.get("return_against") or invoice.return_against,
                }
            )
            child.db_insert()
            migrated += 1

        if not cint(invoice.is_created_using_pos or 0):
            frappe.db.set_value(
                "Sales Invoice",
                invoice_name,
                "is_created_using_pos",
                1,
                update_modified=False,
            )

        if parent not in parent_docstatus:
            parent_docstatus[parent] = cint(frappe.db.get_value("POS Closing Entry", parent, "docstatus") or 0)
        if parent_docstatus[parent] == 1 and not invoice.pos_closing_entry:
            frappe.db.set_value(
                "Sales Invoice",
                invoice_name,
                "pos_closing_entry",
                parent,
                update_modified=False,
            )

    return migrated


def remove_v15_pos_invoice_compatibility():
    """Migrate v15 WMN POS history, then remove compatibility artifacts owned by ERPNext v16."""
    _migrate_native_invoice_type_setting()
    _mark_wmn_sales_invoices_as_pos_created()
    _migrate_legacy_closing_history()

    changed = False
    for doctype, fieldname in LEGACY_CUSTOM_FIELDS:
        names = frappe.get_all(
            "Custom Field",
            filters={"dt": doctype, "fieldname": fieldname},
            pluck="name",
        )
        for name in names:
            frappe.delete_doc("Custom Field", name, ignore_permissions=True, force=True)
            changed = True

    if frappe.db.exists("DocType", LEGACY_CHILD_DOCTYPE):
        frappe.delete_doc("DocType", LEGACY_CHILD_DOCTYPE, ignore_permissions=True, force=True)
        changed = True

    if changed:
        frappe.clear_cache()
