/**
 * 💎 מנויי פרו — Google Sheets הוא מקור האמת היחיד.
 * עמודות: phone | name | days | hours | minutes | seconds | start_iso | expiry_ms | status | chat_jid | granted_by | note
 * סטטוס: active / expired. התארכות למנוי פעיל מאריכה מהתפוגה (rolling).
 * חיבור: Service Account (קובץ gsheets-key.json) עם הרשאת Editor לגיליון.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

export const SHEET_ID = process.env.GSHEETS_SHEET_ID || '1ukNDj6vzrx2e7nOsXKm4zcKWjYGaih40bl6dB2uqHRM';
const TAB = process.env.GSHEETS_TAB || 'subs';
const KEY_FILE = process.env.GSHEETS_KEY_FILE || './gsheets-key.json';
// 🌉 מצב Apps Script (מומלץ — בלי מפתחות): URL של ה-Web App + סוד משותף
const WEBAPP_URL = (process.env.GSHEETS_WEBAPP_URL || '').trim();
const WEBAPP_SECRET = process.env.GSHEETS_SECRET || '303ac2a7ccde79443403faf44f13b5a5adcea2f50eb44f19';
const HEADER = ['טלפון', 'שם', 'ימים', 'שעות', 'דקות', 'שניות', 'התחלה', 'תפוגה', 'סטטוס', 'קבוצה', 'נרשם_עי', 'הערה'];

const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let keyCache = null;
function loadKey() {
  if (keyCache) return keyCache;
  if (!fs.existsSync(KEY_FILE)) throw new Error('NO_KEY_FILE');
  const j = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  if (!j.client_email || !j.private_key) throw new Error('BAD_KEY_FILE');
  keyCache = j;
  return j;
}

export function subsConfigured() {
  return subsMode() !== null;
}

/** 'appsscript' | 'serviceaccount' | null */
export function subsMode() {
  if (WEBAPP_URL) return 'appsscript';
  try {
    loadKey();
    if (SHEET_ID) return 'serviceaccount';
  } catch {}
  return null;
}

export const SUBS_SETUP_HELP =
  `💎 *מנויי פרו — צריך לחבר גיליון (פעם אחת):*\n\n` +
  `*דרך קלה — Apps Script:*\n` +
  `1. script.google.com ← פרויקט חדש ← הדבק את הקוד שבקובץ sheets-bridge.gs\n` +
  `2. Deploy ← Web app ← Execute as: Me ← Who has access: Anyone ← Deploy ← אשר\n` +
  `3. שלח לבוט את כתובת ה-/exec\n\n` +
  `*דרך Service Account:*\n` +
  `console.cloud.google.com ← הפעל Sheets API ← צור Service Account + קובץ JSON ← שתף איתו את הגיליון (Editor) ← שמור כ-gsheets-key.json`;

let tokenCache = null;
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  const k = loadKey();
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: k.client_email,
    sub: k.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now - 30,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
  }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`), k.private_key).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${header}.${payload}.${sig}`,
  });
  if (!res.ok) throw new Error(`AUTH ${(await res.text()).slice(0, 120)}`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return tokenCache.token;
}

