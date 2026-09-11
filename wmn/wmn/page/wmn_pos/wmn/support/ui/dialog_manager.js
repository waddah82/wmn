/* Shared WMN POS dialog styling and keyboard shortcuts. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.UI.Dialogs = ns.UI.Dialogs || {};

    const STYLE_ID = "wmn-pos-dialog-style";
    let initialized = false;

    function ensureStyles() {
        // Kept for callers; page-owned CSS lives in wmn_pos.css.
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

    function syncDialogOpenState() {
        const hasVisibleDialog = $(".wmn-pos-app-dialog.show:visible, .wmn-pos-app-dialog.in:visible").length > 0;
        document.body.classList.toggle("wmn-pos-dialog-open", hasVisibleDialog);
    }

    function setupModalFocusLifecycle() {
        $(document).on("show.bs.modal.wmnPosDialogFocus", ".wmn-pos-app-dialog", function () {
            document.body.classList.add("wmn-pos-dialog-open");
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
            window.setTimeout(syncDialogOpenState, 0);
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
