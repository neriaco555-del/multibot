/**
 * 🎙️ מדיה מתקדמת:
 * - תמלול הקלטות לעברית (Groq Whisper, חינמי ✅ נבדק)
 * - תיאור תמונה (דורש מפתח Pollinations — ראייה לא זמינה בחינמי)
 * - חיתוך אודיו (ffmpeg מקומי ✅)
 * - שינוי קול: גברי/נשי (ffmpeg pitch ✅)
 * - הורדת אודיו מיוטיוב (best-effort + קישור גיבוי)
 * - וידאו AI (דורש מפתח Pollinations)
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';

const execFileAsync = promisify(execFile);

/* ---------- תמלול (Groq Whisper) ---------- */
export async function transcribeAudio(buffer, filename = 'voice.ogg') {
  if (!config.GROQ_API_KEY) throw new Error('אין מפתח Groq');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: 'audio/ogg' }), filename);
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', 'he');
  fd.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.GROQ_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper ${res.status}`);
  const j = await res.json();
  const text = (j?.text || '').trim();
  if (!text) throw new Error('לא זוהה דיבור');
  return text;
}

/* ---------- תיאור תמונה (Vision: Groq חינמי קודם, Pollinations גיבוי) ---------- */
async function toVisionJpeg(imageBuffer) {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(imageBuffer)
      .rotate()
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    return imageBuffer;
  }
}
const POLLEN_RE = /pollen|top[\s-]?up|insufficient|balance|credits/i;
export async function describeImage(imageBuffer, question = '') {
  const jpg = await toVisionJpeg(imageBuffer);
  const b64 = jpg.toString('base64');
  const mime = 'image/jpeg';
  const prompt = question
    ? `ענה בעברית על השאלה הבאה לגבי התמונה: ${question.slice(0, 300)}`
    : 'תאר את התמונה בעברית ב-3-4 שורות: מה רואים, צבעים, אווירה.';
  // 1) Groq חינמי (נבדק ועובד)
  if (config.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64.slice(0, 500000)}` } },
          ] }],
          max_tokens: 500, temperature: 0.3,
        }),
      });
      if (!res.ok) throw new Error(`Groq-vision ${res.status}`);
      const j = await res.json();
      const text = j?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('תיאור ריק');
      return text;
    } catch (e) {
      console.warn('Groq vision נכשל, עובר הלאה:', (e.message || '').slice(0, 100));
    }
  }
  // 2) Pollinations (דורש יתרה)
  if (config.POLLINATIONS_API_KEY) {
    const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.POLLINATIONS_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen/qwen3-vl-30b-a3b-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64.slice(0, 400000)}` } },
          ],
        }],
        max_tokens: 400,
      }),
    });
    if (!res.ok) throw new Error(`Vision ${res.status}`);
    const j = await res.json();
    const text = j?.choices?.[0]?.message?.content?.trim();
    if (!text || POLLEN_RE.test(text)) throw new Error('שירות התיאור זמנית לא זמין');
    return text;
  }
  throw new Error('NO_VISION_KEY');
}
export const VISION_KEY_HELP =
  `👁️ *תיאור תמונות דורש מפתח Pollinations (חינם):*\n` +
  `הירשם ב-https://enter.pollinations.ai והוסף ל-.env:\nPOLLINATIONS_API_KEY=sk_...`;

