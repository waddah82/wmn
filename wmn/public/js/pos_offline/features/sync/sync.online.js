/* Queue synchronization online adapter. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Sync=ns.Features.Sync||{};ns.Features.Sync.Online={invoices(){return window.wmnPOSOffline?.syncInvoices?.();},cashMovements(){return window.wmnPOSOffline?.syncCashMovements?.();}};})();
