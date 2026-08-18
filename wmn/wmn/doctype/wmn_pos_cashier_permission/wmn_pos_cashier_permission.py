import frappe
from frappe.model.document import Document
from frappe.utils import flt


class WMNPOSCashierPermission(Document):
    def validate(self):
        if not self.display_name and self.cashier_user:
            self.display_name = frappe.db.get_value("User", self.cashier_user, "full_name") or self.cashier_user

        self.max_item_discount_percentage = flt(self.max_item_discount_percentage)
        self.max_transaction_discount_percentage = flt(self.max_transaction_discount_percentage)
        self.max_rate_reduction_percentage = flt(self.max_rate_reduction_percentage)
        self.max_return_amount = flt(self.max_return_amount)
        self.max_cash_in_amount = flt(self.max_cash_in_amount)
        self.max_cash_expense_amount = flt(self.max_cash_expense_amount)
        self.max_cash_withdrawal_amount = flt(self.max_cash_withdrawal_amount)

        for fieldname, label in (
            ("max_item_discount_percentage", "Maximum Item Discount %"),
            ("max_transaction_discount_percentage", "Maximum Transaction Discount %"),
            ("max_rate_reduction_percentage", "Maximum Rate Reduction %"),
        ):
            value = flt(self.get(fieldname))
            if value < 0 or value > 100:
                frappe.throw(f"{label} must be between 0 and 100")

        for fieldname, label in (
            ("max_return_amount", "Maximum Return Amount"),
            ("max_cash_in_amount", "Maximum Cash In Amount"),
            ("max_cash_expense_amount", "Maximum Cash Expense Amount"),
            ("max_cash_withdrawal_amount", "Maximum Cash Withdrawal Amount"),
        ):
            if flt(self.get(fieldname)) < 0:
                frappe.throw(f"{label} cannot be negative")

        if self.cashier_user:
            rows = frappe.get_all(
                "WMN POS Cashier Permission",
                filters={"cashier_user": self.cashier_user},
                fields=["name", "pos_profile"],
                limit_page_length=0,
            )
            current_profile = str(self.pos_profile or "").strip()
            for row in rows:
                if row.name == self.name:
                    continue
                if str(row.pos_profile or "").strip() == current_profile:
                    frappe.throw("A cashier permission already exists for this user and POS Profile.")
