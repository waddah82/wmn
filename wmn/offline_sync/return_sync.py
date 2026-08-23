import frappe
from frappe import _
from frappe.utils import cint, flt
from erpnext.controllers.sales_and_purchase_return import make_return_doc


RETURN_SYNC_MODE = "erpnext_reconstructed_return"
_AMOUNT_TOLERANCE = 0.01
_QTY_TOLERANCE = 0.000001

_HEADER_INTENT_FIELDS = (
    "posting_date",
    "posting_time",
    "set_posting_time",
    "remarks",
    "set_warehouse",
    "wmn_receipt_no",
    "wmn_invoice_uid",
    "wmn_receipt_opening_entry",
)

_ITEM_INTENT_FIELDS = (
    "warehouse",
    "batch_no",
    "serial_no",
    "use_serial_batch_fields",
)


def _as_text(value):
    return str(value or "").strip()


def _amount_equal(left, right, tolerance=_AMOUNT_TOLERANCE):
    return abs(flt(left) - flt(right)) <= tolerance


def _resolve_source_invoice(invoice, doctype, offline_sync_field):
    return_against = _as_text(invoice.get("return_against"))
    if not return_against:
        frappe.throw(_("Return Against is required for an offline return."))

    source_name = return_against
    if not frappe.db.exists(doctype, source_name):
        source_name = frappe.db.get_value(
            doctype,
            {offline_sync_field: return_against},
            "name",
        )

    if not source_name:
        frappe.throw(
            _("The source invoice {0} must be synchronized before its return can be synchronized.").format(
                return_against
            )
        )

    source_doc = frappe.get_doc(doctype, source_name)
    if source_doc.docstatus != 1:
        frappe.throw(
            _("The source invoice {0} must be submitted before its return can be synchronized.").format(
                source_doc.name
            )
        )
    if cint(source_doc.get("is_return") or 0):
        frappe.throw(_("A return cannot be synchronized against another return invoice."))

    for fieldname in ("company", "customer", "currency"):
        intent_value = _as_text(invoice.get(fieldname))
        source_value = _as_text(source_doc.get(fieldname))
        if intent_value and source_value and intent_value != source_value:
            frappe.throw(
                _("Offline return {0} does not match source invoice {1}: {2} differs.").format(
                    invoice.get("name") or "", source_doc.name, fieldname
                )
            )

    return source_doc


def _return_reference_field(doctype):
    return frappe.scrub(doctype) + "_item"


def _resolve_source_row(source_doc, intent_row, reference_field, position):
    item_code = _as_text(intent_row.get("item_code"))
    if not item_code:
        frappe.throw(_("Offline return row #{0} has no Item Code.").format(position))

    source_items = list(source_doc.get("items") or [])
    source_by_name = {_as_text(row.name): row for row in source_items if row.get("name")}

    current_reference = _as_text(intent_row.get(reference_field))
    referenced = source_by_name.get(current_reference)
    if referenced and _as_text(referenced.item_code) == item_code:
        return referenced

    intent_idx = cint(intent_row.get("idx") or 0)
    if intent_idx:
        by_idx = [
            row
            for row in source_items
            if cint(row.get("idx") or 0) == intent_idx and _as_text(row.item_code) == item_code
        ]
        if len(by_idx) == 1:
            return by_idx[0]

    candidates = [row for row in source_items if _as_text(row.item_code) == item_code]
    if len(candidates) == 1:
        return candidates[0]

    frappe.throw(
        _("Unable to map offline return row #{0} for Item {1} to one unique row in {2}.").format(
            intent_idx or position, item_code, source_doc.name
        )
    )


