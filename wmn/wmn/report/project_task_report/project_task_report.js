frappe.query_reports["Project Task Report"] = {
    onload: function (report) {
        report.page.add_inner_button("Expand All", function () {
            expand_all_rows();
        });

        report.page.add_inner_button("Collapse All", function () {
            collapse_all_rows();
        });
    },
    filters: [
        {
            fieldname: "project",
            label: __("Project"),
            fieldtype: "Link",
            options: "Project",
            reqd: 1
        },
        {
            fieldname: "docstatus_filter",
            label: __("Document Status (0: Draft, 1: Submitted, 2: Cancelled)"),
            fieldtype: "Select",
            options: "\n0\n1\n2",
            default: "1"
        },
        {
            fieldname: "task_filter",
            label: __("Task"),
            fieldtype: "Link",
            options: "Task"
        },
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
            fieldname: "summarized",
            label: __("Summarized"),
            fieldtype: "Check"
        }
    ],

    formatter: function (value, row, column, data, default_formatter) {
        if (!data) return value;

        // default formatted value
        value = default_formatter(value, row, column, data);

        // لو كان هذا هو الكولمن الرئيسي
        if (column.fieldname === "document_name") {
            // بناء الايقونات حسب نوع الصف
            let icon = "";
            if (data.is_group) {
                icon = `<i class="fa fa-folder tree-toggle" data-key="${data.key}" style="cursor:pointer; margin-right:6px;"></i>`;
            } else {
                icon = `<i class="fa fa-file"></i>`;
            }

            // تطبيق indent حسب مستوى الشجرة
            let indent = (data.indent || 0) * 20;
            let spacer = `<span style="padding-left:${indent}px"></span>`;

            return spacer + icon + " " + value;
        }

        return value;
    }
};


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


// إظهار أبناء تاسك معين
function show_children(key) {
    $(`tr[data-parent='${key}']`).each(function () {
        $(this).show();

        // لو كان ابن عبارة عن جروب نفتح أبناءه أيضًا
        let child_key = $(this).attr("data-key");
        let is_group = $(this).attr("data-is-group");

        if (is_group === "1") {
            show_children(child_key);
        }
    });
}

// إخفاء أبناء تاسك معين
function hide_children(key) {
    $(`tr[data-parent='${key}']`).each(function () {
        $(this).hide();
        let child_key = $(this).attr("data-key");
        hide_children(child_key);
    });
}


// بعد تحميل بيانات التقرير نحقن الخصائص لكل Row في DOM
$(document).on("frappe-datatable-row-render", function (e, $row, data) {
    if (!data) return;

    $row.attr("data-key", data.key);
    $row.attr("data-parent", data.parent || "");
    $row.attr("data-is-group", data.is_group ? "1" : "0");

    // ضغط الجروب
    $row.find(".tree-toggle").on("click", function () {
        let key = $(this).attr("data-key");

        if ($(this).hasClass("fa-folder")) {
            // expand
            show_children(key);
            $(this).removeClass("fa-folder").addClass("fa-folder-open");
        } else {
            // collapse
            hide_children(key);
            $(this).removeClass("fa-folder-open").addClass("fa-folder");
        }
    });
});




frappe.query_reports["Project Task Tree3333333333333"] = {
    onload: function (report) {
        report.page.set_inner_btn_group_as_toggle = function () { }; // فقط لإصلاح
    },
    formatter: function (value, row, column, data, default_formatter) {
        let html = default_formatter(value, row, column, data);
        if (column.fieldname === "document_name" && data.is_group) {
            let indent_px = data.indent * 20;
            html = `<span style="padding-left:${indent_px}px; cursor:pointer;" class="toggle-group">${value}</span>`;
        } else if (column.fieldname === "document_name") {
            let indent_px = data.indent * 20;
            html = `<span style="padding-left:${indent_px}px;">${value}</span>`;
        }
        return html;
    },
    after_datatable_render: function (datatable, report) {
        // إضافة event لكل toggle
        $(".toggle-group").off("click").on("click", function () {
            let row_idx = $(this).closest("tr").index();
            let row_data = report.data[row_idx];
            let key = row_data.key;

            // إخفاء أو إظهار الأبناء
            report.data.forEach(function (r) {
                if (r.parent === key) {
                    r.hidden = !r.hidden;
                    // إخفاء recursive للأبناء
                    toggle_children(r.key, !r.hidden);
                }
            });
            report.refresh();
        });

        function toggle_children(parent_key, show) {
            report.data.forEach(function (r) {
                if (r.parent === parent_key) {
                    r.hidden = !show;
                    toggle_children(r.key, show);
                }
            });
        }
    },

    filters: [
        {
            fieldname: "project",
            label: __("Project"),
            fieldtype: "Link",
            options: "Project",
            reqd: 1
        },
        {
            fieldname: "docstatus_filter",
            label: __("Document Status (0: Draft, 1: Submitted, 2: Cancelled)"),
            fieldtype: "Select",
            options: "\n0\n1\n2",
            default: "1"
        },
        {
            fieldname: "task_filter",
            label: __("Task"),
            fieldtype: "Link",
            options: "Task"
        },
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
            fieldname: "summarized",
            label: __("Summarized"),
            fieldtype: "Check"
        }
    ]
};



