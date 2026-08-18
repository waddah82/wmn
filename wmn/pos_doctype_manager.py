import json

import frappe
from frappe import _
from frappe.utils import get_datetime


MENU_SETTINGS_DOCTYPE = "WMN POS Menu Settings"
OFFLINE_DOCTYPE = "WMN POS Offline DocType"
DIALOG_SCRIPT_DOCTYPE = "WMN POS Dialog Script"
SAFE_DEFAULT_CACHE_LIMIT = 500
MAX_OFFLINE_CACHE_LIMIT = 1000

_SUPPORTED_OFFLINE_FIELD_TYPES = {
    "Data", "Autocomplete", "Barcode", "Check", "Code", "Color", "Currency", "Date", "Datetime",
    "Duration", "Dynamic Link", "Float", "Int", "JSON", "Link", "Long Text", "Markdown Editor",
    "Percent", "Phone", "Read Only", "Rating", "Select", "Small Text", "Text", "Text Editor", "Time",
}


def _doctype_exists(doctype):
    return bool(frappe.db.exists("DocType", doctype))


def _get_menu_entries():
    if not _doctype_exists(MENU_SETTINGS_DOCTYPE):
        return []

    settings = frappe.get_single(MENU_SETTINGS_DOCTYPE)
    entries = []
    for row in settings.menu_items or []:
        if not row.enabled or not row.doctype_name:
            continue
        entries.append({
            "doctype": row.doctype_name,
            "section": (row.section or "Setup").strip() or "Setup",
            "order": int(row.display_order or 0),
            "custom_label": (row.custom_label or "").strip(),
            "icon": (row.icon or "").strip(),
        })
    return entries


def _get_offline_config_doc(doctype, require_enabled=True):
    filters = {"target_doctype": doctype}
    if require_enabled:
        filters["enabled"] = 1
    name = frappe.db.get_value(OFFLINE_DOCTYPE, filters, "name") if _doctype_exists(OFFLINE_DOCTYPE) else None
    if not name:
        return None
    return frappe.get_doc(OFFLINE_DOCTYPE, name)


def _get_enabled_offline_mode_map():
    if not _doctype_exists(OFFLINE_DOCTYPE):
        return {}
    rows = frappe.get_all(
        OFFLINE_DOCTYPE,
        filters={"enabled": 1},
        fields=["target_doctype", "offline_mode"],
    )
    return {
        row.target_doctype: row.offline_mode
        for row in rows
        if row.target_doctype
    }


def _parse_filters(raw):
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except Exception:
        return None
    return value if isinstance(value, (dict, list)) else None


def _effective_cache_limit(value):
    value = int(value or 0)
    if value <= 0:
        value = SAFE_DEFAULT_CACHE_LIMIT
    return min(value, MAX_OFFLINE_CACHE_LIMIT)


def _model_payload(config_doc):
    target = (config_doc.target_doctype or "").strip()
    meta = frappe.get_meta(target)
    can_create = bool(frappe.has_permission(target, ptype="create"))
    can_write = bool(frappe.has_permission(target, ptype="write"))
    read_fields = set(meta.get_permitted_fieldnames(user=frappe.session.user, permission_type="read"))
    editable_fields = set(
        meta.get_permitted_fieldnames(
            user=frappe.session.user,
            permission_type="write" if can_write else "read",
        )
    ) if (can_write or can_create) else set()
    fields = []
    configured_names = set()

    for row in config_doc.offline_fields or []:
        fieldname = (row.fieldname or "").strip()
        if not fieldname:
            continue
        configured_names.add(fieldname)
        df = meta.get_field(fieldname)
        if not df or fieldname not in read_fields or df.fieldtype not in _SUPPORTED_OFFLINE_FIELD_TYPES:
            continue
        fields.append({
            "fieldname": fieldname,
            "label": row.label or df.label or fieldname,
            "fieldtype": row.fieldtype or df.fieldtype or "Data",
            "options": row.options or df.options or "",
            "list_column": 1 if row.list_column else 0,
            "searchable": 1 if row.searchable else 0,
            "required_offline": 1 if row.required_offline else 0,
            "editable_offline": 1
            if getattr(row, "editable_offline", 0) and fieldname in editable_fields and not df.read_only and df.fieldtype in _SUPPORTED_OFFLINE_FIELD_TYPES
            else 0,
        })

    implicit_fields = ["name", "modified", "docstatus"]
    title_field = meta.title_field or ""
    if title_field and title_field not in configured_names:
        title_df = meta.get_field(title_field)
        if title_df and title_field in read_fields and title_df.fieldtype in _SUPPORTED_OFFLINE_FIELD_TYPES:
            implicit_fields.append(title_field)

    return {
        "doctype": target,
        "offline_mode": config_doc.offline_mode,
        "load_strategy": config_doc.load_strategy,
        "sync_order": int(config_doc.sync_order or 0),
        "cache_limit": int(config_doc.cache_limit or 0),
        "effective_cache_limit": _effective_cache_limit(config_doc.cache_limit),
        "filters": _parse_filters(config_doc.filters_json),
        "conflict_policy": getattr(config_doc, "conflict_policy", "Block on Conflict") or "Block on Conflict",
        "fields": fields,
        "implicit_fields": implicit_fields,
        "title_field": title_field,
        "is_single": 1 if meta.issingle else 0,
        "is_submittable": 1 if meta.is_submittable else 0,
        "can_read": 1 if frappe.has_permission(target, ptype="read") else 0,
        "can_create": 1 if can_create else 0,
        "can_write": 1 if can_write else 0,
    }


