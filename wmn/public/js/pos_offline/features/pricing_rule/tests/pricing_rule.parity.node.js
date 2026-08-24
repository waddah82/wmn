/* Node-only parity fixtures for ERPNext v16.6.1 Pricing Rule compatibility. */
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const path = require("path");

const context = {
  console,
  window: { WMN_POS: { Features: {} } },
  flt: (v) => Number(v || 0) || 0,
  cint: (v) => parseInt(v || 0, 10) || 0,
  frappe: { datetime: { get_today: () => "2026-08-21" } },
};
context.window.window = context.window;
context.window.flt = context.flt;
context.window.cint = context.cint;
context.window.frappe = context.frappe;
vm.createContext(context);
const enginePath = path.resolve(__dirname, "../pricing_rule.common.js");
vm.runInContext(fs.readFileSync(enginePath, "utf8"), context, { filename: enginePath });
const Engine = context.window.WMN_POS.Features.PricingRule.Common.Engine;

const CONDITION_SIMPLE = {"type": "Compare", "left": {"type": "Name", "id": "customer", "ctx": {"type": "Load"}}, "ops": [{"type": "Eq"}], "comparators": [{"type": "Constant", "value": "_Test Customer", "kind": null}]};
const CONDITION_COMP = {"type": "Call", "func": {"type": "Name", "id": "any", "ctx": {"type": "Load"}}, "args": [{"type": "ListComp", "elt": {"type": "Compare", "left": {"type": "Call", "func": {"type": "Attribute", "value": {"type": "Name", "id": "row", "ctx": {"type": "Load"}}, "attr": "get", "ctx": {"type": "Load"}}, "args": [{"type": "Constant", "value": "qty", "kind": null}, {"type": "Constant", "value": 0, "kind": null}], "keywords": []}, "ops": [{"type": "GtE"}], "comparators": [{"type": "Constant", "value": 2, "kind": null}]}, "generators": [{"type": "comprehension", "target": {"type": "Name", "id": "row", "ctx": {"type": "Store"}}, "iter": {"type": "Name", "id": "items", "ctx": {"type": "Load"}}, "ifs": [], "is_async": 0}]}], "keywords": []};

function treeData() {
  return {
    item_groups: [
      {name:"All Item Groups", parent_item_group:"", is_group:1},
      {name:"Products", parent_item_group:"All Item Groups", is_group:1},
      {name:"Phones", parent_item_group:"Products", is_group:0},
    ],
    customer_groups: [
      {name:"All Customer Groups", parent_customer_group:"", is_group:1},
      {name:"Retail", parent_customer_group:"All Customer Groups", is_group:0},
    ],
    territories: [
      {name:"All Territories", parent_territory:"", is_group:1},
      {name:"Yemen", parent_territory:"All Territories", is_group:0},
    ],
    warehouses: [
      {name:"All Warehouses", parent_warehouse:"", is_group:1},
      {name:"Main - TC", parent_warehouse:"All Warehouses", is_group:1},
      {name:"POS - TC", parent_warehouse:"Main - TC", is_group:0},
    ],
  };
}

