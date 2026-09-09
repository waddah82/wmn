/* WMN Barcode Printer. Item data is adapter-owned; label rendering is owned by this feature. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.BarcodePrinting = ns.BarcodePrinting || {};

    const STYLE_ID = "wmn-barcode-printing-style";
    const FRAPPE_AUTO = "__frappe_auto__";
    const FORMATS = [
        { value: FRAPPE_AUTO, label: "Frappe (Auto)" },
        { value: "CODE128", label: "CODE128" },
        { value: "CODE39", label: "CODE39" },
        { value: "EAN13", label: "EAN13" },
        { value: "EAN8", label: "EAN8" },
        { value: "UPC", label: "UPC-A" },
        { value: "ITF", label: "ITF" },
    ];
    const SIZES = {
        small: { width: 38, height: 25 },
        medium: { width: 50, height: 30 },
        large: { width: 60, height: 40 },
    };

    function esc(value) {
        const text = String(value ?? "");
        return frappe.utils?.escape_html ? frappe.utils.escape_html(text) : text.replace(/[&<>"']/g, (ch) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
        }[ch]));
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            .wmn-barcode-page{display:grid;grid-template-columns:minmax(300px,390px) minmax(0,1fr);min-height:calc(100vh - 150px);border:1px solid var(--border-color,#d8dce2);border-radius:12px;overflow:hidden;background:var(--card-bg,#fff)}
            .wmn-barcode-left{display:flex;flex-direction:column;min-width:0;border-inline-end:1px solid var(--border-color,#d8dce2);background:var(--bg-color,#f8fafc)}
            .wmn-barcode-controls{padding:14px;border-bottom:1px solid var(--border-color,#d8dce2);display:grid;gap:9px}
            .wmn-barcode-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wmn-barcode-options .wide{grid-column:1/-1}
            .wmn-barcode-results{flex:1;overflow:auto;padding:10px}.wmn-barcode-result{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;margin-bottom:6px;padding:9px 10px;border:1px solid var(--border-color,#d8dce2);border-radius:9px;background:#fff;text-align:start}.wmn-barcode-result:hover{border-color:var(--primary,#2490ef)}
            .wmn-barcode-result strong,.wmn-barcode-row strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wmn-barcode-result small,.wmn-barcode-row small{color:var(--text-muted,#687386)}
            .wmn-barcode-right{display:flex;flex-direction:column;min-width:0}.wmn-barcode-toolbar{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border-color,#d8dce2)}.wmn-barcode-toolbar .spacer{flex:1}
            .wmn-barcode-selected{max-height:42vh;overflow:auto;padding:12px}.wmn-barcode-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(150px,260px) 90px 42px;gap:8px;align-items:center;margin-bottom:7px;padding:9px;border:1px solid var(--border-color,#d8dce2);border-radius:9px}
            .wmn-barcode-preview-wrap{flex:1;min-height:260px;overflow:auto;padding:14px;background:var(--bg-color,#f8fafc);border-top:1px solid var(--border-color,#d8dce2)}.wmn-barcode-preview{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.wmn-label-preview{display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;padding:1.5mm;border:1px dashed #b8c1cc;background:#fff;color:#111;text-align:center}.wmn-label-preview .name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;font-weight:800}.wmn-label-preview svg{max-width:95%;height:auto}.wmn-label-preview .price{font-size:10px;font-weight:900}
            .wmn-barcode-empty{display:grid;place-items:center;min-height:180px;color:var(--text-muted,#687386);text-align:center}.wmn-barcode-custom{display:none;grid-template-columns:1fr 1fr;gap:8px}.wmn-barcode-custom.show{display:grid}
            @media(max-width:900px){.wmn-barcode-page{grid-template-columns:1fr}.wmn-barcode-left{border-inline-end:0;border-bottom:1px solid var(--border-color,#d8dce2);max-height:48vh}.wmn-barcode-row{grid-template-columns:1fr}.wmn-barcode-toolbar{flex-wrap:wrap}}
        `;
        document.head.appendChild(style);
    }

    function shell() {
        return `
            <div class="wmn-barcode-page">
                <section class="wmn-barcode-left">
                    <div class="wmn-barcode-controls">
                        <select class="form-control wmn-barcode-profile"></select>
                        <input type="search" class="form-control wmn-barcode-search" autocomplete="off" placeholder="${esc(__("Search item name, code, or barcode..."))}">
                        <div class="wmn-barcode-options">
                            <select class="form-control wmn-barcode-format">${FORMATS.map((entry) => `<option value="${entry.value}"${entry.value === FRAPPE_AUTO ? " selected" : ""}>${esc(__(entry.label))}</option>`).join("")}</select>
                            <select class="form-control wmn-barcode-size"><option value="small">${esc(__("38 x 25 mm"))}</option><option value="medium" selected>${esc(__("50 x 30 mm"))}</option><option value="large">${esc(__("60 x 40 mm"))}</option><option value="custom">${esc(__("Custom size"))}</option></select>
                            <div class="wmn-barcode-custom wide"><input type="number" min="10" max="200" value="50" class="form-control wmn-barcode-width" placeholder="${esc(__("Width mm"))}"><input type="number" min="10" max="200" value="30" class="form-control wmn-barcode-height" placeholder="${esc(__("Height mm"))}"></div>
                            <label class="wide" style="display:flex;align-items:center;gap:7px;margin:0"><input type="checkbox" class="wmn-barcode-show-price" checked> ${esc(__("Show price on label"))}</label>
                        </div>
                    </div>
                    <div class="wmn-barcode-results"><div class="wmn-barcode-empty">${esc(__("Search for items to add labels."))}</div></div>
                </section>
                <section class="wmn-barcode-right">
                    <div class="wmn-barcode-toolbar"><strong>${esc(__("Barcode Labels"))}</strong><span class="wmn-barcode-count text-muted small"></span><span class="spacer"></span><button class="btn btn-default wmn-barcode-manual">${esc(__("Add Manual Barcode"))}</button><button class="btn btn-default wmn-barcode-clear">${esc(__("Clear"))}</button><button class="btn btn-primary wmn-barcode-print">${esc(__("Print Labels"))}</button></div>
                    <div class="wmn-barcode-selected"><div class="wmn-barcode-empty">${esc(__("No barcodes selected."))}</div></div>
                    <div class="wmn-barcode-preview-wrap"><div class="wmn-barcode-preview"></div></div>
                </section>
            </div>`;
    }

    async function getContextWithFallback() {
        if (ns.Context.isOffline()) return await ns.BarcodePrinting.Offline.getContext();
        try { return await ns.BarcodePrinting.Online.getContext(); }
        catch (error) {
            if (window.wmnPOSOffline) return await ns.BarcodePrinting.Offline.getContext();
            throw error;
        }
    }

    async function searchWithFallback(query, profile) {
        if (ns.Context.isOffline()) return await ns.BarcodePrinting.Offline.search(query, profile, 30);
        try { return await ns.BarcodePrinting.Online.search(query, profile, 30); }
        catch (error) {
            if (window.wmnPOSOffline) return await ns.BarcodePrinting.Offline.search(query, profile, 30);
            throw error;
        }
    }

    async function resolveWithFallback(value, profile) {
        if (ns.Context.isOffline()) return await ns.BarcodePrinting.Offline.resolveBarcode(value, profile);
        try { return await ns.BarcodePrinting.Online.resolveBarcode(value, profile); }
        catch (error) {
            if (window.wmnPOSOffline) return await ns.BarcodePrinting.Offline.resolveBarcode(value, profile);
            throw error;
        }
    }

    function dimensions($root) {
        const size = String($root.find(".wmn-barcode-size").val() || "medium");
        if (size !== "custom") return SIZES[size] || SIZES.medium;
        return {
            width: Math.min(Math.max(Number($root.find(".wmn-barcode-width").val()) || 50, 10), 200),
            height: Math.min(Math.max(Number($root.find(".wmn-barcode-height").val()) || 30, 10), 200),
        };
    }

    function barcodeValue(item) {
        return String(item?.selected_barcode || "").trim();
    }

    function normalizeBarcodeFormat(value, barcodeValue = "") {
        const raw = String(value || "").trim();
        if (!raw || raw === FRAPPE_AUTO) return "";
        const compact = raw.toUpperCase().replace(/[\s_-]+/g, "");
        const aliases = {
            AUTO: "",
            CODE128: "CODE128",
            CODE39: "CODE39",
            EAN: /^\d{8}$/.test(String(barcodeValue || "")) ? "EAN8" : "EAN13",
            EAN13: "EAN13",
            EAN8: "EAN8",
            UPC: "UPC",
            UPCA: "UPC",
            ITF: "ITF",
            ITF14: "ITF",
            GTIN14: "ITF",
        };
        return Object.prototype.hasOwnProperty.call(aliases, compact) ? aliases[compact] : "";
    }

    function selectedBarcodeMeta(item) {
        if (!item || item.kind === "manual") return null;
        const selected = barcodeValue(item);
        return (item.barcodes || []).find((bc) => String(bc?.barcode || "") === selected) || null;
    }

    function effectiveBarcodeFormat(item, globalFormat) {
        if (String(globalFormat || "").trim() === FRAPPE_AUTO) return "";
        if (item?.kind === "manual") {
            if (item.selected_barcode_type === FRAPPE_AUTO) return "";
            const manualType = normalizeBarcodeFormat(item.selected_barcode_type, barcodeValue(item));
            return manualType || normalizeBarcodeFormat(globalFormat, barcodeValue(item));
        }
        const itemType = normalizeBarcodeFormat(selectedBarcodeMeta(item)?.barcode_type, barcodeValue(item));
        if (itemType) return itemType;
        return normalizeBarcodeFormat(globalFormat, barcodeValue(item));
    }

    function barcodeSvg(value, format, dims) {
        if (!value) return "";
        if (typeof window.JsBarcode !== "function") {
            throw new Error(__("Barcode renderer is not available."));
        }

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const rendererOptions = {
            width: 2,
            height: Math.max(24, Math.round(dims.height * 1.4)),
            fontSize: 12,
            margin: 2,
            displayValue: true,
        };
        // Frappe default: omit format and let JsBarcode choose CODE128 automatically.
        if (format) rendererOptions.format = format;

        try {
            window.JsBarcode(svg, value, rendererOptions);
        } catch (error) {
            throw new Error(error?.message || __("Invalid barcode."));
        }
        svg.setAttribute("width", "100%");
        return svg.outerHTML;
    }

    function labelHtml(item, options) {
        const value = barcodeValue(item);
        const title = item.kind === "manual"
            ? (item.label_text || __("Manual Barcode"))
            : (item.item_name || item.item_code);
        let svg = "";
        if (!value) {
            svg = `<div style="font-size:8px;color:#b42318">${esc(__("No printable barcode for this item."))}</div>`;
        } else {
            try { svg = barcodeSvg(value, effectiveBarcodeFormat(item, options.format), options.dims); }
            catch (error) { svg = `<div style="font-size:8px;color:#b42318">${esc(error?.message || __("Invalid barcode"))}</div>`; }
        }
        const canShowPrice = options.showPrice && (item.kind !== "manual" || item.has_manual_price);
        const price = canShowPrice ? `<div class="price">${esc(format_currency(Number(item.rate || 0), item.currency || undefined))}</div>` : "";
        return `<div class="wmn-label-preview" style="width:${options.dims.width}mm;height:${options.dims.height}mm"><div class="name">${esc(title)}</div>${svg}${price}</div>`;
    }

    function validatePrintableItem(item, options) {
        const value = barcodeValue(item);
        if (!value) throw new Error(__("No printable barcode for this item."));
        barcodeSvg(value, effectiveBarcodeFormat(item, options.format), options.dims);
    }

    function itemBarcodeOptions(item) {
        const list = (item.barcodes || []).filter((bc) => bc?.barcode);
        if (!list.length) return `<option value="">${esc(__("No printable barcode"))}</option>`;
        return list.map((bc) => `<option value="${esc(bc.barcode)}">${esc(bc.barcode)}${bc.barcode_type ? ` (${esc(bc.barcode_type)})` : ""}${bc.uom ? ` · ${esc(bc.uom)}` : ""}</option>`).join("");
    }

    async function mount(wrapper) {
        ensureStyles();
        if (typeof window.JsBarcode !== "function") {
            throw new Error(__("Barcode renderer is not available."));
        }

        const $root = $(wrapper).find(".layout-main-section");
        $root.html(shell());
        const state = { items: [], results: [] };
        const $profile = $root.find(".wmn-barcode-profile");
        const $search = $root.find(".wmn-barcode-search");
        const $results = $root.find(".wmn-barcode-results");
        const $selected = $root.find(".wmn-barcode-selected");
        const $preview = $root.find(".wmn-barcode-preview");

        const context = await getContextWithFallback();
        const profiles = context?.pos_profiles || [];
        $profile.html(profiles.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join(""));
        if (context?.default_pos_profile) $profile.val(context.default_pos_profile);

        function options() {
            return {
                format: String($root.find(".wmn-barcode-format").val() || FRAPPE_AUTO),
                dims: dimensions($root),
                showPrice: $root.find(".wmn-barcode-show-price").is(":checked"),
            };
        }

        function renderSelected() {
            if (!state.items.length) {
                $selected.html(`<div class="wmn-barcode-empty">${esc(__("No barcodes selected."))}</div>`);
                $preview.empty();
                $root.find(".wmn-barcode-count").text("");
                return;
            }
            $selected.html(state.items.map((item, index) => `
                <div class="wmn-barcode-row" data-index="${index}">
                    <div><strong>${esc(item.kind === "manual" ? (item.label_text || __("Manual Barcode")) : (item.item_name || item.item_code))}</strong><small>${esc(item.kind === "manual" ? __("Manual barcode - no Item required") : item.item_code)}</small></div>
                    ${item.kind === "manual"
                        ? `<input inputmode="numeric" pattern="[0-9]*" class="form-control wmn-barcode-row-manual-code" value="${esc(item.selected_barcode || "")}">`
                        : `<select class="form-control wmn-barcode-row-code">${itemBarcodeOptions(item)}</select>`}
                    <input type="number" min="1" max="999" class="form-control wmn-barcode-row-qty" value="${Math.max(1, Number(item.qty || 1))}">
                    <button class="btn btn-default wmn-barcode-remove" title="${esc(__("Remove"))}">×</button>
                </div>`).join(""));
            state.items.forEach((item, index) => {
                if (item.kind === "manual") return;
                const $row = $selected.find(`.wmn-barcode-row[data-index="${index}"]`);
                $row.find(".wmn-barcode-row-code").val(item.selected_barcode || "");
            });
            renderPreview();
        }

        function renderPreview() {
            const opts = options();
            const labels = [];
            let total = 0;
            for (const item of state.items) {
                const qty = Math.max(1, Number(item.qty || 1));
                total += qty;
                for (let i = 0; i < Math.min(qty, 3); i++) labels.push(labelHtml(item, opts));
                if (labels.length >= 12) break;
            }
            $preview.html(labels.join(""));
            $root.find(".wmn-barcode-count").text(`${total} ${__("label(s)")}`);
        }

        function renderResults() {
            if (!state.results.length) {
                $results.html(`<div class="wmn-barcode-empty">${esc(__("No items found."))}</div>`);
                return;
            }
            $results.html(state.results.map((item, index) => `
                <button type="button" class="wmn-barcode-result" data-index="${index}">
                    <span style="min-width:0"><strong>${esc(item.item_name || item.item_code)}</strong><small>${esc(item.item_code)}${item.barcodes?.length ? ` · ${item.barcodes.length} ${esc(__("barcode(s)"))}` : ""}</small></span>
                    <span style="font-size:20px;color:var(--primary,#2490ef)">+</span>
                </button>`).join(""));
        }

        let searchTimer = null;
        async function search() {
            const query = String($search.val() || "").trim();
            const profile = String($profile.val() || "").trim();
            if (!query || !profile) {
                state.results = [];
                $results.html(`<div class="wmn-barcode-empty">${esc(__("Search for items to add labels."))}</div>`);
                return;
            }
            $results.html(`<div class="wmn-barcode-empty">${esc(__("Searching..."))}</div>`);
            try {
                state.results = await searchWithFallback(query, profile) || [];
                renderResults();
            } catch (error) {
                console.error("WMN Barcode Printer search failed", error);
                state.results = [];
                $results.html(`<div class="wmn-barcode-empty">${esc(error?.message || String(error))}</div>`);
            }
        }

        function addItem(item) {
            const existing = state.items.find((row) => row.item_code === item.item_code);
            if (existing) {
                existing.qty = Math.max(1, Number(existing.qty || 1)) + 1;
            } else {
                const first = (item.barcodes || []).find((bc) => bc?.barcode);
                state.items.push(Object.assign({}, item, {
                    kind: "item",
                    qty: 1,
                    selected_barcode: first?.barcode || "",
                    selected_barcode_type: first?.barcode_type || "",
                }));
            }
            renderSelected();
            const target = existing || state.items[state.items.length - 1];
            if (target?.selected_barcode) {
                resolveSelectedBarcode(target).catch((error) => console.warn("WMN Barcode Printer UOM price resolve failed", error));
            }
        }

        async function resolveSelectedBarcode(item) {
            if (!item) return;
            if (item.kind === "manual") { renderPreview(); return; }
            const lookupValue = barcodeValue(item);
            const profile = String($profile.val() || "").trim();
            if (!lookupValue || !profile) { renderPreview(); return; }
            const resolved = await resolveWithFallback(lookupValue, profile);
            if (!resolved) return;
            item.rate = Number(resolved.rate ?? resolved.price_list_rate ?? item.rate ?? 0) || 0;
            item.currency = resolved.currency || item.currency || "";
            item.uom = resolved.uom || item.uom || "";
            renderPreview();
        }

        function openManualBarcodeDialog() {
            const currentCurrency = context?.settings?.currency || context?.currency || frappe.defaults?.get_default?.("currency") || "";
            const manualDialog = new frappe.ui.Dialog({
                title: __("Add Manual Barcode"),
                fields: [
                    { fieldname: "barcode", fieldtype: "Data", label: __("Barcode Number"), reqd: 1 },
                    { fieldname: "qty", fieldtype: "Int", label: __("Quantity"), default: 1, reqd: 1 },
                    { fieldname: "barcode_format", fieldtype: "Select", label: __("Barcode Type"), options: [__("Frappe (Auto)"), "CODE128", "CODE39", "EAN13", "EAN8", "UPC-A", "ITF"].join("\n"), default: __("Frappe (Auto)") },
                    { fieldname: "label_text", fieldtype: "Data", label: __("Label Text") },
                    { fieldname: "price", fieldtype: "Float", label: __("Price") },
                ],
                primary_action_label: __("Add Barcode"),
                primary_action(values) {
                    const barcode = String(values?.barcode || "").trim();
                    if (!/^\d+$/.test(barcode)) {
                        frappe.msgprint(__("Manual barcode must contain numbers only."));
                        return;
                    }
                    const selectedLabel = String(values?.barcode_format || __("Frappe (Auto)"));
                    const selectedType = selectedLabel === __("Frappe (Auto)")
                        ? FRAPPE_AUTO
                        : (selectedLabel === "UPC-A" ? "UPC" : selectedLabel);
                    const rawPrice = String(manualDialog.get_field("price")?.$input?.val?.() ?? "").trim();
                    const manualItem = {
                        kind: "manual",
                        manual_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        item_code: "",
                        item_name: "",
                        label_text: String(values?.label_text || "").trim(),
                        selected_barcode: barcode,
                        selected_barcode_type: selectedType,
                        qty: Math.max(1, Number(values?.qty || 1)),
                        rate: Number(values?.price || 0),
                        has_manual_price: rawPrice !== "",
                        currency: currentCurrency,
                        barcodes: [],
                    };
                    try {
                        validatePrintableItem(manualItem, { format: selectedType, dims: dimensions($root), showPrice: true });
                    } catch (error) {
                        frappe.msgprint(error?.message || __("Invalid barcode."));
                        return;
                    }
                    state.items.push(manualItem);
                    renderSelected();
                    manualDialog.hide();
                },
            });
            manualDialog.show();
            manualDialog.get_field("barcode")?.$input?.trigger("focus");
            return manualDialog;
        }

        function printLabels() {
            if (!state.items.length) {
                frappe.show_alert({ message: __("Select at least one barcode to print."), indicator: "orange" });
                return;
            }
            const opts = options();
            try {
                for (const item of state.items) validatePrintableItem(item, opts);
            } catch (error) {
                frappe.msgprint(error?.message || __("A selected barcode cannot be printed."));
                return;
            }
            const labels = [];
            for (const item of state.items) {
                const qty = Math.max(1, Number(item.qty || 1));
                for (let i = 0; i < qty; i++) labels.push(labelHtml(item, opts));
            }
            const iframe = document.createElement("iframe");
            iframe.style.position = "fixed";
            iframe.style.width = "0";
            iframe.style.height = "0";
            iframe.style.border = "0";
            iframe.style.right = "0";
            iframe.style.bottom = "0";
            document.body.appendChild(iframe);
            const doc = iframe.contentDocument;
            doc.open();
            doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(__("Barcode Labels"))}</title><style>@page{size:${opts.dims.width}mm ${opts.dims.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}.wmn-label-preview{width:${opts.dims.width}mm!important;height:${opts.dims.height}mm!important;padding:1.5mm;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center;page-break-after:always;font-family:Arial,sans-serif}.wmn-label-preview:last-child{page-break-after:auto}.name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;font-weight:800}.wmn-label-preview svg{max-width:95%;height:auto}.price{font-size:10px;font-weight:900}</style></head><body>${labels.join("")}</body></html>`);
            doc.close();
            setTimeout(() => {
                try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
                finally { setTimeout(() => iframe.remove(), 1200); }
            }, 150);
        }

        $search.on("input.wmnBarcodePrinter", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(search, 220);
        });
        $search.on("keydown.wmnBarcodePrinter", (event) => {
            if (event.key === "Enter") { event.preventDefault(); clearTimeout(searchTimer); search(); }
        });
        $profile.on("change.wmnBarcodePrinter", search);
        $results.on("click.wmnBarcodePrinter", ".wmn-barcode-result", (event) => {
            const index = Number($(event.currentTarget).attr("data-index"));
            if (state.results[index]) addItem(state.results[index]);
        });
        $selected.on("change.wmnBarcodePrinter", ".wmn-barcode-row-code", (event) => {
            const index = Number($(event.currentTarget).closest(".wmn-barcode-row").attr("data-index"));
            if (!state.items[index]) return;
            state.items[index].selected_barcode = String($(event.currentTarget).val() || "");
            state.items[index].selected_barcode_type = selectedBarcodeMeta(state.items[index])?.barcode_type || "";
            resolveSelectedBarcode(state.items[index]).catch((error) => {
                console.warn("WMN Barcode Printer barcode resolve failed", error);
                renderPreview();
            });
        });
        $selected.on("input.wmnBarcodePrinter change.wmnBarcodePrinter", ".wmn-barcode-row-manual-code", (event) => {
            const index = Number($(event.currentTarget).closest(".wmn-barcode-row").attr("data-index"));
            if (!state.items[index] || state.items[index].kind !== "manual") return;
            const numericValue = String($(event.currentTarget).val() || "").replace(/\D+/g, "");
            if ($(event.currentTarget).val() !== numericValue) $(event.currentTarget).val(numericValue);
            state.items[index].selected_barcode = numericValue;
            renderPreview();
        });
        $selected.on("change.wmnBarcodePrinter input.wmnBarcodePrinter", ".wmn-barcode-row-qty", (event) => {
            const index = Number($(event.currentTarget).closest(".wmn-barcode-row").attr("data-index"));
            if (state.items[index]) state.items[index].qty = Math.max(1, Number($(event.currentTarget).val()) || 1);
            renderPreview();
        });
        $selected.on("click.wmnBarcodePrinter", ".wmn-barcode-remove", (event) => {
            const index = Number($(event.currentTarget).closest(".wmn-barcode-row").attr("data-index"));
            state.items.splice(index, 1);
            renderSelected();
        });
        $root.on("change.wmnBarcodePrinter", ".wmn-barcode-format,.wmn-barcode-size,.wmn-barcode-show-price,.wmn-barcode-width,.wmn-barcode-height", (event) => {
            if ($(event.currentTarget).hasClass("wmn-barcode-size")) {
                $root.find(".wmn-barcode-custom").toggleClass("show", String($(event.currentTarget).val()) === "custom");
            }
            renderPreview();
        });
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-manual", openManualBarcodeDialog);
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-clear", () => { state.items = []; renderSelected(); });
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-print", printLabels);
        $search.trigger("focus");

        wrapper.__wmnBarcodePrinterCleanup = () => {
            clearTimeout(searchTimer);
            $search.off(".wmnBarcodePrinter");
            $profile.off(".wmnBarcodePrinter");
            $results.off(".wmnBarcodePrinter");
            $selected.off(".wmnBarcodePrinter");
            $root.off(".wmnBarcodePrinter");
        };
    }

    async function openDialog() {
        const dialog = new frappe.ui.Dialog({
            title: __("Barcode Printer"),
            size: "large",
            fields: [{ fieldname: "barcode_printer_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        dialog.fields_dict.barcode_printer_html.$wrapper.html('<div class="layout-main-section"></div>');
        dialog.$wrapper.find(".modal-dialog").css({ width: "min(1280px, 97vw)", maxWidth: "none" });
        dialog.$wrapper.find(".modal-body").css({ padding: "0", maxHeight: "88vh", overflow: "auto" });
        dialog.show();
        await mount(dialog.fields_dict.barcode_printer_html.$wrapper.get(0));
        dialog.$wrapper.one("hidden.bs.modal.wmnBarcodePrinter", () => {
            dialog.fields_dict.barcode_printer_html.$wrapper.get(0).__wmnBarcodePrinterCleanup?.();
        });
        return dialog;
    }

    ns.BarcodePrinting.Common = { mount, openDialog };
})();
