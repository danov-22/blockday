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

var SHEET_NAMES = ["Blocks", "Ideas", "DailyNotes", "Routines", "Settings", "PublicSchedules"];
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
  if (action === "public") {
    return jsonOutput_(loadPublicSchedule_(String((e.parameter && e.parameter.token) || "")));
  }
  return jsonOutput_({ ok: false, error: "Unknown action." });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "authenticate") {
      return jsonOutput_(createSession_(String(body.credential || "")));
    }
    var userId = resolveUserId_(body);
    if (body.action === "load") {
      return jsonOutput_(loadData_(userId));
    }
    if (body.action === "save") {
      return jsonOutput_(saveData_(userId, body.data || {}));
    }
    if (body.action === "publish") {
      return jsonOutput_(publishSchedule_(userId, body.data || {}));
    }
    if (body.action === "unpublish") {
      return jsonOutput_(unpublishSchedule_(userId, String(body.token || "")));
    }
    return jsonOutput_({ ok: false, error: "Use action 'load' or 'save'." });
  } catch (error) {
    return jsonOutput_({ ok: false, error: String(error.message || error) });
  }
}

/**
 * When the OAUTH_CLIENT_ID script property is configured, every load/save
 * request must carry a current Google ID token. The stable Google `sub` claim
 * becomes the storage key, so callers cannot select another user's rows.
 * Leave the property empty while using the original single-user deployment.
 */
function resolveUserId_(body) {
  var clientId = PropertiesService.getScriptProperties().getProperty("OAUTH_CLIENT_ID");
  if (!clientId) return String(body.userId || "default");
  if (body.session) return validateSession_(String(body.session));
  var credential = String(body.credential || "");
  if (!credential) throw new Error("Sign in with Google before syncing.");
  return "google-" + String(validateGoogleCredential_(credential).sub);
}

function validateGoogleCredential_(credential) {
  var clientId = PropertiesService.getScriptProperties().getProperty("OAUTH_CLIENT_ID");
  if (!clientId) throw new Error("Google login is not configured for this Sheet.");
  var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential), {
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error("The Google sign-in has expired. Sign in again.");
  var token = JSON.parse(response.getContentText());
  if (String(token.aud) !== String(clientId)) throw new Error("This sign-in was not issued for Blockday.");
  if (!token.sub || Number(token.exp || 0) * 1000 <= Date.now()) throw new Error("The Google sign-in has expired.");
  if (String(token.email_verified) !== "true") throw new Error("Use a verified Google account.");
  return token;
}

function createSession_(credential) {
  var token = validateGoogleCredential_(credential);
  var properties = PropertiesService.getScriptProperties();
  var secret = properties.getProperty("SESSION_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty("SESSION_SECRET", secret);
  }
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    sub: String(token.sub),
    exp: Date.now() + 180 * 24 * 60 * 60 * 1000
  })).replace(/=+$/, "");
  return { ok: true, session: payload + "." + signSession_(payload, secret), userId: "google-" + String(token.sub) };
}

function validateSession_(session) {
  var parts = session.split(".");
  var secret = PropertiesService.getScriptProperties().getProperty("SESSION_SECRET");
  if (parts.length !== 2 || !secret || signSession_(parts[0], secret) !== parts[1]) throw new Error("Your Blockday session is invalid. Sign in again.");
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (!payload.sub || Number(payload.exp || 0) <= Date.now()) throw new Error("Your Blockday session has expired. Sign in again.");
  return "google-" + String(payload.sub);
}

function signSession_(payload, secret) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret)).replace(/=+$/, "");
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

function publishSchedule_(userId, data) {
  var sheet = getOrCreateSheets_().PublicSchedules;
  deleteUserRows_(sheet, userId, "");
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var safeData = { profile: data.profile || {}, blocks: Array.isArray(data.blocks) ? data.blocks : [], dailyNotes: Array.isArray(data.dailyNotes) ? data.dailyNotes : [] };
  var payload = JSON.stringify(safeData);
  if (payload.length > MAX_CELL_LENGTH) throw new Error("This schedule is too large to share. Share fewer notes or blocks.");
  sheet.appendRow([userId, token, payload, new Date().toISOString()]);
  return { ok: true, token: token };
}

function loadPublicSchedule_(token) {
  if (!/^[a-f0-9]{64}$/i.test(token)) return { ok: false, error: "This shared link is invalid." };
  var values = getOrCreateSheets_().PublicSchedules.getDataRange().getValues();
  for (var index = 1; index < values.length; index++) {
    if (String(values[index][1]) === token) {
      try { return { ok: true, data: JSON.parse(String(values[index][2])) }; }
      catch (error) { return { ok: false, error: "This shared schedule could not be read." }; }
    }
  }
  return { ok: false, error: "This shared link was disabled or does not exist." };
}

function unpublishSchedule_(userId, token) {
  deleteUserRows_(getOrCreateSheets_().PublicSchedules, userId, token);
  return { ok: true };
}

function deleteUserRows_(sheet, userId, token) {
  var values = sheet.getDataRange().getValues();
  for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex--) {
    if (String(values[rowIndex][0]) === userId && (!token || String(values[rowIndex][1]) === token)) sheet.deleteRow(rowIndex + 1);
  }
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
