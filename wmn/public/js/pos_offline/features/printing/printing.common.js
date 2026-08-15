/* Printing common facade. Rendering engines remain under services/printing. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Printing=ns.Features.Printing||{};ns.Features.Printing.Common={showSettings(){return typeof wmn_show_printer_settings_dialog==="function"?wmn_show_printer_settings_dialog():null;},send(payload,type,url){return wmn_send_to_printer(payload,type,url);}};})();
