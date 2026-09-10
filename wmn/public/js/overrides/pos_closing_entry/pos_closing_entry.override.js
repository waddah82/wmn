(() => {
    "use strict";

    const methodsPath = "/assets/wmn/js/overrides/pos_closing_entry/pos_closing_entry.methods.js";

    function withMethods(callback) {
        if (window.WMNPOSClosingEntryMethods) {
            return Promise.resolve(callback(window.WMNPOSClosingEntryMethods));
        }
        return new Promise((resolve, reject) => {
            frappe.require(methodsPath, () => {
                try {
                    resolve(callback(window.WMNPOSClosingEntryMethods));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    frappe.ui.form.on("POS Closing Entry", {
        pos_opening_entry(frm) {
            frm.__wmn_closing_initialized = false;
            return withMethods((methods) => methods.refreshAfterNativeLoad(frm));
        },

        period_end_date(frm) {
            return withMethods((methods) => methods.refreshAfterNativeLoad(frm));
        },

        before_save(frm) {
            return withMethods((methods) => methods.beforeSave(frm));
        },
    });
})();
