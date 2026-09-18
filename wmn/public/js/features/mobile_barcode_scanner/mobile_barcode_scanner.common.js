/* Shared camera barcode adapter. Prefers a local camera path so scanning works offline. */
(function () {
    "use strict";

    window.WMN = window.WMN || {};
    window.WMN.Features = window.WMN.Features || {};
    let activeClose = null;
    let opening = null;
    let closing = Promise.resolve();

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

    function waitForScannerElement(elementId, attempts = 50) {
        return new Promise((resolve, reject) => {
            const check = () => {
                const element = document.getElementById(elementId);
                if (element) {
                    resolve(element);
                    return;
                }
                attempts -= 1;
                if (attempts <= 0) {
                    reject(new Error(`HTML Element with id=${elementId} not found`));
                    return;
                }
                window.setTimeout(check, 30);
            };
            check();
        });
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
        let stopPromise = null;
        const scanAreaId = `wmn-local-barcode-scan-${Date.now()}`;
        const scanMarkup = detector
            ? `<div class="wmn-local-barcode-scanner" id="${scanAreaId}"><video playsinline autoplay muted></video><p class="text-muted text-center">${__("Point the camera at a barcode")}</p></div>`
            : `<div class="wmn-local-barcode-scanner" id="${scanAreaId}"></div>`;

        const finish = (text, data) => {
            if (settled || !text) return;
            settled = true;
            Promise.resolve(options.onScan?.(text, data)).finally(async () => {
                if (!options.multiple) {
                    await stop();
                    dialog.hide();
                } else {
                    settled = false;
                }
            });
        };

        const stop = () => {
            if (stopPromise) return stopPromise;
            stopPromise = (async () => {
                if (rafId) {
                    window.cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                stopTracks(stream);
                stream = null;
                const currentHtml5 = html5;
                html5 = null;
                if (currentHtml5) {
                    try { await currentHtml5.stop(); } catch (error) {}
                    try { await currentHtml5.clear(); } catch (error) {}
                }
            })();
            return stopPromise;
        };

        const dialog = new frappe.ui.Dialog({
            title: __("Scan Barcode"),
            fields: [
                {
                    fieldtype: "HTML",
                    fieldname: "scan_area",
                    options: "",
                },
            ],
            on_hide() {
                if (activeClose === stop) activeClose = null;
                closing = stop();
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
            await waitForScannerElement(scanAreaId);
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
        const scanField = dialog.get_field?.("scan_area") || dialog.fields_dict?.scan_area;
        scanField?.$wrapper?.html?.(scanMarkup);
        activeClose = stop;
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

    async function close() {
        await closing;
        const closer = activeClose;
        activeClose = null;
        if (closer) closing = Promise.resolve(closer());
        await closing;
    }

    function open(options = {}) {
        if (opening) return opening;
        opening = (async () => {
            await close();
            if (!canOpenLocal()) {
                throw new Error(__("Local camera barcode scanning is not available in this browser."));
            }
            return openLocal(options);
        })().finally(() => {
            opening = null;
        });
        return opening;
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
        close,
    };
})();
