#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${1:-$(cd "$(dirname "$0")/../../.." && pwd)}"
node "$APP_ROOT/wmn/public/js/pos_offline/features/payment_gateway/payment_gateway.contract.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/payment_gateway/tests/payment_gateway.lifecycle.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/payment_gateway/tests/payment_gateway.offline.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/discount/tests/discount.native_fields.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/discount/tests/discount.composition_policy.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/pricing_rule/tests/pricing_rule.parity.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/return/tests/return.financial.node.js"
node "$APP_ROOT/wmn/public/js/pos_offline/features/return/tests/return.offline.node.js"
python -m py_compile \
  "$APP_ROOT/wmn/payment_gateway/api.py" \
  "$APP_ROOT/wmn/payment_gateway/service.py" \
  "$APP_ROOT/wmn/payment_gateway/providers/test_gateway.py"
echo "WMN_PAYMENT_GATEWAY_STATIC_SUITE_PASS"
