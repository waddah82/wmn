import frappe


def _call(path, *args, **kwargs):
    return frappe.get_attr(path)(*args, **kwargs)


def _wmn_api(method, *args, **kwargs):
    return _call(f"wmn.api.{method}", *args, **kwargs)


@frappe.whitelist(allow_guest=False)
def pos_health_check(ts=None, source=None):
    return _wmn_api("pos_health_check", ts=ts, source=source or "wmn-pos")


@frappe.whitelist()
def get_pos_offline_data(pos_profile=None, price_list=None, warehouse=None):
    return _wmn_api("get_pos_offline_data", pos_profile=pos_profile, price_list=price_list, warehouse=warehouse)


@frappe.whitelist()
def sync_offline_pos_invoice(invoice, submit=1):
    return _wmn_api("sync_offline_pos_invoice", invoice=invoice, submit=submit)


@frappe.whitelist()
def sync_offline_pos_cash_movement(movement):
    return _wmn_api("sync_offline_pos_cash_movement", movement=movement)


@frappe.whitelist()
def sync_offline_payment_entry(payment):
    return _wmn_api("sync_offline_payment_entry", payment=payment)


@frappe.whitelist()
def get_pos_profile_settings(pos_profile=None):
    return _wmn_api("get_pos_profile_settings", pos_profile=pos_profile)


@frappe.whitelist()
def save_pos_profile_settings(pos_profile=None, values=None):
    return _wmn_api("save_pos_profile_settings", pos_profile=pos_profile, values=values)


@frappe.whitelist()
def get_pos_shift_receipt_counter(pos_opening_entry=None, company=None, pos_profile=None, user=None, posting_date=None):
    return _wmn_api(
        "get_pos_shift_receipt_counter",
        pos_opening_entry=pos_opening_entry,
        company=company,
        pos_profile=pos_profile,
        user=user,
        posting_date=posting_date,
    )


@frappe.whitelist()
def update_pos_shift_receipt_counter(pos_opening_entry=None, counter=None, company=None, pos_profile=None, user=None, posting_date=None):
    return _wmn_api(
        "update_pos_shift_receipt_counter",
        pos_opening_entry=pos_opening_entry,
        counter=counter,
        company=company,
        pos_profile=pos_profile,
        user=user,
        posting_date=posting_date,
    )


@frappe.whitelist()
def get_pricing_rule_snapshot(pos_profile=None):
    return _call("wmn.features.pricing_rule.pricing_rule.get_pricing_rule_snapshot", pos_profile=pos_profile)


@frappe.whitelist()
def validate_pos_coupon(**kwargs):
    return _wmn_api("validate_pos_coupon", **kwargs)


@frappe.whitelist()
def get_active_pos_promotions(company=None, pos_profile=None, warehouse=None):
    return _wmn_api("get_active_pos_promotions", company=company, pos_profile=pos_profile, warehouse=warehouse)


@frappe.whitelist()
def get_pos_supervisor_bundle(pos_profile=None):
    return _wmn_api("get_pos_supervisor_bundle", pos_profile=pos_profile)


@frappe.whitelist()
def verify_pos_supervisor_pin(supervisor=None, pin=None, action=None, context=None):
    return _wmn_api("verify_pos_supervisor_pin", supervisor=supervisor, pin=pin, action=action, context=context)


@frappe.whitelist()
def get_pos_cash_movement_context(pos_profile=None, pos_opening_entry=None):
    return _wmn_api("get_pos_cash_movement_context", pos_profile=pos_profile, pos_opening_entry=pos_opening_entry)


@frappe.whitelist()
def create_pos_cash_movement(movement):
    return _wmn_api("create_pos_cash_movement", movement=movement)


@frappe.whitelist()
def get_past_order_list(search_term=None, status=None, limit=20):
    return _wmn_api("get_past_order_list", search_term=search_term, status=status, limit=limit)


@frappe.whitelist()
def get_customer_recent_transactions(customer=None):
    return _wmn_api("get_customer_recent_transactions", customer=customer)


