/* Capture ERPNext POS classes once, before any WMN override is installed. */
(function () {
    "use strict";
    const ns = window.WMN_POS;
    const pos = erpnext.PointOfSale;
    ["Controller", "ItemSelector", "ItemCart", "ItemDetails", "Payment", "PastOrderList", "PastOrderSummary"].forEach((name) => {
        if (typeof pos[name] !== "function") throw new Error(`ERPNext POS ${name} class is not available`);
        ns.Base[name] = pos[name];
    });
})();
