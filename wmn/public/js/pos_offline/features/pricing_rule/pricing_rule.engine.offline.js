(function () {
    "use strict";

    function num(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function int(value) {
        return Math.trunc(num(value));
    }

    function text(value) {
        return value === null || value === undefined ? "" : String(value);
    }

    function clone(value) {
        if (value === null || value === undefined) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return value;
        }
    }

    function unique(values) {
        return Array.from(new Set((values || []).filter(Boolean).map(text)));
    }

    function scrub(value) {
        return text(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function compareDate(date, from, upto) {
        const current = text(date).slice(0, 10);
        const start = text(from).slice(0, 10);
        const end = text(upto).slice(0, 10);
        if (start && current && current < start) return false;
        if (end && current && current > end) return false;
        return true;
    }

    function splitTopLevel(expression, separator) {
        const parts = [];
        let quote = "";
        let depth = 0;
        let start = 0;
        for (let i = 0; i < expression.length; i++) {
            const ch = expression[i];
            if (quote) {
                if (ch === quote && expression[i - 1] !== "\\") quote = "";
                continue;
            }
            if (ch === "'" || ch === '"') {
                quote = ch;
                continue;
            }
            if (ch === "[" || ch === "(" || ch === "{") depth++;
            if (ch === "]" || ch === ")" || ch === "}") depth = Math.max(0, depth - 1);
            if (depth === 0 && expression.slice(i, i + separator.length) === separator) {
                parts.push(expression.slice(start, i).trim());
                start = i + separator.length;
                i += separator.length - 1;
            }
        }
        parts.push(expression.slice(start).trim());
        return parts.filter(Boolean);
    }

    function parseLiteral(raw, doc) {
        const value = text(raw).trim();
        if (!value) return "";
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            return value.slice(1, -1);
        }
        if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
        if (value === "True" || value === "true") return true;
        if (value === "False" || value === "false") return false;
        if (value === "None" || value === "null") return null;
        if (value.startsWith("[") && value.endsWith("]")) {
            const inner = value.slice(1, -1);
            return splitTopLevel(inner, ",").map(part => parseLiteral(part, doc));
        }
        return getPath(doc, value.replace(/^doc\./, ""));
    }

    function getPath(object, path) {
        const parts = text(path).split(".").filter(Boolean);
        let current = object;
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            current = current[part];
        }
        return current;
    }

    function evaluateAtomicCondition(expression, doc) {
        let source = text(expression).trim();
        if (!source) return true;
        if (source.startsWith("not ")) return !evaluateAtomicCondition(source.slice(4), doc);

        const inMatch = source.match(/^([A-Za-z_][\w.]*)\s+(not\s+in|in)\s+(.+)$/);
        if (inMatch) {
            const left = getPath(doc, inMatch[1].replace(/^doc\./, ""));
            const right = parseLiteral(inMatch[3], doc);
            const contains = Array.isArray(right) ? right.some(value => value === left) : text(right).includes(text(left));
            return inMatch[2].replace(/\s+/g, " ") === "not in" ? !contains : contains;
        }

        const compareMatch = source.match(/^([A-Za-z_][\w.]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
        if (compareMatch) {
            const left = getPath(doc, compareMatch[1].replace(/^doc\./, ""));
            const right = parseLiteral(compareMatch[3], doc);
            switch (compareMatch[2]) {
                case "==": return left == right; // ERPNext conditions commonly compare string/number values loosely.
                case "!=": return left != right;
                case ">=": return num(left) >= num(right);
                case "<=": return num(left) <= num(right);
                case ">": return num(left) > num(right);
                case "<": return num(left) < num(right);
                default: return false;
            }
        }

        const direct = getPath(doc, source.replace(/^doc\./, ""));
        if (direct !== undefined) return !!direct;
        throw new Error("Unsupported Pricing Rule condition expression");
    }

    function evaluateCondition(expression, doc) {
        const source = text(expression).trim();
        if (!source) return true;
        const orParts = splitTopLevel(source, " or ");
        return orParts.some(orPart => splitTopLevel(orPart, " and ").every(andPart => evaluateAtomicCondition(andPart, doc)));
    }

    class WMNERPNextPricingRuleOffline {
        constructor(options) {
            options = options || {};
            this.rules = Array.isArray(options.rules) ? options.rules.map(clone) : [];
            this.doc = options.doc || {};
            this.context = options.context || {};
            this.conditionWarnings = new Set();
        }

        getPaidRows() {
            return (this.doc.items || []).filter(row => row && !int(row.is_free_item) && num(row.qty) > 0);
        }

        getContextDate() {
            return text(this.context.posting_date || this.doc.posting_date || this.doc.transaction_date).slice(0, 10);
        }

        getCouponCode() {
            return text(this.doc.coupon_code || this.doc.__wmn_coupon_code || this.context.coupon_code).trim();
        }

        ruleMatchesParty(rule) {
            const context = this.context;
            if (rule.company && context.company && text(rule.company) !== text(context.company)) return false;
            if (rule.currency && context.currency && text(rule.currency) !== text(context.currency)) return false;
            if (rule.for_price_list && text(rule.for_price_list) !== text(context.price_list)) return false;
            if (rule.customer && text(rule.customer) !== text(context.customer)) return false;
            if (rule.sales_partner && text(rule.sales_partner) !== text(context.sales_partner)) return false;
            if (rule.campaign && text(rule.campaign) !== text(context.campaign)) return false;

            if (rule.customer_group) {
                const groups = Array.isArray(rule.customer_groups_expanded) && rule.customer_groups_expanded.length
                    ? rule.customer_groups_expanded
                    : [rule.customer_group];
                if (!groups.map(text).includes(text(context.customer_group))) return false;
            }

            if (rule.territory) {
                const territories = Array.isArray(rule.territories_expanded) && rule.territories_expanded.length
                    ? rule.territories_expanded
                    : [rule.territory];
                if (!territories.map(text).includes(text(context.territory))) return false;
            }
            return true;
        }

        ruleMatchesWarehouse(rule, row) {
            if (!rule.warehouse || text(rule.apply_on) === "Transaction") return true;
            const current = text((row && row.warehouse) || this.context.warehouse);
            const allowed = Array.isArray(rule.warehouses_expanded) && rule.warehouses_expanded.length
                ? rule.warehouses_expanded.map(text)
                : [text(rule.warehouse)];
            return allowed.includes(current);
        }

        ruleMatchesCoupon(rule) {
            if (!int(rule.coupon_code_based)) return true;
            const code = this.getCouponCode();
            if (!code) return false;
            const couponCodes = Array.isArray(rule.coupon_codes) ? rule.coupon_codes.map(text) : [];
            return couponCodes.includes(code);
        }

        ruleMatchesCondition(rule) {
            if (!rule.condition) return true;
            try {
                return evaluateCondition(rule.condition, this.doc);
            } catch (error) {
                if (!this.conditionWarnings.has(rule.name)) {
                    this.conditionWarnings.add(rule.name);
                    console.warn("WMN ERPNext Pricing Rule condition could not be evaluated offline", {
                        name: rule.name,
                        condition: rule.condition,
                        error: error && error.message ? error.message : String(error),
                    });
                }
                return false;
            }
        }

        ruleIsCommonCandidate(rule, row) {
            if (!rule || int(rule.disable) || !int(rule.selling)) return false;
            if (!compareDate(this.getContextDate(), rule.valid_from, rule.valid_upto)) return false;
            if (!this.ruleMatchesParty(rule)) return false;
            if (!this.ruleMatchesWarehouse(rule, row)) return false;
            if (!this.ruleMatchesCoupon(rule)) return false;
            if (!this.ruleMatchesCondition(rule)) return false;
            return true;
        }

        matchesPrimaryScope(rule, row, scope) {
            if (!rule || !row) return false;
            const rowUom = text(row.uom || row.stock_uom);
            if (scope === "Item Code") {
                return (rule.items || []).some(entry => {
                    const itemCode = typeof entry === "string" ? entry : entry.item_code;
                    const uom = typeof entry === "string" ? "" : text(entry.uom);
                    const itemMatch = text(itemCode) === text(row.item_code) || text(itemCode) === text(row.variant_of);
                    return itemMatch && (!uom || uom === rowUom);
                });
            }
            if (scope === "Item Group") {
                const targets = Array.isArray(rule.item_group_targets) && rule.item_group_targets.length
                    ? rule.item_group_targets
                    : (rule.item_groups || []);
                return targets.some(entry => {
                    if (typeof entry === "string") return text(entry) === text(row.item_group);
                    const expanded = Array.isArray(entry.expanded) && entry.expanded.length
                        ? entry.expanded.map(text)
                        : [text(entry.item_group)];
                    const uom = text(entry.uom);
                    return expanded.includes(text(row.item_group)) && (!uom || uom === rowUom);
                });
            }
            if (scope === "Brand") {
                return (rule.brands || []).some(entry => {
                    const brand = typeof entry === "string" ? entry : entry.brand;
                    const uom = typeof entry === "string" ? "" : text(entry.uom);
                    return text(brand) === text(row.brand) && (!uom || uom === rowUom);
                });
            }
            return false;
        }

        matchesOtherScope(rule, row) {
            const scope = text(rule.apply_rule_on_other);
            if (!scope || !row) return false;
            if (scope === "Item Code") {
                return text(rule.other_item_code) === text(row.item_code) || text(rule.other_item_code) === text(row.variant_of);
            }
            if (scope === "Item Group") {
                const expanded = Array.isArray(rule.other_item_groups_expanded) && rule.other_item_groups_expanded.length
                    ? rule.other_item_groups_expanded.map(text)
                    : [text(rule.other_item_group)];
                return expanded.includes(text(row.item_group));
            }
            if (scope === "Brand") return text(rule.other_brand) === text(row.brand);
            return false;
        }

        primaryRows(rule, paidRows) {
            const scope = text(rule.apply_on);
            if (scope === "Transaction") return paidRows.slice();
            return paidRows.filter(row => this.matchesPrimaryScope(rule, row, scope));
        }

        otherTargetItems(rule, paidRows) {
            if (!rule.apply_rule_on_other) return [];
            const scope = text(rule.apply_rule_on_other);
            if (scope === "Item Code") return unique([rule.other_item_code]);
            if (scope === "Brand") {
                return unique(paidRows.filter(row => text(row.brand) === text(rule.other_brand)).map(row => row.item_code));
            }
            if (scope === "Item Group") {
                return unique(paidRows.filter(row => this.matchesOtherScope(rule, row)).map(row => row.item_code));
            }
            return [];
        }

        rowStockQty(row) {
            return num(row.stock_qty || (num(row.qty) * num(row.conversion_factor || 1)));
        }

        rowPriceListAmount(row) {
            return num(row.price_list_rate || row.rate) * num(row.qty);
        }

        quantityAmountForRule(rule, row, paidRows) {
            let stockQty = this.rowStockQty(row);
            let amount = this.rowPriceListAmount(row);
            let sourceRows = [row];

            if (int(rule.mixed_conditions)) {
                sourceRows = this.primaryRows(rule, paidRows);
                stockQty = sourceRows.reduce((sum, candidate) => sum + this.rowStockQty(candidate), 0);
                amount = sourceRows.reduce((sum, candidate) => sum + this.rowPriceListAmount(candidate), 0);
            } else if (rule.apply_rule_on_other) {
                sourceRows = this.primaryRows(rule, paidRows);
                const matching = sourceRows.find(candidate => {
                    const values = this.quantityAmountForPlainRule(rule, candidate);
                    return this.meetsQtyAmount(rule, values.qty, values.amount, candidate);
                });
                if (!matching) return { qty: 0, amount: 0, sourceRows: [] };
                const values = this.quantityAmountForPlainRule(rule, matching);
                stockQty = values.qty;
                amount = values.amount;
                sourceRows = [matching];
            }

            if (int(rule.is_cumulative)) {
                const cumulative = this.getCumulativeTotals(rule, row);
                stockQty += num(cumulative.qty);
                amount += num(cumulative.amount);
            }

            return { qty: stockQty, amount, sourceRows };
        }

        quantityAmountForPlainRule(rule, row) {
            return { qty: this.rowStockQty(row), amount: this.rowPriceListAmount(row) };
        }

        getCumulativeTotals(rule, row) {
            const byDoctype = rule.cumulative_totals || {};
            const doctype = text(this.doc.doctype || "Sales Invoice");
            const values = byDoctype[doctype] || byDoctype["Sales Invoice"] || {};
            const field = scrub(rule.apply_on);
            const key = text(row && row[field]);
            const server = values[key] || { qty: 0, amount: 0 };
            let qty = num(server.qty);
            let amount = num(server.amount);

            for (const pending of this.context.pending_invoices || []) {
                if (!pending || text(pending.doctype || doctype) !== doctype) continue;
                if (rule.company && pending.company && text(rule.company) !== text(pending.company)) continue;
                const pendingDate = text(pending.posting_date || pending.transaction_date).slice(0, 10);
                if (!compareDate(pendingDate, rule.valid_from, rule.valid_upto)) continue;

                for (const pendingRow of pending.items || []) {
                    if (text(pendingRow[field]) !== key) continue;
                    if (rule.warehouse) {
                        const allowed = Array.isArray(rule.warehouses_expanded) && rule.warehouses_expanded.length
                            ? rule.warehouses_expanded.map(text)
                            : [text(rule.warehouse)];
                        if (!allowed.includes(text(pendingRow.warehouse))) continue;
                    }
                    qty += num(pendingRow.stock_qty || (num(pendingRow.qty) * num(pendingRow.conversion_factor || 1)));
                    amount += num(pendingRow.amount);
                }
            }
            return { qty, amount };
        }

        matchedRuleUom(rule, row) {
            const scope = text(rule.apply_on);
            const rowUom = text(row.uom || row.stock_uom);
            if (scope === "Item Code") {
                const entry = (rule.items || []).find(candidate => {
                    const code = typeof candidate === "string" ? candidate : candidate.item_code;
                    const uom = typeof candidate === "string" ? "" : text(candidate.uom);
                    const itemMatch = text(code) === text(row.item_code) || text(code) === text(row.variant_of);
                    return itemMatch && (!uom || uom === rowUom);
                });
                return entry && typeof entry !== "string" ? text(entry.uom) : "";
            }
            if (scope === "Item Group") {
                const target = (rule.item_group_targets || []).find(candidate => {
                    const expanded = Array.isArray(candidate.expanded) ? candidate.expanded.map(text) : [text(candidate.item_group)];
                    const uom = text(candidate.uom);
                    return expanded.includes(text(row.item_group)) && (!uom || uom === rowUom);
                });
                return target ? text(target.uom) : "";
            }
            if (scope === "Brand") {
                const entry = (rule.brands || []).find(candidate => text(candidate.brand) === text(row.brand) && (!candidate.uom || text(candidate.uom) === rowUom));
                return entry ? text(entry.uom) : "";
            }
            return "";
        }

        meetsQtyAmount(rule, qty, amount, row) {
            let conversionFactor = 1;
            const ruleUom = this.matchedRuleUom(rule, row || {});
            if (ruleUom && text(ruleUom) !== text((row && row.uom) || "")) {
                conversionFactor = num((row && row.conversion_factor) || 1) || 1;
            }
            if (ruleUom && text(ruleUom) === text((row && row.uom) || "")) conversionFactor = 1;

            if (num(qty) < num(rule.min_qty) * conversionFactor) return false;
            if (num(rule.max_qty) && num(qty) > num(rule.max_qty) * conversionFactor) return false;
            if (num(amount) < num(rule.min_amt) * conversionFactor) return false;
            if (num(rule.max_amt) && num(amount) > num(rule.max_amt) * conversionFactor) return false;
            return true;
        }

        getScopedCandidates(scope, row, paidRows) {
            return this.rules.filter(rule => {
                if (text(rule.apply_on) !== scope) return false;
                if (!this.ruleIsCommonCandidate(rule, row)) return false;
                if (rule.apply_rule_on_other) {
                    if (!this.matchesOtherScope(rule, row)) return false;
                    const sourceRows = this.primaryRows(rule, paidRows);
                    return sourceRows.length > 0;
                }
                return this.matchesPrimaryScope(rule, row, scope);
            });
        }

        applyMultiplePricingRules(rules) {
            return !!(rules && rules.length) && rules.every(rule => int(rule.apply_multiple_pricing_rules));
        }

        filterPricingRules(row, rules, paidRows) {
            if (!rules || !rules.length) return null;
            let filtered = rules.filter(rule => {
                const values = this.quantityAmountForRule(rule, row, paidRows);
                if (!values.sourceRows.length && rule.apply_rule_on_other) return false;
                return this.meetsQtyAmount(rule, values.qty, values.amount, values.sourceRows[0] || row);
            });
            if (!filtered.length) return null;

            if (filtered.length > 1) {
                const currencyRules = filtered.filter(rule => text(rule.currency) === text(this.context.currency));
                if (currencyRules.length) filtered = currencyRules;
            }

            const maxPriority = Math.max(...filtered.map(rule => int(rule.priority)));
            if (maxPriority) filtered = filtered.filter(rule => int(rule.priority) === maxPriority);

            if (filtered.length > 1) {
                const modes = unique(filtered.map(rule => rule.rate_or_discount));
                if (modes.length === 1 && modes[0] === "Discount Percentage") {
                    const exactPriceList = filtered.filter(rule => text(rule.for_price_list) === text(this.context.price_list));
                    if (exactPriceList.length) filtered = exactPriceList;
                }
            }

            if (filtered.length > 1) {
                throw new Error("Multiple Price Rules exist with same criteria: " + filtered.map(rule => rule.name).join(", "));
            }
            return filtered[0] || null;
        }

        sortedByPriority(rules, row, paidRows) {
            const groups = new Map();
            for (const rule of rules || []) {
                const filtered = this.filterPricingRules(row, [rule], paidRows);
                if (!filtered || !int(filtered.apply_multiple_pricing_rules)) continue;
                const priority = int(filtered.priority) || 1;
                if (!groups.has(priority)) groups.set(priority, []);
                groups.get(priority).push(filtered);
            }
            const result = [];
            Array.from(groups.keys()).sort((a, b) => a - b).forEach(priority => result.push(...groups.get(priority)));
            return result;
        }

        getPricingRulesForRow(row, paidRows) {
            let candidates = [];
            for (const scope of ["Item Code", "Item Group", "Brand"]) {
                candidates.push(...this.getScopedCandidates(scope, row, paidRows));
                if (candidates.length && int(candidates[0].has_priority)) continue;
                if (candidates.length && !this.applyMultiplePricingRules(candidates)) break;
            }
            if (!candidates.length) return [];

            if (this.applyMultiplePricingRules(candidates)) return this.sortedByPriority(candidates, row, paidRows);
            const selected = this.filterPricingRules(row, candidates, paidRows);
            return selected ? [selected] : [];
        }

        applyPriceRules(row, rules) {
            const basePriceListRate = num(row.price_list_rate || row.rate);
            const details = {
                price_list_rate: basePriceListRate,
                discount_percentage: num(row.discount_percentage),
                discount_amount: num(row.discount_amount),
                margin_type: row.margin_type || null,
                margin_rate_or_amount: num(row.margin_rate_or_amount),
                has_margin: false,
                pricing_rule_for: "",
            };

            for (const rule of rules || []) {
                if (int(rule.validate_applied_rule)) continue;
                details.pricing_rule_for = text(rule.rate_or_discount);

                if ((["Amount", "Percentage"].includes(text(rule.margin_type)) && text(rule.currency) === text(this.context.currency)) || text(rule.margin_type) === "Percentage") {
                    details.margin_type = rule.margin_type;
                    details.has_margin = true;
                    if (int(rule.apply_multiple_pricing_rules) && details.margin_rate_or_amount !== null && details.margin_rate_or_amount !== undefined) {
                        details.margin_rate_or_amount += num(rule.margin_rate_or_amount);
                    } else {
                        details.margin_rate_or_amount = num(rule.margin_rate_or_amount);
                    }
                }

                if (text(rule.rate_or_discount) === "Rate") {
                    if (text(rule.currency) === text(this.context.currency) && num(rule.rate)) {
                        const explicitUom = this.matchedRuleUom(rule, row);
                        const isBlankUom = text(explicitUom) !== text(row.uom);
                        details.price_list_rate = num(rule.rate) * (isBlankUom ? (num(row.conversion_factor) || 1) : 1);
                    }
                    details.discount_percentage = 0;
                    details.discount_amount = 0;
                    continue;
                }

                if (text(rule.rate_or_discount) === "Discount Amount") {
                    if (num(row.price_list_rate)) {
                        details.discount_amount += num(rule.discount_amount);
                        details.discount_percentage = details.price_list_rate
                            ? (details.discount_amount / details.price_list_rate) * 100
                            : 0;
                    } else {
                        details.discount_amount += num(rule.discount_amount);
                    }
                    continue;
                }

                if (text(rule.rate_or_discount) === "Discount Percentage") {
                    if (int(rule.apply_discount_on_rate) && num(details.discount_percentage)) {
                        details.discount_percentage += (100 - details.discount_percentage) * (num(rule.discount_percentage) / 100);
                        details.discount_amount = details.price_list_rate * details.discount_percentage / 100;
                    } else if (num(row.price_list_rate)) {
                        details.discount_amount += num(row.price_list_rate) * (num(rule.discount_percentage) / 100);
                        details.discount_percentage = num(row.price_list_rate)
                            ? (details.discount_amount / num(row.price_list_rate)) * 100
                            : 0;
                    } else {
                        details.discount_percentage += num(rule.discount_percentage);
                    }
                }
            }

            return details;
        }

        getFreeQty(rule, sourceRows, row) {
            const baseFreeQty = num(rule.free_qty) || 1;
            if (!int(rule.is_recursive)) return baseFreeQty;
            const recurseFor = num(rule.recurse_for);
            if (!recurseFor) return baseFreeQty;

            let transactionQty = (sourceRows || []).reduce((sum, source) => {
                if (int(source.is_free_item)) return sum;
                if (row && text(source.item_code) !== text(row.item_code)) return sum;
                return sum + num(source.qty);
            }, 0);
            transactionQty -= num(rule.apply_recursion_over);
            if (transactionQty <= 0) return 0;
            if (int(rule.round_free_qty)) return Math.floor(transactionQty / recurseFor) * baseFreeQty;
            return transactionQty * baseFreeQty / recurseFor;
        }

        buildFreeRequest(rule, row, paidRows) {
            const sourceRows = rule.apply_rule_on_other
                ? this.primaryRows(rule, paidRows)
                : (int(rule.mixed_conditions) ? this.primaryRows(rule, paidRows) : [row]);
            const freeItem = int(rule.same_item) && text(rule.apply_on) !== "Transaction" ? row.item_code : rule.free_item;
            if (!freeItem) return null;
            const qty = this.getFreeQty(rule, sourceRows, row);
            if (!qty) return null;
            return {
                pricing_rule: rule.name,
                item_code: freeItem,
                qty,
                rate: num(rule.free_item_rate),
                uom: rule.free_item_uom || "",
                warehouse: row.warehouse || this.context.warehouse || "",
                source_row: int(rule.same_item) ? row : null,
            };
        }

        evaluateItemRules(paidRows) {
            const rowResults = new Map();
            const freeRequests = [];

            for (const row of paidRows) {
                const rules = this.getPricingRulesForRow(row, paidRows);
                if (!rules.length) continue;
                const priceRules = rules.filter(rule => text(rule.price_or_product_discount || "Price") === "Price");
                const productRules = rules.filter(rule => text(rule.price_or_product_discount) === "Product");
                const ruleNames = unique(rules.map(rule => rule.name));

                if (priceRules.length) {
                    rowResults.set(row.name || row.item_code, {
                        rules: ruleNames,
                        details: this.applyPriceRules(row, priceRules),
                        validate_applied_rule: priceRules.some(rule => int(rule.validate_applied_rule)),
                    });
                } else if (ruleNames.length) {
                    rowResults.set(row.name || row.item_code, { rules: ruleNames, details: null, validate_applied_rule: false });
                }

                for (const rule of productRules) {
                    if (int(rule.validate_applied_rule)) continue;
                    const request = this.buildFreeRequest(rule, row, paidRows);
                    if (request) freeRequests.push(request);
                }
            }

            return { rowResults, freeRequests };
        }

        evaluateTransactionRules(paidRows, rowResults) {
            const totalQty = paidRows.reduce((sum, row) => sum + num(row.qty), 0);
            const total = paidRows.reduce((sum, row) => {
                const result = rowResults && rowResults.get(row.name || row.item_code);
                if (!result || !result.details || result.validate_applied_rule) {
                    return sum + num(row.amount || (num(row.qty) * num(row.rate)));
                }
                const details = result.details;
                let effectiveRate = num(details.price_list_rate || row.price_list_rate || row.rate);
                if (effectiveRate) {
                    effectiveRate = effectiveRate * (1 - (num(details.discount_percentage) / 100));
                    if (num(details.discount_amount)) effectiveRate = num(details.price_list_rate) - num(details.discount_amount);
                }
                return sum + (num(row.qty) * Math.max(0, effectiveRate));
            }, 0);
            const rules = this.rules.filter(rule => {
                if (text(rule.apply_on) !== "Transaction") return false;
                if (!this.ruleIsCommonCandidate(rule, null)) return false;
                return this.meetsQtyAmount(rule, totalQty, total, {});
            });

            let applyDiscountOn = "Grand Total";
            let additionalDiscountPercentage = 0;
            let discountAmount = 0;
            let appliedRule = "";
            const freeRequests = [];

            for (const rule of rules) {
                if (text(rule.price_or_product_discount || "Price") === "Price") {
                    if (rule.apply_discount_on) applyDiscountOn = rule.apply_discount_on;
                    if (int(rule.validate_applied_rule)) continue;

                    let conditionMet = false;
                    if (num(rule.discount_percentage)) {
                        if (!int(rule.coupon_code_based) || this.ruleMatchesCoupon(rule)) {
                            additionalDiscountPercentage = num(rule.discount_percentage);
                            discountAmount = 0;
                            appliedRule = rule.name;
                            conditionMet = int(rule.coupon_code_based) === 1;
                        }
                    }
                    if (num(rule.discount_amount)) {
                        if (!int(rule.coupon_code_based) || this.ruleMatchesCoupon(rule)) {
                            discountAmount = num(rule.discount_amount);
                            additionalDiscountPercentage = 0;
                            appliedRule = rule.name;
                            conditionMet = int(rule.coupon_code_based) === 1;
                        }
                    }
                    if (conditionMet) break;
                } else if (text(rule.price_or_product_discount) === "Product") {
                    const freeItem = rule.free_item;
                    if (!freeItem) continue;
                    const qty = this.getFreeQty(rule, paidRows, null);
                    if (!qty) continue;
                    freeRequests.push({
                        pricing_rule: rule.name,
                        item_code: freeItem,
                        qty,
                        rate: num(rule.free_item_rate),
                        uom: rule.free_item_uom || "",
                        warehouse: this.context.warehouse || "",
                        source_row: null,
                    });
                }
            }

            return {
                rules: rules.map(rule => rule.name),
                apply_discount_on: applyDiscountOn,
                additional_discount_percentage: additionalDiscountPercentage,
                discount_amount: discountAmount,
                applied_rule: appliedRule,
                freeRequests,
            };
        }

        evaluate(options = {}) {
            const paidRows = this.getPaidRows();
            const item = this.evaluateItemRules(paidRows);
            const includeTransaction = options.include_transaction !== false;
            const transaction = includeTransaction
                ? this.evaluateTransactionRules(paidRows, item.rowResults)
                : {
                    rules: [],
                    apply_discount_on: "Grand Total",
                    additional_discount_percentage: 0,
                    discount_amount: 0,
                    applied_rule: "",
                    freeRequests: [],
                };
            return {
                paidRows,
                rowResults: item.rowResults,
                freeRequests: item.freeRequests.concat(transaction.freeRequests),
                itemFreeRequests: item.freeRequests,
                transaction,
            };
        }
    }

    window.WMNERPNextPricingRuleOffline = WMNERPNextPricingRuleOffline;
})();
