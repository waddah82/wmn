from __future__ import annotations

import json

import requests
import frappe
from frappe import _
from frappe.utils import flt, now_datetime

from .providers.base import PaymentProviderError
from .providers.geidea import GeideaProvider
from .providers.stc_softpos import STCSoftPOSProvider
from .providers.test_gateway import WMNTestGatewayProvider

PROVIDERS = {
    "Geidea": GeideaProvider,
    "STC SoftPOS": STCSoftPOSProvider,
    "WMN Test Gateway": WMNTestGatewayProvider,
}
APPROVED = {"approved", "authorized", "success", "succeeded"}
PENDING = {"pending", "initiated", "processing"}

TRANSACTION_STATUS_ALIASES = {
    "approved": "Approved",
    "authorized": "Approved",
    "success": "Approved",
    "succeeded": "Approved",
    "pending": "Pending",
    "initiated": "Pending",
    "processing": "Pending",
    "declined": "Declined",
    "rejected": "Declined",
    "failed": "Declined",
    "error": "Error",
    "timeout": "Error",
    "timed_out": "Error",
    "cancelled": "Cancelled",
    "canceled": "Cancelled",
    "refunded": "Refunded",
    "voided": "Voided",
    "reversed": "Voided",
}


def normalize_transaction_status(value, default="Pending"):
    status_text = str(value or "").strip()
    if not status_text:
        return default
    return TRANSACTION_STATUS_ALIASES.get(status_text.lower(), default)


SENSITIVE_RESPONSE_KEYS = {
    "pan", "card_number", "cardnumber", "cvv", "cvc", "pin", "pin_block",
    "track1", "track2", "track_data", "expiry", "expiry_date", "card_expiry",
}

def sanitize_gateway_response(value):
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            normalized = str(key or "").strip().lower().replace("-", "_")
            if normalized in SENSITIVE_RESPONSE_KEYS or "password" in normalized or "secret" in normalized:
                out[key] = "***"
            else:
                out[key] = sanitize_gateway_response(item)
        return out
    if isinstance(value, list):
        return [sanitize_gateway_response(item) for item in value]
    return value


def _json(value):
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        return json.loads(value)
    except Exception:
        frappe.throw(_("Invalid payment gateway JSON payload."))


def get_profile(name):
    if not name or not frappe.db.exists("WMN Payment Gateway Profile", name):
        frappe.throw(_("Payment Gateway Profile {0} was not found.").format(name or ""))
    profile = frappe.get_doc("WMN Payment Gateway Profile", name)
    if not profile.enabled:
        frappe.throw(_("Payment Gateway Profile {0} is disabled.").format(name))
    return profile


def safe_profile(profile):
    return {
        "name": profile.name,
        "provider": profile.provider,
        "model_family": profile.model_family,
        "transport": profile.transport,
        "terminal_id": profile.terminal_id or "",
        "merchant_id": profile.merchant_id or "",
        "connector_url": profile.connector_url or "",
        "bridge_provider": profile.bridge_provider or "TEST",
        "timeout_ms": int(profile.timeout_seconds or 60) * 1000,
        "allow_refund": int(profile.allow_refund or 0),
        "allow_partial_payment": int(profile.allow_partial_payment or 0),
    }


def provider_for(profile):
    cls = PROVIDERS.get(profile.provider)
    if not cls:
        raise PaymentProviderError(f"Unsupported server payment provider: {profile.provider}")
    return cls(profile)


def create_transaction(profile, action, payload, result=None, status="Pending"):
    result = sanitize_gateway_response(result or {})
    doc = frappe.new_doc("WMN Payment Gateway Transaction")
    doc.gateway_profile = profile.name
    doc.provider = profile.provider
    doc.action = action.title()
    doc.status = normalize_transaction_status(status, default="Pending")
    doc.pos_profile = payload.get("pos_profile") or ""
    doc.sales_invoice = payload.get("sales_invoice") if frappe.db.exists("Sales Invoice", payload.get("sales_invoice") or "") else ""
    doc.client_reference = payload.get("client_reference") or ""
    doc.mode_of_payment = payload.get("mode_of_payment") or ""
    doc.amount = flt(payload.get("amount") or 0)
    doc.currency = payload.get("currency") or "SAR"
    doc.terminal_id = payload.get("terminal_id") or profile.terminal_id or ""
    doc.merchant_id = payload.get("merchant_id") or profile.merchant_id or ""
    doc.transaction_id = result.get("transaction_id") or result.get("id") or ""
    doc.reference_number = result.get("reference_number") or result.get("rrn") or ""
    doc.authorization_code = result.get("authorization_code") or result.get("auth_code") or ""
    doc.payment_network = result.get("payment_network") or result.get("scheme") or ""
    doc.original_transaction_id = payload.get("original_transaction_id") or ""
    doc.gateway_response = frappe.as_json(result)
    doc.transaction_time = now_datetime()
    doc.insert(ignore_permissions=True)
    return doc



