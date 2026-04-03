// Copyright (c) 2026, waddah and contributors
// For license information, please see license.txt

// frappe.ui.form.on("Payable", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on('Payable', {
    refresh: function(frm) {
        frm.set_query('account', function() {
            return {
                filters: {
                    'account_type': 'Payable',
                    'is_group': 0, 
                    'company': frm.doc.company 
                }
            };
        });
    }
});
