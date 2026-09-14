/* WMN Price Checker UI. Business data comes from Online/Offline adapters. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.PriceChecker = ns.PriceChecker || {};

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
            <div class="wmn-price-checker-page">
                <div class="wmn-price-checker-head">
                    <div><strong>${esc(__("Price Checker"))}</strong><div class="text-muted small">${esc(__("Scan an item barcode to display its current POS price and stock."))}</div></div>
                    <select class="form-control wmn-price-checker-profile" aria-label="${esc(__("POS Profile"))}"></select>
                </div>
                <div class="wmn-price-checker-scan-wrap"><input class="wmn-price-checker-scan" autocomplete="off" spellcheck="false" placeholder="${esc(__("Scan barcode or enter item code..."))}"></div>
                <div class="wmn-price-checker-stage"><div class="wmn-price-checker-idle"><div class="icon">▥</div><strong>${esc(__("Ready to scan"))}</strong><div>${esc(__("Keep the barcode field focused and scan an item."))}</div></div></div>
            </div>`;
    }

    function adapter() {
        return isOffline() ? ns.PriceChecker.Offline : ns.PriceChecker.Online;
    }

    async function getContextWithFallback() {
        if (ns.Context.isOffline()) return await ns.PriceChecker.Offline.getContext();
        try {
            return await ns.PriceChecker.Online.getContext();
        } catch (error) {
            if (window.wmnPOSOffline) return await ns.PriceChecker.Offline.getContext();
            throw error;
        }
    }

    async function lookupWithFallback(value, profile) {
        if (ns.Context.isOffline()) return await ns.PriceChecker.Offline.lookup(value, profile);
        try {
            return await ns.PriceChecker.Online.lookup(value, profile);
        } catch (error) {
            if (window.wmnPOSOffline) return await ns.PriceChecker.Offline.lookup(value, profile);
            throw error;
        }
    }

    function displayItem($stage, item) {
        if (!item) {
            $stage.html(`<div class="wmn-price-checker-notfound"><div class="icon">⌕</div><strong>${esc(__("Item not found"))}</strong><div>${esc(__("The scanned barcode is not available for this POS Profile."))}</div></div>`);
            return;
        }
        const qty = Number(item.actual_qty || 0);
        const tracksAvailability = Number(item.is_stock_item || 0) || Number(item.is_bundle || 0);
        const inStock = !tracksAvailability || qty > 0;
        const image = item.image ? `<img src="${esc(item.image)}" alt="">` : `<div class="placeholder">▣</div>`;
        const rate = format_currency(Number(item.rate || 0), item.currency || undefined);
        $stage.html(`
            <div class="wmn-price-checker-card">
                <div class="wmn-price-checker-image">${image}</div>
                <div>
                    ${item.item_group ? `<span class="wmn-price-checker-group">${esc(item.item_group)}</span>` : ""}
                    <div class="wmn-price-checker-name">${esc(item.item_name || item.item_code)}</div>
                    <div class="wmn-price-checker-meta">${esc(item.item_code || "")}${item.brand ? ` · ${esc(item.brand)}` : ""}${item.barcode ? ` · ${esc(item.barcode)}` : ""}</div>
                    ${item.description ? `<div class="wmn-price-checker-meta wmn-price-checker-description">${esc(item.description)}</div>` : ""}
                    <div class="wmn-price-checker-price">${esc(rate)}<span class="wmn-price-checker-uom">/ ${esc(item.uom || item.stock_uom || "")}</span></div>
                    ${tracksAvailability ? `<div class="wmn-price-checker-stock ${inStock ? "in" : "out"}">${esc(inStock ? __("In Stock") : __("Out of Stock"))}${inStock ? ` · ${esc(qty)} ${esc(item.stock_uom || item.uom || "")}` : ""}</div>` : ""}
                    <div class="wmn-price-checker-source">${esc(item.warehouse || "")}${item.source ? ` · ${esc(item.source === "offline" ? __("Offline data") : __("Online data"))}` : ""}</div>
                </div>
            </div>`);
    }

    async function mount(wrapper) {
        ensureStyles();
        const $root = $(wrapper).find(".layout-main-section");
        $root.html(shell());
        const $profile = $root.find(".wmn-price-checker-profile");
        const $input = $root.find(".wmn-price-checker-scan");
        const $stage = $root.find(".wmn-price-checker-stage");

        const context = await getContextWithFallback();
        const profiles = context?.pos_profiles || [];
        $profile.html(profiles.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join(""));
        if (context?.default_pos_profile) $profile.val(context.default_pos_profile);
        if (!profiles.length) $profile.html(`<option value="">${esc(__("No POS Profile available"))}</option>`);

        let running = false;
        async function lookup() {
            const value = String($input.val() || "").trim();
            const profile = String($profile.val() || "").trim();
            if (!value || !profile || running) return;
            running = true;
            $stage.html(`<div class="wmn-price-checker-idle"><div class="icon">…</div>${esc(__("Looking up item..."))}</div>`);
            try {
                displayItem($stage, await lookupWithFallback(value, profile));
            } catch (error) {
                console.error("WMN Price Checker lookup failed", error);
                $stage.html(`<div class="wmn-price-checker-notfound"><div class="icon">!</div><strong>${esc(__("Unable to check price"))}</strong><div>${esc(error?.message || String(error))}</div></div>`);
            } finally {
                running = false;
                $input.val("").trigger("focus");
            }
        }

        $input.on("keydown.wmnPriceChecker", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                lookup();
            }
        });
        $root.on("click.wmnPriceChecker", () => $input.trigger("focus"));
        $input.trigger("focus");
        wrapper.__wmnPriceCheckerCleanup = () => {
            $input.off(".wmnPriceChecker");
            $root.off(".wmnPriceChecker");
        };
    }

    async function openDialog() {
        const dialog = new frappe.ui.Dialog({
            title: __("Price Checker"),
            size: "large",
            fields: [{ fieldname: "price_checker_html", fieldtype: "HTML" }],
            secondary_action_label: __("Close"),
            secondary_action: () => dialog.hide(),
        });
        dialog.fields_dict.price_checker_html.$wrapper.html('<div class="layout-main-section"></div>');
        dialog.$wrapper.find(".modal-dialog").css({ width: "min(1120px, 96vw)", maxWidth: "none" });
        dialog.$wrapper.find(".modal-body").css({ padding: "0", maxHeight: "82vh", overflow: "auto" });
        dialog.show();
        await mount(dialog.fields_dict.price_checker_html.$wrapper.get(0));
        dialog.$wrapper.one("hidden.bs.modal.wmnPriceChecker", () => {
            dialog.fields_dict.price_checker_html.$wrapper.get(0).__wmnPriceCheckerCleanup?.();
        });
        return dialog;
    }

    ns.PriceChecker.Common = { mount, openDialog, isOffline: ns.Context.isOffline };
})();
