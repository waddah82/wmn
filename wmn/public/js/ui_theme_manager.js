/**
 * Shams / WMN UI Theme Manager
 *
 * DocTypes:
 *   - UI Theme
 *       theme_name
 *       description
 *       custom_css
 *
 *   - UI Theme Setting (Single)
 *       enable_themes
 *       active_theme -> UI Theme
 *
 * Design goals:
 *   1) Apply the last cached CSS immediately to avoid a flash of the original UI.
 *   2) Read the authoritative global setting from ERPNext as soon as Frappe is ready.
 *   3) Update localStorage when the active theme changes.
 *   4) Remove the theme immediately when themes are disabled.
 *   5) Allow DocType client scripts to re-apply changes without a page refresh.
 */

(function () {
    'use strict';

    const THEME_DOCTYPE = 'UI Theme';
    const SETTINGS_DOCTYPE = 'UI Theme Setting';
    const STYLE_ID = 'wmn-active-ui-theme';

    const STORAGE = {
        ENABLED: 'wmn_ui_theme_enabled',
        THEME_NAME: 'wmn_ui_theme_name',
        THEME_CSS: 'wmn_ui_theme_css'
    };

    let refreshPromise = null;

    function normalizeEnabled(value) {
        return value === 1 || value === true || value === '1';
    }

    function applyCSS(cssCode) {
        if (!cssCode) {
            removeThemeCSS();
            return;
        }

        let style = document.getElementById(STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            style.setAttribute('data-wmn-ui-theme', '1');
            document.head.appendChild(style);
        }

        if (style.textContent !== cssCode) {
            style.textContent = cssCode;
        }
    }

    function removeThemeCSS() {
        const style = document.getElementById(STYLE_ID);
        if (style) {
            style.remove();
        }
    }

    function saveThemeCache(themeName, cssCode) {
        try {
            localStorage.setItem(STORAGE.ENABLED, '1');
            localStorage.setItem(STORAGE.THEME_NAME, themeName || '');
            localStorage.setItem(STORAGE.THEME_CSS, cssCode || '');
        } catch (error) {
            console.warn('[WMN Theme] Could not save theme cache:', error);
        }
    }

    function clearThemeCache() {
        try {
            localStorage.setItem(STORAGE.ENABLED, '0');
            localStorage.removeItem(STORAGE.THEME_NAME);
            localStorage.removeItem(STORAGE.THEME_CSS);
        } catch (error) {
            console.warn('[WMN Theme] Could not clear theme cache:', error);
        }
    }

    function applyCachedThemeImmediately() {
        try {
            const enabled = localStorage.getItem(STORAGE.ENABLED);
            const cachedCSS = localStorage.getItem(STORAGE.THEME_CSS);

            if (enabled === '1' && cachedCSS) {
                applyCSS(cachedCSS);
                console.log('[WMN Theme] Cached theme applied immediately.');
            } else if (enabled === '0') {
                removeThemeCSS();
            }
        } catch (error) {
            console.warn('[WMN Theme] Could not read cached theme:', error);
        }
    }

    // Apply before waiting for window.onload or Frappe readiness.
    applyCachedThemeImmediately();

    function waitForFrappe() {
        return new Promise((resolve) => {
            const check = () => {
                if (
                    typeof window.frappe !== 'undefined' &&
                    frappe.db &&
                    typeof frappe.db.get_single_value === 'function'
                ) {
                    resolve();
                    return;
                }

                setTimeout(check, 50);
            };

            check();
        });
    }

    async function getThemeSettings() {
        await waitForFrappe();

        const [enableThemes, activeTheme] = await Promise.all([
            frappe.db.get_single_value(SETTINGS_DOCTYPE, 'enable_themes'),
            frappe.db.get_single_value(SETTINGS_DOCTYPE, 'active_theme')
        ]);

        return {
            enable_themes: enableThemes,
            active_theme: activeTheme
        };
    }

    async function getTheme(themeName) {
        await waitForFrappe();

        if (!themeName) {
            return null;
        }

        const response = await frappe.db.get_value(
            THEME_DOCTYPE,
            themeName,
            ['theme_name', 'custom_css']
        );

        return response && response.message ? response.message : null;
    }

    async function loadActiveTheme() {
        await waitForFrappe();

        const settings = await getThemeSettings();
        const enabled = normalizeEnabled(settings.enable_themes);

        if (!enabled) {
            removeThemeCSS();
            clearThemeCache();
            console.log('[WMN Theme] Themes are disabled.');

            return {
                enabled: false,
                theme: null
            };
        }

        if (!settings.active_theme) {
            removeThemeCSS();
            clearThemeCache();
            console.warn('[WMN Theme] Themes are enabled but no Active Theme is selected.');

            return {
                enabled: true,
                theme: null
            };
        }

        const theme = await getTheme(settings.active_theme);

        if (!theme || !theme.custom_css) {
            removeThemeCSS();
            clearThemeCache();
            console.warn(`[WMN Theme] Theme "${settings.active_theme}" has no CSS.`);

            return {
                enabled: true,
                theme: settings.active_theme,
                css: false
            };
        }

        applyCSS(theme.custom_css);
        saveThemeCache(settings.active_theme, theme.custom_css);

        window.dispatchEvent(new CustomEvent('wmn-theme-changed', {
            detail: {
                theme: settings.active_theme
            }
        }));

        console.log(`[WMN Theme] Active theme applied: ${settings.active_theme}`);

        return {
            enabled: true,
            theme: settings.active_theme,
            css: true
        };
    }

    async function refreshTheme(showMessage = false) {
        // Prevent duplicate concurrent server reads when several events fire together.
        if (refreshPromise) {
            return refreshPromise;
        }

        refreshPromise = (async () => {
            try {
                const result = await loadActiveTheme();

                if (showMessage && typeof frappe !== 'undefined' && frappe.show_alert) {
                    if (result && result.enabled && result.theme && result.css !== false) {
                        frappe.show_alert({
                            message: __('Theme applied: {0}', [result.theme]),
                            indicator: 'green'
                        }, 3);
                    } else if (result && !result.enabled) {
                        frappe.show_alert({
                            message: __('Themes are disabled'),
                            indicator: 'blue'
                        }, 3);
                    }
                }

                return result;
            } catch (error) {
                console.error('[WMN Theme] Failed to load theme:', error);

                // Do NOT remove the cached theme on a temporary network/server error.
                // Keeping it prevents a visual flash and preserves the last known good UI.
                if (showMessage && typeof frappe !== 'undefined' && frappe.show_alert) {
                    frappe.show_alert({
                        message: __('Could not refresh the UI theme'),
                        indicator: 'red'
                    }, 4);
                }

                return null;
            } finally {
                refreshPromise = null;
            }
        })();

        return refreshPromise;
    }

    async function refreshIfActive(themeName) {
        try {
            const current = localStorage.getItem(STORAGE.THEME_NAME);
            if (current === themeName) {
                return await refreshTheme(false);
            }

            // The active theme may have been changed on another tab/device.
            // Reading the setting also handles that case correctly.
            const settings = await getThemeSettings();
            if (normalizeEnabled(settings.enable_themes) && settings.active_theme === themeName) {
                return await refreshTheme(false);
            }
        } catch (error) {
            console.warn('[WMN Theme] Could not check active theme:', error);
        }

        return null;
    }

    function currentTheme() {
        return {
            enabled: localStorage.getItem(STORAGE.ENABLED) === '1',
            theme: localStorage.getItem(STORAGE.THEME_NAME)
        };
    }

    function clear() {
        removeThemeCSS();
        clearThemeCache();
    }

    // Public API used by the DocType client scripts.
    window.ShamsTheme = {
        refresh: refreshTheme,
        reload: loadActiveTheme,
        refreshIfActive: refreshIfActive,
        current: currentTheme,
        clear: clear
    };

    // Sync with the authoritative server setting as soon as Frappe is ready.
    refreshTheme(false);

    // If another browser tab changes the cached theme, reflect it here too.
    window.addEventListener('storage', (event) => {
        if (
            event.key === STORAGE.THEME_CSS ||
            event.key === STORAGE.ENABLED ||
            event.key === STORAGE.THEME_NAME
        ) {
            applyCachedThemeImmediately();
        }
    });
})();
