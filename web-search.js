/**
 * חיפושים וכלים חינמיים — בלי מפתח בכלל (נבדק ועובד ✅):
 * - חיפוש ווב (DuckDuckGo + ויקיפדיה + קישור גוגל)
 * - חיפוש תמונות (Openverse — רישיונות פתוחים)
 * - ויקיפדיה בעברית
 * - תרגום (MyMemory)
 * - מזג אוויר (open-meteo, גיבוי wttr.in)
 * - מחשבון מקומי
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');

/* ---------- תרגום (גם לשימוש פנימי: עברית→אנגלית לשירותים) ---------- */
export async function translateText(text, target = 'auto') {
  const clean = (text || '').toString().trim().slice(0, 500);
  if (!clean) return '';
  let pair = 'he|en';
  if (target === 'he') pair = 'en|he';
  else if (target === 'en') pair = 'he|en';
  else pair = hasHebrew(clean) ? 'he|en' : 'en|he';
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(clean)}&langpair=${pair}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Translate ${res.status}`);
  const j = await res.json();
  const out = j?.responseData?.translatedText?.trim();
  if (!out) throw new Error('תרגום ריק');
  return out;
}

/* ---------- ויקיפדיה ---------- */
async function wikiBestTitle(query, lang) {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json&origin=*`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const j = await res.json();
    return j?.[1]?.[0] || null;
  } catch {
    return null;
  }
}

async function wikiFetch(title, lang) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j?.extract || j.type === 'disambiguation') return null;
  return {
    title: j.title || title,
    extract: j.extract.slice(0, 600),
    url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

export async function wikiSummary(query) {
  const clean = (query || '').toString().trim().slice(0, 100);
  if (clean.length < 2) return null;
  for (const lang of ['he', 'en']) {
    // קודם ניסיון ישיר, ואז חיפוש כותרת קרובה
    const hit = await wikiFetch(clean, lang);
    if (hit) return hit;
    const best = await wikiBestTitle(clean, lang);
    if (best && best !== clean) {
      const hit2 = await wikiFetch(best, lang);
      if (hit2) return hit2;
    }
  }
  return null;
}

/* ---------- חיפוש ווב ---------- */
export async function searchWeb(query) {
  const clean = (query || '').toString().trim().slice(0, 100);
  if (clean.length < 2) return 'כתוב מה לחפש. דוגמה: !גוגל מי המציא את הטלפון';
  // 1. תשובה מיידית מ-DuckDuckGo
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(clean)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const j = await res.json();
    const abs = (j?.AbstractText || '').trim();
    if (abs) {
      return `🔍 *${clean}*\n\n${abs.slice(0, 600)}\n\n🔗 מקור: ${j.AbstractURL || ''}\n🔗 גוגל: https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    }
  } catch {}
  // 2. גיבוי: ויקיפדיה
  const wiki = await wikiSummary(clean);
  if (wiki) {
    return `🔍 *${wiki.title}*\n\n${wiki.extract}\n\n🔗 ${wiki.url}\n🔗 גוגל: https://www.google.com/search?q=${encodeURIComponent(clean)}`;
  }
  // 3. גיבוי: תשובת AI + קישור חיפוש (לשאלות כלליות)
  try {
    const { chatAI } = await import('./ai-chat.js');
    const { text } = await chatAI(`ענה בקצרה (עד 4 שורות) בעברית: ${clean}`);
    if (text && !text.includes('נכשלו')) {
      return `🔍 *${clean}*\n\n${text.slice(0, 600)}\n\n🔗 גוגל: https://www.google.com/search?q=${encodeURIComponent(clean)}`;
    }
  } catch {}
  // 4. לפחות קישור חיפוש
  return `🔍 לא מצאתי תקציר, אבל הנה חיפוש מוכן:\n🔗 https://www.google.com/search?q=${encodeURIComponent(clean)}`;
}

/* ---------- חיפוש תמונות (רישיונות פתוחים) ---------- */
export async function searchImages(query, max = 3) {
  let clean = (query || '').toString().trim().slice(0, 100);
  if (clean.length < 2) return [];
  // Openverse עובד טוב יותר באנגלית — מתרגמים אוטומטית
  if (hasHebrew(clean)) {
    try {
      clean = await translateText(clean, 'en');
    } catch {}
  }
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(clean)}&page_size=${max}&filter_dead=true`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Images ${res.status}`);
  const j = await res.json();
  return (j?.results || []).map((r) => ({
    title: r.title || clean,
    url: r.url, // קובץ התמונה הישיר
    page: r.foreign_landing_url || r.url,
    author: r.creator || '',
  })).filter((r) => r.url);
}

