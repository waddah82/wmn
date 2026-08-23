import frappe
from frappe import _
from frappe.utils import cint, flt

from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import get_invoices


CASH_MOVEMENT_DOCTYPE = "WMN POS Cash Movement"


def _validate_context(closing_entry):
    if not closing_entry.get("pos_opening_entry"):
        return

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


def _existing_payment_state(closing_entry):
    state = {}
    for row in closing_entry.get("payment_reconciliation") or []:
        mode = str(row.get("mode_of_payment") or "").strip()
        if not mode:
            continue
        state[mode] = frappe._dict(
            {
                "closing_amount": flt(row.get("closing_amount") or 0),
            }
        )
    return state


def _build_payment_reconciliation(closing_entry, native_payments, cash_movements, initialize_closing_amounts=False):
    opening_entry = frappe.get_doc("POS Opening Entry", closing_entry.get("pos_opening_entry"))
    existing = _existing_payment_state(closing_entry)
    rows = {}
    order = []
    opening_modes = set()

    def ensure_mode(mode_of_payment):
        mode = str(mode_of_payment or "").strip()
        if not mode:
            return None
        if mode not in rows:
            rows[mode] = frappe._dict(
                {
                    "mode_of_payment": mode,
                    "opening_amount": 0.0,
                    "expected_amount": 0.0,
                    "closing_amount": 0.0,
                    "difference": 0.0,
                }
            )
            order.append(mode)
        return rows[mode]

    for detail in opening_entry.get("balance_details") or []:
        row = ensure_mode(detail.get("mode_of_payment"))
        if not row:
            continue
        opening_modes.add(row.mode_of_payment)
        amount = flt(detail.get("opening_amount") or 0)
        row.opening_amount += amount
        row.expected_amount += amount

    for payment in native_payments or []:
        row = ensure_mode(payment.get("mode_of_payment"))
        if row:
            row.expected_amount += flt(payment.get("amount") or 0)

    for movement in cash_movements or []:
        row = ensure_mode(movement.get("mode_of_payment"))
        if not row:
            continue
        amount = flt(movement.get("amount") or 0)
        movement_type = movement.get("movement_type")
        if movement_type == "Cash In":
            row.expected_amount += amount
        elif movement_type in ("Cash Expense", "Cash Withdrawal"):
            row.expected_amount -= amount

    for mode in order:
        row = rows[mode]
        previous = existing.get(mode)
        if initialize_closing_amounts and mode in opening_modes:
            row.closing_amount = row.expected_amount
        elif previous:
            row.closing_amount = flt(previous.closing_amount)
        else:
            row.closing_amount = 0.0
        row.difference = flt(row.closing_amount) - flt(row.expected_amount)

    return [rows[mode] for mode in order]


def build_cash_movement_closing_snapshot(closing_entry, initialize_closing_amounts=False):
    if not closing_entry.get("pos_opening_entry"):
        return frappe._dict()
    if not closing_entry.get("period_start_date") or not closing_entry.get("period_end_date"):
        return frappe._dict()

    _validate_context(closing_entry)
    native = get_invoices(
        closing_entry.get("period_start_date"),
        closing_entry.get("period_end_date"),
        closing_entry.get("pos_profile"),
        closing_entry.get("user"),
    )
    movements = _get_cash_movements(closing_entry)

    return frappe._dict(
        {
            "payment_reconciliation": _build_payment_reconciliation(
                closing_entry,
                native.get("payments") or [],
                movements,
                initialize_closing_amounts=bool(cint(initialize_closing_amounts)),
            ),
            "wmn_cash_movements": _build_cash_movement_rows(movements),
        }
    )


def apply_cash_movement_to_closing(closing_entry, method=None):
    if cint(closing_entry.get("docstatus") or 0) != 0:
        return
    if not closing_entry.get("pos_opening_entry"):
        return

    snapshot = build_cash_movement_closing_snapshot(closing_entry, initialize_closing_amounts=False)
    if not snapshot:
        return

    closing_entry.set("payment_reconciliation", snapshot.get("payment_reconciliation") or [])
    if closing_entry.meta.has_field("wmn_cash_movements"):
        closing_entry.set("wmn_cash_movements", snapshot.get("wmn_cash_movements") or [])


@frappe.whitelist()
def get_cash_movement_closing_snapshot(doc, initialize_closing_amounts=0):
    closing_entry = frappe.parse_json(doc) if isinstance(doc, str) else doc
    closing_entry = frappe.get_doc(closing_entry)
    return build_cash_movement_closing_snapshot(
        closing_entry,
        initialize_closing_amounts=bool(cint(initialize_closing_amounts)),
    )
