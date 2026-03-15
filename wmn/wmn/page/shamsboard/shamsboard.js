frappe.pages['shamsboard'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('ShamsBoard'),
        single_column: true
    });

    $(wrapper).find('.layout-main-section').html(frappe.render_template('shamsboard'));
    initShamsBoard(page, wrapper);
    initShamsBoardNativeSearch();
};


function initShamsBoardNativeSearch() {
    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const isOnShamsboard = () => window.location.pathname.includes('/app/shamsboard');

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const toShamsboardUrl = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        return `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
    };

    const openRouteInIframe = (route, push = true) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = toShamsboardUrl(finalRoute);
        if (push) {
            window.history.pushState({ path: smartUrl }, '', smartUrl);
        } else {
            window.history.replaceState({ path: smartUrl }, '', smartUrl);
        }
    };

    const restoreRoute = () => {
        const params = new URLSearchParams(window.location.search);
        const route = params.get('route');
        if (route) {
            iframe.src = decodeURIComponent(route);
        } else {
            iframe.src = '/app';
        }
    };

    const patchOpenInNewTabLinks = () => {
        document.querySelectorAll(`
            .navbar a[href^="/app"],
            .navbar a[href^="app/"],
            .navbar a[href^="/desk"],
            .navbar a[href^="desk/"],
            #toolbar-user a[href^="/app"],
            #toolbar-user a[href^="app/"],
            #toolbar-user a[href^="/desk"],
            #toolbar-user a[href^="desk/"],
            .awesomplete a[href^="/app"],
            .awesomplete a[href^="app/"],
            .awesomplete a[href^="/desk"],
            .awesomplete a[href^="desk/"]
        `).forEach(link => {
            const rawHref = link.getAttribute('href');
            if (!rawHref) return;
            if (rawHref.includes('/app/shamsboard?route=')) return;

            const route = rawHref.startsWith('/') ? rawHref : `/${rawHref}`;
            link.setAttribute('href', toShamsboardUrl(route));
        });

        const logoLink = document.querySelector('.navbar-home[href]');
        if (logoLink) {
            logoLink.setAttribute('href', toShamsboardUrl('/app'));
        }
    };

    restoreRoute();
    patchOpenInNewTabLinks();
    setTimeout(patchOpenInNewTabLinks, 300);
    setTimeout(patchOpenInNewTabLinks, 1000);

    if (!window.__shamsboard_patch_links_click_refresh__) {
        window.__shamsboard_patch_links_click_refresh__ = true;

        document.addEventListener('click', () => {
            setTimeout(patchOpenInNewTabLinks, 50);
        });
    }

    if (!window.__shamsboard_native_search_click_hook__) {
        window.__shamsboard_native_search_click_hook__ = true;

        document.addEventListener('click', function (e) {
            if (!isOnShamsboard()) return;

            const target = e.target.closest(
                '.search-result, .awesomplete li, [data-route], [data-path], a[href^="/app/"], a[href^="app/"], a[href^="/desk/"], a[href^="desk/"], .navbar-home'
            );

            if (!target) return;
            if (target.closest('#content-frame')) return;

            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;

            let route =
                target.getAttribute('data-route') ||
                target.getAttribute('data-path') ||
                target.getAttribute('href');

            if (!route) {
                const innerLink = target.querySelector('a[href]');
                if (innerLink) {
                    route = innerLink.getAttribute('href');
                }
            }

            if (!route && target.classList.contains('navbar-home')) {
                route = '/app';
            }

            if (!route) return;

            if (route.includes('/app/shamsboard?route=')) {
                try {
                    const parsed = new URL(route, window.location.origin);
                    route = parsed.searchParams.get('route') || '/app';
                } catch (err) {
                    const qs = route.split('?')[1] || '';
                    const sp = new URLSearchParams(qs);
                    route = sp.get('route') || '/app';
                }
            }

            const isDeskRoute =
                route.startsWith('/app') ||
                route.startsWith('app/') ||
                route.startsWith('/desk') ||
                route.startsWith('desk/');

            if (!isDeskRoute) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            openRouteInIframe(route, true);
        }, true);
    }

    if (!window.__shamsboard_native_set_route_hook__) {
        window.__shamsboard_native_set_route_hook__ = true;

        const originalSetRoute = frappe.set_route.bind(frappe);

        frappe.set_route = function (...args) {
            const onShamsboard = isOnShamsboard();
            const frame = document.getElementById('content-frame');

            if (!onShamsboard || !frame) {
                return originalSetRoute(...args);
            }

            const parts = args
                .flat()
                .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
                .map(v => String(v).replace(/^\/+|\/+$/g, ''));

            if (!parts.length) {
                return originalSetRoute(...args);
            }

            const route = '/app/' + parts.join('/');
            openRouteInIframe(route, true);
            return Promise.resolve();
        };
    }

    if (!window.__shamsboard_popstate_hook__) {
        window.__shamsboard_popstate_hook__ = true;

        window.addEventListener('popstate', function () {
            if (!isOnShamsboard()) return;

            const frame = document.getElementById('content-frame');
            if (!frame) return;

            const params = new URLSearchParams(window.location.search);
            const route = params.get('route');
            frame.src = route ? decodeURIComponent(route) : '/app';
        });
    }

    if (!iframe.dataset.shamsboardLoadBound) {
        iframe.dataset.shamsboardLoadBound = '1';

        iframe.addEventListener('load', () => {
            try {
                const fDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!fDoc || !fDoc.head) return;

                const styleId = 'injected-shamsboard-style';
                if (fDoc.getElementById(styleId)) return;

                const style = fDoc.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                    .app-logo { display: none !important; }
                    body { padding: 0 !important; }
                    .layout-main-section-wrapper { padding-right: 0 !important; padding-left: 0 !important; padding-top: 40px !important; }
                    .layout-main-section { padding: 0 !important; margin: 0 !important; width: 100% !important; }
                `;
                fDoc.head.appendChild(style);
            } catch (e) {
                console.warn('Iframe CSS injection failed:', e);
            }
        });
    }
}







