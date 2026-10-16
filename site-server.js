/**
 * 🌐 אתר מולטי בוט — צ'אט קהילתי בזמן אמת.
 * בלי תלויות חדשות: HTTP + WebSocket ממומשים עם מודולי node בלבד.
 *
 * הרצה: node site-server.js  (PORT ברירת מחדל 3002)
 * פרוטוקול WS (JSON, שורה אחת):
 *   -> {t:'join', name, phone?, email?, avatar?, about?, room?}  הצטרפות (ברירת חדר: general)
 *   -> {t:'rooms'}                          רשימת חדרים + ספריית משתמשים
 *   -> {t:'create', name}                    יצירת קבוצה + מעבר אליה
 *   -> {t:'join-room', id}                   מעבר קבוצה
 *   -> {t:'ask', text}                       שאלה ישירה לבוט
 *   -> {t:'msg', text}                      הודעה (עד 500 תווים, הגבלת קצב)
 *   -> {t:'typing'}                         מחוון הקלדה (נשלח לכל השאר)
 *   -> {t:'del', id}                        מחיקת הודעה (מנהל בלבד, ADMIN_KEY)
 *   <- {t:'ok', you, users}                 אישור הצטרפות + רשימת מחוברים
 *   <- {t:'err', msg}                       שגיאה (שם תפוס/חסום/קצב)
 *   <- {t:'msg', id, from, text, at}        הודעה חדשה
 *   <- {t:'users', users}                   רשימת מחוברים מעודכנת
 *   <- {t:'typing', from}                   מישהו מקליד
 *   <- {t:'del', id}                        הודעה נמחקה
 *   <- {t:'hist', items}                    היסטוריה (200 אחרונות) אחרי join
 */
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatAI } from './ai-chat.js';
import { searchWeb } from './web-search.js';
import { generateImage } from './ai-image.js';
import { normalizeNaturalCommand, aiRouteCommand, KNOWN_FIRST } from './nlp.js';
import { resolveAiTool, runAiTool } from './aifun.js';
import { searchYouTube, formatMediaResults } from './media-search.js';
import { translateText, getWeather, searchImages } from './web-search.js';
import { transcribeAudio } from './aimedia.js';
import { searchProducts, affiliateUrl } from './aliexpress.js';
import {
  animalImage, currencyRates, cryptoPrices, newsHe,
  cityTime, dice, coin, pickOne, genPassword, randNum, randColor, dateHe, countdown,
  shabbatTimes, stockPrice, shortenUrl, earthquakes, airQuality, resolveIndexSymbol,
} from './more.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SITE_PORT || process.env.PORT || 3002);
const ADMIN_KEY = process.env.SITE_ADMIN || 'multi-admin-1';
const CHAT_FILE = new URL('./site-chat.json', import.meta.url);
const MAX_HIST = 200;
const STATUS_FILE = new URL('./site-status.json', import.meta.url);
const REPORT_FILE = new URL('./site-reports.json', import.meta.url);
let statuses = []; // {id, from, kind:text|image, text, img, bg, at, views:[{by, at}]}
try {
  const d = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
  if (Array.isArray(d)) statuses = d.filter((x) => Date.now() - (x.at || 0) < 24 * 3600 * 1000);
} catch {}
function saveStatuses() {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(statuses.slice(-200))); } catch {}
}
let reports = [];
try {
  const d = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf-8'));
  if (Array.isArray(d)) reports = d.slice(-500);
} catch {}
function saveReports() {
  try { fs.writeFileSync(REPORT_FILE, JSON.stringify(reports.slice(-500))); } catch {}
}
setInterval(() => {
  try {
    const n = statuses.length;
    statuses = statuses.filter((x) => Date.now() - (x.at || 0) < 24 * 3600 * 1000);
    if (statuses.length !== n) saveStatuses();
  } catch {}
}, 600000).unref?.();
const META_FILE = new URL('./site-meta.json', import.meta.url);
let meta = { pins: {}, points: {}, rota: { members: [], idx: 0 } }; // roomId -> {id, text, from, at}
try {
  const d = JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
  if (d && typeof d === 'object') meta = {
    pins: (d.pins || (d.pinned ? { general: d.pinned } : {})),
    points: (d.points && typeof d.points === 'object') ? d.points : {},
    rota: (d.rota && typeof d.rota === 'object') ? { members: Array.isArray(d.rota.members) ? d.rota.members.slice(0, 50) : [], idx: Number(d.rota.idx) || 0 } : { members: [], idx: 0 },
  };
} catch {}
function saveMeta() {
  try { fs.writeFileSync(META_FILE, JSON.stringify(meta)); } catch {}
}
let metaTimer = null;
function saveMetaSoon() {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(saveMeta, 3000);
}
// 🏆 ניקוד: נקודה להודעה (עד אחת לדקה)
const pointAt = new Map();
function addPoint(name) {
  if (!name || name === BOT_NAME) return;
  const now = Date.now();
  if (now - (pointAt.get(name) || 0) < 60000) return;
  pointAt.set(name, now);
  meta.points[name] = (meta.points[name] || 0) + 1;
  saveMetaSoon();
}
function addPoints(name, n) {
  if (!name || name === BOT_NAME) return;
  meta.points[name] = (meta.points[name] || 0) + n;
  saveMetaSoon();
}
function topPoints(limit = 5) {
  return Object.entries(meta.points).sort((a, b) => b[1] - a[1]).slice(0, limit);
}
// ---------- 🔐 חשבונות (שם + סיסמה, טוקן להתחברות אוטומטית) ----------
const ACC_FILE = new URL('./site-accounts.json', import.meta.url);
let accounts = { users: {}, tokens: {} };
try {
  const d = JSON.parse(fs.readFileSync(ACC_FILE, 'utf-8'));
  if (d && typeof d === 'object') {
    if (d.users && typeof d.users === 'object') accounts.users = d.users;
    if (d.tokens && typeof d.tokens === 'object') accounts.tokens = d.tokens;
  }
} catch {}
let accTimer = null;
function saveAccounts() {
  clearTimeout(accTimer);
  accTimer = setTimeout(() => {
    try { fs.writeFileSync(ACC_FILE, JSON.stringify(accounts)); } catch {}
  }, 2000);
}
function hashPass(pass, salt) {
  return 'scrypt:' + salt + ':' + crypto.scryptSync(String(pass), salt, 64).toString('hex');
}
function checkPass(pass, stored) {
  try {
    const [algo, salt, hex] = String(stored || '').split(':');
    if (algo !== 'scrypt' || !salt || !hex) return false;
    const h = crypto.scryptSync(String(pass), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hex, 'hex'));
  } catch { return false; }
}
function validPass(p) {
  const s = String(p || '');
  return s.length >= 4 && s.length <= 64;
}
function newToken() { return 'tk' + crypto.randomBytes(24).toString('hex'); }
// הגבלת ניסיונות התחברות: 8 כשלונות ל-IP ב-5 דקות
const loginFails = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  const arr = (loginFails.get(ip) || []).filter((t) => now - t < 5 * 60 * 1000);
  loginFails.set(ip, arr);
  return arr.length >= 8;
}
function loginFail(ip) {
  const arr = loginFails.get(ip) || [];
  arr.push(Date.now());
  loginFails.set(ip, arr);
}
// ניקוי הודעות נעלמות כל דקה
setInterval(() => {
  try {
    const now = Date.now();
    let changed = false;
    for (const [rid, r] of rooms) {
      const gone = r.hist.filter((h) => h.expAt && h.expAt <= now).map((h) => h.id);
      if (gone.length) {
        r.hist = r.hist.filter((h) => !(h.expAt && h.expAt <= now));
        changed = true;
        for (const id of gone) roomCast(rid, { t: 'del', id, room: rid });
      }
    }
    if (changed) saveHist();
  } catch {}
}, 60000).unref?.();

