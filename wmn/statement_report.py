# apps/your_app/your_app/api/statement_report.py

import frappe
from frappe import _
from frappe.utils import flt, getdate, get_datetime_str


COMP_CURRENCY = "SAR"


def tafqeet_0_99(n):
    ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"]
    tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]

    if n == 0:
        return ""
    if n < 10:
        return ones[n]
    if 10 <= n <= 19:
        if n == 10:
            return "عشرة"
        if n == 11:
            return "أحد عشر"
        if n == 12:
            return "اثنا عشر"
        return ones[n - 10] + " عشر"

    u = n % 10
    t = n // 10
    if u:
        return ones[u] + " و " + tens[t]
    return tens[t]


def tafqeet_0_999(n):
    hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"]
    if n == 0:
        return ""
    h = n // 100
    r = n % 100
    parts = []
    if h:
        parts.append(hundreds[h])
    if r:
        parts.append(tafqeet_0_99(r))
    return " و ".join([p for p in parts if p])


def tafqeet_arabic(n):
    if n == 0:
        return "صفر"

    def group_name(value, singular, dual, plural):
        if value == 1:
            return singular
        if value == 2:
            return dual
        if 3 <= value <= 10:
            return plural
        return singular

    parts = []
    billions = n // 1000000000
    n = n % 1000000000
    millions = n // 1000000
    n = n % 1000000
    thousands = n // 1000
    rest = n % 1000

    if billions:
        parts.append(tafqeet_0_999(billions) + " " + group_name(billions, "مليار", "ملياران", "مليارات"))
    if millions:
        parts.append(tafqeet_0_999(millions) + " " + group_name(millions, "مليون", "مليونان", "ملايين"))
    if thousands:
        parts.append(tafqeet_0_999(thousands) + " " + group_name(thousands, "ألف", "ألفان", "آلاف"))
    if rest:
        parts.append(tafqeet_0_999(rest))

    return " و ".join(parts)


def amount_to_arabic_words(amount, currency_code="SAR"):
    if amount < 0:
        amount = abs(amount)

    amount = flt(amount or 0, 2)

    integer_part = int(amount)
    decimal_part = int(round((amount - integer_part) * 100))

    if decimal_part == 100:
        integer_part += 1
        decimal_part = 0

    currency_map = {
        "SAR": {"main": "ريال سعودي", "sub": "هللة"},
        "YER": {"main": "ريال يمني", "sub": "فلس"},
        "USD": {"main": "دولار أمريكي", "sub": "سنت"},
        "EUR": {"main": "يورو", "sub": "سنت"},
        "AED": {"main": "درهم إماراتي", "sub": "فلس"},
    }

    currency_info = currency_map.get(currency_code, {"main": currency_code, "sub": ""})

    text = tafqeet_arabic(integer_part) + " " + currency_info["main"]

    if decimal_part > 0 and currency_info["sub"]:
        text += " و " + tafqeet_arabic(decimal_part) + " " + currency_info["sub"]

    return text


def convert_date(date_str):
    if not date_str:
        return None

    parts = str(date_str).split("-")
    if len(parts) != 3:
        return date_str

    if len(parts[0]) == 4:  # YYYY-MM-DD
        return date_str
    elif len(parts[0]) == 2:  # DD-MM-YYYY
        return f"{parts[2]}-{int(parts[1]):02d}-{int(parts[0]):02d}"

    return date_str


def get_customer_ageing_summary(customer, from_date, to_date, ranges=None):
    if ranges is None:
        ranges = [30, 60, 90, 120]

    try:
        sql = """
            SELECT
                CASE
                    WHEN DATEDIFF(%s, due_date) <= %s THEN '0-%s'
                    WHEN DATEDIFF(%s, due_date) <= %s THEN '%s-%s'
                    WHEN DATEDIFF(%s, due_date) <= %s THEN '%s-%s'
                    WHEN DATEDIFF(%s, due_date) <= %s THEN '%s-%s'
                    ELSE '%s+'
                END AS period,
                SUM(outstanding_amount) AS amount
            FROM `tabSales Invoice`
            WHERE docstatus = 1
              AND outstanding_amount > 0
              AND customer = %s
              AND posting_date BETWEEN %s AND %s
            GROUP BY period
        """

        params = [
            to_date, ranges[0], ranges[0],
            to_date, ranges[1], ranges[0] + 1, ranges[1],
            to_date, ranges[2], ranges[1] + 1, ranges[2],
            to_date, ranges[3], ranges[2] + 1, ranges[3],
            ranges[3] + 1,
            customer, from_date, to_date
        ]

        data = frappe.db.sql(sql, params, as_dict=True)

        result = {
            "0-30": 0.0,
            "31-60": 0.0,
            "61-90": 0.0,
            "91-120": 0.0,
            "121+": 0.0,
            "total": 0.0
        }

        key_map = {
            f"0-{ranges[0]}": "0-30",
            f"{ranges[0] + 1}-{ranges[1]}": "31-60",
            f"{ranges[1] + 1}-{ranges[2]}": "61-90",
            f"{ranges[2] + 1}-{ranges[3]}": "91-120",
            f"{ranges[3] + 1}+": "121+"
        }

        for d in data:
            if d.get("period") in key_map:
                result[key_map[d["period"]]] = flt(d.get("amount"))

        result["total"] = sum([
            result["0-30"],
            result["31-60"],
            result["61-90"],
            result["91-120"],
            result["121+"]
        ])

        return result

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Ageing Summary Error")
        return {"error": str(e)}


