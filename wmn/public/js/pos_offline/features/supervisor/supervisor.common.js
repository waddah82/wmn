/*
 * WMNPOSSupervisor.js
 * Central supervisor authorization gateway for ERPNext POS.
 * Online verification is performed by the server.
 * Offline verification uses the same PBKDF2 hash cached during master-data preload.
 */
(function () {
    if (window.WMNPOSSupervisor) return;

    const ACTIONS = Object.freeze({
        ITEM_DISCOUNT: "ITEM_DISCOUNT",
        TRANSACTION_DISCOUNT: "TRANSACTION_DISCOUNT",
        CHANGE_RATE: "CHANGE_RATE",
        RETURN: "RETURN",
        CASH_IN: "CASH_IN",
        CASH_EXPENSE: "CASH_EXPENSE",
        CASH_WITHDRAWAL: "CASH_WITHDRAWAL",
    });

    const REQUIRE_FIELD = Object.freeze({
        [ACTIONS.ITEM_DISCOUNT]: "require_item_discount",
        [ACTIONS.TRANSACTION_DISCOUNT]: "require_transaction_discount",
        [ACTIONS.CHANGE_RATE]: "require_rate_change",
        [ACTIONS.RETURN]: "require_return",
        [ACTIONS.CASH_IN]: "require_cash_in",
        [ACTIONS.CASH_EXPENSE]: "require_cash_expense",
        [ACTIONS.CASH_WITHDRAWAL]: "require_cash_withdrawal",
    });

    const PERMISSION_FIELD = Object.freeze({
        [ACTIONS.ITEM_DISCOUNT]: "allow_item_discount",
        [ACTIONS.TRANSACTION_DISCOUNT]: "allow_transaction_discount",
        [ACTIONS.CHANGE_RATE]: "allow_rate_change",
        [ACTIONS.RETURN]: "allow_return",
        [ACTIONS.CASH_IN]: "allow_cash_in",
        [ACTIONS.CASH_EXPENSE]: "allow_cash_expense",
        [ACTIONS.CASH_WITHDRAWAL]: "allow_cash_withdrawal",
    });

    const ACTION_LABEL = Object.freeze({
        [ACTIONS.ITEM_DISCOUNT]: "Item Discount",
        [ACTIONS.TRANSACTION_DISCOUNT]: "Transaction Discount",
        [ACTIONS.CHANGE_RATE]: "Rate Change",
        [ACTIONS.RETURN]: "Return",
        [ACTIONS.CASH_IN]: "Cash In",
        [ACTIONS.CASH_EXPENSE]: "Cash Expense",
        [ACTIONS.CASH_WITHDRAWAL]: "Cash Withdrawal",
    });

    const state = {
        bundle: null,
        pos_profile: "",
        online_request: null,
        grants: new Map(),
        authorization_requests: new Map(),
    };

    function clone(value) {
        try {
            return JSON.parse(JSON.stringify(value || {}));
        } catch (e) {
            return value || {};
        }
    }

    function isOffline() {
        try {
            if (typeof wmn_controller_uses_offline_flow === "function" && window.cur_pos) {
                return !!wmn_controller_uses_offline_flow(window.cur_pos);
            }
        } catch (e) {}
        try {
            if (typeof wmn_is_pos_offline === "function") return !!wmn_is_pos_offline();
        } catch (e) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function normalizeBundle(bundle) {
        const source = clone(bundle || {});
        source.settings = source.settings || {};
        source.cashier_permissions = Array.isArray(source.cashier_permissions)
            ? source.cashier_permissions
            : [];
        source.supervisors = Array.isArray(source.supervisors) ? source.supervisors : [];
        return source;
    }

    function setBundle(bundle, posProfile) {
        state.bundle = normalizeBundle(bundle);
        state.pos_profile = String(posProfile || state.bundle.pos_profile || "");
        window.__wmn_pos_supervisor_bundle = state.bundle;
        return state.bundle;
    }

    async function loadOnline(posProfile, force) {
        const targetProfile = String(posProfile || "");
        if (!force && state.bundle && state.pos_profile === targetProfile) return state.bundle;
        if (!force && state.online_request) return state.online_request;

        const request = frappe.call({
            method: "wmn.api.get_pos_supervisor_bundle",
            args: { pos_profile: targetProfile },
            freeze: false,
        });

        state.online_request = Promise.resolve(request).then((response) =>
            setBundle(response && response.message ? response.message : {}, targetProfile)
        );

        try {
            return await state.online_request;
        } finally {
            state.online_request = null;
        }
    }

    async function loadOffline(posProfile) {
        let bundle = null;
        if (window.wmnPOSOffline && typeof window.wmnPOSOffline.getSupervisorBundle === "function") {
            bundle = await window.wmnPOSOffline.getSupervisorBundle();
        }
        return setBundle(bundle || {}, posProfile || bundle?.pos_profile || "");
    }

    async function bootstrap(ctrl, posProfile) {
        const profile = String(
            posProfile ||
            ctrl?.pos_profile ||
            ctrl?.settings?.pos_profile ||
            ctrl?.frm?.doc?.pos_profile ||
            ""
        );

        if (isOffline()) return loadOffline(profile);
        return loadOnline(profile, false);
    }

    function getBundleSync() {
        return state.bundle || normalizeBundle(window.__wmn_pos_supervisor_bundle || {});
    }

    function isEnabled() {
        const bundle = getBundleSync();
        return cint(bundle.settings?.enabled || 0) === 1;
    }

    function isActionRequired(action) {
        const bundle = getBundleSync();
        const fieldname = REQUIRE_FIELD[action];
        if (!fieldname || cint(bundle.settings?.enabled || 0) !== 1) return false;
        return cint(bundle.settings?.[fieldname] || 0) === 1;
    }


    function cashierMatchesProfile(permission, posProfile) {
        const configured = String(permission?.pos_profile || "").trim();
        if (!configured) return true;
        return configured === String(posProfile || "").trim();
    }

    function getCashierPermission(context) {
        const bundle = getBundleSync();
        const user = String(frappe.session?.user || "").trim();
        const posProfile = String(
            context?.pos_profile ||
            context?.doc?.pos_profile ||
            state.pos_profile ||
            ""
        ).trim();

        if (!user) return {};

        let globalPermission = null;
        for (const permission of bundle.cashier_permissions || []) {
            if (cint(permission?.enabled || 0) !== 1) continue;
            if (String(permission?.cashier_user || "").trim() !== user) continue;

            const configuredProfile = String(permission?.pos_profile || "").trim();
            if (configuredProfile && configuredProfile === posProfile) return permission;
            if (!configuredProfile && !globalPermission) globalPermission = permission;
        }
        return globalPermission || {};
    }

    function rateReductionPercentage(context) {
        const afterValue = flt(context?.after_value || 0);
        const reference = flt(
            context?.reference_value ??
            context?.price_list_rate ??
            context?.row?.price_list_rate ??
            context?.before_value ??
            0
        );
        if (reference <= 0 || afterValue >= reference) return 0;
        return Math.max(0, ((reference - afterValue) / reference) * 100);
    }

    function returnAmount(context) {
        const explicit = context?.return_amount;
        if (explicit !== undefined && explicit !== null && explicit !== "") {
            return Math.abs(flt(explicit || 0));
        }
        const doc = context?.doc || {};
        return Math.abs(flt(
            context?.after_value ??
            doc.rounded_total ??
            doc.grand_total ??
            0
        ));
    }

    function validateCashierPermission(action, context) {
        const permission = getCashierPermission(context);
        if (!permission || !permission.name || cint(permission.enabled || 0) !== 1) {
            return { ok: false, reason: "not_configured" };
        }

        const posProfile = context?.pos_profile || context?.doc?.pos_profile || state.pos_profile || "";
        if (!cashierMatchesProfile(permission, posProfile)) {
            return { ok: false, reason: "profile_mismatch" };
        }

        const hasAfterValue =
            context?.after_value !== undefined &&
            context?.after_value !== null &&
            context?.after_value !== "";
        const afterValue = Math.abs(flt(context?.after_value || 0));

        if (action === ACTIONS.ITEM_DISCOUNT) {
            if (cint(permission.allow_item_discount || 0) !== 1) {
                return { ok: false, reason: "cashier_not_allowed" };
            }
            const maximum = flt(permission.max_item_discount_percentage || 0);
            if (maximum > 0 && afterValue > maximum + 0.000001) {
                return {
                    ok: false,
                    reason: "cashier_limit_exceeded",
                    message: __("Cashier item discount limit is {0}%. Supervisor PIN is required.", [maximum]),
                };
            }
            return { ok: true, permission };
        }

        if (action === ACTIONS.TRANSACTION_DISCOUNT) {
            if (cint(permission.allow_transaction_discount || 0) !== 1) {
                return { ok: false, reason: "cashier_not_allowed" };
            }
            const maximum = flt(permission.max_transaction_discount_percentage || 0);
            if (maximum > 0 && afterValue > maximum + 0.000001) {
                return {
                    ok: false,
                    reason: "cashier_limit_exceeded",
                    message: __("Cashier transaction discount limit is {0}%. Supervisor PIN is required.", [maximum]),
                };
            }
            return { ok: true, permission };
        }

        if (action === ACTIONS.CHANGE_RATE) {
            if (cint(permission.allow_rate_change || 0) !== 1) {
                return { ok: false, reason: "cashier_not_allowed" };
            }
            if (!hasAfterValue) return { ok: true, permission };
            const maximum = flt(permission.max_rate_reduction_percentage || 0);
            const reduction = rateReductionPercentage(context);
            if (maximum > 0 && reduction > maximum + 0.000001) {
                return {
                    ok: false,
                    reason: "cashier_limit_exceeded",
                    message: __("Cashier rate reduction limit is {0}%. Supervisor PIN is required.", [maximum]),
                };
            }
            return { ok: true, permission, rate_reduction_percentage: reduction };
        }

        if (action === ACTIONS.RETURN) {
            if (cint(permission.allow_return || 0) !== 1) {
                return { ok: false, reason: "cashier_not_allowed" };
            }
            const maximum = flt(permission.max_return_amount || 0);
            const amount = returnAmount(context);
            if (maximum > 0 && amount > maximum + 0.000001) {
                return {
                    ok: false,
                    reason: "cashier_limit_exceeded",
                    message: __("Cashier return limit is {0}. Supervisor PIN is required.", [maximum]),
                };
            }
            return { ok: true, permission, return_amount: amount };
        }

        if ([ACTIONS.CASH_IN, ACTIONS.CASH_EXPENSE, ACTIONS.CASH_WITHDRAWAL].includes(action)) {
            const allowField = {
                [ACTIONS.CASH_IN]: "allow_cash_in",
                [ACTIONS.CASH_EXPENSE]: "allow_cash_expense",
                [ACTIONS.CASH_WITHDRAWAL]: "allow_cash_withdrawal",
            }[action];
            const limitField = {
                [ACTIONS.CASH_IN]: "max_cash_in_amount",
                [ACTIONS.CASH_EXPENSE]: "max_cash_expense_amount",
                [ACTIONS.CASH_WITHDRAWAL]: "max_cash_withdrawal_amount",
            }[action];
            if (cint(permission[allowField] || 0) !== 1) {
                return { ok: false, reason: "cashier_not_allowed" };
            }
            const amount = Math.abs(flt(context?.after_value || context?.amount || 0));
            const maximum = flt(permission[limitField] || 0);
            if (maximum > 0 && amount > maximum + 0.000001) {
                return {
                    ok: false,
                    reason: "cashier_limit_exceeded",
                    message: __("Cashier cash movement limit is {0}. Supervisor PIN is required.", [maximum]),
                };
            }
            return { ok: true, permission, amount };
        }

        return { ok: false, reason: "unknown_action" };
    }

    function makeCashierApproval(action, context, permission) {
        return {
            approved: true,
            required: false,
            source: "cashier",
            action,
            cashier_user: frappe.session?.user || permission?.cashier_user || "",
            cashier_permission: permission?.name || "",
            pos_profile: context?.pos_profile || context?.doc?.pos_profile || state.pos_profile || "",
        };
    }

    function supervisorMatchesProfile(supervisor, posProfile) {
        const configured = String(supervisor?.pos_profile || "").trim();
        if (!configured) return true;
        return configured === String(posProfile || "").trim();
    }

    function validateSupervisorPermission(supervisor, action, context) {
        if (!supervisor || cint(supervisor.enabled || 0) !== 1 || cint(supervisor.pin_configured || 0) !== 1) {
            return { ok: false, message: __("Supervisor is not enabled or does not have a PIN configured.") };
        }

        const permissionField = PERMISSION_FIELD[action];
        if (!permissionField || cint(supervisor[permissionField] || 0) !== 1) {
            return { ok: false, message: __("This supervisor is not permitted to approve this action.") };
        }

        const posProfile = context?.pos_profile || context?.doc?.pos_profile || state.pos_profile || "";
        if (!supervisorMatchesProfile(supervisor, posProfile)) {
            return { ok: false, message: __("This supervisor is not assigned to the current POS Profile.") };
        }

        const afterValue = Math.abs(flt(context?.after_value || 0));
        if (action === ACTIONS.ITEM_DISCOUNT) {
            const maximum = flt(supervisor.max_item_discount_percentage || 0);
            if (maximum > 0 && afterValue > maximum + 0.000001) {
                return {
                    ok: false,
                    message: __("Maximum item discount for this supervisor is {0}%.", [maximum]),
                };
            }
        }

        if (action === ACTIONS.TRANSACTION_DISCOUNT) {
            const maximum = flt(supervisor.max_transaction_discount_percentage || 0);
            if (maximum > 0 && afterValue > maximum + 0.000001) {
                return {
                    ok: false,
                    message: __("Maximum transaction discount for this supervisor is {0}%.", [maximum]),
                };
            }
        }

        if ([ACTIONS.CASH_IN, ACTIONS.CASH_EXPENSE, ACTIONS.CASH_WITHDRAWAL].includes(action)) {
            const limitField = {
                [ACTIONS.CASH_IN]: "max_cash_in_amount",
                [ACTIONS.CASH_EXPENSE]: "max_cash_expense_amount",
                [ACTIONS.CASH_WITHDRAWAL]: "max_cash_withdrawal_amount",
            }[action];
            const maximum = flt(supervisor[limitField] || 0);
            if (maximum > 0 && afterValue > maximum + 0.000001) {
                return {
                    ok: false,
                    message: __("Maximum cash movement amount for this supervisor is {0}.", [maximum]),
                };
            }
        }

        return { ok: true };
    }

    function decodeBase64(value) {
        const binary = atob(String(value || ""));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function encodeBase64(bytes) {
        let binary = "";
        const source = new Uint8Array(bytes);
        for (let i = 0; i < source.length; i++) binary += String.fromCharCode(source[i]);
        return btoa(binary);
    }

    async function derivePinHash(pin, saltBase64, iterations) {
        if (!window.crypto?.subtle) throw new Error(__("Secure PIN verification is not available in this browser."));
        const encoder = new TextEncoder();
        const key = await window.crypto.subtle.importKey(
            "raw",
            encoder.encode(String(pin || "")),
            { name: "PBKDF2" },
            false,
            ["deriveBits"]
        );
        const bits = await window.crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                hash: "SHA-256",
                salt: decodeBase64(saltBase64),
                iterations: Math.max(100000, cint(iterations || 200000)),
            },
            key,
            256
        );
        return encodeBase64(bits);
    }

    function constantTimeEqual(left, right) {
        const a = String(left || "");
        const b = String(right || "");
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return result === 0;
    }

    async function verifyOfflinePin(supervisor, pin) {
        if (!supervisor?.pin_salt || !supervisor?.pin_hash) return false;
        const derived = await derivePinHash(pin, supervisor.pin_salt, supervisor.pin_iterations);
        return constantTimeEqual(derived, supervisor.pin_hash);
    }

    function makeApproval(action, supervisor, context, reason) {
        const now = new Date().toISOString();
        return {
            approved: true,
            required: true,
            offline: isOffline(),
            action,
            supervisor_user: supervisor.supervisor_user || supervisor.name,
            cashier_user: frappe.session?.user || "",
            pos_profile: context?.pos_profile || context?.doc?.pos_profile || state.pos_profile || "",
            item_code: context?.item_code || "",
            row_name: context?.row_name || "",
            before_value: context?.before_value === undefined ? "" : String(context.before_value),
            after_value: context?.after_value === undefined ? "" : String(context.after_value),
            reason: String(reason || ""),
            approved_at: now,
            offline_approval_id: `SUP-OFF-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        };
    }

    function attachApproval(doc, approval) {
        if (!doc || !approval || !approval.approved || !approval.required || !approval.offline) return;
        doc.__wmn_supervisor_approvals = Array.isArray(doc.__wmn_supervisor_approvals)
            ? doc.__wmn_supervisor_approvals
            : [];

        const id = String(approval.offline_approval_id || "");
        if (id) {
            const existing = doc.__wmn_supervisor_approvals.find(
                (row) => String(row.offline_approval_id || "") === id
            );
            if (existing) {
                Object.assign(existing, clone(approval));
                return;
            }
        }
        doc.__wmn_supervisor_approvals.push(clone(approval));
    }

    function availableSupervisors(action, context) {
        const bundle = getBundleSync();
        return (bundle.supervisors || []).filter((supervisor) => validateSupervisorPermission(supervisor, action, context).ok);
    }

    function grantKey(action, context) {
        const doc = context?.doc || {};
        const invoiceKey = String(doc.name || doc.custom_offline_id || "");
        const rowKey = String(context?.row_name || "");
        return `${String(action || "").toUpperCase()}::${invoiceKey}::${rowKey}`;
    }

    function authorizationRequestKey(action, context) {
        const targetValue = context?.after_value === undefined ? "" : String(context.after_value);
        return `${grantKey(action, context)}::${targetValue}`;
    }

    function rememberGrant(action, context, approval) {
        if (!approval?.approved) return approval;
        state.grants.set(grantKey(action, context), {
            approval: clone(approval),
            expires_at: Date.now() + 120000,
        });
        return approval;
    }

    function getGrant(action, context) {
        const key = grantKey(action, context);
        const entry = state.grants.get(key);
        if (!entry) return null;
        if (Date.now() > Number(entry.expires_at || 0)) {
            state.grants.delete(key);
            return null;
        }
        return clone(entry.approval);
    }

    function hasGrant(action, context) {
        return !!getGrant(action, context);
    }

    function clearGrant(action, context) {
        state.grants.delete(grantKey(action, context));
    }

    function validateGrant(action, context) {
        const approval = getGrant(action, context);
        if (!approval) {
            return { ok: false, message: __("Authorization is required.") };
        }

        if (approval.source === "cashier") {
            const cashierPermission = validateCashierPermission(action, context);
            if (!cashierPermission.ok) {
                return {
                    ok: false,
                    message: cashierPermission.message || __("Supervisor authorization is required."),
                };
            }
            return { ok: true, approval, cashier_permission: cashierPermission.permission };
        }

        const bundle = getBundleSync();
        const supervisor = (bundle.supervisors || []).find((row) =>
            String(row.supervisor_user || row.name || "") === String(approval.supervisor_user || "")
        );
        const permission = validateSupervisorPermission(supervisor, action, context);
        if (!permission.ok) return permission;
        return { ok: true, approval, supervisor };
    }

    async function verifyOnline(supervisorUser, pin, action, context, reason) {
        const payload = {
            pos_profile: context?.pos_profile || context?.doc?.pos_profile || state.pos_profile || "",
            invoice_doctype: context?.doc?.doctype || "",
            invoice_name: context?.doc?.name || "",
            item_code: context?.item_code || "",
            row_name: context?.row_name || "",
            before_value: context?.before_value === undefined ? "" : String(context.before_value),
            after_value: context?.after_value === undefined ? "" : String(context.after_value),
            reason: String(reason || ""),
        };
        const response = await frappe.call({
            method: "wmn.api.verify_pos_supervisor_pin",
            args: {
                supervisor: supervisorUser,
                pin,
                action,
                context: JSON.stringify(payload),
            },
            freeze: false,
        });
        return response && response.message ? response.message : { approved: false };
    }

    async function authorize(action, context) {
        context = context || {};
        const ctrl = context.controller || window.cur_pos || null;
        context.doc = context.doc || ctrl?.frm?.doc || null;
        context.pos_profile = context.pos_profile || context.doc?.pos_profile || ctrl?.pos_profile || ctrl?.settings?.pos_profile || "";

        if (!state.bundle || state.pos_profile !== String(context.pos_profile || "")) {
            await bootstrap(ctrl, context.pos_profile);
        }

        if (!isActionRequired(action)) {
            return { approved: true, required: false, action };
        }

        if (context.reuse_grant) {
            const grantValidation = validateGrant(action, context);
            if (grantValidation.ok) {
                const reused = { ...grantValidation.approval, reused: true };
                if (context.before_value !== undefined) reused.before_value = String(context.before_value);
                if (context.after_value !== undefined) reused.after_value = String(context.after_value);
                if (reused.offline && reused.required && context.attach_to_doc !== false) {
                    attachApproval(context.doc, reused);
                }
                return reused;
            }
        }

        const cashierPermission = validateCashierPermission(action, context);
        if (cashierPermission.ok) {
            const direct = makeCashierApproval(action, context, cashierPermission.permission);
            if (context.create_grant) rememberGrant(action, context, direct);
            return direct;
        }

        const supervisors = availableSupervisors(action, context);
        if (!supervisors.length) {
            frappe.msgprint({
                title: __("Supervisor Authorization"),
                indicator: "red",
                message: __("No configured supervisor can approve this action for the current POS Profile."),
            });
            return { approved: false, required: true, action };
        }

        const requireReason = cint(getBundleSync().settings?.require_reason || 0) === 1;
        const options = supervisors.map((row) => row.supervisor_user || row.name).filter(Boolean);
        const label = __(ACTION_LABEL[action] || action);

        const requestKey = authorizationRequestKey(action, context);
        const existingRequest = state.authorization_requests.get(requestKey);
        if (existingRequest) return await existingRequest;

        const request = new Promise((resolve) => {
            let completed = false;
            const finish = (result) => {
                if (completed) return;
                completed = true;
                resolve(result || { approved: false, required: true, action });
            };

            const dialog = new frappe.ui.Dialog({
                title: __("Supervisor Authorization: {0}", [label]),
                static: false,
                fields: [
                    {
                        fieldname: "supervisor_user",
                        fieldtype: "Select",
                        label: __("Supervisor"),
                        options: options.join("\n"),
                        default: options[0] || "",
                        reqd: 1,
                    },
                    {
                        fieldname: "pin",
                        fieldtype: "Password",
                        label: __("Supervisor PIN"),
                        reqd: 1,
                    },
                    {
                        fieldname: "reason",
                        fieldtype: "Small Text",
                        label: __("Reason"),
                        reqd: requireReason ? 1 : 0,
                    },
                ],
                primary_action_label: __("Approve"),
                secondary_action_label: __("Close"),
                secondary_action: () => dialog.hide(),
                primary_action: async (values) => {
                    const supervisor = supervisors.find((row) =>
                        String(row.supervisor_user || row.name) === String(values.supervisor_user || "")
                    );
                    const permission = validateSupervisorPermission(supervisor, action, context);
                    if (!permission.ok) {
                        frappe.show_alert({ message: permission.message, indicator: "red" });
                        return;
                    }

                    try {
                        let approval;
                        if (isOffline()) {
                            const valid = await verifyOfflinePin(supervisor, values.pin);
                            if (!valid) {
                                frappe.show_alert({ message: __("Invalid supervisor PIN"), indicator: "red" });
                                return;
                            }
                            approval = makeApproval(action, supervisor, context, values.reason);
                            if (context.attach_to_doc !== false) attachApproval(context.doc, approval);
                        } else {
                            approval = await verifyOnline(
                                supervisor.supervisor_user || supervisor.name,
                                values.pin,
                                action,
                                context,
                                values.reason
                            );
                            if (!approval || !approval.approved) {
                                frappe.show_alert({ message: approval?.message || __("Supervisor authorization failed"), indicator: "red" });
                                return;
                            }
                        }

                        if (context.create_grant) rememberGrant(action, context, approval);
                        dialog.hide();
                        finish(approval);
                    } catch (e) {
                        frappe.show_alert({ message: e.message || String(e), indicator: "red" });
                    }
                },
            });

            window.WMN_POS?.UI?.Dialogs?.decorate?.(dialog, "wmn-pos-supervisor-dialog");
            dialog.$wrapper.on("hidden.bs.modal", () => finish({ approved: false, required: true, action }));
            dialog.show();
            setTimeout(() => dialog.fields_dict.pin?.set_focus?.(), 50);
        });

        state.authorization_requests.set(requestKey, request);
        try {
            return await request;
        } finally {
            if (state.authorization_requests.get(requestKey) === request) {
                state.authorization_requests.delete(requestKey);
            }
        }
    }

    window.WMNPOSSupervisor = {
        ACTIONS,
        bootstrap,
        loadOnline,
        loadOffline,
        authorize,
        attachApproval,
        isEnabled,
        isActionRequired,
        getBundle: getBundleSync,
        validateSupervisorPermission,
        validateCashierPermission,
        getCashierPermission,
        hasGrant,
        validateGrant,
        clearGrant,
    };
})();
