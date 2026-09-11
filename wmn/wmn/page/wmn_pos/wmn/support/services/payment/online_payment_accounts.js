(function () {
    "use strict";

    const ns = window.WMN_POS = window.WMN_POS || {};
    ns.Services = ns.Services || {};
    ns.Services.Payment = ns.Services.Payment || {};

    const cache = new Map();

    function clean(value) {
        return String(value || "").trim();
    }

    function paymentAmount(row) {
        return Math.abs(flt(row?.amount || row?.base_amount || 0));
    }

    function addPaymentMethod(map, row) {
        const mode = clean(row?.mode_of_payment);
        if (!mode) return;
        const account = clean(row?.account || row?.default_account);
        const type = clean(row?.type);
        const existing = map.get(mode);
        if (existing) {
            if (!existing.account && account) existing.account = account;
            if (!existing.type && type) existing.type = type;
            return;
        }
        map.set(mode, {
            mode_of_payment: mode,
            account,
            type,
        });
    }

    function localPaymentMethodMap(doc, ctrl, payment) {
        const map = new Map();
        const sources = [
            ctrl?.settings?.payments,
            ctrl?.settings?.payment_methods,
            ctrl?.settings?.pos_profile?.payments,
            payment?.settings?.payments,
            payment?.settings?.payment_methods,
            doc?.payments,
        ];

        sources.forEach((rows) => {
            if (Array.isArray(rows)) {
                rows.forEach((row) => addPaymentMethod(map, row));
            }
        });

        return map;
    }

    async function setRowAccount(row, account) {
        account = clean(account);
        if (!row || !account || clean(row.account) === account) return;
        row.account = account;

        if (row.doctype && row.name && frappe?.model?.get_doc?.(row.doctype, row.name)) {
            try {
                await frappe.model.set_value(row.doctype, row.name, "account", account);
            } catch (error) {
                row.account = account;
                console.warn("WMN POS could not set payment account through frappe.model", error);
            }
        }
    }

    function cacheKey(posProfile, company, modes) {
        return [clean(posProfile), clean(company), modes.map(clean).sort().join("|")].join("::");
    }

    async function fetchPaymentMethods(posProfile, company, modes) {
        const key = cacheKey(posProfile, company, modes);
        if (cache.has(key)) return cache.get(key);

        const request = frappe.call({
            method: "wmn.wmn.page.wmn_pos.wmn_pos.get_pos_payment_method_accounts",
            args: {
                pos_profile: posProfile || "",
                company: company || "",
                modes,
            },
            freeze: false,
        }).then((response) => response.message || {});

        cache.set(key, request);
        try {
            return await request;
        } catch (error) {
            cache.delete(key);
            throw error;
        }
    }

    function missingActivePaymentRows(doc) {
        return (doc?.payments || []).filter((row) => (
            row &&
            clean(row.mode_of_payment) &&
            paymentAmount(row) > 0 &&
            !clean(row.account)
        ));
    }

    function showMissingAccountsMessage(rows, company) {
        const modes = rows.map((row) => clean(row.mode_of_payment)).filter(Boolean);
        frappe.msgprint({
            title: __("Payment Account Missing"),
            indicator: "red",
            message: __(
                "Please configure an account for Mode of Payment {0} in company {1} before submitting this invoice.",
                [modes.join(", "), company || __("the selected company")]
            ),
        });
    }

    async function ensureOnlineInvoicePaymentAccounts(doc, options = {}) {
        if (!doc || !Array.isArray(doc.payments) || !doc.payments.length) {
            return { ok: true, missing: [] };
        }

        const ctrl = options.controller || window.cur_pos || null;
        const payment = options.payment || ctrl?.payment || null;
        const posProfile = clean(doc.pos_profile || ctrl?.pos_profile || ctrl?.settings?.pos_profile);
        const company = clean(doc.company || ctrl?.company || ctrl?.settings?.company);
        const localMethods = localPaymentMethodMap(doc, ctrl, payment);

        for (const row of doc.payments || []) {
            const method = localMethods.get(clean(row?.mode_of_payment));
            if (method?.account) await setRowAccount(row, method.account);
        }

        let missing = missingActivePaymentRows(doc);
        if (missing.length) {
            const modes = Array.from(new Set((doc.payments || []).map((row) => clean(row?.mode_of_payment)).filter(Boolean)));
            if (modes.length) {
                const response = await fetchPaymentMethods(posProfile, company, modes);
                (response.payment_methods || []).forEach((row) => addPaymentMethod(localMethods, row));

                for (const row of doc.payments || []) {
                    const method = localMethods.get(clean(row?.mode_of_payment));
                    if (method?.account) await setRowAccount(row, method.account);
                }
            }
        }

        const changeAmount = flt(doc.change_amount || doc.base_change_amount || 0);
        if (changeAmount > 0 && !clean(doc.account_for_change_amount)) {
            const cashRow = (doc.payments || []).find((row) => clean(row.account) && paymentAmount(row) > 0);
            if (cashRow?.account) doc.account_for_change_amount = clean(cashRow.account);
        }

        missing = missingActivePaymentRows(doc);
        if (missing.length) {
            showMissingAccountsMessage(missing, company);
            return { ok: false, missing };
        }

        return { ok: true, missing: [] };
    }

    ns.Services.Payment.OnlineAccounts = {
        ensureOnlineInvoicePaymentAccounts,
    };
})();
