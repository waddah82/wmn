/* PricingRule Offline controller integration methods. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PricingRule = ns.Features.PricingRule || {};
    ns.Features.PricingRule.Offline = ns.Features.PricingRule.Offline || {};
    ns.Features.PricingRule.Offline.ControllerMethods = {
        async wmn_get_offline_pricing_rules() {
                        if (Array.isArray(this.__wmn_offline_pricing_rules)) {
                            return this.__wmn_offline_pricing_rules;
                        }

                        if (!window.wmnPOSOffline || typeof window.wmnPOSOffline.getPricingRules !== "function") {
                            this.__wmn_offline_pricing_rules = [];
                            return this.__wmn_offline_pricing_rules;
                        }

                        const rules = await window.wmnPOSOffline.getPricingRules();
                        this.__wmn_offline_pricing_rules = Array.isArray(rules) ? rules : [];
                        return this.__wmn_offline_pricing_rules;
                    },

        wmn_get_offline_pricing_context() {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        return {
                            company: doc.company || this.company || "",
                            currency: doc.currency || this.settings?.currency || this.settings?.company_currency || "",
                            price_list: doc.selling_price_list || this.settings?.selling_price_list || "",
                            warehouse: doc.set_warehouse || this.settings?.warehouse || "",
                            customer: doc.customer || "",
                            customer_group: doc.customer_group || "",
                            territory: doc.territory || "",
                            sales_partner: doc.sales_partner || "",
                            campaign: doc.campaign || "",
                            posting_date: String(doc.posting_date || frappe.datetime.get_today() || "").slice(0, 10),
                        };
                    },

        wmn_clear_offline_pricing_base_for_row(row) {
                        if (!row) return;
                        delete row.__wmn_pricing_base_price_list_rate;
                        delete row.__wmn_pricing_base_rate;
                        delete row.__wmn_pricing_base_discount_percentage;
                        delete row.__wmn_pricing_base_discount_amount;
                        delete row.__wmn_offline_pricing_rule_managed;
                        delete row.__wmn_offline_pricing_rule_applied_rate;
                    },

        wmn_restore_offline_pricing_row(row) {
                        if (!row || !cint(row.__wmn_offline_pricing_rule_managed || 0)) return;
                        row.price_list_rate = flt(row.__wmn_pricing_base_price_list_rate || 0);
                        row.rate = flt(row.__wmn_pricing_base_rate || row.price_list_rate || 0);
                        row.discount_percentage = flt(row.__wmn_pricing_base_discount_percentage || 0);
                        row.discount_amount = flt(row.__wmn_pricing_base_discount_amount || 0);
                        row.net_rate = row.rate;
                        row.amount = flt(row.qty || 0) * row.rate;
                        row.net_amount = row.amount;
                        row.base_rate = row.rate;
                        row.base_amount = row.amount;
                        row.base_net_rate = row.rate;
                        row.base_net_amount = row.amount;
                        row.has_pricing_rule = 0;
                        row.pricing_rules = "";
                        row.pricing_rule_for = "";
                        delete row.__wmn_offline_pricing_rule_managed;
                        delete row.__wmn_offline_pricing_rule_applied_rate;
                    },

        wmn_prepare_offline_pricing_base(row) {
                        if (row.__wmn_pricing_base_price_list_rate === undefined) {
                            row.__wmn_pricing_base_price_list_rate = flt(row.price_list_rate || row.rate || 0);
                            row.__wmn_pricing_base_rate = flt(row.rate || row.price_list_rate || 0);
                            row.__wmn_pricing_base_discount_percentage = flt(row.discount_percentage || 0);
                            row.__wmn_pricing_base_discount_amount = flt(row.discount_amount || 0);
                        }
                    },

        wmn_apply_erpnext_offline_pricing_result_to_row(row, result) {
                        if (!row || !result || !result.details) return;
                        this.wmn_prepare_offline_pricing_base(row);

                        const details = result.details;
                        row.price_list_rate = flt(details.price_list_rate || 0);
                        row.discount_percentage = Math.max(0, flt(details.discount_percentage || 0));
                        row.discount_amount = Math.max(0, flt(details.discount_amount || 0));
                        row.margin_type = details.margin_type || null;
                        row.margin_rate_or_amount = flt(details.margin_rate_or_amount || 0);

                        if (row.price_list_rate) {
                            row.rate = row.price_list_rate * (1 - (row.discount_percentage / 100));
                            if (row.discount_amount) row.rate = row.price_list_rate - row.discount_amount;
                        } else {
                            row.rate = flt(row.rate || 0);
                        }

                        const maxDiscount = flt(row.__wmn_item_max_discount || 0);
                        if (maxDiscount > 0 && row.discount_percentage > maxDiscount + 0.000001) {
                            throw new Error(__("Discount for item {0} cannot exceed {1}%", [row.item_code, maxDiscount]));
                        }

                        row.rate = Math.max(0, flt(row.rate || 0));
                        row.net_rate = row.rate;
                        row.amount = flt(row.qty || 0) * row.rate;
                        row.net_amount = row.amount;
                        row.base_rate = row.rate;
                        row.base_amount = row.amount;
                        row.base_net_rate = row.rate;
                        row.base_net_amount = row.amount;
                        row.has_pricing_rule = 1;
                        row.pricing_rules = JSON.stringify(result.rules || []);
                        row.pricing_rule_for = details.pricing_rule_for || "";
                        row.__wmn_offline_pricing_rule_managed = 1;
                        row.__wmn_offline_pricing_rule_applied_rate = row.rate;
                    },

        async wmn_get_offline_pricing_item_master(itemCode) {
                        this.__wmn_offline_pricing_item_master = this.__wmn_offline_pricing_item_master || new Map();
                        if (this.__wmn_offline_pricing_item_master.has(itemCode)) {
                            return this.__wmn_offline_pricing_item_master.get(itemCode);
                        }

                        const doc = this.frm && this.frm.doc ? this.frm.doc : {};
                        const priceList = doc.selling_price_list || this.settings?.selling_price_list || "";
                        const master = await window.wmnPOSOffline.findItem(itemCode, priceList);
                        this.__wmn_offline_pricing_item_master.set(itemCode, master || null);
                        return master || null;
                    },

        wmn_get_offline_pricing_conversion(master, uom) {
                        if (!master) return 1;
                        const targetUom = String(uom || master.stock_uom || "");
                        if (!targetUom || targetUom === String(master.stock_uom || "")) return 1;

                        const conversion = (master.uom_conversions || []).find(row => String(row.uom || "") === targetUom);
                        if (conversion) return flt(conversion.conversion_factor || 1);

                        const option = (master.uom_options || []).find(row => String(row.uom || "") === targetUom);
                        return option ? flt(option.conversion_factor || 1) : 1;
                    },

        async wmn_reconcile_offline_pricing_free_items(requests) {
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return false;

                        const desired = new Map();
                        for (const request of requests || []) {
                            if (!request || !request.item_code || flt(request.qty || 0) <= 0) continue;
                            const key = `${request.item_code}||${request.pricing_rule}`;
                            desired.set(key, request);
                        }

                        const existingRows = (doc.items || []).filter(row =>
                            row && cint(row.is_free_item || 0) && cint(row.__wmn_offline_pricing_rule_generated || 0)
                        );
                        const existing = new Map(existingRows.map(row => [String(row.__wmn_offline_pricing_rule_key || ""), row]));
                        let changed = false;

                        for (const [key, request] of desired.entries()) {
                            const source = request.source_row || null;
                            const master = await this.wmn_get_offline_pricing_item_master(request.item_code);
                            if (!master) continue;

                            if (cint(master.has_serial_no || 0)) {
                                if (!this.__wmn_offline_pricing_serial_warning_shown) {
                                    this.__wmn_offline_pricing_serial_warning_shown = true;
                                    frappe.show_alert({
                                        message: __("Free item {0} requires Serial No selection and was not added offline", [request.item_code]),
                                        indicator: "orange",
                                    });
                                }
                                continue;
                            }

                            if (cint(master.has_batch_no || 0) && !source?.batch_no) {
                                if (!this.__wmn_offline_pricing_batch_warning_shown) {
                                    this.__wmn_offline_pricing_batch_warning_shown = true;
                                    frappe.show_alert({
                                        message: __("Free item {0} requires Batch selection and was not added offline", [request.item_code]),
                                        indicator: "orange",
                                    });
                                }
                                continue;
                            }

                            const uom = request.uom || master.stock_uom || source?.stock_uom || source?.uom || "Nos";
                            const conversionFactor = this.wmn_get_offline_pricing_conversion(master, uom);
                            const warehouse = source?.warehouse || request.warehouse || doc.set_warehouse || this.settings?.warehouse || master.warehouse || "";
                            const batchNo = source?.batch_no || "";
                            let row = existing.get(key);

                            const values = {
                                item_code: request.item_code,
                                item_name: master.item_name || request.item_code,
                                description: master.description || master.item_name || request.item_code,
                                image: master.image || "",
                                item_group: master.item_group || "",
                                brand: master.brand || "",
                                warehouse,
                                batch_no: batchNo,
                                serial_no: "",
                                uom,
                                stock_uom: master.stock_uom || uom,
                                conversion_factor: conversionFactor,
                                qty: flt(request.qty || 0),
                                stock_qty: flt(request.qty || 0) * conversionFactor,
                                price_list_rate: flt(request.rate || 0),
                                rate: flt(request.rate || 0),
                                amount: flt(request.qty || 0) * flt(request.rate || 0),
                                net_rate: flt(request.rate || 0),
                                net_amount: flt(request.qty || 0) * flt(request.rate || 0),
                                discount_percentage: 0,
                                discount_amount: 0,
                                is_free_item: 1,
                                pricing_rules: request.pricing_rule,
                                has_pricing_rule: 1,
                                has_batch_no: cint(master.has_batch_no || 0),
                                has_serial_no: cint(master.has_serial_no || 0),
                                allow_negative_stock: cint(master.allow_negative_stock || 0),
                                income_account: master.income_account || master.default_income_account || "",
                                expense_account: master.expense_account || master.default_expense_account || "",
                                cost_center: master.cost_center || master.default_cost_center || "",
                                item_tax_template: master.item_tax_template || "",
                                offline_item_tax_map: wmn_parse_json_map(master.offline_item_tax_map || master.item_tax_rate || {}),
                                item_tax_rate: wmn_parse_json_map(master.item_tax_rate || master.offline_item_tax_map || {}),
                                __wmn_item_max_discount: flt(master.max_discount || 0),
                                __wmn_offline_pricing_rule_generated: 1,
                                __wmn_offline_pricing_rule_key: key,
                            };

                            if (!row) {
                                const childDoctype = this.wmn_get_child_doctype();
                                row = this.frm.add_child("items", Object.assign({
                                    doctype: childDoctype,
                                    parenttype: doc.doctype,
                                    parent: doc.name,
                                    parentfield: "items",
                                }, values));
                                changed = true;
                            } else {
                                const before = [row.qty, row.rate, row.uom, row.warehouse, row.batch_no].join("||");
                                Object.assign(row, values);
                                const after = [row.qty, row.rate, row.uom, row.warehouse, row.batch_no].join("||");
                                if (before !== after) changed = true;
                                existing.delete(key);
                            }

                            wmn_normalize_offline_cart_row(row, doc, (doc.items || []).indexOf(row), warehouse);
                            this.wmn_register_offline_row_in_frappe_model(row);
                        }

                        for (const row of existing.values()) {
                            const index = (doc.items || []).indexOf(row);
                            if (index >= 0) {
                                doc.items.splice(index, 1);
                                changed = true;
                            }
                        }

                        wmn_normalize_all_offline_cart_rows(doc, doc.set_warehouse || this.settings?.warehouse || "");
                        return changed;
                    },

        async wmn_refresh_offline_pricing_state(options = {}) {
                        if (!wmn_controller_uses_offline_flow(this)) return { free_items_changed: false };

                        // Full Pricing Rule evaluation belongs to the pre-Payment boundary.
                        // Callers may explicitly disable transaction rules only for diagnostic/
                        // compatibility use; normal cart hot paths do not call this method.
                        const applyTransaction = options.apply_transaction !== false;
                        const pricingResult = await this.wmn_offline_apply_pricing_rules({
                            apply_transaction: applyTransaction,
                        });
                        this.wmn_recalculate_offline_totals();

                        await this.wmn_refresh_promotions_and_coupon({
                            silent: options.silent !== false,
                        });

                        if (applyTransaction) {
                            // Final invoice-level ownership must match ERPNext Online.
                            await this.wmn_reconcile_invoice_discount_ownership();
                            this.wmn_recalculate_offline_totals();
                        }

                        return pricingResult || { free_items_changed: false };
                    },

        async wmn_offline_apply_pricing_rules(options = {}) {
                        const applyTransaction = options.apply_transaction === true;
                        if (!wmn_controller_uses_offline_flow(this)) return { free_items_changed: false };
                        const doc = this.frm && this.frm.doc ? this.frm.doc : null;
                        if (!doc) return { free_items_changed: false };

                        const paidRows = (doc.items || []).filter(row => row && !cint(row.is_free_item || 0) && flt(row.qty || 0) > 0);
                        paidRows.forEach(row => this.wmn_restore_offline_pricing_row(row));

                        doc.__wmn_pricing_rule_invoice_discount_total = 0;
                        doc.__wmn_pricing_rule_invoice_discount_percentage = 0;
                        doc.__wmn_pricing_rule_apply_on = "";
                        doc.__wmn_offline_pricing_transaction_rule = "";

                        if (cint(doc.ignore_pricing_rule || 0)) {
                            return { free_items_changed: await this.wmn_reconcile_offline_pricing_free_items([]) };
                        }

                        if (typeof window.WMNERPNextPricingRuleOffline !== "function") {
                            throw new Error("WMNERPNextPricingRuleOffline is not loaded");
                        }

                        const rules = await this.wmn_get_offline_pricing_rules();
                        const context = this.wmn_get_offline_pricing_context();
                        context.coupon_code = doc.coupon_code || doc.__wmn_coupon_code || "";
                        context.pending_invoices = [];
                        if (
                            (rules || []).some(rule => cint(rule.is_cumulative || 0)) &&
                            window.wmnPOSOffline &&
                            typeof window.wmnPOSOffline.getPendingInvoices === "function"
                        ) {
                            try {
                                const pendingRows = await window.wmnPOSOffline.getPendingInvoices();
                                context.pending_invoices = (pendingRows || []).map(row => row && row.invoice).filter(Boolean);
                            } catch (e) {
                                context.pending_invoices = [];
                            }
                        }

                        const engine = new window.WMNERPNextPricingRuleOffline({
                            rules,
                            doc,
                            context,
                        });
                        const evaluation = engine.evaluate({ include_transaction: applyTransaction });

                        for (const row of paidRows) {
                            const key = row.name || row.item_code;
                            const result = evaluation.rowResults.get(key);
                            if (!result) continue;

                            if (result.details && !result.validate_applied_rule) {
                                this.wmn_apply_erpnext_offline_pricing_result_to_row(row, result);
                            } else if (result.rules && result.rules.length) {
                                this.wmn_prepare_offline_pricing_base(row);
                                row.has_pricing_rule = 1;
                                row.pricing_rules = JSON.stringify(result.rules);
                                row.__wmn_offline_pricing_rule_managed = 1;
                                row.__wmn_offline_pricing_rule_applied_rate = row.rate;
                            }
                        }

                        const transaction = evaluation.transaction || {};
                        if (applyTransaction) {
                            const applyOn = transaction.apply_discount_on === "Net Total" ? "Net Total" : "Grand Total";
                            if (flt(transaction.additional_discount_percentage || 0) || flt(transaction.discount_amount || 0)) {
                                const savedAdditionalPercentage = flt(doc.additional_discount_percentage || 0);
                                const savedDiscountAmount = flt(doc.discount_amount || 0);
                                const savedBaseDiscountAmount = flt(doc.base_discount_amount || 0);
                                const savedApplyOn = doc.apply_discount_on || "Grand Total";

                                doc.additional_discount_percentage = 0;
                                doc.discount_amount = 0;
                                doc.base_discount_amount = 0;
                                doc.apply_discount_on = applyOn;
                                this.wmn_recalculate_offline_totals();

                                const baseAmount = applyOn === "Net Total"
                                    ? flt(doc.net_total || doc.total || 0)
                                    : flt(doc.grand_total || doc.rounded_total || 0);
                                let pricingDiscount = flt(transaction.discount_amount || 0);
                                if (flt(transaction.additional_discount_percentage || 0)) {
                                    pricingDiscount = baseAmount * flt(transaction.additional_discount_percentage || 0) / 100;
                                }

                                doc.apply_discount_on = savedApplyOn;
                                doc.additional_discount_percentage = savedAdditionalPercentage;
                                doc.discount_amount = savedDiscountAmount;
                                doc.base_discount_amount = savedBaseDiscountAmount;
                                doc.__wmn_pricing_rule_invoice_discount_total = Math.max(0, Math.min(pricingDiscount, Math.max(0, baseAmount)));
                                doc.__wmn_pricing_rule_invoice_discount_percentage = Math.max(
                                    0,
                                    flt(transaction.additional_discount_percentage || 0)
                                );
                                doc.__wmn_pricing_rule_apply_on = applyOn;
                                doc.__wmn_offline_pricing_transaction_rule = transaction.applied_rule || "";
                            }
                        }

                        const pricingFreeItems = applyTransaction
                            ? (evaluation.freeRequests || [])
                            : (evaluation.itemFreeRequests || []);
                        const freeItemsChanged = await this.wmn_reconcile_offline_pricing_free_items(pricingFreeItems);
                        return { free_items_changed: freeItemsChanged };
                    }
    };
})();
