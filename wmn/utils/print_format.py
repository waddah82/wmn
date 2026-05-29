import frappe, base64
# from frappe.utils.pdf import get_pdf,cleanup
from frappe import _

# Won't be using this WMN Print Remote function
# @frappe.whitelist()
# def print_silently(doctype, name, print_format, print_type):
# 	user = frappe.db.get_single_value("WMN Print Settings", "print_user")
# 	tab_id = frappe.db.get_single_value("WMN Print Settings", "tab_id")
# 	pdf = create_pdf(doctype, name, print_format)
# 	data = {"doctype": doctype, "name": name, "print_format": print_format, "print_type": pdf["print_type"], "tab_id": tab_id, "pdf": pdf["pdf_base64"]}
# 	frappe.publish_realtime("print-silently", data, user=user)

@frappe.whitelist()
def set_master_tab(tab_id):
	query = 'update tabSingles set value={} where doctype="WMN Print Settings" and field="tab_id";'.format(tab_id)
	frappe.db.sql(query)
	frappe.publish_realtime("update_master_tab", {"tab_id": tab_id})

@frappe.whitelist()
def create_pdf(doctype, name, wmn_print_format, doc=None, no_letterhead=0):
	html = frappe.get_print(doctype, name, wmn_print_format, doc=doc, no_letterhead=no_letterhead)
	if not frappe.db.exists("WMN Print Format", wmn_print_format):
		return
	wmn_print_format = frappe.get_doc("WMN Print Format", wmn_print_format)
	options = get_pdf_options(wmn_print_format)
	pdf = get_pdf(html, options=options)
	pdf_base64 = base64.b64encode(pdf)
	return {
		"pdf_base64": pdf_base64.decode(),
		"print_type": wmn_print_format.default_print_type
	}
@frappe.whitelist()
def create_pdf11(doctype, name, wmn_print_format, no_letterhead=0, item_group=None):
    if not frappe.db.exists("WMN Print Format", wmn_print_format):
        return

    doc = frappe.get_doc(doctype, name)

    # ����� item_group ��� ���� ���� ������� ���� ���� doc
    context = {"item_group": item_group}

    html = frappe.get_print(
        doctype,
        name,
        wmn_print_format,
        doc=doc,
        no_letterhead=no_letterhead,
        context=context
    )

    wmn_print_format = frappe.get_doc("WMN Print Format", wmn_print_format)
    options = get_pdf_options(wmn_print_format)
    pdf = get_pdf(html, options=options)
    pdf_base64 = base64.b64encode(pdf)

    return {
        "pdf_base64": pdf_base64.decode(),
        "print_type": wmn_print_format.default_print_type
    }


@frappe.whitelist()
def create_pdf1(doctype, name, wmn_print_format, doc=None, no_letterhead=0, item_group=None):
    if not frappe.db.exists("WMN Print Format", wmn_print_format):
        return

    # ����� ��� item_group ��� ���� �������
    doc = frappe.get_doc(doctype, name)
    if item_group:
    
        doc.item_group = item_group
        

    html = frappe.get_print(
        doctype, 
        name, 
        wmn_print_format, 
        doc=doc, 
        no_letterhead=no_letterhead
    )

    wmn_print_format = frappe.get_doc("WMN Print Format", wmn_print_format)
    options = get_pdf_options(wmn_print_format)
    pdf = get_pdf(html, options=options)
    pdf_base64 = base64.b64encode(pdf)

    return {
        "pdf_base64": pdf_base64.decode(),
        "print_type": wmn_print_format.default_print_type
    }

@frappe.whitelist()
def create_pdf2(doctype, name, wmn_print_format, doc=None, no_letterhead=0):
  #doc = frappe.get_doc(doctype, name)
	html = frappe.get_print(doctype, name, wmn_print_format, doc=doc, no_letterhead=no_letterhead)
	if not frappe.db.exists("WMN Print Format", wmn_print_format):
		return
	wmn_print_format = frappe.get_doc("WMN Print Format", wmn_print_format)
	options = get_pdf_options(wmn_print_format)
	pdf = get_pdf(html, options=options)
	pdf_base64 = base64.b64encode(pdf)
	return {
		"pdf_base64": pdf_base64.decode(),
		"print_type": wmn_print_format.default_print_type
	}
 
 
