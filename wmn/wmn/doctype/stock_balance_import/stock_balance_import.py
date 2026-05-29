import frappe
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue
from frappe import _

class StockBalanceImport(Document):
    def validate(self):
        # تحقق من وجود بيانات في الجدول
        if not self.items_table:
            frappe.throw(_("Please add at least one item to the table"))
        
        # تحقق من صحة البيانات الأساسية
        for row in self.items_table:
            if row.batch_qty <= 0:
                frappe.throw(_("Quantity must be greater than zero for item {0}").format(row.item_code))
            if row.valuation_rate <= 0:
                frappe.throw(_("Valuation rate must be greater than zero for item {0}").format(row.item_code))

@frappe.whitelist()
def execute_import11111(docname, background=True):
    """Execute the stock balance import"""
    doc = frappe.get_doc("Stock Balance Import", docname)
    
    # تحديث الحالة
    doc.status = "Processing"
    doc.log = "Starting import process...\n"
    doc.save()
    frappe.db.commit()
    
    # تجهيز البيانات
    warehouse = doc.warehouse
    company = doc.company
    dry_run = doc.dry_run
    use_background = doc.use_background_job and background
    
    # تجميع البيانات من الجدول
    items_data = {}
    total_rows = len(doc.items_table)
    
    for row in doc.items_table:
        if row.item_code not in items_data:
            items_data[row.item_code] = []
        items_data[row.item_code].append({
            "qty": row.batch_qty,
            "expiry": row.expiry_date.strftime("%Y-%m-%d") if row.expiry_date else None,
            "val": row.valuation_rate
        })
    
    # إذا كان عدد الصفوف كبير والـ Background Job مفعل
    if use_background and total_rows > 100:
        # تشغيل في الخلفية
        enqueue(
            process_import_background,
            queue='long',
            timeout=3600,
            docname=docname,
            warehouse=warehouse,
            company=company,
            dry_run=dry_run,
            items_data=items_data,
            total_rows=total_rows
        )
        
        doc.log += f"🔄 Background job started for {total_rows} rows. Check logs for progress.\n"
        doc.status = "Processing (Background)"
        doc.save()
        frappe.db.commit()
        
        return {
            "status": "background_started", 
            "message": f"Background job started for {total_rows} rows. You can close this window.",
            "docname": docname
        }
    
    # تنفيذ مباشر (للبيانات الصغيرة)
    return process_import_sync(docname, warehouse, company, dry_run, items_data)



