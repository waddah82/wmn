/* WMN POS Offline Service Worker - split runtime aware */
const WMN_SW_VERSION = "wmn-pos-offline-sw-split-v3";
const WMN_STATIC_CACHE = WMN_SW_VERSION + "-static";
const WMN_RUNTIME_CACHE = WMN_SW_VERSION + "-runtime";

const WMN_CORE_ASSETS = [
    "/assets/wmn/pos-offline-manifest.webmanifest",
    "/assets/wmn/icons/icon-192.png",
    "/assets/wmn/icons/icon-512.png",
    "/assets/wmn/icons/apple-touch-icon.png",
    "/assets/wmn/js/pos_offline/wmn_pos_loader.js",
    "/assets/wmn/js/pos_offline/common.js",
    "/assets/wmn/js/pos_offline/offline_storage_wmnPOSOffline.js",
    "/assets/wmn/js/pos_offline/WMN_Controller.js",
    "/assets/wmn/js/pos_offline/WMNPastOrderSummary.js",
    "/assets/wmn/js/pos_offline/WMNPastOrderList.js",
    "/assets/wmn/js/pos_offline/WMNItemSelector.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(WMN_STATIC_CACHE)
            .then((cache) => cache.addAll(WMN_CORE_ASSETS).catch(() => true))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key.startsWith("wmn-pos-offline-sw-") && !key.startsWith(WMN_SW_VERSION))
                .map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "WMN_CACHE_URLS" && Array.isArray(data.urls)) {
        event.waitUntil(
            caches.open(WMN_STATIC_CACHE).then((cache) =>
                Promise.all(data.urls.map((url) =>
                    fetch(url, { credentials: "same-origin", cache: "reload" })
                        .then((res) => {
                            if (res && res.ok) return cache.put(url, res.clone());
                            return null;
                        })
                        .catch(() => null)
                ))
            )
        );
    }
});

function shouldCache(request) {
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return false;
    return (
        url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/app/point-of-sale") ||
        url.pathname === "/pos-offline-sw.js" ||
        url.pathname === "/pos-offline-manifest.webmanifest"
    );
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    const res = await fetch(request);
    if (res && res.ok && shouldCache(request)) {
        const cache = await caches.open(WMN_RUNTIME_CACHE);
        cache.put(request, res.clone()).catch(() => null);
    }
    return res;
}

async function networkFirst(request) {
    try {
        const res = await fetch(request);
        if (res && res.ok && shouldCache(request)) {
            const cache = await caches.open(WMN_RUNTIME_CACHE);
            cache.put(request, res.clone()).catch(() => null);
        }
        return res;
    } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw e;
    }
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET") return;

    if (url.pathname.startsWith("/assets/wmn/js/pos_offline/") || url.pathname.startsWith("/assets/wmn/icons/")) {
        event.respondWith(cacheFirst(request));
        return;
    }

    if (url.pathname.startsWith("/assets/") && /point-of-sale.*\.bundle\.js|point_of_sale.*\.js|socketio_client.*\.js/.test(url.pathname)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (request.mode === "navigate" || url.pathname.startsWith("/app/point-of-sale")) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (shouldCache(request)) {
        event.respondWith(networkFirst(request));
    }
});
