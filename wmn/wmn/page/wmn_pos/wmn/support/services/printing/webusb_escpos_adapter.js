/* Direct WebUSB ESC/POS adapter. No server or desktop bridge is used. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Services.Printing = ns.Services.Printing || {};
    ns.Services.Printing.Adapters = ns.Services.Printing.Adapters || {};

    const EscPos = () => ns.Services.Printing.EscPos;

    function supported() {
        return !!(window.isSecureContext && navigator.usb);
    }

    function makeFilters(settings) {
        const vendorId = EscPos().parseUsbId(settings?.webusb_vendor_id);
        const productId = EscPos().parseUsbId(settings?.webusb_product_id);
        if (vendorId === null) {
            return [{ classCode: 0x07 }]; // USB Printer class
        }
        const filter = { vendorId };
        if (productId !== null) filter.productId = productId;
        return [filter];
    }

    function deviceMatches(device, settings) {
        const vendorId = EscPos().parseUsbId(settings?.webusb_vendor_id);
        const productId = EscPos().parseUsbId(settings?.webusb_product_id);
        const serial = String(settings?.webusb_serial_number || "").trim();
        if (vendorId !== null && device.vendorId !== vendorId) return false;
        if (productId !== null && device.productId !== productId) return false;
        if (serial && String(device.serialNumber || "") !== serial) return false;
        return true;
    }

    async function pair(settings) {
        if (!supported()) {
            throw new Error("WebUSB is unavailable. Use HTTPS and a Chromium-based browser with WebUSB support.");
        }
        const device = await navigator.usb.requestDevice({ filters: makeFilters(settings) });
        return {
            webusb_vendor_id: EscPos().formatUsbId(device.vendorId),
            webusb_product_id: EscPos().formatUsbId(device.productId),
            webusb_serial_number: device.serialNumber || "",
            webusb_device_label: device.productName || device.manufacturerName || "USB Printer",
        };
    }

    async function findAuthorizedDevice(settings) {
        const devices = await navigator.usb.getDevices();
        return devices.find((device) => deviceMatches(device, settings)) || null;
    }

    async function openOutputEndpoint(device, settings) {
        if (!device.opened) await device.open();
        if (!device.configuration) {
            await device.selectConfiguration(parseInt(settings?.webusb_configuration || "1", 10) || 1);
        }

        let selected = null;
        for (const iface of device.configuration.interfaces || []) {
            for (const alt of iface.alternates || []) {
                const endpoint = (alt.endpoints || []).find((ep) => ep.direction === "out");
                if (endpoint) {
                    selected = {
                        interfaceNumber: iface.interfaceNumber,
                        alternateSetting: alt.alternateSetting,
                        endpointNumber: endpoint.endpointNumber,
                    };
                    break;
                }
            }
            if (selected) break;
        }

        if (!selected) throw new Error("No writable USB endpoint was found on this printer.");
        await device.claimInterface(selected.interfaceNumber);
        if (selected.alternateSetting !== undefined && selected.alternateSetting !== null) {
            try { await device.selectAlternateInterface(selected.interfaceNumber, selected.alternateSetting); } catch (e) {}
        }
        return selected;
    }

    async function transferChunks(device, endpointNumber, bytes) {
        const chunkSize = 16 * 1024;
        for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
            const result = await device.transferOut(endpointNumber, bytes.subarray(offset, offset + chunkSize));
            if (result?.status && result.status !== "ok") {
                throw new Error("USB print transfer failed: " + result.status);
            }
        }
    }

    async function sendRaw(rawText, settings) {
        if (!supported()) throw new Error("WebUSB printing is not supported by this browser/context.");
        const device = await findAuthorizedDevice(settings);
        if (!device) {
            throw new Error("The WebUSB printer is not paired. Open Printer Settings and connect it first.");
        }

        let endpoint = null;
        try {
            endpoint = await openOutputEndpoint(device, settings);
            const bytes = EscPos().buildRawJob(rawText, settings);
            await transferChunks(device, endpoint.endpointNumber, bytes);
            return true;
        } finally {
            if (device?.opened) {
                try { await device.close(); } catch (e) {}
            }
        }
    }

    ns.Services.Printing.Adapters.WebUSB = {
        id: "webusb",
        label: "Direct WebUSB / ESC-POS",
        capabilities: { raw: true, png: false, pdf: false, html: false },
        isSupported: supported,
        pair,
        sendRaw,
    };
})();
