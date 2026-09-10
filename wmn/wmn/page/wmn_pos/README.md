# WMN POS page source layout

This page is a WMN-owned copy of the ERPNext v16 POS page. It is not installed
by overriding `point-of-sale`, extending ERPNext browser classes, or replacing
ERPNext runtime globals.

Frappe loads `wmn_pos.js` for the `/app/wmn-pos` page. That file is the runtime
bundle. Do not edit it directly for feature work; edit the organized source
files and rebuild the bundle.

## Directories

- `upstream_v16/`
  - ERPNext v16 POS component source copied into the WMN namespace.
  - Keep these files close to upstream so future ERPNext v16 updates can be
    compared component by component.
- `wmn/runtime/`
  - WMN-owned runtime glue: class registry, offline data source, and page boot.
- `wmn/components/`
  - WMN modifications grouped by POS component.
  - Each component has a `methods.js` file for business/UI behavior and a
    `class.js` file that exposes the final WMN component class.
- `wmn/support/`
  - WMN offline/cache/printing/payment/retail helpers that used to be loaded
    from the old public POS offline asset tree. They are copied here so
    `/app/wmn-pos` is page-owned.
- `wmn/vendor/`
  - Page-owned third-party browser libraries needed by the WMN POS page.

## Runtime files

- `wmn_pos.js`
  - Generated browser bundle loaded by Frappe.
- `wmn_pos.py`
  - Page-owned Python endpoint boundary used by the browser page.
- `wmn_pos.json`
  - Frappe Page definition.
- `bundle_manifest.json`
  - Ordered source manifest used to build `wmn_pos.js`.
- `build_wmn_pos_bundle.py`
  - Rebuilds the runtime bundle from the organized source tree.

## Rebuilding

Run from the app repository root:

```bash
python3 wmn/wmn/page/wmn_pos/build_wmn_pos_bundle.py
node --check wmn/wmn/page/wmn_pos/wmn_pos.js
```

## Updating from ERPNext v16

1. Copy the new ERPNext v16 POS component source into a temporary directory.
2. Compare each upstream component with the matching file in `upstream_v16/`.
3. Apply safe upstream changes to the matching `upstream_v16/*` file.
4. Reapply or adjust WMN behavior in `wmn/components/*` only when the upstream
   method contract changed.
5. Rebuild `wmn_pos.js`.
6. Run syntax checks and manual online/offline POS smoke tests.

This keeps the source split between:

- upstream ERPNext v16 behavior,
- WMN runtime/offline/data-source behavior,
- WMN component-level business/UI changes.
