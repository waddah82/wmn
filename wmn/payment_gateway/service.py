from __future__ import annotations

import json

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


def get_pos_payment_gateway_mappings(pos_profile):
    """Return the browser-safe payment gateway mapping snapshot for a POS Profile."""
    if not pos_profile:
        return []
    settings_name = frappe.db.get_value("WMN POS Profile Settings", {"pos_profile": pos_profile}, "name")
    if not settings_name:
        return []
    settings = frappe.get_doc("WMN POS Profile Settings", settings_name)
    rows = []
    for row in settings.get("payment_gateways") or []:
        if not row.enabled or not row.gateway_profile:
            continue
        profile = get_profile(row.gateway_profile)
        rows.append({
            "enabled": 1,
            "mode_of_payment": row.mode_of_payment,
            "is_default": int(row.is_default or 0),
            "gateway": safe_profile(profile),
        })
    return rows


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

def _existing_device_transaction(profile_name, action, client_reference):
    reference = str(client_reference or "").strip()
    if not reference:
        return None
    name = frappe.db.get_value(
        "WMN Payment Gateway Transaction",
        {
            "gateway_profile": profile_name,
            "action": str(action or "authorize").title(),
            "client_reference": reference,
        },
        "name",
    )
    return frappe.get_doc("WMN Payment Gateway Transaction", name) if name else None

def record_device_result(profile_name, action, payload_value, result_value):
    """Record a device result without executing the payment again.

    client_reference is the idempotency key. Repeated invoice synchronization
    updates the same transaction instead of creating another payment record.
    """
    profile = get_profile(profile_name)
    payload = _json(payload_value)
    result = sanitize_gateway_response(_json(result_value))
    raw_status = result.get("status") or result.get("payment_status") or ""
    status = normalize_transaction_status(raw_status, default="Declined")

    tx = _existing_device_transaction(profile.name, action, payload.get("client_reference"))
    if tx is None:
        tx = create_transaction(profile, action, payload, result, status=status)
    else:
        tx.status = status
        sales_invoice = str(payload.get("sales_invoice") or "").strip()
        if sales_invoice and frappe.db.exists("Sales Invoice", sales_invoice):
            tx.sales_invoice = sales_invoice
        tx.transaction_id = result.get("transaction_id") or result.get("id") or tx.transaction_id
        tx.reference_number = result.get("reference_number") or result.get("rrn") or tx.reference_number
        tx.authorization_code = result.get("authorization_code") or result.get("auth_code") or tx.authorization_code
        tx.payment_network = result.get("payment_network") or result.get("scheme") or tx.payment_network
        tx.gateway_response = frappe.as_json(result)
        tx.transaction_time = now_datetime()
        tx.save(ignore_permissions=True)

    return {"name": tx.name, "status": tx.status}


def record_offline_invoice_authorizations(invoice_payload, invoice_name):
    """Persist LAN/SDK payment approvals carried by an offline invoice.

    This function records already-completed device results only. It never calls
    authorize/refund/void and therefore can safely run during invoice sync.
    """
    if not isinstance(invoice_payload, dict):
        return []
    authorizations = invoice_payload.get("__wmn_gateway_authorizations") or {}
    if not isinstance(authorizations, dict):
        return []

    recorded = []
    for mode_of_payment, approval in authorizations.items():
        if not isinstance(approval, dict):
            continue
        if normalize_transaction_status(approval.get("status"), default="Declined") != "Approved":
            continue
        gateway_profile = str(approval.get("gateway_profile") or "").strip()
        client_reference = str(approval.get("client_reference") or "").strip()
        if not gateway_profile or not client_reference:
            continue

        payload = {
            "client_reference": client_reference,
            "mode_of_payment": mode_of_payment or approval.get("mode_of_payment") or "",
            "amount": flt(approval.get("amount") or 0),
            "currency": approval.get("currency") or invoice_payload.get("currency") or "SAR",
            "pos_profile": approval.get("pos_profile") or invoice_payload.get("pos_profile") or "",
            "terminal_id": approval.get("terminal_id") or "",
            "merchant_id": approval.get("merchant_id") or "",
            "sales_invoice": invoice_name or "",
        }
        result = dict(approval)
        result.pop("__wmn_server_record_pending", None)
        recorded.append(record_device_result(gateway_profile, "authorize", payload, result))
    return recorded
