# WMN POS Invoice Handoff — Ownership and Regression Matrix

## Ownership

- Feature owner: `features/invoice_handoff/`
- Payment UI integration: `overrides/payment/`
- Invoice lifecycle integration: `overrides/controller/`
- Recent Orders status/filter integration: `overrides/past_order_list/`
- Offline draft persistence/sync lifecycle: `services/storage/offline_storage.js`
- Offline stock transition on Complete Order: `services/stock/offline_stock.js`
- Offline payment dialog integration: `services/payment/offline_payment.js`
- Persistent fields: `wmn/setup/invoice_handoff.py`
- Online Recent Orders status query: `wmn/api.py`

## Lifecycle

1. Sales employee opens Payment after all pricing/coupon/promotion work is finished.
2. User-entered payment rows are preserved as user data.
3. `Send to Cashier` sets `wmn_pos_stage = AWAITING_CASHIER` and audit fields.
4. Draft is saved without Submit.
5. Receipt is printed immediately with the immutable `wmn_invoice_uid` barcode.
6. A new POS transaction is opened only after printing succeeds.
7. Cashier scans the invoice barcode from Recent Orders on the same device.
8. Awaiting draft is restored with the saved payment rows unchanged and Payment opens directly.
9. Complete Order clears only the transient handoff stage, then follows the existing Submit lifecycle.
10. Existing post-Submit printing remains unchanged.

## Offline rules

- `AWAITING_CASHIER` rows use `queue_kind = draft`.
- Draft rows may synchronize to ERPNext as `docstatus = 0`; synchronization must never Submit them.
- Draft handoff rows do not consume offline stock before Complete Order.
- The same `wmn_offline_sync_id` identifies the local Draft and its server Draft.
- On Complete Order the handoff stage is cleared, the local queue becomes a normal pending invoice, and sync updates/submits the same server Draft instead of creating a duplicate.
- Coupon, promotion and supervisor redemption side effects run only after successful Submit.

## Regression matrix

- Normal Draft save/edit remains available.
- Normal Draft barcode scan still opens Payment.
- Awaiting Cashier barcode scan opens Payment with preserved rows.
- Awaiting Cashier list click opens Payment directly.
- Full payment handoff.
- Partial/incomplete payment handoff.
- Zero-entered payment handoff.
- Multiple payment modes handoff.
- Online Send to Cashier -> print -> scan -> Complete Order.
- Offline Send to Cashier -> reconnect -> sync as server Draft -> scan -> Complete Order -> sync/Submit the same server Draft.
- Offline Send to Cashier -> remain offline -> scan -> Complete Order -> reconnect -> sync/Submit.
- Print failure after draft save must keep the current draft open for retry.
- Submitted Unpaid/Partly Paid barcode path remains Add Payment / Payment Entry.
- Paid and Return barcode paths remain summary-only.
- Pricing Rule, Coupon, Promotion, Manual Discount and Submit pricing ownership remain unchanged.
