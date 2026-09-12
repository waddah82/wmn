/* Offline/raw receipt rendering helpers. */
        function wmn_wrap_offline_receipt_html(html, doc) {
            return `
                <!doctype html>
                <html>
                    <head>
                        <meta charset="utf-8">
                        <title>${frappe.utils.escape_html((doc && (doc.name || doc.custom_offline_id)) || "Offline Receipt")}</title>
                    </head>
                    <body>${html || ""}</body>
                </html>
            `;
        }
