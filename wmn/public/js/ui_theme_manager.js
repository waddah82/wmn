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
 *       fixed_css      -> CSS shared by all themes and applied even when themes are disabled
 *       enable_themes  -> controls only the theme-specific CSS
 *       active_theme   -> UI Theme
 *
 * Final CSS order:
 *      fixed_css
 *      +
 *      active UI Theme.custom_css
 *
 * The theme CSS is deliberately appended AFTER fixed_css, so a theme can override
 * shared visual variables/rules when both selectors have the same specificity.
 */

(function () {
    'use strict';

    const THEME_DOCTYPE = 'UI Theme';
    const SETTINGS_DOCTYPE = 'UI Theme Setting';
    const STYLE_ID = 'wmn-active-ui-theme';

    const STORAGE = {
        THEMES_ENABLED: 'wmn_ui_themes_enabled',
        THEME_NAME: 'wmn_ui_theme_name',
        COMBINED_CSS: 'wmn_ui_combined_css'
    };

    // Old keys from the first version. They are read once for a smooth upgrade.
    const LEGACY_STORAGE = {
        ENABLED: 'wmn_ui_theme_enabled',
        THEME_CSS: 'wmn_ui_theme_css'
    };

    let refreshPromise = null;

    function normalizeEnabled(value) {
        return value === 1 || value === true || value === '1';
    }

    function normalizeCSS(value) {
        return typeof value === 'string' ? value.trim() : '';
    }

    /**
     * Merge the shared/base CSS with the selected theme CSS.
     * The separator comments are useful when inspecting the injected <style> in DevTools.
     */
    function buildCombinedCSS(fixedCSS, themeCSS) {
        const base = normalizeCSS(fixedCSS);
        const theme = normalizeCSS(themeCSS);
        const parts = [];

        if (base) {
            parts.push(
                '/* ==========================================================\n' +
                '   WMN FIXED CSS - UI Theme Setting\n' +
                '   ========================================================== */\n' +
                base
            );
        }

        if (theme) {
            parts.push(
                '/* ==========================================================\n' +
                '   WMN ACTIVE THEME CSS\n' +
                '   ========================================================== */\n' +
                theme
            );
        }

        return parts.join('\n\n');
    }

    function applyCSS(cssCode) {
        const css = normalizeCSS(cssCode);

        if (!css) {
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

        if (style.textContent !== css) {
            style.textContent = css;
        }
    }

    function removeThemeCSS() {
        const style = document.getElementById(STYLE_ID);
        if (style) {
            style.remove();
        }
    }

    function saveCache({ themesEnabled, themeName, combinedCSS }) {
        try {
            localStorage.setItem(
                STORAGE.THEMES_ENABLED,
                themesEnabled ? '1' : '0'
            );

            if (themeName) {
                localStorage.setItem(STORAGE.THEME_NAME, themeName);
            } else {
                localStorage.removeItem(STORAGE.THEME_NAME);
            }

            const css = normalizeCSS(combinedCSS);
            if (css) {
                localStorage.setItem(STORAGE.COMBINED_CSS, css);
            } else {
                localStorage.removeItem(STORAGE.COMBINED_CSS);
            }

            // Remove keys used by the previous implementation after a successful refresh.
            localStorage.removeItem(LEGACY_STORAGE.ENABLED);
            localStorage.removeItem(LEGACY_STORAGE.THEME_CSS);
        } catch (error) {
            console.warn('[WMN Theme] Could not save UI CSS cache:', error);
        }
    }

    function clearCache() {
        try {
            localStorage.removeItem(STORAGE.THEMES_ENABLED);
            localStorage.removeItem(STORAGE.THEME_NAME);
            localStorage.removeItem(STORAGE.COMBINED_CSS);
            localStorage.removeItem(LEGACY_STORAGE.ENABLED);
            localStorage.removeItem(LEGACY_STORAGE.THEME_CSS);
        } catch (error) {
            console.warn('[WMN Theme] Could not clear UI CSS cache:', error);
        }
    }

    /**
     * Apply the last known merged CSS immediately, before waiting for Frappe.
     * This is what prevents the original ERPNext styling from flashing first.
     */
    function applyCachedCSSImmediately() {
        try {
            let cachedCSS = localStorage.getItem(STORAGE.COMBINED_CSS);

            // Upgrade path from the previous package version.
            if (!cachedCSS) {
                const oldEnabled = localStorage.getItem(LEGACY_STORAGE.ENABLED);
                const oldCSS = localStorage.getItem(LEGACY_STORAGE.THEME_CSS);
                if (oldEnabled === '1' && oldCSS) {
                    cachedCSS = oldCSS;
                }
            }

            if (cachedCSS) {
                applyCSS(cachedCSS);
                console.log('[WMN Theme] Cached combined CSS applied immediately.');
            }
        } catch (error) {
            console.warn('[WMN Theme] Could not read cached UI CSS:', error);
        }
    }

    // Run immediately. Do not wait for window.onload.
    applyCachedCSSImmediately();

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

        const [fixedCSS, enableThemes, activeTheme] = await Promise.all([
            frappe.db.get_single_value(SETTINGS_DOCTYPE, 'fixed_css'),
            frappe.db.get_single_value(SETTINGS_DOCTYPE, 'enable_themes'),
            frappe.db.get_single_value(SETTINGS_DOCTYPE, 'active_theme')
        ]);

        return {
            fixed_css: fixedCSS || '',
            enable_themes: enableThemes,
            active_theme: activeTheme || null
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
        const themesEnabled = normalizeEnabled(settings.enable_themes);
        const fixedCSS = settings.fixed_css || '';

        let theme = null;
        let themeCSS = '';
        let activeThemeName = null;

        // The fixed CSS is independent from enable_themes.
        // enable_themes only controls whether the selected theme CSS is appended.
        if (themesEnabled) {
            if (!settings.active_theme) {
                console.warn('[WMN Theme] Themes are enabled but no Active Theme is selected. Applying Fixed CSS only.');
            } else {
                activeThemeName = settings.active_theme;
                theme = await getTheme(settings.active_theme);

                if (theme && theme.custom_css) {
                    themeCSS = theme.custom_css;
                } else {
                    console.warn(`[WMN Theme] Theme "${settings.active_theme}" has no CSS. Applying Fixed CSS only.`);
                }
            }
        }

        const combinedCSS = buildCombinedCSS(fixedCSS, themeCSS);

        if (combinedCSS) {
            applyCSS(combinedCSS);
        } else {
            removeThemeCSS();
        }

        saveCache({
            themesEnabled,
            themeName: themesEnabled ? activeThemeName : null,
            combinedCSS
        });

        window.dispatchEvent(new CustomEvent('wmn-theme-changed', {
            detail: {
                themes_enabled: themesEnabled,
                theme: themesEnabled ? activeThemeName : null,
                has_fixed_css: !!normalizeCSS(fixedCSS),
                has_theme_css: !!normalizeCSS(themeCSS)
            }
        }));

        if (themesEnabled && activeThemeName && themeCSS) {
            console.log(`[WMN Theme] Fixed CSS + active theme applied: ${activeThemeName}`);
        } else if (themesEnabled) {
            console.log('[WMN Theme] Fixed CSS applied; no valid theme CSS was appended.');
        } else {
            console.log('[WMN Theme] Themes are disabled. Fixed CSS applied only.');
        }

        return {
            enabled: themesEnabled,
            theme: themesEnabled ? activeThemeName : null,
            fixed_css: !!normalizeCSS(fixedCSS),
            theme_css: !!normalizeCSS(themeCSS),
            css: !!normalizeCSS(combinedCSS)
        };
    }

    async function refreshTheme(showMessage = false) {
        // Prevent duplicate concurrent reads when several Frappe events fire together.
        if (refreshPromise) {
            return refreshPromise;
        }

        refreshPromise = (async () => {
            try {
                const result = await loadActiveTheme();

                if (showMessage && typeof frappe !== 'undefined' && frappe.show_alert) {
                    if (result && result.enabled && result.theme && result.theme_css) {
                        frappe.show_alert({
                            message: __('Fixed CSS + theme applied: {0}', [result.theme]),
                            indicator: 'green'
                        }, 3);
                    } else if (result && result.enabled) {
                        frappe.show_alert({
                            message: __('Fixed CSS applied. No active theme CSS was found.'),
                            indicator: 'orange'
                        }, 3);
                    } else {
                        frappe.show_alert({
                            message: __('Themes are disabled. Fixed CSS is active.'),
                            indicator: 'blue'
                        }, 3);
                    }
                }

                return result;
            } catch (error) {
                console.error('[WMN Theme] Failed to load UI CSS:', error);

                // Keep the last cached CSS on temporary server/network errors.
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
            const settings = await getThemeSettings();

            if (
                normalizeEnabled(settings.enable_themes) &&
                settings.active_theme === themeName
            ) {
                return await refreshTheme(false);
            }
        } catch (error) {
            console.warn('[WMN Theme] Could not check active theme:', error);
        }

        return null;
    }

    function currentTheme() {
        return {
            enabled: localStorage.getItem(STORAGE.THEMES_ENABLED) === '1',
            theme: localStorage.getItem(STORAGE.THEME_NAME),
            has_cached_css: !!localStorage.getItem(STORAGE.COMBINED_CSS)
        };
    }

    function clear() {
        removeThemeCSS();
        clearCache();
    }

    window.ShamsTheme = {
        refresh: refreshTheme,
        reload: loadActiveTheme,
        refreshIfActive: refreshIfActive,
        current: currentTheme,
        clear: clear,
        buildCombinedCSS: buildCombinedCSS
    };

    // Synchronize with server settings as soon as Frappe becomes available.
    refreshTheme(false);

    // Synchronize multiple open browser tabs.
    window.addEventListener('storage', (event) => {
        if (
            event.key === STORAGE.COMBINED_CSS ||
            event.key === STORAGE.THEMES_ENABLED ||
            event.key === STORAGE.THEME_NAME
        ) {
            applyCachedCSSImmediately();
        }
    });
})();
