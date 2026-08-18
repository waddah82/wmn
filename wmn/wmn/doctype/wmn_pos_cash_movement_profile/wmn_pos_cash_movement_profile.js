frappe.ui.form.on("WMN POS Cash Movement Profile", {
    setup(frm) {
        frm.set_query("cash_in_offset_account", () => ({
            filters: {
                company: frm.doc.company || "",
                is_group: 0,
                account_type: ["not in", ["Receivable", "Payable"]],
            },
        }));

        frm.set_query("default_expense_account", () => ({
            filters: {
                company: frm.doc.company || "",
                is_group: 0,
                root_type: "Expense",
                account_type: ["not in", ["Receivable", "Payable"]],
            },
        }));

        frm.set_query("withdrawal_offset_account", () => ({
            filters: {
                company: frm.doc.company || "",
                is_group: 0,
                account_type: ["not in", ["Receivable", "Payable"]],
            },
        }));

        frm.set_query("cost_center", () => ({
            filters: {
                company: frm.doc.company || "",
                is_group: 0,
            },
        }));
    },
});
