# Copyright (c) 2026, Shams Solutions and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class UITheme(Document):
    """Stores one reusable UI theme and its CSS source."""

    def validate(self):
        self._validate_theme_name()
        self._normalize_css()

    def _validate_theme_name(self):
        if not self.theme_name or not self.theme_name.strip():
            frappe.throw(frappe._("Theme Name is required."))

        self.theme_name = self.theme_name.strip()

    def _normalize_css(self):
        # Keep CSS exactly as authored except for harmless outer whitespace.
        if self.custom_css:
            self.custom_css = self.custom_css.strip()
