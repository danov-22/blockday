/**
 * Blockday Google Apps Script sync
 *
 * 1. Create a blank Google Sheet.
 * 2. Open Extensions > Apps Script.
 * 3. Replace the default file with this script.
 * 4. Deploy as a Web app:
 *      Execute as: Me
 *      Who has access: Anyone with the link
 * 5. Copy the deployment URL into Blockday > Settings > Google Sheets sync.
 *
 * The script creates these tabs automatically:
 *   Blocks, Ideas, DailyNotes, Routines, Settings
 *
 * Requests are JSON POST bodies:
 *   { action: "load", userId: "..." }
 *   { action: "save", userId: "...", data: { blocks: [], ideas: [], ... } }
 *
 * Blockday keeps a userId in the browser. For a private multi-user deployment,
 * replace the value with an authenticated Google identity from your own OAuth
 * layer before enabling public access.
 */

var SHEET_NAMES = ["Blocks", "Ideas", "DailyNotes", "Routines", "Settings"];
var MAX_CELL_LENGTH = 45000;

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "health";
  if (action === "health") {
    return jsonOutput_({
      ok: true,
      app: "Blockday",
      message: "Blockday sync is ready."
    });
  }
  if (action === "load") {
    return jsonOutput_(loadData_(String((e.parameter && e.parameter.userId) || "default")));
  }
  return jsonOutput_({ ok: false, error: "Unknown action." });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var userId = String(body.userId || "default");
    if (body.action === "load") {
      return jsonOutput_(loadData_(userId));
    }
    if (body.action === "save") {
      return jsonOutput_(saveData_(userId, body.data || {}));
    }
    return jsonOutput_({ ok: false, error: "Use action 'load' or 'save'." });
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error.message || error) });
  }
}

function setupSheets() {
  getOrCreateSheets_();
  return jsonOutput_({ ok: true, message: "Blockday tabs are ready." });
}

function loadData_(userId) {
  var sheets = getOrCreateSheets_();
  var data = {
    ok: true,
    userId: userId,
    blocks: readRows_(sheets.Blocks, userId),
    ideas: readRows_(sheets.Ideas, userId),
    dailyNotes: readRows_(sheets.DailyNotes, userId),
    routines: readRows_(sheets.Routines, userId),
    settings: readRows_(sheets.Settings, userId)
  };
  return data;
}

function saveData_(userId, data) {
  var sheets = getOrCreateSheets_();
  writeRows_(sheets.Blocks, userId, data.blocks || []);
  writeRows_(sheets.Ideas, userId, data.ideas || []);
  writeRows_(sheets.DailyNotes, userId, data.dailyNotes || []);
  writeRows_(sheets.Routines, userId, data.routines || []);
  writeRows_(sheets.Settings, userId, data.settings || []);
  return { ok: true, userId: userId, savedAt: new Date().toISOString() };
}

function getOrCreateSheets_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = {};
  SHEET_NAMES.forEach(function(name) {
    var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["userId", "recordId", "payload", "updatedAt"]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold");
    }
    sheets[name] = sheet;
  });
  return sheets;
}

function readRows_(sheet, userId) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter(function(row) { return String(row[0]) === userId && row[2]; })
    .map(function(row) {
      try {
        return JSON.parse(String(row[2]));
      } catch (error) {
        return { id: String(row[1]), raw: String(row[2]) };
      }
    });
}

function writeRows_(sheet, userId, records) {
  var values = sheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    if (String(values[rowIndex][0]) === userId) rowsToDelete.push(rowIndex + 1);
  }
  rowsToDelete.forEach(function(rowNumber) { sheet.deleteRow(rowNumber); });

  var now = new Date().toISOString();
  var rows = records.map(function(record, index) {
    var payload = JSON.stringify(record);
    if (payload.length > MAX_CELL_LENGTH) {
      throw new Error("A Blockday record is too large for Google Sheets.");
    }
    return [userId, String(record.id || index + 1), payload, now];
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}