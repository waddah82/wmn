import frappe
import pymysql

def execute(filters=None):
    # 1. تعريف الأعمدة التي ستظهر في ERPNext
    columns = [
        {"label": "رقم الطلب", "fieldname": "order_id", "fieldtype": "Link", "options": "Sales Invoice", "width": 100},
        {"label": "الحالة", "fieldname": "status", "fieldtype": "Data", "width": 120},
        {"label": "البريد الإلكتروني", "fieldname": "billing_email", "fieldtype": "Data", "width": 180},
        {"label": "تاريخ الطلب", "fieldname": "date_created", "fieldtype": "Datetime", "width": 160},
        {"label": "المنتج", "fieldname": "product_name", "fieldtype": "Data", "width": 200},
        {"label": "الكمية", "fieldname": "qty", "fieldtype": "Float", "width": 80},
        {"label": "الإجمالي (ريال)", "fieldname": "total_amount", "fieldtype": "Currency", "width": 120}
    ]

    # 2. إعدادات الاتصال بقاعدة بيانات ووردبريس
    db_config = {
        'host': 'localhost',
        'user': 'wp_user',
        'password': 'ASDasd--123',
        'database': 'wordpress_db',
        'cursorclass': pymysql.cursors.DictCursor
    }

    data = []
    try:
        connection = pymysql.connect(**db_config)
        with connection.cursor() as cursor:
            # استعلام SQL المخصص لنظام HPOS الذي تأكدنا منه في MariaDB
            sql = """
                SELECT 
                    o.id AS order_id,
                    o.status,
                    o.billing_email,
                    o.date_created_gmt AS date_created,
                    oi.order_item_name AS product_name,
                    MAX(IF(oim.meta_key = '_qty', oim.meta_value, NULL)) AS qty,
                    o.total_amount
                FROM wp_wc_orders o
                JOIN wp_woocommerce_order_items oi ON o.id = oi.order_id
                JOIN wp_woocommerce_order_itemmeta oim ON oi.order_item_id = oim.order_item_id
                WHERE o.status != 'auto-draft' 
                AND oi.order_item_type = 'line_item'
                GROUP BY oi.order_item_id
                ORDER BY o.id DESC
            """
            cursor.execute(sql)
            data = cursor.fetchall()

    except Exception as e:
        frappe.msgprint(f"فشل جلب البيانات: {str(e)}")
    finally:
        if 'connection' in locals():
            connection.close()

    return columns, data