let seq = 0;
function makeRule(overrides={}) {
  const r = Object.assign({
    name:`PR-${++seq}`, title:"Rule", disable:0, apply_on:"Item Code",
    price_or_product_discount:"Price", selling:1, buying:0, company:"_Test Company",
    currency:"USD", rate_or_discount:"Discount Percentage", discount_percentage:10,
    discount_amount:0, rate:0, margin_type:"", margin_rate_or_amount:0,
    min_qty:0, max_qty:0, min_amt:0, max_amt:0, priority:0, has_priority:0,
    apply_multiple_pricing_rules:0, apply_discount_on_rate:0, mixed_conditions:0,
    is_cumulative:0, coupon_code_based:0, apply_rule_on_other:"", other_item_code:"",
    other_item_group:"", other_brand:"", same_item:0, free_item:"", free_qty:0,
    free_item_rate:0, free_item_uom:"", is_recursive:0, recurse_for:0,
    apply_recursion_over:0, round_free_qty:0, dont_enforce_free_item_qty:0,
    for_price_list:"", customer:"", customer_group:"", territory:"", warehouse:"",
    valid_from:"", valid_upto:"", condition:"", condition_ast:null,
    validate_applied_rule:0, apply_discount_on:"Grand Total", items:[], item_groups:[], brands:[],
  }, overrides);
  if (r.apply_on === "Item Code" && !r.items.length) r.items=[{item_code:r.item_code || "ITEM-A", uom:r.rule_uom || ""}];
  if (r.apply_on === "Item Group" && !r.item_groups.length) r.item_groups=[{item_group:r.item_group || "Products", uom:r.rule_uom || ""}];
  if (r.apply_on === "Brand" && !r.brands.length) r.brands=[{brand:r.brand || "Brand-A"}];
  return r;
}
function snapshot(rules, extra={}) {
  return Object.assign({
    schema_version:5, erpnext_reference:"v16.6.1", transaction_order_mode:"erpnext_v16_native",
    company:"_Test Company", price_list:"_Test Price List", rules, trees:treeData(),
    uom_conversions:{}, item_meta:{}, condition_ast_mode:"frappe_v16_9_safe_eval_compat_v1",
  }, extra);
}
function item(overrides={}) {
  return Object.assign({
    doctype:"Sales Invoice Item", item_code:"ITEM-A", item_group:"Phones", brand:"Brand-A",
    qty:1, stock_qty:1, uom:"Nos", stock_uom:"Nos", conversion_factor:1,
    warehouse:"POS - TC", price_list_rate:100, rate:100, amount:100, net_rate:100, net_amount:100,
    discount_percentage:0, discount_amount:0, margin_type:"", margin_rate_or_amount:0,
    pricing_rules:"", is_free_item:0,
  }, overrides);
}
function doc(items, overrides={}) {
  return Object.assign({
    doctype:"Sales Invoice", name:"new-sales-invoice-1", __islocal:1, company:"_Test Company",
    customer:"_Test Customer", customer_group:"Retail", territory:"Yemen", currency:"USD",
    selling_price_list:"_Test Price List", posting_date:"2026-08-21", set_warehouse:"POS - TC",
    conversion_rate:1, apply_discount_on:"Grand Total", additional_discount_percentage:0,
    discount_amount:0, coupon_code:"", items,
  }, overrides);
}
function approx(actual, expected, message) { assert.ok(Math.abs(Number(actual)-Number(expected)) < 1e-6, `${message}: ${actual} != ${expected}`); }
function names(result) { return result.applied_rules.map(x=>x.name); }
const tests=[];
function test(name, fn) { tests.push([name, fn]); }

