/* Printing offline adapter. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Printing=ns.Features.Printing||{};ns.Features.Printing.Offline={print(doc){return typeof wmn_print_offline_receipt==="function"?wmn_print_offline_receipt(doc):null;}};})();
