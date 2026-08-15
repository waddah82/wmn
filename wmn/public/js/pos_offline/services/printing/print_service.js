/* Printing transport service. Rendering remains separate from printer/device transport. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};

    const STORAGE_KEY = "wmn_pos_print_transport_v1";
    const METHOD_LABELS = {
        legacy_bridge: "WMN Windows Bridge",
        browser: "Browser Print",
        webusb: "Direct WebUSB / ESC-POS",
        webserial: "Direct WebSerial / ESC-POS",
        qz: "QZ Tray",
    };

    const DEFAULTS = {
        method: "legacy_bridge",
        fallback_method: "none",
        bridge_ws_url: "ws://127.0.0.1:12212/printer",
        cut_paper: 1,
        feed_lines: 3,
        escpos_initialize: 1,
        copies: 1,
        webusb_vendor_id: "",
        webusb_product_id: "",
        webusb_serial_number: "",
        webusb_device_label: "",
        webserial_vendor_id: "",
        webserial_product_id: "",
        webserial_device_label: "",
        webserial_baud_rate: 9600,
        webserial_data_bits: 8,
        webserial_stop_bits: 1,
        webserial_parity: "none",
        webserial_flow_control: "none",
        qz_printer_name: "",
        qz_host: "",
        qz_connector_url: "",
        qz_encoding: "UTF8",
    };

    function readConfig() {
        let stored = {};
        try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) {}
        const legacyUrl = String(localStorage.getItem("whb_websocket_url") || "").trim();
        return Object.assign({}, DEFAULTS, stored, legacyUrl && !stored.bridge_ws_url ? { bridge_ws_url: legacyUrl } : {});
    }

    function saveConfig(config) {
        const normalized = Object.assign({}, DEFAULTS, config || {});
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        if (normalized.bridge_ws_url) localStorage.setItem("whb_websocket_url", normalized.bridge_ws_url);
        return normalized;
    }

    function adapters() {
        const registry = ns.Services.Printing.Adapters || {};
        return {
            legacy_bridge: registry.LegacyBridge,
            browser: registry.Browser,
            webusb: registry.WebUSB,
            webserial: registry.WebSerial,
            qz: registry.QZ,
        };
    }

    function getAdapter(method) {
        return adapters()[String(method || "").trim()] || null;
    }

    async function dispatch(kind, payload, context) {
        const settings = readConfig();
        const method = String(context?.method || settings.method || "legacy_bridge");
        const adapter = getAdapter(method);
        if (!adapter) throw new Error("Unknown WMN print method: " + method);
        if (adapter.isSupported && !adapter.isSupported()) {
            return dispatchFallback(kind, payload, settings, context, new Error(METHOD_LABELS[method] + " is not supported in this browser/context."));
        }
        if (!adapter.capabilities?.[kind] || typeof adapter["send" + kind.charAt(0).toUpperCase() + kind.slice(1)] !== "function") {
            return dispatchFallback(
                kind,
                payload,
                settings,
                context,
                new Error(METHOD_LABELS[method] + " cannot print " + kind.toUpperCase() + ". Direct WebUSB/WebSerial require Silent Print Mode = raw_text.")
            );
        }

        try {
            return await adapter["send" + kind.charAt(0).toUpperCase() + kind.slice(1)](payload, settings, context || {});
        } catch (error) {
            return dispatchFallback(kind, payload, settings, context, error);
        }
    }

    async function dispatchFallback(kind, payload, settings, context, originalError) {
        const fallback = String(settings.fallback_method || "none");
        if (!fallback || fallback === "none" || fallback === String(context?.method || settings.method || "")) {
            throw originalError;
        }
        const adapter = getAdapter(fallback);
        const sender = adapter && adapter["send" + kind.charAt(0).toUpperCase() + kind.slice(1)];
        if (!adapter || !adapter.capabilities?.[kind] || typeof sender !== "function") throw originalError;
        frappe.show_alert?.({
            message: __("Primary printer failed. Using {0}.", [METHOD_LABELS[fallback] || fallback]),
            indicator: "orange",
        }, 5);
        return sender.call(adapter, payload, settings, Object.assign({}, context || {}, { fallback: true }));
    }

    function methodLabel(method) {
        return METHOD_LABELS[String(method || "")] || METHOD_LABELS.legacy_bridge;
    }

    function methodId(value, allowNone) {
        const text = String(value || "").trim();
        if (allowNone && (text === "none" || text === "No fallback")) return "none";
        if (METHOD_LABELS[text]) return text;
        const found = Object.entries(METHOD_LABELS).find(([, label]) => label === text);
        return found ? found[0] : "legacy_bridge";
    }

    function methodOptions(includeNone) {
        const labels = Object.values(METHOD_LABELS);
        if (includeNone) labels.unshift("No fallback");
        return labels.join("\n");
    }

    function setDialogValue(dialog, fieldname, value) {
        if (!dialog.get_field(fieldname)) return;
        dialog.set_value(fieldname, value == null ? "" : value);
    }

    function renderActionButtons(dialog) {
        const field = dialog.get_field("connection_actions");
        if (!field?.$wrapper) return;
        const method = methodId(dialog.get_value("method"), false);
        const $wrap = field.$wrapper.empty();
        const button = (label, handler, primary) => {
            const $btn = $("<button type='button' class='btn btn-sm " + (primary ? "btn-primary" : "btn-default") + "' style='margin-inline-end:6px;margin-bottom:6px'></button>");
            $btn.text(label).on("click", async () => {
                $btn.prop("disabled", true);
                try { await handler(); } catch (e) { frappe.msgprint({ title: __("Printer"), indicator: "red", message: e.message || String(e) }); }
                finally { $btn.prop("disabled", false); }
            });
            $wrap.append($btn);
        };

        if (method === "webusb") {
            button(__("Connect USB Printer"), async () => {
                const cfg = Object.assign(readConfig(), dialog.get_values(true) || {});
                const info = await adapters().webusb.pair(cfg);
                Object.entries(info).forEach(([key, value]) => setDialogValue(dialog, key, value));
                frappe.show_alert({ message: __("USB printer paired."), indicator: "green" });
            }, true);
        } else if (method === "webserial") {
            button(__("Connect Serial Printer"), async () => {
                const info = await adapters().webserial.pair();
                Object.entries(info).forEach(([key, value]) => setDialogValue(dialog, key, value));
                frappe.show_alert({ message: __("Serial printer paired."), indicator: "green" });
            }, true);
        } else if (method === "qz") {
            button(__("Detect QZ Printers"), async () => {
                const cfg = Object.assign(readConfig(), dialog.get_values(true) || {});
                const list = await adapters().qz.printers(cfg);
                if (!list.length) throw new Error("QZ Tray did not return any printers.");
                const field = dialog.get_field("qz_printer_name");
                field.df.options = [""].concat(list).join("\n");
                field.refresh();
                if (!dialog.get_value("qz_printer_name")) setDialogValue(dialog, "qz_printer_name", list[0]);
                frappe.show_alert({ message: __("Found {0} printers.", [list.length]), indicator: "green" });
            }, true);
        }

        button(__("Test Print"), async () => {
            const rawValues = dialog.get_values(true) || {};
            const cfg = saveConfig(Object.assign(readConfig(), rawValues, {
                method: methodId(rawValues.method, false),
                fallback_method: methodId(rawValues.fallback_method, true),
            }));
            const test = "WMN POS\nPrinter Test\n------------------------------\n" + new Date().toLocaleString() + "\n";
            await dispatch("raw", test, { method: cfg.method, printType: "RECEIPT", jobName: "WMN POS Printer Test" });
            frappe.show_alert({ message: __("Test print sent."), indicator: "green" });
        }, false);
    }

    function showSettings() {
        const cfg = readConfig();
        const dialog = new frappe.ui.Dialog({
            title: __("Printer Settings"),
            size: "large",
            fields: [
                { fieldname: "method", label: __("Printing Method"), fieldtype: "Select", reqd: 1, options: methodOptions(false), default: methodLabel(cfg.method) },
                { fieldname: "fallback_method", label: __("Fallback Method"), fieldtype: "Select", options: methodOptions(true), default: cfg.fallback_method === "none" ? "No fallback" : methodLabel(cfg.fallback_method) },
                { fieldtype: "Section Break", label: __("ESC/POS Receipt") },
                { fieldname: "cut_paper", label: __("Cut Paper"), fieldtype: "Check", default: cfg.cut_paper },
                { fieldname: "feed_lines", label: __("Feed Lines"), fieldtype: "Int", default: cfg.feed_lines },
                { fieldname: "escpos_initialize", label: __("Initialize Printer"), fieldtype: "Check", default: cfg.escpos_initialize },
                { fieldtype: "Column Break" },
                { fieldname: "copies", label: __("Copies"), fieldtype: "Int", default: cfg.copies },

                { fieldtype: "Section Break", label: __("WMN Windows Bridge"), depends_on: "eval:doc.method=='WMN Windows Bridge'" },
                { fieldname: "bridge_ws_url", label: __("Printer WebSocket URL"), fieldtype: "Data", default: cfg.bridge_ws_url, depends_on: "eval:doc.method=='WMN Windows Bridge'" },

                { fieldtype: "Section Break", label: __("Direct WebUSB / ESC-POS"), depends_on: "eval:doc.method=='Direct WebUSB / ESC-POS'" },
                { fieldname: "webusb_vendor_id", label: __("USB Vendor ID"), fieldtype: "Data", default: cfg.webusb_vendor_id, depends_on: "eval:doc.method=='Direct WebUSB / ESC-POS'", description: __("Optional. Example: 0x04b8. If empty, the browser will request USB Printer-class devices.") },
                { fieldname: "webusb_product_id", label: __("USB Product ID"), fieldtype: "Data", default: cfg.webusb_product_id, depends_on: "eval:doc.method=='Direct WebUSB / ESC-POS'" },
                { fieldname: "webusb_serial_number", label: __("USB Serial Number"), fieldtype: "Data", read_only: 1, default: cfg.webusb_serial_number, depends_on: "eval:doc.method=='Direct WebUSB / ESC-POS'" },
                { fieldname: "webusb_device_label", label: __("Paired USB Printer"), fieldtype: "Data", read_only: 1, default: cfg.webusb_device_label, depends_on: "eval:doc.method=='Direct WebUSB / ESC-POS'" },

                { fieldtype: "Section Break", label: __("Direct WebSerial / ESC-POS"), depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_baud_rate", label: __("Baud Rate"), fieldtype: "Int", default: cfg.webserial_baud_rate, depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_data_bits", label: __("Data Bits"), fieldtype: "Select", options: "7\n8", default: String(cfg.webserial_data_bits), depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_stop_bits", label: __("Stop Bits"), fieldtype: "Select", options: "1\n2", default: String(cfg.webserial_stop_bits), depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_parity", label: __("Parity"), fieldtype: "Select", options: "none\neven\nodd", default: cfg.webserial_parity, depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_flow_control", label: __("Flow Control"), fieldtype: "Select", options: "none\nhardware", default: cfg.webserial_flow_control, depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_vendor_id", label: __("Serial USB Vendor ID"), fieldtype: "Data", read_only: 1, default: cfg.webserial_vendor_id, depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },
                { fieldname: "webserial_product_id", label: __("Serial USB Product ID"), fieldtype: "Data", read_only: 1, default: cfg.webserial_product_id, depends_on: "eval:doc.method=='Direct WebSerial / ESC-POS'" },

                { fieldtype: "Section Break", label: __("QZ Tray"), depends_on: "eval:doc.method=='QZ Tray'" },
                { fieldname: "qz_printer_name", label: __("QZ Printer"), fieldtype: "Select", options: ["", cfg.qz_printer_name].filter(Boolean).join("\n"), default: cfg.qz_printer_name, depends_on: "eval:doc.method=='QZ Tray'" },
                { fieldname: "qz_host", label: __("QZ Host"), fieldtype: "Data", default: cfg.qz_host, depends_on: "eval:doc.method=='QZ Tray'", description: __("Leave empty for local QZ Tray.") },
                { fieldname: "qz_connector_url", label: __("QZ Connector URL"), fieldtype: "Data", default: cfg.qz_connector_url, depends_on: "eval:doc.method=='QZ Tray'", description: __("Optional. Local /assets/wmn/js/vendor/qz-tray.js is tried first, then the official online demo connector while online.") },
                { fieldname: "qz_encoding", label: __("QZ Raw Encoding"), fieldtype: "Data", default: cfg.qz_encoding, depends_on: "eval:doc.method=='QZ Tray'", description: __("Examples: UTF8, IBM864. This is used for RAW printing only and must be supported by the printer.") },

                { fieldtype: "Section Break" },
                { fieldname: "connection_actions", fieldtype: "HTML" },
            ],
            primary_action_label: __("Save"),
            primary_action(values) {
                const normalizedValues = Object.assign({}, values || {}, {
                    method: methodId(values?.method, false),
                    fallback_method: methodId(values?.fallback_method, true),
                });
                saveConfig(Object.assign(cfg, normalizedValues));
                dialog.hide();
                frappe.show_alert({ message: __("Printer settings saved on this device."), indicator: "green" });
            },
        });

        dialog.show();
        dialog.set_value("method", methodLabel(cfg.method));
        dialog.set_value("fallback_method", cfg.fallback_method === "none" ? "No fallback" : methodLabel(cfg.fallback_method));
        dialog.get_field("method").$input.on("change.wmn-print", () => setTimeout(() => renderActionButtons(dialog), 0));
        setTimeout(() => renderActionButtons(dialog), 0);
        return dialog;
    }

    ns.Services.Printing.PrintService = {
        STORAGE_KEY,
        METHODS: Object.freeze(Object.assign({}, METHOD_LABELS)),
        getConfig: readConfig,
        saveConfig,
        showSettings,
        sendRaw(rawText, context) { return dispatch("raw", rawText, context); },
        sendPng(base64, context) { return dispatch("png", base64, context); },
        sendPdf(base64, context) { return dispatch("pdf", base64, context); },
        sendHtml(html, context) { return dispatch("html", html, context); },
    };
})();