@frappe.whitelist()
def get_sales_invoice_payment_context(invoice_name=None):
    return _wmn_api("get_sales_invoice_payment_context", invoice_name=invoice_name)


@frappe.whitelist()
def add_payment_to_sales_invoice(**kwargs):
    return _wmn_api("add_payment_to_sales_invoice", **kwargs)


@frappe.whitelist()
def get_pos_item_variant_map(item_codes=None, price_list=None, warehouse=None, pos_profile=None):
    return _wmn_api(
        "get_pos_item_variant_map",
        item_codes=item_codes,
        price_list=price_list,
        warehouse=warehouse,
        pos_profile=pos_profile,
    )


@frappe.whitelist()
def custom_scan_barcode_pos(search_value=None, pos_profile=None, price_list=None):
    return _call(
        "wmn.barcode_handler.custom_scan_barcode_pos",
        search_value=search_value,
        pos_profile=pos_profile,
        price_list=price_list,
    )


@frappe.whitelist()
def get_pos_item_variants(template_code=None, price_list=None, warehouse=None, pos_profile=None):
    return _wmn_api(
        "get_pos_item_variants",
        template_code=template_code,
        price_list=price_list,
        warehouse=warehouse,
        pos_profile=pos_profile,
    )


@frappe.whitelist()
def get_pos_item_batches(item_code=None, warehouse=None, price_list=None, uom=None):
    return _wmn_api("get_pos_item_batches", item_code=item_code, warehouse=warehouse, price_list=price_list, uom=uom)


@frappe.whitelist()
def get_pos_item_uoms(item_code=None, price_list=None, batch_no=None):
    return _wmn_api("get_pos_item_uoms", item_code=item_code, price_list=price_list, batch_no=batch_no)


@frappe.whitelist()
def register_pos_coupon_redemption(**kwargs):
    return _wmn_api("register_pos_coupon_redemption", **kwargs)


@frappe.whitelist()
def register_pos_promotion_redemptions(promotion_results=None, invoice_doctype=None, invoice_name=None):
    return _wmn_api(
        "register_pos_promotion_redemptions",
        promotion_results=promotion_results,
        invoice_doctype=invoice_doctype,
        invoice_name=invoice_name,
    )


@frappe.whitelist()
def get_available_pos_doctypes():
    return _call("wmn.pos_doctype_manager.get_available_pos_doctypes")


@frappe.whitelist()
def get_dialog_scripts(doctype=None):
    return _call("wmn.pos_doctype_manager.get_dialog_scripts", doctype=doctype)


@frappe.whitelist()
def get_offline_doctype_models(doctype=None):
    return _call("wmn.pos_doctype_manager.get_offline_doctype_models", doctype=doctype)


@frappe.whitelist()
def get_offline_doctype_snapshot(doctype=None):
    return _call("wmn.pos_doctype_manager.get_offline_doctype_snapshot", doctype=doctype)


@frappe.whitelist()
def sync_offline_doctype_document(payload=None):
    return _call("wmn.pos_doctype_manager.sync_offline_doctype_document", payload=payload)


@frappe.whitelist()
def get_pos_payment_gateways(pos_profile=None):
    return _call("wmn.payment_gateway.api.get_pos_payment_gateways", pos_profile=pos_profile)


@frappe.whitelist()
def record_device_result(gateway_profile=None, action=None, payload=None, result=None):
    return _call(
        "wmn.payment_gateway.api.record_device_result",
        gateway_profile=gateway_profile,
        action=action,
        payload=payload,
        result=result,
    )


@frappe.whitelist()
def authorize(gateway_profile=None, payload=None):
    return _call("wmn.payment_gateway.api.authorize", gateway_profile=gateway_profile, payload=payload)


@frappe.whitelist()
def status(gateway_profile=None, payload=None):
    return _call("wmn.payment_gateway.api.status", gateway_profile=gateway_profile, payload=payload)


@frappe.whitelist()
def refund(gateway_profile=None, payload=None):
    return _call("wmn.payment_gateway.api.refund", gateway_profile=gateway_profile, payload=payload)
