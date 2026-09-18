/* Offline adapter for cashier handoff draft persistence. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceHandoff = ns.Features.InvoiceHandoff || {};

    ns.Features.InvoiceHandoff.Offline = {
        async saveDraft(ctrl, doc) {
            const storage = window.wmnPOSOffline;
            if (!storage?.saveInvoice || !storage?.bulkPut || !storage?.STORES?.invoice_queue) {
                throw new Error("Offline invoice storage is not available");
            }

            const row = await storage.saveInvoice(doc, ctrl);
            row.queue_kind = "draft";
            row.status = "draft";
            row.last_error = "";
            row.invoice = row.invoice || doc;
            row.invoice.__wmn_saved_as_draft = true;
            row.invoice.docstatus = 0;

            await storage.bulkPut(storage.STORES.invoice_queue, [row]);
            if (typeof window.wmn_notify_offline_queue_changed === "function") {
                window.wmn_notify_offline_queue_changed();
            }
            return row.invoice;
        },
    };
})();
