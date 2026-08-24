"""Static contract notes for WMN Test Gateway.

Runtime behavior is exercised through the normal Frappe payment_gateway API after bench migrate.
"""

EXPECTED_MODES = {
    "TEST_APPROVED": "Approved",
    "TEST_DECLINED": "Declined",
    "TEST_TIMEOUT": "Timeout",
    "TEST_ERROR": "Error",
}

assert len(EXPECTED_MODES) == 4
