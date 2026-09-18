#!/bin/bash
# Run this from the WMN app root (the folder that contains wmn/public and wmn/wmn).
# Example: cd /home/frappe/frappe-bench/apps/wmn && bash install_search_scan_overlay.sh
set -euo pipefail

BRANCH="${WMN_OVERLAY_BRANCH:-cursor/wmn-pos-clean-page-eccb}"
REPO="${WMN_OVERLAY_REPO:-waddah82/wmn}"
BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}"

FILES=(
  "wmn/public/css/wmn_pos.css"
  "wmn/public/js/features/mobile_barcode_scanner/mobile_barcode_scanner.common.js"
  "wmn/public/js/features/mobile_barcode_scanner/tests/mobile_barcode_scanner.node.js"
  "wmn/setup/pos_profile_settings.py"
  "wmn/wmn/doctype/wmn_pos_profile_settings/wmn_pos_profile_settings.json"
  "wmn/wmn/page/wmn_pos/wmn/components/item_selector/class.js"
  "wmn/wmn/page/wmn_pos/wmn/components/item_selector/methods.js"
  "wmn/wmn/page/wmn_pos/wmn/support/features/barcode_scan_quantity/barcode_scan_quantity.ui.js"
  "wmn/wmn/page/wmn_pos/wmn/support/features/barcode_scan_quantity/tests/barcode_scan_quantity.ui.node.js"
  "wmn/wmn/page/wmn_pos/wmn/support/features/ui_preferences/ui_preferences.common.js"
  "wmn/wmn/page/wmn_pos/wmn/support/services/settings/pos_profile_settings.js"
  "wmn/wmn/page/wmn_pos/wmn/support/ui/dialog_manager.js"
  "wmn/wmn/page/wmn_pos/wmn_pos.js"
)

if [ ! -d "wmn/public" ] || [ ! -d "wmn/wmn/page/wmn_pos" ]; then
  echo "Run this script from the WMN app root (apps/wmn)."
  exit 1
fi

for f in "${FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  echo "Downloading $f"
  curl -fsSL "$BASE/$f" -o "$f"
done

echo
echo "Files copied. Next:"
echo "  bench --site YOUR_SITE migrate"
echo "  bench build --app wmn"
echo "  bench --site YOUR_SITE clear-cache"
