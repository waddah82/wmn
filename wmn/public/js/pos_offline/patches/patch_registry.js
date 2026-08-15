/*
 * Single registry for temporary/debug patches.
 * Production rule: EnabledPatches must stay empty unless a patch is deliberately being tested.
 */
(function () {
    "use strict";
    const ns = window.WMN_POS;

    class DisabledPatches {
        static list() {
            return [
                { target_class: "frappe", method: "call", purpose: "Old global offline network interception", migrated_to: "services/connectivity + explicit online/offline adapters" },
                { target_class: "frappe.model", method: "set_value", purpose: "Old offline document interception", migrated_to: "services/offline/document_adapter.js" },
                { target_class: "ItemCart", method: "fetch_customer_transactions", purpose: "Old prototype replacement", migrated_to: "overrides/item_cart" },
                { target_class: "Payment", method: "submit_invoice/checkout", purpose: "Old event replacement after Payment creation", migrated_to: "overrides/payment + Controller submit methods" },
                { target_class: "Controller", method: "coupon/pricing/promotion submit revalidation", purpose: "Old stacked discount patches", migrated_to: "features/* adapters and Controller lifecycle" },
                { target_class: "ItemSelector", method: "focus guards", purpose: "Old document-level mobile focus interception", migrated_to: "ItemSelector override methods" },
                { target_class: "Mamsek", method: "Controller/ItemSelector/ItemCart subclasses", purpose: "Second override layer", migrated_to: "single override class per ERPNext class" },
            ];
        }
        static applyAll() { return []; }
    }

    class EnabledPatches {
        static list() { return []; }
        static applyAll() {
            const applied = [];
            for (const patch of this.list()) {
                if (!patch || typeof patch.apply !== "function") continue;
                patch.apply();
                applied.push(patch.id || `${patch.target_class || "unknown"}.${patch.method || "unknown"}`);
            }
            return applied;
        }
    }

    ns.Patches.DisabledPatches = DisabledPatches;
    ns.Patches.EnabledPatches = EnabledPatches;
})();
