from wmn.setup.invoice_barcode import ensure_invoice_barcode_fields
from wmn.setup.invoice_handoff import ensure_invoice_handoff_fields
from wmn.setup.offline_sync import ensure_offline_sync_fields
from wmn.setup.offline_payment import ensure_offline_payment_fields
from wmn.setup.pos_menu import ensure_default_pos_menu_settings


def after_migrate():
    ensure_offline_sync_fields()
    ensure_offline_payment_fields()
    ensure_invoice_barcode_fields()
    ensure_invoice_handoff_fields()
    ensure_default_pos_menu_settings()
