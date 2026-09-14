/* Offline invoice barcode lookup reads only the local invoice queue. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceBarcode = ns.Features.InvoiceBarcode || {};

    function invoiceFromRow(row) {
        return row?.invoice || row?.doc || row?.data || row || {};
    }

    function matchesLookup(row, lookup) {
        const doc = invoiceFromRow(row);
        if (lookup.type === "receipt") {
            const opening = String(
                doc.wmn_receipt_opening_entry ||
                doc.pos_opening_entry ||
                doc.pos_opening ||
                doc.opening_entry ||
                ""
            ).trim().toUpperCase();
            const receipt = String(doc.wmn_receipt_no || doc.__wmn_receipt_no || "")
                .trim()
                .padStart(5, "0");
            return opening === String(lookup.pos_opening_entry || "").trim().toUpperCase()
                && receipt === String(lookup.receipt_no || "").trim();
        }

        return String(doc.wmn_invoice_uid || "").trim().toUpperCase()
            === String(lookup.uid || "").trim().toUpperCase();
    }

    ns.Features.InvoiceBarcode.Offline = {
        async findByLookup(lookup) {
            if (!lookup || !window.wmnPOSOffline?.STORES?.invoice_queue) return null;
            const readAll = window.wmnPOSOffline.getAllCached || window.wmnPOSOffline.getAll;
            if (!readAll) return null;

            const rows = await readAll(window.wmnPOSOffline.STORES.invoice_queue);
            const match = (rows || []).find((row) => matchesLookup(row, lookup));
            if (!match) return null;

            if (typeof window.wmnPOSOffline.decorateInvoiceQueueRow === "function") {
                const paymentRows = window.wmnPOSOffline.STORES?.payment_entry_queue
                    ? await readAll(window.wmnPOSOffline.STORES.payment_entry_queue)
                    : [];
                return window.wmnPOSOffline.decorateInvoiceQueueRow(match, paymentRows || []);
            }

            return JSON.parse(JSON.stringify(invoiceFromRow(match)));
        },

        async findByUID(uid) {
            return this.findByLookup({ type: "uid", uid });
        },
    };
})();
