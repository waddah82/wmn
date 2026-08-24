from __future__ import annotations

class PaymentProviderError(Exception):
    pass

class BasePaymentProvider:
    provider_name = "Generic"
    def __init__(self, profile):
        self.profile = profile
    def authorize(self, payload):
        raise PaymentProviderError("Provider authorization is not configured for this integration type")
    def refund(self, payload):
        raise PaymentProviderError("Provider refund is not configured for this integration type")
    def void(self, payload):
        raise PaymentProviderError("Provider void is not configured for this integration type")
    def status(self, payload):
        raise PaymentProviderError("Provider status is not configured for this integration type")
