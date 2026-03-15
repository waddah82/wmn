from frappe import _

def get_data(context):
    return {
        "page_name": "shamsboard",
        "title": _("ShamsBoard"),
        "icon": "fa fa-dashboard",
        "single_column": True
    }
