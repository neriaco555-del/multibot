/**
 * 📥 הורדת תמונות ישנות מגלריית טלגרם (tg-gallery.json) והעלאתן לשרת.
 * ה-fid נשמר מקורית — מורידים דרך Bot API ודוחפים ל-/api/gallery-push.
 *
 * הרצה: node tg-gallery-fetch.js
 */
import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { saveCreationCopy, logCreation, queueServerPush, flushGalleryQueue, awaitGalleryIdle } from './gallery-log.js';

const execFileAsync = promisify(execFile);

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!TOKEN) {
  console.log('חסר TELEGRAM_BOT_TOKEN ב-.env');
  process.exit(1);
}

async function curlJson(url) {
  const { stdout } = await execFileAsync('curl', ['-s', '-m', '30', url]);
  return JSON.parse(stdout);
}
async function curlBytes(url) {
  const tmp = path.join(os.tmpdir(), `tgdl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}.bin`);
  await execFileAsync('curl', ['-s', '-m', '120', '-o', tmp, url]);
  const buf = fs.readFileSync(tmp);
  try { fs.unlinkSync(tmp); } catch {}
  return buf;
}

async function downloadTelegramFile(fileId) {
  const j = await curlJson(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const fp = j?.result?.file_path;
  if (!fp) throw new Error('getFile: ' + String(j?.description || 'no-path').slice(0, 80));
  const buf = await curlBytes(`https://api.telegram.org/file/bot${TOKEN}/${fp}`);
  if (!buf.length || buf.length < 300) throw new Error('קובץ ריק');
  return buf;
}

let tg = {};
try { tg = JSON.parse(fs.readFileSync(new URL('./tg-gallery.json', import.meta.url), 'utf-8')); } catch {}
const entries = [];
for (const arr of Object.values(tg || {})) {
  for (const g of (Array.isArray(arr) ? arr : [])) {
    if (g?.fid) entries.push(g);
  }
}
console.log(`נמצאו ${entries.length} תמונות טלגרם`);

let ok = 0;
for (const g of entries) {
  try {
    const buf = await downloadTelegramFile(g.fid);
    const url = saveCreationCopy(buf, 'jpg'); // עותק מקומי לגלריה המקומית
    logCreation({ type: 'image', prompt: g.prompt || '', url, source: 'telegram', extra: { at: g.at || Date.now() } });
    queueServerPush({ type: 'image', prompt: g.prompt || '', source: 'telegram', ext: 'jpg', buffer: buf, at: g.at });
    ok++;
    console.log(`✅ "${(g.prompt || '').slice(0, 40)}" (${Math.round(buf.length / 1024)}KB)`);
  } catch (e) {
    console.log(`⏭️ דילוג "${(g.prompt || '').slice(0, 40)}": ${String((e && e.message) || e).slice(0, 60)}`);
  }
}
await awaitGalleryIdle();
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  try {
    const done = await flushGalleryQueue();
    let left = 0;
    try { left = JSON.parse(fs.readFileSync(new URL('./gallery-queue.json', import.meta.url), 'utf-8')).length; } catch {}
    console.log(`ניסיון ${i + 1}: נשארו ${left}`);
    if (done && left === 0) break;
  } catch {}
}
console.log(`הושלמו ${ok}/${entries.length}`);
process.exit(0);
