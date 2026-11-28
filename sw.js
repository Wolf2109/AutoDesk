'use strict';
const CACHE = 'autodesk-ui-20261128-v61-entity-cards';
const FILES = ['./', './index.html', './src/css/style.css', './src/css/light-theme.css', './src/js/theme.js', './src/css/site-theme.css', './src/css/motion.css?v=31', './config/firebase-config.js', './src/js/app.js', './src/js/update-config.js', './src/js/updates.js', './src/js/catalog-updates.js', './src/js/dtc.js', './src/js/vehicle-search.js', './src/js/ecu-search.js', './src/js/vehicle-search-config.js', './src/js/native-bridge.js', './src/js/print-docs.js', './src/js/local-api.js', './src/js/cloud-sync.js', './src/js/private-cache.js', './src/js/private-vehicles.js', './src/js/fuel.js', './src/js/tools.js', './manifest.json', './assets/icons/favicon.ico', './assets/images/logo.png', './assets/images/logo-mark.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png'];
const SDK = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'autodesk-public-catalogs-v1').map(k => caches.delete(k)))).then(() => self.clients.claim())));

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

  // Catalog requests are cache-first in catalog-updates.js; do not revalidate here.
  if (/\/data\/(vehicles-database|ecu_database|dtc-database)\.json$/.test(u.pathname)) {
    if (req.cache === 'no-store' || req.cache === 'no-cache') { e.respondWith(fetch(req)); return; }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }

  // Fajlovi aplikacije (i config/firebase-config.js, da se prijava i pokretanje rade bez interneta): prvo mreža, a keš kada nema interneta.
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req).then(r => r || Response.error())));
});