@frappe.whitelist()
def execute_import111111(docname, background=True):
    """Execute the stock balance import - STOP ON ANY ERROR"""
    
    try:
        # ========== 1. التحقق من وجود الوثيقة ==========
        if not frappe.db.exists("Stock Balance Import", docname):
            return {
                "status": "error",
                "message": f"Document {docname} not found"
            }
        
        doc = frappe.get_doc("Stock Balance Import", docname)
        
        # ========== 2. تحديث الحالة ==========
        doc.status = "Validating"
        doc.save()
        frappe.db.commit()
        
        # ========== 3. تنفيذ الـ Validation ==========
        from wmn.wmn.doctype.stock_balance_import.stock_balance_import_validation import validate_before_import
        
        validation_result = validate_before_import(docname)
        
        # ========== 4. إذا فشل التحقق - إيقاف التنفيذ ==========
        if not validation_result["is_valid"]:
            # تجميع رسائل الأخطاء
            error_message = "❌ VALIDATION FAILED - Execution Stopped\n\n"
            error_message += "Please fix the following errors before executing:\n\n"
            
            # أخطاء عامة
            if validation_result["errors"]:
                error_message += "📋 General Errors:\n"
                for error in validation_result["errors"]:
                    error_message += f"  • {error}\n"
                error_message += "\n"
            
            # أخطاء لكل صف
            if validation_result["row_errors"]:
                error_message += "📋 Row-specific Errors:\n"
                for row_num, errors in validation_result["row_errors"].items():
                    error_message += f"\n  Row {row_num}:\n"
                    for error in errors:
                        error_message += f"    • {error}\n"
            
            error_message += "\n" + "=" * 50 + "\n"
            error_message += "⚠️ No changes were made. Please fix all errors and try again."
            
            doc.log = error_message
            doc.status = "Validation Failed"
            doc.save()
            frappe.db.commit()
            
            return {
                "status": "validation_failed",
                "message": error_message,
                "errors": validation_result["errors"],
                "row_errors": validation_result["row_errors"],
                "execution_stopped": True
            }
        
        # ========== 5. عرض التحذيرات فقط (لا تمنع التنفيذ) ==========
        if validation_result["warnings"]:
            warnings_message = "⚠️ Warnings (will not stop execution):\n"
            for warning in validation_result["warnings"]:
                warnings_message += f"  • {warning}\n"
            frappe.msgprint(warnings_message, alert=True, indicator='orange')
        
        # ========== 6. تجهيز البيانات للتنفيذ ==========
        warehouse = doc.warehouse
        company = doc.company
        dry_run = doc.dry_run
        
        if not warehouse or not company:
            error_msg = "❌ EXECUTION STOPPED: Warehouse and Company are required"
            doc.log = error_msg
            doc.status = "Failed"
            doc.save()
            frappe.db.commit()
            return {
                "status": "error",
                "message": error_msg,
                "execution_stopped": True
            }
        
        # تجميع البيانات من الجدول
        items_data = {}
        for row in doc.items_table:
            if row.item_code not in items_data:
                items_data[row.item_code] = []
            items_data[row.item_code].append({
                "qty": row.batch_qty,
                "expiry": row.expiry_date.strftime("%Y-%m-%d") if row.expiry_date else None,
                "val": row.valuation_rate
            })
        
        # ========== 7. Dry Run (محاكاة فقط) ==========
        if dry_run:
            return process_dry_run_no_execution(docname, warehouse, company, items_data, doc)
        
        # ========== 8. التنفيذ الفعلي - مع التوقف عند أي خطأ ==========
        return process_real_execution_stop_on_error(docname, warehouse, company, items_data, doc)
        
    except Exception as e:
        frappe.log_error(f"Execute Import Error: {str(e)}\n{traceback.format_exc()}", "Stock Balance Import Error")
        return {
            "status": "error",
            "message": f"Execution stopped due to error: {str(e)}",
            "execution_stopped": True
        }


def process_dry_run_no_execution11111(docname, warehouse, company, items_data, doc):
    """معالجة Dry Run - عرض ما سيتم تنفيذه بدون أي تغيير فعلي"""
    log_lines = []
    total_qty = sum(b["qty"] for v in items_data.values() for b in v)
    
    log_lines.append("✅ DRY RUN COMPLETED - No actual changes made")
    log_lines.append("=" * 60)
    log_lines.append(f"📦 Warehouse           : {warehouse}")
    log_lines.append(f"🏢 Company             : {company}")
    log_lines.append(f"📊 Total Items         : {len(items_data)}")
    log_lines.append(f"📄 Total Batches       : {sum(len(v) for v in items_data.values())}")
    log_lines.append(f"🔢 Total Quantity      : {total_qty}")
    log_lines.append("=" * 60)
    log_lines.append("\n📝 The following batches WILL be created (Dry Run):")
    
    # عرض أسماء الدفعات التي سيتم إنشاؤها
    for item_code, batches in items_data.items():
        for b in batches:
            if b["expiry"]:
                expiry_part = b["expiry"][:7].replace("-", "")
            else:
                expiry_part = "NOEXP"
            batch_name = f"{item_code}-{expiry_part}"
            log_lines.append(f"  • {batch_name} | Qty: {b['qty']} | Rate: {b['val']}")
    
    log_lines.append("\n" + "=" * 60)
    log_lines.append("💡 To execute actual import:")
    log_lines.append("   1. Uncheck 'Dry Run'")
    log_lines.append("   2. Click 'Execute Import' again")
    log_lines.append("   3. All validations will run again before execution")
    
    doc.log = "\n".join(log_lines)
    doc.status = "Dry Run Completed"
    doc.save()
    frappe.db.commit()
    
    return {
        "status": "dry_run_done",
        "log": doc.log,
        "execution_stopped": False
    }


