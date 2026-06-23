/**
 * ============================================================
 * ULDP 2026 — Participant Portal backend (Google Apps Script)
 * ============================================================
 * A SEPARATE Apps Script project, bound to its own
 * "ULDP Participants" Google Sheet. Powers the participant
 * login + member directory on the static site.
 *
 *   • POST  {action:"login", email, password}  -> { ok, token, name }
 *   • GET   ?feed=directory&token=<token>      -> { ok, members:[...] }
 *
 * Passwords are HASHED (SHA-256 + per-user salt + a project pepper),
 * never stored in plain text. Sessions are stateless signed tokens
 * (HMAC), valid 24h. Admin sets/reset passwords from the editor —
 * there is no email reset in v1 (by design).
 *
 * ------------------------------------------------------------
 * SHEET: "Participants"  (one row per person)
 *   Email | Salt | PassHash | Status | FullName | PreferredName |
 *   House | University | State | FieldOfStudy | TargetIndustries |
 *   Team | SocialLink | Badges | Personality | AskMeAbout |
 *   Hobbies | PhotoUrl
 * Headers are matched loosely, so a Google Form's wording is fine.
 * The directory NEVER exposes Email / Salt / PassHash.
 *
 * ------------------------------------------------------------
 * ONE-TIME SETUP
 *   1. Create a Google Sheet "ULDP Participants" → Extensions →
 *      Apps Script. Paste this file. Save.
 *   2. (Optional) Run createParticipantForm() to build the intake
 *      Form (collects profiles + photo). Or fill the sheet by hand.
 *   3. Run setup() once — creates tabs/headers + a project secret.
 *   4. Run seedPasswords() — gives every participant a random
 *      password (hashed). It writes a "Credentials" tab with the
 *      plain passwords for you to distribute, then DELETE that tab.
 *   5. Deploy → New deployment → Web app (Execute as: Me, Access:
 *      Anyone). Copy the /exec URL into assets/js/config.js:
 *         DIRECTORY_API_URL = "<.../exec>"
 *   After editing this script later: Deploy → Manage deployments →
 *   edit → New version (the /exec URL stays the same).
 * ============================================================
 */

var SHEET = 'Participants';
var HOUSES = { visionaries:'House of Visionaries', builders:'House of Builders', purpose:'House of Purpose', connectors:'House of Connectors' };
var TOKEN_TTL_MS = 24 * 60 * 60 * 1000;   // 24h

// Loose header matching (norm = lowercase, letters only)
var COLSPEC = {
  email:      ['email'],
  salt:       ['salt'],
  passhash:   ['passhash','passwordhash'],
  status:     ['status'],
  full:       ['fullname'],
  preferred:  ['preferredname','preferred','nickname'],
  house:      ['house'],
  university: ['university','institution'],
  state:      ['homestate','state','location'],
  field:      ['fieldofstudy','discipline','course','major','field'],
  industries: ['targetindustries','industries','track'],
  team:       ['teamnumber','team'],
  social:     ['linkedin','socialconnectivity','sociallink','social'],
  badges:     ['badges','achievements'],
  personality:['personality'],
  askme:      ['askmeabout','askme'],
  hobbies:    ['hobbies','passions','offduty'],
  photo:      ['profilepicture','photo','picture','upload']
};
// Workflow columns ensured on the sheet
var ENSURE_COLS = ['Salt','PassHash','Status'];

function norm_(s){ return String(s||'').toLowerCase().replace(/[^a-z]/g,''); }

// Works whether the script is BOUND to the sheet or STANDALONE.
// Standalone: set Script Property SHEET_ID to the sheet's id
// (the long string in its URL: /spreadsheets/d/<SHEET_ID>/edit).
function getSS_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  throw new Error('No spreadsheet bound. Set Script Property SHEET_ID to your ULDP Participants sheet id.');
}

