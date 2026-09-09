import frappe
from frappe import _
from frappe.utils import flt

from wmn.features.retail.retail_search import lookup_item


def _allowed_profiles():
    user = frappe.session.user
    rows = frappe.db.sql(
        """
        SELECT DISTINCT p.name, p.company, p.currency, p.warehouse, p.selling_price_list
        FROM `tabPOS Profile` p
        INNER JOIN `tabPOS Profile User` u ON u.parent = p.name
        WHERE p.disabled = 0 AND u.user = %s
        ORDER BY p.name
        """,
        user,
        as_dict=True,
    )
    return rows


def _ensure_profile_allowed(pos_profile):
    allowed = {row.name for row in _allowed_profiles()}
    if pos_profile not in allowed:
        frappe.throw(_("You are not allowed to use POS Profile {0}.").format(pos_profile), frappe.PermissionError)


@frappe.whitelist()
def get_context():
    profiles = _allowed_profiles()
    return {
        "pos_profiles": profiles,
        "default_pos_profile": profiles[0].name if profiles else None,
    }


@frappe.whitelist()
def lookup(value, pos_profile):
    value = str(value or "").strip()
    pos_profile = str(pos_profile or "").strip()
    if not value or not pos_profile:
        return None

    _ensure_profile_allowed(pos_profile)
    return lookup_item(value, pos_profile)
