window.onload = function () {
    setTimeout(applyCustomStyles, 1000);
};

function applyCustomStyles() {
    // جلب الألوان من دوكتايب UI Settings
    getColorsFromUISettings().then(colors => {
        const css = `
            body, html {
                background-color: ${colors.background_color || '#f9f9fb'} !important;
                color: ${colors.text_color || '#222'} !important;
                font-family: 'Segoe UI', sans-serif !important;
                font-size: 14px !important;
            }

            a {
                color: ${colors.primary_color || '#071879'} !important;
            }

            a:hover {
                color: ${colors.primary_dark_color || '#020b38'} !important;
            }

            ::selection {
                background-color: ${colors.selection_color || '#d0d0ff'} !important;
            }

            .page-head .page-head-content {
                background-color: ${colors.sidebar_color || '#e6edff'} !important;
            }

            .page-title {
                display: flex;
                align-items: center;
                background-color: ${colors.header_color || '#f3f3f3'} !important;
            }

            .page-actions {
                background-color: ${colors.header_color || '#f3f3f3'} !important;
            }

            .navbar {
                background-color: ${colors.navbar_color || '#4614f8'} !important;
                color: ${colors.navbar_text_color || '#ffffff'} !important;
            }

            .navbar .icon {
                color: ${colors.navbar_icon_color || '#f0f0f0'} !important;
            }

            .container {
                background-color: ${colors.sidebar_color || '#e6edff'} !important;
            }

            .layout-side-section {
                background-color: ${colors.sidebar_color || '#e6edff'} !important;
                color: ${colors.sidebar_text_color || '#fff'} !important;
            }

            .sidebar-item > div {
                color: ${colors.sidebar_item_color || '#ccc'} !important;
            }

            .sidebar-item:hover > div {
                background-color: ${colors.sidebar_hover_color || '#c0aacc'} !important;
                color: ${colors.sidebar_item_hover_color || '#fff'} !important;
            }

            .sidebar-item.active > div {
                background-color: ${colors.sidebar_active_color || '#6a0dad'} !important;
                color: ${colors.sidebar_item_active_color || '#ffffff'} !important;
            }

            .btn {
                border-radius: 6px !important;
                font-weight: 500 !important;
            }

            .btn-primary {
                background-color: ${colors.primary_color || '#6200ea'} !important;
                color: white !important;
                border: none !important;
            }

            .btn-primary:hover {
                background-color: ${colors.primary_dark_color || '#4b00c2'} !important;
            }

            .btn-secondary {
                background-color: ${colors.secondary_color || '#eeeeee'} !important;
                color: ${colors.text_color || '#222'} !important;
            }

            .btn-secondary:hover {
                background-color: ${colors.secondary_dark_color || '#dcdcdc'} !important;
            }

            .btn[data-label="Save"],
            .btn[data-label="حفظ"],
            .btn-primary[type="submit"] {
                background-color: ${colors.success_color || '#009688'} !important;
                color: #fff !important;
            }

            .btn[data-label="Add"],
            .btn[data-label="إضافة"] {
                background-color: ${colors.info_color || '#00bcd4'} !important;
                color: #fff !important;
            }

            .table th {
                background-color: ${colors.table_header_color || '#eeeeff'} !important;
                color: ${colors.text_color || '#222'} !important;
            }

            .table tr:nth-child(even) {
                background-color: ${colors.table_even_color || '#f9f9ff'} !important;
            }

            .table tr:nth-child(odd) {
                background-color: ${colors.table_odd_color || '#ffffff'} !important;
            }

            .table tr:hover {
                background-color: ${colors.table_hover_color || '#f0f0ff'} !important;
            }

            .card {
                background-color: ${colors.card_color || '#fff'} !important;
                border: 1px solid ${colors.border_color || '#ddd'} !important;
                box-shadow: 0 2px 5px rgba(0,0,0,0.05) !important;
            }

            .form-control {
                background-color: #ffffff !important;
                color: ${colors.text_color || '#222'} !important;
                border: 1px solid ${colors.border_color || '#ccc'} !important;
            }

            .form-control:focus {
                border-color: ${colors.primary_color || '#6200ea'} !important;
            }

            .alert.alert-success {
                background-color: ${colors.alert_success_bg || '#d4edda'} !important;
                color: ${colors.alert_success_text || '#155724'} !important;
            }

            .alert.alert-warning {
                background-color: ${colors.alert_warning_bg || '#fff3cd'} !important;
                color: ${colors.alert_warning_text || '#856404'} !important;
            }

            .alert.alert-danger {
                background-color: ${colors.alert_danger_bg || '#f8d7da'} !important;
                color: ${colors.alert_danger_text || '#721c24'} !important;
            }

            .alert.alert-info {
                background-color: ${colors.alert_info_bg || '#d1ecf1'} !important;
                color: ${colors.alert_info_text || '#0c5460'} !important;
            }

            .widget.links-widget-box .link-item {
                color: ${colors.text_color || '#180101'} !important;
                font-weight: 500 !important;
                font-size: larger !important;
            }

            .footer {
                background-color: ${colors.footer_color || '#1b27cc'} !important;
                color: #fff !important;
            }
        `;

        // إزالة الأنماط القديمة إذا كانت موجودة
        const oldStyle = document.getElementById('custom-global-styles');
        if (oldStyle) {
            oldStyle.remove();
        }

        let style = document.createElement('style');
        style.id = 'custom-global-styles';
        style.innerHTML = css;
        document.head.appendChild(style);
    }).catch(error => {
        console.log('Error applying custom styles:', error);
        // تطبيق الأنماط الافتراضية في حال وجود خطأ
        applyDefaultStyles();
    });
}

