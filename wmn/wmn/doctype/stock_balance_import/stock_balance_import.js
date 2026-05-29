frappe.ui.form.on('Stock Balance Import', {
    refresh: function(frm) {
        // ========== زر Execute Import ==========
        frm.add_custom_button(__('Execute Import'), function() {
            // ========== منع التنفيذ إذا كانت الحالة Completed ==========
            if (frm.doc.status === 'Completed') {
                frappe.msgprint({
                    title: __('Cannot Execute'),
                    message: __('⚠️ This import has already been completed.\n\nPlease create a new document for another import.'),
                    indicator: 'orange'
                });
                return;
            }
            
            // التأكد من حفظ الوثيقة أولاً
            if (frm.is_new()) {
                frappe.msgprint({
                    title: __('Save Required'),
                    message: __('Please save the document first before executing import.'),
                    indicator: 'orange'
                });
                return;
            }
            
            // التأكد من وجود بيانات في الجدول
            if (!frm.doc.items_table || frm.doc.items_table.length === 0) {
                frappe.msgprint({
                    title: __('No Data'),
                    message: __('Please add items to the table first (manually or via Excel import).'),
                    indicator: 'red'
                });
                return;
            }
            
            // تأكيد التنفيذ حسب الوضع
            let confirm_message = '';
            if (frm.doc.dry_run) {
                confirm_message = __('⚠️ DRY RUN MODE\n\nThis will only SIMULATE the import.\nNo batches or stock entry will be created.\n\nDo you want to continue?');
            } else if (frm.doc.use_background_job && frm.doc.items_table.length > 100) {
                confirm_message = __('🚀 BACKGROUND JOB MODE\n\nYou have {0} items.\nThis will run in background.\nYou can close this window and check logs later.\n\nDo you want to continue?', [frm.doc.items_table.length]);
            } else {
                confirm_message = __('⚠️ REAL EXECUTION MODE\n\nThis will create:\n- Batches\n- Serial and Batch Bundles\n- Stock Entry (Draft)\n\nDo you want to continue?');
            }
            
            frappe.confirm(confirm_message, function() {
                execute_import(frm);
            });
        }).addClass('btn-primary');
        
        // ========== زر الاستيراد من Excel ==========
        frm.add_custom_button(__('Import from Excel'), function() {
            // ========== منع الاستيراد إذا كانت الحالة Completed ==========
            if (frm.doc.status === 'Completed') {
                frappe.msgprint({
                    title: __('Cannot Import'),
                    message: __('⚠️ This import has already been completed.\n\nCannot import additional data. Please create a new document.'),
                    indicator: 'orange'
                });
                return;
            }
            
            if (frm.is_new()) {
                frappe.msgprint({
                    title: __('Save Required'),
                    message: __('Please save the document first before importing data.'),
                    indicator: 'orange'
                });
                return;
            }
            show_import_dialog(frm);
        }).addClass('btn-secondary');
        
        // ========== زر تحميل النموذج ==========
        frm.add_custom_button(__('Download Template'), function() {
            download_template();
        }).addClass('btn-secondary');
        
        // ========== زر مسح الجدول ==========
        frm.add_custom_button(__('Clear Table'), function() {
            // منع مسح الجدول إذا كانت الحالة Completed
            if (frm.doc.status === 'Completed') {
                frappe.msgprint({
                    title: __('Cannot Clear'),
                    message: __('⚠️ This import has already been completed.\n\nCannot clear the table. Please create a new document.'),
                    indicator: 'orange'
                });
                return;
            }
            
            if (frm.doc.items_table && frm.doc.items_table.length > 0) {
                frappe.confirm(__('Are you sure you want to clear all {0} items?', [frm.doc.items_table.length]), function() {
                    frm.clear_table('items_table');
                    frm.refresh_field('items_table');
                    frappe.show_alert({message: __('Table cleared'), indicator: 'green'});
                });
            }
        }).addClass('btn-danger');
        
        // ========== زر إنشاء نسخة جديدة (New Copy) ==========
        // if (frm.doc.status === 'Completed') {
        //     frm.add_custom_button(__('Create New Copy'), function() {
        //         frappe.call({
        //             method: "wmn.wmn.doctype.stock_balance_import.stock_balance_import.create_new_copy",
        //             args: { docname: frm.doc.name },
        //             callback: function(r) {
        //                 if (r.message && r.message.success) {
        //                     frappe.msgprint({
        //                         title: __('New Copy Created'),
        //                         message: __('A new copy has been created: {0}', [r.message.new_docname]),
        //                         indicator: 'green'
        //                     });
        //                     frappe.set_route('Form', 'Stock Balance Import', r.message.new_docname);
        //                 }
        //             }
        //         });
        //     }).addClass('btn-secondary');
        // }
        
        // إظهار رسالة توجيهية للسجلات الجديدة أو المكتملة
        if (frm.is_new()) {
            frm.dashboard.clear_headline();
            frm.dashboard.set_headline_alert(
                __('⚠️ Please save the document first, then you can import data or execute import.')
            );
        } else if (frm.doc.status === 'Completed') {
            frm.dashboard.clear_headline();
            frm.dashboard.set_headline_alert(
                __('✅ This import has been completed. Click "Create New Copy" to start a new import.')
            );
            
            // تعطيل الجدول للتعديل
            frm.fields_dict['items_table'].grid.only_sortable();
            frm.fields_dict['items_table'].grid.cannot_add_rows = true;
            frm.refresh_field('items_table');
        }
        
        // إظهار حالة العملية الحالية
        update_status_display(frm);
    },
    
    after_save: function(frm) {
        frappe.show_alert({
            message: __('✅ Document saved successfully. You can now import data or execute import.'),
            indicator: 'green'
        });
    }
});

