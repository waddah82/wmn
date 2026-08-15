import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime


CASH_MOVEMENT_DOCTYPE = "WMN POS Cash Movement"


def _field_exists(doctype, fieldname):
    return bool(frappe.get_meta(doctype).has_field(fieldname))


def _get_pos_profile_uses_sales_invoice(pos_profile):
    if not pos_profile or not _field_exists("POS Profile", "as_sales_invoice"):
        return False
    return cint(frappe.db.get_value("POS Profile", pos_profile, "as_sales_invoice") or 0) == 1


def _get_native_pos_invoice_names(closing_entry):
    names = []
    seen = set()
    for row in closing_entry.get("pos_transactions") or []:
        name = str(row.get("pos_invoice") or "").strip()
        if name and name not in seen:
            names.append(name)
            seen.add(name)
    return names


def _get_native_pos_invoice_headers(closing_entry):
    names = _get_native_pos_invoice_names(closing_entry)
    if not names:
        return []

    rows = frappe.get_all(
        "POS Invoice",
        filters={"name": ["in", names]},
        fields=[
            "name",
            "posting_date",
            "posting_time",
            "customer",
            "grand_total",
            "net_total",
            "total_qty",
            "change_amount",
            "account_for_change_amount",
        ],
        limit_page_length=0,
    )
    by_name = {row.name: row for row in rows}
    return [by_name[name] for name in names if name in by_name]


def _get_wmn_sales_invoice_headers(closing_entry):
    if not _get_pos_profile_uses_sales_invoice(closing_entry.get("pos_profile")):
        return []

    start = get_datetime(closing_entry.get("period_start_date"))
    end = get_datetime(closing_entry.get("period_end_date"))
    if not start or not end or end < start:
        return []

    sales_invoice_meta = frappe.get_meta("Sales Invoice")
    optional_receipt = ", ifnull(wmn_receipt_no, '') as wmn_receipt_no" if sales_invoice_meta.has_field("wmn_receipt_no") else ""
    consolidated_filter = " and ifnull(is_consolidated, 0) = 0" if sales_invoice_meta.has_field("is_consolidated") else ""

    rows = frappe.db.sql(
        f"""
        select
            name,
            posting_date,
            posting_time,
            customer,
            grand_total,
            net_total,
            total_qty,
            total_taxes_and_charges,
            paid_amount,
            outstanding_amount,
            change_amount,
            account_for_change_amount,
            is_return,
            return_against
            {optional_receipt}
        from `tabSales Invoice`
        where owner = %s
          and docstatus = 1
          and ifnull(is_pos, 0) = 1
          and pos_profile = %s
          {consolidated_filter}
          and timestamp(posting_date, posting_time) between %s and %s
        order by timestamp(posting_date, posting_time), name
        """,
        (
            closing_entry.get("user"),
            closing_entry.get("pos_profile"),
            start,
            end,
        ),
        as_dict=True,
    )
    return rows


def _get_invoice_payments(parenttype, invoice_headers):
    names = [row.name for row in invoice_headers if row.get("name")]
    if not names:
        return []

    rows = frappe.get_all(
        "Sales Invoice Payment",
        filters={"parenttype": parenttype, "parent": ["in", names]},
        fields=["parent", "mode_of_payment", "account", "amount"],
        limit_page_length=0,
    )
    header_by_name = {row.name: row for row in invoice_headers}
    normalized = []
    for row in rows:
        invoice = header_by_name.get(row.parent)
        if not invoice:
            continue
        amount = flt(row.amount)
        if row.account and row.account == invoice.get("account_for_change_amount"):
            amount -= flt(invoice.get("change_amount"))
        normalized.append(
            frappe._dict(
                {
                    "parent": row.parent,
                    "mode_of_payment": row.mode_of_payment,
                    "account": row.account,
                    "amount": amount,
                }
            )
        )
    return normalized


def _get_invoice_taxes(parenttype, invoice_headers):
    names = [row.name for row in invoice_headers if row.get("name")]
    if not names:
        return []

    return frappe.get_all(
        "Sales Taxes and Charges",
        filters={"parenttype": parenttype, "parent": ["in", names]},
        fields=["parent", "account_head", "rate", "tax_amount"],
        limit_page_length=0,
    )


