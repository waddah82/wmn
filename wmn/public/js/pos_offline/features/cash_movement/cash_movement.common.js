/*
 * WMNPOSCashMovement.js
 * POS shift cash movement UI. Online and offline use the same payload and
 * authorization gateway; offline stores the payload until the server can post it.
 */
(function () {
    if (window.WMNPOSCashMovement) return;

    const MOVEMENT_TYPES = Object.freeze({
        CASH_IN: "Cash In",
        CASH_EXPENSE: "Cash Expense",
        CASH_WITHDRAWAL: "Cash Withdrawal",
    });

    function isOffline(ctrl) {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && ctrl) {
                return !!wmn_controller_uses_offline_flow(ctrl);
            }
        } catch (e) {}
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function getPosProfile(ctrl) {
        return String(
            ctrl?.pos_profile ||
            ctrl?.settings?.pos_profile ||
            ctrl?.frm?.doc?.pos_profile ||
            ""
        ).trim();
    }

    function getPosOpeningEntry(ctrl) {
        const doc = ctrl?.frm?.doc || {};
        const settings = ctrl?.settings || {};
        return String(
            doc.pos_opening ||
            doc.pos_opening_entry ||
            doc.opening_entry ||
            settings.pos_opening ||
            settings.pos_opening_entry ||
            ctrl?.pos_opening ||
            ctrl?.opening_entry?.name ||
            ctrl?.pos_opening_entry?.name ||
            ""
        ).trim();
    }

    function escapeText(value) {
        const text = String(value ?? "");
        if (frappe.utils && typeof frappe.utils.escape_html === "function") return frappe.utils.escape_html(text);
        return text.replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    }

    function amountText(value, currency) {
        try {
            if (typeof format_currency === "function") return format_currency(flt(value || 0), currency || "");
        } catch (e) {}
        return `${flt(value || 0).toFixed(2)}${currency ? ` ${currency}` : ""}`;
    }

    function normalizeCashModes(config) {
        return (Array.isArray(config?.cash_modes) ? config.cash_modes : [])
            .map((row) => ({
                mode_of_payment: String(row?.mode_of_payment || "").trim(),
                account: String(row?.account || "").trim(),
                type: String(row?.type || "").trim(),
                default: cint(row?.default || 0),
            }))
            .filter((row) => row.mode_of_payment && row.account && row.type === "Cash");
    }

    function getDefaultCashMode(cashModes) {
        return cashModes.find((row) => cint(row.default || 0) === 1) || cashModes[0] || null;
    }

    function getCashMode(cashModes, modeOfPayment) {
        const target = String(modeOfPayment || "").trim();
        return cashModes.find((row) => row.mode_of_payment === target) || null;
    }

    function summaryHtml(summary, currency, pendingCount) {
        const data = summary || {};
        const byMode = data.by_mode_of_payment && typeof data.by_mode_of_payment === "object"
            ? Object.values(data.by_mode_of_payment)
            : [];
        const modeRows = byMode.length
            ? `
                <div style="grid-column:1/-1;margin-top:4px;border-top:1px solid var(--border-color);padding-top:8px;">
                    <strong>${__("By Mode of Payment")}</strong>
                    ${byMode.map((row) => `
                        <div style="display:flex;justify-content:space-between;gap:8px;margin-top:4px;">
                            <span>${escapeText(row.mode_of_payment || "")}</span>
                            <span>${escapeText(amountText(row.net_cash_movement, currency))}</span>
                        </div>`).join("")}
                </div>`
            : "";

        return `
            <div class="wmn-cash-movement-summary" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;padding:10px 0;">
                <div><strong>${__("Cash In")}</strong><br>${escapeText(amountText(data.cash_in, currency))}</div>
                <div><strong>${__("Cash Expense")}</strong><br>${escapeText(amountText(data.cash_expense, currency))}</div>
                <div><strong>${__("Cash Withdrawal")}</strong><br>${escapeText(amountText(data.cash_withdrawal, currency))}</div>
                <div><strong>${__("Net Cash Movement")}</strong><br>${escapeText(amountText(data.net_cash_movement, currency))}</div>
                ${modeRows}
                <div style="grid-column:1/-1"><strong>${__("Pending Offline")}</strong>: ${cint(pendingCount || 0)}</div>
            </div>`;
    }

    async function loadContext(ctrl) {
        const posProfile = getPosProfile(ctrl);
        const posOpeningEntry = getPosOpeningEntry(ctrl);
        if (!posProfile || !posOpeningEntry) {
            return { config: {}, summary: {}, pos_opening_entry: posOpeningEntry };
        }

        if (isOffline(ctrl)) {
            const cached = await window.wmnPOSOffline?.getCashMovementContext?.() || {};
            const summary = await window.wmnPOSOffline?.getCashMovementSummary?.(posOpeningEntry) || cached.summary || {};
            return Object.assign({}, cached, { summary, pos_opening_entry: posOpeningEntry });
        }

        if (window.wmnPOSOffline?.syncCashMovements) {
            await window.wmnPOSOffline.syncCashMovements();
        }

        const response = await frappe.call({
            method: "wmn.api.get_pos_cash_movement_context",
            args: {
                pos_profile: posProfile,
                pos_opening_entry: posOpeningEntry,
            },
            freeze: false,
        });
        const context = response?.message || {};
        if (window.wmnPOSOffline?.setSetting) {
            await window.wmnPOSOffline.setSetting("cash_movement_context", context);
            await window.wmnPOSOffline.setSetting("cash_movement_summary", context.summary || {});
        }
        return context;
    }

    function actionForType(movementType) {
        const actions = window.WMNPOSSupervisor?.ACTIONS || {};
        if (movementType === MOVEMENT_TYPES.CASH_IN) return actions.CASH_IN || "CASH_IN";
        if (movementType === MOVEMENT_TYPES.CASH_EXPENSE) return actions.CASH_EXPENSE || "CASH_EXPENSE";
        return actions.CASH_WITHDRAWAL || "CASH_WITHDRAWAL";
    }

    async function getPendingCount() {
        try {
            const rows = await window.wmnPOSOffline?.getPendingCashMovements?.();
            return Array.isArray(rows) ? rows.length : 0;
        } catch (e) {
            return 0;
        }
    }

    async function postMovement(ctrl, values, context) {
        const amount = Math.abs(flt(values.amount || 0));
        if (amount <= 0) {
            frappe.show_alert({ message: __("Amount must be greater than zero"), indicator: "red" });
            return null;
        }

        const reason = String(values.reason || "").trim();
        if (!reason) {
            frappe.show_alert({ message: __("Reason is required"), indicator: "red" });
            return null;
        }

        const movementType = values.movement_type;
        const posProfile = getPosProfile(ctrl);
        const posOpeningEntry = getPosOpeningEntry(ctrl);
        const cashModes = normalizeCashModes(context?.config || {});
        const selectedCashMode = getCashMode(cashModes, values.mode_of_payment);
        if (!selectedCashMode) {
            frappe.show_alert({ message: __("Select a valid Cash Mode of Payment"), indicator: "red" });
            return null;
        }

        const action = actionForType(movementType);
        let approval = { approved: true, required: false, action };
        if (window.WMNPOSSupervisor?.authorize) {
            approval = await window.WMNPOSSupervisor.authorize(action, {
                controller: ctrl,
                doc: { doctype: "WMN POS Cash Movement", name: "", pos_profile: posProfile },
                pos_profile: posProfile,
                after_value: amount,
                amount,
                attach_to_doc: false,
                create_grant: false,
            });
        }
        if (!approval?.approved) return null;

        const now = frappe.datetime.now_datetime();
        const parts = String(now || "").split(" ");
        const payload = {
            movement_type: movementType,
            mode_of_payment: selectedCashMode.mode_of_payment,
            cash_account: selectedCashMode.account,
            amount,
            reason,
            reference_no: String(values.reference_no || "").trim(),
            pos_profile: posProfile,
            pos_opening_entry: posOpeningEntry,
            cashier_user: frappe.session?.user || "",
            posting_date: parts[0] || frappe.datetime.get_today(),
            posting_time: parts[1] || "00:00:00",
            created_at: new Date().toISOString(),
            offline_id: `POS-CASH-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            supervisor_approval: approval?.required ? approval : null,
        };

        if (isOffline(ctrl)) {
            const row = await window.wmnPOSOffline.saveCashMovement(payload);
            frappe.show_alert({ message: __("Cash movement saved offline and queued for sync"), indicator: "orange" });
            return { offline: true, row, summary: await window.wmnPOSOffline.getCashMovementSummary(posOpeningEntry) };
        }

        const response = await frappe.call({
            method: "wmn.api.create_pos_cash_movement",
            args: { movement: payload },
            freeze: true,
            freeze_message: __("Posting cash movement..."),
        });
        const result = response?.message || {};
        if (result.summary && window.wmnPOSOffline?.setSetting) {
            await window.wmnPOSOffline.setSetting("cash_movement_summary", result.summary);
        }
        frappe.show_alert({
            message: __("Cash movement posted: {0}", [result.name || payload.offline_id]),
            indicator: "green",
        });
        return result;
    }

    async function openDialog(ctrl) {
        ctrl = ctrl || window.cur_pos;
        if (!ctrl) return;

        const posOpeningEntry = getPosOpeningEntry(ctrl);
        if (!posOpeningEntry) {
            frappe.msgprint({
                title: __("Cash Movement"),
                indicator: "red",
                message: __("An open POS Opening Entry is required before recording a cash movement."),
            });
            return;
        }

        let context;
        try {
            context = await loadContext(ctrl);
        } catch (e) {
            frappe.msgprint({
                title: __("Cash Movement"),
                indicator: "red",
                message: e.message || String(e),
            });
            return;
        }

        const config = context?.config || {};
        if (cint(config.enabled || 0) !== 1) {
            frappe.msgprint({
                title: __("Cash Movement"),
                indicator: "orange",
                message: __("Configure WMN POS Cash Movement Profile for POS Profile {0} first.", [getPosProfile(ctrl)]),
            });
            return;
        }

        const cashModes = normalizeCashModes(config);
        if (!cashModes.length) {
            frappe.msgprint({
                title: __("Cash Movement"),
                indicator: "orange",
                message: __("POS Profile {0} has no enabled Cash Mode of Payment with a default account for this Company.", [getPosProfile(ctrl)]),
            });
            return;
        }

        const defaultCashMode = getDefaultCashMode(cashModes);
        const pendingCount = await getPendingCount();
        let dialog;
        dialog = new frappe.ui.Dialog({
            title: __("Cash Movement"),
            fields: [
                {
                    fieldname: "summary_html",
                    fieldtype: "HTML",
                    options: summaryHtml(context.summary || {}, config.currency || "", pendingCount),
                },
                {
                    fieldname: "movement_type",
                    fieldtype: "Select",
                    label: __("Movement Type"),
                    options: [MOVEMENT_TYPES.CASH_IN, MOVEMENT_TYPES.CASH_EXPENSE, MOVEMENT_TYPES.CASH_WITHDRAWAL].join("\n"),
                    default: MOVEMENT_TYPES.CASH_EXPENSE,
                    reqd: 1,
                },
                {
                    fieldname: "mode_of_payment",
                    fieldtype: "Select",
                    label: __("Mode of Payment"),
                    options: cashModes.map((row) => row.mode_of_payment).join("\n"),
                    default: defaultCashMode?.mode_of_payment || "",
                    reqd: 1,
                },
                {
                    fieldname: "cash_account",
                    fieldtype: "Data",
                    label: __("Cash Account"),
                    default: defaultCashMode?.account || "",
                    read_only: 1,
                },
                {
                    fieldname: "currency",
                    fieldtype: "Data",
                    label: __("Currency"),
                    default: config.currency || "",
                    read_only: 1,
                    hidden: 1,
                },
                {
                    fieldname: "amount",
                    fieldtype: "Currency",
                    label: __("Amount"),
                    options: "currency",
                    reqd: 1,
                },
                {
                    fieldname: "reason",
                    fieldtype: "Small Text",
                    label: __("Reason"),
                    reqd: 1,
                },
                {
                    fieldname: "reference_no",
                    fieldtype: "Data",
                    label: __("Reference"),
                },
            ],
            primary_action_label: isOffline(ctrl) ? __("Save Offline") : __("Post Movement"),
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
            primary_action: async (values) => {
                const button = dialog.get_primary_btn();
                button.prop("disabled", true);
                try {
                    const result = await postMovement(ctrl, values, context);
                    if (result) dialog.hide();
                } catch (e) {
                    frappe.msgprint({
                        title: __("Cash Movement"),
                        indicator: "red",
                        message: e.message || String(e),
                    });
                } finally {
                    button.prop("disabled", false);
                }
            },
        });
        window.WMN_POS?.UI?.Dialogs?.decorate?.(dialog, "wmn-pos-cash-dialog");
        dialog.fields_dict.mode_of_payment.df.onchange = () => {
            const selected = getCashMode(cashModes, dialog.get_value("mode_of_payment"));
            dialog.set_value("cash_account", selected?.account || "");
        };
        dialog.show();
        setTimeout(() => dialog.fields_dict.amount?.set_focus?.(), 50);
    }

    window.WMNPOSCashMovement = {
        MOVEMENT_TYPES,
        loadContext,
        openDialog,
        postMovement,
    };
})();
