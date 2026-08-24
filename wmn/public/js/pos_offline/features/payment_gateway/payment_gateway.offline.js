/* Offline gateway behavior is fail-closed unless a certified provider adapter later declares offline authorization support. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    ns.Features.PaymentGateway.Offline = Object.freeze({
        async attach(payment) {
            const doc = payment?.events?.get_frm?.()?.doc;
            if (!payment?.$payment_modes?.length || !doc) return;
            const rows = await ns.Services.PaymentGateway.Service.loadConfig(doc.pos_profile, false).catch(() => []);
            for (const mapping of rows.filter((row) => row.enabled)) {
                payment.$payment_modes.find(".mode-of-payment").each((_, el) => {
                    const $mode = $(el);
                    const label = String($mode.attr("data-mode-of-payment") || $mode.data("mode-of-payment") || $mode.data("mode") || $mode.clone().find("input,button,.cash-shortcuts").remove().end().text() || "").replace(/\s+/g, " ").trim();
                    if (label !== mapping.mode_of_payment || $mode.find(".wmn-gateway-offline").length) return;
                    $mode.append(`<div class="small text-muted wmn-gateway-offline" style="margin-top:4px;">${__("Electronic authorization unavailable offline")}</div>`);
                });
            }
        },
    });
})();
