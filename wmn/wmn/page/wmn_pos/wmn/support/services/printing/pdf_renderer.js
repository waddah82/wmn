/* Print Format transport and printer handoff. */
        function wmn_clean_base64_for_printer(value) {
            value = String(value || "");

            if (value.indexOf(",") !== -1) {
                value = value.split(",").pop();
            }

            value = value.replace(/\s/g, "");

            while (value.length % 4 !== 0) {
                value += "=";
            }

            return value;
        }

        function wmn_get_print_type(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};
            return (
                settings.wmn_silent_print_type ||
                settings.default_print_type ||
                settings.print_type ||
                printFormat.default_print_type ||
                printFormat.print_type ||
                "RECEIPT"
            );
        }

function wmn_get_printer_ws_url() {
    let savedUrl = String(localStorage.getItem("whb_websocket_url") || "").trim();

    if (savedUrl === "ws://127.0.0.1:12212" || savedUrl === "ws://localhost:12212") {
        savedUrl = savedUrl + "/printer";
        localStorage.setItem("whb_websocket_url", savedUrl);
    }

    return savedUrl || "ws://127.0.0.1:12212/printer";
}

function wmn_show_printer_settings_dialog() {
    const service = window.WMN_POS?.Services?.Printing?.PrintService;
    if (service?.showSettings) return service.showSettings();

    frappe.prompt(
        [{
            fieldname: "ws_url",
            label: "Printer WebSocket URL",
            fieldtype: "Data",
            reqd: 1,
            default: wmn_get_printer_ws_url()
        }],
        function(values) {
            const url = String((values && values.ws_url) || "").trim() || "ws://127.0.0.1:12212/printer";
            localStorage.setItem("whb_websocket_url", url);
            frappe.show_alert({
                message: wmn_t("Printer URL saved", "تم حفظ رابط الطابعة"),
                indicator: "green"
            });
        },
        wmn_t("Printer Settings", "إعدادات الطابعة"),
        wmn_t("Save", "حفظ")
    );
}

function wmn_send_to_legacy_bridge(payload, printType, wsUrl = null) {
    payload = payload || {};
    const finalWsUrl = (wsUrl && String(wsUrl).trim()) || wmn_get_printer_ws_url();

    return new Promise(function (resolve, reject) {
        if (!window.wmn || !wmn.utils || !wmn.utils.WebSocketPrinter) {
            reject(new Error("WebSocketPrinter not available"));
            return;
        }

        const printer = new wmn.utils.WebSocketPrinter({
            url: finalWsUrl,
            onConnect: function () {
                try {
                    const submitPayload = Object.assign({
                        type: printType || "RECEIPT"
                    }, payload);

                    printer.submit(submitPayload);
                    resolve(true);
                } catch (e) {
                    reject(e);
                }
            }
        });
    });
}

window.wmn_send_to_legacy_bridge = wmn_send_to_legacy_bridge;