def _get_cash_movements(closing_entry):
    if not closing_entry.get("pos_opening_entry") or not frappe.db.exists("DocType", CASH_MOVEMENT_DOCTYPE):
        return []

    return frappe.get_all(
        CASH_MOVEMENT_DOCTYPE,
        filters={
            "pos_opening_entry": closing_entry.get("pos_opening_entry"),
            "docstatus": 1,
        },
        fields=[
            "name",
            "movement_type",
            "posting_date",
            "posting_time",
            "mode_of_payment",
            "amount",
            "journal_entry",
            "reason",
        ],
        order_by="posting_date asc, posting_time asc, creation asc",
        limit_page_length=0,
    )


def _build_sales_invoice_rows(invoice_headers):
    return [
        frappe._dict(
            {
                "sales_invoice": row.name,
                "receipt_no": row.get("wmn_receipt_no") or "",
                "posting_date": row.posting_date,
                "posting_time": row.posting_time,
                "customer": row.customer,
                "is_return": cint(row.get("is_return") or 0),
                "return_against": row.get("return_against") or "",
                "total_qty": flt(row.get("total_qty") or 0),
                "net_total": flt(row.get("net_total") or 0),
                "tax_amount": flt(row.get("total_taxes_and_charges") or 0),
                "grand_total": flt(row.get("grand_total") or 0),
                "paid_amount": flt(row.get("paid_amount") or 0),
                "outstanding_amount": flt(row.get("outstanding_amount") or 0),
            }
        )
        for row in invoice_headers
    ]


def _build_cash_movement_rows(movements):
    return [
        frappe._dict(
            {
                "cash_movement": row.name,
                "movement_type": row.movement_type,
                "posting_date": row.posting_date,
                "posting_time": row.posting_time,
                "mode_of_payment": row.mode_of_payment,
                "amount": flt(row.amount or 0),
                "journal_entry": row.journal_entry or "",
                "reason": row.reason or "",
            }
        )
        for row in movements
    ]


def _aggregate_taxes(pos_taxes, sales_taxes):
    taxes = {}
    order = []
    for row in list(pos_taxes or []) + list(sales_taxes or []):
        account_head = str(row.get("account_head") or "").strip()
        if not account_head:
            continue
        rate = flt(row.get("rate") or 0)
        key = (account_head, rate)
        if key not in taxes:
            taxes[key] = frappe._dict({"account_head": account_head, "rate": rate, "amount": 0.0})
            order.append(key)
        taxes[key].amount += flt(row.get("tax_amount") or 0)
    return [taxes[key] for key in order]


def _get_existing_payment_state(closing_entry):
    state = {}
    for row in closing_entry.get("payment_reconciliation") or []:
        mode = str(row.get("mode_of_payment") or "").strip()
        if not mode:
            continue
        state[mode] = frappe._dict(
            {
                "opening_amount": flt(row.get("opening_amount") or 0),
                "expected_amount": flt(row.get("expected_amount") or 0),
                "closing_amount": flt(row.get("closing_amount") or 0),
            }
        )
    return state


def _build_payment_reconciliation(
    closing_entry,
    pos_payments,
    sales_payments,
    cash_movements,
    initialize_closing_amounts=False,
):
    opening_entry = frappe.get_doc("POS Opening Entry", closing_entry.get("pos_opening_entry"))
    existing = _get_existing_payment_state(closing_entry)
    payments = {}
    order = []
    opening_modes = set()

    def ensure_mode(mode_of_payment):
        mode = str(mode_of_payment or "").strip()
        if not mode:
            return None
        if mode not in payments:
            payments[mode] = frappe._dict(
                {
                    "mode_of_payment": mode,
                    "opening_amount": 0.0,
                    "expected_amount": 0.0,
                    "closing_amount": 0.0,
                    "difference": 0.0,
                }
            )
            order.append(mode)
        return payments[mode]

    for detail in opening_entry.get("balance_details") or []:
        row = ensure_mode(detail.get("mode_of_payment"))
        if not row:
            continue
        opening_modes.add(row.mode_of_payment)
        row.opening_amount += flt(detail.get("opening_amount") or 0)
        row.expected_amount += flt(detail.get("opening_amount") or 0)

    for payment in list(pos_payments or []) + list(sales_payments or []):
        row = ensure_mode(payment.get("mode_of_payment"))
        if row:
            row.expected_amount += flt(payment.get("amount") or 0)

    for movement in cash_movements or []:
        row = ensure_mode(movement.get("mode_of_payment"))
        if not row:
            continue
        amount = flt(movement.get("amount") or 0)
        if movement.get("movement_type") == "Cash In":
            row.expected_amount += amount
        elif movement.get("movement_type") in ("Cash Expense", "Cash Withdrawal"):
            row.expected_amount -= amount

    for mode in order:
        row = payments[mode]
        previous = existing.get(mode)
        if initialize_closing_amounts:
            row.closing_amount = row.expected_amount if mode in opening_modes else 0.0
        elif previous:
            row.closing_amount = flt(previous.closing_amount)
        else:
            row.closing_amount = 0.0
        row.difference = flt(row.closing_amount) - flt(row.expected_amount)

    return [payments[mode] for mode in order]



