/**
 * ============================================================
 * ULDP 2026 — Public Standings API (Google Apps Script Web App)
 * ============================================================
 * Reads ONLY the aggregated public tabs of the points Sheet and
 * returns JSON for the portal leaderboard. Raw Submissions and
 * the activity Catalog are NEVER exposed.
 *
 * SHEET LAYOUT EXPECTED
 * ---------------------
 * Tab "House_Standings" (one row per house):
 *   A: HouseSlug   (visionaries | builders | purpose | connectors)
 *   B: TotalPoints (number)
 *   C: Community   (number)
 *   D: Challenges  (number)
 *   E: Spirit      (number)
 *
 * Tab "MVP" (top contributors; the script returns top 3 per house):
 *   A: Name   B: HouseSlug   C: MVPPoints
 *
 * DEPLOYMENT (one time, ~2 minutes)
 * ---------------------------------
 * 1. Open the points Google Sheet → Extensions → Apps Script.
 * 2. Paste this whole file into Code.gs. Save.
 * 3. Deploy → New deployment → type "Web app".
 *      Execute as:  Me
 *      Who has access:  Anyone
 * 4. Copy the /exec URL → paste into assets/js/config.js as API_URL.
 * 5. After editing this script later: Deploy → Manage deployments →
 *    edit → "New version" (the URL stays the same).
 *
 * Notes:
 * - Apps Script web apps do not need explicit CORS headers for
 *   simple GET + ContentService JSON; browsers can fetch directly.
 * - A 60s CacheService layer keeps it fast under load.
 */

var SHEET_STANDINGS = 'House_Standings';
var SHEET_MVP = 'MVP';
var CACHE_SECONDS = 60;

function doGet() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('public-payload');
  if (hit) {
    return ContentService.createTextOutput(hit)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = {
    updated: new Date().toISOString(),
    standings: readStandings_(ss),
    mvp: readMvp_(ss)
  };

  var json = JSON.stringify(payload);
  cache.put('public-payload', json, CACHE_SECONDS);
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function readStandings_(ss) {
  var sh = ss.getSheetByName(SHEET_STANDINGS);
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {           // skip header
    var r = rows[i];
    if (!r[0]) continue;
    out.push({
      house: String(r[0]).toLowerCase().trim(),
      total: Number(r[1]) || 0,
      categories: {
        Community:  Number(r[2]) || 0,
        Challenges: Number(r[3]) || 0,
        Spirit:     Number(r[4]) || 0
      }
    });
  }
  return out;
}

function readMvp_(ss) {
  var sh = ss.getSheetByName(SHEET_MVP);
  if (!sh) return {};
  var rows = sh.getDataRange().getValues();
  var byHouse = {};
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[0]) continue;
    var house = String(r[1]).toLowerCase().trim();
    (byHouse[house] = byHouse[house] || []).push({
      name: String(r[0]),
      points: Number(r[2]) || 0
    });
  }
  // top 3 per house only — nothing else leaves the sheet
  Object.keys(byHouse).forEach(function (h) {
    byHouse[h] = byHouse[h]
      .sort(function (a, b) { return b.points - a.points; })
      .slice(0, 3);
  });
  return byHouse;
}
