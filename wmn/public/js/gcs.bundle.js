window.onload = function() {
    setTimeout(applyCustomStyles, 500);
};

function applyCustomStyles() {
    const css = `

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Cairo:wght@400;700&display=swap');


body, html {
  font-family: 'Inter', 'Cairo', sans-serif !important;
  font-size: 15px !important;
  color: #153351 !important;
  background: #DAE1E3 !important;
}


.navbar {
  background: linear-gradient(135deg,
    #0f2942 0%,
    #153351 45%,
    #1e4066 100%
  ) !important;
  border: none !important;
  height: 58px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}

.navbar .navbar-brand {
  color: #BA9F63 !important;
  font-weight: 700 !important;
  font-size: 18px !important;
  position: relative !important;
  padding-left: 32px !important;
}



.navbar .navbar-brand:hover::before {
  opacity: 1;
  transform: translateY(-50%) scale(1.1);
}

.navbar a.nav-link,
.navbar i {
  color: #ffffff !important;
}

.navbar a.nav-link:hover,
.navbar i:hover {
  color: #BA9F63 !important;
}


.sidebar {
  background: #ffffff !important;
  border-right: 1px solid #DAE1E3 !important;
}

.sidebar-item {
  color: #153351 !important;
  font-weight: 500 !important;
  padding: 10px 14px !important;
  border-radius: 6px !important;
  transition: all 0.2s ease;
}

.sidebar-item:hover,
.sidebar-item.selected {
  background: rgba(186,159,99,0.15) !important;
  color: #153351 !important;
  font-weight: 700 !important;
}


.page-head,
.page-title {
  background: #ffffff !important;
  color: #153351 !important;
  border-bottom: 2px solid #BA9F63 !important;
  font-weight: 700 !important;
}


.btn {
  border-radius: 6px !important;
  font-weight: 600 !important;
  transition: 0.25s ease;
}

.btn-primary {
  background: linear-gradient(135deg,
    #0f2942,
    #153351,
    #1e4066
  ) !important;
  border: none !important;
  color: #ffffff !important;
}

.btn-primary:hover {
  background: linear-gradient(135deg,
    #153351,
    #1e4066
  ) !important;
  box-shadow: 0 4px 10px rgba(21,51,81,0.4);
}

.btn-secondary {
  background: transparent !important;
  color: #BA9F63 !important;
  border: 2px solid #BA9F63 !important;
}

.btn-secondary:hover {
  background: #BA9F63 !important;
  color: #153351 !important;
}


input:not([type="checkbox"]):not([type="radio"]),
textarea,
select,
.form-control {
  border: 1px solid #cbd5db !important;
  border-radius: 8px !important;
  background: #ffffff !important;
  color: #153351 !important;
  padding: 8px 10px !important;
  font-weight: 500 !important;
}

input:focus,
textarea:focus,
select:focus,
.form-control:focus {
  border-color: #BA9F63 !important;
  box-shadow: 0 0 0 2px rgba(186,159,99,0.25) !important;
  outline: none !important;
}


input[type="checkbox"],
input[type="radio"] {
  appearance: none !important;
  -webkit-appearance: none !important;
  background: #ffffff !important;
  border: 2px solid #BA9F63 !important;
  width: 14px !important;
  height: 14px !important;
  cursor: pointer;
  position: relative;
  vertical-align: middle;
  transition: all 0.2s ease-in-out;
}

input[type="radio"] {
  border-radius: 50% !important;
}

input[type="checkbox"] {
  border-radius: 4px !important;
}

input[type="checkbox"]:checked,
input[type="radio"]:checked {
  background: #153351 !important;
  border-color: #153351 !important;
}

input[type="checkbox"]:checked::after {
  content: "?";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  font-size: 13px;
  color: #BA9F63 !important;
  font-weight: 700;
}

input[type="radio"]:checked::after {
  content: "";
  position: absolute;
  top: 4px;
  left: 4px;
  width: 6px;
  height: 6px;
  background: #BA9F63 !important;
  border-radius: 50%;
}


.grid-heading-row,
.list-row-head {
  background: linear-gradient(135deg,
    #0f2942,
    #153351,
    #1e4066
  ) !important;
  color: #ffffff !important;
}

.list-row {
  background: #ffffff !important;
  border-bottom: 1px solid #DAE1E3 !important;
}

.list-row:hover {
  background: rgba(186,159,99,0.12) !important;
}


.indicator-pill {
  background: #BA9F63 !important;
  color: #153351 !important;
  font-weight: 700 !important;
}


.page-container {
  background: #ffffff !important;
  border-radius: 10px !important;
  padding: 20px !important;
  box-shadow: 0 3px 8px rgba(0,0,0,0.05);
}


.footer {
  background: linear-gradient(135deg,
    #0f2942,
    #153351,
    #1e4066
  ) !important;
  color: #BA9F63 !important;
  text-align: center;
  font-size: 13px !important;
  padding: 8px 0 !important;
}


.login-content {
  background: linear-gradient(135deg,
    #0f2942 0%,
    #153351 50%,
    #1e4066 100%
  ) !important;
  color: #ffffff !important;
}

.login-content .form-control {
  border-radius: 8px !important;
  border: none !important;
}

.login-content .btn {
  background: #BA9F63 !important;
  color: #153351 !important;
  font-weight: 700 !important;
  border-radius: 8px !important;
}

.login-content .btn:hover {
  opacity: 0.9;
}


#navbar-breadcrumbs a {
  color: #BA9F63 !important;  
  font-weight: 600;
  text-decoration: none;
}


#navbar-breadcrumbs a:hover {
  color: #ffffff !important;  
  text-decoration: underline;
}


#navbar-breadcrumbs li.disabled a {
  color: #BA9F63 !important;
  opacity: 1;
  cursor: copy !important;
}


#navbar-breadcrumbs li::after {
  color: rgba(186,159,99,0.7) !important;
}


span.level-item[data-sort-by] {
  color: #BA9F63 !important;   
  font-weight: 700;
}


span.level-item[data-sort-by]:hover {
  color: #ffffff !important;   
  cursor: pointer;
}


span.level-item[data-sort-by].active,
span.level-item[data-sort-by].sort-active {
  color: #ffffff !important;
  text-decoration: underline;
}


span.level-item.list-header-meta {
  color: #BA9F63 !important;  
  font-weight: 600;
}


span.level-item.list-header-meta {
  transition: color 0.2s ease;
}


.navbar button.btn-reset.nav-link {
  color: #BA9F63 !important;
}


.navbar button.btn-reset.nav-link span {
  color: #BA9F63 !important;
  font-weight: 600;
}


.navbar button.btn-reset.nav-link svg.es-icon {
  fill: #BA9F63 !important;
  stroke: #BA9F63 !important;
}


.navbar button.btn-reset.nav-link:hover,
.navbar button.btn-reset.nav-link:hover span {
  color: #ffffff !important;
}

.navbar button.btn-reset.nav-link:hover svg.es-icon {
  fill: #ffffff !important;
  stroke: #ffffff !important;
}



svg use[href="#icon-search"] {
  display: none !important;
}



    `;
    
    let style = document.createElement('style');
    style.id = 'custom-global-styles';
    style.innerHTML = css;
    document.head.appendChild(style);
}