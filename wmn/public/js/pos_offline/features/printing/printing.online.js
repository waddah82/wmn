/* Printing online adapter. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Printing=ns.Features.Printing||{};ns.Features.Printing.Online={print(doc){return typeof wmn_try_silent_print_online_doc==="function"?wmn_try_silent_print_online_doc(doc):null;}};})();