async function sheetsApi(method, path, body) {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SHEETS ${method} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

/* ---------- 🌉 תעבורת Apps Script ---------- */
const BRIDGE_TIMEOUT_MS = parseInt(process.env.GSHEETS_TIMEOUT_MS || '20000', 10) || 20000;
async function fetchBridge(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    throw new Error(`BRIDGE NET: ${e?.cause?.code || e?.name || e?.message || 'timeout'}`);
  } finally {
    clearTimeout(t);
  }
}
async function asGet(params) {
  const q = new URLSearchParams({ key: WEBAPP_SECRET, ...params }).toString();
  const res = await fetchBridge(`${WEBAPP_URL}?${q}`);
  if (!res.ok) throw new Error(`BRIDGE GET ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(`BRIDGE: ${j.error || 'unknown'}`);
  return j;
}

async function asPost(body) {
  const res = await fetchBridge(WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: WEBAPP_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`BRIDGE POST ${res.status}`);
  const j = await res.json();
  if (!j.ok) throw new Error(`BRIDGE: ${j.error || 'unknown'}`);
  return j;
}

/** מוודא שהטאב + שורת כותרת קיימים */
export async function ensureSubsTab() {
  if (subsMode() === 'appsscript') return; // הסקריפט דואג לזה לבד
  const meta = await sheetsApi('GET', '?fields=sheets.properties');
  const has = (meta.sheets || []).some((s) => s.properties && s.properties.title === TAB);
  if (!has) {
    await sheetsApi('POST', ':batchUpdate', { requests: [{ addSheet: { properties: { title: TAB } } }] });
  }
  const head = await sheetsApi('GET', `/values/${encodeURIComponent(TAB)}!A1:L1`).catch(() => ({}));
  const row = (head.values && head.values[0]) || [];
  if (!row.length || row[0] !== 'טלפון') {
    await sheetsApi('PUT', `/values/${encodeURIComponent(TAB)}!A1:L1?valueInputOption=RAW`, { values: [HEADER] });
  }
}

function rowToSub(row, idx) {
  const c = (i) => (row[i] !== undefined ? String(row[i]) : '');
  return {
    row: idx + 2, // שורה בגיליון (1-based, אחרי כותרת)
    phone: c(0), name: c(1),
    days: +c(2) || 0, hours: +c(3) || 0, minutes: +c(4) || 0, seconds: +c(5) || 0,
    start_iso: c(6), expiry_ms: +c(7) || 0, status: c(8) || 'active',
    chat_jid: c(9), granted_by: c(10), note: c(11),
  };
}

/** כל המנויים (שורות). */
export async function readSubs() {
  if (subsMode() === 'appsscript') {
    const j = await asGet({ action: 'list' });
    return (j.subs || []).filter((s) => s.phone);
  }
  await ensureSubsTab();
  const j = await sheetsApi('GET', `/values/${encodeURIComponent(TAB)}!A2:L2000`).catch(() => ({}));
  return (j.values || []).map((r, i) => rowToSub(r, i)).filter((s) => s.phone && s.phone !== 'phone' && s.phone !== 'טלפון');
}

export async function getSub(phone) {
  if (subsMode() === 'appsscript') {
    const j = await asGet({ action: 'get', phone });
    return j.sub || null;
  }
  const all = await readSubs();
  return all.find((s) => s.phone === phone) || null;
}

/* ---------- 🖼️ רקעים לטלפון מתיקיית Drive ---------- */
export const BG_FOLDER = process.env.DRIVE_BG_FOLDER_ID || '1rhzUct2N9RTOo9YTHYr8T101jUpC-oD-';
let bgCache = { at: 0, files: [] };
export async function bgList(force = false) {
  if (subsMode() !== 'appsscript') throw new Error('BG_NO_BRIDGE');
  if (!force && Date.now() - bgCache.at < 3600000 && bgCache.files.length) return bgCache.files;
  let lastErr = null;
  for (let a = 0; a < 3; a++) {
    try {
      const j = await asGet({ action: 'drive', folder: BG_FOLDER });
      bgCache = { at: Date.now(), files: j.files || [] };
      return bgCache.files;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (bgCache.files.length) return bgCache.files; // גיבוי: רשימה ישנה
  throw lastErr;
}
/** מציאת רקע לפי מספר (1-based) / שם (מכיל) / 'אקראי'. מחזיר {i, file} או null. */
export function bgPick(files, q) {
  if (!files || !files.length) return null;
  const s = String(q || '').trim();
  if (!s || /^(רשימה|עזרה|help)$/i.test(s)) return null;
  if (/^(אקראי|רנדומלי|random|הפתע)/i.test(s)) {
    const i = Math.floor(Math.random() * files.length);
    return { i, file: files[i] };
  }
  const n = parseInt(s, 10);
  if (Number.isFinite(n) && n >= 1 && n <= files.length) return { i: n - 1, file: files[n - 1] };
  const low = s.toLowerCase();
  const idx = files.findIndex((f) => (f.name || '').toLowerCase().includes(low));
  return idx >= 0 ? { i: idx, file: files[idx] } : null;
}
/** כתובת תמונה ישירה מקובץ Drive ציבורי. */
export function driveImageUrl(id, w = 1080) {
  return `https://lh3.googleusercontent.com/d/${id}=w${w}`;
}

/* ---------- 🏷️ תגיות AI לרקעים (חיפוש סמנטי בעברית) ---------- */
let bgTagsCache = { at: 0, tags: {} };
export function bgTags() {
  if (Date.now() - bgTagsCache.at < 600000 && Object.keys(bgTagsCache.tags).length) {
    return bgTagsCache.tags;
  }
  try {
    bgTagsCache = { at: Date.now(), tags: JSON.parse(fs.readFileSync('./bg-tags.json', 'utf8')) };
  } catch {}
  return bgTagsCache.tags;
}
/** חיפוש לפי תגיות+שם — מחזיר מערך מדורג [{i, file, score}]. */
export function bgSearch(files, q) {
  const tags = bgTags();
  const words = String(q || '').trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored = [];
  for (let i = 0; i < files.length; i++) {
    const t = ((tags[files[i].id] || '') + ' ' + (files[i].name || '')).toLowerCase();
    let score = 0;
    for (const w of words) if (t.includes(w)) score++;
    if (score > 0) scored.push({ i, file: files[i], score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/* ---------- 🌐 מאגר נוסף: WidgetClub (URL ישיר + תיאור אנגלי) ---------- */
let bgExtraCache = { at: 0, items: [] };
export function bgExtra() {
  if (Date.now() - bgExtraCache.at < 3600000 && bgExtraCache.items.length) {
    return bgExtraCache.items;
  }
  try {
    bgExtraCache = { at: Date.now(), items: JSON.parse(fs.readFileSync('./bg-extra.json', 'utf8')) };
  } catch {}
  return bgExtraCache.items;
}
/** חיפוש במאגר הנוסף לפי מילים באנגלית — [{u, t, c, score}]. */
export function bgSearchExtra(qEn, limit = 50) {
  const words = String(qEn || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  const out = [];
  for (const it of bgExtra()) {
    const key = it.page || it.u; // תמיכה ישנה (u ישיר) + חדשה (page יציב)
    const t = ((it.t || '') + ' ' + (it.c || '')).toLowerCase();
    let s = 0;
    for (const w of words) if (t.includes(w)) s++;
    if (s > 0) out.push({ key, t: it.t, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/* ---------- 🔗 פתרון כתובת תמונה עדכנית מדף WidgetClub (20 דקות מטמון) ---------- */
const bgUrlCache = new Map();
export async function bgResolve(key) {
  if (!key) return null;
  if (!/^https?:/.test(key)) return key; // כבר URL ישיר (תאימות לאחור)
  const hit = bgUrlCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.url;
  const res = await fetch(key, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`WC page ${res.status}`);
  const h = await res.text();
  const m = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
    h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
  if (!m) throw new Error('WC: אין og:image');
  const url = m[1].replace(/&amp;/g, '&');
  if (bgUrlCache.size > 200) bgUrlCache.clear();
  bgUrlCache.set(key, { url, at: Date.now() });
  return url;
}

async function writeRow(rowNum, sub) {
  const vals = [[
    sub.phone, sub.name || '', sub.days || 0, sub.hours || 0, sub.minutes || 0, sub.seconds || 0,
    sub.start_iso || '', sub.expiry_ms || 0, sub.status || 'active',
    sub.chat_jid || '', sub.granted_by || '', sub.note || '',
  ]];
  await sheetsApi('PUT', `/values/${encodeURIComponent(TAB)}!A${rowNum}:L${rowNum}?valueInputOption=RAW`, { values: vals });
}

async function appendRow(sub) {
  await sheetsApi('POST', `/values/${encodeURIComponent(TAB)}!A:L:append?valueInputOption=RAW`, {
    values: [[
      sub.phone, sub.name || '', sub.days || 0, sub.hours || 0, sub.minutes || 0, sub.seconds || 0,
      sub.start_iso || '', sub.expiry_ms || 0, sub.status || 'active',
      sub.chat_jid || '', sub.granted_by || '', sub.note || '',
    ]],
  });
}

/** נרמול מספר ישראלי: 05XXXXXXXX → 9725XXXXXXXX. מחזיר null אם לא תקין. */
export function normPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (/^05\d{8}$/.test(d)) return '972' + d.slice(1);
  if (/^9725\d{8}$/.test(d)) return d;
  if (/^972\d{9}$/.test(d)) return d;
  return null;
}

/** הודעת שיווק PRO — מחירון + הצטרפות. */
export function proPitch(limit = 20) {
  return (
    `🤖 *בוט AI לוואטסאפ — PRO ב-1 ₪ ליום בלבד!*\n\n` +
    `💬 *אפשר לדבר עם הבוט בפרטי!*\n` +
    `שולחים הודעה לבוט והוא עונה — שאלות, תמונות, תרגום, מזג אוויר, ברכות, מתכונים, הכל!\n` +
    `בלי להוסיף לקבוצה, אחד על אחד.\n\n` +
    `👥 *אפשר להוסיף אותו לקבוצה!*\n` +
    `מוסיפים את הבוט כחבר לקבוצה, כותבים !עזרה והוא מתחיל לעבוד:\n` +
    `משחקים, טריוויה, תזכורות, סקרים, סטיקרים, שירים, חדשות ועוד.\n\n` +
    `🆓 *חינמי — 0 ₪*\n` +
    `• בקבוצה בלבד, עד ${limit} תשובות AI ביום\n` +
    `• עם שורת פרסומת קטנה בהודעות\n\n` +
    `💎 *PRO — 1 ₪ ליום!*\n` +
    `• צ'אט פרטי חופשי בלי הגבלה\n` +
    `• בקבוצות בלי הגבלה + בלי פרסומת\n` +
    `• יצירת תמונות AI, סטיקרים מאפס, הקראה בקול\n` +
    `• תמלול הקלטות, מזג, חדשות, מטבע, שבת, מניות\n` +
    `• טריוויה, משחקים, תזכורות, סקרים, בוקר-טוב יומי\n\n` +
    `💰 *מחירון PRO:*\n` +
    `• יום — 1 ₪ • שבוע — 7 ₪ • חודש (30 יום) — 30 ₪\n` +
    `• 3 חודשים (90 יום) — 90 ₪ • שנה — 365 ₪\n\n` +
    `📩 *איך מצטרפים?*\n` +
    `1. שולחים הודעה ל-0555655217 עם המילה: פרו\n` +
    `2. כותבים לכמה זמן רוצים + מספר הטלפון שלכם\n` +
    `3. משלמים בביט / פייבוקס / פייפל ומקבלים אישור תוך דקות\n\n` +
    `❓ לבדיקת המנוי: !פרו-מצב`
  );
}

/** פיצול "0501234567 30 דקות" → {phone, durText} — מספרים לפני יחידת זמן שייכים למשך, לא למספר. */
const DUR_UNIT = /^(ימים|יום|שבוע|שבועים|שעות|שעה|דקות|דקה|שניות|שניה|שנייה)$/;
export function splitPhoneDur(s) {
  const toks = String(s || '').trim().split(/\s+/).filter(Boolean);
  let digits = '';
  let i = 0;
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (!/^\+?[\d-]+$/.test(t)) break;
    if (DUR_UNIT.test(toks[i + 1] || '')) break; // ספרות לפני יחידה = חלק מהמשך
    const nd = (digits + t).replace(/\D/g, '');
    if (nd.length > 13) break;
    digits = (digits ? `${digits} ` : '') + t;
  }
  return { phoneRaw: digits.trim(), durText: toks.slice(i).join(' ') };
}

export function parseDuration(text) {
  const t = String(text || '');
  const get = (re) => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : 0;
  };
  const rawDays = get(/(\d+)\s*(ימים|יום)/);
  const weeks = get(/(\d+)\s*(שבוע|שבועים)/);
  const hours = get(/(\d+)\s*(שעות|שעה)/);
  const minutes = get(/(\d+)\s*(דקות|דקה)/);
  const seconds = get(/(\d+)\s*(שניות|שניה|שנייה)/);
  const totalSec = (rawDays + weeks * 7) * 86400 + hours * 3600 + minutes * 60 + seconds;
  return { days: rawDays + weeks * 7, hours, minutes, seconds, totalSec };
}

/** "3 ימים 2 שעות 5 דקות" / "פג תוקף" */
export function fmtLeft(ms) {
  if (ms <= 0) return 'פג תוקף';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d} ימים`);
  if (h) parts.push(`${h} שעות`);
  if (m) parts.push(`${m} דקות`);
  if (sec || !parts.length) parts.push(`${sec} שניות`);
  return parts.join(' ');
}

/**
 * הענקה/הארכה: למנוי פעיל מאריכים מהתפוגה, לפג/חדש — מעכשיו. מחזיר sub מעודכן.
 */
export async function grantSub({ phone, name = '', dur, chatJid = '', grantedBy = '' }) {
  if (subsMode() === 'appsscript') {
    const r = await asPost({
      action: 'grant', phone, name,
      days: dur.days, hours: dur.hours, minutes: dur.minutes, seconds: dur.seconds,
      chat_jid: chatJid, granted_by: grantedBy,
    });
    const cur = await getSub(phone).catch(() => null);
    return {
      sub: {
        phone, name: name || (cur ? cur.name : ''),
        days: dur.days, hours: dur.hours, minutes: dur.minutes, seconds: dur.seconds,
        start_iso: (cur && cur.start_iso) || new Date().toISOString(),
        expiry_ms: r.expiry_ms, status: 'active',
        chat_jid: chatJid || (cur ? cur.chat_jid : ''), granted_by: grantedBy, note: '',
      },
      extended: !!r.extended,
    };
  }
  const now = Date.now();
  const cur = await getSub(phone);
  const active = cur && cur.status === 'active' && cur.expiry_ms > now;
  const start = active ? cur.expiry_ms : now;
  const expiry = start + dur.totalSec * 1000;
  const sub = {
    phone, name: name || (cur ? cur.name : ''),
    days: dur.days, hours: dur.hours, minutes: dur.minutes, seconds: dur.seconds,
    start_iso: new Date(active ? cur.start_iso || new Date(now).toISOString() : now).toISOString(),
    expiry_ms: expiry, status: 'active',
    chat_jid: chatJid || (cur ? cur.chat_jid : ''),
    granted_by: grantedBy, note: active ? 'extended' : '',
  };
  if (cur) {
    sub.row = cur.row;
    await writeRow(cur.row, sub);
  } else {
    await appendRow(sub);
  }
  return { sub, extended: !!active };
}

export async function revokeSub(phone) {
  if (subsMode() === 'appsscript') {
    const cur = await getSub(phone).catch(() => null);
    if (!cur) return null;
    await asPost({ action: 'revoke', phone });
    return cur;
  }
  const cur = await getSub(phone);
  if (!cur) return null;
  cur.status = 'expired';
  cur.note = 'revoked';
  await writeRow(cur.row, cur);
  return cur;
}

/** מנויים פעילים שתפוגתם הגיעה — מסמן expired ומחזיר רשימה להודעות. */
export async function popExpiredSubs(now = Date.now()) {
  const all = await readSubs();
  const due = all.filter((s) => s.status === 'active' && s.expiry_ms && s.expiry_ms <= now);
  for (const s of due) {
    s.status = 'expired';
    if (subsMode() === 'appsscript') {
      await asPost({ action: 'expire', phone: s.phone }).catch(() => {});
    } else {
      await writeRow(s.row, s).catch(() => {});
    }
  }
  return due;
}

/** האם מספר בפרו פעיל (לתמחור/גבייה בהמשך). מנוי active בלי תפוגה = ללא הגבלה. */
export async function isPro(phone) {
  if (!phone) return false;
  const s = await getSub(phone).catch(() => null);
  if (!s || s.status !== 'active') return false;
  if (!s.expiry_ms) return true; // ללא הגבלה
  return s.expiry_ms > Date.now();
}
