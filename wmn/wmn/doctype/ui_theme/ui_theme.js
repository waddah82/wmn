// Copyright (c) 2026, Shams Solutions and contributors
// For license information, please see license.txt

frappe.ui.form.on('UI Theme', {
    refresh(frm) {
        // If this theme is currently active, allow the administrator to
        // re-apply its latest CSS immediately without refreshing the page.
        if (!frm.is_new()) {
            frm.add_custom_button(__('Apply Theme Now'), async () => {
                if (window.ShamsTheme && window.ShamsTheme.refresh) {
                    await window.ShamsTheme.refresh(true);
                } else {
                    frappe.show_alert({
                        message: __('Theme manager is not loaded yet.'),
                        indicator: 'orange'
                    });
                }
            });
        }
    },

    after_save(frm) {
        // Refresh only if the saved theme is the active theme.
        if (!window.ShamsTheme || !window.ShamsTheme.refreshIfActive) {
            return;
        }

        window.ShamsTheme.refreshIfActive(frm.doc.name);
    }
});
