(function () {
    "use strict";

    const EPSILON = 0.000001;

    function normalizeCode(value) {
        return String(value || "").trim().toUpperCase();
    }

    function toNumber(value) {
        try {
            return typeof flt === "function" ? flt(value || 0) : Number(value || 0);
        } catch (e) {
            return Number(value || 0) || 0;
        }
    }

    function toInt(value) {
        try {
            return typeof cint === "function" ? cint(value || 0) : parseInt(value || 0, 10) || 0;
        } catch (e) {
            return parseInt(value || 0, 10) || 0;
        }
    }

    function getRowKey(row, index) {
        return String((row && row.name) || `row-${index}`);
    }

    function getCurrentDate(doc) {
        const postingDate = String((doc && doc.posting_date) || "").slice(0, 10);
        if (postingDate) return postingDate;

        try {
            if (window.frappe && frappe.datetime && frappe.datetime.get_today) {
                return String(frappe.datetime.get_today() || "").slice(0, 10);
            }
        } catch (e) {}

        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    }

    function getCurrentTime(doc) {
        const postingTime = String((doc && doc.posting_time) || "").slice(0, 8);
        if (postingTime) return postingTime;

        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    }

    function getWeekdayName(dateString) {
        const parts = String(dateString || "").split("-").map(Number);
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return "";
        const date = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
        return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][date.getDay()] || "";
    }

    function timeToSeconds(value) {
        const raw = String(value || "").trim();
        if (!raw) return null;
        const parts = raw.split(":").map(Number);
        if (!parts.length || Number.isNaN(parts[0])) return null;
        return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    }

    function isTimeAllowed(rule, timeString) {
        const start = timeToSeconds(rule.start_time);
        const end = timeToSeconds(rule.end_time);
        if (start === null && end === null) return true;

        const current = timeToSeconds(timeString);
        if (current === null) return true;
        if (start !== null && end === null) return current >= start;
        if (start === null && end !== null) return current <= end;
        if (start === end) return false;

        if (start < end) return current >= start && current <= end;
        return current >= start || current <= end;
    }

    function hasWeekdayRestriction(rule) {
        return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            .some((field) => toInt(rule[field]) === 1);
    }

    function isWeekdayAllowed(rule, weekday) {
        if (!hasWeekdayRestriction(rule)) return true;
        return toInt(rule[weekday]) === 1;
    }

    function getBaseRate(row) {
        const currentRate = Math.max(0, toNumber(row && (row.rate ?? row.price_list_rate)));
        const storedBase = toNumber(row && row.__wmn_promotion_base_rate);
        const storedApplied = toNumber(row && row.__wmn_promotion_applied_rate);

        if (
            row &&
            row.__wmn_promotion_base_rate !== undefined &&
            row.__wmn_promotion_applied_rate !== undefined &&
            Math.abs(currentRate - storedApplied) <= EPSILON
        ) {
            return Math.max(0, storedBase);
        }

        return currentRate;
    }

    function buildRows(doc) {
        return (Array.isArray(doc && doc.items) ? doc.items : [])
            .map((row, index) => {
                const qty = Math.max(0, toNumber(row && row.qty));
                const baseRate = getBaseRate(row);
                return {
                    row,
                    index,
                    key: getRowKey(row, index),
                    qty,
                    base_rate: baseRate,
                    base_amount: qty * baseRate,
                    item_code: String((row && row.item_code) || ""),
                    item_group: String((row && row.item_group) || ""),
                    brand: String((row && row.brand) || ""),
                    is_free_item: toInt(row && row.is_free_item),
                };
            })
            .filter((row) => row.qty > EPSILON && row.base_amount >= 0 && !row.is_free_item);
    }

    function matchesTarget(rule, row) {
        const scope = rule.apply_scope || "Transaction";
        if (scope === "Transaction") return true;
        if (scope === "Item") return row.item_code === String(rule.item_code || "");
        if (scope === "Item Group") return row.item_group === String(rule.item_group || "");
        if (scope === "Brand") return row.brand === String(rule.brand || "");
        return false;
    }

    function ruleScopeMatches(rule, doc, context) {
        const company = String((doc && doc.company) || context.company || "");
        const posProfile = String((doc && doc.pos_profile) || context.pos_profile || "");
        const warehouse = String((doc && (doc.set_warehouse || doc.warehouse)) || context.warehouse || "");
        const customer = String((doc && doc.customer) || "");
        const customerGroup = String((doc && doc.customer_group) || context.customer_group || "");
        const couponCode = normalizeCode((doc && doc.__wmn_coupon_code) || context.coupon_code || "");

        if (rule.company && company && String(rule.company) !== company) return false;
        if (rule.pos_profile && posProfile && String(rule.pos_profile) !== posProfile) return false;
        if (rule.warehouse && warehouse && String(rule.warehouse) !== warehouse) return false;
        if (rule.customer && String(rule.customer) !== customer) return false;
        if (rule.customer_group && String(rule.customer_group) !== customerGroup) return false;
        if (rule.required_coupon && normalizeCode(rule.required_coupon) !== couponCode) return false;
        return true;
    }

    function ruleValidityMatches(rule, doc) {
        const currentDate = getCurrentDate(doc);
        const currentTime = getCurrentTime(doc);
        const weekday = getWeekdayName(currentDate);

        if (rule.valid_from && currentDate < String(rule.valid_from).slice(0, 10)) return false;
        if (rule.valid_upto && currentDate > String(rule.valid_upto).slice(0, 10)) return false;
        if (!isWeekdayAllowed(rule, weekday)) return false;
        if (!isTimeAllowed(rule, currentTime)) return false;
        return true;
    }

    function isRuleActiveForContext(rule, doc, context) {
        rule = rule || {};
        doc = doc || {};
        context = context || {};

        if (!rule || toInt(rule.disabled) || !toInt(rule.auto_apply === undefined ? 1 : rule.auto_apply)) return false;
        if (toInt(doc.is_return)) return false;
        if (
            toInt(rule.is_cumulative) &&
            String(context.customer || doc.customer || "").trim() &&
            String(context.customer || doc.customer || "").trim() === String(context.default_customer || "").trim()
        ) return false;
        if (!ruleScopeMatches(rule, doc, context)) return false;
        if (!ruleValidityMatches(rule, doc)) return false;
        return true;
    }

    function isRuleVisibleForPOSCatalog(rule, doc, context) {
        rule = rule || {};
        doc = doc || {};
        context = context || {};

        if (toInt(rule.disabled) || !toInt(rule.auto_apply === undefined ? 1 : rule.auto_apply)) return false;
        if (toInt(doc.is_return)) return false;
        if (!ruleValidityMatches(rule, doc)) return false;

        const company = String(doc.company || context.company || "");
        const posProfile = String(doc.pos_profile || context.pos_profile || "");
        const warehouse = String((doc.set_warehouse || doc.warehouse) || context.warehouse || "");
        if (rule.company && company && String(rule.company) !== company) return false;
        if (rule.pos_profile && posProfile && String(rule.pos_profile) !== posProfile) return false;
        if (rule.warehouse && warehouse && String(rule.warehouse) !== warehouse) return false;
        return true;
    }

    function allocateProportionally(rowStates, totalDiscount, allocations) {
        let remainingDiscount = Math.max(0, toNumber(totalDiscount));
        const eligible = rowStates.filter((state) => state.remaining_amount > EPSILON);
        const totalRemaining = eligible.reduce((sum, state) => sum + state.remaining_amount, 0);
        if (remainingDiscount <= EPSILON || totalRemaining <= EPSILON) return 0;

        remainingDiscount = Math.min(remainingDiscount, totalRemaining);
        let applied = 0;

        eligible.forEach((state, idx) => {
            const allocation = idx === eligible.length - 1
                ? Math.min(state.remaining_amount, remainingDiscount - applied)
                : Math.min(state.remaining_amount, remainingDiscount * state.remaining_amount / totalRemaining);

            if (allocation <= EPSILON) return;
            allocations[state.key] = toNumber(allocations[state.key]) + allocation;
            applied += allocation;
        });

        return applied;
    }

    function allocateFreeUnits(rowStates, freeUnits, allocations) {
        let remainingUnits = Math.max(0, toNumber(freeUnits));
        if (remainingUnits <= EPSILON) return { discount: 0, units: 0 };

        const candidates = rowStates
            .filter((state) => state.qty > EPSILON && state.remaining_amount > EPSILON)
            .map((state) => ({
                state,
                remaining_qty: state.qty,
                unit_value: state.remaining_amount / state.qty,
            }))
            .sort((a, b) => a.unit_value - b.unit_value || a.state.index - b.state.index);

        let totalDiscount = 0;
        let totalUnits = 0;

        for (const candidate of candidates) {
            if (remainingUnits <= EPSILON) break;
            const units = Math.min(candidate.remaining_qty, remainingUnits);
            const discount = Math.min(candidate.state.remaining_amount, units * candidate.unit_value);
            if (discount <= EPSILON) continue;

            allocations[candidate.state.key] = toNumber(allocations[candidate.state.key]) + discount;
            remainingUnits -= units;
            totalUnits += units;
            totalDiscount += discount;
        }

        return { discount: totalDiscount, units: totalUnits };
    }

    function capApplications(rule, applications) {
        let value = Math.max(0, Math.floor(toNumber(applications)));
        if (!toInt(rule.repeat_benefit) && value > 1) value = 1;
        const maximum = Math.max(0, toInt(rule.max_applications));
        if (maximum > 0) value = Math.min(value, maximum);
        return value;
    }

    function evaluateRule(rule, state, doc, context) {
        if (!isRuleActiveForContext(rule, doc, context)) return null;

        const triggerRows = state.rows.filter((row) => matchesTarget(rule, row));
        if (!triggerRows.length) return null;

        const cartAmount = state.rows.reduce((sum, row) => sum + row.base_amount, 0);
        const targetQty = triggerRows.reduce((sum, row) => sum + row.qty, 0);
        const minimumCartAmount = Math.max(0, toNumber(rule.minimum_cart_amount));
        const minimumQty = Math.max(0, toNumber(rule.minimum_qty));

        if (minimumCartAmount > EPSILON && cartAmount + EPSILON < minimumCartAmount) return null;
        if (minimumQty > EPSILON && targetQty + EPSILON < minimumQty) return null;

        const type = rule.promotion_type || "Percentage Discount";
        const invoiceDiscountCandidate = (rule.apply_scope || "Transaction") === "Transaction" &&
            ["Percentage Discount", "Amount Discount"].includes(type);

        // Manual additional discount owns the invoice-level ERPNext fields in WMN POS.
        // Item-level promotions and free-item promotions remain eligible.
        if (invoiceDiscountCandidate && context.manual_invoice_discount_active) return null;

        const targetStates = triggerRows.map((row) => state.row_states[row.key]).filter(Boolean);
        const localAllocations = {};
        let discount = 0;
        let applications = 1;
        let freeUnits = 0;
        let freeItemCode = "";
        let freeSourceKey = "";
        let note = "";

        if (type === "Percentage Discount") {
            const percentage = Math.max(0, Math.min(100, toNumber(rule.discount_percentage)));
            if (percentage <= EPSILON) return null;
            const targetRemaining = targetStates.reduce((sum, row) => sum + row.remaining_amount, 0);
            discount = targetRemaining * percentage / 100;
            const maximum = Math.max(0, toNumber(rule.maximum_discount_amount));
            if (maximum > EPSILON) discount = Math.min(discount, maximum);
            discount = allocateProportionally(targetStates, discount, localAllocations);
        } else if (type === "Amount Discount") {
            discount = Math.max(0, toNumber(rule.discount_amount));
            const maximum = Math.max(0, toNumber(rule.maximum_discount_amount));
            if (maximum > EPSILON) discount = Math.min(discount, maximum);
            discount = allocateProportionally(targetStates, discount, localAllocations);
        } else if (type === "Buy X Get Y") {
            const buyQty = Math.max(0, toNumber(rule.buy_qty));
            const freeQty = Math.max(0, toNumber(rule.free_qty));
            if (buyQty <= EPSILON || freeQty <= EPSILON) return null;

            applications = capApplications(rule, Math.floor(targetQty / buyQty));
            if (applications <= 0) return null;

            freeUnits = applications * freeQty;

            const configuredFreeItem = String(rule.free_item || "").trim();
            const cheapestTrigger = triggerRows
                .slice()
                .sort((a, b) => toNumber(a.base_rate) - toNumber(b.base_rate) || a.index - b.index)[0] || null;
            freeItemCode = configuredFreeItem || String(cheapestTrigger?.item_code || "").trim();
            if (!freeItemCode) return null;

            const existingFreeSource = triggerRows.find((row) => row.item_code === freeItemCode) || null;
            const sourceRow = existingFreeSource || cheapestTrigger;

            note = configuredFreeItem ? `Free ${freeItemCode}` : "Same-item free quantity";
            freeSourceKey = sourceRow ? sourceRow.key : "";
        } else if (type === "Free Item") {
            const freeItem = String(rule.free_item || "").trim();
            const freeQty = Math.max(0, toNumber(rule.free_qty));
            if (!freeItem || freeQty <= EPSILON) return null;

            const basisQty = minimumQty > EPSILON ? Math.floor(targetQty / minimumQty) : 1;
            applications = capApplications(rule, Math.max(1, basisQty));
            if (applications <= 0) return null;

            freeUnits = applications * freeQty;
            const existingFreeSource = triggerRows.find((row) => row.item_code === freeItem) || null;
            freeItemCode = freeItem;
            freeSourceKey = existingFreeSource ? existingFreeSource.key : "";
            note = `Free ${freeItem}`;
        } else {
            return null;
        }

        const maximumDiscount = Math.max(0, toNumber(rule.maximum_discount_amount));
        if (maximumDiscount > EPSILON && discount > maximumDiscount + EPSILON) {
            const ratio = maximumDiscount / discount;
            Object.keys(localAllocations).forEach((key) => {
                localAllocations[key] *= ratio;
            });
            discount = maximumDiscount;
        }

        if (discount <= EPSILON && freeUnits <= EPSILON) return null;

        const invoiceLevel = (rule.apply_scope || "Transaction") === "Transaction" &&
            ["Percentage Discount", "Amount Discount"].includes(type);

        Object.keys(localAllocations).forEach((key) => {
            const amount = localAllocations[key];
            const rowState = state.row_states[key];
            if (!rowState || amount <= EPSILON) return;

            // Always reduce the internal remaining amount so stacked promotions are
            // calculated on the correct balance. Transaction-level discounts are
            // intentionally NOT written to item allocations; they are applied later
            // through the invoice additional-discount fields.
            rowState.remaining_amount = Math.max(0, rowState.remaining_amount - amount);
            if (!invoiceLevel) {
                state.allocations[key] = toNumber(state.allocations[key]) + amount;
            }
        });

        if (invoiceLevel) {
            state.invoice_discount = toNumber(state.invoice_discount) + discount;
        }

        return {
            promotion_code: normalizeCode(rule.promotion_code || rule.name),
            promotion_name: rule.promotion_name || rule.promotion_code || rule.name,
            promotion_type: type,
            apply_scope: rule.apply_scope || "Transaction",
            invoice_level: invoiceLevel ? 1 : 0,
            discount_amount: discount,
            applications,
            free_qty: freeUnits,
            free_item_code: freeItemCode,
            free_source_key: freeSourceKey,
            priority: toInt(rule.priority),
            stackable: toInt(rule.stackable),
            note,
            allocations: invoiceLevel ? {} : localAllocations,
        };
    }

    function evaluate(promotions, doc, context) {
        doc = doc || {};
        context = context || {};
        const rows = buildRows(doc);
        const rowStates = {};
        const allocations = {};

        rows.forEach((row) => {
            rowStates[row.key] = {
                key: row.key,
                index: row.index,
                qty: row.qty,
                base_rate: row.base_rate,
                base_amount: row.base_amount,
                remaining_amount: row.base_amount,
            };
            allocations[row.key] = 0;
        });

        const state = { rows, row_states: rowStates, allocations, invoice_discount: 0 };
        const rules = (Array.isArray(promotions) ? promotions : [])
            .filter(Boolean)
            .slice()
            .sort((a, b) => toInt(b.priority) - toInt(a.priority) || normalizeCode(a.promotion_code).localeCompare(normalizeCode(b.promotion_code)));

        const applied = [];
        for (const rule of rules) {
            const result = evaluateRule(rule, state, doc, context);
            if (!result) continue;

            applied.push(result);

            // Stackable belongs to the promotion that has just been applied:
            // when enabled, lower-priority promotions may continue; when disabled,
            // this promotion becomes the last applied promotion in the chain.
            if (!toInt(rule.stackable)) break;
        }

        const itemDiscount = Object.values(allocations).reduce((sum, amount) => sum + toNumber(amount), 0);
        const invoiceDiscount = Math.max(0, toNumber(state.invoice_discount));
        const totalDiscount = itemDiscount + invoiceDiscount;
        return {
            applied,
            allocations,
            item_discount: itemDiscount,
            invoice_discount: invoiceDiscount,
            total_discount: totalDiscount,
            rows: rows.map((row) => ({
                key: row.key,
                item_code: row.item_code,
                base_rate: row.base_rate,
                qty: row.qty,
                discount_amount: toNumber(allocations[row.key]),
            })),
        };
    }

    window.WMNPOSPromotion = {
        normalizeCode,
        getBaseRate,
        isRuleActiveForContext,
        isRuleVisibleForPOSCatalog,
        evaluate,
    };
})();
