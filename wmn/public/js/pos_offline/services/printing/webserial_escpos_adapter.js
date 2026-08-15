/* Direct Web Serial ESC/POS adapter. No server or desktop bridge is used. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    const EscPos = () => ns.Services.Printing.EscPos;

    function supported() {
        return !!(window.isSecureContext && navigator.serial);
    }

    function portMatches(port, settings) {
        const info = typeof port.getInfo === "function" ? port.getInfo() : {};
        const vendorId = EscPos().parseUsbId(settings?.webserial_vendor_id);
        const productId = EscPos().parseUsbId(settings?.webserial_product_id);
        if (vendorId !== null && info.usbVendorId !== vendorId) return false;
        if (productId !== null && info.usbProductId !== productId) return false;
        return true;
    }

    async function pair() {
        if (!supported()) {
            throw new Error("Web Serial is unavailable. Use HTTPS and a Chromium-based browser with Web Serial support.");
        }
        const port = await navigator.serial.requestPort();
        const info = typeof port.getInfo === "function" ? port.getInfo() : {};
        return {
            webserial_vendor_id: info.usbVendorId ? EscPos().formatUsbId(info.usbVendorId) : "",
            webserial_product_id: info.usbProductId ? EscPos().formatUsbId(info.usbProductId) : "",
            webserial_device_label: [info.usbVendorId, info.usbProductId].filter(Boolean).map((v) => EscPos().formatUsbId(v)).join(":"),
        };
    }

    async function findAuthorizedPort(settings) {
        const ports = await navigator.serial.getPorts();
        return ports.find((port) => portMatches(port, settings)) || ports[0] || null;
    }

    function serialOptions(settings) {
        return {
            baudRate: parseInt(settings?.webserial_baud_rate || "9600", 10) || 9600,
            dataBits: parseInt(settings?.webserial_data_bits || "8", 10) || 8,
            stopBits: parseInt(settings?.webserial_stop_bits || "1", 10) || 1,
            parity: String(settings?.webserial_parity || "none"),
            flowControl: String(settings?.webserial_flow_control || "none"),
        };
    }

    async function sendRaw(rawText, settings) {
        if (!supported()) throw new Error("Web Serial printing is not supported by this browser/context.");
        const port = await findAuthorizedPort(settings);
        if (!port) {
            throw new Error("The Web Serial printer is not paired. Open Printer Settings and connect it first.");
        }

        let openedHere = false;
        try {
            if (!port.writable) {
                await port.open(serialOptions(settings));
                openedHere = true;
            }
            if (!port.writable) throw new Error("The serial port is not writable.");
            const writer = port.writable.getWriter();
            try {
                await writer.write(EscPos().buildRawJob(rawText, settings));
            } finally {
                writer.releaseLock();
            }
            return true;
        } finally {
            if (openedHere) {
                try { await port.close(); } catch (e) {}
            }
        }
    }

    ns.Services.Printing.Adapters.WebSerial = {
        id: "webserial",
        label: "Direct WebSerial / ESC-POS",
        capabilities: { raw: true, png: false, pdf: false, html: false },
        isSupported: supported,
        pair,
        sendRaw,
    };
})();