def _get_offline_model(doctype):
    config_doc = _get_offline_config_doc(doctype)
    if not config_doc:
        frappe.throw(_("Offline access is not configured for {0}.").format(frappe.bold(doctype)))
    if not frappe.has_permission(doctype, ptype="read"):
        frappe.throw(_("You are not permitted to read {0}.").format(frappe.bold(doctype)), frappe.PermissionError)
    return config_doc, _model_payload(config_doc)


def _snapshot_fields(model):
    fields = []
    for fieldname in (model.get("implicit_fields") or []) + [row["fieldname"] for row in model.get("fields") or []]:
        if fieldname and fieldname not in fields:
            fields.append(fieldname)
    return fields


def _serialize_doc(doc, model):
    result = {}
    for fieldname in _snapshot_fields(model):
        if fieldname == "name":
            value = doc.name
        else:
            value = doc.get(fieldname)
        result[fieldname] = value
    result["name"] = doc.name
    result["modified"] = str(doc.get("modified") or result.get("modified") or "")
    return result


def _serialize_row(row, model):
    result = {fieldname: row.get(fieldname) for fieldname in _snapshot_fields(model)}
    result["name"] = row.get("name")
    result["modified"] = str(row.get("modified") or "")
    return result


@frappe.whitelist()
def get_available_pos_doctypes():
    """Return configured WMN POS management DocTypes allowed for the current user."""
    result = []
    offline_modes = _get_enabled_offline_mode_map()

    for entry in _get_menu_entries():
        doctype = entry["doctype"]
        try:
            meta = frappe.get_meta(doctype)
        except frappe.DoesNotExistError:
            continue

        if meta.istable or not frappe.has_permission(doctype, ptype="read"):
            continue

        offline_mode = offline_modes.get(doctype, "")
        label = entry["custom_label"] or _(doctype)
        result.append({
            "doctype": doctype,
            "label": label,
            "section": entry["section"],
            "order": entry["order"],
            "icon": entry["icon"],
            "is_single": 1 if meta.issingle else 0,
            "is_submittable": 1 if meta.is_submittable else 0,
            "title_field": meta.title_field or "",
            "can_read": 1,
            "can_create": 1 if frappe.has_permission(doctype, ptype="create") else 0,
            "can_write": 1 if frappe.has_permission(doctype, ptype="write") else 0,
            "offline_enabled": 1 if offline_mode else 0,
            "offline_mode": offline_mode,
        })

    return sorted(result, key=lambda row: (row["order"], row["label"]))


@frappe.whitelist()
def get_dialog_scripts(doctype):
    """Return scripts that run only inside the WMN POS DocType dialog iframe."""
    doctype = (doctype or "").strip()
    if not doctype or not _doctype_exists(doctype):
        frappe.throw(_("Invalid DocType."))
    if not frappe.has_permission(doctype, ptype="read"):
        frappe.throw(_("You are not permitted to read {0}.").format(frappe.bold(doctype)), frappe.PermissionError)
    if not _doctype_exists(DIALOG_SCRIPT_DOCTYPE):
        return []

    return frappe.get_all(
        DIALOG_SCRIPT_DOCTYPE,
        filters={"enabled": 1, "target_doctype": doctype},
        fields=["name", "script_name", "event", "execution_order", "script"],
        order_by="execution_order asc, modified asc",
    )


