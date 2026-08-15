/* Promotion Common controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.Promotion = ns.Features.Promotion || {};
    ns.Features.Promotion.Common = ns.Features.Promotion.Common || {};
    ns.Features.Promotion.Common.ControllerMethods = {
        wmn_get_promotion_context() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        return {
                            company: doc.company || this.company || "",
                            pos_profile: doc.pos_profile || this.pos_profile || "",
                            warehouse: doc.set_warehouse || this.settings?.warehouse || "",
                            customer: doc.customer || "",
                            default_customer: this.settings?.customer || "",
                            customer_group: doc.customer_group || this.customer_details?.customer_group || "",
                            coupon_code: doc.__wmn_coupon_code || "",
                            manual_invoice_discount_active: this.wmn_has_manual_additional_discount?.() || false,
                        };
                    },

        async wmn_get_active_promotions(options = {}) {
                        if (!window.WMNPOSPromotion) return [];

                        if (wmn_controller_uses_offline_flow(this)) {
                            if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getPromotions !== "function") return [];
                            return await window.wmnPOSOffline.getPromotions();
                        }

                        const now = Date.now();
                        const maxAge = 120000;
                        if (
                            !options.force &&
                            Array.isArray(this.__wmn_active_promotions_cache) &&
                            now - flt(this.__wmn_active_promotions_cache_time || 0) < maxAge
                        ) {
                            return this.__wmn_active_promotions_cache;
                        }

                        const context = this.wmn_get_promotion_context();
                        const response = await frappe.call({
                            method: "wmn.api.get_active_pos_promotions",
                            args: {
                                company: context.company,
                                pos_profile: context.pos_profile,
                                warehouse: context.warehouse,
                            },
                            freeze: false,
                        });

                        this.__wmn_active_promotions_cache = Array.isArray(response?.message) ? response.message : [];
                        this.__wmn_active_promotions_cache_time = now;
                        return this.__wmn_active_promotions_cache;
                    },

        wmn_get_promotion_row_key(row, index) {
                        return String((row && row.name) || `row-${index}`);
                    },

        wmn_prepare_promotion_base_rates() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        (doc.items || []).forEach((row) => {
                            const currentRate = Math.max(0, flt(row.rate ?? row.price_list_rate ?? 0));
                            const appliedRate = flt(row.__wmn_promotion_applied_rate || 0);
                            const hasAppliedRate = row.__wmn_promotion_applied_rate !== undefined;
                            const hasBaseRate = row.__wmn_promotion_base_rate !== undefined;

                            if (!hasBaseRate || !hasAppliedRate || Math.abs(currentRate - appliedRate) > 0.000001) {
                                row.__wmn_promotion_base_rate = currentRate;
                            }
                        });
                    },

        async wmn_sync_promotion_free_items(evaluation) {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return;

                        const wanted = new Map();
                        for (const rule of (evaluation?.applied || [])) {
                            const itemCode = String(rule.free_item_code || "").trim();
                            const qty = Math.max(0, flt(rule.free_qty || 0));
                            if (!itemCode || qty <= 0) continue;
                            const code = String(rule.promotion_code || "").trim().toUpperCase();
                            wanted.set(`${code}::${itemCode}`, {
                                code,
                                item_code: itemCode,
                                qty,
                                source_key: String(rule.free_source_key || ""),
                            });
                        }

                        const managed = (doc.items || []).filter((row) => cint(row?.__wmn_promotion_free_row || 0));
                        const kept = new Set();
                        const offline = wmn_controller_uses_offline_flow(this);

                        for (const target of wanted.values()) {
                            let row = managed.find((candidate) =>
                                !kept.has(candidate) &&
                                String(candidate.item_code || "") === target.item_code &&
                                String(candidate.__wmn_promotion_code || "").trim().toUpperCase() === target.code
                            ) || null;

                            if (!row) {
                                let seed = (doc.items || []).find((candidate, index) =>
                                    !cint(candidate?.is_free_item || 0) &&
                                    String(candidate.item_code || "") === target.item_code &&
                                    (!target.source_key || this.wmn_get_promotion_row_key(candidate, index) === target.source_key)
                                ) || (doc.items || []).find((candidate) =>
                                    !cint(candidate?.is_free_item || 0) && String(candidate.item_code || "") === target.item_code
                                ) || null;

                                if (!seed && offline && window.wmnPOSOffline?.findItem) {
                                    seed = await window.wmnPOSOffline.findItem(
                                        target.item_code,
                                        doc.selling_price_list || this.settings?.selling_price_list || ""
                                    );
                                }

                                if (!seed && !offline) {
                                    seed = (this.item_selector?.items || []).find((item) => String(item.item_code || "") === target.item_code) || null;
                                }

                                if (!seed) {
                                    frappe.show_alert({
                                        message: __("Free item {0} is not available in the current POS data", [target.item_code]),
                                        indicator: "orange",
                                    });
                                    continue;
                                }

                                if (cint(seed.has_serial_no || 0)) {
                                    frappe.show_alert({
                                        message: __("Free item {0} requires Serial No selection", [target.item_code]),
                                        indicator: "orange",
                                    });
                                    continue;
                                }
                                if (cint(seed.has_batch_no || 0) && !seed.batch_no) {
                                    frappe.show_alert({
                                        message: __("Free item {0} requires Batch selection", [target.item_code]),
                                        indicator: "orange",
                                    });
                                    continue;
                                }

                                const conversion = Math.max(0.000001, flt(seed.conversion_factor || 1));
                                const rawItemTaxRate = seed.item_tax_rate || seed.offline_item_tax_map || {};
                                let freeItemTaxMap = {};
                                if (typeof rawItemTaxRate === "string") {
                                    try {
                                        const parsedTaxMap = JSON.parse(rawItemTaxRate || "{}");
                                        freeItemTaxMap = parsedTaxMap && typeof parsedTaxMap === "object" ? parsedTaxMap : {};
                                    } catch (e) {
                                        freeItemTaxMap = {};
                                    }
                                } else if (rawItemTaxRate && typeof rawItemTaxRate === "object") {
                                    freeItemTaxMap = rawItemTaxRate;
                                }
                                const freeItemTaxRateJson = JSON.stringify(freeItemTaxMap || {});

                                if (offline) {
                                    row = this.frm.add_child("items", {
                                        doctype: this.wmn_get_child_doctype(),
                                        parenttype: doc.doctype,
                                        parent: doc.name,
                                        parentfield: "items",
                                        item_code: target.item_code,
                                        item_name: seed.item_name || target.item_code,
                                        description: seed.description || seed.item_name || target.item_code,
                                        image: seed.image || "",
                                        item_group: seed.item_group || "",
                                        brand: seed.brand || "",
                                        warehouse: seed.warehouse || doc.set_warehouse || this.settings?.warehouse || "",
                                        batch_no: seed.batch_no || "",
                                        serial_no: "",
                                        uom: seed.uom || seed.stock_uom || "Nos",
                                        stock_uom: seed.stock_uom || seed.uom || "Nos",
                                        conversion_factor: conversion,
                                        qty: target.qty,
                                        stock_qty: target.qty * conversion,
                                        price_list_rate: 0,
                                        rate: 0,
                                        amount: 0,
                                        net_rate: 0,
                                        net_amount: 0,
                                        base_rate: 0,
                                        base_net_rate: 0,
                                        base_amount: 0,
                                        base_net_amount: 0,
                                        discount_percentage: 0,
                                        is_free_item: 1,
                                        has_batch_no: cint(seed.has_batch_no || 0),
                                        has_serial_no: 0,
                                        allow_negative_stock: cint(seed.allow_negative_stock || 0),
                                        income_account: seed.income_account || this.settings?.income_account || "",
                                        expense_account: seed.expense_account || "",
                                        cost_center: seed.cost_center || this.settings?.cost_center || "",
                                        item_tax_template: seed.item_tax_template || "",
                                        offline_item_tax_map: freeItemTaxMap,
                                        item_tax_rate: freeItemTaxRateJson,
                                        __wmn_promotion_free_row: 1,
                                        __wmn_promotion_code: target.code,
                                    });

                                    const warehouse = doc.set_warehouse || this.settings?.warehouse || row.warehouse || "";
                                    row = wmn_normalize_offline_cart_row(row, doc, (doc.items || []).indexOf(row), warehouse);
                                    this.wmn_register_offline_row_in_frappe_model(row);
                                } else {
                                    row = this.frm.add_child("items", {
                                        doctype: this.wmn_get_child_doctype(),
                                        parenttype: doc.doctype,
                                        parent: doc.name,
                                        parentfield: "items",
                                        item_code: target.item_code,
                                        warehouse: seed.warehouse || doc.set_warehouse || this.settings?.warehouse || "",
                                        batch_no: seed.batch_no || "",
                                        serial_no: "",
                                        uom: seed.uom || seed.stock_uom || "Nos",
                                        stock_uom: seed.stock_uom || seed.uom || "Nos",
                                        conversion_factor: conversion,
                                        qty: target.qty,
                                        use_serial_batch_fields: 1,
                                        is_free_item: 1,
                                        __wmn_promotion_free_row: 1,
                                        __wmn_promotion_code: target.code,
                                    });

                                    // Use ERPNext's normal item events so mandatory accounting,
                                    // tax, warehouse and item defaults are populated exactly like
                                    // a normal POS row. The promotion fields are forced back to
                                    // free-item values immediately afterwards.
                                    await this.trigger_new_item_events(row);
                                }
                            } else {
                                row.qty = target.qty;
                                row.stock_qty = target.qty * flt(row.conversion_factor || 1);
                            }

                            row.rate = row.price_list_rate = row.amount = row.net_rate = row.net_amount = 0;
                            row.base_rate = row.base_net_rate = row.base_amount = row.base_net_amount = 0;
                            row.discount_percentage = 0;
                            row.is_free_item = 1;
                            kept.add(row);
                            this.update_cart_html?.(row, false);
                        }

                        for (const row of managed) {
                            if (kept.has(row)) continue;
                            doc.items = (doc.items || []).filter((candidate) => candidate !== row);
                            try {
                                if (frappe.locals?.[row.doctype] && row.name) delete frappe.locals[row.doctype][row.name];
                            } catch (e) {}
                            this.update_cart_html?.(row, true);
                        }

                        (doc.items || []).forEach((row, index) => { row.idx = index + 1; });
                        if (offline) this.wmn_recalculate_offline_totals();
                        this.frm.dirty?.();
                    },

        async wmn_apply_promotion_evaluation(evaluation, options = {}) {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return evaluation;

                        evaluation = evaluation || { applied: [], allocations: {}, rows: [], total_discount: 0 };
                        await this.wmn_sync_promotion_free_items(evaluation);
                        const evaluatedRows = new Map((evaluation.rows || []).map((row) => [String(row.key), row]));
                        const offline = wmn_controller_uses_offline_flow(this);

                        for (let index = 0; index < (doc.items || []).length; index++) {
                            const row = doc.items[index];
                            if (cint(row?.__wmn_promotion_free_row || 0)) continue;
                            const key = this.wmn_get_promotion_row_key(row, index);
                            const evaluated = evaluatedRows.get(key);
                            const currentRate = Math.max(0, flt(row.rate ?? row.price_list_rate ?? 0));
                            const previousApplied = row.__wmn_promotion_applied_rate !== undefined
                                ? flt(row.__wmn_promotion_applied_rate || 0)
                                : null;
                            let baseRate = evaluated ? flt(evaluated.base_rate || 0) : flt(row.__wmn_promotion_base_rate ?? currentRate);

                            if (previousApplied !== null && Math.abs(currentRate - previousApplied) > 0.000001) {
                                baseRate = currentRate;
                            }

                            const qty = Math.max(0, flt(row.qty || 0));
                            const rowDiscount = Math.max(0, flt(evaluation.allocations?.[key] || 0));
                            const newRate = qty > 0 ? Math.max(0, baseRate - rowDiscount / qty) : baseRate;

                            row.__wmn_promotion_base_rate = baseRate;
                            row.__wmn_promotion_discount_amount = rowDiscount;
                            row.__wmn_promotion_applied_rate = newRate;

                            if (offline) {
                                this.wmn_set_offline_promotion_rate(row, newRate);
                            } else {
                                await this.wmn_set_online_promotion_rate(row, newRate);
                            }

                            if (this.update_cart_html) this.update_cart_html(row, false);
                        }

                        doc.__wmn_pos_promotions = Array.isArray(evaluation.applied)
                            ? evaluation.applied.map((row) => Object.assign({}, row))
                            : [];
                        doc.__wmn_promotion_item_discount_total = Math.max(0, flt(evaluation.item_discount || 0));
                        doc.__wmn_promotion_invoice_discount_total = Math.max(0, flt(evaluation.invoice_discount || 0));
                        doc.__wmn_promotion_discount_total = flt(evaluation.total_discount || 0);

                        // WMN Promotion and WMN Coupon are the only automatic commercial
                        // engines inside WMN POS. ERPNext Pricing Rules are disabled on the
                        // invoice, so compose the final WMN invoice discount state directly.
                        if (!options.defer_discount_sync) {
                            await this.wmn_sync_pos_invoice_discount_fields();
                        }

                        if (offline) {
                            if (this.frm.dirty) this.frm.dirty();
                        } else {
                            if (this.frm && this.frm.dirty) this.frm.dirty();
                            if (this.cart && this.cart.update_totals_section) this.cart.update_totals_section(this.frm);
                        }

                        this.wmn_refresh_promotion_ui();
                        if (this.payment && this.payment.update_totals_section && this.payment.$component?.is(":visible")) {
                            this.payment.update_totals_section(doc);
                        }
                        return evaluation;
                    },

        async wmn_clear_promotions(options = {}) {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return;
                        const offline = wmn_controller_uses_offline_flow(this);
                        await this.wmn_sync_promotion_free_items({ applied: [] });

                        for (const row of doc.items || []) {
                            if (row.__wmn_promotion_base_rate === undefined) continue;
                            const currentRate = flt(row.rate || 0);
                            const appliedRate = row.__wmn_promotion_applied_rate !== undefined
                                ? flt(row.__wmn_promotion_applied_rate || 0)
                                : currentRate;
                            const restoreRate = Math.abs(currentRate - appliedRate) <= 0.000001
                                ? flt(row.__wmn_promotion_base_rate || 0)
                                : currentRate;

                            if (offline) this.wmn_set_offline_promotion_rate(row, restoreRate);
                            else await this.wmn_set_online_promotion_rate(row, restoreRate);

                            delete row.__wmn_promotion_base_rate;
                            delete row.__wmn_promotion_discount_amount;
                            delete row.__wmn_promotion_applied_rate;
                            if (this.update_cart_html) this.update_cart_html(row, false);
                        }

                        doc.__wmn_pos_promotions = [];
                        doc.__wmn_promotion_item_discount_total = 0;
                        doc.__wmn_promotion_invoice_discount_total = 0;
                        doc.__wmn_promotion_discount_total = 0;
                        if (!options.defer_discount_sync) {
                            await this.wmn_sync_pos_invoice_discount_fields();
                        }
                        this.wmn_refresh_promotion_ui();
                    },

        async wmn_refresh_promotions_after_cart_change(options = {}) {
                        if (this.__wmn_promotion_refreshing) return this.__wmn_last_promotion_evaluation || null;
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc || !window.WMNPOSPromotion) return null;

                        this.__wmn_promotion_refreshing = true;
                        try {
                            if (cint(doc.is_return || 0) || !Array.isArray(doc.items) || !doc.items.length) {
                                await this.wmn_clear_promotions({
                                    silent: true,
                                    defer_discount_sync: !!options.defer_discount_sync,
                                });
                                return null;
                            }

                            this.wmn_prepare_promotion_base_rates();
                            const rules = await this.wmn_get_active_promotions({ force: !!options.force });
                            const evaluation = window.WMNPOSPromotion.evaluate(
                                rules,
                                doc,
                                this.wmn_get_promotion_context()
                            );

                            await this.wmn_apply_promotion_evaluation(evaluation, options);
                            this.__wmn_last_promotion_evaluation = evaluation;
                            return evaluation;
                        } catch (e) {
                            console.error("WMN promotion refresh failed", e);
                            if (!options.silent) {
                                frappe.show_alert({
                                    message: e.message || __("Promotion calculation failed"),
                                    indicator: "orange",
                                });
                            }
                            return null;
                        } finally {
                            this.__wmn_promotion_refreshing = false;
                        }
                    },

        async wmn_refresh_promotions_and_coupon(options = {}) {
                        const hasActiveCoupon = Boolean(this.frm?.doc?.__wmn_pos_coupon_rule);
                        await this.wmn_refresh_promotions_after_cart_change(Object.assign({}, options, {
                            // Without a coupon, defer the parent discount write so this cart
                            // mutation performs one final totals calculation. With a coupon,
                            // the coupon base must observe the post-promotion invoice state.
                            defer_discount_sync: !hasActiveCoupon,
                        }));
                        await this.wmn_refresh_active_coupon_after_cart_change({ defer_sync: true });
                        await this.wmn_sync_pos_invoice_discount_fields();
                    },

        async wmn_revalidate_active_promotions() {
                        return await this.wmn_refresh_promotions_after_cart_change({
                            force: false,
                            silent: true,
                        });
                    },

        wmn_refresh_promotion_ui() {
                        try {
                            if (this.cart && typeof this.cart.wmn_refresh_promotion_control === "function") {
                                this.cart.wmn_refresh_promotion_control(this.frm && this.frm.doc ? this.frm.doc : {});
                            }
                        } catch (e) {
                            console.warn("WMN promotion UI refresh skipped", e);
                        }
                    }
    };
})();
