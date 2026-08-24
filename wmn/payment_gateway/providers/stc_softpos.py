from __future__ import annotations

import requests

from .base import BasePaymentProvider, PaymentProviderError

class STCSoftPOSProvider(BasePaymentProvider):
    provider_name = 'STC SoftPOS'

    def _call(self, action, payload):
        base_url = (self.profile.api_base_url or "").rstrip("/")
        if not base_url:
            raise PaymentProviderError(f"{self.provider_name} API base URL is not configured")
        endpoint = self.profile.get(f"{action}_endpoint") or action
        url = f"{base_url}/{str(endpoint).lstrip('/')}"
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        api_key = self.profile.get_password("api_key") if self.profile.get("api_key") else ""
        api_secret = self.profile.get_password("api_secret") if self.profile.get("api_secret") else ""
        if api_key:
            headers["X-API-Key"] = api_key
        if api_secret:
            headers["Authorization"] = f"Bearer {api_secret}"
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=max(int(self.profile.timeout_seconds or 60), 5))
            body = response.json() if response.content else {}
        except Exception as exc:
            raise PaymentProviderError(f"{self.provider_name} connector failed: {exc}") from exc
        if not response.ok:
            raise PaymentProviderError(body.get("message") or body.get("error") or f"{self.provider_name} HTTP {response.status_code}")
        return body

    def authorize(self, payload): return self._call("authorize", payload)
    def refund(self, payload): return self._call("refund", payload)
    def void(self, payload): return self._call("void", payload)
    def status(self, payload): return self._call("status", payload)
