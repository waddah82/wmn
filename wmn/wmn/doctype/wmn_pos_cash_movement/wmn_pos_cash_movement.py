import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class WMNPOSCashMovement(Document):
    def validate(self):
        self.amount = flt(self.amount)
        if self.amount <= 0:
            frappe.throw(_("Cash Movement Amount must be greater than zero"))

        if self.movement_type not in ("Cash In", "Cash Expense", "Cash Withdrawal"):
            frappe.throw(_("Invalid Cash Movement Type"))

        if not str(self.mode_of_payment or "").strip():
            frappe.throw(_("Mode of Payment is required"))

        if not str(self.reason or "").strip():
            frappe.throw(_("Reason is required"))

    def on_cancel(self):
        self.status = "Cancelled"
        if not self.journal_entry:
            return

        journal_entry = frappe.get_doc("Journal Entry", self.journal_entry)
        if journal_entry.docstatus == 1:
            journal_entry.flags.ignore_permissions = True
            journal_entry.ignore_linked_doctypes = tuple(
                set(getattr(journal_entry, "ignore_linked_doctypes", ()) or ()) | {"WMN POS Cash Movement"}
            )
            journal_entry.cancel()
