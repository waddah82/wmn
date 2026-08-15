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
        settingCacheMs: 5 * 60 * 1000,
        activeHeaderWorkspace: null,
        headerOverflowResizeObserver: null
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

        if (rawMode.includes("sidebar") || rawMode.includes("side") || rawMode.includes("Ø³Ø§ÙŠØ¯")) return "sidebar";
        if (rawMode.includes("header") || rawMode.includes("top") || rawMode.includes("Ù‡ÙŠØ¯Ø±")) return "header";

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

    // ============================================================
    // WMN THEME BRIDGE
    // ============================================================
    // The custom Header/Sidebar does not require theme authors to know
    // WMN class names. It reads the active ERP/Frappe theme visually and
    // exposes semantic navigation variables used by addUnifiedStyles().

    function isUsableCssColor(value) {
        if (!value) return false;
        const v = String(value).trim().toLowerCase();
        return v &&
            v !== "transparent" &&
            v !== "rgba(0, 0, 0, 0)" &&
            v !== "rgba(0,0,0,0)";
    }

    function readRootVariable(names) {
        if (!window.getComputedStyle) return "";
        const styles = getComputedStyle(document.documentElement);
        for (const name of names) {
            const value = styles.getPropertyValue(name).trim();
            if (value) return value;
        }
        return "";
    }

    function readComputedValue(selectors, property, fallback) {
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (!el) continue;
            const value = getComputedStyle(el)[property];
            if (property.toLowerCase().includes("color")) {
                if (isUsableCssColor(value)) return value;
            } else if (value) {
                return value;
            }
        }
        return fallback || "";
    }

    function syncNavigationThemeFromPage() {
        if (!document.documentElement || !window.getComputedStyle) return;

        const root = document.documentElement;

        // Accent / primary color.
        const accent =
            readRootVariable([
                "--wmn-primary",
                "--btn-primary",
                "--blue-primary",
                "--primary",
                "--primary-color"
            ]) ||
            readComputedValue([
                ".btn.btn-primary",
                ".btn-primary",
                ".btn.btn-new-doc"
            ], "backgroundColor", "#089da0");

        // Text shown over the primary/accent color.
        const onAccent =
            readRootVariable([
                "--wmn-on-primary",
                "--text-btn-color",
                "--primary-contrast"
            ]) ||
            readComputedValue([
                ".btn.btn-primary",
                ".btn-primary"
            ], "color", "#ffffff");

        // Standard ERP navbar becomes the visual source for the custom sidebar.
        const navbarBg =
            readRootVariable([
                "--wmn-navbar",
                "--navbar-bg",
                "--navbar-background"
            ]) ||
            readComputedValue([
                "header.navbar",
                ".navbar"
            ], "backgroundColor", "#20272d");

        const navbarText =
            readRootVariable([
                "--wmn-navbar-text",
                "--navbar-text-color",
                "--text-btn-color"
            ]) ||
            readComputedValue([
                "header.navbar .nav-link",
                ".navbar .nav-link",
                "#navbar-breadcrumbs a"
            ], "color", "#ffffff");

        // Surface/background used by the Header mode, dropdowns and cards.
        const surface =
            readRootVariable([
                "--wmn-surface",
                "--card-bg",
                "--fg-color",
                "--control-bg"
            ]) ||
            readComputedValue([
                ".layout-main-section",
                ".page-head",
                ".card"
            ], "backgroundColor", "#ffffff");

        const pageBg =
            readRootVariable([
                "--wmn-bg",
                "--bg-color",
                "--subtle-fg"
            ]) ||
            readComputedValue([
                ".page-container",
                ".page-body",
                "body"
            ], "backgroundColor", "#f6f8f9");

        const text =
            readRootVariable([
                "--wmn-text",
                "--text-color",
                "--heading-color"
            ]) ||
            readComputedValue([
                ".layout-main-section",
                ".page-title",
                "body"
            ], "color", "#20272c");

        const muted =
            readRootVariable([
                "--wmn-text-secondary",
                "--text-muted",
                "--text-light"
            ]) ||
            readComputedValue([
                ".text-muted",
                ".help-box",
                ".control-label"
            ], "color", "#68737b");

        const border =
            readRootVariable([
                "--wmn-border",
                "--border-color",
                "--table-border-color"
            ]) ||
            readComputedValue([
                ".form-control",
                ".layout-main-section",
                ".card"
            ], "borderTopColor", "#e2e7e9");

        const radius =
            readRootVariable([
                "--wmn-radius",
                "--border-radius",
                "--border-radius-md"
            ]) || "8px";

        // Auto-generated variables. Advanced themes may override them using
        // --wmn-theme-nav-* without ever touching WMN selectors/classes.
        root.style.setProperty("--wmn-auto-nav-accent", accent);
        root.style.setProperty("--wmn-auto-nav-on-accent", onAccent);
        root.style.setProperty("--wmn-auto-nav-navbar-bg", navbarBg);
        root.style.setProperty("--wmn-auto-nav-navbar-text", navbarText);
        root.style.setProperty("--wmn-auto-nav-surface", surface);
        root.style.setProperty("--wmn-auto-nav-page-bg", pageBg);
        root.style.setProperty("--wmn-auto-nav-text", text);
        root.style.setProperty("--wmn-auto-nav-muted", muted);
        root.style.setProperty("--wmn-auto-nav-border", border);
        root.style.setProperty("--wmn-auto-nav-radius", radius);
    }

    function scheduleNavigationThemeSync() {
        requestAnimationFrame(function () {
            syncNavigationThemeFromPage();
            setTimeout(syncNavigationThemeFromPage, 120);
            setTimeout(syncNavigationThemeFromPage, 500);
        });
    }

    // Theme Manager emits this event after applying UI Theme CSS.
    window.addEventListener("shams-theme-changed", scheduleNavigationThemeSync);
    window.addEventListener("wmn-theme-changed", scheduleNavigationThemeSync);

    function addUnifiedStyles() {
        if (document.getElementById("wmn-workspace-unified-style")) {
            scheduleNavigationThemeSync();
            return;
        }

        const style = document.createElement("style");
        style.id = "wmn-workspace-unified-style";
        style.textContent = `
            /* =========================================================
               Semantic WMN navigation tokens
               ---------------------------------------------------------
               Normal users DO NOT need to know WMN classes.
               The JS bridge reads the active ERP theme and fills the
               --wmn-auto-* variables automatically.

               Advanced theme designers may optionally override only:
                 --wmn-theme-nav-accent
                 --wmn-theme-nav-on-accent
                 --wmn-theme-nav-navbar-bg
                 --wmn-theme-nav-navbar-text
                 --wmn-theme-nav-surface
                 --wmn-theme-nav-page-bg
                 --wmn-theme-nav-text
                 --wmn-theme-nav-muted
                 --wmn-theme-nav-border
                 --wmn-theme-nav-radius
               ========================================================= */
            :root {
                --wmn-nav-accent: var(--wmn-theme-nav-accent, var(--wmn-auto-nav-accent, #089da0));
                --wmn-nav-on-accent: var(--wmn-theme-nav-on-accent, var(--wmn-auto-nav-on-accent, #ffffff));
                --wmn-nav-navbar-bg: var(--wmn-theme-nav-navbar-bg, var(--wmn-auto-nav-navbar-bg, #20272d));
                --wmn-nav-navbar-text: var(--wmn-theme-nav-navbar-text, var(--wmn-auto-nav-navbar-text, #ffffff));
                --wmn-nav-surface: var(--wmn-theme-nav-surface, var(--wmn-auto-nav-surface, #ffffff));
                --wmn-nav-page-bg: var(--wmn-theme-nav-page-bg, var(--wmn-auto-nav-page-bg, #f6f8f9));
                --wmn-nav-text: var(--wmn-theme-nav-text, var(--wmn-auto-nav-text, #20272c));
                --wmn-nav-muted: var(--wmn-theme-nav-muted, var(--wmn-auto-nav-muted, #68737b));
                --wmn-nav-border: var(--wmn-theme-nav-border, var(--wmn-auto-nav-border, #e2e7e9));
                --wmn-nav-radius: var(--wmn-theme-nav-radius, var(--wmn-auto-nav-radius, 8px));
                --wmn-nav-hover-bg: var(
                    --wmn-theme-nav-hover-bg,
                    color-mix(in srgb, var(--wmn-nav-accent) 10%, var(--wmn-nav-surface))
                );
                --wmn-nav-active-bg: var(
                    --wmn-theme-nav-active-bg,
                    color-mix(in srgb, var(--wmn-nav-accent) 16%, var(--wmn-nav-surface))
                );
                --wmn-nav-sidebar-hover: var(
                    --wmn-theme-nav-sidebar-hover,
                    color-mix(in srgb, var(--wmn-nav-accent) 18%, transparent)
                );
                --wmn-nav-sidebar-sub-bg: var(
                    --wmn-theme-nav-sidebar-sub-bg,
                    color-mix(in srgb, #000 12%, transparent)
                );
            }

            /* ---------------- Header mode ---------------- */
            .wmn-global-workspace-header {
                position: sticky;
                top: 0;
                left: 0;
                right: 0;
                z-index: 10000;
                background: var(--wmn-nav-surface) !important;
                color: var(--wmn-nav-text) !important;
                border-bottom: 1px solid var(--wmn-nav-border) !important;
                box-shadow: 0 1px 3px rgba(0,0,0,.06);
            }

            .wmn-dashboard-header {
                background: var(--wmn-nav-surface) !important;
                color: var(--wmn-nav-text) !important;
                border-bottom: 1px solid var(--wmn-nav-border) !important;
                display: flex;
                align-items: center;
                padding: 0 20px;
                min-height: 48px;
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
                gap: 8px;
            }

            .wmn-workspace-btn,
            .wmn-tab-btn {
                background: var(--wmn-nav-surface) !important;
                border: 1px solid var(--wmn-nav-border) !important;
                box-shadow: none !important;
                padding: 7px 11px !important;
                min-height: 34px;
                font-size: var(--text-base, 13px) !important;
                font-weight: 500;
                color: var(--wmn-nav-muted) !important;
                cursor: pointer;
                border-radius: var(--wmn-nav-radius) !important;
                position: relative;
                max-width: 220px;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
                transition: background-color .15s ease, border-color .15s ease, color .15s ease;
            }

            .wmn-workspace-btn i,
            .wmn-tab-btn i {
                color: currentColor !important;
            }

            .wmn-workspace-btn:hover,
            .wmn-tab-btn:hover {
                color: var(--wmn-nav-accent) !important;
                border-color: var(--wmn-nav-accent) !important;
                background: var(--wmn-nav-hover-bg) !important;
            }

            .wmn-workspace-btn.active,
            .wmn-tab-btn.active {
                color: var(--wmn-nav-accent) !important;
                border-color: var(--wmn-nav-accent) !important;
                background: var(--wmn-nav-active-bg) !important;
                font-weight: 650;
            }

            .wmn-workspace-btn.active::after,
            .wmn-tab-btn.active::after {
                content: "";
                position: absolute;
                bottom: -1px;
                left: 10px;
                right: 10px;
                height: 2px;
                background: var(--wmn-nav-accent);
            }

            .wmn-toggle-header-btn {
                position: absolute;
                bottom: -19px;
                left: 50%;
                transform: translateX(-50%);
                width: 30px;
                height: 19px;
                background: var(--wmn-nav-surface) !important;
                color: var(--wmn-nav-muted) !important;
                border: 1px solid var(--wmn-nav-border) !important;
                border-top: none !important;
                cursor: pointer;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 0 0 var(--wmn-nav-radius) var(--wmn-nav-radius);
            }

            .wmn-workspace-dropdown {
                position: absolute;
                left: 0;
                right: 0;
                background: var(--wmn-nav-surface) !important;
                color: var(--wmn-nav-text) !important;
                border-bottom: 1px solid var(--wmn-nav-border) !important;
                box-shadow: 0 8px 24px rgba(0,0,0,.12);
                display: none;
                z-index: 9999;
                max-height: 80vh;
                overflow-y: auto;
                padding: 16px;
            }

            .wmn-workspace-dropdown.show { display: block !important; }

            .wmn-tab-navbar {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                padding: 10px;
                background: var(--wmn-nav-page-bg) !important;
                border-bottom: 1px solid var(--wmn-nav-border) !important;
            }

            .wmn-workspace-content {
                padding: 14px;
                background: var(--wmn-nav-surface) !important;
                color: var(--wmn-nav-text) !important;
            }

            .wmn-section-title {
                font-weight: 700;
                font-size: var(--text-lg, 16px);
                margin: 6px 0 12px;
                color: var(--wmn-nav-text) !important;
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

            .wmn-card-group {
                background: var(--wmn-nav-surface) !important;
                padding: 14px;
                border-radius: var(--wmn-nav-radius) !important;
                border: 1px solid var(--wmn-nav-border) !important;
            }

            .wmn-card-title {
                font-weight: 700;
                font-size: var(--text-base, 13px);
                margin-bottom: 10px;
                color: var(--wmn-nav-text) !important;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .wmn-card-title i { color: var(--wmn-nav-accent) !important; }

            .wmn-link-item,
            .wmn-shortcut-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                color: var(--wmn-nav-muted) !important;
                text-decoration: none !important;
                font-size: var(--text-base, 13px);
                border-radius: var(--wmn-nav-radius) !important;
                cursor: pointer;
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .wmn-link-item i,
            .wmn-shortcut-item i { color: var(--wmn-nav-accent) !important; }

            .wmn-link-item:hover,
            .wmn-shortcut-item:hover {
                color: var(--wmn-nav-accent) !important;
                background: var(--wmn-nav-hover-bg) !important;
            }

            .wmn-loading,
            .wmn-empty,
            .wmn-error {
                padding: 18px;
                text-align: center;
                color: var(--wmn-nav-muted) !important;
            }

            .wmn-error { color: #ef4444 !important; }


            /* ---------------------------------------------------------
               Native Workspace content inside Header dropdown
               The dropdown reuses Workspace block order/columns and
               Frappe's own widget renderer (SingleWidgetGroup).
               --------------------------------------------------------- */
            .wmn-workspace-dropdown .wmn-native-workspace {
                width: 100%;
                max-width: none;
                min-width: 0;
                background: transparent !important;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .codex-editor,
            .wmn-workspace-dropdown .wmn-native-workspace .codex-editor__redactor {
                width: 100%;
                max-width: none !important;
                min-width: 0;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .codex-editor__redactor {
                display: flex !important;
                flex-wrap: wrap !important;
                align-items: stretch;
                margin: -8px !important;
                padding: 0 !important;
                padding-bottom: 0 !important;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .ce-block {
                box-sizing: border-box;
                min-width: 0;
                margin: 0 !important;
                padding: 8px !important;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .ce-block__content {
                width: 100%;
                max-width: none !important;
                min-width: 0;
                margin: 0 !important;
            }

            /* Do not restyle the actual Frappe widgets here.  This is
               intentional: the same .widget / .shortcut-widget-box /
               .links-widget-box / charts / number cards styling that the
               current UI Theme applies to the Workspace is reused here. */
            .wmn-workspace-dropdown .wmn-native-widget-host {
                width: 100%;
                min-width: 0;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .ce-header {
                width: 100%;
                margin: 4px 0 !important;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .ce-paragraph {
                width: 100%;
                min-height: auto;
            }

            .wmn-workspace-dropdown .wmn-native-workspace .widget.spacer {
                width: 100%;
                min-height: 26px;
                background: transparent !important;
                border: 0 !important;
                box-shadow: none !important;
            }

            /* In the dropdown we need the blocks to keep the exact Workspace
               col values but still collapse cleanly on smaller screens. */
            @media (max-width: 991px) {
                .wmn-workspace-dropdown .wmn-native-workspace .ce-block[class*="col-lg-"] {
                    width: 33.333333%;
                }
            }

            @media (max-width: 767px) {
                .wmn-workspace-dropdown .wmn-native-workspace .ce-block {
                    width: 100% !important;
                    max-width: 100% !important;
                    flex: 0 0 100% !important;
                }
            }

            /* ---------------- Sidebar mode ---------------- */
            .wmn-custom-sidebar {
                position: fixed;
                top: 0;
                left: 0;
                width: 270px;
                height: 100vh;
                background: var(--wmn-nav-navbar-bg) !important;
                color: var(--wmn-nav-navbar-text) !important;
                overflow: hidden;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                box-shadow: 6px 0 24px rgba(0,0,0,.22);
                transition: width .25s ease, transform .25s ease;
            }

            .wmn-custom-sidebar.collapsed { width: 10px; }
            body.rtl-mode .wmn-custom-sidebar { right: 0; left: auto; direction: rtl; text-align: right; }

            .wmn-sidebar-toggle {
                position: absolute;
                top: 10px;
                right: -25px;
                cursor: pointer;
                color: var(--wmn-nav-navbar-text) !important;
                z-index: 10000;
            }
            body.rtl-mode .wmn-sidebar-toggle { left: -25px; right: auto; }

            .wmn-user-section {
                padding: 15px 20px;
                border-bottom: 1px solid color-mix(in srgb, var(--wmn-nav-navbar-text) 12%, transparent) !important;
                background: color-mix(in srgb, #000 10%, transparent) !important;
                flex-shrink: 0;
            }

            .wmn-user-info {
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 500;
                color: var(--wmn-nav-navbar-text) !important;
            }

            .wmn-user-info i { color: var(--wmn-nav-accent) !important; }

            .wmn-modules-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                min-height: 0;
                scrollbar-width: thin;
                scrollbar-color: var(--wmn-nav-accent) transparent;
            }

            .wmn-modules-container::-webkit-scrollbar { width: 4px; }
            .wmn-modules-container::-webkit-scrollbar-track { background: transparent; }
            .wmn-modules-container::-webkit-scrollbar-thumb {
                background: var(--wmn-nav-accent);
                border-radius: 10px;
            }

            .wmn-module-item,
            .wmn-sidebar-workspace-item,
            .wmn-sidebar-card-item {
                background: transparent;
                border-radius: 0;
                margin: 0;
            }

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
                color: var(--wmn-nav-navbar-text) !important;
                transition: background-color .15s ease, transform .15s ease, color .15s ease;
            }

            .wmn-module-header { padding: 10px 5px; font-size: 15px; font-weight: 700; }
            .wmn-sidebar-workspace-header { padding: 8px 12px; font-size: 14px; }
            .wmn-sidebar-card-header {
                padding: 6px 22px;
                font-size: 13px;
                background: color-mix(in srgb, var(--wmn-nav-navbar-text) 4%, transparent) !important;
            }
            .wmn-sidebar-link { padding: 7px 18px 7px 38px; font-size: 13px; }

            .wmn-module-header:hover,
            .wmn-sidebar-workspace-header:hover,
            .wmn-sidebar-card-header:hover,
            .wmn-sidebar-link:hover {
                background: var(--wmn-nav-sidebar-hover) !important;
                color: var(--wmn-nav-navbar-text) !important;
                transform: translateX(2px);
            }

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
                background: var(--wmn-nav-accent);
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

            .wmn-menu-text {
                flex: 1;
                color: inherit !important;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .wmn-module-header i,
            .wmn-sidebar-workspace-header i,
            .wmn-sidebar-card-header i,
            .wmn-sidebar-link i {
                color: var(--wmn-nav-accent) !important;
                opacity: .95;
                width: 16px;
                text-align: center;
            }

            .wmn-module-content,
            .wmn-sidebar-workspace-content,
            .wmn-sidebar-card-content {
                display: none;
                background: var(--wmn-nav-sidebar-sub-bg) !important;
            }

            .wmn-module-content.active,
            .wmn-sidebar-workspace-content.active,
            .wmn-sidebar-card-content.active { display: block; }

            .wmn-dropdown-icon {
                margin-inline-start: auto;
                opacity: .75;
                transition: transform .2s ease;
                color: currentColor !important;
            }

            .active-parent > .wmn-dropdown-icon,
            .wmn-dropdown-icon.open { transform: rotate(180deg); }

            .wmn-floating-sidebar-btn {
                position: fixed;
                top: 35px;
                left: 2px;
                width: 32px;
                height: 32px;
                background: var(--wmn-nav-navbar-bg) !important;
                color: var(--wmn-nav-navbar-text) !important;
                border: 1px solid color-mix(in srgb, var(--wmn-nav-navbar-text) 15%, transparent) !important;
                border-radius: var(--wmn-nav-radius) !important;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 10000;
                font-size: 18px;
                box-shadow: 0 4px 10px rgba(0,0,0,.16);
            }
            body.rtl-mode .wmn-floating-sidebar-btn { right: 2px; left: auto; }

            .wmn-hide-standard-sidebar .standard-sidebar,
            .wmn-hide-standard-sidebar .desk-sidebar,
            .wmn-hide-standard-sidebar .search-dialog .search-results .search-sidebar {
                display: none !important;
                width: 0 !important;
                max-width: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                border: 0 !important;
            }


/* ============================================================
   WMN TOP WORKSPACE BAR
   Chrome DevTools Style
   ------------------------------------------------------------
   - Natural width tabs
   - Extra tabs go inside �
   - Colors are controlled by UI Theme
   - No JavaScript color detection required
   ============================================================ */

:root {

    /*
     * ??? ??? ????? ???? --navbar-bg ????????? ??????.
     * ????? ??? Theme ????? ??? ????????? ???? ?????.
     */

    --wmn-topbar-bg:
        var(
            --wmn-theme-topbar-bg,
            var(
                --navbar-bg,
                var(--wmn-nav-navbar-bg, #20272d)
            )
        );

    --wmn-topbar-text:
        var(
            --wmn-theme-topbar-text,
            #c5c9ce
        );

    --wmn-topbar-hover-text:
        var(
            --wmn-theme-topbar-hover-text,
            #ffffff
        );

    --wmn-topbar-active:
        var(
            --wmn-theme-topbar-active,
            var(--wmn-nav-accent, #6ea8e5)
        );

    --wmn-topbar-hover-bg:
        var(
            --wmn-theme-topbar-hover-bg,
            rgba(255,255,255,.06)
        );

    --wmn-topbar-border:
        var(
            --wmn-theme-topbar-border,
            rgba(255,255,255,.10)
        );

    --wmn-topbar-menu-bg:
        var(
            --wmn-theme-topbar-menu-bg,
            var(--wmn-topbar-bg)
        );

    --wmn-topbar-menu-shadow:
        var(
            --wmn-theme-topbar-menu-shadow,
            0 8px 24px rgba(0,0,0,.28)
        );
}


/* ============================================================
   GLOBAL HEADER WRAPPER
   ============================================================ */

.wmn-global-workspace-header {
    position: sticky !important;

    top: 0;
    left: 0;
    right: 0;

    z-index: 10000 !important;

    background: var(--wmn-topbar-bg) !important;

    color: var(--wmn-topbar-text) !important;

    border: none !important;

    box-shadow: none !important;
}


/* ============================================================
   DEVTOOLS TAB BAR
   ============================================================ */

.wmn-dashboard-header {
    position: relative !important;

    display: flex !important;
    align-items: center !important;

    height: 32px !important;
    min-height: 32px !important;

    padding: 0 4px !important;

    background: var(--wmn-topbar-bg) !important;

    color: var(--wmn-topbar-text) !important;

    border: none !important;

    border-bottom:
        1px solid var(--wmn-topbar-border) !important;

    box-shadow: none !important;

    overflow: visible !important;

    transition:
        height .20s ease,
        min-height .20s ease !important;
}


/* ============================================================
   WORKSPACE MENU
   ============================================================ */

.wmn-workspace-menu {
    display: flex !important;

    align-items: stretch !important;

    flex: 1 1 auto !important;

    width: auto !important;
    min-width: 0 !important;

    height: 32px !important;

    flex-wrap: nowrap !important;

    gap: 0 !important;

    overflow: hidden !important;

    background: transparent !important;
}


/* ============================================================
   WORKSPACE TAB
   ============================================================ */

.wmn-dashboard-header .wmn-workspace-btn {
    position: relative !important;

    display: inline-flex !important;

    align-items: center !important;
    justify-content: center !important;

    flex: 0 0 auto !important;

    width: auto !important;

    min-width: max-content !important;
    max-width: none !important;

    height: 32px !important;
    min-height: 32px !important;

    padding: 0 11px !important;

    margin: 0 !important;

    background: transparent !important;

    border: none !important;

    border-radius: 0 !important;

    box-shadow: none !important;

    color: var(--wmn-topbar-text) !important;

    font-size: 12px !important;

    font-weight: 500 !important;

    line-height: 32px !important;

    white-space: nowrap !important;

    overflow: visible !important;

    text-overflow: clip !important;

    cursor: pointer !important;

    transition:
        background-color .10s ease,
        color .10s ease !important;
}


/* ============================================================
   HIDE ICONS
   Like Chrome DevTools
   ============================================================ */

.wmn-dashboard-header .wmn-workspace-btn > i {
    display: none !important;
}


/* ============================================================
   TAB HOVER
   ============================================================ */

.wmn-dashboard-header .wmn-workspace-btn:hover {

    background:
        var(--wmn-topbar-hover-bg) !important;

    color:
        var(--wmn-topbar-hover-text) !important;
}


/* ============================================================
   ACTIVE TAB
   ============================================================ */

.wmn-dashboard-header .wmn-workspace-btn.active {

    background: transparent !important;

    color:
        var(--wmn-topbar-active) !important;

    font-weight: 500 !important;
}


/* Active underline */

.wmn-dashboard-header
.wmn-workspace-btn.active::after {

    content: "" !important;

    position: absolute !important;

    left: 7px !important;
    right: 7px !important;

    bottom: 0 !important;

    height: 2px !important;

    background:
        var(--wmn-topbar-active) !important;

    border-radius:
        2px 2px 0 0 !important;
}


/* ============================================================
   HIDDEN WORKSPACES
   ============================================================ */

.wmn-dashboard-header
.wmn-workspace-btn.wmn-overflow-hidden {

    display: none !important;
}


/* ============================================================
   OVERFLOW WRAPPER
   ============================================================ */

.wmn-workspace-overflow {

    position: relative !important;

    flex: 0 0 auto !important;

    display: none;

    align-items: center !important;

    height: 32px !important;

    margin: 0 !important;

    z-index: 10020 !important;

    background:
        var(--wmn-topbar-bg) !important;
}


.wmn-workspace-overflow.has-overflow {

    display: flex !important;
}


/* ============================================================
   DEVTOOLS � BUTTON
   ============================================================ */

.wmn-workspace-overflow-btn {

    display: inline-flex !important;

    align-items: center !important;
    justify-content: center !important;

    flex: 0 0 31px !important;

    width: 31px !important;
    min-width: 31px !important;

    height: 32px !important;

    padding: 0 !important;

    margin: 0 !important;

    background:
        var(--wmn-topbar-bg) !important;

    color:
        var(--wmn-topbar-text) !important;

    border: none !important;

    border-left:
        1px solid var(--wmn-topbar-border) !important;

    border-radius: 0 !important;

    box-shadow: none !important;

    cursor: pointer !important;
}


.wmn-workspace-overflow-btn:hover,
.wmn-workspace-overflow-btn.active {

    background:
        var(--wmn-topbar-hover-bg) !important;

    color:
        var(--wmn-topbar-hover-text) !important;
}


/* � */

.wmn-workspace-overflow-btn
.wmn-overflow-chevrons {

    display: block !important;

    font-family:
        Arial, sans-serif !important;

    font-size: 21px !important;

    font-weight: 400 !important;

    line-height: 1 !important;

    transform:
        translateY(-1px);
}


/* ============================================================
   OVERFLOW MENU
   ============================================================ */

.wmn-workspace-overflow-menu {

    position: absolute !important;

    top: 32px !important;

    right: 0 !important;

    min-width: 190px !important;

    max-width:
        min(340px, 90vw) !important;

    max-height: 70vh !important;

    overflow-y: auto !important;

    display: none;

    padding: 5px 0 !important;

    background:
        var(--wmn-topbar-menu-bg) !important;

    border:
        1px solid
        var(--wmn-topbar-border) !important;

    border-radius:
        0 0 6px 6px !important;

    box-shadow:
        var(--wmn-topbar-menu-shadow) !important;

    z-index: 10030 !important;
}


.wmn-workspace-overflow-menu.show {

    display: block !important;
}


/* ============================================================
   OVERFLOW ITEM
   ============================================================ */

.wmn-workspace-overflow-item {

    width: 100% !important;

    min-height: 30px !important;

    display: flex !important;

    align-items: center !important;

    gap: 8px !important;

    padding:
        5px 14px !important;

    margin: 0 !important;

    background:
        transparent !important;

    color:
        var(--wmn-topbar-text) !important;

    border: none !important;

    border-radius: 0 !important;

    text-align: start !important;

    white-space: nowrap !important;

    cursor: pointer !important;

    font-size: 12px !important;

    font-weight: 400 !important;
}


.wmn-workspace-overflow-item:hover {

    background:
        var(--wmn-topbar-hover-bg) !important;

    color:
        var(--wmn-topbar-hover-text) !important;
}


.wmn-workspace-overflow-item.active {

    background:
        var(--wmn-topbar-hover-bg) !important;

    color:
        var(--wmn-topbar-active) !important;

    font-weight: 500 !important;
}


/* ???? ????? ??????? ??????? ????? ??? DevTools */

.wmn-workspace-overflow-item i {

    display: none !important;
}


/* ============================================================
   COLLAPSE BUTTON
   ============================================================ */

.wmn-toggle-header-btn {

    position: absolute !important;

    bottom: -18px !important;

    left: 50% !important;

    transform:
        translateX(-50%) !important;

    width: 30px !important;

    height: 18px !important;

    padding: 0 !important;

    display: flex !important;

    align-items: center !important;

    justify-content: center !important;

    background:
        var(--wmn-topbar-bg) !important;

    color:
        var(--wmn-topbar-text) !important;

    border:
        1px solid
        var(--wmn-topbar-border) !important;

    border-top:
        none !important;

    border-radius:
        0 0 5px 5px !important;

    box-shadow:
        none !important;

    cursor: pointer !important;

    z-index: 10051 !important;
}


.wmn-toggle-header-btn:hover {

    background:
        var(--wmn-topbar-hover-bg) !important;

    color:
        var(--wmn-topbar-hover-text) !important;
}


/* ============================================================
   COLLAPSED
   ============================================================ */

.wmn-dashboard-header.collapsed {

    height: 0 !important;

    min-height: 0 !important;

    padding: 0 !important;

    border: none !important;

    overflow: hidden !important;
}


/* ============================================================
   RTL
   ============================================================ */

body.rtl-mode
.wmn-workspace-overflow-menu {

    right: auto !important;

    left: 0 !important;

    direction: rtl !important;
}

            @media (max-width: 768px) {
                .wmn-custom-sidebar { width: 92vw; max-width: 320px; }
                .wmn-custom-sidebar.collapsed { width: 10px; }
                .wmn-card-groups,
                .wmn-shortcuts-grid { grid-template-columns: 1fr; }
                .wmn-workspace-dropdown { max-height: 75vh; padding: 10px; }
            }
        `;

        document.head.appendChild(style);
        scheduleNavigationThemeSync();
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


    // -----------------------------------------------------------------
    // Workspace-native dropdown renderer
    // -----------------------------------------------------------------
    // Frappe stores the visual Workspace layout in Workspace.content.
    // The server call gives us the actual widget data.  We combine both:
    //   content -> exact order + exact column width
    //   page data -> links / shortcuts / charts / number cards / etc.
    // Widgets are rendered with frappe.widget.SingleWidgetGroup, the same
    // renderer used by Frappe Workspace blocks in read-only mode.

    function getWorkspaceByName(name) {
        const all = getAllowedWorkspaces();
        return all.find(ws =>
            ws.name === name ||
            ws.title === name ||
            ws.label === name ||
            frappe.router.slug(ws.name || "") === frappe.router.slug(name || "") ||
            frappe.router.slug(ws.title || "") === frappe.router.slug(name || "")
        ) || null;
    }

    function parseWorkspaceContent(workspaceName) {
        const ws = getWorkspaceByName(workspaceName);
        if (!ws || !ws.content) return [];
        try {
            const blocks = typeof ws.content === "string" ? JSON.parse(ws.content) : ws.content;
            return Array.isArray(blocks) ? blocks : [];
        } catch (e) {
            console.warn("WMN Workspace Nav: invalid Workspace.content for", workspaceName, e);
            return [];
        }
    }

    function normalizeWorkspaceLabel(value) {
        let out = String(value == null ? "" : value);
        try {
            out = __(out);
            if (frappe.utils && frappe.utils.unescape_html) {
                out = frappe.utils.unescape_html(out);
            }
        } catch (e) {}
        return out.replace(/\s+/g, " ").trim().toLowerCase();
    }

    function workspaceBlockName(block) {
        const data = block && block.data ? block.data : {};
        const map = {
            shortcut: "shortcut_name",
            card: "card_name",
            chart: "chart_name",
            onboarding: "onboarding_name",
            quick_list: "quick_list_name",
            number_card: "number_card_name",
            custom_block: "custom_block_name"
        };
        const field = map[block && block.type];
        return field ? data[field] : "";
    }

    function workspaceDataKey(blockType) {
        const map = {
            shortcut: "shortcuts",
            card: "cards",
            chart: "charts",
            onboarding: "onboardings",
            quick_list: "quick_lists",
            number_card: "number_cards",
            custom_block: "custom_blocks"
        };
        return map[blockType] || "";
    }

    function workspaceWidgetType(blockType) {
        return blockType === "card" ? "links" : blockType;
    }

    function findWorkspaceBlockData(pageData, block) {
        const key = workspaceDataKey(block.type);
        const blockName = workspaceBlockName(block);
        if (!key || !blockName) return null;

        const group = pageData && pageData[key];
        const items = group && Array.isArray(group.items) ? group.items : [];
        const wanted = normalizeWorkspaceLabel(blockName);

        return items.find(item => {
            const candidates = [
                item && item.label,
                item && item.name,
                item && item.shortcut_name,
                item && item.card_name,
                item && item.chart_name,
                item && item.onboarding_name,
                item && item.quick_list_name,
                item && item.number_card_name,
                item && item.custom_block_name,
                item && item.link_to,
                item && item.document_type
            ];
            return candidates.some(v => v && normalizeWorkspaceLabel(v) === wanted);
        }) || null;
    }

    function addCustomCardsToWorkspaceLayout(blocks, pageData) {
        const result = Array.isArray(blocks) ? blocks.map(x => ({ ...x, data: { ...(x.data || {}) } })) : [];
        const cards = pageData && pageData.cards && Array.isArray(pageData.cards.items)
            ? pageData.cards.items
            : [];
        if (!cards.length) return result;

        const existing = new Set(
            result
                .filter(b => b.type === "card")
                .map(b => normalizeWorkspaceLabel(b.data && b.data.card_name))
        );

        const extras = ["Custom Documents", "Custom Reports"]
            .filter(name => cards.some(c => normalizeWorkspaceLabel(c.label) === normalizeWorkspaceLabel(name)))
            .filter(name => !existing.has(normalizeWorkspaceLabel(name)))
            .map(name => ({ type: "card", data: { card_name: name, col: 4 } }));

        if (!extras.length) return result;
        let lastCard = -1;
        result.forEach((b, i) => { if (b.type === "card") lastCard = i; });
        result.splice(lastCard >= 0 ? lastCard + 1 : result.length, 0, ...extras);
        return result;
    }

    function setNativeWorkspaceColumn(holder, rawCol) {
        let width = parseInt(rawCol || 12, 10);
        if (!Number.isFinite(width) || width < 1 || width > 12) width = 12;

        holder.classList.add("ce-block", "wmn-native-workspace-block");
        // Same break-point mapping used by Frappe Workspace Block.set_col_class().
        if (width >= 7) {
            holder.classList.add(`col-xs-${width}`);
        } else if (width === 6 || width === 5) {
            holder.classList.add("col-xs-12", `col-sm-${width}`);
        } else if (width === 4) {
            holder.classList.add("col-xs-12", "col-sm-6", "col-md-4");
        } else if (width === 3 || width === 2) {
            holder.classList.add("col-xs-12", "col-sm-6", "col-md-4", `col-lg-${width}`);
        } else {
            holder.classList.add("col-xs-12");
        }

        // Modern Bootstrap/Frappe builds may not ship the old col-xs-* widths.
        // flex-basis guarantees the saved Workspace column is still respected.
        holder.style.flex = `0 0 ${(width / 12) * 100}%`;
        holder.style.maxWidth = `${(width / 12) * 100}%`;
    }

    function translatedWorkspaceHtml(text) {
        text = String(text == null ? "" : text);
        if (!/<[a-z][\s\S]*>/i.test(text)) return esc(__(text));
        // Workspace content is already sanitized by the Workspace editor.
        // Preserve its inline formatting, as the native renderer does.
        return text;
    }

    function renderNativeTextBlock(block, content) {
        const type = block.type;
        const data = block.data || {};

        if (type === "header") {
            const el = document.createElement("div");
            el.className = "ce-header";
            el.innerHTML = translatedWorkspaceHtml(data.text || "");
            content.appendChild(el);
            return true;
        }

        if (type === "paragraph") {
            const el = document.createElement("div");
            el.className = "ce-paragraph widget";
            el.innerHTML = translatedWorkspaceHtml(data.text || "");
            content.appendChild(el);
            return true;
        }

        if (type === "spacer") {
            const el = document.createElement("div");
            el.className = "widget spacer";
            content.appendChild(el);
            return true;
        }

        return false;
    }

    function renderNativeWidgetBlock(pageData, block, content) {
        if (!(window.frappe && frappe.widget && frappe.widget.SingleWidgetGroup)) return false;

        const blockData = findWorkspaceBlockData(pageData, block);
        if (!blockData) return false;

        const host = document.createElement("div");
        host.className = "wmn-native-widget-host";
        content.appendChild(host);

        const widgetData = { ...blockData, in_customize_mode: false };
        try {
            new frappe.widget.SingleWidgetGroup({
                container: host,
                type: workspaceWidgetType(block.type),
                class_name: block.type === "chart" ? "widget-charts" : "",
                options: {
                    allow_sorting: false,
                    allow_create: false,
                    allow_delete: false,
                    allow_hiding: false,
                    allow_edit: false,
                    allow_resize: false
                },
                widgets: widgetData
            });
            return true;
        } catch (e) {
            console.warn("WMN Workspace Nav: native widget render failed", block.type, workspaceBlockName(block), e);
            host.remove();
            return false;
        }
    }

    function moveDashboardBlocksToBottom(blocks) {
        if (!Array.isArray(blocks) || !blocks.length) return [];

        // Inside the WMN dropdown only, keep the normal Workspace content first
        // and move analytical widgets to the bottom. Their relative order is kept.
        // Frappe Workspace uses "chart" for dashboard/chart widgets and
        // "number_card" for Number Cards.
        const bottomTypes = new Set(["chart", "number_card"]);
        const normalBlocks = [];
        const dashboardBlocks = [];

        blocks.forEach(block => {
            if (block && bottomTypes.has(block.type)) {
                dashboardBlocks.push(block);
            } else {
                normalBlocks.push(block);
            }
        });

        return normalBlocks.concat(dashboardBlocks);
    }

    function renderWorkspaceBodyNative(pageData, container, workspaceName, options) {
        let blocks = parseWorkspaceContent(workspaceName);
        if (!blocks.length) return false;

        blocks = addCustomCardsToWorkspaceLayout(blocks, pageData);

        // WMN dropdown rule: Charts/Dashboard widgets and Number Cards always
        // appear after the rest of the Workspace content.
        blocks = moveDashboardBlocksToBottom(blocks);

        container.innerHTML = "";

        const page = document.createElement("div");
        page.className = "wmn-native-workspace desk-page page-main-content";
        page.dataset.workspace = workspaceName || "";

        const editor = document.createElement("div");
        editor.className = "codex-editor";
        const redactor = document.createElement("div");
        redactor.className = "codex-editor__redactor wmn-native-workspace-grid";
        editor.appendChild(redactor);
        page.appendChild(editor);
        container.appendChild(page);

        let rendered = 0;
        blocks.forEach(block => {
            if (!block || !block.type) return;
            const holder = document.createElement("div");
            setNativeWorkspaceColumn(holder, block.data && block.data.col);

            const inner = document.createElement("div");
            inner.className = "ce-block__content";
            holder.appendChild(inner);

            let ok = renderNativeTextBlock(block, inner);
            if (!ok) ok = renderNativeWidgetBlock(pageData, block, inner);

            if (ok) {
                redactor.appendChild(holder);
                rendered += 1;
            }
        });

        if (!rendered) {
            container.innerHTML = "";
            return false;
        }

        // Re-sync semantic theme variables after native widgets are inserted.
        scheduleNavigationThemeSync();
        return true;
    }

    function renderWorkspaceBody(data, container, options) {
        options = options || {};
        const nativeRendered = renderWorkspaceBodyNative(
            data,
            container,
            options.workspaceName || "",
            options
        );
        if (!nativeRendered) {
            renderWorkspaceBodyFallback(data, container, options);
        }
    }

    function renderWorkspaceBodyFallback(data, container, options) {
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
        
                const overflowWrap = document.getElementById("wmn-workspace-overflow");
                const overflowMenu = document.getElementById("wmn-workspace-overflow-menu");

                if (!header || !dropdown) return;

                if (overflowMenu && overflowMenu.classList.contains("show") &&
                    (!overflowWrap || !overflowWrap.contains(e.target))) {
                    closeHeaderOverflowMenu();
                }

                if (!dropdown.classList.contains("show")) return;
                if (header.contains(e.target) || dropdown.contains(e.target)) return;

                dropdown.classList.remove("show");
                setHeaderWorkspaceActive(null);
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
                    <div class="wmn-workspace-overflow" id="wmn-workspace-overflow">
                        <button class="wmn-workspace-overflow-btn" id="wmn-workspace-overflow-btn" type="button" title="${esc(__("More Workspaces"))}" aria-label="${esc(__("More Workspaces"))}">
                            <span class="wmn-overflow-chevrons">»</span>
                        </button>
                        <div class="wmn-workspace-overflow-menu" id="wmn-workspace-overflow-menu"></div>
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
        bindHeaderOverflowMenu();

        document.getElementById("wmn-toggle-header-btn").onclick = function (e) {
            e.stopPropagation();
            const header = document.getElementById("wmn-dashboard-header");
            const dropdown = document.getElementById("wmn-workspace-dropdown");
            const icon = this.querySelector("i");
            header.classList.toggle("collapsed");
            if (header.classList.contains("collapsed")) {
                dropdown.classList.remove("show");
                closeHeaderOverflowMenu();
                icon.className = "fa fa-angle-down";
            } else {
                icon.className = "fa fa-angle-up";
            }
        };

        renderHeaderButtons();
    }

    function closeHeaderOverflowMenu() {
        const overflowMenu = document.getElementById("wmn-workspace-overflow-menu");
        const overflowBtn = document.getElementById("wmn-workspace-overflow-btn");
        if (overflowMenu) overflowMenu.classList.remove("show");
        if (overflowBtn) overflowBtn.classList.remove("menu-open");
    }

    function bindHeaderOverflowMenu() {
        const overflowBtn = document.getElementById("wmn-workspace-overflow-btn");
        const overflowMenu = document.getElementById("wmn-workspace-overflow-menu");
        if (!overflowBtn || !overflowMenu) return;

        overflowBtn.onclick = function (e) {
            e.preventDefault();
            e.stopPropagation();
            const willOpen = !overflowMenu.classList.contains("show");
            closeHeaderOverflowMenu();
            if (willOpen) {
                overflowMenu.classList.add("show");
                overflowBtn.classList.add("menu-open");
            }
        };

        if (!window.__WMN_HEADER_OVERFLOW_RESIZE_BOUND__) {
            window.__WMN_HEADER_OVERFLOW_RESIZE_BOUND__ = true;
            let resizeTimer = null;
            window.addEventListener("resize", function () {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(layoutHeaderWorkspaceOverflow, 60);
            });
        }

        const header = document.getElementById("wmn-dashboard-header");
        if (header && window.ResizeObserver) {
            if (WMN_NAV.headerOverflowResizeObserver) {
                try { WMN_NAV.headerOverflowResizeObserver.disconnect(); } catch (e) {}
            }
            WMN_NAV.headerOverflowResizeObserver = new ResizeObserver(function () {
                requestAnimationFrame(layoutHeaderWorkspaceOverflow);
            });
            WMN_NAV.headerOverflowResizeObserver.observe(header);
        }
    }

    function setHeaderWorkspaceActive(name) {
        WMN_NAV.activeHeaderWorkspace = name || null;

        document.querySelectorAll(".wmn-workspace-btn, .wmn-workspace-overflow-item")
            .forEach(function (el) {
                el.classList.toggle("active", !!name && el.dataset.workspace === name);
            });

        const overflow = document.getElementById("wmn-workspace-overflow");
        const overflowBtn = document.getElementById("wmn-workspace-overflow-btn");
        if (overflowBtn && overflow) {
            const hiddenActive = !!name && !!overflow.querySelector(
                `.wmn-workspace-overflow-item[data-workspace="${CSS.escape(name)}"]`
            );
            overflowBtn.classList.toggle("active", hiddenActive);
        }
    }

    function activateHeaderWorkspace(ws) {
        if (!ws) return;

        const dropdown = document.getElementById("wmn-workspace-dropdown");
        if (!dropdown) return;

        const sameWorkspace = WMN_NAV.activeHeaderWorkspace === ws.name;
        const isOpen = dropdown.classList.contains("show");

        closeHeaderOverflowMenu();

        if (sameWorkspace && isOpen) {
            dropdown.classList.remove("show");
            setHeaderWorkspaceActive(null);
            return;
        }

        setHeaderWorkspaceActive(ws.name);
        dropdown.classList.add("show");
        loadHeaderWorkspace(ws.name);
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

        roots.forEach(function (ws) {
            const btn = document.createElement("button");
            btn.className = "wmn-workspace-btn";
            btn.type = "button";
            btn.dataset.workspace = ws.name;
            btn.innerHTML = `<i class="${esc(getWorkspaceIcon(ws))}"></i> ${esc(getWorkspaceTitle(ws))}`;
            btn.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                activateHeaderWorkspace(ws);
            };
            menu.appendChild(btn);
        });

        requestAnimationFrame(function () {
            layoutHeaderWorkspaceOverflow();
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(layoutHeaderWorkspaceOverflow).catch(function () {});
            }
        });
    }

    function layoutHeaderWorkspaceOverflow() {
        const header = document.getElementById("wmn-dashboard-header");
        const menu = document.getElementById("wmn-workspace-menu");
        const overflow = document.getElementById("wmn-workspace-overflow");
        const overflowBtn = document.getElementById("wmn-workspace-overflow-btn");
        const overflowMenu = document.getElementById("wmn-workspace-overflow-menu");

        if (!header || !menu || !overflow || !overflowBtn || !overflowMenu) return;
        if (header.classList.contains("collapsed")) return;

        const buttons = Array.from(menu.querySelectorAll(".wmn-workspace-btn"));
        if (!buttons.length) {
            overflow.classList.remove("has-overflow");
            overflowMenu.innerHTML = "";
            return;
        }

        // Reset first so measurements are based on each button's natural width.
        buttons.forEach(function (btn) {
            btn.classList.remove("wmn-overflow-hidden");
        });
        overflow.classList.remove("has-overflow");
        overflowMenu.innerHTML = "";

        const headerStyle = getComputedStyle(header);
        const horizontalPadding =
            (parseFloat(headerStyle.paddingLeft) || 0) +
            (parseFloat(headerStyle.paddingRight) || 0);
        const availableWithoutOverflow = Math.max(0, header.clientWidth - horizontalPadding);
        const widths = buttons.map(function (btn) {
            return Math.ceil(btn.getBoundingClientRect().width);
        });
        const totalWidth = widths.reduce(function (a, b) { return a + b; }, 0);

        if (totalWidth <= availableWithoutOverflow) {
            setHeaderWorkspaceActive(WMN_NAV.activeHeaderWorkspace);
            return;
        }

        overflow.classList.add("has-overflow");
        const overflowWidth = Math.ceil(overflow.getBoundingClientRect().width) || 32;
        const available = Math.max(0, availableWithoutOverflow - overflowWidth - 2);

        let used = 0;
        let visibleCount = 0;
        for (let i = 0; i < buttons.length; i++) {
            const next = widths[i];
            if (used + next <= available) {
                used += next;
                visibleCount += 1;
            } else {
                break;
            }
        }

        // Keep at least one visible tab when there is enough space for it.
        if (visibleCount === 0 && widths[0] <= availableWithoutOverflow - overflowWidth) {
            visibleCount = 1;
        }

        buttons.forEach(function (btn, index) {
            if (index >= visibleCount) btn.classList.add("wmn-overflow-hidden");
        });

        const roots = getRootWorkspaces();
        roots.slice(visibleCount).forEach(function (ws) {
            const item = document.createElement("button");
            item.className = "wmn-workspace-overflow-item";
            item.type = "button";
            item.dataset.workspace = ws.name;
            item.innerHTML = `<i class="${esc(getWorkspaceIcon(ws))}"></i><span>${esc(getWorkspaceTitle(ws))}</span>`;
            item.onclick = function (e) {
                e.preventDefault();
                e.stopPropagation();
                activateHeaderWorkspace(ws);
            };
            overflowMenu.appendChild(item);
        });

        setHeaderWorkspaceActive(WMN_NAV.activeHeaderWorkspace);
    }

    async function loadHeaderWorkspace(name) {
        const tabHeader = document.getElementById("wmn-tab-header");
        const content = document.getElementById("wmn-tabs-content");
        if (!tabHeader || !content) return;

        renderHeaderTabs(name, tabHeader);
        content.innerHTML = `<div class="wmn-loading"><i class="fa fa-spinner fa-spin"></i></div>`;
        const data = await fetchDesktopPage(name);
        renderWorkspaceBody(data, content, {
            workspaceName: name,
            afterNavigate: function () {
                const dropdown = document.getElementById("wmn-workspace-dropdown");
                if (dropdown) dropdown.classList.remove("show");
                closeHeaderOverflowMenu();
                setHeaderWorkspaceActive(null);
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

        // Native Workspace widgets navigate on their own. Close the header
        // dropdown when the route changes, exactly like a normal navigation menu.
        if (WMN_NAV.mode === "header") {
            const dropdown = document.getElementById("wmn-workspace-dropdown");
            if (dropdown) dropdown.classList.remove("show");
            document.querySelectorAll(".wmn-workspace-btn").forEach(b => b.classList.remove("active"));
        }

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