def _build_item_intent_map(source_doc, invoice, doctype):
    reference_field = _return_reference_field(doctype)
    result = {}

    for position, intent_row in enumerate(invoice.get("items") or [], start=1):
        if not isinstance(intent_row, dict):
            frappe.throw(_("Offline return row #{0} is invalid.").format(position))

        qty = flt(intent_row.get("qty") or 0)
        if qty >= 0:
            frappe.throw(
                _("Offline return row #{0} must have a negative quantity.").format(
                    cint(intent_row.get("idx") or position)
                )
            )

        source_row = _resolve_source_row(source_doc, intent_row, reference_field, position)
        source_row_name = _as_text(source_row.name)
        if source_row_name in result:
            frappe.throw(
                _("Offline return contains the same source row more than once: {0}.").format(
                    source_row_name
                )
            )

        intent_uom = _as_text(intent_row.get("uom"))
        source_uom = _as_text(source_row.get("uom"))
        if intent_uom and source_uom and intent_uom != source_uom:
            frappe.throw(
                _("Offline return row #{0} UOM does not match source invoice {1}.").format(
                    cint(intent_row.get("idx") or position), source_doc.name
                )
            )

        result[source_row_name] = intent_row

    if not result:
        frappe.throw(_("At least one returned item is required."))

    return result


def _apply_header_intent(return_doc, invoice, source_doc):
    requested_pos_profile = _as_text(invoice.get("pos_profile"))
    if requested_pos_profile:
        profile_company = frappe.db.get_value("POS Profile", requested_pos_profile, "company")
        if not profile_company:
            frappe.throw(_("POS Profile {0} does not exist.").format(requested_pos_profile))
        if _as_text(profile_company) != _as_text(source_doc.company):
            frappe.throw(
                _("POS Profile {0} does not belong to company {1}.").format(
                    requested_pos_profile, source_doc.company
                )
            )
        return_doc.pos_profile = requested_pos_profile

    for fieldname in _HEADER_INTENT_FIELDS:
        if not return_doc.meta.has_field(fieldname):
            continue
        value = invoice.get(fieldname)
        if value not in (None, ""):
            return_doc.set(fieldname, value)


def _apply_item_intent(return_doc, source_doc, intent_map, doctype):
    reference_field = _return_reference_field(doctype)
    native_rows = list(return_doc.get("items") or [])
    native_by_source = {
        _as_text(row.get(reference_field)): row
        for row in native_rows
        if _as_text(row.get(reference_field))
    }

    selected_rows = []
    for source_row_name, intent_row in intent_map.items():
        native_row = native_by_source.get(source_row_name)
        if not native_row:
            frappe.throw(
                _("Item row {0} is no longer available for return against {1}.").format(
                    source_row_name, source_doc.name
                )
            )

        requested_qty = flt(intent_row.get("qty") or 0)
        max_return_qty = abs(flt(native_row.get("qty") or 0))
        if abs(requested_qty) - max_return_qty > _QTY_TOLERANCE:
            frappe.throw(
                _("Cannot return quantity {0} for Item {1}; ERPNext allows at most {2}.").format(
                    abs(requested_qty), native_row.item_code, max_return_qty
                )
            )

        native_qty = flt(native_row.get("qty") or 0)
        native_stock_qty = flt(native_row.get("stock_qty") or 0)
        stock_ratio = (
            native_stock_qty / native_qty
            if abs(native_qty) > _QTY_TOLERANCE
            else flt(native_row.get("conversion_factor") or 1)
        )

        native_row.qty = requested_qty
        if native_row.meta.has_field("stock_qty"):
            native_row.stock_qty = requested_qty * stock_ratio

        for fieldname in _ITEM_INTENT_FIELDS:
            if not native_row.meta.has_field(fieldname):
                continue
            if fieldname not in intent_row:
                continue
            value = intent_row.get(fieldname)
            if fieldname in ("batch_no", "serial_no", "warehouse") and value in (None, ""):
                continue
            native_row.set(fieldname, value)

        selected_rows.append(native_row)

    for native_row in list(return_doc.get("items") or []):
        if native_row not in selected_rows:
            return_doc.remove(native_row)

    for idx, row in enumerate(return_doc.get("items") or [], start=1):
        row.idx = idx

    if not return_doc.get("items"):
        frappe.throw(_("ERPNext reconstruction produced no returnable items."))


