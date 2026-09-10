/*
 * WMN Barcode Printer local renderer.
 * JsBarcode-compatible browser API for the barcode formats exposed by WMN.
 * Frappe-compatible default: omitted/auto format renders CODE128.
 * The encoding behavior follows the public barcode specifications and JsBarcode conventions.
 */
(function (global) {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const CODE128_BARS = [
        11011001100,11001101100,11001100110,10010011000,10010001100,10001001100,
        10011001000,10011000100,10001100100,11001001000,11001000100,11000100100,
        10110011100,10011011100,10011001110,10111001100,10011101100,10011100110,
        11001110010,11001011100,11001001110,11011100100,11001110100,11101101110,
        11101001100,11100101100,11100100110,11101100100,11100110100,11100110010,
        11011011000,11011000110,11000110110,10100011000,10001011000,10001000110,
        10110001000,10001101000,10001100010,11010001000,11000101000,11000100010,
        10110111000,10110001110,10001101110,10111011000,10111000110,10001110110,
        11101110110,11010001110,11000101110,11011101000,11011100010,11011101110,
        11101011000,11101000110,11100010110,11101101000,11101100010,11100011010,
        11101111010,11001000010,11110001010,10100110000,10100001100,10010110000,
        10010000110,10000101100,10000100110,10110010000,10110000100,10011010000,
        10011000010,10000110100,10000110010,11000010010,11001010000,11110111010,
        11000010100,10001111010,10100111100,10010111100,10010011110,10111100100,
        10011110100,10011110010,11110100100,11110010100,11110010010,11011011110,
        11011110110,11110110110,10101111000,10100011110,10001011110,10111101000,
        10111100010,11110101000,11110100010,10111011110,10111101110,11101011110,
        11110101110,11010000100,11010010000,11010011100,1100011101011,
    ].map(String);

    const EAN_L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
    const EAN_G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
    const EAN_R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
    const EAN13_STRUCTURE = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
    const ITF_DIGITS = ["00110","10001","01001","11000","00101","10100","01100","00011","10010","01010"];
    const CODE39_SYMBOLS = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","-","."," ","$","/","+","%","*"];
    const CODE39_PATTERNS = [20957,29783,23639,30485,20951,29813,23669,20855,29789,23645,29975,23831,30533,22295,30149,24005,21623,29981,23837,22301,30023,23879,30545,22343,30161,24017,21959,30065,23921,22385,29015,18263,29141,17879,29045,18293,17783,29021,18269,17477,17489,17681,20753,35770].map((n) => n.toString(2));

    function invalid(format, value) {
        const error = new Error(`"${value}" is not a valid input for ${format}`);
        error.name = "InvalidInputException";
        throw error;
    }

    function digits(value) {
        return /^[0-9]+$/.test(value);
    }

    function eanChecksum(body) {
        let sum = 0;
        for (let i = 0; i < body.length; i++) {
            const digit = Number(body[i]);
            const fromRight = body.length - i;
            sum += digit * (fromRight % 2 === 0 ? 1 : 3);
        }
        return String((10 - (sum % 10)) % 10);
    }

    function normalizeEan(value, fullLength, format) {
        if (!digits(value) || ![fullLength - 1, fullLength].includes(value.length)) invalid(format, value);
        if (value.length === fullLength - 1) return value + eanChecksum(value);
        const body = value.slice(0, -1);
        if (eanChecksum(body) !== value.slice(-1)) invalid(format, value);
        return value;
    }

    function encodeCode128(value) {
        if (!value || /[^\x20-\x7E]/.test(value)) invalid("CODE128", value);
        let start;
        let codes = [];
        if (/^\d+$/.test(value) && value.length >= 4 && value.length % 2 === 0) {
            start = 105;
            for (let i = 0; i < value.length; i += 2) codes.push(Number(value.slice(i, i + 2)));
        } else {
            start = 104;
            codes = Array.from(value, (ch) => ch.charCodeAt(0) - 32);
        }
        let checksum = start;
        codes.forEach((code, index) => { checksum += code * (index + 1); });
        checksum %= 103;
        return {
            data: [start, ...codes, checksum, 106].map((code) => CODE128_BARS[code]).join(""),
            text: value,
        };
    }

    function encodeEan13(value) {
        const full = normalizeEan(value, 13, "EAN13");
        const structure = EAN13_STRUCTURE[Number(full[0])];
        let pattern = "101";
        for (let i = 1; i <= 6; i++) pattern += (structure[i - 1] === "L" ? EAN_L : EAN_G)[Number(full[i])];
        pattern += "01010";
        for (let i = 7; i <= 12; i++) pattern += EAN_R[Number(full[i])];
        pattern += "101";
        return { data: pattern, text: full };
    }

    function encodeEan8(value) {
        const full = normalizeEan(value, 8, "EAN8");
        let pattern = "101";
        for (let i = 0; i < 4; i++) pattern += EAN_L[Number(full[i])];
        pattern += "01010";
        for (let i = 4; i < 8; i++) pattern += EAN_R[Number(full[i])];
        pattern += "101";
        return { data: pattern, text: full };
    }

    function encodeUpc(value) {
        const full = normalizeEan(value, 12, "UPC");
        let pattern = "101";
        for (let i = 0; i < 6; i++) pattern += EAN_L[Number(full[i])];
        pattern += "01010";
        for (let i = 6; i < 12; i++) pattern += EAN_R[Number(full[i])];
        pattern += "101";
        return { data: pattern, text: full };
    }

    function encodeItf(value) {
        if (!digits(value) || value.length < 2 || value.length % 2 !== 0) invalid("ITF", value);
        let pattern = "1010";
        for (let i = 0; i < value.length; i += 2) {
            const bars = ITF_DIGITS[Number(value[i])];
            const spaces = ITF_DIGITS[Number(value[i + 1])];
            for (let p = 0; p < 5; p++) {
                pattern += bars[p] === "1" ? "111" : "1";
                pattern += spaces[p] === "1" ? "000" : "0";
            }
        }
        pattern += "11101";
        return { data: pattern, text: value };
    }

    function encodeCode39(value) {
        const upper = String(value || "").toUpperCase();
        if (!upper || !/^[0-9A-Z\-. $/+%]+$/.test(upper)) invalid("CODE39", value);
        const symbolPattern = (symbol) => {
            const index = CODE39_SYMBOLS.indexOf(symbol);
            return index >= 0 ? CODE39_PATTERNS[index] : "";
        };
        let pattern = symbolPattern("*");
        for (const ch of upper) pattern += "0" + symbolPattern(ch);
        pattern += "0" + symbolPattern("*");
        return { data: pattern, text: upper };
    }

    function chooseEncoder(format, value) {
        const normalized = String(format || "auto").toUpperCase().replace(/[\s_-]+/g, "");
        if (!normalized || normalized === "AUTO" || normalized === "CODE128") return encodeCode128(value);
        if (normalized === "CODE39") return encodeCode39(value);
        if (normalized === "EAN13" || normalized === "EAN") return value.length === 8 ? encodeEan8(value) : encodeEan13(value);
        if (normalized === "EAN8") return encodeEan8(value);
        if (normalized === "UPC" || normalized === "UPCA") return encodeUpc(value);
        if (normalized === "ITF") return encodeItf(value);
        invalid(format || "CODE128", value);
    }

    function setAttr(node, name, value) {
        if (node && typeof node.setAttribute === "function") node.setAttribute(name, String(value));
    }

    function append(node, child) {
        if (node && typeof node.appendChild === "function") node.appendChild(child);
    }

    function createSvgChild(documentRef, name) {
        return documentRef.createElementNS(SVG_NS, name);
    }

    function renderSvg(svg, encoded, options) {
        const documentRef = options.xmlDocument || svg.ownerDocument || global.document;
        if (!documentRef || typeof documentRef.createElementNS !== "function") throw new Error("SVG document is not available.");
        while (svg.firstChild && typeof svg.removeChild === "function") svg.removeChild(svg.firstChild);

        const moduleWidth = Number(options.width || 2);
        const barHeight = Number(options.height || 100);
        const margin = Number(options.margin ?? 10);
        const fontSize = Number(options.fontSize || 20);
        const textMargin = Number(options.textMargin ?? 2);
        const displayValue = options.displayValue !== false;
        const totalWidth = encoded.data.length * moduleWidth + (margin * 2);
        const totalHeight = barHeight + (displayValue ? fontSize + textMargin : 0) + (margin * 2);

        setAttr(svg, "xmlns", SVG_NS);
        setAttr(svg, "width", `${totalWidth}px`);
        setAttr(svg, "height", `${totalHeight}px`);
        setAttr(svg, "viewBox", `0 0 ${totalWidth} ${totalHeight}`);

        const group = createSvgChild(documentRef, "g");
        setAttr(group, "transform", `translate(${margin}, ${margin})`);
        append(svg, group);

        let runStart = -1;
        const flush = (endIndex) => {
            if (runStart < 0) return;
            const rect = createSvgChild(documentRef, "rect");
            setAttr(rect, "x", runStart * moduleWidth);
            setAttr(rect, "y", 0);
            setAttr(rect, "width", (endIndex - runStart) * moduleWidth);
            setAttr(rect, "height", barHeight);
            setAttr(rect, "fill", options.lineColor || "#000000");
            append(group, rect);
            runStart = -1;
        };
        for (let i = 0; i < encoded.data.length; i++) {
            if (encoded.data[i] === "1") {
                if (runStart < 0) runStart = i;
            } else {
                flush(i);
            }
        }
        flush(encoded.data.length);

        if (displayValue) {
            const text = createSvgChild(documentRef, "text");
            setAttr(text, "x", (totalWidth - (margin * 2)) / 2);
            setAttr(text, "y", barHeight + textMargin + fontSize);
            setAttr(text, "text-anchor", "middle");
            setAttr(text, "font-size", fontSize);
            setAttr(text, "font-family", options.font || "monospace");
            if (typeof documentRef.createTextNode === "function") append(text, documentRef.createTextNode(options.text ?? encoded.text));
            else text.textContent = options.text ?? encoded.text;
            append(group, text);
        }
        return svg;
    }

    function JsBarcode(element, value, options) {
        const opts = Object.assign({ format: "auto", width: 2, height: 100, displayValue: true, margin: 10 }, options || {});
        if (!element) throw new Error("No element to render on was provided.");
        const encoded = chooseEncoder(opts.format, String(value ?? ""));
        if (String(element.nodeName || "").toLowerCase() !== "svg") throw new Error("WMN Barcode Printer renderer requires an SVG element.");
        renderSvg(element, encoded, opts);
        return element;
    }

    JsBarcode.getModule = function (name) {
        const key = String(name || "").toUpperCase();
        return ["CODE128","CODE39","EAN13","EAN8","UPC","ITF"].includes(key) ? key : undefined;
    };
    JsBarcode.__wmn_local_renderer = true;
    global.JsBarcode = JsBarcode;
})(window);