def run_bridge_action(action, profile_name, payload_value):
    profile = get_profile(profile_name)
    if profile.transport != "Android App Bridge":
        frappe.throw(_("Gateway profile {0} does not use Android App Bridge transport.").format(profile.name))
    if profile.provider not in {"Generic", "STC SoftPOS"}:
        frappe.throw(_("Android App Bridge is not supported for provider {0}.").format(profile.provider))

    base_url = (profile.connector_url or "").strip().rstrip("/")
    if not base_url:
        frappe.throw(_("Local Connector URL is required for Android App Bridge."))
    token = profile.get_password("connector_token", raise_exception=False) or ""
    if not token:
        frappe.throw(_("Bridge Token is required for Android App Bridge."))

    payload = _json(payload_value)
    amount_minor = int(round(flt(payload.get("amount") or 0) * 100))
    if amount_minor <= 0:
        frappe.throw(_("Electronic payment amount must be greater than zero."))

    endpoint_by_action = {
        "authorize": "/v1/payments/purchase",
        "refund": "/v1/payments/refund",
        "void": "/v1/payments/reverse",
    }
    endpoint = endpoint_by_action.get(action)
    if not endpoint:
        frappe.throw(_("Unsupported Android App Bridge action {0}.").format(action))

    bridge_payload = {
        "request_id": payload.get("client_reference") or frappe.generate_hash(length=20),
        "amount_minor": amount_minor,
        "currency": payload.get("currency") or "SAR",
        "invoice": payload.get("sales_invoice") or payload.get("client_reference") or "WMN-POS",
        "provider": (profile.bridge_provider or "TEST").upper(),
        "customer_reference_number": payload.get("sales_invoice") or payload.get("client_reference") or "",
    }
    if action in {"refund", "void"}:
        bridge_payload["original_transaction_uuid"] = payload.get("original_transaction_id") or ""

    timeout = max(5, int(profile.timeout_seconds or 60))
    try:
        response = requests.post(
            f"{base_url}{endpoint}",
            json=bridge_payload,
            headers={"X-WMN-Bridge-Token": token, "Content-Type": "application/json"},
            timeout=timeout,
        )
    except requests.Timeout as exc:
        raise PaymentProviderError("WMN Payment Bridge timeout") from exc
    except requests.RequestException as exc:
        raise PaymentProviderError(f"WMN Payment Bridge connection failed: {exc}") from exc

    try:
        result = response.json()
    except ValueError as exc:
        raise PaymentProviderError(f"WMN Payment Bridge returned invalid JSON (HTTP {response.status_code})") from exc

    if not isinstance(result, dict):
        raise PaymentProviderError("WMN Payment Bridge returned an invalid response")

    status = str(result.get("status") or "").strip().lower()
    if not status and response.status_code >= 400:
        raise PaymentProviderError(result.get("error") or result.get("message") or f"WMN Payment Bridge HTTP {response.status_code}")

    normalized = sanitize_gateway_response(dict(result))
    normalized["status"] = status or result.get("status") or "Error"
    normalized["amount"] = flt((result.get("amount_minor") or amount_minor) / 100)
    normalized["payment_network"] = result.get("network") or ""
    normalized["authorization_code"] = result.get("auth_code") or ""
    normalized["reference_number"] = result.get("rrn") or ""
    normalized["transaction_id"] = result.get("transaction_id") or result.get("transaction_uuid") or ""
    return normalized

def run_server_action(action, profile_name, payload_value):
    profile = get_profile(profile_name)
    if profile.transport != "Cloud Server API":
        frappe.throw(_("Gateway profile {0} does not use Cloud Server API transport.").format(profile.name))
    payload = _json(payload_value)
    tx = create_transaction(profile, action, payload)
    try:
        result = sanitize_gateway_response(getattr(provider_for(profile), action)(payload))
        raw_status = result.get("status") or result.get("payment_status") or ""
        if result.get("requires_client_action"):
            tx.status = "Pending"
        else:
            tx.status = normalize_transaction_status(raw_status, default="Declined")
        tx.transaction_id = result.get("transaction_id") or result.get("id") or tx.transaction_id
        tx.reference_number = result.get("reference_number") or result.get("rrn") or tx.reference_number
        tx.authorization_code = result.get("authorization_code") or result.get("auth_code") or tx.authorization_code
        tx.payment_network = result.get("payment_network") or result.get("scheme") or tx.payment_network
        tx.gateway_response = frappe.as_json(result)
        tx.save(ignore_permissions=True)
        result["wmn_transaction"] = tx.name
        return result
    except Exception as exc:
        tx.status = "Error"
        tx.gateway_response = frappe.as_json({"error": str(exc)})
        tx.save(ignore_permissions=True)
        raise


def record_device_result(profile_name, action, payload_value, result_value):
    profile = get_profile(profile_name)
    payload = _json(payload_value)
    result = sanitize_gateway_response(_json(result_value))
    raw_status = result.get("status") or result.get("payment_status") or ""
    status = normalize_transaction_status(raw_status, default="Declined")
    tx = create_transaction(profile, action, payload, result, status=status)
    return {"name": tx.name, "status": tx.status}
