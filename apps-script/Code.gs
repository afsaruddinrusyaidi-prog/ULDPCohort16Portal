/**
 * ============================================================
 * ULDP 2026 — Points Engine + Staff Console (Google Apps Script)
 * ============================================================
 * One web app, two jobs:
 *
 *   1. PUBLIC API  (GET, no params)
 *      Returns the aggregated leaderboard JSON the portal reads.
 *      Only House_Standings + MVP totals ever leave the Sheet —
 *      raw Submissions and the Catalog are NEVER exposed.
 *
 *   2. STAFF CONSOLE  (GET ?page=staff)
 *      A password-protected web page where the Game Master
 *      reviews pending point claims and clicks Approve / Reject.
 *      Approved claims are aggregated automatically into
 *      House_Standings + MVP, and the public board updates within
 *      a minute. Staff can also add a points entry by hand.
 *
 * ------------------------------------------------------------
 * SHEET TABS
 * ------------------------------------------------------------
 *  "Submissions"  — the Google Form responses land here. The
 *                   script auto-adds the workflow columns it needs
 *                   (Status, ReviewedBy, ReviewedAt, Reason, and
 *                   Category/Points if the Form didn't ask for them).
 *                   Header names are matched loosely, so the Form
 *                   questions can be worded naturally.
 *  "House_Standings" — REBUILT by the script. Do not hand-edit.
 *                   A: HouseSlug B: Total C: Community D: Challenges E: Spirit
 *  "MVP"          — REBUILT by the script. Do not hand-edit.
 *                   A: Name B: HouseSlug C: Points
 *  "Catalog"      — OPTIONAL. Maps an activity to its public
 *                   category + default points/cap.
 *                   A: Activity B: Category C: DefaultPoints D: Cap
 *  "ChangeLog"    — append-only audit trail (script writes here).
 *
 * ------------------------------------------------------------
 * ONE-TIME DEPLOYMENT (~3 minutes)
 * ------------------------------------------------------------
 *  1. Open the points Google Sheet → Extensions → Apps Script.
 *  2. Paste this whole file into Code.gs. Save.
 *  3. Set the staff password:
 *       Project Settings (gear) → Script Properties → Add:
 *         STAFF_KEY  =  <a strong passphrase you choose>
 *     (If you skip this, the default below is used — change it!)
 *  4. Run `setup` once (pick it in the toolbar ▶ Run) and grant
 *     permissions. This creates any missing tabs/headers.
 *  5. Deploy → New deployment → "Web app":
 *         Execute as:      Me
 *         Who has access:  Anyone
 *     Copy the /exec URL.
 *  6. Paste that URL into assets/js/config.js:
 *         API_URL           = "<.../exec>"
 *         STAFF_CONSOLE_URL = "<.../exec>?page=staff"
 *  7. Share the staff URL + STAFF_KEY only with the Game Master.
 *
 * After editing this script later: Deploy → Manage deployments →
 * edit → "New version" (the /exec URL stays the same).
 * ============================================================
 */

// ----- Config -------------------------------------------------
var SHEET_SUBMISSIONS = 'Submissions';
var SHEET_STANDINGS   = 'House_Standings';
var SHEET_MVP         = 'MVP';
var SHEET_CATALOG     = 'Catalog';
var SHEET_LOG         = 'ChangeLog';
var CACHE_SECONDS     = 60;
var CACHE_KEY         = 'public-payload';

// The four houses (slug -> display). The standings always show all four.
var HOUSES = {
  visionaries: 'House of Visionaries',
  builders:    'House of Builders',
  purpose:     'House of Purpose',
  connectors:  'House of Connectors'
};
// Public buckets a claim can fall into.
var CATEGORIES = ['Community', 'Challenges', 'Spirit'];
var DEFAULT_CATEGORY = 'Spirit';

// Fallback password ONLY if Script Property STAFF_KEY is unset.
var DEFAULT_STAFF_KEY = 'CHANGE-ME-C16';

function getStaffKey_() {
  var p = PropertiesService.getScriptProperties().getProperty('STAFF_KEY');
  return (p && p.trim()) ? p.trim() : DEFAULT_STAFF_KEY;
}
function checkKey_(key) {
  return String(key || '').trim() === getStaffKey_();
}

// ----- Web entry points --------------------------------------
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'staff') {
    return HtmlService.createHtmlOutput(STAFF_HTML())
      .setTitle('ULDP 2026 · Staff Console')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  if (e && e.parameter && e.parameter.feed === 'log') {
    return jsonOut_(logFeed_());
  }
  return jsonOut_(publicPayload_());
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ----- Public payload (cached) -------------------------------
function publicPayload_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = {
    updated: new Date().toISOString(),
    standings: readStandings_(ss),
    mvp: readMvp_(ss)
  };
  cache.put(CACHE_KEY, JSON.stringify(payload), CACHE_SECONDS);
  return payload;
}