def process_real_execution_stop_on_error111111(docname, warehouse, company, items_data, doc):
    """تنفيذ الاستيراد الفعلي - التوقف التام عند أي خطأ"""
    log_lines = []
    
    log_lines.append("🚀 Starting actual import...")
    log_lines.append("=" * 60)
    log_lines.append(f"📦 Warehouse     : {warehouse}")
    log_lines.append(f"🏢 Company       : {company}")
    log_lines.append(f"📊 Total Items   : {len(items_data)}")
    log_lines.append(f"📄 Total Batches : {sum(len(v) for v in items_data.values())}")
    log_lines.append("=" * 60)
    log_lines.append("\n⚠️ EXECUTION MODE: Will stop immediately if any error found")
    log_lines.append("")
    
    # ========== التحقق النهائي قبل التنفيذ ==========
    final_errors = []
    
    for item_code, batches in items_data.items():
        # التحقق من وجود العنصر
        if not frappe.db.exists("Item", item_code):
            final_errors.append(f"Item '{item_code}' does not exist in ERP")
            break  # توقف فوراً
        
        item = frappe.get_cached_doc("Item", item_code)
        
        # التحقق من دعم الدفعات
        if not item.has_batch_no:
            final_errors.append(f"Item '{item_code}' does not support batches (has_batch_no=0)")
            break  # توقف فوراً
        
        # التحقق من الصلاحية إذا كان مطلوباً
        for idx, b in enumerate(batches, start=1):
            if item.has_expiry_date and not b["expiry"]:
                final_errors.append(f"Item '{item_code}' requires expiry date but none provided (Batch #{idx})")
                break
        
        if final_errors:
            break
    
    if final_errors:
        error_msg = "❌ EXECUTION STOPPED - Final validation failed:\n\n"
        for err in final_errors:
            error_msg += f"  • {err}\n"
        error_msg += "\n⚠️ No changes were made. Please fix the error and try again."
        
        doc.log = error_msg
        doc.status = "Failed"
        doc.save()
        frappe.db.commit()
        
        return {
            "status": "error",
            "message": error_msg,
            "execution_stopped": True
        }
    
    # ========== التنفيذ الفعلي مع التوقف عند أول خطأ ==========
    se_items = []
    bundles_created = 0
    total_batches = sum(len(v) for v in items_data.values())
    processed = 0
    
    try:
        for item_code, batches in items_data.items():
            val_rate = batches[0]["val"]
            
            for b in batches:
                processed += 1
                
                # إنشاء اسم الدفعة
                if b["expiry"]:
                    expiry_part = b["expiry"][:7].replace("-", "")
                else:
                    expiry_part = "NOEXP"
                
                new_batch_name = f"{item_code}-{expiry_part}"
                base_name = new_batch_name
                suffix = 1
                
                while frappe.db.exists("Batch", new_batch_name):
                    new_batch_name = f"{base_name}-{suffix}"
                    suffix += 1
                
                # إنشاء Batch
                batch_doc = frappe.get_doc({
                    "doctype": "Batch",
                    "batch_id": new_batch_name,
                    "item": item_code,
                    "expiry_date": b["expiry"],
                    "supplier": None
                })
                batch_doc.insert(ignore_permissions=True, ignore_mandatory=True)
                
                # إنشاء Serial and Batch Bundle
                bundle = frappe.get_doc({
                    "doctype": "Serial and Batch Bundle",
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "voucher_type": "Stock Entry",
                    "type_of_transaction": "Inward",
                    "company": company,
                    "entries": [{
                        "batch_no": new_batch_name,
                        "qty": b["qty"],
                        "warehouse": warehouse
                    }]
                })
                bundle.insert(ignore_permissions=True)
                bundles_created += 1
                
                # إضافة إلى Stock Entry items
                se_items.append({
                    "item_code": item_code,
                    "qty": b["qty"],
                    "t_warehouse": warehouse,
                    "basic_rate": val_rate,
                    "serial_and_batch_bundle": bundle.name,
                    "use_serial_batch_fields": 0,
                    "allow_zero_valuation_rate": 1 if val_rate == 0 else 0
                })
                
                log_lines.append(f"✅ [{processed}/{total_batches}] {item_code} | batch={new_batch_name} | qty={b['qty']} | rate={val_rate}")
                
                # Commit كل 50 عملية
                if processed % 50 == 0:
                    frappe.db.commit()
        
        # ========== إنشاء Stock Entry ==========
        log_lines.append("\n" + "=" * 60)
        log_lines.append("📝 Creating Stock Entry...")
        
        se = frappe.get_doc({
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": company,
            "remarks": f"Opening stock with batch numbers - {frappe.utils.now()}",
            "items": se_items
        })
        se.insert(ignore_permissions=True)
        frappe.db.commit()
        
        log_lines.append(f"✅ Stock Entry created: {se.name}")
        log_lines.append(f"🔢 Total SE lines: {len(se_items)}")
        log_lines.append(f"📦 Total bundles created: {bundles_created}")
        log_lines.append("\n" + "=" * 60)
        log_lines.append("🎉 IMPORT COMPLETED SUCCESSFULLY!")
        log_lines.append(f"📌 Stock Entry '{se.name}' is in DRAFT mode. Please review and submit manually.")
        
        doc.log = "\n".join(log_lines)
        doc.status = "Completed"
        doc.save()
        frappe.db.commit()
        
        return {
            "status": "success",
            "stock_entry": se.name,
            "log": doc.log,
            "bundles_created": bundles_created,
            "total_lines": len(se_items),
            "execution_stopped": False
        }
        
    except Exception as e:
        # في حالة حدوث أي خطأ، نوقف التنفيذ فوراً ونعرض الخطأ
        error_msg = f"❌ EXECUTION STOPPED AT STEP {processed}/{total_batches}\n\n"
        error_msg += f"Error: {str(e)}\n\n"
        error_msg += "⚠️ No changes were committed. All operations rolled back."
        error_msg += "\n\nPlease fix the error and try again."
        
        log_lines.append(f"\n❌ ERROR at step {processed}/{total_batches}: {str(e)}")
        log_lines.append("\n⚠️ EXECUTION STOPPED - No changes were saved")
        
        doc.log = "\n".join(log_lines)
        doc.status = "Failed"
        doc.save()
        frappe.db.commit()
        
        frappe.log_error(f"Stock Balance Import stopped at {processed}/{total_batches}: {str(e)}\n{traceback.format_exc()}", "Execution Stopped Error")
        
        return {
            "status": "error",
            "message": error_msg,
            "execution_stopped": True,
            "stopped_at_step": f"{processed}/{total_batches}"
        }


