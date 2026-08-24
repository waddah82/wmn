from __future__ import annotations

from .base import BasePaymentProvider, PaymentProviderError


class WMNTestGatewayProvider(BasePaymentProvider):
    """Deterministic test-only provider for exercising the WMN payment lifecycle."""

    provider_name = "WMN Test Gateway"

    def _mode(self):
        return str(self.profile.model_family or "").strip().upper()

    def _result(self, payload, status, message=""):
        reference = str(payload.get("client_reference") or "WMN-TEST")
        amount = payload.get("amount") or 0
        result = {
            "status": status,
            "transaction_id": f"TEST-{reference}",
            "reference_number": f"RRN-{reference[-12:]}",
            "authorization_code": "TESTAUTH" if status.lower() == "approved" else "",
            "payment_network": "WMN-TEST",
            "amount": amount,
            "message": message,
            "test_gateway": 1,
        }
        return result

    def authorize(self, payload):
        mode = self._mode()
        if mode == "TEST_APPROVED":
            return self._result(payload, "Approved", "WMN test authorization approved")
        if mode == "TEST_DECLINED":
            return self._result(payload, "Declined", "WMN test authorization declined")
        if mode == "TEST_TIMEOUT":
            return self._result(payload, "Timeout", "WMN test authorization timeout")
        if mode == "TEST_ERROR":
            raise PaymentProviderError("WMN test gateway simulated provider error")
        raise PaymentProviderError(f"Unsupported WMN test gateway model family: {mode or 'empty'}")

    def refund(self, payload):
        mode = self._mode()
        if mode == "TEST_APPROVED":
            return self._result(payload, "Approved", "WMN test refund approved")
        if mode == "TEST_DECLINED":
            return self._result(payload, "Declined", "WMN test refund declined")
        if mode == "TEST_TIMEOUT":
            return self._result(payload, "Timeout", "WMN test refund timeout")
        if mode == "TEST_ERROR":
            raise PaymentProviderError("WMN test gateway simulated refund error")
        raise PaymentProviderError(f"Unsupported WMN test gateway model family: {mode or 'empty'}")

    def void(self, payload):
        return self.refund(payload)

    def status(self, payload):
        mode = self._mode()
        if mode == "TEST_APPROVED":
            return self._result(payload, "Approved", "WMN test transaction is approved")
        if mode == "TEST_DECLINED":
            return self._result(payload, "Declined", "WMN test transaction is declined")
        if mode == "TEST_TIMEOUT":
            return self._result(payload, "Timeout", "WMN test transaction timed out")
        if mode == "TEST_ERROR":
            raise PaymentProviderError("WMN test gateway simulated status error")
        raise PaymentProviderError(f"Unsupported WMN test gateway model family: {mode or 'empty'}")
