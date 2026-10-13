/**
 * 🎼 יצירת מוזיקה ושירים מקוריים — חינם לגמרי:
 *
 * מסלול ראשי (מומלץ, $0): טוקן Hugging Face חינמי (בלי כרטיס!)
 * - מנגינות: MusicGen (serverless inference)
 * - שירים עם שירה: YuE2 (Gradio Space)
 * דרוש: HF_TOKEN ב-.env (יוצרים ב-https://huggingface.co/settings/tokens)
 *
 * מסלול גיבוי: מפתח Pollinations (https://enter.pollinations.ai)
 *
 * (בלי מפתח בכלל — הבוט מחזיר הודעת הסבר, לא נכשל בשקט)
 *
 * - generateInstrumental(style, durationSec) — מנגינה בלי מילים
 * - generateSong(lyrics, styleHint, durationSec) — שיר עם המילים שלך (עם שירה!)
 *
 * מחזיר Buffer של MP3, מוכן לשליחה כהודעת אודיו.
 */
import { config } from './config.js';
import { translateText } from './web-search.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');

const YUE_SPACE = 'https://mrfakename-yue2-3b.hf.space';
const MUSICGEN_SPACE = 'https://facebook-musicgen.hf.space';

// סדר ניסיון Pollinations (נבדק מול /v1/models): ElevenLabs v2.5 → Lyria (שירה!) → v2 → Stable Audio
const POLLINATIONS_MUSIC_MODELS = [
  'elevenlabs/music-v2.5',
  'google/lyria-3-clip-preview',
  'elevenlabs/music-v2',
  'stability-ai/stable-audio-3-medium',
];

async function toEnglish(text) {
  const clean = (text || '').toString().trim();
  if (!clean) return '';
  if (!hasHebrew(clean)) return clean;
  try {
    return await translateText(clean, 'en');
  } catch {
    return clean;
  }
}

function hfHeaders(extra = {}) {
  return { Authorization: `Bearer ${config.HF_TOKEN}`, ...extra };
}

export function needMusicKey() {
  return !config.HF_TOKEN && !config.POLLINATIONS_API_KEY;
}

export const MUSIC_KEY_HELP =
  `🎼 *יצירת מוזיקה — הפעלה חד-פעמית (חינם, בלי כרטיס 💳):*\n\n` +
  `1. הירשם חינם: https://enter.pollinations.ai\n` +
  `   (מקבלים Pollen חינם להתנסות — בלי כרטיס)\n` +
  `2. צור מפתח (Keys) והדבק ב-.env:\nPOLLINATIONS_API_KEY=sk_...\n` +
  `3. הפעל מחדש: systemctl --user restart whatsapp-ai-bot\n\n` +
  `אחרי זה: !מנגינה (מנגינות) ו-!הלחן (שירים עם שירה 🎤) יעבדו!`;

