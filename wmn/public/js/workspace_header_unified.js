/*
 * WMN Unified Workspace Navigation
 * - One file for Header Bar or Sidebar mode.
 * - Uses the same frontend-safe source for both modes:
 *   frappe.boot.allowed_workspaces + frappe.desk.desktop.get_desktop_page
 * - No custom Python method is required.
 */

(function () {
    "use strict";

    const WMN_NAV = {
        loaded: false,
        mode: "disabled",
        settings: {},
        pageCache: {},
        settingCacheKey: "wmn_workspace_nav_settings_v1",
        settingLastCheckKey: "wmn_workspace_nav_settings_last_check_v1",
        settingCacheMs: 5 * 60 * 1000
    };

    window.WMN_WORKSPACE_NAV = WMN_NAV;

    function __(text) {
        if (window.frappe && frappe._) return frappe._(text || "");
        if (window.frappe && window.__) return window.__(text || "");
        return text || "";
    }

    function esc(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cssId(value) {
        return String(value || "")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .replace(/^_+/, "") || "workspace";
    }

    function addFontAwesome() {
        if (document.getElementById("wmn-fa-6")) return;
        const fa = document.createElement("link");
        fa.id = "wmn-fa-6";
        fa.rel = "stylesheet";
        fa.href = "/assets/wmn/css/all.min.css";
        document.head.appendChild(fa);
    }

    function waitForDesk(callback, tries) {
        tries = tries || 0;
        if (window.frappe && frappe.boot && Array.isArray(frappe.boot.allowed_workspaces)) {
            callback();
            return;
        }
        if (tries > 80) {
            console.warn("WMN Workspace Nav: frappe.boot.allowed_workspaces is not ready.");
            return;
        }
        setTimeout(function () {
            waitForDesk(callback, tries + 1);
        }, 150);
    }

    function getSettingBool(obj, names) {
        for (const name of names) {
            if (obj && Object.prototype.hasOwnProperty.call(obj, name)) {
                const value = obj[name];
                return value === 1 || value === true || value === "1" || value === "true" || value === "Yes";
            }
        }
        return false;
    }

    function resolveMode(settings) {
        const rawMode = String(
            settings.workspace_navigation_mode ||
            settings.workspace_layout_mode ||
            settings.workspace_menu_mode ||
            settings.layout_mode ||
            settings.workspace_mode ||
            ""
        ).toLowerCase();

        if (rawMode.includes("sidebar") || rawMode.includes("side") || rawMode.includes("سايد")) return "sidebar";
        if (rawMode.includes("header") || rawMode.includes("top") || rawMode.includes("هيدر")) return "header";

        const enableSidebar = getSettingBool(settings, [
            "enable_workspace_sidebar",
            "enable_sidebar",
            "enable_custom_sidebar",
            "workspace_sidebar_enabled"
        ]);

        const enableHeader = getSettingBool(settings, [
            "enable_workspace_header",
            "enable_header",
            "workspace_header_enabled"
        ]);

        if (enableSidebar) return "sidebar";
        if (enableHeader) return "header";
        return "disabled";
    }

    function loadSettings(callback) {
        const now = Date.now();
        const lastCheck = parseInt(localStorage.getItem(WMN_NAV.settingLastCheckKey) || "0", 10);
        const cached = localStorage.getItem(WMN_NAV.settingCacheKey);

        if (cached && lastCheck && (now - lastCheck) < WMN_NAV.settingCacheMs) {
            try {
                const settings = JSON.parse(cached);
                callback(settings || {});
                return;
            } catch (e) {
                localStorage.removeItem(WMN_NAV.settingCacheKey);
            }
        }

        if (!window.frappe || !frappe.call) {
            callback({});
            return;
        }

        frappe.call({
            method: "frappe.client.get",
            args: {
                doctype: "WMN Settings",
                name: "WMN Settings"
            },
            callback: function (r) {
                const settings = r && r.message ? r.message : {};
                localStorage.setItem(WMN_NAV.settingCacheKey, JSON.stringify(settings));
                localStorage.setItem(WMN_NAV.settingLastCheckKey, String(now));
                callback(settings);
            },
            error: function () {
                callback({});
            }
        });
    }

    function getAllowedWorkspaces() {
        return (frappe.boot.allowed_workspaces || []).filter(Boolean);
    }

    function getRootWorkspaces() {
        return getAllowedWorkspaces().filter(ws => !ws.parent_page);
    }

    function getWorkspaceFamily(selectedName) {
        const all = getAllowedWorkspaces();
        const current = all.find(w => w.name === selectedName);
        if (!current) return [];
        const parentName = current.parent_page || current.name;
        const parent = all.find(w => w.name === parentName) || current;
        return [parent].concat(all.filter(w => w.parent_page === parentName));
    }

    function getWorkspaceChildren(parentName) {
        return getAllowedWorkspaces().filter(w => w.parent_page === parentName);
    }

    function getWorkspaceTitle(ws) {
        return __(ws.label || ws.title || ws.name || "Workspace");
    }

    function getWorkspaceIcon(ws) {
        return ws.icon || "fa fa-th-large";
    }

    function fetchDesktopPage(name) {
        return new Promise((resolve) => {
            if (WMN_NAV.pageCache[name]) {
                resolve(WMN_NAV.pageCache[name]);
                return;
            }
            frappe.call({
                method: "frappe.desk.desktop.get_desktop_page",
                args: { page: { name: name, public: 1 } },
                callback: function (r) {
                    const data = r && r.message ? r.message : {};
                    WMN_NAV.pageCache[name] = data;
                    resolve(data);
                },
                error: function () {
                    resolve({});
                }
            });
        });
    }

    function buildRoute(item) {
        if (!item) return "";

        const isLink = item.type === "Link";
        const targetType = (isLink ? item.link_type : item.type || "").toLowerCase();
        const targetName = item.link_to || item.doc_name || item.name;

        if (item.url) {
            return item.type === "URL" || /^https?:\/\//i.test(item.url) ? item.url : `/app/${item.url.replace(/^#?\/app\//, "")}`;
        }

        if (item.link) {
            const link = item.link.replace(/^#/, "");
            return link.startsWith("/app/") ? link : `/app/${link.replace(/^\/app\//, "")}`;
        }

        if (!targetName) return "";

        let route = "";
        if (targetType === "doctype") {
            const slug = frappe.router.slug(targetName);
            const isSingle = frappe.model && frappe.model.is_single && frappe.model.is_single(targetName);

            if (isSingle) {
                route = slug;
            } else if (isLink || !item.doc_view) {
                route = `${slug}/view/list`;
            } else {
                switch (item.doc_view) {
                    case "List": route = `${slug}/view/list`; break;
                    case "Tree": route = `${slug}/view/tree`; break;
                    case "Report Builder": route = `${slug}/view/report`; break;
                    case "Dashboard": route = `${slug}/view/dashboard`; break;
                    case "New": route = `${slug}/new`; break;
                    case "Calendar": route = `${slug}/view/calendar/default`; break;
                    case "Kanban":
                        route = `${slug}/view/kanban`;
                        if (item.kanban_board) route += `/${item.kanban_board}`;
                        break;
                    default:
                        route = slug;
                }
            }
        } else if (targetType === "report") {
            route = item.is_query_report
                ? `query-report/${targetName}`
                : (item.doctype ? `${frappe.router.slug(item.doctype)}/view/report/${targetName}` : `report/${targetName}`);
        } else if (targetType === "page") {
            route = targetName;
        } else if (targetType === "dashboard") {
            route = `dashboard-view/${targetName}`;
        } else if (targetType === "url") {
            route = targetName;
        } else {
            route = frappe.router.slug(targetName);
        }

        if (/^https?:\/\//i.test(route)) return route;
        return `/app/${route.replace(/^\/app\//, "")}`;
    }

    function navigate(itemOrRoute) {
        const route = typeof itemOrRoute === "string" ? itemOrRoute : buildRoute(itemOrRoute);
        if (!route) return;

        if (/^https?:\/\//i.test(route)) {
            window.open(route, "_blank");
            return;
        }

        if (window.frappe && frappe.set_route) {
            frappe.set_route(route.replace(/^\/app\//, ""));
        } else {
            window.location.href = route;
        }
    }

    function getLinkIcon(item) {
        const type = item.link_type || item.type || "Link";
        const icons = {
            "DocType": "fa fa-table",
            "Report": "fa fa-chart-line",
            "Page": "fa fa-file-alt",
            "Dashboard": "fa fa-dashboard",
            "URL": "fa fa-external-link",
            "Link": "fa fa-link"
        };
        return item.icon || icons[type] || "fa fa-link";
    }

    function addUnifiedStyles() {
        if (document.getElementById("wmn-workspace-unified-style")) return;

        const style = document.createElement("style");
        style.id = "wmn-workspace-unified-style";
        style.textContent = `
            :root {
                --wmn-gold: #BA9F63;
                --wmn-blue: #153351;
                --wmn-blue-dark: #0f2a44;
                --wmn-border: #d1d9e0;
            }

            .wmn-global-workspace-header {
                position: sticky;
                top: 0;
                left: 0;
                right: 0;
                z-index: 10000;
                background: #fff;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }

            .wmn-dashboard-header {
                background: #fff;
                border-bottom: 1px solid var(--wmn-border);
                display: flex;
                align-items: center;
                padding: 0 20px;
                min-height: 42px;
                overflow: hidden;
                transition: height .25s ease, min-height .25s ease;
            }

            .wmn-dashboard-header.collapsed {
                height: 0 !important;
                min-height: 0 !important;
                border-bottom: 0 !important;
            }

            .wmn-workspace-menu {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                width: 100%;
                gap: 4px;
            }

            .wmn-workspace-btn,
            .wmn-tab-btn {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 6px 9px !important;
                font-size: var(--text-base, 13px) !important;
                font-weight: 500;
                color: var(--text-color, #555b6b) !important;
                cursor: pointer;
                border-radius: 0;
                position: relative;
                max-width: 220px;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .wmn-workspace-btn:hover,
            .wmn-tab-btn:hover {
                color: var(--wmn-gold) !important;
                background: #f8f9fa !important;
            }

            .wmn-workspace-btn.active,
            .wmn-tab-btn.active {
                color: var(--wmn-gold) !important;
                font-weight: 700;
            }

            .wmn-workspace-btn.active::after,
            .wmn-tab-btn.active::after {
                content: "";
                position: absolute;
                bottom: -1px;
                left: 8px;
                right: 8px;
                height: 2px;
                background: var(--wmn-gold);
            }

            .wmn-toggle-header-btn {
                position: absolute;
                bottom: -19px;
                left: 50%;
                transform: translateX(-50%);
                width: 28px;
                height: 19px;
                background: #fff;
                border: 1px solid var(--wmn-border);
                border-top: none;
                cursor: pointer;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 0 0 6px 6px;
            }

            .wmn-workspace-dropdown {
                position: absolute;
                left: 0;
                right: 0;
                background: #fff;
                box-shadow: 0 4px 12px rgba(0,0,0,.15);
                display: none;
                z-index: 9999;
                max-height: 80vh;
                overflow-y: auto;
                padding: 16px;
            }
            .wmn-workspace-btn {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                padding: 4px 7px !important;
                font-size: 12px !important;
                font-weight: 500;
                color: #555b6b !important;
                cursor: pointer;
                transition: color 0.2s ease;
                position: relative;
                flex: 1 1 40px;
                min-width: 40px;
                max-width: 100%;
                font-size: var(--text-base) !important;
                color: var(--text-color);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .wmn-workspace-dropdown.show { display: block !important; }
            .wmn-tab-navbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; background: #f8f9fa; border-bottom: 1px solid #eee; }

            .wmn-workspace-content { padding: 14px; }
            .wmn-section-title { font-weight: 700; font-size: var(--text-lg, 16px); margin: 6px 0 12px; color: var(--text-color, #1d1d1d); }
            .wmn-shortcuts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
            .wmn-card-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
            .wmn-card-group { background: #fafafa; padding: 14px; border-radius: 8px; border: 1px solid #eee; }
            .wmn-card-title { font-weight: 700; font-size: var(--text-base, 13px); margin-bottom: 10px; color: var(--text-color, #3e4047); display: flex; align-items: center; gap: 8px; }

            .wmn-link-item,
            .wmn-shortcut-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 7px 9px;
                color: var(--text-color, #555b6b) !important;
                text-decoration: none !important;
                font-size: var(--text-base, 13px);
                border-radius: 6px;
                cursor: pointer;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }
            .wmn-link-item:hover,
            .wmn-shortcut-item:hover { color: var(--wmn-gold) !important; background: #fff; }
            .wmn-loading, .wmn-empty, .wmn-error { padding: 18px; text-align: center; color: #94a3b8; }
            .wmn-error { color: #ef4444; }

            .wmn-custom-sidebar {
                position: fixed;
                top: 0;
                left: 0;
                width: 270px;
                height: 100vh;
                background: linear-gradient(180deg, var(--wmn-blue) 0%, var(--wmn-blue-dark) 100%);
                color: #DAE1E3;
                overflow: hidden;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                box-shadow: 6px 0 24px rgba(0,0,0,.35);
                transition: width .25s ease, transform .25s ease;
            }

            .wmn-custom-sidebar.collapsed { width: 10px; }
            body.rtl-mode .wmn-custom-sidebar { right: 0; left: auto; direction: rtl; text-align: right; }

            .wmn-sidebar-toggle {
                position: absolute;
                top: 10px;
                right: -25px;
                cursor: pointer;
                color: #fff;
                z-index: 10000;
            }
            body.rtl-mode .wmn-sidebar-toggle { left: -25px; right: auto; }

            .wmn-user-section {
                padding: 15px 20px;
                border-bottom: 1px solid rgba(255,255,255,.08);
                background: rgba(0,0,0,.15);
                flex-shrink: 0;
            }
            .wmn-user-info { display: flex; align-items: center; gap: 10px; font-weight: 500; color: #fff; }

            .wmn-modules-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                min-height: 0;
                scrollbar-width: thin;
                scrollbar-color: rgba(186,159,99,.6) transparent;
            }
            .wmn-modules-container::-webkit-scrollbar { width: 4px; }
            .wmn-modules-container::-webkit-scrollbar-track { background: transparent; }
            .wmn-modules-container::-webkit-scrollbar-thumb { background: rgba(186,159,99,.65); border-radius: 10px; }

            .wmn-module-item,
            .wmn-sidebar-workspace-item,
            .wmn-sidebar-card-item { background: transparent; border-radius: 0; margin: 0; }

            .wmn-module-header,
            .wmn-sidebar-workspace-header,
            .wmn-sidebar-card-header,
            .wmn-sidebar-link {
                position: relative;
                display: flex;
                align-items: center;
                gap: 10px;
                cursor: pointer;
                border: none;
                box-shadow: none;
                background: transparent;
                transition: background-color .15s ease, transform .15s ease;
            }
            .wmn-module-header { padding: 10px 5px; font-size: 15px; font-weight: 700; }
            .wmn-sidebar-workspace-header { padding: 8px 12px; font-size: 14px; }
            .wmn-sidebar-card-header { padding: 6px 22px; font-size: 13px; background: rgba(255,255,255,.04); }
            .wmn-sidebar-link { padding: 7px 18px 7px 38px; font-size: 13px; color: #DAE1E3; }

            .wmn-module-header:hover,
            .wmn-sidebar-workspace-header:hover,
            .wmn-sidebar-card-header:hover,
            .wmn-sidebar-link:hover { background: rgba(186,159,99,.18); transform: translateX(2px); }

            body.rtl-mode .wmn-module-header:hover,
            body.rtl-mode .wmn-sidebar-workspace-header:hover,
            body.rtl-mode .wmn-sidebar-card-header:hover,
            body.rtl-mode .wmn-sidebar-link:hover { transform: translateX(-2px); }

            .wmn-module-header::before,
            .wmn-sidebar-workspace-header::before,
            .wmn-sidebar-card-header::before,
            .wmn-sidebar-link::before {
                content: "";
                position: absolute;
                left: 0;
                top: 0;
                width: 0;
                height: 100%;
                background: var(--wmn-gold);
                transition: width .15s ease;
            }
            body.rtl-mode .wmn-module-header::before,
            body.rtl-mode .wmn-sidebar-workspace-header::before,
            body.rtl-mode .wmn-sidebar-card-header::before,
            body.rtl-mode .wmn-sidebar-link::before { right: 0; left: auto; }

            .wmn-module-header:hover::before,
            .wmn-sidebar-workspace-header:hover::before,
            .wmn-sidebar-card-header:hover::before,
            .wmn-sidebar-link:hover::before { width: 3px; }

            .wmn-menu-text { flex: 1; color: #DAE1E3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .wmn-module-header i,
            .wmn-sidebar-workspace-header i,
            .wmn-sidebar-card-header i,
            .wmn-sidebar-link i { color: var(--wmn-gold); opacity: .9; width: 16px; text-align: center; }
            .wmn-module-content, .wmn-sidebar-workspace-content, .wmn-sidebar-card-content { display: none; background: rgba(0,0,0,.12); }
            .wmn-module-content.active, .wmn-sidebar-workspace-content.active, .wmn-sidebar-card-content.active { display: block; }
            .wmn-dropdown-icon { margin-inline-start: auto; opacity: .75; transition: transform .2s ease; }
            .active-parent > .wmn-dropdown-icon, .wmn-dropdown-icon.open { transform: rotate(180deg); }

            .wmn-floating-sidebar-btn {
                position: fixed;
                top: 35px;
                left: 2px;
                width: 30px;
                height: 30px;
                background: #4b4b4b;
                color: #fff;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10000;
                font-size: 20px;
                box-shadow: 0 4px 10px rgba(0,0,0,.2);
            }
            body.rtl-mode .wmn-floating-sidebar-btn { right: 2px; left: auto; }

            .wmn-hide-standard-sidebar .standard-sidebar,
            .wmn-hide-standard-sidebar .desk-sidebar,
            .wmn-hide-standard-sidebar .layout-side-section,
            .wmn-hide-standard-sidebar .search-dialog .search-results .search-sidebar {
                display: none !important;
                width: 0 !important;
                max-width: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                border: 0 !important;
            }

            @media (max-width: 768px) {
                .wmn-custom-sidebar { width: 92vw; max-width: 320px; }
                .wmn-custom-sidebar.collapsed { width: 10px; }
                .wmn-card-groups, .wmn-shortcuts-grid { grid-template-columns: 1fr; }
                .wmn-workspace-dropdown { max-height: 75vh; padding: 10px; }
            }
            .wmn-shortcuts-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
                gap: 20px;
                margin-top: 10px;
            }
            .wmn-card-groups {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 20px;
                margin-top: 10px;
            }
        `;
        document.head.appendChild(style);
    }

    function cleanupUI() {
        document.querySelectorAll(".wmn-global-workspace-header, .wmn-custom-sidebar, .wmn-floating-sidebar-btn").forEach(el => el.remove());
        document.body.classList.remove("wmn-hide-standard-sidebar", "custom-loaded");
    }

    function setRTL() {
        const lang = frappe.boot && frappe.boot.user && frappe.boot.user.language;
        if (lang && String(lang).startsWith("ar")) document.body.classList.add("rtl-mode");
    }

    function renderLinkElement(item, className, afterNavigate) {
        const a = document.createElement("a");
        a.className = className;
        a.href = buildRoute(item) || "#";
        a.title = item.label || item.name || item.link_to || "";
        a.innerHTML = `<i class="${esc(getLinkIcon(item))}"></i><span>${esc(__(item.label || item.name || item.link_to || "Link"))}</span>`;
        a.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            navigate(item);
            if (typeof afterNavigate === "function") afterNavigate();
        };
        return a;
    }

    function renderWorkspaceBody(data, container, options) {
        options = options || {};
        container.innerHTML = "";
        let hasContent = false;

        const shortcuts = data.shortcuts && data.shortcuts.items ? data.shortcuts.items : [];
        if (shortcuts.length) {
            const section = document.createElement("div");
            section.className = "wmn-workspace-section";
            section.innerHTML = `<div class="wmn-section-title">${esc(__("Your Shortcuts"))}</div>`;
            const grid = document.createElement("div");
            grid.className = "wmn-shortcuts-grid";
            shortcuts.forEach(item => {
                if (item.link_to || item.url || item.doc_name || item.link) {
                    grid.appendChild(renderLinkElement(item, "wmn-shortcut-item", options.afterNavigate));
                    hasContent = true;
                }
            });
            section.appendChild(grid);
            container.appendChild(section);
        }

        const cards = data.cards && data.cards.items ? data.cards.items : [];
        if (cards.length) {
            const section = document.createElement("div");
            section.className = "wmn-workspace-section";
            section.innerHTML = `<div class="wmn-section-title">${esc(__("Reports & Masters"))}</div>`;
            const groups = document.createElement("div");
            groups.className = "wmn-card-groups";

            cards.forEach(card => {
                if (!card.links || !card.links.length) return;
                const group = document.createElement("div");
                group.className = "wmn-card-group";
                group.innerHTML = `<div class="wmn-card-title"><i class="${esc(card.icon || "fa fa-folder")}"></i>${esc(__(card.label || "Links"))}</div>`;
                card.links.forEach(link => {
                    group.appendChild(renderLinkElement(link, "wmn-link-item", options.afterNavigate));
                    hasContent = true;
                });
                groups.appendChild(group);
            });

            section.appendChild(groups);
            container.appendChild(section);
        }

        if (data.number_cards && data.number_cards.items && data.number_cards.items.length && window.frappe && frappe.widget && frappe.widget.WidgetGroup) {
            const numberContainer = document.createElement("div");
            numberContainer.className = "number-card-section";
            numberContainer.style.margin = "16px 0";
            container.appendChild(numberContainer);
            new frappe.widget.WidgetGroup({
                container: $(numberContainer),
                type: "number_card",
                columns: 4,
                widgets: data.number_cards.items,
                options: { allow_sorting: false, allow_config: false }
            });
            hasContent = true;
        }

        if (data.charts && data.charts.items && data.charts.items.length && window.frappe && frappe.widget && frappe.widget.WidgetGroup) {
            const chartContainer = document.createElement("div");
            chartContainer.className = "chart-section";
            chartContainer.style.margin = "16px 0";
            container.appendChild(chartContainer);
            new frappe.widget.WidgetGroup({
                container: $(chartContainer),
                type: "chart",
                columns: 1,
                widgets: data.charts.items,
                options: { allow_sorting: false, allow_config: false }
            });
            hasContent = true;
        }

        if (!hasContent) {
            container.innerHTML = `<div class="wmn-empty">${esc(__("Empty Workspace"))}</div>`;
        }
    }

    function initHeaderMode() {
        if (document.querySelector(".wmn-global-workspace-header")) return;
        function bindHeaderOutsideClick() {
            if (window.__WMN_HEADER_OUTSIDE_CLICK_BOUND__) return;
            window.__WMN_HEADER_OUTSIDE_CLICK_BOUND__ = true;
        
            document.addEventListener("click", function (e) {
                const header = document.querySelector(".wmn-global-workspace-header");
                const dropdown = document.getElementById("wmn-workspace-dropdown");
        
                if (!header || !dropdown) return;
                if (!dropdown.classList.contains("show")) return;
        

                if (header.contains(e.target) || dropdown.contains(e.target)) {
                    return;
                }
        
                dropdown.classList.remove("show");
        
                document.querySelectorAll(".wmn-workspace-btn").forEach(function (btn) {
                    btn.classList.remove("active");
                });
            });
        }

        cleanupUI();
        addUnifiedStyles();
        addFontAwesome();
        setRTL();

        const html = `
            <div class="wmn-global-workspace-header">
                <div class="wmn-dashboard-header" id="wmn-dashboard-header">
                    <div id="wmn-workspace-menu" class="wmn-workspace-menu">
                        <div class="wmn-loading">${esc(__("Loading..."))}</div>
                    </div>
                </div>
                <button class="wmn-toggle-header-btn" id="wmn-toggle-header-btn" type="button" title="Toggle">
                    <i class="fa fa-angle-up"></i>
                </button>
                <div id="wmn-workspace-dropdown" class="wmn-workspace-dropdown">
                    <div id="wmn-tab-header" class="wmn-tab-navbar"></div>
                    <div id="wmn-tabs-content" class="wmn-workspace-content"></div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML("afterbegin", html);
        bindHeaderOutsideClick();

        document.getElementById("wmn-toggle-header-btn").onclick = function (e) {
            e.stopPropagation();
            const header = document.getElementById("wmn-dashboard-header");
            const dropdown = document.getElementById("wmn-workspace-dropdown");
            const icon = this.querySelector("i");
            header.classList.toggle("collapsed");
            if (header.classList.contains("collapsed")) {
                dropdown.classList.remove("show");
                icon.className = "fa fa-angle-down";
            } else {
                icon.className = "fa fa-angle-up";
            }
        };

        renderHeaderButtons();
    }

    function renderHeaderButtons() {
        const menu = document.getElementById("wmn-workspace-menu");
        if (!menu) return;

        const roots = getRootWorkspaces();
        menu.innerHTML = "";

        if (!roots.length) {
            menu.innerHTML = `<div class="wmn-empty">${esc(__("No Workspaces"))}</div>`;
            return;
        }

        roots.forEach(ws => {
            const btn = document.createElement("button");
            btn.className = "wmn-workspace-btn";
            btn.type = "button";
            btn.innerHTML = `<i class="${esc(getWorkspaceIcon(ws))}"></i> ${esc(getWorkspaceTitle(ws))}`;
            btn.onclick = function (e) {
                e.stopPropagation();
                const dropdown = document.getElementById("wmn-workspace-dropdown");
                const isOpen = dropdown.classList.contains("show");
                const isActive = this.classList.contains("active");
                document.querySelectorAll(".wmn-workspace-btn").forEach(b => b.classList.remove("active"));

                if (isOpen && isActive) {
                    dropdown.classList.remove("show");
                    return;
                }

                this.classList.add("active");
                dropdown.classList.add("show");
                loadHeaderWorkspace(ws.name);
            };
            menu.appendChild(btn);
        });
    }

    async function loadHeaderWorkspace(name) {
        const tabHeader = document.getElementById("wmn-tab-header");
        const content = document.getElementById("wmn-tabs-content");
        if (!tabHeader || !content) return;

        renderHeaderTabs(name, tabHeader);
        content.innerHTML = `<div class="wmn-loading"><i class="fa fa-spinner fa-spin"></i></div>`;
        const data = await fetchDesktopPage(name);
        renderWorkspaceBody(data, content, {
            afterNavigate: function () {
                const dropdown = document.getElementById("wmn-workspace-dropdown");
                if (dropdown) dropdown.classList.remove("show");
                document.querySelectorAll(".wmn-workspace-btn").forEach(b => b.classList.remove("active"));
            }
        });
    }

    function renderHeaderTabs(selectedName, container) {
        container.innerHTML = "";
        const family = getWorkspaceFamily(selectedName);
        family.forEach(ws => {
            const btn = document.createElement("button");
            btn.className = `wmn-tab-btn ${ws.name === selectedName ? "active" : ""}`;
            btn.type = "button";
            btn.innerHTML = `<i class="${esc(getWorkspaceIcon(ws))}"></i> ${esc(getWorkspaceTitle(ws))}`;
            btn.onclick = function (e) {
                e.stopPropagation();
                document.querySelectorAll(".wmn-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                loadHeaderWorkspace(ws.name);
            };
            container.appendChild(btn);
        });
    }

    function initSidebarMode() {
        if (document.querySelector(".wmn-custom-sidebar")) return;

        cleanupUI();
        addUnifiedStyles();
        addFontAwesome();
        setRTL();
        document.body.classList.add("custom-loaded", "wmn-hide-standard-sidebar");

        const sidebarHTML = `
            <div class="wmn-custom-sidebar collapsed" id="wmn-custom-sidebar">
                <div class="wmn-sidebar-toggle" onclick="window.wmnToggleSidebar(event)">
                    <i class="fa-solid fa-angles-right"></i>
                </div>
                <div class="wmn-user-section">
                    <div class="wmn-user-info">
                        <i class="fa-solid fa-user"></i>
                        <span id="wmn-current-user">${esc(__("Loading..."))}</span>
                    </div>
                </div>
                <div class="wmn-modules-container" id="wmn-modules-container">
                    <div class="wmn-loading">${esc(__("Loading menu..."))}</div>
                </div>
            </div>
            <div class="wmn-floating-sidebar-btn" id="wmn-floating-sidebar-btn">☰</div>
        `;
        document.body.insertAdjacentHTML("afterbegin", sidebarHTML);

        window.wmnToggleSidebar = toggleSidebar;
        document.getElementById("wmn-floating-sidebar-btn").onclick = toggleSidebar;

        document.addEventListener("click", function (e) {
            const sidebar = document.getElementById("wmn-custom-sidebar");
            const floatBtn = document.getElementById("wmn-floating-sidebar-btn");
            if (!sidebar || sidebar.classList.contains("collapsed")) return;
            if (!sidebar.contains(e.target) && (!floatBtn || !floatBtn.contains(e.target))) {
                toggleSidebar(e, true);
            }
        });

        loadCurrentUser();
        renderSidebarFromAllowedWorkspaces();
    }

    function toggleSidebar(event, forceClose) {
        if (event && event.stopPropagation) event.stopPropagation();
        const sidebar = document.getElementById("wmn-custom-sidebar");
        if (!sidebar) return;

        if (forceClose) sidebar.classList.add("collapsed");
        else sidebar.classList.toggle("collapsed");

        const icon = sidebar.querySelector(".wmn-sidebar-toggle i");
        if (icon) {
            const rtl = document.body.classList.contains("rtl-mode");
            if (sidebar.classList.contains("collapsed")) {
                icon.className = rtl ? "fa-solid fa-angles-left" : "fa-solid fa-angles-right";
            } else {
                icon.className = rtl ? "fa-solid fa-angles-right" : "fa-solid fa-angles-left";
            }
        }
    }

    function loadCurrentUser() {
        const span = document.getElementById("wmn-current-user");
        if (!span) return;
        span.textContent = frappe.session && (frappe.session.user_fullname || frappe.session.user) || "User";
    }

    function renderSidebarFromAllowedWorkspaces() {
        const container = document.getElementById("wmn-modules-container");
        if (!container) return;

        const roots = getRootWorkspaces();
        if (!roots.length) {
            container.innerHTML = `<div class="wmn-empty">${esc(__("No Workspaces"))}</div>`;
            return;
        }

        container.innerHTML = "";
        roots.forEach(root => {
            const moduleId = `wmn-module-${cssId(root.name)}`;
            const children = getWorkspaceChildren(root.name);
            const workspaces = children.length ? [root].concat(children) : [root];

            const moduleEl = document.createElement("div");
            moduleEl.className = "wmn-module-item";
            moduleEl.innerHTML = `
                <div class="wmn-module-header" data-target="${esc(moduleId)}">
                    <i class="${esc(getWorkspaceIcon(root))}"></i>
                    <span class="wmn-menu-text">${esc(getWorkspaceTitle(root))}</span>
                    <i class="fa fa-angle-down wmn-dropdown-icon"></i>
                </div>
                <div class="wmn-module-content" id="${esc(moduleId)}"></div>
            `;

            const moduleContent = moduleEl.querySelector(".wmn-module-content");
            workspaces.forEach(ws => moduleContent.appendChild(createSidebarWorkspaceNode(ws)));
            container.appendChild(moduleEl);

            moduleEl.querySelector(".wmn-module-header").onclick = function (e) {
                e.stopPropagation();
                toggleBlock(moduleContent, this);
            };
        });
    }

    function createSidebarWorkspaceNode(ws) {
        const wsId = `wmn-workspace-${cssId(ws.name)}`;
        const item = document.createElement("div");
        item.className = "wmn-sidebar-workspace-item";
        item.innerHTML = `
            <div class="wmn-sidebar-workspace-header" data-workspace="${esc(ws.name)}">
                <i class="${esc(getWorkspaceIcon(ws))}"></i>
                <span class="wmn-menu-text">${esc(getWorkspaceTitle(ws))}</span>
                <i class="fa fa-angle-down wmn-dropdown-icon"></i>
            </div>
            <div class="wmn-sidebar-workspace-content" id="${esc(wsId)}">
                <div class="wmn-loading"><i class="fa fa-spinner fa-spin"></i></div>
            </div>
        `;

        const header = item.querySelector(".wmn-sidebar-workspace-header");
        const content = item.querySelector(".wmn-sidebar-workspace-content");
        header.onclick = async function (e) {
            e.stopPropagation();
            const shouldLoad = !content.dataset.loaded;
            toggleBlock(content, this);
            if (shouldLoad) {
                const data = await fetchDesktopPage(ws.name);
                renderSidebarWorkspaceContent(data, content, ws.name);
                content.dataset.loaded = "1";
            }
        };
        return item;
    }

    function renderSidebarWorkspaceContent(data, container, workspaceName) {
        container.innerHTML = "";
        let hasContent = false;

        const shortcuts = data.shortcuts && data.shortcuts.items ? data.shortcuts.items : [];
        if (shortcuts.length) {
            const card = createSidebarCard("Your Shortcuts", shortcuts, workspaceName + "-shortcuts", true);
            container.appendChild(card);
            hasContent = true;
        }

        const cards = data.cards && data.cards.items ? data.cards.items : [];
        cards.forEach((cardData, index) => {
            if (!cardData.links || !cardData.links.length) return;
            const card = createSidebarCard(cardData.label || "Links", cardData.links, `${workspaceName}-${index}`, false, cardData.icon);
            container.appendChild(card);
            hasContent = true;
        });

        if (!hasContent) {
            container.innerHTML = `<div class="wmn-empty">${esc(__("No content available"))}</div>`;
        }
    }

    function createSidebarCard(title, links, idSuffix, isShortcut, icon) {
        const cardId = `wmn-card-${cssId(idSuffix)}`;
        const card = document.createElement("div");
        card.className = "wmn-sidebar-card-item";
        card.innerHTML = `
            <div class="wmn-sidebar-card-header">
                <i class="${esc(icon || (isShortcut ? "fa fa-bolt" : "fa fa-folder"))}"></i>
                <span class="wmn-menu-text">${esc(__(title))}</span>
                <i class="fa fa-angle-down wmn-dropdown-icon"></i>
            </div>
            <div class="wmn-sidebar-card-content" id="${esc(cardId)}"></div>
        `;

        const content = card.querySelector(".wmn-sidebar-card-content");
        links.forEach(link => {
            content.appendChild(renderLinkElement(link, "wmn-sidebar-link", function () {
                toggleSidebar(null, true);
            }));
        });

        card.querySelector(".wmn-sidebar-card-header").onclick = function (e) {
            e.stopPropagation();
            toggleBlock(content, this);
        };
        return card;
    }

    function toggleBlock(content, header) {
        if (!content) return;
        content.classList.toggle("active");
        if (header) {
            header.classList.toggle("active-parent", content.classList.contains("active"));
            const icon = header.querySelector(".wmn-dropdown-icon");
            if (icon) icon.classList.toggle("open", content.classList.contains("active"));
        }
    }

    function start() {
        if (WMN_NAV.loaded) return;
        WMN_NAV.loaded = true;

        waitForDesk(function () {
            loadSettings(function (settings) {
                WMN_NAV.settings = settings || {};
                WMN_NAV.mode = resolveMode(WMN_NAV.settings);

                if (WMN_NAV.mode === "header") {
                    initHeaderMode();
                } else if (WMN_NAV.mode === "sidebar") {
                    initSidebarMode();
                } else {
                    cleanupUI();
                    console.log("WMN Workspace Navigation disabled by settings.");
                }
            });
        });
    }

    function refreshOnRouteChange() {
        if (!WMN_NAV.mode || WMN_NAV.mode === "disabled") return;
        setTimeout(function () {
            if (WMN_NAV.mode === "header" && !document.querySelector(".wmn-global-workspace-header")) initHeaderMode();
            if (WMN_NAV.mode === "sidebar" && !document.querySelector(".wmn-custom-sidebar")) initSidebarMode();
        }, 300);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    if (window.$) {
        $(document).on("app_ready", start);
    }

    if (window.frappe && frappe.router && frappe.router.on) {
        frappe.router.on("change", refreshOnRouteChange);
    } else {
        setTimeout(function () {
            if (window.frappe && frappe.router && frappe.router.on) {
                frappe.router.on("change", refreshOnRouteChange);
            }
        }, 1000);
    }
})();
