/* Offline adapter contract for WMN POS DocType management. */
(function () {
    "use strict";

    const ns = window.WMN_POS;
    ns.Features.DoctypeManager = ns.Features.DoctypeManager || {};

    async function getAvailableDoctypes() {
        return [];
    }

    async function listDocuments() {
        throw new Error(__("POS DocType management is online-only in the current phase."));
    }

    ns.Features.DoctypeManager.Offline = {
        getAvailableDoctypes,
        listDocuments,
    };
})();
