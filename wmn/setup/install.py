from wmn.setup.invoice_barcode import ensure_invoice_barcode_fields
from wmn.setup.invoice_handoff import ensure_invoice_handoff_fields
from wmn.setup.offline_sync import ensure_offline_sync_fields
from wmn.setup.offline_payment import ensure_offline_payment_fields
from wmn.setup.cashier_completion import ensure_cashier_completion_fields
from wmn.setup.pos_profile_settings import migrate_legacy_pos_profile_settings, validate_settings_schema


def after_install():
    ensure_offline_sync_fields()
    ensure_offline_payment_fields()
    ensure_invoice_barcode_fields()
    ensure_invoice_handoff_fields()
    ensure_cashier_completion_fields()
    validate_settings_schema()
    migrate_legacy_pos_profile_settings()
