(() => {
    "use strict";

    function hasContext(frm) {
        const doc = frm?.doc;
        return Boolean(
            doc &&
            doc.docstatus === 0 &&
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
        frm.clear_table(fieldname);
        (rows || []).forEach((row) => frm.add_child(fieldname, row));
        frm.refresh_field(fieldname);
    }

    async function refreshCashMovementSnapshot(frm, { initializeClosingAmounts = false } = {}) {
        if (!hasContext(frm)) return;
        if (frm.__wmn_cash_movement_closing_inflight) return frm.__wmn_cash_movement_closing_inflight;

        const request = frappe.call({
            method: "wmn.features.cash_movement.pos_closing.get_cash_movement_closing_snapshot",
            args: {
                doc: JSON.stringify(frm.doc),
                initialize_closing_amounts: initializeClosingAmounts ? 1 : 0,
            },
            freeze: false,
        });

        frm.__wmn_cash_movement_closing_inflight = request.then(
            (response) => {
                const snapshot = response?.message || {};
                setChildTable(frm, "payment_reconciliation", snapshot.payment_reconciliation || []);
                setChildTable(frm, "wmn_cash_movements", snapshot.wmn_cash_movements || []);
                return snapshot;
            }
        ).finally(() => {
            frm.__wmn_cash_movement_closing_inflight = null;
        });

        return frm.__wmn_cash_movement_closing_inflight;
    }

    function refreshAfterNativeLoad(frm) {
        if (!hasContext(frm)) return;
        frappe.after_ajax(() => {
            refreshCashMovementSnapshot(frm, {
                initializeClosingAmounts: !frm.__wmn_cash_movement_closing_initialized,
            }).then(() => {
                frm.__wmn_cash_movement_closing_initialized = true;
            }).catch((error) => {
                console.error("WMN cash movement closing refresh failed", error);
            });
        });
    }

    frappe.ui.form.on("POS Closing Entry", {
        pos_opening_entry(frm) {
            frm.__wmn_cash_movement_closing_initialized = false;
            refreshAfterNativeLoad(frm);
        },

        period_end_date(frm) {
            refreshAfterNativeLoad(frm);
        },

        before_save(frm) {
            return refreshCashMovementSnapshot(frm, { initializeClosingAmounts: false });
        },
    });
})();