/* ---------- חיתוך אודיו ---------- */
export async function trimAudio(buffer, seconds = 30, ext = 'ogg') {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'trim-'));
  try {
    const inp = path.join(dir, `in.${ext}`);
    const out = path.join(dir, 'out.ogg');
    await fs.promises.writeFile(inp, buffer);
    await execFileAsync('ffmpeg', ['-y', '-i', inp, '-t', String(seconds), '-c:a', 'libopus', '-b:a', '48k', out]);
    return await fs.promises.readFile(out);
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- שינוי גובה קול (factor>1 נשי/גבוה, <1 גברי/נמוך) ---------- */
export async function pitchVoice(oggBuffer, factor = 1.2) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pitch-'));
  try {
    const inp = path.join(dir, 'in.ogg');
    const out = path.join(dir, 'out.ogg');
    await fs.promises.writeFile(inp, oggBuffer);
    await execFileAsync('ffmpeg', [
      '-y', '-i', inp, '-filter:a',
      `asetrate=24000*${factor},aresample=24000,atempo=1/${factor}`,
      '-c:a', 'libopus', '-b:a', '48k', out,
    ]);
    return await fs.promises.readFile(out);
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- הורדת אודיו מיוטיוב (yt-dlp — הכי אמין, מתעדכן תמיד) ---------- */
function ytDlpBin() {
  const home = os.homedir();
  for (const p of [`${home}/.local/bin/yt-dlp`, '/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', 'yt-dlp']) {
    try {
      if (!p.includes('/') || fs.existsSync(p)) return p;
    } catch {}
  }
  return 'yt-dlp';
}

export async function downloadYouTubeAudio(videoUrl, maxMB = 30) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdl-'));
  try {
    // 1. כותרת בלבד (מהיר, בלי הורדה)
    let title = 'song';
    try {
      const meta = await execFileAsync(
        ytDlpBin(),
        ['--skip-download', '--no-playlist', '--no-warnings', '--print', '%(title)s', videoUrl],
        { timeout: 60000, maxBuffer: 1024 * 1024 }
      );
      title = (meta.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || title;
    } catch {}
    // 2. הורדה + המרה ל-MP3 (עם ניסיונות חוזרים)
    await execFileAsync(
      ytDlpBin(),
      [
        '-x', '--audio-format', 'mp3', '--audio-quality', '128K',
        '--no-playlist', '--max-filesize', `${maxMB}M`,
        '--no-warnings', '--retries', '3', '--fragment-retries', '3',
        '--socket-timeout', '30',
        '-o', path.join(dir, 'song.%(ext)s'), videoUrl,
      ],
      { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
    );
    const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.mp3'));
    if (!files.length) throw new Error('NO_FILE');
    const buf = await fs.promises.readFile(path.join(dir, files[0]));
    if (!buf.length || buf.length < 10000) throw new Error('EMPTY_FILE');
    return { buffer: buf, title: title.slice(0, 80), mime: 'audio/mpeg' };
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- הורדת וידאו מיוטיוב (MP4 עם וידאו מובטח, ניסיונות 720→480→360) ---------- */
export async function downloadYouTubeVideo(videoUrl, maxMB = 50) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdlv-'));
  try {
    // 1. כותרת בלבד (מהיר, בלי הורדה)
    let title = 'video';
    try {
      const meta = await execFileAsync(
        ytDlpBin(),
        ['--skip-download', '--no-playlist', '--no-warnings', '--print', '%(title)s', videoUrl],
        { timeout: 60000, maxBuffer: 1024 * 1024 }
      );
      title = (meta.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || title;
    } catch {}
    // 2. הורדה פרוגרסיבית: 720p, ואם גדול מדי — 480p, ואז 360p.
    // פורמט מכריח וידאו (בלי /b סופי שעלול לבחור אודיו-בלבד!) + אימות עם ffprobe.
    let lastErr = new Error('NO_VIDEO');
    for (const h of [720, 480, 360]) {
      const sub = path.join(dir, `h${h}`);
      await fs.promises.mkdir(sub, { recursive: true });
      try {
        await execFileAsync(
          ytDlpBin(),
          [
            '-f', `bv*[height<=${h}]+ba/b[height<=${h}]`,
            '--merge-output-format', 'mp4',
            '--no-playlist', '--max-filesize', `${maxMB}M`,
            '--no-warnings', '--retries', '3', '--fragment-retries', '3',
            '--socket-timeout', '30',
            '-o', path.join(sub, 'video.%(ext)s'), videoUrl,
          ],
          { timeout: 240000, maxBuffer: 10 * 1024 * 1024 }
        );
        const files = (await fs.promises.readdir(sub)).filter((f) => f.toLowerCase().endsWith('.mp4'));
        if (!files.length) throw new Error('NO_FILE');
        const fp = path.join(sub, files[0]);
        const buf = await fs.promises.readFile(fp);
        if (!buf.length || buf.length < 50000) throw new Error('EMPTY_FILE');
        if (buf.length > maxMB * 1024 * 1024) throw new Error('TOO_BIG');
        // אימות: חייב להכיל stream וידאו (לא אודיו-בלבד!)
        try {
          const probe = await execFileAsync(
            'ffprobe',
            ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', fp],
            { timeout: 30000, maxBuffer: 1024 * 1024 }
          );
          if (!String(probe.stdout || '').includes('video')) throw new Error('NO_VIDEO');
        } catch (e) {
          if (e.message === 'NO_VIDEO') throw e;
          // אין ffprobe? ממשיכים — הסיומת mp4 אחרי merge מעידה על וידאו
        }
        return { buffer: buf, title: title.slice(0, 80), mime: 'video/mp4' };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
/* ---------- וידאו AI (דורש מפתח) ---------- */
export const VIDEO_KEY_HELP =
  `🎬 *וידאו AI דורש מפתח Pollinations (חינם):*\n` +
  `הירשם ב-https://enter.pollinations.ai והוסף ל-.env:\nPOLLINATIONS_API_KEY=sk_...`;
export async function generateVideo() {
  if (!config.POLLINATIONS_API_KEY) throw new Error('NO_KEY');
  throw new Error('VIDEO_NOT_WIRED');
}