def build_wmn_closing_snapshot(closing_entry, initialize_closing_amounts=False):
    if not closing_entry.get("pos_opening_entry"):
        return frappe._dict()
    if not closing_entry.get("period_start_date") or not closing_entry.get("period_end_date"):
        return frappe._dict()

    native_pos_invoices = _get_native_pos_invoice_headers(closing_entry)
    wmn_sales_invoices = _get_wmn_sales_invoice_headers(closing_entry)

    pos_payments = _get_invoice_payments("POS Invoice", native_pos_invoices)
    sales_payments = _get_invoice_payments("Sales Invoice", wmn_sales_invoices)
    pos_taxes = _get_invoice_taxes("POS Invoice", native_pos_invoices)
    sales_taxes = _get_invoice_taxes("Sales Invoice", wmn_sales_invoices)
    cash_movements = _get_cash_movements(closing_entry)

    grand_total = sum(flt(row.get("grand_total") or 0) for row in native_pos_invoices)
    grand_total += sum(flt(row.get("grand_total") or 0) for row in wmn_sales_invoices)
    net_total = sum(flt(row.get("net_total") or 0) for row in native_pos_invoices)
    net_total += sum(flt(row.get("net_total") or 0) for row in wmn_sales_invoices)
    total_quantity = sum(flt(row.get("total_qty") or 0) for row in native_pos_invoices)
    total_quantity += sum(flt(row.get("total_qty") or 0) for row in wmn_sales_invoices)

    return frappe._dict(
        {
            "wmn_sales_invoices": _build_sales_invoice_rows(wmn_sales_invoices),
            "wmn_cash_movements": _build_cash_movement_rows(cash_movements),
            "payment_reconciliation": _build_payment_reconciliation(
                closing_entry,
                pos_payments,
                sales_payments,
                cash_movements,
                initialize_closing_amounts=initialize_closing_amounts,
            ),
            "taxes": _aggregate_taxes(pos_taxes, sales_taxes),
            "grand_total": grand_total,
            "net_total": net_total,
            "total_quantity": total_quantity,
        }
    )


def apply_wmn_closing_snapshot(closing_entry, snapshot=None):
    snapshot = snapshot or build_wmn_closing_snapshot(closing_entry)
    if not snapshot:
        return

    closing_entry.grand_total = flt(snapshot.get("grand_total") or 0)
    closing_entry.net_total = flt(snapshot.get("net_total") or 0)
    closing_entry.total_quantity = flt(snapshot.get("total_quantity") or 0)
    closing_entry.set("payment_reconciliation", snapshot.get("payment_reconciliation") or [])
    closing_entry.set("taxes", snapshot.get("taxes") or [])

    if closing_entry.meta.has_field("wmn_sales_invoices"):
        closing_entry.set("wmn_sales_invoices", snapshot.get("wmn_sales_invoices") or [])
    if closing_entry.meta.has_field("wmn_cash_movements"):
        closing_entry.set("wmn_cash_movements", snapshot.get("wmn_cash_movements") or [])



def validate_wmn_closing_context(closing_entry):
    opening = frappe.db.get_value(
        "POS Opening Entry",
        closing_entry.get("pos_opening_entry"),
        ["pos_profile", "user", "company"],
        as_dict=True,
    )
    if not opening:
        frappe.throw(_("POS Opening Entry was not found"))
    if opening.pos_profile != closing_entry.get("pos_profile"):
        frappe.throw(_("POS Profile does not match the selected POS Opening Entry"))
    if opening.user != closing_entry.get("user"):
        frappe.throw(_("Cashier does not match the selected POS Opening Entry"))
    if opening.company != closing_entry.get("company"):
        frappe.throw(_("Company does not match the selected POS Opening Entry"))
