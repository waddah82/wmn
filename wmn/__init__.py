
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
    


def _patch_safe_exec_import():
    import frappe.utils.safe_exec as safe_exec

    original_get_safe_globals = safe_exec.get_safe_globals

    def limited_import(name, globals=None, locals=None, fromlist=(), level=0):
        allowed_modules = {
            "num2words",
        }

        root_name = name.split(".")[0]

        if root_name not in allowed_modules:
            raise ImportError(f"Import of '{name}' is not allowed in safe_exec")

        return __import__(name, globals, locals, fromlist, level)

    def custom_get_safe_globals():
        out = original_get_safe_globals()

        if "__builtins__" not in out or not isinstance(out["__builtins__"], dict):
            out["__builtins__"] = {}

        out["__builtins__"]["__import__"] = __import__

        out["__import__"] = __import__

        return out

    safe_exec.get_safe_globals = custom_get_safe_globals
def _patch_safe_exec_import333():
    import frappe.utils.safe_exec as safe_exec

    original_get_safe_globals = safe_exec.get_safe_globals

    def limited_import(name, globals=None, locals=None, fromlist=(), level=0):
        allowed_modules = {
            "num2words",
        }

        root_name = name.split(".")[0]

        if root_name not in allowed_modules:
            raise ImportError(f"Import of '{name}' is not allowed in safe_exec")

        return __import__(name, globals, locals, fromlist, level)

    def custom_get_safe_globals():
        out = original_get_safe_globals()

        if "__builtins__" not in out or not isinstance(out["__builtins__"], dict):
            out["__builtins__"] = {}

        out["__builtins__"]["__import__"] = limited_import

        out["__import__"] = limited_import

        return out

    safe_exec.get_safe_globals = custom_get_safe_globals


try:
    _patch_safe_exec_import()
except Exception:
    pass