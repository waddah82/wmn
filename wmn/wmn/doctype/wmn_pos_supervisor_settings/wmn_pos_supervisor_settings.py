import frappe
from frappe.model.document import Document


class WMNPOSSupervisorSettings(Document):
    def validate(self):
        self.min_pin_length = max(4, min(int(self.min_pin_length or 4), 12))
        self.pin_iterations = max(100000, min(int(self.pin_iterations or 200000), 1000000))