// ----- Captain-facing claim log (?feed=log) ------------------
// Returns reviewed + pending claims so Captains can see the status
// of every submission. NO submitter emails are exposed. Cached 30s.
function logFeed_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('log-feed');
  if (hit) return JSON.parse(hit);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var cat = catalog_(ss);
  var claims = [];
  var last = sh.getLastRow();
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    for (var i = 0; i < values.length; i++) {
      var c = rowToClaim_(values[i], i + 2, map, cat);
      if (!c.activity && !c.house && !c.points) continue;   // blank row
      if (c.status.toLowerCase() === 'deleted') continue;   // hide deleted from captains
      claims.push({
        when: c.when,
        house: c.house,
        type: c.type,
        member: c.member,
        activity: c.activity,
        category: c.category,
        points: c.points,
        status: c.status,
        reason: c.reason
      });
    }
  }
  claims.reverse();                          // newest first
  var payload = { updated: new Date().toISOString(), claims: claims.slice(0, 300) };
  cache.put('log-feed', JSON.stringify(payload), 30);
  return payload;
}

function readStandings_(ss) {
  var sh = ss.getSheetByName(SHEET_STANDINGS);
  if (!sh) return [];
  var rows = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
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
      name: String(r[0]), points: Number(r[2]) || 0
    });
  }
  Object.keys(byHouse).forEach(function (h) {
    byHouse[h] = byHouse[h]
      .sort(function (a, b) { return b.points - a.points; })
      .slice(0, 3);                 // top 3 per house only
  });
  return byHouse;
}

// ----- Column mapping on Submissions -------------------------
// Loose header matching so Form questions can be worded naturally.
var COLSPEC = {
  status:    ['status'],
  reviewer:  ['reviewedby', 'reviewer'],
  reviewed:  ['reviewedat', 'reviewdate'],
  reason:    ['reason', 'note', 'notes'],
  type:      ['claimtype', 'type', 'house/individual', 'claim'],
  house:     ['house'],
  member:    ['member', 'recipient', 'name of member', 'whose points', 'participant'],
  activity:  ['activity', 'whatactivity', 'whathappened'],
  category:  ['category', 'bucket'],
  points:    ['points', 'pts', 'pointvalue'],
  evidence:  ['evidence', 'proof', 'photo', 'link', 'upload'],
  submitter: ['submittedby', 'captain', 'youremail', 'email']
};
// Workflow columns the script will create if the Form didn't.
var ENSURE_COLS = ['Category', 'Points', 'Status', 'ReviewedBy', 'ReviewedAt', 'Reason'];

function norm_(s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); }

function getSubmissionsSheet_(ss) {
  var sh = ss.getSheetByName(SHEET_SUBMISSIONS);
  if (!sh) sh = ss.insertSheet(SHEET_SUBMISSIONS);
  if (sh.getLastColumn() === 0) {
    sh.getRange(1, 1, 1, 1).setValues([['Timestamp']]);
  }
  // ensure workflow columns exist
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var existing = headers.map(norm_);
  ENSURE_COLS.forEach(function (name) {
    if (existing.indexOf(norm_(name)) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(name);
      existing.push(norm_(name));
    }
  });
  return sh;
}

function colMap_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(norm_);
  var map = {};
  Object.keys(COLSPEC).forEach(function (key) {
    map[key] = -1;
    var cands = COLSPEC[key];
    for (var i = 0; i < headers.length && map[key] === -1; i++) {
      for (var j = 0; j < cands.length; j++) {
        if (headers[i].indexOf(norm_(cands[j])) !== -1) { map[key] = i; break; }
      }
    }
  });
  return map;
}

// ----- Catalog lookup ----------------------------------------
function catalog_(ss) {
  var sh = ss.getSheetByName(SHEET_CATALOG);
  var byActivity = {};
  if (!sh || sh.getLastRow() < 2) return byActivity;
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var act = norm_(rows[i][0]);
    if (!act) continue;
    byActivity[act] = {
      category: cleanCategory_(rows[i][1]),
      points: Number(rows[i][2]) || 0,
      cap: Number(rows[i][3]) || 0
    };
  }
  return byActivity;
}

function cleanCategory_(v) {
  var n = norm_(v);
  for (var i = 0; i < CATEGORIES.length; i++) {
    if (norm_(CATEGORIES[i]) === n) return CATEGORIES[i];
  }
  return '';
}
function cleanHouse_(v) {
  var n = String(v || '').toLowerCase().trim();
  // accept "House of Builders", "builders", etc.
  for (var slug in HOUSES) {
    if (n.indexOf(slug) !== -1) return slug;
  }
  return n;
}
function isIndividual_(v) {
  var n = norm_(v);
  return n.indexOf('individual') !== -1 || n.indexOf('mvp') !== -1 || n.indexOf('member') !== -1;
}

