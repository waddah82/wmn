(() => {
  // ../restaurant/restaurant/public/js/gcs.bundle.js
  window.onload = function() {
    setTimeout(applyCustomStyles, 500);
  };
  function applyCustomStyles() {
    const css = `
             body, html {
  background-color: #f9f9fb !important;
  color: #222 !important;
  font-family: 'Segoe UI', sans-serif !important;
  font-size: 14px !important;
}

a {
  color: #071879ff;
}

a:hover {
  color: #020b38ff ;
}

::selection {
  background-color: #d0d0ff ;
}

.widget.links-widget-box .link-item {
    color: #180101 !important;
    font-weight: 500 !important;
    font-size: larger !important;
}
    `;
    let style = document.createElement("style");
    style.id = "custom-global-styles";
    style.innerHTML = css;
    document.head.appendChild(style);
  }
})();
//# sourceMappingURL=gcs.bundle.RCVLQI27.js.map
