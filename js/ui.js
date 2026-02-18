// ============================================================
// ui.js - UI updates, map, toast, tabs, location list
// ============================================================

let map = null;
let mapMarkers = [];
let mapInitialized = false;
let currentFilter = 'all';
let pendingStatusLocation = null;
const sessionLocations = []; // locations saved this session

// ---- GPS STATUS ----
function setGPSStatus(state, label) {
    const el = document.getElementById('gpsStatus');
    el.className = `gps-status ${state}`;
    el.querySelector('.gps-label').textContent = label;
}

// ---- ONLINE STATUS ----
function updateOnlineStatus() {
    const el = document.getElementById('onlineStatus');
    const banner = document.getElementById('offlineBanner');
    if (navigator.onLine) {
        el.classList.remove('offline');
        banner.classList.remove('show');
    } else {
        el.classList.add('offline');
        banner.classList.add('show');
    }
}

// ---- TOAST ----
let toastTimeout = null;
function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---- TABS ----
function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'map') initMap();
    if (tab === 'list') renderList();
}

// ---- MAP ----
function initMap() {
    if (mapInitialized) {
        setTimeout(() => map.invalidateSize(), 100);
        return;
    }
    mapInitialized = true;

    map = L.map('map', { zoomControl: true }).setView([45.815, 15.982], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(map);

    // Add existing locations to map
    refreshMapMarkers();
}

function refreshMapMarkers() {
    if (!map) return;
    mapMarkers.forEach(m => m.remove());
    mapMarkers = [];

    const locs = [...(window.Geofence?.locations || []), ...sessionLocations];
    const seen = new Set();

    locs.forEach(loc => {
        const key = `${loc.lat},${loc.lng}`;
        if (seen.has(key)) return;
        seen.add(key);

        const tagEmoji = { 'Stambeno': '🏠', 'Industrijsko': '🏭', 'Poslovno': '🏢', 'Nepoznato': '❓' };
        const emoji = tagEmoji[loc.tag] || '📍';

        const icon = L.divIcon({
            html: `<div style="font-size:24px;line-height:1;">${emoji}</div>`,
            className: '',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });

        const marker = L.marker([loc.lat, loc.lng], { icon })
            .addTo(map)
            .bindPopup(`
        <strong>${loc.tag || 'Lokacija'}</strong><br>
        ${loc.datum || ''} ${loc.sat || ''}<br>
        ${loc.biljeska || ''}<br>
        <a href="${loc.mapsLink}" target="_blank">📍 Otvori u Maps</a>
      `);

        mapMarkers.push(marker);
    });

    if (mapMarkers.length > 0) {
        const group = L.featureGroup(mapMarkers);
        map.fitBounds(group.getBounds().pad(0.2));
    }
}

// ---- LOCATION LIST ----
function addToSessionLocations(loc) {
    sessionLocations.unshift(loc);
    updateSummary();
    if (document.getElementById('tab-list').classList.contains('active')) {
        renderList();
    }
    refreshMapMarkers();
}

function renderList() {
    const container = document.getElementById('locationsList');
    const allLocs = [...sessionLocations, ...(window.Geofence?.locations || [])];

    // Deduplicate
    const seen = new Set();
    const unique = allLocs.filter(l => {
        const k = `${l.lat},${l.lng},${l.datum},${l.sat}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    // Filter
    const now = new Date();
    const todayStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const filtered = unique.filter(l => {
        if (currentFilter === 'today') return l.datum === todayStr;
        if (currentFilter === 'week') {
            // within last 7 days
            if (!l.datum) return true;
            const parts = l.datum.split('.');
            if (parts.length < 3) return true;
            const d = new Date(parts[2], parts[1] - 1, parts[0]);
            return (now - d) < 7 * 24 * 3600 * 1000;
        }
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
      <div class="empty-state">
        <span>📍</span>
        <p>Nema lokacija za odabrani filter</p>
      </div>`;
        return;
    }

    container.innerHTML = filtered.map((loc, i) => {
        const tagEmoji = { 'Stambeno': '🏠', 'Industrijsko': '🏭', 'Poslovno': '🏢', 'Nepoznato': '❓' };
        const emoji = tagEmoji[loc.tag] || '📍';
        const mapsUrl = loc.mapsLink || `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
        const isPending = loc.pending;

        return `
      <div class="location-item ${isPending ? 'location-pending' : ''}" data-idx="${i}">
        <div class="location-item-header">
          <span class="location-tag">${emoji} ${loc.tag || 'Lokacija'}</span>
          <span class="location-time">${loc.datum || ''} ${loc.sat || ''}</span>
        </div>
        ${loc.biljeska ? `<div class="location-note">${loc.biljeska}</div>` : ''}
        <div class="location-coords">${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}</div>
        ${loc.fotoLink ? `<img class="location-photo" src="${loc.fotoLink}" alt="Foto" onclick="window.open('${loc.fotoLink}','_blank')" />` : ''}
        <div class="location-actions">
          <button class="btn-maps" onclick="window.open('${mapsUrl}','_blank')">🗺️ Maps</button>
          <button class="btn-share" onclick="shareLocation('${mapsUrl}', '${loc.tag || ''}')">📤 Dijeli</button>
          <span class="location-status">${isPending ? '⏳ Čeka sync' : (loc.status || 'Nova')}</span>
        </div>
      </div>`;
    }).join('');
}

function shareLocation(mapsUrl, tag) {
    const text = `📍 ${tag ? tag + ' — ' : ''}Gradilište: ${mapsUrl}`;
    if (navigator.share) {
        navigator.share({ title: 'SharkTrack lokacija', text, url: mapsUrl });
    } else {
        navigator.clipboard.writeText(text).then(() => showToast('📋 Link kopiran!'));
    }
}

// ---- FILTER BUTTONS ----
function initFilters() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderList();
        });
    });
}

// ---- SUMMARY ----
async function updateSummary() {
    document.getElementById('summaryCount').textContent = sessionLocations.length;
    const pending = await window.OfflineDB.getPendingCount();
    document.getElementById('summaryPending').textContent = pending;
}

// ---- STATUS MODAL ----
function showStatusModal(loc) {
    pendingStatusLocation = loc;
    document.getElementById('statusModal').classList.add('show');
}

function initStatusModal() {
    document.getElementById('statusModalClose').addEventListener('click', () => {
        document.getElementById('statusModal').classList.remove('show');
    });

    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.dataset.status;
            document.getElementById('statusModal').classList.remove('show');
            showToast(`✅ Status ažuriran: ${status}`);
            // Note: status update to Sheet would require additional API call
            // For now, visual feedback only
        });
    });
}

// ---- SAVE FEEDBACK ----
function setSaveFeedback(msg, color = 'var(--green)') {
    const el = document.getElementById('saveFeedback');
    el.textContent = msg;
    el.style.color = color;
    setTimeout(() => { el.textContent = ''; }, 4000);
}

window.UI = {
    setGPSStatus,
    updateOnlineStatus,
    showToast,
    initTabs,
    switchTab,
    initMap,
    refreshMapMarkers,
    addToSessionLocations,
    renderList,
    updateSummary,
    showStatusModal,
    initStatusModal,
    initFilters,
    setSaveFeedback
};

// Make shareLocation global for inline onclick
window.shareLocation = shareLocation;
