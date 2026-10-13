/**
 * 🎬 יצירת סרטוני AI דרך JSON2Video (https://json2video.com).
 * סצנות טקסט + קריינות Azure (עברית: AvriNeural). חיוב: ~1 קרדיט לשניית פלט.
 */
import { config } from './config.js';
import { translateText } from './web-search.js';

const API = 'https://api.json2video.com/v2/movies';
const POLL_MS = 5000;
const MAX_WAIT_MS = 6 * 60 * 1000;

function headers() {
  return { 'x-api-key': config.JSON2VIDEO_API_KEY || '', 'Content-Type': 'application/json' };
}

function hasHebrew(s) {
  return /[\u0590-\u05FF]/.test(String(s || ''));
}

/** מחלק טקסט לסצנות קצרות (עד maxScenes, כל אחת עד maxLen תווים). */
export function splitScenes(text, maxScenes = 3, maxLen = 220) {
  const parts = String(text || '')
    .split(/(?<=[.!?。\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const scenes = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > maxLen && cur) {
      scenes.push(cur.trim());
      cur = p;
    } else {
      cur = (cur + ' ' + p).trim();
    }
    if (scenes.length >= maxScenes) break;
  }
  if (cur && scenes.length < maxScenes) scenes.push(cur.trim());
  return scenes.slice(0, maxScenes).filter(Boolean);
}

/** בונה Movie JSON: טקסט + קריינות לכל סצנה, אופציונלית על רקע וידאו אמיתי. */
export function buildMovie(scenes, { voice = true, bgUrl = null } = {}) {
  const heb = scenes.some(hasHebrew);
  return {
    resolution: 'hd',
    cache: true,
    scenes: scenes.map((t) => {
      const dur = Math.min(20, Math.max(5, Math.ceil(t.length / 12) + 1));
      const elements = [];
      if (bgUrl) {
        elements.push({ type: 'video', src: bgUrl, duration: -2, volume: 0.25 });
      }
      elements.push({ type: 'text', text: t.slice(0, 220), style: '001', duration: dur });
      if (voice) {
        elements.push({
          type: 'voice',
          text: t.slice(0, 400),
          model: 'azure',
          ...(heb ? { voice: 'he-IL-AvriNeural' } : {}),
        });
      }
      return { duration: dur, elements };
    }),
  };
}

/** חיפוש פוטג' אמיתי: Pixabay (עם דירוג תגיות!) ואז Pexels. מחזיר URL או null. */
export async function fetchFootage(queryEn) {
  const q = (queryEn || '').slice(0, 80);
  if (!q) return null;
  const qw = q.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  // 1) Pixabay — מדרגים לפי תגיות, לא לוקחים עיוור את הראשון!
  const pb = (config.PIXABAY_API_KEY || '').trim() || '57758893-c79d9c23fa300297d83e4393d';
  if (pb) {
    try {
      const u = `https://pixabay.com/api/videos/?key=${encodeURIComponent(pb)}&q=${encodeURIComponent(q)}&per_page=8&safesearch=true`;
      const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Pixabay ${res.status}`);
      const j = await res.json();
      let best = null, bestScore = 0;
      for (const h of (j?.hits || [])) {
        const tags = String(h?.tags || '').toLowerCase();
        let s = 0;
        for (const w of qw) if (tags.includes(w)) s += 2;
        if (String(h?.type || '') === 'film') s += 1;
        const v = h?.videos || {};
        const url = v.medium?.url || v.large?.url || v.small?.url;
        if (url && s > bestScore) { bestScore = s; best = url; }
      }
      if (best) { console.log(`🎬 footage scored: ${bestScore}pts`); return best; }
      console.warn('pixabay: אין התאמת תגיות — מדלגים הלאה');
    } catch (e) {
      console.warn('pixabay fail:', (e.message || '').slice(0, 120));
    }
  }
  // 2) Pexels (גיבוי)
  const px = (config.PEXELS_API_KEY || '').trim();
  if (px) {
    try {
      const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=3&orientation=landscape&size=medium`;
      const res = await fetch(u, { headers: { Authorization: px }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Pexels ${res.status}`);
      const j = await res.json();
      for (const v of (j?.videos || [])) {
        const files = (v?.video_files || []).filter((f) => f.link && f.width >= 1280);
        files.sort((a, b) => a.width - b.width);
        if (files[0]?.link) return files[0].link;
      }
      const any = j?.videos?.[0]?.video_files?.find((f) => f.link);
      if (any?.link) return any.link;
    } catch (e) {
      console.warn('pexels fail:', (e.message || '').slice(0, 120));
    }
  }
  return null;
}

/** תרגום קצר לאנגלית לחיפוש פוטג' (נכשל בשקט). */
async function toEnglish(text) {
  if (!hasHebrew(text)) return text;
  try {
    return await translateText(text, 'en');
  } catch {
    return text;
  }
}

/* ---------- 🏆 וידאו AI פרימיום (Vivideo: Veo/Sora/Kling — רינדור מלא בתשלום) ---------- */
const VIVIDEO_API = 'https://api.vivideo.ai';
const VIVIDEO_WAIT_MS = 6 * 60 * 1000;
async function vivideoTextToVideo(promptEn) {
  const key = (config.VIVIDEO_API_KEY || '').trim();
  if (!key) return null; // לא מוגדר — מדלגים בשקט
  const create = await fetch(`${VIVIDEO_API}/v1/videos`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
    body: JSON.stringify({
      mode: 'manual', model: 'veo31_fast',
      prompt: promptEn.slice(0, 500),
      duration_seconds: 4, resolution: '720p', aspect_ratio: '16:9',
    }),
    signal: AbortSignal.timeout(60000),
  });
  const cj = await create.json().catch(() => ({}));
  if (!create.ok || !cj.id) {
    throw new Error(`Vivideo create: ${cj?.error?.message || create.status}`);
  }
  if (cj.status === 'preview') throw new Error('Vivideo preview-only (free plan)');
  const wait = Math.max(3000, (cj.poll_interval_seconds || 5) * 1000);
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, wait));
    const s = await fetch(`${VIVIDEO_API}/v1/videos/${cj.id}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
    });
    const sj = await s.json().catch(() => ({}));
    const st = sj.status || sj.video?.status;
    if (st === 'completed' && (sj.video_url || sj.video?.video_url)) {
      return { url: sj.video_url || sj.video.video_url, duration: sj.duration_seconds || sj.duration || 4 };
    }
    if (st === 'failed') throw new Error(`Vivideo render failed: ${(sj.error?.message || '').slice(0, 100)}`);
    if (Date.now() - t0 > VIVIDEO_WAIT_MS) throw new Error('Vivideo timeout');
  }
}

/* ---------- 🎥 וידאו-AI אמיתי (LTX-Video, חינמי, בלי מפתח) ---------- */
const LTX_SPACE = 'https://lightricks-ltx-video-distilled.hf.space';
const LTX_WAIT_MS = 6 * 60 * 1000;
async function ltxTextToVideo(promptEn, seconds = 3) {
  const session = Math.random().toString(36).slice(2);
  const join = await fetch(`${LTX_SPACE}/gradio_api/queue/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [promptEn.slice(0, 400), 'worst quality, inconsistent motion, blurry, jittery, distorted',
        null, null, 512, 704, 'text-to-video', seconds, 9, 42, true, 3, true],
      event_data: null, fn_index: 4, session_hash: session,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!join.ok) throw new Error(`LTX join ${join.status}`);
  const res = await fetch(`${LTX_SPACE}/gradio_api/queue/data?session_hash=${session}`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`LTX stream ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > LTX_WAIT_MS) { try { reader.cancel(); } catch {} throw new Error('LTX timeout'); }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const ln of lines) {
      if (!ln.startsWith('data: ')) continue;
      let ev;
      try { ev = JSON.parse(ln.slice(6)); } catch { continue; }
      if (ev.msg === 'process_completed') {
        try { reader.cancel(); } catch {}
        const url = ev.output?.data?.[0]?.video?.url || ev.output?.data?.[0]?.url;
        if (url) return { url: String(url), duration: seconds };
        throw new Error('LTX: אין URL בתוצאה');
      }
      if (ev.msg === 'process_failed' || ev.msg === 'error') {
        throw new Error(`LTX failed: ${JSON.stringify(ev).slice(0, 120)}`);
      }
    }
  }
  throw new Error('LTX: הסתיים בלי תוצאה');
}