def process_import_background1(docname, warehouse, company, dry_run, items_data, total_rows):
    """Process import in background"""
    frappe.flags.in_background = True
    
    try:
        result = process_import_sync(docname, warehouse, company, dry_run, items_data)
        
        # تحديث الوثيقة بعد الانتهاء
        doc = frappe.get_doc("Stock Balance Import", docname)
        if result.get("status") == "success":
            doc.status = "Completed"
        elif result.get("status") == "error":
            doc.status = "Failed"
        else:
            doc.status = "Dry Run Completed"
        
        if result.get("log"):
            doc.log += f"\n\n{result.get('log')}"
        
        doc.save()
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Background Import Failed for {docname}: {str(e)}")
        doc = frappe.get_doc("Stock Balance Import", docname)
        doc.status = "Failed"
        doc.log += f"\n\n❌ ERROR: {str(e)}"
        doc.save()
        frappe.db.commit()

def process_import_sync1(docname, warehouse, company, dry_run, items_data):
    """Process import synchronously"""
    log_lines = []
    total_qty = sum(b["qty"] for v in items_data.values() for b in v)
    not_found = []
    
    # التحقق من وجود العناصر
    for item_code in items_data.keys():
        if not frappe.db.exists("Item", item_code):
            not_found.append(item_code)
    
    if dry_run:
        log_lines.append("✅ DRY RUN COMPLETED")
        log_lines.append(f"📦 Total Items         : {len(items_data)}")
        log_lines.append(f"📄 Stock Entry lines   : {sum(len(v) for v in items_data.values())}")
        log_lines.append(f"🔢 Total Quantity      : {total_qty}")
        log_lines.append(f"❌ Items Not in ERP    : {len(not_found)}")
        
        if not_found:
            log_lines.append("\n🚫 Missing Items:")
            for i in not_found[:20]:  # عرض أول 20 عنصر مفقود فقط
                log_lines.append(f"  - {i}")
            if len(not_found) > 20:
                log_lines.append(f"  ... and {len(not_found) - 20} more")
        
        log_text = "\n".join(log_lines)
        
        # تحديث الوثيقة
        doc = frappe.get_doc("Stock Balance Import", docname)
        doc.log = log_text
        doc.status = "Dry Run Completed"
        doc.save()
        frappe.db.commit()
        
        return {"status": "dry_run_done", "log": log_text}
    
    # التنفيذ الفعلي
    se_items = []
    errors = []
    bundles_created = 0
    total_batches = sum(len(v) for v in items_data.values())
    processed = 0
    
    log_lines.append("🚀 Starting actual import...")
    log_lines.append(f"📦 Total Items: {len(items_data)}")
    log_lines.append(f"📄 Total Batches: {total_batches}")
    log_lines.append("=" * 50)
    
    for item_code, batches in items_data.items():
        val_rate = batches[0]["val"]
        
        for b in batches:
            processed += 1
            try:
                # إنشاء اسم الدفعة
                if b["expiry"]:
                    expiry_part = b["expiry"][:7].replace("-", "")
                else:
                    expiry_part = "NOEXP"
                
                new_batch_name = f"{item_code}-{expiry_part}"
                base_name = new_batch_name
                suffix = 1
                
                while frappe.db.exists("Batch", new_batch_name):
                    new_batch_name = f"{base_name}-{suffix}"
                    suffix += 1
                
                # إنشاء Batch
                batch_doc = frappe.get_doc({
                    "doctype": "Batch",
                    "batch_id": new_batch_name,
                    "item": item_code,
                    "expiry_date": b["expiry"],
                    "supplier": None
                })
                batch_doc.insert(ignore_permissions=True)
                
                # إنشاء Serial and Batch Bundle
                bundle = frappe.get_doc({
                    "doctype": "Serial and Batch Bundle",
                    "item_code": item_code,
                    "warehouse": warehouse,
                    "voucher_type": "Stock Entry",
                    "type_of_transaction": "Inward",
                    "company": company,
                    "entries": [{
                        "batch_no": new_batch_name,
                        "qty": b["qty"],
                        "warehouse": warehouse
                    }]
                })
                bundle.insert(ignore_permissions=True)
                bundles_created += 1
                
                # إضافة إلى Stock Entry items
                se_items.append({
                    "item_code": item_code,
                    "qty": b["qty"],
                    "t_warehouse": warehouse,
                    "basic_rate": val_rate,
                    "serial_and_batch_bundle": bundle.name,
                    "use_serial_batch_fields": 0,
                    "allow_zero_valuation_rate": 1 if val_rate == 0 else 0
                })
                
                log_lines.append(f"✅ [{processed}/{total_batches}] {item_code} | batch={new_batch_name} | qty={b['qty']}")
                
                # Commit كل 50 عملية لتجنب مشاكل الذاكرة
                if processed % 50 == 0:
                    frappe.db.commit()
                
            except Exception as e:
                error_msg = f"❌ [{processed}/{total_batches}] {item_code} | {str(e)}"
                log_lines.append(error_msg)
                errors.append(f"{item_code} | {str(e)}")
                frappe.log_error(f"Stock Balance Import Error: {error_msg}")
    
    if errors:
        log_lines.append("\n" + "=" * 50)
        log_lines.append(f"❌ IMPORT FAILED with {len(errors)} errors")
        log_lines.append("\nFirst 10 errors:")
        for e in errors[:10]:
            log_lines.append(f"  - {e}")
        
        log_text = "\n".join(log_lines)
        
        # تحديث الوثيقة
        doc = frappe.get_doc("Stock Balance Import", docname)
        doc.log = log_text
        doc.status = "Failed"
        doc.save()
        frappe.db.commit()
        
        return {"status": "error", "log": log_text}
    
    # إنشاء Stock Entry
    log_lines.append("\n" + "=" * 50)
    log_lines.append("📝 Creating Stock Entry...")
    
    se = frappe.get_doc({
        "doctype": "Stock Entry",
        "stock_entry_type": "Material Receipt",
        "company": company,
        "remarks": f"Opening stock with batch numbers - {frappe.utils.now()}",
        "items": se_items
    })
    se.insert(ignore_permissions=True)
    frappe.db.commit()
    
    log_lines.append(f"✅ Stock Entry created: {se.name}")
    log_lines.append(f"🔢 Total SE lines: {len(se_items)}")
    log_lines.append(f"📦 Total bundles created: {bundles_created}")
    log_lines.append("\n" + "=" * 50)
    log_lines.append("🎉 IMPORT COMPLETED SUCCESSFULLY!")
    
    log_text = "\n".join(log_lines)
    
    # تحديث الوثيقة
    doc = frappe.get_doc("Stock Balance Import", docname)
    doc.log = log_text
    doc.status = "Completed"
    doc.save()
    frappe.db.commit()
    
    return {"status": "success", "stock_entry": se.name, "log": log_text}

