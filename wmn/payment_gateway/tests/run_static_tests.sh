#!/usr/bin/env bash
set -euo pipefail
APP_ROOT="${1:-$(cd "$(dirname "$0")/../../.." && pwd)}"
python3 -m py_compile \
  "$APP_ROOT/wmn/payment_gateway/api.py" \
  "$APP_ROOT/wmn/payment_gateway/service.py" \
  "$APP_ROOT/wmn/payment_gateway/providers/test_gateway.py"
echo "WMN_PAYMENT_GATEWAY_STATIC_SUITE_PASS"
