/**
 * דיבור (TTS) בעברית — בלי מפתח:
 * Google Translate TTS (נבדק ✅) → המרה ל-OGG/Opus עם ffmpeg,
 * כי הודעות קוליות בוואטסאפ חייבות Opus כדי להתנגן.
 *
 * מחזיר Buffer של OGG מוכן לשליחה עם ptt:true.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function splitHebrew(text, max = 180) {
  const parts = [];
  const sentences = text.split(/(?<=[.!?;:\n])\s+/);
  let cur = '';
  for (const s of sentences) {
    if ((cur + ' ' + s).trim().length <= max) {
      cur = (cur + ' ' + s).trim();
    } else {
      if (cur) parts.push(cur);
      if (s.length <= max) {
        cur = s;
      } else {
        const words = s.split(/\s+/);
        cur = '';
        for (const w of words) {
          if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
          else {
            if (cur) parts.push(cur);
            cur = w;
          }
        }
      }
    }
  }
  if (cur) parts.push(cur);
  return parts.filter(Boolean).slice(0, 5); // מקסימום ~900 תווים
}

async function gttsChunk(text) {
  const url =
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=iw&q=' +
    encodeURIComponent(text);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Google TTS ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length < 500) throw new Error('Google TTS ריק');
  return buf;
}

export async function textToSpeech(text) {  const clean = (text || '').toString().trim().slice(0, 900);
  if (clean.length < 2) throw new Error('טקסט קצר מדי לדיבור');
  const chunks = splitHebrew(clean);
  if (!chunks.length) throw new Error('טקסט קצר מדי לדיבור');

  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tts-'));
  try {
    const files = [];
    for (let i = 0; i < chunks.length; i++) {
      const mp3 = await gttsChunk(chunks[i]);
      const f = path.join(dir, `p${i}.mp3`);
      await fs.promises.writeFile(f, mp3);
      files.push(f);
    }
    const out = path.join(dir, 'voice.ogg');
    const list = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.promises.writeFile(path.join(dir, 'list.txt'), list);
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', path.join(dir, 'list.txt'),
      '-c:a', 'libopus', '-b:a', '48k', '-ar', '24000', '-ac', '1',
      out,
    ]);
    const ogg = await fs.promises.readFile(out);
    if (!ogg.length || ogg.length < 1000) throw new Error('המרה נכשלה');
    return ogg;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export const EDGE_VOICES = {
  male: { id: 'he-IL-AvriNeural', label: 'גברי (אברי)', emoji: '👨' },
  female: { id: 'he-IL-HilaNeural', label: 'נשי (הילה)', emoji: '👩' },
};

/**
 * דיבור נוירלי בעברית (Microsoft Edge — חינם, בלי מפתח).
 * מחזיר OGG/Opus מוכן להודעה קולית. נופל חזרה ל-textToSpeech אצל הקורא.
 */
export async function textToSpeechEdge(text, voiceKey = 'female') {
  const v = EDGE_VOICES[voiceKey] || EDGE_VOICES.female;
  const clean = (text || '').toString().trim().slice(0, 500);
  if (clean.length < 2) throw new Error('טקסט קצר מדי לדיבור');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'edge-'));
  try {
    const mp3 = path.join(dir, 'v.mp3');
    const { EdgeTTS } = await import('node-edge-tts');
    const t = new EdgeTTS({ voice: v.id, lang: 'he-IL', outputFormat: 'audio-24khz-48kbitrate-mono-mp3' });
    await t.ttsPromise(clean, mp3);
    const st = await fs.promises.stat(mp3).catch(() => null);
    if (!st || st.size < 1000) throw new Error('EDGE_EMPTY');
    const out = path.join(dir, 'voice.ogg');
    await execFileAsync('ffmpeg', [
      '-y', '-i', mp3, '-c:a', 'libopus', '-b:a', '48k', '-ar', '24000', '-ac', '1', out,
    ]);
    const ogg = await fs.promises.readFile(out);
    if (!ogg.length || ogg.length < 1000) throw new Error('המרה נכשלה');
    return ogg;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