async function apiPost(body) {
  const res = await fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.success) {
    throw new Error(`JSON2Video create ${res.status}: ${(j.message || j.error || 'unknown').toString().slice(0, 140)}`);
  }
  if (!j.project) throw new Error('JSON2Video: אין project בתשובה');
  return j.project;
}

async function apiStatus(project) {
  const res = await fetch(`${API}?project=${encodeURIComponent(project)}`, { headers: headers() });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`JSON2Video status ${res.status}`);
  return j.movie || {};
}

/**
 * יוצר סרטון מטקסט — מחזיר {url, duration}. עם קריינות; אם הקריינות נכשלת — ניסיון חוזר בלי קול.
 */
export async function createAIVideo(text, opts = {}) {
  const scenes = splitScenes(text, opts.maxScenes || 3, opts.maxLen || 220);
  if (!scenes.length) throw new Error('תיאור קצר מדי — כתוב למשל: !צור-סרטון חתול שמטייל בעיר');
  // מסלול 1: פוטג' אמיתי + קריינות (תנועה אמיתית — הכי טוב כשיש קליפ מתאים)
  if (!opts.slidesOnly) {
    try {
      const enF = await toEnglish(scenes[0]);
      const bg = await fetchFootage(enF);
      if (bg) {
        console.log('🎬 footage:', bg.slice(0, 90));
        const project = await apiPost(buildMovie(scenes, { voice: true, bgUrl: bg }));
        const t0 = Date.now();
        for (;;) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          const m = await apiStatus(project);
          if (m.status === 'done' && m.url) return { url: m.url, duration: m.duration || 0 };
          if (m.status === 'error' || m.status === 'timeout') throw new Error(`render ${m.status}`);
          if (Date.now() - t0 > MAX_WAIT_MS) throw new Error('timeout');
        }
      }
    } catch (e) {
      console.warn('footage path fail:', (e.message || '').slice(0, 120));
    }
  // מסלול 2: Vivideo פרימיום (Veo — אם החשבון מאפשר רינדור)
  try {
    const en0 = await toEnglish(scenes.join(' ').slice(0, 300));
    const r0 = await vivideoTextToVideo(en0);
    if (r0) { console.log('🎬 Vivideo ok'); return r0; }
  } catch (e) {
    console.warn('Vivideo skip:', (e.message || '').slice(0, 120));
  }
  // מסלול 3: וידאו-AI מג'ונרט (LTX) — עם פעלים של תנועה
  try {
    const rawJoin = scenes.join(' ').trim().replace(/^(של|את|על|עם|ל)\s+/, '');
    const enBase = await toEnglish(rawJoin.slice(0, 300));
    const en = `${enBase}, cinematic, photorealistic, highly detailed, natural motion, walking, moving, dynamic action, camera slowly moving`;
    console.log('🎬 LTX prompt:', en.slice(0, 140));
    const r = await ltxTextToVideo(en, 5);
    console.log('🎬 LTX ok:', r.url.slice(0, 80));
    return r;
  } catch (e) {
    console.warn('LTX fail, עובר ל-json2video:', (e.message || '').slice(0, 140));
  }
  }
  // מסלול 4 (גיבוי): שקופיות טקסט + קריינות
  const combos = [{ voice: true }, { voice: false }];
  let lastErr = null;
  for (const c of combos) {
    try {
      const project = await apiPost(buildMovie(scenes, c));
      const t0 = Date.now();
      for (;;) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const m = await apiStatus(project);
        if (m.status === 'done' && m.url) return { url: m.url, duration: m.duration || 0 };
        if (m.status === 'error' || m.status === 'timeout') throw new Error(`render ${m.status}: ${(m.message || '').toString().slice(0, 120)}`);
        if (Date.now() - t0 > MAX_WAIT_MS) throw new Error('הרינדור לוקח יותר מ-6 דקות — נסה טקסט קצר יותר');
      }
    } catch (e) {
      lastErr = e;
      console.warn('json2video try fail:', (e.message || '').slice(0, 140));
    }
  }
  throw lastErr || new Error('יצירת הסרטון נכשלה');
}
