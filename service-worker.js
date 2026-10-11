"use strict";

const CACHE_NAME = "painel-da-ju-static-v2";
const PREVIOUS_CACHE_NAMES = ["painel-da-ju-v1"];
const APP_SHELL = [
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];
const CACHEABLE_PATHS = new Set(
  APP_SHELL.map(path => new URL(path, self.registration.scope).pathname)
);

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(key=>PREVIOUS_CACHE_NAMES.includes(key)).map(key=>caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=="GET" || url.origin!==self.location.origin ||
     url.search || !CACHEABLE_PATHS.has(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(cache=>cache.match(request).then(cached=>cached||fetch(request)))
  );
});
