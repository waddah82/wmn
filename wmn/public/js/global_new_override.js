(function () {
  function get_layout_route() {
    const subPath = frappe?.router?.current_sub_path || "";
    return subPath.split("/")[0] || null;
  }

  function get_doctype_route() {
    const route = frappe?.router?.current_route || [];
    if (route[0] !== "List" || !route[1]) return null;

    // Payment Entry => payment-entry
    return frappe.router.slug(route[1]);
  }

  function is_list_view() {
    const route = frappe?.router?.current_route || [];
    return route[0] === "List" && !!route[1];
  }

  function capture_new_override(e) {
    if (!is_list_view()) return;

    const btn = e.target.closest && e.target.closest("button.primary-action");
    if (!btn) return;

    const layoutRoute = get_layout_route();
    const doctypeRoute = get_doctype_route();

    if (!layoutRoute || !doctypeRoute) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation && e.stopImmediatePropagation();
    console.log("overrided");

    window.location.assign(`/app/${layoutRoute}/new-${doctypeRoute}`);
  }

  if (!window.__global_layout_new_for_listview_only_bound) {
    window.__global_layout_new_for_listview_only_bound = true;
    document.addEventListener("click", capture_new_override, true);
    console.log("overrided Gbtn");
  }
})();