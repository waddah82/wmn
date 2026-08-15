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
                width: min(1480px, 96vw);
                max-width: 1480px;
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
            body.wmn-mamsek-pos-route .wmn-pos-doctype-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px 150px; gap: 10px; align-items: center; width: 100%; min-height: 52px; margin-bottom: 6px; padding: 8px 11px; border: 1px solid var(--border-color, #d1d8dd); border-radius: 9px; background: var(--card-bg, #fff); color: var(--text-color, #1f2937); text-align: start; cursor: pointer; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row:hover { border-color: var(--primary, #2490ef); }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            body.wmn-mamsek-pos-route .wmn-pos-doctype-row span { overflow: hidden; color: var(--text-muted, #6c7680); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
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
                body.wmn-mamsek-pos-route .wmn-pos-doctype-row { grid-template-columns: 1fr; gap: 3px; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar { flex-wrap: wrap; }
                body.wmn-mamsek-pos-route .wmn-pos-doctype-toolbar .wmn-pos-doctype-search { flex-basis: 100%; order: 3; }
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
            ? `<div class="wmn-pos-manager-offline-note">${escapeHtml(__("DocType management is online-only in the current phase. POS offline tools remain available."))}</div>`
            : "";

        return `
            <div class="wmn-pos-manager-shell">
                <section class="wmn-pos-manager-section">
                    <div class="wmn-pos-manager-section-head"><h4>${escapeHtml(__("POS Tools"))}</h4></div>
                    <div class="wmn-pos-manager-grid">${tools}</div>
                </section>
                ${offlineNote}
                ${managementSections || (!isOffline() ? `<div class="wmn-pos-doctype-empty">${escapeHtml(__("No WMN POS DocTypes are available for your permissions."))}</div>` : "")}
            </div>`;
    }

    async function openMenu(itemSelector) {
        ensureStyles();
        const adapter = getAdapter();
        let doctypes = [];

        if (!isOffline()) {
            try {
                doctypes = await adapter.getAvailableDoctypes();
            } catch (error) {
                console.error("WMN POS DocType permission load failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to load WMN POS menu."), indicator: "red" });
            }
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
                <div class="wmn-pos-doctype-list"><div class="wmn-pos-doctype-empty">${escapeHtml(__("Loading..."))}</div></div>
            </div>`;
    }

    function rowTitle(row, config) {
        const titleField = String(config.title_field || "");
        return String((titleField && row?.[titleField]) || row?.name || "");
    }

    function formatModified(value) {
        if (!value) return "";
        try {
            return frappe.datetime?.str_to_user ? frappe.datetime.str_to_user(value) : String(value);
        } catch (error) {
            return String(value);
        }
    }

    async function renderDocuments(dialog, config, searchValue) {
        const $list = dialog.$wrapper.find(".wmn-pos-doctype-list");
        $list.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(__("Loading..."))}</div>`);
        const rows = await getAdapter().listDocuments({
            doctype: config.doctype,
            title_field: config.title_field,
            search: searchValue,
            limit_start: 0,
            limit_page_length: LIST_LIMIT,
        });

        if (!rows.length) {
            $list.html(`<div class="wmn-pos-doctype-empty">${escapeHtml(__("No documents found."))}</div>`);
            return;
        }

        $list.html(rows.map((row) => `
            <button type="button" class="wmn-pos-doctype-row" data-name="${escapeHtml(row.name)}">
                <strong>${escapeHtml(rowTitle(row, config))}</strong>
                <span>${escapeHtml(row.name)}</span>
                <span>${escapeHtml(formatModified(row.modified))}</span>
            </button>`).join(""));
    }

    function debounce(fn, delay) {
        let timer = null;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }

    async function openDoctypeDialog(config) {
        if (isOffline()) {
            frappe.show_alert({ message: __("POS DocType management is online-only in the current phase."), indicator: "orange" });
            return null;
        }

        ensureStyles();
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
            showForm(dialog, config, { isNew: false, name: "" });
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
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-add", () => showForm(dialog, config, { isNew: true, name: "" }));
        dialog.$wrapper.on("click.wmnPosDoctypeView", ".wmn-pos-doctype-row", (event) => {
            showForm(dialog, config, { isNew: false, name: String($(event.currentTarget).attr("data-name") || "") });
        });
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

        frameWindow.__wmn_pos_dialog = true;
        frameWindow.__wmn_pos_dialog_context = dialogContext;
        frameWindow.__wmnPosDialogScriptsInstalledFor = config.doctype;

        async function runEvent(eventName, eventFrm) {
            const rows = scriptsByEvent.get(eventName) || [];
            for (const row of rows) {
                const sourceName = String(row.script_name || row.name || "dialog-script")
                    .replace(/[\r\n]/g, " ");
                try {
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

    function formToolbarHtml(config, canSave) {
        return `
            <div class="wmn-pos-doctype-toolbar">
                ${!cint(config.is_single || 0) ? `<button type="button" class="btn btn-default wmn-pos-doctype-back">${icon("back")}<span>${escapeHtml(__("Back to list"))}</span></button>` : ""}
                <div style="flex:1 1 auto;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(__(config.label || config.doctype))}</div>
                ${canSave ? `<button type="button" class="btn btn-primary wmn-pos-doctype-save">${icon("save")}<span>${escapeHtml(__("Save"))}</span></button>` : ""}
            </div>`;
    }

    function showForm(dialog, config, state) {
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

        const finishSaved = (name) => {
            if (formState.saved) return;
            formState.saved = true;
            const savedName = String(name || "");
            if (config.doctype === "WMN POS Dialog Script") {
                dialogScriptCache.clear();
            }
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
            if (newWasSaved || editWasSaved) finishSaved(frm.doc.name);
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
                finishSaved(frm.doc?.name);
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
    };
    window.WMNPOSDoctypeManager = ns.Features.DoctypeManager.Common;
})();
