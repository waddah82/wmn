# WMN Payment Gateway Device Contract

This contract is the boundary between WMN POS and payment vendor SDK/ECR connectors. It does not change POS pricing, payment amount ownership, submit, or return calculation.

## Supported transport families

- Cloud Server API
- SoftPOS SDK
- Android App Bridge
- ECR WebSocket Bridge
- ECR HTTP Bridge
- Standalone / Manual Reference

## Actions

A device/connector implements these actions when supported:

- `authorize`
- `refund`
- `void`
- `status`

## Request contract

```json
{
  "client_reference": "unique-reference",
  "mode_of_payment": "Electronic Payment",
  "amount": 100.00,
  "currency": "SAR",
  "pos_profile": "POS Profile",
  "terminal_id": "terminal-id",
  "merchant_id": "merchant-id",
  "sales_invoice": "invoice-name-if-available",
  "original_transaction_id": "refund-only"
}
```

## Success response contract

```json
{
  "status": "approved",
  "transaction_id": "provider-transaction-id",
  "reference_number": "rrn-or-reference",
  "authorization_code": "auth-code",
  "payment_network": "mada"
}
```

WMN treats payment as successful only when the adapter returns an approved/success state. Card PAN, CVV, PIN, track data, passwords, and secrets must never be returned to or stored by WMN.

## Model families currently registered

- GEIDEA_CLOUD
- GEIDEA_SOFTPOS
- GEIDEA_SMART_POS
- GEIDEA_CARD_READER
- STC_SOFTPOS_APP
- STC_SOFTPOS_SDK
- GENERIC_ANDROID_SDK
- GENERIC_ANDROID_APP
- GENERIC_ECR_WS
- GENERIC_ECR_HTTP
- GENERIC_CLOUD
- STANDALONE_TERMINAL

A new physical model should normally map to one of these transport families. A new business/payment lifecycle must not be created for each model.
