# WMN POS page source layout

This page is a WMN-owned copy of the ERPNext v16 POS page. It is not installed
by overriding `point-of-sale`, extending ERPNext browser classes, or replacing
ERPNext runtime globals.

Frappe loads `wmn_pos.js` for the `/desk/wmn-pos` page. That file is the runtime
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
    `/desk/wmn-pos` is page-owned.
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

## Workspace

`wmn.setup.workspace.ensure_wmn_workspace` creates a public `WMN` Workspace with
a WMN POS shortcut. On Frappe v16 the shortcut route is `/desk/wmn-pos`, so the
workspace appears in the Desk sidebar and opens the v16 page route.

## Rebuilding

Run from the app repository root:

```bash
python3 wmn/wmn/page/wmn_pos/build_wmn_pos_bundle.py
node --check wmn/wmn/page/wmn_pos/wmn_pos.js
```

## Updating from ERPNext v16

Use the importer to compare or copy the ERPNext v16 POS component files:

```bash
# Compare only. This prints unified diffs and does not write files.
python3 wmn/wmn/page/wmn_pos/import_upstream_v16.py --erpnext-path ../erpnext

# Copy changed ERPNext files into upstream_v16/ and rebuild wmn_pos.js.
python3 wmn/wmn/page/wmn_pos/import_upstream_v16.py --erpnext-path ../erpnext --write
```

`--erpnext-path` can point to:

- the ERPNext app root, for example `../erpnext`,
- a bench root containing `apps/erpnext`,
- or the direct `erpnext/selling/page/point_of_sale` directory.

The importer keeps ERPNext component code in a WMN-owned namespace by converting
`erpnext.PointOfSale.*` references to `window.WMN_POS.Source.*`. It does not
create runtime overrides, does not patch ERPNext files, and does not load the
ERPNext POS page at runtime.

After importing:

1. Review the diff in each matching `upstream_v16/*` file.
2. Check `DIFF_MAP.md` for the WMN files tied to that upstream component.
3. Reapply or adjust WMN behavior in `wmn/components/*` only when the upstream
   method contract changed.
4. Run syntax checks and manual online/offline POS smoke tests.

To update one file only:

```bash
python3 wmn/wmn/page/wmn_pos/import_upstream_v16.py \
  --erpnext-path ../erpnext \
  --component pos_item_selector.js \
  --write
```

This keeps the source split between:

- upstream ERPNext v16 behavior,
- WMN runtime/offline/data-source behavior,
- WMN component-level business/UI changes.
