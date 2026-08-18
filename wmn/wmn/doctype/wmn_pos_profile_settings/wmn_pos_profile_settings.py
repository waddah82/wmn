# Copyright (c) 2026, WMN and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class WMNPOSProfileSettings(Document):
    def validate(self):
        if not self.pos_profile:
            frappe.throw(_("POS Profile is required."))

        duplicate = frappe.db.get_value(
            "WMN POS Profile Settings",
            {"pos_profile": self.pos_profile, "name": ["!=", self.name or ""]},
            "name",
        )
        if duplicate:
            frappe.throw(
                _("WMN POS Profile Settings already exists for POS Profile {0}: {1}").format(
                    self.pos_profile, duplicate
                )
            )
