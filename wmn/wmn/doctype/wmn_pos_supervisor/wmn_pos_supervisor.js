frappe.ui.form.on("WMN POS Supervisor", {
    refresh(frm) {
        if (frm.is_new()) return;

        frm.add_custom_button(__("Set / Change PIN"), () => {
            const dialog = new frappe.ui.Dialog({
                title: __("Set Supervisor PIN"),
                fields: [
                    {
                        fieldname: "pin",
                        fieldtype: "Password",
                        label: __("PIN"),
                        reqd: 1,
                    },
                    {
                        fieldname: "confirm_pin",
                        fieldtype: "Password",
                        label: __("Confirm PIN"),
                        reqd: 1,
                    },
                ],
                primary_action_label: __("Save PIN"),
                primary_action: async (values) => {
                    if (String(values.pin || "") !== String(values.confirm_pin || "")) {
                        frappe.msgprint(__("PIN and confirmation do not match."));
                        return;
                    }

                    const response = await frappe.call({
                        method: "wmn.api.set_pos_supervisor_pin",
                        args: {
                            supervisor: frm.doc.name,
                            pin: values.pin,
                        },
                        freeze: true,
                        freeze_message: __("Saving supervisor PIN..."),
                    });

                    if (response && response.message && response.message.ok) {
                        dialog.hide();
                        await frm.reload_doc();
                        frappe.show_alert({
                            message: __("Supervisor PIN updated"),
                            indicator: "green",
                        });
                    }
                },
            });
            dialog.show();
        });
    },
});