test("item discount percentage", () => { const d=doc([item()]); Engine.evaluate(d,snapshot([makeRule({name:"PCT",discount_percentage:20})])); approx(d.items[0].discount_percentage,20,"pct"); approx(d.items[0].rate,80,"rate"); });
test("min qty threshold", () => { const r=makeRule({name:"MIN",discount_percentage:20,min_qty:4}); let d=doc([item({qty:1,stock_qty:1})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"below"); d=doc([item({qty:5,stock_qty:5})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,80,"above"); });
test("multiple percentages add 20+10=30", () => { const rs=[makeRule({name:"M1",discount_percentage:20,apply_multiple_pricing_rules:1,priority:1}),makeRule({name:"M2",discount_percentage:10,apply_multiple_pricing_rules:1,priority:2})]; const d=doc([item()]); Engine.evaluate(d,snapshot(rs)); approx(d.items[0].discount_percentage,30,"pct"); approx(d.items[0].rate,70,"rate"); });
test("discount on discounted rate 20 then 10 = 28", () => { const rs=[makeRule({name:"D1",discount_percentage:20,apply_multiple_pricing_rules:1,priority:1}),makeRule({name:"D2",discount_percentage:10,apply_multiple_pricing_rules:1,apply_discount_on_rate:1,priority:2})]; const d=doc([item()]); Engine.evaluate(d,snapshot(rs)); approx(d.items[0].discount_percentage,28,"pct"); approx(d.items[0].rate,72,"rate"); });
test("percentage plus amount = 200 on 1000", () => { const rs=[makeRule({name:"PA1",discount_percentage:10,apply_multiple_pricing_rules:1,priority:1}),makeRule({name:"PA2",rate_or_discount:"Discount Amount",discount_percentage:0,discount_amount:100,apply_multiple_pricing_rules:1,priority:2})]; const d=doc([item({price_list_rate:1000,rate:1000,amount:1000})]); Engine.evaluate(d,snapshot(rs)); approx(d.items[0].discount_amount,200,"amount"); approx(d.items[0].rate,800,"rate"); });
test("fixed Rate rule sets rate", () => { const r=makeRule({name:"RATE",rate_or_discount:"Rate",discount_percentage:0,rate:25}); const d=doc([item({price_list_rate:100,rate:100})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].price_list_rate,25,"list"); approx(d.items[0].rate,25,"rate"); });
test("margin before discount", () => { const r=makeRule({name:"MAR",discount_percentage:10,margin_type:"Percentage",margin_rate_or_amount:10}); const d=doc([item({price_list_rate:1000,rate:1000})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate_with_margin,1100,"with margin"); approx(d.items[0].rate,990,"rate"); approx(d.items[0].discount_amount,110,"discount amount"); });
test("priority across item code and group", () => { const code=makeRule({name:"CODE",rate_or_discount:"Rate",discount_percentage:0,rate:25,has_priority:1,priority:2}); const group=makeRule({name:"GROUP",apply_on:"Item Group",item_groups:[{item_group:"Products",uom:""}],discount_percentage:60,has_priority:1,priority:4}); let d=doc([item()]); Engine.evaluate(d,snapshot([code,group])); approx(d.items[0].rate,40,"group wins"); code.priority=4; group.priority=2; d=doc([item()]); Engine.evaluate(d,snapshot([code,group])); approx(d.items[0].rate,25,"code wins"); });
test("brand rule", () => { const r=makeRule({name:"BR",apply_on:"Brand",brands:[{brand:"Brand-A"}],discount_percentage:15}); const d=doc([item()]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,85,"brand"); });
test("variant template OR bypasses child UOM SQL predicate", () => { const r=makeRule({name:"VAR",items:[{item_code:"TEMPLATE",uom:"Box"}],discount_percentage:12}); const d=doc([item({item_code:"VAR-1",variant_of:"TEMPLATE",uom:"Nos",stock_uom:"Nos"})]); Engine.evaluate(d,snapshot([r],{uom_conversions:{TEMPLATE:{Box:10}}})); approx(d.items[0].rate,88,"variant"); });
test("UOM qty threshold uses rule conversion", () => { const r=makeRule({name:"UOM",items:[{item_code:"ITEM-A",uom:"Box"}],min_qty:2,discount_percentage:10}); const sn=snapshot([r],{uom_conversions:{"ITEM-A":{Box:10}}}); let d=doc([item({qty:1,stock_qty:10,uom:"Box",stock_uom:"Nos",conversion_factor:10})]); Engine.evaluate(d,sn); approx(d.items[0].rate,100,"one box"); d=doc([item({qty:2,stock_qty:20,uom:"Box",stock_uom:"Nos",conversion_factor:10})]); Engine.evaluate(d,sn); approx(d.items[0].rate,90,"two boxes"); });
test("mixed conditions aggregate cart", () => { const r=makeRule({name:"MIX",mixed_conditions:1,min_qty:3,discount_percentage:10,items:[{item_code:"ITEM-A",uom:""},{item_code:"ITEM-B",uom:""}]}); const d=doc([item({item_code:"ITEM-A",qty:1,stock_qty:1}),item({item_code:"ITEM-B",qty:2,stock_qty:2})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"a"); approx(d.items[1].rate,90,"b"); });
test("apply rule on other item amount", () => { const r=makeRule({name:"OTHER",apply_rule_on_other:"Item Code",other_item_code:"ITEM-B",min_amt:200,discount_percentage:10,items:[{item_code:"ITEM-A",uom:""}]}); const d=doc([item({item_code:"ITEM-A",qty:2,stock_qty:2,price_list_rate:100,rate:100}),item({item_code:"ITEM-B",qty:1,stock_qty:1,price_list_rate:100,rate:100})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"source"); approx(d.items[1].rate,90,"target"); });
test("cumulative history participates", () => { const r=makeRule({name:"CUM",is_cumulative:1,valid_from:"2026-01-01",valid_upto:"2026-12-31",min_qty:5,discount_percentage:10,cumulative_summary:{"Sales Invoice":{by_value:{"ITEM-A":{stock_qty:4,amount:400}},total:{stock_qty:4,amount:400}}}}); const d=doc([item({qty:1,stock_qty:1})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"cumulative"); });
test("simple safe condition", () => { const r=makeRule({name:"COND",condition:"customer == '_Test Customer'",condition_ast:CONDITION_SIMPLE,discount_percentage:10}); let d=doc([item()]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"true"); d=doc([item()],{customer:"Other"}); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"false"); });
test("safe_eval unavailable builtin skips condition like Frappe", () => { const r=makeRule({name:"COMP",condition:"any([row.get('qty', 0) >= 2 for row in items])",condition_ast:CONDITION_COMP,discount_percentage:10}); const d=doc([item({qty:2,stock_qty:2})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"native safe_eval does not expose any"); });
test("validate applied rule reports without auto applying", () => { const r=makeRule({name:"VAL",validate_applied_rule:1,discount_percentage:20}); const d=doc([item({discount_percentage:10,rate:90})]); const out=Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"user rate remains"); assert.ok(out.validation_messages.some(x=>x.rule==="VAL" && x.field==="discount_percentage")); });
test("product free item", () => { const r=makeRule({name:"FREE",price_or_product_discount:"Product",discount_percentage:0,free_item:"ITEM-B",free_qty:1,free_item_rate:10}); const d=doc([item()]); const out=Engine.evaluate(d,snapshot([r],{item_meta:{"ITEM-B":{stock_uom:"Nos"}}})); assert.equal(out.free_items.length,1); assert.equal(out.free_items[0].item_code,"ITEM-B"); approx(out.free_items[0].rate,10,"free rate"); });
test("same item recursive 5 -> 2 and 7 -> 3", () => { const r=makeRule({name:"REC",price_or_product_discount:"Product",discount_percentage:0,same_item:1,free_qty:1,is_recursive:1,recurse_for:2,round_free_qty:1,min_qty:3,max_qty:7}); let d=doc([item({qty:5,stock_qty:5})]); let out=Engine.evaluate(d,snapshot([r])); approx(out.free_items[0].qty,2,"5 -> 2"); d=doc([item({qty:7,stock_qty:7})]); out=Engine.evaluate(d,snapshot([r])); approx(out.free_items[0].qty,3,"7 -> 3"); });
test("round recursive 150/100 free10 -> 10", () => { const r=makeRule({name:"R150",price_or_product_discount:"Product",discount_percentage:0,same_item:1,free_qty:10,is_recursive:1,recurse_for:100,round_free_qty:1,min_qty:100}); const d=doc([item({qty:150,stock_qty:150})]); const out=Engine.evaluate(d,snapshot([r])); approx(out.free_items[0].qty,10,"150 -> 10"); });
test("transaction product discount", () => { const r=makeRule({name:"TXFREE",apply_on:"Transaction",price_or_product_discount:"Product",discount_percentage:0,free_item:"ITEM-B",free_qty:1,free_item_rate:10,min_qty:5,wmn_native_transaction_sequence:0,items:[]}); const d=doc([item({qty:5,stock_qty:5})]); const out=Engine.evaluate(d,snapshot([r],{item_meta:{"ITEM-B":{stock_uom:"Nos"}}})); assert.equal(out.free_items.length,1); assert.equal(out.transaction,null); });
test("multiple transaction Price rules follow native sequence and overwrite", () => { const a=makeRule({name:"TX1",apply_on:"Transaction",discount_percentage:10,wmn_native_transaction_sequence:0,items:[]}); const b=makeRule({name:"TX2",apply_on:"Transaction",discount_percentage:5,wmn_native_transaction_sequence:1,items:[]}); const d=doc([item()]); const out=Engine.evaluate(d,snapshot([a,b])); assert.deepEqual(Array.from(out.transaction.names),["TX1","TX2"]); approx(out.transaction.percentage,5,"last tx pct"); });
test("transaction coupon rule", () => { const r=makeRule({name:"TXC",apply_on:"Transaction",coupon_code_based:1,coupon_code:"SAVE10",discount_percentage:10,wmn_native_transaction_sequence:0,items:[]}); let d=doc([item()],{coupon_code:"SAVE10"}); let out=Engine.evaluate(d,snapshot([r])); approx(out.transaction.percentage,10,"coupon match"); d=doc([item()],{coupon_code:"OTHER"}); out=Engine.evaluate(d,snapshot([r])); approx(out.transaction.percentage,0,"coupon mismatch"); });
test("native multiple-rule conflict is reported", () => { const a=makeRule({name:"C1",discount_percentage:10}), b=makeRule({name:"C2",discount_percentage:20}); const d=doc([item()]); const out=Engine.evaluate(d,snapshot([a,b])); assert.ok(out.errors.some(x=>x.type==="multiple_rule_conflict")); });
test("price-list tie breaker", () => { const a=makeRule({name:"PL-EXACT",for_price_list:"_Test Price List",discount_percentage:15}), b=makeRule({name:"PL-BLANK",for_price_list:"",discount_percentage:15}); const d=doc([item()]); const out=Engine.evaluate(d,snapshot([a,b])); assert.ok(names(out).includes("PL-EXACT")); assert.ok(!names(out).includes("PL-BLANK")); });
test("customer group territory warehouse hierarchy", () => { const r=makeRule({name:"TREE",customer_group:"All Customer Groups",territory:"All Territories",warehouse:"Main - TC",discount_percentage:10}); const d=doc([item()]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"tree"); });
test("removing a rule restores base price", () => { const d=doc([item()]); Engine.evaluate(d,snapshot([makeRule({name:"TEMP",discount_percentage:20})])); approx(d.items[0].rate,80,"applied"); Engine.evaluate(d,snapshot([])); approx(d.items[0].rate,100,"restored"); approx(d.items[0].discount_percentage,0,"discount restored"); });
test("invalid condition is silently skipped like native safe_eval", () => { const r=makeRule({name:"BAD",condition:"bad +++",condition_ast:null,discount_percentage:10}); const d=doc([item()]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"skipped"); });

test("blank rule UOM fixed Rate converts to transaction UOM", () => { const r=makeRule({name:"RATE-BLANK-UOM",rate_or_discount:"Rate",discount_percentage:0,rate:25,items:[{item_code:"ITEM-A",uom:""}]}); const d=doc([item({uom:"Box",stock_uom:"Nos",conversion_factor:10,price_list_rate:1000,rate:1000})]); Engine.evaluate(d,snapshot([r],{uom_conversions:{"ITEM-A":{Box:10}}})); approx(d.items[0].price_list_rate,250,"converted rate"); approx(d.items[0].rate,250,"converted final rate"); });
test("explicit rule UOM fixed Rate does not multiply conversion", () => { const r=makeRule({name:"RATE-BOX",rate_or_discount:"Rate",discount_percentage:0,rate:25,items:[{item_code:"ITEM-A",uom:"Box"}]}); const d=doc([item({uom:"Box",stock_uom:"Nos",conversion_factor:10,price_list_rate:1000,rate:1000})]); Engine.evaluate(d,snapshot([r],{uom_conversions:{"ITEM-A":{Box:10}}})); approx(d.items[0].price_list_rate,25,"explicit UOM rate"); });
test("max qty boundary mirrors native filter", () => { const r=makeRule({name:"MAXQ",min_qty:2,max_qty:4,discount_percentage:10}); let d=doc([item({qty:4,stock_qty:4})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"at max"); d=doc([item({qty:5,stock_qty:5})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"above max"); });
test("min and max amount boundaries", () => { const r=makeRule({name:"AMT",min_amt:200,max_amt:400,discount_percentage:10}); let d=doc([item({qty:2,stock_qty:2,price_list_rate:100,rate:100})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"at min amount"); d=doc([item({qty:5,stock_qty:5,price_list_rate:100,rate:100})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"above max amount"); });
test("currency match wins before same-priority conflict", () => { const usd=makeRule({name:"CUR-USD",currency:"USD",discount_percentage:10}); const eur=makeRule({name:"CUR-EUR",currency:"EUR",discount_percentage:30}); const d=doc([item()]); const out=Engine.evaluate(d,snapshot([usd,eur])); assert.ok(names(out).includes("CUR-USD")); assert.ok(!out.errors.some(x=>x.type==="multiple_rule_conflict")); approx(d.items[0].rate,90,"USD rule"); });
test("amount margin then percentage discount", () => { const r=makeRule({name:"MARGIN-AMT",discount_percentage:10,margin_type:"Amount",margin_rate_or_amount:100}); const d=doc([item({price_list_rate:1000,rate:1000})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate_with_margin,1100,"rate with amount margin"); approx(d.items[0].discount_amount,110,"discount on margin rate"); approx(d.items[0].rate,990,"final"); });
test("threshold suggestion is emitted without applying rule", () => { const r=makeRule({name:"SUG",min_qty:10,threshold_percentage:10,discount_percentage:10}); const d=doc([item({qty:9,stock_qty:9})]); const out=Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"not applied"); assert.ok(out.suggestions.some(x=>x.rule==="SUG" && x.field==="min_qty")); });
test("campaign and sales partner exact context", () => { const r=makeRule({name:"CTX",campaign:"CAMP-1",sales_partner:"SP-1",discount_percentage:10}); let d=doc([item()],{campaign:"CAMP-1",sales_partner:"SP-1"}); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"match"); d=doc([item()],{campaign:"CAMP-2",sales_partner:"SP-1"}); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"campaign mismatch"); });
test("warehouse-specific rule does not match missing warehouse arg", () => { const r=makeRule({name:"WH",warehouse:"Main - TC",discount_percentage:10}); const d=doc([item({warehouse:""})],{set_warehouse:"",warehouse:""}); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"rule requires warehouse context"); });
test("pending offline invoice augments cumulative history", () => { const r=makeRule({name:"CUM-PENDING",is_cumulative:1,valid_from:"2026-01-01",valid_upto:"2026-12-31",min_qty:5,discount_percentage:10,cumulative_summary:{"Sales Invoice":{by_value:{"ITEM-A":{stock_qty:2,amount:200}},total:{stock_qty:2,amount:200}}}}); const base=snapshot([r]); const pending=[{status:"pending",invoice:doc([item({qty:2,stock_qty:2,amount:200})],{name:"POS-OFF-1",__islocal:1})}]; const runtime=Engine.withPendingCumulative(base,pending); const d=doc([item({qty:1,stock_qty:1})]); Engine.evaluate(d,runtime); approx(d.items[0].rate,90,"2 server + 2 offline + 1 current"); const original=base.rules[0].cumulative_summary["Sales Invoice"].by_value["ITEM-A"].stock_qty; approx(original,2,"base snapshot remains immutable"); });
test("pending cumulative obeys rule warehouse and valid dates", () => { const r=makeRule({name:"CUM-WH",is_cumulative:1,valid_from:"2026-08-01",valid_upto:"2026-08-31",warehouse:"Main - TC",min_qty:3,discount_percentage:10,cumulative_summary:{"Sales Invoice":{by_value:{},total:{stock_qty:0,amount:0}}}}); const pending=[{invoice:doc([item({qty:1,stock_qty:1,warehouse:"POS - TC"})],{posting_date:"2026-08-20"})},{invoice:doc([item({qty:9,stock_qty:9,warehouse:"Other - TC"})],{posting_date:"2026-08-20"})},{invoice:doc([item({qty:9,stock_qty:9,warehouse:"POS - TC"})],{posting_date:"2026-07-20"})}]; const runtime=Engine.withPendingCumulative(snapshot([r]),pending); const d=doc([item({qty:2,stock_qty:2})]); Engine.evaluate(d,runtime); approx(d.items[0].rate,90,"only valid descendant contribution counts"); });
test("transaction qty range filters rule", () => { const r=makeRule({name:"TX-RANGE",apply_on:"Transaction",min_qty:3,max_qty:5,discount_percentage:10,wmn_native_transaction_sequence:0,items:[]}); let d=doc([item({qty:2,stock_qty:2})]); let out=Engine.evaluate(d,snapshot([r])); assert.equal(out.transaction,null); d=doc([item({qty:3,stock_qty:3})]); out=Engine.evaluate(d,snapshot([r])); approx(out.transaction.percentage,10,"at min"); d=doc([item({qty:6,stock_qty:6})]); out=Engine.evaluate(d,snapshot([r])); assert.equal(out.transaction,null); });
test("transaction condition filters native sequence", () => { const r=makeRule({name:"TX-COND",apply_on:"Transaction",discount_percentage:10,condition:"customer == '_Test Customer'",condition_ast:CONDITION_SIMPLE,wmn_native_transaction_sequence:0,items:[]}); let out=Engine.evaluate(doc([item()]),snapshot([r])); approx(out.transaction.percentage,10,"true"); out=Engine.evaluate(doc([item()],{customer:"Other"}),snapshot([r])); assert.equal(out.transaction,null); });
test("transaction validate_applied_rule does not auto overwrite", () => { const r=makeRule({name:"TX-VAL",apply_on:"Transaction",discount_percentage:20,validate_applied_rule:1,wmn_native_transaction_sequence:0,items:[]}); const d=doc([item()],{additional_discount_percentage:10}); const out=Engine.evaluate(d,snapshot([r])); assert.ok(out.validation_messages.some(x=>x.rule==="TX-VAL" && x.field==="additional_discount_percentage")); approx(out.transaction.percentage,10,"user value retained"); });
test("product free item carries UOM conversion and dont-enforce flag", () => { const r=makeRule({name:"FREE-UOM",price_or_product_discount:"Product",discount_percentage:0,free_item:"ITEM-B",free_qty:2,free_item_uom:"Box",free_item_rate:5,dont_enforce_free_item_qty:1}); const out=Engine.evaluate(doc([item()]),snapshot([r],{item_meta:{"ITEM-B":{stock_uom:"Nos"}},uom_conversions:{"ITEM-B":{Box:10}}})); assert.equal(out.free_items[0].uom,"Box"); approx(out.free_items[0].conversion_factor,10,"free conversion"); assert.equal(out.free_items[0].dont_enforce_free_item_qty,1); });
test("same-item non-recursive product uses current item", () => { const r=makeRule({name:"SAME",price_or_product_discount:"Product",discount_percentage:0,same_item:1,free_qty:1}); const out=Engine.evaluate(doc([item({item_code:"ITEM-A"})]),snapshot([r],{item_meta:{"ITEM-A":{stock_uom:"Nos"}}})); assert.equal(out.free_items[0].item_code,"ITEM-A"); approx(out.free_items[0].qty,1,"same item qty"); });
test("missing free item produces native-invalid configuration error", () => { const r=makeRule({name:"FREE-MISSING",price_or_product_discount:"Product",discount_percentage:0,same_item:0,free_item:""}); const out=Engine.evaluate(doc([item()]),snapshot([r])); assert.ok(out.errors.some(x=>x.type==="free_item_missing")); });
test("snapshot metadata is returned by engine", () => { const out=Engine.evaluate(doc([item()]),snapshot([])); assert.equal(out.schema_version,5); assert.equal(out.erpnext_reference,"v16.6.1"); });
test("Python truthiness treats empty list as false", () => { const ast={type:"UnaryOp",op:{type:"Not"},operand:{type:"List",elts:[],ctx:{type:"Load"}}}; assert.equal(Engine.evalAst(ast,{}),true); });
test("Python truthiness treats empty dict as false in conditional expression", () => { const ast={type:"IfExp",test:{type:"Dict",keys:[],values:[]},body:{type:"Constant",value:1},orelse:{type:"Constant",value:2}}; assert.equal(Engine.evalAst(ast,{}),2); });


test("margin percentage plus fixed discount amount mirrors native", () => { const r=makeRule({name:"MAR-AMT-DISC",rate_or_discount:"Discount Amount",discount_percentage:0,discount_amount:110,margin_type:"Percentage",margin_rate_or_amount:10}); const d=doc([item({price_list_rate:1000,rate:1000})]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate_with_margin,1100,"rate with margin"); approx(d.items[0].discount_amount,110,"fixed discount"); approx(d.items[0].rate,990,"final rate"); });
test("customer group and territory scoped rule requires both contexts", () => { const r=makeRule({name:"TREE-REQUIRES-CONTEXT",customer_group:"Retail",territory:"Yemen",discount_percentage:10}); let d=doc([item()]); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,90,"context present"); d=doc([item()],{customer_group:"",territory:""}); Engine.evaluate(d,snapshot([r])); approx(d.items[0].rate,100,"context absent"); });
test("transaction recursive product follows native invalid path", () => { const r=makeRule({name:"TX-REC-INVALID",apply_on:"Transaction",price_or_product_discount:"Product",discount_percentage:0,free_item:"ITEM-B",free_qty:1,is_recursive:1,recurse_for:2,wmn_native_transaction_sequence:0,items:[]}); const out=Engine.evaluate(doc([item({qty:2,stock_qty:2})]),snapshot([r],{item_meta:{"ITEM-B":{stock_uom:"Nos"}}})); assert.ok(out.errors.some(x=>x.type==="native_transaction_recursive_product_invalid")); });
test("controller preserves return pricing instead of local repricing", () => { const controller=fs.readFileSync(path.resolve(__dirname,"../pricing_rule.controller.common.js"),"utf8"); assert.ok(controller.includes("if (int(doc.is_return || 0))")); assert.ok(controller.includes("preserved_return_pricing: true")); });
test("controller honors dont_enforce_free_item_qty on persisted documents", () => { const controller=fs.readFileSync(path.resolve(__dirname,"../pricing_rule.controller.common.js"),"utf8"); assert.ok(controller.includes("int(spec.dont_enforce_free_item_qty) && !isNewDocument(doc)")); });

let passed=0;
for (const [name,fn] of tests) {
  try { fn(); console.log(`PASS  ${name}`); passed++; }
  catch (e) { console.error(`FAIL  ${name}`); console.error(e.stack || e); process.exitCode=1; }
}
console.log(`\n${passed}/${tests.length} parity fixtures passed`);
if (passed !== tests.length) process.exit(1);