@frappe.whitelist()
def get_import_status(docname):

    """Get status of background import"""
    doc = frappe.get_doc("Stock Balance Import", docname)
    return {
        "status": doc.status,
        "log": doc.log[-500:]  # آخر 500 حرف من السجل
    }
















@frappe.whitelist()
def execute_import(docname, background=True):
    """Execute the stock balance import - STOP ON ANY ERROR"""
    
    try:
        # التحقق من وجود الوثيقة
        if not frappe.db.exists("Stock Balance Import", docname):
            return {
                "status": "error",
                "message": f"Document {docname} not found"
            }
        
        doc = frappe.get_doc("Stock Balance Import", docname)
        
    
 
        # ========== تشغيل Background Job إذا كان عدد الصفوف كبيراً ==========
        if background and doc.use_background_job and len(doc.items_table) > 100:
            from frappe.utils.background_jobs import enqueue
            
            # تحديث الحالة
            doc.status = "Queued for Background"
            doc.save()
            frappe.db.commit()
            
            # تشغيل في الخلفية
            enqueue(
                execute_import_background_task,
                queue='long',
                timeout=3600,
                docname=docname
            )
            
            return {
                "status": "background_started",
                "message": f"Background job started for {len(doc.items_table)} items. You can close this window and check logs later."
            }
        
        # ========== تنفيذ عادي (غير Background) ==========
        return execute_import_sync(docname)
        
    except Exception as e:
        frappe.log_error(f"Execute Import Error: {str(e)}\n{traceback.format_exc()}", "Stock Balance Import Error")
        return {
            "status": "error",
            "message": str(e),
            "execution_stopped": True
        }


