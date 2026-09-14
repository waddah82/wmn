/* UI owner for Qty Next Scan and mobile camera scan inside WMN POS ItemSelector. */
(function () {
    "use strict";

    const feature = window.WMN_POS?.Features?.BarcodeScanQuantity;
    if (!feature) throw new Error("WMN BarcodeScanQuantity common owner must load before its UI owner.");

    function ensureStylesheet() {
        window.WMN_POS?.UI?.ensurePageStylesheet?.();
    }

    function getSearchShell(selector) {
        return selector?.$component?.find?.(".wmn-menu-search")?.first?.() || null;
    }

    function getActionRow(selector) {
        return selector?.$component?.find?.(".wmn-category-search-row")?.first?.() || null;
    }

    function iconSvg(paths) {
        return `<svg class="wmn-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    }

    function cameraIcon() {
        try {
            if (frappe?.utils?.icon) return frappe.utils.icon("scan-barcode", "sm");
        } catch (error) {}
        return iconSvg('<path d="M4 7V5a1 1 0 0 1 1-1h2M4 17v2a1 1 0 0 0 1 1h2M20 7V5a1 1 0 0 0-1-1h-2M20 17v2a1 1 0 0 1-1 1h-2"/><rect x="7" y="8" width="10" height="8" rx="1"/>');
    }

    function qtyIcon() {
        return iconSvg('<path d="M8 7h8M8 12h8M8 17h5"/><rect x="3" y="4" width="18" height="16" rx="2"/>');
    }

    function gridIcon() {
        return iconSvg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>');
    }

    function buttonViewIcon() {
        return iconSvg('<rect x="3" y="5" width="18" height="6" rx="1"/><rect x="3" y="13" width="18" height="6" rx="1"/>');
    }

    function sync(selector) {
        const armed = feature.isArmed(selector);
        const $shell = getSearchShell(selector);
        const $button = selector?.$component?.find?.(".wmn-qty-next-scan")?.first?.();
        $shell?.toggleClass?.("wmn-qty-next-scan-armed", armed);
        $button?.toggleClass?.("is-armed", armed);
        $button?.attr?.("aria-pressed", String(armed));
        $button?.attr?.(
            "title",
            armed
                ? __("Qty Next Scan is on (F8)")
                : __("Quantity dialog for next ordinary barcode scan (F8)")
        );
        return armed;
    }

    function toggle(selector) {
        feature.toggle(selector);
        sync(selector);
        if (!window.wmn_is_mobile_pos_device?.()) selector?.search_field?.set_focus?.();
        return feature.isArmed(selector);
    }

    function requestQuantity(selector, item) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            const dialog = new frappe.ui.Dialog({
                title: __("Quantity for {0}", [item?.item_name || item?.item_code || __("Item")]),
                fields: [
                    {
                        fieldname: "qty",
                        fieldtype: "Float",
                        label: __("Quantity"),
                        reqd: 1,
                        default: 1,
                    },
                ],
                primary_action_label: __("Add"),
                primary_action(values) {
                    const qty = Number(values?.qty || 0);
                    if (!Number.isFinite(qty) || qty <= 0) {
                        frappe.show_alert({ message: __("Enter a valid quantity greater than zero."), indicator: "orange" });
                        return;
                    }
                    finish(qty);
                    dialog.hide();
                },
                secondary_action_label: __("Cancel"),
                secondary_action() {
                    finish(null);
                    dialog.hide();
                },
                on_hide() {
                    finish(null);
                },
            });
            dialog.show();
            window.setTimeout(() => {
                const control = dialog.get_field?.("qty");
                control?.set_focus?.();
                control?.$input?.select?.();
            }, 0);
        });
    }

    async function openCamera(selector) {
        try {
            const scanner = window.WMN?.Features?.MobileBarcodeScanner;
            if (scanner?.open) {
                await scanner.open({
                    multiple: false,
                    onScan(text) {
                        if (selector?.wmn_submit_scanned_barcode) {
                            selector.wmn_submit_scanned_barcode(text, {
                                source: "camera",
                                focus: false,
                            });
                        } else {
                            selector.barcode_scanned = true;
                            selector.set_search_value?.(text);
                        }
                    },
                });
                return;
            }
            await scanner?.openForPOS?.(selector);
        } catch (error) {
            frappe.msgprint({
                title: __("Camera Scanner"),
                indicator: "red",
                message: error?.message || String(error),
            });
        }
    }

    function install(selector) {
        ensureStylesheet();
        const $shell = getSearchShell(selector);
        const $row = getActionRow(selector);
        if (!$shell?.length || !$row?.length) return;

        $shell.find(".wmn-search-shortcut").prop("hidden", true);
        if (!$shell.find(".wmn-camera-scan").length) {
            $shell.append(`
                <button type="button" class="wmn-search-icon-btn wmn-camera-scan" title="${__("Scan with Camera")}" aria-label="${__("Scan with Camera")}">
                    <span class="wmn-camera-scan-icon">${cameraIcon()}</span>
                </button>
            `);
        }

        if (!$row.children(".wmn-search-actions").length) {
            $row.append(`
                <div class="wmn-search-actions" role="group" aria-label="${__("Item search actions")}">
                    <button type="button" class="wmn-search-icon-btn wmn-qty-next-scan" aria-pressed="false" title="${__("Quantity dialog for next ordinary barcode scan (F8)")}" aria-label="${__("Qty Next Scan")}">
                        ${qtyIcon()}
                    </button>
                    <button type="button" class="wmn-search-icon-btn wmn-grid-view-btn" title="${__("Grid View")}" aria-label="${__("Grid View")}">
                        ${gridIcon()}
                    </button>
                    <button type="button" class="wmn-search-icon-btn wmn-button-view-btn" title="${__("Button View")}" aria-label="${__("Button View")}">
                        ${buttonViewIcon()}
                    </button>
                </div>
            `);
        }

        selector.$gridBtn = selector.$component.find(".wmn-grid-view-btn");
        selector.$listBtn = selector.$component.find(".wmn-button-view-btn");

        selector.$component
            .off("click.wmnBarcodeScanQty", ".wmn-qty-next-scan")
            .on("click.wmnBarcodeScanQty", ".wmn-qty-next-scan", (event) => {
                event.preventDefault();
                event.stopPropagation();
                toggle(selector);
            });

        selector.$component
            .off("click.wmnCameraScan", ".wmn-camera-scan")
            .on("click.wmnCameraScan", ".wmn-camera-scan", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openCamera(selector);
            });

        selector.$component
            .off("click.wmnSearchView", ".wmn-grid-view-btn, .wmn-button-view-btn")
            .on("click.wmnSearchView", ".wmn-grid-view-btn", (event) => {
                event.preventDefault();
                event.stopPropagation();
                selector.setCardMode?.();
            })
            .on("click.wmnSearchView", ".wmn-button-view-btn", (event) => {
                event.preventDefault();
                event.stopPropagation();
                selector.setButtonMode?.();
            });

        $(document)
            .off("keydown.wmnQtyNextScan")
            .on("keydown.wmnQtyNextScan", (event) => {
                if (event.key !== "F8") return;
                if (!selector?.$component?.is?.(":visible")) return;
                if ($(".modal.show").length) return;
                event.preventDefault();
                event.stopPropagation();
                toggle(selector);
            });

        sync(selector);
        selector.updateActiveButton?.();
        selector.apply_search_row_nav?.();
        selector.sync_offline_nav_actions?.();
    }

    window.WMN_POS.Features.BarcodeScanQuantityUI = {
        install,
        sync,
        toggle,
        requestQuantity,
    };
})();