function getColorsFromUISettings() {
    return new Promise((resolve, reject) => {
        // التحقق من وجود frappe ومكنة الجلب
        if (typeof frappe === 'undefined' || !frappe.db) {
            reject('Frappe framework not available');
            return;
        }

        // جلب سجل من دوكتايب UI Settings
        frappe.db.get_value('UI Settings', 'UI Settings', '*')
            .then(response => {
                if (response && response.message) {
                    resolve(response.message);
                } else {
                    // إذا لم يوجد سجل، نجلب أول سجل موجود
                    frappe.db.get_list('UI Settings', {
                        fields: ['*'],
                        limit: 1
                    }).then(listResponse => {
                        if (listResponse && listResponse.length > 0) {
                            resolve(listResponse[0]);
                        } else {
                            reject('No UI Settings record found');
                        }
                    }).catch(reject);
                }
            })
            .catch(error => {
                console.log('Error fetching UI Settings:', error);
                reject(error);
            });
    });
}

// دالة بديلة في حال فشل جلب البيانات من الدوكتايب
function applyDefaultStyles() {
    const defaultCss = `
        body, html {
            background-color: #f9f9fb !important;
            color: #222 !important;
        }
        /* ... الأنماط الافتراضية الأخرى ... */
    `;

    let style = document.createElement('style');
    style.id = 'custom-global-styles';
    style.innerHTML = defaultCss;
    document.head.appendChild(style);
}

// تحديث الألوان عند تغييرها في دوكتايب UI Settings
function setupRealTimeUpdates() {
    // مراقبة تغييرات في الصفحة الحالية (للتحديث الفوري)
    if (typeof frappe !== 'undefined' && frappe.msgprint) {
        frappe.realtime.on('doc_update', function (data) {
            if (data.doctype === 'UI Settings') {
                setTimeout(applyCustomStyles, 500);
            }
        });
    }

    // تحديث كل 30 ثانية للتحقق من التغييرات
    //setInterval(applyCustomStyles, 30000);
}

// بدء التحديثات التلقائية
setupRealTimeUpdates();