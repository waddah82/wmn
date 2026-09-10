from wmn.setup.invoice_barcode import ensure_invoice_barcode_fields
from wmn.setup.invoice_handoff import ensure_invoice_handoff_fields
from wmn.setup.offline_sync import ensure_offline_sync_fields
from wmn.setup.offline_payment import ensure_offline_payment_fields
from wmn.setup.pos_menu import ensure_default_pos_menu_settings
from wmn.setup.pos_profile_settings import migrate_legacy_pos_profile_settings, validate_settings_schema
from wmn.setup.cashier_completion import ensure_cashier_completion_fields
from wmn.setup.v16_cleanup import remove_v15_pos_invoice_compatibility
from wmn.features.pricing_rule.pricing_rule import enforce_all_pos_profiles_native_pricing_disabled
from wmn.offline_sync.tax_integrity import repair_invalid_sales_tax_row_references


def after_migrate():
    ensure_offline_sync_fields()
    ensure_offline_payment_fields()
    ensure_invoice_barcode_fields()
    ensure_invoice_handoff_fields()
    ensure_cashier_completion_fields()
    ensure_default_pos_menu_settings()
    validate_settings_schema()
    migrate_legacy_pos_profile_settings()
    enforce_all_pos_profiles_native_pricing_disabled()
    repair_invalid_sales_tax_row_references()
    remove_v15_pos_invoice_compatibility()