// ----- secret / hashing / tokens -----------------------------
function getSecret_(){
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('PORTAL_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('PORTAL_SECRET', s); }
  return s;
}
function hashPw_(pw, salt){
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw) + '|' + String(salt) + '|' + getSecret_());
  return Utilities.base64Encode(raw);
}
function sign_(payload){
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, getSecret_()));
}
function makeToken_(email){
  var payload = email + '|' + (Date.now() + TOKEN_TTL_MS);
  return Utilities.base64EncodeWebSafe(payload) + '.' + sign_(payload);
}
function verifyToken_(token){
  try {
    var parts = String(token||'').split('.');
    if (parts.length !== 2) return null;
    var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    if (sign_(payload) !== parts[1]) return null;
    var bits = payload.split('|');
    if (Date.now() > Number(bits[1])) return null;
    return bits[0];                       // email
  } catch (e) { return null; }
}

// ----- web entry points --------------------------------------
function doGet(e){
  if (e && e.parameter && e.parameter.feed === 'directory') {
    return jsonOut_(directoryFeed_(e.parameter.token));
  }
  return jsonOut_({ ok:true, service:'ULDP Participants' });
}
function doPost(e){
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (_) {}
  if (body.action === 'login') return jsonOut_(login_(body.email, body.password));
  return jsonOut_({ ok:false, error:'Unknown action.' });
}
function jsonOut_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ----- sheet helpers -----------------------------------------
function sheet_(){
  var ss = getSS_();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) sh = ss.insertSheet(SHEET);
  if (sh.getLastColumn() === 0) sh.getRange(1,1,1,1).setValues([['Email']]);
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(norm_);
  ENSURE_COLS.forEach(function(name){
    if (headers.indexOf(norm_(name)) === -1) { sh.getRange(1, sh.getLastColumn()+1).setValue(name); headers.push(norm_(name)); }
  });
  return sh;
}
function colMap_(sh){
  var headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(norm_);
  var map = {};
  Object.keys(COLSPEC).forEach(function(key){
    map[key] = -1;
    var cands = COLSPEC[key];
    for (var i=0;i<headers.length && map[key]===-1;i++){
      for (var j=0;j<cands.length;j++){ if (headers[i].indexOf(norm_(cands[j])) !== -1){ map[key]=i; break; } }
    }
  });
  return map;
}
function houseSlug_(v){
  var n = String(v||'').toLowerCase();
  for (var slug in HOUSES){ if (n.indexOf(slug) !== -1) return slug; }
  return n.replace(/[^a-z]/g,'');
}
function photoUrl_(v){
  v = String(v||'').trim();
  if (!v) return '';
  var m = v.match(/[-\w]{25,}/);           // Drive file id
  if (v.indexOf('drive.google') !== -1 && m) return 'https://drive.google.com/thumbnail?id=' + m[0] + '&sz=w600';
  return v;                                // already a usable image URL
}
function badgeList_(v){
  if (!v) return [];
  return String(v).split(/[;,|\n]/).map(function(x){ return x.trim(); }).filter(Boolean);
}

