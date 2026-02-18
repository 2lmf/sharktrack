// ============================================================
// geofence.js - Proximity alerts for saved locations
// ============================================================

const GEOFENCE_RADIUS = 200; // meters
const GEOFENCE_COOLDOWN = 5 * 60 * 1000; // 5 minutes between alerts for same location
const alertedLocations = new Map(); // locationKey -> timestamp

let allLocations = [];
let geofenceAlertLocation = null; // currently shown alert location

async function loadLocations() {
    try {
        const result = await window.SheetsAPI.getLocations();
        if (result.success) {
            allLocations = result.locations || [];
        }
    } catch (err) {
        console.warn('Could not load locations for geofencing:', err);
    }
}

function check(currentPos) {
    if (!currentPos || allLocations.length === 0) return;

    for (const loc of allLocations) {
        if (!loc.lat || !loc.lng) continue;

        const dist = window.GPS.haversineDistance(
            currentPos.lat, currentPos.lng,
            loc.lat, loc.lng
        );

        if (dist <= GEOFENCE_RADIUS) {
            const key = `${loc.lat},${loc.lng}`;
            const lastAlerted = alertedLocations.get(key) || 0;

            if (Date.now() - lastAlerted > GEOFENCE_COOLDOWN) {
                alertedLocations.set(key, Date.now());
                showAlert(loc, Math.round(dist));
                break; // show one alert at a time
            }
        }
    }
}

function showAlert(loc, distMeters) {
    geofenceAlertLocation = loc;

    const alert = document.getElementById('geofenceAlert');
    const title = document.getElementById('geofenceTitle');
    const subtitle = document.getElementById('geofenceSubtitle');

    const tagStr = loc.tag ? `${loc.tag} · ` : '';
    const dateStr = loc.datum || '';
    title.textContent = `📍 Blizu lokacije! (${distMeters}m)`;
    subtitle.textContent = `${tagStr}${dateStr}${loc.biljeska ? ' · ' + loc.biljeska : ''}`;

    alert.classList.add('show');

    // Vibrate if supported
    if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

function hideAlert() {
    document.getElementById('geofenceAlert').classList.remove('show');
    geofenceAlertLocation = null;
}

function initGeofence() {
    document.getElementById('geofenceClose').addEventListener('click', hideAlert);

    document.getElementById('geofenceNav').addEventListener('click', () => {
        if (geofenceAlertLocation) {
            const url = geofenceAlertLocation.mapsLink ||
                `https://www.google.com/maps?q=${geofenceAlertLocation.lat},${geofenceAlertLocation.lng}`;
            window.open(url, '_blank');
        }
        hideAlert();
    });

    document.getElementById('geofenceUpdate').addEventListener('click', () => {
        hideAlert();
        window.UI && window.UI.showStatusModal(geofenceAlertLocation);
    });

    // Load locations for geofencing on startup, then refresh every 5 min
    loadLocations();
    setInterval(loadLocations, 5 * 60 * 1000);
}

window.Geofence = {
    init: initGeofence,
    check,
    loadLocations,
    get locations() { return allLocations; },
    addLocation(loc) { allLocations.push(loc); }
};
