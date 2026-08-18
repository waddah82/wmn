/* Shared WMN POS dialog styling and keyboard shortcuts. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.UI.Dialogs = ns.UI.Dialogs || {};

    const STYLE_ID = "wmn-pos-dialog-style";
    let initialized = false;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .modal-content {
                border: 1px solid var(--border-color, #dfe3e8);
                border-radius: 14px;
                background: var(--fg-color, #fff);
                color: var(--text-color, #1f2937);
                box-shadow: 0 18px 50px rgba(15, 23, 42, .18);
                overflow: hidden;
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .modal-header {
                min-height: 52px;
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-color, #e5e7eb);
                background: var(--subtle-fg, #f8fafc);
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .modal-title {
                font-size: 16px;
                font-weight: 700;
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .modal-body {
                padding: 16px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .modal-footer {
                padding: 10px 16px;
                border-top: 1px solid var(--border-color, #e5e7eb);
                gap: 8px;
                background: var(--subtle-fg, #f8fafc);
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .btn {
                min-height: 36px;
                border-radius: 8px;
                font-weight: 600;
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .form-control,
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .input-with-feedback {
                min-height: 38px;
                border-radius: 8px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-app-dialog .control-label {
                font-weight: 600;
            }
            body.wmn-mamsek-pos-route .wmn-pos-supervisor-dialog .modal-dialog {
                max-width: 440px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-supervisor-dialog [data-fieldname="pin"] input {
                min-height: 42px;
                font-size: 18px;
                font-weight: 700;
                letter-spacing: .18em;
                text-align: center;
            }
            body.wmn-mamsek-pos-route .wmn-pos-cash-dialog .modal-dialog {
                max-width: 560px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-cash-dialog .wmn-cash-movement-summary {
                border-radius: 10px !important;
                border-color: var(--border-color, #e5e7eb) !important;
                background: var(--subtle-fg, #f8fafc) !important;
            }
            body.wmn-mamsek-pos-route .wmn-pos-discount-breakdown,
            body.wmn-mamsek-pos-route .wmn-summary-discount-breakdown {
                display: grid;
                gap: 6px;
                width: 100%;
                margin: 8px 0;
                padding: 10px 12px;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 10px;
                background: var(--subtle-fg, #f8fafc);
            }
            body.wmn-mamsek-pos-route .wmn-pos-discount-row,
            body.wmn-mamsek-pos-route .wmn-summary-discount-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                font-size: 12px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-discount-row strong,
            body.wmn-mamsek-pos-route .wmn-summary-discount-row strong {
                font-size: 13px;
            }
            body.wmn-mamsek-pos-route .wmn-pos-discount-row.is-total,
            body.wmn-mamsek-pos-route .wmn-summary-discount-row.is-total {
                margin-top: 2px;
                padding-top: 6px;
                border-top: 1px dashed var(--border-color, #d1d5db);
                font-weight: 700;
            }
        `;
        document.head.appendChild(style);
    }

    function decorate(dialog, className) {
        if (!dialog || !dialog.$wrapper) return dialog;
        dialog.$wrapper.addClass("wmn-pos-app-dialog");
        if (className) dialog.$wrapper.addClass(className);
        return dialog;
    }

    function releaseFocusInside(wrapper) {
        if (!wrapper) return;
        const active = document.activeElement;
        if (active && active !== document.body && wrapper.contains(active) && typeof active.blur === "function") {
            active.blur();
        }
    }

    function setupModalFocusLifecycle() {
        $(document).on("show.bs.modal.wmnPosDialogFocus", ".wmn-pos-app-dialog", function () {
            const active = document.activeElement;
            if (active && active !== document.body && !this.contains(active)) {
                this.__wmn_focus_return = active;
            } else {
                this.__wmn_focus_return = null;
            }
        });

        $(document).on("hide.bs.modal.wmnPosDialogFocus", ".wmn-pos-app-dialog", function () {
            releaseFocusInside(this);
        });

        $(document).on("hidden.bs.modal.wmnPosDialogFocus", ".wmn-pos-app-dialog", function () {
            const target = this.__wmn_focus_return;
            this.__wmn_focus_return = null;
            if (!target || !document.contains(target) || typeof target.focus !== "function") return;
            if ($(target).closest(".modal[aria-hidden=\"true\"], .modal:not(:visible)").length) return;
            window.setTimeout(() => {
                try {
                    target.focus({ preventScroll: true });
                } catch (e) {
                    try { target.focus(); } catch (ignore) {}
                }
            }, 0);
        });
    }

    function closeTopDialog() {
        const visible = $(".wmn-pos-app-dialog:visible").toArray();
        if (visible.length) {
            const wrapper = visible[visible.length - 1];
            const dialog = $(wrapper).data("bs.modal") || null;
            const $close = $(wrapper).find(".modal-header .btn-modal-close, .modal-header .close").first();
            if ($close.length) {
                $close.trigger("click");
                return true;
            }
            $(wrapper).modal?.("hide");
            if (dialog?.hide) dialog.hide();
            return true;
        }

        const genericVisible = $("body.wmn-mamsek-pos-route .modal.show:visible, body.wmn-mamsek-pos-route .modal.in:visible").toArray();
        if (genericVisible.length) {
            const wrapper = genericVisible[genericVisible.length - 1];
            const $close = $(wrapper).find(".modal-header .btn-modal-close, .modal-header .close").first();
            if ($close.length) {
                $close.trigger("click");
                return true;
            }
            $(wrapper).modal?.("hide");
            return true;
        }

        const itemDetails = window.cur_pos?.item_details;
        if (itemDetails?.$component?.is(":visible")) {
            itemDetails.toggle_item_details_section?.(null);
            return true;
        }
        return false;
    }

    function setup() {
        ensureStyles();
        if (initialized) return;
        initialized = true;
        setupModalFocusLifecycle();
        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (closeTopDialog()) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);
    }

    ns.UI.Dialogs = { setup, decorate, closeTopDialog };
})();
