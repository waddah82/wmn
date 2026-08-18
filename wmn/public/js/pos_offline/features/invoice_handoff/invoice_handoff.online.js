/* Online adapter for cashier handoff draft persistence. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.InvoiceHandoff = ns.Features.InvoiceHandoff || {};

    ns.Features.InvoiceHandoff.Online = {
        async saveDraft(ctrl, doc) {
            if (!ctrl?.frm?.save) throw new Error("POS form save is not available");

            const stageField = ns.Features.InvoiceHandoff.Common?.STAGE_FIELD || "wmn_pos_stage";
            if (window.frappe?.meta?.get_field && !frappe.meta.get_field(doc.doctype, stageField)) {
                throw new Error("WMN cashier handoff fields are missing. Run bench migrate.");
            }

            ctrl.frm.dirty?.();
            await ctrl.frm.save();
            const saved = ctrl.frm.doc || doc;
            if (cint(saved.docstatus || 0) !== 0) {
                throw new Error("Cashier handoff must remain a Draft invoice");
            }
            return saved;
        },
    };
})();
