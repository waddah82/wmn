/* WMN Controller integration for local execution of original ERPNext Pricing Rules. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.PricingRule = ns.Features.PricingRule || {};
    ns.Features.PricingRule.Common = ns.Features.PricingRule.Common || {};

    let ramSnapshot = null;
    let ramKey = "";
    let snapshotFlight = null;
    let forceServerRefreshOnNextSnapshot = false;

    function text(value) { return String(value == null ? "" : value).trim(); }
    function int(value) {
        try { return typeof cint === "function" ? cint(value || 0) : parseInt(value || 0, 10) || 0; }
        catch (e) { return parseInt(value || 0, 10) || 0; }
    }
    function num(value) {
        try { return typeof flt === "function" ? flt(value || 0) : Number(value || 0) || 0; }
        catch (e) { return Number(value || 0) || 0; }
    }

    function isNewDocument(doc) {
        const name = text(doc?.name);
        return !!doc?.__islocal || !name || name.startsWith("new-") || name.startsWith("New ");
    }

    function profileName(ctrl) {
        return text(ctrl?.pos_profile || ctrl?.settings?.pos_profile || ctrl?.frm?.doc?.pos_profile);
    }

    function contextKey(ctrl) {
        const doc = ctrl?.frm?.doc || {};
        return [profileName(ctrl), text(doc.company), text(doc.selling_price_list || ctrl?.settings?.selling_price_list)].join("::");
    }

    async function engineIgnored(ctrl) {
        const repository = ns.Services?.Settings?.POSProfileSettings;
        const profile = profileName(ctrl);
        if (repository?.bootstrap && profile) await repository.bootstrap(profile);
        return repository?.isLocalPricingRuleEngineIgnored
            ? repository.isLocalPricingRuleEngineIgnored(profile)
            : false;
    }

    async function readCachedSnapshot(ctrl) {
        const storage = window.wmnPOSOffline;
        if (!storage?.getPricingRules || !storage?.getPricingRuleContext) return null;
        const [rules, context] = await Promise.all([
            storage.getPricingRules(),
            storage.getPricingRuleContext(),
        ]);
        if (!rules?.length && !text(context?.version)) return null;
        return Object.assign({}, context || {}, { rules: rules || [], trees: context?.trees || {} });
    }

    async function fetchSnapshot(ctrl) {
        const profile = profileName(ctrl);
        if (!profile || (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline())) return null;
        if (navigator.onLine === false) return null;
        const response = await frappe.call({
            method: "wmn.wmn.page.wmn_pos.wmn_pos.get_pricing_rule_snapshot",
            args: { pos_profile: profile },
            freeze: false,
        });
        const snapshot = response?.message || null;
        if (snapshot && window.wmnPOSOffline?.savePricingRuleSnapshot) {
            await window.wmnPOSOffline.savePricingRuleSnapshot(snapshot);
        }
        return snapshot;
    }

    async function ensureSnapshot(ctrl, force = false) {
        const key = contextKey(ctrl);
        if (!force && !forceServerRefreshOnNextSnapshot && ramSnapshot && ramKey === key) return ramSnapshot;
        if (snapshotFlight) return await snapshotFlight;

        snapshotFlight = (async () => {
            let snapshot = await readCachedSnapshot(ctrl);
            const doc = ctrl?.frm?.doc || {};
            const expectedCompany = text(doc.company);
            const expectedPriceList = text(doc.selling_price_list || ctrl?.settings?.selling_price_list);
            const mismatch = snapshot && (
                (text(snapshot.company) && expectedCompany && text(snapshot.company) !== expectedCompany) ||
                (text(snapshot.price_list) && expectedPriceList && text(snapshot.price_list) !== expectedPriceList)
            );
            const staleCompatibilitySnapshot = snapshot && (
                int(snapshot.schema_version) !== 5 ||
                text(snapshot.erpnext_reference) !== "v16.6.1" ||
                text(snapshot.transaction_order_mode) !== "erpnext_v16_native" ||
                text(snapshot.condition_ast_mode) !== "frappe_v16_9_safe_eval_compat_v1"
            );
            const requireServerRefresh = forceServerRefreshOnNextSnapshot;
            if (!snapshot || mismatch || staleCompatibilitySnapshot || force || requireServerRefresh) {
                const fresh = await fetchSnapshot(ctrl);
                if (fresh) {
                    snapshot = fresh;
                    forceServerRefreshOnNextSnapshot = false;
                }
            }
            if (!snapshot) {
                snapshot = {
                    rules: [],
                    trees: {},
                    company: expectedCompany,
                    price_list: expectedPriceList,
                    __wmn_snapshot_missing: true,
                };
            }
            const pendingRows = window.wmnPOSOffline?.getPendingInvoices
                ? await window.wmnPOSOffline.getPendingInvoices()
                : [];
            if (ns.Features?.PricingRule?.Common?.Engine?.withPendingCumulative) {
                snapshot = ns.Features.PricingRule.Common.Engine.withPendingCumulative(snapshot, pendingRows);
            }
            ramSnapshot = snapshot;
            ramKey = key;
            return snapshot;
        })();

        try { return await snapshotFlight; }
        finally { snapshotFlight = null; }
    }

    async function recalculate(ctrl) {
        if (wmn_controller_uses_offline_flow(ctrl)) {
            ctrl.wmn_recalculate_offline_totals();
            return;
        }
        if (ctrl.frm?.cscript?.calculate_taxes_and_totals) {
            await ctrl.frm.cscript.calculate_taxes_and_totals();
        } else if (ctrl.frm?.trigger) {
            await ctrl.frm.trigger("items");
        }
    }


    async function syncPricingRuleFreeItems(ctrl, result) {
        const doc = ctrl?.frm?.doc;
        if (!doc) return;
        const service = ns.Services?.Item?.FreeItemRow;
        const wanted = new Map();
        for (const spec of (result?.free_items || [])) {
            const ruleName = text(spec?.rule_name);
            const itemCode = text(spec?.item_code);
            const qty = Math.max(0, num(spec?.qty));
            if (!ruleName || !itemCode || qty <= 0.000001) continue;
            wanted.set(`${ruleName}::${itemCode}`, Object.assign({}, spec, { rule_name: ruleName, item_code: itemCode, qty }));
        }

        const managed = (doc.items || []).filter((row) =>
            int(row?.__wmn_pricing_rule_free_row || 0) ||
            (int(row?.is_free_item || 0) && !!text(row?.pricing_rules) && !int(row?.__wmn_promotion_free_row || 0))
        );
        const kept = new Set();
        const offline = service?.usesOffline ? service.usesOffline(ctrl) : wmn_controller_uses_offline_flow(ctrl);

        for (const [key, spec] of wanted.entries()) {
            let row = managed.find((candidate) => !kept.has(candidate) && (
                text(candidate?.__wmn_pricing_rule_free_key) === key ||
                `${text(candidate?.pricing_rules)}::${text(candidate?.item_code)}` === key
            )) || null;

            if (row) {
                row.__wmn_pricing_rule_free_row = 1;
                row.__wmn_pricing_rule_name = spec.rule_name;
                row.__wmn_pricing_rule_free_key = key;
            }

            let seed = null;
            if (!row) {
                // ERPNext does not re-add a manually removed free row on a persisted
                // document when dont_enforce_free_item_qty is enabled.
                if (int(spec.dont_enforce_free_item_qty) && !isNewDocument(doc)) continue;

                seed = service?.resolveSeed ? await service.resolveSeed(ctrl, spec.item_code) : null;
                if (offline && !seed) {
                    result.unsupported = result.unsupported || [];
                    result.unsupported.push({ name: spec.rule_name, reason: "free_item_not_cached", item_code: spec.item_code });
                    continue;
                }


                const requestedUom = text(spec.uom || seed?.uom || seed?.stock_uom || "Nos");
                const conversion = service?.conversionFactor ? service.conversionFactor(seed || {}, requestedUom) : Math.max(0.000001, num(seed?.conversion_factor) || 1);
                row = ctrl.frm.add_child("items", {
                    doctype: ctrl.wmn_get_child_doctype(),
                    parenttype: doc.doctype,
                    parent: doc.name,
                    parentfield: "items",
                    item_code: spec.item_code,
                    warehouse: seed?.warehouse || doc.set_warehouse || ctrl.settings?.warehouse || "",
                    batch_no: seed?.batch_no || "",
                    serial_no: "",
                    uom: requestedUom,
                    stock_uom: seed?.stock_uom || requestedUom,
                    conversion_factor: conversion,
                    qty: spec.qty,
                    stock_qty: spec.qty * conversion,
                    use_serial_batch_fields: 1,
                    is_free_item: 1,
                    pricing_rules: spec.rule_name,
                    __wmn_pricing_rule_free_row: 1,
                    __wmn_pricing_rule_name: spec.rule_name,
                    __wmn_pricing_rule_free_key: key,
                });

                if (offline) {
                    const taxMap = service?.taxMap ? service.taxMap(seed || {}) : {};
                    Object.assign(row, {
                        item_name: seed?.item_name || spec.item_code,
                        description: seed?.description || seed?.item_name || spec.item_code,
                        image: seed?.image || "",
                        item_group: seed?.item_group || "",
                        brand: seed?.brand || "",
                        has_batch_no: int(seed?.has_batch_no || 0),
                        has_serial_no: int(seed?.has_serial_no || 0),
                        allow_negative_stock: int(seed?.allow_negative_stock || 0),
                        income_account: seed?.income_account || ctrl.settings?.income_account || "",
                        expense_account: seed?.expense_account || "",
                        cost_center: seed?.cost_center || ctrl.settings?.cost_center || "",
                        item_tax_template: seed?.item_tax_template || "",
                        offline_item_tax_map: taxMap,
                        item_tax_rate: JSON.stringify(taxMap || {}),
                    });
                    row = wmn_normalize_offline_cart_row(row, doc, (doc.items || []).indexOf(row), row.warehouse);
                    ctrl.wmn_register_offline_row_in_frappe_model(row);
                } else if (service?.hydrateOnline) {
                    try {
                        row = await service.hydrateOnline(ctrl, row, seed, {
                            qty: spec.qty,
                            uom: requestedUom,
                            is_free_item: 1,
                            pricing_rules: spec.rule_name,
                            __wmn_pricing_rule_free_row: 1,
                            __wmn_pricing_rule_name: spec.rule_name,
                            __wmn_pricing_rule_free_key: key,
                        });
                    } catch (error) {
                        doc.items = (doc.items || []).filter((candidate) => candidate !== row);
                        try { if (frappe.locals?.[row.doctype] && row.name) delete frappe.locals[row.doctype][row.name]; } catch (e) {}
                        result.unsupported = result.unsupported || [];
                        result.unsupported.push({ name: spec.rule_name, reason: "free_item_hydration_failed", item_code: spec.item_code });
                        console.error("WMN Pricing Rule free item hydration failed", spec.item_code, error);
                        continue;
                    }
                }
            }

            const conversion = Math.max(0.000001, num(row.conversion_factor) || 1);
            const rate = Math.max(0, num(spec.rate));
            const conversionRate = Math.max(0.000001, num(doc.conversion_rate) || 1);
            row.qty = spec.qty;
            row.stock_qty = spec.qty * conversion;
            row.rate = rate;
            row.price_list_rate = rate;
            row.amount = spec.qty * rate;
            row.net_rate = rate;
            row.net_amount = spec.qty * rate;
            row.base_rate = rate * conversionRate;
            row.base_price_list_rate = rate * conversionRate;
            row.base_amount = spec.qty * row.base_rate;
            row.base_net_rate = row.base_rate;
            row.base_net_amount = row.base_amount;
            row.discount_percentage = 0;
            row.discount_amount = 0;
            row.pricing_rules = spec.rule_name;
            row.has_pricing_rule = 1;
            row.is_free_item = 1;
            row.__wmn_pricing_rule_free_row = 1;
            row.__wmn_pricing_rule_name = spec.rule_name;
            row.__wmn_pricing_rule_free_key = key;
            kept.add(row);
            ctrl.update_cart_html?.(row, false);
        }

        for (const row of managed) {
            if (kept.has(row)) continue;
            doc.items = (doc.items || []).filter((candidate) => candidate !== row);
            try { if (frappe.locals?.[row.doctype] && row.name) delete frappe.locals[row.doctype][row.name]; } catch (e) {}
            ctrl.update_cart_html?.(row, true);
        }
        (doc.items || []).forEach((row, index) => { row.idx = index + 1; });
        if (offline) ctrl.wmn_recalculate_offline_totals?.();
        ctrl.frm?.dirty?.();
    }

    function applyTransactionMarkers(doc, transaction) {
        const previousOwned = !!doc.__wmn_pricing_rule_names?.length;
        if (!transaction) {
            delete doc.__wmn_pricing_rule_invoice_discount_total;
            delete doc.__wmn_pricing_rule_apply_on;
            delete doc.__wmn_pricing_rule_percentage;
            delete doc.__wmn_pricing_rule_discount_amount_field;
            delete doc.__wmn_pricing_rule_names;
            if (previousOwned) {
                doc.additional_discount_percentage = 0;
                doc.discount_amount = 0;
                doc.base_discount_amount = 0;
            }
            return;
        }
        const applyOn = text(transaction.apply_on) || "Grand Total";
        const percentage = Math.max(0, num(transaction.percentage));
        const amountField = Math.max(0, num(transaction.discount_amount_field));
        doc.__wmn_pricing_rule_invoice_discount_total = Math.max(0, num(transaction.amount));
        doc.__wmn_pricing_rule_apply_on = applyOn;
        doc.__wmn_pricing_rule_percentage = percentage;
        doc.__wmn_pricing_rule_discount_amount_field = amountField;
        doc.__wmn_pricing_rule_names = transaction.names || [];
        // Keep the native ERPNext fields until totals calculation. For percentage
        // rules ERPNext derives discount_amount from Net/Grand Total afterwards.
        doc.apply_discount_on = applyOn;
        doc.additional_discount_percentage = percentage;
        doc.discount_amount = amountField;
        doc.base_discount_amount = amountField * (num(doc.conversion_rate) || 1);
    }

    ns.Features.PricingRule.Common.ControllerMethods = {
        async wmn_is_local_pricing_rule_engine_ignored() {
            return await engineIgnored(this);
        },

        async wmn_get_local_pricing_rule_snapshot(force = false) {
            return await ensureSnapshot(this, force);
        },

        async wmn_refresh_local_pricing_rules(options = {}) {
            const doc = this.frm?.doc;
            if (!doc) return { disabled: true, applied_rules: [], unsupported: [] };

            // Native ERPNext Pricing Rule execution is invariantly disabled in WMN POS.
            doc.ignore_pricing_rule = 1;

            // ERPNext return documents preserve the pricing of the source document and
            // are created with ignore_pricing_rule=1. The WMN local engine must not
            // reinterpret that flag as permission to reprice the return.
            if (int(doc.is_return || 0)) {
                const result = {
                    disabled: true,
                    preserved_return_pricing: true,
                    applied_rules: [],
                    free_items: [],
                    transaction: null,
                    errors: [],
                    unsupported: [],
                    validation_messages: [],
                };
                doc.__wmn_local_pricing_rule_result = result;
                doc.__wmn_local_pricing_rule_errors = [];
                doc.__wmn_local_pricing_rule_unsupported = [];
                doc.__wmn_local_pricing_rule_validations = [];
                return result;
            }

            if (await engineIgnored(this)) {
                ns.Features.PricingRule.Common.Engine.clear(doc);
                await syncPricingRuleFreeItems(this, { free_items: [], unsupported: [] });
                applyTransactionMarkers(doc, null);
                await recalculate(this);
                doc.__wmn_local_pricing_rule_result = { disabled: true, applied_rules: [], unsupported: [] };
                return doc.__wmn_local_pricing_rule_result;
            }

            const snapshot = await ensureSnapshot(this, !!options.force_snapshot);
            if (snapshot?.__wmn_snapshot_missing) {
                const result = {
                    applied_rules: [],
                    unsupported: [{ name: "Pricing Rule Snapshot", reason: "snapshot_missing" }],
                    transaction: null,
                    rule_count: 0,
                };
                await syncPricingRuleFreeItems(this, { free_items: [], unsupported: result.unsupported });
                doc.__wmn_local_pricing_rule_result = result;
                doc.__wmn_local_pricing_rule_unsupported = result.unsupported;
                return result;
            }
            const result = ns.Features.PricingRule.Common.Engine.evaluate(doc, snapshot);
            await syncPricingRuleFreeItems(this, result);
            applyTransactionMarkers(doc, result.transaction);
            doc.__wmn_local_pricing_rule_result = result;
            doc.__wmn_local_pricing_rule_errors = result.errors || [];
            doc.__wmn_local_pricing_rule_unsupported = result.unsupported || [];
            doc.__wmn_local_pricing_rule_validations = result.validation_messages || [];
            await recalculate(this);
            if (result.transaction) {
                // ERPNext converts additional_discount_percentage to the actual
                // discount amount only after Net/Grand Total and taxes are known.
                doc.__wmn_pricing_rule_invoice_discount_total = Math.max(0, num(doc.discount_amount));
                result.transaction.amount = doc.__wmn_pricing_rule_invoice_discount_total;
            }
            this.frm?.dirty?.();
            return result;
        },

        wmn_assert_local_pricing_rules_supported() {
            const doc = this.frm?.doc || {};
            const errors = doc.__wmn_local_pricing_rule_errors || [];
            if (errors.length) {
                const conflict = errors.find((item) => item?.type === "multiple_rule_conflict");
                if (conflict) {
                    frappe.throw(
                        __("Multiple Price Rules exists with same criteria, please resolve conflict by assigning priority. Price Rules: {0}", [(conflict.rules || []).join("\n")]),
                        __("Pricing Rule Conflict")
                    );
                }
                const first = errors[0] || {};
                frappe.throw(
                    __("Pricing Rule {0} cannot be applied because its configuration is invalid for the ERPNext v16.6.1 execution path: {1}", [
                        (first.rules || []).join(", ") || first.rule || "", first.type || "invalid_rule"
                    ]),
                    __("Pricing Rule")
                );
            }

            const unsupported = doc.__wmn_local_pricing_rule_unsupported || [];
            if (!unsupported.length) return true;
            const labels = unsupported.slice(0, 6).map((item) => `${item.name} (${item.reason})`);
            const more = unsupported.length > labels.length ? ` +${unsupported.length - labels.length}` : "";
            frappe.throw(
                __("Pricing Rule execution is complete, but these required POS resources are unavailable: {0}{1}", [labels.join(", "), more]),
                __("Pricing Rule Resource")
            );
        },
    };

    window.addEventListener("wmn:pricing-rule-snapshot-updated", () => {
        ramSnapshot = null;
        ramKey = "";
        forceServerRefreshOnNextSnapshot = false;
    });
    window.addEventListener("wmn:pricing-rule-cumulative-history-changed", (event) => {
        ramSnapshot = null;
        ramKey = "";
        if (event?.detail?.server_committed) forceServerRefreshOnNextSnapshot = true;
    });
    window.addEventListener("wmn:pos-profile-settings-changed", (event) => {
        ramSnapshot = null;
        ramKey = "";
        const ctrl = window.cur_pos;
        const changedProfile = text(event?.detail?.pos_profile);
        if (!ctrl || (changedProfile && changedProfile !== profileName(ctrl))) return;
        Promise.resolve().then(() => ctrl.wmn_refresh_commercial_state_after_cart_change?.({ silent: true }))
            .catch((error) => console.warn("WMN Pricing Rule engine toggle refresh failed", error));
    });
})();
