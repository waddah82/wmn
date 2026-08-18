import frappe
from frappe import _
from frappe.model.document import Document


class WMNPOSMenuSettings(Document):
    def validate(self):
        seen = set()
        for row in self.menu_items or []:
            doctype = (row.doctype_name or "").strip()
            if not doctype:
                continue
            if doctype in seen:
                frappe.throw(_("DocType {0} is duplicated in the POS menu.").format(frappe.bold(doctype)))
            seen.add(doctype)
            meta = frappe.get_meta(doctype)
            if meta.istable:
                frappe.throw(_("Child DocType {0} cannot be added to the POS menu.").format(frappe.bold(doctype)))
            row.section = (row.section or "Setup").strip() or "Setup"
            row.display_order = max(int(row.display_order or 0), 0)
