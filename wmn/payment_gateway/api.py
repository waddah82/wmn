import frappe

from .service import (
    get_pos_payment_gateway_mappings,
    get_profile,
    record_device_result as _record_device_result,
    run_server_action,
)


@frappe.whitelist()
def get_pos_payment_gateways(pos_profile=None):
    return get_pos_payment_gateway_mappings(pos_profile)


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
def record_device_result(gateway_profile=None, action=None, payload=None, result=None):
    return _record_device_result(gateway_profile, action or "authorize", payload, result)
