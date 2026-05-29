import frappe
from frappe import _
from datetime import datetime

class StockBalanceImportValidation:
    """كلاس خاص بالتحقق من صحة البيانات قبل الاستيراد"""
    
    def __init__(self, doc):
        self.doc = doc
        self.errors = []
        self.warnings = []
        self.row_errors = {}  # {row_index: [error_messages]}
        
    def validate_all(self):
        """تنفيذ جميع عمليات التحقق"""
        
        # 1. التحقق من Warehouse
        self.validate_warehouse()
        
        # 2. التحقق من Company
        self.validate_company()
        
        # 3. التحقق من البيانات في الجدول
        self.validate_table_data()
        
        # 4. التحقق من العلاقة بين Warehouse و Company
        self.validate_warehouse_company()
        
        return {
            "is_valid": len(self.errors) == 0,
            "errors": self.errors,
            "warnings": self.warnings,
            "row_errors": self.row_errors
        }
    
    def validate_warehouse(self):
        """التحقق من وجود المستودع"""
        if not self.doc.warehouse:
            self.errors.append("❌ Warehouse is required")
            return
        
        if not frappe.db.exists("Warehouse", self.doc.warehouse):
            self.errors.append(f"❌ Warehouse '{self.doc.warehouse}' does not exist")
    
    def validate_company(self):
        """التحقق من وجود الشركة"""
        if not self.doc.company:
            self.errors.append("❌ Company is required")
            return
        
        if not frappe.db.exists("Company", self.doc.company):
            self.errors.append(f"❌ Company '{self.doc.company}' does not exist")
    
    def validate_warehouse_company(self):
        """التحقق من أن المستودع ينتمي للشركة"""
        if self.doc.warehouse and self.doc.company:
            warehouse = frappe.get_cached_doc("Warehouse", self.doc.warehouse)
            if warehouse.company != self.doc.company:
                self.errors.append(
                    f"❌ Warehouse '{self.doc.warehouse}' does not belong to company '{self.doc.company}'. "
                    f"Warehouse belongs to '{warehouse.company}'"
                )
    
    def validate_table_data(self):
        """التحقق من جميع الصفوف في الجدول"""
        
        if not self.doc.items_table:
            self.errors.append("❌ No items in the table. Please add items before executing.")
            return
        
        for idx, row in enumerate(self.doc.items_table, start=1):
            row_errors = []
            
            # التحقق من Item Code
            if not row.item_code:
                row_errors.append(f"Row {idx}: Item Code is required")
            else:
                # التحقق من وجود العنصر
                if not frappe.db.exists("Item", row.item_code):
                    row_errors.append(f"Row {idx}: Item '{row.item_code}' does not exist in ERP")
                else:
                    item = frappe.get_cached_doc("Item", row.item_code)
                    
                    # التحقق من has_batch_no
                    if not item.has_batch_no:
                        row_errors.append(
                            f"Row {idx}: Item '{row.item_code}' does not support batches (has_batch_no=0). "
                            f"Please enable batch tracking for this item."
                        )
                    
                    # التحقق من has_expiry_date مع التاريخ
                    if item.has_expiry_date:
                        if not row.expiry_date:
                            row_errors.append(
                                f"Row {idx}: Item '{row.item_code}' requires expiry date (has_expiry_date=1) "
                                f"but no expiry date provided."
                            )
                        else:
                            # التحقق من أن التاريخ ليس من الماضي
                            if row.expiry_date < datetime.now().date():
                                row_errors.append(
                                    f"Row {idx}: Expiry date '{row.expiry_date}' is in the past. "
                                    f"Please provide a future expiry date."
                                )
                    else:
                        # إذا كان العنصر لا يدعم الصلاحية ولكن يوجد تاريخ
                        if row.expiry_date:
                            self.warnings.append(
                                f"⚠️ Row {idx}: Item '{row.item_code}' does not require expiry date, "
                                f"but expiry date '{row.expiry_date}' was provided. It will be ignored."
                            )
            
            # التحقق من الكمية
            if row.batch_qty <= 0:
                row_errors.append(f"Row {idx}: Quantity must be greater than zero (current: {row.batch_qty})")
            
            # التحقق من سعر التقييم
            if row.valuation_rate < 0:
                row_errors.append(f"Row {idx}: Valuation rate cannot be negative (current: {row.valuation_rate})")
            
            # حفظ الأخطاء لكل صف
            if row_errors:
                self.row_errors[idx] = row_errors
                self.errors.extend(row_errors)

@frappe.whitelist()
def validate_before_import(docname):
    """دالة للتحقق من البيانات قبل الاستيراد"""
    doc = frappe.get_doc("Stock Balance Import", docname)
    validator = StockBalanceImportValidation(doc)
    result = validator.validate_all()
    
    return result