def get_pdf_options(wmn_print_format):	
	options = {
		"page-size": wmn_print_format.get("page_size") or "A4",
	}
	if wmn_print_format.get("page_size") == "Custom":
		options = {
			"page-width": wmn_print_format.get("custom_width"),
			"page-height": wmn_print_format.get("custom_height")
		}
	options.update({"orientation": wmn_print_format.orientation})
	
	if not wmn_print_format.use_default_margin or not options.get("page-size") == "A4":
		options.update({
			"margin-left": f'{wmn_print_format.get("margin_left")}mm' or "15mm",
			"margin-right": f'{wmn_print_format.get("margin_right")}mm' or "15mm",
		})
		if wmn_print_format.get("margin_top") != "" and wmn_print_format.get("margin_top") != None:
			options.update({
				"margin-top": f'{wmn_print_format.get("margin_top")}mm'
			})
		if wmn_print_format.get("margin_bot") != "" and wmn_print_format.get("margin_bot") != None:
			options.update({
				"margin-bottom": f'{wmn_print_format.get("margin_bot")}mm'
			})

	return options


from distutils.version import LooseVersion
import pdfkit
import six
import io
from bs4 import BeautifulSoup
from PyPDF2 import PdfReader, PdfWriter
from frappe.utils import scrub_urls
from frappe.utils.pdf import get_file_data_from_writer, read_options_from_html, get_wkhtmltopdf_version

PDF_CONTENT_ERRORS = ["ContentNotFoundError", "ContentOperationNotPermittedError",
	"UnknownContentError", "RemoteHostClosedError"]




def get_pdf(html, options=None, output=None):
	html = scrub_urls(html)
	html, options = prepare_options(html, options)

	options.update({
		"disable-javascript": "",
		"disable-local-file-access": ""
	})

	filedata = ''
	if LooseVersion(get_wkhtmltopdf_version()) > LooseVersion('0.12.3'):
		options.update({"disable-smart-shrinking": ""})

	try:
		# Set filename property to false, so no file is actually created
		filedata = pdfkit.from_string(html, False, options=options or {})

		# https://pythonhosted.org/PyPDF2/PdfFileReader.html
		# create in-memory binary streams from filedata and create a PdfFileReader object
		reader = PdfReader(io.BytesIO(filedata))
	except OSError as e:
		if any([error in str(e) for error in PDF_CONTENT_ERRORS]):
			if not filedata:
				frappe.throw(_("PDF generation failed because of broken image links"))

			# allow pdfs with missing images if file got created
			if output:  # output is a PdfFileWriter object
				output.append_pages_from_reader(reader)
		else:
			raise

	if "password" in options:
		password = options["password"]
		if six.PY2:
			password = frappe.safe_encode(password)

	if output:
		output.append_pages_from_reader(reader)
		return output

	writer = PdfWriter()
	writer.append_pages_from_reader(reader)

	if "password" in options:
		writer.encrypt(password)

	filedata = get_file_data_from_writer(writer)

	return filedata


def prepare_options(html, options):
	if not options:
		options = {}

	options.update({
		'print-media-type': None,
		'background': None,
		'images': None,
		'quiet': None,
		# 'no-outline': None,
		'encoding': "UTF-8",
		#'load-error-handling': 'ignore'
	})

	if not options.get("margin-right"):
		options['margin-right'] = '15mm'

	if not options.get("margin-left"):
		options['margin-left'] = '15mm'

	html, html_options = read_options_from_html(html)
	options.update(html_options or {})

	# cookies
	if frappe.session and frappe.session.sid:
		options['cookie'] = [('sid', '{0}'.format(frappe.session.sid))]

	# page size
	if not options.get("page-size"):
		options['page-size'] = frappe.db.get_single_value("Print Settings", "pdf_page_size") or "A4"

	return html, options

