/* Invoice barcode feature facade. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceBarcode = ns.Features.InvoiceBarcode || {};

    function isOffline() {
        try {
            if (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) return true;
            if (window.__wmn_pos_effective_offline === true) return true;
            return navigator.onLine === false;
        } catch (e) {
            return navigator.onLine === false;
        }
    }

    function openInvoiceDocument(doc) {
        if (!doc) return false;
        const ctrl = window.cur_pos;
        if (!ctrl?.order_summary?.load_summary_of) {
            throw new Error("WMN POS order summary is not available");
        }

        if (typeof ctrl.toggle_recent_order_list === "function") {
            ctrl.toggle_recent_order_list(true);
        }
        ctrl.order_summary.load_summary_of(doc, false);
        return true;
    }

    async function findByBarcode(value) {
        const service = ns.Services?.Barcode?.InvoiceBarcode;
        const lookup = service?.parseLookup?.(value) || null;
        if (!lookup) {
            return { handled: false, lookup: null, uid: "", doc: null };
        }

        const adapter = isOffline()
            ? ns.Features.InvoiceBarcode.Offline
            : ns.Features.InvoiceBarcode.Online;

        if (!adapter?.findByLookup) {
            throw new Error("WMN invoice barcode adapter is not available");
        }

        const doc = await adapter.findByLookup(lookup);
        return {
            handled: true,
            lookup,
            uid: lookup.type === "uid" ? lookup.uid : "",
            doc: doc || null,
        };
    }

    async function handleScan(value) {
        const result = await findByBarcode(value);
        if (!result.handled) return false;
        if (!result.doc) {
            frappe.show_alert({
                message: __("Invoice barcode was not found"),
                indicator: "orange",
            });
            return true;
        }

        openInvoiceDocument(result.doc);
        frappe.show_alert({
            message: __("Invoice {0} opened", [result.doc.name || result.doc.wmn_receipt_no || result.uid || String(value || "")]),
            indicator: "green",
        });
        return true;
    }

    ns.Features.InvoiceBarcode.Common = {
        isOffline,
        isInvoiceBarcode(value) {
            return !!ns.Services?.Barcode?.InvoiceBarcode?.isInvoiceBarcode?.(value);
        },
        ensureInvoiceUID(doc) {
            return ns.Services?.Barcode?.InvoiceBarcode?.ensureInvoiceUID?.(doc) || "";
        },
        openInvoiceDocument,
        findByBarcode,
        handleScan,
    };
})();
