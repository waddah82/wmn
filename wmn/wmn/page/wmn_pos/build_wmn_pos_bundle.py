#!/usr/bin/env python3
"""Build the runtime WMN POS page bundle from organized source files.

Frappe loads the page entry named wmn_pos.js, so runtime still uses one file.
Developers should edit the source files listed in bundle_manifest.json, then run
this script to regenerate wmn_pos.js.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "bundle_manifest.json"


def read_text(relative_path: str) -> str:
    return (ROOT / relative_path).read_text().rstrip()


def section(marker: str, body: str) -> str:
    return f"/* BEGIN {marker} */\n{body}\n/* END {marker} */\n"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    output = []
    output.append("/* WMN POS page source. Copied from ERPNext v16 and modified directly for WMN. */")
    output.append('frappe.provide("wmn.PointOfSale");')
    output.append("window.WMN_POS = window.WMN_POS || {};")
    output.append(
        """Object.assign(window.WMN_POS, {
    Source: window.WMN_POS.Source || {},
    Classes: window.WMN_POS.Classes || {},
    ClassMethods: window.WMN_POS.ClassMethods || {},
    Features: window.WMN_POS.Features || {},
    Services: window.WMN_POS.Services || {},
    Common: window.WMN_POS.Common || {},
    UI: window.WMN_POS.UI || {},
});"""
    )
    output.append("")

    for item in manifest["vendor"]:
        output.append(section(item["marker"], read_text(item["path"])))

    output.append("/* BEGIN embedded WMN POS support scripts. */")
    output.append("/* These files are copied into the page so /app/wmn-pos does not load public POS assets at runtime. */")
    for item in manifest["support"]:
        output.append(section(item["marker"], read_text(item["path"])))
    output.append("/* END embedded WMN POS support scripts. */")
    output.append("")

    output.append("window.wmn_pos_install_owned_source = function wmn_pos_install_owned_source() {")
    output.append("    if (window.__wmn_pos_owned_source_installed) return;")
    output.append("    window.__wmn_pos_owned_source_installed = true;")
    output.append("")
    for item in manifest["owned_source"]:
        output.append(section(item["marker"], read_text(item["path"])))
    output.append("};")
    output.append("")
    output.append(read_text(manifest["entry"]))
    output.append("")

    (ROOT / manifest["generated_file"]).write_text("\n".join(output))


if __name__ == "__main__":
    main()
