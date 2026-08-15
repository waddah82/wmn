import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate


class WMNPOSCoupon(Document):
    def validate(self):
        self.coupon_code = str(self.coupon_code or "").strip().upper()
        self.coupon_name = str(self.coupon_name or self.coupon_code or "").strip()
        self.coupon_type = self.coupon_type or "Promotional"
        self.discount_type = self.discount_type or "Percentage"
        self.apply_on = self.apply_on or "Grand Total"

        if not self.coupon_code:
            frappe.throw(_("Coupon Code is required"))

        if self.coupon_type == "Gift Card":
            self.maximum_use = 1
            if not self.customer:
                frappe.throw(_("Please select the customer for Gift Card."))

        if self.valid_from and self.valid_upto and getdate(self.valid_upto) < getdate(self.valid_from):
            frappe.throw(_("Valid Upto cannot be before Valid From"))

        if flt(self.minimum_cart_amount or 0) < 0:
            frappe.throw(_("Minimum Cart Amount cannot be negative"))

        if flt(self.maximum_discount_amount or 0) < 0:
            frappe.throw(_("Maximum Discount Amount cannot be negative"))

        if cint(self.maximum_use or 0) < 0:
            frappe.throw(_("Maximum Use cannot be negative"))

        if self.discount_type == "Percentage":
            percentage = flt(self.discount_percentage or 0)
            if percentage <= 0 or percentage > 100:
                frappe.throw(_("Discount Percentage must be greater than 0 and not more than 100"))
            self.discount_amount = 0
        else:
            if flt(self.discount_amount or 0) <= 0:
                frappe.throw(_("Discount Amount must be greater than zero"))
            self.discount_percentage = 0
