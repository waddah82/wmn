from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timezone

import requests

from .base import BasePaymentProvider, PaymentProviderError


class GeideaProvider(BasePaymentProvider):
    """Geidea KSA Checkout / transaction-management adapter.

    WMN intentionally uses Geidea Checkout (HPP) for browser POS payments so card
    data never passes through WMN. Session creation and transaction verification
    are server-to-server operations.
    """

    provider_name = "Geidea"
    KSA_API_BASE = "https://api.ksamerchant.geidea.net"
    KSA_HPP_SCRIPT = "https://www.ksamerchant.geidea.net/hpp/geideaCheckout.min.js"
    KSA_HPP_CHECKOUT = "https://www.ksamerchant.geidea.net/hpp/checkout/"
    PAID_DETAILED_STATUSES = {"paid", "captured", "settled", "partiallyrefunded", "refunded"}

    def _credentials(self):
        public_key = self.profile.get_password("api_key") if self.profile.get("api_key") else ""
        api_password = self.profile.get_password("api_secret") if self.profile.get("api_secret") else ""
        if not public_key or not api_password:
            raise PaymentProviderError(
                "Geidea Merchant Public Key and API Password are required in the gateway profile"
            )
        return str(public_key).strip(), str(api_password)

    def _api_base(self):
        # Allow an explicit Geidea-compatible endpoint for certified test/proxy environments,
        # otherwise use the official KSA merchant endpoint.
        return (self.profile.api_base_url or self.KSA_API_BASE).rstrip("/")

    def _basic_auth(self):
        public_key, api_password = self._credentials()
        token = base64.b64encode(f"{public_key}:{api_password}".encode("utf-8")).decode("ascii")
        return f"Basic {token}"

    def _headers(self):
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": self._basic_auth(),
        }

    def _timeout(self):
        return max(int(self.profile.timeout_seconds or 60), 5)

    @staticmethod
    def _timestamp():
        # Geidea signs the exact timestamp sent in the request body.
        return datetime.now(timezone.utc).strftime("%Y/%m/%d %H:%M:%S")

    @staticmethod
    def _amount(value):
        return f"{float(value or 0):.2f}"

    @staticmethod
    def _hmac_signature(data, api_password):
        digest = hmac.new(
            str(api_password).encode("utf-8"),
            str(data).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("ascii")

    def _session_signature(self, amount, currency, merchant_reference_id, timestamp):
        public_key, api_password = self._credentials()
        data = f"{public_key}{self._amount(amount)}{currency}{merchant_reference_id}{timestamp}"
        return self._hmac_signature(data, api_password)

    def _refund_signature(self, refund_amount, order_id, timestamp):
        public_key, api_password = self._credentials()
        # Geidea Refund signature order: Timestamp + MerchantPublicKey + RefundAmount + OrderID.
        data = f"{timestamp}{public_key}{self._amount(refund_amount)}{order_id}"
        return self._hmac_signature(data, api_password)

    def _request(self, method, path, *, payload=None, params=None):
        url = f"{self._api_base()}/{str(path).lstrip('/')}"
        try:
            response = requests.request(
                method,
                url,
                json=payload,
                params=params,
                headers=self._headers(),
                timeout=self._timeout(),
            )
            try:
                body = response.json() if response.content else {}
            except Exception:
                body = {"message": response.text or ""}
        except requests.Timeout as exc:
            raise PaymentProviderError("Geidea request timed out") from exc
        except Exception as exc:
            raise PaymentProviderError(f"Geidea connector failed: {exc}") from exc

        if not response.ok:
            message = (
                body.get("detailedResponseMessage")
                or body.get("responseMessage")
                or body.get("message")
                or body.get("error")
                or f"Geidea HTTP {response.status_code}"
            )
            raise PaymentProviderError(message)
        return body

    def authorize(self, payload):
        """Create a Geidea Checkout session; client completes payment in HPP."""
        amount = float(payload.get("amount") or 0)
        if amount <= 0:
            raise PaymentProviderError("Geidea payment amount must be greater than zero")

        currency = str(payload.get("currency") or "SAR").upper()
        timestamp = self._timestamp()
        merchant_reference_id = str(uuid.uuid4())
        request_body = {
            "amount": float(self._amount(amount)),
            "currency": currency,
            "timestamp": timestamp,
            "merchantReferenceId": merchant_reference_id,
            "signature": self._session_signature(amount, currency, merchant_reference_id, timestamp),
            "paymentOperation": "Pay",
            "language": str(payload.get("language") or "en").lower(),
        }

        body = self._request(
            "POST",
            "/payment-intent/api/v2/direct/session",
            payload=request_body,
        )
        session = body.get("session") or {}
        session_id = session.get("id")
        if not session_id or str(body.get("responseCode") or "000") != "000":
            raise PaymentProviderError(
                body.get("detailedResponseMessage")
                or body.get("responseMessage")
                or "Geidea did not create a checkout session"
            )

        return {
            "status": "Pending",
            "payment_status": "Pending",
            "requires_client_action": True,
            "client_action": "GeideaCheckout",
            "session_id": session_id,
            "merchant_reference_id": merchant_reference_id,
            "transaction_id": session_id,
            "sdk_url": self.KSA_HPP_SCRIPT,
            "checkout_url": f"{self.KSA_HPP_CHECKOUT}?{session_id}",
            "amount": amount,
            "currency": currency,
            "message": "Geidea checkout session created",
            "provider_response": body,
        }

    @staticmethod
    def _normalize_order(body):
        order = body.get("order") or {}
        if not order and isinstance(body.get("orders"), list) and body.get("orders"):
            order = body["orders"][0] or {}
        status = str(order.get("status") or body.get("status") or "").strip()
        detailed_status = str(order.get("detailedStatus") or "").strip()
        approved = status.lower() == "success" and (
            not detailed_status or detailed_status.lower() in GeideaProvider.PAID_DETAILED_STATUSES
        )
        if detailed_status.lower() in GeideaProvider.PAID_DETAILED_STATUSES:
            approved = True

        return {
            "status": "Approved" if approved else (status or detailed_status or "Pending"),
            "payment_status": "Approved" if approved else (status or detailed_status or "Pending"),
            "order_id": order.get("orderId") or "",
            "transaction_id": order.get("orderId") or order.get("transactionId") or "",
            "reference_number": order.get("rrn") or order.get("referenceNumber") or "",
            "authorization_code": order.get("authorizationCode") or order.get("authCode") or "",
            "payment_network": (
                (order.get("paymentMethod") or {}).get("brand")
                or (order.get("paymentMethod") or {}).get("type")
                or order.get("scheme")
                or ""
            ),
            "amount": order.get("amount") or order.get("totalAmount"),
            "currency": order.get("currency") or "",
            "detailed_status": detailed_status,
            "response_code": body.get("responseCode") or "",
            "message": body.get("detailedResponseMessage") or body.get("responseMessage") or detailed_status or status,
            "provider_response": body,
        }

    def status(self, payload):
        order_id = str(payload.get("order_id") or payload.get("transaction_id") or "").strip()
        merchant_reference_id = str(payload.get("merchant_reference_id") or "").strip()
        if order_id:
            body = self._request("GET", f"/pgw/api/v1/direct/order/{order_id}")
        elif merchant_reference_id:
            body = self._request(
                "GET",
                "/pgw/api/v1/direct/order",
                params={"MerchantReferenceId": merchant_reference_id},
            )
        else:
            raise PaymentProviderError("Geidea status requires order_id or merchant_reference_id")
        result = self._normalize_order(body)
        result["merchant_reference_id"] = merchant_reference_id
        return result

    def refund(self, payload):
        order_id = str(
            payload.get("order_id")
            or payload.get("original_order_id")
            or payload.get("original_transaction_id")
            or ""
        ).strip()
        refund_amount = float(payload.get("amount") or payload.get("refund_amount") or 0)
        if not order_id:
            raise PaymentProviderError("Geidea refund requires the original Geidea order ID")
        if refund_amount <= 0:
            raise PaymentProviderError("Geidea refund amount must be greater than zero")

        timestamp = self._timestamp()
        request_body = {
            "orderId": order_id,
            "refundAmount": float(self._amount(refund_amount)),
            "timestamp": timestamp,
            "signature": self._refund_signature(refund_amount, order_id, timestamp),
        }
        body = self._request("POST", "/pgw/api/v2/direct/refund", payload=request_body)
        result = self._normalize_order(body)
        result["refund_amount"] = refund_amount
        return result

    def void(self, payload):
        raise PaymentProviderError(
            "Geidea Void requires merchant enablement and must be configured with the certified Geidea operation before use"
        )