@frappe.whitelist()
def get_offline_doctype_models(doctype=None):
    """Return lightweight offline models for DocTypes permitted to the current user."""
    if not _doctype_exists(OFFLINE_DOCTYPE):
        return []

    filters = {"enabled": 1}
    requested = (doctype or "").strip()
    if requested:
        filters["target_doctype"] = requested

    names = frappe.get_all(
        OFFLINE_DOCTYPE,
        filters=filters,
        pluck="name",
        order_by="sync_order asc, modified asc",
    )
    result = []

    for name in names:
        doc = frappe.get_doc(OFFLINE_DOCTYPE, name)
        target = (doc.target_doctype or "").strip()
        if not target or not _doctype_exists(target):
            continue
        if not frappe.has_permission(target, ptype="read"):
            continue
        result.append(_model_payload(doc))

    return result


@frappe.whitelist()
def get_offline_doctype_snapshot(doctype):
    """Return a targeted field-only snapshot for one configured offline DocType."""
    doctype = (doctype or "").strip()
    if not doctype or not _doctype_exists(doctype):
        frappe.throw(_("Invalid DocType."))

    _config_doc, model = _get_offline_model(doctype)
    fields = _snapshot_fields(model)

    if model["is_single"]:
        doc = frappe.get_single(doctype)
        doc.check_permission("read")
        rows = [_serialize_doc(doc, model)]
    else:
        rows = frappe.get_list(
            doctype,
            fields=fields,
            filters=model.get("filters") or None,
            order_by="modified desc",
            limit_page_length=model["effective_cache_limit"],
        )
        rows = [_serialize_row(row, model) for row in rows]

    return {
        "model": model,
        "documents": rows,
        "cached_at": frappe.utils.now_datetime(),
    }


def _offline_mode_allows(model, operation):
    mode = model.get("offline_mode") or "Read Only"
    if operation == "create":
        return mode in {"Read + Create", "Read + Create + Edit"}
    if operation == "update":
        return mode == "Read + Create + Edit"
    return False


def _editable_fieldnames(model):
    return {
        row["fieldname"]
        for row in model.get("fields") or []
        if row.get("editable_offline")
    }


def _clean_offline_values(values, model):
    allowed = _editable_fieldnames(model)
    cleaned = {}
    for key, value in (values or {}).items():
        if key in allowed:
            cleaned[key] = value
    return cleaned


def _modified_matches(server_modified, base_modified):
    if not base_modified:
        return True
    try:
        return get_datetime(server_modified) == get_datetime(base_modified)
    except Exception:
        return str(server_modified or "") == str(base_modified or "")


@frappe.whitelist()
def sync_offline_doctype_document(payload):
    """Create/update one offline-managed document using the configured field whitelist."""
    data = frappe.parse_json(payload) if isinstance(payload, str) else (payload or {})
    doctype = str(data.get("doctype") or "").strip()
    operation = str(data.get("operation") or "").strip().lower()
    name = str(data.get("name") or "").strip()
    base_modified = str(data.get("base_modified") or "").strip()

    if not doctype or not _doctype_exists(doctype):
        frappe.throw(_("Invalid DocType."))
    if operation not in {"create", "update"}:
        frappe.throw(_("Invalid offline synchronization operation."))

    _config_doc, model = _get_offline_model(doctype)
    if not _offline_mode_allows(model, operation):
        frappe.throw(_("Offline {0} is not enabled for {1}.").format(operation, frappe.bold(doctype)))

    values = _clean_offline_values(data.get("values") or {}, model)

    if operation == "create":
        if model["is_single"]:
            frappe.throw(_("A Single DocType cannot be created offline."))
        if not frappe.has_permission(doctype, ptype="create"):
            frappe.throw(_("You are not permitted to create {0}.").format(frappe.bold(doctype)), frappe.PermissionError)

        doc = frappe.new_doc(doctype)
        for fieldname, value in values.items():
            doc.set(fieldname, value)
        doc.insert()
        return {
            "status": "synced",
            "operation": "create",
            "name": doc.name,
            "document": _serialize_doc(doc, model),
        }

    if model["is_single"]:
        doc = frappe.get_single(doctype)
    else:
        if not name:
            frappe.throw(_("Document name is required for offline update."))
        doc = frappe.get_doc(doctype, name)

    doc.check_permission("write")
    server_modified = str(doc.get("modified") or "")
    if not _modified_matches(server_modified, base_modified):
        server_document = _serialize_doc(doc, model)
        if model.get("conflict_policy") == "Server Wins":
            return {
                "status": "server_wins",
                "name": doc.name,
                "server_modified": server_modified,
                "document": server_document,
            }
        return {
            "status": "conflict",
            "name": doc.name,
            "server_modified": server_modified,
            "document": server_document,
            "message": _("The document changed on the server after it was cached."),
        }

    for fieldname, value in values.items():
        doc.set(fieldname, value)
    doc.save()

    return {
        "status": "synced",
        "operation": "update",
        "name": doc.name,
        "document": _serialize_doc(doc, model),
    }