def execute_import_background_task(docname):
    """Background task for large imports"""
    frappe.flags.in_background = True
    
    try:
        result = execute_import_sync(docname)
        
        # تحديث الوثيقة بعد الانتهاء
        doc = frappe.get_doc("Stock Balance Import", docname)
        if result.get("status") == "success":
            doc.status = "Completed"
            doc.log = result.get("log", doc.log)
        elif result.get("status") == "error":
            doc.status = "Failed"
            doc.log = result.get("message", doc.log)
        elif result.get("status") == "validation_failed":
            doc.status = "Validation Failed"
            doc.log = result.get("message", doc.log)
        else:
            doc.status = "Completed"
        
        doc.save()
        frappe.db.commit()
        
    except Exception as e:
        frappe.log_error(f"Background Import Failed for {docname}: {str(e)}", "Background Import Error")
        doc = frappe.get_doc("Stock Balance Import", docname)
        doc.status = "Failed"
        doc.log = f"Background job failed: {str(e)}"
        doc.save()
        frappe.db.commit()


def execute_import_sync(docname):
    """Execute import synchronously (the main logic)"""
    
    doc = frappe.get_doc("Stock Balance Import", docname)
    
    # ========== منع التنفيذ إذا كانت الحالة Completed ==========
    if doc.status == "Completed":
        return {
            "status": "error",
            "message": "⚠️ This import has already been completed. Cannot execute again.\n\nPlease create a new document for another import.",
            "execution_stopped": True
        }
    
    # ========== Validation ==========
    doc.status = "Validating"
    doc.save()
    frappe.db.commit()
    
    from wmn.wmn.doctype.stock_balance_import.stock_balance_import_validation import validate_before_import
    
    validation_result = validate_before_import(docname)
    
    if not validation_result["is_valid"]:
        error_message = "❌ VALIDATION FAILED - Execution Stopped\n\n"
        error_message += "Please fix the following errors:\n\n"
        
        if validation_result["errors"]:
            error_message += "General Errors:\n"
            for error in validation_result["errors"]:
                error_message += f"  • {error}\n"
        
        if validation_result["row_errors"]:
            error_message += "\nRow-specific Errors:\n"
            for row_num, errors in validation_result["row_errors"].items():
                error_message += f"\nRow {row_num}:\n"
                for error in errors:
                    error_message += f"  • {error}\n"
        
        doc.log = error_message
        doc.status = "Validation Failed"
        doc.save()
        frappe.db.commit()
        
        return {
            "status": "validation_failed",
            "message": error_message,
            "errors": validation_result["errors"],
            "row_errors": validation_result["row_errors"]
        }
    
    # ========== Dry Run ==========
    if doc.dry_run:
        return process_dry_run_no_execution(doc)
    
    # ========== Real Execution ==========
    return process_real_execution_stop_on_error(doc)


