
$(document).on('app_ready', function () {
    initGlobalWorkspace();
});


frappe.router.on('change', () => {
    setTimeout(() => {
        if (!document.querySelector('.global-workspace-header')) {
            initGlobalWorkspace();
        }
    }, 500);
});

function initGlobalWorkspace() {
    if (document.querySelector('.global-workspace-header')) return;
    addStyles();
    addGlobalHeader();
    loadWorkspaceButtons();
}




function addGlobalHeader() {
    const headerHTML = `
        <div class="global-workspace-header" style="
            position: sticky;
            top: 0;
            left: 0;
            right: 0;
            z-index: 10000;
            background: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        ">
            <div class="dashboard-header" style="
                background: #ffffff;
                border-bottom: 1px solid #d1d9e0;
                display: flex;
                align-items: center;
                padding: 0 20px;
                height: auto !important;
                position: relative;
            ">
                <div id="workspace-menu" style=" 
                    display: flex;
                    flex-direction: row;
                    flex-wrap: wrap;
                    align-items: center;
                    width: 100%;
                    height: auto;
                    min-height: min-content; 
                    overflow-x: visible; 
                    overflow-y: visible;
                    white-space: normal; 
                ">
                    <div style="font-size: 11px; color: #888;">Loading...</div>
                </div>
            </div>

            <button class="toggle-header-btn" onclick="window.toggleWorkspaceHeader(event)" style="
                position: absolute;
                bottom: -19px;
                left: 50%;
                transform: translateX(-50%);
                width: 28px;
                height: 19px;
                background: #ffffff;
                border: 1px solid #d1d9e0;
                border-top: none;
                cursor: pointer;
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 0 0 6px 6px;
            ">
                <svg id="toggle-icon" width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="#7b7575" stroke-width="2.5">
                    <polyline points="0 19 10 10 20 19"></polyline>
                    <polyline points="0 13 10 4 20 13"></polyline>
                </svg>
            </button>

            <div id="dropdown-panel" class="workspace-dropdown" style="
                position: absolute;
                left: 0;
                right: 0;
                background: white;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: none;
                z-index: 9999;
                max-height: 80vh;
                overflow-y: auto;
                padding: 20px;
            ">
                <div id="tab-header" class="tab-navbar"></div>
                <div id="tabs-content" class="cards-grid-container" style="
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                    gap: 20px;
                "></div>
            </div>
        </div>
    `;

    const $target = $('.main-section');

    if ($target.length) {
        $target.prepend(headerHTML);
    }
    
    window.toggleWorkspaceHeader = toggleWorkspaceHeader;
    
    
}

