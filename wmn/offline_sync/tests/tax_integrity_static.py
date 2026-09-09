import importlib.util
import sys
import types
from pathlib import Path


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


class FakeDB:
    def __init__(self):
        self.calls = []

    def table_exists(self, doctype, cached=False):
        return doctype == "Sales Taxes and Charges"

    def sql(self, query, *args, **kwargs):
        self.calls.append(query)
        if query.lstrip().lower().startswith("select"):
            return ["TAX-1", "TAX-2"] if kwargs.get("pluck") else [("TAX-1",), ("TAX-2",)]
        return []


fake_frappe = types.ModuleType("frappe")
fake_frappe.db = FakeDB()
sys.modules["frappe"] = fake_frappe

module_path = Path(__file__).resolve().parents[1] / "tax_integrity.py"
spec = importlib.util.spec_from_file_location("wmn_tax_integrity_static", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

row = {"charge_type": "On Net Total", "row_id": 0, "rate": 15}
module.normalize_tax_row_reference(row)
assert_true(row["row_id"] == "", "Non-reference tax rows must clear numeric zero references.")

row = {"charge_type": "Actual", "row_id": "2"}
module.normalize_tax_row_reference(row)
assert_true(row["row_id"] == "", "Actual taxes must never keep row references.")

row = {"charge_type": "On Previous Row Amount", "row_id": 1}
module.normalize_tax_row_reference(row)
assert_true(row["row_id"] == "1", "Previous-row taxes must preserve valid references as text.")

invoice = {
    "taxes": [
        {"charge_type": "On Net Total", "row_id": "0", "rate": 15},
        {"charge_type": "On Previous Row Total", "row_id": "1", "rate": 5},
    ]
}
normalized = module.normalize_invoice_tax_payload(invoice)
assert_true(normalized["taxes"][0]["row_id"] == "", "Invoice payload must clear persisted string zero.")
assert_true(normalized["taxes"][1]["row_id"] == "1", "Invoice payload must preserve legal previous-row references.")

count = module.repair_invalid_sales_tax_row_references()
assert_true(count == 2, "Migration repair must report the number of invalid rows found.")
update_sql = fake_frappe.db.calls[-1]
assert_true("trim(row_id) = '0'" in update_sql, "Migration must repair the persisted string zero case.")
assert_true("On Previous Row Amount" in update_sql, "Migration must preserve ERPNext previous-row charge types.")

print("WMN_TAX_INTEGRITY_SERVER_PASS")
