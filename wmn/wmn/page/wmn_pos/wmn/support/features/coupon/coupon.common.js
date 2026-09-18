(function () {
    "use strict";

    function normalizeCode(value) {
        return String(value || "").trim().toUpperCase();
    }

    function todayISO() {
        try {
            if (window.frappe && frappe.datetime && frappe.datetime.get_today) {
                return String(frappe.datetime.get_today() || "").slice(0, 10);
            }
        } catch (e) {}

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    function getPreDiscountNetTotal(doc) {
        const rows = Array.isArray(doc && doc.items) ? doc.items : [];
        if (!rows.length) return flt(doc && (doc.net_total || doc.total) || 0);

        return rows.reduce((sum, row) => {
            const netAmount = flt(row && (row.net_amount ?? row.amount) || 0);
            const distributed = flt(row && row.distributed_discount_amount || 0);
            return sum + netAmount + distributed;
        }, 0);
    }

    function getBaseAmounts(doc) {
        doc = doc || {};
        const activeCoupon = doc.__wmn_pos_coupon_rule || null;
        const promotionInvoiceDiscount = Math.max(0, flt(doc.__wmn_promotion_invoice_discount_total || 0));
        const couponDiscount = activeCoupon
            ? Math.max(0, flt(doc.__wmn_coupon_discount_total ?? activeCoupon.calculated_discount ?? 0))
            : 0;

        // Recover the amount before the parent ERPNext discount, then keep the
        // transaction promotion deducted so coupons are calculated after promotions.
        const preParentNetTotal = getPreDiscountNetTotal(doc);
        const netTotal = Math.max(0, preParentNetTotal - promotionInvoiceDiscount);
        let grandTotal = flt(doc.grand_total || doc.rounded_total || 0);

        if (activeCoupon && (activeCoupon.apply_on || doc.apply_discount_on) === "Grand Total") {
            // Add back only the coupon component. The promotion component must stay
            // deducted because promotion evaluation happens before coupon evaluation.
            grandTotal += couponDiscount;
        } else if (!grandTotal) {
            grandTotal = Math.max(0, flt(doc.net_total || doc.total || 0) - promotionInvoiceDiscount);
        }

        return {
            net_total: netTotal,
            grand_total: grandTotal,
        };
    }

    function calculateDiscount(coupon, baseAmount) {
        coupon = coupon || {};
        const base = Math.max(0, flt(baseAmount || 0));
        let amount = 0;

        if ((coupon.discount_type || "Percentage") === "Percentage") {
            amount = base * flt(coupon.discount_percentage || 0) / 100;
        } else {
            amount = flt(coupon.discount_amount || 0);
        }

        const maximum = flt(coupon.maximum_discount_amount || 0);
        if (maximum > 0) amount = Math.min(amount, maximum);
        return Math.max(0, Math.min(amount, base));
    }

    function isCouponActiveForContext(coupon, doc) {
        coupon = coupon || {};
        doc = doc || {};
        const code = normalizeCode(coupon.coupon_code);
        const today = todayISO();
        const company = String(doc.company || "");
        const customer = String(doc.customer || "");

        if (!code || cint(coupon.disabled || 0)) return false;
        const couponType = coupon.coupon_type || "Promotional";
        if (!["Promotional", "Gift Card"].includes(couponType)) return false;
        if (cint(doc.is_return || 0)) return false;
        if (coupon.valid_from && today < String(coupon.valid_from).slice(0, 10)) return false;
        if (coupon.valid_upto && today > String(coupon.valid_upto).slice(0, 10)) return false;
        if (coupon.company && company && coupon.company !== company) return false;
        if (couponType === "Gift Card" && !coupon.customer) return false;
        if (coupon.customer && coupon.customer !== customer) return false;

        const maximumUse = couponType === "Gift Card" ? 1 : cint(coupon.maximum_use || 0);
        const used = cint(coupon.used || 0);
        if (maximumUse > 0 && used >= maximumUse) return false;

        if (cint(coupon.one_use_per_customer || 0)) {
            if (!customer) return false;
            const usedCustomers = Array.isArray(coupon.used_customers) ? coupon.used_customers : [];
            if (usedCustomers.includes(customer)) return false;
        }

        return true;
    }

    function validateLocal(coupon, doc) {
        coupon = coupon || {};
        doc = doc || {};
        const code = normalizeCode(coupon.coupon_code);
        const today = todayISO();
        const company = String(doc.company || "");
        const customer = String(doc.customer || "");

        if (!code) throw new Error(__("Coupon Code is required"));
        if (cint(coupon.disabled || 0)) throw new Error(__("Coupon {0} is disabled", [code]));
        const couponType = coupon.coupon_type || "Promotional";
        if (!["Promotional", "Gift Card"].includes(couponType)) {
            throw new Error(__("Unsupported coupon type {0}", [couponType]));
        }
        if (cint(doc.is_return || 0)) throw new Error(__("Coupons cannot be applied to return invoices"));
        if (coupon.valid_from && today < String(coupon.valid_from).slice(0, 10)) {
            throw new Error(__("Coupon {0} is not active yet", [code]));
        }
        if (coupon.valid_upto && today > String(coupon.valid_upto).slice(0, 10)) {
            throw new Error(__("Coupon {0} has expired", [code]));
        }
        if (coupon.company && company && coupon.company !== company) {
            throw new Error(__("Coupon {0} is not valid for this company", [code]));
        }
        if (couponType === "Gift Card" && !coupon.customer) {
            throw new Error(__("Gift Card {0} must be assigned to a customer", [code]));
        }
        if (coupon.customer) {
            if (!customer) throw new Error(__("Select the coupon customer before applying this coupon"));
            if (coupon.customer !== customer) {
                if (couponType === "Gift Card") {
                    throw new Error(__("Gift Card {0} is assigned to another customer", [code]));
                }
                throw new Error(__("Coupon {0} is assigned to another customer", [code]));
            }
        }

        const maximumUse = couponType === "Gift Card" ? 1 : cint(coupon.maximum_use || 0);
        const used = cint(coupon.used || 0);
        if (maximumUse > 0 && used >= maximumUse) {
            throw new Error(__("Coupon {0} has reached its maximum number of uses", [code]));
        }

        if (cint(coupon.one_use_per_customer || 0)) {
            if (!customer) throw new Error(__("A customer is required for one-use-per-customer coupons"));
            const usedCustomers = Array.isArray(coupon.used_customers) ? coupon.used_customers : [];
            if (usedCustomers.includes(customer)) {
                throw new Error(__("This customer has already used coupon {0}", [code]));
            }
        }

        const applyOn = coupon.apply_on === "Net Total" ? "Net Total" : "Grand Total";
        const bases = getBaseAmounts(doc);
        const baseAmount = applyOn === "Net Total" ? bases.net_total : bases.grand_total;
        const minimum = flt(coupon.minimum_cart_amount || 0);

        if (baseAmount <= 0) throw new Error(__("Coupon cannot be applied to an empty invoice"));
        if (minimum > 0 && baseAmount < minimum) {
            throw new Error(__("Coupon {0} requires a minimum invoice amount", [code]));
        }

        const calculatedDiscount = calculateDiscount(coupon, baseAmount);
        if (calculatedDiscount <= 0) throw new Error(__("Coupon discount must be greater than zero"));

        return Object.assign({}, coupon, {
            coupon_code: code,
            apply_on: applyOn,
            base_amount: baseAmount,
            calculated_discount: calculatedDiscount,
            __offline_validation: 1,
        });
    }

    function describe(coupon, currency) {
        coupon = coupon || {};
        const label = coupon.coupon_name || coupon.coupon_code || __("Coupon");
        const amount = flt(coupon.calculated_discount || 0);
        const discount = coupon.discount_type === "Percentage"
            ? `${flt(coupon.discount_percentage || 0)}%`
            : format_currency(flt(coupon.discount_amount || 0), currency);

        return {
            label,
            discount,
            calculated: format_currency(amount, currency),
        };
    }

    window.WMNPOSCoupon = {
        normalizeCode,
        getBaseAmounts,
        calculateDiscount,
        isCouponActiveForContext,
        validateLocal,
        describe,
    };
})();
