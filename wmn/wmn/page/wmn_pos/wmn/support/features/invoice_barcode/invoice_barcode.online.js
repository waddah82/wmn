/* Online invoice barcode lookup uses receipt-opening identity, with legacy UID compatibility. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceBarcode = ns.Features.InvoiceBarcode || {};

    function syncDoc(doc) {
        if (!doc) return null;
        if (window.frappe?.model?.sync) {
            frappe.model.sync(doc);
            return frappe.get_doc(doc.doctype, doc.name) || doc;
        }
        return doc;
    }

    ns.Features.InvoiceBarcode.Online = {
        async findByLookup(lookup) {
            if (!lookup) return null;

            const method = lookup.type === "receipt"
                ? "wmn.invoice_barcode.get_invoice_by_receipt"
                : "wmn.invoice_barcode.get_invoice_by_uid";
            const args = lookup.type === "receipt"
                ? {
                    pos_opening_entry: lookup.pos_opening_entry,
                    receipt_no: lookup.receipt_no,
                }
                : { invoice_uid: lookup.uid };

            const response = await frappe.call({ method, args, freeze: false });
            return syncDoc(response?.message || null);
        },

        async findByUID(uid) {
            return this.findByLookup({ type: "uid", uid });
        },
    };
})();
