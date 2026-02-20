// ============================================================
// ui.js - UI updates, map, toast, tabs, location list
// ============================================================

let map = null;
let mapMarkers = [];
let mapInitialized = false;
let currentFilter = 'all';
let pendingStatusLocation = null;
let editingLocation = null; // Track which location is being edited
const sessionLocations = []; // locations saved this session

// ---- GPS STATUS ----
function setGPSStatus(state, label) {
    const el = document.getElementById('gpsStatus');
    if (el) {
        el.className = `gps-status ${state}`;
        el.querySelector('.gps-label').textContent = label;
    }
}

// ---- ONLINE STATUS ----
function updateOnlineStatus() {
    const el = document.getElementById('onlineStatus');
    const banner = document.getElementById('offlineBanner');
    if (el && banner) {
        if (navigator.onLine) {
            el.classList.remove('offline');
            banner.classList.remove('show');
        } else {
            el.classList.add('offline');
            banner.classList.add('show');
        }
    }
}

// ---- TOAST ----
let toastTimeout = null;
function showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
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

    const navBtn = document.querySelector(`[data-tab="${tab}"]`);
    const tabContent = document.getElementById(tab); // ID is "tab-home", "tab-list" etc. in HTML? No, IDs are tab-home, etc.

    // HTML uses id="tab-home", id="tab-list". Dataset uses data-tab="tab-home".
    // Wait, my HTML uses data-tab="tab-home".
    // Let's check consistency.
    // HTML: <button class="nav-btn" data-tab="tab-planner">
    // HTML: <section class="tab-content" id="tab-planner">
    // So `tab` variable holds "tab-planner".

    if (navBtn) navBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');

    if (tab === 'tab-map') initMap();
    if (tab === 'tab-list') renderList();
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

        let mapsUrl = loc.mapsLink;
        if (!mapsUrl || mapsUrl === 'undefined' || !mapsUrl.startsWith('http')) {
            mapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
        }

        const marker = L.marker([loc.lat, loc.lng], { icon })
            .addTo(map)
            .bindPopup(`
        <strong>${loc.tag || 'Lokacija'}</strong><br>
        ${loc.datum || ''} ${loc.sat || ''}<br>
        ${loc.biljeska || ''}<br>
        <div style="margin-top:8px; display:flex; gap:6px;">
            <a href="https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}" target="_blank" style="background:#00e676; color:black; padding:4px 8px; border-radius:12px; text-decoration:none; font-weight:bold; font-size:11px;">🚗 Navigiraj</a>
            <a href="${mapsUrl}" target="_blank" style="background:#0099cc; color:white; padding:4px 8px; border-radius:12px; text-decoration:none; font-weight:bold; font-size:11px;">📍 Mape</a>
        </div>
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
    // If list is active, re-render
    if (document.getElementById('tab-list').classList.contains('active')) {
        renderList();
    }
    refreshMapMarkers();
}

function renderList() {
    const container = document.getElementById('locationsList');
    if (!container) return; // Planner results might reuse logic, but this is specific to list tab

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
        const canEdit = loc.rowIndex && !isPending; // Can only edit if we have row index and not pending

        return `
      <div class="location-item ${isPending ? 'location-pending' : ''}">
        <div class="location-item-header">
          <span class="location-tag">${emoji} ${loc.tag || 'Lokacija'}</span>
          <span class="location-time">${loc.datum || ''} ${loc.sat || ''}</span>
        </div>
        ${loc.kontakt ? `<div class="location-note" style="margin-top:4px;">👤 ${loc.kontakt}</div>` : ''}
        ${loc.biljeska ? `<div class="location-note">${loc.biljeska}</div>` : ''}
        <div class="location-coords">${Number(loc.lat).toFixed(5)}, ${Number(loc.lng).toFixed(5)}</div>
        ${loc.fotoLink ? `<img class="location-photo" src="${loc.fotoLink}" alt="Foto" onclick="window.open('${loc.fotoLink}','_blank')" />` : ''}
        <div class="location-actions">
          <button class="btn-nav" style="background:var(--green); color:#000; font-weight:700; border-radius:50px; padding:6px 12px; border:none; cursor:pointer;" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}','_blank')">🚗 Navigiraj</button>
          <button class="btn-maps" style="border-radius:50px;" onclick="window.open('${mapsUrl}','_blank')">🗺️ Maps</button>
          <button class="btn-share" style="border-radius:50px;" onclick="window.shareLocation('${mapsUrl}', '${loc.tag || ''}')">📤 Dijeli</button>
          <span class="location-status" style="border-radius:50px;">${isPending ? '⏳ Čeka sync' : (loc.status || 'Nova')}</span>
          ${canEdit ? `<button class="btn-edit" data-idx="${i}" style="margin-left:auto; background:var(--bg3); border:1px solid var(--border); padding:6px 12px; border-radius:8px; cursor:pointer; color:white;">✏️ Uredi</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Attach edit listeners
    container.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(btn.dataset.idx);
            openEditModal(filtered[idx]);
        });
    });
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
    const elCount = document.getElementById('summaryCount');
    const elPending = document.getElementById('summaryPending');
    if (elCount) elCount.textContent = sessionLocations.length;
    if (elPending) elPending.textContent = await window.OfflineDB.getPendingCount();
}

// ---- MODALS (Status + Edit) ----
function initModals() {
    // Status Modal
    const statusModal = document.getElementById('statusModal');
    if (statusModal) {
        document.getElementById('statusModalClose').addEventListener('click', () => {
            statusModal.classList.remove('show');
        });
        document.querySelectorAll('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                // ... status update logic if implemented ...
                statusModal.classList.remove('show');
                showToast(`✅ Status ažuriran: ${btn.dataset.status}`);
            });
        });
    }

    // Edit Modal
    const editModal = document.getElementById('editModal');
    if (editModal) {
        document.getElementById('editModalClose').addEventListener('click', () => {
            closeEditModal();
        });

        // Save
        document.getElementById('editModalSave').addEventListener('click', handleEditSave);

        // Photo preview
        const photoInput = document.getElementById('editPhotoInput');
        if (photoInput) {
            photoInput.addEventListener('change', async (e) => {
                if (e.target.files && e.target.files[0]) {
                    const base64 = await fileToBase64(e.target.files[0]);
                    const preview = document.getElementById('editPhotoPreview');
                    preview.src = base64;
                    preview.style.display = 'block';
                }
            });
        }
    }
}

function showStatusModal(loc) {
    pendingStatusLocation = loc;
    document.getElementById('statusModal').classList.add('show');
}

function openEditModal(loc) {
    editingLocation = loc;
    const modal = document.getElementById('editModal');

    document.getElementById('editRowIndex').value = loc.rowIndex;
    document.getElementById('editContact').value = loc.kontakt || '';
    document.getElementById('editNote').value = loc.biljeska || '';

    const preview = document.getElementById('editPhotoPreview');
    if (loc.fotoLink) {
        preview.src = loc.fotoLink;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
        preview.src = '';
    }

    // Reset file input
    document.getElementById('editPhotoInput').value = '';

    modal.classList.add('show');
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.classList.remove('show');
    editingLocation = null;
}

async function handleEditSave() {
    if (!editingLocation) return;

    const saveBtn = document.getElementById('editModalSave');
    const origText = saveBtn.textContent;
    saveBtn.textContent = 'Spremam...';
    saveBtn.disabled = true;

    try {
        const rowIndex = document.getElementById('editRowIndex').value;
        const contact = document.getElementById('editContact').value.trim();
        const note = document.getElementById('editNote').value.trim();
        const photoInput = document.getElementById('editPhotoInput');

        let photoLink = editingLocation.fotoLink;

        // Upload new photo if selected
        if (photoInput.files && photoInput.files[0]) {
            saveBtn.textContent = 'Upload slike...';
            const file = photoInput.files[0];
            const base64 = await fileToBase64(file);
            const res = await window.SheetsAPI.uploadPhoto(base64, `update_${Date.now()}.jpg`);
            if (res.success) {
                photoLink = res.photoLink;
            } else {
                throw new Error('Upload slike neuspješan');
            }
        }

        saveBtn.textContent = 'Ažuriram Sheet...';

        // Call API
        const updateData = {
            rowIndex: rowIndex,
            contact: contact,
            note: note,
            photoLink: photoLink,
            // status: editingLocation.status // Keep existing status or add dropdown?
        };

        const result = await window.SheetsAPI.updateLocation(updateData);

        if (result.success) {
            // Update local object
            editingLocation.kontakt = contact;
            editingLocation.biljeska = note;
            editingLocation.fotoLink = photoLink;

            // Re-render
            renderList();
            showToast('✅ Podaci ažurirani!');
            closeEditModal();
        } else {
            throw new Error(result.error || 'Greška kod ažuriranja');
        }

    } catch (err) {
        console.error(err);
        showToast('❌ Greška: ' + err.message);
    } finally {
        saveBtn.textContent = origText;
        saveBtn.disabled = false;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}


// ---- SAVE FEEDBACK ----
function setSaveFeedback(msg, color = 'var(--green)') {
    const el = document.getElementById('saveFeedback');
    if (el) {
        el.textContent = msg;
        el.style.color = color;
        setTimeout(() => { el.textContent = ''; }, 4000);
    }
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
    initModals, // New unified init
    initStatusModal: () => { }, // Deprecated, kept for app.js compat if needed
    initFilters,
    setSaveFeedback,
    openEditModal
};

// Make shareLocation global for inline onclick
window.shareLocation = shareLocation;