// ---------- אחסון חדרים ----------
const rooms = new Map(); // id -> {id, name, hist, createdAt}
function getRoom(id) {
  if (id && rooms.has(id)) return rooms.get(id);
  return rooms.get('general');
}
function roomHist(id) { return getRoom(id).hist; }
try {
  const d = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf-8'));
  if (Array.isArray(d)) {
    rooms.set('general', { id: 'general', name: 'כללי 🌐', hist: d.slice(-MAX_HIST), createdAt: Date.now() });
  } else if (d && d.rooms) {
    for (const [id, r] of Object.entries(d.rooms)) {
      if (r && Array.isArray(r.hist)) rooms.set(id, { id, name: String(r.name || id).slice(0, 30), hist: r.hist.slice(-MAX_HIST), createdAt: r.createdAt || Date.now() });
    }
  }
} catch {}
if (!rooms.has('general')) rooms.set('general', { id: 'general', name: 'כללי 🌐', hist: [], createdAt: Date.now() });
let histTimer = null;
function saveHist() {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    try {
      const o = { rooms: {} };
      for (const [id, r] of rooms) o.rooms[id] = { name: r.name, hist: r.hist.slice(-MAX_HIST), createdAt: r.createdAt };
      fs.writeFileSync(CHAT_FILE, JSON.stringify(o));
    } catch {}
  }, 2000);
}
const cleanRoomName = (s) => String(s || '').replace(/[\u200e\u200f\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
const validRoomName = (n) => /^[\u0590-\u05FFa-zA-Z0-9 _\-.,!?"']{2,30}$/.test(n || '');
const mkRoomId = () => 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);

// ---------- עזר ----------
const cleanName = (s) => String(s || '').replace(/[\u200e\u200f\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
const cleanContact = (s) => String(s || '').trim().slice(0, 60);
const validName = (n) => /^[\u0590-\u05FFa-zA-Z0-9 _\-.,!?'"]{2,20}$/.test(n || '');
let msgSeq = Date.now() % 100000;

// ---------- WebSocket טהור ----------
const clients = new Map(); // ws -> {name, phone, email, ip, lastMsg, joinedAt}

function wsAccept(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  return true;
}

function wsSend(sock, obj) {
  try {
    const data = Buffer.from(JSON.stringify(obj), 'utf-8');
    const len = data.length;
    let header;
    if (len < 126) header = Buffer.from([0x81, len]);
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
    else return;
    sock.write(Buffer.concat([header, data]));
  } catch {}
}

function broadcast(obj, except = null) {
  for (const ws of clients.keys()) {
    if (ws === except || ws.destroyed) continue;
    wsSend(ws, obj);
  }
}

const BOT_NAME = 'מולטי בוט 🤖';
function botEntry() {
  return { name: BOT_NAME, phone: '', email: '', about: 'עוזר הקהילה — פנו אליי עם @מולטי בוט', avatar: 'photo', presence: 'all', bot: true };
}
function roomMembers(rid) {
  return [...clients.values()].filter((c) => c.room === rid);
}
function usersList(forWs = null) {
  const me = forWs ? clients.get(forWs) : null;
  const rid = me ? me.room : 'general';
  const out = roomMembers(rid).map((c) => {
    const self = c === me;
    const hidden = c.presence === 'none' && !self;
    return {
      name: c.name,
      phone: hidden ? '' : (c.phone || ''),
      email: hidden ? '' : (c.email || ''),
      about: hidden ? '' : (c.about || ''),
      avatar: c.avatar || 'photo',
      presence: c.presence || 'all',
    };
  });
  out.unshift(botEntry());
  return out;
}
// ספריית כל המשתמשים באתר (כל החדרים)
function allUsers() {
  const seen = new Map();
  for (const c of clients.values()) {
    if (!seen.has(c.name)) seen.set(c.name, { name: c.name, about: c.about || '', avatar: c.avatar || 'photo', rooms: [] });
    seen.get(c.name).rooms.push(c.room);
  }
  const arr = [Object.assign(botEntry(), { rooms: ['general'] })];
  for (const v of seen.values()) arr.push(v);
  return arr;
}
function roomsList() {
  return [...rooms.values()].map((r) => {
    const last = r.hist.length ? r.hist[r.hist.length - 1] : null;
    return { id: r.id, name: r.name, count: roomMembers(r.id).length + 1,
      last: last ? { from: last.from, text: String(last.text || '').slice(0, 60), at: last.at, media: !!last.media } : null };
  });
}
function wsByName(name) {
  for (const [ws, c] of clients) {
    if (!ws.destroyed && c.name === name) return ws;
  }
  return null;
}
function dmRoomId(a, b) {
  const srt = [a, b].sort();
  return 'dm:' + srt[0] + '|' + srt[1];
}
function roomCast(rid, obj, except = null) {
  for (const ws of clients.keys()) {
    if (ws === except || ws.destroyed) continue;
    if (clients.get(ws)?.room === rid) wsSend(ws, obj);
  }
}
function broadcastUsers() {
  for (const ws of clients.keys()) {
    if (ws.destroyed) continue;
    const st = clients.get(ws);
    if (!st) continue;
    wsSend(ws, { t: 'users', users: usersList(ws), room: st.room, all: allUsers(), rooms: roomsList() });
  }
}
// --- 🤖 הבוט עונה (בלי הגבלת משתמש, הגנה גלובלית בלבד) ---
let botBusyUntil = 0;
const botQueue = [];
async function botAsk(roomId, text, from) {
  botQueue.push({ roomId, text: String(text || '').slice(0, 500), from });
  if (botQueue.length > 5) botQueue.shift();
  pumpBot().catch(() => {});
}
function rr2push(rid, item) {
  const rr = getRoom(rid);
  rr.hist.push(item);
  if (rr.hist.length > MAX_HIST) rr.hist = rr.hist.slice(-MAX_HIST);
  saveHist();
  roomCast(rid, { t: 'msg', ...item, room: rid });
  // 🖼️ כל מדיה של הבוט נרשמת אוטומטית לגלריה + נדחפת לשרת
  try {
    const mu = item?.media?.url;
    if (item?.from === BOT_NAME && typeof mu === 'string' && mu.startsWith('/media/')) {
      const kind = item.media.kind;
      const t = String(item.text || '');
      const type = /סטיקר|מדבקה/i.test(t) ? 'sticker'
        : kind === 'audio' ? 'voice' : kind === 'video' ? 'video'
        : /QR|ברקוד/i.test(t) ? 'qr' : 'image';
      import('./gallery-log.js').then((m) => {
        try {
          m.logCreation({ type, prompt: t.slice(0, 300), url: mu, source: 'site' });
          const fp = path.join(DIR, 'site', mu.replace(/^\/media\//, ''));
          if (!fp.includes('..')) {
            const buf = fs.readFileSync(fp);
            m.queueServerPush({ type, prompt: t.slice(0, 300), source: 'site', ext: mu.split('.').pop(), buffer: buf });
          }
        } catch {}
      }).catch(() => {});
    }
  } catch {}
}
async function pumpBot() {
  if (pumpBot.run) return;
  const job = botQueue.shift();
  if (!job) return;
  pumpBot.run = true;
  try {
    const now = Date.now();
    if (now < botBusyUntil) await new Promise((r) => setTimeout(r, botBusyUntil - now));
    roomCast(job.roomId, { t: 'typing', from: BOT_NAME, room: job.roomId });
    const r = getRoom(job.roomId);
    const histArr = (r.hist || []).slice(-12).map((h) => `${h.from}: ${h.text}`.slice(0, 220));
    let handled = false;
    try {
      handled = await siteAnswer(job, histArr);
    } catch (e) {
      console.warn('site-cmd fail:', (e && e.message || '').slice(0, 100));
    }
    if (handled) {
      botBusyUntil = Date.now() + 1500;
      return;
    }
    // תשובת AI זהה לבוט: חיפוש רשת אוטומטי + היסטוריה דו-צדדית
    let q = job.text;
    try {
      const s2 = await searchWeb(q);
      if (s2 && String(s2).trim().length > 60) q = `תוצאות חיפוש מהאינטרנט:
${String(s2).trim().slice(0, 1500)}

שאלה: ${q}`;
    } catch {}
    let answer = '';
    try {
      let prompt = `אתה מולטי בוט, עוזר קהילתי חם בעברית. ענה קצר (עד 4 משפטים).`;
      if (histArr.length) prompt += `\nשיחה אחרונה:\n${histArr.join('\n')}\n\n`;
      prompt += `${job.from} שואל: ${q}`;
      const res = await Promise.race([
        chatAI(prompt, []),
        new Promise((res) => setTimeout(() => res(null), 25000)),
      ]);
      answer = ((res && res.text) || '').trim().slice(0, 800);
    } catch {}
    if (!answer) answer = 'שמעתי 🙂 נסה לשאול שוב בעוד רגע.';
    botBusyUntil = Date.now() + 3000;
    const item = { id: `m${++msgSeq}-${Date.now().toString(36)}`, from: BOT_NAME, text: answer, at: Date.now() };
    rr2push(job.roomId, item);
  } finally {
    pumpBot.run = false;
    if (botQueue.length) pumpBot().catch(() => {});
  }
}

/* ---------- 🌉 ממסר תמונות: עבודות לבוט הוואטסאפ (Instinct) וחזרה ---------- */
const RELAY_SECRET = process.env.RELAY_SECRET || '';
const relayJobs = new Map(); // id -> {prompt, room, status:'wait'|'done'|'fail', imageUrl, at}
let relaySeq = 1;
function relayAuth(req) {
  return !!(RELAY_SECRET && String(req.headers['x-relay-secret'] || '') === RELAY_SECRET);
}
setInterval(() => {
  try {
    const cut = Date.now() - 20 * 60 * 1000;
    for (const [id, j] of relayJobs) if (!j || j.at < cut) relayJobs.delete(id);
  } catch {}
}, 60000).unref?.();
async function directImage(prompt) {
  const { buffer } = await Promise.race([
    generateImage(String(prompt || '').slice(0, 300)),
    new Promise((_, rej) => setTimeout(() => rej(new Error('img-timeout')), 120000)),
  ]);
  return buffer;
}
// המתנה לתוצאת ממסר ברקע (לא חוסם את תור הבוט) + נפילה לשרשרת ישירה
async function waitRelay(rid, jid, prompt) {
  for (let i = 0; i < 75; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const j = relayJobs.get(jid);
    if (!j) return;
    if (j.status === 'done' && j.imageUrl) {
      relayJobs.delete(jid);
      botSay(rid, `🎨 התמונה מ+16508702892: ${prompt.slice(0, 150)}`, { url: j.imageUrl, kind: 'image' });
      return;
    }
    if (j.status === 'fail') break;
  }
  relayJobs.delete(jid);
  // נפילה ליצירה ישירה (אם יש מפתחות בשרת)
  try {
    const buffer = await directImage(prompt);
    if (buffer && buffer.length > 5000) {
      botSay(rid, prompt.slice(0, 200), { url: saveSiteMedia(buffer, 'jpg'), kind: 'image' });
      return;
    }
  } catch {}
  botSay(rid, '😢 יצירת התמונה נכשלה — הבוט בוואטסאפ לא ענה וגם אין מפתח תמונות בשרת.');
}

/* ---------- 🤖 בוט האתר — כל פקודות הקבוצה (אותם מנועים כמו בוואטסאפ) ---------- */
function saveSiteMedia(buf, ext) {
  const mdir = path.join(DIR, 'site', 'media');
  try { fs.mkdirSync(mdir, { recursive: true }); } catch {}
  const fid = 'bot' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + '.' + ext;
  fs.writeFileSync(path.join(mdir, fid), buf);
  return '/media/' + fid;
}
function splitTts(text, max = 180) {
  const parts = [];
  for (const s of String(text || '').split(/(?<=[.!?;:\n])\s+/)) {
    const t = s.trim();
    if (!t) continue;
    if (t.length <= max) { parts.push(t); continue; }
    let cur = '';
    for (const w of t.split(/\s+/)) {
      if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
      else { if (cur) parts.push(cur); cur = w; }
    }
    if (cur) parts.push(cur);
  }
  return parts.filter(Boolean).slice(0, 5);
}
// 🔊 דיבור לעברית (mp3 לדפדפן — בלי צורך ב-ffmpeg)
async function ttsMp3Buffer(text) {
  const clean = String(text || '').trim().slice(0, 900);
  if (clean.length < 2) throw new Error('טקסט קצר מדי');
  const bufs = [];
  for (const p of splitTts(clean)) {
    const r = await fetch('https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=iw&q=' + encodeURIComponent(p),
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
    if (!r.ok) throw new Error('TTS ' + r.status);
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 500) throw new Error('TTS ריק');
    bufs.push(b);
  }
  if (!bufs.length) throw new Error('TTS נכשל');
  return Buffer.concat(bufs);
}
async function ttsMp3Url(text) {
  return saveSiteMedia(await ttsMp3Buffer(text), 'mp3');
}
const SITE_HELP = `🤖 *מולטי בוט — כל הפקודות (כמו בקבוצת וואטסאפ!)*

כתוב עם ! בהתחלה, או תייג @מולטי בוט, או פשוט כתוב חופשי — אני מבין לבד.

🎨 *יצירה:* תמונה · סטיקר (תיאור) · דבר (הקראה בקול)
🎵 *מדיה:* שיר · וידאו · תמונות
🌤️ *מידע חי:* מזג · חדשות · דולר · ביטקוין · שבת · מניה · מדד · קצר · רעידת-אדמה · זיהום-אוויר · תרגם
😂 *כיף:* בדיחה · חידה · עובדה · מוטיבציה · סיפור · מתכון · אימון · טיפ · ברכה · אימייל · סיכום · שכתוב · קוד · רעיון · חלום · מזל · מילון · מדינה
🎲 *מהיר:* קוביה · מטבע · בחר · הגרלה · סיסמה · מספר · צבע · תאריך · שעה · עד
🐶 *חיות:* כלב · חתול · שועל
🛒 *קניות:* קנה · 🔳 *ברקוד:* qr
💬 *צ'אט:* סכם-צאט · עזרה · מצב · או פשוט שאל כל שאלה!

🎤 *טיפ:* שלח הקלטה קולית — אתמלל ואענה!
📞 *טיפ 2:* לחץ 📞 לשיחה קולית חיה בעברית.
🎮 *משחקים:* טריוויה · איקס-עיגול (!xo מספר) · מילים-מעורבבות · אמת-או-חובה
📊 *קבוצה:* סקר (שאלה | א | ב · הצבעה במספר) · תורנות · תזכורת · נקודות · טופ`;
function siteUsage(cmd) {
  const U = {
    'תמונה': '🎨 תאר מה ליצור. דוגמה: !תמונה חתול אסטרונאוט',
    'שיר': '🎵 כתוב שם שיר + זמר. דוגמה: !שיר עומר אדם',
    'וידאו': '🎬 כתוב נושא. דוגמה: !וידאו איך מכינים חומוס',
    'דבר': '🔊 כתוב טקסט להקראה. דוגמה: !דבר שלום לכולם',
    'תמונות': '🖼️ כתוב נושא לחיפוש תמונות אמיתיות.',
    'תרגם': '🌍 כתוב טקסט לתרגום (עברית↔אנגלית).',
    'מזג': '🌤️ כתוב עיר. דוגמה: !מזג תל אביב',
    'qr': '🔳 כתוב טקסט/קישור לברקוד.',
    'שבת': '🕯️ עיר אופציונלית. דוגמה: !שבת ירושלים',
    'מניה': '📈 סימול, למשל: !מניה AAPL',
    'מדד': '📊 זהב / נפט / נסדאק / s&p (ריק = TA-35 + S&P500)',
    'קצר': '🔗 הדבק קישור ארוך לקיצור.',
    'סיפור': '📖 כתוב נושא לסיפור.',
    'מתכון': '🍳 כתוב שם מנה.',
    'ברכה': '💌 כתוב לאיזה אירוע.',
    'אימייל': '📧 כתוב נושא למייל.',
    'סיכום': '📝 הדבק טקסט לסיכום.',
    'שכתוב': '✍️ הדבק טקסט לניסוח מחדש.',
    'קוד': '💻 תאר מה לתכנת.',
    'רעיון': '🌟 כתוב נושא.',
    'חלום': '🌙 תאר חלום.',
    'מזל': '🔮 כתוב מזל (אריה, בתולה...).',
    'מילון': '📖 כתוב מילה.',
    'מדינה': '🌍 כתוב שם מדינה.',
    'בחר': '🎲 כתוב אפשרויות עם | ביניהן.',
    'הגרלה': '🎲 כתוב שמות מופרדים בפסיק.',
    'סיסמה': '🔑 אורך אופציונלי (ברירת מחדל 12).',
    'מספר': '🔢 אופציונלי: מינימום מקסימום.',
    'שעה': '🕐 עיר (ירושלים, לונדון, ניו יורק...).',
    'עד': '⏳ תאריך, למשל: !עד 25.12.2026',
    'קוביה': '🎲 מספר פאות אופציונלי.',
    'קנה': '🛒 כתוב מוצר לחיפוש באליאקספרס.',
    'סטיקר': '⭐ תאר סטיקר ליצירה.',
  };
  return U[cmd] || null;
}
// מחזיר true אם ענה (גם אם רק הסבר שימוש)
async function siteAnswer(job, histArr) {
  let t = String(job.text || '').trim().slice(0, 500);
  if (!t) return false;
  t = t.replace(/^!\s*/, '').replace(/^@מולטי בוט\s*/, '').trim();
  if (!t) return false;
  try { t = normalizeNaturalCommand(t) || t; } catch {}
  let line = t;
  const first = (t.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
  if (!KNOWN_FIRST.has(first) && t.length <= 300) {
    try {
      line = await Promise.race([
        aiRouteCommand(t, histArr || []),
        new Promise((res) => setTimeout(() => res(t), 20000)),
      ]) || t;
    } catch { line = t; }
  }
  const sp = line.indexOf(' ');
  const cmd = (sp === -1 ? line : line.slice(0, sp)).trim();
  const q = (sp === -1 ? '' : line.slice(sp + 1)).trim().slice(0, 500);
  const say = (text, media) => {
    rr2push(job.roomId, {
      id: `m${++msgSeq}-${Date.now().toString(36)}`, from: BOT_NAME,
      text: String(text || '').slice(0, 2000), at: Date.now(), ...(media ? { media } : {}),
    });
  };
  const needQ = () => {
    const u = siteUsage(cmd);
    say(u || '❓ חסר טקסט. כתוב !עזרה לרשימת הפקודות.');
    return true;
  };
  const aiRace = (p) => Promise.race([chatAI(p, []), new Promise((res) => setTimeout(() => res(null), 25000))]);
  try {
    // 🎨 תמונה — קודם דרך בוט הוואטסאפ (+16508702892), נפילה לישיר
    if (['תמונה', 'צייר', 'ציור', 'תצייר', 'image', 'draw'].includes(cmd)) {
      if (q.length < 2) return needQ();
      const prompt = q.slice(0, 300);
      if (RELAY_SECRET) {
        const waiting = [...relayJobs.values()].filter((j) => j && j.status === 'wait').length;
        if (waiting < 3) {
          const jid = 'rj' + (relaySeq++) + Date.now().toString(36);
          relayJobs.set(jid, { prompt, room: job.roomId, status: 'wait', imageUrl: '', at: Date.now() });
          say('🎨 נשלח לבוט הוואטסאפ (+16508702892) — אחזיר את התמונה לכאן כשמוכנה ⏳');
          waitRelay(job.roomId, jid, prompt).catch(() => {});
          return true;
        }
      }
      try {
        const buffer = await directImage(prompt);
        if (buffer && buffer.length > 5000) {
          say(prompt.slice(0, 200), { url: saveSiteMedia(buffer, 'jpg'), kind: 'image' });
        } else say('😢 יצירת התמונה נכשלה — נסה תיאור אחר.');
      } catch { say('😢 יצירת התמונה נכשלה כרגע.'); }
      return true;
    }
    // ⭐ סטיקר מתיאור
    if (['סטיקר', 'מדבקה', 'sticker'].includes(cmd)) {
      if (q.length < 2) return needQ();
      try {
        const { generateStickerImage } = await import('./ai-image.js');
        const { buffer } = await Promise.race([
          generateStickerImage(q.slice(0, 200)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('img-timeout')), 120000)),
        ]);
        if (buffer && buffer.length > 3000) say('⭐ הסטיקר שלך:', { url: saveSiteMedia(buffer, 'png'), kind: 'image' });
        else say('😢 יצירת הסטיקר נכשלה — נסה תיאור אחר.');
      } catch { say('😢 יצירת הסטיקר נכשלה כרגע.'); }
      return true;
    }
    // 🎵🎬 שיר / וידאו
    if (['שיר', 'מוזיקה', 'נגן', 'song', 'music'].includes(cmd)) {
      if (q.length < 2) return needQ();
      const res = await searchYouTube(q, 3);
      say(formatMediaResults(res, '🎵'));
      return true;
    }
    if (['וידאו', 'סרטון', 'סרטונים', 'יוטיוב', 'video'].includes(cmd)) {
      if (q.length < 2) return needQ();
      const res = await searchYouTube(q, 3);
      say(formatMediaResults(res, '🎬'));
      return true;
    }
    // 🔊 דיבור
    if (['דבר', 'קול', 'קריין', 'תקריא', 'say', 'speak'].includes(cmd)) {
      if (q.length < 2) return needQ();
      try {
        const url = await ttsMp3Url(q);
        say('🔊 ' + q.slice(0, 200), { url, kind: 'audio' });
      } catch { say('😢 ההקראה נכשלה כרגע — נסה טקסט קצר יותר.'); }
      return true;
    }
    // 🖼️ תמונות אמיתיות
    if (['תמונות', 'images'].includes(cmd)) {
      if (q.length < 2) return needQ();
      const imgs = await searchImages(q, 3);
      if (!imgs.length) { say('😢 לא מצאתי תמונות — נסה ניסוח אחר.'); return true; }
      say('🖼️ *מצאתי:* ' + imgs.map((r) => r.page || r.url).join('\n'), { url: imgs[0].url, kind: 'image' });
      return true;
    }
    // 🌍 תרגום
    if (['תרגם', 'תרגום', 'translate'].includes(cmd)) {
      if (q.length < 2) return needQ();
      say(await translateText(q));
      return true;
    }
    // 🌤️ מזג
    if (['מזג', 'מזגאוויר', 'weather'].includes(cmd)) {
      if (q.length < 2) return needQ();
      try { say(await getWeather(q)); } catch (e) { say('😢 ' + (e.message || 'שגיאה').slice(0, 200)); }
      return true;
    }
    if (cmd === 'חדשות' || cmd === 'news') { say(await newsHe(5)); return true; }
    if (['דולר', 'מטבע-חוץ', 'יורו'].includes(cmd)) { say(await currencyRates()); return true; }
    if (['ביטקוין', 'קריפטו', 'bitcoin', 'crypto'].includes(cmd)) { say(await cryptoPrices()); return true; }
    if (cmd === 'שבת' || cmd === 'כניסת-שבת' || cmd === 'זמני-שבת') { say(await shabbatTimes(q || 'ירושלים')); return true; }
    if (['מניה', 'מניות', 'stock'].includes(cmd)) {
      if (q.length < 1) return needQ();
      say(await stockPrice(resolveIndexSymbol(q) || q));
      return true;
    }
    if (['מדד', 'מדדים', 'index'].includes(cmd)) { say(await stockPrice(resolveIndexSymbol(q || 'TA-35') || 'TA-35')); return true; }
    if (['קצר', 'קיצור', 'קצר-קישור', 'short'].includes(cmd)) {
      if (q.length < 4) return needQ();
      say(await shortenUrl(q));
      return true;
    }
    if (['רעידת-אדמה', 'רעידות'].includes(cmd)) { say(await earthquakes(q)); return true; }
    if (['זיהום-אוויר', 'זיהום', 'AQI'].includes(cmd)) { say(await airQuality(q)); return true; }
    // 🔳 ברקוד
    if (['qr', 'ברקוד', 'קיואר'].includes(cmd)) {
      if (q.length < 1) return needQ();
      try {
        const { default: QRCode } = await import('qrcode');
        const buf = await QRCode.toBuffer(q.slice(0, 500), { width: 600, margin: 2 });
        say('🔳 הברקוד שלך:', { url: saveSiteMedia(buf, 'png'), kind: 'image' });
      } catch { say('😢 יצירת הברקוד נכשלה.'); }
      return true;
    }
    // 🎲 מהיר (סינכרוני)
    if (cmd === 'קוביה') { say(dice(Math.min(1000, Math.max(2, parseInt(q) || 6)))); return true; }
    if (cmd === 'מטבע') { say(coin()); return true; }
    if (cmd === 'בחר' || cmd === 'הגרלה') {
      if (q.length < 2) return needQ();
      say(pickOne(q));
      return true;
    }
    if (cmd === 'סיסמה') { say(genPassword(Math.min(64, Math.max(4, parseInt(q) || 12)))); return true; }
    if (cmd === 'מספר') {
      const nums = (q.match(/-?\d+/g) || []).map(Number);
      say(nums.length >= 2 ? randNum(nums[0], nums[1]) : randNum());
      return true;
    }
    if (cmd === 'צבע') { say(randColor()); return true; }
    if (cmd === 'תאריך') { say(dateHe()); return true; }
    if (cmd === 'שעה') { say(cityTime(q || 'ירושלים')); return true; }
    if (cmd === 'עד') {
      if (q.length < 4) return needQ();
      say(countdown(q));
      return true;
    }
    // 🐶 חיות
    if (['כלב', 'dog'].includes(cmd) || ['חתול', 'cat'].includes(cmd) || ['שועל', 'fox'].includes(cmd)) {
      const kind = ['כלב', 'dog'].includes(cmd) ? 'dog' : (['חתול', 'cat'].includes(cmd) ? 'cat' : 'fox');
      try {
        const { imageUrl, caption } = await animalImage(kind);
        say('🐶 ' + caption, { url: imageUrl, kind: 'image' });
      } catch { say('😢 לא מצאתי תמונה כרגע.'); }
      return true;
    }
    // 🛒 קניות
    if (['קנה', 'קניות', 'קנייה', 'קני', 'aliexpress', 'ali'].includes(cmd)) {
      if (q.length < 2) return needQ();
      try {
        const items = await searchProducts(q, 5);
        say('🛒 *מצאתי באליאקספרס:*\n\n' + items.map((p, i) =>
          `${i + 1}. *${p.title}*\n💰 ${p.price}\n🔗 ${affiliateUrl(p.url)}`).join('\n\n'));
      } catch (e) { say('😢 ' + (e.message || 'החיפוש נכשל').slice(0, 200)); }
      return true;
    }
    // 💬 סיכום צ'אט החדר
    if (cmd === 'סכם-צאט' || cmd === 'סיכום-יום' || cmd === 'יומן-יום') {
      const lines = (getRoom(job.roomId).hist || []).slice(-50).map((h) => `${h.from}: ${(h.text || '').slice(0, 200)}`).filter((s) => s.length > 3);
      if (lines.length < 3) { say('אין מספיק הודעות לסיכום עדיין 🙂'); return true; }
      const res = await aiRace(`סכם בעברית ב-5 נקודות את השיחה הבאה:\n${lines.join('\n').slice(0, 3000)}`);
      say(((res && res.text) || 'לא הצלחתי לסכם כרגע.').trim().slice(0, 1500));
      return true;
    }
    // 📖 עזרה / מצב
    if (['עזרה', 'מדריך', 'תפריט', 'help'].includes(cmd)) { say(SITE_HELP); return true; }
    if (['מצב', 'status'].includes(cmd)) {
      const { config } = await import('./config.js');
      say(`🤖 *מצב מנועים:*\nOpenAI=${config.OPENAI_API_KEY ? 'ON' : 'off'} · Groq=${config.GROQ_API_KEY ? 'ON' : 'off'} · Gemini=${config.GEMINI_API_KEY ? 'ON' : 'off'} · Pollinations=ON ✅\n\nכתוב !עזרה לרשימת הפקודות.`);
      return true;
    }
    if (['שאל', 'ai', 'gpt', "צ'אט", 'בוט'].includes(cmd)) {
      if (q.length < 2) return needQ();
      job.text = q;
      return false; // לצ'אט הרגיל
    }
    // ✨ כלי AI
    const tool = resolveAiTool(cmd);
    if (tool) {
      try {
        const out = await Promise.race([
          runAiTool(tool, q),
          new Promise((_, rej) => setTimeout(() => rej(new Error('ai-timeout')), 30000)),
        ]);
        say((out || '').trim().slice(0, 1500) || 'לא הצלחתי כרגע, נסה שוב.');
      } catch (e) {
        if (e && e.message === 'EMPTY') return needQ();
        say('😢 נכשל כרגע — נסה שוב בעוד רגע.');
      }
      return true;
    }
    // 🎮 משחקי קבוצה
    if (cmd === 'טריוויה') { await cmdTrivia(job.roomId, job.from); return true; }
    if (['נקודות'].includes(cmd)) { say(`🎖️ *${job.from}:* ${meta.points[job.from] || 0} נקודות`); return true; }
    if (['טופ'].includes(cmd)) {
      const top = topPoints(5);
      say(top.length ? '🏆 *המובילים:*\n' + top.map(([n, c], i) => `${i + 1}. ${n} — ${c}`).join('\n') : '🏆 אין ניקוד עדיין — כתבו הודעות וצברו נקודות!');
      return true;
    }
    if (cmd === 'סקר') { cmdPollCreate(job.roomId, job.from, q); return true; }
    if (['סקר-תוצאות'].includes(cmd)) {
      const p = roomPolls.get(job.roomId);
      say(p ? pollText(p) : 'אין סקר פעיל. צור עם: !סקר שאלה | א | ב');
      return true;
    }
    if (['סקר-סגור'].includes(cmd)) {
      const p = roomPolls.get(job.roomId);
      if (!p) { say('אין סקר פעיל.'); return true; }
      roomPolls.delete(job.roomId);
      say('📊 *תוצאות סופיות:*\n' + pollText(p));
      return true;
    }
    if (cmd === 'תזכורת') { cmdRemind(job.roomId, job.from, q); return true; }
    if (cmd === 'תזכורות') { cmdRemList(job.roomId, job.from); return true; }
    if (['איקס-עיגול', 'xo'].includes(cmd) && !/^xo\s+\d/i.test(line)) { cmdXO(job.roomId, job.from, q); return true; }
    if (/^xo\s+\d/i.test(line)) { cmdXOMove(job.roomId, job.from, parseInt(line.match(/\d+/)[0], 10)); return true; }
    if (['אמת-או-חובה', 'truth'].includes(cmd)) {
      const kind = /חובה/.test(q) ? 'd' : (/אמת/.test(q) ? 't' : (Math.random() < 0.5 ? 't' : 'd'));
      say(kind === 't' ? `🫢 *אמת ל${job.from}:* ${TD_TRUTH[Math.floor(Math.random() * TD_TRUTH.length)]}` : `🔥 *חובה ל${job.from}:* ${TD_DARE[Math.floor(Math.random() * TD_DARE.length)]}`);
      return true;
    }
    if (['מילים-מעורבבות', 'scramble'].includes(cmd)) { cmdScramble(job.roomId, job.from); return true; }
    if (['תורנות'].includes(cmd)) {
      const r = meta.rota;
      const mm = q.match(/^(הוסף|הסר|הבא|נקה)\s*([\s\S]*)$/);
      if (mm && mm[1] === 'הוסף' && mm[2].trim()) {
        if (!r.members.includes(mm[2].trim().slice(0, 20))) r.members.push(mm[2].trim().slice(0, 20));
        saveMetaSoon(); say('📋 נוסף לתורנות ✅');
      } else if (mm && mm[1] === 'הסר' && mm[2].trim()) {
        meta.rota.members = r.members.filter((x) => x !== mm[2].trim());
        saveMetaSoon(); say('📋 הוסר מהתורנות.');
      } else if (mm && mm[1] === 'הבא') {
        if (!r.members.length) { say('אין תורנים — הוסף עם: !תורנות הוסף שם'); }
        else { r.idx = (r.idx + 1) % r.members.length; saveMetaSoon(); say(`📋 התורן הבא: *${r.members[r.idx]}*`); }
      } else if (mm && mm[1] === 'נקה') {
        meta.rota = { members: [], idx: 0 }; saveMetaSoon(); say('📋 התורנות נוקתה.');
      } else {
        say(r.members.length ? `📋 *תורנות:*\n${r.members.map((m2, i) => `${i === (r.idx % r.members.length) ? '👉 ' : ''}${m2}`).join('\n')}\n\nהוסף: !תורנות הוסף שם` : '📋 אין תורנים. הוסף עם: !תורנות הוסף שם');
      }
      return true;
    }
    // פיצ'רים שדורשים קבוצת וואטסאפ אמיתית
    if (['מלחמת-משפטים', 'מעקב', 'הסר-מעקב', 'בוקר', 'בריף', 'שערים-יומי', 'יומולדת', 'אירוע', 'אירועים', 'תמלל', 'חתוך', 'מי-שמר-אותי', 'אתר', 'אתרים', 'רקע', 'רקעים', 'תמונת-פרופיל', 'פרופיל', 'פעילות', 'יומן', 'אישיות'].includes(cmd)) {
      say('ℹ️ הפיצ׳ר הזה חי בקבוצת הוואטסאפ (משחקים, סקרים, תזכורות...).\nכאן באתר אפשר: תמונה · שיר · וידאו · דבר · מזג · חדשות · כלי AI · ועוד — כתוב !עזרה.');
      return true;
    }
  } catch (e) {
    console.warn('siteAnswer err:', (e && e.message || '').slice(0, 120));
    return false;
  }
  return false;
}

// 🎤 הודעה קולית מהאתר → תמלול → תשובת הבוט (+הקראה חוזרת)
const botVoiceQueue = [];
async function botVoice(roomId, mediaUrl, from) {
  botVoiceQueue.push({ roomId, voiceUrl: mediaUrl, from });
  pumpBotVoice().catch(() => {});
}
async function pumpBotVoice() {
  if (pumpBotVoice.run) return;
  const job = botVoiceQueue.shift();
  if (!job) return;
  pumpBotVoice.run = true;
  try {
    for (;;) {
      const job = botVoiceQueue.shift();
      if (!job) break;
      try {
        roomCast(job.roomId, { t: 'typing', from: BOT_NAME, room: job.roomId });
        const fp = path.join(DIR, 'site', String(job.voiceUrl || '').replace(/^\/media\//, ''));
        if (fp.includes('..')) continue;
        const buf = await fs.promises.readFile(fp);
        const heard = await transcribeAudio(buf.slice(0, 8 * 1024 * 1024), 'voice.webm');
        if (!heard || heard.trim().length < 2) {
          rr2push(job.roomId, { id: `m${++msgSeq}-${Date.now().toString(36)}`, from: BOT_NAME, text: '😢 לא שמעתי טוב — נסה להקליט שוב.', at: Date.now() });
          continue;
        }
        botAsk(job.roomId, heard.slice(0, 500), job.from).catch(() => {});
      } catch (e) {
        console.warn('voice fail:', (e && e.message || '').slice(0, 100));
        rr2push(job.roomId, { id: `m${++msgSeq}-${Date.now().toString(36)}`, from: BOT_NAME, text: '😢 התמלול נכשל כרגע (צריך מפתח Groq בשרת).', at: Date.now() });
      }
    }
  } finally {
    pumpBotVoice.run = false;
    if (botVoiceQueue.length) pumpBotVoice().catch(() => {});
  }
}

/* ---------- 🎮 משחקי קבוצה + ניקוד + סקרים + תזכורות ---------- */
const roomTrivia = new Map(); // rid -> {q, opts, a, endsAt, timer, by}
const roomPolls = new Map(); // rid -> {q, opts, votes:Map name->idx, by, at}
const roomScramble = new Map(); // rid -> {word, mixed, endsAt, timer, by}
const roomXO = new Map(); // rid -> {x, o, board:[9], turn, timer}
const reminders = new Map(); // id -> {to, room, text, at, timer}
let remSeq = 1;
const TRIVIA_BANK = [
  { q: 'מהי בירת ישראל?', opts: ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע'], a: 1 },
  { q: 'כמה ימים יש בשבוע?', opts: ['5', '6', '7', '8'], a: 2 },
  { q: 'מה הצבע של השמיים ביום בהיר?', opts: ['ירוק', 'אדום', 'כחול', 'צהוב'], a: 2 },
  { q: 'כמה זה 7 כפול 8?', opts: ['54', '56', '63', '48'], a: 1 },
  { q: 'איזה חג חוגגים עם סופגניות?', opts: ['פסח', 'סוכות', 'חנוכה', 'פורים'], a: 2 },
];
const HEB_LETTERS = ['א', 'ב', 'ג', 'ד'];
function botSay(rid, text, media) {
  rr2push(rid, { id: `m${++msgSeq}-${Date.now().toString(36)}`, from: BOT_NAME, text: String(text || '').slice(0, 2000), at: Date.now(), ...(media ? { media } : {}) });
}
function triviaText(t) {
  return `🎯 *טריוויה!* (5 נקודות, 90 שניות)\n\n❓ ${t.q}\n\n` +
    t.opts.map((o, i) => `${HEB_LETTERS[i]}. ${o}`).join('\n') +
    `\n\nענו באות (א/ב/ג/ד) או מספר (1-4) — גם בלי !`;
}
async function cmdTrivia(rid, by) {
  if (roomTrivia.has(rid)) { botSay(rid, '🎯 כבר רצה טריוויה — ענו עליה קודם!'); return; }
  let t = null;
  try {
    const { text } = await Promise.race([
      chatAI('כתוב שאלת טריוויה בעברית עם 4 אפשרויות. החזר JSON בלבד: {"q":"...","opts":["...","...","...","..."],"a":0}. המספר a הוא אינדקס התשובה הנכונה (0-3).', []),
      new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 20000)),
    ]);
    const j = JSON.parse((String(text || '').match(/\{[\s\S]*\}/) || [])[0] || 'null');
    if (j && j.q && Array.isArray(j.opts) && j.opts.length === 4 && j.a >= 0 && j.a <= 3) t = j;
  } catch {}
  if (!t) t = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
  const rec = { ...t, endsAt: Date.now() + 90000, by, timer: null };
  rec.timer = setTimeout(() => {
    roomTrivia.delete(rid);
    botSay(rid, `⏰ הזמן עבר! התשובה: *${HEB_LETTERS[t.a]}. ${t.opts[t.a]}*`);
  }, 90000);
  if (rec.timer.unref) rec.timer.unref();
  roomTrivia.set(rid, rec);
  botSay(rid, triviaText(t));
}
function cmdPollCreate(rid, by, q) {
  const parts = String(q || '').split('|').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) {
    botSay(rid, '📊 שימוש: !סקר שאלה | אפשרות1 | אפשרות2 ...\nדוגמה: !סקר איפה נפגשים? | פארק | קניון | ים\n(מצביעים במספר האפשרות, בלי !)');
    return;
  }
  const [qq, ...opts] = parts;
  if (opts.length > 9) opts.length = 9;
  roomPolls.set(rid, { q: qq.slice(0, 200), opts: opts.map((o) => o.slice(0, 60)), votes: new Map(), by, at: Date.now() });
  botSay(rid, pollText(roomPolls.get(rid)));
}
function pollText(p) {
  const counts = p.opts.map((_, i) => [...p.votes.values()].filter((v) => v === i).length);
  const total = p.votes.size;
  let out = `📊 *${p.q}*\n\n`;
  p.opts.forEach((o, i) => {
    const c = counts[i];
    const pct = total ? Math.round((c / total) * 100) : 0;
    out += `${i + 1}. ${o} — ${c} קולות (${pct}%)\n`;
  });
  out += `\n🗳️ ${total} מצביעים · הצבעה: שלחו את המספר (בלי !) · !סקר-תוצאות · !סקר-סגור`;
  return out;
}
function cmdRemind(rid, by, q) {
  const m = String(q || '').trim().match(/^(\d{1,4}|[0-2]?\d:[0-5]\d)\s+([\s\S]{2,200})$/);
  if (!m) {
    botSay(rid, '⏰ שימוש: !תזכורת דקות טקסט · !תזכורת 18:30 טקסט\nדוגמה: !תזכורת 30 להוציא עוף');
    return;
  }
  let at = 0;
  if (/^\d{1,4}$/.test(m[1])) {
    const mins = Math.min(1440, Math.max(1, parseInt(m[1], 10)));
    at = Date.now() + mins * 60000;
  } else {
    const [hh, mm] = m[1].split(':').map(Number);
    const d = new Date();
    d.setHours(hh, mm, 0, 0);
    at = d.getTime() <= Date.now() ? d.getTime() + 86400000 : d.getTime();
  }
  const id = remSeq++;
  const delay = Math.min(at - Date.now(), 2147483647);
  const timer = setTimeout(() => {
    reminders.delete(id);
    botSay(rid, `⏰ *תזכורת ל${by}:* ${m[2]}`);
  }, Math.max(1000, delay));
  if (timer.unref) timer.unref();
  reminders.set(id, { to: by, room: rid, text: m[2], at, timer });
  botSay(rid, `⏰ נרשם! אזכיר לך "${m[2].slice(0, 80)}" ב־${new Date(at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
}
function cmdRemList(rid, by) {
  const mine = [...reminders.entries()].filter(([, r]) => r.room === rid && r.to === by);
  if (!mine.length) { botSay(rid, '⏰ אין לך תזכורות פעילות בחדר הזה.'); return; }
  botSay(rid, '⏰ *התזכורות שלך:*\n' + mine.map(([id, r]) =>
    `• ${r.text.slice(0, 80)} — ${new Date(r.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`).join('\n'));
}
const XO_WIN = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function xoText(g) {
  const c = g.board.map((v, i) => v || (i + 1));
  return `🎮 *איקס-עיגול:* ❌ ${g.x} נגד ⭕ ${g.o || '...'} — תור: ${g.turn}\n\n` +
    `${c[0]} | ${c[1]} | ${c[2]}\n${c[3]} | ${c[4]} | ${c[5]}\n${c[6]} | ${c[7]} | ${c[8]}\n\nמהלך: !xo מספר (1-9)`;
}
function xoWinner(b) {
  for (const [a, c, d] of XO_WIN) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? 'תיקו' : null;
}
function cmdXO(rid, by, q) {
  const g = roomXO.get(rid);
  if (/ביטול/.test(q)) {
    if (g) { roomXO.delete(rid); botSay(rid, '🎮 המשחק בוטל.'); }
    else botSay(rid, 'אין משחק פעיל.');
    return;
  }
  if (!g) {
    roomXO.set(rid, { x: by, o: null, board: Array(9).fill(''), turn: by });
    botSay(rid, `🎮 ${by} פתח משחק! יריב כותב !איקס-עיגול להצטרפות (⭕).\n(ביטול: !איקס-עיגול ביטול)`);
    return;
  }
  if (g.x !== by && !g.o) {
    g.o = by;
    botSay(rid, xoText(g));
    return;
  }
  botSay(rid, '🎮 משחק ήδη רץ — מהלך עם !xo מספר.');
}
function cmdXOMove(rid, by, n) {
  const g = roomXO.get(rid);
  if (!g) { botSay(rid, 'אין משחק פעיל. פתח עם !איקס-עיגול'); return; }
  if (!g.o) { botSay(rid, 'מחכים ליריב שיצטרף עם !איקס-עיגול'); return; }
  if (by !== g.turn) { botSay(rid, `לא תורך! תור: ${g.turn}`); return; }
  const i = n - 1;
  if (!(i >= 0 && i < 9) || g.board[i]) { botSay(rid, 'תא תפוס או לא תקין — בחר 1-9 פנוי.'); return; }
  g.board[i] = (by === g.x) ? 'X' : 'O';
  const w = xoWinner(g.board);
  if (w === 'תיקו') { roomXO.delete(rid); botSay(rid, xoText(g) + '\n\n🤝 תיקו!'); return; }
  if (w) {
    const winner = w === 'X' ? g.x : g.o;
    roomXO.delete(rid);
    addPoints(winner, 10);
    botSay(rid, xoText(g) + `\n\n🏆 *${winner} ניצח/ה!* (+10 נקודות)`);
    return;
  }
  g.turn = (by === g.x) ? g.o : g.x;
  botSay(rid, xoText(g));
}
const TD_TRUTH = ['מה הסוד הכי מצחיק שלך?', 'מה המאכל שאתה הכי אוהב?', 'מה החלום הכי מוזר שהיה לך?', 'איזו מתנה הכי שימחה אותך?', 'מה אתה עושה כשמשעמם לך?', 'איזה שיר אתה שר במקלחת?', 'מה הפחד הכי טיפשי שלך?', 'ספר על חבר ילדות.'];
const TD_DARE = ['שלח תמונה של הנוף מהחלון.', 'כתוב משפט עם 3 חרוזים.', 'ספר בדיחה עכשיו.', 'תאר את היום שלך באימוג׳ים בלבד.', 'כתוב מחמאה למישהו בחדר.', 'ספור עד 20 בקול רם.', 'צייר לב ושלח תמונה.', 'כתוב את שם החדר הפוך.'];
const SCRAMBLE_WORDS = ['שלום', 'מחשב', 'טלפון', 'שמש', 'ירח', 'כדורגל', 'מוזיקה', 'ספר', 'חתול', 'כלב', 'פרח', 'עץ'];
function scrambleW(w) {
  const a = [...w];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a.join('');
}
function cmdScramble(rid, by) {
  if (roomScramble.has(rid)) { botSay(rid, '🧩 כבר יש מילה פעילה — נחשו אותה!'); return; }
  const word = SCRAMBLE_WORDS[Math.floor(Math.random() * SCRAMBLE_WORDS.length)];
  let mixed = scrambleW(word);
  if (mixed === word) mixed = scrambleW(word);
  const rec = { word, endsAt: Date.now() + 300000, by, timer: null };
  rec.timer = setTimeout(() => { roomScramble.delete(rid); botSay(rid, `⏰ הזמן עבר! המילה הייתה: *${word}*`); }, 300000);
  if (rec.timer.unref) rec.timer.unref();
  roomScramble.set(rid, rec);
  botSay(rid, `🧩 *מילים מעורבבות!* (3 נקודות)\n\nפענחו: *${mixed}*\nענו בלי ! — הראשון/ה מנצח/ת (5 דקות)`);
}
// קלט חופשי במשחקים (אותיות טריוויה, הצבעות, ניחושים) — true = טופל, לא להעביר לבוט
function roomGameInput(rid, name, txt) {
  const t = String(txt || '').trim();
  if (!t || name === BOT_NAME) return false;
  const tr = roomTrivia.get(rid);
  if (tr && Date.now() < tr.endsAt) {
    let idx = -1;
    const m1 = t.match(/^[א-ד]$/), m2 = t.match(/^[1-4]$/);
    if (m1) idx = HEB_LETTERS.indexOf(m1[0]);
    else if (m2) idx = parseInt(m2[0], 10) - 1;
    if (idx >= 0) {
      if (idx === tr.a) {
        clearTimeout(tr.timer);
        roomTrivia.delete(rid);
        addPoints(name, 5);
        botSay(rid, `🎉 *נכון, ${name}!* התשובה: ${HEB_LETTERS[tr.a]}. ${tr.opts[tr.a]} (+5 נקודות)`);
      }
      return true;
    }
  }
  const p = roomPolls.get(rid);
  if (p) {
    const m = t.match(/^[1-9]$/);
    if (m) {
      const i = parseInt(m[0], 10) - 1;
      if (i < p.opts.length) {
        p.votes.set(name, i);
        botSay(rid, pollText(p));
      }
      return true;
    }
  }
  const sc = roomScramble.get(rid);
  if (sc && Date.now() < sc.endsAt && t.length >= 2 && t.length <= 20 && !t.startsWith('!') && !t.includes(' ')) {
    if (t === sc.word) {
      clearTimeout(sc.timer);
      roomScramble.delete(rid);
      addPoints(name, 3);
      botSay(rid, `🎉 *כל הכבוד ${name}!* פענחת: ${sc.word} (+3 נקודות)`);
    }
    return true;
  }
  return false;
}

function statusPub(x) {
  return { id: x.id, from: x.from, kind: x.kind, text: x.text, img: x.img, bg: x.bg, at: x.at, views: (x.views || []).length };
}
function broadcastAll(obj, except = null) {
  for (const ws of clients.keys()) {
    if (ws === except || ws.destroyed) continue;
    wsSend(ws, obj);
  }
}
function handleFrame(ws, state, text) {
  let m;
  try { m = JSON.parse(text); } catch { return; }
  if (!m || typeof m !== 'object') return;
  const st = clients.get(ws);
  const RH = () => getRoom(st.room).hist;
  if (m.t === 'join') {
    if (st) return;
    const name = cleanName(m.name);
    if (!validName(name)) { wsSend(ws, { t: 'err', msg: 'שם לא תקין (2-20 תווים: עברית/אנגלית/ספרות)' }); return; }
    if (name.includes('מולטי בוט')) { wsSend(ws, { t: 'err', msg: 'השם הזה שמור לבוט 🤖' }); return; }
    const mode = m.mode === 'register' ? 'register' : 'login';
    const pass = String(m.pass || '');
    const token = String(m.token || '');
    const acc = accounts.users[name];
    if (token) {
      // התחברות אוטומטית עם טוקן שמור
      const rec = accounts.tokens[token];
      if (!rec || rec.name !== name) { wsSend(ws, { t: 'err', msg: 'ההתחברות פגה — התחבר שוב עם סיסמה' }); return; }
      rec.at = Date.now();
    } else if (mode === 'register') {
      if (acc) { wsSend(ws, { t: 'err', msg: 'השם תפוס — בחר שם אחר או התחבר לחשבון' }); return; }
      if (!validPass(pass)) { wsSend(ws, { t: 'err', msg: 'סיסמה חייבת 4 תווים לפחות' }); return; }
      accounts.users[name] = { pass: hashPass(pass, crypto.randomBytes(16).toString('hex')), createdAt: Date.now() };
    } else {
      if (!acc) { wsSend(ws, { t: 'err', msg: 'אין חשבון כזה — צור חשבון חדש' }); return; }
      if (loginBlocked(state.ip)) { wsSend(ws, { t: 'err', msg: 'יותר מדי ניסיונות — נסה בעוד כמה דקות' }); return; }
      if (!checkPass(pass, acc.pass)) { loginFail(state.ip); wsSend(ws, { t: 'err', msg: 'סיסמה שגויה' }); return; }
    }
    // טוקן חדש להתחברות אוטומטית הבאה + ניקוי ישנים
    const myToken = newToken();
    accounts.tokens[myToken] = { name, at: Date.now() };
    try {
      const mine = Object.entries(accounts.tokens).filter(([, r]) => r && r.name === name).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
      for (const [tk] of mine.slice(5)) delete accounts.tokens[tk];
      const cut = Date.now() - 90 * 24 * 3600 * 1000;
      for (const [tk, r] of Object.entries(accounts.tokens)) if (!r || (r.at || 0) < cut) delete accounts.tokens[tk];
    } catch {}
    saveAccounts();
    // אותו חשבון מחיבור אחר — החדש מחליף את הישן
    for (const [w, c] of clients) {
      if (c.name === name) { try { w.destroy(); } catch {} clients.delete(w); break; }
    }
    const rid = (m.room && rooms.has(m.room)) ? m.room : 'general';
    const avRaw = String(m.avatar || 'photo');
    const avatar = (['photo', 'init', 'none'].includes(avRaw) || (avRaw.startsWith('/media/') && avRaw.length < 140)) ? avRaw : 'photo';
    const about = cleanContact(m.about).slice(0, 80);
    clients.set(ws, {
      name, phone: cleanContact(m.phone), email: cleanContact(m.email),
      avatar, about, presence: 'all', room: rid,
      ip: state.ip, lastMsg: 0, joinedAt: Date.now(),
    });
    wsSend(ws, { t: 'ok', you: name, token: myToken, users: usersList(ws), room: rid, rooms: roomsList(), all: allUsers() });
    wsSend(ws, { t: 'hist', items: getRoom(rid).hist.slice(-50) });
    if (meta.pins[rid]) wsSend(ws, { t: 'pin', ...meta.pins[rid] });
    broadcastUsers();
    return;
  }
  if (!st) { wsSend(ws, { t: 'err', msg: 'קודם מצטרפים עם שם' }); return; }
  if (m.t === 'rooms') {
    wsSend(ws, { t: 'rooms', rooms: roomsList(), all: allUsers() });
    return;
  }
  if (m.t === 'create') {
    const nm = cleanRoomName(m.name);
    if (!validRoomName(nm)) { wsSend(ws, { t: 'err', msg: 'שם קבוצה לא תקין (2-30 תווים)' }); return; }
    const id = mkRoomId();
    rooms.set(id, { id, name: nm, hist: [], createdAt: Date.now() });
    saveHist();
    st.room = id;
    wsSend(ws, { t: 'room', room: { id, name: nm }, rooms: roomsList() });
    wsSend(ws, { t: 'hist', items: [] });
    wsSend(ws, { t: 'users', users: usersList(ws), room: id, all: allUsers(), rooms: roomsList() });
    broadcastUsers();
    return;
  }
  if (m.t === 'dm') {
    const to = cleanName(m.to);
    if (!to || to === st.name) { wsSend(ws, { t: 'err', msg: 'בחר חבר לצ\'אט אישי' }); return; }
    const target = wsByName(to);
    if (!target) { wsSend(ws, { t: 'err', msg: 'המשתמש לא מחובר כרגע' }); return; }
    const id = dmRoomId(st.name, to);
    if (!rooms.has(id)) {
      rooms.set(id, { id, name: '🔒 ' + to, hist: [], createdAt: Date.now(), dm: [st.name, to] });
      saveHist();
    }
    st.room = id;
    const r = getRoom(id);
    wsSend(ws, { t: 'room', room: { id: r.id, name: r.name, dm: true }, rooms: roomsList() });
    wsSend(ws, { t: 'hist', items: r.hist.slice(-50) });
    if (meta.pins[id]) wsSend(ws, { t: 'pin', ...meta.pins[id] });
    else wsSend(ws, { t: 'unpin' });
    broadcastUsers();
    return;
  }
  if (m.t === 'join-room') {
    if (!m.id || !rooms.has(m.id)) { wsSend(ws, { t: 'err', msg: 'הקבוצה לא נמצאה' }); return; }
    st.room = m.id;
    const r = getRoom(m.id);
    wsSend(ws, { t: 'room', room: { id: r.id, name: r.name }, rooms: roomsList() });
    wsSend(ws, { t: 'hist', items: r.hist.slice(-50) });
    if (meta.pins[m.id]) wsSend(ws, { t: 'pin', ...meta.pins[m.id] });
    else wsSend(ws, { t: 'unpin' });
    broadcastUsers();
    return;
  }
  if (m.t === 'ask') {
    const txt = String(m.text || '').trim().slice(0, 500);
    if (!txt) return;
    botAsk(st.room, txt, st.name).catch(() => {});
    return;
  }
  if (m.t === 'msg') {
    const now = Date.now();
    if (now - st.lastMsg < 1500) { wsSend(ws, { t: 'err', msg: 'לאט לאט 🙂 (הודעה כל 1.5 שניות)' }); return; }
    const txt = String(m.text || '').replace(/[\u200e\u200f\u200b-\u200d\ufeff]/g, '').trim().slice(0, 500);
    let media = null;
    if (m.media && typeof m.media.url === 'string' && m.media.url.startsWith('/media/')) {
      media = { url: m.media.url.slice(0, 120), kind: ['image', 'video', 'audio', 'file'].includes(m.media.kind) ? m.media.kind : 'file', dur: Math.min(600, Math.max(0, Number(m.media.dur) || 0)) };
    }
    if (!txt && !media) return;
    st.lastMsg = now;
    const expH = [24, 168, 2160].includes(Number(m.exp)) ? Number(m.exp) : 0;
    const item = { id: `m${++msgSeq}-${now.toString(36)}`, from: st.name, text: txt, at: now };
    if (media) item.media = media;
    if (m.reply && typeof m.reply.id === 'string') {
      item.reply = { id: String(m.reply.id).slice(0, 40), from: cleanName(m.reply.from).slice(0, 20), text: String(m.reply.text || '').slice(0, 120) };
    }
    if (expH) item.expAt = now + expH * 3600 * 1000;
    const rr = getRoom(st.room);
    rr.hist.push(item);
    if (rr.hist.length > MAX_HIST) rr.hist = rr.hist.slice(-MAX_HIST);
    saveHist();
    roomCast(st.room, { t: 'msg', ...item, room: st.room });
    if (media && media.kind === 'audio' && media.url) {
      botVoice(st.room, media.url, st.name).catch(() => {});
      return;
    }
    addPoint(st.name);
    if (txt && roomGameInput(st.room, st.name, txt)) return;
    if (txt.includes('מולטי בוט') || txt.startsWith('!')) {
      botAsk(st.room, txt.replace(/^!/, '').trim() || txt, st.name).catch(() => {});
    }
    return;
  }
  if (m.t === 'presence') {
    st.presence = (m.mode === 'none') ? 'none' : 'all';
    broadcastUsers();
    return;
  }
  if (m.t === 'profile') {
    if (m.phone !== undefined) st.phone = cleanContact(m.phone);
    if (m.email !== undefined) st.email = cleanContact(m.email);
    if (m.about !== undefined) st.about = cleanContact(m.about).slice(0, 80);
    if (typeof m.avatar === 'string' && (['photo', 'init', 'none'].includes(m.avatar) || (m.avatar.startsWith('/media/') && m.avatar.length < 140))) st.avatar = m.avatar;
    broadcastUsers();
    return;
  }
  if (m.t === 'status-post') {
    const kind = (m.kind === 'image') ? 'image' : 'text';
    const text = String(m.text || '').trim().slice(0, 200);
    const img = kind === 'image' ? String(m.img || '').slice(0, 300) : '';
    const bg = /^#[0-9a-fA-F]{6}$/.test(m.bg || '') ? m.bg : '#00BF6D';
    if (kind === 'text' && !text) return;
    if (kind === 'image' && !img.startsWith('/media/')) return;
    const it = { id: 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), from: st.name, kind, text, img, bg, at: Date.now(), views: [] };
    statuses.push(it);
    if (statuses.length > 200) statuses = statuses.slice(-200);
    saveStatuses();
    broadcastAll({ t: 'status-new', item: statusPub(it) });
    return;
  }
  if (m.t === 'status-list') {
    wsSend(ws, { t: 'status-list', items: statuses.map(statusPub) });
    return;
  }
  if (m.t === 'status-view') {
    const it = statuses.find((x) => x.id === m.id);
    if (it && it.from !== st.name && !it.views.some((v) => v.by === st.name)) {
      it.views.push({ by: st.name, at: Date.now() });
      saveStatuses();
    }
    return;
  }
  if (m.t === 'my-status-views') {
    const mine = statuses.filter((x) => x.from === st.name);
    wsSend(ws, { t: 'my-status-views', items: mine.map((x) => ({ id: x.id, text: x.text, at: x.at, views: x.views })) });
    return;
  }
  if (m.t === 'report') {
    const target = cleanName(m.target);
    const reason = String(m.reason || '').slice(0, 200);
    if (target && target !== st.name) {
      reports.push({ by: st.name, target, reason, at: Date.now() });
      saveReports();
      wsSend(ws, { t: 'ok-report' });
    }
    return;
  }
  // --- איתות שיחות WebRTC (P2P, השרת רק מתווך) ---
  if (m.t === 'call-invite' || m.t === 'call-accept' || m.t === 'call-reject' || m.t === 'call-end' || m.t === 'rtc-offer' || m.t === 'rtc-answer' || m.t === 'rtc-ice') {
    const callId = String(m.callId || '').slice(0, 40);
    if (!callId) return;
    if (m.t === 'call-invite') {
      const kind = (m.kind === 'video') ? 'video' : 'voice';
      const targets = Array.isArray(m.to) ? m.to.slice(0, 5) : [m.to];
      let sent = 0;
      for (const tn of targets) {
        const tw = wsByName(cleanName(tn));
        if (tw && tw !== ws) { wsSend(tw, { t: 'call-invite', callId, kind, from: st.name, room: st.room }); sent++; }
      }
      wsSend(ws, { t: 'call-invited', callId, sent });
      return;
    }
    const peer = wsByName(cleanName(m.to));
    if (peer && peer !== ws) {
      const fwd = { t: m.t, callId, from: st.name };
      if (m.payload !== undefined) fwd.payload = m.payload;
      if (m.kind) fwd.kind = m.kind;
      wsSend(peer, fwd);
    }
    return;
  }
  if (m.t === 'typing') {
    roomCast(st.room, { t: 'typing', from: st.name, room: st.room }, ws);
    return;
  }
  if (m.t === 'del') {
    if (String(m.key || '') !== ADMIN_KEY) { wsSend(ws, { t: 'err', msg: 'אין הרשאה' }); return; }
    const ix = RH().findIndex((h) => h.id === m.id);
    if (ix !== -1) RH().splice(ix, 1);
    if (meta.pins[st.room] && meta.pins[st.room].id === m.id) { delete meta.pins[st.room]; saveMeta(); }
    saveHist();
    roomCast(st.room, { t: 'del', id: m.id, room: st.room });
    return;
  }
  if (m.t === 'edit') {
    const txt = String(m.text || '').trim().slice(0, 500);
    if (!txt) return;
    const h = RH().find((x) => x.id === m.id);
    if (!h) { wsSend(ws, { t: 'err', msg: 'ההודעה לא נמצאה' }); return; }
    if (h.from !== st.name && String(m.key || '') !== ADMIN_KEY) { wsSend(ws, { t: 'err', msg: 'אפשר לערוך רק הודעות שלך (עד 15 דקות)' }); return; }
    if (h.from === st.name && Date.now() - h.at > 15 * 60 * 1000 && String(m.key || '') !== ADMIN_KEY) { wsSend(ws, { t: 'err', msg: 'עברו 15 דקות — אי אפשר לערוך' }); return; }
    h.text = txt;
    h.edited = true;
    saveHist();
    roomCast(st.room, { t: 'edit', id: h.id, text: txt, room: st.room });
    return;
  }
  if (m.t === 'react') {
    const h = RH().find((x) => x.id === m.id);
    if (!h) return;
    const em = String(m.emoji || '').trim();
    if (!em || /\s/.test(em) || [...em].length > 4) return;
    h.reactions = h.reactions || {};
    h.reactions[em] = h.reactions[em] || [];
    if (!h.reactions[em].includes(st.name)) h.reactions[em].push(st.name);
    if (h.reactions[em].length > 20) h.reactions[em] = h.reactions[em].slice(-20);
    saveHist();
    roomCast(st.room, { t: 'reactions', id: h.id, reactions: h.reactions, room: st.room });
    return;
  }
  if (m.t === 'pin') {
    const h = RH().find((x) => x.id === m.id);
    if (!h) { wsSend(ws, { t: 'err', msg: 'ההודעה לא נמצאה' }); return; }
    if (h.from !== st.name && String(m.key || '') !== ADMIN_KEY) { wsSend(ws, { t: 'err', msg: 'אפשר לנעוץ רק הודעה שלך' }); return; }
    meta.pins[st.room] = { id: h.id, text: h.text.slice(0, 200), from: h.from, at: Date.now() };
    saveMeta();
    roomCast(st.room, { t: 'pin', ...meta.pins[st.room], room: st.room });
    return;
  }
  if (m.t === 'unpin') {
    if (meta.pins[st.room] && (meta.pins[st.room].from === st.name || String(m.key || '') === ADMIN_KEY)) {
      delete meta.pins[st.room];
      saveMeta();
      roomCast(st.room, { t: 'unpin', room: st.room });
    }
    return;
  }
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webm': 'video/webm', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };

/* 🖼️ גלריית תוצרים — איחוד כל המקורות לרשימה אחת */
function buildGallery() {
  const items = [];
  const seen = new Set();
  const push = (it) => {
    const key = it.url || (it.source + '|' + it.type + '|' + it.prompt + '|' + it.at);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };
  const kindOf = (url, hint) => {
    if (/site|http/i.test(hint || '') || /^https?:/i.test(url || '')) return 'link';
    const e = String(url || '').split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(e)) return 'image';
    if (['mp4', 'webm'].includes(e)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio';
    if (hint === 'image' || hint === 'video' || hint === 'audio') return hint;
    return 'image';
  };
  const typeOfMedia = (text, kind, from) => {
    const t = String(text || '');
    if (/סטיקר|מדבקה|sticker/i.test(t)) return 'sticker';
    if (kind === 'audio') return 'voice';
    if (kind === 'video') return 'video';
    if (/QR|ברקוד/i.test(t)) return 'qr';
    return 'image';
  };
  // 1) לוג מרכזי (bot-gallery.json) — כולל אתרים עתידיים
  try {
    const d = JSON.parse(fs.readFileSync(new URL('./bot-gallery.json', import.meta.url), 'utf-8'));
    for (const g of (Array.isArray(d) ? d : [])) {
      const type = String(g.type || 'other');
      const kind = type === 'site' ? 'link'
        : ['image', 'sticker', 'qr'].includes(type) ? 'image'
        : type === 'video' ? 'video' : type === 'music' || type === 'voice' ? 'audio' : kindOf(g.url);
      push({ id: g.id || ('g' + g.at), type, kind, prompt: g.prompt || '', url: g.url || '', at: g.at || 0, source: g.source || 'site' });
    }
  } catch {}
  // 2) הודעות מדיה מהצ'אט (site-chat.json בזיכרון)
  try {
    for (const r of rooms.values()) {
      for (const h of (r.hist || [])) {
        const mu = h?.media?.url;
        if (typeof mu !== 'string' || !mu.startsWith('/media/')) continue;
        const kind = h.media.kind === 'image' || h.media.kind === 'video' || h.media.kind === 'audio' ? h.media.kind : kindOf(mu);
        push({
          id: 'c' + h.id, type: typeOfMedia(h.text, kind, h.from),
          kind, prompt: String(h.text || '').slice(0, 300),
          url: mu, at: h.at || 0, source: 'site',
        });
      }
    }
  } catch {}
  // 3) קבצי site/media יתומים (לא מקושרים להודעה)
  try {
    const mdir = path.join(DIR, 'site', 'media');
    for (const f of fs.readdirSync(mdir)) {
      const url = '/media/' + f;
      if (seen.has(url)) continue;
      const st = fs.statSync(path.join(mdir, f));
      if (!st.isFile() || st.size < 10) continue;
      const kind = kindOf(url);
      if (kind === 'image' && st.size < 3000) continue; // קבצי בדיקה זעירים
      push({
        id: 'f' + f, type: kind === 'audio' ? 'voice' : kind === 'video' ? 'video' : 'image',
        kind, prompt: '', url, at: Math.floor(st.mtimeMs), source: 'site',
      });
    }
  } catch {}
  // 4) גלריית טלגרם (fid — מוצג ככרטיס תיאור, התמונה באפליקציית טלגרם)
  try {
    const tg = JSON.parse(fs.readFileSync(new URL('./tg-gallery.json', import.meta.url), 'utf-8'));
    for (const arr of Object.values(tg || {})) {
      for (const g of (Array.isArray(arr) ? arr : [])) {
        push({ id: 'tg' + (g.at || Math.random()), type: 'image', kind: 'text', prompt: g.prompt || '', url: '', at: g.at || 0, source: 'telegram' });
      }
    }
  } catch {}
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  // מדלגים על כרטיסים עם קובץ מדיה שלא קיים בדיסק (למשל אחרי פריסה מחדש)
  const live = items.filter((it) => {
    if (typeof it.url === 'string' && it.url.startsWith('/media/')) {
      try {
        const fp = path.join(DIR, 'site', it.url.replace(/^\/media\//, ''));
        if (fp.includes('..') || !fs.statSync(fp).isFile()) return false;
      } catch {
        return false;
      }
    }
    return true;
  });
  const counts = {};
  for (const it of live) counts[it.type] = (counts[it.type] || 0) + 1;
  return { items: live.slice(0, 500), counts, total: live.length };
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', 'http://x');
    if (u.pathname === '/api/export') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="multi-bot-chat.json"' });
      res.end(JSON.stringify({ exported_at: Date.now(), rooms: [...rooms.values()].map((r) => ({ id: r.id, name: r.name, count: r.hist.length, messages: r.hist })) }));
      return;
    }
    if (u.pathname === '/api/media' && req.method === 'POST') {
      const ctype = String(req.headers['content-type'] || '');
      const oname = String(req.headers['x-name'] || 'file').replace(/[^\w.\-֐-׿ ]/g, '').slice(0, 80);
      const ext = (oname.split('.').pop() || 'bin').toLowerCase().slice(0, 8);
      const okExt = ['png','jpg','jpeg','gif','webp','mp4','webm','mp3','ogg','wav','m4a','pdf','txt'].includes(ext);
      if (!okExt || !/^image\//.test(ctype) && !/^video\//.test(ctype) && !/^audio\//.test(ctype) && ctype !== 'application/pdf' && ctype !== 'text/plain') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'סוג קובץ לא נתמך' }));
        return;
      }
      const chunks = [];
      let size = 0;
      req.on('data', (c) => { size += c.length; chunks.push(c); });
      req.on('end', () => {
        try {
          if (size > 16 * 1048576 || size < 10) throw new Error('size');
          const mdir = path.join(DIR, 'site', 'media');
          try { fs.mkdirSync(mdir, { recursive: true }); } catch {}
          // מכסת תיקייה: 500MB — מוחקים ישנים
          try {
            let total = 0;
            const files = fs.readdirSync(mdir).map((f) => { const st = fs.statSync(path.join(mdir, f)); total += st.size; return { f, t: st.mtimeMs }; }).sort((a, b) => a.t - b.t);
            while (total > 500 * 1048576 && files.length) { const old1 = files.shift(); try { fs.unlinkSync(path.join(mdir, old1.f)); total -= fs.statSync(path.join(mdir, old1.f)).size; } catch { try { total -= 1; } catch {} } }
          } catch {}
          const id = 'f' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + '.' + ext;
          fs.writeFileSync(path.join(mdir, id), Buffer.concat(chunks));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, url: '/media/' + id, size }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'העלאה נכשלה' }));
        }
      });
      return;
    }
    if (u.pathname === '/api/reports' && u.searchParams.get('key') === ADMIN_KEY) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ count: reports.length, reports: reports.slice(-100) }));
      return;
    }
    if (u.pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ online: clients.size, rooms: roomsList() }));
      return;
    }
    if (u.pathname === '/api/gallery') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      try {
        res.end(JSON.stringify(buildGallery()));
      } catch {
        res.end(JSON.stringify({ items: [], counts: {}, total: 0 }));
      }
      return;
    }
    if (u.pathname === '/api/gallery-push' && req.method === 'POST') {
      // 📤 דחיפת תוצרים מהבוטים המקומיים לגלריה שבשרת (עם מפתח משותף)
      const secret = process.env.GALLERY_SECRET || '';
      if (!secret || String(req.headers['x-gallery-secret'] || '') !== secret) {
        res.writeHead(secret ? 403 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: secret ? 'forbidden' : 'gallery-push לא מוגדר בשרת (חסר GALLERY_SECRET)' }));
        return;
      }
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > 15 * 1048576) { tooBig = true; return; }
        chunks.push(c);
      });
      req.on('end', async () => {
        try {
          if (tooBig) throw new Error('גדול מדי (מקסימום ~11MB לקובץ)');
          const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          const type = String(body.type || 'image').slice(0, 20);
          const prompt = String(body.prompt || '').slice(0, 300);
          const source = String(body.source || 'whatsapp').slice(0, 20);
          const at = Number(body.at) > 0 ? Number(body.at) : Date.now();
          let url = '';
          if (body.data) {
            const buf = Buffer.from(String(body.data), 'base64');
            if (!buf.length || buf.length < 100 || buf.length > 12 * 1048576) throw new Error('קובץ לא תקין');
            const ext = String(body.ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
            if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'm4a', 'webm', 'mp4'].includes(ext.toLowerCase())) throw new Error('סיומת לא נתמכת');
            url = saveSiteMedia(buf, ext.toLowerCase());
          } else if (/^https?:\/\/.{5,500}$/i.test(String(body.url || ''))) {
            url = String(body.url); // אתר/קישור חיצוני (למשל אתר שנוצר בבוט)
          }
          const { logCreation, readGalleryLog } = await import('./gallery-log.js');
          logCreation({ type, prompt, url, source, extra: { at } });
          // אימות שהרשומה נשמרה באמת (אחרת הלקוח יחשוב שהצליח)
          try {
            const logged = readGalleryLog().some((g) =>
              (url && g.url === url) || (!url && g.prompt === prompt && Math.abs((g.at || 0) - at) < 5000));
            if (!logged) throw new Error('LOG_VERIFY_FAIL');
          } catch (e) {
            throw new Error('שמירת לוג נכשלה: ' + String((e && e.message) || e).slice(0, 100));
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, url }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String((e && e.message) || 'bad-request').slice(0, 120) }));
        }
      });
      return;
    }
    if (u.pathname === '/api/tts' && req.method === 'GET') {
      // הקראת טקסט בעברית (mp3) — גיבוי למכשירים בלי קול עברי
      try {
        const text = (u.searchParams.get('text') || '').slice(0, 300);
        if (text.trim().length < 2) throw new Error('empty');
        const data = await ttsMp3Buffer(text);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=3600' });
        res.end(data);
      } catch (e) {
        console.warn('TTS-ERR:', (e && e.message || e || '').toString().slice(0, 200));
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      }
      return;
    }
    let p = u.pathname === '/' ? '/index.html' : u.pathname;
    if (p.includes('..')) { res.writeHead(400); res.end(); return; }
    const fp = path.join(DIR, 'site', p);
    fs.readFile(fp, (e, data) => {
      if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('לא נמצא'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch { try { res.writeHead(500); res.end(); } catch {} }
});

const liveSocks = new Set();
setInterval(() => {
  try {
    for (const sock of liveSocks) {
      if (sock.destroyed) { liveSocks.delete(sock); continue; }
      if (sock._hbAlive === false) {
        try { sock.destroy(); } catch {}
        liveSocks.delete(sock);
        if (clients.has(sock)) {
          const st = clients.get(sock);
          clients.delete(sock);
          if (st) broadcastUsers();
        }
        continue;
      }
      sock._hbAlive = false;
      try { sock.write(Buffer.from([0x89, 0x00])); } catch {}
    }
  } catch {}
}, 30000).unref?.();
server.on('upgrade', (req, socket) => {
  try {
    if (!wsAccept(req, socket)) return;
    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    // הגבלת חיבורים: עד 3 לאותו IP
    let n = 0;
    for (const c of clients.values()) if (c.ip === ip) n++;
    const state = { buf: Buffer.alloc(0), parts: [], ip };
    if (n >= 3) { try { socket.destroy(); } catch {} return; }
    socket.on('data', (b) => { try { onSocketDataReal(socket, state, b); } catch {} });
    liveSocks.add(socket);
    socket.on('close', () => {
      liveSocks.delete(socket);
      const st = clients.get(socket);
      clients.delete(socket);
      if (st) broadcastUsers();
    });
    socket.on('error', () => { try { clients.delete(socket); } catch {} });
  } catch { try { socket.destroy(); } catch {} }
});

// פענוח פריים תקין עם מסכה (לקוח חייב למסך לפי התקן)
function onSocketDataReal(ws, state, buf) {
  state.buf = Buffer.concat([state.buf, buf]);
  for (;;) {
    if (state.buf.length < 2) return;
    const fin = (state.buf[0] & 0x80) !== 0;
    const op = state.buf[0] & 0x0f;
    const masked = (state.buf[1] & 0x80) !== 0;
    let len = state.buf[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (state.buf.length < 4) return;
      len = state.buf.readUInt16BE(2);
      off = 4;
    } else if (len === 127) {
      if (state.buf.length < 10) return;
      const hi = state.buf.readUInt32BE(2);
      const lo = state.buf.readUInt32BE(6);
      if (hi !== 0 || lo > 65536) { ws.destroy(); return; }
      len = lo;
      off = 10;
    }
    const need = off + (masked ? 4 : 0) + len;
    if (state.buf.length < need) return;
    let payload = state.buf.subarray(off + (masked ? 4 : 0), need);
    if (masked) {
      const mk = state.buf.subarray(off, off + 4);
      const out = Buffer.alloc(len);
      for (let i = 0; i < len; i++) out[i] = payload[i] ^ mk[i % 4];
      payload = out;
    }
    state.buf = state.buf.subarray(need);
    if (op === 0x8) { try { ws.write(Buffer.from([0x88, 0x00])); } catch {} ws.destroy(); return; }
    if (op === 0x9) { try { ws.write(Buffer.from([0x8a, 0x00])); } catch {} continue; }
    if (op === 0xA) { ws._hbAlive = true; continue; }
    if (op === 0x1 || op === 0x0) {
      state.parts.push(payload);
      if (fin) {
        const full = Buffer.concat(state.parts);
        state.parts = [];
        handleFrame(ws, state, full.toString('utf-8'));
      }
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 אתר מולטי בוט: http://localhost:${PORT} (חדרים: ${rooms.size})`);
});