def get_simple_exchange_rate(from_currency, to_currency, transaction_date=None):
    if not (from_currency and to_currency):
        return 1
    if from_currency == to_currency:
        return 1

    if not transaction_date:
        transaction_date = frappe.utils.today()

    transaction_date = get_datetime_str(transaction_date)

    filters = [
        ["date", "<=", transaction_date],
        ["from_currency", "=", from_currency],
        ["to_currency", "=", to_currency],
    ]
    entries = frappe.get_all(
        "Currency Exchange",
        fields=["exchange_rate", "from_currency", "to_currency"],
        filters=filters,
        order_by="date desc",
        limit=1
    )

    if not entries:
        filters = [
            ["date", "<=", transaction_date],
            ["from_currency", "=", to_currency],
            ["to_currency", "=", from_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filters,
            order_by="date desc",
            limit=1
        )
        if entries:
            rate = flt(entries[0].exchange_rate)
            return 1 / rate if rate else 1

    if entries:
        return flt(entries[0].exchange_rate) or 1

    filters = [
        ["date", ">=", transaction_date],
        ["from_currency", "=", from_currency],
        ["to_currency", "=", to_currency],
    ]
    entries = frappe.get_all(
        "Currency Exchange",
        fields=["exchange_rate", "from_currency", "to_currency"],
        filters=filters,
        order_by="date asc",
        limit=1
    )

    if not entries:
        filters = [
            ["date", ">=", transaction_date],
            ["from_currency", "=", to_currency],
            ["to_currency", "=", from_currency],
        ]
        entries = frappe.get_all(
            "Currency Exchange",
            fields=["exchange_rate", "from_currency", "to_currency"],
            filters=filters,
            order_by="date asc",
            limit=1
        )
        if entries:
            rate = flt(entries[0].exchange_rate)
            return 1 / rate if rate else 1

    if entries:
        return flt(entries[0].exchange_rate) or 1

    return 1


def get_previous_balance(party_type, party, from_date_sql, company_currency, selected_currency):
    filters = {
        "posting_date": ["<", from_date_sql],
        "is_cancelled": 0
    }

    if party_type == "Account":
        filters["account"] = party
    else:
        filters.update({
            "party_type": party_type,
            "party": party
        })

    gl_entries = frappe.get_all(
        "GL Entry",
        fields=[
            "posting_date",
            "debit",
            "credit",
            "transaction_currency",
            "debit_in_transaction_currency",
            "credit_in_transaction_currency"
        ],
        filters=filters,
    )

    p_balance = 0
    for row in gl_entries:
        txn_currency = row.get("transaction_currency")
        debit_tx = flt(row.get("debit_in_transaction_currency"))
        credit_tx = flt(row.get("credit_in_transaction_currency"))
        debit = flt(row.get("debit"))
        credit = flt(row.get("credit"))

        if txn_currency == selected_currency and (debit_tx + credit_tx) > 0:
            used_debit = debit_tx
            used_credit = credit_tx
        else:
            rate = get_simple_exchange_rate(company_currency, selected_currency, row.get("posting_date")) or 1
            used_debit = debit * rate
            used_credit = credit * rate

        p_balance += used_debit - used_credit

    return p_balance


def get_company_currency():
    company = frappe.defaults.get_user_default("Company") or frappe.defaults.get_global_default("company")
    if company:
        return frappe.db.get_value("Company", company, "default_currency") or COMP_CURRENCY
    return COMP_CURRENCY


@frappe.whitelist()
def get_statement_report(
    party_type=None,
    party=None,
    from_date=None,
    to_date=None,
    use_transaction_currency=0,
    currency=None
):
    try:
        party_type = party_type or frappe.form_dict.get("party_type")
        party = party or frappe.form_dict.get("party")
        from_date = from_date or frappe.form_dict.get("from_date")
        to_date = to_date or frappe.form_dict.get("to_date")
        currency = currency or frappe.form_dict.get("currency")
        use_transaction_currency = (
            use_transaction_currency
            if use_transaction_currency is not None
            else frappe.form_dict.get("use_transaction_currency")
        )

        use_transaction_currency = True if str(use_transaction_currency) in ("1", "true", "True") else False

        from_date_sql = convert_date(from_date)
        to_date_sql = convert_date(to_date)

        if not party or not from_date_sql or not to_date_sql:
            return {
                "ok": False,
                "error": "الرجاء اختيار الحساب/العميل وتحديد التاريخ"
            }

        comp_currency = get_company_currency()
        selected_currency = currency

        ageing_summary = {}
        if party_type == "Customer":
            ageing_summary = get_customer_ageing_summary(
                customer=party,
                from_date=from_date_sql,
                to_date=to_date_sql,
                ranges=[30, 60, 90, 120]
            )
            if not ageing_summary:
                ageing_summary = {}
            elif ageing_summary.get("total", 0) == 0 and not ageing_summary.get("error"):
                ageing_summary = {"message": "لا توجد ديون مستحقة للعميل في الفترة المحددة"}

        if party_type == "Account":
            prev_balance_row = frappe.db.sql("""
                SELECT
                    COALESCE(SUM(debit), 0) AS total_debit,
                    COALESCE(SUM(credit), 0) AS total_credit
                FROM `tabGL Entry`
                WHERE account = %s
                  AND is_cancelled = 0
                  AND posting_date < %s
            """, (party, from_date_sql), as_dict=True)
        else:
            prev_balance_row = frappe.db.sql("""
                SELECT
                    COALESCE(SUM(debit), 0) AS total_debit,
                    COALESCE(SUM(credit), 0) AS total_credit
                FROM `tabGL Entry`
                WHERE party_type = %s
                  AND party = %s
                  AND is_cancelled = 0
                  AND posting_date < %s
            """, (party_type, party, from_date_sql), as_dict=True)

        if prev_balance_row:
            prev_balance = flt(prev_balance_row[0].get("total_debit")) - flt(prev_balance_row[0].get("total_credit"))
        else:
            prev_balance = 0

        if use_transaction_currency and selected_currency:
            prev_balance = get_previous_balance(
                party_type=party_type,
                party=party,
                from_date_sql=from_date_sql,
                company_currency=comp_currency,
                selected_currency=selected_currency
            )

        if party_type == "Account":
            entries = frappe.db.sql("""
                SELECT
                    posting_date,
                    voucher_subtype,
                    voucher_no,
                    remarks,
                    voucher_type,
                    SUM(debit) AS debit,
                    SUM(credit) AS credit,
                    SUM(debit_in_transaction_currency) AS debit_in_transaction_currency,
                    SUM(credit_in_transaction_currency) AS credit_in_transaction_currency,
                    transaction_exchange_rate,
                    COALESCE(transaction_currency, account_currency, %s) AS transaction_currency
                FROM `tabGL Entry`
                WHERE account = %s
                  AND is_cancelled = 0
                  AND posting_date BETWEEN %s AND %s
                GROUP BY
                    posting_date, voucher_subtype, voucher_no, remarks,
                    voucher_type, transaction_exchange_rate,
                    transaction_currency, account_currency
                ORDER BY posting_date ASC
            """, (comp_currency, party, from_date_sql, to_date_sql), as_dict=True)
        else:
            entries = frappe.db.sql("""
                SELECT
                    posting_date,
                    voucher_subtype,
                    voucher_no,
                    remarks,
                    voucher_type,
                    SUM(debit) AS debit,
                    SUM(credit) AS credit,
                    SUM(debit_in_transaction_currency) AS debit_in_transaction_currency,
                    SUM(credit_in_transaction_currency) AS credit_in_transaction_currency,
                    transaction_exchange_rate,
                    COALESCE(transaction_currency, account_currency, %s) AS transaction_currency
                FROM `tabGL Entry`
                WHERE party_type = %s
                  AND party = %s
                  AND is_cancelled = 0
                  AND posting_date BETWEEN %s AND %s
                GROUP BY
                    posting_date, voucher_subtype, voucher_no, remarks,
                    voucher_type, transaction_exchange_rate,
                    transaction_currency, account_currency
                ORDER BY posting_date ASC
            """, (comp_currency, party_type, party, from_date_sql, to_date_sql), as_dict=True)

        type_map = {
            "Pay": "سند صرف",
            "Receive": "سند قبض",
            "Payment Entry": "سند قبض / صرف",
            "Internal Transfer": "تحويل داخلي",
            "Cash Entry": "حركة نقدية",
            "Sales Invoice": "فاتورة مبيعات",
            "Purchase Invoice": "فاتورة مشتريات",
            "POS Invoice": "فاتورة نقطة بيع",
            "Sales Order": "أمر بيع",
            "Purchase Order": "أمر شراء",
            "Stock Entry": "قيد مخزني",
            "Stock Reconciliation": "تسوية مخزون",
            "Material Receipt": "استلام مواد",
            "Delivery Note": "إذن تسليم",
            "Purchase Receipt": "إذن استلام",
            "Credit Note": "إشعار دائن/مرتجع",
            "Debit Note": "إشعار مدين/مرتجع",
            "Journal Entry": "قيد محاسبي",
            "Opening Entry": "رصيد افتتاحي",
            "Contra": "قيد مقابل",
            "Write Off": "شطب",
            "Period Closing Voucher": "قيد إقفال فترة",
            "Expense Claim": "مطالبة مصروف",
            "Exchange Gain/Loss": "أرباح / خسائر فروقات عملة",
            "Asset Movement": "حركة أصل",
            "Asset Depreciation": "إهلاك أصل",
            "Bank Reconciliation": "تسوية بنكية"
        }

        currency_used = selected_currency if (use_transaction_currency and selected_currency) else comp_currency

        result = [{
            "posting_date": from_date_sql,
            "voucher_subtype": "رصيد سابق",
            "voucher_no": "",
            "debit": 0,
            "credit": 0,
            "debit_in_transaction_currency": 0,
            "credit_in_transaction_currency": 0,
            "remarks": "",
            "running_balance": prev_balance,
            "currency": currency_used,
            "exchange_rate": 1,
            "voucher_type": ""
        }]

        running_balance = prev_balance

        for row in entries:
            exchange_rate = 1
            debit = flt(row.get("debit"))
            credit = flt(row.get("credit"))
            debit_tx = flt(row.get("debit_in_transaction_currency"))
            credit_tx = flt(row.get("credit_in_transaction_currency"))
            txn_currency = row.get("transaction_currency")

            if use_transaction_currency and selected_currency:
                if txn_currency == selected_currency and (debit_tx + credit_tx) > 0:
                    debit = debit_tx
                    credit = credit_tx
                else:
                    exchange_rate = get_simple_exchange_rate(comp_currency, selected_currency, row.get("posting_date")) or 1
                    debit = debit * exchange_rate
                    credit = credit * exchange_rate

            running_balance += debit - credit

            remarks = row.get("remarks") or ""
            if remarks and remarks.strip().lower() in ["no remarks", "لا ملاحظات"]:
                remarks = " "

            result.append({
                "posting_date": row.get("posting_date"),
                "voucher_subtype": type_map.get(row.get("voucher_subtype"), row.get("voucher_subtype")),
                "voucher_no": row.get("voucher_no"),
                "debit": debit,
                "credit": credit,
                "debit_in_transaction_currency": debit,
                "credit_in_transaction_currency": credit,
                "remarks": remarks,
                "running_balance": running_balance,
                "currency": currency_used,
                "exchange_rate": exchange_rate,
                "voucher_type": row.get("voucher_type")
            })

        final_balance = running_balance
        balance_type = "مدين" if final_balance >= 0 else "دائن"
        arabic_balance = amount_to_arabic_words(abs(final_balance), currency_used)

        result.append({
            "posting_date": to_date_sql,
            "voucher_subtype": "المجموع النهائي",
            "voucher_no": "",
            "debit": 0,
            "credit": 0,
            "debit_in_transaction_currency": 0,
            "credit_in_transaction_currency": 0,
            "remarks": f"{balance_type}: {arabic_balance}",
            "running_balance": final_balance,
            "currency": currency_used,
            "exchange_rate": 1,
            "voucher_type": ""
        })

        response = {
            "ok": True,
            "data": result,
            "running_balance": running_balance
        }

        if party_type == "Customer":
            response["aging_summary"] = ageing_summary

        return response

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Statement Report Error")
        return {
            "ok": False,
            "error": str(e)
        }