function initShamsBoardNativeSearch22222() {
    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const isOnShamsboard = () => window.location.pathname.includes('/app/shamsboard');

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const toShamsboardUrl = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        return `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
    };

    const openRouteInIframe = (route, push = true) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = toShamsboardUrl(finalRoute);
        if (push) {
            window.history.pushState({ path: smartUrl }, '', smartUrl);
        } else {
            window.history.replaceState({ path: smartUrl }, '', smartUrl);
        }
    };

    const restoreRoute = () => {
        const params = new URLSearchParams(window.location.search);
        const route = params.get('route');
        if (route) {
            iframe.src = decodeURIComponent(route);
        } else {
            iframe.src = '/app';
        }
    };

    const patchOpenInNewTabLinks = () => {

        document.querySelectorAll(`
            .navbar a[href^="/app"],
            .navbar a[href^="app/"],
            .navbar a[href^="/desk"],
            .navbar a[href^="desk/"],
            #toolbar-user a[href^="/app"],
            #toolbar-user a[href^="app/"],
            #toolbar-user a[href^="/desk"],
            #toolbar-user a[href^="desk/"],
            .awesomplete a[href^="/app"],
            .awesomplete a[href^="app/"],
            .awesomplete a[href^="/desk"],
            .awesomplete a[href^="desk/"]
        `).forEach(link => {
            const rawHref = link.getAttribute('href');
            if (!rawHref) return;
            if (rawHref.includes('/app/shamsboard?route=')) return;

            const route = rawHref.startsWith('/') ? rawHref : `/${rawHref}`;
            link.setAttribute('href', toShamsboardUrl(route));
        });


        const logoLink = document.querySelector('.navbar-home[href]');
        if (logoLink) {
            logoLink.setAttribute('href', toShamsboardUrl('/app'));
        }
    };

    restoreRoute();
    patchOpenInNewTabLinks();
    setTimeout(patchOpenInNewTabLinks, 300);
    setTimeout(patchOpenInNewTabLinks, 1000);

    if (!window.__shamsboard_patch_links_click_refresh__) {
        window.__shamsboard_patch_links_click_refresh__ = true;

        document.addEventListener('click', () => {
            setTimeout(patchOpenInNewTabLinks, 30);
            setTimeout(patchOpenInNewTabLinks, 200);
        });
    }

    if (!window.__shamsboard_native_search_click_hook__) {
        window.__shamsboard_native_search_click_hook__ = true;

        document.addEventListener('click', function (e) {
            if (!isOnShamsboard()) return;

            const target = e.target.closest(
                '.search-result, .awesomplete li, [data-route], [data-path], a[href^="/app/"], a[href^="app/"], a[href^="/desk/"], a[href^="desk/"], .navbar-home'
            );

            if (!target) return;
            if (target.closest('#content-frame')) return;


            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) {
                return;
            }

            let route =
                target.getAttribute('data-route') ||
                target.getAttribute('data-path') ||
                target.getAttribute('href');

            if (!route) {
                const innerLink = target.querySelector('a[href]');
                if (innerLink) {
                    route = innerLink.getAttribute('href');
                }
            }

            if (!route && target.classList.contains('navbar-home')) {
                route = '/app';
            }

            if (!route) return;


            if (route.includes('/app/shamsboard?route=')) {
                try {
                    const parsed = new URL(route, window.location.origin);
                    route = parsed.searchParams.get('route') || '/app';
                } catch (err) {
                    const qs = route.split('?')[1] || '';
                    const sp = new URLSearchParams(qs);
                    route = sp.get('route') || '/app';
                }
            }

            const isDeskRoute =
                route.startsWith('/app') ||
                route.startsWith('app/') ||
                route.startsWith('/desk') ||
                route.startsWith('desk/');

            if (!isDeskRoute) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            openRouteInIframe(route, true);
        }, true);
    }

    if (!window.__shamsboard_native_set_route_hook__) {
        window.__shamsboard_native_set_route_hook__ = true;

        const originalSetRoute = frappe.set_route.bind(frappe);

        frappe.set_route = function (...args) {
            const onShamsboard = isOnShamsboard();
            const frame = document.getElementById('content-frame');

            if (!onShamsboard || !frame) {
                return originalSetRoute(...args);
            }

            const parts = args
                .flat()
                .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
                .map(v => String(v).replace(/^\/+|\/+$/g, ''));

            if (!parts.length) {
                return originalSetRoute(...args);
            }

            const route = '/app/' + parts.join('/');
            openRouteInIframe(route, true);
            return Promise.resolve();
        };
    }

    if (!window.__shamsboard_popstate_hook__) {
        window.__shamsboard_popstate_hook__ = true;

        window.addEventListener('popstate', function () {
            if (!isOnShamsboard()) return;

            const frame = document.getElementById('content-frame');
            if (!frame) return;

            const params = new URLSearchParams(window.location.search);
            const route = params.get('route');
            frame.src = route ? decodeURIComponent(route) : '/app';
        });
    }

    if (!iframe.dataset.shamsboardLoadBound) {
        iframe.dataset.shamsboardLoadBound = '1';

        iframe.addEventListener('load', () => {
            try {
                const fDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (!fDoc || !fDoc.head || !fDoc.body) return;

                const styleId = 'injected-shamsboard-style';
                if (!fDoc.getElementById(styleId)) {
                    const style = fDoc.createElement('style');
                    style.id = styleId;
                    style.innerHTML = `
                        body {
                            box-sizing: border-box !important;
                        }

                        .layout-main-section {
                            margin: 0 !important;
                            width: 100% !important;
                            box-sizing: border-box !important;
                        }
                    `;
                    fDoc.head.appendChild(style);
                }

                const topHeader =
                    fDoc.querySelector('.sticky-top') ||
                    fDoc.querySelector('.navbar') ||
                    fDoc.querySelector('header') ||
                    fDoc.querySelector('.page-head');

                const content =
                    fDoc.querySelector('.layout-main-section') ||
                    fDoc.querySelector('.layout-main') ||
                    fDoc.body;

                if (topHeader && content) {
                    const h = Math.ceil(topHeader.getBoundingClientRect().height || 0);
                    if (h > 5000) {
                        content.style.paddingTop = (h + 16) + 'px';
                    }
                }
            } catch (e) {
                console.warn('Iframe CSS injection failed:', e);
            }
        });
    }
}

function initShamsBoardNativeSearch1111() {
    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };
    const logoLink = document.querySelector('.navbar-home');

    if (logoLink) {
        logoLink.href = "/app/shamsboard?route=%2Fapp";
        logoLink.addEventListener('click', function(e) {
            if (e.ctrlKey || e.metaKey || e.button === 1) return;
            e.preventDefault(); 
            const route = '/app';

            iframe.src = route;

            const smartUrl = `/app/shamsboard?route=${encodeURIComponent(route)}`;
            window.history.pushState({ path: smartUrl }, '', smartUrl);
        });
    }

    const openRouteInIframe = (route, push = true) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
        if (push) {
            window.history.pushState({ path: smartUrl }, '', smartUrl);
        } else {
            window.history.replaceState({ path: smartUrl }, '', smartUrl);
        }
    };

    const restoreRoute = () => {
        const params = new URLSearchParams(window.location.search);
        const route = params.get('route');
        if (route) {
            iframe.src = decodeURIComponent(route);
        } else {
            iframe.src = '/app';
        }
    };

    restoreRoute();

    if (!window.__shamsboard_native_search_click_hook__) {
        window.__shamsboard_native_search_click_hook__ = true;

        document.addEventListener('click', function (e) {
            if (!window.location.pathname.includes('/app/shamsboard')) return;

            const target = e.target.closest(
                '.search-result, .awesomplete li, [data-route], [data-path], a[href^="/app/"], a[href^="app/"], a[href^="/desk/"], a[href^="desk/"]'
            );

            if (!target) return;

            let route =
                target.getAttribute('data-route') ||
                target.getAttribute('data-path') ||
                target.getAttribute('href');

            if (!route) {
                const innerLink = target.querySelector('a[href]');
                if (innerLink) {
                    route = innerLink.getAttribute('href');
                }
            }

            if (!route) return;

            const isDeskRoute =
                route.startsWith('/app') ||
                route.startsWith('app/') ||
                route.startsWith('/desk') ||
                route.startsWith('desk/');

            if (!isDeskRoute) return;

            if (target.closest('#content-frame')) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            openRouteInIframe(route, true);
        }, true);
    }

    if (!window.__shamsboard_native_set_route_hook__) {
        window.__shamsboard_native_set_route_hook__ = true;

        const originalSetRoute = frappe.set_route.bind(frappe);

        frappe.set_route = function (...args) {
            const onShamsboard = window.location.pathname.includes('/app/shamsboard');
            const frame = document.getElementById('content-frame');

            if (!onShamsboard || !frame) {
                return originalSetRoute(...args);
            }

            const parts = args
                .flat()
                .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
                .map(v => String(v).replace(/^\/+|\/+$/g, ''));

            if (!parts.length) {
                return originalSetRoute(...args);
            }

            const route = '/app/' + parts.join('/');
            openRouteInIframe(route, true);
            return Promise.resolve();
        };
    }

    if (!window.__shamsboard_popstate_hook__) {
        window.__shamsboard_popstate_hook__ = true;

        window.addEventListener('popstate', function () {
            if (!window.location.pathname.includes('/app/shamsboard')) return;

            const frame = document.getElementById('content-frame');
            if (!frame) return;

            const params = new URLSearchParams(window.location.search);
            const route = params.get('route');
            frame.src = route ? decodeURIComponent(route) : '/app';
        });
    }

    iframe.addEventListener('load', () => {
        try {
            const fDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!fDoc || !fDoc.head) return;

            const styleId = 'injected-shamsboard-style';
            if (fDoc.getElementById(styleId)) return;

            const style = fDoc.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                .app-logo { display: none !important; }
                body { padding-top: 0 !important; }
                .layout-main-section { padding: 20px !important; margin: 0 !important; width: 100% !important; }
            `;
            fDoc.head.appendChild(style);
        } catch (e) {
            console.warn('Iframe CSS injection failed:', e);
        }
    });
}

