frappe.query_reports["Tree Ledger"] = (function () {

    // --------- إعداد: ستايلات لكل مستوى indent ----------
    // يمكنك تعديل القيم هنا: background, font-size, font-weight, color, padding, وغيرها.
    const INDENT_WIDTH = 20; // بكسل لكل مستوى
    const indent_styles = {
        0: "background:#ccc; font-weight:700; font-size:14px; color:#0b1a2b; padding:4px 6px;",
        1: "background:#c1c8d1; font-weight:600; font-size:13px; color:#0a1c40; padding:3px 6px;",
        2: "background:#d1d8dd; font-weight:500; font-size:13px; color:#0a1c50; padding:2px 6px;",
        3: "background:#e2e2e2; font-weight:500; font-size:12px; color:#0a1c60; padding:2px 6px;",
        4: "background:#ffffff; font-weight:400; font-size:12px; color:#0a1c70; padding:2px 6px;"
    };
    function get_indent_style(level) {
        return indent_styles[level] || "background:none; font-weight:400; font-size:12px; color:inherit; padding:2px 6px;";
    }

    // ---------- التقرير ----------
    return {

        filters: [
            { fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company", reqd: 1 },
            { fieldname: "from_date", label: __("From Date"), fieldtype: "Date" },
            { fieldname: "to_date", label: __("To Date"), fieldtype: "Date" },
            { fieldname: "hide_zeros", label: __("Hide Zero Balanced"), fieldtype: "Check" },
            { fieldname: "docstatus_filter", label: __("Document Status"), fieldtype: "Select", options: "\n0\n1\n2", default: "1" }
        ],

        formatter: function (value, row, column, data, default_formatter) {
            if (!data) return value;
            value = default_formatter(value, row, column, data);

            //if (column.fieldname !== "account_name") return value;

            const indent = Number(data.indent || 0);
            const padding_left = indent * INDENT_WIDTH;

            // اختر ستايل المستوى
            const style = get_indent_style(indent);

            // أيقونة الفولدر أو عنصر مخفي للحفاظ على مساحة الأيقونة
            let icon_html = "";
            if (column.fieldname === "account_name") {
                if (!data.has_children) {
                    // حساب نهائي (لا أولاد ولا قيود) → أيقونة مخفية تشغل نفس العرض
                    icon_html = `<i class="fa fa-file" style="visibility:hidden; width:16px; display:inline-block;"></i>`;
                } else {
                    // حساب له قيود/أبناء → لا نضيف placeholder لكي لا نحرف المحاذاة
                    icon_html = "";
                }
                if (data.is_group) {
                    icon_html += `<i class="fa fa-folder tree-toggle" data-key="${data.key}" style="cursor:pointer; width:16px; display:inline-block;"></i>`;
                }
            }

            // سلسلة HTML النهائية (نطبق الـ padding-left و style المحدد)
            return `<div style="display:inline-flex; align-items:center; padding-left:${padding_left}px; ${style}">
                        ${icon_html}
                        <span style="margin-left:6px;">${value}</span>
                    </div>`;
        }
    };
})();


frappe.query_reports["Account Tree Report D2222"] = {
    onload: function (report) {
        report.page.add_inner_button("Expand All", function () {
            $(".tree-toggle").each(function () {
                let key = $(this).attr("data-key");
                $(".row[data-parent='" + key + "']").show();
                $(this).removeClass("fa-folder").addClass("fa-folder-open");
            });
        });

        report.page.add_inner_button("Collapse All", function () {
            $(".tree-toggle").each(function () {
                let key = $(this).attr("data-key");
                $(".row[data-parent='" + key + "']").hide();
                $(this).removeClass("fa-folder-open").addClass("fa-folder");
            });
        });
    },

    filters: [
        { fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company", reqd: 1 },
        { fieldname: "from_date", label: __("From Date"), fieldtype: "Date" },
        { fieldname: "to_date", label: __("To Date"), fieldtype: "Date" },
        { fieldname: "hide_zeros", label: __("Hide Zero Balanced"), fieldtype: "Check" },
        { fieldname: "docstatus_filter", label: __("Document Status"), fieldtype: "Select", options: "\n0\n1\n2", default: "1" }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        if (!data) return value;
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "account_name") {
            // أيقونة فولدر أو invisible file
            let icon = data.has_children
                ? `<i class="fa fa-folder tree-toggle" data-key="${data.key}" style="cursor:pointer; margin-right:6px;"></i>`
                : `<i class="fa fa-file" style="visibility:hidden; display:inline-block; width:16px;"></i>`;

            // المسافة البادئة
            let indent = (data.indent || 0) * 20;

            // ستايلات لكل مستوى اندنت
            const indent_styles = {
                0: "background:#f0f0f0; font-weight:bold; font-size:14px; color:#000;",
                1: "background:#fafafa; font-weight:bold; font-size:13px; color:#111;",
                2: "background:#fff; font-weight:normal; font-size:12px; color:#333;",
                3: "background:#fff; font-weight:normal; font-size:12px; color:#444;",
                4: "background:#fff; font-weight:normal; font-size:12px; color:#555;"
            };
            let style = indent_styles[data.indent] || "";

            return `<span style="padding-left:${indent}px; ${style}">${icon} ${value}</span>`;
        }

        return value;
    }
};

// Toggle عند الضغط على الفولدر
$(document).on("click", ".tree-toggle", function () {
    let key = $(this).attr("data-key");
    if ($(this).hasClass("fa-folder")) {
        $(".row[data-parent='" + key + "']").show();
        $(this).removeClass("fa-folder").addClass("fa-folder-open");
    } else {
        $(".row[data-parent='" + key + "']").hide();
        $(this).removeClass("fa-folder-open").addClass("fa-folder");
    }
});





frappe.query_reports["Account Tree Report D111111"] = {
    onload: function (report) {
        report.page.add_inner_button("Expand All", function () {
            expand_all_rows();
        });

        report.page.add_inner_button("Collapse All", function () {
            collapse_all_rows();
        });
    },

    filters: [
        { fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company", reqd: 1 },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date"
        },
        {
            fieldname: "docstatus_filter",
            label: __("Document Status"),
            fieldtype: "Select",
            options: "\n0\n1\n2",
            default: "1"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        if (!data) return value;
        value = default_formatter(value, row, column, data);

        if (column.fieldname === "account_name") {
            let indent = (data.indent || 0) * 20; // المسافة البادئة
            let icon = '';

            if (data.is_group) {
                // حساب مجموعة → أيقونة فولدر
                icon = `<i class="fa fa-folder tree-toggle" data-key="${data.key}" style="cursor:pointer; width:16px; display:inline-block;"></i>`;
            } else if (!data.has_children) {
                // حساب عادي بدون أولاد → أيقونة مخفية للحفاظ على المسافة
                icon = `<i class="fa fa-file" style="visibility:hidden; display:inline-block; width:16px;"></i>`;
            }
            // الحسابات التي لها أولاد (entries) لا تحصل على أي أيقونة مخفية

            return `<span style="padding-left:${indent}px; display:inline-flex; align-items:center;">${icon} ${value}</span>`;
        }

        return value;
    }
};

// ==== Expand / Collapse ====
function expand_all_rows() {
    $(".tree-toggle").each(function () {
        let key = $(this).attr("data-key");
        show_children(key);
        $(this).removeClass("fa-folder").addClass("fa-folder-open");
    });
}

function collapse_all_rows() {
    $(".tree-toggle").each(function () {
        let key = $(this).attr("data-key");
        hide_children(key);
        $(this).removeClass("fa-folder-open").addClass("fa-folder");
    });
}

function show_children(key) {
    $(`tr[data-parent='${key}']`).each(function () {
        $(this).show();
        let child_key = $(this).attr("data-key");
        if ($(this).attr("data-is-group") === "1") {
            show_children(child_key);
        }
    });
}

function hide_children(key) {
    $(`tr[data-parent='${key}']`).each(function () {
        $(this).hide();
        let child_key = $(this).attr("data-key");
        hide_children(child_key);
    });
}

// ==== Attach click handlers after row render ====
$(document).on("frappe-datatable-row-render", function (e, $row, data) {
    if (!data) return;

    $row.attr("data-key", data.key);
    $row.attr("data-parent", data.parent || "");
    $row.attr("data-is-group", data.is_group ? "1" : "0");
    $row.attr("data-has-children", data.has_children ? "1" : "0");

    $row.find(".tree-toggle").on("click", function () {
        let key = $(this).attr("data-key");

        if ($(this).hasClass("fa-folder")) {
            show_children(key);
            $(this).removeClass("fa-folder").addClass("fa-folder-open");
        } else {
            hide_children(key);
            $(this).removeClass("fa-folder-open").addClass("fa-folder");
        }
    });
});
