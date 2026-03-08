frappe.provide("erpnext.PointOfSale");

// ===== Helper functions defined before the Controller =====
async function fetchOpening1() {
    return frappe.call("erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry", {
        user: frappe.session.user
    });
}

async function loadPrintSettings(pos_profile_name) {
    
    if (pos_profile_name) {
        try {
            const settings_r = await frappe.xcall('frappe.client.get', {
                doctype: 'POS Print Settings',
                name: pos_profile_name
            });
            if (settings_r) {
                window.pos_print_settings = settings_r;
                console.log("POS Print Settings loaded from POS Profile", window.pos_print_settings);

                
                return window.pos_print_settings;
            }
        } catch (err) {
            console.warn("POS Print Settings not found for profile:", pos_profile_name, err);
        }
    }
    if (!window.pos_print_settings) {
        frappe.call({
            method: "frappe.client.get",
            args: { doctype: "POS Print Settings", name: "POS Print Settings" },
            callback: function(r) {
                if (r.message) {
                    window.pos_print_settings = r.message;
                    if (window.pos_print_settings.convert_cards_to_text) {
                        convertCardsToTextElements();
                    }
                }
            }
        });
    }
    console.log("No POS Print Settings linked to this POS Profile defalut loaded");
    return null;
}

async function initProfile1(controller_instance) {
    const r = await fetchOpening1();
    if (r.message && r.message.length) {
        await loadPrintSettings(r.message[0].pos_profile);
    } else {
        console.log("fetchOpening  null", r);
    }
}

// ===== Define the Controller =====
frappe.pages['point-of-sale'].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Point of Sale"),
        single_column: true,
    });

    frappe.require("point-of-sale.bundle.js", async function() {

        class MyPOSController extends erpnext.PointOfSale.Controller {
            constructor(wrapper) {
                super(wrapper);
                // Initialize POS Profile and Print Settings on creation
                initProfile1(this);
            }

            check_stock_availability(item, qty, warehouse) {
                console.log("Adding item:", item.item_code);

                // If stock check is disabled in POS Print Settings, allow adding item
                if (window.pos_print_settings && window.pos_print_settings.disable_stock_check) {
                    console.log("Stock check disabled via POS Print Settings");
                    return true;
                }

                // Otherwise, perform the normal stock check
                return super.check_stock_availability(item, qty, warehouse);
            }
        }

        // Create the Controller instance
        wrapper.pos = new MyPOSController(wrapper);
        window.cur_pos = wrapper.pos;




        // Replace PastOrderSummary if needed
        if (window.pos_print_settings && window.pos_print_settings.print_method !== "Default") {
            class MyPastOrderSummary extends erpnext.PointOfSale.PastOrderSummary {
                constructor(wrapper, args) {
                    super(wrapper, args);
                }

                print_receipt() {
                    const doc = this.doc;
                    if (!doc) return;
                    const settings = window.pos_print_settings;
                    if (!settings) return;

                    if (settings.print_method !== "Button Only") {
                        frappe.msgprint("This invoice is printed automatically on submit.");
                        return;
                    }

                    const send2bridge = function(doc, rule) {
                        frappe.call({
                            method: 'restaurant.utils.print_format.create_pdf',
                            args: {
                                doctype: doc.doctype,
                                name: doc.name,
                                restaurant_print_format: rule.restaurant_print_format,
                                no_letterhead: 1,
                                _lang: "en"
                            },
                            callback: (r) => {
                                if (r.message && r.message.pdf_base64) {
                                    var printService = new restaurant.utils.WebSocketPrinter({
                                        onConnect: () => {
                                            printService.submit({
                                                'type': rule.print_type,
                                                'url': 'file.pdf',
                                                'file_content': r.message.pdf_base64
                                            });
                                        }
                                    });
                                } else {
                                    frappe.msgprint("Failed to create the PDF file.");
                                }
                            }
                        });
                    };
                    const send2bridge2 = function(doc, rule) {
                        if (rule.item_group) doc.item_group = rule.item_group
                        frappe.call({
                            method: 'restaurant.utils.print_format.create_pdf1',
                            args: {
                                doctype: doc.doctype,
                                name: doc.name,
                                restaurant_print_format: rule.restaurant_print_format,
                                no_letterhead: 1,
                                _lang: "en"
                            },
                            callback: (r) => {
                                if (r.message && r.message.pdf_base64) {
                                    var printService = new restaurant.utils.WebSocketPrinter({
                                        onConnect: () => {
                                            printService.submit({
                                                'type': rule.print_type,
                                                'url': 'file.pdf',
                                                'file_content': r.message.pdf_base64
                                            });
                                        }
                                    });
                                } else {
                                    frappe.msgprint("Failed to create the PDF file.");
                                }
                            }
                        });
                    };
                    const rules = settings.rules || [];
                    rules.forEach(rule => {
                        if (rule.do_print) {
                            send2bridge2(doc, rule);
                        }
                    });

                    settings.last_printed_invoice = doc.name;
                }
            }

            erpnext.PointOfSale.PastOrderSummary = MyPastOrderSummary;
        }
    });
};
