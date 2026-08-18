/* WMN POS Offline Service Worker v15
   Fixes:
   - Normalized cache key for getdoctype, so cached_timestamp/_ do not break offline cache matching.
   - Supports both POS Invoice and Sales Invoice doctype metadata.
   - Never returns plain text "Offline".
   - Avoids `exc: "Offline..."` strings because Frappe may try JSON.parse(exc).
*/

const WMN_POS_SW_VERSION = "v15";
const WMN_POS_CACHE = "wmn-pos-runtime-v15";
const WMN_POS_API_CACHE = "wmn-pos-api-v15";

const SHELL_URLS = [
  "/app",
  "/app/point-of-sale",
  "/pos-offline-manifest.webmanifest"
];

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-WMN-POS-SW": WMN_POS_SW_VERSION
    }
  });
}

function emptyResponse(status = 204) {
  return new Response(null, {
    status,
    headers: { "X-WMN-POS-SW": WMN_POS_SW_VERSION }
  });
}

function isSocket(url) {
  return url.pathname.startsWith("/socket.io/");
}

function isAsset(url) {
  return (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/files/") ||
    url.pathname.startsWith("/private/files/")
  );
}

function isAppNavigation(url, request) {
  return request.mode === "navigate" && (
    url.pathname === "/app" ||
    url.pathname === "/app/" ||
    url.pathname === "/app/point-of-sale"
  );
}

async function bodyText(request) {
  try {
    return await request.clone().text();
  } catch (e) {
    return "";
  }
}

function getBodyParam(body, key) {
  try {
    const params = new URLSearchParams(body || "");
    return params.get(key) || "";
  } catch (e) {
    return "";
  }
}

function normalizedSearchFor(url, body) {
  const p = url.pathname;

  if (p === "/api/method/frappe.desk.form.load.getdoctype") {
    const doctype = url.searchParams.get("doctype") || getBodyParam(body, "doctype") || "";
    const withParent = url.searchParams.get("with_parent") || getBodyParam(body, "with_parent") || "1";
    return "doctype=" + encodeURIComponent(doctype) + "&with_parent=" + encodeURIComponent(withParent);
  }

  if (p === "/api/method/frappe.desk.desk_page.getpage") {
    const name = url.searchParams.get("name") || getBodyParam(body, "name") || "point-of-sale";
    return "name=" + encodeURIComponent(name);
  }

  if (p === "/api/method/frappe.client.get") {
    const doctype = url.searchParams.get("doctype") || getBodyParam(body, "doctype") || "";
    const name = url.searchParams.get("name") || getBodyParam(body, "name") || "";
    return "doctype=" + encodeURIComponent(doctype) + "&name=" + encodeURIComponent(name);
  }

  if (p === "/api/method/frappe.client.get_value") {
    const doctype = url.searchParams.get("doctype") || getBodyParam(body, "doctype") || "";
    const filters = url.searchParams.get("filters") || getBodyParam(body, "filters") || "";
    const fieldname = url.searchParams.get("fieldname") || getBodyParam(body, "fieldname") || "";
    return "doctype=" + encodeURIComponent(doctype) + "&filters=" + encodeURIComponent(filters) + "&fieldname=" + encodeURIComponent(fieldname);
  }

  /*
    For POS APIs, keep args because profile/search can change.
    Remove only cache buster `_` from URL.
  */
  const params = new URLSearchParams(url.search || "");
  params.delete("_");
  return params.toString();
}

async function apiKey(request) {
  const url = new URL(request.url);
  const body = request.method === "GET" ? "" : await bodyText(request);
  const normalized = normalizedSearchFor(url, body);

  /*
    For selected GET APIs the URL normalization is enough.
    For POST APIs keep body unless normalizedSearchFor already extracted stable args.
  */
  let bodyPart = "";
  if (request.method !== "GET") {
    const p = url.pathname;
    if (
      p === "/api/method/frappe.desk.form.load.getdoctype" ||
      p === "/api/method/frappe.desk.desk_page.getpage" ||
      p === "/api/method/frappe.client.get" ||
      p === "/api/method/frappe.client.get_value"
    ) {
      bodyPart = "";
    } else {
      bodyPart = body || "";
    }
  }

  return new Request(
    self.location.origin +
      "/__wmn_api_cache__" +
      url.pathname +
      "?method=" + encodeURIComponent(request.method) +
      "&search=" + encodeURIComponent(normalized || "") +
      "&body=" + encodeURIComponent(bodyPart),
    { method: "GET" }
  );
}

