// ============================================================
// route.js - Route tracking (start/stop, GPS point collection)
// ============================================================

let isTracking = false;
let routePoints = [];
let routeStartTime = null;
let routeTimerInterval = null;
let routeSeconds = 0;

function initRoute() {
    const btn = document.getElementById('btnRouteToggle');
    btn.addEventListener('click', toggleRoute);
}

function toggleRoute() {
    if (isTracking) {
        stopRoute();
    } else {
        startRoute();
    }
}

function startRoute() {
    isTracking = true;
    routePoints = [];
    routeStartTime = new Date();
    routeSeconds = 0;

    const btn = document.getElementById('btnRouteToggle');
    btn.classList.add('active');
    document.getElementById('routeToggleIcon').textContent = '⏹';
    document.getElementById('routeToggleLabel').textContent = 'Stop';
    document.getElementById('routeStatus').textContent = 'Snimanje u tijeku...';
    document.getElementById('routeStats').style.display = 'flex';

    routeTimerInterval = setInterval(() => {
        routeSeconds++;
        const m = String(Math.floor(routeSeconds / 60)).padStart(2, '0');
        const s = String(routeSeconds % 60).padStart(2, '0');
        document.getElementById('routeDuration').textContent = `${m}:${s}`;
    }, 1000);

    window.UI && window.UI.showToast('🗺️ Snimanje rute počelo');
}

async function stopRoute() {
    if (!isTracking) return;
    isTracking = false;
    clearInterval(routeTimerInterval);

    const btn = document.getElementById('btnRouteToggle');
    btn.classList.remove('active');
    document.getElementById('routeToggleIcon').textContent = '▶';
    document.getElementById('routeToggleLabel').textContent = 'Start';
    document.getElementById('routeStatus').textContent = `Završeno — ${routePoints.length} točaka`;

    if (routePoints.length > 1) {
        const startTimeStr = routeStartTime
            ? `${String(routeStartTime.getHours()).padStart(2, '0')}:${String(routeStartTime.getMinutes()).padStart(2, '0')}`
            : '';
        const durationStr = document.getElementById('routeDuration').textContent;

        try {
            await window.SheetsAPI.saveRoute({
                startTime: startTimeStr,
                duration: durationStr,
                points: routePoints
            });
            window.UI && window.UI.showToast(`✅ Ruta spremljena (${routePoints.length} točaka)`);
        } catch (err) {
            window.UI && window.UI.showToast('⚠️ Ruta nije mogla biti spremljena');
        }
    } else {
        window.UI && window.UI.showToast('ℹ️ Premalo točaka za rutu');
    }

    routePoints = [];
}

function addPoint(pos) {
    if (!isTracking) return;
    const last = routePoints[routePoints.length - 1];
    // Only add if moved more than 10m from last point
    if (last) {
        const dist = window.GPS.haversineDistance(last.lat, last.lng, pos.lat, pos.lng);
        if (dist < 10) return;
    }
    routePoints.push({ lat: pos.lat, lng: pos.lng });
    document.getElementById('routePoints').textContent = routePoints.length;
}

window.RouteTracker = {
    init: initRoute,
    addPoint,
    get isTracking() { return isTracking; }
};
