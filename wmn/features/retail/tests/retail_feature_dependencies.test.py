from pathlib import Path

root = Path(__file__).resolve().parents[3]
price_checker = root / "features" / "price_checker" / "price_checker.py"
barcode_printing = root / "features" / "barcode_printing" / "barcode_printing.py"
retail_search = root / "features" / "retail" / "retail_search.py"

assert retail_search.exists(), "Shared retail_search.py service is missing"
for path in (price_checker, barcode_printing):
    text = path.read_text(encoding="utf-8")
    assert "from wmn.items import get_items" not in text, f"{path.name} still depends on legacy wmn.items.get_items"
    assert "wmn.features.retail.retail_search" in text, f"{path.name} must use the shared retail search service"

retail_text = retail_search.read_text(encoding="utf-8")
assert "erpnext.selling.page.point_of_sale.point_of_sale" in retail_text, "Retail search must use ERPNext v16 POS item search"
assert "wmn.barcode_handler" in retail_text, "Retail search must use WMN barcode resolver"
assert "pos_next" not in retail_text, "Retail search must not depend on pos_next"
print("WMN_RETAIL_V16_DEPENDENCY_REGRESSION_PASS")
