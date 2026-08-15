import frappe
from frappe import _
from frappe.model.document import Document


class WMNPOSDialogScript(Document):
    def validate(self):
        meta = frappe.get_meta(self.target_doctype)
        if meta.istable:
            frappe.throw(_("Dialog scripts cannot target child DocTypes."))
        self.script_name = (self.script_name or "").strip()
        if not self.script_name:
            frappe.throw(_("Script Name is required."))
        self.execution_order = max(int(self.execution_order or 0), 0)
