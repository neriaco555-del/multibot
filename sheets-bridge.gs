/**
 * 🌉 גשר Apps Script — הבוט מדבר עם הגיליון דרך Web App הזה (בלי מפתחות OAuth).
 * התקנה (3 דקות, פעם אחת):
 * 1. להיכנס ל-script.google.com ← פרויקט חדש ← למחוק הכל ← להדביק את הקובץ הזה ← לשמור.
 * 2. Deploy ← New deployment ← סוג: Web app ← Execute as: Me ← Who has access: Anyone ← Deploy.
 * 3. לאשר הרשאות (Advanced ← Go to...) ← להעתיק את כתובת ה-/exec ← לשלוח לבוט.
 */
var SHEET_ID = '1ukNDj6vzrx2e7nOsXKm4zcKWjYGaih40bl6dB2uqHRM';
var TAB = 'subs';
var SHARED_SECRET = '303ac2a7ccde79443403faf44f13b5a5adcea2f50eb44f19';
var HEAD = ['טלפון', 'שם', 'ימים', 'שעות', 'דקות', 'שניות', 'התחלה', 'תפוגה', 'סטטוס', 'קבוצה', 'נרשם_עי', 'הערה'];

function sh() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var s = ss.getSheetByName(TAB);
  if (!s) {
    s = ss.insertSheet(TAB);
    s.appendRow(HEAD);
    return s;
  }
  if (s.getLastRow() === 0) {
    s.appendRow(HEAD);
  } else if (String(s.getRange(1, 1).getValue() || '') !== 'טלפון') {
    s.insertRowBefore(1);
    s.getRange(1, 1, 1, HEAD.length).setValues([HEAD]);
  }
  return s;
}

function resp(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** 🖼️ רשימת תמונות מתיקיית Drive (שם + id + סוג). */
function driveList(folderId) {
  var out = [];
  if (!folderId) return out;
  var it = DriveApp.getFolderById(folderId).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var mt = String(f.getMimeType() || '');
    if (mt.indexOf('image/') === 0) {
      out.push({ id: f.getId(), name: f.getName(), mime: mt });
    }
  }
  out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return out.slice(0, 200);
}

function rows() {
  var s = sh();
  var last = s.getLastRow();
  if (last < 2) return { s: s, out: [] };
  var vals = s.getRange(2, 1, last - 1, HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0] || r[0] === 'phone' || r[0] === 'טלפון') continue;
    out.push({
      row: i + 2,
      phone: String(r[0]), name: String(r[1] || ''),
      days: +r[2] || 0, hours: +r[3] || 0, minutes: +r[4] || 0, seconds: +r[5] || 0,
      start_iso: String(r[6] || ''), expiry_ms: +r[7] || 0, status: String(r[8] || 'active'),
      chat_jid: String(r[9] || ''), granted_by: String(r[10] || ''), note: String(r[11] || '')
    });
  }
  return { s: s, out: out };
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (String(p.key || '') !== SHARED_SECRET) return resp({ ok: false, error: 'forbidden' });
  if (p.action === 'list') return resp({ ok: true, subs: rows().out });
  if (p.action === 'drive') return resp({ ok: true, files: driveList(String(p.folder || '')) });
  if (p.action === 'get') {
    var all = rows().out;
    for (var i = 0; i < all.length; i++) {
      if (all[i].phone === String(p.phone || '')) return resp({ ok: true, sub: all[i] });
    }
    return resp({ ok: true, sub: null });
  }
  return resp({ ok: false, error: 'bad-action' });
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  if (String(body.key || '') !== SHARED_SECRET) return resp({ ok: false, error: 'forbidden' });
  var now = new Date().getTime();

  if (body.action === 'grant') {
    var d = rows();
    var cur = null;
    for (var i = 0; i < d.out.length; i++) {
      if (d.out[i].phone === String(body.phone || '')) { cur = d.out[i]; break; }
    }
    var active = cur && cur.status === 'active' && cur.expiry_ms > now;
    var startMs = active ? cur.expiry_ms : now;
    var durMs = ((+body.days || 0) * 86400 + (+body.hours || 0) * 3600 + (+body.minutes || 0) * 60 + (+body.seconds || 0)) * 1000;
    var expiry = startMs + durMs;
    var row = [
      String(body.phone || ''), String(body.name || (cur ? cur.name : '')),
      +body.days || 0, +body.hours || 0, +body.minutes || 0, +body.seconds || 0,
      new Date(active && cur.start_iso ? cur.start_iso : now).toISOString(),
      expiry, 'active',
      String(body.chat_jid || (cur ? cur.chat_jid : '')), String(body.granted_by || ''),
      active ? 'extended' : ''
    ];
    if (cur) d.s.getRange(cur.row, 1, 1, HEAD.length).setValues([row]);
    else d.s.appendRow(row);
    return resp({ ok: true, extended: !!active, expiry_ms: expiry });
  }

  if (body.action === 'expire' || body.action === 'revoke') {
    var r2 = rows();
    for (var j = 0; j < r2.out.length; j++) {
      if (r2.out[j].phone === String(body.phone || '')) {
        r2.s.getRange(r2.out[j].row, 9).setValue('expired');
        r2.s.getRange(r2.out[j].row, 12).setValue(body.action === 'revoke' ? 'revoked' : '');
        return resp({ ok: true, found: true });
      }
    }
    return resp({ ok: true, found: false });
  }

  return resp({ ok: false, error: 'bad-action' });
}
