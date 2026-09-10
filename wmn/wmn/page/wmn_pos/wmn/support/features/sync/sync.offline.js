/* Queue synchronization offline adapter. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Sync=ns.Features.Sync||{};ns.Features.Sync.Offline={saveInvoice(doc,ctrl){return window.wmnPOSOffline?.saveInvoice?.(doc,ctrl);},saveCashMovement(doc){return window.wmnPOSOffline?.saveCashMovement?.(doc);}};})();
