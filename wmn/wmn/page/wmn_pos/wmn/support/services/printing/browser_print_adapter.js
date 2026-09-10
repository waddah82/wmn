/* Browser print adapter. Uses the browser/OS print dialog and requires no local bridge. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function printHtml(html) {
        const iframe = document.createElement("iframe");
        iframe.setAttribute("aria-hidden", "true");
        Object.assign(iframe.style, {
            position: "fixed",
            right: "0",
            bottom: "0",
            width: "1px",
            height: "1px",
            border: "0",
            opacity: "0",
            pointerEvents: "none",
        });
        document.body.appendChild(iframe);

        try {
            const doc = iframe.contentDocument;
            doc.open();
            doc.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Receipt</title>" +
                "<style>html,body{margin:0;padding:0;background:#fff} @media print{body{margin:0}}</style>" +
                "</head><body>" + String(html || "") + "</body></html>");
            doc.close();
            await wait(120);
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            await wait(500);
            return true;
        } finally {
            setTimeout(() => iframe.remove(), 1200);
        }
    }

    function rawToHtml(rawText) {
        const escaped = window.frappe?.utils?.escape_html
            ? frappe.utils.escape_html(String(rawText || ""))
            : String(rawText || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        return "<pre style='font-family:monospace;white-space:pre-wrap;margin:0;padding:4mm;font-size:11px'>" + escaped + "</pre>";
    }

    async function printImage(base64) {
        const src = "data:image/png;base64," + String(base64 || "").replace(/^data:image\/[^;]+;base64,/, "");
        return printHtml("<img alt='Receipt' src='" + src + "' style='display:block;max-width:100%;height:auto;margin:0 auto'>");
    }

    async function printPdf(base64) {
        const clean = String(base64 || "").replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
        const binary = atob(clean);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        const win = window.open(url, "_blank");
        if (!win) {
            URL.revokeObjectURL(url);
            throw new Error("Popup blocked. Allow popups to print the PDF.");
        }
        setTimeout(() => {
            try { win.focus(); win.print(); } catch (e) {}
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }, 500);
        return true;
    }

    ns.Services.Printing.Adapters.Browser = {
        id: "browser",
        label: "Browser Print",
        capabilities: { raw: true, png: true, pdf: true, html: true },
        isSupported() { return typeof window.print === "function"; },
        sendRaw(rawText) { return printHtml(rawToHtml(rawText)); },
        sendPng(base64) { return printImage(base64); },
        sendPdf(base64) { return printPdf(base64); },
        sendHtml(html) { return printHtml(html); },
    };
})();
