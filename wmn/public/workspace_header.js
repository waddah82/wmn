

if (window.self === window.top) {
    $(document).ready(function () {
        setTimeout(function () {
            initGlobalWorkspace();
        }, 1000);
    });
}

let workspaceCache = {};

function initGlobalWorkspace() {
    if (document.querySelector('.global-workspace-header')) return;
    addGlobalHeader();
    loadWorkspaceButtons();
    setupMainIframe();
}

function addGlobalHeader() {
    const headerHTML = `
        <div class="global-workspace-header" style="
            position: fixed;
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
                height: 48px;
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
                top: 48px;
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
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                "></div>
            </div>
        </div>

        <div class="main-content-container" style="
            transition: margin-top 0.3s ease;
            margin-top: 48px;
            height: calc(100vh - 48px);
            overflow: auto;
        ">
            <iframe id="main-iframe" style="width: 100%; height: 100%; border: none;" src="about:blank"></iframe>
        </div>
    `;

    $('body').prepend(headerHTML);
    $('.page-head, .navbar, header').hide();
    addStyles();
    window.toggleWorkspaceHeader = toggleWorkspaceHeader;
    
    // Search functionality
    setupSearch();
}
document.addEventListener('click', function (event) {
    const dropdown = document.getElementById('dropdown-panel');
    const menu = document.getElementById('workspace-menu');

    if (!dropdown || !dropdown.classList.contains('show')) return;

    const isClickInsideDropdown = dropdown.contains(event.target);

    const isClickOnButton = event.target.closest('.workspace-btn');

    if (!isClickInsideDropdown && !isClickOnButton) {
        dropdown.classList.remove('show');

        document.querySelectorAll('.workspace-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        

    }
});
function setupSearch() {
    const searchInput = document.getElementById('workspace-search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        const groups = document.querySelectorAll('#tabs-content .card-group');
        
        groups.forEach(group => {
            const title = (group.querySelector('.card-title')?.textContent || '').toLowerCase();
            const links = group.querySelectorAll('.link-item');
            let hasVisible = false;
            
            links.forEach(link => {
                const text = (link.textContent || '').toLowerCase();
                const matched = !searchTerm || text.includes(searchTerm) || title.includes(searchTerm);
                link.style.display = matched ? '' : 'none';
                if (matched) hasVisible = true;
            });
            
            group.style.display = hasVisible || !searchTerm ? '' : 'none';
        });
    });
}