// ----- read login + directory --------------------------------
function rowObj_(row, map){
  function g(k){ return map[k] >= 0 ? row[map[k]] : ''; }
  return {
    email: String(g('email')||'').trim().toLowerCase(),
    salt: String(g('salt')||''), passhash: String(g('passhash')||''),
    status: String(g('status')||'').trim(),
    full: String(g('full')||'').trim(), pref: String(g('preferred')||'').trim(),
    house: houseSlug_(g('house')), uni: String(g('university')||'').trim(),
    state: String(g('state')||'').trim(), field: String(g('field')||'').trim(),
    industries: String(g('industries')||'').trim(), team: String(g('team')||'').trim(),
    social: String(g('social')||'').trim(), badges: badgeList_(g('badges')),
    personality: String(g('personality')||'').trim(), askme: String(g('askme')||'').trim(),
    hobbies: String(g('hobbies')||'').trim(), photo: photoUrl_(g('photo'))
  };
}
function findByEmail_(email){
  var sh = sheet_(), map = colMap_(sh), last = sh.getLastRow();
  if (last < 2 || map.email < 0) return null;
  var rows = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  for (var i=0;i<rows.length;i++){
    var o = rowObj_(rows[i], map);
    if (o.email === email) { o._row = i+2; return o; }
  }
  return null;
}
function login_(email, pw){
  email = String(email||'').trim().toLowerCase(); pw = String(pw||'');
  if (!email || !pw) return { ok:false, error:'Enter your email and password.' };
  var r = findByEmail_(email);
  if (!r) return { ok:false, error:'No account for that email.' };
  if (r.status.toLowerCase() === 'disabled') return { ok:false, error:'Account disabled — contact the team.' };
  if (!r.passhash) return { ok:false, error:'Password not set yet — contact the team to get yours.' };
  if (hashPw_(pw, r.salt) !== r.passhash) return { ok:false, error:'Wrong email or password.' };
  return { ok:true, token: makeToken_(email), name: r.pref || r.full };
}
function directoryFeed_(token){
  if (!verifyToken_(token)) return { ok:false, error:'Please sign in again.', members:[] };
  var sh = sheet_(), map = colMap_(sh), last = sh.getLastRow();
  var members = [];
  if (last >= 2) {
    var rows = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
    for (var i=0;i<rows.length;i++){
      var o = rowObj_(rows[i], map);
      if (!o.full && !o.pref) continue;
      if (o.status.toLowerCase() === 'disabled') continue;
      members.push({ full:o.full, pref:o.pref, house:o.house, uni:o.uni, state:o.state,
        field:o.field, industries:o.industries, team:o.team, social:o.social,
        badges:o.badges, personality:o.personality, askme:o.askme, hobbies:o.hobbies, photo:o.photo });
    }
  }
  return { ok:true, updated:new Date().toISOString(), members: members };
}

// ----- admin (run from the editor) ---------------------------
function setup(){
  getSecret_();
  var sh = sheet_();
  return 'Setup complete. "Participants" tab ready (' + (sh.getLastRow()-1) + ' rows). ' +
    'Fill it (or run createParticipantForm), then run seedPasswords().';
}

/** Give every participant who has none a random password (hashed). */
function seedPasswords(){
  var sh = sheet_(), map = colMap_(sh), last = sh.getLastRow();
  if (last < 2) return 'No participants yet.';
  if (map.email < 0) return 'No Email column found.';
  var rows = sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
  var ss = getSS_();
  var cred = ss.getSheetByName('Credentials') || ss.insertSheet('Credentials');
  cred.clearContents();
  cred.appendRow(['Email','Password','(distribute, then DELETE this tab)']);
  var made = 0;
  for (var i=0;i<rows.length;i++){
    var email = String(rows[i][map.email]||'').trim().toLowerCase();
    if (!email) continue;
    var hasHash = map.passhash>=0 && String(rows[i][map.passhash]||'').trim();
    if (hasHash) continue;                       // don't reset existing
    var pw = randomPw_();
    var salt = Utilities.getUuid();
    sh.getRange(i+2, map.salt+1).setValue(salt);
    sh.getRange(i+2, map.passhash+1).setValue(hashPw_(pw, salt));
    if (map.status>=0 && !String(rows[i][map.status]||'').trim()) sh.getRange(i+2, map.status+1).setValue('Active');
    cred.appendRow([email, pw]);
    made++;
  }
  return 'Seeded ' + made + ' password(s). See the "Credentials" tab — distribute, then delete it.';
}

/** Set or reset one person's password (e.g. they forgot it). */
function setPasswordFor(email, newPassword){
  var r = findByEmail_(String(email||'').trim().toLowerCase());
  if (!r) return 'No participant with that email.';
  var sh = sheet_(), map = colMap_(sh);
  var salt = Utilities.getUuid();
  sh.getRange(r._row, map.salt+1).setValue(salt);
  sh.getRange(r._row, map.passhash+1).setValue(hashPw_(newPassword, salt));
  return 'Password updated for ' + email + '.';
}
function randomPw_(){
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i=0;i<8;i++) s += a.charAt(Math.floor(Math.random()*a.length));
  return s.slice(0,4) + '-' + s.slice(4);
}
