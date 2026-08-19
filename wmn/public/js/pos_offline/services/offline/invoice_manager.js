/* Offline invoice queue manager UI and sync commands. */
        async function wmn_restore_offline_available_qty_for_doc(doc) {
            return await wmn_apply_offline_available_qty_delta({}, doc || {});
        }

function wmn_init_offline_invoice_manager_dialog(pos) {
            if (!window.wmnPOSOffline || window.wmnPOSOffline.__wmn_invoice_manager_dialog_v5) return;

            let syncAllRunning = false;

            async function deleteInvoiceQueueRow(row) {
                if (!row) return;

                try {
                    const doc = getInvoiceDoc(row);
                    if (doc && typeof wmn_restore_offline_available_qty_for_doc === "function") {
                        await wmn_restore_offline_available_qty_for_doc(doc);
                    }

                    if (window.cur_pos?.item_selector && typeof window.cur_pos.item_selector.wmn_refresh_available_stock === "function") {
                        await window.cur_pos.item_selector.wmn_refresh_available_stock();
                    }
                } catch (e) {
                    console.warn("WMN offline stock restore on delete skipped", e);
                }

                const db = await window.wmnPOSOffline.openDB();
                const tx = db.transaction(window.wmnPOSOffline.STORES.invoice_queue, "readwrite");
                const store = tx.objectStore(window.wmnPOSOffline.STORES.invoice_queue);

                const key = row.offline_id || row.id || row.name;
                if (key) {
                    store.delete(key);
                }

                await new Promise((resolve, reject) => {
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                    tx.onabort = () => reject(tx.error);
                });

                wmn_notify_offline_queue_changed();
            }

            function getInvoiceDoc(row) {
                return row && (row.doc || row.invoice || row.data || row);
            }

            function rowStatus(row) {
                const status = String(row.status || "").toLowerCase();
                const doc = getInvoiceDoc(row) || {};
                const queueKind = String(row.queue_kind || "").toLowerCase();
                const stage = String(doc.wmn_pos_stage || "").trim();
                const isDraft = queueKind === "draft" || stage === "AWAITING_CASHIER";

                if (isDraft && (row.erpnext_name || row.server_name || status === "draft_synced")) {
                    return "draft_synced";
                }
                if (row.erpnext_name || row.server_name || row.synced || row.synced_at || status === "synced" || status === "submitted" || status === "success") {
                    return "synced";
                }
                if (status === "error" || status === "failed") return "error";
                return status || "pending";
            }

            function statusBadge(status) {
                const map = {
                    synced: ["green", wmn_t("Synced", "\u062A\u0645\u062A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629")],
                    draft_synced: ["blue", wmn_t("Draft Synced", "\u062A\u0645\u062A \u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0645\u0633\u0648\u062F\u0629")],
                    pending: ["orange", wmn_t("Pending", "\u0642\u064A\u062F \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631")],
                    error: ["red", wmn_t("Error", "\u062E\u0637\u0623")],
                    failed: ["red", wmn_t("Failed", "\u0641\u0634\u0644")],
                    syncing: ["blue", wmn_t("Syncing", "\u062C\u0627\u0631\u064A \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629")]
                };
                const x = map[status] || ["gray", status];
                return `<span class="indicator-pill ${x[0]}">${frappe.utils.escape_html(x[1])}</span>`;
            }

            function money(value, currency) {
                try {
                    return format_currency(flt(value || 0), currency || "YER");
                } catch (e) {
                    return String(flt(value || 0));
                }
            }

            async function updateInvoiceQueueRow(row) {
                if (!row || !row.offline_id) return row;
                await window.wmnPOSOffline.bulkPut(window.wmnPOSOffline.STORES.invoice_queue, [row]);
                wmn_notify_offline_queue_changed();
                return row;
            }

            async function syncOne(row) {
                if (!row) return row;

                const status = rowStatus(row);
                if (status === "draft_synced") return row;
                if (status === "synced") {
                    if (window.wmnPOSOffline?.syncPaymentEntries && row.offline_id) {
                        await window.wmnPOSOffline.syncPaymentEntries(row.offline_id);
                    }
                    return row;
                }

                if (!window.wmnPOSOffline?.syncInvoice) {
                    throw new Error("Offline invoice sync service is not available");
                }

                const syncedInvoice = await window.wmnPOSOffline.syncInvoice(row);
                if (window.wmnPOSOffline.syncPaymentEntries && syncedInvoice?.offline_id) {
                    await window.wmnPOSOffline.syncPaymentEntries(syncedInvoice.offline_id);
                }
                return syncedInvoice;
            }

            async function editOfflineInvoice(row, dialog) {
                if (!row || !pos) return;

                const sourceDoc = getInvoiceDoc(row);
                if (!sourceDoc) {
                    frappe.msgprint({
                        title: wmn_t("Edit Offline Invoice", "تعديل فاتورة أوفلاين"),
                        indicator: "orange",
                        message: wmn_t("Offline invoice data is missing", "بيانات الفاتورة الأوفلاين غير موجودة")
                    });
                    return;
                }

                const doc = JSON.parse(JSON.stringify(sourceDoc || {}));
                const syncId = doc.wmn_offline_sync_id
                    || doc.custom_offline_id
                    || row.offline_id
                    || row.id
                    || row.name
                    || "";
                doc.wmn_offline_sync_id = syncId;
                doc.custom_offline_id = syncId;
                doc.__islocal = 1;
                doc.docstatus = 0;
                doc.__offline_pos = 1;
                doc.offline_pos = 1;

                window.__wmn_pos_effective_offline = true;

                if (pos.wmn_detach_current_frm_refresh_fields) {
                    try { pos.wmn_detach_current_frm_refresh_fields(); } catch (e) {}
                }

                pos.frm = wmn_make_offline_frm(doc);
                wmn_prepare_pos_frm_doc(pos);

                window.cur_frm = pos.frm;
                window.cur_pos = pos;

                if (dialog && dialog.hide) {
                    dialog.hide();
                }

                try {
                    if (pos.order_summary && pos.order_summary.toggle_component) {
                        pos.order_summary.toggle_component(false);
                    }
                    if (pos.recent_order_list && pos.recent_order_list.toggle_component) {
                        pos.recent_order_list.toggle_component(false);
                    }
                    if (pos.item_selector && pos.item_selector.toggle_component) {
                        pos.item_selector.toggle_component(true);
                    }
                    if (pos.cart && pos.cart.toggle_component) {
                        pos.cart.toggle_component(true);
                    }
                    wmn_safe_offline_cart_reload(pos);
                } catch (e) {
                    console.warn("WMN offline invoice edit UI reload skipped", e);
                }

                frappe.show_alert({
                    message: wmn_t("Offline invoice loaded for editing", "تم فتح الفاتورة الأوفلاين للتعديل"),
                    indicator: "orange"
                });
            }

            async function syncAll() {
                if (!window.wmnPOSOffline.syncInvoices || typeof window.wmnPOSOffline.syncInvoices !== "function") {
                    throw new Error("syncInvoices \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629");
                }

                return await (window.wmnPOSOffline.manualSyncInvoices
                    ? window.wmnPOSOffline.manualSyncInvoices()
                    : window.wmnPOSOffline.syncInvoices());
            }

            async function renderRows(dialog) {
                const rows = await window.wmnPOSOffline.getAll(window.wmnPOSOffline.STORES.invoice_queue);
                const pendingPayments = window.wmnPOSOffline.getPendingPaymentEntries
                    ? await window.wmnPOSOffline.getPendingPaymentEntries()
                    : [];
                const pendingPaymentCounts = new Map();
                for (const paymentRow of pendingPayments || []) {
                    const key = String(paymentRow.invoice_offline_id || "");
                    if (!key) continue;
                    pendingPaymentCounts.set(key, (pendingPaymentCounts.get(key) || 0) + 1);
                }

                rows.sort((a, b) => String(b.created_at || b.modified || b.offline_id || "").localeCompare(String(a.created_at || a.modified || a.offline_id || "")));

                const html = rows.length ? rows.map((row, idx) => {
                    const doc = getInvoiceDoc(row) || {};
                    const id = row.offline_id || row.id || row.name || doc.name || ("ROW-" + idx);
                    const customer = doc.customer_name || doc.customer || row.customer || "";
                    const total = doc.rounded_total || doc.grand_total || row.grand_total || row.total || 0;
                    const currency = doc.currency || row.currency || "YER";
                    const created = row.created_at || row.creation || doc.posting_date || "";
                    const status = rowStatus(row);
                    const erpName = row.erpnext_name || row.server_name || "";
                    const pendingPaymentCount = pendingPaymentCounts.get(String(row.offline_id || "")) || 0;
                    const syncAction = status === "draft_synced"
                        ? `<span class="text-muted" style="display:inline-block;padding:4px 8px;">${wmn_t("Draft Synced", "تمت مزامنة المسودة")}</span>`
                        : status === "synced"
                            ? (pendingPaymentCount > 0
                                ? `<button class="btn btn-xs btn-primary wmn-sync-one" data-idx="${idx}">${wmn_t("Sync Payment", "مزامنة الدفع")}</button>`
                                : `<span class="text-muted" style="display:inline-block;padding:4px 8px;">${wmn_t("Synced", "تمت المزامنة")}</span>`)
                        : status === "syncing"
                            ? `<button class="btn btn-xs btn-primary wmn-sync-one" data-idx="${idx}" disabled>${wmn_t("Syncing...", "جاري المزامنة...")}</button>`
                            : `<button class="btn btn-xs btn-primary wmn-sync-one" data-idx="${idx}">${wmn_t("Sync", "مزامنة")}</button>`;

                    return `
                        <tr data-offline-id="${frappe.utils.escape_html(id)}">
                            <td style="min-width:160px;">
                                <div style="font-weight:700;">${frappe.utils.escape_html(id)}</div>
                                ${erpName ? `<div style="font-size:12px;color:#16a34a;">ERP: ${frappe.utils.escape_html(erpName)}</div>` : ""}
                            </td>
                            <td>${frappe.utils.escape_html(customer)}</td>
                            <td style="white-space:nowrap;">${frappe.utils.escape_html(money(total, currency))}</td>
                            <td style="white-space:nowrap;">
                                ${statusBadge(status)}
                                ${pendingPaymentCount > 0 ? `<div style="margin-top:4px;font-size:11px;color:#b45309;">${wmn_t("Pending payment", "دفع معلق")}: ${pendingPaymentCount}</div>` : ""}
                            </td>
                            <td style="white-space:nowrap;font-size:12px;color:#6b7280;">${frappe.utils.escape_html(created)}</td>
                            <td style="white-space:nowrap;text-align:left;">
                                ${syncAction}
                                <button class="btn btn-xs btn-default wmn-edit-one" data-idx="${idx}">
                                    ${wmn_t("Edit", "تعديل")}
                                </button>
                                <button class="btn btn-xs btn-danger wmn-delete-one" data-idx="${idx}">
                                    ${wmn_t("Delete", "\u0645\u0633\u062D")}
                                </button>
                            </td>
                        </tr>
                    `;
                }).join("") : `
                    <tr>
                        <td colspan="6" style="text-align:center;color:#6b7280;padding:24px;">
                            ${wmn_t("No offline invoices saved", "\u0644\u0627 \u062A\u0648\u062C\u062F \u0641\u0648\u0627\u062A\u064A\u0631 \u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0645\u062D\u0641\u0648\u0638\u0629")}
                        </td>
                    </tr>
                `;

                dialog.__wmn_rows = rows;

                dialog.$wrapper.find(".wmn-offline-invoices-count").text(rows.length);
                dialog.$wrapper.find(".wmn-offline-invoices-body").html(html);
            }

            async function openManagerDialog() {
                const d = new frappe.ui.Dialog({
                    title: wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"),
                    size: "extra-large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "offline_invoices_html",
                            options: `
                                <div class="wmn-offline-invoices-dialog" style="direction:inherit;">
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                                        <div>
                                            <div style="font-weight:700;font-size:16px;">${wmn_t("Invoices saved in IndexedDB", "\u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0641\u064A IndexedDB")}</div>
                                            <div style="color:#6b7280;font-size:13px;">
                                                ${wmn_t("Count", "\u0627\u0644\u0639\u062F\u062F")}: <span class="wmn-offline-invoices-count">0</span>
                                            </div>
                                        </div>
                                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                            <button class="btn btn-sm btn-default wmn-refresh-list">${wmn_t("Refresh", "\u062A\u062D\u062F\u064A\u062B")}</button>
                                            <button class="btn btn-sm btn-primary wmn-sync-all">${wmn_t("Sync All", "\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0643\u0644")}</button>
                                            <button class="btn btn-sm btn-danger wmn-delete-all">${wmn_t("Delete All", "\u0645\u0633\u062D \u0627\u0644\u0643\u0644")}</button>
                                        </div>
                                    </div>

                                    <div style="max-height:65vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${wmn_t("Offline ID", "\u0631\u0642\u0645 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646")}</th>
                                                    <th>${wmn_t("Customer", "\u0627\u0644\u0639\u0645\u064A\u0644")}</th>
                                                    <th>${wmn_t("Total", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A")}</th>
                                                    <th>${wmn_t("Status", "\u0627\u0644\u062D\u0627\u0644\u0629")}</th>
                                                    <th>${wmn_t("Created", "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0625\u0646\u0634\u0627\u0621")}</th>
                                                    <th style="text-align:left;">${wmn_t("Actions", "\u0627\u0644\u0625\u062C\u0631\u0627\u0621\u0627\u062A")}</th>
                                                </tr>
                                            </thead>
                                            <tbody class="wmn-offline-invoices-body"></tbody>
                                        </table>
                                    </div>
                                </div>
                            `
                        }
                    ]
                });

                d.$wrapper.addClass("wmn-pos-app-dialog wmn-offline-invoices-modal");
                d.show();
                await renderRows(d);

                d.$wrapper.on("click", ".wmn-refresh-list", async () => {
                    await renderRows(d);
                });

                d.$wrapper.on("click", ".wmn-sync-all", async function () {
                    if (syncAllRunning) return;

                    const $button = $(this);
                    syncAllRunning = true;
                    $button.prop("disabled", true);

                    try {
                        frappe.dom.freeze(wmn_t("Syncing offline invoices...", "جاري مزامنة فواتير الأوفلاين..."));
                        await syncAll();
                        frappe.show_alert({ message: wmn_t("Available invoices synced", "تمت مزامنة الفواتير المتاحة"), indicator: "green" });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        console.error("WMN sync all offline invoices failed", e);
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "فشلت المزامنة"),
                            indicator: "red",
                            message: __("تعذرت مزامنة الكل: {0}", [e.message || e])
                        });
                    } finally {
                        frappe.dom.unfreeze();
                        syncAllRunning = false;
                        $button.prop("disabled", false);
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-all", async () => {
                    const rows = d.__wmn_rows || [];
                    if (!rows.length) return;

                    frappe.confirm(
                        wmn_t("Delete all offline invoices from IndexedDB?", "\u0647\u0644 \u062A\u0631\u064A\u062F \u0645\u0633\u062D \u0643\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646 \u0645\u0646 IndexedDB\u061F"),
                        async () => {
                            try {
                                frappe.dom.freeze(wmn_t("Deleting...", "\u062C\u0627\u0631\u064A \u0627\u0644\u0645\u0633\u062D..."));
                                for (const row of rows) {
                                    await deleteInvoiceQueueRow(row);
                                }
                                frappe.dom.unfreeze();
                                frappe.show_alert({ message: wmn_t("All offline invoices deleted", "\u062A\u0645 \u0645\u0633\u062D \u0643\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.dom.unfreeze();
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "\u0641\u0634\u0644 \u0627\u0644\u0645\u0633\u062D"),
                                    indicator: "red",
                                    message: wmn_msg("Delete failed: {0}", "\u062A\u0639\u0630\u0631 \u0627\u0644\u0645\u0633\u062D: {0}", [e.message || e])
                                });
                            }
                        }
                    );
                });

                d.$wrapper.on("click", ".wmn-edit-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    await editOfflineInvoice(row, d);
                });

                d.$wrapper.on("click", ".wmn-sync-one", async function () {
                    const $button = $(this);
                    if ($button.prop("disabled")) return;

                    const idx = cint($button.attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) {
                        await renderRows(d);
                        return;
                    }

                    $button.prop("disabled", true).text(wmn_t("Syncing...", "جاري المزامنة..."));

                    try {
                        frappe.dom.freeze(__("Syncing invoice..."));
                        const result = await syncOne(row);
                        frappe.show_alert({
                            message: wmn_t("Invoice synced", "تمت مزامنة الفاتورة"),
                            indicator: rowStatus(result) === "synced" ? "green" : "orange"
                        });
                        await renderRows(d);
                        if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                            window.cur_pos.recent_order_list.refresh_list();
                        }
                    } catch (e) {
                        frappe.msgprint({
                            title: wmn_t("Sync Failed", "فشلت المزامنة"),
                            indicator: "red",
                            message: wmn_msg("Failed to sync invoice: {0}", "تعذرت مزامنة الفاتورة: {0}", [e.message || e])
                        });
                    } finally {
                        frappe.dom.unfreeze();
                        if ($button.closest("body").length) {
                            $button.prop("disabled", false).text(wmn_t("Sync", "مزامنة"));
                        }
                    }
                });

                d.$wrapper.on("click", ".wmn-delete-one", async function () {
                    const idx = cint($(this).attr("data-idx"));
                    const row = (d.__wmn_rows || [])[idx];
                    if (!row) return;

                    frappe.confirm(
                        wmn_t("Delete this invoice from IndexedDB?", "\u0647\u0644 \u062A\u0631\u064A\u062F \u0645\u0633\u062D \u0647\u0630\u0647 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0646 IndexedDB\u061F"),
                        async () => {
                            try {
                                await deleteInvoiceQueueRow(row);
                                frappe.show_alert({ message: wmn_t("Invoice deleted", "\u062A\u0645 \u0645\u0633\u062D \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629"), indicator: "orange" });
                                await renderRows(d);
                                if (window.cur_pos && window.cur_pos.recent_order_list && window.cur_pos.recent_order_list.refresh_list) {
                                    window.cur_pos.recent_order_list.refresh_list();
                                }
                            } catch (e) {
                                frappe.msgprint({
                                    title: wmn_t("Delete Failed", "\u0641\u0634\u0644 \u0627\u0644\u0645\u0633\u062D"),
                                    indicator: "red",
                                    message: wmn_msg("Failed to delete invoice: {0}", "\u062A\u0639\u0630\u0631 \u0645\u0633\u062D \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: {0}", [e.message || e])
                                });
                            }
                        }
                    );
                });
            }

            function addManagerButton(pos) {
                if (!pos || pos.__wmn_invoice_manager_button_v5) return;

                const add = () => {
                    let $target = null;

                    if (pos.page && pos.page.add_inner_button) {
                        try {
                            pos.page.add_inner_button(wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646"), () => openManagerDialog(), __("Offline"));
                            pos.page.add_inner_button(wmn_t("Printer", "الطابعة"), () => wmn_show_printer_settings_dialog(), __("Offline"));
                            pos.__wmn_invoice_manager_button_v5 = true;
                            return true;
                        } catch (e) {}
                    }


                    if (pos.$components_wrapper && pos.$components_wrapper.length) {
                        $target = pos.$components_wrapper.closest(".page-container").find(".page-actions .standard-actions").first();
                    }

                    if (!$target || !$target.length) {
                        $target = $(".page-actions .standard-actions, .page-actions, .custom-actions, .layout-main-section").first();
                    }

                    if (!$target || !$target.length) return false;
                    if ($target.find(".wmn-offline-invoices-btn").length) return true;

                    const $btn = $(`
                        <button class="btn btn-sm btn-default wmn-offline-invoices-btn" style="margin-inline-start:6px;">
                            ${wmn_t("Offline Invoices", "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0644\u0627\u064A\u0646")}
                        </button>
                    `);

                    $btn.on("click", () => openManagerDialog());

                    const $printerBtn = $(`
                        <button class="btn btn-sm btn-default wmn-printer-settings-btn" style="margin-inline-start:6px;">
                            ${wmn_t("Printer", "الطابعة")}
                        </button>
                    `);

                    $printerBtn.on("click", () => wmn_show_printer_settings_dialog());

                    $target.append($btn);
                    $target.append($printerBtn);
                    pos.__wmn_invoice_manager_button_v5 = true;
                    return true;
                };

                if (!add()) {
                    let attempts = 0;
                    const retry = () => {
                        attempts += 1;
                        if (add() || attempts >= 6) return;
                        setTimeout(retry, 500);
                    };
                    setTimeout(retry, 500);
                }
            }

            window.wmnPOSOffline.openInvoiceManagerDialog = openManagerDialog;
            window.wmnPOSOffline.deleteInvoiceQueueRow = deleteInvoiceQueueRow;

            addManagerButton(pos || window.cur_pos);

            window.wmnPOSOffline.__wmn_invoice_manager_dialog_v5 = true;
}


