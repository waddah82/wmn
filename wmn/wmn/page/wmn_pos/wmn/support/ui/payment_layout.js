/* Page-owned POS payment layout for WMN. */
(function () {
    "use strict";

    const STYLE_ID = "wmn-pos-payment-layout-style";
    const ACTIVE_BODY_CLASS = "wmn-mamsek-pos-route";

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            body.${ACTIVE_BODY_CLASS} .payment-container {
                display: flex !important;
                flex-direction: column !important;
                height: 100% !important;
                min-height: 0 !important;
                gap: 12px !important;
            }
            body.${ACTIVE_BODY_CLASS} .payment-split-container {
                display: grid !important;
                grid-template-columns: minmax(260px, 38%) minmax(300px, 1fr) !important;
                gap: 14px !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
            }
            body.${ACTIVE_BODY_CLASS} .payment-container-left,
            body.${ACTIVE_BODY_CLASS} .payment-container-right,
            body.${ACTIVE_BODY_CLASS} .fields-numpad-container {
                min-width: 0 !important;
                min-height: 0 !important;
            }
            body.${ACTIVE_BODY_CLASS} .payment-container-left,
            body.${ACTIVE_BODY_CLASS} .fields-numpad-container {
                display: flex !important;
                flex-direction: column !important;
                gap: 10px !important;
            }
            body.${ACTIVE_BODY_CLASS} .payment-modes {
                display: grid !important;
                gap: 9px !important;
                align-content: start !important;
                overflow-y: auto !important;
                padding-inline-end: 2px !important;
            }
            body.${ACTIVE_BODY_CLASS} .payment-mode-wrapper {
                width: 100% !important;
                margin: 0 !important;
            }
            body.${ACTIVE_BODY_CLASS} .mode-of-payment {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 10px !important;
                width: 100% !important;
                min-height: 54px !important;
                padding: 10px 12px !important;
                border: 1px solid var(--border-color, #d1d8dd) !important;
                border-radius: 10px !important;
                background: var(--card-bg, #fff) !important;
                cursor: pointer !important;
            }
            body.${ACTIVE_BODY_CLASS} .mode-of-payment.border-primary {
                border-color: var(--primary, #2490ef) !important;
                box-shadow: inset 0 0 0 1px var(--primary, #2490ef) !important;
            }
            body.${ACTIVE_BODY_CLASS} .mode-of-payment-control {
                display: none;
                max-width: 150px;
            }
            body.${ACTIVE_BODY_CLASS} .fields-section {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow-y: auto !important;
            }
            body.${ACTIVE_BODY_CLASS} .number-pad {
                flex: 0 0 auto !important;
                width: 100% !important;
            }
            body.${ACTIVE_BODY_CLASS} .numpad-container {
                display: grid !important;
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
                gap: 8px !important;
                width: 100% !important;
            }
            body.${ACTIVE_BODY_CLASS} .numpad-btn {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-height: 48px !important;
                padding: 8px !important;
                border: 1px solid var(--border-color, #d1d8dd) !important;
                border-radius: 10px !important;
                background: var(--control-bg, #f4f5f6) !important;
                color: var(--text-color, #1f2937) !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                user-select: none !important;
            }
            body.${ACTIVE_BODY_CLASS} .numpad-btn:hover {
                border-color: var(--primary, #2490ef) !important;
                background: var(--fg-hover-color, #eef6ff) !important;
            }
            body.${ACTIVE_BODY_CLASS} .totals-section {
                flex: 0 0 auto !important;
            }
            body.${ACTIVE_BODY_CLASS} .submit-order-btn {
                flex: 0 0 auto !important;
            }
            @media (max-width: 900px) {
                body.${ACTIVE_BODY_CLASS} .payment-split-container {
                    grid-template-columns: 1fr !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", ensureStyles, { once: true });
    } else {
        ensureStyles();
    }
})();
