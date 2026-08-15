import frappe
from frappe import _
from frappe.model.document import Document


class WMNPOSCashMovementProfile(Document):
    def validate(self):
        if not self.pos_profile:
            return

        profile = frappe.get_cached_doc("POS Profile", self.pos_profile)
        self.company = profile.company
        self.currency = frappe.get_cached_value("Company", self.company, "default_currency")

        for fieldname in (
            "cash_in_offset_account",
            "default_expense_account",
            "withdrawal_offset_account",
        ):
            self._validate_account(fieldname)

        self._validate_cash_payment_methods(profile)

        if self.cost_center:
            company = frappe.db.get_value("Cost Center", self.cost_center, "company")
            if company and company != self.company:
                frappe.throw(_("Cost Center {0} does not belong to Company {1}").format(self.cost_center, self.company))

    def _validate_cash_payment_methods(self, profile):
        valid_cash_modes = []
        for row in getattr(profile, "payments", []) or []:
            mode_of_payment = str(row.mode_of_payment or "").strip()
            if not mode_of_payment:
                continue

            mop = frappe.get_cached_doc("Mode of Payment", mode_of_payment)
            if not mop.enabled or mop.type != "Cash":
                continue

            default_account = ""
            for account_row in getattr(mop, "accounts", []) or []:
                if account_row.company == self.company:
                    default_account = str(account_row.default_account or "").strip()
                    break

            if not default_account:
                continue

            details = frappe.db.get_value(
                "Account",
                default_account,
                ["company", "is_group", "root_type", "account_type", "account_currency"],
                as_dict=True,
            )
            if not details or details.company != self.company or details.is_group:
                continue
            if details.root_type != "Asset" or details.account_type in ("Receivable", "Payable"):
                continue
            if details.account_currency and self.currency and details.account_currency != self.currency:
                continue

            valid_cash_modes.append(mode_of_payment)

        if not valid_cash_modes:
            frappe.throw(
                _(
                    "POS Profile {0} must contain at least one enabled Cash Mode of Payment with a valid default account for Company {1}."
                ).format(self.pos_profile, self.company)
            )

    def _validate_account(self, fieldname):
        account = self.get(fieldname)
        if not account:
            return

        details = frappe.db.get_value(
            "Account",
            account,
            ["company", "is_group", "account_currency", "root_type", "account_type"],
            as_dict=True,
        )
        if not details:
            frappe.throw(_("Account {0} was not found").format(account))
        if details.company != self.company:
            frappe.throw(_("Account {0} does not belong to Company {1}").format(account, self.company))
        if details.is_group:
            frappe.throw(_("Account {0} must be a ledger account").format(account))
        if details.account_type in ("Receivable", "Payable"):
            field_label = self.meta.get_label(fieldname) or fieldname
            frappe.throw(
                _("{0}: Account {1} is a {2} account. Use a non-party ledger account for POS Cash Movement.").format(
                    field_label, account, details.account_type
                )
            )
        if details.account_currency and self.currency and details.account_currency != self.currency:
            frappe.throw(
                _("Account {0} uses currency {1}. POS Cash Movement currently requires Company currency {2}.").format(
                    account, details.account_currency, self.currency
                )
            )

        if fieldname == "default_expense_account" and details.root_type != "Expense":
            frappe.throw(_("Default Expense Account must be an Expense account"))