// ----- Read pending / all claims for the console -------------
function rowToClaim_(row, idx, map, cat) {
  function g(key) { return map[key] >= 0 ? row[map[key]] : ''; }
  var activity = g('activity');
  var c = cat[norm_(activity)] || {};
  var category = cleanCategory_(g('category')) || c.category || DEFAULT_CATEGORY;
  var points = Number(g('points'));
  if (!points && c.points) points = c.points;
  return {
    row: idx,                                   // 1-based sheet row
    when: g('status') !== undefined ? (row[0] ? new Date(row[0]).toISOString() : '') : '',
    type: isIndividual_(g('type')) ? 'Individual' : 'House',
    house: cleanHouse_(g('house')),
    member: String(g('member') || '').trim(),
    activity: String(activity || '').trim(),
    category: category,
    points: Number(points) || 0,
    evidence: String(g('evidence') || '').trim(),
    submitter: String(g('submitter') || '').trim(),
    status: String(g('status') || 'Pending').trim() || 'Pending',
    reason: String(g('reason') || '').trim()
  };
}

function readClaims_(ss) {
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var cat = catalog_(ss);
  var last = sh.getLastRow();
  if (last < 2) return { pending: [], recent: [] };
  var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var pending = [], recent = [];
  for (var i = 0; i < values.length; i++) {
    var claim = rowToClaim_(values[i], i + 2, map, cat);
    if (!claim.activity && !claim.house && !claim.points) continue;  // blank row
    var st = claim.status.toLowerCase();
    if (st === 'pending' || st === '') pending.push(claim);
    else recent.push(claim);
  }
  recent = recent.reverse().slice(0, 40);
  return { pending: pending, recent: recent };
}

// ----- Aggregation (the engine) ------------------------------
function recomputeAggregates_(ss) {
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var cat = catalog_(ss);
  var totals = {}, members = {};
  Object.keys(HOUSES).forEach(function (h) {
    totals[h] = { total: 0, Community: 0, Challenges: 0, Spirit: 0 };
  });

  var last = sh.getLastRow();
  if (last >= 2) {
    var values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    for (var i = 0; i < values.length; i++) {
      var c = rowToClaim_(values[i], i + 2, map, cat);
      if (c.status.toLowerCase() !== 'approved') continue;
      if (!totals[c.house]) continue;          // unknown house → ignore
      var pts = Number(c.points) || 0;
      totals[c.house].total += pts;
      if (CATEGORIES.indexOf(c.category) !== -1) totals[c.house][c.category] += pts;
      if (c.type === 'Individual' && c.member) {
        var k = c.house + '||' + c.member;
        members[k] = members[k] || { name: c.member, house: c.house, points: 0 };
        members[k].points += pts;
      }
    }
  }

  // write House_Standings
  var st = ss.getSheetByName(SHEET_STANDINGS) || ss.insertSheet(SHEET_STANDINGS);
  st.clearContents();
  var out = [['HouseSlug', 'Total', 'Community', 'Challenges', 'Spirit']];
  Object.keys(HOUSES).forEach(function (h) {
    var t = totals[h];
    out.push([h, t.total, t.Community, t.Challenges, t.Spirit]);
  });
  st.getRange(1, 1, out.length, 5).setValues(out);

  // write MVP
  var mv = ss.getSheetByName(SHEET_MVP) || ss.insertSheet(SHEET_MVP);
  mv.clearContents();
  var mrows = [['Name', 'HouseSlug', 'Points']];
  Object.keys(members).forEach(function (k) {
    mrows.push([members[k].name, members[k].house, members[k].points]);
  });
  mv.getRange(1, 1, mrows.length, 3).setValues(mrows);

  CacheService.getScriptCache().remove(CACHE_KEY);   // force fresh public payload
  return totals;
}

function log_(ss, action, detail) {
  var sh = ss.getSheetByName(SHEET_LOG) || ss.insertSheet(SHEET_LOG);
  if (sh.getLastRow() === 0) sh.appendRow(['When', 'Action', 'Detail']);
  sh.appendRow([new Date(), action, detail]);
}

