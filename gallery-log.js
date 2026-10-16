/**
 * 🖼️ לוג מרכזי של תוצרי הבוט — מקור הנתונים לעמוד הגלריה (/gallery.html).
 * כל יצירה (תמונה, סטיקר, אתר, מוזיקה, וידאו, קול, QR) נרשמת כאן,
 * וה-API /api/gallery מאחד את הקובץ הזה עם site-chat.json + site/media + tg-gallery.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = new URL('./bot-gallery.json', import.meta.url);
const MAX = 500;
const DIR = path.dirname(fileURLToPath(import.meta.url));

/** סוגים נתמכים: image | sticker | site | music | video | voice | qr | other */
export function logCreation({ type = 'other', prompt = '', url = '', file = '', source = 'site', extra = {} } = {}) {
  try {
    let arr = [];
    try {
      const d = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      if (Array.isArray(d)) arr = d;
    } catch { /* קובץ חדש */ }
    arr.unshift({
      id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
      type: String(type).slice(0, 20),
      prompt: String(prompt || '').slice(0, 300),
      url: String(url || '').slice(0, 500),
      file: String(file || '').slice(0, 120),
      source: String(source || 'site').slice(0, 20),
      at: Date.now(),
      ...extra,
    });
    fs.writeFileSync(FILE, JSON.stringify(arr.slice(0, MAX)));
  } catch { /* לוג לעולם לא מפיל את הבוט */ }
}

export function readGalleryLog() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/**
 * שומר עותק של יצירה לתיקיית הגלריה (site/media) עם הגנת מכסה —
 * לעולם לא מפיל את הבוט. מחזיר url (‎/media/...) או '' אם נכשל/מלא.
 */
export function saveCreationCopy(buffer, ext = 'jpg') {
  try {
    if (!buffer || buffer.length < 3000) return '';
    const mdir = path.join(DIR, 'site', 'media');
    try { fs.mkdirSync(mdir, { recursive: true }); } catch {}
    // מכסה: לא יותר מ-400MB ולא יותר מ-2000 קבצים
    try {
      const files = fs.readdirSync(mdir);
      if (files.length > 2000) return '';
      let total = 0;
      for (const f of files) {
        try { total += fs.statSync(path.join(mdir, f)).size; } catch {}
        if (total > 400 * 1048576) return '';
      }
    } catch {}
    const clean = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
    const name = 'gal' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) + '.' + clean;
    fs.writeFileSync(path.join(mdir, name), buffer);
    return '/media/' + name;
  } catch {
    return '';
  }
}

/** קיצור: שמירת עותק + רישום בלוג + דחיפה לשרת. */
export function logCreationWithFile({ type = 'image', prompt = '', buffer = null, ext = 'jpg', source = 'whatsapp' } = {}) {
  const url = buffer ? saveCreationCopy(buffer, ext) : '';
  logCreation({ type, prompt, url, source });
  // 📤 דחיפה אוטומטית לגלריה שבשרת (נכנס לתור אם השרת לא זמין)
  try {
    queueServerPush({ type, prompt: String(prompt || '').slice(0, 300), source, ext, buffer, at: Date.now() });
  } catch {}
  return url;
}

/* ============ 📤 דחיפה אוטומטית לשרת (Render) ============
 * כל יצירה נשלחת ל-/api/gallery-push. אם השרת ישן/נכבה/אין מפתח —
 * נשמר בתור מקומי (gallery-queue.json) ומנסה שוב כל 5 דקות.
 * מופעל אוטומטית מכל תהליך שקורא ל-logCreationWithFile (ללא עריכות נוספות).
 */
import 'dotenv/config';

const QUEUE_FILE = new URL('./gallery-queue.json', import.meta.url);
const QUEUE_MAX = 100;
const PUSH_MAX_BYTES = 8 * 1048576; // קבצים גדולים מוקטנים (תמונות) או נשלחים כמטא-דאטה בלבד

const serverUrl = () => (process.env.GALLERY_SERVER_URL || 'https://multibot-zuk0.onrender.com').replace(/\/+$/, '');
const serverSecret = () => (process.env.GALLERY_SECRET || '').trim();