function toggleWorkspaceHeader(event) {
    if (event) event.stopPropagation();
    const header = document.querySelector('.dashboard-header');
    const mainContainer = document.querySelector('.main-content-container');
    const icon = document.getElementById('toggle-icon');
    const dropdown = document.getElementById('dropdown-panel');

    if (!header) return;

    if (header.classList.contains('collapsed')) {
        header.classList.remove('collapsed');
        header.style.height = '48px';
        mainContainer.style.marginTop = '48px';
        mainContainer.style.height = 'calc(100vh - 48px)';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (dropdown) dropdown.classList.remove('show');
    } else {
        header.classList.add('collapsed');
        header.style.height = '0';
        mainContainer.style.marginTop = '0';
        mainContainer.style.height = '100vh';
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
            body { margin: 0; padding: 0; overflow: hidden; }
            .page-head, header, footer, .web-footer, .navbar { display: none !important; }
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
            .cards-grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .card-group { background: #fafafa; padding: 15px; border-radius: 8px; flex-direction: column; }
            .card-title { font-weight: 600; padding-bottom: 10px; margin-bottom: 12px; font-size: 12px; color: #3e4047; text-transform: uppercase; display: flex; align-items: center; gap: 8px; }
            .link-item { display: flex; align-items: center; gap: 10px; padding: 4px 12px; color: #555b6b; text-decoration: none; font-size: 13.5px; cursor: pointer; border-radius: 6px; transition: all 0.2s; }
            .link-item:hover { color: #ba9f63; background: #fff; padding-right: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            .loading-spinner { text-align: center; padding: 40px; color: #64748b; }
            .no-data { text-align: center; padding: 40px; color: #94a3b8; }
            .tab-navbar { display: flex; gap: 10px; padding: 15px; background: #f8f9fa; border-bottom: 1px solid #eee; }
            #workspace-search-input:focus { border-color: #ba9f63; }
            .card-groups-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 10px; }
            @media (max-width: 768px) { .card-groups-container { grid-template-columns: 1fr; } }
            #tabs-content { display: inline !important; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .shortcuts-horizontal-wrapper { background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
            .shortcut-main-title { font-size: 14px; font-weight: bold; color: #1d1d1d; margin-bottom: 12px; }
            .shortcuts-flex-row { display: flex; flex-wrap: wrap; gap: 12px; }
        </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styles);
}
function loadWorkspaceButtons() {
    if (!window.frappe || !frappe.boot || !frappe.boot.allowed_workspaces) {
        setTimeout(loadWorkspaceButtons, 100);
        return;
    }
    

    const allWorkspaces = frappe.boot.allowed_workspaces;
    const workspaces = allWorkspaces.filter(ws => !ws.parent_page);
    renderButtons(workspaces);
}

function renderButtons(workspaces) {
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


async function loadWorkspaceCards(ws_name) {
    const content = document.getElementById('tabs-content');
    const dropdownPanel = document.getElementById('dropdown-panel');
    const tabHeader = document.getElementById('tab-header');

    if (!content || !tabHeader) return;


    renderSubTabs(ws_name, tabHeader);

    fetchAndRenderWorkspace(ws_name, content);
}



function renderSubTabs(selectedName, container) {
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


function fetchAndRenderWorkspace(name, container) {
    container.innerHTML = `<div class="loading-spinner"><i class="fa fa-spinner fa-spin fa-2x"></i></div>`;
    
    frappe.call({
        method: "frappe.desk.desktop.get_desktop_page",
        args: { page: { name: name, public: 1 } },
        callback: function (r) {
            if (r.message) {
                renderWorkspaceHTML(r.message, container);
            } else {
                container.innerHTML = `<div class="no-data">لم يتم العثور على بيانات أو لا تملك صلاحية</div>`;
            }
        }
    });
}


function renderWorkspaceHTML(data, container) {
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
        container.innerHTML = '<div class="no-data">الوركسبيس فارغ</div>';
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
    const url = buildLinkUrl(item);

    a.onclick = (e) => {
        e.preventDefault();
        const iframe = document.getElementById('main-iframe');
        if (iframe && url) {
            iframe.src = url;
            window.history.pushState({ path: url }, '', url);
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


function redirectToMain(url) {
    const dropdown = document.getElementById('dropdown-panel');
    if (dropdown) dropdown.classList.remove('show');
    
    document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
    
    const mainIframe = document.getElementById('main-iframe');
    if (mainIframe && url) {
        let path = url;
        if (url.startsWith('http')) {
            try {
                path = new URL(url).pathname;
            } catch(e) {}
        }
        if (!path.startsWith('/app/') && path.startsWith('app/')) path = '/' + path;
        mainIframe.src = path;
        window.history.pushState({ path: path }, '', path);
    }
}
function setupMainIframe() {
    const mainIframe = document.getElementById('main-iframe');
    if (!mainIframe) return;

    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/app/')) mainIframe.src = currentPath;

    mainIframe.onload = function() {
        try {
            const iframeDoc = mainIframe.contentDocument || mainIframe.contentWindow.document;

            iframeDoc.addEventListener('click', function() {
                const dropdown = document.getElementById('dropdown-panel');
                if (dropdown && dropdown.classList.contains('show')) {
                    dropdown.classList.remove('show');
                    document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
                }
            });
        } catch (e) {
            console.log("Iframe Access Restricted (Cross-Origin): ", e);
        }
    };

    let lastUrl = mainIframe.src;
    setInterval(() => {
        try {
            const frameWin = mainIframe.contentWindow;
            let currentUrl = frameWin.location.pathname + frameWin.location.search;
            
            if (currentUrl !== lastUrl && currentUrl !== 'blank' && currentUrl.includes('/app/')) {
                lastUrl = currentUrl;
                window.history.pushState({ path: currentUrl }, '', currentUrl);
            }
        } catch(err) {}
    }, 500);
}
function setupMainIframe11() {
    const mainIframe = document.getElementById('main-iframe');
    if (!mainIframe) return;

    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/app/')) mainIframe.src = currentPath;

    let lastUrl = mainIframe.src;
    setInterval(() => {
        try {
            let currentUrl = mainIframe.src;
            try {
                const frameWin = mainIframe.contentWindow;
                if (frameWin && frameWin.location) currentUrl = frameWin.location.pathname;
            } catch(e) {}
            if (currentUrl !== lastUrl && currentUrl !== 'about:blank' && currentUrl.startsWith('/app/')) {
                lastUrl = currentUrl;
                window.history.pushState({ path: currentUrl }, '', currentUrl);
            }
        } catch(err) {}
    }, 500);

    $(document).click(function(e) {
        const dropdown = document.getElementById('dropdown-panel');
        const menu = document.getElementById('workspace-menu');
        if (dropdown && dropdown.classList.contains('show') && !menu.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
            document.querySelectorAll('.workspace-btn').forEach(b => b.classList.remove('active'));
        }
    });
}


window.addEventListener('popstate', function() {
    const mainIframe = document.getElementById('main-iframe');
    const path = window.location.pathname;
    if (mainIframe && path.startsWith('/app/')) mainIframe.src = path;
});