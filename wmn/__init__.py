import frappe
from erpnext.accounts.doctype.sales_invoice.sales_invoice import SalesInvoice
from erpnext.accounts.doctype.sales_invoice.sales_invoice import update_multi_mode_option

__version__ = "0.0.1"


@frappe.whitelist()
def reset_mode_of_payments(self):
    if self.pos_profile:
        pos_profile = frappe.get_cached_doc("POS Profile", self.pos_profile)
        update_multi_mode_option(self, pos_profile)
        self.paid_amount = 0


if not hasattr(SalesInvoice, "reset_mode_of_payments"):
    SalesInvoice.reset_mode_of_payments = reset_mode_of_payments
