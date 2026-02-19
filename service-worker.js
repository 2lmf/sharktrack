// SharkTrack Service Worker - Offline Support
// v5 - Header logo increase, Edit Modal polish (white text, label styles)
const CACHE_NAME = 'sharktrack-v5';
const BASE = '/sharktrack';
const ASSETS = [
    `${BASE}/`,
    `${BASE}/index.html`,
    `${BASE}/manifest.json`,
    `${BASE}/css/style.css`,
    `${BASE}/js/app.js`,
    `${BASE}/js/gps.js`,
    `${BASE}/js/sheets.js`,
    `${BASE}/js/planner.js`,
    `${BASE}/js/offline.js`,
    `${BASE}/js/route.js`,
    `${BASE}/js/geofence.js`,
    `${BASE}/js/photo.js`,
    `${BASE}/js/ui.js`,
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
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_NOW' }));
}