// Backward-compatible legacy bridge entry point for external callers.
function wmn_send_to_printer(payload, printType, wsUrl = null) {
    return wmn_send_to_legacy_bridge(payload, printType, wsUrl);
}

        function wmn_send_pdf_to_printer(pdfBase64, printType) {
            const clean = wmn_clean_base64_for_printer(pdfBase64);
            const service = window.WMN_POS?.Services?.Printing?.PrintService;
            if (service?.sendPdf) return service.sendPdf(clean, { printType: printType || "RECEIPT" });
            return wmn_send_to_legacy_bridge({ url: "receipt.pdf", file_content: clean }, printType);
        }

        function wmn_send_raw_text_to_printer(rawText, printType) {
            const service = window.WMN_POS?.Services?.Printing?.PrintService;
            if (service?.sendRaw) return service.sendRaw(String(rawText || ""), { printType: printType || "RECEIPT" });
            return wmn_send_to_legacy_bridge({
                raw_content: btoa(unescape(encodeURIComponent(String(rawText || ""))))
            }, printType);
        }

        // Backward-compatible name used by older hooks. It sends raw text only.
        function wmn_send_raw_to_printer(rawText, printType) {
            return wmn_send_raw_text_to_printer(rawText, printType);
        }

        function wmn_is_offline_invoice_doc(doc) {
            doc = doc || {};
            const name = String(doc.name || "");
            return (
                (typeof wmn_is_pos_offline === "function" && wmn_is_pos_offline()) ||
                name.indexOf("OFFLINE-") === 0 ||
                name.indexOf("new-") === 0
            );
        }

        function wmn_get_print_format_name(doc, printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};
            return String(
                settings.print_format ||
                printFormat.print_format_name ||
                printFormat.print_format ||
                printFormat.name ||
                (doc && doc.print_format) ||
                ""
            ).trim();
        }

        function wmn_get_print_doctype(doc) {
            doc = doc || {};
            if (doc.doctype) return doc.doctype;
            if (typeof wmn_pos_invoice_doctype === "function") {
                return wmn_pos_invoice_doctype(window.cur_pos);
            }
            return "Sales Invoice";
        }

        function wmn_extract_print_format_from_printview(fullHtml) {
            fullHtml = String(fullHtml || "");
            const parser = new DOMParser();
            const parsed = parser.parseFromString(fullHtml, "text/html");

            const styles = Array.from(
                parsed.querySelectorAll("style, link[rel='stylesheet']")
            ).map(function(node) {
                return node.outerHTML || "";
            }).join("\n");

            const printFormats = parsed.querySelectorAll(".print-format");
            if (printFormats && printFormats.length) {
                return styles + "\n" + printFormats[0].outerHTML;
            }

            const pageBreaks = parsed.querySelectorAll(".page-break");
            if (pageBreaks && pageBreaks.length) {
                const firstPrint = pageBreaks[0].querySelector(".print-format") || pageBreaks[0];
                return styles + "\n" + firstPrint.outerHTML;
            }

            const builder = parsed.querySelector(".print-format-builder");
            if (builder) {
                return styles + "\n" + builder.outerHTML;
            }

            const bodyHtml = parsed.body ? parsed.body.innerHTML : fullHtml;
            return bodyHtml || fullHtml;
        }

        async function wmn_get_online_printview_html(doc, printFormat) {
            doc = doc || {};
            printFormat = printFormat || {};

            if (!doc.name) {
                throw new Error("Cannot load printview without a document name");
            }

            const formatName = wmn_get_print_format_name(doc, printFormat);
            if (!formatName) {
                throw new Error("POS Profile print_format is empty");
            }

            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const noLetterhead = (
                settings.no_letterhead !== undefined
                    ? settings.no_letterhead
                    : (printFormat.no_letterhead !== undefined ? printFormat.no_letterhead : 1)
            );
            const lang =
                settings.language ||
                printFormat.language ||
                (frappe && frappe.boot && frappe.boot.lang) ||
                "en";

            const params = new URLSearchParams({
                doctype: wmn_get_print_doctype(doc),
                name: doc.name,
                trigger_print: "0",
                format: formatName,
                no_letterhead: String(noLetterhead ? 1 : 0),
                _lang: lang
            });

            if (settings.letter_head || printFormat.letter_head) {
                params.set("letterhead", settings.letter_head || printFormat.letter_head);
            }

            const res = await fetch("/printview?" + params.toString(), {
                credentials: "include",
                cache: "no-store"
            });

            if (!res.ok) {
                throw new Error("Failed to load printview: HTTP " + res.status);
            }

            const fullHtml = await res.text();
            const rendered = wmn_extract_print_format_from_printview(fullHtml);

            if (!String(rendered || "").trim()) {
                throw new Error("printview returned empty HTML");
            }

            return rendered;
        }

        function wmn_normalize_rendered_print_html(renderedHtml) {
            renderedHtml = String(renderedHtml || "").trim();
            if (!renderedHtml) return "";
            if (/class\s*=\s*["'][^"']*\bprint-format\b/i.test(renderedHtml)) return renderedHtml;
            return '<div class="print-format">' + renderedHtml + '</div>';
        }

        async function wmn_get_server_print_format_pdf(doc, printFormat) {
            doc = doc || {};
            printFormat = printFormat || {};

            if (navigator.onLine === false || wmn_is_offline_invoice_doc(doc)) {
                throw new Error("Silent Print needs a synced invoice because it prints the server Print Format PDF.");
            }

            const formatName = wmn_get_print_format_name(doc, printFormat);
            if (!formatName) {
                throw new Error("POS Profile print_format is empty");
            }

            const response = await frappe.call({
                method: "wmn.wmn.page.wmn_pos.wmn_pos.get_pos_print_format_pdf",
                args: {
                    doctype: wmn_get_print_doctype(doc),
                    name: doc.name,
                    print_format: formatName,
                    no_letterhead: 1
                },
                freeze: false,
            });

            const message = response && response.message ? response.message : {};
            const pdfBase64 = message.pdf_base64 || message.pdf || "";
            if (!pdfBase64) {
                throw new Error("Server Print Format PDF is empty.");
            }
            return pdfBase64;
        }

        async function wmn_get_print_format_browser_html(doc, cfg) {
            cfg = cfg || {};
            if (!wmn_is_offline_invoice_doc(doc) && navigator.onLine !== false) {
                try {
                    return await wmn_get_online_printview_html(doc, cfg.printFormat);
                } catch (e) {
                    console.warn("WMN online printview failed; trying cached Print Format", e);
                }
            }

            if (cfg.template && typeof wmn_render_raw_print_template === "function") {
                const rendered = wmn_render_raw_print_template(cfg.template, doc, cfg.printFormat || {});
                if (String(rendered || "").trim()) return wmn_normalize_rendered_print_html(rendered);
            }

            if (typeof wmn_build_offline_receipt_html === "function") {
                return wmn_build_offline_receipt_html(doc);
            }

            throw new Error("Print Format is unavailable while offline.");
        }

        async function wmn_print_raw_receipt(doc) {
            if (typeof wmn_assign_receipt_number === "function") {
                await wmn_assign_receipt_number(doc);
            }
            doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || doc.name || "";
            doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || doc.name || "";

            const cfg = await wmn_get_raw_print_template(doc);
            const printType = wmn_get_print_type(cfg.printFormat) || cfg.printType;
            const printService = window.WMN_POS?.Services?.Printing?.PrintService;
            const printConfig = printService?.getConfig?.() || {};
            const method = String(printConfig.method || "legacy_bridge").trim();

            try { console.info("WMN POS print method:", method); } catch(e) {}

            if (method === "browser") {
                const html = await wmn_get_print_format_browser_html(doc, cfg);
                if (printService?.sendHtml) {
                    return await printService.sendHtml(html, { printType: printType || "RECEIPT" });
                }
                const win = window.open("", "_blank");
                if (!win) throw new Error("Popup blocked. Allow popups to print the receipt.");
                const stylesheet = window.WMN_POS?.UI?.PAGE_STYLESHEET_HREF || "/assets/wmn/css/wmn_pos.css";
                win.document.open();
                win.document.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Receipt</title><link rel='stylesheet' href='" + stylesheet + "'></head><body class='wmn-browser-print-body'>" + String(html || "") + "</body></html>");
                win.document.close();
                win.focus();
                setTimeout(() => win.print(), 300);
                return true;
            }

            if (method === "webusb" || method === "webserial") {
                throw new Error("Direct WebUSB/WebSerial can only print RAW commands. Use Browser Print, WMN Windows Bridge, or QZ Tray for Print Format receipts.");
            }

            const pdfBase64 = await wmn_get_server_print_format_pdf(doc, cfg.printFormat);
            return await wmn_send_pdf_to_printer(pdfBase64, printType);
        }
