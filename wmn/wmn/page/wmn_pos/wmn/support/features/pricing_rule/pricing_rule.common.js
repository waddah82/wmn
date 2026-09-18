/* ERPNext v16.6.1 Pricing Rule compatibility engine for WMN POS. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.PricingRule = ns.Features.PricingRule || {};
    ns.Features.PricingRule.Common = ns.Features.PricingRule.Common || {};

    const EPSILON = 0.000001;
    const ITEM_SCOPES = ["Item Code", "Item Group", "Brand"];
    const APPLY_FIELD = { "Item Code": "item_code", "Item Group": "item_group", "Brand": "brand" };
    const CHILD_FIELD = { "Item Code": "items", "Item Group": "item_groups", "Brand": "brands" };

    function num(value) {
        try { return typeof flt === "function" ? flt(value || 0) : Number(value || 0) || 0; }
        catch (e) { return Number(value || 0) || 0; }
    }
    function int(value) {
        try { return typeof cint === "function" ? cint(value || 0) : parseInt(value || 0, 10) || 0; }
        catch (e) { return parseInt(value || 0, 10) || 0; }
    }
    function text(value) { return String(value == null ? "" : value).trim(); }
    function scrub(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function same(a, b) { return text(a) === text(b); }
    function isoDate(value) { return text(value).slice(0, 10); }
    function transactionDate(doc) {
        const value = isoDate(doc?.transaction_date || doc?.posting_date);
        if (value) return value;
        try { return isoDate(frappe.datetime.get_today()); } catch (e) {}
        return new Date().toISOString().slice(0, 10);
    }

    function buildTree(rows, parentField) {
        const byName = Object.create(null);
        const parent = Object.create(null);
        const children = Object.create(null);
        let root = "";
        for (const raw of rows || []) {
            const row = raw || {};
            const name = text(row.name);
            if (!name) continue;
            byName[name] = row;
            parent[name] = text(row[parentField]);
            if (!children[parent[name]]) children[parent[name]] = [];
            children[parent[name]].push(name);
            if (int(row.is_group) && !parent[name] && !root) root = name;
        }
        return { byName, parent, children, root };
    }

    function buildTreeContext(trees) {
        trees = trees || {};
        return {
            item_group: buildTree(trees.item_groups, "parent_item_group"),
            customer_group: buildTree(trees.customer_groups, "parent_customer_group"),
            territory: buildTree(trees.territories, "parent_territory"),
            warehouse: buildTree(trees.warehouses, "parent_warehouse"),
        };
    }

    function ancestors(value, tree, includeRoot = true) {
        const out = [];
        const seen = new Set();
        let current = text(value);
        while (current && !seen.has(current)) {
            seen.add(current);
            out.push(current);
            current = text(tree?.parent?.[current]);
        }
        if (includeRoot && tree?.root && !out.includes(tree.root)) out.push(tree.root);
        return out;
    }

    function descendants(value, tree) {
        const start = text(value);
        if (!start) return [];
        const out = [];
        const seen = new Set();
        const stack = [start];
        while (stack.length) {
            const current = stack.pop();
            if (!current || seen.has(current)) continue;
            seen.add(current);
            out.push(current);
            for (const child of tree?.children?.[current] || []) stack.push(child);
        }
        return out;
    }

    function treeCondition(ruleValue, argValue, tree, allowBlank = true) {
        const rule = text(ruleValue);
        const arg = text(argValue);
        if (!arg) return allowBlank ? !rule : false;
        const allowed = ancestors(arg, tree, true);
        return (allowBlank && !rule) || allowed.includes(rule);
    }

    function isSellingDoc(doc) {
        return ["Quotation", "Quotation Item", "Sales Order", "Sales Order Item", "Delivery Note", "Delivery Note Item",
            "Sales Invoice", "Sales Invoice Item", "POS Invoice", "POS Invoice Item"].includes(text(doc?.doctype || doc?.parenttype));
    }

    function conditionCommon(rule, doc, tree, includePriceList) {
        if (!rule || int(rule.disable)) return false;
        const selling = isSellingDoc(doc) || !text(doc?.doctype);
        if (selling ? !int(rule.selling) : !int(rule.buying)) return false;

        for (const field of ["company", "customer", "campaign", "sales_partner"]) {
            const arg = text(doc?.[field]);
            const required = text(rule?.[field]);
            if (arg ? (required && required !== arg) : !!required) return false;
        }
        if (!treeCondition(rule.customer_group, doc?.customer_group, tree.customer_group, true)) return false;
        if (!treeCondition(rule.territory, doc?.territory, tree.territory, true)) return false;

        const date = transactionDate(doc);
        const validFrom = isoDate(rule.valid_from) || "2000-01-01";
        const validUpto = isoDate(rule.valid_upto) || "2500-12-31";
        if (date && (date < validFrom || date > validUpto)) return false;

        if (includePriceList) {
            const priceList = text(doc?.selling_price_list || doc?.price_list);
            const forPriceList = text(rule.for_price_list);
            if (forPriceList && forPriceList !== priceList) return false;
        }
        return true;
    }

    function warehouseCondition(rule, row, doc, tree) {
        const warehouse = text(row?.warehouse || doc?.set_warehouse || doc?.warehouse);
        return treeCondition(rule.warehouse, warehouse, tree.warehouse, true);
    }

    /* Safe evaluator for serialized Python AST from frappe.safe_eval conditions. */
    function pythonTruthy(value) {
        if (value == null || value === false) return false;
        if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
        if (typeof value === "string" || Array.isArray(value)) return value.length > 0;
        if (value instanceof Set || value instanceof Map) return value.size > 0;
        if (typeof value === "object") return Object.keys(value).length > 0;
        return Boolean(value);
    }

    const asIterable = (value) => {
        if (value == null) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === "string") return Array.from(value);
        if (typeof value[Symbol.iterator] === "function") return Array.from(value);
        return Object.keys(value);
    };

    // Frappe v16.9.0 frappe.safe_eval() exposes only int, float, long and round
    // when Pricing Rule conditions are evaluated with eval_globals=None. Keep the
    // local condition environment equally narrow; unknown globals must make the
    // rule skip, exactly as native safe_eval does.
    const pythonRound = (value, digits = 0) => {
        const n = num(value), d = int(digits), factor = 10 ** d;
        const scaled = n * factor;
        const floor = Math.floor(scaled);
        const fraction = scaled - floor;
        let rounded;
        if (Math.abs(fraction - 0.5) <= Number.EPSILON * Math.max(1, Math.abs(scaled))) {
            rounded = floor % 2 === 0 ? floor : floor + 1;
        } else {
            rounded = Math.round(scaled);
        }
        return rounded / factor;
    };
    const safeFunctions = {
        int: (v) => int(v),
        long: (v) => int(v),
        float: (v) => num(v),
        round: (v, n = 0) => pythonRound(v, n),
    };

    function astAttribute(base, attr) {
        if (base == null) return undefined;
        const name = text(attr);
        if (!name || name.startsWith("_") || ["format", "format_map"].includes(name)) {
            throw new Error(`Unsafe Python attribute ${name}`);
        }
        if (typeof base === "string") {
            const methods = {
                lower: () => base.toLowerCase(), upper: () => base.toUpperCase(), strip: () => base.trim(),
                lstrip: () => base.replace(/^\s+/, ""), rstrip: () => base.replace(/\s+$/, ""),
                startswith: (v) => Array.isArray(v) ? v.some((x) => base.startsWith(String(x))) : base.startsWith(String(v)),
                endswith: (v) => Array.isArray(v) ? v.some((x) => base.endsWith(String(x))) : base.endsWith(String(v)),
                replace: (a, b) => base.split(String(a)).join(String(b)), find: (v) => base.indexOf(String(v)),
                count: (v) => String(v) ? base.split(String(v)).length - 1 : 0,
                split: (sep = undefined) => sep === undefined ? base.trim().split(/\s+/) : base.split(String(sep)),
            };
            if (methods[name]) return methods[name];
        }
        if (Array.isArray(base)) {
            const methods = { count: (v) => base.filter((x) => x === v).length, index: (v) => base.indexOf(v) };
            if (methods[name]) return methods[name];
        }
        if (typeof base === "object" && name === "get") {
            return (key, fallback = null) => Object.prototype.hasOwnProperty.call(base, key) ? base[key] : fallback;
        }
        return base[name];
    }

    function compareValues(op, left, right) {
        switch (op) {
            case "Eq": return left === right;
            case "NotEq": return left !== right;
            case "Lt": return left < right;
            case "LtE": return left <= right;
            case "Gt": return left > right;
            case "GtE": return left >= right;
            case "In": return right != null && (typeof right.includes === "function" ? right.includes(left) : Object.prototype.hasOwnProperty.call(right, left));
            case "NotIn": return !(right != null && (typeof right.includes === "function" ? right.includes(left) : Object.prototype.hasOwnProperty.call(right, left)));
            case "Is": return left === right;
            case "IsNot": return left !== right;
            default: throw new Error(`Unsupported Python compare ${op}`);
        }
    }

    function assignAstTarget(target, value, env) {
        if (!target) return;
        if (target.type === "Name") { env[target.id] = value; return; }
        if (["Tuple", "List"].includes(target.type)) {
            const values = asIterable(value);
            (target.elts || []).forEach((child, i) => assignAstTarget(child, values[i], env));
            return;
        }
        throw new Error(`Unsupported Python assignment target ${target.type}`);
    }

    function evalComprehension(node, env, emit) {
        const generators = node.generators || [];
        function walk(index, scope) {
            if (index >= generators.length) { emit(scope); return; }
            const generator = generators[index];
            for (const value of asIterable(evalAst(generator.iter, scope))) {
                const next = Object.assign({}, scope);
                assignAstTarget(generator.target, value, next);
                let allowed = true;
                for (const test of generator.ifs || []) { if (!pythonTruthy(evalAst(test, next))) { allowed = false; break; } }
                if (allowed) walk(index + 1, next);
            }
        }
        walk(0, Object.assign({}, env));
    }

    function evalAst(node, env) {
        if (!node || typeof node !== "object") return node;
        switch (node.type) {
            case "Constant": return node.value;
            case "Name": {
                if (Object.prototype.hasOwnProperty.call(env, node.id)) return env[node.id];
                if (Object.prototype.hasOwnProperty.call(safeFunctions, node.id)) return safeFunctions[node.id];
                if (node.id === "True") return true;
                if (node.id === "False") return false;
                if (node.id === "None") return null;
                throw new Error(`Unknown Python name ${node.id}`);
            }
            case "Attribute": return astAttribute(evalAst(node.value, env), node.attr);
            case "List": case "Tuple": case "Set": return (node.elts || []).map((n) => evalAst(n, env));
            case "Dict": {
                const out = {};
                (node.keys || []).forEach((key, i) => { out[evalAst(key, env)] = evalAst((node.values || [])[i], env); });
                return out;
            }
            case "Subscript": {
                const value = evalAst(node.value, env);
                const slice = node.slice?.type === "Slice" ? node.slice : null;
                if (slice) {
                    const source = value == null ? [] : (typeof value === "string" ? Array.from(value) : asIterable(value));
                    const step = slice.step ? int(evalAst(slice.step, env)) : 1;
                    if (!step) throw new Error("slice step cannot be zero");
                    const length = source.length;
                    let start = slice.lower ? int(evalAst(slice.lower, env)) : (step > 0 ? 0 : length - 1);
                    let stop = slice.upper ? int(evalAst(slice.upper, env)) : (step > 0 ? length : -1);
                    if (start < 0) start += length;
                    if (slice.upper && stop < 0) stop += length;
                    const out = [];
                    if (step > 0) for (let i = Math.max(0, start); i < Math.min(length, stop); i += step) out.push(source[i]);
                    else for (let i = Math.min(length - 1, start); i > stop && i >= 0; i += step) out.push(source[i]);
                    return typeof value === "string" ? out.join("") : out;
                }
                return value?.[evalAst(node.slice, env)];
            }
            case "BoolOp": {
                if (node.op?.type === "And") {
                    let value = true;
                    for (const child of node.values || []) { value = evalAst(child, env); if (!pythonTruthy(value)) return value; }
                    return value;
                }
                let value = false;
                for (const child of node.values || []) { value = evalAst(child, env); if (pythonTruthy(value)) return value; }
                return value;
            }
            case "UnaryOp": {
                const v = evalAst(node.operand, env);
                if (node.op?.type === "Not") return !pythonTruthy(v);
                if (node.op?.type === "USub") return -num(v);
                if (node.op?.type === "UAdd") return num(v);
                if (node.op?.type === "Invert") return ~int(v);
                throw new Error("Unsupported Python unary operator");
            }
            case "BinOp": {
                const a = evalAst(node.left, env), b = evalAst(node.right, env), op = node.op?.type;
                if (op === "Add") return a + b;
                if (op === "Sub") return a - b;
                if (op === "Mult") return a * b;
                if (op === "Div") return a / b;
                if (op === "FloorDiv") return Math.floor(a / b);
                if (op === "Mod") return ((a % b) + b) % b;
                if (op === "Pow") return a ** b;
                if (op === "BitAnd") return int(a) & int(b);
                if (op === "BitOr") return int(a) | int(b);
                if (op === "BitXor") return int(a) ^ int(b);
                throw new Error(`Unsupported Python binary operator ${op}`);
            }
            case "Compare": {
                let left = evalAst(node.left, env);
                for (let i = 0; i < (node.ops || []).length; i++) {
                    const right = evalAst((node.comparators || [])[i], env);
                    if (!compareValues(node.ops[i]?.type, left, right)) return false;
                    left = right;
                }
                return true;
            }
            case "ListComp": case "GeneratorExp": {
                const out = []; evalComprehension(node, env, (scope) => out.push(evalAst(node.elt, scope))); return out;
            }
            case "SetComp": {
                const out = []; evalComprehension(node, env, (scope) => out.push(evalAst(node.elt, scope))); return Array.from(new Set(out));
            }
            case "DictComp": {
                const out = {}; evalComprehension(node, env, (scope) => { out[evalAst(node.key, scope)] = evalAst(node.value, scope); }); return out;
            }
            case "Lambda": {
                return (...values) => {
                    const scope = Object.assign({}, env);
                    (node.args?.args || []).forEach((arg, i) => { scope[arg.arg] = values[i]; });
                    return evalAst(node.body, scope);
                };
            }
            case "JoinedStr": return (node.values || []).map((child) => evalAst(child, env)).join("");
            case "FormattedValue": return String(evalAst(node.value, env));
            case "IfExp": return pythonTruthy(evalAst(node.test, env)) ? evalAst(node.body, env) : evalAst(node.orelse, env);
            case "Call": {
                const fn = evalAst(node.func, env);
                if (typeof fn !== "function") throw new Error("Unsafe or unsupported Python call");
                const args = (node.args || []).map((n) => evalAst(n, env));
                const kwargs = {};
                for (const kw of node.keywords || []) kwargs[kw.arg] = evalAst(kw.value, env);
                return Object.keys(kwargs).length ? fn(...args, kwargs) : fn(...args);
            }
            default: throw new Error(`Unsupported Python AST node ${node.type}`);
        }
    }

    function conditionMatches(rule, doc) {
        if (!text(rule.condition)) return true;
        try {
            const env = Object.assign({ doc }, doc || {}, safeFunctions);
            return pythonTruthy(evalAst(rule.condition_ast, env));
        } catch (e) {
            // Native ERPNext silently skips a Pricing Rule when safe_eval raises.
            return false;
        }
    }

    function buildRuleIndex(snapshot) {
        if (snapshot.__wmn_native_rule_index) return snapshot.__wmn_native_rule_index;
        const index = {
            by_item_code: new Map(), by_item_group: new Map(), by_brand: new Map(),
            other_item_code: new Map(), other_item_group: new Map(), other_brand: new Map(),
            transaction: [],
        };
        const push = (map, key, rule) => {
            key = text(key); if (!key) return;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(rule);
        };
        for (const rule of snapshot.rules || []) {
            const applyOn = text(rule.apply_on);
            if (applyOn === "Item Code") for (const child of rule.items || []) push(index.by_item_code, child.item_code, rule);
            if (applyOn === "Item Group") for (const child of rule.item_groups || []) push(index.by_item_group, child.item_group, rule);
            if (applyOn === "Brand") for (const child of rule.brands || []) push(index.by_brand, child.brand, rule);
            if (text(rule.apply_rule_on_other) === "Item Code") push(index.other_item_code, rule.other_item_code, rule);
            if (text(rule.apply_rule_on_other) === "Item Group") push(index.other_item_group, rule.other_item_group, rule);
            if (text(rule.apply_rule_on_other) === "Brand") push(index.other_brand, rule.other_brand, rule);
            if (applyOn === "Transaction") index.transaction.push(rule);
        }
        index.transaction.sort((a, b) => int(a.wmn_native_transaction_sequence) - int(b.wmn_native_transaction_sequence));
        snapshot.__wmn_native_rule_index = index;
        return index;
    }

    function childRows(rule, scope) { return rule?.[CHILD_FIELD[scope]] || []; }
    function childValue(child, scope) { return text(child?.[APPLY_FIELD[scope]]); }

    function childMatches(scope, child, row, tree) {
        const field = APPLY_FIELD[scope];
        const arg = text(row?.[field]);
        if (!arg) return false;
        if (scope === "Item Code") {
            const direct = childValue(child, scope) === arg && (!text(row.uom) || !text(child.uom) || text(child.uom) === text(row.uom));
            // ERPNext's SQL variant OR is outside the UOM condition in v16.6.1.
            const variant = !!text(row.variant_of) && childValue(child, scope) === text(row.variant_of);
            return direct || variant;
        }
        if (scope === "Item Group") {
            const inTree = ancestors(arg, tree.item_group, true).includes(childValue(child, scope));
            return inTree && (!text(row.uom) || !text(child.uom) || text(child.uom) === text(row.uom));
        }
        return childValue(child, scope) === arg;
    }

    function candidateClone(rule, scope, child, viaOther = false) {
        const out = Object.assign({}, rule);
        out.__wmn_scope = scope;
        out.__wmn_via_other = !!viaOther;
        if (child) {
            const field = APPLY_FIELD[scope];
            out[field] = child[field];
            if (Object.prototype.hasOwnProperty.call(child, "uom")) out.uom = child.uom;
            out.__wmn_matched_child = child;
        }
        return out;
    }

    function queryScopeCandidates(scope, row, doc, snapshot, tree, index) {
        const field = APPLY_FIELD[scope];
        const arg = text(row?.[field]);
        if (!arg) return [];
        const source = [];
        if (scope === "Item Code") {
            source.push(...(index.by_item_code.get(arg) || []));
            if (text(row.variant_of)) source.push(...(index.by_item_code.get(text(row.variant_of)) || []));
            source.push(...(index.other_item_code.get(arg) || []));
        } else if (scope === "Item Group") {
            for (const group of ancestors(arg, tree.item_group, true)) source.push(...(index.by_item_group.get(group) || []));
            source.push(...(index.other_item_group.get(arg) || []));
        } else {
            source.push(...(index.by_brand.get(arg) || []), ...(index.other_brand.get(arg) || []));
        }

        const out = [];
        const emitted = new Set();
        for (const rule of source) {
            if (!conditionCommon(rule, doc, tree, true) || !warehouseCondition(rule, row, doc, tree)) continue;
            const directChildren = childRows(rule, scope).filter((child) => childMatches(scope, child, row, tree));
            const viaOther = text(rule.apply_rule_on_other) === scope && text(rule[`other_${field}`]) === arg;
            if (directChildren.length) {
                for (const child of directChildren) {
                    const key = `${rule.name}::${scope}::${childValue(child, scope)}::${text(child.uom)}::0`;
                    if (!emitted.has(key)) { emitted.add(key); out.push(candidateClone(rule, scope, child, false)); }
                }
            } else if (viaOther) {
                // SQL joins all source child rows when the OR branch matches the target.
                for (const child of childRows(rule, scope)) {
                    const key = `${rule.name}::${scope}::${childValue(child, scope)}::${text(child.uom)}::1`;
                    if (!emitted.has(key)) { emitted.add(key); out.push(candidateClone(rule, scope, child, true)); }
                }
            }
        }
        return out.sort((a, b) => {
            const pa = int(a.priority), pb = int(b.priority);
            if (pa !== pb) return pb - pa;
            return text(b.name).localeCompare(text(a.name));
        });
    }

    function allMultiple(rules) { return !!rules.length && rules.every((r) => int(r.apply_multiple_pricing_rules)); }

    function getRuleItems(rule, tree, other = false) {
        if (other && text(rule.apply_rule_on_other)) {
            return [text(rule[`other_${scrub(rule.apply_rule_on_other)}`])].filter(Boolean);
        }
        const scope = text(rule.apply_on);
        const field = APPLY_FIELD[scope];
        const values = [];
        for (const child of childRows(rule, scope)) {
            const value = text(child?.[field]);
            if (!value) continue;
            if (scope === "Item Group") values.push(...descendants(value, tree.item_group));
            else values.push(value);
        }
        return Array.from(new Set(values));
    }

    function conversionFactor(snapshot, itemCode, uom, row) {
        const requested = text(uom);
        if (!requested) return 1;
        const stockUom = text(row?.stock_uom);
        if (requested === stockUom) return 1;
        const map = snapshot.uom_conversions || {};
        const fromMap = num(map?.[text(itemCode)]?.[requested]);
        if (fromMap) return fromMap;
        if (requested === text(row?.uom)) return num(row?.conversion_factor) || 1;
        return 1;
    }

    function filterQtyAmount(qty, amount, rules, args, snapshot) {
        const out = [];
        for (const rule of rules || []) {
            let factor = 1;
            if (text(rule.uom)) factor = conversionFactor(snapshot, rule.item_code || args.item_code, rule.uom, args);
            const q = num(qty), a = num(amount);
            let ok = q + EPSILON >= num(rule.min_qty) * factor;
            if (ok && num(rule.max_qty)) ok = q - EPSILON <= num(rule.max_qty) * factor;
            if (text(rule.uom) === text(args?.uom)) factor = 1;
            if (ok) ok = a + EPSILON >= num(rule.min_amt) * factor;
            if (ok && num(rule.max_amt)) ok = a - EPSILON <= num(rule.max_amt) * factor;
            if (ok) out.push(rule);
        }
        return out;
    }

    function cumulativeData(rule, doc, items) {
        const doctype = text(doc?.parenttype || doc?.doctype || "Sales Invoice");
        const data = rule?.cumulative_summary?.[doctype] || rule?.cumulative_summary?.["Sales Invoice"] || null;
        if (!data) return [0, 0];
        if (!items?.length) return [num(data.total?.stock_qty), num(data.total?.amount)];
        let qty = 0, amount = 0;
        for (const item of items) {
            qty += num(data.by_value?.[text(item)]?.stock_qty);
            amount += num(data.by_value?.[text(item)]?.amount);
        }
        return [qty, amount];
    }

    function withPendingCumulative(snapshot, pendingRows) {
        snapshot = snapshot || {};
        const rows = Array.isArray(pendingRows) ? pendingRows : [];
        const cumulativeRules = (snapshot.rules || []).filter((rule) => int(rule.is_cumulative) && text(rule.apply_on) !== "Transaction");
        if (!rows.length || !cumulativeRules.length) return snapshot;

        const tree = buildTreeContext(snapshot.trees || {});
        const clonedByName = new Map();
        const rules = (snapshot.rules || []).map((rule) => {
            if (!int(rule.is_cumulative) || text(rule.apply_on) === "Transaction") return rule;
            const cloned = Object.assign({}, rule, { cumulative_summary: clone(rule.cumulative_summary || {}) || {} });
            clonedByName.set(text(cloned.name), cloned);
            return cloned;
        });
        const runtime = Object.assign({}, snapshot, { rules });
        delete runtime.__wmn_native_rule_index;

        for (const rule of cumulativeRules) {
            const target = clonedByName.get(text(rule.name));
            if (!target) continue;
            const field = APPLY_FIELD[text(target.apply_on)];
            if (!field) continue;
            const validFrom = isoDate(target.valid_from) || "2000-01-01";
            const validUpto = isoDate(target.valid_upto) || "2500-12-31";
            const allowedWarehouses = text(target.warehouse)
                ? new Set(descendants(text(target.warehouse), tree.warehouse))
                : null;

            for (const queueRow of rows) {
                const invoice = queueRow?.invoice || queueRow?.doc || queueRow?.data || queueRow || {};
                const stage = text(invoice.wmn_pos_stage);
                if (text(queueRow?.queue_kind).toLowerCase() === "draft" || stage === "AWAITING_CASHIER") continue;
                const doctype = text(invoice.doctype || queueRow?.doctype || "Sales Invoice");
                if (!["Sales Invoice", "POS Invoice"].includes(doctype)) continue;
                const date = isoDate(invoice.transaction_date || invoice.posting_date);
                if (!date || date < validFrom || date > validUpto) continue;

                if (!target.cumulative_summary[doctype]) {
                    target.cumulative_summary[doctype] = { by_value: {}, total: { stock_qty: 0, amount: 0 } };
                }
                const bucket = target.cumulative_summary[doctype];
                bucket.by_value = bucket.by_value || {};
                bucket.total = bucket.total || { stock_qty: 0, amount: 0 };

                for (const item of invoice.items || []) {
                    if (int(item.is_free_item)) continue;
                    const warehouse = text(item.warehouse || invoice.set_warehouse);
                    if (allowedWarehouses && !allowedWarehouses.has(warehouse)) continue;
                    const value = text(item[field]);
                    if (!value) continue;
                    const stockQty = num(item.stock_qty !== undefined ? item.stock_qty : num(item.qty) * (num(item.conversion_factor) || 1));
                    const amount = num(item.amount);
                    if (!bucket.by_value[value]) bucket.by_value[value] = { stock_qty: 0, amount: 0 };
                    bucket.by_value[value].stock_qty = num(bucket.by_value[value].stock_qty) + stockQty;
                    bucket.by_value[value].amount = num(bucket.by_value[value].amount) + amount;
                    bucket.total.stock_qty = num(bucket.total.stock_qty) + stockQty;
                    bucket.total.amount = num(bucket.total.amount) + amount;
                }
            }
        }
        return runtime;
    }

    function mixedQtyAmount(doc, rule, args, tree) {
        const items = getRuleItems(rule, tree, false);
        const field = APPLY_FIELD[text(rule.apply_on)];
        let qty = 0, amount = 0;
        if (items.length) {
            for (const row of doc.items || []) {
                if (int(row.is_free_item)) continue;
                const value = text(row?.[field] || args?.[field]);
                if (!items.includes(value)) continue;
                let rowAmount = num(args.qty) * num(args.price_list_rate);
                if (text(args.item_code) !== text(row.item_code)) rowAmount = num(row.qty) * num(row.price_list_rate || args.rate);
                qty += num(row.stock_qty) || num(args.stock_qty) || num(args.qty);
                amount += rowAmount;
            }
            if (int(rule.is_cumulative)) {
                const history = cumulativeData(rule, doc, items);
                if (history[0]) { qty += history[0]; amount += history[1]; }
            }
        }
        return { qty, amount, items };
    }

    function otherItemFilter(doc, rule, candidates, rowArgs, tree, snapshot) {
        const otherItems = getRuleItems(rule, tree, true);
        const sourceItems = getRuleItems(rule, tree, false);
        const field = APPLY_FIELD[text(rule.apply_on)];
        for (const row of doc.items || []) {
            if (!sourceItems.includes(text(row?.[field])) || !num(row.qty) || int(row.is_free_item)) continue;
            const stockQty = num(row.qty) * (num(row.conversion_factor) || 1);
            const amount = stockQty * (num(row.price_list_rate) || num(row.rate));
            const filtered = filterQtyAmount(stockQty, amount, candidates, row, snapshot);
            if (filtered.length) {
                filtered[0] = Object.assign({}, filtered[0], { apply_rule_on_other_items: otherItems });
                return filtered;
            }
        }
        return [];
    }

    function suggestion(rule, qty, amount, itemCode) {
        if (!num(rule.threshold_percentage)) return null;
        let field = "";
        for (const [name, value] of [["min_qty", qty], ["min_amt", amount]]) {
            const limit = num(rule[name]);
            if (limit && value < limit && (limit - int(limit * num(rule.threshold_percentage) * 0.01)) <= value) field = name;
        }
        for (const [name, value] of [["max_qty", qty], ["max_amt", amount]]) {
            const limit = num(rule[name]);
            if (limit && value > limit && (limit + int(limit * num(rule.threshold_percentage) * 0.01)) >= value) field = name;
        }
        return field ? { rule: text(rule.name), field, item_code: text(itemCode), threshold: num(rule[field]) } : null;
    }

    function filterPricingRules(args, rules, doc, snapshot, tree) {
        rules = Array.isArray(rules) ? rules.slice() : [rules];
        const original = rules.slice();
        let stockQty = num(args.stock_qty);
        let amount = num(args.price_list_rate) * num(args.qty);
        let appliedItems = null;
        if (rules.length) {
            const firstDoc = rules[0];
            if (int(firstDoc.mixed_conditions) && doc) {
                const mixed = mixedQtyAmount(doc, firstDoc, args, tree);
                stockQty = mixed.qty; amount = mixed.amount; appliedItems = mixed.items;
                rules = rules.map((r) => Object.assign({}, r, { apply_rule_on_other_items: mixed.items }));
            } else if (int(firstDoc.is_cumulative)) {
                const field = APPLY_FIELD[text(firstDoc.apply_on)];
                const history = cumulativeData(firstDoc, doc || args, [text(args[field])]);
                stockQty += history[0]; amount += history[1];
            }
            if (text(firstDoc.apply_rule_on_other) && !int(firstDoc.mixed_conditions) && doc) {
                rules = otherItemFilter(doc, firstDoc, rules, args, tree, snapshot);
            } else {
                rules = filterQtyAmount(stockQty, amount, rules, args, snapshot);
            }
            if (!rules.length) {
                for (const r of original) {
                    const s = suggestion(r, stockQty, amount, args.item_code);
                    if (s) return { suggestion: s };
                }
            }
        }
        if (rules.length > 1) {
            const currency = text(args.currency);
            const sameCurrency = rules.filter((r) => text(r.currency) === currency);
            if (sameCurrency.length) rules = sameCurrency;
        }
        if (rules.length) {
            const maxPriority = Math.max(...rules.map((r) => int(r.priority)));
            if (maxPriority) rules = rules.filter((r) => int(r.priority) === maxPriority);
        }
        if (rules.length > 1) {
            const types = Array.from(new Set(rules.map((r) => text(r.rate_or_discount))));
            if (types.length === 1 && types[0] === "Discount Percentage") {
                const exact = rules.filter((r) => text(r.for_price_list) === text(args.price_list));
                if (exact.length) rules = exact;
            }
        }
        if (rules.length > 1 && !int(args.for_shopping_cart)) {
            return { conflict: rules.map((r) => text(r.name)).filter(Boolean) };
        }
        if (rules.length) return { rule: Object.assign({}, rules[0], appliedItems ? { apply_rule_on_other_items: appliedItems } : {}) };
        return {};
    }

    function getPricingRules(args, doc, snapshot, tree, index) {
        let candidates = [];
        for (const scope of ITEM_SCOPES) {
            candidates.push(...queryScopeCandidates(scope, args, doc, snapshot, tree, index));
            if (candidates.length && int(candidates[0].has_priority)) continue;
            if (candidates.length && !allMultiple(candidates)) break;
        }
        candidates = candidates.filter((r) => conditionMatches(r, doc));
        if (!candidates.length) return { rules: [], suggestions: [], errors: [] };

        const suggestions = [], errors = [], selected = [];
        if (allMultiple(candidates)) {
            const buckets = new Map();
            for (const candidate of candidates) {
                const result = filterPricingRules(args, candidate, doc, snapshot, tree);
                if (result.suggestion) { suggestions.push(result.suggestion); continue; }
                if (result.conflict) { errors.push({ type: "multiple_rule_conflict", rules: result.conflict, item_code: text(args.item_code) }); continue; }
                if (!result.rule || !int(result.rule.apply_multiple_pricing_rules)) continue;
                const priority = int(result.rule.priority) || 1;
                if (!buckets.has(priority)) buckets.set(priority, []);
                buckets.get(priority).push(result.rule);
            }
            for (const priority of Array.from(buckets.keys()).sort((a, b) => a - b)) selected.push(...buckets.get(priority));
        } else {
            const result = filterPricingRules(args, candidates, doc, snapshot, tree);
            if (result.suggestion) suggestions.push(result.suggestion);
            if (result.conflict) errors.push({ type: "multiple_rule_conflict", rules: result.conflict, item_code: text(args.item_code) });
            if (result.rule) selected.push(result.rule);
        }
        return { rules: selected, suggestions, errors };
    }

    function rowBaseState(row, index) {
        const currentRate = num(row.rate ?? row.price_list_rate);
        const currentListRate = num(row.price_list_rate ?? row.rate);
        const previousAppliedRate = row.__wmn_local_pricing_applied_rate;
        const previousAppliedListRate = row.__wmn_local_pricing_applied_price_list_rate;
        const promotionApplied = row.__wmn_promotion_applied_rate;

        if (row.__wmn_local_pricing_base_rate === undefined) {
            row.__wmn_local_pricing_base_rate = currentRate;
            row.__wmn_local_pricing_base_price_list_rate = currentListRate;
            row.__wmn_local_pricing_base_discount_percentage = num(row.discount_percentage);
            row.__wmn_local_pricing_base_discount_amount = num(row.discount_amount);
            row.__wmn_local_pricing_base_margin_type = text(row.margin_type);
            row.__wmn_local_pricing_base_margin_rate_or_amount = num(row.margin_rate_or_amount);
        } else {
            const expected = promotionApplied !== undefined ? num(promotionApplied) : num(previousAppliedRate);
            const stillOwned = previousAppliedRate !== undefined && Math.abs(currentRate - expected) <= EPSILON;
            if (!stillOwned && promotionApplied === undefined) {
                row.__wmn_local_pricing_base_rate = currentRate;
                if (Math.abs(currentListRate - num(previousAppliedListRate)) > EPSILON) row.__wmn_local_pricing_base_price_list_rate = currentListRate;
                row.__wmn_local_pricing_base_discount_percentage = num(row.discount_percentage);
                row.__wmn_local_pricing_base_discount_amount = num(row.discount_amount);
                row.__wmn_local_pricing_base_margin_type = text(row.margin_type);
                row.__wmn_local_pricing_base_margin_rate_or_amount = num(row.margin_rate_or_amount);
            }
        }
        return { row, index };
    }

    function restoreRow(state) {
        const row = state.row;
        row.rate = num(row.__wmn_local_pricing_base_rate);
        row.price_list_rate = num(row.__wmn_local_pricing_base_price_list_rate);
        row.discount_percentage = num(row.__wmn_local_pricing_base_discount_percentage);
        row.discount_amount = num(row.__wmn_local_pricing_base_discount_amount);
        row.margin_type = text(row.__wmn_local_pricing_base_margin_type) || null;
        row.margin_rate_or_amount = num(row.__wmn_local_pricing_base_margin_rate_or_amount);
        row.pricing_rules = "";
        row.has_pricing_rule = 0;
        delete row.__wmn_local_pricing_rule_names;
        delete row.__wmn_local_pricing_applied_rate;
        delete row.__wmn_local_pricing_applied_price_list_rate;
    }

    function rowArgs(row, doc) {
        return Object.assign({}, row, {
            doctype: row.doctype || `${doc.doctype || "Sales Invoice"} Item`,
            parenttype: row.parenttype || doc.doctype || "Sales Invoice",
            parent: row.parent || doc.name,
            item_code: row.item_code,
            item_group: row.item_group,
            brand: row.brand,
            qty: num(row.qty),
            stock_qty: num(row.stock_qty) || num(row.qty) * (num(row.conversion_factor) || 1),
            conversion_factor: num(row.conversion_factor) || 1,
            uom: row.uom,
            stock_uom: row.stock_uom,
            warehouse: row.warehouse,
            price_list_rate: num(row.price_list_rate),
            rate: num(row.rate),
            discount_percentage: num(row.discount_percentage),
            discount_amount: num(row.discount_amount),
            customer: doc.customer || doc.party_name,
            customer_group: doc.customer_group,
            territory: doc.territory,
            currency: doc.currency,
            price_list: doc.selling_price_list || doc.price_list,
            company: doc.company,
            transaction_date: doc.transaction_date || doc.posting_date,
            campaign: doc.campaign,
            sales_partner: doc.sales_partner,
            coupon_code: doc.coupon_code || doc.__wmn_coupon_code,
            transaction_type: "selling",
            for_shopping_cart: 0,
            variant_of: row.variant_of,
        });
    }

    function ruleCouponMatches(rule, args) {
        if (!int(rule.coupon_code_based)) return true;
        return !!text(args.coupon_code) && text(args.coupon_code) === text(rule.coupon_code);
    }

    function applyPriceDiscountRule(rule, details, args) {
        details.pricing_rule_for = text(rule.rate_or_discount);
        const currency = text(args.currency);
        const marginType = text(rule.margin_type);
        if ((["Amount", "Percentage"].includes(marginType) && text(rule.currency) === currency) || marginType === "Percentage") {
            details.margin_type = marginType;
            details.has_margin = true;
            if (int(rule.apply_multiple_pricing_rules) && details.margin_rate_or_amount != null) details.margin_rate_or_amount += num(rule.margin_rate_or_amount);
            else details.margin_rate_or_amount = num(rule.margin_rate_or_amount);
        }
        if (text(rule.rate_or_discount) === "Rate") {
            let pricingRuleRate = 0;
            if (text(rule.currency) === currency) pricingRuleRate = num(rule.rate);
            if (pricingRuleRate) {
                const blankUom = text(rule.uom) !== text(args.uom);
                details.price_list_rate = pricingRuleRate * (blankUom ? (num(args.conversion_factor) || 1) : 1);
            }
            details.discount_percentage = 0;
        }
        for (const applyOn of ["Discount Amount", "Discount Percentage"]) {
            if (text(rule.rate_or_discount) !== applyOn) continue;
            let field = scrub(applyOn);
            if (int(rule.apply_discount_on_rate) && num(details.discount_percentage)) {
                details[field] = num(details[field]) + (100 - num(details[field])) * (num(rule[field]) / 100);
                // ERPNext keeps the compounded percentage as the authoritative value
                // for Apply Discount on Discounted Rate. The previous discount_amount
                // is an intermediate value from earlier rules and must not override
                // the compounded percentage when the row rate is materialized.
                details.apply_discount_on_discounted_rate = 1;
            } else if (num(args.price_list_rate)) {
                let value = num(rule[field]);
                let calculatePct = false;
                if (field === "discount_percentage") {
                    field = "discount_amount";
                    value = num(args.price_list_rate) * (value / 100);
                    calculatePct = true;
                }
                details[field] = num(details[field]) + value;
                if (calculatePct && num(args.price_list_rate) && num(details.discount_amount)) {
                    details.discount_percentage = num(details.discount_amount) / num(args.price_list_rate) * 100;
                }
            } else {
                details[field] = num(details[field]) + num(rule[field]);
            }
        }
    }

    function freeItemSpec(rule, details, args, doc, snapshot) {
        let freeItem = text(rule.free_item);
        if (int(rule.same_item) && text(rule.apply_on) !== "Transaction") freeItem = text(details.item_code || args?.item_code);
        if (!freeItem) return { error: { type: "free_item_missing", rules: [text(rule.name)] } };
        let qty = num(rule.free_qty) || 1;
        if (int(rule.is_recursive)) {
            const sourceItem = text(args?.item_code);
            const pricingRules = text(args?.pricing_rules);
            let transactionQty = (doc.items || []).filter((row) => !int(row.is_free_item) && text(row.item_code) === sourceItem && text(row.pricing_rules) === pricingRules)
                .reduce((sum, row) => sum + num(row.qty), 0);
            transactionQty -= num(rule.apply_recursion_over);
            if (transactionQty > 0) {
                qty = transactionQty * (num(rule.free_qty) || 1) / (num(rule.recurse_for) || 1);
                if (int(rule.round_free_qty)) qty = Math.floor(transactionQty / (num(rule.recurse_for) || 1)) * (num(rule.free_qty) || 1);
            }
        }
        if (!qty) return {};
        const itemMeta = snapshot?.item_meta?.[freeItem] || {};
        const uom = text(rule.free_item_uom || itemMeta.stock_uom);
        return { spec: {
            rule_name: text(rule.name), pricing_rules: text(rule.name), item_code: freeItem, qty,
            rate: num(rule.free_item_rate), price_list_rate: num(rule.free_item_rate), uom, stock_uom: text(itemMeta.stock_uom || uom),
            conversion_factor: conversionFactor(snapshot, freeItem, uom, itemMeta), is_free_item: 1,
            dont_enforce_free_item_qty: int(rule.dont_enforce_free_item_qty),
        } };
    }

    function getItemDetails(args, doc, snapshot, tree, index) {
        const details = {
            doctype: args.doctype, name: args.name, child_docname: args.child_docname,
            parent: args.parent, parenttype: args.parenttype, item_code: args.item_code,
            has_margin: false, free_item_data: [], margin_rate_or_amount: 0,
            discount_percentage: 0, discount_amount: 0,
        };
        const selection = getPricingRules(args, doc, snapshot, tree, index);
        const errors = selection.errors.slice(), suggestions = selection.suggestions.slice(), validations = [];
        if (!selection.rules.length) return { details, rules: [], errors, suggestions, validations };
        const ruleNames = [];
        for (const rule of selection.rules) {
            if (!ruleCouponMatches(rule, args) || rule.suggestion) continue;
            details.validate_applied_rule = int(rule.validate_applied_rule);
            details.price_or_product_discount = text(rule.price_or_product_discount);
            ruleNames.push(text(rule.name));
            if (int(rule.mixed_conditions) || text(rule.apply_rule_on_other)) {
                const other = rule.apply_rule_on_other_items || getRuleItems(rule, tree, !!text(rule.apply_rule_on_other));
                details.price_or_product_discount = text(rule.price_or_product_discount);
                details.apply_rule_on = scrub(text(rule.apply_rule_on_other) || text(rule.apply_on));
                details.apply_rule_on_other_items = other;
            }
            if (int(rule.validate_applied_rule)) {
                for (const field of ["discount_percentage", "discount_amount", "rate"]) {
                    if (num(args[field]) + EPSILON < num(rule[field])) validations.push({ type: "validate_applied_rule", rule: text(rule.name), item_code: text(args.item_code), field, required: num(rule[field]), actual: num(args[field]) });
                }
                continue;
            }
            if (text(rule.price_or_product_discount) === "Price") applyPriceDiscountRule(rule, details, args);
            else if (text(rule.price_or_product_discount) === "Product") {
                // ERPNext recursion compares source row.pricing_rules with the incoming args.pricing_rules
                // before the new rule list is written to the row.
                const free = freeItemSpec(rule, details, args, doc, snapshot);
                if (free.error) errors.push(free.error);
                if (free.spec) details.free_item_data.push(free.spec);
            }
        }
        if (!details.has_margin) { details.margin_type = null; details.margin_rate_or_amount = 0; }
        details.has_pricing_rule = ruleNames.length ? 1 : 0;
        details.pricing_rules = JSON.stringify(ruleNames);
        return { details, rules: ruleNames, errors, suggestions, validations };
    }

    function calculateFinalRow(row, details, doc) {
        if (!details || !details.has_pricing_rule) return;
        if (details.pricing_rule_for === "Rate" && details.price_list_rate != null) {
            row.price_list_rate = num(details.price_list_rate);
            row.rate = num(details.price_list_rate);
            row.discount_percentage = 0;
            row.discount_amount = 0;
        }
        if (details.discount_percentage != null && details.pricing_rule_for !== "Rate") row.discount_percentage = num(details.discount_percentage);
        if (details.discount_amount != null && details.pricing_rule_for !== "Rate") row.discount_amount = num(details.discount_amount);
        if (details.has_margin) {
            row.margin_type = details.margin_type;
            row.margin_rate_or_amount = num(details.margin_rate_or_amount);
        } else {
            row.margin_type = null;
            row.margin_rate_or_amount = 0;
        }
        row.pricing_rules = details.pricing_rules || "";
        row.has_pricing_rule = 1;

        if (num(row.discount_percentage) === 100) row.rate = 0;
        else if (num(row.price_list_rate) && details.pricing_rule_for !== "Rate") {
            if (!num(row.rate) || (row.pricing_rules && num(row.discount_percentage) > 0)) {
                row.rate = num(row.price_list_rate) * (1 - num(row.discount_percentage) / 100);
            }
            // Native AccountsController lets Discount Amount override the percentage
            // for mixed Percentage + Amount rules. Apply Discount on Discounted Rate
            // is the exception: its compounded percentage is authoritative.
            if (int(details.apply_discount_on_discounted_rate) && num(row.discount_percentage)) {
                row.rate = num(row.price_list_rate) * (1 - num(row.discount_percentage) / 100);
                row.discount_amount = num(row.price_list_rate) - num(row.rate);
            } else if (num(row.discount_amount) && row.pricing_rules) {
                row.rate = num(row.price_list_rate) - num(row.discount_amount);
            }
        }
        let rateWithMargin = 0;
        if (num(row.price_list_rate) && text(row.margin_type) && num(row.margin_rate_or_amount)) {
            const margin = text(row.margin_type) === "Amount" ? num(row.margin_rate_or_amount) : num(row.price_list_rate) * num(row.margin_rate_or_amount) / 100;
            rateWithMargin = num(row.price_list_rate) + margin;
        }
        row.rate_with_margin = rateWithMargin;
        row.base_rate_with_margin = rateWithMargin * (num(doc.conversion_rate) || 1);
        if (rateWithMargin > 0) {
            row.rate = rateWithMargin * (1 - num(row.discount_percentage) / 100);
            if (num(row.discount_amount) && !num(row.discount_percentage)) row.rate = rateWithMargin - num(row.discount_amount);
            else row.discount_amount = rateWithMargin - row.rate;
        } else if (num(row.price_list_rate) > 0) row.discount_amount = num(row.price_list_rate) - num(row.rate);
        row.rate = Math.max(0, num(row.rate));
        row.net_rate = row.rate;
        row.amount = row.rate * num(row.qty);
        row.net_amount = row.amount;
        const conversionRate = num(doc.conversion_rate) || 1;
        row.base_price_list_rate = num(row.price_list_rate) * conversionRate;
        row.base_rate = row.rate * conversionRate;
        row.base_net_rate = row.net_rate * conversionRate;
        row.base_amount = row.amount * conversionRate;
        row.base_net_amount = row.net_amount * conversionRate;
        row.__wmn_local_pricing_applied_price_list_rate = num(row.price_list_rate);
        row.__wmn_local_pricing_applied_rate = num(row.rate);
        row.__wmn_local_pricing_rule_names = (() => { try { return JSON.parse(row.pricing_rules || "[]"); } catch (e) { return []; } })();
    }

    function applyItemDetails(resultRows, state, details, doc) {
        const row = state.row;
        const targetItems = Array.isArray(details.apply_rule_on_other_items) ? details.apply_rule_on_other_items : [];
        const directAllowed = !targetItems.length || targetItems.includes(text(row.item_code));
        if (!int(details.validate_applied_rule) && text(details.price_or_product_discount) === "Price" && directAllowed) {
            calculateFinalRow(row, details, doc);
        }
        if (targetItems.length && !int(details.validate_applied_rule)) {
            const field = text(details.apply_rule_on);
            for (const targetState of resultRows) {
                if (!targetItems.includes(text(targetState.row?.[field]))) continue;
                if (text(details.price_or_product_discount) === "Price") calculateFinalRow(targetState.row, details, doc);
                targetState.row.pricing_rules = details.pricing_rules || targetState.row.pricing_rules;
                targetState.row.has_pricing_rule = details.has_pricing_rule || targetState.row.has_pricing_rule;
            }
        }
    }

    function transactionRules(doc, snapshot, tree, index, freeItems) {
        let rules = index.transaction.filter((r) => conditionCommon(r, doc, tree, false));
        const transactionBaseRows = (doc.items || []).filter((r) => !int(r.__wmn_promotion_free_row) && !int(r.__wmn_pricing_rule_free_row));
        // Native transaction totals include item-level Pricing Rule free rows after they are materialized.
        const totalQty = transactionBaseRows.reduce((s, r) => s + num(r.qty), 0) + (freeItems || []).reduce((s, r) => s + num(r.qty), 0);
        const total = transactionBaseRows.reduce((s, r) => s + num(r.qty) * num(r.rate), 0) + (freeItems || []).reduce((s, r) => s + num(r.qty) * num(r.rate), 0);
        rules = filterQtyAmount(totalQty, total, rules, {}, snapshot).filter((r) => conditionMatches(r, doc));
        const tx = {
            names: [], apply_on: text(doc.apply_discount_on) || "Grand Total",
            additional_discount_percentage: num(doc.additional_discount_percentage), discount_amount: num(doc.discount_amount),
            validation_messages: [], free_items: [], total_qty: totalQty, total, has_price_rule: false,
        };
        if (!rules.length) return null;
        const activeCoupon = text(doc.coupon_code || doc.__wmn_coupon_code);
        for (const rule of rules) {
            tx.names.push(text(rule.name));
            if (text(rule.price_or_product_discount) === "Price") {
                tx.has_price_rule = true;
                if (text(rule.apply_discount_on)) tx.apply_on = text(rule.apply_discount_on);
                let conditionMet = false;
                for (const [field, prField] of [["additional_discount_percentage", "discount_percentage"], ["discount_amount", "discount_amount"]]) {
                    if (!num(rule[prField])) continue;
                    if (int(rule.validate_applied_rule) && doc[field] != null && num(doc[field]) < num(rule[prField])) {
                        tx.validation_messages.push({ type: "validate_applied_rule", rule: text(rule.name), field, required: num(rule[prField]), actual: num(doc[field]) });
                    } else if (!int(rule.coupon_code_based)) tx[field] = num(rule[prField]);
                    else if (activeCoupon) {
                        if (activeCoupon === text(rule.coupon_code)) { tx[field] = num(rule[prField]); conditionMet = true; break; }
                        tx[field] = 0;
                    } else tx[field] = 0;
                }
                if (conditionMet) break;
            } else if (text(rule.price_or_product_discount) === "Product") {
                const details = { parenttype: doc.doctype, free_item_data: [] };
                if (int(rule.is_recursive)) {
                    tx.error = { type: "native_transaction_recursive_product_invalid", rules: [text(rule.name)] };
                    continue;
                }
                const free = freeItemSpec(rule, details, null, doc, snapshot);
                if (free.error) tx.error = free.error;
                if (free.spec) tx.free_items.push(free.spec);
            }
        }
        return tx;
    }

    function clear(doc) {
        for (const row of doc?.items || []) {
            if (int(row.__wmn_pricing_rule_free_row)) continue;
            if (row.__wmn_local_pricing_base_rate !== undefined) restoreRow({ row });
        }
        delete doc.__wmn_local_pricing_rule_result;
        delete doc.__wmn_local_pricing_rule_errors;
        delete doc.__wmn_local_pricing_rule_validations;
    }

    function evaluate(doc, snapshot) {
        doc = doc || {};
        snapshot = snapshot || {};
        const tree = buildTreeContext(snapshot.trees || {});
        const index = buildRuleIndex(snapshot);
        const states = (doc.items || []).filter((r) => !int(r.is_free_item) && !int(r.__wmn_promotion_free_row)).map(rowBaseState);
        states.forEach(restoreRow);

        const applied = [], freeItems = [], errors = [], suggestions = [], validations = [];
        for (const state of states) {
            const args = rowArgs(state.row, doc);
            const item = getItemDetails(args, doc, snapshot, tree, index);
            errors.push(...item.errors); suggestions.push(...item.suggestions); validations.push(...item.validations);
            if (item.rules.length) applied.push(...item.rules.map((name) => ({ name, item_code: text(state.row.item_code), apply_on: "Item" })));
            applyItemDetails(states, state, item.details, doc);
            for (const spec of item.details.free_item_data || []) {
                const key = `${spec.rule_name}::${spec.item_code}`;
                const pos = freeItems.findIndex((x) => `${x.rule_name}::${x.item_code}` === key);
                if (pos >= 0) freeItems[pos] = spec; else freeItems.push(spec);
            }
        }

        const tx = transactionRules(doc, snapshot, tree, index, freeItems);
        if (tx) {
            if (tx.error) errors.push(tx.error);
            validations.push(...(tx.validation_messages || []));
            for (const spec of tx.free_items || []) {
                const key = `${spec.rule_name}::${spec.item_code}`;
                const pos = freeItems.findIndex((x) => `${x.rule_name}::${x.item_code}` === key);
                if (pos >= 0) freeItems[pos] = spec; else freeItems.push(spec);
            }
            applied.push(...tx.names.map((name) => ({ name, item_code: "", apply_on: "Transaction" })));
        }

        const transaction = tx && tx.has_price_rule ? {
            names: tx.names,
            apply_on: tx.apply_on,
            percentage: num(tx.additional_discount_percentage),
            discount_amount_field: num(tx.discount_amount),
            amount: num(tx.discount_amount) || (num(tx.total) * num(tx.additional_discount_percentage) / 100),
            base_total: num(tx.total),
        } : null;

        return {
            applied_rules: applied,
            free_items: freeItems,
            transaction,
            errors,
            unsupported: [],
            suggestions,
            validation_messages: validations,
            rule_count: (snapshot.rules || []).length,
            schema_version: snapshot.schema_version,
            erpnext_reference: snapshot.erpnext_reference,
        };
    }

    ns.Features.PricingRule.Common.Engine = {
        evaluate,
        clear,
        buildTreeContext,
        buildRuleIndex,
        conditionMatches,
        getPricingRules,
        filterPricingRules,
        filterQtyAmount,
        applyPriceDiscountRule,
        evalAst,
        withPendingCumulative,
    };
})();