/* ---------- מזג אוויר ---------- */
const WMO_HE = {
  0: 'בהיר ☀️', 1: 'מעונן חלקית ⛅', 2: 'מעונן חלקית ⛅', 3: 'מעונן ☁️',
  45: 'ערפל 🌫️', 48: 'ערפל כבד 🌫️', 51: 'טפטוף 🌦️', 53: 'טפטוף 🌦️',
  55: 'טפטוף כבד 🌦️', 56: 'טפטוף קפוא 🌧️', 57: 'טפטוף קפוא 🌧️',
  61: 'גשם קל 🌧️', 63: 'גשם 🌧️', 65: 'גשם כבד ⛈️',
  66: 'גשם קפוא 🌧️', 67: 'גשם קפוא 🌧️', 71: 'שלג קל 🌨️',
  73: 'שלג 🌨️', 75: 'שלג כבד 🌨️', 77: 'גשמי שלג 🌨️',
  80: 'ממטרים קלים 🌦️', 81: 'ממטרים 🌦️', 82: 'ממטרים עזים ⛈️',
  85: 'ממטרי שלג 🌨️', 86: 'ממטרי שלג 🌨️', 95: 'סופת רעמים ⛈️',
  96: 'סופה עם ברד ⛈️', 99: 'סופה עם ברד ⛈️',
};

export async function getWeather(city) {
  const clean = (city || '').toString().trim().slice(0, 60);
  if (clean.length < 2) throw new Error('איזו עיר? דוגמה: !מזג תל אביב');
  // גיאוקוד: מנסים מקור, ואז מתורגם לאנגלית
  let geo = null;
  const tries = [clean];
  if (hasHebrew(clean)) {
    try {
      tries.push(await translateText(clean, 'en'));
    } catch {}
  }
  for (const t of tries) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=1&language=he&format=json`);
      const j = await r.json();
      if (j?.results?.[0]) {
        geo = j.results[0];
        break;
      }
    } catch {}
  }
  if (!geo) throw new Error(`לא מצאתי את העיר "${clean}"`);
  const f = await (await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
  )).json();
  const c = f.current;
  const d = f.daily;
  const desc = WMO_HE[c.weather_code] || '—';
  return (
    `🌤️ *מזג אוויר — ${geo.name}*${geo.country ? `, ${geo.country}` : ''}\n\n` +
    `${desc}\n` +
    `🌡️ עכשיו: ${Math.round(c.temperature_2m)}° (מקס׳ היום ${Math.round(d.temperature_2m_max[0])}° / מינ׳ ${Math.round(d.temperature_2m_min[0])}°)\n` +
    `💧 לחות: ${c.relative_humidity_2m}% | 💨 רוח: ${Math.round(c.wind_speed_10m)} קמ״ש`
  );
}

/* ---------- מחשבון ---------- */
export function calc(expr) {
  const clean = (expr || '').toString().trim().slice(0, 100)
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().%\s*]+$/.test(clean) || !/\d/.test(clean)) {
    throw new Error('ביטוי לא חוקי. דוגמה: !חשב (150*1.17)+20');
  }
  // eslint-disable-next-line no-new-func
  const val = Function(`"use strict"; return (${clean})`)();
  if (typeof val !== 'number' || !isFinite(val)) throw new Error('לא ניתן לחשב');
  return `🧮 ${expr.trim()} = *${Number(val.toFixed(4))}*`;
}
