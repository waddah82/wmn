/* Shared WMN POS helpers only. No feature or class-specific business logic belongs here. */
function wmn_user_lang() {
            return String(
                (frappe.boot && frappe.boot.lang) ||
                (frappe.boot && frappe.boot.user && frappe.boot.user.language) ||
                (frappe.session && frappe.session.user_language) ||
                document.documentElement.lang ||
                document.body.getAttribute("lang") ||
                "en"
            ).toLowerCase();
        }

        function wmn_is_arabic() {
            const lang = wmn_user_lang();
            return lang.startsWith("ar") || document.documentElement.dir === "rtl" || document.body.dir === "rtl";
        }

        function wmn_t(en, ar) {
            const text = wmn_is_arabic() ? (ar || en) : en;
            return __(text);
        }

        function wmn_msg(en, ar, values) {
            const text = wmn_t(en, ar);
            if (values && Array.isArray(values)) {
                return __(text, values);
            }
            return text;
        }


        window.getAvailableBatchesForItem = function(batches, itemCode, warehouse = "") {
            const today = frappe.datetime.get_today();
            return (batches || [])
                .filter(b => {
                    if (String(b.item_code || "") !== String(itemCode || "")) return false;
                    if (cint(b.disabled || 0)) return false;
                    if (warehouse && b.warehouse && String(b.warehouse) !== String(warehouse)) return false;
                    if (flt(b.actual_qty || 0) <= 0) return false;
                    if (b.expiry_date && String(b.expiry_date).slice(0, 10) < today) return false;
                    return true;
                })
                .sort((a, b) => {
                    const ea = a.expiry_date || "9999-12-31";
                    const eb = b.expiry_date || "9999-12-31";
                    return String(ea).localeCompare(String(eb));
                });
        };

        window.showBatchSelectionDialog = async function(item, warehouse = "") {
            const batches = !window.wmnPOSOffline?.getAllByIndex
                ? []
                : await window.wmnPOSOffline.getAllByIndex(
                    window.wmnPOSOffline.STORES.batches,
                    "item_code",
                    item.item_code
                );

            const rows = window.getAvailableBatchesForItem(batches, item.item_code, warehouse);

            if (!rows.length) {
                return null;
            }

            return await new Promise((resolve) => {
                const dialog = new frappe.ui.Dialog({
                    title: __("Select Batch No and Quantity"),
                    size: "large",
                    fields: [
                        {
                            fieldtype: "HTML",
                            fieldname: "batch_html",
                            options: `
                                <div class="wmn-batch-select-dialog">
                                    <div style="margin-bottom:10px;color:#6b7280;">
                                        ${frappe.utils.escape_html(item.item_name || item.item_code || "")}
                                    </div>
                                    <div style="max-height:55vh;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;">
                                        <table class="table table-bordered table-hover" style="margin:0;">
                                            <thead style="position:sticky;top:0;background:#f8fafc;z-index:1;">
                                                <tr>
                                                    <th>${__("Batch No")}</th>
                                                    <th>${__("Warehouse")}</th>
                                                    <th>${__("Available Qty")}</th>
                                                    <th>${__("Expiry Date")}</th>
                                                    <th style="width:130px;">${__("Qty")}</th>
                                                    <th style="width:110px;">${__("Action")}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                ${rows.map((b, idx) => {
                                                    const availableQty = flt(b.actual_qty || 0);
                                                    const defaultQty = flt(item.qty || 1) || 1;

                                                    return `
                                                        <tr>
                                                            <td style="font-weight:700;">${frappe.utils.escape_html(b.batch_no || "")}</td>
                                                            <td>${frappe.utils.escape_html(b.warehouse || "")}</td>
                                                            <td>${availableQty}</td>
                                                            <td>${frappe.utils.escape_html(b.expiry_date || "")}</td>
                                                            <td>
                                                                <input type="number"
                                                                    class="form-control input-xs wmn-batch-qty"
                                                                    data-idx="${idx}"
                                                                    min="0.001"
                                                                    step="0.001"
                                                                    value="${defaultQty}">
                                                            </td>
                                                            <td>
                                                                <button type="button"
                                                                    class="btn btn-xs btn-primary wmn-select-batch"
                                                                    data-idx="${idx}">
                                                                    ${__("Select")}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    `;
                                                }).join("")}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            `
                        }
                    ],
                    secondary_action_label: __("Cancel"),
                    secondary_action: () => {
                        dialog.hide();
                        resolve(null);
                    }
                });

                dialog.$wrapper.addClass("wmn-pos-app-dialog wmn-pos-batch-legacy-dialog");
                dialog.show();

                dialog.$wrapper.on("click", ".wmn-select-batch", function () {
                    const idx = cint($(this).attr("data-idx"));
                    const selected = rows[idx] || null;

                    if (!selected) {
                        dialog.hide();
                        resolve(null);
                        return;
                    }

                    const qtyInput = dialog.$wrapper.find(`.wmn-batch-qty[data-idx="${idx}"]`).val();
                    const qty = flt(qtyInput || 0);
                    const availableQty = flt(selected.actual_qty || 0);

                    if (qty <= 0) {
                        frappe.show_alert({
                            message: __("Quantity must be greater than zero"),
                            indicator: "orange"
                        });
                        return;
                    }

                    const allowNegativeStock = cint(window.cur_pos?.allow_negative_stock || 0) === 1 || cint(item?.allow_negative_stock || selected?.allow_negative_stock || 0) === 1;
                    if (!allowNegativeStock && availableQty >= 0 && qty > availableQty) {
                        frappe.show_alert({
                            message: __("Quantity cannot exceed available batch quantity"),
                            indicator: "orange"
                        });
                        return;
                    }

                    selected.__selected_qty = qty;
                    dialog.hide();
                    resolve(selected);
                });
            });
        };


        function wmn_money(value, currency) {
            const amount = flt(value || 0).toFixed(2);
            return amount + " " + (currency || "");
        }

        function wmn_escape_html(value) {
            return frappe.utils.escape_html(value == null ? "" : String(value));
        }


        function wmn_base64_utf8(value) {
            try {
                return btoa(unescape(encodeURIComponent(String(value || ""))));
            } catch (e) {
                try {
                    return btoa(String(value || ""));
                } catch (_e) {
                    return "";
                }
            }
        }


function wmn_is_mobile_pos_device() {
    return (
        window.innerWidth <= 768 ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );
}

/* Shared async compatibility helper used by multiple ERPNext overrides. */
(function () {
    "use strict";
    const ns = window.WMN_POS = window.WMN_POS || {};
    ns.Common = ns.Common || {};

    ns.Common.asFrappeCallLike = function asFrappeCallLike(promise) {
        const p = Promise.resolve(promise);

        return {
            then(onFulfilled, onRejected) {
                return ns.Common.asFrappeCallLike(p.then(onFulfilled, onRejected));
            },
            catch(onRejected) {
                return ns.Common.asFrappeCallLike(p.catch(onRejected));
            },
            finally(onFinally) {
                return ns.Common.asFrappeCallLike(p.finally(onFinally));
            },
            always(callback) {
                p.then(
                    (value) => {
                        if (callback) callback(value);
                        return value;
                    },
                    (error) => {
                        if (callback) callback(error);
                        throw error;
                    }
                );
                return this;
            },
            done(callback) {
                p.then((value) => {
                    if (callback) callback(value);
                });
                return this;
            },
            fail(callback) {
                p.catch((error) => {
                    if (callback) callback(error);
                });
                return this;
            },
            promise() {
                return p;
            },
        };
    };
})();

