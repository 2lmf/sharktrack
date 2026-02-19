// ============================================================
// app.js - Main application controller
// ============================================================

let selectedTag = null;

async function init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').catch(console.warn);
    }

    // Init offline DB
    await window.OfflineDB.init();

    // Init UI components
    window.UI.initTabs();
    window.UI.initFilters();
    window.UI.initModals(); // Changed from initStatusModal
    window.UI.updateOnlineStatus();
    window.UI.updateSummary();

    // Init modules
    window.PhotoCapture.init();
    window.RouteTracker.init();
    window.Geofence.init();
    window.Planner.init();

    // Start GPS watching
    window.GPS.startWatching();

    // Online/offline listeners
    window.addEventListener('online', async () => {
        window.UI.updateOnlineStatus();
        const synced = await window.OfflineDB.syncPendingLocations();
        if (synced > 0) {
            window.UI.showToast(`✅ ${synced} lokacija sinkronizirano`);
            window.UI.updateSummary();
        }
    });
    window.addEventListener('offline', () => window.UI.updateOnlineStatus());

    // Check if Apps Script is configured
    if (!window.SheetsAPI.isConfigured()) {
        window.UI.showToast('⚠️ Postavi Apps Script URL u sheets.js', 5000);
    }

    // Init save button
    document.getElementById('btnSave').addEventListener('click', handleSave);

    // Init quick tags
    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                selectedTag = null;
            } else {
                document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedTag = btn.dataset.tag;
            }
        });
    });

    // Init voice input
    initVoice();
}

async function handleSave() {
    const btn = document.getElementById('btnSave');
    btn.classList.add('loading');
    btn.querySelector('.btn-save-sub').textContent = 'Dohvaćam GPS...';

    let pos;
    try {
        pos = await window.GPS.getCurrentPosition();
    } catch (err) {
        btn.classList.remove('loading');
        btn.querySelector('.btn-save-sub').textContent = 'Tap za trenutnu GPS poziciju';
        window.UI.showToast('❌ GPS nije dostupan — provjeri dozvole');
        return;
    }

    const note = document.getElementById('noteInput').value.trim();
    const tag = selectedTag || '';

    btn.querySelector('.btn-save-sub').textContent = 'Spremam...';

    // Upload photo if exists
    let photoLink = '';
    if (window.PhotoCapture.hasPhoto()) {
        btn.querySelector('.btn-save-sub').textContent = 'Uploading foto...';
        photoLink = await window.PhotoCapture.uploadCurrentPhoto() || '';
    }

    const locationData = {
        lat: pos.lat,
        lng: pos.lng,
        tag,
        note,
        photoLink
    };

    const mapsLink = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const now = new Date();
    const datum = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    const sat = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (navigator.onLine && window.SheetsAPI.isConfigured()) {
        try {
            const result = await window.SheetsAPI.saveLocation(locationData);
            if (result.success) {
                window.UI.showToast('✅ Lokacija spremljena u Sheets!');
                window.UI.setSaveFeedback(`✅ Spremljeno ${sat} — ${tag || 'bez taga'}`);

                // Add to session locations with rowIndex for editing
                window.UI.addToSessionLocations({
                    ...locationData,
                    datum,
                    sat,
                    mapsLink,
                    status: 'Nova',
                    rowIndex: result.row // Capture row index
                });

                window.Geofence.addLocation({ ...locationData, datum, sat, mapsLink });
            } else {
                throw new Error(result.error);
            }
        } catch (err) {
            await saveOffline(locationData, datum, sat, mapsLink);
        }
    } else {
        await saveOffline(locationData, datum, sat, mapsLink);
    }

    // Reset UI
    btn.classList.remove('loading');
    btn.querySelector('.btn-save-sub').textContent = 'Tap za trenutnu GPS poziciju';
    document.getElementById('noteInput').value = '';
    document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
    selectedTag = null;
    window.PhotoCapture.clearPhoto();
    window.UI.updateSummary();
}

async function saveOffline(locationData, datum, sat, mapsLink) {
    await window.OfflineDB.queueLocation(locationData);
    window.UI.showToast('📵 Offline — lokacija u redu za sync');
    window.UI.setSaveFeedback(`⏳ Čeka sync — ${sat}`, 'var(--orange)');
    window.UI.addToSessionLocations({
        ...locationData, datum, sat, mapsLink, status: 'Nova', pending: true
    });

    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        const reg = await navigator.serviceWorker.ready;
        reg.sync.register('sync-locations').catch(console.warn);
    }
}

// ---- VOICE INPUT ----
function initVoice() {
    const btn = document.getElementById('btnVoice');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        btn.style.display = 'none';
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'hr-HR';
    recognition.continuous = false;
    recognition.interimResults = false;

    let isRecording = false;

    btn.addEventListener('click', () => {
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
            btn.classList.add('recording');
            isRecording = true;
        }
    });

    recognition.onresult = e => {
        const transcript = e.results[0][0].transcript;
        document.getElementById('noteInput').value = transcript;
    };

    recognition.onend = () => {
        btn.classList.remove('recording');
        isRecording = false;
    };

    recognition.onerror = () => {
        btn.classList.remove('recording');
        isRecording = false;
        window.UI.showToast('❌ Glasovni unos nije uspio');
    };
}

// ---- START ----
document.addEventListener('DOMContentLoaded', init);