// ----- Staff API (called from the console via google.script.run)
function staffGetState(key) {
  if (!checkKey_(key)) return { ok: false, error: 'Wrong access key.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var claims = readClaims_(ss);
  return {
    ok: true,
    houses: HOUSES,
    categories: CATEGORIES,
    pending: claims.pending,
    recent: claims.recent,
    standings: readStandings_(ss),
    updated: new Date().toISOString()
  };
}

/**
 * Approve or reject one claim. The console may pass edited
 * house/category/points/member so the Game Master can correct a
 * claim at the moment of approval.
 */
function staffDecide(key, payload) {
  if (!checkKey_(key)) return { ok: false, error: 'Wrong access key.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var row = Number(payload.row);
  if (!(row >= 2)) return { ok: false, error: 'Bad row.' };

  var decision = payload.decision === 'approve' ? 'Approved' : 'Rejected';
  function setCol(key, val) {
    if (map[key] >= 0) sh.getRange(row, map[key] + 1).setValue(val);
  }
  // apply any edits the reviewer made
  if (decision === 'Approved') {
    if (payload.house)    setCol('house', payload.house);
    if (payload.category) setCol('category', payload.category);
    if (payload.points !== undefined && payload.points !== '') setCol('points', Number(payload.points));
    if (payload.member !== undefined) setCol('member', payload.member);
  }
  setCol('status', decision);
  setCol('reviewer', Session.getActiveUser().getEmail() || 'staff');
  setCol('reviewed', new Date());
  if (payload.reason) setCol('reason', payload.reason);

  recomputeAggregates_(ss);
  log_(ss, decision, 'row ' + row + ' · ' + (payload.activity || '') +
       ' · ' + (payload.points || '') + 'pts' + (payload.reason ? ' · ' + payload.reason : ''));
  return staffGetState(key);
}

/** Add an approved points entry by hand (no Form needed). */
function staffAdd(key, payload) {
  if (!checkKey_(key)) return { ok: false, error: 'Wrong access key.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var width = sh.getLastColumn();
  var rowArr = new Array(width).fill('');
  rowArr[0] = new Date();                              // Timestamp in col A
  function put(key, val) { if (map[key] >= 0) rowArr[map[key]] = val; }
  put('type', payload.member ? 'Individual' : 'House');
  put('house', cleanHouse_(payload.house));
  put('member', payload.member || '');
  put('activity', payload.activity || 'Manual entry');
  put('category', cleanCategory_(payload.category) || DEFAULT_CATEGORY);
  put('points', Number(payload.points) || 0);
  put('evidence', payload.evidence || '');
  put('submitter', Session.getActiveUser().getEmail() || 'staff');
  put('status', 'Approved');
  put('reviewer', Session.getActiveUser().getEmail() || 'staff');
  put('reviewed', new Date());
  sh.appendRow(rowArr);

  recomputeAggregates_(ss);
  log_(ss, 'Manual add', cleanHouse_(payload.house) + ' · ' +
       (payload.points || 0) + 'pts · ' + (payload.activity || ''));
  return staffGetState(key);
}

/**
 * Edit an existing claim (any row) and/or change its status.
 * Used by the staff console to correct an already-reviewed entry or
 * to RESTORE a deleted/rejected one (pass status:'Approved').
 * Only fields that are provided are changed.
 */
function staffUpdate(key, payload) {
  if (!checkKey_(key)) return { ok: false, error: 'Wrong access key.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var row = Number(payload.row);
  if (!(row >= 2)) return { ok: false, error: 'Bad row.' };
  function setCol(k, v) { if (map[k] >= 0) sh.getRange(row, map[k] + 1).setValue(v); }

  if (payload.house !== undefined)    setCol('house', cleanHouse_(payload.house));
  if (payload.category !== undefined) setCol('category', cleanCategory_(payload.category) || payload.category);
  if (payload.points !== undefined && payload.points !== '') setCol('points', Number(payload.points));
  if (payload.member !== undefined)   setCol('member', payload.member);
  if (payload.activity !== undefined) setCol('activity', payload.activity);
  if (payload.type !== undefined)     setCol('type', payload.type);
  if (payload.reason !== undefined)   setCol('reason', payload.reason);
  if (payload.status) {
    var s = String(payload.status);
    s = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();   // Approved/Rejected/Pending/Deleted
    setCol('status', s);
  }
  setCol('reviewer', Session.getActiveUser().getEmail() || 'staff');
  setCol('reviewed', new Date());

  recomputeAggregates_(ss);
  log_(ss, 'Edit', 'row ' + row + ' · ' + (payload.status || '(fields)') +
       ' · ' + (payload.points !== undefined ? payload.points + 'pts' : '') +
       (payload.activity ? ' · ' + payload.activity : ''));
  return staffGetState(key);
}

/**
 * Soft-delete a claim: marks it 'Deleted' so it stops counting but
 * can be RESTORED later via staffUpdate(status:'Approved').
 * Pass hard:true to remove the row entirely (not recoverable).
 */
function staffDelete(key, payload) {
  if (!checkKey_(key)) return { ok: false, error: 'Wrong access key.' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = getSubmissionsSheet_(ss);
  var map = colMap_(sh);
  var row = Number(payload.row);
  if (!(row >= 2)) return { ok: false, error: 'Bad row.' };

  if (payload.hard) {
    sh.deleteRow(row);
    log_(ss, 'Hard delete', 'row ' + row);
  } else {
    if (map.status >= 0) sh.getRange(row, map.status + 1).setValue('Deleted');
    if (map.reviewer >= 0) sh.getRange(row, map.reviewer + 1).setValue(Session.getActiveUser().getEmail() || 'staff');
    if (map.reviewed >= 0) sh.getRange(row, map.reviewed + 1).setValue(new Date());
    log_(ss, 'Delete', 'row ' + row + ' (recoverable)');
  }
  recomputeAggregates_(ss);
  return staffGetState(key);
}

// ----- One-time setup (run from the editor) ------------------
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  getSubmissionsSheet_(ss);
  [SHEET_STANDINGS, SHEET_MVP, SHEET_CATALOG, SHEET_LOG].forEach(function (n) {
    if (!ss.getSheetByName(n)) ss.insertSheet(n);
  });
  var cat = ss.getSheetByName(SHEET_CATALOG);
  if (cat.getLastRow() === 0) cat.appendRow(['Activity', 'Category', 'DefaultPoints', 'Cap']);
  recomputeAggregates_(ss);
  return 'Setup complete. Tabs ready. STAFF_KEY = ' +
    (PropertiesService.getScriptProperties().getProperty('STAFF_KEY') ? '(set)' : 'DEFAULT — please set it!');
}

// ============================================================
// STAFF CONSOLE — single-file HTML/JS (served by doGet ?page=staff)
// ============================================================
function STAFF_HTML() {
  return '' +
'<!doctype html><html><head><meta charset="utf-8">' +
'<style>' +
':root{--navy:#141B33;--navy2:#1E2A4A;--cream:#F3F1EA;--teal:#0D9488;--yellow:#F7C842;--pink:#E91E8C;--orange:#E8931A;--purple:#6B2FA0;--grey:#6B7080;--line:#E3E1D9}' +
'*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}' +
'body{margin:0;background:#0E1426;color:#1A1A22}' +
'.top{background:linear-gradient(160deg,#0E1426,#141B33 60%,#1E2A4A);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}' +
'.top h1{font-size:1.05rem;margin:0;letter-spacing:.04em}.top small{color:#AEB6CE;font-weight:400;display:block;font-size:.72rem;letter-spacing:.14em}' +
'.wrap{max-width:1040px;margin:0 auto;padding:22px}' +
'.gate{max-width:380px;margin:9vh auto;background:#fff;border-radius:16px;padding:34px;box-shadow:0 22px 60px rgba(0,0,0,.4);border-top:6px solid var(--yellow);text-align:center}' +
'.gate h2{margin:0 0 6px;color:var(--navy)}.gate p{color:var(--grey);font-size:.9rem;margin:0 0 16px}' +
'input,select,textarea{width:100%;padding:11px 13px;border:2px solid var(--line);border-radius:9px;font-size:.95rem;margin:6px 0}' +
'input:focus,select:focus,textarea:focus{outline:none;border-color:var(--teal)}' +
'.btn{display:inline-block;border:0;border-radius:999px;padding:10px 20px;font-weight:700;cursor:pointer;font-size:.88rem}' +
'.btn-y{background:var(--yellow);color:var(--navy)}.btn-g{background:var(--teal);color:#fff}.btn-r{background:#fff;color:var(--pink);border:2px solid var(--pink)}.btn-n{background:var(--navy);color:#fff}.btn-ghost{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)}' +
'.btn:disabled{opacity:.5;cursor:default}' +
'.btn-e{background:#fff;color:var(--navy);border:2px solid var(--line)}' +
'.pwwrap{position:relative}.pwtog{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:1.05rem;width:auto;margin:0;padding:4px}' +
'.err{color:var(--pink);font-size:.82rem;min-height:1.1em}' +
'.tabs{display:flex;gap:8px;margin:0 0 16px;flex-wrap:wrap}' +
'.tabs button{background:#fff;border:1px solid var(--line);border-radius:999px;padding:8px 16px;font-weight:600;cursor:pointer;font-size:.86rem}' +
'.tabs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}' +
'.card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 8px 26px rgba(20,27,51,.10);margin-bottom:14px}' +
'.claim{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:start}' +
'.claim h3{margin:0 0 4px;font-size:1rem;color:var(--navy)}' +
'.meta{font-size:.82rem;color:var(--grey);display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:6px}' +
'.tag{display:inline-block;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;color:#fff}' +
'.h-visionaries{background:var(--navy2)}.h-builders{background:var(--orange)}.h-purpose{background:var(--purple)}.h-connectors{background:var(--teal)}' +
'.t-ind{background:var(--pink)}.t-house{background:var(--grey)}' +
'.actions{display:flex;flex-direction:column;gap:8px;min-width:150px}' +
'.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
'.stand{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}' +
'.stand .s{background:#fff;border-radius:12px;padding:16px;text-align:center;box-shadow:0 8px 26px rgba(20,27,51,.08);border-top:5px solid var(--grey)}' +
'.stand .s.visionaries{border-top-color:var(--navy2)}.stand .s.builders{border-top-color:var(--orange)}.stand .s.purpose{border-top-color:var(--purple)}.stand .s.connectors{border-top-color:var(--teal)}' +
'.stand .s b{display:block;font-size:2rem;color:var(--navy)}.stand .s small{color:var(--grey);font-size:.74rem}' +
'.muted{color:var(--grey);font-size:.9rem;text-align:center;padding:30px}' +
'a.ev{color:var(--teal);font-weight:600}.note{font-size:.78rem;color:var(--grey)}' +
'@media(max-width:640px){.claim{grid-template-columns:1fr}.stand{grid-template-columns:repeat(2,1fr)}}' +
'</style></head><body>' +

'<div class="top"><div><h1>ULDP 2026 · Staff Console<small>POINTS APPROVAL · GAME MASTER</small></h1></div>' +
'<div><button class="btn btn-ghost" id="refresh" style="display:none">↻ Refresh</button> ' +
'<button class="btn btn-ghost" id="logout" style="display:none">Lock</button></div></div>' +

'<div id="gateView" class="gate"><h2>Staff access</h2><p>Enter the staff access key shared by the programme team.</p>' +
'<div class="pwwrap"><input type="password" id="key" placeholder="Access key" autocomplete="off"><button type="button" class="pwtog" id="keytog" aria-label="Show or hide key">👁</button></div>' +
'<div class="err" id="gateErr"></div><button class="btn btn-n" id="enter" style="width:100%">Unlock console</button></div>' +

'<div id="appView" class="wrap" style="display:none">' +
'<div class="tabs"><button data-tab="pending" class="on">Pending <span id="pc"></span></button>' +
'<button data-tab="add">+ Add points</button>' +
'<button data-tab="recent">Recent</button>' +
'<button data-tab="board">Standings</button></div>' +
'<div id="panel"></div></div>' +

'<script>' +
'var KEY="",STATE=null;' +
'function run(fn,arg,cb){google.script.run.withSuccessHandler(function(r){cb&&cb(r)}).withFailureHandler(function(e){alert("Error: "+e.message)})[fn](KEY,arg)}' +
'function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}' +
'document.getElementById("enter").onclick=unlock;' +
'document.getElementById("keytog").onclick=function(){var i=document.getElementById("key");var sh=i.type==="password";i.type=sh?"text":"password";this.textContent=sh?"🙈":"👁"};' +
'document.getElementById("key").addEventListener("keydown",function(e){if(e.key==="Enter")unlock()});' +
'function unlock(){var k=document.getElementById("key").value.trim();if(!k)return;' +
'google.script.run.withSuccessHandler(function(r){if(!r.ok){document.getElementById("gateErr").textContent=r.error||"Wrong key";return}' +
'KEY=k;STATE=r;document.getElementById("gateView").style.display="none";document.getElementById("appView").style.display="block";' +
'document.getElementById("refresh").style.display="";document.getElementById("logout").style.display="";show("pending")})' +
'.withFailureHandler(function(e){document.getElementById("gateErr").textContent=e.message}).staffGetState(k)}' +
'document.getElementById("logout").onclick=function(){location.reload()};' +
'document.getElementById("refresh").onclick=function(){run("staffGetState",null,function(r){STATE=r;var on=document.querySelector(".tabs .on");show(on?on.dataset.tab:"pending")})};' +
'Array.prototype.forEach.call(document.querySelectorAll(".tabs button"),function(b){b.onclick=function(){' +
'Array.prototype.forEach.call(document.querySelectorAll(".tabs button"),function(x){x.classList.remove("on")});b.classList.add("on");show(b.dataset.tab)}});' +
'function houseOpts(sel){var h=STATE.houses,o="";for(var k in h){o+="<option value=\\""+k+"\\""+(sel===k?" selected":"")+">"+esc(h[k])+"</option>"}return o}' +
'function catOpts(sel){return STATE.categories.map(function(c){return "<option"+(sel===c?" selected":"")+">"+c+"</option>"}).join("")}' +
'function tag(h){return "<span class=\\"tag h-"+h+"\\">"+esc((STATE.houses[h]||h)).replace("House of ","")+"</span>"}' +
'document.getElementById("pc");' +
'function show(tab){var p=document.getElementById("panel");document.getElementById("pc").textContent=STATE.pending.length?("("+STATE.pending.length+")"):"";' +
'if(tab==="pending")return renderPending(p);if(tab==="add")return renderAdd(p);if(tab==="recent")return renderRecent(p);return renderBoard(p)}' +

'function renderPending(p){if(!STATE.pending.length){p.innerHTML="<div class=\\"card muted\\">🎉 Nothing pending. All caught up.</div>";return}' +
'p.innerHTML=STATE.pending.map(function(c,i){return claimCard(c,i)}).join("");' +
'STATE.pending.forEach(function(c,i){wire(c,i)})}' +
'function claimCard(c,i){return "<div class=\\"card\\" id=\\"c"+i+"\\"><div class=\\"claim\\"><div>"+' +
'"<h3>"+esc(c.activity||"(no activity)")+"</h3>"+tag(c.house)+" <span class=\\"tag "+(c.type==="Individual"?"t-ind":"t-house")+"\\">"+c.type+"</span>"+' +
'(c.member?" <b>"+esc(c.member)+"</b>":"")+' +
'"<div class=\\"meta\\"><span>"+esc(c.category)+"</span><span>"+esc(c.submitter||"")+"</span>"+(c.evidence?"<a class=\\"ev\\" href=\\""+esc(c.evidence)+"\\" target=\\"_blank\\">evidence ↗</a>":"<span class=\\"note\\">no link</span>")+"</div>"+' +
'"<div class=\\"row2\\" style=\\"margin-top:10px\\"><select data-f=\\"house\\">"+houseOpts(c.house)+"</select><select data-f=\\"category\\">"+catOpts(c.category)+"</select></div>"+' +
'"<div class=\\"row2\\"><input data-f=\\"points\\" type=\\"number\\" value=\\""+(c.points||0)+"\\" placeholder=\\"Points\\"><input data-f=\\"member\\" value=\\""+esc(c.member)+"\\" placeholder=\\"Member (for MVP)\\"></div>"+' +
'"</div><div class=\\"actions\\"><button class=\\"btn btn-g\\" data-a=\\"approve\\">✓ Approve</button>"+' +
'"<input data-f=\\"reason\\" placeholder=\\"Reason (if reject)\\"><button class=\\"btn btn-r\\" data-a=\\"reject\\">✕ Reject</button></div></div></div>"}' +
'function wire(c,i){var el=document.getElementById("c"+i);function val(f){var n=el.querySelector("[data-f=\\""+f+"\\"]");return n?n.value:""}' +
'Array.prototype.forEach.call(el.querySelectorAll("[data-a]"),function(btn){btn.onclick=function(){btn.disabled=true;' +
'var payload={row:c.row,decision:btn.dataset.a,house:val("house"),category:val("category"),points:val("points"),member:val("member"),reason:val("reason"),activity:c.activity};' +
'run("staffDecide",payload,function(r){STATE=r;show("pending")})}})}' +

'function stIcon(s){s=String(s||"").toLowerCase();return s==="approved"?"✅":(s==="rejected"?"❌":(s==="deleted"?"🗑️":"•"))}' +
'function renderRecent(p){if(!STATE.recent.length){p.innerHTML="<div class=\\"card muted\\">No reviewed claims yet.</div>";return}' +
'p.innerHTML="<p class=\\"note\\" style=\\"margin:0 0 10px\\">Edit corrects a claim and rebuilds the board. Delete is recoverable — deleted claims show a Restore button.</p>"+STATE.recent.map(function(c,i){return recentCard(c,i)}).join("");' +
'STATE.recent.forEach(function(c,i){wireRecent(c,i)})}' +
'function recentCard(c,i){var del=String(c.status).toLowerCase()==="deleted";return "<div class=\\"card\\" id=\\"r"+i+"\\"><div class=\\"claim\\"><div>"+' +
'"<h3>"+stIcon(c.status)+" "+esc(c.activity||"(no activity)")+"</h3>"+tag(c.house)+" <span class=\\"tag "+(c.type==="Individual"?"t-ind":"t-house")+"\\">"+c.type+"</span> <b>"+(c.points||0)+"pts</b>"+(c.member?" · "+esc(c.member):"")+(c.reason?" <span class=\\"note\\">("+esc(c.reason)+")</span>":"")+' +
'"<div id=\\"e"+i+"\\" style=\\"display:none;margin-top:10px\\"><div class=\\"row2\\"><select data-f=\\"house\\">"+houseOpts(c.house)+"</select><select data-f=\\"category\\">"+catOpts(c.category)+"</select></div>"+' +
'"<input data-f=\\"activity\\" value=\\""+esc(c.activity)+"\\" placeholder=\\"Activity\\"><div class=\\"row2\\"><input data-f=\\"points\\" type=\\"number\\" value=\\""+(c.points||0)+"\\" placeholder=\\"Points\\"><input data-f=\\"member\\" value=\\""+esc(c.member)+"\\" placeholder=\\"Member (for MVP)\\"></div></div>"+' +
'"</div><div class=\\"actions\\">"+' +
'(del?"<button class=\\"btn btn-g\\" data-a=\\"restore\\">♻ Restore</button>":"<button class=\\"btn btn-e\\" data-a=\\"editToggle\\">✎ Edit</button><button class=\\"btn btn-g\\" data-a=\\"save\\" style=\\"display:none\\">Save</button>")+' +
'"<button class=\\"btn btn-r\\" data-a=\\"delete\\">🗑 Delete</button></div></div></div>"}' +
'function wireRecent(c,i){var el=document.getElementById("r"+i);function val(f){var n=el.querySelector("[data-f=\\""+f+"\\"]");return n?n.value:""}function act(a){return el.querySelector("[data-a=\\""+a+"\\"]")}' +
'var et=act("editToggle"),sv=act("save"),ed=document.getElementById("e"+i);' +
'if(et)et.onclick=function(){var open=ed.style.display!=="none";ed.style.display=open?"none":"block";sv.style.display=open?"none":"inline-block";et.textContent=open?"✎ Edit":"Cancel"};' +
'if(sv)sv.onclick=function(){sv.disabled=true;run("staffUpdate",{row:c.row,house:val("house"),category:val("category"),points:val("points"),member:val("member"),activity:val("activity")},function(r){STATE=r;show("recent")})};' +
'var rs=act("restore");if(rs)rs.onclick=function(){rs.disabled=true;run("staffUpdate",{row:c.row,status:"Approved"},function(r){STATE=r;show("recent")})};' +
'var dl=act("delete");if(dl)dl.onclick=function(){if(!confirm("Delete this claim? You can restore it later."))return;dl.disabled=true;run("staffDelete",{row:c.row},function(r){STATE=r;show("recent")})}}' +

'function renderBoard(p){var s=STATE.standings,order=["visionaries","builders","purpose","connectors"];' +
'var map={};s.forEach(function(x){map[x.house]=x});' +
'p.innerHTML="<div class=\\"stand\\">"+order.map(function(h){var x=map[h]||{total:0,categories:{}};return "<div class=\\"s "+h+"\\"><small>"+esc((STATE.houses[h]||h).replace("House of ",""))+"</small><b>"+(x.total||0)+"</b><div class=\\"note\\">C "+(x.categories.Community||0)+" · Ch "+(x.categories.Challenges||0)+" · Sp "+(x.categories.Spirit||0)+"</div></div>"}).join("")+"</div>"+' +
'"<p class=\\"note\\" style=\\"text-align:center;margin-top:14px\\">Rebuilt live from approved claims. Public board refreshes within ~1 min.</p>"}' +

'function renderAdd(p){p.innerHTML="<div class=\\"card\\"><h3 style=\\"margin-top:0\\">Add an approved entry</h3>"+' +
'"<div class=\\"row2\\"><select id=\\"a_house\\">"+houseOpts("")+"</select><select id=\\"a_cat\\">"+catOpts("")+"</select></div>"+' +
'"<input id=\\"a_act\\" placeholder=\\"Activity / reason\\"><div class=\\"row2\\"><input id=\\"a_pts\\" type=\\"number\\" placeholder=\\"Points\\"><input id=\\"a_mem\\" placeholder=\\"Member (optional, for MVP)\\"></div>"+' +
'"<input id=\\"a_ev\\" placeholder=\\"Evidence link (optional)\\"><button class=\\"btn btn-y\\" id=\\"a_go\\">Add to board</button> <span class=\\"note\\" id=\\"a_msg\\"></span></div>";' +
'document.getElementById("a_go").onclick=function(){var b=this;b.disabled=true;document.getElementById("a_msg").textContent="Saving…";' +
'run("staffAdd",{house:document.getElementById("a_house").value,category:document.getElementById("a_cat").value,activity:document.getElementById("a_act").value,points:document.getElementById("a_pts").value,member:document.getElementById("a_mem").value,evidence:document.getElementById("a_ev").value},' +
'function(r){STATE=r;document.querySelector(".tabs button[data-tab=board]").click()})}}' +
'</script></body></html>';
}
