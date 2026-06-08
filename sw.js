// Service worker simples: cache do "casco" do app para abrir offline.
const CACHE = "coach-v2";
const ASSETS = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  // nunca cacheia chamadas a APIs (supabase/anthropic)
  if (u.hostname.includes("supabase.co") || u.hostname.includes("anthropic.com")) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
