/* PDF/PNG rendering and printer transport. */
        function wmn_mm_to_pt(mm) {
            return flt(mm || 0) * 72 / 25.4;
        }

        function wmn_pdf_money(value) {
            const n = parseFloat(value);
            return isNaN(n) ? "0.00" : n.toFixed(2);
        }

        function wmn_pdf_text(value) {
            if (value === undefined || value === null) return "";
            return String(value);
        }

        function wmn_pdf_strip_html(value) {
            const div = document.createElement("div");
            div.innerHTML = String(value || "");
            return (div.innerText || div.textContent || "").trim();
        }

        function wmn_pdf_get_currency(doc) {
            return doc.currency || doc.company_currency || "";
        }

        function wmn_pdf_build_items_table(doc) {
            const body = [[
                { text: "Item", bold: true },
                { text: "Qty", bold: true, alignment: "right" },
                { text: "Amount", bold: true, alignment: "right" }
            ]];

            (doc.items || []).forEach(function (item) {
                const itemTitle =
                    item.item_name ||
                    item.item_code ||
                    "";

                const rateLine = "@ " + wmn_pdf_money(item.rate || 0) + (wmn_pdf_get_currency(doc) ? " " + wmn_pdf_get_currency(doc) : "");

                body.push([
                    {
                        stack: [
                            { text: wmn_pdf_text(itemTitle), margin: [0, 0, 0, 1] },
                            { text: rateLine, fontSize: 8, color: "#444" },
                            item.serial_no ? { text: "SR.No: " + String(item.serial_no).replace(/\n/g, ", "), fontSize: 8 } : { text: "" }
                        ]
                    },
                    { text: wmn_pdf_text(item.qty || 0), alignment: "right" },
                    { text: wmn_pdf_money(item.amount || 0), alignment: "right" }
                ]);
            });

            return {
                table: {
                    headerRows: 1,
                    widths: ["*", 35, 55],
                    body: body
                },
                layout: {
                    hLineWidth: function () { return 0.5; },
                    vLineWidth: function () { return 0; },
                    hLineColor: function () { return "#999"; },
                    paddingLeft: function () { return 0; },
                    paddingRight: function () { return 0; },
                    paddingTop: function () { return 3; },
                    paddingBottom: function () { return 3; }
                },
                margin: [0, 6, 0, 6]
            };
        }

        function wmn_pdf_detail_row(label, value, opts) {
            opts = opts || {};
            return [
                { text: wmn_pdf_text(label), bold: !!opts.bold },
                { text: wmn_pdf_text(value), alignment: "right", bold: !!opts.bold }
            ];
        }

        function wmn_pdf_build_totals_table(doc) {
            const currency = wmn_pdf_get_currency(doc);
            const withCur = function (v) {
                return wmn_pdf_money(v || 0) + (currency ? " " + currency : "");
            };

            const body = [];

            body.push(wmn_pdf_detail_row("Total", withCur(doc.total || doc.net_total || 0)));

            (doc.taxes || []).forEach(function (tax) {
                const amount = flt(tax.tax_amount || 0);
                if (!amount) return;

                let label = tax.description || tax.account_head || "Tax";
                if (tax.rate && String(label).indexOf("%") === -1 && String(label).indexOf("@") === -1) {
                    label += " @" + wmn_pdf_money(tax.rate) + "%";
                }

                body.push(wmn_pdf_detail_row(label, withCur(amount)));
            });

            if (flt(doc.discount_amount || 0)) {
                const discountLabel = doc.__wmn_coupon_code
                    ? `${__("Coupon")} ${doc.__wmn_coupon_code}`
                    : __("Discount");
                body.push(wmn_pdf_detail_row(discountLabel, withCur(doc.discount_amount)));
            }

            body.push(wmn_pdf_detail_row("Grand Total", withCur(doc.grand_total || doc.rounded_total || 0), { bold: true }));

            if (flt(doc.rounded_total || 0)) {
                body.push(wmn_pdf_detail_row("Rounded Total", withCur(doc.rounded_total), { bold: true }));
            }

            (doc.payments || []).forEach(function (p) {
                if (!flt(p.amount || 0)) return;
                body.push(wmn_pdf_detail_row(p.mode_of_payment || "Payment", withCur(p.amount)));
            });

            body.push(wmn_pdf_detail_row("Paid Amount", withCur(doc.paid_amount || doc.grand_total || 0), { bold: true }));

            if (flt(doc.change_amount || 0)) {
                body.push(wmn_pdf_detail_row("Change Amount", withCur(doc.change_amount), { bold: true }));
            }

            return {
                table: {
                    widths: ["*", 75],
                    body: body
                },
                layout: "noBorders",
                margin: [0, 4, 0, 4]
            };
        }

        function wmn_build_pdfmake_receipt_definition(doc, printFormat) {
            doc = doc || {};
            printFormat = printFormat || {};

            const pageWidth = wmn_mm_to_pt(wmn_get_pdf_paper_width_mm(printFormat));
            const pageMargins = [8, 8, 8, 8];
            const receiptNo = doc.wmn_receipt_no || doc.__wmn_receipt_no || doc.name || "";
            const heading = doc.select_print_heading || "Invoice";

            const content = [
                { text: wmn_pdf_text(doc.company || ""), alignment: "center", bold: true, fontSize: 12, margin: [0, 0, 0, 2] },
                { text: wmn_pdf_text(heading), alignment: "center", bold: true, fontSize: 10, margin: [0, 0, 0, 8] },
                {
                    table: {
                        widths: [55, "*"],
                        body: [
                            ["Receipt No", wmn_pdf_text(receiptNo)],
                            ["Cashier", wmn_pdf_text(doc.owner || "")],
                            ["Customer", wmn_pdf_text(doc.customer_name || doc.customer || "")],
                            ["Date", wmn_pdf_text(doc.posting_date || "")],
                            ["Time", wmn_pdf_text(doc.posting_time || "")]
                        ]
                    },
                    layout: "noBorders",
                    fontSize: 8,
                    margin: [0, 0, 0, 6]
                },
                wmn_pdf_build_items_table(doc),
                wmn_pdf_build_totals_table(doc)
            ];

            const terms = wmn_pdf_strip_html(doc.terms || "");
            if (terms) {
                content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth - pageMargins[0] - pageMargins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 4] });
                content.push({ text: terms, fontSize: 8, margin: [0, 2, 0, 6] });
            }

            content.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth - pageMargins[0] - pageMargins[2], y2: 0, lineWidth: 0.5 }], margin: [0, 4, 0, 6] });
            content.push({ text: "Thank you, please visit again.", alignment: "center", fontSize: 9, margin: [0, 2, 0, 0] });

            return {
                pageSize: {
                    width: pageWidth,
                    height: "auto"
                },
                pageMargins: pageMargins,
                content: content,
                defaultStyle: {
                    font: (printFormat.pdf_font || printFormat.font || "Roboto"),
                    fontSize: cint(printFormat.pdf_font_size || printFormat.font_size || 9) || 9
                }
            };
        }

        function wmn_pdfmake_to_base64(docDefinition) {
            return new Promise(function (resolve, reject) {
                try {
                    if (!window.pdfMake) {
                        reject(new Error("pdfMake is not loaded. Add /assets/wmn/js/pdfmake.min.js and /assets/wmn/js/vfs_fonts.js before custom_pos_offline.js"));
                        return;
                    }

                    window.pdfMake.createPdf(docDefinition).getBase64(function (base64) {
                        resolve(base64);
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

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

        const WMN_SILENT_PRINT_MODE_FIELD = "wmn_silent_print_mode";
        const WMN_SILENT_PRINT_MODE_VALUES = ["raw_text", "html2canvas", "pdfmake"];

        function wmn_get_silent_print_mode(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            const rawMode =
                wmn_pick_first_setting(settings, [
                    WMN_SILENT_PRINT_MODE_FIELD,
                    "silent_print_mode",
                    "wmn_print_mode",
                    "print_output_mode",
                    "wmn_auto_print_mode",
                    "auto_silent_print_mode"
                ]) ||
                wmn_pick_first_setting(printFormat, [
                    "wmn_silent_print_mode",
                    "silent_print_mode",
                    "wmn_print_mode",
                    "print_output_mode"
                ]) ||
                "html2canvas";

            let mode = String(rawMode || "html2canvas").trim().toLowerCase();
            mode = mode.replace(/[-\s]+/g, "_");

            if (["raw", "raw_text", "text", "escpos", "esc_pos"].includes(mode)) return "raw_text";
            if (["html", "html2canvas", "canvas", "image", "png", "html_png"].includes(mode)) return "html2canvas";
            if (["pdf", "pdfmake", "pdf_make", "js_pdf", "doc_definition"].includes(mode)) return "pdfmake";

            return "html2canvas";
        }

        window.wmn_get_silent_print_mode = wmn_get_silent_print_mode;
        window.WMN_SILENT_PRINT_MODE_FIELD = WMN_SILENT_PRINT_MODE_FIELD;
        window.WMN_SILENT_PRINT_MODE_VALUES = WMN_SILENT_PRINT_MODE_VALUES;

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

function wmn_send_to_printer(payload, printType, wsUrl = null) {
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
        
        function wmn_send_pdf_to_printer(pdfBase64, printType) {
            return wmn_send_to_printer({
                url: "receipt.pdf",
                file_content: wmn_clean_base64_for_printer(pdfBase64)
            }, printType);
        }

        function wmn_send_png_to_printer(pngBase64, printType) {
            return wmn_send_to_printer({
                url: "receipt.png",
                file_content: wmn_clean_base64_for_printer(pngBase64)
            }, printType);
        }

        function wmn_send_raw_text_to_printer(rawText, printType) {
            return wmn_send_to_printer({
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

            if (!doc.doctype || !doc.name) {
                throw new Error("Cannot load printview without doc.doctype and doc.name");
            }

            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const formatName =
                settings.print_format ||
                printFormat.print_format_name ||
                printFormat.wmn_print_format ||
                printFormat.print_format ||
                doc.print_format ||
                "";

            if (!formatName) {
                throw new Error("POS Profile print_format is empty");
            }

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
                doctype: doc.doctype,
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

        function wmn_extract_print_width_css_from_html(html, printFormat) {
            html = String(html || "");
            printFormat = printFormat || {};

            const directCss =
                printFormat.paper_width_css ||
                printFormat.width_css ||
                printFormat.print_width_css;

            if (directCss) return String(directCss);

            const directMm =
                printFormat.paper_width_mm ||
                printFormat.width_mm ||
                printFormat.print_width_mm;

            if (directMm) return flt(directMm) + "mm";

            const directInch =
                printFormat.paper_width_in ||
                printFormat.width_in ||
                printFormat.print_width_in;

            if (directInch) return flt(directInch) + "in";

            const m = html.match(/\.print-format[\s\S]*?width\s*:\s*([0-9.]+)\s*(mm|in|px)/i) ||
                      html.match(/width\s*:\s*([0-9.]+)\s*(mm|in|px)/i);

            if (m) return String(m[1]) + String(m[2]);

            return "80mm";
        }

        function wmn_extract_print_width_pt_from_html(html, printFormat) {
            const cssWidth = wmn_extract_print_width_css_from_html(html, printFormat);

            function mmToPt(mm) { return flt(mm || 0) * 2.8346456693; }
            function inchToPt(inch) { return flt(inch || 0) * 72; }
            function pxToPt(px) { return flt(px || 0) * 0.75; }

            const m = String(cssWidth || "").match(/^([0-9.]+)\s*(mm|in|px)$/i);
            if (!m) return null;

            const value = flt(m[1]);
            const unit = String(m[2] || "").toLowerCase();

            if (unit === "mm") return mmToPt(value);
            if (unit === "in") return inchToPt(value);
            if (unit === "px") return pxToPt(value);
            return null;
        }

        function wmn_clean_print_html_for_pdfmake(html) {
            html = String(html || "");
            html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
            return html;
        }

        function wmn_normalize_rendered_print_html(renderedHtml) {
            renderedHtml = String(renderedHtml || "").trim();

            if (!renderedHtml) {
                return "";
            }

            /*
             * The offline renderer can return the inner HTML of the Print Format
             * without the ERPNext wrapper. Most receipt CSS is written as:
             *   .print-format table { ... }
             *   .print-format td { ... }
             * If the wrapper is missing, CSS does not apply and html2canvas may
             * capture a blank/unstyled page. Always guarantee one visible wrapper.
             */
            if (
                renderedHtml.indexOf('class="print-format"') !== -1 ||
                renderedHtml.indexOf("class='print-format'") !== -1 ||
                /class\s*=\s*["'][^"']*\bprint-format\b/i.test(renderedHtml)
            ) {
                return renderedHtml;
            }

            return '<div class="print-format">' + renderedHtml + '</div>';
        }

        function wmn_normalize_page_size_name(value) {
            return String(value || "")
                .trim()
                .toUpperCase()
                .replace(/\s+/g, "")
                .replace(/-/g, "");
        }

        function wmn_get_wmn_print_page_size(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            return (
                printFormat.page_size ||
                printFormat.paper_size ||
                printFormat.print_page_size ||
                printFormat.pageSize ||
                settings.wmn_page_size ||
                settings.page_size ||
                "A5"
            );
        }

        function wmn_get_wmn_print_orientation(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            return (
                printFormat.orientation ||
                printFormat.print_orientation ||
                settings.wmn_orientation ||
                settings.orientation ||
                "Portrait"
            );
        }

        function wmn_get_page_size_mm(pageSize, orientation, printFormat) {
            printFormat = printFormat || {};

            const explicitWidth =
                printFormat.page_width_mm ||
                printFormat.paper_width_mm ||
                printFormat.width_mm ||
                printFormat.print_width_mm;

            const explicitHeight =
                printFormat.page_height_mm ||
                printFormat.paper_height_mm ||
                printFormat.height_mm ||
                printFormat.print_height_mm;

            if (explicitWidth) {
                return {
                    name: "CUSTOM",
                    width_mm: flt(explicitWidth),
                    height_mm: explicitHeight ? flt(explicitHeight) : null
                };
            }

            let name = wmn_normalize_page_size_name(pageSize || "A5");

            const standard = {
                A0: [841, 1189],
                A1: [594, 841],
                A2: [420, 594],
                A3: [297, 420],
                A4: [210, 297],
                A5: [148, 210],
                A6: [105, 148],
                A7: [74, 105],
                A8: [52, 74],
                LETTER: [216, 279],
                LEGAL: [216, 356],
                RECEIPT80: [80, null],
                THERMAL80: [80, null],
                "80MM": [80, null],
                RECEIPT58: [58, null],
                THERMAL58: [58, null],
                "58MM": [58, null]
            };

            let size = standard[name];

            if (!size) {
                const custom = name.match(/^([0-9.]+)(MM|IN|PX)$/);
                if (custom) {
                    const value = flt(custom[1]);
                    const unit = custom[2];
                    if (unit === "MM") size = [value, null];
                    if (unit === "IN") size = [value * 25.4, null];
                    if (unit === "PX") size = [value * 25.4 / 96, null];
                }
            }

            if (!size) {
                size = standard.A5;
                name = "A5";
            }

            let width = flt(size[0]);
            let height = size[1] === null ? null : flt(size[1]);

            const o = String(orientation || "Portrait").trim().toLowerCase();
            if ((o === "landscape" || o === "horizontal") && height) {
                const tmp = width;
                width = height;
                height = tmp;
            }

            return {
                name: name,
                width_mm: width,
                height_mm: height
            };
        }

        function wmn_mm_to_px(mm) {
            return Math.round(flt(mm || 0) * 96 / 25.4);
        }

        function wmn_get_html2canvas_page(printFormat) {
            return wmn_get_page_size_mm(
                wmn_get_wmn_print_page_size(printFormat),
                wmn_get_wmn_print_orientation(printFormat),
                printFormat
            );
        }

        function wmn_get_html2canvas_options(printFormat) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            printFormat = printFormat || {};

            const page = wmn_get_html2canvas_page(printFormat);
            const widthPx = wmn_mm_to_px(page.width_mm);
            const heightPx = page.height_mm ? wmn_mm_to_px(page.height_mm) : null;

            const scaleSetting =
                settings.wmn_html2canvas_scale ||
                printFormat.html2canvas_scale ||
                printFormat.canvas_scale ||
                1;

            let scale = flt(scaleSetting || 1);
            if (!scale || scale < 0.5) scale = 1;
            if (scale > 4) scale = 4;

            const options = {
                scale: scale,
                backgroundColor: "#ffffff",
                useCORS: false,
                foreignObjectRendering: true,
                allowTaint: true,
                logging: false,
                removeContainer: true,
                imageTimeout: 0,
                scrollX: 0,
                scrollY: 0,
                windowWidth: widthPx,
                windowHeight: heightPx || document.documentElement.clientHeight,
                width: widthPx
            };

            if (heightPx) {
                options.height = heightPx;
            }

            return options;
        }

        async function wmn_print_format_html_to_png_base64(renderedHtml, printFormat) {
            renderedHtml = wmn_normalize_rendered_print_html(renderedHtml);
            printFormat = printFormat || {};

            if (!String(renderedHtml || "").trim()) {
                throw new Error("Rendered Print Format HTML is empty before html2canvas capture");
            }

            if (!window.html2canvas) {
                throw new Error("html2canvas is not loaded. Add /assets/wmn/js/html2canvas.min.js before custom_pos_offline.js");
            }

            const holder = document.createElement("div");
            holder.className = "wmn-print-capture-holder";

            /*
             * Important:
             * Do not use opacity:0 / visibility:hidden / display:none.
             * Do not put the holder at -100000px because some browsers/html2canvas
             * versions return a white canvas for very far offscreen nodes.
             * We render it visibly at 0,0 for a few frames, capture it, then remove it.
             */
            holder.style.position = "fixed";
            holder.style.left = "0";
            holder.style.top = "0";
            holder.style.background = "#ffffff";
            holder.style.overflow = "visible";
            holder.style.zIndex = "2147483647";
            holder.style.pointerEvents = "none";
            holder.style.opacity = "1";
            holder.style.visibility = "visible";
            holder.style.display = "block";

            holder.innerHTML = renderedHtml;
            document.body.appendChild(holder);

            try {
                const target =
                    holder.querySelector(".print-format") ||
                    holder.querySelector(".wmn-print-format") ||
                    holder.querySelector(".receipt") ||
                    holder.firstElementChild ||
                    holder;

                if (document.fonts && document.fonts.ready) {
                    try { await document.fonts.ready; } catch (e) {}
                }

                const images = Array.from(target.querySelectorAll ? target.querySelectorAll("img") : []);
                await Promise.all(images.map(function(img) {
                    if (img.complete) return Promise.resolve();
                    return new Promise(function(resolve) {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                }));

                await new Promise(function(resolve) {
                    requestAnimationFrame(function() {
                        requestAnimationFrame(resolve);
                    });
                });

                await new Promise(function(resolve) {
                    setTimeout(resolve, 300);
                });

                const rect = target.getBoundingClientRect();
                const targetWidth = Math.max(
                    1,
                    Math.ceil(target.scrollWidth || rect.width || holder.scrollWidth || 576)
                );
                const targetHeight = Math.max(
                    1,
                    Math.ceil(target.scrollHeight || rect.height || holder.scrollHeight || 1)
                );

                if (targetWidth <= 1 || targetHeight <= 1) {
                    throw new Error("html2canvas target size is empty: " + targetWidth + "x" + targetHeight);
                }

                const canvas = await window.html2canvas(target, {
                    scale: flt((printFormat && printFormat.canvas_scale) || (printFormat && printFormat.html2canvas_scale) || 2) || 2,
                    backgroundColor: "#ffffff",
                    useCORS: false,
                    foreignObjectRendering: true,
                    allowTaint: true,
                    logging: false,
                    scrollX: 0,
                    scrollY: 0,
                    width: targetWidth,
                    height: targetHeight,
                    windowWidth: targetWidth,
                    windowHeight: targetHeight
                });

                if (!canvas || !canvas.width || !canvas.height) {
                    throw new Error("html2canvas returned an empty canvas");
                }

                return canvas.toDataURL("image/png").split(",").pop();
            } finally {
                if (holder && holder.parentNode) {
                    holder.parentNode.removeChild(holder);
                }
            }
        }

        async function wmn_print_format_html_to_pdf_base64(renderedHtml, printFormat) {
            renderedHtml = wmn_clean_print_html_for_pdfmake(renderedHtml);
            printFormat = printFormat || {};

            return new Promise(function(resolve, reject) {
                try {
                    if (!window.pdfMake) {
                        reject(new Error("pdfMake is not loaded"));
                        return;
                    }

                    if (typeof window.htmlToPdfmake !== "function") {
                        reject(new Error("html-to-pdfmake is not loaded. Load html-to-pdfmake before custom_pos_offline.js, or use server PDF online."));
                        return;
                    }

                    const wrapper = document.createElement("div");
                    wrapper.innerHTML = renderedHtml;

                    const printRoot =
                        wrapper.querySelector(".print-format") ||
                        wrapper.querySelector(".print-format-builder") ||
                        wrapper;

                    const pdfContent = window.htmlToPdfmake(printRoot.innerHTML || renderedHtml, {
                        window: window
                    });

                    const docDefinition = {
                        content: pdfContent
                    };

                    const pageWidth = wmn_extract_print_width_pt_from_html(renderedHtml, printFormat);
                    if (pageWidth) {
                        docDefinition.pageSize = {
                            width: pageWidth,
                            height: "auto"
                        };
                        docDefinition.pageMargins = [0, 0, 0, 0];
                    }

                    window.pdfMake.createPdf(docDefinition).getBase64(function(base64) {
                        resolve(base64);
                    });
                } catch (e) {
                    reject(e);
                }
            });
        }

        async function wmn_print_raw_receipt(doc) {
            if (typeof wmn_assign_receipt_number === "function") {
                await wmn_assign_receipt_number(doc);
            }
            doc.wmn_receipt_no = doc.wmn_receipt_no || doc.__wmn_receipt_no || doc.name || "";
            doc.__wmn_receipt_no = doc.__wmn_receipt_no || doc.wmn_receipt_no || doc.name || "";

            const cfg = await wmn_get_raw_print_template(doc);
            const mode = wmn_get_silent_print_mode(cfg.printFormat);
            const printType = wmn_get_print_type(cfg.printFormat) || cfg.printType;
            const isOfflineDoc = wmn_is_offline_invoice_doc(doc);

            try { console.info("WMN silent print mode:", mode, "offline:", isOfflineDoc); } catch(e) {}

            if (mode === "raw_text") {
                //const rawText = wmn_build_offline_raw_receipt_text(doc);
                const rawText = wmn_render_raw_print_temp(cfg.template, doc);
                
                return await wmn_send_raw_text_to_printer(rawText, printType);
            }

            let renderedHtml = "";

            /*
             * Primary print path:
             * Use the cached Jinja/HTML renderer for both online and offline first.
             * This is the same path from the reference file where Arabic item names were clear.
             * Online printview remains only a fallback, because it was the path that produced broken Arabic.
             */
            if (cfg.template && String(cfg.template || "").trim()) {
                try {
                    const rendered = wmn_render_raw_print_template(
                        cfg.template,
                        doc,
                        cfg.printFormat
                    );

                    if (rendered && typeof rendered === "object") {
                        const pdfBase64 = await wmn_pdfmake_to_base64(rendered);
                        return await wmn_send_pdf_to_printer(pdfBase64, printType);
                    }

                    renderedHtml = String(rendered || "").trim();
                } catch (e) {
                    console.warn("WMN local Print Format render failed, will try fallback", e);
                    renderedHtml = "";
                }
            }

            /*
             * If local render is empty or still contains unresolved Jinja, use printview online only.
             */
            if ((!renderedHtml || /\{[%{#]/.test(renderedHtml)) && !isOfflineDoc) {
                try {
                    renderedHtml = await wmn_get_online_printview_html(doc, cfg.printFormat);
                } catch (e) {
                    console.warn("WMN online printview fallback failed", e);
                }
            }

            /*
             * Offline must never send empty canvas. If cached Print Format is missing or not fully rendered,
             * use the internal offline HTML receipt fallback instead of printing a blank page.
             */
            if (!renderedHtml || /\{[%{#]/.test(renderedHtml)) {
                if (typeof wmn_build_offline_receipt_html === "function") {
                    renderedHtml = wmn_build_offline_receipt_html(doc);
                } else {
                    renderedHtml = wmn_wrap_offline_receipt_html(
                        "<div class='receipt'>" + wmn_escape_html(wmn_build_offline_raw_receipt_text(doc)).replace(/\n/g, "<br>") + "</div>",
                        doc
                    );
                }
            }

            if (!renderedHtml || !String(renderedHtml).trim()) {
                throw new Error("Rendered Print Format output is empty");
            }

            if (mode === "pdfmake") {
                const pdfBase64 = await wmn_print_format_html_to_pdf_base64(renderedHtml, cfg.printFormat);
                return await wmn_send_pdf_to_printer(pdfBase64, printType);
            }

            const pngBase64 = await wmn_print_format_html_to_png_base64(renderedHtml, cfg.printFormat);
            return await wmn_send_png_to_printer(pngBase64, printType);
        }

