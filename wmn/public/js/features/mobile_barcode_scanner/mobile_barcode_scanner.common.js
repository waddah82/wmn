/* Shared camera barcode adapter. Prefers a local camera path so scanning works offline. */
(function () {
    "use strict";

    window.WMN = window.WMN || {};
    window.WMN.Features = window.WMN.Features || {};

    const BARCODE_FORMATS = Object.freeze([
        "aztec",
        "codabar",
        "code_39",
        "code_93",
        "code_128",
        "data_matrix",
        "ean_8",
        "ean_13",
        "itf",
        "pdf417",
        "qr_code",
        "upc_a",
        "upc_e",
    ]);

    function extractText(data) {
        return String(
            data?.result?.text ||
            data?.decodedText ||
            data?.text ||
            data?.rawValue ||
            ""
        ).trim();
    }

    function isOffline() {
        try {
            if (typeof window.wmn_is_pos_offline === "function") return Boolean(window.wmn_is_pos_offline());
        } catch (error) {}
        return window.__wmn_pos_effective_offline === true || navigator.onLine === false;
    }

    function hasNativeDetector() {
        return typeof window.BarcodeDetector === "function";
    }

    function hasHtml5Qrcode() {
        return typeof window.Html5Qrcode === "function";
    }

    function canOpenLocal() {
        return Boolean(navigator.mediaDevices?.getUserMedia) && (hasNativeDetector() || hasHtml5Qrcode());
    }

    function ensureFrappeScanner() {
        if (!window.frappe?.ui?.Scanner) {
            throw new Error(__("Camera barcode scanner is not available in this session."));
        }
        return window.frappe.ui.Scanner;
    }

    function openFrappe(options = {}) {
        const Scanner = ensureFrappeScanner();
        return new Scanner({
            dialog: true,
            multiple: Boolean(options.multiple),
            on_scan(data) {
                const text = extractText(data);
                if (!text) return;
                options.onScan?.(text, data);
            },
        });
    }

    function stopTracks(stream) {
        (stream?.getTracks?.() || []).forEach((track) => {
            try { track.stop(); } catch (error) {}
        });
    }

    function createDetector() {
        if (!hasNativeDetector()) return null;
        try {
            return new window.BarcodeDetector({ formats: BARCODE_FORMATS.slice() });
        } catch (error) {
            try {
                return new window.BarcodeDetector();
            } catch (inner) {
                return null;
            }
        }
    }

    function openLocal(options = {}) {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error(__("Camera is not available in this browser."));
        }

        const detector = createDetector();
        if (!detector && !hasHtml5Qrcode()) {
            throw new Error(__("Camera barcode scanning is not available offline in this browser."));
        }

        let settled = false;
        let stream = null;
        let rafId = 0;
        let html5 = null;
        const scanAreaId = `wmn-local-barcode-scan-${Date.now()}`;

        const finish = (text, data) => {
            if (settled || !text) return;
            settled = true;
            options.onScan?.(text, data);
            if (!options.multiple) dialog.hide();
            else settled = false;
        };

        const stop = async () => {
            if (rafId) {
                window.cancelAnimationFrame(rafId);
                rafId = 0;
            }
            stopTracks(stream);
            stream = null;
            if (html5) {
                try { await html5.stop(); } catch (error) {}
                html5 = null;
            }
        };

        const dialog = new frappe.ui.Dialog({
            title: __("Scan Barcode"),
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "scan_area",
                    options: detector
                        ? `<div class="wmn-local-barcode-scanner" id="${scanAreaId}"><video playsinline autoplay muted></video><p class="text-muted text-center">${__("Point the camera at a barcode")}</p></div>`
                        : `<div class="wmn-local-barcode-scanner" id="${scanAreaId}"></div>`,
                },
            ],
            on_hide() {
                stop();
            },
        });

        const startNative = async (video) => {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: { ideal: "environment" },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
            });
            video.srcObject = stream;
            try { await video.play(); } catch (error) {}

            const tick = async () => {
                if (settled || !detector || video.readyState < 2) {
                    rafId = window.requestAnimationFrame(tick);
                    return;
                }
                try {
                    const codes = await detector.detect(video);
                    const text = extractText(codes?.[0]);
                    if (text) {
                        finish(text, { decodedText: text, result: { text } });
                        return;
                    }
                } catch (error) {}
                rafId = window.requestAnimationFrame(tick);
            };
            rafId = window.requestAnimationFrame(tick);
        };

        const startHtml5 = async () => {
            html5 = new window.Html5Qrcode(scanAreaId);
            await html5.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: 250 },
                (decodedText, decodedResult) => {
                    finish(extractText({ decodedText, result: decodedResult }), decodedResult);
                },
                () => {}
            );
        };

        dialog.show();
        window.setTimeout(() => {
            const video = dialog.$wrapper?.find?.("video")?.get?.(0);
            const starter = detector && video ? startNative(video) : startHtml5();
            Promise.resolve(starter).catch((error) => {
                dialog.hide();
                frappe.msgprint({
                    title: __("Camera Scanner"),
                    indicator: "red",
                    message: error?.message || String(error),
                });
            });
        }, 0);

        return dialog;
    }

    function open(options = {}) {
        if (canOpenLocal()) return openLocal(options);
        if (isOffline()) {
            throw new Error(__("Camera barcode scanning is not available offline in this browser."));
        }
        return openFrappe(options);
    }

    function openForPOS(selector) {
        return open({
            multiple: false,
            onScan(text) {
                if (selector?.wmn_submit_scanned_barcode) {
                    selector.wmn_submit_scanned_barcode(text, {
                        source: "camera",
                        focus: false,
                    });
                    return;
                }
                if (!selector?.search_field || typeof selector.set_search_value !== "function") return;
                selector.barcode_scanned = true;
                selector.set_search_value(text);
            },
        });
    }

    window.WMN.Features.MobileBarcodeScanner = {
        extractText,
        open,
        openForPOS,
        canOpenLocal,
        isOffline,
    };
})();
