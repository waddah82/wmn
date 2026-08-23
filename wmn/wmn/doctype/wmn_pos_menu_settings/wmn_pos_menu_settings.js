const WMN_POS_MENU_ICONS = Object.freeze([
    "home", "setting-gear", "user", "users", "customer", "supplier", "organization",
    "shopping-cart", "shopping-bag", "stock", "package", "box", "truck", "file",
    "file-text", "clipboard", "list", "grid", "search", "filter", "printer", "edit",
    "add", "check", "circle-check", "alert", "info", "star", "heart", "tag", "gift",
    "percent", "calendar", "clock", "map", "location", "phone", "mail", "link",
    "attachment", "download", "upload", "refresh", "sync", "menu", "apps", "table",
    "chart", "bar-chart", "pie-chart", "play", "pause", "lock", "unlock", "money-coins",
    "credit-card", "arrow-right", "arrow-left", "chevron-right", "chevron-left"
]);

function wmn_escape_html(value) {
    const text = String(value ?? "");
    if (frappe.utils?.escape_html) return frappe.utils.escape_html(text);
    return text.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

function wmn_icon_markup(name, size = "md") {
    const iconName = String(name || "").trim();
    if (!iconName || typeof frappe.utils?.icon !== "function") return "";
    try {
        return String(frappe.utils.icon(iconName, size) || "");
    } catch (error) {
        return "";
    }
}

function wmn_safe_color(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "";
}

function wmn_get_menu_grid_form(frm, cdn) {
    const grid = frm.fields_dict?.menu_items?.grid;
    return grid?.grid_rows_by_docname?.[cdn]?.grid_form || null;
}

function wmn_render_menu_item_preview(frm, cdt, cdn) {
    const row = locals?.[cdt]?.[cdn];
    const gridForm = wmn_get_menu_grid_form(frm, cdn);
    const wrapper = gridForm?.fields_dict?.icon_preview?.$wrapper;
    if (!row || !wrapper?.length) return;

    const iconName = String(row.icon || "").trim();
    const iconHtml = wmn_icon_markup(iconName, "md") || wmn_icon_markup("file", "md");
    const background = wmn_safe_color(row.button_color) || "var(--card-bg, #fff)";
    const text = wmn_safe_color(row.text_color) || "var(--text-color, #1f2937)";
    const label = row.custom_label || row.doctype_name || __("Menu Item");

    wrapper.html(`
        <div style="padding:8px 0;">
            <div style="display:flex;align-items:center;gap:10px;min-height:46px;padding:9px 12px;border:1px solid var(--border-color,#d1d8dd);border-radius:10px;background:${background};color:${text};max-width:360px;">
                <span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;color:inherit;">${iconHtml}</span>
                <span style="font-weight:700;color:inherit;">${wmn_escape_html(label)}</span>
            </div>
            <div class="text-muted small" style="margin-top:5px;">${wmn_escape_html(iconName || __("Default icon"))}</div>
        </div>`);
}

function wmn_open_icon_picker(frm, cdt, cdn) {
    const row = locals?.[cdt]?.[cdn];
    if (!row) return;

    const currentIcon = String(row.icon || "").trim();
    const dialog = new frappe.ui.Dialog({
        title: __("Choose Icon"),
        size: "large",
        fields: [
            {
                fieldname: "search",
                fieldtype: "Data",
                label: __("Search Icon"),
                placeholder: __("Type an icon name")
            },
            { fieldname: "icons_html", fieldtype: "HTML" }
        ],
        secondary_action_label: __("Clear Icon"),
        secondary_action() {
            frappe.model.set_value(cdt, cdn, "icon", "").then(() => {
                dialog.hide();
                wmn_render_menu_item_preview(frm, cdt, cdn);
            });
        }
    });

    const render = () => {
        const search = String(dialog.get_value("search") || "").trim().toLowerCase();
        const names = Array.from(new Set([currentIcon, ...WMN_POS_MENU_ICONS].filter(Boolean)))
            .filter((name) => !search || name.toLowerCase().includes(search));
        const buttons = names.map((name) => {
            const markup = wmn_icon_markup(name, "md");
            if (!markup) return "";
            const selected = name === String(locals?.[cdt]?.[cdn]?.icon || "").trim();
            return `
                <button type="button" class="btn btn-default wmn-pos-icon-choice" data-icon="${wmn_escape_html(name)}"
                    style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:78px;padding:8px;border-radius:8px;${selected ? "border-color:var(--primary,#2490ef);box-shadow:0 0 0 1px var(--primary,#2490ef);" : ""}">
                    <span style="display:inline-flex;align-items:center;justify-content:center;min-height:28px;">${markup}</span>
                    <small style="max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${wmn_escape_html(name)}</small>
                </button>`;
        }).filter(Boolean).join("");

        dialog.fields_dict.icons_html.$wrapper.html(`
            <div class="wmn-pos-icon-picker-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(105px,1fr));gap:8px;max-height:55vh;overflow:auto;padding:4px;">
                ${buttons || `<div class="text-muted" style="padding:16px;">${wmn_escape_html(__("No matching icons found."))}</div>`}
            </div>`);
    };

    dialog.fields_dict.search.$input.on("input", frappe.utils.debounce(render, 100));
    dialog.fields_dict.icons_html.$wrapper.on("click", ".wmn-pos-icon-choice", async (event) => {
        const iconName = String($(event.currentTarget).attr("data-icon") || "").trim();
        await frappe.model.set_value(cdt, cdn, "icon", iconName);
        dialog.hide();
        wmn_render_menu_item_preview(frm, cdt, cdn);
    });
    dialog.$wrapper.one("hidden.bs.modal", () => {
        dialog.fields_dict.search.$input.off("input");
        dialog.fields_dict.icons_html.$wrapper.off("click", ".wmn-pos-icon-choice");
    });

    dialog.show();
    render();
    dialog.fields_dict.search.$input.trigger("focus");
}

frappe.ui.form.on("WMN POS Menu Settings", {
    setup(frm) {
        frm.set_query("doctype_name", "menu_items", () => ({
            filters: { istable: 0 },
        }));
    },
});

frappe.ui.form.on("WMN POS Menu Item", {
    form_render(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    icon(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    button_color(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    text_color(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    custom_label(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    doctype_name(frm, cdt, cdn) {
        wmn_render_menu_item_preview(frm, cdt, cdn);
    },
    choose_icon(frm, cdt, cdn) {
        wmn_open_icon_picker(frm, cdt, cdn);
    },
});
