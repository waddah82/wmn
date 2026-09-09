/* Item DocType feature: capture native Item Barcode rows using scanner or mobile camera. */
(function () {
    "use strict";

    function normalizeBarcode(value) {
        return String(value || "").trim();
    }

    function getLocalDuplicate(frm, barcode) {
        return (frm.doc.barcodes || []).find((row) => normalizeBarcode(row.barcode) === barcode) || null;
    }

    async function getSavedOwner(barcode) {
        const response = await frappe.db.get_value(
            "Item Barcode",
            { barcode },
            ["parent", "barcode", "barcode_type", "uom"]
        );
        return response?.message || null;
    }

    function renderStatus(dialog, entries) {
        const field = dialog.get_field?.("scan_status");
        if (!field?.$wrapper) return;
        const rows = entries.slice(-8).reverse().map((entry) => {
            const indicator = entry.ok ? "green" : "orange";
            return `<div class="indicator ${indicator}" style="display:block;margin:4px 0">${frappe.utils.escape_html(entry.message)}</div>`;
        }).join("");
        field.$wrapper.html(rows || `<div class="text-muted">${__("Ready to scan barcodes.")}</div>`);
    }

    async function addBarcode(frm, dialog, entries, rawValue) {
        const barcode = normalizeBarcode(rawValue);
        if (!barcode) return false;

        const localDuplicate = getLocalDuplicate(frm, barcode);
        if (localDuplicate) {
            entries.push({ ok: false, message: __("Barcode {0} is already on this Item.", [barcode]) });
            renderStatus(dialog, entries);
            return false;
        }

        const saved = await getSavedOwner(barcode);
        if (saved?.parent && saved.parent !== frm.doc.name) {
            entries.push({ ok: false, message: __("Barcode {0} is already assigned to Item {1}.", [barcode, saved.parent]) });
            renderStatus(dialog, entries);
            return false;
        }
        if (saved?.parent === frm.doc.name) {
            entries.push({ ok: false, message: __("Barcode {0} is already saved on this Item.", [barcode]) });
            renderStatus(dialog, entries);
            return false;
        }

        const barcodeType = dialog.get_value("barcode_type") || "";
        const uom = dialog.get_value("uom") || "";
        frm.add_child("barcodes", {
            barcode,
            barcode_type: barcodeType,
            uom,
        });
        frm.refresh_field("barcodes");
        frm.dirty();

        entries.push({ ok: true, message: __("Added barcode {0}.", [barcode]) });
        renderStatus(dialog, entries);
        return true;
    }

    function openDialog(frm) {
        const entries = [];
        let adding = false;
        const dialog = new frappe.ui.Dialog({
            title: __("Scan Barcodes"),
            fields: [
                {
                    fieldname: "barcode",
                    fieldtype: "Data",
                    label: __("Barcode"),
                    placeholder: __("Scan barcode and press Enter"),
                },
                {
                    fieldtype: "Column Break",
                },
                {
                    fieldname: "camera_scan",
                    fieldtype: "Button",
                    label: __("Scan with Camera"),
                    click() {
                        try {
                            window.WMN?.Features?.MobileBarcodeScanner?.open?.({
                                multiple: false,
                                onScan: async (text) => {
                                    if (adding) return;
                                    adding = true;
                                    try {
                                        await addBarcode(frm, dialog, entries, text);
                                    } finally {
                                        adding = false;
                                        dialog.get_field("barcode")?.set_value?.("");
                                        dialog.get_field("barcode")?.set_focus?.();
                                    }
                                },
                            });
                        } catch (error) {
                            frappe.msgprint({ title: __("Camera Scanner"), indicator: "red", message: error?.message || String(error) });
                        }
                    },
                },
                { fieldtype: "Section Break" },
                {
                    fieldname: "barcode_type",
                    fieldtype: "Select",
                    label: __("Barcode Type"),
                    options: "\nEAN\nUPC-A\nCODE-39\nEAN-13\nEAN-8\nGS1\nGTIN\nGTIN-14\nISBN\nISBN-10\nISBN-13\nISSN\nJAN\nPZN\nUPC",
                    default: "",
                },
                {
                    fieldname: "uom",
                    fieldtype: "Link",
                    label: __("UOM"),
                    options: "UOM",
                },
                { fieldtype: "Section Break" },
                { fieldname: "scan_status", fieldtype: "HTML" },
            ],
            primary_action_label: __("Close"),
            primary_action() {
                dialog.hide();
            },
        });

        dialog.show();
        renderStatus(dialog, entries);

        const barcodeControl = dialog.get_field("barcode");
        const $input = barcodeControl?.$input;
        $input?.off("keydown.wmnItemBarcodeCapture").on("keydown.wmnItemBarcodeCapture", async (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            event.stopPropagation();
            if (adding) return;
            const value = normalizeBarcode($input.val());
            if (!value) return;
            adding = true;
            try {
                const added = await addBarcode(frm, dialog, entries, value);
                if (added) barcodeControl.set_value("");
            } finally {
                adding = false;
                barcodeControl.set_focus?.();
                barcodeControl.$input?.select?.();
            }
        });
        barcodeControl?.set_focus?.();
    }

    frappe.ui.form.on("Item", {
        refresh(frm) {
            if (!frm.doc?.name) return;
            frm.add_custom_button(__("Scan Barcodes"), () => openDialog(frm), __("Actions"));
        },
    });

    window.WMN = window.WMN || {};
    window.WMN.Features = window.WMN.Features || {};
    window.WMN.Features.ItemBarcodeCapture = {
        normalizeBarcode,
        getLocalDuplicate,
        openDialog,
    };
})();
