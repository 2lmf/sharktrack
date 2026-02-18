// ============================================================
// gps.js - GPS / Geolocation management
// ============================================================

let currentPosition = null;
let watchId = null;

const GPS_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000
};

function startWatching() {
    if (!('geolocation' in navigator)) {
        window.UI && window.UI.setGPSStatus('error', 'GPS nije dostupan');
        return;
    }

    window.UI && window.UI.setGPSStatus('loading', 'GPS...');

    watchId = navigator.geolocation.watchPosition(
        pos => {
            currentPosition = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: pos.timestamp
            };
            window.UI && window.UI.setGPSStatus('active', `±${Math.round(pos.coords.accuracy)}m`);
            window.RouteTracker && window.RouteTracker.addPoint(currentPosition);
            window.Geofence && window.Geofence.check(currentPosition);
        },
        err => {
            console.error('GPS error:', err);
            let msg = 'GPS greška';
            if (err.code === 1) msg = 'GPS odbijen';
            if (err.code === 2) msg = 'GPS nedostupan';
            if (err.code === 3) msg = 'GPS timeout';
            window.UI && window.UI.setGPSStatus('error', msg);
        },
        GPS_OPTIONS
    );
}

function stopWatching() {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

async function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (currentPosition && (Date.now() - currentPosition.timestamp) < 10000) {
            resolve(currentPosition);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                timestamp: pos.timestamp
            }),
            reject,
            GPS_OPTIONS
        );
    });
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

window.GPS = {
    startWatching,
    stopWatching,
    getCurrentPosition,
    haversineDistance,
    get current() { return currentPosition; }
};