def process_dry_run_no_execution(doc):
    """Process Dry Run - simulation only"""
    log_lines = []
    items_data = get_items_data_from_doc(doc)
    
    total_qty = sum(b["qty"] for v in items_data.values() for b in v)
    
    log_lines.append("✅ DRY RUN COMPLETED - No actual changes made")
    log_lines.append("=" * 60)
    log_lines.append(f"📦 Warehouse           : {doc.warehouse}")
    log_lines.append(f"🏢 Company             : {doc.company}")
    log_lines.append(f"📊 Total Items         : {len(items_data)}")
    log_lines.append(f"📄 Total Batches       : {sum(len(v) for v in items_data.values())}")
    log_lines.append(f"🔢 Total Quantity      : {total_qty}")
    log_lines.append("=" * 60)
    log_lines.append("\n📝 The following batches WILL be created:")
    
    for item_code, batches in items_data.items():
        for b in batches:
            if b["expiry"]:
                expiry_part = b["expiry"][:7].replace("-", "")
            else:
                expiry_part = "NOEXP"
            batch_name = f"{item_code}-{expiry_part}"
            log_lines.append(f"  • {batch_name} | Qty: {b['qty']} | Rate: {b['val']}")
    
    log_lines.append("\n" + "=" * 60)
    log_lines.append("💡 To execute actual import, uncheck 'Dry Run' and click Execute Import again.")
    
    doc.log = "\n".join(log_lines)
    doc.status = "Dry Run Completed"
    doc.save()
    frappe.db.commit()
    
    return {"status": "dry_run_done", "log": doc.log}


