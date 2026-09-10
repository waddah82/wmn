/* WMN Price Checker UI. Business data comes from Online/Offline adapters. */
(function () {
    "use strict";

    window.WMN_RETAIL_TOOLS = window.WMN_RETAIL_TOOLS || {};
    const ns = window.WMN_RETAIL_TOOLS;
    ns.PriceChecker = ns.PriceChecker || {};

    const STYLE_ID = "wmn-price-checker-style";

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
            .wmn-price-checker-page{min-height:calc(100vh - 150px);display:flex;flex-direction:column;gap:18px;padding:18px;background:var(--bg-color,#f6f8fa)}
            .wmn-price-checker-head{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
            .wmn-price-checker-profile{min-width:220px;max-width:360px}
            .wmn-price-checker-scan-wrap{position:relative;width:min(760px,100%);margin:8px auto 0}
            .wmn-price-checker-scan{width:100%;height:64px;padding:0 22px;border:2px solid var(--border-color,#d8dce2);border-radius:16px;background:var(--card-bg,#fff);font-size:22px;font-weight:700;outline:none;box-shadow:0 8px 24px rgba(15,23,42,.06)}
            .wmn-price-checker-scan:focus{border-color:var(--primary,#2490ef);box-shadow:0 0 0 4px rgba(36,144,239,.12)}
            .wmn-price-checker-stage{flex:1;display:grid;place-items:center;min-height:390px}
            .wmn-price-checker-idle,.wmn-price-checker-notfound{text-align:center;color:var(--text-muted,#687386);font-size:17px}
            .wmn-price-checker-idle .icon,.wmn-price-checker-notfound .icon{font-size:64px;margin-bottom:12px}
            .wmn-price-checker-card{width:min(980px,100%);display:grid;grid-template-columns:minmax(180px,280px) minmax(0,1fr);gap:28px;padding:28px;border:1px solid var(--border-color,#d8dce2);border-radius:20px;background:var(--card-bg,#fff);box-shadow:0 16px 46px rgba(15,23,42,.08)}
            .wmn-price-checker-image{display:grid;place-items:center;min-height:240px;border:1px solid var(--border-color,#e5e7eb);border-radius:16px;background:#fff;overflow:hidden}
            .wmn-price-checker-image img{width:100%;height:100%;max-height:300px;object-fit:contain}
            .wmn-price-checker-image .placeholder{font-size:74px;opacity:.45}
            .wmn-price-checker-group{display:inline-flex;width:max-content;max-width:100%;padding:5px 10px;border-radius:999px;background:rgba(36,144,239,.10);color:var(--primary,#2490ef);font-size:12px;font-weight:800}
            .wmn-price-checker-name{margin:9px 0 5px;font-size:clamp(25px,4vw,40px);font-weight:900;line-height:1.15;color:var(--text-color,#1f2937)}
            .wmn-price-checker-meta{color:var(--text-muted,#687386);font-size:13px;line-height:1.6}
            .wmn-price-checker-price{margin-top:18px;font-size:clamp(36px,6vw,58px);font-weight:900;line-height:1;color:var(--primary,#2490ef)}
            .wmn-price-checker-uom{margin-inline-start:7px;color:var(--text-muted,#687386);font-size:15px;font-weight:600}
            .wmn-price-checker-stock{display:inline-flex;align-items:center;margin-top:18px;padding:7px 12px;border-radius:999px;font-size:13px;font-weight:800}
            .wmn-price-checker-stock.in{background:#ecfdf3;color:#087443}.wmn-price-checker-stock.out{background:#fff1f2;color:#b42318}
            .wmn-price-checker-source{margin-top:12px;color:var(--text-muted,#687386);font-size:11px}
            @media(max-width:720px){.wmn-price-checker-page{padding:10px}.wmn-price-checker-card{grid-template-columns:1fr;padding:16px;gap:16px}.wmn-price-checker-image{min-height:180px}.wmn-price-checker-scan{height:56px;font-size:18px}.wmn-price-checker-profile{width:100%;max-width:none}}
        `;
        document.head.appendChild(style);
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
                    ${item.description ? `<div class="wmn-price-checker-meta" style="margin-top:8px">${esc(item.description)}</div>` : ""}
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
