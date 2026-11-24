'use strict';
const CACHE = 'autodesk-ui-20261124-v21-dtc-pdf';
const FILES = ['./', './index.html', './style.css', './site-theme.css', './firebase-config.js', './app.js', './dtc.js', './dtc-database.json', './native-bridge.js', './print-docs.js', './local-api.js', './cloud-sync.js', './private-cache.js', './private-vehicles.js', './fuel.js', './tools.js', './manifest.json', './favicon.ico', './slike/logo.png', './slike/logo-mark.png', './icons/icon-192.png', './icons/icon-512.png'];
const SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET') return;

  // Firebase SDK: prvo keš, da se aplikacija pokrene i bez interneta (podaci tada ostaju samo za pregled).
  if (req.url.startsWith(SDK)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }

  if (u.origin !== self.location.origin) return;

  // Fajlovi aplikacije (i firebase-config.js, da se prijava i pokretanje rade bez interneta): prvo mreža, a keš kada nema interneta.
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(r => r || Response.error())));
});