def _payment_template_map(return_doc, source_doc):
    templates = {}
    for row in list(return_doc.get("payments") or []) + list(source_doc.get("payments") or []):
        mode = _as_text(row.get("mode_of_payment"))
        if mode and mode not in templates:
            templates[mode] = {
                "mode_of_payment": mode,
                "type": row.get("type"),
                "account": row.get("account"),
                "default": cint(row.get("default") or 0),
            }
    return templates


def _resolve_payment_template(mode_of_payment, return_doc, source_doc, templates):
    template = dict(templates.get(mode_of_payment) or {})
    profile_name = _as_text(return_doc.get("pos_profile"))

    profile_row = None
    if profile_name:
        profile_row = frappe.db.get_value(
            "POS Payment Method",
            {"parent": profile_name, "mode_of_payment": mode_of_payment},
            ["mode_of_payment", "default", "allow_in_returns"],
            as_dict=True,
        )

    if not template:
        if not profile_row or not cint(profile_row.get("allow_in_returns") or 0):
            frappe.throw(
                _("Mode of Payment {0} is not allowed for this return.").format(mode_of_payment)
            )
        template["mode_of_payment"] = mode_of_payment
        template["default"] = cint(profile_row.get("default") or 0)

    account = _as_text(template.get("account"))
    if not account:
        account = _as_text(
            frappe.db.get_value(
                "Mode of Payment Account",
                {"parent": mode_of_payment, "company": source_doc.company},
                "default_account",
            )
        )
    if not account:
        frappe.throw(
            _("No account is configured for Mode of Payment {0} in company {1}.").format(
                mode_of_payment, source_doc.company
            )
        )

    mop_type = template.get("type") or frappe.db.get_value("Mode of Payment", mode_of_payment, "type")
    return {
        "mode_of_payment": mode_of_payment,
        "type": mop_type,
        "account": account,
        "default": cint(template.get("default") or 0),
    }


def _apply_payment_intent(return_doc, source_doc, invoice):
    offline_payments = invoice.get("payments")
    offline_paid_amount = flt(invoice.get("paid_amount") or 0)
    source_paid_amount = flt(source_doc.get("paid_amount") or 0)

    if offline_payments is None:
        if abs(offline_paid_amount) > _AMOUNT_TOLERANCE or abs(source_paid_amount) > _AMOUNT_TOLERANCE:
            frappe.throw(
                _("Offline return payment breakdown is required; ERPNext will not infer user refund input.")
            )
        offline_payments = []

    if not isinstance(offline_payments, list):
        frappe.throw(_("Offline return payments are invalid."))

    amounts_by_mode = {}
    for position, payment in enumerate(offline_payments, start=1):
        if not isinstance(payment, dict):
            frappe.throw(_("Offline return payment row #{0} is invalid.").format(position))

        amount = flt(payment.get("amount") or 0)
        if amount > _AMOUNT_TOLERANCE:
            frappe.throw(
                _("Return payment must be zero or negative; row #{0} contains {1}.").format(
                    position, amount
                )
            )
        if abs(amount) <= _AMOUNT_TOLERANCE:
            continue

        mode = _as_text(payment.get("mode_of_payment"))
        if not mode:
            frappe.throw(_("Mode of Payment is required for refund row #{0}.").format(position))
        amounts_by_mode[mode] = flt(amounts_by_mode.get(mode) or 0) + amount

    total_payment = sum(amounts_by_mode.values())
    if not _amount_equal(total_payment, offline_paid_amount):
        frappe.throw(
            _("Offline return paid amount {0} does not match payment rows total {1}.").format(
                offline_paid_amount, total_payment
            )
        )

    if abs(source_paid_amount) <= _AMOUNT_TOLERANCE and abs(total_payment) > _AMOUNT_TOLERANCE:
        frappe.throw(_("A credit sale return cannot create a cash refund."))

    templates = _payment_template_map(return_doc, source_doc)
    return_doc.set("payments", [])
    conversion_rate = flt(return_doc.get("conversion_rate") or source_doc.get("conversion_rate") or 1)

    for mode_of_payment, amount in amounts_by_mode.items():
        template = _resolve_payment_template(
            mode_of_payment, return_doc, source_doc, templates
        )
        return_doc.append(
            "payments",
            {
                **template,
                "amount": amount,
                "base_amount": amount * conversion_rate,
            },
        )

    return_doc.paid_amount = total_payment
    if return_doc.meta.has_field("base_paid_amount"):
        return_doc.base_paid_amount = total_payment * conversion_rate
    if return_doc.meta.has_field("change_amount"):
        return_doc.change_amount = 0
    if return_doc.meta.has_field("base_change_amount"):
        return_doc.base_change_amount = 0