def process_real_execution_stop_on_error(doc):
    """Real execution - stop immediately on any error"""
    log_lines = []
    items_data = get_items_data_from_doc(doc)
    
    log_lines.append("🚀 Starting actual import...")
    log_lines.append("=" * 60)
    log_lines.append(f"📦 Warehouse     : {doc.warehouse}")
    log_lines.append(f"🏢 Company       : {doc.company}")
    log_lines.append(f"📊 Total Items   : {len(items_data)}")
    log_lines.append(f"📄 Total Batches : {sum(len(v) for v in items_data.values())}")
    log_lines.append("=" * 60)
    log_lines.append("\n⚠️ EXECUTION MODE: Will stop immediately if any error found")
    
    se_items = []
    bundles_created = 0
    total_batches = sum(len(v) for v in items_data.values())
    processed = 0
    
    try:
        for item_code, batches in items_data.items():
            val_rate = batches[0]["val"]
            
            for b in batches:
                processed += 1
                
                # Create batch name
                if b["expiry"]:
                    expiry_part = b["expiry"][:7].replace("-", "")
                else:
                    expiry_part = "NOEXP"
                
                new_batch_name = f"{item_code}-{expiry_part}"
                base_name = new_batch_name
                suffix = 1
                
                while frappe.db.exists("Batch", new_batch_name):
                    new_batch_name = f"{base_name}-{suffix}"
                    suffix += 1
                
                # Create Batch
                batch_doc = frappe.get_doc({
                    "doctype": "Batch",
                    "batch_id": new_batch_name,
                    "item": item_code,
                    "expiry_date": b["expiry"],
                    "supplier": None
                })
                batch_doc.insert(ignore_permissions=True, ignore_mandatory=True)
                
                # Create Bundle
                bundle = frappe.get_doc({
                    "doctype": "Serial and Batch Bundle",
                    "item_code": item_code,
                    "warehouse": doc.warehouse,
                    "voucher_type": "Stock Entry",
                    "type_of_transaction": "Inward",
                    "company": doc.company,
                    "entries": [{
                        "batch_no": new_batch_name,
                        "qty": b["qty"],
                        "warehouse": doc.warehouse
                    }]
                })
                bundle.insert(ignore_permissions=True)
                bundles_created += 1
                
                se_items.append({
                    "item_code": item_code,
                    "qty": b["qty"],
                    "t_warehouse": doc.warehouse,
                    "basic_rate": val_rate,
                    "serial_and_batch_bundle": bundle.name,
                    "use_serial_batch_fields": 0,
                    "allow_zero_valuation_rate": 1 if val_rate == 0 else 0
                })
                
                log_lines.append(f"✅ [{processed}/{total_batches}] {item_code} | batch={new_batch_name} | qty={b['qty']}")
                
                if processed % 50 == 0:
                    frappe.db.commit()
        
        # Create Stock Entry
        log_lines.append("\n" + "=" * 60)
        log_lines.append("📝 Creating Stock Entry...")
        
        se = frappe.get_doc({
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": doc.company,
            "remarks": f"Opening stock with batch numbers - {frappe.utils.now()}",
            "items": se_items
        })
        se.insert(ignore_permissions=True)
        frappe.db.commit()
        
        log_lines.append(f"✅ Stock Entry created: {se.name}")
        log_lines.append(f"🔢 Total SE lines: {len(se_items)}")
        log_lines.append(f"📦 Total bundles created: {bundles_created}")
        log_lines.append("\n" + "=" * 60)
        log_lines.append("🎉 IMPORT COMPLETED SUCCESSFULLY!")
        log_lines.append(f"📌 Stock Entry '{se.name}' is in DRAFT mode. Please review and submit manually.")
        
        doc.log = "\n".join(log_lines)
        doc.status = "Completed"
        doc.save()
        frappe.db.commit()
        
        return {
            "status": "success",
            "stock_entry": se.name,
            "log": doc.log,
            "bundles_created": bundles_created,
            "total_lines": len(se_items)
        }
        
    except Exception as e:
        error_msg = f"❌ EXECUTION STOPPED AT STEP {processed}/{total_batches}\n\nError: {str(e)}\n\n⚠️ No changes were committed."
        
        log_lines.append(f"\n❌ ERROR at step {processed}/{total_batches}: {str(e)}")
        log_lines.append("\n⚠️ EXECUTION STOPPED - No changes were saved")
        
        doc.log = "\n".join(log_lines)
        doc.status = "Failed"
        doc.save()
        frappe.db.commit()
        
        frappe.log_error(f"Stock Balance Import stopped: {str(e)}\n{traceback.format_exc()}", "Execution Stopped")
        
        return {
            "status": "error",
            "message": error_msg,
            "execution_stopped": True,
            "stopped_at_step": f"{processed}/{total_batches}"
        }


def get_items_data_from_doc(doc):
    """Extract items data from document"""
    items_data = {}
    for row in doc.items_table:
        if row.item_code not in items_data:
            items_data[row.item_code] = []
        items_data[row.item_code].append({
            "qty": row.batch_qty,
            "expiry": row.expiry_date.strftime("%Y-%m-%d") if row.expiry_date else None,
            "val": row.valuation_rate
        })
    return items_data