function initShamsBoard(page, wrapper) {
    const allowedWorkspaces = [
        "Accounting", "Selling", "Buying", "Stock", "HR", "Assets",
        "Manufacturing", "Quality", "Projects", "Settings", "Users",
        "CRM", "Tools"
    ];

    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const cleanupOld = () => {
        document.querySelectorAll('.shamsboard-workspaces-host').forEach(el => el.remove());
        document.querySelectorAll('.shamsboard-dropdown-host').forEach(el => el.remove());
    };

    cleanupOld();

    const titleWrap =
        wrapper.querySelector('.page-title') ||
        document.querySelector('.page-title');

    if (titleWrap) {
        titleWrap.style.display = 'none';
    }

    const navbarInner =
        document.querySelector('.navbar .container') ||
        document.querySelector('.navbar > .container-fluid') ||
        document.querySelector('.navbar');

    if (!navbarInner) {
        console.error('ShamsBoard: navbar inner not found');
        return;
    }

    const logoEl =
        navbarInner.querySelector('.navbar-home') ||
        navbarInner.querySelector('.app-logo') ||
        navbarInner.querySelector('.navbar-brand');

    const searchArea =
        navbarInner.querySelector('.search-bar') ||
        navbarInner.querySelector('.input-with-feedback') ||
        navbarInner.querySelector('.dropdown-navbar-user') ||
        navbarInner.lastElementChild;

    const workspaceHost = document.createElement('div');
    workspaceHost.className = 'shamsboard-workspaces-host';
    workspaceHost.innerHTML = `<div id="workspace-menu" class="workspace-menu"></div>`;

    const dropdownHost = document.createElement('div');
    dropdownHost.className = 'shamsboard-dropdown-host';
    dropdownHost.innerHTML = `
        <div id="dropdown-panel" class="custom-dropdown">
            <div id="tabs-content" class="cards-grid-container"></div>
        </div>
    `;

    if (searchArea && searchArea.parentNode === navbarInner) {
        navbarInner.insertBefore(workspaceHost, searchArea);
    } else if (logoEl && logoEl.parentNode === navbarInner && logoEl.nextSibling) {
        navbarInner.insertBefore(workspaceHost, logoEl.nextSibling);
    } else {
        navbarInner.appendChild(workspaceHost);
    }

    document.body.appendChild(dropdownHost);

    const dropdownPanel = document.getElementById('dropdown-panel');
    const menu = document.getElementById('workspace-menu');

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const closeAllMenus = () => {
        dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
        });
    };

    const openRouteInIframe = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
        window.history.pushState({ path: smartUrl }, '', smartUrl);

        closeAllMenus();
    };

    const applyIframeFix = () => {
        try {
            const fDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!fDoc || !fDoc.head || !fDoc.body) return;

            const styleId = 'injected-shamsboard-style';
            if (!fDoc.getElementById(styleId)) {
                const style = fDoc.createElement('style');
                style.id = styleId;
                style.innerHTML = `
                
                    body { box-sizing: border-box !important; }
                    .layout-main-section {
                        margin: 0 !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    .sticky-top, .header.navbar, .navbar { margin: 0 !important; padding: 0 !important; min-height: 0 !important; }
                    .desk-sidebar, .standard-sidebar, .sticky-top { display: none !important; }
                    .layout-main-section-wrapper { padding-right: 0 !important; padding-left: 0 !important; padding-top: 40px !important; }
                    .layout-main-section { padding-right: 0 !important; padding-left: 0 !important; padding-top: 0 !important; box-sizing: border-box !important;}
                    .page-head, .page-title { top: 3px !important; background: #ffffff !important; color: #153351 !important; border-bottom: 2px solid #BA9F63 !important; font-weight: 700 !important; }

                `;
                fDoc.head.appendChild(style);
            }

           
        } catch (e) {
            console.warn('Iframe CSS injection failed:', e);
        }
    };

    iframe.onload = () => {
        applyIframeFix();
        setTimeout(applyIframeFix, 300);
        setTimeout(applyIframeFix, 800);
    };

    const urlParams = new URLSearchParams(window.location.search);
    const routeToLoad = urlParams.get('route');
    iframe.src = routeToLoad ? decodeURIComponent(routeToLoad) : '/app';

    frappe.db.get_list('Workspace', {
        filters: { public: 1, parent_page: '' },
        fields: ['name', 'label', 'icon'],
        order_by: 'sequence_id asc'
    }).then(workspaces => {
        if (!menu) return;

        menu.innerHTML = '';
        const filtered = workspaces.filter(ws => allowedWorkspaces.includes(ws.name));

        filtered.forEach(ws => {
            const btn = document.createElement('button');
            btn.className = 'workspace-btn';
            btn.type = 'button';
            btn.innerHTML = `${__(ws.label || ws.name)}`;

            btn.onclick = async (e) => {
                e.stopPropagation();
                const isActive = btn.classList.contains('active');

                document.querySelectorAll('.workspace-btn').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                });

                if (isActive && dropdownPanel.classList.contains('active')) {
                    dropdownPanel.classList.remove('active');
                    return;
                }

                btn.classList.add('active', 'btn-primary');

                const rect = workspaceHost.getBoundingClientRect();
                const left = Math.max(12, rect.left - 10);
                const width = Math.min(window.innerWidth - left - 12, 960);
                dropdownPanel.style.position = 'fixed';
                dropdownPanel.style.top = (rect.bottom + 6) + 'px';
                dropdownPanel.style.left = rect.left + 'px';
                dropdownPanel.style.width = width + 'px';
                //dropdownPanel.style.width = Math.min(window.innerWidth - rect.left - 16, 980) + 'px';
                dropdownPanel.style.right = 'auto';
                
               






                dropdownPanel.classList.add('active');
                await loadWorkspace(ws.name);
            };

            menu.appendChild(btn);
        });
    });

    document.addEventListener('click', (e) => {
        const hostWrap = document.querySelector('.shamsboard-workspaces-host');
        const panel = document.getElementById('dropdown-panel');

        if (!hostWrap?.contains(e.target) && !panel?.contains(e.target)) {
            dropdownPanel?.classList.remove('active');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
        }
    });

    window.addEventListener('resize', () => {
        if (!dropdownPanel?.classList.contains('active')) return;
        const activeBtn = document.querySelector('.workspace-btn.active');
        if (!activeBtn) return;

        const rect = workspaceHost.getBoundingClientRect();
        dropdownPanel.style.top = (rect.bottom + 6) + 'px';
        dropdownPanel.style.left = rect.left + 'px';
        dropdownPanel.style.width = Math.min(window.innerWidth - rect.left - 16, 980) + 'px';
    });

    const observer = new MutationObserver(() => {
        const stillOnPage = document.body.contains(iframe);
        if (!stillOnPage) {
            cleanupOld();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function initShamsBoard4444(page, wrapper) {
    const allowedWorkspaces = [
        "Accounting", "Selling", "Buying", "Stock", "HR", "Assets",
        "Manufacturing", "Quality", "Projects", "Settings", "Users",
        "CRM", "Tools"
    ];

    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const cleanupOld = () => {
        document.querySelectorAll('.shamsboard-toolbar-host').forEach(el => el.remove());
    };

    cleanupOld();

    const headerTarget =
        wrapper.querySelector('.page-head .page-head-content') ||
        wrapper.querySelector('.page-head') ||
        document.querySelector('.layout-main .page-head .page-head-content') ||
        document.querySelector('.layout-main .page-head');

    if (!headerTarget) {
        console.error('ShamsBoard: page head not found');
        return;
    }

    const host = document.createElement('div');
    host.className = 'shamsboard-toolbar-host';
    host.innerHTML = `
        <div class="shamsboard-toolbar">
            <div id="workspace-menu" class="workspace-menu"></div>
        </div>

        <div id="dropdown-panel" class="custom-dropdown">
            <div id="tabs-content" class="cards-grid-container"></div>
        </div>
    `;

    headerTarget.appendChild(host);

    const dropdownPanel = document.getElementById('dropdown-panel');
    const menu = document.getElementById('workspace-menu');

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const closeAllMenus = () => {
        dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
        });
    };

    const openRouteInIframe = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
        window.history.pushState({ path: smartUrl }, '', smartUrl);

        closeAllMenus();
    };

    const applyIframeFix = () => {
        try {
            const fDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (fDoc && fDoc.head) {
                const styleId = 'injected-shamsboard-style';
                if (!fDoc.getElementById(styleId)) {
                    const style = fDoc.createElement('style');
                    style.id = styleId;
                    style.innerHTML = `
                    
                        .sticky-top { height: 0  !important; }
                        .desk-sidebar, .standard-sidebar, .sticky-top { display: none !important; }
                        
                        .desk-sidebar, .standard-sidebar { width: 0 !important; }
                        body { box-sizing: border-box !important; }
                        .layout-main-section { padding-top: 30px !important; margin: 0 !important; width: 100% !important; }
                    `;
                    fDoc.head.appendChild(style);
                }
            }
        } catch (e) {
            console.warn('Iframe CSS injection failed:', e);
        }
    };

    iframe.onload = applyIframeFix;

    const urlParams = new URLSearchParams(window.location.search);
    const routeToLoad = urlParams.get('route');
    iframe.src = routeToLoad ? decodeURIComponent(routeToLoad) : '/app';

    frappe.db.get_list('Workspace', {
        filters: { public: 1, parent_page: '' },
        fields: ['name', 'label', 'icon'],
        order_by: 'sequence_id asc'
    }).then(workspaces => {
        if (!menu) return;

        menu.innerHTML = '';
        const filtered = workspaces.filter(ws => allowedWorkspaces.includes(ws.name));

        filtered.forEach(ws => {
            const btn = document.createElement('button');
            btn.className = 'workspace-btn';
            btn.innerHTML = `${__(ws.label || ws.name)}`;

            btn.onclick = (e) => {
                e.stopPropagation();
                const isActive = btn.classList.contains('active');

                document.querySelectorAll('.workspace-btn').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                });

                if (isActive && dropdownPanel.classList.contains('active')) {
                    dropdownPanel.classList.remove('active');
                } else {
                    btn.classList.add('active', 'btn-primary');
                    dropdownPanel.classList.add('active');
                    loadWorkspace(ws.name);
                }
            };

            menu.appendChild(btn);
        });
    });

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('dropdown-panel');
        const hostWrap = document.querySelector('.shamsboard-toolbar-host');

        if (!hostWrap?.contains(e.target) && !panel?.contains(e.target)) {
            dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
    }
    });

