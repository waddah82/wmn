import frappe
from frappe.utils import cint

from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import POSClosingEntry

from .pos_closing_entry_methods import (
    apply_wmn_closing_snapshot,
    build_wmn_closing_snapshot,
    validate_wmn_closing_context,
)


class WMNPOSClosingEntry(POSClosingEntry):
    def validate(self):
        super().validate()
        validate_wmn_closing_context(self)
        apply_wmn_closing_snapshot(self)

    @frappe.whitelist()
    def get_wmn_closing_snapshot(self, initialize_closing_amounts=0):
        validate_wmn_closing_context(self)
        return build_wmn_closing_snapshot(
            self,
            initialize_closing_amounts=bool(cint(initialize_closing_amounts)),
        )