def _apply_offline_identity(return_doc, offline_id, offline_sync_field):
    if not return_doc.meta.has_field(offline_sync_field):
        frappe.throw(
            _("WMN Offline Sync field is missing on {0}: {1}.").format(
                return_doc.doctype, offline_sync_field
            )
        )
    return_doc.set(offline_sync_field, offline_id)


def _assert_offline_financial_expectation(invoice, return_doc):
    # Offline financial values are never written to the server document. They are
    # used only as a fail-closed consistency check against ERPNext reconstruction.
    for fieldname in (
        "total",
        "net_total",
        "discount_amount",
        "grand_total",
        "rounded_total",
    ):
        if fieldname not in invoice or invoice.get(fieldname) is None:
            continue
        offline_value = flt(invoice.get(fieldname) or 0)
        server_value = flt(return_doc.get(fieldname) or 0)
        if not _amount_equal(offline_value, server_value):
            frappe.throw(
                _(
                    "Offline return differs from ERPNext reconstruction in {0}: "
                    "offline={1}, server={2}. The return was not synchronized."
                ).format(fieldname, offline_value, server_value)
            )


def _recalculate_and_validate_safety(return_doc, invoice):
    return_doc.ignore_pricing_rule = 1
    if return_doc.meta.has_field("pricing_rules"):
        return_doc.set("pricing_rules", [])
    return_doc.run_method("calculate_taxes_and_totals")

    _assert_offline_financial_expectation(invoice, return_doc)

    grand_total = flt(return_doc.get("grand_total") or 0)
    if grand_total >= -_AMOUNT_TOLERANCE:
        frappe.throw(
            _("ERPNext reconstructed return has an invalid Grand Total: {0}.").format(grand_total)
        )

    paid_amount = flt(return_doc.get("paid_amount") or 0)
    if paid_amount > _AMOUNT_TOLERANCE:
        frappe.throw(_("ERPNext reconstructed return has a positive Paid Amount."))
    if abs(paid_amount) - abs(grand_total) > _AMOUNT_TOLERANCE:
        frappe.throw(
            _("Refund amount {0} cannot exceed ERPNext return total {1}.").format(
                abs(paid_amount), abs(grand_total)
            )
        )


def _return_snapshot(doc, doctype):
    reference_field = _return_reference_field(doctype)
    return {
        "return_against": _as_text(doc.get("return_against")),
        "grand_total": flt(doc.get("grand_total") or 0),
        "discount_amount": flt(doc.get("discount_amount") or 0),
        "paid_amount": flt(doc.get("paid_amount") or 0),
        "items": [
            (
                _as_text(row.get(reference_field)),
                _as_text(row.get("item_code")),
                flt(row.get("qty") or 0),
                flt(row.get("rate") or 0),
                flt(row.get("net_rate") or 0),
                flt(row.get("net_amount") or 0),
            )
            for row in doc.get("items") or []
        ],
        "payments": sorted(
            (
                _as_text(row.get("mode_of_payment")),
                flt(row.get("amount") or 0),
            )
            for row in doc.get("payments") or []
            if abs(flt(row.get("amount") or 0)) > _AMOUNT_TOLERANCE
        ),
    }