const observer = new MutationObserver(() => {
    const stillOnPage = document.body.contains(iframe);
    if (!stillOnPage) {
        cleanupOld();
        observer.disconnect();
    }
});

observer.observe(document.body, { childList: true, subtree: true });
}




function initShamsBoard33333(page, wrapper) {
    const allowedWorkspaces = [
        "Accounting", "Selling", "Buying", "Stock", "HR", "Assets",
        "Manufacturing", "Quality", "Projects", "Settings", "Users",
        "CRM", "Tools"
    ];

    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const cleanupOld = () => {
        document.querySelectorAll('.shamsboard-workspaces-host').forEach(el => el.remove());
        document.querySelectorAll('.shamsboard-dropdown-host').forEach(el => el.remove());
    };

    cleanupOld();

    // أخفِ عنوان الصفحة
    const titleEl =
        wrapper.querySelector('.page-title .title-text') ||
        wrapper.querySelector('.page-title') ||
        document.querySelector('.page-title');

    if (titleEl) {
        const titleWrap = titleEl.closest('.page-title') || titleEl;
        titleWrap.style.display = 'none';
    }

    // هذا هو صف الهيدر الحقيقي
    const headerRow =
        wrapper.querySelector('.page-head-content') ||
        document.querySelector('.layout-main .page-head .page-head-content');

    if (!headerRow) {
        console.error('ShamsBoard: page head content not found');
        return;
    }

    // حاول إيجاد search bar الأصلي
    const nativeSearch =
        headerRow.querySelector('.search-bar') ||
        headerRow.querySelector('.awesomplete') ||
        headerRow.querySelector('[data-element="search"]') ||
        document.querySelector('.navbar .search-bar');

    // حاوية الوركسبيس داخل نفس صف الهيدر
    const workspaceHost = document.createElement('div');
    workspaceHost.className = 'shamsboard-workspaces-host';
    workspaceHost.innerHTML = `
        <div id="workspace-menu" class="workspace-menu"></div>
    `;

    // الدروبداون خارج الصف لكن تحت الهيدر
    const dropdownHost = document.createElement('div');
    dropdownHost.className = 'shamsboard-dropdown-host';
    dropdownHost.innerHTML = `
        <div id="dropdown-panel" class="custom-dropdown">
            <div id="tabs-content" class="cards-grid-container"></div>
        </div>
    `;

    if (nativeSearch && nativeSearch.parentNode === headerRow) {
        headerRow.insertBefore(workspaceHost, nativeSearch);
    } else {
        headerRow.appendChild(workspaceHost);
    }

    const pageHead = wrapper.querySelector('.page-head') || document.querySelector('.layout-main .page-head');
    if (pageHead) {
        pageHead.appendChild(dropdownHost);
    } else {
        headerRow.appendChild(dropdownHost);
    }

    const dropdownPanel = document.getElementById('dropdown-panel');
    const menu = document.getElementById('workspace-menu');

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const closeAllMenus = () => {
        dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
        });
    };

    const openRouteInIframe = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
        window.history.pushState({ path: smartUrl }, '', smartUrl);

        closeAllMenus();
    };

    const applyIframeFix = () => {
        try {
            const fDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (fDoc && fDoc.head) {
                const styleId = 'injected-shamsboard-style';
                if (!fDoc.getElementById(styleId)) {
                    const style = fDoc.createElement('style');
                    style.id = styleId;
                    style.innerHTML = `
                        .sticky-top { display: none !important; }
                        body { padding-top: 0 !important; }
                        .layout-main-section { padding: 20px !important; margin: 0 !important; width: 100% !important; }
                    `;
                    fDoc.head.appendChild(style);
                }
            }
        } catch (e) {
            console.warn('Iframe CSS injection failed:', e);
        }
    };

    iframe.onload = applyIframeFix;

    const urlParams = new URLSearchParams(window.location.search);
    const routeToLoad = urlParams.get('route');
    iframe.src = routeToLoad ? decodeURIComponent(routeToLoad) : '/app';

    frappe.db.get_list('Workspace', {
        filters: { public: 1, parent_page: '' },
        fields: ['name', 'label', 'icon'],
        order_by: 'sequence_id asc'
    }).then(workspaces => {
        if (!menu) return;

        menu.innerHTML = '';
        const filtered = workspaces.filter(ws => allowedWorkspaces.includes(ws.name));

        filtered.forEach(ws => {
            const btn = document.createElement('button');
            btn.className = 'workspace-btn';
            btn.type = 'button';
            btn.innerHTML = `${__(ws.label || ws.name)}`;

            btn.onclick = (e) => {
                e.stopPropagation();
                const isActive = btn.classList.contains('active');

                document.querySelectorAll('.workspace-btn').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                });

                if (isActive && dropdownPanel.classList.contains('active')) {
                    dropdownPanel.classList.remove('active');
                } else {
                    btn.classList.add('active', 'btn-primary');
                    dropdownPanel.classList.add('active');
                    loadWorkspace(ws.name);
                }
            };

            menu.appendChild(btn);
        });
    });

    document.addEventListener('click', (e) => {
        const hostWrap = document.querySelector('.shamsboard-workspaces-host');
        const panel = document.getElementById('dropdown-panel');

        if (!hostWrap?.contains(e.target) && !panel?.contains(e.target)) {
            dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
    }
    });

