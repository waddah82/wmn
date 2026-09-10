/* Page-owned onScan-compatible scanner helper for WMN POS.
   Provides the subset used by ERPNext POS: attachTo, detachFrom, decodeKeyEvent,
   and _getNormalizedKeyNum. */
var onScan = window.onScan || (function () {
    var attachedTargets = new WeakMap();

    function getNormalizedKeyNum(event) {
        return event.which || event.keyCode || event.charCode || 0;
    }

    function defaultDecodeKeyEvent(event) {
        if (event.key && event.key.length === 1) return event.key;

        var code = getNormalizedKeyNum(event);
        if (code >= 48 && code <= 90) return String.fromCharCode(code);
        if (code >= 96 && code <= 105) return String(code - 96);
        if (code === 32) return " ";
        return "";
    }

    function isIgnoredTarget(target, ignoredSelector) {
        if (!target || !ignoredSelector || !target.matches) return false;
        return target.matches(ignoredSelector) || !!target.closest(ignoredSelector);
    }

    function attachTo(target, options) {
        if (!target || !target.addEventListener) return;

        detachFrom(target);

        var settings = Object.assign({
            avgTimeByChar: 30,
            minLength: 6,
            suffixKeyCodes: [9, 13],
            timeBeforeScanTest: 100,
            stopPropagation: false,
            preventDefault: false,
            ignoreIfFocusOn: false
        }, options || {});

        var buffer = "";
        var firstEventAt = 0;
        var lastEventAt = 0;
        var timeout = null;

        function reset() {
            buffer = "";
            firstEventAt = 0;
            lastEventAt = 0;
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
        }

        function finishScan(event) {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }

            if (!buffer) return;

            var elapsed = Math.max(lastEventAt - firstEventAt, 0);
            var looksLikeScan =
                buffer.length >= settings.minLength &&
                elapsed <= buffer.length * settings.avgTimeByChar + settings.timeBeforeScanTest;

            var scanned = buffer;
            reset();

            if (looksLikeScan && typeof settings.onScan === "function") {
                settings.onScan(scanned, scanned.length, elapsed, event);
            } else if (!looksLikeScan && typeof settings.onScanError === "function") {
                settings.onScanError(scanned, scanned.length, elapsed, event);
            }
        }

        function scheduleFinish(event) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(function () {
                finishScan(event);
            }, settings.timeBeforeScanTest);
        }

        function keydownHandler(event) {
            if (isIgnoredTarget(event.target, settings.ignoreIfFocusOn)) return;

            var code = api._getNormalizedKeyNum(event);
            if ((settings.suffixKeyCodes || []).indexOf(code) !== -1) {
                finishScan(event);
                return;
            }

            var decoded = api.decodeKeyEvent.call(api, event);
            if (!decoded) return;

            var now = Date.now();
            if (!firstEventAt) firstEventAt = now;
            lastEventAt = now;
            buffer += decoded;

            if (settings.stopPropagation) event.stopPropagation();
            if (settings.preventDefault) event.preventDefault();

            scheduleFinish(event);
        }

        function pasteHandler(event) {
            if (!settings.reactToPaste) return;
            var text = "";
            try {
                text = event.clipboardData.getData("text") || "";
            } catch (e) {
                text = "";
            }
            if (text && text.length >= settings.minLength && typeof settings.onScan === "function") {
                settings.onScan(text, text.length, 0, event);
            }
        }

        target.addEventListener("keydown", keydownHandler, true);
        target.addEventListener("paste", pasteHandler, true);

        attachedTargets.set(target, {
            keydownHandler: keydownHandler,
            pasteHandler: pasteHandler
        });
    }

    function detachFrom(target) {
        var handlers = target && attachedTargets.get(target);
        if (!handlers) return;

        target.removeEventListener("keydown", handlers.keydownHandler, true);
        target.removeEventListener("paste", handlers.pasteHandler, true);
        attachedTargets.delete(target);
    }

    var api = {
        attachTo: attachTo,
        detachFrom: detachFrom,
        decodeKeyEvent: defaultDecodeKeyEvent,
        _getNormalizedKeyNum: getNormalizedKeyNum
    };

    window.onScan = api;
    return api;
})();