function addStyles() {
    if (document.getElementById('global-workspace-styles')) return;
    const styles = `
        <style id="global-workspace-styles">
            .workspace-btn, .tab-btn { 
                background: transparent; border: none; padding: 8px 12px; 
                font-size: 13px; cursor: pointer; color: #555b6b; border-radius: 4px;
            }
            .workspace-btn:hover, .tab-btn:hover { background: #f5f5f5; color: #ba9f63; }
            .workspace-btn.active, .tab-btn.active { color: #ba9f63; font-weight: bold; border-bottom: 2px solid #ba9f63; border-radius: 0; }
            .cards-grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
            .card-group { background: #fafafa; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
            .card-title { font-weight: bold; font-size: 12px; margin-bottom: 10px; color: #3e4047; text-transform: uppercase; }
            .link-item { display: block; padding: 6px 0; color: #555b6b; text-decoration: none; font-size: 14px; cursor: pointer; }
            .link-item:hover { color: #ba9f63; }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);
}
function toggleWorkspaceHeader(event) {
    if (event) event.stopPropagation();
    const header = document.querySelector('.dashboard-header');
    const mainContainer = document.querySelector('.main-content-container1');
    const icon = document.getElementById('toggle-icon');
    const dropdown = document.getElementById('dropdown-panel');

    if (!header) return;

    if (header.classList.contains('collapsed')) {
        header.classList.remove('collapsed');
        header.style.height = 'auto';
        if (mainContainer) {
            mainContainer.style.marginTop = '48px';
            mainContainer.style.height = 'calc(100vh - 48px)';
        }
        if (icon) icon.style.transform = 'rotate(0deg)'; 
    } else {
        header.classList.add('collapsed');
        header.style.height = '0';
        if (mainContainer) {
            mainContainer.style.marginTop = '0';
            mainContainer.style.height = '100vh';
        }
        if (icon) icon.style.transform = 'rotate(180deg)'; 
        
        if (dropdown) {
            dropdown.classList.remove('show');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
        }
    }
}



function addStyles() {
    if (document.getElementById('workspace-styles')) return;
    const styles = `
        <style id="workspace-styles">
            body { margin: 0; padding: 0;  }
            .dashboard-header { transition: height 0.3s ease; overflow: hidden; }
            .dashboard-header.collapsed { height: 0 !important; border-bottom: none !important; }
            .dashboard-header.collapsed #workspace-menu { display: none !important; }
            .workspace-btn { background: transparent !important; border: none !important; box-shadow: none !important; padding: 4px 7px !important; font-size: 12px !important; font-weight: 500; color: #555b6b !important; cursor: pointer; transition: color 0.2s ease; position: relative; }
            .tab-btn { background: transparent !important; border: none !important; box-shadow: none !important; padding: 4px 7px !important; font-size: 12px !important; font-weight: 500; color: #555b6b !important; cursor: pointer; transition: color 0.2s ease; position: relative; }
            .tab-btn:hover { color: #ba9f63; background: #f5f5f5; }
            .workspace-btn:hover { color: #ba9f63; background: #f5f5f5; }
            .tab-btn.active { color: #ba9f63; }
            .workspace-btn.active { color: #ba9f63; }
            .tab-btn.active::after { content: ""; position: absolute; bottom: -1px; left: 8px; right: 8px; height: 2px; background-color: #ba9f63; }
            .workspace-btn.active::after { content: ""; position: absolute; bottom: -1px; left: 8px; right: 8px; height: 2px; background-color: #ba9f63; }
            .workspace-dropdown.show { display: block !important; }
            .cards-grid-container { display: grid; g  rid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
            .card-group { background: #fafafa; padding: 15px; border-radius: 8px; flex-direction: column; }
            .card-title { font-weight: 600; padding-bottom: 10px; margin-bottom: 12px; font-size: 12px; color: #3e4047;  display: flex; align-items: center; gap: 8px; }
            .link-item { display: flex; align-items: center; gap: 10px; padding: 4px 12px; color: #555b6b; text-decoration: none  !important; font-size: 13.5px; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
            .link-item111:hover { color: var(--invert-neutral) !important; background: #fff; padding-right: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            .link-item:hover { color: var(--invert-neutral) !important; font-weight: 500; }
            .loading-spinner { text-align: center; padding: 40px; color: #64748b; }
            .no-data { text-align: center; padding: 40px; color: #94a3b8; }
            .tab-navbar { display: flex; gap: 10px; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #eee; }
            #workspace-search-input:focus { border-color: #ba9f63; }
            .card-groups-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; margin-top: 10px; }
            @media (max-width: 768px) { .card-groups-container { grid-template-columns: 1fr; } }
            #tabs-content { display: inline !important; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .shortcuts-horizontal-wrapper { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
            .shortcut-main-title { font-size: 14px; font-weight: bold; color: #1d1d1d; margin-bottom: 12px; }
            .shortcuts-flex-row { display: flex; flex-wrap: wrap; gap: 12px; }
            .workspace-btn { flex: 1 1 40px; min-width: 40px; max-width: 100%; font-size: var(--text-base) !important;  color: var(--text-color); overflow: hidden;  text-overflow: ellipsis; white-space: nowrap; }
            .tab-btn { flex: 1 1 40px;  min-width: 40px;  max-width: 15%;  font-size: var(--text-base) !important; color: var(--text-color);  overflow: hidden;  text-overflow: ellipsis;  white-space: nowrap; }
            .card-title { max-width: 100%; vertical-align: middle; overflow: hidden; text-align: left; text-overflow: ellipsis;  -webkit-font-smoothing: antialiased;  font-family: inherit; text-size-adjust: 100%; font-variation-settings: "opsz" 24; font-size: var(--text-lg); font-weight: var(--weight-semibold); letter-spacing: 0.015em; color: var(--text-color) !important; white-space: nowrap; }
            .shortcut-main-title { font-weight: 600 !important; font-variation-settings: "opsz" 24; font-size: var(--text-xl); letter-spacing: .01em; }
            .link-item { font-family: var(--font-stack); font-variation-settings: "opsz" 24;  font-size: var(--text-base); font-weight: var(--weight-regular); letter-spacing: .02em; color: var(--text-color); white-space: nowrap; }
            .chart-section .chart-actions { display: none !important; }
            .chart-section .filter-chart { display: none !important; }
.shortcuts-flex-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 20px;
    margin-top: 10px;
}

.card-main-title {
    font-weight: 600 !important;
    font-variation-settings: "opsz" 24;
    font-size: var(--text-xl);
    letter-spacing: .01em;
    color: #1d1d1d;
    margin-bottom: 12px;
    padding: 15px;
}
.shortcut-item {

    cursor: pointer!important;
    text-decoration: none !important;
    font-size: var(--text-base);
    font-weight: var(--weight-medium);
    letter-spacing: .025em;
    font-family: inherit;
    line-height: 1.3em;
    color: var(--text-color);
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb-color) var(--scrollbar-track-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    vertical-align: middle;
}   
.shortcut-item:hover  {
    color: var(--invert-neutral) !important;
    font-weight: 500;
}    


.shortcut-item:hover, .card-link-item:hover {
    text-decoration: none !important;
}
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);
}







async function loadWorkspaceCardsXXX(moduleName) {
    const content = document.getElementById('tabs-content');
    const dropdownPanel = document.getElementById('dropdown-panel');
    const tabHeader = document.getElementById('tab-header');

    if (!content || !tabHeader) return;

    renderSubTabs(moduleName, tabHeader);
    
    const allWorkspaces = frappe.boot.allowed_workspaces || [];
    const moduleWise = frappe.boot.module_wise_workspaces || {};
    const moduleWorkspaces = moduleWise[moduleName] || [];
    
    const validWorkspaces = moduleWorkspaces.filter(wsName => {
        const ws = allWorkspaces.find(w => w.name === wsName);
        return ws && !ws.hidden;
    });
    
    if (validWorkspaces.length > 0) {
        fetchAndRenderWorkspacews(validWorkspaces[0], content);
    }
}

function renderSubTabsXXX(selectedModule, container) {
    container.innerHTML = '';
    const allWorkspaces = frappe.boot.allowed_workspaces || [];
    const moduleWise = frappe.boot.module_wise_workspaces || {};
    
    const moduleWorkspaces = moduleWise[selectedModule] || [];
    
    const validWorkspaces = moduleWorkspaces.filter(wsName => {
        const ws = allWorkspaces.find(w => w.name === wsName);
        return ws && !ws.hidden;
    });
    
    validWorkspaces.forEach(wsName => {
        const ws = allWorkspaces.find(w => w.name === wsName);
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn ${wsName === selectedModule ? 'active' : ''}`;
        tabBtn.innerHTML = `${__(ws.label || ws.title || ws.name)}`;
        
        tabBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            fetchAndRenderWorkspacews(wsName, document.getElementById('tabs-content'));
        };
        container.appendChild(tabBtn);
    });
}

function loadWorkspaceButtonsXXX() {
    if (!window.frappe || !frappe.boot || !frappe.boot.allowed_workspaces) {
        setTimeout(loadWorkspaceButtons, 100);
        return;
    }

    const allWorkspaces = frappe.boot.allowed_workspaces;
    const moduleWise = frappe.boot.module_wise_workspaces || {};
    
    const modules = [];
    for (let moduleName in moduleWise) {
        const moduleWorkspaces = moduleWise[moduleName];
        const hasAccessibleWorkspace = moduleWorkspaces.some(wsName => {
            const ws = allWorkspaces.find(w => w.name === wsName);
            return ws && !ws.hidden;
        });
        
        if (hasAccessibleWorkspace) {
            modules.push(moduleName);
        }
    }
    
    renderButtons(modules);
}

function renderButtonsXXX(modules) {
    const menu = document.getElementById('workspace-menu');
    if (!menu) return;
    menu.innerHTML = '';

    modules.forEach(moduleName => {
        const btn = document.createElement('button');
        btn.className = "workspace-btn";
        btn.innerHTML = `${__(moduleName)}`;
        
        btn.onclick = function (e) {
            e.stopPropagation();
            const dropdown = document.getElementById('dropdown-panel');
            const isOpen = dropdown.classList.contains('show');
            const isAlreadyActive = this.classList.contains('active');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));

            if (isOpen && isAlreadyActive) {
                dropdown.classList.remove('show');
            } else {
                this.classList.add('active');
                dropdown.classList.add('show');

                if (typeof loadWorkspaceCards === "function") {
                    loadWorkspaceCards(moduleName);
                }
            }
        };
        menu.appendChild(btn);
    });
}



















function buildWorkspaceDataFromSidebar(workspaceName) {
    const sidebarItem = frappe.boot.workspace_sidebar_item?.[workspaceName];
    if (!sidebarItem) return null;
    
    const data = {
        shortcuts: { items: [] },
        cards: { items: [] },
        number_cards: { items: [] },
        charts: { items: [] }
    };
    
    let currentCard = {
        label: workspaceName,
        links: []
    };
    
    sidebarItem.items.forEach(item => {
        if (item.type === "Link" && item.child === 0 && item.link_type !== "Workspace") {
            data.shortcuts.items.push({
                label: item.label,
                doc_view: "",
                link_to: item.link_to,
                type: item.link_type,
                icon: item.icon,
                url: item.url
            });
        }
        else if (item.type === "Section Break" && item.link_to === null) {
            currentCard = {
                label: item.label,
                links: []
            };
            if (item.indent === 1) {
                data.cards.items.push(currentCard);
            }
        }
        else if (item.type === "Link" && item.child === 1 && currentCard) {
            currentCard.links.push({
                label: item.label,
                doc_view: "",
                type: "Link",
                link_to: item.link_to,
                link_type: item.link_type,
                url: item.url
            });
            if (data.cards.items.length === 0) {
                data.cards.items.push(currentCard);
            }
        }
        
    });
    
    data.cards.items = data.cards.items.filter(card => card.links && card.links.length > 0);
    
    return data;
}



function renderWorkspaceFromSidebar(workspaceName, container) {
    const data = buildWorkspaceDataFromSidebar(workspaceName);
    
    if (!data || (data.shortcuts.items.length === 0 && data.cards.items.length === 0)) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
        return;
    }
    container.innerHTML = ''; 
    let hasVisibleContent = false;
    

    if (!document.getElementById('workspace-scoped-style')) {
        $('head').append(`
            <style id="workspace-scoped-style">
              .number-card-section .widget-group-body.grid-col-4 {
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                    grid-template-columns: none !important;
                    gap: 15px !important;
                    overflow-x: auto !important;
                }

                .number-card-section .widget.number-widget-box {
                    flex: 1 0 220px !important;
                    max-width: none !important;
                    min-width: 200px !important;
                }


                .number-card-section .widget-group-body {
                    display: flex !important;
                    flex-direction: column !important;
                    grid-template-columns: none !important;
                    gap: 20px !important;
                }

                .number-card-section .widget {
                    width: 100% !important;
                    max-width: none !important;
                }


                .number-card-section .widget-group-body::-webkit-scrollbar { height: 4px; }
                .number-card-section .widget-group-body::-webkit-scrollbar-thumb { background: #d1d8dd; border-radius: 10px; }
            </style>
        `);
    }

    const get_route = (r) => {
        let e = "";
        let is_link = r.type === "Link";
        let target_type = (is_link ? r.link_type : r.type || "").toLowerCase();
        let target_name = r.link_to || r.name;

        if (r.url) {
            e = r.url;
        } else if (r.link) {
            e = r.link.replace(/^#/, "");
        } else if (target_type === "doctype") {
            let slug = frappe.router.slug(target_name);
            if (frappe.model.is_single(target_name)) {
                e = slug;
            } else {
                // If it's a "Link" type, it usually goes to List by default
                // If it's a "Shortcut", it follows the doc_view logic
                if (is_link || !r.doc_view) {
                    e = `${slug}/view/list`;
                } else {
                    switch (r.doc_view) {
                        case "List": e = `${slug}/view/list`; break;
                        case "Tree": e = `${slug}/view/tree`; break;
                        case "Report Builder": e = `${slug}/view/report`; break;
                        case "Dashboard": e = `${slug}/view/dashboard`; break;
                        case "New": e = `${slug}/new`; break;
                        case "Calendar": e = `${slug}/view/calendar/default`; break;
                        case "Kanban": 
                            e = `${slug}/view/kanban`;
                            if (r.kanban_board) e += `/${r.kanban_board}`;
                            break;
                        default: e = slug;
                    }
                }
            }
        } else if (target_type === "report") {
            e = r.is_query_report ? `query-report/${target_name}` : (r.doctype ? `${frappe.router.slug(r.doctype)}/view/report/${target_name}` : `report/${target_name}`);
        } else if (target_type === "page") {
            e = target_name;
        } else if (target_type === "dashboard") {
            e = `dashboard-view/${target_name}`;
        }

        return `/app/${e}`;
    };

    const create_element = (item, cls) => {
        const route = get_route(item);
        const a = document.createElement('a');
        a.className = cls;
        a.href = route;
        a.innerHTML = `<span>${item.label || item.name}</span>`;
        a.onclick = (e) => {
            e.preventDefault();
            frappe.set_route(route);
        };
        return a;
    };

    // 1. Number Cards
   
    // 3. Shortcuts
    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElementsh(s));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    if (cards.length > 0) {
        const shortcutsWrapper1 = document.createElement('div');
        shortcutsWrapper1.className = 'card-horizontal-wrapper';
        shortcutsWrapper1.innerHTML = `<div class="card-main-title">${__('Reports & Masters')}</div>`;
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement(link));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        shortcutsWrapper1.appendChild(cardGroupsContainer);
        container.appendChild(shortcutsWrapper1);
    }
    
    
     if (data.number_cards && data.number_cards.items && data.number_cards.items.length > 0) {
        const nc_container = document.createElement('div');
        nc_container.className = 'number-card-section';
        nc_container.style.marginBottom = '25px';
        container.appendChild(nc_container);

        new frappe.widget.WidgetGroup({
            container: $(nc_container),
            type: "number_card",
            columns: 4,
            widgets: data.number_cards.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chart_container = document.createElement('div');
        chart_container.className = 'chart-section';
        chart_container.style.marginBottom = '25px';
        container.appendChild(chart_container);

        new frappe.widget.WidgetGroup({
            container: $(chart_container),
            type: "chart",
            columns: 1,
            widgets: data.charts.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }
    
    
    $(container).on('click', '.number-card-section', function() {
        document.getElementById('dropdown-panel').classList.remove('show');
    });


    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
    }
}




function renderWorkspaceFromSidebarxxxx(workspaceName, container) {
    const data = buildWorkspaceDataFromSidebar(workspaceName);
    
    if (!data || (data.shortcuts.items.length === 0 && data.cards.items.length === 0)) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
        return;
    }
    
    let hasVisibleContent = false;
    container.innerHTML = '';
    
    if (data.shortcuts.items.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        data.shortcuts.items.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElementsh(s));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }
    
    if (data.cards.items.length > 0) {
        const cardsWrapper = document.createElement('div');
        cardsWrapper.className = 'card-horizontal-wrapper';
        cardsWrapper.innerHTML = `<div class="card-main-title">${__('Reports & Masters')}</div>`;
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        data.cards.items.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement(link));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        cardsWrapper.appendChild(cardGroupsContainer);
        container.appendChild(cardsWrapper);
    }
    
    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
    }
}


function loadWorkspaceButtons() {
    if (!window.frappe || !frappe.boot || !frappe.boot.workspace_sidebar_item) {
        setTimeout(loadWorkspaceButtons, 100);
        return;
    }

    const moduleWise = frappe.boot.module_wise_workspaces || {};
    const workspaceSidebar = frappe.boot.workspace_sidebar_item || {};
    
    const moduleWorkspaces = {};
    
    for (let workspaceName in workspaceSidebar) {
        const sidebarItem = workspaceSidebar[workspaceName];
        let moduleName = sidebarItem.module;
        
        if (!moduleName || !moduleWise[moduleName]) {
            moduleName = "Other Modules";
        }
        
        const data = buildWorkspaceDataFromSidebar(workspaceName);
        const isEmpty = !data || (data.shortcuts.items.length === 0 && data.cards.items.length === 0);
        
        if (isEmpty) continue;
        
        if (!moduleWorkspaces[moduleName]) {
            moduleWorkspaces[moduleName] = [];
        }
        
        moduleWorkspaces[moduleName].push({
            name: workspaceName,
            label: sidebarItem.label,
            icon: sidebarItem.header_icon
        });
    }
    
    const modulesWithWorkspaces = Object.keys(moduleWorkspaces).filter(moduleName => {
        return moduleWorkspaces[moduleName].length > 0;
    });
    
    renderButtons(modulesWithWorkspaces, moduleWorkspaces);
}


function loadWorkspaceButtonsxxxxx() {
    if (!window.frappe || !frappe.boot || !frappe.boot.workspace_sidebar_item) {
        setTimeout(loadWorkspaceButtons, 100);
        return;
    }

    const moduleWise = frappe.boot.module_wise_workspaces || {};
    const workspaceSidebar = frappe.boot.workspace_sidebar_item || {};
    
    const moduleWorkspaces = {};
    
    for (let workspaceName in workspaceSidebar) {
        const sidebarItem = workspaceSidebar[workspaceName];
        let moduleName = sidebarItem.module;
        
        if (!moduleName) continue;
        if (!moduleWise[moduleName]) {
            moduleName = "Other Modules";
        }
        if (!moduleWorkspaces[moduleName]) {
            moduleWorkspaces[moduleName] = [];
        }
        
        if (sidebarItem.items && sidebarItem.items.length > 0) {
            moduleWorkspaces[moduleName].push({
                name: workspaceName,
                label: sidebarItem.label,
                icon: sidebarItem.header_icon
            });
        }
    }
    
    const modulesWithWorkspaces = Object.keys(moduleWorkspaces).filter(moduleName => {
        return moduleWorkspaces[moduleName].length > 0;
    });
    
    renderButtons(modulesWithWorkspaces, moduleWorkspaces);
}

function renderButtons(modules, moduleWorkspaces) {
    const menu = document.getElementById('workspace-menu');
    if (!menu) return;
    menu.innerHTML = '';

    modules.forEach(moduleName => {
        const btn = document.createElement('button');
        btn.className = "workspace-btn";
        btn.innerHTML = `${__(moduleName)}`;
        
        btn.onclick = function (e) {
            e.stopPropagation();
            const dropdown = document.getElementById('dropdown-panel');
            const isOpen = dropdown.classList.contains('show');
            const isAlreadyActive = this.classList.contains('active');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));

            if (isOpen && isAlreadyActive) {
                dropdown.classList.remove('show');
            } else {
                this.classList.add('active');
                dropdown.classList.add('show');

                if (typeof loadWorkspaceCards === "function") {
                    loadWorkspaceCards(moduleName, moduleWorkspaces);
                }
            }
        };
        menu.appendChild(btn);
    });
}

async function loadWorkspaceCards(moduleName, moduleWorkspaces) {
    const content = document.getElementById('tabs-content');
    const tabHeader = document.getElementById('tab-header');

    if (!content || !tabHeader) return;

    const workspaces = moduleWorkspaces[moduleName] || [];
    
    if (workspaces.length === 0) {
        content.innerHTML = '<div class="no-data">No workspaces available</div>';
        return;
    }
    
    renderSubTabs(workspaces, tabHeader, moduleName);
    
    const firstWorkspace = workspaces[0];
    if (firstWorkspace) {
        renderWorkspaceFromSidebar(firstWorkspace.name, content);
    }
}

function renderSubTabsxxx(workspaces, container, selectedModule) {
    container.innerHTML = '';
    
    workspaces.forEach(ws => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn`;
        tabBtn.innerHTML = `${__(ws.label || ws.name)}`;
        
        tabBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            renderWorkspaceFromSidebar(ws.name, document.getElementById('tabs-content'));
        };
        container.appendChild(tabBtn);
    });
    
    const firstTab = container.querySelector('.tab-btn');
    if (firstTab) firstTab.classList.add('active');
}

function renderSubTabs(workspaces, container, selectedModule) {
    container.innerHTML = '';
    
    const nonEmptyWorkspaces = workspaces.filter(ws => {
        const data = buildWorkspaceDataFromSidebar(ws.name);
        return data && (data.shortcuts.items.length > 0 || data.cards.items.length > 0);
    });
    
    if (nonEmptyWorkspaces.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'no-data';
        emptyMsg.innerText = __('No workspaces available');
        container.appendChild(emptyMsg);
        return;
    }
    
    nonEmptyWorkspaces.forEach(ws => {
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn`;
        tabBtn.innerHTML = `${__(ws.label || ws.name)}`;
        
        tabBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            renderWorkspaceFromSidebar(ws.name, document.getElementById('tabs-content'));
        };
        container.appendChild(tabBtn);
    });
    
    const firstTab = container.querySelector('.tab-btn');
    if (firstTab) firstTab.classList.add('active');
}



























function loadWorkspaceButtons11() {
    if (!window.frappe || !frappe.boot || !frappe.boot.allowed_workspaces) {
        setTimeout(loadWorkspaceButtons, 100);
        return;
    }
    

    const allWorkspaces = frappe.boot.allowed_workspaces;
    const workspaces = allWorkspaces.filter(ws => !ws.parent_page);
    renderButtons(workspaces);
}

function renderButtons11(workspaces) {
    const menu = document.getElementById('workspace-menu');
    if (!menu) return;
    menu.innerHTML = '';

    workspaces.forEach(ws => {
        const btn = document.createElement('button');
        btn.className = "workspace-btn";
        
        const displayName = ws.label || ws.title || ws.name;
        const icon = ws.icon || 'fa fa-th-large';
        const wsName = ws.name; 
        

        btn.innerHTML = `<i class="${icon}"></i> ${__(displayName)}`;
        
        btn.onclick = function (e) {
            e.stopPropagation();
            const dropdown = document.getElementById('dropdown-panel');
            const isOpen = dropdown.classList.contains('show');
            const isAlreadyActive = this.classList.contains('active');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));

            if (isOpen && isAlreadyActive) {
                dropdown.classList.remove('show');
            } else {
                this.classList.add('active');
                dropdown.classList.add('show');


                if (typeof loadWorkspaceCards === "function") {
                    loadWorkspaceCards(wsName);
                }
            }
        };
        menu.appendChild(btn);
    });
}


function buildLinkUrl(item) {
    const type = item.type;
    const to = item.link_to;
    
    if (type === 'URL' && item.url) return item.url;
    if (type === 'URL' && to && to.startsWith('http')) return to;

    if (!to) return '';


    switch(type) {
        case 'DocType': 
            return `/app/${frappe.router.slug(to)}`;
            
        case 'Report': 
            return `/app/query-report/${encodeURIComponent(to)}`;
            
        case 'Page': 
            return `/app/${to}`;
            
        case 'Dashboard': 
            return `/app/dashboard-view/${encodeURIComponent(to)}`;
            
        default: 
            return `/app/${frappe.router.slug(to)}`;
    }
}


function getLinkIcon(link) {
    const icons = {
        'DocType': 'fa fa-table',
        'Report': 'fa fa-chart-line',
        'Page': 'fa fa-file-alt',
        'Dashboard': 'fa fa-dashboard',
        'URL': 'fa fa-external-link'
    };
    return link.icon || icons[link.link_type] || 'fa fa-file';
}


















async function loadWorkspaceCards11(ws_name) {
    const content = document.getElementById('tabs-content');
    const dropdownPanel = document.getElementById('dropdown-panel');
    const tabHeader = document.getElementById('tab-header');

    if (!content || !tabHeader) return;


    renderSubTabs(ws_name, tabHeader);

    fetchAndRenderWorkspace(ws_name, content);
}



function renderSubTabs11(selectedName, container) {
    container.innerHTML = '';
    const allWorkspaces = frappe.boot.allowed_workspaces || [];


    const currentWs = allWorkspaces.find(w => w.name === selectedName);
    if (!currentWs) return;

    const parentName = currentWs.parent_page || currentWs.name;
    const parentWs = allWorkspaces.find(w => w.name === parentName);
    const family = [parentWs, ...allWorkspaces.filter(w => w.parent_page === parentName)];

    family.forEach(ws => {
        if (!ws) return;
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn ${ws.name === selectedName ? 'active' : ''}`;
        tabBtn.innerHTML = `<i class="${ws.icon || 'fa fa-folder'}"></i> ${__(ws.label || ws.name)}`;
        
        tabBtn.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
            fetchAndRenderWorkspace(ws.name, document.getElementById('tabs-content'));
        };
        container.appendChild(tabBtn);
    });
}

function createLinkElementsh(item) {
    const a = document.createElement('a');
    a.className = 'shortcut-item ellipsis';
    a.setAttribute('type', item.type || 'Link');
    
    if (item.label) {
        a.setAttribute('title', item.label);
    }
    
    
    
    const get_route = (r) => {
        let e = "";
        let is_link = r.type === "Link";
        let target_type = (is_link ? r.link_type : r.type || "").toLowerCase();
        let target_name = r.link_to || r.name;

        if (r.url) {
            e = r.url;
            if (r.type === "URL" && r.doc_view !== "New" ) return e;
        } else if (r.link) {
            e = r.link.replace(/^#/, "");
        } else if (target_type === "doctype") {
            let slug = frappe.router.slug(target_name);
            if (frappe.model.is_single(target_name)) {
                e = slug;
            } else {
                // If it's a "Link" type, it usually goes to List by default
                // If it's a "Shortcut", it follows the doc_view logic
                if (is_link || !r.doc_view) {
                    e = `${slug}/view/list`;
                } else {
                    switch (r.doc_view) {
                        case "List": e = `${slug}/view/list`; break;
                        case "Tree": e = `${slug}/view/tree`; break;
                        case "Report Builder": e = `${slug}/view/report`; break;
                        case "Dashboard": e = `${slug}/view/dashboard`; break;
                        case "New": e = `${slug}/new`; break;
                        case "Calendar": e = `${slug}/view/calendar/default`; break;
                        case "Kanban": 
                            e = `${slug}/view/kanban`;
                            if (r.kanban_board) e += `/${r.kanban_board}`;
                            break;
                        default: e = slug;
                    }
                }
            }
        } else if (target_type === "report") {
            e = r.is_query_report ? `query-report/${target_name}` : (r.doctype ? `${frappe.router.slug(r.doctype)}/view/report/${target_name}` : `report/${target_name}`);
        } else if (target_type === "page") {
            e = target_name;
        } else if (target_type === "dashboard") {
            e = `dashboard-view/${target_name}`;
        }

        return `/app/${e}`;
    };

    
    const linkContent = document.createElement('span');
    linkContent.className = 'shortcut-content ellipsis';
    
    const linkText = document.createElement('span');
    linkText.className = 'shortcut-text';
    linkText.textContent = __(item.label);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'es-icon es-line ml-2 icon-xs');
    svg.setAttribute('aria-hidden', 'true');
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('class', '');
    use.setAttribute('href', '#es-line-arrow-up-right');
    svg.appendChild(use);
    
    linkContent.appendChild(linkText);
    linkContent.appendChild(svg);
    a.appendChild(linkContent);
    const url = get_route(item);

    a.onclick = (e) => {
       
        if ( url) {
            if (item.type !== "URL" || item.doc_view === "New" ) {
                frappe.set_route(url);
            } else {
                window.open(url, '_blank');
            }
            //navigateTo(url);
            document.getElementById('dropdown-panel').classList.remove('show');
        }
    };
    
    return a;
}




function fetchAndRenderWorkspace1111(name, container) {
    const $container = $(container);
    $container.empty();

    const $wrapper = $(`
        <div class="workspace-blocks">
            <div class="layout-main-section">
                <div class="widget-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding: 15px;">
                </div>
            </div>
        </div>
    `).appendTo($container);

    const $grid = $wrapper.find('.widget-grid');

    frappe.call({
        method: "frappe.desk.desktop.get_desktop_page",
        args: { page: { name: name, public: 1 } },
        callback: function (r) {
            if (!r.message) return;
            const data = r.message;

            if (data.shortcuts && data.shortcuts.items) {
                data.shortcuts.items.forEach(item => {
                    const $col = $('<div class="widget-column"></div>').appendTo($grid);
                    
                    let widget_options = {
                        label: item.label,
                        type: item.type || "DocType",
                        link_to: item.link_to || item.doc_name,
                        doc_view: item.doc_view || "List",
                        route: item.route || ""
                    };

                    frappe.widget.make_widget({
                        widget_type: "shortcut",
                        widget_name: item.label,
                        container: $col,
                        label: item.label,
                        options: widget_options
                    });

                    $col.find('.widget-ui').attr('onclick', '');
                    $col.off('click').on('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        if (widget_options.route) {
                            frappe.set_route(widget_options.route);
                        } else {
                            frappe.set_route("List", widget_options.link_to, widget_options.doc_view);
                        }
                        
                        if ($('#dropdown-panel').length) {
                            $('#dropdown-panel').removeClass('show');
                        }
                    });
                });
            }

            if (data.cards && data.cards.items) {
                data.cards.items.forEach(item => {
                    const $col = $('<div class="widget-column"></div>').appendTo($grid);
                    frappe.widget.make_widget({
                        widget_type: "links",
                        label: item.label,
                        container: $col,
                        links: item.links,
                        options: item
                    });
                });
            }

            if (data.charts && data.charts.items) {
                data.charts.items.forEach(item => {
                    const $col = $('<div class="widget-column"></div>').appendTo($grid);
                    frappe.widget.make_widget({
                        widget_type: "chart",
                        widget_name: item.chart_name,
                        container: $col,
                        label: item.label || item.chart_name,
                        options: item
                    });
                });
            }
        }
    });
}





function fetchAndRenderWorkspace(name, container) {
    container.innerHTML = `<div class="loading-spinner"><i class="fa fa-spinner fa-spin fa-2x"></i></div>`;
    
    frappe.call({
        method: "frappe.desk.desktop.get_desktop_page",
        args: { page: { name: name, public: 1 } },
        callback: function (r) {
            if (r.message) {
                renderWorkspaceHTML(r.message, container);
            } else {
                container.innerHTML = `<div class="no-data">no data to be shown</div>`;
            }
        }
    });
}


function renderWorkspaceHTML(data, container) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;
    

    if (!document.getElementById('workspace-scoped-style')) {
        $('head').append(`
            <style id="workspace-scoped-style">
              .number-card-section .widget-group-body.grid-col-4 {
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                    grid-template-columns: none !important;
                    gap: 15px !important;
                    overflow-x: auto !important;
                }

                .number-card-section .widget.number-widget-box {
                    flex: 1 0 220px !important;
                    max-width: none !important;
                    min-width: 200px !important;
                }


                .number-card-section .widget-group-body {
                    display: flex !important;
                    flex-direction: column !important;
                    grid-template-columns: none !important;
                    gap: 20px !important;
                }

                .number-card-section .widget {
                    width: 100% !important;
                    max-width: none !important;
                }


                .number-card-section .widget-group-body::-webkit-scrollbar { height: 4px; }
                .number-card-section .widget-group-body::-webkit-scrollbar-thumb { background: #d1d8dd; border-radius: 10px; }
            </style>
        `);
    }

    const get_route = (r) => {
        let e = "";
        let is_link = r.type === "Link";
        let target_type = (is_link ? r.link_type : r.type || "").toLowerCase();
        let target_name = r.link_to || r.name;

        if (r.url) {
            e = r.url;
        } else if (r.link) {
            e = r.link.replace(/^#/, "");
        } else if (target_type === "doctype") {
            let slug = frappe.router.slug(target_name);
            if (frappe.model.is_single(target_name)) {
                e = slug;
            } else {
                // If it's a "Link" type, it usually goes to List by default
                // If it's a "Shortcut", it follows the doc_view logic
                if (is_link || !r.doc_view) {
                    e = `${slug}/view/list`;
                } else {
                    switch (r.doc_view) {
                        case "List": e = `${slug}/view/list`; break;
                        case "Tree": e = `${slug}/view/tree`; break;
                        case "Report Builder": e = `${slug}/view/report`; break;
                        case "Dashboard": e = `${slug}/view/dashboard`; break;
                        case "New": e = `${slug}/new`; break;
                        case "Calendar": e = `${slug}/view/calendar/default`; break;
                        case "Kanban": 
                            e = `${slug}/view/kanban`;
                            if (r.kanban_board) e += `/${r.kanban_board}`;
                            break;
                        default: e = slug;
                    }
                }
            }
        } else if (target_type === "report") {
            e = r.is_query_report ? `query-report/${target_name}` : (r.doctype ? `${frappe.router.slug(r.doctype)}/view/report/${target_name}` : `report/${target_name}`);
        } else if (target_type === "page") {
            e = target_name;
        } else if (target_type === "dashboard") {
            e = `dashboard-view/${target_name}`;
        }

        return `/app/${e}`;
    };

    const create_element = (item, cls) => {
        const route = get_route(item);
        const a = document.createElement('a');
        a.className = cls;
        a.href = route;
        a.innerHTML = `<span>${item.label || item.name}</span>`;
        a.onclick = (e) => {
            e.preventDefault();
            frappe.set_route(route);
        };
        return a;
    };

    // 1. Number Cards
   
    // 3. Shortcuts
    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElementsh(s));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    if (cards.length > 0) {
        const shortcutsWrapper1 = document.createElement('div');
        shortcutsWrapper1.className = 'card-horizontal-wrapper';
        shortcutsWrapper1.innerHTML = `<div class="card-main-title">${__('Reports & Masters')}</div>`;
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement(link));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        shortcutsWrapper1.appendChild(cardGroupsContainer);
        container.appendChild(shortcutsWrapper1);
    }
    
    
     if (data.number_cards && data.number_cards.items && data.number_cards.items.length > 0) {
        const nc_container = document.createElement('div');
        nc_container.className = 'number-card-section';
        nc_container.style.marginBottom = '25px';
        container.appendChild(nc_container);

        new frappe.widget.WidgetGroup({
            container: $(nc_container),
            type: "number_card",
            columns: 4,
            widgets: data.number_cards.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chart_container = document.createElement('div');
        chart_container.className = 'chart-section';
        chart_container.style.marginBottom = '25px';
        container.appendChild(chart_container);

        new frappe.widget.WidgetGroup({
            container: $(chart_container),
            type: "chart",
            columns: 1,
            widgets: data.charts.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }
    
    
    $(container).on('click', '.number-card-section', function() {
        document.getElementById('dropdown-panel').classList.remove('show');
    });


    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
    }
}



function fetchAndRenderWorkspacews(name, container) {
    const sidebarData = frappe.boot.workspace_sidebar_item?.[name.toLowerCase()];
    //console.log(sidebarData);
    frappe.call({
        method: "frappe.desk.desktop.get_desktop_page",
        args: { page: { name: name, public: 1 } },
        callback: function (r) {
            if (r.message) {
                renderWorkspaceHTMLws(r.message, container, sidebarData);
            } else {
                container.innerHTML = `<div class="no-data">no data to be shown</div>`;
            }
        }
    });
}




function renderWorkspaceHTMLws(data, container, sidebarData) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;
    
    if (sidebarData && sidebarData.items && sidebarData.items.length > 0) {
        let shortcutItems = (data.shortcuts && data.shortcuts.items) ? [...data.shortcuts.items] : [];
        let cards = (data.cards && data.cards.items) ? [...data.cards.items] : [];
        
        let currentCard = null;
        
        sidebarData.items.forEach(item => {
            if (item.type === "Link" && item.child === 0 && item.link_type !== "Workspace") {
                const exists = shortcutItems.some(s => s.link_to === item.link_to);
                if (!exists) {
                    shortcutItems.push({
                        label: item.label,
                        doc_view: "",
                        link_to: item.link_to,
                        type: item.link_type,
                        icon: item.icon
                    });
                }
                
            }
            else if (item.type === "Section Breakdddd" && item.link_to === null) {
                currentCard = {
                    label: item.label,
                    links: []
                };
                cards.push(currentCard);
            }
            else if (item.type === "Linkdddd" && item.child === 1 && currentCard) {
                currentCard.links.push({
                    label: item.label,
                    doc_view: "",
                    type: "Link",
                    link_to: item.link_to,
                    link_type: item.link_type
                });
            }
            else if (item.type === "Section Break" && item.link_to === null) {
                currentCard = {
                    label: item.label,
                    links: []
                };
                const cardExists = cards.some(c => c.label === item.label);
                if (!cardExists) {
                    cards.push(currentCard);
                } else {
                    currentCard = cards.find(c => c.label === item.label);
                }
            }
            else if (item.type === "Link" && item.child === 1 && currentCard) {
                const linkExists = currentCard.links.some(l => l.link_to === item.link_to);
                if (!linkExists) {
                    currentCard.links.push({
                        label: item.label,
                        doc_view: "",
                        type: "Link",
                        link_to: item.link_to,
                        link_type: item.link_type
                    });
                }
            }
        });
        
        data.shortcuts = { items: shortcutItems };
        data.cards = { items: cards };
        //console.log(data);
    }
    
    if (!document.getElementById('workspace-scoped-style')) {
        $('head').append(`
            <style id="workspace-scoped-style">
              .number-card-section .widget-group-body.grid-col-4 {
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                    grid-template-columns: none !important;
                    gap: 15px !important;
                    overflow-x: auto !important;
                }

                .number-card-section .widget.number-widget-box {
                    flex: 1 0 220px !important;
                    max-width: none !important;
                    min-width: 200px !important;
                }


                .number-card-section .widget-group-body {
                    display: flex !important;
                    flex-direction: column !important;
                    grid-template-columns: none !important;
                    gap: 20px !important;
                }

                .number-card-section .widget {
                    width: 100% !important;
                    max-width: none !important;
                }


                .number-card-section .widget-group-body::-webkit-scrollbar { height: 4px; }
                .number-card-section .widget-group-body::-webkit-scrollbar-thumb { background: #d1d8dd; border-radius: 10px; }
            </style>
        `);
    }

    const get_route = (r) => {
        let e = "";
        let is_link = r.type === "Link";
        let target_type = (is_link ? r.link_type : r.type || "").toLowerCase();
        let target_name = r.link_to || r.name;

        if (r.url) {
            e = r.url;
        } else if (r.link) {
            e = r.link.replace(/^#/, "");
        } else if (target_type === "doctype") {
            let slug = frappe.router.slug(target_name);
            if (frappe.model.is_single(target_name)) {
                e = slug;
            } else {
                // If it's a "Link" type, it usually goes to List by default
                // If it's a "Shortcut", it follows the doc_view logic
                if (is_link || !r.doc_view) {
                    e = `${slug}/view/list`;
                } else {
                    switch (r.doc_view) {
                        case "List": e = `${slug}/view/list`; break;
                        case "Tree": e = `${slug}/view/tree`; break;
                        case "Report Builder": e = `${slug}/view/report`; break;
                        case "Dashboard": e = `${slug}/view/dashboard`; break;
                        case "New": e = `${slug}/new`; break;
                        case "Calendar": e = `${slug}/view/calendar/default`; break;
                        case "Kanban": 
                            e = `${slug}/view/kanban`;
                            if (r.kanban_board) e += `/${r.kanban_board}`;
                            break;
                        default: e = slug;
                    }
                }
            }
        } else if (target_type === "report") {
            e = r.is_query_report ? `query-report/${target_name}` : (r.doctype ? `${frappe.router.slug(r.doctype)}/view/report/${target_name}` : `report/${target_name}`);
        } else if (target_type === "page") {
            e = target_name;
        } else if (target_type === "dashboard") {
            e = `dashboard-view/${target_name}`;
        }

        return `/app/${e}`;
    };

    const create_element = (item, cls) => {
        const route = get_route(item);
        const a = document.createElement('a');
        a.className = cls;
        a.href = route;
        a.innerHTML = `<span>${item.label || item.name}</span>`;
        a.onclick = (e) => {
            e.preventDefault();
            frappe.set_route(route);
        };
        return a;
    };

    // 1. Number Cards
   
    // 3. Shortcuts
    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElementsh(s));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    if (cards.length > 0) {
        const shortcutsWrapper1 = document.createElement('div');
        shortcutsWrapper1.className = 'card-horizontal-wrapper';
        shortcutsWrapper1.innerHTML = `<div class="card-main-title">${__('Reports & Masters')}</div>`;
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement(link));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        shortcutsWrapper1.appendChild(cardGroupsContainer);
        container.appendChild(shortcutsWrapper1);
    }
    
    
     if (data.number_cards && data.number_cards.items && data.number_cards.items.length > 0) {
        const nc_container = document.createElement('div');
        nc_container.className = 'number-card-section';
        nc_container.style.marginBottom = '25px';
        container.appendChild(nc_container);

        new frappe.widget.WidgetGroup({
            container: $(nc_container),
            type: "number_card",
            columns: 4,
            widgets: data.number_cards.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chart_container = document.createElement('div');
        chart_container.className = 'chart-section';
        chart_container.style.marginBottom = '25px';
        container.appendChild(chart_container);

        new frappe.widget.WidgetGroup({
            container: $(chart_container),
            type: "chart",
            columns: 1,
            widgets: data.charts.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }
    
    
    $(container).on('click', '.number-card-section', function() {
        document.getElementById('dropdown-panel').classList.remove('show');
    });


    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">Empty Workspace</div>';
    }
}
function renderWorkspaceHTML555(data, container) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;

    if (data.number_cards && data.number_cards.items && data.number_cards.items.length > 0) {
        const nc_container = document.createElement('div');
        nc_container.className = 'number-card-section';
        nc_container.style.marginBottom = '25px';
        container.appendChild(nc_container);

        new frappe.widget.WidgetGroup({
            container: $(nc_container),
            type: "number_card",
            columns: data.number_cards.items.length,
            widgets: data.number_cards.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chart_container = document.createElement('div');
        chart_container.className = 'chart-section';
        chart_container.style.marginBottom = '25px';
        container.appendChild(chart_container);

        new frappe.widget.WidgetGroup({
            container: $(chart_container),
            type: "chart",
            columns: 1,
            widgets: data.charts.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElement({
                    label: s.label || s.name,
                    link_to: target,
                    type: s.type
                }));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    if (cards.length > 0) {
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement({
                        label: link.label || link.link_to,
                        link_to: link.link_to,
                        type: link.link_type || link.type
                    }));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        container.appendChild(cardGroupsContainer);
    }

    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">the workspace is empty</div>';
    }
}
function renderWorkspaceHTML44444(data, container) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;

    if (data.number_cards && data.number_cards.items && data.number_cards.items.length > 0) {
        const nc_container = document.createElement('div');
        nc_container.className = 'number-card-section';
        container.appendChild(nc_container);

        new frappe.widget.WidgetGroup({
            container: $(nc_container),
            type: "number_card",
            columns: 4,
            widgets: data.number_cards.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chart_container = document.createElement('div');
        chart_container.className = 'chart-section';
        container.appendChild(chart_container);

        new frappe.widget.WidgetGroup({
            container: $(chart_container),
            type: "chart",
            columns: 1,
            widgets: data.charts.items,
            options: {
                allow_sorting: false,
                allow_config: false
            }
        });
        hasVisibleContent = true;
    }

    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';
        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                shortcutsFlex.appendChild(createLinkElement({
                    label: s.label || s.name,
                    link_to: target,
                    type: s.type
                }));
                hasVisibleContent = true;
            }
        });
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    if (cards.length > 0) {
        const cardGroupsContainer = document.createElement('div');
        cardGroupsContainer.className = 'card-groups-container';
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement({
                        label: link.label || link.link_to,
                        link_to: link.link_to,
                        type: link.link_type || link.type
                    }));
                    hasVisibleContent = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
        container.appendChild(cardGroupsContainer);
    }

    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">the workspace is empty</div>';
    }
}




function renderWorkspaceHTML2222(data, container) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;

    if (data.charts && data.charts.items && data.charts.items.length > 0) {
        const chartsWrapper = document.createElement('div');
        chartsWrapper.className = 'charts-horizontal-wrapper';
        chartsWrapper.style.display = 'grid';
        chartsWrapper.style.gridTemplateColumns = 'repeat(auto-fill, minmax(400px, 1fr))';
        chartsWrapper.style.gap = '15px';
        chartsWrapper.style.marginBottom = '20px';

        data.charts.items.forEach(chartItem => {
            const chartCol = document.createElement('div');
            chartCol.className = 'chart-column';
            chartsWrapper.appendChild(chartCol);

            frappe.widget.make_widget({
                widget_type: 'chart',
                widget_name: chartItem.chart_name,
                container: chartCol,
                label: chartItem.label || chartItem.chart_name,
                options: chartItem
            });
            hasVisibleContent = true;
        });
        container.appendChild(chartsWrapper);
    }

    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';
        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';

        shortcutItems.forEach(s => {
            const target = s.link_to || s.url || s.doc_name;
            if (target) {
                const itemObj = {
                    label: s.label || s.name,
                    link_to: target,
                    type: s.type,
                    doc_view: s.doc_view
                };
                shortcutsFlex.appendChild(createLinkElement(itemObj));
                hasVisibleContent = true;
            }
        });
        
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);

        const spacer = document.createElement('div');
        spacer.className = 'workspace-spacer';
        container.appendChild(spacer);
    }

    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    const cardGroupsContainer = document.createElement('div');
    cardGroupsContainer.className = 'card-groups-container';
    let hasCards = false;
    
    if (cards.length > 0) {
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement({
                        label: link.label || link.link_to,
                        link_to: link.link_to,
                        type: link.link_type || link.type
                    }));
                    hasVisibleContent = true;
                    hasCards = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
    }
    
    if (hasCards) {
        container.appendChild(cardGroupsContainer);
    }

    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">the workspace is empty</div>';
    }
}














function renderWorkspaceHTML1111(data, container) {
    container.innerHTML = ''; 
    let hasVisibleContent = false;



    const shortcutItems = (data.shortcuts && data.shortcuts.items) ? data.shortcuts.items : [];
    if (shortcutItems.length > 0) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.className = 'shortcuts-horizontal-wrapper';


        shortcutsWrapper.innerHTML = `<div class="shortcut-main-title">${__('Your Shortcuts')}</div>`;
        
        const shortcutsFlex = document.createElement('div');
        shortcutsFlex.className = 'shortcuts-flex-row';

        shortcutItems.forEach(s => {
            const target = s.link_to || s.url;
            if (target) {
                const itemObj = {
                    label: s.label || s.name,
                    link_to: target,
                    type: s.type
                };
                shortcutsFlex.appendChild(createLinkElement(itemObj));
                hasVisibleContent = true;
            }
        });
        
        shortcutsWrapper.appendChild(shortcutsFlex);
        container.appendChild(shortcutsWrapper);

  
  
        const spacer = document.createElement('div');
        spacer.className = 'workspace-spacer';
        container.appendChild(spacer);
    }

    // --- 2  card-groups-container ---
    const cards = (data.cards && data.cards.items) ? data.cards.items : [];
    
    
    const cardGroupsContainer = document.createElement('div');
    cardGroupsContainer.className = 'card-groups-container';
    
    let hasCards = false;
    
    if (cards.length > 0) {
        cards.forEach(card => {
            if (card.links && card.links.length > 0) {
                const group = createGroupContainer(card.label);
                card.links.forEach(link => {
                    group.appendChild(createLinkElement({
                        label: link.label || link.link_to,
                        link_to: link.link_to,
                        type: link.link_type || link.type
                    }));
                    hasVisibleContent = true;
                    hasCards = true;
                });
                cardGroupsContainer.appendChild(group);
            }
        });
    }
    
    if (hasCards) {
        container.appendChild(cardGroupsContainer);
    }

    if (!hasVisibleContent) {
        container.innerHTML = '<div class="no-data">the workspace is empity</div>';
    }
}

function createGroupContainer(title) {
    const group = document.createElement('div');
    group.className = 'card-group';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'card-title';
    titleDiv.textContent = __(title);
    
    group.appendChild(titleDiv);
    return group;
}


function createLinkElement(item) {
    const a = document.createElement('a');
    a.className = 'link-item ellipsis';
    a.setAttribute('type', item.type || 'Link');
    
    if (item.label) {
        a.setAttribute('title', item.label);
    }
    
    
    
    const get_route = (r) => {
        let e = "";
        let is_link = r.type === "Link";
        let target_type = (is_link ? r.link_type : r.type || "").toLowerCase();
        let target_name = r.link_to || r.name;

        if (r.url) {
            e = r.url;
            if (r.type === "URL" && r.doc_view !== "List" ) return e;
        } else if (r.link) {
            e = r.link.replace(/^#/, "");
        } else if (target_type === "doctype") {
            let slug = frappe.router.slug(target_name);
            if (frappe.model.is_single(target_name)) {
                e = slug;
            } else {
                // If it's a "Link" type, it usually goes to List by default
                // If it's a "Shortcut", it follows the doc_view logic
                if (is_link || !r.doc_view) {
                    e = `${slug}/view/list`;
                } else {
                    switch (r.doc_view) {
                        case "List": e = `${slug}/view/list`; break;
                        case "Tree": e = `${slug}/view/tree`; break;
                        case "Report Builder": e = `${slug}/view/report`; break;
                        case "Dashboard": e = `${slug}/view/dashboard`; break;
                        case "New": e = `${slug}/new`; break;
                        case "Calendar": e = `${slug}/view/calendar/default`; break;
                        case "Kanban": 
                            e = `${slug}/view/kanban`;
                            if (r.kanban_board) e += `/${r.kanban_board}`;
                            break;
                        default: e = slug;
                    }
                }
            }
        } else if (target_type === "report") {
            e = r.is_query_report ? `query-report/${target_name}` : (r.doctype ? `${frappe.router.slug(r.doctype)}/view/report/${target_name}` : `report/${target_name}`);
        } else if (target_type === "page") {
            e = target_name;
        } else if (target_type === "dashboard") {
            e = `dashboard-view/${target_name}`;
        }

        return `/app/${e}`;
    };

    
    const linkContent = document.createElement('span');
    linkContent.className = 'link-content ellipsis';
    
    const linkText = document.createElement('span');
    linkText.className = 'link-text';
    linkText.textContent = __(item.label);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'es-icon es-line ml-2 icon-xs');
    svg.setAttribute('aria-hidden', 'true');
    
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('class', '');
    use.setAttribute('href', '#es-line-arrow-up-right');
    svg.appendChild(use);
    
    linkContent.appendChild(linkText);
    linkContent.appendChild(svg);
    a.appendChild(linkContent);
    const url = get_route(item);

    a.onclick = (e) => {
       
        if ( url) {
            if (item.type !== "URL" || item.doc_view === "List" ) {
                frappe.set_route(url);
            } else {
                window.open(url, '_blank');
            }
            //navigateTo(url);
            document.getElementById('dropdown-panel').classList.remove('show');
        }
    };
    
    return a;
}





function createGroupContainer(title, icon) {
    const div = document.createElement('div');
    div.className = 'card-group';
    div.innerHTML = `<div class="card-title"><i class="${icon}"></i> ${__(title)}</div>`;
    return div;
}


function createLinkItem(item, iframe, dropdown) {
    const a = document.createElement('a');
    a.className = 'link-item';
    
    const icon = item.icon || getLinkIcon(item);
    const url = buildLinkUrl(item);

    a.innerHTML = `<i class="${icon}"></i> ${__(item.label)}`;
    
    a.onclick = (e) => {
        e.preventDefault();
        if (url) {
            iframe.src = url;
            window.history.pushState({ path: url }, '', url);
            dropdown.classList.remove('show');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
        }
    };
    return a;
}


function navigateTo(path) {
    console.log("Navigating to:", path);
    if (typeof frappe !== 'undefined') {
        frappe.set_route(path);
    } else {
        window.location.href = path;
    }
}

function navigateTo11(item) {
    const dropdown = document.getElementById('dropdown-panel');
    dropdown.style.display = 'none';
    document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));

    const type = item.type || item.link_type;
    const to = item.link_to;

    if (type === 'URL') {
        window.open(to, '_blank');
        return;
    }


    switch(type) {
        case 'DocType': frappe.set_route('List', to); break;
        case 'Report': frappe.set_route('query-report', to); break;
        case 'Page': frappe.set_route(to); break;
        case 'Dashboard': frappe.set_route('dashboard-view', to); break;
        default: frappe.set_route(to);
    }
}



document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('dropdown-panel');
    if (dropdown && !dropdown.contains(e.target) && !e.target.closest('.workspace-btn')) {
        dropdown.style.display = 'none';
        document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
    }
});


$(document).on('click', function (e) {
    const dropdown = document.getElementById('dropdown-panel');
    const header = document.querySelector('.global-workspace-header');
    

    if (dropdown && dropdown.classList.contains('show')) {
        if (!header.contains(e.target)) {
            dropdown.classList.remove('show');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
        }
    }
});