const observer = new MutationObserver(() => {
    const stillOnPage = document.body.contains(iframe);
    if (!stillOnPage) {
        cleanupOld();
        observer.disconnect();
    }
});

observer.observe(document.body, { childList: true, subtree: true });
}




function initShamsBoard11111(page, wrapper) {
    const allowedWorkspaces = [
        "Accounting", "Selling", "Buying", "Stock", "HR", "Assets",
        "Manufacturing", "Quality", "Projects", "Settings", "Users",
        "CRM", "Tools"
    ];

    const pageRoot = wrapper;
    const iframe = document.getElementById('content-frame');
    if (!iframe) return;

    const cleanupOld = () => {
        document.querySelectorAll('.shamsboard-toolbar-host').forEach(el => el.remove());
    };

    cleanupOld();

    const headerTarget =
        wrapper.querySelector('.page-head .page-head-content') ||
        wrapper.querySelector('.page-head') ||
        document.querySelector('.layout-main .page-head .page-head-content') ||
        document.querySelector('.layout-main .page-head');

    if (!headerTarget) {
        console.error('ShamsBoard: page head not found');
        return;
    }

    const host = document.createElement('div');
    host.className = 'shamsboard-toolbar-host';
    host.innerHTML = `
        <div class="shamsboard-toolbar">
            <div id="workspace-menu" class="workspace-menu"></div>
        </div>

        <div id="dropdown-panel" class="custom-dropdown">
            <div id="tabs-content" class="cards-grid-container"></div>
        </div>
    `;

    headerTarget.appendChild(host);

    const dropdownPanel = document.getElementById('dropdown-panel');
    const menu = document.getElementById('workspace-menu');
    const searchInput = document.getElementById('dashboard-search-input');
    const clearSearchBtn = document.getElementById('dashboard-search-clear');
    const searchResults = document.getElementById('dashboard-search-results');
    const tabsContent = document.getElementById('tabs-content');

    let globalSearchTimer = null;
    let latestSearchToken = 0;

    const applyIframeFix = () => {
        try {
            const fDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (fDoc && fDoc.head) {
                const styleId = 'injected-shamsboard-style';
                if (!fDoc.getElementById(styleId)) {
                    const style = fDoc.createElement('style');
                    style.id = styleId;
                    style.innerHTML = `
                        .layout-side-section, .sticky-top { display: none !important; }
                        .layout-side-section { width: 0 !important; }
                        body { padding-top: 0 !important; }
                        .layout-main-section { padding: 20px !important; margin: 0 !important; width: 100% !important; }
                    `;
                    fDoc.head.appendChild(style);
                }
            }
        } catch (e) {
            console.warn('Iframe CSS injection failed:', e);
        }
    };

    iframe.onload = applyIframeFix;

    const normalizeSearch = (value) => (value || '').toString().toLowerCase().trim();

    const toAbsoluteDeskRoute = (route) => {
        if (!route) return '/app';

        let cleanRoute = String(route).trim();

        if (/^https?:\/\//i.test(cleanRoute)) return cleanRoute;

        if (!cleanRoute.startsWith('/')) cleanRoute = '/' + cleanRoute;

        if (!cleanRoute.startsWith('/app') && !cleanRoute.startsWith('/desk')) {
            cleanRoute = '/app/' + cleanRoute.replace(/^\/+/, '');
        }

        return cleanRoute;
    };

    const closeAllMenus = () => {
        dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(btn => {
            btn.classList.remove('active', 'btn-primary');
        });
    };

    const hideSearchResults = () => {
        if (!searchResults) return;
        searchResults.classList.remove('active');
        searchResults.innerHTML = '';
    };

    const openRouteInIframe = (route) => {
        const finalRoute = toAbsoluteDeskRoute(route);
        iframe.src = finalRoute;

        const smartUrl = `/app/shamsboard?route=${encodeURIComponent(finalRoute)}`;
        window.history.pushState({ path: smartUrl }, '', smartUrl);

        closeAllMenus();
        hideSearchResults();
    };

    const filterWorkspaceButtons = (query) => {
        if (!menu) return [];

        const normalized = normalizeSearch(query);
        const buttons = Array.from(menu.querySelectorAll('.workspace-btn'));
        const visibleButtons = [];

        buttons.forEach(btn => {
            const text = normalizeSearch(btn.textContent);
            const matched = !normalized || text.includes(normalized);
            btn.style.display = matched ? '' : 'none';
            if (matched) visibleButtons.push(btn);
        });

        return visibleButtons;
    };

    const filterWorkspaceLinks = (query) => {
        const normalized = normalizeSearch(query);
        const groups = Array.from(document.querySelectorAll('#tabs-content .card-group'));
        let firstVisibleLink = null;

        groups.forEach(group => {
            const title = normalizeSearch(group.querySelector('.card-title')?.textContent || '');
            const links = Array.from(group.querySelectorAll('.link-item'));
            let hasVisible = false;

            links.forEach(link => {
                const text = normalizeSearch(link.textContent);
                const matched = !normalized || text.includes(normalized) || title.includes(normalized);
                link.style.display = matched ? '' : 'none';

                if (matched) {
                    hasVisible = true;
                    if (!firstVisibleLink) firstVisibleLink = link;
                }
            });

            group.style.display = hasVisible || !normalized ? '' : 'none';
        });

        return firstVisibleLink;
    };

    const applyDashboardSearch = (query) => {
        const normalized = normalizeSearch(query);

        if (clearSearchBtn) {
            clearSearchBtn.style.visibility = normalized ? 'visible' : 'hidden';
            clearSearchBtn.style.pointerEvents = normalized ? 'auto' : 'none';
        }

        const visibleButtons = filterWorkspaceButtons(normalized);
        const firstVisibleLink = filterWorkspaceLinks(normalized);

        return { visibleButtons, firstVisibleLink, normalized };
        };

    const extractRouteFromGlobalResult = (item) => {
        if (!item) return null;

        if (item.route) return toAbsoluteDeskRoute(item.route);
        if (item.url) return toAbsoluteDeskRoute(item.url);
        if (item.path) return toAbsoluteDeskRoute(item.path);
        if (item.link) return toAbsoluteDeskRoute(item.link);

        const doctype = item.doctypes || item.doctype;
        const name = item.name || item.docname || item.value;

        if (doctype && name) {
            return `/app/${frappe.router.slug(doctype)}/${encodeURIComponent(name)}`;
        }

        if (doctype) {
            return `/app/${frappe.router.slug(doctype)}`;
        }

        return null;
    };

    const renderSearchResults = (items) => {
        if (!searchResults) return;

        if (!items || !items.length) {
            searchResults.innerHTML = `<div class="search-empty">${__('لا توجد نتائج')}</div>`;
            searchResults.classList.add('active');
            return;
        }

        searchResults.innerHTML = items.map((item, index) => {
            const title = frappe.utils.escape_html(item.title || item.label || item.name || item.value || __('نتيجة'));
            const subtitleRaw = [item.doctypes || item.doctype, item.content, item.description].filter(Boolean).join(' • ');
            const subtitle = frappe.utils.escape_html(subtitleRaw);
            const route = frappe.utils.escape_html(item.route_to_open || '');

            return `
                <button type="button" class="search-result-item" data-route="${route}" data-index="${index}">
                    <span class="search-result-title">${title}</span>
                    <span class="search-result-meta">${subtitle || '&nbsp;'}</span>
                </button>
            `;
        }).join('');

        searchResults.classList.add('active');

        searchResults.querySelectorAll('.search-result-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const route = btn.getAttribute('data-route');
                if (route) openRouteInIframe(route);
            });
        });
    };

    const runGlobalSearch = async (query) => {
        if (!query || query.length < 2) {
            hideSearchResults();
            return [];
        }

        const token = ++latestSearchToken;

        try {
            const response = await frappe.call({
                method: 'frappe.utils.global_search.search',
                args: {
                    text: query,
                    limit: 8,
                    start: 0
                },
                freeze: false,
                quiet: true
            });

            if (token !== latestSearchToken) return [];

            const message = response?.message;
            const rawItems = Array.isArray(message) ? message : (message?.results || message?.values || []);
            const normalizedItems = rawItems
                .map(item => ({ ...item, route_to_open: extractRouteFromGlobalResult(item) }))
        .filter(item => !!item.route_to_open);

        renderSearchResults(normalizedItems);
        return normalizedItems;
    } catch (error) {
        console.error('Global search error:', error);

        if (token === latestSearchToken && searchResults) {
            searchResults.innerHTML = `<div class="search-empty">${__('تعذر تحميل نتائج البحث')}</div>`;
            searchResults.classList.add('active');
        }

        return [];
    }
};

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value || '';
        const result = applyDashboardSearch(query);

        if (result.normalized && document.querySelector('#tabs-content .card-group')) {
            dropdownPanel?.classList.add('active');
        }

        clearTimeout(globalSearchTimer);

        if (!result.normalized) {
            hideSearchResults();
            return;
        }

        globalSearchTimer = setTimeout(() => runGlobalSearch(result.normalized), 220);
    });

    searchInput.addEventListener('keydown', (e) => {
        const value = (searchInput.value || '').trim();

        if (e.key === 'Escape') {
            searchInput.value = '';
            applyDashboardSearch('');
            hideSearchResults();
            return;
        }

        if (e.key !== 'Enter') return;

        e.preventDefault();
        if (!value) return;

        if (
            value.startsWith('/app') ||
            value.startsWith('app/') ||
            value.startsWith('/desk') ||
            value.startsWith('desk/')
        ) {
            openRouteInIframe(value);
            return;
        }

        const firstGlobalResult = searchResults?.querySelector('.search-result-item');
        if (firstGlobalResult) {
            const route = firstGlobalResult.getAttribute('data-route');
            if (route) {
                openRouteInIframe(route);
                return;
            }
        }

        const result = applyDashboardSearch(value);

        if (result.firstVisibleLink) {
            result.firstVisibleLink.click();
            return;
        }

        if (result.visibleButtons.length) {
            result.visibleButtons[0].click();
        }
    });
}

