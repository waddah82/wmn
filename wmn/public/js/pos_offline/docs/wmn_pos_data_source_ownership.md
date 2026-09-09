# WMN POS Data Source Ownership

`/app/wmn-pos` owns the POS page boot and class creation. It does not replace
ERPNext POS classes at runtime and it does not apply patch registries.
It loads WMN-owned files from `classes/*`; `overrides/*` is not part of the
owned WMN POS page.

## Runtime boundary

- UI and business behavior live in the WMN POS classes and feature modules.
- Online mode uses `OnlineERPNextBackend`, which delegates to normal ERPNext
  server APIs through `frappe.call` and `frappe.db`.
- Offline mode uses `OfflineLocalBackend`, which delegates to the existing WMN
  cache/IndexedDB services (`window.wmnPOSOffline`) and `WMNPOSControllerCache`.
- `LocalStorageBackend` and `LocalDBBackend` are available extension points for
  future local storage or local database drivers.

## Rule

Offline must not change POS business behavior. It changes only the source of
data and operations:

```text
same page + same controller/feature logic
  online  -> ERPNext server/database APIs
  offline -> cache / IndexedDB / localStorage / local DB adapters
```

Any new server-backed POS operation should add a matching local method to
`services/data/pos_data_source.js` before it is used from offline runtime.
