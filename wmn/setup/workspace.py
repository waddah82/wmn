import json

import frappe


WORKSPACE_NAME = "WMN"


def _frappe_major_version():
    version = str(getattr(frappe, "__version__", "") or "")
    try:
        return int(version.split(".", 1)[0])
    except Exception:
        return 15


def get_wmn_pos_route():
    return "/desk/wmn-pos" if _frappe_major_version() >= 16 else "/app/wmn-pos"


def _workspace_content(route):
    return json.dumps(
        [
            {
                "id": "wmn_pos_header",
                "type": "header",
                "data": {"text": "WMN"},
            },
            {
                "id": "wmn_pos_card",
                "type": "card",
                "data": {
                    "card_name": "WMN POS",
                    "col": 4,
                },
            },
            {
                "id": "wmn_pos_shortcut",
                "type": "shortcut",
                "data": {
                    "shortcut_name": "WMN POS",
                    "col": 3,
                },
            },
            {
                "id": "wmn_pos_description",
                "type": "paragraph",
                "data": {
                    "text": f"<a class='btn btn-primary' href='{route}'>Open WMN POS</a>",
                    "col": 12,
                },
            },
        ]
    )


def ensure_wmn_workspace():
    if not frappe.db.exists("DocType", "Workspace"):
        return

    route = get_wmn_pos_route()
    if frappe.db.exists("Workspace", WORKSPACE_NAME):
        workspace = frappe.get_doc("Workspace", WORKSPACE_NAME)
    else:
        workspace = frappe.new_doc("Workspace")
        workspace.label = WORKSPACE_NAME

    workspace.title = WORKSPACE_NAME
    workspace.label = WORKSPACE_NAME
    workspace.module = "Wmn"
    workspace.icon = "retail"
    workspace.public = 1
    workspace.sequence_id = 25
    workspace.content = _workspace_content(route)

    if hasattr(workspace, "parent_page"):
        workspace.parent_page = ""
    if hasattr(workspace, "for_user"):
        workspace.for_user = ""

    workspace.set("shortcuts", [])
    workspace.append(
        "shortcuts",
        {
            "type": "URL",
            "label": "WMN POS",
            "url": route,
            "color": "Blue",
            "icon": "retail",
        },
    )

    workspace.set("links", [])
    for label, link_to in (
        ("POS Profile", "POS Profile"),
        ("POS Opening Entry", "POS Opening Entry"),
        ("POS Closing Entry", "POS Closing Entry"),
        ("WMN Print Format", "WMN Print Format"),
    ):
        if frappe.db.exists("DocType", link_to):
            workspace.append(
                "links",
                {
                    "type": "Link",
                    "label": label,
                    "link_type": "DocType",
                    "link_to": link_to,
                },
            )

    workspace.flags.ignore_permissions = True
    workspace.flags.ignore_mandatory = True
    workspace.save()
    frappe.clear_cache(doctype="Workspace")
