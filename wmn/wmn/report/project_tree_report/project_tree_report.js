frappe.query_reports["Project Tree Report"] = {
    onload: function(report) {
        // hijack refresh to run tree builder after report renders
        const original_refresh = report.refresh;
        report.refresh = async function() {
            await original_refresh.apply(this, arguments);
            // تأخير بسيط حتى يتم إدخال DOM
            setTimeout(() => buildTreeFromReport(report), 200);
        };
    },

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        if (!data) return value;

        // ------------------ صفوف Task أولاً ------------------
        if (data.doctype_type === 'Task') {
            const style = 'background-color: #E0F7FA; font-weight: 700;';
        

            // رابط في Document Name
            if (column.fieldname === 'document_name') {
                const doctype = data.doctype_type;
                const docname = data.document_name;
                if (doctype && docname &&  data.indent!=1) {
                    //value = `<span style="cursor:pointer; color:blue;" onclick="frappe.set_route('Form','${doctype}','${docname}')">${value}</span>`;
                    value = `<span style="cursor:pointer; " onclick="frappe.set_route('Form','${doctype}','${docname}')">${value}</span>`;

                }
            }

            return `<span style="${style}">${value}</span>`;
        }
        //if (data.doctype_type.contains('Group')) {
        //const style = 'font-weight: 700;';
        //return `<span style="${style}">${value}</span>`;
        //}

        // ------------------ روابط لكل Document Name ------------------
        if (column.fieldname === 'document_name') {
            const doctype = data.doctype_type;
            const docname = data.document_name;
            if (doctype && docname &&  data.indent!=1) {
                //value = `<span style="cursor:pointer; color:blue;" onclick="frappe.set_route('Form','${doctype}','${docname}')">${value}</span>`;
                value = `<span style="cursor:pointer; " onclick="frappe.set_route('Form','${doctype}','${docname}')">${value}</span>`;
            }
        }

        // ------------------ أيقونات في Subject ------------------
        if (column.fieldname === 'subject') {
            let icon = '';
            switch (data.doctype_type) {
                case 'Timesheet Group':
                case 'Timesheet (Total)':
                    icon = '⏱️ ';
                    break;
                case 'Expense Claim Group':
                case 'Expense Claim (Total)':
                    icon = '💰 ';
                    break;
                case 'Purchase Invoice Group':
                case 'Purchase Invoice (Total)':
                    icon = '🧾 ';
                    break;
            }
            value = icon + value;
        }

        // ------------------ تنسيق باقي الخلايا ------------------
        const cell_style = 'background-color:#F5F5F5; font-weight:600;';
        
        return `<span style="${cell_style}">${value}</span>`;
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


function buildTreeFromReport(report) {
    // data returned from execute()
    const data = report.data || [];
    const cols = report.columns || [];

    // find table element (try common selectors)
    let $table = $("table.report-view, table.report-table, table.table");
    if (!$table.length) {
        // fallback: first table in report wrapper
        $table = $(".report-wrapper table").first();
        if (!$table.length) return;
    }

    // build new tbody from data (we keep thead intact)
    const colCount = cols.length || 4;
    const $thead = $table.find("thead");
    let new_tbody = $("<tbody></tbody>");

    // helper: escape html
    function esc(s){ return (s===undefined || s===null) ? "" : String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

    // create a map of rows by key for quick lookup
    const keyMap = {};
    data.forEach((r, idx) => {
        if (r.key) keyMap[String(r.key)] = r;
    });

    // render rows in order of data array (preserves your grouping order)
    data.forEach((r, idx) => {
        const indent = r.indent ? parseInt(r.indent) : 0;
        const is_group = r.is_group ? true : false;
        const key = r.key || r.document_name || (`row-${idx}`);
        const parent = r.parent || "";
        const doc_name_display = esc(r.document_name || "");
        const subject = esc(r.subject || "");
        const doctype_type = esc(r.doctype_type || "");
        const total_amount = (r.total_amount !== undefined && r.total_amount !== null) ? esc(r.total_amount) : "";

        // first cell content: show toggle for groups (indent 0 or 1)
        let first_cell_inner = "";
        if (is_group) {
            first_cell_inner = `<span class="tree-toggle" data-key="${esc(key)}" style="cursor:pointer;margin-right:6px">▶</span> ${subject}`;
        } else {
            // non-group: pad according to indent (visual)
            const pad = indent * 18;
            first_cell_inner = `<span style="display:inline-block;width:${pad}px"></span> ${subject}`;
        }

        // build <tr> with attributes for JS to use
        const $tr = $(`<tr class="tree-row tree-level-${indent}" data-key="${esc(key)}" data-parent="${esc(parent)}" data-indent="${indent}"></tr>`);
        // build td cells according to columns count. We'll map to known fields where possible
        // safe filling: Document Name, Subject, Document Type, Total Amount, Linked Task, Project, Parent Document
        const td_doc = `<td class="dt-cell">${doc_name_display}</td>`;
        const td_subject = `<td class="dt-cell">${first_cell_inner}</td>`;
        const td_doctype = `<td class="dt-cell">${doctype_type}</td>`;
        const td_amount = `<td class="dt-cell">${total_amount}</td>`;
        const td_linked = `<td class="dt-cell">${esc(r.linked_task||"")}</td>`;
        const td_project = `<td class="dt-cell">${esc(r.project||"")}</td>`;
        const td_parent = `<td class="dt-cell">${esc(r.parent_doc_name||"")}</td>`;

        // put together based on columns definition to be safer
        // match by label/fieldname heuristics
        let cells = [];
        // try to follow your columns layout
        cells.push(td_doc);
        cells.push(td_subject);
        cells.push(td_doctype);
        cells.push(td_amount);
        cells.push(td_linked);
        cells.push(td_project);
        cells.push(td_parent);

        // ensure number of tds equals colCount (pad empty if needed)
        while (cells.length < colCount) cells.push(`<td class="dt-cell"></td>`);
        // if too many, slice
        if (cells.length > colCount) cells = cells.slice(0, colCount);

        $tr.append(cells.join(""));
        // hide non-task groups initially: show only indent 0 (Task row)
        if (indent === 0) {
            $tr.show();
        } else {
            $tr.hide();
        }

        new_tbody.append($tr);
    });

    // replace tbody
    $table.find("tbody").remove();
    $table.append(new_tbody);

    // attach toggles
    $table.find(".tree-toggle").off("click").on("click", function(e){
        e.stopPropagation();
        const $btn = $(this);
        const key = $btn.attr("data-key");
        const $row = $table.find(`tr[data-key='${css_escape(key)}']`);
        if (!$row.length) return;

        const isOpen = $btn.hasClass("open");
        if (isOpen) {
            // close: hide direct children (recursive)
            collapse_recursive(key, $table);
            $btn.removeClass("open").text("▶");
        } else {
            // open: show immediate children rows (indent = parent.indent + 1)
            expand_immediate(key, $table);
            $btn.addClass("open").text("▼");
        }
    });

    // helper functions
    function expand_immediate(parentKey, $table) {
        const $children = $table.find(`tr[data-parent='${css_escape(parentKey)}']`);
        $children.each(function(){
            $(this).show();
            // if this child is a group and its toggle had open class, expand its children as well (respect its state)
            const childKey = $(this).attr("data-key");
            const toggle = $(this).find(".tree-toggle");
            if (toggle.length && toggle.hasClass("open")) {
                expand_immediate(childKey, $table);
            }
        });
    }

    function collapse_recursive(parentKey, $table) {
        const $children = $table.find(`tr[data-parent='${css_escape(parentKey)}']`);
        $children.each(function(){
            const childKey = $(this).attr("data-key");
            // hide this child and all its descendants
            $(this).find(".tree-toggle").removeClass("open").text("▶");
            $(this).hide();
            collapse_recursive(childKey, $table);
        });
    }

    // css escape for attribute selector
    function css_escape(str) {
        if (typeof str !== "string") return str;
        return str.replace(/(["'\\])/g, "\\$1");
    }
}













