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
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
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
  // 2) Gemini (חינמי — נותן גיבוי כש-Groq חוטף 429)
  if (config.GEMINI_API_KEY) {
    try {
      const model = config.GEMINI_MODEL || 'gemini-3.5-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mime, data: b64 } },
              ],
            }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.3, thinkingConfig: { thinkingBudget: 0 } },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini-vision ${res.status}`);
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        ?.map((p) => p.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('תיאור ריק');
      return text;
    } catch (e) {
      console.warn('Gemini vision נכשל, עובר הלאה:', (e.message || '').slice(0, 100));
    }
  }
  // 3) Pollinations (דורש יתרה)
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
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
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
/* ---------- הורדת וידאו מכל אתר/קישור ש-yt-dlp תומך בו ---------- */
export async function downloadVideoFromUrl(videoUrl, maxMB = 15) {
  const url = String(videoUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('BAD_URL');
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ytdlu-'));
  try {
    // 1) קישור ישיר לקובץ וידאו (mp4/mkv/webm/mov) — ניסיון הורדה ישיר ומהיר
    if (/\.(mp4|mkv|webm|mov|m4v)(\?|#|$)/i.test(url)) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
        const ct = String(res.headers.get('content-type') || '');
        const len = Number(res.headers.get('content-length') || 0);
        if (res.ok && (ct.includes('video') || ct.includes('octet-stream')) && len > 50000 && len <= maxMB * 1024 * 1024) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length > 50000) {
            const nm = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'video');
            return { buffer: buf, title: nm.slice(0, 80), mime: ct.split(';')[0] || 'video/mp4' };
          }
        }
      } catch {}
    }
    // 2) כותרת בלבד
    let title = 'video';
    try {
      const meta = await execFileAsync(
        ytDlpBin(),
        ['--skip-download', '--no-playlist', '--no-warnings', '--print', '%(title)s', url],
        { timeout: 60000, maxBuffer: 1024 * 1024 }
      );
      title = (meta.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || title;
    } catch {}
    // 3) הורדה דרך yt-dlp — קודם איכות קטנה וקודק WhatsApp (H.264/AAC), ואז נמוך יותר
    const attempts = [
      ['-f', 'bv*[height<=480][vcodec^=avc1]+ba[acodec^=mp4a][abr<=64]/b[height<=480][ext=mp4]/b[height<=480]'],
      ['-f', 'bv*[height<=360]+ba[abr<=64]/ba/b[height<=360]'],
      ['-f', 'bv*[height<=240]+ba[abr<=64]/ba/b[height<=240]'],
      ['-f', 'bv*[height<=144]+ba[abr<=48]/ba/b[height<=144]'],
      ['-f', 'b'],
    ];
    let lastErr = new Error('DOWNLOAD_FAILED');
    for (let a = 0; a < attempts.length; a++) {
      const sub = path.join(dir, `a${a}`);
      await fs.promises.mkdir(sub, { recursive: true });
      try {
        await execFileAsync(
          ytDlpBin(),
          [
            ...attempts[a],
            '--merge-output-format', 'mp4',
            '--no-playlist', '--max-filesize', `${maxMB}M`,
            '--no-warnings', '--retries', '2', '--fragment-retries', '2',
            '--socket-timeout', '30', '--concurrent-fragments', '4',
            '-o', path.join(sub, 'video.%(ext)s'), url,
          ],
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
        );
        const files = (await fs.promises.readdir(sub)).filter((f) => /\.(mp4|mkv|webm|mov|m4v)$/i.test(f));
        if (!files.length) throw new Error('NO_FILE');
        let fp = path.join(sub, files[0]);
        // אימות קודקים — WhatsApp הכי יציב עם H.264 + AAC
        let vcodec = '';
        let acodec = '';
        try {
          const vp = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', fp], { timeout: 30000, maxBuffer: 1024 * 1024 });
          vcodec = String(vp.stdout || '').trim().split('\n')[0];
          const ap = await execFileAsync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', fp], { timeout: 30000, maxBuffer: 1024 * 1024 });
          acodec = String(ap.stdout || '').trim().split('\n')[0];
        } catch {}
        if (vcodec && (vcodec !== 'h264' || (acodec && acodec !== 'aac'))) {
          const out = path.join(sub, 'wa.mp4');
          await execFileAsync('ffmpeg', [
            '-y', '-i', fp,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
            '-vf', 'scale=trunc(min(640\\,iw)/2)*2:-2',
            '-c:a', 'aac', '-b:a', '96k',
            '-movflags', '+faststart',
            out,
          ], { timeout: 240000, maxBuffer: 10 * 1024 * 1024 });
          fp = out;
        }
        const buf = await fs.promises.readFile(fp);
        if (!buf.length || buf.length < 50000) throw new Error('EMPTY_FILE');
        if (buf.length > maxMB * 1024 * 1024) throw new Error('TOO_BIG');
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
/* ---------- העלאת קובץ גדול לשירות אירוח זמני (Litterbox) וקבלת קישור ---------- */
export async function uploadToLitterbox(buffer, filename = 'video.mp4', time = '72h') {
  if (!buffer || buffer.length < 1000) throw new Error('EMPTY_FILE');
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('time', time);
  fd.append('fileToUpload', new Blob([buffer], { type: 'video/mp4' }), String(filename || 'video.mp4'));
  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: fd,
    signal: AbortSignal.timeout(600000),
  });
  const text = (await res.text()).trim();
  if (!/^https?:\/\//i.test(text)) throw new Error(`LITTERBOX: ${text.slice(0, 120)}`);
  return text;
}

/* ---------- דחיסת וידאו לגודל קטן כדי לעבור העלאה בוואטסאפ ---------- */
export async function compressVideoForWhatsApp(buffer, targetMB = 2) {
  if (!buffer || buffer.length < 1000) throw new Error('EMPTY_FILE');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wacompress-'));
  try {
    const input = path.join(dir, 'in.mp4');
    await fs.promises.writeFile(input, buffer);
    let dur = 0;
    try {
      const p = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input], { timeout: 30000, maxBuffer: 1024 * 1024 });
      dur = parseFloat(String(p.stdout || '').trim()) || 0;
    } catch {}
    // סרטון ארוך מדי לא יכול להיכנס ל-2MB באיכות סבירה
    if (dur > 480) throw new Error('TOO_LONG_TO_COMPRESS');

    const encode = async (height, fps, audioKbps, factor) => {
      const targetBits = Math.max(70000, Math.floor(targetMB * 8 * 1024 * 1024 * 0.82 * factor));
      const totalKbps = dur > 0 ? Math.max(60, Math.floor(targetBits / dur / 1000)) : 500;
      const videoKbps = Math.max(24, totalKbps - audioKbps);
      const out = path.join(dir, `out-${height}-${fps}.mp4`);
      await execFileAsync('ffmpeg', [
        '-y', '-i', input,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${videoKbps}k`,
        '-maxrate', `${Math.max(50, Math.floor(videoKbps * 1.3))}k`,
        '-bufsize', `${Math.max(120, videoKbps * 2)}k`,
        '-r', String(fps),
        '-vf', `scale=trunc(min(${height}\\,iw)/2)*2:-2`,
        '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '1',
        '-movflags', '+faststart',
        out,
      ], { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      const b = await fs.promises.readFile(out);
      if (!b.length || b.length < 20000) throw new Error('COMPRESS_EMPTY');
      return b;
    };

    let buf = await encode(480, 24, 40, 1);
    const limit = targetMB * 1024 * 1024;
    if (buf.length > limit * 1.15) buf = await encode(360, 20, 24, 0.65);
    if (buf.length > limit * 1.3) throw new Error('TOO_BIG_TO_COMPRESS');
    return { buffer: buf, mime: 'video/mp4' };
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ---------- העלאה לגיבוי קבוע (Catbox) אם Litterbox נכשל ---------- */
export async function uploadToCatbox(buffer, filename = 'video.mp4') {
  if (!buffer || buffer.length < 1000) throw new Error('EMPTY_FILE');
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([buffer], { type: 'video/mp4' }), String(filename || 'video.mp4'));
  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: fd,
    signal: AbortSignal.timeout(600000),
  });
  const text = (await res.text()).trim();
  if (!/^https?:\/\//i.test(text)) throw new Error(`CATBOX: ${text.slice(0, 120)}`);
  return text;
}

/* ---------- קישור הורדה ישיר (גיבוי כשהוואטסאפ לא מצליח להעלות קובץ) ---------- */
export async function resolveMediaUrls(videoUrl) {
  const url = String(videoUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return [];
  try {
    const { stdout } = await execFileAsync(
      ytDlpBin(),
      ['-g', '-f', 'b[height<=720][ext=mp4]/b[height<=720]/b', '--no-playlist', '--no-warnings', '--socket-timeout', '20', url],
      { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }
    );
    return String(stdout || '').split('\n').map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
  } catch {
    return [];
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