if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
        if (!searchInput) return;

        searchInput.value = '';
        applyDashboardSearch('');
        hideSearchResults();
        searchInput.focus();
    });

    clearSearchBtn.style.visibility = 'hidden';
    clearSearchBtn.style.pointerEvents = 'none';
}

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('dashboard-search-wrap');
    const panel = document.getElementById('dropdown-panel');

    if (!wrap?.contains(e.target) && !panel?.contains(e.target)) {
        hideSearchResults();
        dropdownPanel?.classList.remove('active');
        document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
    }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const routeToLoad = urlParams.get('route');
    iframe.src = routeToLoad ? decodeURIComponent(routeToLoad) : '/app';

    frappe.db.get_list('Workspace', {
        filters: { public: 1, parent_page: '' },
        fields: ['name', 'label', 'icon'],
        order_by: 'sequence_id asc'
    }).then(workspaces => {
        if (!menu) return;

        menu.innerHTML = '';
        const filtered = workspaces.filter(ws => allowedWorkspaces.includes(ws.name));

        filtered.forEach(ws => {
            const btn = document.createElement('button');
            btn.className = 'workspace-btn';
            btn.innerHTML = `${__(ws.label || ws.name)}`;

            btn.onclick = (e) => {
                e.stopPropagation();
                const isActive = btn.classList.contains('active');

                document.querySelectorAll('.workspace-btn').forEach(b => {
                    b.classList.remove('active', 'btn-primary');
                });

                if (isActive && dropdownPanel.classList.contains('active')) {
                    dropdownPanel.classList.remove('active');
                } else {
                    btn.classList.add('active', 'btn-primary');
                    dropdownPanel.classList.add('active');
                    loadWorkspace(ws.name);
                }
            };

            menu.appendChild(btn);
        });
    });

    const observer = new MutationObserver(() => {
        const stillOnPage = document.body.contains(iframe);
        if (!stillOnPage) {
            cleanupOld();
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function check_perm(link) {
    try {
        if (link.link_type === 'DocType') return frappe.model.can_read(link.link_to);

        if (link.link_type === 'Report') {
            if (frappe.user_roles.includes('Administrator')) return true;
            return frappe.boot.user_privileges?.reports?.[link.link_to]
                || (link.dependencies && frappe.model.can_read(link.dependencies));
        }

        return true;
    } catch (e) {
        return false;
    }
}

async function loadWorkspace(ws_name) {
    const content = document.getElementById('tabs-content');
    const iframe = document.getElementById('content-frame');
    const dropdownPanel = document.getElementById('dropdown-panel');
    const searchInput = document.getElementById('dashboard-search-input');

    if (!content) return;

    content.innerHTML = `<div class="loading-spinner"><i class="fa fa-spinner fa-spin fa-2x"></i></div>`;

    try {
        const doc = await frappe.db.get_doc('Workspace', ws_name);
        content.innerHTML = '';
        let hasVisibleLinksOverall = false;

        if (doc.links?.length) {
            const cards = [];
            let currentCard = null;

            doc.links.forEach(link => {
                if (link.type === 'Card Break') {
                    currentCard = { label: link.label, icon: link.icon, links: [] };
                    cards.push(currentCard);
        } else if (link.type === 'Link' && currentCard) {
                    if (check_perm(link)) {
                        currentCard.links.push(link);
                        hasVisibleLinksOverall = true;
        }
        }
        });

        cards.forEach(card => {
            if (!card.links.length) return;

            const cardGroup = document.createElement('div');
            cardGroup.className = 'card-group';
            const titleIcon = card.icon || 'fa fa-folder-open';
            cardGroup.innerHTML = `<div class="card-title"><i class="${titleIcon}"></i> ${__(card.label)}</div>`;

            card.links.forEach(link => {
                const url = link.link_type === 'Report'
                    ? `/app/query-report/${encodeURIComponent(link.link_to)}`
                    : `/app/${frappe.router.slug(link.link_to)}`;

                const smartUrl = `/app/shamsboard?route=${encodeURIComponent(url)}`;

                const a = document.createElement('a');
                a.className = 'link-item';
                a.innerHTML = `<i class="${link.icon || 'fa fa-file'}"></i> ${__(link.label || link.link_to)}`;

                a.onclick = (e) => {
                    e.preventDefault();
                    iframe.src = url;
                    window.history.pushState({ path: smartUrl }, '', smartUrl);
                    dropdownPanel?.classList.remove('active');
                    document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active', 'btn-primary'));
                };

                cardGroup.appendChild(a);
            });

            content.appendChild(cardGroup);
        });
    }

    if (!hasVisibleLinksOverall) {
        content.innerHTML = `<div class="no-data">${__('No links available for your permissions')}</div>`;
    }

    if (searchInput && searchInput.value) {
        const normalized = (searchInput.value || '').toLowerCase().trim();
        const groups = Array.from(document.querySelectorAll('#tabs-content .card-group'));

        groups.forEach(group => {
            const title = (group.querySelector('.card-title')?.textContent || '').toLowerCase().trim();
            const links = Array.from(group.querySelectorAll('.link-item'));
            let hasVisible = false;

            links.forEach(link => {
                const text = (link.textContent || '').toLowerCase().trim();
                const matched = !normalized || text.includes(normalized) || title.includes(normalized);
                link.style.display = matched ? '' : 'none';
                if (matched) hasVisible = true;
            });

            group.style.display = hasVisible || !normalized ? '' : 'none';
        });
    }
} catch (error) {
    console.error('Error:', error);
    content.innerHTML = `<div class="no-data">${__('Error loading workspace')}</div>`;
}
}

frappe.dom.set_style(`
.shamsboard-body {
    height: calc(100vh - 64px);
    min-height: 500px;
    background: #fff;
}

#content-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: #fff;
}

.page-title,
.page-head {
    display: none !important;
}

.navbar .container,
.navbar > .container-fluid,
.navbar {
    display: flex !important;
    align-items: center !important;
}

.shamsboard-workspaces-host {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1 1 auto;
    max-width: 100%;
    margin: 0 16px;
    height: 100%;
}

.workspace-menuccc {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    width: 100%;
    min-width: 0;
    height: 100%;
    scrollbar-width: none;
}

.workspace-menu::-webkit-scrollbar {
    display: none;
}
.workspace-menu {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    
    width: 100%;
    height: auto;
    min-height: min-content; 
    

    overflow-x: visible; 
    overflow-y: visible;
    white-space: normal; 
}
.workspace-btn {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
    height: auto !important;
    line-height: 1 !important;
    font-size: 14px;
    font-weight: 600;
    color: #4b5563 !important;
    cursor: pointer;
    position: relative;
    white-space: nowrap;
    flex: 0 0 auto;
}

.workspace-btn:hover,
.workspace-btn.active {
    color: #ba9f63 !important;
}

.workspace-btn.active::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -10px;
    height: 2px;
    background: #ba9f63;
    border-radius: 2px;
}

.shamsboard-dropdown-host {
    pointer-events: none;
}

.custom-dropdown {
    display: none;
    background: white;
    box-shadow: 0 15px 30px rgba(0,0,0,0.1);
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    padding: 24px;
    z-index: 2500;
    max-height: 75vh;
    overflow-y: auto;
    pointer-events: auto;
}

.custom-dropdown.active {
    display: block;
}

.cards-grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
}

.cards-grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 35px;
    max-width: 1400px;
    margin: 0 auto;
}

.card-group { 
    display: flex; 
    flex-direction: column; 
    background: #fafafa;
    padding: 15px;
    border-radius: 8px;
}

.card-title { 
    font-weight: 700;
    padding-bottom: 10px;
    margin-bottom: 12px;
    font-size: 14px;
    color: #555b6b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 2px solid var(--border-color);
    display: flex;
    align-items: center;
    gap: 8px;
}

.link-item { 
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    color: #555b6b;
    text-decoration: none;
    font-size: 13.5px;
    transition: var(--transition);
    border-radius: 6px;
}

.link-item i { font-size: 14px; width: 18px; text-align: center; }

.link-item:hover { 
    color: #ba9f63;
    background: #fff;
    padding-right: 15px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.05);
}
.link-item:hover {
    background: #f8fafc;
    color: #ba9f63;
}

.loading-spinner,
.no-data {
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
}

@media (max-width: 991px) {
    .shamsboard-workspaces-host {
        max-width: 100%;
        margin: 0 8px;
    }

    .workspace-menu {
        gap: 14px;
    }

    .workspace-btn {
        font-size: 13px;
    }
}


.shamsboard-workspaces-host {
    max-width: 52%;
}
.workspace-btn {
    font-size: 11.8px;
}
.navbar .search-bar,
.navbar .input-with-feedback,
.navbar .search-box,
.navbar .awesomplete {
    width: 230px !important;
    max-width: 230px !important;
}
.page-title,
.page-head {
    display: none !important;
    margin: 0 !important;
    padding: 0 !important;
    min-height: 0 !important;
}
body[data-route="shamsboard"] {
    overflow: hidden !important;
}
.layout-main-section-wrapper { padding-right: 0 !important; padding-left: 0 !important; padding-top: 0 !important; }
.layout-main-section { padding-right: 0 !important; padding-left: 0 !important; padding-top: 0 !important; box-sizing: border-box !important; }
                    
                    
                    
                   
`);
