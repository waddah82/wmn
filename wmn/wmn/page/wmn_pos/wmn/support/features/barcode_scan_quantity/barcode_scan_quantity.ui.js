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

    function sync(selector) {
        const armed = feature.isArmed(selector);
        const $shell = getSearchShell(selector);
        const $button = selector?.$component?.find?.(".wmn-qty-next-scan")?.first?.();
        $shell?.toggleClass?.("wmn-qty-next-scan-armed", armed);
        $button?.toggleClass?.("is-armed", armed);
        $button?.attr?.("aria-pressed", String(armed));
        $button?.find?.(".wmn-qty-next-scan-label")?.text?.(
            armed ? __("Qty Next Scan: ON") : __("Qty Next Scan")
        );
        $button?.find?.(".wmn-qty-next-scan-badge")?.toggle?.(armed);
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

    function install(selector) {
        ensureStylesheet();
        const $row = getActionRow(selector);
        if (!$row?.length) return;

        if (!$row.find(".wmn-barcode-scan-actions").length) {
            $row.append(`
                <div class="wmn-barcode-scan-actions">
                    <button type="button" class="btn btn-default wmn-camera-scan" title="${__("Scan with Camera")}" aria-label="${__("Scan with Camera")}">
                        <span class="wmn-camera-scan-icon">${frappe.utils.icon("scan-barcode", "sm")}</span>
                        <span class="wmn-camera-scan-label">${__("Camera")}</span>
                    </button>
                    <button type="button" class="btn btn-default wmn-qty-next-scan" aria-pressed="false" title="${__("Quantity dialog for next ordinary barcode scan (F8)")}">
                        <span class="wmn-qty-next-scan-label">${__("Qty Next Scan")}</span>
                        <span class="wmn-qty-next-scan-badge" hidden>QTY</span>
                        <kbd>F8</kbd>
                    </button>
                </div>
            `);
        }

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
                try {
                    const scanner = window.WMN?.Features?.MobileBarcodeScanner;
                    if (scanner?.open) {
                        scanner.open({
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
                    } else {
                        scanner?.openForPOS?.(selector);
                    }
                } catch (error) {
                    frappe.msgprint({
                        title: __("Camera Scanner"),
                        indicator: "red",
                        message: error?.message || String(error),
                    });
                }
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
    }

    window.WMN_POS.Features.BarcodeScanQuantityUI = {
        install,
        sync,
        toggle,
        requestQuantity,
    };
})();
