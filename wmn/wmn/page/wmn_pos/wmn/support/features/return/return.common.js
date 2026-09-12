/* Shared return ownership for WMN POS. No storage or server calls live here. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.Return = ns.Features.Return || {};

    const EPSILON = 0.000001;

    function text(value) {
        return String(value || "").trim();
    }

    function invoiceIdentities(doc) {
        doc = doc || {};
        const values = [
            doc.name,
            doc.__wmn_display_name,
            doc.__wmn_queue_offline_id,
            doc.__wmn_server_name,
            doc.__wmn_original_name,
            doc.__wmn_return_against_offline_id,
            doc.wmn_offline_sync_id,
            doc.custom_offline_id,
        ];
        return new Set(values.map(text).filter(Boolean));
    }

    function returnReferenceField(doctype) {
        return text(doctype) === "POS Invoice" ? "pos_invoice_item" : "sales_invoice_item";
    }

    function sourceRowReference(sourceDoc, row) {
        const fieldname = returnReferenceField(sourceDoc?.doctype);
        return text(row?.[fieldname] || row?.__wmn_source_item_row || "");
    }

    function itemFingerprint(row) {
        row = row || {};
        return [
            text(row.item_code),
            text(row.uom),
            text(row.warehouse),
            text(row.batch_no),
            text(row.serial_no),
        ].join("::");
    }

    function isSubmittedSource(doc) {
        doc = doc || {};
        return cint(doc.docstatus || 0) === 1 || doc.__wmn_local_submitted === true;
    }

    function canOfferReturn(doc) {
        doc = doc || {};
        if (!isSubmittedSource(doc)) return false;
        if (cint(doc.is_return || 0) === 1) return false;
        return Array.isArray(doc.items) && doc.items.some((row) => Math.abs(flt(row?.qty || 0)) > EPSILON);
    }

    function returnMatchesSource(returnDoc, sourceDoc) {
        if (!returnDoc || cint(returnDoc.is_return || 0) !== 1) return false;
        const sourceIds = invoiceIdentities(sourceDoc);
        const returnAgainstValues = [
            returnDoc.return_against,
            returnDoc.__wmn_return_against_offline_id,
        ].map(text).filter(Boolean);
        return returnAgainstValues.some((value) => sourceIds.has(value));
    }

    function sourceBaseNetRate(row) {
        row = row || {};
        const qty = Math.abs(flt(row.qty || 0));
        if (qty <= EPSILON) return flt(row.net_rate || row.rate || 0);

        // ERPNext resets net values before applying invoice-level discount.
        // Reconstruct that pre-invoice-discount net rate from the submitted row.
        const distributed = flt(row.distributed_discount_amount || 0);
        const finalNetAmount = flt(
            row.net_amount !== undefined ? row.net_amount : (row.amount || 0)
        );
        const preInvoiceDiscountNetAmount = finalNetAmount + distributed;
        if (Math.abs(preInvoiceDiscountNetAmount) > EPSILON || Math.abs(finalNetAmount) > EPSILON) {
            return preInvoiceDiscountNetAmount / flt(row.qty || 1);
        }

        return flt(row.net_rate || row.rate || 0);
    }

    function financialSnapshot(sourceDoc) {
        sourceDoc = sourceDoc || {};
        const fields = [
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
            "paid_amount",
            "base_paid_amount",
            "outstanding_amount",
        ];
        const values = {};
        fields.forEach((fieldname) => {
            if (sourceDoc[fieldname] !== undefined && sourceDoc[fieldname] !== null) {
                values[fieldname] = flt(sourceDoc[fieldname] || 0);
            }
        });

        return {
            values,
            taxes: (sourceDoc.taxes || []).map((tax) => ({
                idx: cint(tax.idx || 0),
                tax_amount: flt(tax.tax_amount || 0),
                base_tax_amount: flt(tax.base_tax_amount || tax.tax_amount || 0),
                tax_amount_after_discount_amount: flt(
                    tax.tax_amount_after_discount_amount !== undefined
                        ? tax.tax_amount_after_discount_amount
                        : tax.tax_amount || 0
                ),
                base_tax_amount_after_discount_amount: flt(
                    tax.base_tax_amount_after_discount_amount !== undefined
                        ? tax.base_tax_amount_after_discount_amount
                        : (tax.base_tax_amount !== undefined ? tax.base_tax_amount : tax.tax_amount || 0)
                ),
                total: flt(tax.total || 0),
                base_total: flt(tax.base_total !== undefined ? tax.base_total : tax.total || 0),
            })),
        };
    }

    ns.Features.Return.Common = {
        EPSILON,
        invoiceIdentities,
        returnReferenceField,
        sourceRowReference,
        itemFingerprint,
        isSubmittedSource,
        canOfferReturn,
        returnMatchesSource,
        sourceBaseNetRate,
        financialSnapshot,
    };
})();