function fallbackApi(url, request) {
  const p = url.pathname;

  if (p === "/api/method/frappe.desk.form.load.getdoctype") {
    /*
      This endpoint cannot be faked safely. Returning 200/null avoids Frappe parsing
      a string `exc`, but POS still needs this cached from online for full offline.
    */
    return jsonResponse({
      message: null,
      _wmn_offline_error: "Doctype metadata is not cached. Open POS online once while this Service Worker is active."
    }, 200);
  }

  if (p === "/api/method/frappe.desk.desk_page.getpage") {
    return jsonResponse({
      message: null,
      _wmn_offline_error: "Desk page metadata is not cached. Open POS online once while this Service Worker is active."
    }, 200);
  }

  if (p === "/api/method/frappe.desk.doctype.notification_log.notification_log.get_notification_logs") {
    return jsonResponse({
      message: {
        notification_logs: [],
        notifications: [],
        unread_count: 0,
        unseen_count: 0,
        open_count_doctype: {},
        open_count_module: {}
      }
    });
  }

  if (p === "/api/method/frappe.desk.doctype.event.event.get_events") {
    return jsonResponse({ message: [] });
  }

  if (p === "/api/method/erpnext.accounts.utils.get_fiscal_year") {
    return jsonResponse({ message: [] });
  }

  if (p === "/api/method/frappe.client.get_value") {
    return jsonResponse({ message: {} });
  }

  if (p === "/api/method/frappe.client.get") {
    const doctype = url.searchParams.get("doctype") || "";
    if (doctype === "POS Settings") {
      return jsonResponse({
        message: {
          doctype: "POS Settings",
          name: "POS Settings",
          use_pos_in_offline_mode: 1
        }
      });
    }
    return jsonResponse({ message: {} });
  }

  if (p === "/api/method/frappe.client.validate_link") {
    return jsonResponse({
      message: {
        valid: true,
        value: null
      }
    });
  }

  if (p === "/api/method/frappe.desk.search.search_link") {
    return jsonResponse({ results: [], message: [] });
  }

  if (p === "/api/method/erpnext.controllers.taxes_and_totals.get_rounding_tax_settings") {
    return jsonResponse({
      message: {
        round_off_account: null,
        round_off_cost_center: null
      }
    });
  }

  if (p === "/api/method/erpnext.stock.doctype.stock_settings.stock_settings.get_enable_stock_uom_editing") {
    return jsonResponse({ message: 0 });
  }

  if (p === "/api/method/erpnext.selling.page.point_of_sale.point_of_sale.check_opening_entry") {
    return jsonResponse({
      message: {
        offline: true,
        pos_opening_entry: null,
        name: null
      }
    });
  }

  if (p === "/api/method/erpnext.selling.page.point_of_sale.point_of_sale.get_pos_profile_data") {
    return jsonResponse({ message: { offline: true } });
  }

  if (p === "/api/method/erpnext.selling.page.point_of_sale.point_of_sale.get_items") {
    return jsonResponse({ message: { items: [] } });
  }

  if (p === "/api/method/wmn.api.get_pos_offline_data") {
    return jsonResponse({
      message: {
        offline: true,
        items: [],
        customers: [],
        item_prices: [],
        stock: [],
        payment_methods: []
      }
    });
  }

  if (p === "/api/method/run_doc_method") {
    return jsonResponse({
      message: {
        offline: true
      }
    }, 200);
  }

  if (request.method === "GET") {
    return jsonResponse({ message: {} });
  }

  return jsonResponse({
    message: "Offline request blocked by POS service worker",
    _wmn_offline: true
  }, 503);
}

async function networkFirstApi(event) {
  const request = event.request;
  const url = new URL(request.url);

  try {
    const response = await fetch(request.clone());

    if (response && response.ok) {
      const cache = await caches.open(WMN_POS_API_CACHE);
      await cache.put(await apiKey(request), response.clone());
    }

    return response;
  } catch (e) {
    const cache = await caches.open(WMN_POS_API_CACHE);
    const cached = await cache.match(await apiKey(request));
    if (cached) return cached;

    return fallbackApi(url, request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(WMN_POS_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("wmn-pos-") && ![WMN_POS_CACHE, WMN_POS_API_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "WMN_POS_CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(WMN_POS_CACHE).then(async (cache) => {
        for (const rawUrl of data.urls) {
          try {
            const url = new URL(rawUrl, self.location.origin);
            if (!sameOrigin(url)) continue;
            const req = new Request(url.href, { credentials: "same-origin" });
            const res = await fetch(req);
            if (res && res.ok) await cache.put(req, res.clone());
          } catch (e) {}
        }
      })
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (!sameOrigin(url)) return;

  if (isSocket(url)) {
    event.respondWith(jsonResponse({ message: null, offline: true }, 200));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstApi(event));
    return;
  }

  if (request.method === "GET") {
    if (isAppNavigation(url, request)) {
      event.respondWith(
        fetch(request)
          .then(async (response) => {
            if (response && response.ok) {
              const cache = await caches.open(WMN_POS_CACHE);
              await cache.put(request, response.clone());
            }
            return response;
          })
          .catch(async () => {
            const cache = await caches.open(WMN_POS_CACHE);
            return (
              await cache.match(request) ||
              await cache.match("/app/point-of-sale") ||
              await cache.match("/app") ||
              new Response("<!doctype html><html><body><h3>POS offline shell is not cached yet. Open POS online once first.</h3></body></html>", {
                status: 200,
                headers: { "Content-Type": "text/html; charset=utf-8", "X-WMN-POS-SW": WMN_POS_SW_VERSION }
              })
            );
          })
      );
      return;
    }

    if (isAsset(url) || url.pathname === "/pos-offline-manifest.webmanifest") {
      event.respondWith(
        caches.match(request).then((cached) => {
          return cached || fetch(request)
            .then(async (response) => {
              if (response && response.ok) {
                const cache = await caches.open(WMN_POS_CACHE);
                await cache.put(request, response.clone());
              }
              return response;
            })
            .catch(() => {
              if (url.pathname.endsWith(".js")) {
                return new Response("", { status: 200, headers: { "Content-Type": "application/javascript; charset=utf-8", "X-WMN-POS-SW": WMN_POS_SW_VERSION } });
              }
              if (url.pathname.endsWith(".css")) {
                return new Response("", { status: 200, headers: { "Content-Type": "text/css; charset=utf-8", "X-WMN-POS-SW": WMN_POS_SW_VERSION } });
              }
              return emptyResponse(204);
            });
        })
      );
      return;
    }

    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            const cache = await caches.open(WMN_POS_CACHE);
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || emptyResponse(204))
    );
    return;
  }

  event.respondWith(fetch(request).catch(() => emptyResponse(204)));
});