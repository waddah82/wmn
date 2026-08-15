/* POS shift receipt-number allocation and synchronization. */
        function wmn_get_current_pos_opening_name(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const pos = window.cur_pos || {};

            return String(
                doc.pos_opening ||
                doc.pos_opening_entry ||
                doc.opening_entry ||
                settings.pos_opening ||
                settings.pos_opening_entry ||
                pos.pos_opening ||
                (pos.opening_entry && pos.opening_entry.name) ||
                (pos.pos_opening_entry && pos.pos_opening_entry.name) ||
                ""
            ).trim();
        }

        function wmn_get_current_receipt_shift_key(doc) {
            doc = doc || {};
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const opening =
                wmn_get_current_pos_opening_name(doc) ||
                settings.pos_profile ||
                doc.pos_profile ||
                "DEFAULT_SHIFT";

            return "wmn_receipt_counter::" + String(opening || "DEFAULT_SHIFT");
        }

        async function wmn_assign_receipt_number(doc) {
            if (!doc) return "";

            if (doc.wmn_receipt_no || doc.__wmn_receipt_no) {
                doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no;
                doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no;
                return doc.wmn_receipt_no;
            }

            const key = wmn_get_current_receipt_shift_key(doc);
            let localCounter = 0;
            let serverCounter = 0;

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                    localCounter = cint(await window.wmnPOSOffline.getSetting(key) || 0);
                } else {
                    localCounter = cint(localStorage.getItem(key) || 0);
                }
            } catch (e) {
                localCounter = cint(localStorage.getItem(key) || 0);
            }

            const shiftName = wmn_get_current_pos_opening_name(doc);

            try {
                if (!wmn_is_pos_offline() && shiftName) {
                    const r = await frappe.call({
                        method: "wmn.api.get_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || ""
                        },
                        freeze: false
                    });
                    serverCounter = cint((r.message && r.message.counter) || r.message || 0);
                }
            } catch (e) {
                console.warn("WMN receipt counter server read skipped", e);
            }

            const nextCounter = Math.max(localCounter, serverCounter) + 1;

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.setSetting) {
                    await window.wmnPOSOffline.setSetting(key, nextCounter);
                } else {
                    localStorage.setItem(key, String(nextCounter));
                }
            } catch (e) {
                localStorage.setItem(key, String(nextCounter));
            }

            try {
                if (!wmn_is_pos_offline() && shiftName) {
                    await frappe.call({
                        method: "wmn.api.update_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || "",
                            counter: nextCounter
                        },
                        freeze: false
                    });
                }
            } catch (e) {
                console.warn("WMN receipt counter server update skipped", e);
            }

            const receiptNo = String(nextCounter).padStart(5, "0");
            doc.wmn_receipt_no = receiptNo;
            doc.__wmn_receipt_no = receiptNo;
            return receiptNo;
        }


        async function wmn_sync_receipt_counter_on_page_load() {
            try {
                const doc = (window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc) || {};
                const key = wmn_get_current_receipt_shift_key(doc);
                const shiftName = wmn_get_current_pos_opening_name(doc);

                let localCounter = 0;
                try {
                    if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                        localCounter = cint(await window.wmnPOSOffline.getSetting(key) || 0);
                    } else {
                        localCounter = cint(localStorage.getItem(key) || 0);
                    }
                } catch (e) {
                    localCounter = cint(localStorage.getItem(key) || 0);
                }

                let serverCounter = 0;
                if (!wmn_is_pos_offline() && shiftName) {
                    const r = await frappe.call({
                        method: "wmn.api.get_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || ""
                        },
                        freeze: false
                    });
                    serverCounter = cint((r.message && r.message.counter) || r.message || 0);
                }

                const finalCounter = Math.max(localCounter, serverCounter);

                if (window.wmnPOSOffline && window.wmnPOSOffline.setSetting) {
                    await window.wmnPOSOffline.setSetting(key, finalCounter);
                } else {
                    localStorage.setItem(key, String(finalCounter));
                }

                if (!wmn_is_pos_offline() && shiftName && finalCounter > serverCounter) {
                    await frappe.call({
                        method: "wmn.api.update_pos_shift_receipt_counter",
                        args: {
                            pos_opening_entry: shiftName,
                            pos_profile: doc.pos_profile || "",
                            company: doc.company || "",
                            counter: finalCounter
                        },
                        freeze: false
                    });
                }

                console.log("WMN receipt counter synced", { localCounter, serverCounter, finalCounter });
                return finalCounter;
            } catch (e) {
                console.warn("WMN receipt counter page-load sync skipped", e);
                return 0;
            }
        }

