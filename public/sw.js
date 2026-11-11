'use strict';

const CACHE = 'autodesk-static-v3';
const FILES = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const u = new URL(e.request.url);
    
    // Preskačemo ne-GET zahteve, API rute i eksterne izvore
    if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== self.location.origin) {
        return;
    }
    
    e.respondWith(
        fetch(e.request)
            .then(r => {
                if (r.ok) {
                    let clone = r.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return r;
            })
            .catch(() => caches.match(e.request).then(x => x || Response.error()))
    );
});