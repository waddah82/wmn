import frappe


DEFAULT_MENU_ITEMS = (
    {"doctype_name": "WMN POS Menu Settings", "section": "Setup", "display_order": 5},
    {"doctype_name": "POS Profile", "section": "Setup", "display_order": 10},
    {"doctype_name": "WMN POS Cash Movement Profile", "section": "Setup", "display_order": 20},
    {"doctype_name": "WMN POS Cashier Permission", "section": "Setup", "display_order": 30},
    {"doctype_name": "WMN POS Supervisor", "section": "Setup", "display_order": 40},
    {"doctype_name": "WMN POS Supervisor Settings", "section": "Setup", "display_order": 50},
    {"doctype_name": "WMN Print Settings", "section": "Setup", "display_order": 60},
    {"doctype_name": "WMN Print Format", "section": "Setup", "display_order": 70},
    {"doctype_name": "WMN Settings", "section": "Setup", "display_order": 80},
    {"doctype_name": "WMN POS Offline DocType", "section": "Setup", "display_order": 90},
    {"doctype_name": "WMN POS Dialog Script", "section": "Setup", "display_order": 100},
    {"doctype_name": "Customer", "section": "Commercial", "display_order": 110},
    {"doctype_name": "Item", "section": "Commercial", "display_order": 120},
    {"doctype_name": "WMN POS Promotion", "section": "Commercial", "display_order": 130},
    {"doctype_name": "WMN POS Coupon", "section": "Commercial", "display_order": 140},
    {"doctype_name": "WMN POS Cash Movement", "section": "Operations", "display_order": 200},
    {"doctype_name": "POS Opening Entry", "section": "Operations", "display_order": 210},
    {"doctype_name": "POS Closing Entry", "section": "Operations", "display_order": 220},
    {"doctype_name": "WMN POS Coupon Redemption", "section": "Audit", "display_order": 300},
    {"doctype_name": "WMN POS Promotion Redemption", "section": "Audit", "display_order": 310},
    {"doctype_name": "WMN POS Supervisor Approval", "section": "Audit", "display_order": 320},
)


def ensure_default_pos_menu_settings():
    if not frappe.db.exists("DocType", "WMN POS Menu Settings"):
        return

    settings = frappe.get_single("WMN POS Menu Settings")
    if settings.initialized:
        return

    settings.set("menu_items", [])
    for entry in DEFAULT_MENU_ITEMS:
        if not frappe.db.exists("DocType", entry["doctype_name"]):
            continue
        settings.append("menu_items", {"enabled": 1, **entry})

    settings.initialized = 1
    settings.flags.ignore_permissions = True
    settings.save()
