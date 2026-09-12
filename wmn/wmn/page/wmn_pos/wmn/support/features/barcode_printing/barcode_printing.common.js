/* WMN Barcode Printer. Item data is adapter-owned; label rendering is owned by this feature. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.BarcodePrinting = ns.BarcodePrinting || {};

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
        window.WMN_POS?.UI?.ensurePageStylesheet?.();
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
                            <select class="form-control wmn-barcode-print-mode"><option value="sheet" selected>${esc(__("Sheet / Grid"))}</option><option value="one_per_page">${esc(__("One Label Per Page"))}</option></select>
                            <select class="form-control wmn-barcode-page-size"><option value="A4" selected>A4</option><option value="A5">A5</option><option value="LETTER">Letter</option><option value="CUSTOM">${esc(__("Custom page"))}</option></select>
                            <div class="wmn-barcode-page-custom wide"><input type="number" min="20" max="1000" value="210" class="form-control wmn-barcode-page-width" placeholder="${esc(__("Page width mm"))}"><input type="number" min="20" max="1000" value="297" class="form-control wmn-barcode-page-height" placeholder="${esc(__("Page height mm"))}"></div>
                            <label class="wide wmn-barcode-show-price-label"><input type="checkbox" class="wmn-barcode-show-price" checked> ${esc(__("Show price on label"))}</label>
                            <div class="wmn-barcode-layout-summary wide small text-muted"></div>
                        </div>
                    </div>
                    <div class="wmn-barcode-results"><div class="wmn-barcode-empty">${esc(__("Search for items to add labels."))}</div></div>
                </section>
                <section class="wmn-barcode-right">
                    <div class="wmn-barcode-toolbar"><strong>${esc(__("Barcode Labels"))}</strong><span class="wmn-barcode-count text-muted small"></span><span class="spacer"></span><button class="btn btn-default wmn-barcode-manual">${esc(__("Add Manual Barcode"))}</button><button class="btn btn-default wmn-barcode-range">${esc(__("Add Barcode Range"))}</button><button class="btn btn-default wmn-barcode-paste">${esc(__("Paste Barcode List"))}</button><button class="btn btn-default wmn-barcode-clear">${esc(__("Clear"))}</button><button class="btn btn-primary wmn-barcode-print">${esc(__("Print Labels"))}</button></div>
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
            svg = `<div class="wmn-barcode-error">${esc(__("No printable barcode for this item."))}</div>`;
        } else {
            try { svg = barcodeSvg(value, effectiveBarcodeFormat(item, options.format), options.dims); }
            catch (error) { svg = `<div class="wmn-barcode-error">${esc(error?.message || __("Invalid barcode"))}</div>`; }
        }
        const canShowPrice = options.showPrice && (item.kind !== "manual" || item.has_manual_price);
        const price = canShowPrice ? `<div class="price">${esc(format_currency(Number(item.rate || 0), item.currency || undefined))}</div>` : "";
        return `<div class="wmn-label-preview"><div class="name">${esc(title)}</div>${svg}${price}</div>`;
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

    function dialogBarcodeType(value) {
        const label = String(value || __("Frappe (Auto)"));
        if (label === __("Frappe (Auto)")) return FRAPPE_AUTO;
        return label === "UPC-A" ? "UPC" : label;
    }

    function printMode($root) {
        return String($root.find(".wmn-barcode-print-mode").val() || "sheet");
    }

    function totalLabelCount(items) {
        return (items || []).reduce((total, item) => {
            const qty = Math.max(1, Number(item?.qty || 1));
            if (item?.kind === "batch") return total + ((item.values || []).length * qty);
            return total + qty;
        }, 0);
    }

    function batchPreviewItem(batch, value) {
        return {
            kind: "manual",
            manual_id: batch.batch_id,
            item_code: "",
            item_name: "",
            label_text: batch.label_text || "",
            selected_barcode: String(value || ""),
            selected_barcode_type: batch.selected_barcode_type || FRAPPE_AUTO,
            qty: 1,
            rate: Number(batch.rate || 0),
            has_manual_price: Boolean(batch.has_manual_price),
            currency: batch.currency || "",
            barcodes: [],
        };
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

        function printLayout(total = totalLabelCount(state.items)) {
            const dims = dimensions($root);
            return ns.BarcodePrinting.PrintLayout.calculateLayout({
                mode: printMode($root),
                pageSize: String($root.find(".wmn-barcode-page-size").val() || "A4"),
                customPageWidth: Number($root.find(".wmn-barcode-page-width").val()) || 210,
                customPageHeight: Number($root.find(".wmn-barcode-page-height").val()) || 297,
                labelWidth: dims.width,
                labelHeight: dims.height,
                margin: 5,
                gap: 2,
                totalLabels: total,
            });
        }

        function updateLayoutControls() {
            const mode = printMode($root);
            const isSheet = mode === "sheet";
            const $pageSize = $root.find(".wmn-barcode-page-size");
            $pageSize.prop("disabled", !isSheet);
            const customPage = isSheet && String($pageSize.val() || "A4") === "CUSTOM";
            $root.find(".wmn-barcode-page-custom").toggleClass("show", customPage);
            const layout = printLayout();
            const limit = ns.BarcodePrinting.Range.limitForMode(mode);
            $root.find(".wmn-barcode-layout-summary").html(
                `${esc(__("Labels / Page"))}: <strong>${layout.labelsPerPage}</strong> · ${esc(__("Total Pages"))}: <strong>${layout.totalPages}</strong> · ${esc(__("Print Limit"))}: <strong>${limit}</strong>`
            );
        }

        function renderSelected() {
            if (!state.items.length) {
                $selected.html(`<div class="wmn-barcode-empty">${esc(__("No barcodes selected."))}</div>`);
                $preview.empty();
                $root.find(".wmn-barcode-count").text("");
                updateLayoutControls();
                return;
            }
            $selected.html(state.items.map((item, index) => {
                if (item.kind === "batch") {
                    const count = (item.values || []).length;
                    const title = item.batch_type === "range" ? __("Barcode Range") : __("Pasted Barcode List");
                    const detail = item.batch_type === "range"
                        ? `${item.values?.[0] || ""} → ${item.values?.[count - 1] || ""}`
                        : `${count} ${__("barcode(s)")}`;
                    return `<div class="wmn-barcode-row" data-index="${index}">
                        <div><strong>${esc(item.label_text || title)}</strong><small>${esc(detail)}</small></div>
                        <div class="small text-muted">${count} ${esc(__("unique barcode(s)"))}</div>
                        <input type="number" min="1" max="999" class="form-control wmn-barcode-row-qty" value="${Math.max(1, Number(item.qty || 1))}">
                        <button class="btn btn-default wmn-barcode-remove" title="${esc(__("Remove"))}">×</button>
                    </div>`;
                }
                return `<div class="wmn-barcode-row" data-index="${index}">
                    <div><strong>${esc(item.kind === "manual" ? (item.label_text || __("Manual Barcode")) : (item.item_name || item.item_code))}</strong><small>${esc(item.kind === "manual" ? __("Manual barcode - no Item required") : item.item_code)}</small></div>
                    ${item.kind === "manual"
                        ? `<input inputmode="numeric" pattern="[0-9]*" class="form-control wmn-barcode-row-manual-code" value="${esc(item.selected_barcode || "")}">`
                        : `<select class="form-control wmn-barcode-row-code">${itemBarcodeOptions(item)}</select>`}
                    <input type="number" min="1" max="999" class="form-control wmn-barcode-row-qty" value="${Math.max(1, Number(item.qty || 1))}">
                    <button class="btn btn-default wmn-barcode-remove" title="${esc(__("Remove"))}">×</button>
                </div>`;
            }).join(""));
            state.items.forEach((item, index) => {
                if (item.kind === "manual" || item.kind === "batch") return;
                const $row = $selected.find(`.wmn-barcode-row[data-index="${index}"]`);
                $row.find(".wmn-barcode-row-code").val(item.selected_barcode || "");
            });
            renderPreview();
        }

        function renderPreview() {
            const opts = options();
            const labels = [];
            const total = totalLabelCount(state.items);
            for (const item of state.items) {
                const qty = Math.max(1, Number(item.qty || 1));
                if (item.kind === "batch") {
                    for (const value of (item.values || []).slice(0, 12)) {
                        for (let i = 0; i < Math.min(qty, 3); i++) labels.push(labelHtml(batchPreviewItem(item, value), opts));
                        if (labels.length >= 12) break;
                    }
                } else {
                    for (let i = 0; i < Math.min(qty, 3); i++) labels.push(labelHtml(item, opts));
                }
                if (labels.length >= 12) break;
            }
            $preview.html(labels.slice(0, 12).join(""));
            $preview[0]?.style?.setProperty("--wmn-label-width", `${opts.dims.width}mm`);
            $preview[0]?.style?.setProperty("--wmn-label-height", `${opts.dims.height}mm`);
            $root.find(".wmn-barcode-count").text(`${total} ${__("label(s)")}`);
            updateLayoutControls();
        }

        function renderResults() {
            if (!state.results.length) {
                $results.html(`<div class="wmn-barcode-empty">${esc(__("No items found."))}</div>`);
                return;
            }
            $results.html(state.results.map((item, index) => `
                <button type="button" class="wmn-barcode-result" data-index="${index}">
                    <span class="wmn-barcode-result-main"><strong>${esc(item.item_name || item.item_code)}</strong><small>${esc(item.item_code)}${item.barcodes?.length ? ` · ${item.barcodes.length} ${esc(__("barcode(s)"))}` : ""}</small></span>
                    <span class="wmn-barcode-result-add">+</span>
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
                    const selectedType = dialogBarcodeType(values?.barcode_format);
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

        function currentCurrency() {
            return context?.settings?.currency || context?.currency || frappe.defaults?.get_default?.("currency") || "";
        }

        function addBatch(values, batchType, selectedType, qty, labelText = "") {
            const mode = printMode($root);
            const copies = Math.max(1, Number(qty || 1));
            const existingTotal = totalLabelCount(state.items);
            const newTotal = values.length * copies;
            const limit = ns.BarcodePrinting.Range.limitForMode(mode);
            if (existingTotal + newTotal > limit) {
                throw new Error(__("This print mode allows a maximum of {0} labels.", [String(limit)]));
            }
            const batch = {
                kind: "batch",
                batch_type: batchType,
                batch_id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                values: values.map((value) => String(value)),
                selected_barcode_type: selectedType || FRAPPE_AUTO,
                qty: copies,
                label_text: String(labelText || "").trim(),
                rate: 0,
                has_manual_price: false,
                currency: currentCurrency(),
            };
            const checkOptions = { format: selectedType || FRAPPE_AUTO, dims: dimensions($root), showPrice: false };
            for (const value of batch.values) {
                try { validatePrintableItem(batchPreviewItem(batch, value), checkOptions); }
                catch (error) { throw new Error(`${__("Invalid barcode")}: ${value} — ${error?.message || ""}`); }
            }
            state.items.push(batch);
            renderSelected();
        }

        function openBarcodeRangeDialog() {
            const mode = printMode($root);
            const limit = ns.BarcodePrinting.Range.limitForMode(mode);
            const dialog = new frappe.ui.Dialog({
                title: __("Add Barcode Range"),
                fields: [
                    { fieldname: "from_barcode", fieldtype: "Data", label: __("From Barcode"), reqd: 1 },
                    { fieldname: "to_barcode", fieldtype: "Data", label: __("To Barcode"), reqd: 1 },
                    { fieldname: "qty", fieldtype: "Int", label: __("Copies per Barcode"), default: 1, reqd: 1 },
                    { fieldname: "barcode_format", fieldtype: "Select", label: __("Barcode Type"), options: [__("Frappe (Auto)"), "CODE128", "CODE39", "EAN13", "EAN8", "UPC-A", "ITF"].join("\n"), default: __("Frappe (Auto)") },
                    { fieldname: "label_text", fieldtype: "Data", label: __("Label Text") },
                    { fieldname: "limit_note", fieldtype: "HTML", options: `<div class="text-muted small">${esc(__("Maximum for current print mode"))}: <strong>${limit}</strong></div>` },
                ],
                primary_action_label: __("Add Range"),
                primary_action(values) {
                    try {
                        const copies = Math.max(1, Number(values?.qty || 1));
                        const expanded = ns.BarcodePrinting.Range.expandRange(values?.from_barcode, values?.to_barcode, { mode, copies });
                        addBatch(expanded, "range", dialogBarcodeType(values?.barcode_format), copies, values?.label_text);
                        dialog.hide();
                    } catch (error) {
                        frappe.msgprint(error?.message || String(error));
                    }
                },
            });
            dialog.show();
            dialog.get_field("from_barcode")?.$input?.trigger("focus");
            return dialog;
        }

        function openPasteBarcodeDialog() {
            const mode = printMode($root);
            const limit = ns.BarcodePrinting.Range.limitForMode(mode);
            const dialog = new frappe.ui.Dialog({
                title: __("Paste Barcode List"),
                fields: [
                    { fieldname: "barcodes", fieldtype: "Small Text", label: __("Barcodes"), reqd: 1, description: __("Separate barcodes by a new line, comma, or Arabic comma.") },
                    { fieldname: "qty", fieldtype: "Int", label: __("Copies per Barcode"), default: 1, reqd: 1 },
                    { fieldname: "barcode_format", fieldtype: "Select", label: __("Barcode Type"), options: [__("Frappe (Auto)"), "CODE128", "CODE39", "EAN13", "EAN8", "UPC-A", "ITF"].join("\n"), default: __("Frappe (Auto)") },
                    { fieldname: "label_text", fieldtype: "Data", label: __("Label Text") },
                    { fieldname: "limit_note", fieldtype: "HTML", options: `<div class="text-muted small">${esc(__("Maximum for current print mode"))}: <strong>${limit}</strong></div>` },
                ],
                primary_action_label: __("Add List"),
                primary_action(values) {
                    try {
                        const parsed = ns.BarcodePrinting.Import.parseBarcodeText(values?.barcodes || "");
                        const copies = Math.max(1, Number(values?.qty || 1));
                        ns.BarcodePrinting.Import.validateImportCount(parsed.values.length, mode, copies);
                        addBatch(parsed.values, "paste", dialogBarcodeType(values?.barcode_format), copies, values?.label_text);
                        dialog.hide();
                        if (parsed.duplicates) {
                            frappe.show_alert({ message: __("Ignored {0} duplicate barcode(s).", [String(parsed.duplicates)]), indicator: "blue" });
                        }
                    } catch (error) {
                        frappe.msgprint(error?.message || String(error));
                    }
                },
            });
            dialog.show();
            dialog.get_field("barcodes")?.$input?.trigger("focus");
            return dialog;
        }

        function printLabels() {
            if (!state.items.length) {
                frappe.show_alert({ message: __("Select at least one barcode to print."), indicator: "orange" });
                return;
            }
            const opts = options();
            const mode = printMode($root);
            const total = totalLabelCount(state.items);
            const limit = ns.BarcodePrinting.Range.limitForMode(mode);
            if (total > limit) {
                frappe.msgprint(__("This print mode allows a maximum of {0} labels.", [String(limit)]));
                return;
            }

            const labels = [];
            try {
                for (const item of state.items) {
                    const qty = Math.max(1, Number(item.qty || 1));
                    if (item.kind === "batch") {
                        for (const value of item.values || []) {
                            const source = batchPreviewItem(item, value);
                            validatePrintableItem(source, opts);
                            for (let i = 0; i < qty; i++) labels.push(labelHtml(source, opts));
                        }
                    } else {
                        validatePrintableItem(item, opts);
                        for (let i = 0; i < qty; i++) labels.push(labelHtml(item, opts));
                    }
                }
            } catch (error) {
                frappe.msgprint(error?.message || __("A selected barcode cannot be printed."));
                return;
            }

            const layout = printLayout(labels.length);
            const pages = ns.BarcodePrinting.PrintLayout.paginate(labels, layout.labelsPerPage);
            const pageHtml = pages.map((pageLabels) => `<section class="wmn-print-page">${pageLabels.join("")}</section>`).join("");
            const iframe = document.createElement("iframe");
            iframe.className = "wmn-zero-print-frame";
            document.body.appendChild(iframe);
            const doc = iframe.contentDocument;
            doc.open();
            const stylesheet = window.WMN_POS?.UI?.PAGE_STYLESHEET_HREF || "/assets/wmn/css/wmn_pos.css";
            const printClass = mode === "sheet" ? "wmn-print-sheet" : "wmn-print-single";
            doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(__("Barcode Labels"))}</title><link rel="stylesheet" href="${stylesheet}"></head><body class="wmn-barcode-label-print ${printClass}">${pageHtml}</body></html>`);
            doc.close();
            doc.body.style.setProperty("--wmn-label-width", `${opts.dims.width}mm`);
            doc.body.style.setProperty("--wmn-label-height", `${opts.dims.height}mm`);
            doc.body.style.setProperty("--wmn-print-page-width", `${layout.page.width}mm`);
            doc.body.style.setProperty("--wmn-print-page-height", `${layout.page.height}mm`);
            doc.body.style.setProperty("--wmn-print-columns", String(layout.columns || 1));
            doc.body.style.setProperty("--wmn-print-gap", `${layout.gap}mm`);
            doc.body.style.setProperty("--wmn-print-margin", `${layout.margin}mm`);
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
        $root.on("change.wmnBarcodePrinter", ".wmn-barcode-format,.wmn-barcode-size,.wmn-barcode-show-price,.wmn-barcode-width,.wmn-barcode-height,.wmn-barcode-print-mode,.wmn-barcode-page-size,.wmn-barcode-page-width,.wmn-barcode-page-height", (event) => {
            if ($(event.currentTarget).hasClass("wmn-barcode-size")) {
                $root.find(".wmn-barcode-custom").toggleClass("show", String($(event.currentTarget).val()) === "custom");
            }
            updateLayoutControls();
            renderPreview();
        });
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-manual", openManualBarcodeDialog);
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-range", openBarcodeRangeDialog);
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-paste", openPasteBarcodeDialog);
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-clear", () => { state.items = []; renderSelected(); });
        $root.on("click.wmnBarcodePrinter", ".wmn-barcode-print", printLabels);
        updateLayoutControls();
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
