// Copyright (c) 2026, Waddah and contributors
// For license information, please see license.txt

// frappe.ui.form.on("WMN Settings", {
// 	refresh(frm) {

// 	},
// });
frappe.ui.form.on("WMN Settings", {
    refresh(frm) {
        frm.add_custom_button("Apply Settings", function () {
            reset_wmn_workspace_nav_cache(frm);

            frappe.show_alert({
                message: "Apply Settings",
                indicator: "green"
            });

            setTimeout(() => {
                window.location.reload();
            }, 700);
        });
    },

    after_save(frm) {
        reset_wmn_workspace_nav_cache(frm);

        frappe.show_alert({
            message: "Apply Settings",
            indicator: "green"
        });
    }
});


function reset_wmn_workspace_nav_cache(frm) {
    const SETTINGS_KEY = "wmn_workspace_nav_settings_v1";
    const LAST_CHECK_KEY = "wmn_workspace_nav_settings_last_check_v1";

    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(LAST_CHECK_KEY);

   
}