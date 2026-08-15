import frappe
from frappe.model.document import Document
from frappe.utils import flt


class WMNPOSSupervisor(Document):
    def validate(self):
        if not self.display_name and self.supervisor_user:
            self.display_name = frappe.db.get_value("User", self.supervisor_user, "full_name") or self.supervisor_user

        self.max_item_discount_percentage = flt(self.max_item_discount_percentage)
        self.max_transaction_discount_percentage = flt(self.max_transaction_discount_percentage)
        self.max_cash_in_amount = flt(self.max_cash_in_amount)
        self.max_cash_expense_amount = flt(self.max_cash_expense_amount)
        self.max_cash_withdrawal_amount = flt(self.max_cash_withdrawal_amount)

        if self.max_item_discount_percentage < 0:
            frappe.throw("Maximum Item Discount % cannot be negative")

        if self.max_transaction_discount_percentage < 0:
            frappe.throw("Maximum Transaction Discount % cannot be negative")

        for fieldname, label in (
            ("max_cash_in_amount", "Maximum Cash In Amount"),
            ("max_cash_expense_amount", "Maximum Cash Expense Amount"),
            ("max_cash_withdrawal_amount", "Maximum Cash Withdrawal Amount"),
        ):
            if flt(self.get(fieldname)) < 0:
                frappe.throw(f"{label} cannot be negative")
