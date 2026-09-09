import frappe
from frappe import _
from frappe.model.document import Document


class SalesInvoiceOverride(Document):

    def validate_pos_opening_entry(self):
        opening_entries = frappe.get_all(
            "POS Opening Entry",
            fields=["name", "period_start_date"],
            filters={
                "pos_profile": self.pos_profile,
                "status": "Open",
            },
            order_by="period_start_date desc",
        )


        if not opening_entries:
            frappe.throw(
                title=_("POS Opening Entry Missing"),
                msg=_(
                    "No open POS Opening Entry found for POS Profile {0}."
                ).format(
                    frappe.bold(self.pos_profile)
                ),
            )


        if len(opening_entries) > 1:
            frappe.throw(
                title=_("Multiple POS Opening Entry"),
                msg=_(
                    "POS Profile - {0} has multiple open POS Opening Entries. "
                    "Please close or cancel the existing entries before proceeding."
                ).format(self.pos_profile),
            )

        # IMPORTANT:
        # We intentionally do NOT validate that period_start_date == today().
        # The POS Opening Entry remains valid until it is closed.