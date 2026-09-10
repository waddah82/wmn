# WMN POS ERPNext v16 difference map

Use this map when ERPNext v16 updates the POS page. Compare upstream files first,
then inspect the WMN component files that depend on the same component.

| ERPNext v16 source | WMN-owned files |
| --- | --- |
| `upstream_v16/pos_controller.js` | `wmn/components/controller/methods.js`, `wmn/components/controller/class.js`, `wmn/runtime/offline_data_source.js`, `wmn/runtime/page_boot.js` |
| `upstream_v16/pos_item_selector.js` | `wmn/components/item_selector/methods.js`, `wmn/components/item_selector/class.js` |
| `upstream_v16/pos_item_cart.js` | `wmn/components/item_cart/methods.js`, `wmn/components/item_cart/class.js` |
| `upstream_v16/pos_item_details.js` | `wmn/components/item_details/methods.js`, `wmn/components/item_details/class.js` |
| `upstream_v16/pos_payment.js` | `wmn/components/payment/methods.js`, `wmn/components/payment/class.js` |
| `upstream_v16/pos_past_order_list.js` | `wmn/components/past_order_list/methods.js`, `wmn/components/past_order_list/class.js` |
| `upstream_v16/pos_past_order_summary.js` | `wmn/components/past_order_summary/methods.js`, `wmn/components/past_order_summary/class.js` |
| `upstream_v16/pos_number_pad.js` | Used directly by the WMN-owned page bundle. |

## Shared WMN page support areas

| Area | Source directory |
| --- | --- |
| Offline cache and IndexedDB queue | `wmn/support/services/storage/`, `wmn/support/services/cache/`, `wmn/support/services/offline/` |
| Printing and receipts | `wmn/support/services/printing/`, `wmn/support/features/printing/`, `wmn/support/features/receipt/` |
| Payment gateway | `wmn/support/services/payment_gateway/`, `wmn/support/features/payment_gateway/` |
| Pricing, discounts, coupons, promotions | `wmn/support/features/pricing_rule/`, `wmn/support/features/discount/`, `wmn/support/features/coupon/`, `wmn/support/features/promotion/` |
| Supervisor and cash movement | `wmn/support/features/supervisor/`, `wmn/support/features/cash_movement/` |
| WMN UI styling and layout | `wmn/support/ui/mamsek_ui.js`, `wmn/components/*/methods.js` |

## Update rule

Do not edit `wmn_pos.js` by hand. Apply source changes to the files above, then
run:

```bash
python3 wmn/wmn/page/wmn_pos/build_wmn_pos_bundle.py
```
