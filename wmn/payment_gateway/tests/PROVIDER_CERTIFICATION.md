# WMN Payment Gateway Provider Certification

This checklist certifies a real provider adapter without changing POS business logic.

## WMN lifecycle certification
- Full payment sends exactly the user-entered electronic payment row amount.
- Partial payment sends only the electronic row amount; cash/other rows remain unchanged.
- Approved authorization permits Complete Order.
- Declined, timeout, and provider error do not create an approval and block completion when an electronic amount exists.
- Changing the electronic amount after approval invalidates the old authorization until the new amount is approved.
- ERPNext Offline does not disable a certified local LAN/SDK payment transport.
- Cloud Server API remains unavailable when ERPNext/server connectivity is unavailable.
- A local approval remains valid if ERPNext drops before the gateway audit record is sent; sync records the result without re-authorizing.
- Repeated synchronization with the same `client_reference` must not create duplicate gateway transaction records.
- Gateway transaction log stores no PAN, CVV/CVC, PIN, track data, password, or secret.

## Geidea sandbox certification
Do not mark these PASS until real Geidea sandbox credentials are supplied and the Geidea adapter is implemented against the official Saudi API/SDK contract.

Required scenarios:
- Create/session/authentication/payment success.
- 3DS challenge success.
- 3DS frictionless success.
- Authentication failure / declined card.
- Gateway timeout/network failure.
- Duplicate/retry behavior with one merchant reference.
- Status/query reconciliation after ambiguous result.
- Refund (only after WMN Return runtime behavior is certified).
- Verify secrets remain server-side.

Official Geidea documentation currently provides sandbox/test cards and requires server-side handling of API credentials.

## STC SoftPOS certification
Do not mark these PASS until the acquiring bank/provider supplies the official STC SoftPOS App/SDK package and test activation.

Required scenarios:
- App/SDK launch with exact amount.
- Approved / declined / cancelled / timeout.
- Return to WMN with transaction/reference data.
- Retry after app interruption.
- Partial payment amount preservation.
- ERPNext-offline behavior through the local SDK/bridge, when the supplied SDK/bridge supports direct device execution.
- Refund only after WMN Return runtime certification.
