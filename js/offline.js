// ============================================================
// offline.js - IndexedDB queue for offline location saving
// ============================================================

const DB_NAME = 'sharktrack-db';
const DB_VERSION = 1;
const STORE_LOCATIONS = 'pending-locations';
const STORE_ROUTES = 'pending-routes';

let db = null;

async function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains(STORE_LOCATIONS)) {
                d.createObjectStore(STORE_LOCATIONS, { keyPath: 'id', autoIncrement: true });
            }
            if (!d.objectStoreNames.contains(STORE_ROUTES)) {
                d.createObjectStore(STORE_ROUTES, { keyPath: 'id', autoIncrement: true });
            }
        };

        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = e => reject(e.target.error);
    });
}

async function queueLocation(locationData) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LOCATIONS, 'readwrite');
        const req = tx.objectStore(STORE_LOCATIONS).add({
            ...locationData,
            queuedAt: Date.now()
        });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getPendingLocations() {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LOCATIONS, 'readonly');
        const req = tx.objectStore(STORE_LOCATIONS).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function removePendingLocation(id) {
    if (!db) await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_LOCATIONS, 'readwrite');
        const req = tx.objectStore(STORE_LOCATIONS).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getPendingCount() {
    const pending = await getPendingLocations();
    return pending.length;
}

async function syncPendingLocations() {
    const pending = await getPendingLocations();
    if (pending.length === 0) return 0;

    let synced = 0;
    for (const item of pending) {
        try {
            const result = await window.SheetsAPI.saveLocation(item);
            if (result.success) {
                await removePendingLocation(item.id);
                synced++;
            }
        } catch (err) {
            console.warn('Sync failed for item', item.id, err);
            break; // stop if offline again
        }
    }

    return synced;
}

// Listen for service worker sync message
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', async e => {
        if (e.data && e.data.type === 'SYNC_NOW') {
            const synced = await syncPendingLocations();
            if (synced > 0) {
                window.UI && window.UI.showToast(`✅ Sync: ${synced} lokacija sinkronizirano`);
                window.UI && window.UI.updateSummary();
            }
        }
    });
}

window.OfflineDB = {
    init: initDB,
    queueLocation,
    getPendingLocations,
    removePendingLocation,
    getPendingCount,
    syncPendingLocations
};
