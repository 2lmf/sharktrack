// ============================================================
// planner.js - Route planning and filtering
// ============================================================

const Planner = {
    init() {
        const btn = document.getElementById('plannerSearchBtn');
        const input = document.getElementById('plannerDest');

        if (btn && input) {
            btn.addEventListener('click', () => {
                const query = input.value.trim();
                if (query) this.planRoute(query);
            });

            // Allow Enter key
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = input.value.trim();
                    if (query) this.planRoute(query);
                }
            });
        }
    },

    async planRoute(destination) {
        const statusEl = document.getElementById('plannerStatus');
        const resultsEl = document.getElementById('plannerResults');

        statusEl.innerHTML = '📍 Tražim tvoju lokaciju...';
        statusEl.style.color = '#ccc';
        resultsEl.innerHTML = '';

        // 1. Get current location
        const myPos = window.GPS ? window.GPS.current : null;
        if (!myPos) {
            statusEl.innerHTML = '⚠️ Nema GPS signala. Pričekaj...';
            statusEl.style.color = 'var(--red)';

            // Try to force get
            try {
                const pos = await window.GPS.getCurrentPosition();
                if (pos) this.executeSearch(pos, destination, statusEl, resultsEl);
            } catch (e) {
                statusEl.innerHTML = '⚠️ Nema GPS signala.';
            }
            return;
        }

        this.executeSearch(myPos, destination, statusEl, resultsEl);
    },

    async executeSearch(myPos, destination, statusEl, resultsEl) {
        try {
            // 2. Geocode destination
            statusEl.innerHTML = `🔍 Tražim koordinate za: ${destination}...`;
            const destCoords = await this.geocodeCity(destination);

            if (!destCoords) {
                statusEl.innerHTML = `❌ Grad "${destination}" nije pronađen. Probaj ponovno.`;
                statusEl.style.color = 'var(--red)';
                return;
            }

            // 3. Get Route from OSRM
            statusEl.innerHTML = '🚗 Računam rutu...';
            const routePoints = await this.getRoutePoints(myPos, destCoords);

            if (!routePoints || routePoints.length === 0) {
                statusEl.innerHTML = '❌ Ne mogu izračunati rutu.';
                return;
            }

            // 4. Filter Saved Locations
            statusEl.innerHTML = '📂 Pretražujem tvoje spremljene lokacije...';
            // 4. Filter Saved Locations
            statusEl.innerHTML = '📂 Pretražujem tvoje spremljene lokacije...';
            // Fix: SheetsAPI with 's' and getLocations without 'All' and handle object response
            const response = await window.SheetsAPI.getLocations();
            const allLocations = response.locations || [];

            // Filter logic: check distance to route
            // Optimization: check distance to start/end bounding box first? 
            // We just do simple check for now.

            const MAX_DIST_KM = 30;
            const nearbyLocations = [];

            // We sample the route to reduce checks if it has too many points
            // OSRM simplified geometry is usually fine (100-500 points)
            const routeSample = routePoints;

            for (const loc of allLocations) {
                if (!loc.lat || !loc.lng) continue;

                // If tag is "Unknown", maybe skip? No, user might want them.

                // Check distance to ANY point on route
                let minD = Infinity;
                for (const pt of routeSample) {
                    const d = this.calculateDistance(loc.lat, loc.lng, pt.lat, pt.lng);
                    if (d < minD) minD = d;
                    // Optimization: if we found one point close enough, break early
                    if (minD <= MAX_DIST_KM) break;
                }

                if (minD <= MAX_DIST_KM) {
                    loc._distFromRoute = minD; // store for sorting if needed
                    nearbyLocations.push(loc);
                }
            }

            // Sort by distance from CURRENT location? Or along route?
            // Distance from current location is easiest and most useful (next stop).
            nearbyLocations.sort((a, b) => {
                const dA = this.calculateDistance(myPos.lat, myPos.lng, a.lat, a.lng);
                const dB = this.calculateDistance(myPos.lat, myPos.lng, b.lat, b.lng);
                return dA - dB;
            });

            // 5. Display Results
            this.renderResults(nearbyLocations, destination, resultsEl);
            statusEl.innerHTML = `✅ Pronađeno ${nearbyLocations.length} lokacija na ruti.`;
            statusEl.style.color = 'var(--green)';

            // Visualize on map if requested? Maybe later.

        } catch (err) {
            console.error(err);
            statusEl.innerHTML = '❌ Došlo je do greške: ' + err.message;
            statusEl.style.color = 'var(--red)';
        }
    },

    async geocodeCity(city) {
        // Add country code hr for bias? &countrycodes=hr
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&countrycodes=hr,ba,si,rs&limit=1`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.length > 0) {
            return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null;
    },

    async getRoutePoints(start, end) {
        // OSRM Public API
        const url = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=simplified&geometries=geojson`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.code !== 'Ok') return null;

        const coords = data.routes[0].geometry.coordinates.map(pt => ({
            lat: pt[1],
            lng: pt[0]
        }));

        return coords;
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    renderResults(locations, destName, container) {
        if (locations.length === 0) {
            container.innerHTML = `<div class="planner-card" style="text-align:center; padding:30px;">
                <span style="font-size:2rem;">🤷‍♂️</span><br>
                <p style="color:var(--text2); margin-top:10px;">Nema zabilježenih lokacija unutar 30km od rute prema ${destName}.</p>
            </div>`;
            return;
        }

        // Inline HTML generation similar to ui.js renderList but simplified
        container.innerHTML = locations.map(loc => {
            const tagEmoji = { 'Stambeno': '🏠', 'Industrijsko': '🏭', 'Poslovno': '🏢', 'Nepoznato': '❓' };
            const emoji = tagEmoji[loc.tag] || '📍';
            const mapsUrl = loc.mapsLink || `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;

            // Distance from route is stored in loc._distFromRoute
            const distLabel = loc._distFromRoute ? `<span style="font-size:0.75rem; color:#aaa;">(Odstupanje: ${loc._distFromRoute.toFixed(1)}km)</span>` : '';

            return `
              <div class="location-item">
                <div class="location-item-header">
                  <span class="location-tag">${emoji} ${loc.tag || 'Lokacija'}</span>
                  <span class="location-time">${loc.datum || ''} ${distLabel}</span>
                </div>
                ${loc.biljeska ? `<div class="location-note">${loc.biljeska}</div>` : ''}
                <div class="location-actions">
                  <button class="btn-nav" style="background:var(--green); color:#000; font-weight:700; border-radius:50px; padding: 6px 14px; min-width: 100px;" onclick="window.open('https://www.google.com/maps/dir/?api=1&destination=${loc.lat},${loc.lng}','_blank')">🚗 Navigiraj</button>
                  <button class="btn-maps" onclick="window.open('${mapsUrl}','_blank')">🗺️ Maps</button>
                  <button class="btn-share" onclick="window.shareLocation('${mapsUrl}', '${loc.tag || ''}')">📤 Dijeli</button>
                </div>
              </div>`;
        }).join('');
    }
};

window.Planner = Planner;
