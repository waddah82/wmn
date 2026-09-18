/* Offline return state derived only from the local invoice queue. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.Return = ns.Features.Return || {};
    const Common = ns.Features.Return.Common;

    function rawInvoice(row) {
        return row?.invoice || row?.doc || row?.data || row || null;
    }

    async function getQueueRows() {
        const storage = window.wmnPOSOffline;
        if (!storage?.getAllCached || !storage?.STORES?.invoice_queue) return [];
        return (await storage.getAllCached(storage.STORES.invoice_queue)) || [];
    }

    function resolveSourceItem(sourceDoc, returnRow, sourceByName, sourceByFingerprint) {
        const reference = Common.sourceRowReference(sourceDoc, returnRow);
        if (reference && sourceByName.has(reference)) return sourceByName.get(reference);

        const fingerprint = Common.itemFingerprint(returnRow);
        const candidates = sourceByFingerprint.get(fingerprint) || [];
        if (candidates.length === 1) return candidates[0];

        const sameItem = (sourceDoc.items || []).filter((row) => String(row.item_code || "") === String(returnRow.item_code || ""));
        return sameItem.length === 1 ? sameItem[0] : null;
    }

    async function getReturnState(sourceDoc) {
        sourceDoc = sourceDoc || {};
        const sourceItems = (sourceDoc.items || []).filter((row) => row && Math.abs(flt(row.qty || 0)) > Common.EPSILON);
        const sourceByName = new Map();
        const sourceByFingerprint = new Map();
        const stateByRow = new Map();

        sourceItems.forEach((row, index) => {
            const rowName = String(row.name || `__idx_${index + 1}`);
            sourceByName.set(String(row.name || ""), row);
            const fingerprint = Common.itemFingerprint(row);
            if (!sourceByFingerprint.has(fingerprint)) sourceByFingerprint.set(fingerprint, []);
            sourceByFingerprint.get(fingerprint).push(row);
            stateByRow.set(rowName, {
                source_row: row,
                source_qty: Math.abs(flt(row.qty || 0)),
                returned_qty: 0,
                remaining_qty: Math.abs(flt(row.qty || 0)),
            });
        });

        const queueRows = await getQueueRows();
        for (const queueRow of queueRows) {
            const returnDoc = rawInvoice(queueRow);
            if (!Common.returnMatchesSource(returnDoc, sourceDoc)) continue;

            for (const returnRow of returnDoc.items || []) {
                const sourceRow = resolveSourceItem(sourceDoc, returnRow, sourceByName, sourceByFingerprint);
                if (!sourceRow) continue;
                const sourceKey = String(sourceRow.name || `__idx_${cint(sourceRow.idx || 0)}`);
                const itemState = stateByRow.get(sourceKey);
                if (!itemState) continue;
                itemState.returned_qty += Math.abs(flt(returnRow.qty || 0));
            }
        }

        const items = Array.from(stateByRow.values()).map((itemState) => {
            itemState.returned_qty = Math.min(itemState.source_qty, Math.max(0, flt(itemState.returned_qty || 0)));
            itemState.remaining_qty = Math.max(0, itemState.source_qty - itemState.returned_qty);
            return itemState;
        });

        return {
            source: sourceDoc,
            submitted: Common.isSubmittedSource(sourceDoc),
            is_return: cint(sourceDoc.is_return || 0) === 1,
            items,
            returnable: Common.canOfferReturn(sourceDoc) && items.some((row) => row.remaining_qty > Common.EPSILON),
        };
    }

    async function getReturnedQty(sourceDoc, sourceItem) {
        const state = await getReturnState(sourceDoc);
        const sourceName = String(sourceItem?.name || "");
        const exact = state.items.find((row) => String(row.source_row?.name || "") === sourceName);
        if (exact) return exact.returned_qty;

        const fingerprint = Common.itemFingerprint(sourceItem);
        const matches = state.items.filter((row) => Common.itemFingerprint(row.source_row) === fingerprint);
        return matches.length === 1 ? matches[0].returned_qty : 0;
    }

    async function isInvoiceReturnable(sourceDoc) {
        const state = await getReturnState(sourceDoc);
        return !!state.returnable;
    }

    function isFullOriginalReturn(returnState) {
        const items = returnState?.items || [];
        if (!items.length) return false;
        return items.every((state) => (
            Math.abs(flt(state.returned_qty || 0)) <= Common.EPSILON &&
            Math.abs(flt(state.remaining_qty || 0) - flt(state.source_qty || 0)) <= Common.EPSILON
        ));
    }

    function buildReturnTaxRows(sourceDoc, targetDoc) {
        return (sourceDoc.taxes || []).map((tax, idx) => {
            const returnTax = Object.assign({}, tax, {
                name: "OFFLINE-RETURN-TAX-" + Date.now() + "-" + idx,
                parent: targetDoc.name,
                parenttype: targetDoc.doctype,
                parentfield: "taxes",
                idx: idx + 1,
            });

            if (String(returnTax.charge_type || "") === "Actual") {
                returnTax.tax_amount = -flt(tax.tax_amount || 0);
                returnTax.base_tax_amount = -flt(
                    tax.base_tax_amount !== undefined ? tax.base_tax_amount : tax.tax_amount || 0
                );
            }
            return returnTax;
        });
    }

    function buildReturnItems(sourceDoc, targetDoc, returnState) {
        const referenceField = Common.returnReferenceField(targetDoc.doctype);
        return (returnState.items || [])
            .filter((state) => flt(state.remaining_qty || 0) > Common.EPSILON)
            .map((state, idx) => {
                const row = state.source_row || {};
                const returnQty = Math.max(0, flt(state.remaining_qty || 0));
                const sourceQty = Math.max(Common.EPSILON, Math.abs(flt(state.source_qty || row.qty || 0)));
                const conversionFactor = Math.abs(flt(row.conversion_factor || 1)) || 1;
                const sourceStockQty = Math.abs(flt(
                    row.stock_qty !== undefined ? row.stock_qty : sourceQty * conversionFactor
                ));
                const ratio = Math.min(1, returnQty / sourceQty);
                const returnRow = Object.assign({}, row, {
                    name: "OFFLINE-RETURN-ROW-" + Date.now() + "-" + idx,
                    qty: -returnQty,
                    stock_qty: -(sourceStockQty * ratio),
                    returned_qty: 0,
                    parent: targetDoc.name,
                    parenttype: targetDoc.doctype,
                    parentfield: "items",
                    idx: idx + 1,
                    pricing_rules: null,
                    __wmn_source_item_row: row.name || "",
                    __wmn_return_source_qty: sourceQty,
                    __wmn_return_base_net_rate: Common.sourceBaseNetRate(row),
                });

                if (referenceField) returnRow[referenceField] = row.name;

                // ERPNext calculate_item_values starts from rate/amount and a clean net state.
                // Do not carry the source's already distributed invoice discount into the return.
                returnRow.amount = flt(returnRow.qty || 0) * flt(returnRow.rate || returnRow.price_list_rate || 0);
                returnRow.base_amount = flt(returnRow.qty || 0) * flt(returnRow.base_rate || returnRow.rate || 0);
                returnRow.net_rate = flt(returnRow.__wmn_return_base_net_rate || returnRow.rate || 0);
                returnRow.net_amount = flt(returnRow.qty || 0) * returnRow.net_rate;
                returnRow.base_net_rate = flt(
                    row.base_net_rate && row.net_rate
                        ? returnRow.net_rate * (flt(row.base_net_rate) / flt(row.net_rate))
                        : returnRow.net_rate
                );
                returnRow.base_net_amount = flt(returnRow.qty || 0) * returnRow.base_net_rate;
                returnRow.distributed_discount_amount = 0;
                return returnRow;
            });
    }

    function buildReturnPayments(sourceDoc, targetDoc, zeroPaymentReturn, fallbackPaymentMethod) {
        const rows = (sourceDoc.payments || [])
            .filter((row) => row && row.mode_of_payment)
            .map((row, idx) => ({
                doctype: row.doctype || "Sales Invoice Payment",
                name: "OFFLINE-RETURN-PAY-" + Date.now() + "-" + idx,
                parent: targetDoc.name,
                parenttype: targetDoc.doctype,
                parentfield: "payments",
                idx: idx + 1,
                mode_of_payment: row.mode_of_payment,
                type: row.type || "",
                account: row.account || "",
                default: row.default,
                amount: zeroPaymentReturn ? 0 : -flt(row.amount || 0),
                base_amount: zeroPaymentReturn
                    ? 0
                    : -flt(row.base_amount !== undefined ? row.base_amount : row.amount || 0),
            }));

        const sourcePaidAmount = flt(sourceDoc.paid_amount || 0);
        const hasMappedPayment = rows.some((row) => Math.abs(flt(row.amount || 0)) > Common.EPSILON);
        if (!zeroPaymentReturn && Math.abs(sourcePaidAmount) > Common.EPSILON && !hasMappedPayment) {
            const fallback = fallbackPaymentMethod || null;
            if (fallback?.mode_of_payment) {
                rows.push({
                    doctype: "Sales Invoice Payment",
                    name: "OFFLINE-RETURN-PAY-" + Date.now() + "-fallback",
                    parent: targetDoc.name,
                    parenttype: targetDoc.doctype,
                    parentfield: "payments",
                    idx: rows.length + 1,
                    mode_of_payment: fallback.mode_of_payment,
                    type: fallback.type || "",
                    account: fallback.account || "",
                    default: fallback.default,
                    amount: -Math.abs(sourcePaidAmount),
                    base_amount: -Math.abs(flt(sourceDoc.base_paid_amount || sourcePaidAmount)),
                });
            }
        }
        return rows;
    }

    function buildReturnDocument(sourceDoc, targetDoc, returnState, options = {}) {
        sourceDoc = sourceDoc || {};
        targetDoc = targetDoc || {};
        returnState = returnState || { items: [] };

        targetDoc.is_return = 1;
        targetDoc.return_against = sourceDoc.name;
        targetDoc.ignore_pricing_rule = 1;
        targetDoc.pricing_rules = [];
        targetDoc.customer = sourceDoc.customer;
        targetDoc.customer_name = sourceDoc.customer_name;
        targetDoc.apply_discount_on = sourceDoc.apply_discount_on || targetDoc.apply_discount_on || "Grand Total";
        targetDoc.additional_discount_percentage = flt(sourceDoc.additional_discount_percentage || 0);
        targetDoc.discount_amount = -flt(sourceDoc.discount_amount || 0);
        targetDoc.base_discount_amount = -flt(
            sourceDoc.base_discount_amount !== undefined
                ? sourceDoc.base_discount_amount
                : sourceDoc.discount_amount || 0
        );
        targetDoc.taxes_and_charges = sourceDoc.taxes_and_charges || "";
        targetDoc.tax_category = sourceDoc.tax_category || "";
        targetDoc.taxes = buildReturnTaxRows(sourceDoc, targetDoc);
        targetDoc.items = buildReturnItems(sourceDoc, targetDoc, returnState);
        targetDoc.__wmn_return_source_financial_snapshot = Common.financialSnapshot(sourceDoc);
        targetDoc.__wmn_return_source_payment_data = (sourceDoc.payments || [])
            .filter((row) => row && row.mode_of_payment)
            .map((row) => ({
                mode_of_payment: row.mode_of_payment,
                amount: flt(row.amount || 0),
            }));
        targetDoc.__wmn_return_exact_source_snapshot_eligible = isFullOriginalReturn(returnState);
        targetDoc.__wmn_return_exact_source_item_count = (sourceDoc.items || []).filter(
            (row) => row && Math.abs(flt(row.qty || 0)) > Common.EPSILON
        ).length;
        targetDoc.payments = buildReturnPayments(
            sourceDoc,
            targetDoc,
            options.zero_payment_return === true,
            options.fallback_payment_method || null
        );
        return targetDoc;
    }

    function applyExactFinancialSnapshotIfEligible(doc) {
        if (!doc || cint(doc.is_return || 0) !== 1) return false;
        if (doc.__wmn_return_exact_source_snapshot_eligible !== true) return false;
        const snapshot = doc.__wmn_return_source_financial_snapshot;
        if (!snapshot?.values) return false;

        const expectedCount = cint(doc.__wmn_return_exact_source_item_count || 0);
        if (!expectedCount || (doc.items || []).length !== expectedCount) return false;
        const quantitiesStillMatch = (doc.items || []).every((row) => (
            flt(row.qty || 0) < 0 &&
            Math.abs(Math.abs(flt(row.qty || 0)) - Math.abs(flt(row.__wmn_return_source_qty || 0))) <= Common.EPSILON
        ));
        if (!quantitiesStillMatch) return false;

        const reverseFields = [
            "total_qty",
            "total",
            "net_total",
            "base_total",
            "base_net_total",
            "total_taxes_and_charges",
            "base_total_taxes_and_charges",
            "discount_amount",
            "base_discount_amount",
            "grand_total",
            "base_grand_total",
            "rounded_total",
            "base_rounded_total",
            "rounding_adjustment",
            "base_rounding_adjustment",
        ];
        reverseFields.forEach((fieldname) => {
            if (Object.prototype.hasOwnProperty.call(snapshot.values, fieldname)) {
                doc[fieldname] = -flt(snapshot.values[fieldname] || 0);
            }
        });

        (doc.taxes || []).forEach((tax, idx) => {
            const sourceTax = (snapshot.taxes || [])[idx];
            if (!sourceTax) return;
            [
                "tax_amount",
                "base_tax_amount",
                "tax_amount_after_discount_amount",
                "base_tax_amount_after_discount_amount",
                "total",
                "base_total",
            ].forEach((fieldname) => {
                tax[fieldname] = -flt(sourceTax[fieldname] || 0);
            });
        });

        let paidAmount = 0;
        let basePaidAmount = 0;
        (doc.payments || []).forEach((payment) => {
            paidAmount += flt(payment.amount || 0);
            basePaidAmount += flt(payment.base_amount !== undefined ? payment.base_amount : payment.amount || 0);
        });
        doc.paid_amount = paidAmount;
        doc.base_paid_amount = basePaidAmount;
        const payable = doc.rounded_total !== undefined && doc.rounded_total !== null && flt(doc.rounded_total || 0) !== 0
            ? flt(doc.rounded_total || 0)
            : flt(doc.grand_total || 0);
        doc.outstanding_amount = payable - paidAmount;
        doc.change_amount = 0;
        doc.base_change_amount = 0;
        return true;
    }

    ns.Features.Return.Offline = {
        getReturnState,
        getReturnedQty,
        isInvoiceReturnable,
        buildReturnDocument,
        applyExactFinancialSnapshotIfEligible,
    };
})();
