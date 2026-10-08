const CACHE_NAME = "finance-shell-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("finance-shell-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) {
        const copy = response.clone();
        await (await caches.open(CACHE_NAME)).put("./index.html", copy);
      }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match("./index.html"))));
    return;
  }

  const shellAsset = APP_SHELL.some((asset) => new URL(asset, self.location.href).pathname === requestUrl.pathname);
  if (!shellAsset) return;
  event.respondWith(caches.match(request).then(async (cached) => {
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      await (await caches.open(CACHE_NAME)).put(request, copy);
    }
    return response;
  }));
});
