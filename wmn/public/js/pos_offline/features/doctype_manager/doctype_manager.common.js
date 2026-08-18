/* WMN POS management menu and generic DocType dialog workflow. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.DoctypeManager = ns.Features.DoctypeManager || {};

    const STYLE_ID = "wmn-pos-doctype-manager-style";
    const FORM_WATCH_INTERVAL = 350;
    const LIST_LIMIT = 50;
    const dialogScriptCache = new Map();

    const SECTION_LABELS = Object.freeze({
        Setup: __("Setup"),
        Commercial: __("Commercial"),
        Operations: __("Operations"),
        Audit: __("Audit & History"),
    });

    function escapeHtml(value) {
        const text = String(value ?? "");
        if (frappe.utils && typeof frappe.utils.escape_html === "function") {
            return frappe.utils.escape_html(text);
        }
        return text.replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        })[char]);
    }

    function icon(name) {
        const paths = {
            menu: '<path d="M5 6h14M5 12h14M5 18h14"/>',
            form: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
            add: '<path d="M12 5v14M5 12h14"/>',
            search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
            refresh: '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M6 8a7 7 0 0 1 12-2l2 1M4 17l2 1a7 7 0 0 0 12-2"/>',
            back: '<path d="m15 18-6-6 6-6"/>',
            save: '<path d="M5 3h12l2 2v16H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
            grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
            list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
            sync: '<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M6 8a7 7 0 0 1 12-2l2 1M4 17l2 1a7 7 0 0 0 12-2"/>',
            cash: '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>',
            printer: '<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
            offer: '<path d="M4 4h16v16H4z"/><path d="m8 16 8-8M8.5 8.5h.01M15.5 15.5h.01"/>',
        };
        return `<svg class="wmn-pos-manager-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.form}</svg>`;
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            body.wmn-mamsek-pos-route .wmn-pos-management-menu-dialog .modal-dialog { max-width: 980px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-dialog {
                width: calc(100vw - 60px) !important;
                max-width: none !important;
                height: 94vh;
                margin: 3vh auto;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-content {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: 94vh;
                max-height: 94vh;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-header,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-footer { flex: 0 0 auto; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body {
                display: flex;
                flex: 1 1 auto;
                width: 100%;
                min-height: 0;
                overflow: hidden;
                padding: 0;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body > .form-layout,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-page,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-section,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .section-body,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .row,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-column,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .column-break,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .frappe-control,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .control-input-wrapper,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .control-input,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog [data-fieldname="doctype_html"] {
                box-sizing: border-box;
                width: 100% !important;
                max-width: none !important;
                height: 100% !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-column,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .column-break {
                flex: 1 1 100% !important;
                max-width: 100% !important;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-section,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .section-body,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .form-page,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body > .form-layout {
                display: flex;
                flex: 1 1 auto;
                flex-direction: column;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .section-body,
            body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-body .row {
                flex: 1 1 auto;
                min-height: 0;
            }
            body.wmn-mamsek-pos-route .wmn-pos-manager-shell { direction: rtl; display: grid; gap: 16px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-section { display: grid; gap: 9px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-section-head h4 { margin: 0; font-size: 14px; font-weight: 800; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-section-head span { color: var(--text-muted, #6c7680); font-size: 11px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-button { display: flex; align-items: center; gap: 9px; min-height: 48px; padding: 9px 11px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 10px; background: var(--card-bg, #fff); color: var(--text-color, #1f2937); text-align: start; cursor: pointer; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-button:hover { border-color: var(--primary, #2490ef); background: var(--subtle-fg, #f8fafc); }
            body.wmn-mamsek-pos-route .wmn-pos-manager-button small { display: block; margin-top: 2px; color: var(--text-muted, #6c7680); font-size: 10px; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-button .wmn-pos-manager-icon { flex: 0 0 auto; }
            body.wmn-mamsek-pos-route .wmn-pos-manager-offline-note { padding: 12px; border: 1px solid #f2d6a2; border-radius: 10px; background: #fff8e8; color: #8a5a00; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-shell {
                display: flex;
                flex: 1 1 100%;
                flex-direction: column;
                box-sizing: border-box;
                width: 100% !important;
                max-width: none !important;
                min-width: 0;
                height: 100%;
                min-height: 0;
                background: var(--subtle-fg, #f8fafc);
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; padding: 10px 12px; border-bottom: 1px solid var(--border-color, #d1d8dd); background: var(--card-bg, #fff); }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar .wmn-pos-doctype-search { flex: 1 1 auto; min-width: 120px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar .btn { min-height: 34px; white-space: nowrap; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-cache-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; flex: 0 0 auto; padding: 8px 12px; border-bottom: 1px solid var(--border-color, #d1d8dd); background: var(--card-bg, #fff); }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-cache-chip { display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 4px 9px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 999px; background: var(--subtle-fg, #f8fafc); color: var(--text-muted, #6c7680); font-size: 10px; font-weight: 700; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-cache-chip strong { color: var(--text-color, #1f2937); font-size: 11px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-cache-chip[data-kind="pending"] { border-color: #f2d6a2; background: #fff8e8; color: #8a5a00; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-cache-chip[data-kind="conflict"] { border-color: #f3c4bf; background: #fff1f0; color: #b42318; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px 170px auto; gap: 10px; align-items: center; width: 100%; min-height: 56px; margin-bottom: 6px; padding: 8px 11px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 9px; background: var(--card-bg, #fff); color: var(--text-color, #1f2937); text-align: start; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row:hover { border-color: var(--primary, #2490ef); }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row-main { min-width: 0; cursor: pointer; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row span { overflow: hidden; color: var(--text-muted, #6c7680); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 5px; white-space: nowrap; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row-actions .btn { min-height: 30px; padding: 4px 8px; font-size: 10px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state { display: inline-flex; align-items: center; justify-content: center; min-width: 76px; padding: 3px 7px; border-radius: 999px; font-size: 10px !important; font-weight: 800; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state[data-state="clean"] { background: #ecfdf3; color: #027a48; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state[data-state="pending_create"],
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state[data-state="pending_update"] { background: #fff7e6; color: #9a6700; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state[data-state="conflict"] { background: #fff1f0; color: #b42318; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-sync-state[data-state="error"] { background: #fff1f0; color: #b42318; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-form { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-field { display: grid; gap: 5px; min-width: 0; padding: 10px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 10px; background: var(--card-bg, #fff); }
            body.wmn-mamsek-pos-route .wmn-pos-offline-field.wide { grid-column: 1 / -1; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-field label { margin: 0; color: var(--text-color, #1f2937); font-size: 11px; font-weight: 800; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-field small { color: var(--text-muted, #6c7680); font-size: 9px; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-field input[type="checkbox"] { width: 18px; height: 18px; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-readonly { min-height: 34px; padding: 7px 9px; border-radius: 7px; background: var(--subtle-fg, #f8fafc); color: var(--text-muted, #6c7680); overflow-wrap: anywhere; }
            body.wmn-mamsek-pos-route .wmn-pos-offline-banner { flex: 0 0 auto; margin: 10px 12px 0; padding: 8px 10px; border: 1px solid #f2d6a2; border-radius: 8px; background: #fff8e8; color: #8a5a00; font-size: 11px; }
            body.wmn-mamsek-pos-route .wmn-pos-sync-list { display: grid; gap: 7px; max-height: 62vh; overflow: auto; }
            body.wmn-mamsek-pos-route .wmn-pos-sync-row { display: grid; grid-template-columns: minmax(0,1fr) 130px 110px auto; gap: 8px; align-items: center; padding: 9px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 9px; }
            body.wmn-mamsek-pos-route .wmn-pos-sync-row small { display: block; margin-top: 2px; color: var(--text-muted, #6c7680); }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-empty { display: grid; place-items: center; min-height: 220px; color: var(--text-muted, #6c7680); text-align: center; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-frame-wrap {
                position: relative;
                flex: 1 1 auto;
                box-sizing: border-box;
                width: 100% !important;
                max-width: none !important;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
                background: #f4f6f8;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-frame {
                position: absolute;
                inset: 0;
                display: block;
                box-sizing: border-box;
                width: 100% !important;
                max-width: none !important;
                min-width: 0;
                height: 100% !important;
                border: 0;
                background: #fff;
            }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-loading { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; background: #fff; color: var(--text-muted, #6c7680); }
            @media (max-width: 720px) {
                body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-dialog { width: 98vw; height: 96vh; margin: 2vh auto; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-dialog .modal-content { height: 96vh; max-height: 96vh; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-row { grid-template-columns: 1fr; gap: 5px; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-row-actions { justify-content: flex-start; flex-wrap: wrap; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar { flex-wrap: wrap; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar .wmn-pos-doctype-search { flex-basis: 100%; order: 3; }
                body.wmn-mamsek-pos-route .wmn-pos-offline-form-grid { grid-template-columns: 1fr; }
                body.wmn-mamsek-pos-route .wmn-pos-offline-field.wide { grid-column: auto; }
                body.wmn-mamsek-pos-route .wmn-pos-sync-row { grid-template-columns: 1fr; }
            }
        `;
        document.head.appendChild(style);
    }

    function isOffline() {
        try {
            if (typeof window.wmn_is_pos_offline === "function") return Boolean(window.wmn_is_pos_offline());
        } catch (error) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function getAdapter() {
        return isOffline()
            ? ns.Features.DoctypeManager.Offline
            : ns.Features.DoctypeManager.Online;
    }

    function toolItems() {
        return [
            { action: "grid-view", label: __("Grid View"), icon: "grid" },
            { action: "button-view", label: __("Button View"), icon: "list" },
            { action: "offline-sync", label: __("Offline Sync"), icon: "sync" },
            { action: "doctype-sync", label: __("Offline Document Sync"), icon: "sync" },
            { action: "pos-cache-manager", label: __("POS Cache Manager"), icon: "form" },
            { action: "cash-movement", label: __("Cash Movement"), icon: "cash" },
            { action: "printer", label: __("Printer"), icon: "printer" },
            { action: "commercial-catalog", label: __("Active Promotions & Coupons"), icon: "offer" },
        ];
    }

    async function runToolAction(itemSelector, action) {
        if (action === "grid-view") {
            itemSelector?.setCardMode?.();
            return;
        }
        if (action === "button-view") {
            itemSelector?.setButtonMode?.();
            return;
        }
        if (action === "offline-sync") {
            window.wmnPOSOffline?.openInvoiceManagerDialog?.();
            return;
        }
        if (action === "doctype-sync") {
            await openOfflineSyncDialog();
            return;
        }
        if (action === "pos-cache-manager") {
            const feature = isOffline()
                ? ns.Features?.PosCacheManager?.Offline
                : ns.Features?.PosCacheManager?.Online;
            if (!feature?.open) throw new Error(__("POS Cache Manager is not loaded."));
            await feature.open();
            return;
        }
        if (action === "cash-movement") {
            await window.WMNPOSCashMovement?.openDialog?.(window.cur_pos);
            return;
        }
        if (action === "printer") {
            if (typeof window.wmn_show_printer_settings_dialog === "function") {
                window.wmn_show_printer_settings_dialog();
            }
            return;
        }
        if (action === "commercial-catalog") {
            await window.cur_pos?.wmn_open_cashier_commercial_catalog?.();
        }
    }

    function configuredIcon(item) {
        const iconName = String(item?.icon || "").trim();
        if (iconName && frappe.utils && typeof frappe.utils.icon === "function") {
            try {
                return `<span class="wmn-pos-manager-configured-icon">${frappe.utils.icon(iconName, "sm")}</span>`;
            } catch (error) {}
        }
        return icon("form");
    }

    function managerButtonHtml(item) {
        const permissionText = item.can_write || item.can_create
            ? __("Open list, add or edit")
            : __("Read only");
        return `
            <button type="button" class="wmn-pos-manager-button wmn-pos-manager-doctype" data-doctype="${escapeHtml(item.doctype)}">
                ${configuredIcon(item)}
                <span><strong>${escapeHtml(item.label || item.doctype)}</strong><small>${escapeHtml(permissionText)}</small></span>
            </button>`;
    }

    function menuHtml(doctypes) {
        const groups = new Map();
        for (const item of doctypes) {
            const section = String(item.section || "Setup");
            if (!groups.has(section)) groups.set(section, []);
            groups.get(section).push(item);
        }

        const managementSections = Array.from(groups.entries()).map(([section, items]) => `
            <section class="wmn-pos-manager-section">
                <div class="wmn-pos-manager-section-head"><h4>${escapeHtml(SECTION_LABELS[section] || __(section))}</h4><span>${items.length}</span></div>
                <div class="wmn-pos-manager-grid">${items.map(managerButtonHtml).join("")}</div>
            </section>`).join("");

        const tools = toolItems().map((item) => `
            <button type="button" class="wmn-pos-manager-button wmn-pos-manager-tool" data-tool-action="${escapeHtml(item.action)}">
                ${icon(item.icon)}<span><strong>${escapeHtml(item.label)}</strong></span>
            </button>`).join("");

        const offlineNote = isOffline()
            ? `<div class="wmn-pos-manager-offline-note">${escapeHtml(__("Offline mode: only configured lightweight fields are available. Changes are stored locally until synchronized."))}</div>`
            : "";

        return `
            <div class="wmn-pos-manager-shell">
                <section class="wmn-pos-manager-section">
                    <div class="wmn-pos-manager-section-head"><h4>${escapeHtml(__("POS Tools"))}</h4></div>
                    <div class="wmn-pos-manager-grid">${tools}</div>
                </section>
                ${offlineNote}
                ${managementSections || `<div class="wmn-pos-doctype-empty">${escapeHtml(isOffline() ? __("No cached Offline DocTypes are available. Connect once to load the configured offline models.") : __("No WMN POS DocTypes are available for your permissions."))}</div>`}
            </div>`;
    }

    async function openMenu(itemSelector) {
        ensureStyles();
        const adapter = getAdapter();
        let doctypes = [];

        try {
            doctypes = await adapter.getAvailableDoctypes();
        } catch (error) {
            console.error("WMN POS DocType permission load failed", error);
            frappe.show_alert({ message: error?.message || __("Unable to load WMN POS menu."), indicator: "red" });
        }

        const dialog = new frappe.ui.Dialog({
            title: __("WMN POS Menu"),
            size: "large",
            fields: [{ fieldname: "menu_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-management-menu-dialog");
        dialog.fields_dict.menu_html.$wrapper.html(menuHtml(doctypes));

        dialog.$wrapper.on("click.wmnPosManager", ".wmn-pos-manager-tool", async (event) => {
            const action = String($(event.currentTarget).attr("data-tool-action") || "");
            dialog.hide();
            try {
                await runToolAction(itemSelector, action);
            } catch (error) {
                console.error("WMN POS menu tool failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to run POS tool."), indicator: "red" });
            }
        });

        dialog.$wrapper.on("click.wmnPosManager", ".wmn-pos-manager-doctype", (event) => {
            const doctype = String($(event.currentTarget).attr("data-doctype") || "");
            const config = doctypes.find((row) => row.doctype === doctype);
            if (!config) return;
            dialog.hide();
            openDoctypeDialog(config).catch((error) => {
                console.error("WMN POS DocType dialog failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to open DocType."), indicator: "red" });
            });
        });

        dialog.$wrapper.one("hidden.bs.modal.wmnPosManager", () => {
            dialog.$wrapper.off(".wmnPosManager");
        });
        dialog.show();
        return dialog;
    }

    function doctypeListShell(config) {
        const addButton = cint(config.can_create || 0)
            ? `<button type="button" class="btn btn-primary wmn-pos-doctype-add">${icon("add")}<span>${escapeHtml(__("Add"))}</span></button>`
            : "";
        return `
            <div class="wmn-pos-doctype-shell">
                <div class="wmn-pos-doctype-toolbar">
                    ${addButton}
                    <button type="button" class="btn btn-default wmn-pos-doctype-refresh">${icon("refresh")}<span>${escapeHtml(__("Refresh"))}</span></button>
                    <div class="wmn-pos-doctype-search"><input type="search" class="form-control" placeholder="${escapeHtml(__("Search documents..."))}" autocomplete="off"></div>
                </div>
                <div class="wmn-pos-doctype-cache-summary" aria-live="polite"></div>
                <div class="wmn-pos-doctype-list"><div class="wmn-pos-doctype-empty">${escapeHtml(__("Loading..."))}</div></div>
            </div>`;
    }

    function rowTitle(row, config) {
        const titleField = String(config.title_field || "");
        return String((titleField && row?.[titleField]) || row?.name || "");
    }

    function rowListDetails(row, config) {
        const model = config?.__wmn_offline_model;
        if (!model) return "";
        return (model.fields || [])
            .filter((field) => cint(field.list_column || 0) && row?.[field.fieldname] !== undefined && row?.[field.fieldname] !== null && row?.[field.fieldname] !== "")
            .slice(0, 3)
            .map((field) => `${__(field.label || field.fieldname)}: ${row[field.fieldname]}`)
            .join(" · ");
    }

    function formatModified(value) {
        if (!value) return "";
        try {
            return frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(value) : String(value);
        } catch (error) {
            return String(value);
        }
    }

    async function getDoctypeCacheState(doctype) {
        const empty = {
            records: [],
            byName: new Map(),
            cached: 0,
            pending: 0,
            conflicts: 0,
        };
        if (!window.wmnPOSOffline?.listOfflineDoctypeRecords) return empty;

        try {
            const records = await window.wmnPOSOffline.listOfflineDoctypeRecords(doctype) || [];
            const byName = new Map();
            let pending = 0;
            let conflicts = 0;
            for (const record of records) {
                if (!record?.name) continue;
                byName.set(String(record.name), record);
                const state = String(record.sync_status || "clean");
                if (state === "conflict") conflicts += 1;
                else if (state !== "clean") pending += 1;
            }
            return {
                records,
                byName,
                cached: records.length,
                pending,
                conflicts,
            };
        } catch (error) {
            console.warn("WMN POS could not read the DocType cache summary", error);
            return empty;
        }
    }

    function renderDoctypeCacheSummary(dialog, cacheState) {
        const $summary = dialog.$wrapper.find(".wmn-pos-doctype-cache-summary");
        if (!$summary.length) return;
        $summary.html(`
            <span class="wmn-pos-doctype-cache-chip" data-kind="cached">${escapeHtml(__("Cached"))}: <strong>${cint(cacheState?.cached || 0)}</strong></span>
            <span class="wmn-pos-doctype-cache-chip" data-kind="pending">${escapeHtml(__("Pending"))}: <strong>${cint(cacheState?.pending || 0)}</strong></span>
            <span class="wmn-pos-doctype-cache-chip" data-kind="conflict">${escapeHtml(__("Conflicts"))}: <strong>${cint(cacheState?.conflicts || 0)}</strong></span>
        `);
    }

    function rowSyncState(row, cacheState) {
        const cached = cacheState?.byName?.get(String(row?.name || "")) || null;
        const state = String(row?.__wmn_sync_status || cached?.sync_status || "clean");
        return {
            cached,
            state,
            isCached: Boolean(cached),
            isPending: ["pending_create", "pending_update", "error"].includes(state),
            isConflict: state === "conflict",
        };
    }

    function rowActionButtons(config, row, syncState) {
        const canEdit = syncState.state === "pending_create"
            ? cint(config.can_create || 0)
            : cint(config.can_write || 0);
        const openLabel = canEdit ? __("Edit") : __("View");
        const buttons = [
            `<button type="button" class="btn btn-xs btn-default wmn-pos-doctype-edit">${escapeHtml(openLabel)}</button>`,
        ];

        if (!isOffline() && syncState.isPending && syncState.cached) {
            buttons.push(`<button type="button" class="btn btn-xs btn-primary wmn-pos-doctype-sync-one">${escapeHtml(__("Sync"))}</button>`);
        }
        if (syncState.isConflict && syncState.cached?.server_document) {
            buttons.push(`<button type="button" class="btn btn-xs btn-default wmn-pos-doctype-use-server">${escapeHtml(__("Use Server"))}</button>`);
        }
        return buttons.join("");
    }

    async function renderDocuments(dialog, config, searchValue) {
        const $list = dialog.$wrapper.find(".wmn-pos-doctype-list");
        $list.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(__("Loading..."))}</div>`);

        const [rows, cacheState] = await Promise.all([
            getAdapter().listDocuments({
                doctype: config.doctype,
                title_field: config.title_field,
                search: searchValue,
                limit_start: 0,
                limit_page_length: LIST_LIMIT,
            }),
            getDoctypeCacheState(config.doctype),
        ]);
        renderDoctypeCacheSummary(dialog, cacheState);

        if (!rows.length) {
            $list.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(__("No documents found."))}</div>`);
            return;
        }

        $list.html(rows.map((row) => {
            const syncState = rowSyncState(row, cacheState);
            const stateLabel = syncState.isCached ? syncStatusLabel(syncState.state) : "";
            const modified = row.__wmn_local_updated_at || syncState.cached?.local_updated_at || row.modified;
            return `
            <div class="wmn-pos-doctype-row" role="group" data-name="${escapeHtml(row.name)}" data-sync-status="${escapeHtml(syncState.state)}" data-local-record="${row.__wmn_local_record ? "1" : "0"}" data-cached-record="${syncState.isCached ? "1" : "0"}">
                <div class="wmn-pos-doctype-row-main" role="button" tabindex="0">
                    <strong>${escapeHtml(rowTitle(row, config))}</strong>
                    ${rowListDetails(row, config) ? `<small style="display:block;margin-top:2px;color:var(--text-muted,#6c7680);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(rowListDetails(row, config))}</small>` : ""}
                </div>
                <span>${escapeHtml(row.name)}</span>
                <span>${escapeHtml(formatModified(modified))}${stateLabel ? ` <em class="wmn-pos-doctype-sync-state" data-state="${escapeHtml(syncState.state)}">${escapeHtml(stateLabel)}</em>` : ""}</span>
                <div class="wmn-pos-doctype-row-actions">${rowActionButtons(config, row, syncState)}</div>
            </div>`;
        }).join(""));
    }

    function debounce(fn, delay) {
        let timer = null;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }

    const firstUseCacheStarted = new Set();

    async function cacheDoctypeOnFirstUse(config) {
        if (isOffline() || !config?.doctype || firstUseCacheStarted.has(config.doctype)) return;
        const online = ns.Features.DoctypeManager.Online;
        if (!online?.getOfflineModels || !online?.cacheDoctype) return;
        firstUseCacheStarted.add(config.doctype);
        try {
            const models = await online.getOfflineModels(config.doctype);
            const model = Array.isArray(models) ? models[0] : null;
            if (model?.load_strategy === "On First Use") await online.cacheDoctype(config.doctype);
        } catch (error) {
            firstUseCacheStarted.delete(config.doctype);
            console.warn(`WMN POS first-use cache failed for ${config.doctype}`, error);
        }
    }

    async function openDoctypeDialog(config) {
        ensureStyles();
        cacheDoctypeOnFirstUse(config);
        const dialog = new frappe.ui.Dialog({
            title: __(config.label || config.doctype),
            size: "large",
            fields: [{ fieldname: "doctype_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-doctype-dialog");
        dialog.__wmnDoctypeConfig = config;
        dialog.__wmnCleanup = [];

        const cleanup = () => {
            for (const fn of dialog.__wmnCleanup.splice(0)) {
                try { fn(); } catch (error) {}
            }
            dialog.$wrapper.off(".wmnPosDoctype");
        };
        dialog.$wrapper.one("hidden.bs.modal.wmnPosDoctype", cleanup);
        dialog.show();
        configureDoctypeDialogLayout(dialog);

        if (cint(config.is_single || 0)) {
            await showForm(dialog, config, { isNew: false, name: "" });
            return dialog;
        }

        showList(dialog, config);
        return dialog;
    }

    function showList(dialog, config) {
        for (const fn of dialog.__wmnCleanup.splice(0)) {
            try { fn(); } catch (error) {}
        }
        dialog.$wrapper.off(".wmnPosDoctypeView");
        configureDoctypeDialogLayout(dialog);
        dialog.fields_dict.doctype_html.$wrapper.html(doctypeListShell(config));

        const searchInput = dialog.$wrapper.find(".wmn-pos-doctype-search input");
        const refresh = () => renderDocuments(dialog, config, searchInput.val()).catch((error) => {
            console.error("WMN POS document list failed", error);
            dialog.$wrapper.find(".wmn-pos-doctype-list").html(`<div class="wmn-pos-doctype-empty">${escapeHtml(error?.message || __("Unable to load documents."))}</div>`);
        });
        const debouncedRefresh = debounce(refresh, 250);

        dialog.$wrapper.on("input.wmnPosDoctypeView", ".wmn-pos-doctype-search input", debouncedRefresh);
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-refresh", refresh);
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-add", () => {
            showForm(dialog, config, { isNew: true, name: "" }).catch((error) => {
                console.error("WMN POS DocType add form failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to open the form."), indicator: "red" }, 5);
            });
        });
        const openRow = ($row) => {
            showForm(dialog, config, {
                isNew: false,
                name: String($row.attr("data-name") || ""),
                syncStatus: String($row.attr("data-sync-status") || "clean"),
                localRecord: String($row.attr("data-local-record") || "0") === "1",
            }).catch((error) => {
                console.error("WMN POS DocType edit form failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to open the form."), indicator: "red" }, 5);
            });
        };

        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-row-main, .wmn-pos-doctype-edit", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openRow($(event.currentTarget).closest(".wmn-pos-doctype-row"));
        });
        dialog.$wrapper.on("keydown.wmnPosDoctypeView", ".wmn-pos-doctype-row-main", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openRow($(event.currentTarget).closest(".wmn-pos-doctype-row"));
        });
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-sync-one", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isOffline()) return;
            const button = event.currentTarget;
            const $row = $(button).closest(".wmn-pos-doctype-row");
            const name = String($row.attr("data-name") || "");
            const record = await window.wmnPOSOffline?.getOfflineDoctypeRecord?.(config.doctype, name);
            if (!record) return;
            button.disabled = true;
            try {
                const models = await ns.Features.DoctypeManager.Offline.getOfflineModels();
                const result = await syncOneOfflineRecord(record, models);
                frappe.show_alert({
                    message: result?.status === "conflict" ? __("Synchronization conflict detected.") : __("Document synchronized."),
                    indicator: result?.status === "conflict" ? "orange" : "green",
                }, 4);
            } catch (error) {
                frappe.show_alert({ message: error?.message || __("Synchronization failed."), indicator: "red" }, 5);
            } finally {
                button.disabled = false;
                await refresh();
            }
        });
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-use-server", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const button = event.currentTarget;
            const $row = $(button).closest(".wmn-pos-doctype-row");
            const name = String($row.attr("data-name") || "");
            const record = await window.wmnPOSOffline?.getOfflineDoctypeRecord?.(config.doctype, name);
            if (!record?.server_document) return;
            button.disabled = true;
            try {
                await resolveConflictWithServer(record);
                frappe.show_alert({ message: __("Server copy restored in the local cache."), indicator: "green" }, 4);
            } catch (error) {
                frappe.show_alert({ message: error?.message || __("Unable to use the server copy."), indicator: "red" }, 5);
            } finally {
                button.disabled = false;
                await refresh();
            }
        });

        const queueChanged = () => refresh();
        window.addEventListener("wmn:pos-doctype-queue-changed", queueChanged);
        dialog.__wmnCleanup.push(() => window.removeEventListener("wmn:pos-doctype-queue-changed", queueChanged));
        refresh();
    }

    function routePrefix() {
        return window.location.pathname.startsWith("/desk") ? "/desk" : "/app";
    }

    function doctypeSlug(doctype) {
        if (frappe.router && typeof frappe.router.slug === "function") return frappe.router.slug(doctype);
        return String(doctype || "").trim().toLowerCase().replace(/\s+/g, "-");
    }

    function buildFormUrl(config, state) {
        const prefix = routePrefix();
        const slug = doctypeSlug(config.doctype);
        let path = `${prefix}/${slug}`;
        if (!cint(config.is_single || 0)) {
            path += state.isNew ? "/new" : `/${encodeURIComponent(state.name)}`;
        }
        const url = new URL(path, window.location.origin);
        url.searchParams.set("dialog_layout", "1");
        url.searchParams.set("wmn_pos_dialog", "1");
        return `${url.pathname}${url.search}${url.hash}`;
    }

    function injectFrameStyles(frameDocument) {
        if (!frameDocument?.head) return;

        let style = frameDocument.getElementById("wmn-pos-doctype-frame-style");
        if (!style) {
            style = frameDocument.createElement("style");
            style.id = "wmn-pos-doctype-frame-style";
            frameDocument.head.appendChild(style);
        }

        style.textContent = `
            html, body {
                width: 100% !important;
                min-width: 0 !important;
                min-height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow-x: hidden !important;
                background: #f4f6f8 !important;
            }

            body > header,
            body > nav,
            header.navbar,
            nav.navbar,
            .navbar,
            [role="navigation"],
            .page-head,
            .page-head-content,
            .page-title,
            .layout-side-section,
            .form-sidebar,
            .desk-sidebar,
            .desk-sidebar-container,
            .standard-sidebar,
            .sidebar-section,
            .sidebar-toggle-btn,
            .app-sidebar,
            .app-switcher,
            .app-switcher-menu,
            .workspace-sidebar,
            .wmn-global-workspace-header,
            .body-sidebar-container,
            .form-footer {
                display: none !important;
            }

            .main-section,
            .page-container,
            .page-body,
            .layout-main,
            .layout-main-section-wrapper,
            .layout-main-section,
            .form-layout,
            .form-page {
                box-sizing: border-box !important;
                width: 100% !important;
                max-width: none !important;
                min-width: 0 !important;
                margin: 0 !important;
            }

            .layout-main-section-wrapper,
            .layout-main-section {
                flex: 1 1 100% !important;
            }

            .page-container,
            .page-body,
            .form-layout,
            .form-page {
                padding: 4px 8px 12px !important;
            }

            .container,
            .container-fluid {
                width: 100% !important;
                max-width: none !important;
                margin: 0 !important;
            }
        `;
    }

    function hideFrameChrome(frameDocument) {
        if (!frameDocument?.body) return;

        const selectors = [
            "body > header",
            "body > nav",
            "header.navbar",
            "nav.navbar",
            ".navbar",
            "[role='navigation']",
            ".page-head",
            ".page-head-content",
            ".page-title",
            ".layout-side-section",
            ".form-sidebar",
            ".desk-sidebar",
            ".desk-sidebar-container",
            ".standard-sidebar",
            ".sidebar-section",
            ".sidebar-toggle-btn",
            ".app-sidebar",
            ".app-switcher",
            ".app-switcher-menu",
            ".workspace-sidebar",
            ".wmn-global-workspace-header",
        ];

        for (const selector of selectors) {
            frameDocument.querySelectorAll(selector).forEach((element) => {
                element.style.setProperty("display", "none", "important");
            });
        }
    }

    function configureDoctypeDialogLayout(dialog) {
        if (!dialog?.$wrapper || !dialog?.fields_dict?.doctype_html?.$wrapper) return;

        const $wrapper = dialog.$wrapper;
        const $modalBody = $wrapper.find(".modal-body").first();
        const $control = dialog.fields_dict.doctype_html.$wrapper;

        $wrapper.find(".modal-dialog").css({
            width: "min(1480px, 96vw)",
            maxWidth: "1480px",
            height: "94vh",
            margin: "3vh auto",
        });
        $wrapper.find(".modal-content").css({
            width: "100%",
            height: "94vh",
            maxHeight: "94vh",
            display: "flex",
            flexDirection: "column",
        });
        $modalBody.css({
            width: "100%",
            minHeight: 0,
            flex: "1 1 auto",
            display: "flex",
            overflow: "hidden",
            padding: 0,
        });

        let node = $control.get(0);
        const stopNode = $modalBody.get(0);
        while (node && node !== stopNode) {
            const $node = $(node);
            $node.css({
                boxSizing: "border-box",
                width: "100%",
                maxWidth: "none",
                minWidth: 0,
                height: "100%",
                minHeight: 0,
                margin: 0,
                padding: 0,
            });
            if ($node.hasClass("form-column") || $node.hasClass("column-break")) {
                $node.css({ flex: "1 1 100%", maxWidth: "100%" });
            }
            node = node.parentElement;
        }

        $control.css({
            display: "flex",
            flex: "1 1 100%",
            flexDirection: "column",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "none",
            minWidth: 0,
            height: "100%",
            minHeight: 0,
        });

        $control.find(".control-value, .control-input-wrapper, .control-input").css({
            display: "flex",
            flex: "1 1 100%",
            flexDirection: "column",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "none",
            minWidth: 0,
            height: "100%",
            minHeight: 0,
        });
    }

    function fitDoctypeFrame(dialog) {
        const $control = dialog?.fields_dict?.doctype_html?.$wrapper;
        if (!$control?.length) return;

        const $shell = $control.find(".wmn-pos-doctype-shell").first();
        const $frameWrap = $control.find(".wmn-pos-doctype-frame-wrap").first();
        const $iframe = $control.find(".wmn-pos-doctype-frame").first();

        $shell.css({
            display: "flex",
            flex: "1 1 100%",
            flexDirection: "column",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "none",
            minWidth: 0,
            height: "100%",
            minHeight: 0,
        });
        $frameWrap.css({
            position: "relative",
            flex: "1 1 auto",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "none",
            minWidth: 0,
            minHeight: 0,
        });
        $iframe.css({
            position: "absolute",
            inset: 0,
            display: "block",
            boxSizing: "border-box",
            width: "100%",
            maxWidth: "none",
            minWidth: 0,
            height: "100%",
            border: 0,
        });
    }

    async function getDialogScriptsCached(doctype) {
        const key = String(doctype || "").trim();
        if (!key || isOffline()) return [];
        if (!dialogScriptCache.has(key)) {
            const promise = Promise.resolve(getAdapter().getDialogScripts?.(key) || [])
                .then((rows) => Array.isArray(rows) ? rows : [])
                .catch((error) => {
                    dialogScriptCache.delete(key);
                    throw error;
                });
            dialogScriptCache.set(key, promise);
        }
        return dialogScriptCache.get(key);
    }

    function waitForFrameForm(iframe, doctype, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const timer = window.setInterval(() => {
                try {
                    const frm = iframe?.contentWindow?.cur_frm;
                    if (frm && String(frm.doctype || "") === String(doctype || "")) {
                        window.clearInterval(timer);
                        resolve(frm);
                        return;
                    }
                } catch (error) {}

                if (Date.now() - started >= timeoutMs) {
                    window.clearInterval(timer);
                    reject(new Error(__("The form did not finish loading.")));
                }
            }, 100);
        });
    }

    function buildDialogFieldApi(frameWindow, frm) {
        const layoutTypes = new Set(["Section Break", "Column Break", "Tab Break"]);
        const baselineKey = "__wmnPosDialogFieldBaseline";

        if (!frm[baselineKey]) {
            const baseline = new Map();
            for (const df of frm.meta?.fields || []) {
                if (!df.fieldname) continue;
                baseline.set(df.fieldname, {
                    hidden: cint(df.hidden || 0),
                    read_only: cint(df.read_only || 0),
                    fieldtype: String(df.fieldtype || ""),
                });
            }
            frm[baselineKey] = baseline;
        }

        const baseline = frm[baselineKey];

        function dataFieldNames() {
            return (frm.meta?.fields || [])
                .filter((df) => df.fieldname && !layoutTypes.has(String(df.fieldtype || "")))
                .map((df) => df.fieldname);
        }

        function applyProperty(fieldname, property, value) {
            const field = frm.fields_dict?.[fieldname];
            if (!field) return;

            if (typeof frm.set_df_property === "function") {
                frm.set_df_property(fieldname, property, value);
                return;
            }

            field.df[property] = value;
            frm.refresh_field?.(fieldname);
        }

        async function showOnlyFields(fieldnames, options = {}) {
            const allowed = new Set(
                (Array.isArray(fieldnames) ? fieldnames : [fieldnames])
                    .map((value) => String(value || "").trim())
                    .filter(Boolean)
            );
            const known = new Set(dataFieldNames());
            const missing = Array.from(allowed).filter((fieldname) => !known.has(fieldname));

            for (const fieldname of known) {
                const isAllowed = allowed.has(fieldname);
                applyProperty(fieldname, "hidden", isAllowed ? 0 : 1);

                if (isAllowed && options.restore_read_only !== false) {
                    const original = baseline.get(fieldname);
                    if (original) applyProperty(fieldname, "read_only", original.read_only);
                }
            }

            if (options.keep_fields) {
                for (const fieldname of options.keep_fields) {
                    if (known.has(fieldname)) applyProperty(fieldname, "hidden", 0);
                }
            }

            frm.refresh_fields?.();

            if (missing.length) {
                console.warn(
                    `WMN POS dialog: fields not found on ${frm.doctype}:`,
                    missing
                );
            }

            await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve));
            return { missing };
        }

        async function showRequiredFields(extraFieldnames = [], options = {}) {
            const extra = Array.isArray(extraFieldnames)
                ? extraFieldnames
                : (extraFieldnames ? [extraFieldnames] : []);

            const required = [];
            for (const df of frm.meta?.fields || []) {
                const fieldname = String(df.fieldname || "").trim();
                if (!fieldname || layoutTypes.has(String(df.fieldtype || ""))) continue;

                const field = frm.fields_dict?.[fieldname];
                const isRequired = cint(field?.df?.reqd ?? df.reqd ?? 0) === 1;
                if (isRequired) required.push(fieldname);
            }

            const visible = Array.from(
                new Set(
                    required.concat(
                        extra
                            .map((value) => String(value || "").trim())
                            .filter(Boolean)
                    )
                )
            );

            const result = await showOnlyFields(visible, options);
            return {
                ...result,
                required_fields: required,
                visible_fields: visible,
            };
        }

        async function hideFields(fieldnames) {
            for (const fieldname of Array.isArray(fieldnames) ? fieldnames : [fieldnames]) {
                const key = String(fieldname || "").trim();
                if (!key || !baseline.has(key)) continue;
                const original = baseline.get(key);
                if (layoutTypes.has(original.fieldtype)) continue;
                applyProperty(key, "hidden", 1);
            }
            frm.refresh_fields?.();
            await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve));
        }

        async function restoreStructuralLayout() {
            for (const [fieldname, original] of baseline.entries()) {
                if (!layoutTypes.has(original.fieldtype)) continue;
                applyProperty(fieldname, "hidden", original.hidden);
                applyProperty(fieldname, "read_only", original.read_only);
            }
            frm.refresh_fields?.();
            await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve));
        }

        async function restoreFields() {
            for (const [fieldname, original] of baseline.entries()) {
                applyProperty(fieldname, "hidden", original.hidden);
                applyProperty(fieldname, "read_only", original.read_only);
            }
            frm.refresh_fields?.();
            await new Promise((resolve) => frameWindow.requestAnimationFrame(resolve));
        }

        const api = {
            showOnlyFields,
            showRequiredFields,
            hideFields,
            restoreStructuralLayout,
            restoreFields,
        };
        frm.__wmnPosDialogFieldApi = api;
        return api;
    }

    function ensureDialogContextApi(frameWindow, frm, dialogContext) {
        const fieldApi = frm.__wmnPosDialogFieldApi || buildDialogFieldApi(frameWindow, frm);

        dialogContext.apiVersion = 3;
        dialogContext.showOnlyFields = fieldApi.showOnlyFields;
        dialogContext.showRequiredFields = fieldApi.showRequiredFields;
        dialogContext.hideFields = fieldApi.hideFields;
        dialogContext.restoreFields = fieldApi.restoreFields;

        // Backward-compatible aliases for scripts written with snake_case.
        dialogContext.show_only_fields = fieldApi.showOnlyFields;
        dialogContext.show_required_fields = fieldApi.showRequiredFields;
        dialogContext.hide_fields = fieldApi.hideFields;
        dialogContext.restore_fields = fieldApi.restoreFields;

        frameWindow.__wmn_pos_dialog_context = dialogContext;
        return fieldApi;
    }

    async function installDialogScripts(iframe, dialog, config) {
        if (isOffline()) return;

        const [frm, scripts] = await Promise.all([
            waitForFrameForm(iframe, config.doctype),
            getDialogScriptsCached(config.doctype),
        ]);
        if (!scripts.length) return;

        const frameWindow = iframe.contentWindow;
        const frameFrappe = frameWindow?.frappe;
        if (!frameWindow || !frameFrappe?.ui?.form?.on) return;
        if (frameWindow.__wmnPosDialogScriptsInstalledFor === config.doctype) return;

        const scriptsByEvent = new Map();
        for (const row of scripts) {
            const event = String(row.event || "Refresh");
            if (!scriptsByEvent.has(event)) scriptsByEvent.set(event, []);
            scriptsByEvent.get(event).push(row);
        }

        const dialogContext = {
            source: "WMN POS",
            is_dialog: true,
            doctype: config.doctype,
            close: () => dialog.hide(),
            back: () => {
                if (!cint(config.is_single || 0)) showList(dialog, config);
            },
            notify: (message, indicator = "blue") => {
                frappe.show_alert({ message: String(message || ""), indicator }, 4);
            },
        };
        let fieldApi = ensureDialogContextApi(frameWindow, frm, dialogContext);

        frameWindow.__wmn_pos_dialog = true;
        frameWindow.__wmnPosDialogScriptsInstalledFor = config.doctype;

        async function runEvent(eventName, eventFrm) {
            // Refresh/re-navigation inside the iframe can replace cur_frm. Rebind the API
            // before every script execution so dialog scripts always receive the current form API.
            fieldApi = ensureDialogContextApi(frameWindow, eventFrm || frm, dialogContext);
            const rows = scriptsByEvent.get(eventName) || [];
            for (const row of rows) {
                const sourceName = String(row.script_name || row.name || "dialog-script")
                    .replace(/[\r\n]/g, " ");
                try {
                    if (typeof dialogContext.showOnlyFields !== "function") {
                        throw new Error(
                            `WMN POS dialog API is unavailable (apiVersion=${dialogContext.apiVersion || 0}). ` +
                            "Reload the POS assets before running this dialog script."
                        );
                    }
                    const runner = frameWindow.Function(
                        "frm",
                        "dialogContext",
                        `"use strict";\n${String(row.script || "")}\n//# sourceURL=wmn-pos-dialog:${sourceName}`
                    );
                    const result = runner(eventFrm, dialogContext);
                    const resolved = result && typeof result.then === "function" ? await result : result;
                    if (eventName === "Before Save" && resolved === false) {
                        throw new Error(__("Save was stopped by a WMN POS dialog script."));
                    }
                } catch (error) {
                    console.error(`WMN POS dialog script failed: ${sourceName}`, error);
                    if (eventName === "Before Save") throw error;
                    frappe.show_alert({
                        message: error?.message || __("A WMN POS dialog script failed."),
                        indicator: "red",
                    }, 5);
                } finally {
                    await fieldApi.restoreStructuralLayout();
                }
            }
        }

        const handlers = {};
        if (scriptsByEvent.has("Refresh")) {
            handlers.refresh = (eventFrm) => runEvent("Refresh", eventFrm);
        }
        if (scriptsByEvent.has("Before Save")) {
            handlers.before_save = (eventFrm) => runEvent("Before Save", eventFrm);
        }
        if (scriptsByEvent.has("After Save")) {
            handlers.after_save = (eventFrm) => runEvent("After Save", eventFrm);
        }
        if (Object.keys(handlers).length) {
            frameFrappe.ui.form.on(config.doctype, handlers);
        }

        if (scriptsByEvent.has("Setup")) await runEvent("Setup", frm);
        if (scriptsByEvent.has("Refresh")) await runEvent("Refresh", frm);
    }

    function offlineWideField(field) {
        return ["Small Text", "Long Text", "Text", "Text Editor", "Markdown Editor", "Code", "JSON"].includes(String(field?.fieldtype || ""));
    }

    function offlineInputValue(field, value) {
        if (value === undefined || value === null) return "";
        if (field.fieldtype === "Datetime") return String(value).replace(" ", "T").slice(0, 16);
        return String(value);
    }

    function offlineFieldControl(field, value, formEditable = true) {
        const fieldname = escapeHtml(field.fieldname);
        const label = escapeHtml(field.label || field.fieldname);
        const required = cint(field.required_offline || 0) ? `<span style="color:#b42318"> *</span>` : "";
        const editable = formEditable && cint(field.editable_offline || 0) === 1;
        const type = String(field.fieldtype || "Data");
        const normalized = offlineInputValue(field, value);
        const common = `class="form-control wmn-pos-offline-input" data-fieldname="${fieldname}" data-fieldtype="${escapeHtml(type)}"`;
        let control = "";

        if (!editable) {
            control = `<div class="wmn-pos-offline-readonly">${escapeHtml(normalized)}</div>`;
        } else if (type === "Check") {
            control = `<input class="wmn-pos-offline-input" data-fieldname="${fieldname}" data-fieldtype="Check" type="checkbox" ${cint(value || 0) ? "checked" : ""}>`;
        } else if (type === "Select") {
            const options = String(field.options || "").split(/\r?\n/).filter((item) => item !== "");
            control = `<select ${common}><option value=""></option>${options.map((option) => `<option value="${escapeHtml(option)}" ${String(option) === normalized ? "selected" : ""}>${escapeHtml(__(option))}</option>`).join("")}</select>`;
        } else if (["Small Text", "Long Text", "Text", "Text Editor", "Markdown Editor", "Code", "JSON"].includes(type)) {
            control = `<textarea ${common} rows="4">${escapeHtml(normalized)}</textarea>`;
        } else if (type === "Date") {
            control = `<input ${common} type="date" value="${escapeHtml(normalized.slice(0, 10))}">`;
        } else if (type === "Datetime") {
            control = `<input ${common} type="datetime-local" value="${escapeHtml(normalized)}">`;
        } else if (type === "Time") {
            control = `<input ${common} type="time" value="${escapeHtml(normalized.slice(0, 8))}">`;
        } else if (type === "Int") {
            control = `<input ${common} type="number" step="1" value="${escapeHtml(normalized)}">`;
        } else if (["Float", "Currency", "Percent", "Duration", "Rating"].includes(type)) {
            control = `<input ${common} type="number" step="any" value="${escapeHtml(normalized)}">`;
        } else if (type === "Color") {
            control = `<input ${common} type="color" value="${escapeHtml(normalized || "#000000")}">`;
        } else {
            control = `<input ${common} type="text" value="${escapeHtml(normalized)}" ${type === "Link" ? `placeholder="${escapeHtml(__("Cached or known {0} name", [field.options || __("document")]))}"` : ""}>`;
        }

        return `<div class="wmn-pos-offline-field${offlineWideField(field) ? " wide" : ""}" data-fieldname="${fieldname}">
            <label>${label}${required}</label>
            ${control}
            ${type === "Link" && field.options ? `<small>${escapeHtml(__("Link to {0}", [field.options]))}</small>` : ""}
        </div>`;
    }

    function collectOfflineValues(dialog, model) {
        const values = {};
        dialog.$wrapper.find(".wmn-pos-offline-input").each(function () {
            const input = this;
            const fieldname = String(input.dataset.fieldname || "");
            const fieldtype = String(input.dataset.fieldtype || "Data");
            if (!fieldname) return;
            let value;
            if (fieldtype === "Check") value = input.checked ? 1 : 0;
            else value = $(input).val();
            if (fieldtype === "Int" && value !== "") value = parseInt(value, 10) || 0;
            if (["Float", "Currency", "Percent", "Duration", "Rating"].includes(fieldtype) && value !== "") value = Number(value);
            if (fieldtype === "Datetime" && value) value = String(value).replace("T", " ");
            values[fieldname] = value;
        });
        for (const field of model?.fields || []) {
            if (!cint(field.editable_offline || 0)) continue;
            if (!Object.prototype.hasOwnProperty.call(values, field.fieldname)) values[field.fieldname] = "";
        }
        return values;
    }

    async function showOfflineForm(dialog, config, state) {
        for (const fn of dialog.__wmnCleanup.splice(0)) {
            try { fn(); } catch (error) {}
        }
        dialog.$wrapper.off(".wmnPosDoctypeView");
        configureDoctypeDialogLayout(dialog);

        const adapter = ns.Features.DoctypeManager.Offline;
        const model = await adapter.getModel(config.doctype);
        if (!model) throw new Error(__("Offline access is not configured for {0}.", [config.doctype]));

        let documentValues = {};
        let documentName = String(state.name || "");
        if (!state.isNew) {
            if (cint(config.is_single || 0) && !documentName) documentName = config.doctype;
            const cached = await adapter.getDocument(config.doctype, documentName);
            if (!cached) throw new Error(__("This document is not cached for offline use."));
            documentValues = cached;
            documentName = cached.name || documentName;
        }

        const canSave = state.isNew
            ? cint(config.can_create || 0)
            : (cint(config.can_write || 0) && cint(documentValues.docstatus || 0) === 0 ? 1 : 0);
        const fieldsHtml = (model.fields || []).map((field) => offlineFieldControl(field, documentValues[field.fieldname], Boolean(canSave))).join("");
        dialog.fields_dict.doctype_html.$wrapper.html(`
            <div class="wmn-pos-doctype-shell">
                <div class="wmn-pos-doctype-toolbar">
                    ${!cint(config.is_single || 0) ? `<button type="button" class="btn btn-default wmn-pos-doctype-back">${icon("back")}<span>${escapeHtml(__("Back to list"))}</span></button>` : ""}
                    <div style="flex:1 1 auto;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(__(config.label || config.doctype))}</div>
                    ${canSave ? `<button type="button" class="btn btn-primary wmn-pos-offline-save">${icon("save")}<span>${escapeHtml(__("Save Offline"))}</span></button>` : ""}
                </div>
                <div class="wmn-pos-offline-banner">${escapeHtml(state.isNew ? __("This document will be stored locally and created on the server during synchronization.") : __("Offline edits are stored locally. Server changes are conflict-checked during synchronization."))}</div>
                <div class="wmn-pos-offline-form">
                    ${documentName ? `<div style="margin-bottom:10px;font-size:11px;color:var(--text-muted,#6c7680);">${escapeHtml(__("Document"))}: <strong>${escapeHtml(documentName)}</strong></div>` : ""}
                    <div class="wmn-pos-offline-form-grid">${fieldsHtml || `<div class="wmn-pos-doctype-empty">${escapeHtml(__("No offline fields are configured for this DocType."))}</div>`}</div>
                </div>
            </div>`);

        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-back", () => showList(dialog, config));
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-offline-save", async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                const values = collectOfflineValues(dialog, model);
                const saved = await adapter.saveDocument({
                    doctype: config.doctype,
                    name: documentName,
                    is_new: Boolean(state.isNew),
                    values,
                });
                try { window.dispatchEvent(new CustomEvent("wmn:pos-doctype-queue-changed")); } catch (error) {}
                dialog.hide();
                frappe.show_alert({
                    message: __("Saved offline. Pending synchronization: {0}", [saved?.name || documentName || config.doctype]),
                    indicator: "orange",
                }, 5);
            } catch (error) {
                console.error("WMN POS offline DocType save failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to save the document offline."), indicator: "red" }, 5);
                button.disabled = false;
            }
        });
    }

    function syncStatusLabel(status) {
        if (status === "clean") return __("Synced");
        if (status === "pending_create") return __("Pending Create");
        if (status === "pending_update") return __("Pending Update");
        if (status === "conflict") return __("Conflict");
        if (status === "error") return __("Error");
        return __("Pending");
    }

    async function syncOneOfflineRecord(record, models) {
        const online = ns.Features.DoctypeManager.Online;
        const model = (models || []).find((row) => row.doctype === record.doctype);
        if (!model) throw new Error(__("Offline model is missing for {0}.", [record.doctype]));

        const editable = new Set((model.fields || []).filter((field) => cint(field.editable_offline || 0)).map((field) => field.fieldname));
        const values = {};
        for (const [key, value] of Object.entries(record.values || {})) {
            if (editable.has(key)) values[key] = value;
        }

        try {
            const operation = window.wmnPOSOffline?.resolveOfflineDoctypeOperation
                ? window.wmnPOSOffline.resolveOfflineDoctypeOperation(record, false)
                : (record.operation || (record.sync_status === "pending_create" ? "create" : "update"));
            const result = await online.syncOfflineDocument({
                doctype: record.doctype,
                operation,
                name: operation === "create" ? "" : record.name,
                base_modified: record.base_modified || record.modified || "",
                values,
            });
            if (!result) throw new Error(__("Empty synchronization response."));

            if (result.status === "conflict") {
                record.sync_status = "conflict";
                record.server_document = result.document || null;
                record.last_error = result.message || __("Server document changed while offline.");
                record.local_updated_at = new Date().toISOString();
                await window.wmnPOSOffline.putOfflineDoctypeRecord(record);
                return { status: "conflict", record, result };
            }

            if (result.status === "synced" || result.status === "server_wins") {
                const oldName = record.name;
                const newName = result.name || result.document?.name || oldName;
                await window.wmnPOSOffline.deleteOfflineDoctypeRecord(record.doctype, oldName);
                await window.wmnPOSOffline.putOfflineDoctypeRecord({
                    doctype: record.doctype,
                    name: newName,
                    modified: result.document?.modified || "",
                    base_modified: result.document?.modified || "",
                    sync_status: "clean",
                    operation: "",
                    values: Object.assign({}, result.document || {}, { name: newName }),
                    local_created_at: record.local_created_at || "",
                    local_updated_at: new Date().toISOString(),
                    last_error: "",
                    server_document: null,
                });
                if (oldName !== newName) {
                    await window.wmnPOSOffline.remapOfflineDoctypeLinkReference(record.doctype, oldName, newName, models);
                }
                return { status: result.status, record, result };
            }

            throw new Error(result.message || __("Unknown synchronization result."));
        } catch (error) {
            if (record.sync_status !== "conflict") {
                record.sync_status = "error";
                record.last_error = error?.message || String(error);
                record.local_updated_at = new Date().toISOString();
                await window.wmnPOSOffline.putOfflineDoctypeRecord(record);
            }
            throw error;
        } finally {
            try { window.dispatchEvent(new CustomEvent("wmn:pos-doctype-queue-changed")); } catch (error) {}
        }
    }

    async function resolveConflictWithServer(record) {
        if (!record?.server_document) throw new Error(__("Server copy is not available for this conflict."));
        await window.wmnPOSOffline.deleteOfflineDoctypeRecord(record.doctype, record.name);
        await window.wmnPOSOffline.putOfflineDoctypeRecord({
            doctype: record.doctype,
            name: record.server_document.name || record.name,
            modified: record.server_document.modified || "",
            base_modified: record.server_document.modified || "",
            sync_status: "clean",
            operation: "",
            values: record.server_document,
            local_created_at: "",
            local_updated_at: new Date().toISOString(),
            last_error: "",
            server_document: null,
        });
        try { window.dispatchEvent(new CustomEvent("wmn:pos-doctype-queue-changed")); } catch (error) {}
    }

    async function openOfflineSyncDialog() {
        ensureStyles();
        const dialog = new frappe.ui.Dialog({
            title: __("Offline Documents"),
            size: "large",
            fields: [{ fieldname: "sync_html", fieldtype: "HTML" }],
            primary_action_label: isOffline() ? __("Refresh") : __("Sync All"),
            primary_action: async () => {
                if (isOffline()) {
                    await render();
                    return;
                }
                const button = dialog.get_primary_btn?.();
                button?.prop?.("disabled", true);
                try {
                    const models = await ns.Features.DoctypeManager.Offline.getOfflineModels();
                    const pending = await window.wmnPOSOffline.getPendingOfflineDoctypeRecords();
                    const syncable = pending.filter((row) => row.sync_status !== "conflict")
                        .sort((a, b) => {
                            const ma = models.find((m) => m.doctype === a.doctype);
                            const mb = models.find((m) => m.doctype === b.doctype);
                            return cint(ma?.sync_order || 0) - cint(mb?.sync_order || 0);
                        });
                    for (const row of syncable) {
                        try {
                            const fresh = await window.wmnPOSOffline.getOfflineDoctypeRecord(row.doctype, row.name);
                            if (fresh && fresh.sync_status !== "clean") await syncOneOfflineRecord(fresh, models);
                        } catch (error) {
                            console.error("WMN POS offline document sync failed", row.key, error);
                        }
                    }
                    await render();
                } finally {
                    button?.prop?.("disabled", false);
                }
            },
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-doctype-sync-dialog");

        async function render() {
            const rows = await window.wmnPOSOffline?.getPendingOfflineDoctypeRecords?.() || [];
            const $wrapper = dialog.fields_dict.sync_html.$wrapper;
            if (!rows.length) {
                $wrapper.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(__("There are no pending offline documents."))}</div>`);
                return;
            }
            $wrapper.html(`<div class="wmn-pos-sync-list">${rows.map((row) => `
                <div class="wmn-pos-sync-row" data-key="${escapeHtml(row.key)}">
                    <div><strong>${escapeHtml(row.doctype)}</strong><small>${escapeHtml(row.name)}</small>${row.last_error ? `<small style="color:#b42318">${escapeHtml(row.last_error)}</small>` : ""}</div>
                    <span class="wmn-pos-doctype-sync-state" data-state="${escapeHtml(row.sync_status)}">${escapeHtml(syncStatusLabel(row.sync_status))}</span>
                    <span>${escapeHtml(formatModified(row.local_updated_at))}</span>
                    <div style="display:flex;gap:5px;justify-content:flex-end;">
                        ${!isOffline() && row.sync_status !== "conflict" ? `<button type="button" class="btn btn-xs btn-primary wmn-pos-sync-one">${escapeHtml(__("Sync"))}</button>` : ""}
                        ${row.sync_status === "conflict" && row.server_document ? `<button type="button" class="btn btn-xs btn-default wmn-pos-use-server">${escapeHtml(__("Use Server"))}</button>` : ""}
                    </div>
                </div>`).join("")}</div>`);
        }

        dialog.$wrapper.on("click.wmnPosDoctypeSync", ".wmn-pos-sync-one", async (event) => {
            if (isOffline()) return;
            const key = String($(event.currentTarget).closest(".wmn-pos-sync-row").attr("data-key") || "");
            const pending = await window.wmnPOSOffline.getPendingOfflineDoctypeRecords();
            const record = pending.find((row) => row.key === key);
            if (!record) return;
            const models = await ns.Features.DoctypeManager.Offline.getOfflineModels();
            event.currentTarget.disabled = true;
            try {
                await syncOneOfflineRecord(record, models);
            } catch (error) {
                frappe.show_alert({ message: error?.message || __("Synchronization failed."), indicator: "red" }, 5);
            }
            await render();
        });

        dialog.$wrapper.on("click.wmnPosDoctypeSync", ".wmn-pos-use-server", async (event) => {
            const key = String($(event.currentTarget).closest(".wmn-pos-sync-row").attr("data-key") || "");
            const pending = await window.wmnPOSOffline.getPendingOfflineDoctypeRecords();
            const record = pending.find((row) => row.key === key);
            if (!record) return;
            await resolveConflictWithServer(record);
            await render();
        });

        dialog.$wrapper.one("hidden.bs.modal.wmnPosDoctypeSync", () => dialog.$wrapper.off(".wmnPosDoctypeSync"));
        dialog.show();
        await render();
        return dialog;
    }

    async function initialize() {
        if (isOffline()) return false;
        const online = ns.Features.DoctypeManager.Online;
        if (!online?.cacheConfiguration) return false;
        try {
            const { models } = await online.cacheConfiguration();
            window.setTimeout(() => {
                online.preloadConfigured?.(models).catch((error) => console.warn("WMN POS offline DocType preload failed", error));
            }, 400);
            return true;
        } catch (error) {
            console.warn("WMN POS offline DocType configuration cache failed", error);
            return false;
        }
    }

    function formToolbarHtml(config, canSave) {
        return `
            <div class="wmn-pos-doctype-toolbar">
                ${!cint(config.is_single || 0) ? `<button type="button" class="btn btn-default wmn-pos-doctype-back">${icon("back")}<span>${escapeHtml(__("Back to list"))}</span></button>` : ""}
                <div style="flex:1 1 auto;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(__(config.label || config.doctype))}</div>
                ${canSave ? `<button type="button" class="btn btn-primary wmn-pos-doctype-save">${icon("save")}<span>${escapeHtml(__("Save"))}</span></button>` : ""}
            </div>`;
    }

    function isPendingLocalStatus(status) {
        return ["pending_create", "pending_update", "conflict", "error"].includes(String(status || ""));
    }

    async function shouldUseOfflineForm(config, state) {
        if (isOffline()) return true;
        if (state?.isNew) return false;
        if (state?.localRecord || isPendingLocalStatus(state?.syncStatus)) return true;

        const name = String(state?.name || "").trim();
        if (!name || !window.wmnPOSOffline?.getOfflineDoctypeRecord) return false;

        try {
            const record = await window.wmnPOSOffline.getOfflineDoctypeRecord(config.doctype, name);
            return Boolean(record && isPendingLocalStatus(record.sync_status));
        } catch (error) {
            console.warn("WMN POS could not inspect the local document state", error);
            return false;
        }
    }

    async function showForm(dialog, config, state) {
        if (await shouldUseOfflineForm(config, state)) {
            try {
                await showOfflineForm(dialog, config, state);
            } catch (error) {
                console.error("WMN POS offline form failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to open the offline form."), indicator: "red" }, 5);
                if (!cint(config.is_single || 0)) {
                    showList(dialog, config);
                } else {
                    dialog.fields_dict.doctype_html.$wrapper.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(error?.message || __("This Single DocType is not cached for offline use."))}</div>`);
                }
            }
            return;
        }
        for (const fn of dialog.__wmnCleanup.splice(0)) {
            try { fn(); } catch (error) {}
        }
        dialog.$wrapper.off(".wmnPosDoctypeView");
        configureDoctypeDialogLayout(dialog);

        const canSave = state.isNew ? cint(config.can_create || 0) : cint(config.can_write || 0);
        const url = buildFormUrl(config, state);
        dialog.fields_dict.doctype_html.$wrapper.html(`
            <div class="wmn-pos-doctype-shell">
                ${formToolbarHtml(config, canSave)}
                <div class="wmn-pos-doctype-frame-wrap">
                    <div class="wmn-pos-doctype-loading">${escapeHtml(__("Loading form..."))}</div>
                    <iframe class="wmn-pos-doctype-frame" src="${escapeHtml(url)}" title="${escapeHtml(config.doctype)}" allow="clipboard-read; clipboard-write"></iframe>
                </div>
            </div>`);
        fitDoctypeFrame(dialog);
        window.requestAnimationFrame(() => fitDoctypeFrame(dialog));

        const iframe = dialog.$wrapper.find(".wmn-pos-doctype-frame").get(0);
        const loading = dialog.$wrapper.find(".wmn-pos-doctype-loading");
        const formState = { sawNew: false, sawDirty: false, userEdited: false, saved: false };

        const getForm = () => {
            try {
                const frm = iframe?.contentWindow?.cur_frm;
                if (!frm || String(frm.doctype || "") !== String(config.doctype || "")) return null;
                return frm;
            } catch (error) {
                return null;
            }
        };

        const cacheSavedOnlineForm = async (frm) => {
            if (!frm?.doc || isOffline()) return;
            try {
                const model = await ns.Features.DoctypeManager.Offline?.getModel?.(config.doctype);
                if (!model) return;
                const existing = await window.wmnPOSOffline?.getOfflineDoctypeRecord?.(config.doctype, frm.doc.name);
                if (existing && existing.sync_status && existing.sync_status !== "clean") return;
                const values = {};
                for (const fieldname of [...(model.implicit_fields || []), ...(model.fields || []).map((field) => field.fieldname)]) {
                    if (!fieldname) continue;
                    values[fieldname] = frm.doc[fieldname];
                }
                values.name = frm.doc.name;
                await window.wmnPOSOffline?.putOfflineDoctypeRecord?.({
                    doctype: config.doctype,
                    name: frm.doc.name,
                    modified: frm.doc.modified || "",
                    base_modified: frm.doc.modified || "",
                    sync_status: "clean",
                    operation: "",
                    values,
                    local_created_at: "",
                    local_updated_at: new Date().toISOString(),
                    last_error: "",
                    server_document: null,
                });
            } catch (error) {
                console.warn("WMN POS could not refresh the offline document cache after online save", error);
            }
        };

        const finishSaved = (name, frm) => {
            if (formState.saved) return;
            formState.saved = true;
            const savedName = String(name || "");
            if (config.doctype === "WMN POS Dialog Script") {
                dialogScriptCache.clear();
            }
            if (["WMN POS Offline DocType", "WMN POS Menu Settings"].includes(config.doctype)) {
                window.setTimeout(() => initialize(), 50);
            }
            cacheSavedOnlineForm(frm);
            dialog.hide();
            frappe.show_alert({
                message: savedName ? __("Saved {0}", [savedName]) : __("Document saved."),
                indicator: "green",
            }, 4);
        };

        iframe.addEventListener("load", () => {
            try {
                const frameDocument = iframe.contentDocument || iframe.contentWindow?.document;
                injectFrameStyles(frameDocument);
                hideFrameChrome(frameDocument);

                const markEdited = () => { formState.userEdited = true; };
                frameDocument.addEventListener("input", markEdited, true);
                frameDocument.addEventListener("change", markEdited, true);

                const chromeObserver = new MutationObserver(() => {
                    hideFrameChrome(frameDocument);
                });
                chromeObserver.observe(frameDocument.body, { childList: true, subtree: true });

                installDialogScripts(iframe, dialog, config).catch((error) => {
                    console.error("WMN POS dialog script installation failed", error);
                    frappe.show_alert({
                        message: error?.message || __("Unable to load WMN POS dialog scripts."),
                        indicator: "red",
                    }, 5);
                });

                dialog.__wmnCleanup.push(() => {
                    try {
                        chromeObserver.disconnect();
                        frameDocument.removeEventListener("input", markEdited, true);
                        frameDocument.removeEventListener("change", markEdited, true);
                    } catch (error) {}
                });
                loading.hide();
            } catch (error) {
                console.error("WMN POS form iframe access failed", error);
                loading.text(__("Unable to load the form inside the dialog."));
            }
        });

        const watcher = window.setInterval(() => {
            const frm = getForm();
            if (!frm || formState.saved) return;
            const isNew = typeof frm.is_new === "function" ? frm.is_new() : Boolean(frm.doc?.__islocal);
            const isDirty = typeof frm.is_dirty === "function" ? frm.is_dirty() : Boolean(frm.doc?.__unsaved);
            if (isNew) formState.sawNew = true;
            if (formState.userEdited && isDirty) formState.sawDirty = true;

            const newWasSaved = formState.sawNew && !isNew && Boolean(frm.doc?.name);
            const editWasSaved = formState.userEdited && formState.sawDirty && !isDirty && Boolean(frm.doc?.name);
            if (newWasSaved || editWasSaved) finishSaved(frm.doc.name, frm);
        }, FORM_WATCH_INTERVAL);
        dialog.__wmnCleanup.push(() => window.clearInterval(watcher));
        dialog.__wmnCleanup.push(() => {
            try {
                iframe.src = "about:blank";
                iframe.remove();
            } catch (error) {}
        });

        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-back", () => showList(dialog, config));
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-save", async (event) => {
            const button = event.currentTarget;
            const frm = getForm();
            if (!frm) {
                frappe.show_alert({ message: __("The form is still loading."), indicator: "orange" });
                return;
            }
            button.disabled = true;
            try {
                await frm.save();
                finishSaved(frm.doc?.name, frm);
            } catch (error) {
                console.error("WMN POS DocType save failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to save document."), indicator: "red" });
                button.disabled = false;
            }
        });
    }

    ns.Features.DoctypeManager.Common = {
        openMenu,
        openDoctypeDialog,
        openOfflineSyncDialog,
        initialize,
    };
    window.WMNPOSDoctypeManager = ns.Features.DoctypeManager.Common;
})();
