// ============================================================
// SharkTrack - Google Apps Script Backend
// Sheet ID: 16ovYyY-CaGvkwKTwq8F58XtNgzTm1cFfE4JaDAKezss
// ============================================================

const SHEET_ID = '16ovYyY-CaGvkwKTwq8F58XtNgzTm1cFfE4JaDAKezss';
const DRIVE_FOLDER_NAME = 'SharkTrack Slike';

// ============================================================
// MAIN ENTRY POINTS
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;
    switch (action) {
      case 'saveLocation': result = saveLocation(data); break;
      case 'saveRoute':    result = saveRoute(data);    break;
      case 'uploadPhoto':  result = uploadPhoto(data);  break;
      case 'updateLocation': result = updateLocation(data); break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;

    let result;
    switch (action) {
      case 'getLocations': result = getLocations(); break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// SAVE LOCATION
// ============================================================

function saveLocation(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Lokacije');

  // Create sheet with headers if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet('Lokacije');
    sheet.appendRow([
      'Datum', 'Sat', 'Lat', 'Lng', 'Maps Link',
      'Tag', 'Bilješka', 'Foto Link', 'Status', 'Kontakt'
    ]);
    sheet.setFrozenRows(1);
    formatHeaderRow(sheet);
  }

  // Ensure Kontakt column exists (for older sheets)
  ensureKontaktColumn(sheet);

  const now = new Date();
  const datum = Utilities.formatDate(now, 'Europe/Zagreb', 'dd.MM.yyyy');
  const sat   = Utilities.formatDate(now, 'Europe/Zagreb', 'HH:mm');
  const lat   = data.lat;
  const lng   = data.lng;
  const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
  const tag   = data.tag || '';
  const biljeska = data.note || '';
  const fotoLink = data.photoLink || '';
  const status = 'Nova';
  const kontakt = data.contact || '';

  sheet.appendRow([datum, sat, lat, lng, mapsLink, tag, biljeska, fotoLink, status, kontakt]);

  // Style the Maps link cell
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 5).setFormula(`=HYPERLINK("${mapsLink}","📍 Otvori")`);

  return { success: true, mapsLink: mapsLink, row: lastRow };
}

// ============================================================
// UPDATE LOCATION
// ============================================================

function updateLocation(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Lokacije');
  
  if (!sheet) return { success: false, error: 'Sheet Lokacije not found' };

  const rowIndex = parseInt(data.rowIndex);
  if (isNaN(rowIndex) || rowIndex < 2) {
    return { success: false, error: 'Invalid rowIndex' };
  }

  // Update specific columns
  // Structure: 1:Datum, 2:Sat, 3:Lat, 4:Lng, 5:Maps, 6:Tag, 7:Bilješka, 8:Foto, 9:Status, 10:Kontakt
  
  if (data.note !== undefined) sheet.getRange(rowIndex, 7).setValue(data.note);
  if (data.photoLink !== undefined && data.photoLink !== '') sheet.getRange(rowIndex, 8).setValue(data.photoLink);
  if (data.status !== undefined) sheet.getRange(rowIndex, 9).setValue(data.status);
  if (data.contact !== undefined) {
      ensureKontaktColumn(sheet);
      sheet.getRange(rowIndex, 10).setValue(data.contact);
  }

  return { success: true };
}

// ============================================================
// SAVE ROUTE
// ============================================================

function saveRoute(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName('Rute');

  if (!sheet) {
    sheet = ss.insertSheet('Rute');
    sheet.appendRow(['Datum', 'Početak', 'Kraj', 'Trajanje', 'Točke GPS', 'Napomena']);
    sheet.setFrozenRows(1);
    formatHeaderRow(sheet);
  }

  const now = new Date();
  const datum    = Utilities.formatDate(now, 'Europe/Zagreb', 'dd.MM.yyyy');
  const pocetak  = data.startTime || '';
  const kraj     = Utilities.formatDate(now, 'Europe/Zagreb', 'HH:mm');
  const trajanje = data.duration || '';
  const tocke    = JSON.stringify(data.points || []);
  const napomena = data.note || '';

  sheet.appendRow([datum, pocetak, kraj, trajanje, tocke, napomena]);

  return { success: true };
}

// ============================================================
// UPLOAD PHOTO
// ============================================================

function uploadPhoto(data) {
  // Get or create SharkTrack folder in Drive
  let folder;
  const folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(DRIVE_FOLDER_NAME);
  }

  // Decode base64 image
  const base64Data = data.imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data),
    'image/jpeg',
    data.filename || `sharktrack_${Date.now()}.jpg`
  );

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileUrl = `https://drive.google.com/file/d/${file.getId()}/view`;

  return { success: true, photoLink: fileUrl, fileId: file.getId() };
}

// ============================================================
// GET ALL LOCATIONS (for geofencing)
// ============================================================

function getLocations() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Lokacije');

  if (!sheet || sheet.getLastRow() <= 1) {
    return { success: true, locations: [] };
  }

  ensureKontaktColumn(sheet);

  // Read up to 10 columns
  const lastCol = sheet.getLastColumn();
  const numCols = lastCol < 10 ? lastCol : 10;
  
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, numCols).getValues();
  
  const locations = data
    .map((row, index) => ({
      rowIndex:  index + 2, // 1-based row index in sheet
      datum:     row[0],
      sat:       row[1],
      lat:       parseFloat(row[2]),
      lng:       parseFloat(row[3]),
      mapsLink:  row[4],
      tag:       row[5],
      biljeska:  row[6],
      fotoLink:  row[7],
      status:    row[8],
      kontakt:   row[9] || '' // 10th column (index 9)
    }))
    .filter(loc => loc.lat && loc.lng); // Filter invalid rows

  return { success: true, locations: locations };
}

// ============================================================
// HELPERS
// ============================================================

function ensureKontaktColumn(sheet) {
  const lastCol = sheet.getLastColumn();
  // Check if "Kontakt" header is missing (assuming it should be col 10 or appended)
  // Simple check: if last col is 9 (Status), add Kontakt
  if (lastCol === 9) {
     const header = sheet.getRange(1, 10);
     if (header.getValue() === '') {
         header.setValue('Kontakt');
         header.setBackground('#1a1a2e');
         header.setFontColor('#ffffff');
         header.setFontWeight('bold');
     }
  }
}

function formatHeaderRow(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
}

// ============================================================
// TEST FUNCTIONS (run manually in Apps Script editor)
// ============================================================

function testSaveLocation() {
  const result = saveLocation({
    action: 'saveLocation',
    lat: 45.8150,
    lng: 15.9819,
    tag: 'Stambeno',
    note: 'Test lokacija - Zagreb centar'
  });
  Logger.log(JSON.stringify(result));
}

function testGetLocations() {
  const result = getLocations();
  Logger.log(JSON.stringify(result));
}

function testSaveRoute() {
  const result = saveRoute({
    action: 'saveRoute',
    startTime: '09:00',
    duration: '45 min',
    points: [
      { lat: 45.815, lng: 15.982 },
      { lat: 45.820, lng: 15.990 },
      { lat: 45.825, lng: 15.985 }
    ],
    note: 'Test ruta'
  });
  Logger.log(JSON.stringify(result));
}
