/* WMN POS cache manager UI. Edits the local POS cache only; it never synchronizes to the server. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features = ns.Features || {};
    ns.Features.PosCacheManager = ns.Features.PosCacheManager || {};
    ns.Features.PosCacheManager.Common = ns.Features.PosCacheManager.Common || {};

    function esc(value) {
        return frappe.utils?.escape_html ? frappe.utils.escape_html(String(value ?? "")) : String(value ?? "");
    }

    function adapter() {
        const value = ns.Services?.Cache?.PosCacheAdapter;
        if (!value) throw new Error(__("POS cache adapter is not loaded."));
        return value;
    }

    function ensureStyles() {
        window.WMN_POS?.UI?.ensurePageStylesheet?.();
    }

    function sourceManagerHtml(sources) {
        const cards = (sources || []).map(source => `
            <button type="button" class="wmn-pos-cache-source-card" data-source-id="${esc(source.id)}">
                <span><strong>${esc(source.label)}</strong><small>${esc(source.description || source.storeName)}</small></span>
                <span class="wmn-pos-cache-source-count">${Number(source.count || 0)}</span>
            </button>
        `).join("");
        return `
            <div class="wmn-pos-cache-note">${esc(__("This manager reads and writes the local POS cache only. It does not synchronize changes to ERPNext."))}</div>
            <div class="wmn-pos-cache-source-grid">${cards || `<div class="wmn-pos-cache-empty">${esc(__("No POS cache sources are available."))}</div>`}</div>
        `;
    }

    async function open() {
        ensureStyles();
        const sources = await adapter().listSources();
        const dialog = new frappe.ui.Dialog({
            title: __("POS Cache Manager"),
            size: "large",
            fields: [{ fieldname: "cache_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-cache-manager-dialog");
        dialog.fields_dict.cache_html.$wrapper.html(sourceManagerHtml(sources));
        dialog.$wrapper.on("click.wmnPosCacheManager", ".wmn-pos-cache-source-card", (event) => {
            const sourceId = String($(event.currentTarget).attr("data-source-id") || "");
            if (!sourceId) return;
            openSource(sourceId).catch(error => {
                console.error("WMN POS cache source open failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to open POS cache."), indicator: "red" });
            });
        });
        dialog.$wrapper.one("hidden.bs.modal.wmnPosCacheManager", () => dialog.$wrapper.off(".wmnPosCacheManager"));
        dialog.show();
        return dialog;
    }

    function sourceShell(config) {
        return `
            <div class="wmn-pos-cache-note">${esc(__("Local cache only. Add, edit and save affect this browser cache and are not synchronized to the server."))}</div>
            <div class="wmn-pos-cache-toolbar">
                <button type="button" class="btn btn-primary wmn-pos-cache-add">${esc(__("Add"))}</button>
                <button type="button" class="btn btn-default wmn-pos-cache-refresh">${esc(__("Refresh"))}</button>
                <input type="search" class="form-control wmn-pos-cache-search" placeholder="${esc(__("Search cache..."))}" autocomplete="off">
            </div>
            <div class="wmn-pos-cache-list"><div class="wmn-pos-cache-empty">${esc(__("Loading..."))}</div></div>
        `;
    }

    async function openSource(sourceId) {
        ensureStyles();
        const cache = adapter();
        const config = cache.getConfig(sourceId);
        const dialog = new frappe.ui.Dialog({
            title: config.label,
            size: "large",
            fields: [{ fieldname: "source_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-cache-source-dialog");
        dialog.fields_dict.source_html.$wrapper.html(sourceShell(config));

        let currentRows = [];
        async function refresh() {
            const query = String(dialog.$wrapper.find(".wmn-pos-cache-search").val() || "").trim();
            const $list = dialog.$wrapper.find(".wmn-pos-cache-list");
            $list.html(`<div class="wmn-pos-cache-empty">${esc(__("Loading..."))}</div>`);
            currentRows = await cache.list(sourceId, { search: query });
            if (!currentRows.length) {
                $list.html(`<div class="wmn-pos-cache-empty">${esc(__("No cached records found."))}</div>`);
                return;
            }
            $list.html(currentRows.map(row => {
                const key = cache.getKey(sourceId, row);
                return `
                    <div class="wmn-pos-cache-row" data-key="${esc(key)}">
                        <div class="wmn-pos-cache-row-main" role="button" tabindex="0"><strong>${esc(cache.getTitle(sourceId, row))}</strong><small>${esc(cache.getSubtitle(sourceId, row))}</small></div>
                        <div class="wmn-pos-cache-row-key" title="${esc(key)}">${esc(key)}</div>
                        <button type="button" class="btn btn-xs btn-default wmn-pos-cache-edit">${esc(__("Edit"))}</button>
                    </div>`;
            }).join(""));
        }

        async function editRow($row) {
            const key = String($row.attr("data-key") || "");
            const row = currentRows.find(item => cache.getKey(sourceId, item) === key) || await cache.get(sourceId, key);
            if (!row) throw new Error(__("Cached record was not found."));
            await openEditor(sourceId, row, currentRows, { isNew: false, onSaved: refresh });
        }

        let searchTimer = null;
        dialog.$wrapper.on("input.wmnPosCacheSource", ".wmn-pos-cache-search", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => refresh().catch(console.error), 180);
        });
        dialog.$wrapper.on("click.wmnPosCacheSource", ".wmn-pos-cache-refresh", () => refresh().catch(console.error));
        dialog.$wrapper.on("click.wmnPosCacheSource", ".wmn-pos-cache-add", () => {
            openEditor(sourceId, {}, currentRows, { isNew: true, onSaved: refresh }).catch(error => {
                console.error("WMN POS cache add failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to add cache record."), indicator: "red" });
            });
        });
        dialog.$wrapper.on("click.wmnPosCacheSource", ".wmn-pos-cache-row-main, .wmn-pos-cache-edit", event => {
            editRow($(event.currentTarget).closest(".wmn-pos-cache-row")).catch(error => {
                console.error("WMN POS cache edit failed", error);
                frappe.show_alert({ message: error?.message || __("Unable to edit cache record."), indicator: "red" });
            });
        });
        dialog.$wrapper.one("hidden.bs.modal.wmnPosCacheSource", () => {
            clearTimeout(searchTimer);
            dialog.$wrapper.off(".wmnPosCacheSource");
        });
        dialog.show();
        await refresh();
        return dialog;
    }

    function serializeForInput(value, type) {
        if (type === "JSON") {
            if (value === undefined || value === null || value === "") return "";
            if (typeof value === "string") {
                try { return JSON.stringify(JSON.parse(value), null, 2); } catch (error) { return value; }
            }
            try { return JSON.stringify(value, null, 2); } catch (error) { return String(value); }
        }
        if (value === undefined || value === null) return "";
        return String(value);
    }

    function editorFieldHtml(field, row, isNew) {
        const value = row?.[field.fieldname];
        const readonly = field.identity && !isNew;
        const required = field.required ? `<span class="reqd">*</span>` : "";
        const wide = ["JSON", "Long Text"].includes(field.type) ? " wmn-wide" : "";
        const commonAttrs = `data-cache-field="${esc(field.fieldname)}" data-cache-type="${esc(field.type)}"${readonly ? " disabled" : ""}`;
        let control = "";

        if (field.type === "Check") {
            const checked = Number(value || 0) === 1 || value === true ? " checked" : "";
            control = `<div class="wmn-pos-cache-check-wrap"><input type="checkbox" ${commonAttrs}${checked}><span>${esc(__("Enabled / True"))}</span></div>`;
        } else if (["Float", "Int"].includes(field.type)) {
            control = `<input type="number" step="${field.type === "Int" ? "1" : "any"}" class="form-control${readonly ? " wmn-pos-cache-readonly" : ""}" ${commonAttrs} value="${esc(serializeForInput(value, field.type))}">`;
        } else if (field.type === "JSON") {
            control = `<textarea class="form-control wmn-json${readonly ? " wmn-pos-cache-readonly" : ""}" ${commonAttrs}>${esc(serializeForInput(value, field.type))}</textarea>`;
        } else if (field.type === "Long Text") {
            control = `<textarea class="form-control${readonly ? " wmn-pos-cache-readonly" : ""}" ${commonAttrs}>${esc(serializeForInput(value, field.type))}</textarea>`;
        } else {
            const inputType = field.type === "Date" ? "date" : (field.type === "Datetime" ? "text" : "text");
            control = `<input type="${inputType}" class="form-control${readonly ? " wmn-pos-cache-readonly" : ""}" ${commonAttrs} value="${esc(serializeForInput(value, field.type))}">`;
        }

        return `<div class="wmn-pos-cache-field${wide}"><label>${esc(field.label || field.fieldname)} ${required}<small class="wmn-fieldname-hint">${esc(field.fieldname)}</small></label>${control}</div>`;
    }

    function collectEditorRecord(dialog, originalRow) {
        const row = JSON.parse(JSON.stringify(originalRow || {}));
        dialog.$wrapper.find("[data-cache-field]").each(function () {
            const $control = $(this);
            const fieldname = String($control.attr("data-cache-field") || "");
            const type = String($control.attr("data-cache-type") || "Data");
            if (!fieldname || $control.prop("disabled")) return;

            if (type === "Check") {
                row[fieldname] = $control.prop("checked") ? 1 : 0;
            } else if (type === "Int") {
                const raw = String($control.val() || "").trim();
                row[fieldname] = raw === "" ? 0 : parseInt(raw, 10);
            } else if (type === "Float") {
                const raw = String($control.val() || "").trim();
                row[fieldname] = raw === "" ? 0 : parseFloat(raw);
            } else if (type === "JSON") {
                const raw = String($control.val() || "").trim();
                if (!raw) row[fieldname] = null;
                else {
                    try { row[fieldname] = JSON.parse(raw); }
                    catch (error) { throw new Error(__("Invalid JSON in field {0}", [fieldname])); }
                }
            } else {
                row[fieldname] = $control.val();
            }
        });
        return row;
    }

    async function openEditor(sourceId, row, sampleRows, options = {}) {
        const cache = adapter();
        const config = cache.getConfig(sourceId);
        const isNew = Boolean(options.isNew);
        const originalRow = JSON.parse(JSON.stringify(row || {}));
        const originalKey = isNew ? "" : cache.getKey(sourceId, originalRow);
        const fields = cache.inferFields(sourceId, originalRow, sampleRows || []);

        const dialog = new frappe.ui.Dialog({
            title: isNew ? __("Add Cache Record - {0}", [config.label]) : __("Edit Cache Record - {0}", [config.label]),
            size: "large",
            fields: [{ fieldname: "editor_html", fieldtype: "HTML" }],
            primary_action_label: __("Save Local Cache"),
            primary_action: async () => {
                try {
                    const record = collectEditorRecord(dialog, originalRow);
                    const result = await cache.save(sourceId, record, { isNew, originalKey });
                    frappe.show_alert({ message: __("Saved to POS local cache: {0}", [result.key]), indicator: "green" });
                    dialog.hide();
                    if (typeof options.onSaved === "function") await options.onSaved();
                } catch (error) {
                    console.error("WMN POS cache save failed", error);
                    frappe.msgprint({ title: __("POS Cache"), indicator: "red", message: esc(error?.message || String(error)) });
                }
            },
            secondary_action_label: __("Cancel"),
            secondary_action: () => dialog.hide(),
        });
        ns.UI.Dialogs?.decorate?.(dialog, "wmn-pos-cache-editor-dialog");
        dialog.fields_dict.editor_html.$wrapper.html(`
            <div class="wmn-pos-cache-note">${esc(__("This saves only to the local POS cache. No synchronization is performed."))}</div>
            <div class="wmn-pos-cache-editor-grid">${fields.map(field => editorFieldHtml(field, originalRow, isNew)).join("")}</div>
        `);
        dialog.show();
        return dialog;
    }

    ns.Features.PosCacheManager.Common.open = open;
    ns.Features.PosCacheManager.Common.openSource = openSource;
})();
