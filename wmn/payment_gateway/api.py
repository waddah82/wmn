import frappe

from .service import get_profile, record_device_result as _record_device_result, run_bridge_action, run_server_action, safe_profile


@frappe.whitelist()
def get_pos_payment_gateways(pos_profile=None):
    if not pos_profile:
        return []
    settings_name = frappe.db.get_value("WMN POS Profile Settings", {"pos_profile": pos_profile}, "name")
    if not settings_name:
        return []
    settings = frappe.get_doc("WMN POS Profile Settings", settings_name)
    rows = []
    for row in settings.get("payment_gateways") or []:
        if not row.enabled or not row.gateway_profile:
            continue
        profile = get_profile(row.gateway_profile)
        rows.append({
            "enabled": 1,
            "mode_of_payment": row.mode_of_payment,
            "is_default": int(row.is_default or 0),
            "gateway": safe_profile(profile),
        })
    return rows


@frappe.whitelist()
def authorize(gateway_profile=None, payload=None):
    return run_server_action("authorize", gateway_profile, payload)




@frappe.whitelist()
def status(gateway_profile=None, payload=None):
    return run_server_action("status", gateway_profile, payload)

@frappe.whitelist()
def refund(gateway_profile=None, payload=None):
    profile = get_profile(gateway_profile)
    if not profile.allow_refund:
        frappe.throw("Refund is disabled for this payment gateway profile.")
    return run_server_action("refund", gateway_profile, payload)


@frappe.whitelist()
def bridge_action(gateway_profile=None, action=None, payload=None):
    return run_bridge_action(action or "authorize", gateway_profile, payload)


@frappe.whitelist()
def record_device_result(gateway_profile=None, action=None, payload=None, result=None):
    return _record_device_result(gateway_profile, action or "authorize", payload, result)