// ========== دالة التنفيذ الرئيسية ==========
function execute_import(frm) {
    // Show loading dialog
    let loading_dialog = new frappe.ui.Dialog({
        title: __('Processing'),
        fields: [
            {
                fieldname: 'html',
                fieldtype: 'HTML',
                options: '<div class="text-center"><i class="fa fa-spinner fa-spin fa-3x"></i><br><p>Processing import...</p><p class="text-muted">Please wait</p></div>'
            }
        ]
    });
    loading_dialog.show();
    
    // Call execute import
    frappe.call({
        method: "wmn.wmn.doctype.stock_balance_import.stock_balance_import.execute_import",
        args: {
            docname: frm.doc.name,
            background: frm.doc.use_background_job || false
        },
        callback: function(r) {
            loading_dialog.hide();
            
            if (r.message) {
                // ========== حالة: Background Job Started ==========
                if (r.message.status === 'background_started') {
                    frappe.msgprint({
                        title: __('🚀 Background Job Started'),
                        message: __(r.message.message || 'The import is running in background. You can close this window.'),
                        indicator: 'blue',
                        is_minimizable: false
                    });
                    // تحديث الصفحة
                    setTimeout(function() {
                        frm.reload_doc();
                    }, 2000);
                }
                
                // ========== حالة: Validation Failed ==========
                else if (r.message.status === 'validation_failed') {
                    show_validation_error_dialog(r.message);
                    frm.reload_doc();
                }
                
                // ========== حالة: Dry Run Done ==========
                else if (r.message.status === 'dry_run_done') {
                    frappe.msgprint({
                        title: __('✅ Dry Run Completed'),
                        message: __('No actual changes were made. Check the log section for details.'),
                        indicator: 'green',
                        is_minimizable: true
                    });
                    frm.reload_doc();
                }
                
                // ========== حالة: Success ==========
                else if (r.message.status === 'success') {
                    show_success_dialog(r.message);
                    // تحديث الصفحة لعرض البيانات الجديدة
                    setTimeout(function() {
                        frm.reload_doc();
                    }, 1000);
                }
                
                // ========== حالة: Error ==========
                else if (r.message.status === 'error') {
                    show_error_dialog(r.message);
                    frm.reload_doc();
                }
                
                // ========== حالة: Execution Stopped ==========
                else if (r.message.execution_stopped) {
                    show_stopped_dialog(r.message);
                    frm.reload_doc();
                }
            } else {
                frappe.msgprint({
                    title: __('⚠️ Unexpected Response'),
                    message: __('No response from server. Check error log.'),
                    indicator: 'red'
                });
            }
        },
        error: function(error) {
            loading_dialog.hide();
            frappe.msgprint({
                title: __('❌ Execution Failed'),
                message: __('An error occurred: {0}', [error]),
                indicator: 'red'
            });
        }
    });
}

// ========== تحديث دالة الاستيراد من Excel ==========
function show_import_dialog(frm) {
    if (frm.is_new()) {
        frappe.msgprint({
            title: __('Cannot Import'),
            message: __('Please save the document first before importing.'),
            indicator: 'red'
        });
        return;
    }
    
    // منع الاستيراد إذا كانت الحالة Completed
    if (frm.doc.status === 'Completed') {
        frappe.msgprint({
            title: __('Cannot Import'),
            message: __('⚠️ This import has already been completed.\n\nCannot import additional data. Please create a new document.'),
            indicator: 'orange'
        });
        return;
    }
    
    let dialog = new frappe.ui.Dialog({
        title: __('Import from Excel/CSV'),
        fields: [
            {
                label: __('Choose File'),
                fieldname: 'file',
                fieldtype: 'Attach',
                reqd: 1,
                description: __('Supported formats: .xlsx, .xls, .csv')
            },
            {
                label: __('Clear existing data before import'),
                fieldname: 'clear_existing',
                fieldtype: 'Check',
                default: 1,
                description: __('Remove current items before adding new ones')
            }
        ],
        primary_action_label: __('Import'),
        primary_action: function(values) {
            if (!values.file) {
                frappe.msgprint(__('Please select a file'));
                return;
            }
            
            dialog.hide();
            
            // Show loading
            let import_dialog = new frappe.ui.Dialog({
                title: __('Importing'),
                fields: [
                    {
                        fieldname: 'html',
                        fieldtype: 'HTML',
                        options: '<div class="text-center"><i class="fa fa-spinner fa-spin fa-2x"></i><br><p>Importing data from Excel...</p></div>'
                    }
                ]
            });
            import_dialog.show();
            
            if (values.clear_existing) {
                frm.clear_table('items_table');
                frm.refresh_field('items_table');
            }
            
            frappe.call({
                method: "wmn.wmn.doctype.stock_balance_import.import_helper.parse_excel_file",
                args: {
                    file_url: values.file,
                    docname: frm.doc.name
                },
                callback: function(r) {
                    import_dialog.hide();
                    
                    if (r.message && r.message.success) {
                        let message = __(r.message.message);
                        
                        frappe.msgprint({
                            title: __('✅ Import Successful'),
                            message: message,
                            indicator: 'green',
                            is_minimizable: true
                        });
                        
                        // ========== تحديث الصفحة بعد الاستيراد ==========
                        frm.reload_doc();
                        
                    } else if (r.message && !r.message.success) {
                        frappe.msgprint({
                            title: __('❌ Import Failed'),
                            message: __('Error: {0}', [r.message.error]),
                            indicator: 'red'
                        });
                    }
                },
                error: function(error) {
                    import_dialog.hide();
                    frappe.msgprint({
                        title: __('❌ Import Failed'),
                        message: __('An error occurred: {0}', [error]),
                        indicator: 'red'
                    });
                }
            });
        }
    });
    
    dialog.show();
}