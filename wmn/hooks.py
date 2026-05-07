app_name = "wmn"
app_title = "Wmn"
app_publisher = "Waddah"
app_description = "wmn"
app_email = "wmahnam@gmail.com"
app_license = "mit"
# required_apps = []

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/wmn/css/wmn.css"
# app_include_js = "/assets/wmn/js/ui_setting.js"
app_include_js = [
    "/assets/wmn/js/ui_setting.js",
    "/assets/wmn/js/pos_barcode_override.js",
    "assets/wmn/js/workspace_header_unified.js",
    #"/assets/wmn/js/workspace_header.js",
]
#app_include_css = "assets/your_app/css/workspace_header.css"
#website_route_rules = [
#    {"from_route": "/apps/<path:app_path>", "to_route": "/app/apps"},
#    {"from_route": "/apps", "to_route": "apps"},
#]

#website_redirects = [
#    {"source": "/app", "target": "/apps?route=%2Fapp"},
#]
# include js, css files in header of web template
# web_include_css = "/assets/wmn/css/wmn.css"
# web_include_js = "/assets/wmn/js/wmn.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "wmn/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}
page_js = {
    "point-of-sale": "public/js/custom_pos_offline.js"
}



override_whitelisted_methods = {
    "erpnext.stock.utils.scan_barcode": "wmn.barcode_handler.custom_scan_barcode",
    "erpnext.stock.get_item_details.get_item_details": "wmn.barcode_handler.custom_get_item_details",
    "pos_next.api.items.search_by_barcode": "wmn.barcode_handler.custom_search_by_barcode"
}
# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "wmn/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "wmn.utils.jinja_methods",
# 	"filters": "wmn.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "wmn.install.before_install"
# after_install = "wmn.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "wmn.uninstall.before_uninstall"
# after_uninstall = "wmn.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "wmn.utils.before_app_install"
# after_app_install = "wmn.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "wmn.utils.before_app_uninstall"
# after_app_uninstall = "wmn.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "wmn.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"wmn.tasks.all"
# 	],
# 	"daily": [
# 		"wmn.tasks.daily"
# 	],
# 	"hourly": [
# 		"wmn.tasks.hourly"
# 	],
# 	"weekly": [
# 		"wmn.tasks.weekly"
# 	],
# 	"monthly": [
# 		"wmn.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "wmn.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "wmn.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "wmn.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["wmn.utils.before_request"]
# after_request = ["wmn.utils.after_request"]

# Job Events
# ----------
# before_job = ["wmn.utils.before_job"]
# after_job = ["wmn.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"wmn.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

