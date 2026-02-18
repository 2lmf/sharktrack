// SharkTrack Service Worker - Offline Support
const CACHE_NAME = 'sharktrack-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/style.css',
    '/js/app.js',
    '/js/gps.js',
    '/js/sheets.js',
    '/js/offline.js',
    '/js/route.js',
    '/js/geofence.js',
    '/js/photo.js',
    '/js/ui.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    // Network first for API calls, cache first for assets
    if (e.request.url.includes('script.google.com')) {
        e.respondWith(fetch(e.request).catch(() => new Response(
            JSON.stringify({ success: false, error: 'Offline' }),
            { headers: { 'Content-Type': 'application/json' } }
        )));
        return;
    }

    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});

// Listen for sync events (background sync when online)
self.addEventListener('sync', e => {
    if (e.tag === 'sync-locations') {
        e.waitUntil(syncOfflineData());
    }
});

async function syncOfflineData() {
    // Notify all clients to sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_NOW' }));
}
