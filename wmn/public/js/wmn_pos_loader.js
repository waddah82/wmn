/* Compatibility manifest for shared WMN retail tests. Runtime POS pages load pos_offline/wmn_pos_loader.js. */
const version = "20260907_retail_tools_v20";
const manifest = [
    "features/barcode_printing/vendor/jsbarcode.wmn.js",
    "features/barcode_printing/barcode_printing.common.js",
];

window.__wmn_pos_loader_manifest = { version, manifest };
