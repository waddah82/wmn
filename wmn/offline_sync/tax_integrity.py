import frappe


PREVIOUS_ROW_CHARGE_TYPES = {
    "On Previous Row Amount",
    "On Previous Row Total",
}


def normalize_tax_row_reference(row):
    """Normalize ERPNext tax row references without changing tax business values."""
    if not isinstance(row, dict):
        return row

    charge_type = str(row.get("charge_type") or "On Net Total").strip()
    reference = str(row.get("row_id") or "").strip()

    if charge_type not in PREVIOUS_ROW_CHARGE_TYPES or reference == "0":
        row["row_id"] = ""
    else:
        row["row_id"] = reference

    return row


def normalize_invoice_tax_payload(invoice):
    """Keep offline invoice tax rows compatible with ERPNext's native tax contract."""
    if not isinstance(invoice, dict):
        return invoice

    normalized_rows = []
    for row in invoice.get("taxes") or []:
        if isinstance(row, dict):
            row = dict(row)
        normalized_rows.append(normalize_tax_row_reference(row))

    if "taxes" in invoice:
        invoice["taxes"] = normalized_rows

    return invoice


def repair_invalid_sales_tax_row_references():
    """Repair persisted tax references that ERPNext itself defines as invalid.

    `row_id` is a Data field. Older WMN offline payloads wrote numeric 0 for
    non-reference tax rows; after persistence it can reload as the truthy text
    "0" and break native return reconstruction. Clearing row_id for charge
    types that do not reference previous rows, and clearing the invalid text
    value "0", restores ERPNext's canonical invariant without altering tax
    amounts, rates, or accounts.
    """
    if not frappe.db.table_exists("Sales Taxes and Charges", cached=False):
        return 0

    invalid_names = frappe.db.sql(
        """
        select name
          from `tabSales Taxes and Charges`
         where parenttype in ('Sales Invoice', 'POS Invoice')
           and parentfield = 'taxes'
           and ifnull(row_id, '') != ''
           and (trim(row_id) = '0'
                or charge_type not in ('On Previous Row Amount', 'On Previous Row Total'))
        """,
        pluck=True,
    )

    if not invalid_names:
        return 0

    frappe.db.sql(
        """
        update `tabSales Taxes and Charges`
           set row_id = ''
         where parenttype in ('Sales Invoice', 'POS Invoice')
           and parentfield = 'taxes'
           and ifnull(row_id, '') != ''
           and (trim(row_id) = '0'
                or charge_type not in ('On Previous Row Amount', 'On Previous Row Total'))
        """
    )
    return len(invalid_names)