/* ---------- המרת אודיו ל-MP3 (וואטסאפ אוהב MP3 לקבצים) ---------- */
async function toMp3(inputBuffer, inputExt = 'wav') {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'music-'));
  try {
    const inp = path.join(dir, `in.${inputExt}`);
    const out = path.join(dir, 'out.mp3');
    await fs.promises.writeFile(inp, inputBuffer);
    await execFileAsync('ffmpeg', [
      '-y', '-i', inp, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', out,
    ]);
    const mp3 = await fs.promises.readFile(out);
    if (!mp3.length || mp3.length < 2000) throw new Error('המרה נכשלה');
    return mp3;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- קריאת קובץ מ-Gradio Space (named-endpoint) ---------- */
async function callSpaceFile(space, apiName, dataArray, timeoutMs = 720000) {
  const callRes = await fetch(`${space}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: hfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ data: dataArray }),
  });
  if (callRes.status === 401 || callRes.status === 403) throw new Error('HF_UNAUTHORIZED');
  if (callRes.status === 429) throw new Error('HF_RATE_LIMIT');
  if (!callRes.ok) {
    const body = await callRes.text().catch(() => '');
    throw new Error(`${apiName} HTTP ${callRes.status} ${body.slice(0, 120)}`);
  }
  const { event_id: eventId } = await callRes.json().catch(() => ({}));
  if (!eventId) throw new Error('לא התקבל מזהה משימה');
  const outData = await pollGradioCall(space, apiName, eventId, timeoutMs);
  const fileRef = outData[0];
  if (!fileRef || (!fileRef.path && !fileRef.url)) throw new Error('לא התקבל קובץ');
  return fileRef;
}

function isMp3(buf) {
  return buf.subarray(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
}

/* ---------- מנגינה: MusicGen הרשמי (Space, חינמי) ---------- */
async function instrumentalHF(styleEn) {
  const fileRef = await callSpaceFile(
    MUSICGEN_SPACE, 'predict_batched', [styleEn.slice(0, 400), null], 600000
  );
  const audio = await downloadSpaceFile(MUSICGEN_SPACE, fileRef);
  const name = String(fileRef.orig_name || fileRef.path || '').toLowerCase();
  if (isMp3(audio)) return { buffer: audio, provider: 'MusicGen (HF, חינמי)' };
  const ext = name.endsWith('.wav') ? 'wav' : name.endsWith('.ogg') ? 'ogg' : name.endsWith('.flac') ? 'flac' : 'wav';
  const mp3 = await toMp3(audio, ext);
  return { buffer: mp3, provider: 'MusicGen (HF, חינמי)' };
}

/* ---------- שיר עם שירה: YuE2 דרך Gradio Space ---------- */
// קורא סטרים SSE של named-endpoint עד תוצאה סופית (או שגיאה)
async function pollGradioCall(space, apiName, eventId, timeoutMs = 720000) {
  const url = `${space}/gradio_api/call/${apiName}/${encodeURIComponent(eventId)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: hfHeaders({ Accept: 'text/event-stream' }) });
    if (res.status === 401 || res.status === 403) throw new Error('HF_UNAUTHORIZED');
    if (!res.ok || !res.body) throw new Error(`HF queue HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      // הודעות SSE מסתיימות ב-\n\n
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let evName = '';
        const datas = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) evName = line.slice(6).trim();
          else if (line.startsWith('data:')) datas.push(line.slice(5).trim());
        }
        if (!datas.length) continue;
        const joined = datas.join('\n');
        if (evName === 'error') {
          throw new Error(`HF: ${(joined && joined !== 'null' ? joined.slice(0, 150) : 'התחנה דחתה את הבקשה — בדוק את HF_TOKEN')}`);
        }
        let payload;
        try {
          payload = JSON.parse(joined);
        } catch {
          continue; // heartbeat / טקסט גולמי
        }
        if (!payload || typeof payload !== 'object') continue; // data: null (heartbeat)
        const msg = payload.msg || evName;
        if (msg === 'process_completed' || msg === 'complete' || payload.success === true) {
          const data = payload.output?.data ?? payload.output ?? payload.data;
          if (payload.success === false) {
            throw new Error(`HF: ${String(payload.error || payload.output?.error || payload.title || 'נכשל').slice(0, 150)}`);
          }
          if (data && (Array.isArray(data) ? data.length : true)) {
            try { await reader.cancel(); } catch {}
            return Array.isArray(data) ? data : [data];
          }
          throw new Error('HF: תוצאה ריקה');
        }
        if (payload.success === false || msg === 'error' || msg === 'close_stream') {
          throw new Error(`HF: ${String(payload.error || payload.title || joined).slice(0, 150) || 'נכשל'}`);
        }
        // estimation / progress / process_starts / heartbeat / log — ממשיכים לחכות
      }
    }
    throw new Error('HF: התור נסגר בלי תוצאה');
  } finally {
    clearTimeout(t);
  }
}

async function downloadSpaceFile(space, fileRef) {
  // fileRef: {path, url?} — url יכול להיות יחסי
  let fileUrl = fileRef?.url || null;
  if (fileUrl && fileUrl.startsWith('/')) fileUrl = space + fileUrl;
  const candidates = [fileUrl, fileRef?.path ? `${space}/gradio_api/file=${fileRef.path}` : null].filter(Boolean);
  let lastErr = null;
  for (const u of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 180000);
      try {
        const res = await fetch(u, { signal: ctrl.signal, headers: hfHeaders() });
        if (!res.ok) throw new Error(`file HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length < 2000) throw new Error('קובץ ריק');
        return buf;
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('הורדת השיר נכשלה');
}

async function songYue(lyricsEn, styleEn) {
  const fileRef = await callSpaceFile(YUE_SPACE, 'generate_song', [
    styleEn.slice(0, 300) || 'Pop song with vocals',
    lyricsEn.slice(0, 1000),
    'full', // planning_mode
    16, // render_quality (מהיר; 32 איטי יותר)
    Math.floor(Math.random() * 100000), // seed
  ]);
  const audio = await downloadSpaceFile(YUE_SPACE, fileRef);
  // כבר MP3 בד"כ — אם לא, ממירים
  const name = String(fileRef.orig_name || fileRef.path || '').toLowerCase();
  if (isMp3(audio)) return { buffer: audio, provider: 'YuE (HF, חינמי)' };
  const mp3 = await toMp3(audio, name.endsWith('.wav') ? 'wav' : 'ogg');
  return { buffer: mp3, provider: 'YuE (HF, חינמי)' };
}

/* ---------- גיבוי: Pollinations (דורש POLLINATIONS_API_KEY) ---------- */
async function musicRequestPollinations(promptText, model, durationSec) {
  const key = config.POLLINATIONS_API_KEY;
  const params = new URLSearchParams({ model, duration: String(durationSec) });
  const url = `https://gen.pollinations.ai/audio/${encodeURIComponent(promptText)}?${params}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 600000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Music ${model}: HTTP ${res.status} ${body.slice(0, 150)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length < 5000) throw new Error(`Music ${model}: קובץ ריק`);
    return { buffer: buf, provider: model };
  } finally {
    clearTimeout(t);
  }
}

async function viaPollinations(prompt, durationSec) {
  let lastErr = null;
  for (const model of POLLINATIONS_MUSIC_MODELS) {
    try {
      return await musicRequestPollinations(prompt, model, durationSec);
    } catch (e) {
      lastErr = e;
      console.warn('music fail:', e.message);
    }
  }
  throw lastErr || new Error('יצירת המוזיקה נכשלה');
}

/* ---------- API ראשי ---------- */
export async function generateInstrumental(style, durationSec = 30) {
  const clean = (style || '').toString().trim().slice(0, 300);
  if (clean.length < 2) throw new Error('EMPTY');
  if (needMusicKey()) throw new Error('NO_KEY');
  const styleEn = await toEnglish(clean);
  const dur = Math.min(Math.max(parseInt(durationSec) || 30, 10), 120);
  // 1. Hugging Face חינמי
  if (config.HF_TOKEN) {
    try {
      return { ...(await instrumentalHF(`instrumental music, ${styleEn}`)), styleEn };
    } catch (e) {
      console.warn('HF instrumental fail:', e.message);
      if (e.message === 'HF_UNAUTHORIZED') throw new Error('HF_UNAUTHORIZED');
      if (!config.POLLINATIONS_API_KEY) throw new Error('NO_KEY');
    }
  }
  // 2. גיבוי Pollinations
  const out = await viaPollinations(`instrumental music, ${styleEn}`, dur);
  return { ...out, styleEn };
}

export async function generateSong(lyrics, styleHint = '', durationSec = 30) {
  const cleanLyrics = (lyrics || '').toString().trim().slice(0, 1500);
  if (cleanLyrics.length < 2) throw new Error('EMPTY');
  if (needMusicKey()) throw new Error('NO_KEY');
  const styleEn = styleHint ? await toEnglish(styleHint) : 'Pop song with warm vocals';
  const lyricsEn = await toEnglish(cleanLyrics);
  const dur = Math.min(Math.max(parseInt(durationSec) || 30, 15), 120);
  // 1. YuE חינמי (שירה אמיתית!)
  if (config.HF_TOKEN) {
    try {
      return { ...(await songYue(lyricsEn, styleEn)), styleEn };
    } catch (e) {
      console.warn('YuE fail:', e.message);
      if (e.message === 'HF_UNAUTHORIZED') throw new Error('HF_UNAUTHORIZED');
      if (!config.POLLINATIONS_API_KEY) throw new Error('NO_KEY');
    }
  }
  // 2. גיבוי Pollinations
  const out = await viaPollinations(`${styleEn}. Song lyrics:\n${lyricsEn.slice(0, 1000)}`, dur);
  return { ...out, styleEn };
}
