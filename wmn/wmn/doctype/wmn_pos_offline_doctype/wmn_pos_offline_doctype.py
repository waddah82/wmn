import json

import frappe
from frappe import _
from frappe.model.document import Document


_LAYOUT_FIELD_TYPES = {"Section Break", "Column Break", "Tab Break", "HTML", "Button"}
_SUPPORTED_OFFLINE_FIELD_TYPES = {
    "Data", "Autocomplete", "Barcode", "Check", "Code", "Color", "Currency", "Date", "Datetime",
    "Duration", "Dynamic Link", "Float", "Int", "JSON", "Link", "Long Text", "Markdown Editor",
    "Percent", "Phone", "Read Only", "Rating", "Select", "Small Text", "Text", "Text Editor", "Time",
}


class WMNPOSOfflineDocType(Document):
    def validate(self):
        meta = frappe.get_meta(self.target_doctype)
        if meta.istable:
            frappe.throw(_("Offline configuration cannot target a child DocType."))

        self.sync_order = max(int(self.sync_order or 0), 0)
        self.cache_limit = max(int(self.cache_limit or 0), 0)
        self._validate_filters()
        self._ensure_required_create_fields(meta)
        self._validate_fields(meta)


    def _offline_create_enabled(self):
        return (self.offline_mode or "Read Only") in {"Read + Create", "Read + Create + Edit"}

    def _ensure_required_create_fields(self, meta):
        if not self._offline_create_enabled():
            return

        existing = {
            (row.fieldname or "").strip(): row
            for row in self.offline_fields or []
            if (row.fieldname or "").strip()
        }

        for df in meta.fields or []:
            fieldname = (df.fieldname or "").strip()
            if not fieldname or not df.reqd or df.read_only:
                continue
            if df.fieldtype in _LAYOUT_FIELD_TYPES:
                continue

            if df.fieldtype not in _SUPPORTED_OFFLINE_FIELD_TYPES:
                if not df.default:
                    frappe.throw(
                        _("{0} cannot be created with the generic offline form because mandatory field {1} uses unsupported field type {2}.").format(
                            frappe.bold(self.target_doctype),
                            frappe.bold(df.label or fieldname),
                            frappe.bold(df.fieldtype),
                        )
                    )
                continue

            row = existing.get(fieldname)
            if not row:
                row = self.append("offline_fields", {
                    "fieldname": fieldname,
                    "label": df.label or fieldname,
                    "fieldtype": df.fieldtype,
                    "options": df.options or "",
                    "list_column": 1 if df.in_list_view else 0,
                    "searchable": 1 if (df.in_list_view or df.in_standard_filter) else 0,
                    "editable_offline": 1,
                    "required_offline": 1,
                })
                existing[fieldname] = row
            else:
                row.label = df.label or fieldname
                row.fieldtype = df.fieldtype
                row.options = df.options or ""
                row.editable_offline = 1
                row.required_offline = 1

            if df.fieldtype == "Dynamic Link":
                dependency = (df.options or "").strip()
                dependency_df = meta.get_field(dependency) if dependency else None
                if (
                    dependency_df
                    and dependency not in existing
                    and dependency_df.fieldtype in _SUPPORTED_OFFLINE_FIELD_TYPES
                ):
                    dependency_row = self.append("offline_fields", {
                        "fieldname": dependency,
                        "label": dependency_df.label or dependency,
                        "fieldtype": dependency_df.fieldtype,
                        "options": dependency_df.options or "",
                        "list_column": 0,
                        "searchable": 0,
                        "editable_offline": 0 if dependency_df.read_only else 1,
                        "required_offline": 1 if dependency_df.reqd and not dependency_df.read_only else 0,
                    })
                    existing[dependency] = dependency_row

        autoname = (meta.autoname or "").strip()
        if autoname.startswith("field:"):
            naming_field = autoname[6:].strip()
            naming_df = meta.get_field(naming_field) if naming_field else None
            if naming_df and naming_df.fieldtype in _SUPPORTED_OFFLINE_FIELD_TYPES and not naming_df.read_only:
                if naming_field not in existing:
                    self.append("offline_fields", {
                        "fieldname": naming_field,
                        "label": naming_df.label or naming_field,
                        "fieldtype": naming_df.fieldtype,
                        "options": naming_df.options or "",
                        "list_column": 1,
                        "searchable": 1,
                        "editable_offline": 1,
                        "required_offline": 1 if naming_df.reqd else 0,
                    })

    def _validate_filters(self):
        raw = (self.filters_json or "").strip()
        if not raw:
            return
        try:
            parsed = json.loads(raw)
        except Exception:
            frappe.throw(_("Cache Filters must be valid JSON."))
        if not isinstance(parsed, (dict, list)):
            frappe.throw(_("Cache Filters must be a JSON object or list."))

    def _validate_fields(self, meta):
        available = {
            df.fieldname: df
            for df in meta.fields
            if df.fieldname and df.fieldtype not in _LAYOUT_FIELD_TYPES
        }
        seen = set()
        for row in self.offline_fields or []:
            fieldname = (row.fieldname or "").strip()
            if not fieldname:
                continue
            if fieldname in seen:
                frappe.throw(_("Field {0} is duplicated in the offline model.").format(frappe.bold(fieldname)))
            seen.add(fieldname)
            df = available.get(fieldname)
            if not df:
                frappe.throw(_("Field {0} does not exist on {1} or is not an offline data field.").format(frappe.bold(fieldname), frappe.bold(self.target_doctype)))
            if df.fieldtype not in _SUPPORTED_OFFLINE_FIELD_TYPES:
                frappe.throw(
                    _("Field {0} uses {1}, which is intentionally not supported by the lightweight offline form.").format(
                        frappe.bold(fieldname), frappe.bold(df.fieldtype)
                    )
                )
            row.label = df.label or fieldname
            row.fieldtype = df.fieldtype
            row.options = df.options or ""
            if df.read_only and getattr(row, "editable_offline", 0):
                row.editable_offline = 0

            if getattr(row, "required_offline", 0) and not getattr(row, "editable_offline", 0):
                frappe.throw(_("Required offline field {0} must also be editable offline.").format(frappe.bold(fieldname)))
