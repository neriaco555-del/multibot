/**
 * 📤 העלאה חד-פעמית של כל התוצרים המקומיים לגלריה שבשרת החי.
 * קורא: bot-gallery.json + הודעות מדיה מ-site-chat.json + קבצי site/media יתומים + tg-gallery.json
 * שולח דרך queueServerPush (ניסיון מיידי, ומה שנכשל נשאר בתור ומנסה שוב).
 *
 * הרצה: node gallery-push-backfill.js
 * דורש: GALLERY_SECRET ב-.env + אותו ערך ב-Render Dashboard.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { queueServerPush, flushGalleryQueue, awaitGalleryIdle } from './gallery-log.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const seen = new Set();
let queued = 0;

function push({ type, prompt, source, ext, buffer, url, at }) {
  const key = url || (source + '|' + type + '|' + prompt);
  if (seen.has(key)) return;
  seen.add(key);
  queued++;
  queueServerPush({ type, prompt, source, ext, buffer, url, at });
}

function localBytes(mediaUrl) {
  try {
    if (!mediaUrl.startsWith('/media/')) return null;
    const fp = path.join(DIR, 'site', 'media', path.basename(String(mediaUrl)));
    const buf = fs.readFileSync(fp);
    return buf.length > 100 ? buf : null;
  } catch {
    return null;
  }
}
const extOf = (u) => (String(u).split('.').pop() || 'jpg').toLowerCase();
const kindType = (url, text = '') => {
  if (/סטיקר|מדבקה/i.test(text)) return 'sticker';
  const e = extOf(url);
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'voice';
  if (['mp4', 'webm'].includes(e)) return 'video';
  if (/QR|ברקוד/i.test(text)) return 'qr';
  return 'image';
};

// 1) לוג מקומי
try {
  const d = JSON.parse(fs.readFileSync(new URL('./bot-gallery.json', import.meta.url), 'utf-8'));
  for (const g of (Array.isArray(d) ? d : [])) {
    const buf = g.url ? localBytes(g.url) : null;
    push({ type: g.type || 'image', prompt: g.prompt || '', source: g.source || 'whatsapp', ext: extOf(g.url || 'x.jpg'), buffer: buf, url: buf ? undefined : g.url, at: g.at });
    // מסמן גם לפי תיאור כדי שסעיף הטלגרם לא ידחוף כפילות של אותו פרומפט
    seen.add(`${g.source || 'whatsapp'}|${g.type || 'image'}|${g.prompt || ''}`);
  }
} catch {}
// 2) מדיה מהצ'אט
try {
  const d = JSON.parse(fs.readFileSync(new URL('./site-chat.json', import.meta.url), 'utf-8'));
  for (const r of Object.values(d.rooms || {})) {
    for (const h of (r.hist || [])) {
      const mu = h?.media?.url;
      if (typeof mu !== 'string' || !mu.startsWith('/media/')) continue;
      push({ type: kindType(mu, h.text), prompt: String(h.text || '').slice(0, 300), source: 'site', ext: extOf(mu), buffer: localBytes(mu), at: h.at });
    }
  }
} catch {}
// 3) קבצים יתומים
try {
  const mdir = path.join(DIR, 'site', 'media');
  for (const f of fs.readdirSync(mdir)) {
    const url = '/media/' + f;
    if (seen.has(url)) continue;
    const st = fs.statSync(path.join(mdir, f));
    if (!st.isFile() || st.size < 3000) continue;
    if (!/\.(png|jpe?g|gif|webp|mp3|wav|ogg|m4a|mp4|webm)$/i.test(f)) continue;
    push({ type: kindType(url), prompt: '', source: 'site', ext: extOf(f), buffer: localBytes(url), at: Math.floor(st.mtimeMs) });
  }
} catch {}
// 4) טלגרם (תיאורים בלבד — הקבצים בטלגרם)
try {
  const tg = JSON.parse(fs.readFileSync(new URL('./tg-gallery.json', import.meta.url), 'utf-8'));
  for (const arr of Object.values(tg || {})) {
    for (const g of (Array.isArray(arr) ? arr : [])) {
      push({ type: 'image', prompt: g.prompt || '', source: 'telegram', ext: 'jpg', buffer: null, at: g.at });
    }
  }
} catch {}

console.log(`נשלחו לתור: ${queued} תוצרים`);
await awaitGalleryIdle(); // מחכה שהניסיונות המיידיים יסתיימו לפני שמודדים

// מרוקן את התור עם ניסיונות חוזרים (עד ~10 דקות)
if (!process.env.GALLERY_SECRET) {
  console.log('אין GALLERY_SECRET ב-.env — נשמר בתור, יישלח כשתוגדר.');
  process.exit(0);
}
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  try {
    const done = await flushGalleryQueue();
    let left = 0;
    try {
      const q = JSON.parse(fs.readFileSync(new URL('./gallery-queue.json', import.meta.url), 'utf-8'));
      left = Array.isArray(q) ? q.length : 0;
    } catch {}
    console.log(`ניסיון ${i + 1}: נשארו בתור ${left}`);
    if (done && left === 0) {
      console.log('✅ כל התוצרים עלו לשרת!');
      process.exit(0);
    }
  } catch (e) {
    console.log(`ניסיון ${i + 1} נכשל:`, String((e && e.message) || e).slice(0, 80));
  }
}
console.log('⏳ חלק נשארו בתור (gallery-queue.json) — הבוטים ימשיכו לנסות כל 5 דקות.');
process.exit(0);
