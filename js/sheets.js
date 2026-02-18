// ============================================================
// sheets.js - Google Apps Script API communication
// IMPORTANT: Replace SCRIPT_URL with your deployed Web App URL
// ============================================================

// TODO: Replace with your Apps Script Web App URL after deployment
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6dvN4PjLkDQTUeKOS_54ytqRDqFejLxXpHItaL9ouBMMJ7LpzYh-f9GE3YiSIIVOKKA/exec';

async function apiPost(data) {
    const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' }, // Apps Script requires text/plain for CORS
        body: JSON.stringify(data),
        redirect: 'follow'
    });
    return response.json();
}

async function apiGet(params) {
    const url = new URL(SCRIPT_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const response = await fetch(url.toString(), { redirect: 'follow' });
    return response.json();
}

async function saveLocation(data) {
    return apiPost({ action: 'saveLocation', ...data });
}

async function saveRoute(data) {
    return apiPost({ action: 'saveRoute', ...data });
}

async function uploadPhoto(imageBase64, filename) {
    return apiPost({ action: 'uploadPhoto', imageBase64, filename });
}

async function getLocations() {
    return apiGet({ action: 'getLocations' });
}

window.SheetsAPI = {
    saveLocation,
    saveRoute,
    uploadPhoto,
    getLocations,
    isConfigured: () => SCRIPT_URL !== 'YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'
};
