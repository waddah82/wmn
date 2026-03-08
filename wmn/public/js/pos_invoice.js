frappe.ui.form.on('POS Invoice', {
    onload: function(frm) {

        // ------------------------------
        // Load POS Print Settings once
        // ------------------------------
        if (!window.pos_print_settings) {
            frappe.call({
                method: "frappe.client.get",
                args: { doctype: "POS Print Settings", name: "POS Print Settings" },
                callback: function(r) {
                    if (r.message) {
                        window.pos_print_settings = r.message;

                        // Convert cards if option enabled
                        if (window.pos_print_settings.convert_cards_to_text) {
                            convertCardsToTextElements();
                        }
                    }
                }
            });
        }

        // ------------------------------
        // Convert cards to text elements
        // ------------------------------
        const convertCardsToTextElements = () => {
            const cards = document.querySelectorAll("div[data-item-code]");
            cards.forEach(card => {
                if (card.classList.contains("converted-text")) return;

                const item_code = card.getAttribute("data-item-code");
                const item_text = card.innerText.trim().replace(/\n+/g, " | ").split(" | ")[2];

                const textElement = document.createElement("div");
                textElement.innerText = item_text;
                textElement.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 100%;
                    height: 110%;
                    padding: 1px;
                    margin: 0;
                    color: #000;
                    font-weight: bold;
                    font-size: 15px;
                    text-align: center;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                    background: #e6edff;
                    box-sizing: border-box;
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: break-word;
                    cursor: pointer;
                `;
                textElement.onclick = () => {
                    if (frappe?.pos?.app?.add_new_item_to_cart) {
                        frappe.pos.app.add_new_item_to_cart(item_code);
                    }
                };

                card.innerHTML = "";
                card.appendChild(textElement);
                card.classList.add("converted-text");
                card.style.cssText = `
                    width: 110%;
                    height: auto;
                    min-height: 40px;
                    padding: 0px;
                    margin: 0;
                `;
            });
        };

        const observer = new MutationObserver(() => {
            if (window.pos_print_settings?.convert_cards_to_text) {
                convertCardsToTextElements();
            }
        });

        setTimeout(() => {
            const target = document.querySelector(".item-list") || document.querySelector("div.grid") || document.body;
            if (target) {
                target.style.gap = "2px";
                observer.observe(target, {childList: true, subtree: true});
                if (window.pos_print_settings?.convert_cards_to_text) {
                    convertCardsToTextElements();
                }
            }
        }, 1500);

        // ------------------------------
        // Shortcut F2 for manual print
        // ------------------------------
        document.addEventListener("keydown", function(e) {
            if (e.key === "F2") {
                const settings = window.pos_print_settings;
                if (!settings) return;

                // Check last printed invoice in local cache
                if (settings.last_printed_invoice === frm.doc.name) {
                    frappe.msgprint(`Invoice already printed: ${frm.doc.name}`);
                    return;
                }

                //send2bridge1(frm, settings.rules || []);
                send2bridge2(frm, settings.rules || []);

                // Update local cache only
                settings.last_printed_invoice = frm.doc.name;
            }
        });
    },

    before_submit: function(frm) {
        const settings = window.pos_print_settings;
        if (!settings) return;

        const print_method = settings.print_method || "Automatic Before Submit";

        // Automatic print before submit
        if (print_method === "Automatic Before Submit") {

            send2bridge1(frm, settings.rules || []);

            // Update local cache only
            settings.last_printed_invoice = frm.doc.name;
        }
    }
});

// ------------------------------
// send2bridge function
// ------------------------------
var send2bridge = function(frm, rules) {
    rules.forEach(rule => {
        if (rule.do_print) {
            frappe.call({
                method: 'silent_print.utils.print_format.create_pdf',
                args: {
                    doctype: frm.doc.doctype,
                    name: frm.doc.name,
                    silent_print_format: rule.silent_print_format,
                    no_letterhead: 1,
                    _lang: "ar"
                },
                callback: (r) => {
                    if (r.message && r.message.pdf_base64) {
                        var printService = new silent_print.utils.WebSocketPrinter({
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
        }
    });
};
var send2bridge1 = function(frm, rules) {
    rules.forEach(rule => {
        if (rule.do_print) {
            frappe.call({
                method: 'restaurant.utils.print_format.create_pdf',
                args: {
                    doctype: frm.doc.doctype,
                    name: frm.doc.name,
                    restaurant_print_format: rule.restaurant_print_format,
                    no_letterhead: 1,
                    _lang: "ar"
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
        }
    });
};
var send2bridge2 = function(frm, rules) {
    rules.forEach(rule => {
        if (rule.do_print) {
            //item_group: rule.item_group,
            //if (rule.item_group) {
                //frm.doc.item_group = rule.item_group
            //}
            frappe.call({
                method: 'restaurant.utils.print_format.create_pdf1',
                args: {
                    doctype: frm.doc.doctype,
                    name: frm.doc.name,
                    restaurant_print_format: rule.restaurant_print_format,
                    item_group: rule.item_group,
                    no_letterhead: 1,
                    _lang: "ar"
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
                        console.error(r);
                        console.log(rule);
                        frappe.msgprint("Failed to create the PDF file.");
                    }
                }
            });
        }
    });
};



