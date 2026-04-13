/* eslint-disable no-undef */
/**
 * Minimal service worker so Chromium-based browsers can offer “Install app”.
 * Fetch is passed through to the network (no offline cache) to avoid stale admin data.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
