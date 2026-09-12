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
        iframe.className = "wmn-hidden-print-frame";
        document.body.appendChild(iframe);

        try {
            const doc = iframe.contentDocument;
            const stylesheet = window.WMN_POS?.UI?.PAGE_STYLESHEET_HREF || "/assets/wmn/css/wmn_pos.css";
            doc.open();
            doc.write("<!doctype html><html><head><meta charset='utf-8'><title>WMN Receipt</title>" +
                "<link rel='stylesheet' href='" + stylesheet + "'>" +
                "</head><body class='wmn-browser-print-body'>" + String(html || "") + "</body></html>");
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
        return "<pre class='wmn-browser-print-raw'>" + escaped + "</pre>";
    }

    async function printImage(base64) {
        const src = "data:image/png;base64," + String(base64 || "").replace(/^data:image\/[^;]+;base64,/, "");
        return printHtml("<img class='wmn-browser-print-image' alt='Receipt' src='" + src + "'>");
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
