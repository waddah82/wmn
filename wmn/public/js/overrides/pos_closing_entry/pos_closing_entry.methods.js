(() => {
    "use strict";

    if (window.WMNPOSClosingEntryMethods) return;

    const TABLE_FIELDS = ["wmn_sales_invoices", "wmn_cash_movements"];
    const TOTAL_FIELDS = ["grand_total", "net_total", "total_quantity"];

    function hasRequiredContext(frm) {
        const doc = frm && frm.doc;
        return Boolean(
            doc &&
            doc.pos_opening_entry &&
            doc.period_start_date &&
            doc.period_end_date &&
            doc.pos_profile &&
            doc.user &&
            doc.company
        );
    }

    function setChildTable(frm, fieldname, rows) {
        if (!frm.fields_dict[fieldname]) return;
        if (typeof frm.clear_table === "function") {
            frm.clear_table(fieldname);
        } else {
            frm.doc[fieldname] = [];
        }
        (rows || []).forEach((row) => frm.add_child(fieldname, row));
        frm.refresh_field(fieldname);
    }

    function setScalar(frm, fieldname, value) {
        if (!frm.fields_dict[fieldname]) return;
        frm.doc[fieldname] = value;
        frm.refresh_field(fieldname);
    }

    function applySnapshot(frm, snapshot, options = {}) {
        if (!snapshot) return;

        TABLE_FIELDS.forEach((fieldname) => {
            setChildTable(frm, fieldname, snapshot[fieldname] || []);
        });

        if (!options.applyFinancials) return;

        setChildTable(frm, "payment_reconciliation", snapshot.payment_reconciliation || []);
        setChildTable(frm, "taxes", snapshot.taxes || []);
        TOTAL_FIELDS.forEach((fieldname) => setScalar(frm, fieldname, snapshot[fieldname] || 0));
    }

    async function refreshSnapshot(frm, options = {}) {
        if (!hasRequiredContext(frm) || frm.doc.docstatus !== 0) return;
        if (frm.__wmn_closing_refresh_inflight) return frm.__wmn_closing_refresh_inflight;

        const request = frm.call("get_wmn_closing_snapshot", {
            initialize_closing_amounts: options.initializeClosingAmounts ? 1 : 0,
        });

        frm.__wmn_closing_refresh_inflight = request.then(
            (response) => {
                frm.__wmn_closing_refresh_inflight = null;
                applySnapshot(frm, response && response.message, options);
                return response && response.message;
            },
            (error) => {
                frm.__wmn_closing_refresh_inflight = null;
                throw error;
            }
        );

        return frm.__wmn_closing_refresh_inflight;
    }

    function refreshAfterNativeLoad(frm) {
        if (!hasRequiredContext(frm) || frm.doc.docstatus !== 0) return;
        frappe.after_ajax(() => {
            refreshSnapshot(frm, {
                applyFinancials: true,
                initializeClosingAmounts: !frm.__wmn_closing_initialized,
            }).then(() => {
                frm.__wmn_closing_initialized = true;
            });
        });
    }

    window.WMNPOSClosingEntryMethods = {
        refreshAfterNativeLoad,
        beforeSave(frm) {
            return refreshSnapshot(frm, {
                applyFinancials: true,
                initializeClosingAmounts: false,
            });
        },
    };
})();
