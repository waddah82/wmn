/* Queue synchronization common facade. */
(function(){"use strict";const ns=window.WMN_POS;ns.Features.Sync=ns.Features.Sync||{};ns.Features.Sync.Common={notify(){return typeof wmn_notify_offline_queue_changed==="function"?wmn_notify_offline_queue_changed():null;}};})();
