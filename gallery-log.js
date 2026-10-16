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

/** קיצור: שמירת עותק + רישום בלוג. */
export function logCreationWithFile({ type = 'image', prompt = '', buffer = null, ext = 'jpg', source = 'whatsapp' } = {}) {
  const url = buffer ? saveCreationCopy(buffer, ext) : '';
  logCreation({ type, prompt, url, source });
  return url;
}
