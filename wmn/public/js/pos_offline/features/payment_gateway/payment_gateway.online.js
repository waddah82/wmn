/* Online payment gateway UI integration. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const Feature = ns.Features.PaymentGateway;

    function modeLabel($mode) {
        const explicit = $mode.attr("data-mode-of-payment") || $mode.data("mode-of-payment") || $mode.data("mode");
        if (explicit) return String(explicit).trim();
        const clone = $mode.clone();
        clone.find("input,button,.cash-shortcuts,.wmn-gateway-action").remove();
        return String(clone.text() || "").replace(/\s+/g, " ").trim();
    }

    async function attach(payment) {
        const service = ns.Services.PaymentGateway.Service;
        const doc = payment?.events?.get_frm?.()?.doc;
        if (!payment?.$payment_modes?.length || !doc) return;
        const mappings = await service.loadConfig(doc.pos_profile, false).catch(() => []);
        if (!mappings.length) return;

        const paymentRows = Array.isArray(doc.payments) ? doc.payments : [];
        payment.$payment_modes.find(".mode-of-payment").each((index, el) => {
            const $mode = $(el);
            const rowMode = String(paymentRows[index]?.mode_of_payment || "").trim();
            const domMode = modeLabel($mode);
            const modeOfPayment = rowMode || domMode;
            const mapping = mappings.find((row) =>
                row.enabled && String(row.mode_of_payment || "").trim() === modeOfPayment
            );
            if (!mapping) return;
            if ($mode.find(".wmn-gateway-action").length) return;

            const $button = $(`<button type="button" class="btn btn-xs btn-default wmn-gateway-action" style="margin-top:6px;width:100%;">${__("Process Electronic Payment")}</button>`);
            $mode.append($button);
            $button.on("click.wmnGateway", async (event) => {
                event.preventDefault(); event.stopPropagation();
                $button.prop("disabled", true);
                try {
                    const result = await service.authorize(doc, modeOfPayment);
                    frappe.show_alert({ message: `${__("Payment approved")}: ${result.reference_number || result.rrn || result.transaction_id || ""}`, indicator: "green" });
                    $button.text(__("Approved"));
                } catch (error) {
                    console.error("WMN electronic payment failed", error);
                    frappe.msgprint({ title: __("Electronic Payment"), indicator: "red", message: error.message || String(error) });
                } finally { $button.prop("disabled", false); }
            });
        });
    }

    Feature.Online = Object.freeze({ attach });
})();
