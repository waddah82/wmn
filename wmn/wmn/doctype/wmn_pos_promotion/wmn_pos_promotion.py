import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, flt, getdate


class WMNPOSPromotion(Document):
    def validate(self):
        self.promotion_code = str(self.promotion_code or "").strip().upper()
        self.promotion_name = str(self.promotion_name or self.promotion_code or "").strip()
        self.apply_scope = self.apply_scope or "Transaction"
        self.promotion_type = self.promotion_type or "Percentage Discount"
        self.priority = cint(self.priority or 0)

        if not self.promotion_code:
            frappe.throw(_("Promotion Code is required"))

        if self.valid_from and self.valid_upto and getdate(self.valid_upto) < getdate(self.valid_from):
            frappe.throw(_("Valid Upto cannot be before Valid From"))

        if self.start_time and self.end_time and str(self.start_time) == str(self.end_time):
            frappe.throw(_("Start Time and End Time cannot be the same"))

        if flt(self.minimum_cart_amount or 0) < 0:
            frappe.throw(_("Minimum Cart Amount cannot be negative"))

        if flt(self.minimum_qty or 0) < 0:
            frappe.throw(_("Minimum Target Quantity cannot be negative"))

        if flt(self.maximum_discount_amount or 0) < 0:
            frappe.throw(_("Maximum Discount Amount cannot be negative"))

        if cint(self.max_applications or 0) < 0:
            frappe.throw(_("Maximum Applications Per Invoice cannot be negative"))

        if self.apply_scope == "Item" and not self.item_code:
            frappe.throw(_("Item is required when Apply Scope is Item"))
        if self.apply_scope == "Item Group" and not self.item_group:
            frappe.throw(_("Item Group is required when Apply Scope is Item Group"))
        if self.apply_scope == "Brand" and not self.brand:
            frappe.throw(_("Brand is required when Apply Scope is Brand"))

        if self.promotion_type == "Percentage Discount":
            percentage = flt(self.discount_percentage or 0)
            if percentage <= 0 or percentage > 100:
                frappe.throw(_("Discount Percentage must be greater than 0 and not more than 100"))
            self.discount_amount = 0
            self.buy_qty = 0
            self.free_qty = 0
            self.free_item = None
        elif self.promotion_type == "Amount Discount":
            if flt(self.discount_amount or 0) <= 0:
                frappe.throw(_("Discount Amount must be greater than zero"))
            self.discount_percentage = 0
            self.buy_qty = 0
            self.free_qty = 0
            self.free_item = None
        elif self.promotion_type == "Buy X Get Y":
            if flt(self.buy_qty or 0) <= 0:
                frappe.throw(_("Buy Quantity must be greater than zero"))
            if flt(self.free_qty or 0) <= 0:
                frappe.throw(_("Free Quantity must be greater than zero"))
            self.discount_percentage = 0
            self.discount_amount = 0
        elif self.promotion_type == "Free Item":
            if not self.free_item:
                frappe.throw(_("Free Item is required for Free Item promotion"))
            if flt(self.free_qty or 0) <= 0:
                frappe.throw(_("Free Quantity must be greater than zero"))
            self.discount_percentage = 0
            self.discount_amount = 0
            self.buy_qty = 0
        else:
            frappe.throw(_("Unsupported Promotion Type: {0}").format(self.promotion_type))