function readQueue() {
  try {
    const d = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}
function writeQueue(q) {
  try {
    const tmp = String(QUEUE_FILE).replace('file://', '') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(q.slice(0, QUEUE_MAX)));
    fs.renameSync(tmp, String(QUEUE_FILE).replace('file://', ''));
  } catch {}
}

/** הקטנת תמונה גדולה לפני שליחה (sharp מקומי, best-effort). */
async function shrinkImage(buffer, ext) {
  try {
    if (!buffer || buffer.length <= PUSH_MAX_BYTES) return { buffer, ext };
    if (!/^(jpg|jpeg|png|webp)$/i.test(ext || '')) return { buffer: null, ext }; // אודיו/וידאו גדולים → מטא-דאטה בלבד
    const { default: sharp } = await import('sharp');
    const out = await sharp(buffer).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    if (out.length > PUSH_MAX_BYTES) return { buffer: null, ext: 'jpg' };
    return { buffer: out, ext: 'jpg' };
  } catch {
    return { buffer: buffer && buffer.length <= PUSH_MAX_BYTES ? buffer : null, ext };
  }
}

async function postPush(entry) {
  const secret = serverSecret();
  if (!secret) throw new Error('NO_SECRET');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(serverUrl() + '/api/gallery-push', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-gallery-secret': secret },
      body: JSON.stringify({
        type: entry.type, prompt: entry.prompt, source: entry.source,
        ext: entry.ext, at: entry.at,
        ...(entry.data ? { data: entry.data } : {}),
        ...(entry.url ? { url: entry.url } : {}),
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error((j && j.error) || ('HTTP ' + res.status));
    return true;
  } finally {
    clearTimeout(t);
  }
}

/** שליחת תור — מחזיר true אם הכל נשלח. */
export async function flushGalleryQueue() {
  const q = readQueue();
  if (!q.length) return true;
  if (!serverSecret()) return false; // אין מפתח — לא מנסים בכלל
  const rest = [];
  for (const entry of q) {
    try {
      await postPush(entry);
    } catch (e) {
      if (String((e && e.message) || '').includes('NO_SECRET')) return false;
      rest.push(entry); // נכשל — נשאר לתור הבא (כולל שרת ישן)
    }
  }
  writeQueue(rest);
  return rest.length === 0;
}

let galleryTimerStarted = false;
function ensureGalleryTimer() {
  if (galleryTimerStarted) return;
  galleryTimerStarted = true;
  try {
    const t = setInterval(() => { flushGalleryQueue().catch(() => {}); }, 5 * 60 * 1000);
    if (t.unref) t.unref();
  } catch {}
}

/** מוסיף יצירה לתור הדחיפה + ניסיון מיידי. */
export function queueServerPush({ type, prompt, source, ext, buffer, url, at } = {}) {
  ensureGalleryTimer();
  if (!serverSecret()) return; // בלי מפתח אין טעם לצבור תור
  queueServerPushAsync({ type, prompt, source, ext, buffer, url, at }).catch(() => {});
}
async function queueServerPushAsync({ type, prompt, source, ext, buffer, url, at }) {
  const cleanExt = String(ext || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  const { buffer: small, ext: finalExt } = await shrinkImage(buffer, cleanExt);
  const entry = {
    type: String(type || 'image').slice(0, 20),
    prompt: String(prompt || '').slice(0, 300),
    source: String(source || 'whatsapp').slice(0, 20),
    ext: finalExt, at: Number(at) || Date.now(),
    ...(small ? { data: small.toString('base64') } : {}),
    ...(/^https?:\/\/.{5,500}$/i.test(String(url || '')) ? { url: String(url) } : {}),
  };
  try {
    await postPush(entry); // ניסיון מיידי
    flushGalleryQueue().catch(() => {}); // על הדרך מרוקן תור ישן
  } catch {
    const q = readQueue();
    q.push(entry);
    writeQueue(q);
  }
}
