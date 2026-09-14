#!/usr/bin/env python3
"""Import ERPNext v16 POS component files into this WMN-owned page.

Default mode is dry-run: files are transformed and compared, but not written.
Pass --write to update upstream_v16/ and rebuild wmn_pos.js.
"""

from __future__ import annotations

import argparse
import difflib
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent
UPSTREAM_DIR = ROOT / "upstream_v16"
SOURCE_HEADER = "/* Copied from ERPNext version-16 point_of_sale source; WMN-owned namespace. */"


@dataclass(frozen=True)
class Component:
    filename: str
    class_name: str


COMPONENTS = (
    Component("pos_number_pad.js", "NumberPad"),
    Component("pos_item_details.js", "ItemDetails"),
    Component("pos_item_cart.js", "ItemCart"),
    Component("pos_item_selector.js", "ItemSelector"),
    Component("pos_payment.js", "Payment"),
    Component("pos_past_order_list.js", "PastOrderList"),
    Component("pos_past_order_summary.js", "PastOrderSummary"),
    Component("pos_controller.js", "Controller"),
)


def find_point_of_sale_dir(source: Path) -> Path:
    source = source.resolve()
    candidates = [
        source,
        source / "erpnext" / "selling" / "page" / "point_of_sale",
        source / "apps" / "erpnext" / "erpnext" / "selling" / "page" / "point_of_sale",
    ]
    for candidate in candidates:
        if all((candidate / component.filename).exists() for component in COMPONENTS):
            return candidate
    raise SystemExit(
        "Could not find ERPNext POS source files. Pass either the point_of_sale "
        "directory or the ERPNext app root with --erpnext-path."
    )


def transform_source(raw: str, component: Component) -> str:
    text = raw.replace('frappe.provide("erpnext.PointOfSale");', "")
    text = text.replace("frappe.provide('erpnext.PointOfSale');", "")
    text = text.replace(
        f"erpnext.PointOfSale.{component.class_name} = class",
        f"window.WMN_POS.Source.{component.class_name} = class",
    )
    for item in COMPONENTS:
        text = text.replace(
            f"new erpnext.PointOfSale.{item.class_name}",
            f"new window.WMN_POS.Source.{item.class_name}",
        )
        text = text.replace(
            f"erpnext.PointOfSale.{item.class_name}",
            f"window.WMN_POS.Source.{item.class_name}",
        )
    text = text.strip()
    if not text.startswith(SOURCE_HEADER):
        text = SOURCE_HEADER + "\n" + text
    return text.rstrip() + "\n"


def unified_diff(path: Path, before: str, after: str) -> str:
    return "".join(
        difflib.unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=str(path) + " (current)",
            tofile=str(path) + " (erpnext-v16)",
        )
    )


def run_build() -> None:
    subprocess.run(
        [sys.executable, str(ROOT / "build_wmn_pos_bundle.py")],
        cwd=str(ROOT.parents[3]),
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--erpnext-path",
        required=True,
        help="Path to ERPNext app root or erpnext/selling/page/point_of_sale directory.",
    )
    parser.add_argument(
        "--component",
        choices=[component.filename for component in COMPONENTS],
        action="append",
        help="Import only this component file. May be passed more than once.",
    )
    parser.add_argument("--write", action="store_true", help="Write changed files into upstream_v16/.")
    parser.add_argument("--no-build", action="store_true", help="Do not rebuild wmn_pos.js after --write.")
    args = parser.parse_args()

    pos_dir = find_point_of_sale_dir(Path(args.erpnext_path))
    selected = set(args.component or [])
    changed = []
    if args.write:
        UPSTREAM_DIR.mkdir(parents=True, exist_ok=True)

    for component in COMPONENTS:
        if selected and component.filename not in selected:
            continue
        source_path = pos_dir / component.filename
        target_path = UPSTREAM_DIR / component.filename
        transformed = transform_source(source_path.read_text(encoding="utf-8"), component)
        current = target_path.read_text(encoding="utf-8") if target_path.exists() else ""
        if current == transformed:
            print(f"unchanged {component.filename}")
            continue
        changed.append(component.filename)
        print(f"changed {component.filename}")
        print(unified_diff(target_path, current, transformed))
        if args.write:
            target_path.write_text(transformed, encoding="utf-8")

    if args.write and changed and not args.no_build:
        run_build()
        print("rebuilt wmn_pos.js")

    if not changed:
        print("No upstream_v16 changes detected.")
    elif not args.write:
        print("Dry-run only. Re-run with --write to update upstream_v16 and rebuild wmn_pos.js.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
