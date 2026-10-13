/**
 * חיפוש שירים / סרטונים — מחזיר קישורי YouTube חוקיים בלבד (לא הורדה פיראטית).
 * 1. אם יש YOUTUBE_API_KEY — משתמש ב-YouTube Data API v3 הרשמי.
 * 2. אחרת — yt-search (חינמי, בלי מפתח).
 */
import { config } from './config.js';

async function searchOfficial(query, max = 3) {
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${max}` +
    `&q=${encodeURIComponent(query)}&key=${encodeURIComponent(config.YOUTUBE_API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = await res.json();
  return (data.items || []).map((it) => ({
    title: it.snippet?.title || 'ללא כותרת',
    url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
    thumbnail: it.snippet?.thumbnails?.medium?.url || null,
    author: it.snippet?.channelTitle || '',
    duration: '',
  }));
}

async function searchFree(query, max = 3) {
  const { default: yts } = await import('yt-search');
  const r = await yts(query.slice(0, 100));
  return (r.videos || []).slice(0, max).map((v) => ({
    title: v.title,
    url: v.url,
    thumbnail: v.thumbnail || null,
    author: v.author?.name || '',
    duration: v.timestamp || '',
  }));
}

export async function searchYouTube(query, max = 3) {
  const clean = (query || '').toString().trim().slice(0, 100);
  if (clean.length < 2) return [];
  if (config.YOUTUBE_API_KEY) {
    try {
      const out = await searchOfficial(clean, max);
      if (out.length) return out;
    } catch (e) {
      console.warn('YouTube API נכשל, עובר ל-yt-search:', e.message);
    }
  }
  try {
    return await searchFree(clean, max);
  } catch (e) {
    console.warn('yt-search נכשל:', e.message);
    return [];
  }
}

const YT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

async function fetchText(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': YT_UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// דף ערוץ (handle / c / user / URL מלא) → מזהה UC
async function channelIdFromPage(url) {
  const html = await fetchText(url);
  const m = html.match(/externalId":"(UC[^"]+)"/) || html.match(/"browseId":"(UC[^"]+)"/);
  return m ? m[1] : null;
}

/**
 * זיהוי ערוץ יוטיוב מקלט גמיש — מחזיר {id, title} או null:
 * 1. מזהה UC ישיר (גם בתוך קישור)
 * 2. קישור ערוץ / @handle (נשלף מהדף)
 * 3. @handle בלי קישור
 * 4. שם חופשי (גם לא מדויק) — חיפוש ערוצים, התוצאה הראשונה
 */
export async function resolveYouTubeChannel(input) {
  const t = (input || '').toString().trim().slice(0, 150);
  if (t.length < 2) return null;
  // 1. UC ישיר
  const uc = t.match(/UC[A-Za-z0-9_\-]{20,}/);
  if (uc) return { id: uc[0], title: '' };
  // 2. קישור יוטיוב (ערוץ / handle / משתמש)
  const urlM = t.match(/https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+/i);
  if (urlM) {
    try {
      const id = await channelIdFromPage(urlM[0]);
      if (id) return { id, title: '' };
    } catch {}
  }
  // 3. handle מקוצר: @xxx (גם youtu.be/@xxx כבר נתפס למעלה)
  const handleM = t.match(/@([A-Za-z0-9_.\-א-ת]+)/);
  if (handleM) {
    for (const url of [`https://www.youtube.com/@${handleM[1]}`, `https://www.youtube.com/c/${handleM[1]}`, `https://www.youtube.com/user/${handleM[1]}`]) {
      try {
        const id = await channelIdFromPage(url);
        if (id) return { id, title: '' };
      } catch {}
    }
  }
  // 4. שם חופשי — חיפוש ערוץ (גם לא מדויק), בכמה שיטות
  // 4א. yt-search (מהיר, עם שם הערוץ)
  try {
    const { default: yts } = await import('yt-search');
    const r = await yts(t.slice(0, 100));
    const ch = (r.channels || [])[0] || (r.accounts || [])[0];
    if (ch?.id && /^UC[A-Za-z0-9_\-]{10,}/.test(ch.id)) {
      return { id: ch.id, title: ch.name || ch.title || '' };
    }
  } catch (e) {
    console.warn('channel search (yt-search) fail:', e.message?.slice(0, 80));
  }
  // 4ב. דף חיפוש ערוצים בלבד (sp=EgIQAg==) — מכיל channelRenderer בצד השרת
  try {
    const html = await fetchText(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(t.slice(0, 100))}&sp=EgIQAg%3D%3D`
    );
    const m = html.match(/"channelRenderer":\{"channelId":"(UC[^"]+)","title":\{"simpleText":"([^"]{1,80})/)
      || html.match(/"channelRenderer":\{"channelId":"(UC[^"]+)"/);
    if (m) {
      let title = m[2] || '';
      if (!title) {
        const seg = html.slice(m.index, m.index + 1200);
        const rt = seg.match(/"text":"([^"]{1,80})"/);
        if (rt) title = rt[1];
      }
      return { id: m[1], title };
    }
  } catch (e) {
    console.warn('channel search (yt-filter) fail:', e.message?.slice(0, 80));
  }
  // 4ג. DuckDuckGo → קישור ערוץ → זיהוי
  try {
    const body = new URLSearchParams({ q: `${t.slice(0, 80)} youtube channel` });
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 20000);
    let html = '';
    try {
      const res = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'User-Agent': YT_UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (res.ok) html = await res.text();
    } finally {
      clearTimeout(to);
    }
    const link = html.match(/youtube\.com\/(channel\/(UC[A-Za-z0-9_\-]{20,})|(@[A-Za-z0-9_.\-]+)|(?:c|user)\/([A-Za-z0-9_.\-]+))/);
    if (link) {
      if (link[2]) return { id: link[2], title: '' };
      const handle = link[3] || link[4];
      if (handle) {
        try {
          const id = await channelIdFromPage(`https://www.youtube.com/${handle.startsWith('@') ? handle : 'c/' + handle}`);
          if (id) return { id, title: '' };
        } catch {}
      }
    }
  } catch (e) {
    console.warn('channel search (ddg) fail:', e.message?.slice(0, 80));
  }
  return null;
}

export function formatMediaResults(results, label = '🎵') {
  if (!results.length) return '😢 לא מצאתי תוצאות. נסה ניסוח אחר.';
  let msg = `${label} *מצאתי עבורך:*\n\n`;
  results.forEach((r, i) => {
    msg += `${i + 1}. *${r.title}*${r.author ? ` — ${r.author}` : ''}${r.duration ? ` (${r.duration})` : ''}\n🔗 ${r.url}\n\n`;
  });
  msg += '⚖️ קישורים חוקיים ל-YouTube בלבד.';
  return msg.trim();
}
