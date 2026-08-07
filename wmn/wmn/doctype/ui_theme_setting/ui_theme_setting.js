// Copyright (c) 2026, Shams Solutions and contributors
// For license information, please see license.txt

frappe.ui.form.on('UI Theme Setting', {
    refresh(frm) {
        frm.toggle_reqd('active_theme', !!frm.doc.enable_themes);

        frm.add_custom_button(__('Apply CSS Now'), async () => {
            if (window.ShamsTheme && window.ShamsTheme.refresh) {
                await window.ShamsTheme.refresh(true);
            } else {
                frappe.show_alert({
                    message: __('Theme manager is not loaded yet.'),
                    indicator: 'orange'
                });
            }
        });
    },

    enable_themes(frm) {
        frm.toggle_reqd('active_theme', !!frm.doc.enable_themes);
    },

    after_save() {
        // Rebuild and apply: Fixed CSS + (Active Theme CSS when enabled).
        if (window.ShamsTheme && window.ShamsTheme.refresh) {
            window.ShamsTheme.refresh(true);
        }
    }
});
