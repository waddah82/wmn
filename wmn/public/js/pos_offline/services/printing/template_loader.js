/* Print-format/template loading and raw/HTML rendering. */
        function wmn_pick_first_setting(source, names) {
            source = source || {};
            for (const name of names || []) {
                if (Object.prototype.hasOwnProperty.call(source, name)) {
                    return source[name];
                }
            }
            return undefined;
        }

        async function wmn_get_cached_wmn_print_format(formatName) {
            try {
                if (!window.wmnPOSOffline || !window.wmnPOSOffline.getSetting) return null;

                let cached = null;
                if (formatName) {
                    cached = await window.wmnPOSOffline.getSetting("wmn_print_format::" + formatName);
                }
                if (!cached) {
                    cached = await window.wmnPOSOffline.getSetting("wmn_print_format");
                }
                return cached || null;
            } catch (e) {
                return null;
            }
        }

        function wmn_get_raw_value(scope, path) {
            path = String(path || "").trim();
            if (!path) return "";

            const parts = path.split(".");
            let cur = scope;

            for (const part of parts) {
                const key = String(part || "").trim();
                if (!key) continue;
                if (cur == null) return "";
                cur = cur[key];
            }

            return cur == null ? "" : cur;
        }

        function wmn_split_raw_args(argsText) {
            const args = [];
            let cur = "";
            let quote = "";
            let depth = 0;
            const text = String(argsText || "");

            for (let i = 0; i < text.length; i++) {
                const ch = text[i];

                if (quote) {
                    cur += ch;
                    if (ch === quote && text[i - 1] !== "\\") quote = "";
                    continue;
                }

                if (ch === "'" || ch === '"') {
                    quote = ch;
                    cur += ch;
                    continue;
                }

                if (ch === "(") depth += 1;
                if (ch === ")") depth = Math.max(0, depth - 1);

                if (ch === "," && depth === 0) {
                    args.push(cur.trim());
                    cur = "";
                    continue;
                }

                cur += ch;
            }

            if (cur.trim() || text.trim()) args.push(cur.trim());
            return args;
        }

        function wmn_raw_width(value) {
            return Array.from(String(value || "")).length;
        }

        function wmn_raw_clip(value, width) {
            return Array.from(String(value || "")).slice(0, Math.max(0, width)).join("");
        }

        async function wmn_get_raw_print_template(doc) {
            const settings = (window.cur_pos && window.cur_pos.settings) || {};
            const formatName = settings.print_format || (doc && doc.print_format) || "";
            const printFormat = await wmn_get_cached_wmn_print_format(formatName) || {};

            let printFormatDoc = null;
            const printFormatName =
                printFormat.print_format_name ||
                printFormat.wmn_print_format ||
                printFormat.print_format ||
                formatName ||
                "";

            try {
                if (window.wmnPOSOffline && window.wmnPOSOffline.getSetting) {
                    if (printFormatName) {
                        printFormatDoc = await window.wmnPOSOffline.getSetting("print_format_doc::" + printFormatName);
                    }
                    if (!printFormatDoc) {
                        printFormatDoc = await window.wmnPOSOffline.getSetting("print_format_doc");
                    }
                }
            } catch (e) {
                printFormatDoc = null;
            }

            if (!printFormat.print_format_doc && printFormatDoc) {
                printFormat.print_format_doc = printFormatDoc;
            }


            const template =
                printFormat.raw_template_code ||
                printFormat.raw_template ||
                printFormat.raw_receipt_template ||
                (printFormat.print_format_doc && printFormat.print_format_doc.raw_template_code) ||
                (printFormatDoc && printFormatDoc.raw_template_code) ||
                printFormat.print_format_html ||
                printFormat.html ||
                printFormat.custom_html ||
                printFormat.html_template_code ||
                printFormat.html_receipt_template ||
                printFormat.offline_html_template ||
                printFormat.receipt_html_template ||
                (printFormat.print_format_doc && (
                    printFormat.print_format_doc.html ||
                    printFormat.print_format_doc.custom_html ||
                    printFormat.print_format_doc.print_format ||
                    printFormat.print_format_doc.format_data
                )) ||
                (printFormatDoc && (
                    printFormatDoc.html ||
                    printFormatDoc.custom_html ||
                    printFormatDoc.print_format ||
                    printFormatDoc.format_data
                )) ||
                "";

            return {
                printFormat,
                printFormatDoc,
                template,
                printType: (
                    printFormat.default_print_type ||
                    printFormat.print_type ||
                    "RECEIPT"
                )
            };
        }

        function wmn_is_js_print_format(printFormat) {
            printFormat = printFormat || {};

            const doc = printFormat.print_format_doc || {};
            const type = String(
                printFormat.print_format_type ||
                printFormat.format_type ||
                doc.print_format_type ||
                doc.format_type ||
                ""
            ).toLowerCase();

            return type === "js" || type === "javascript";
        }

        function wmn_render_raw_print_template(template, doc, printFormat) {
            template = String(template || "");
            doc = doc || {};
            printFormat = printFormat || {};

            function wmn_format_print_value(value, fieldname, parentDoc) {
                const currency = (parentDoc && parentDoc.currency) || doc.currency || "";
                if (value === undefined || value === null) return "";
                try {
                    const meta = parentDoc && parentDoc.doctype && frappe.meta
                        ? frappe.meta.get_field(parentDoc.doctype, fieldname)
                        : null;
                    if (meta && meta.fieldtype === "Currency") {
                        return format_currency(flt(value || 0), currency);
                    }
                    if (meta && meta.fieldtype === "Date") {
                        return frappe.datetime.str_to_user(value);
                    }
                } catch (e) {}
                if (typeof value === "number") return money(value);
                return String(value);
            }

            function attachGetFormatted(obj, parentDoc) {
                if (!obj || typeof obj !== "object" || obj.get_formatted) return obj;
                Object.defineProperty(obj, "get_formatted", {
                    enumerable: false,
                    configurable: true,
                    value: function(fieldname) {
                        return wmn_format_print_value(this[fieldname], fieldname, parentDoc || doc);
                    }
                });
                return obj;
            }

            attachGetFormatted(doc, doc);
            (doc.items || []).forEach(function(row){ attachGetFormatted(row, doc); });
            (doc.taxes || []).forEach(function(row){ attachGetFormatted(row, doc); });
            (doc.payments || []).forEach(function(row){ attachGetFormatted(row, doc); });
            doc.flags = doc.flags || {};

            /*
             * Prefer Frappe's real print-format renderer when available.
             * This keeps the HTML/CSS/Jinja print format as the source of truth.
             * The lightweight renderer below remains only as a fallback for offline edge cases.
             */
            try {
                if (window.frappe && typeof frappe.render_template === "function") {
                    const rendered = frappe.render_template(template, {
                        doc: doc,
                        letter_head: "",
                        no_letterhead: 1,
                        _: window.__ || function(v) { return v; },
                        frappe: window.frappe,
                        cur_pos: window.cur_pos
                    });

                    if (rendered && String(rendered).trim()) {
                        return String(rendered).trim();
                    }
                }
            } catch (e) {
                console.warn("WMN print format render_template fallback", e);
            }

            function money(value) {
                const n = parseFloat(value);
                return isNaN(n) ? "0.00" : n.toFixed(2);
            }

            function raw(value) {
                return value == null ? "" : String(value);
            }

            function getValue(obj, path) {
                path = String(path || "").trim();
                if (!path) return "";

                const parts = path.split(".");
                let current = obj;

                for (const part of parts) {
                    const key = String(part || "").trim();
                    if (!key) continue;
                    if (current == null) return "";
                    current = current[key];
                }

                return current == null ? "" : current;
            }

            function formatValue(value) {
                if (value == null) return "";
                if (typeof value === "number") return String(value);
                if (typeof value === "boolean") return value ? "1" : "";
                if (typeof value === "object") return JSON.stringify(value);
                return String(value);
            }

            const helpers = { money, raw };

            function evalSafeJS(expr, scope) {
                try {
                    return Function(
                        "doc",
                        "money",
                        "raw",
                        "__",
                        "format_currency",
                        "flt",
                        "return (" + expr + ");"
                    )(scope.doc, money, raw, __, format_currency, flt);
                } catch (e) {
                    return undefined;
                }
            }

            function evalExpr(expr, scope) {
                expr = String(expr || "").trim();
                if (!expr) return "";

                expr = expr.replace(/\s*\|\s*replace\("\\n"\s*,\s*",\s*"\)\s*$/, ".__replace_newline_comma");

                let replaceNewline = false;
                if (expr.endsWith(".__replace_newline_comma")) {
                    replaceNewline = true;
                    expr = expr.replace(".__replace_newline_comma", "");
                }

                if (expr === '_("Invoice")') return __("Invoice");
                if (expr === '_("Thank you, please visit again.")') return __("Thank you, please visit again.");

                if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
                    return expr.slice(1, -1);
                }

                if (/^-?\d+(\.\d+)?$/.test(expr)) return flt(expr);

                if (expr.indexOf(".get_formatted(") !== -1 || expr.indexOf("?") !== -1) {
                    const jsValue = evalSafeJS(expr, scope);
                    if (jsValue !== undefined) return jsValue;
                }

                if (expr.indexOf("||") !== -1) {
                    const options = expr.split(/\s*\|\|\s*/);
                    for (const opt of options) {
                        const v = evalExpr(opt.trim(), scope);
                        if (v) return v;
                    }
                    return "";
                }

                if (expr.indexOf(" or ") !== -1) {
                    const options = expr.split(/\s+or\s+/);
                    for (const opt of options) {
                        const v = evalExpr(opt.trim(), scope);
                        if (v) return v;
                    }
                    return "";
                }

                if (expr.indexOf("~") !== -1) {
                    return expr.split("~").map(part => formatValue(evalExpr(part.trim(), scope))).join("");
                }

                const fnMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
                if (fnMatch && helpers[fnMatch[1]]) {
                    const args = wmn_split_raw_args(fnMatch[2]).map(arg => evalExpr(arg, scope));
                    return helpers[fnMatch[1]].apply(null, args);
                }

                let value = getValue(scope, expr);
                if (replaceNewline) value = String(value || "").replace(/\n/g, ", ");
                return value;
            }

            function evalCondition(expr, scope) {
                expr = String(expr || "").trim();
                if (!expr) return false;

                if (expr.indexOf(".get_formatted(") !== -1 || expr.indexOf("?") !== -1) {
                    const jsValue = evalSafeJS(expr, scope);
                    if (jsValue !== undefined) return !!jsValue;
                }

                if (expr.startsWith("not ")) return !evalCondition(expr.slice(4), scope);
                if (expr.indexOf(" and ") !== -1) return expr.split(/\s+and\s+/).every(part => evalCondition(part, scope));
                if (expr.indexOf(" or ") !== -1) return expr.split(/\s+or\s+/).some(part => evalCondition(part, scope));
                if (expr.indexOf("||") !== -1) return expr.split(/\s*\|\|\s*/).some(part => evalCondition(part, scope));

                let m = expr.match(/^(.*?)\s+not\s+in\s+(.*?)$/);
                if (m) return String(evalExpr(m[2], scope)).indexOf(String(evalExpr(m[1], scope))) === -1;

                m = expr.match(/^(.*?)\s+in\s+(.*?)$/);
                if (m) return String(evalExpr(m[2], scope)).indexOf(String(evalExpr(m[1], scope))) !== -1;

                m = expr.match(/^(.*?)\s*!=\s*(.*?)$/);
                if (m) return String(evalExpr(m[1], scope)) !== String(evalExpr(m[2], scope));

                m = expr.match(/^(.*?)\s*==\s*(.*?)$/);
                if (m) return String(evalExpr(m[1], scope)) === String(evalExpr(m[2], scope));

                return !!evalExpr(expr, scope);
            }

            function renderBlock(text, scope) {
                text = String(text || "");

                text = text.replace(
                    /\{%-?\s*for\s+(\w+)\s+in\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}/g,
                    function (_m, varName, collectionExpr, body) {
                        const rows = evalExpr(collectionExpr.trim(), scope) || [];
                        if (!Array.isArray(rows)) return "";

                        return rows.map(function (rowObj) {
                            const childScope = Object.assign({}, scope);
                            childScope[varName] = rowObj;
                            return renderBlock(body, childScope);
                        }).join("");
                    }
                );

                text = text.replace(
                    /\{%-?\s*if\s+([^%]+?)\s*-?%\}([\s\S]*?)\{%-?\s*endif\s*-?%\}/g,
                    function (_m, condition, body) {
                        return evalCondition(condition, scope) ? renderBlock(body, scope) : "";
                    }
                );

                text = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, function (_m, expr) {
                    return formatValue(evalExpr(expr, scope));
                });

                return text;
            }

            // HTML receipt renderer: keep HTML/CSS/images as-is. Avoid remote images in offline mode.
            let output = renderBlock(template, { doc });
            output = output.replace(/\{%-?[\s\S]*?-?%\}/g, "");
            return output.trim();
        }