def _assert_existing_draft_matches(existing, reconstructed, doctype):
    left = _return_snapshot(existing, doctype)
    right = _return_snapshot(reconstructed, doctype)

    if left["return_against"] != right["return_against"]:
        frappe.throw(_("Existing server return Draft points to a different source invoice."))

    if left["items"] != right["items"] or left["payments"] != right["payments"]:
        frappe.throw(
            _(
                "Existing server return Draft no longer matches ERPNext reconstruction. "
                "Review or delete the Draft manually before retrying sync."
            )
        )

    for fieldname in ("grand_total", "discount_amount", "paid_amount"):
        if not _amount_equal(left[fieldname], right[fieldname]):
            frappe.throw(
                _(
                    "Existing server return Draft differs from ERPNext reconstruction in {0}. "
                    "Review it manually before retrying sync."
                ).format(fieldname)
            )


def _build_reconstructed_return(invoice, doctype, offline_id, offline_sync_field):
    source_doc = _resolve_source_invoice(invoice, doctype, offline_sync_field)
    intent_map = _build_item_intent_map(source_doc, invoice, doctype)

    return_doc = make_return_doc(doctype, source_doc.name)
    _apply_header_intent(return_doc, invoice, source_doc)
    _apply_item_intent(return_doc, source_doc, intent_map, doctype)
    _apply_payment_intent(return_doc, source_doc, invoice)
    _apply_offline_identity(return_doc, offline_id, offline_sync_field)
    _recalculate_and_validate_safety(return_doc, invoice)

    return return_doc, source_doc


def _result(doc, status):
    return {
        "status": status,
        "name": doc.name,
        "docstatus": doc.docstatus,
        "invoice_status": doc.get("status"),
        "paid_amount": flt(doc.get("paid_amount") or 0),
        "outstanding_amount": flt(doc.get("outstanding_amount") or 0),
        "grand_total": flt(doc.get("grand_total") or 0),
        "discount_amount": flt(doc.get("discount_amount") or 0),
        "sync_mode": RETURN_SYNC_MODE,
    }


def sync_offline_return_intent(invoice, doctype, offline_id, submit_invoice, offline_sync_field):
    """Reconstruct a return from the submitted server source and apply only offline user intent."""
    existing_name = frappe.db.exists(doctype, {offline_sync_field: offline_id})
    if existing_name:
        existing = frappe.get_doc(doctype, existing_name)
        if existing.docstatus == 2:
            frappe.throw(_("Offline return {0} is cancelled on the server.").format(existing.name))
        if existing.docstatus == 1:
            return _result(existing, "already_synced")

    reconstructed, _source_doc = _build_reconstructed_return(
        invoice, doctype, offline_id, offline_sync_field
    )
    reconstructed.flags.ignore_permissions = False

    if existing_name:
        existing = frappe.get_doc(doctype, existing_name)
        _assert_existing_draft_matches(existing, reconstructed, doctype)
        if submit_invoice:
            existing.submit()
            existing.reload()
            return _result(existing, "submitted")
        existing.reload()
        return _result(existing, "draft_synced")

    try:
        reconstructed.insert()
    except frappe.UniqueValidationError:
        race_name = frappe.db.exists(doctype, {offline_sync_field: offline_id})
        if not race_name:
            raise
        race_doc = frappe.get_doc(doctype, race_name)
        if race_doc.docstatus == 2:
            frappe.throw(_("Offline return {0} is cancelled on the server.").format(race_doc.name))
        if race_doc.docstatus == 1:
            return _result(race_doc, "already_synced")
        _assert_existing_draft_matches(race_doc, reconstructed, doctype)
        reconstructed = race_doc

    if reconstructed.docstatus == 0 and submit_invoice:
        reconstructed.submit()

    reconstructed.reload()
    return _result(
        reconstructed,
        "submitted" if reconstructed.docstatus == 1 else "draft_synced",
    )
