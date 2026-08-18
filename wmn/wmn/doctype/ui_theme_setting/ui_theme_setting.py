# Copyright (c) 2026, Shams Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class UIThemeSetting(Document):
    """Global Single DocType that controls whether themes are enabled and which theme is active."""

    def validate(self):
        if self.enable_themes and not self.active_theme:
            frappe.throw(frappe._("Please select an Active Theme before enabling themes."))
