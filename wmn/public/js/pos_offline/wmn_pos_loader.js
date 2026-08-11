frappe.provide("erpnext.PointOfSale");

frappe.pages['point-of-sale'].on_page_load = function(wrapper) {
    frappe.ui.make_app_page({
        parent: wrapper,
        title: __("Point of Sale"),
        single_column: true,
    });

    function wmn_load_pos_offline_script(src) {
        return new Promise(function(resolve, reject) {
            var existing = document.querySelector('script[data-wmn-pos-offline-src="' + src + '"]');
            if (existing && existing.__wmn_loaded) {
                resolve(true);
                return;
            }
            if (existing) {
                existing.addEventListener('load', function(){ resolve(true); }, { once: true });
                existing.addEventListener('error', function(){ reject(new Error('Failed to load ' + src)); }, { once: true });
                return;
            }
            var script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.defer = false;
            script.setAttribute('data-wmn-pos-offline-src', src);
            script.onload = function() {
                script.__wmn_loaded = true;
                resolve(true);
            };
            script.onerror = function() {
                reject(new Error('Failed to load ' + src));
            };
            document.head.appendChild(script);
        });
    }

    function wmn_load_pos_offline_scripts(scripts) {
        return scripts.reduce(function(promise, src) {
            return promise.then(function() {
                return wmn_load_pos_offline_script(src);
            });
        }, Promise.resolve());
    }

    frappe.require("point-of-sale.bundle.js", function() {
        var base = "/assets/wmn/js/pos_offline/";
        // Change this value only when replacing split files. It prevents the browser
        // from running an older cached common.js with a newer loader.
        var v = "20260811_batch_then_uom_no_details_10";
        function asset(name) {
            return base + name + "?v=" + encodeURIComponent(v);
        }

		function app_asset(path) {
			return "/assets/wmn/" + path + "?v=" + encodeURIComponent(v);
		}

        var scripts = [
            asset("offline_storage_wmnPOSOffline.js"),
            asset("common.js"),
            asset("WMNPOSControllerCache.js"),
            asset("WMN_Controller_v15_WITH_IMPROVEMENTS.js"),
            
            //asset("WMN_Controller.js"),
            asset("WMNPastOrderSummary_v15.js"),
            asset("WMNPastOrderList_v15.js"),
            asset("WMNItemSelector_v15.js"),
            asset("WMNItemDetails_v15.js"),
            asset("WMNItemCart_v15.js"),
			app_asset("js/mamsek.js"),
            asset("wmn_pos_boot.js")
        ];

        wmn_load_pos_offline_scripts(scripts)
            .then(function() {
                if (typeof window.wmn_pos_boot !== "function") {
                    throw new Error("wmn_pos_boot is not available");
                }
                return window.wmn_pos_boot(wrapper);
            })
            .catch(function(e) {
                console.error("WMN POS split runtime failed", e);
                frappe.msgprint({
                    title: "WMN POS Offline",
                    indicator: "red",
                    message: e.message || String(e)
                });
            });
    });
};
