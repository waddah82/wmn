/* POS connectivity and effective online/offline state. */


        /* ============================================================================
         * WMN POS connectivity and offline runtime state.
         * Offline behavior is implemented by explicit POS classes and adapters below;
         * Frappe globals are not replaced here.
         * ============================================================================ */

        function wmn_pos_is_page() {
            return !!(
                location.pathname.includes("point-of-sale") ||
                location.hash.includes("point-of-sale")
            );
        }

        function wmn_emit_pos_connectivity_status(is_online, reason) {
            window.__wmn_pos_server_online = is_online === true;
            try {
                window.dispatchEvent(new CustomEvent("wmn:pos-connectivity-status", {
                    detail: {
                        online: is_online === true,
                        reason: reason || ""
                    }
                }));
            } catch (e) {}
        }

        function wmn_notify_offline_queue_changed() {
            try {
                window.dispatchEvent(new CustomEvent("wmn:pos-offline-queue-changed"));
            } catch (e) {}
        }

        window.wmn_notify_offline_queue_changed = wmn_notify_offline_queue_changed;

        function wmn_set_pos_effective_offline(reason) {
            window.__wmn_pos_effective_offline = true;
            wmn_emit_pos_connectivity_status(false, reason || "effective offline");
            console.warn("WMN 15.27 OFFLINE:", reason || "effective offline");
        }

        function wmn_set_pos_effective_online(reason) {
            window.__wmn_pos_effective_offline = false;
            wmn_emit_pos_connectivity_status(true, reason || "health check ok");
        }

        function wmn_is_network_failure_text(value) {
            const text = String(value || "").toLowerCase();
            return (
                text.includes("err_internet_disconnected") ||
                text.includes("err_address_unreachable") ||
                text.includes("err_network_changed") ||
                text.includes("service unavailable") ||
                text.includes("networkerror") ||
                text.includes("failed to fetch") ||
                text.includes("connection") ||
                text.includes("timeout") ||
                text.includes("abort") ||
                text.includes("503") ||
                text.includes("status 0")
            );
        }

        function wmn_mark_offline_from_xhr(xhr, reason) {
            const status = xhr && typeof xhr.status !== "undefined" ? cint(xhr.status) : 0;
            const statusText = xhr && xhr.statusText ? xhr.statusText : "";
            const responseText = xhr && xhr.responseText ? xhr.responseText : "";

            if (
                status === 0 ||
                status === 503 ||
                wmn_is_network_failure_text(reason) ||
                wmn_is_network_failure_text(statusText) ||
                wmn_is_network_failure_text(responseText)
            ) {
                wmn_set_pos_effective_offline(reason || statusText || ("HTTP " + status));
                return true;
            }

            return false;
        }

        async function wmn_bootstrap_detect_effective_offline() {
            if (!wmn_pos_is_page() || !window.wmnPOSOffline) return false;

            if (navigator.onLine === false) {
                wmn_set_pos_effective_offline("navigator.onLine false");
                return true;
            }

            const controller = new AbortController();
            const timer = setTimeout(function () {
                try { controller.abort(); } catch (e) {}
            }, 2500);

            try {
                const response = await fetch("/api/method/wmn.api.pos_health_check?ts=" + Date.now(), {
                    method: "POST",
                    credentials: "same-origin",
                    cache: "no-store",
                    signal: controller.signal,
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                        "Pragma": "no-cache",
                        "X-Frappe-CSRF-Token": (frappe.csrf_token || "")
                    },
                    body: JSON.stringify({ source: "pos_health" })
                });

                clearTimeout(timer);

                const data = await response.json().catch(function () { return null; });
                if (!response.ok || (data && data._wmn_offline === true)) {
                    wmn_set_pos_effective_offline("health check failed HTTP " + response.status);
                    return true;
                }

                wmn_set_pos_effective_online("wmn.api.pos_health_check ok");
                return false;
            } catch (e) {
                clearTimeout(timer);
                wmn_set_pos_effective_offline((e && (e.name || e.message)) || "health check network failure");
                return true;
            }
        }

        window.wmn_check_pos_server_connection = wmn_bootstrap_detect_effective_offline;

        function wmn_pos_cart_has_items() {
            const doc = window.cur_pos && window.cur_pos.frm && window.cur_pos.frm.doc ? window.cur_pos.frm.doc : null;
            const items = doc && Array.isArray(doc.items) ? doc.items : [];
            return items.some(row => row && row.item_code && flt(row.qty || 0) > 0);
        }

        async function wmn_on_pos_online_event() {
            if (wmn_pos_cart_has_items()) {
                window.__wmn_pos_effective_offline = true;
                return;
            }

            const isOffline = await wmn_bootstrap_detect_effective_offline();
            if (!isOffline && !wmn_is_pos_offline()) {
                setTimeout(function () {
                    try { location.reload(); } catch (e) {}
                }, 250);
            }
        }

        window.addEventListener("offline", function () {
            wmn_set_pos_effective_offline("browser offline event");
        });

        window.addEventListener("online", function () {
            wmn_on_pos_online_event();
        });

        if (window.jQuery) {
            jQuery(document).ajaxError(function (_event, xhr, settings, thrownError) {
                if (!wmn_pos_is_page()) return;
                const url = settings && settings.url ? settings.url : "";
                wmn_mark_offline_from_xhr(xhr, thrownError || url);
            });
        }



