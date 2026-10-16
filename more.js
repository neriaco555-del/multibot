/**
 * 🌍 מידע מהעולם + 🎲 כיף מקומי — הכל חינמי, בלי מפתח (נבדק ✅):
 * חיות (תמונות), פוקימון, מט"ח, קריפטו, חדשות, ציטוטים,
 * שעה עולמית (מקומי, בלי רשת!), קוביות, הגרלות, סיסמאות ועוד.
 */
import { translateText } from './web-search.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');

// רשת לפעמים נופלת — 3 ניסיונות עם השהיה קצרה
async function fetchRetry(url, opts = {}, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastErr;
}

/* ---------- חיות ---------- */
const ANIMALS = {
  dog: { url: 'https://dog.ceo/api/breeds/image/random', pick: (j) => j.message, emoji: '🐶', name: 'כלב' },
  cat: { url: 'https://cataas.com/cat?json=true', pick: (j) => 'https://cataas.com' + j.url, emoji: '🐱', name: 'חתול' },
  fox: { url: 'https://randomfox.ca/floof/', pick: (j) => j.image, emoji: '🦊', name: 'שועל' },
};
export async function animalImage(kind) {
  const a = ANIMALS[kind];
  if (!a) throw new Error('חיה לא מוכרת');
  const res = await fetch(a.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('שגיאת רשת');
  const img = a.pick(await res.json());
  if (!img?.startsWith('http')) throw new Error('תמונה ריקה');
  return { imageUrl: img, caption: `${a.emoji} הנה ${a.name} חמוד בשבילך!` };
}

/* ---------- פוקימון ---------- */
const TYPES_HE = {
  normal: 'רגיל', fire: 'אש', water: 'מים', electric: 'חשמל', grass: 'עשב',
  ice: 'קרח', fighting: 'לחימה', poison: 'רעל', ground: 'אדמה', flying: 'מעופף',
  psychic: 'על-חושי', bug: 'חרק', rock: 'סלע', ghost: 'רוח', dragon: 'דרקון',
  dark: 'אופל', steel: 'פלדה', fairy: 'פיה',
};
const POKE_HE = {
  'פיקאצו': 'pikachu', 'פיקצו': 'pikachu', 'צרמנדר': 'charmander', "צ'רמנדר": 'charmander',
  'צרמיליון': 'charmeleon', 'צריזרד': 'charizard', "צ'ריזרד": 'charizard',
  'סקווירטל': 'squirtle', 'וורטורטל': 'wartortle', 'בלסטויז': 'blastoise',
  'בלבזאור': 'bulbasaur', 'איביזאור': 'ivysaur', 'ונוזאור': 'venusaur',
  'קטרפי': 'caterpie', 'פיגי': 'pidgey', 'רטטה': 'rattata', 'ספירו': 'spearow',
  'אקנס': 'ekans', 'סנדשרו': 'sandshrew', 'קלפרי': 'clefairy',
  'וולפיקס': 'vulpix', "ג'יגליפאף": 'jigglypuff', 'זובאט': 'zubat', 'אודיש': 'oddish',
  'דיגלט': 'diglett', 'מיאו': 'meowth', 'סיידאק': 'psyduck', 'גרוליית': 'growlithe',
  'אברה': 'abra', 'מצאמפ': 'machamp', 'טנטקול': 'tentacool', 'גולם': 'golem',
  'סלופוק': 'slowpoke', 'מגנמייט': 'magnemite', 'דודו': 'doduo', 'סיל': 'seel',
  'גריימר': 'grimer', 'גסטלי': 'gastly', 'גנגר': 'gengar', 'אוניקס': 'onix',
  'היפנו': 'hypno', 'קינגסלר': 'kingler', 'קראבי': 'krabby', 'וולטורב': 'voltorb',
  'אגזקיוט': 'exeggcute', 'קיובון': 'cubone', 'ליקיטונג': 'lickitung', 'ריהורן': 'rhyhorn',
  'צנסי': 'chansey', 'טנגלה': 'tangela', 'סנורלקס': 'snorlax', 'ארטיקונו': 'articuno',
  'זאפדוס': 'zapdos', 'מולטרס': 'moltres', 'דרטיני': 'dratini', 'דרגונייט': 'dragonite',
  'מיוטו': 'mewtwo', 'מיו': 'mew', 'איווי': 'eevee', 'ציקוריטה': 'chikorita',
  'טוטודייל': 'totodile', 'לוקאריו': 'lucario', 'גרנינגה': 'greninja',
};
export async function pokemonInfo(name) {
  let n = (name || '').toString().trim().toLowerCase();
  if (!n) throw new Error('EMPTY');
  if (POKE_HE[n]) {
    n = POKE_HE[n];
  } else if (hasHebrew(n)) {
    try {
      n = (await translateText(n, 'en')).toLowerCase().replace(/[^a-z0-9\- ]/g, '').trim().split(/\s+/)[0];
    } catch {}
  }
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(n)}`);
  if (!res.ok) throw new Error(`לא מצאתי פוקימון "${name}"`);
  const j = await res.json();
  const types = (j.types || []).map((t) => TYPES_HE[t.type.name] || t.type.name).join(', ');
  const img = j.sprites?.other?.['official-artwork']?.front_default || j.sprites?.front_default;
  return {
    imageUrl: img,
    text: `⚡ *${j.name}* (#${j.id})\n🏷️ סוג: ${types}\n📏 גובה: ${(j.height / 10).toFixed(1)} מ׳ | ⚖️ משקל: ${(j.weight / 10).toFixed(1)} ק״ג`,
  };
}

/* ---------- מט"ח ---------- */
export async function currencyRates() {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error('שגיאת שערים');
  const j = await res.json();
  const r = j.rates || {};
  if (!r.ILS) throw new Error('אין נתונים');
  const fmt = (v) => Number(v).toFixed(3);
  return (
    `💵 *שערי מטבע (שקל)*\n\n` +
    `💵 דולר: ${fmt(r.ILS)} ₪\n` +
    `💶 יורו: ${fmt(r.ILS / r.EUR)} ₪\n` +
    `💷 ליש״ט: ${fmt(r.ILS / r.GBP)} ₪\n\n` +
    `_מתעדכן יומית_`
  );
}

/* ---------- קריפטו ---------- */
export async function cryptoPrices() {
  const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd,ils');
  if (!res.ok) throw new Error('שגיאת קריפטו');
  const j = await res.json();
  const names = { bitcoin: 'ביטקוין ₿', ethereum: 'את׳ריום', solana: 'סולנה', dogecoin: 'דוג׳קוין' };
  let out = '🪙 *מחירי קריפטו*\n\n';
  for (const [id, he] of Object.entries(names)) {
    if (j[id]) out += `${he}: $${Number(j[id].usd).toLocaleString()} (${Math.round(j[id].ils).toLocaleString()} ₪)\n`;
  }
  return out.trim();
}

/* ---------- חדשות ישראל (Google News RSS) ---------- */
export async function newsHe(limit = 5) {
  const res = await fetch('https://news.google.com/rss?hl=he&gl=IL&ceid=IL:he', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('שגיאת חדשות');
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  if (!items.length) throw new Error('אין חדשות כרגע');
  let out = '📰 *החדשות החמות:*\n\n';
  items.forEach((m, i) => {
    const body = m[1];
    const title = (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/) || [])[1] ||
      (body.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/) || [])[2] || 'ללא כותרת';
    const src = (body.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || '';
    out += `${i + 1}. ${title.trim()}${src ? ` _(${src.trim()})_` : ''}\n\n`;
  });
  return out.trim();
}

/* ---------- ציטוט יומי + תרגום ---------- */
export async function quoteHe() {
  const res = await fetch('https://zenquotes.io/api/random');
  if (!res.ok) throw new Error('שגיאת ציטוטים');
  const j = await res.json();
  const q = j?.[0];
  if (!q?.q) throw new Error('ציטוט ריק');
  let he = '';
  try {
    he = await translateText(`${q.q} — ${q.a}`, 'he');
  } catch {}
  return `💬 *ציטוט יומי:*\n\n"${q.q}"\n— ${q.a}${he ? `\n\n🇮🇱 ${he}` : ''}`;
}

/* ---------- שעה עולמית (מקומי, בלי רשת) ---------- */
const CITY_TZ = {
  'ירושלים': 'Asia/Jerusalem', 'תל אביב': 'Asia/Jerusalem', 'תל-אביב': 'Asia/Jerusalem',
  'חיפה': 'Asia/Jerusalem', 'אילת': 'Asia/Jerusalem', 'ישראל': 'Asia/Jerusalem',
  'לונדון': 'Europe/London', 'פריז': 'Europe/Paris', 'פריס': 'Europe/Paris',
  'ברלין': 'Europe/Berlin', 'רומא': 'Europe/Rome', 'מדריד': 'Europe/Madrid',
  'אמסטרדם': 'Europe/Amsterdam', 'מוסקבה': 'Europe/Moscow', 'קייב': 'Europe/Kiev',
  'אתונה': 'Europe/Athens', 'איסטנבול': 'Europe/Istanbul', 'דובאי': 'Asia/Dubai',
  'ניו יורק': 'America/New_York', 'לוס אנגלס': 'America/Los_Angeles', 'טורונטו': 'America/Toronto',
  'סאו פאולו': 'America/Sao_Paulo', 'טוקיו': 'Asia/Tokyo', 'בייגינג': 'Asia/Shanghai',
  'הונג קונג': 'Asia/Hong_Kong', 'סינגפור': 'Asia/Singapore', 'הודו': 'Asia/Kolkata',
  'סידני': 'Australia/Sydney', 'קהיר': 'Africa/Cairo',
  'בנגקוק': 'Asia/Bangkok', 'מקסיקו': 'America/Mexico_City',
  'london': 'Europe/London', 'paris': 'Europe/Paris', 'berlin': 'Europe/Berlin',
  'new york': 'America/New_York', 'tokyo': 'Asia/Tokyo', 'dubai': 'Asia/Dubai',
};
export function cityTime(query) {
  const clean = (query || '').toString().trim().slice(0, 40);
  if (!clean) {
    return `🕐 *שעה נוכחית — איך משתמשים?*\nכתוב: !שעה <עיר>\nדוגמה: !שעה לונדון\n\nערים נתמכות: ירושלים, לונדון, פריז, ניו יורק, טוקיו, דובאי ועוד.`;
  }
  const tz = CITY_TZ[clean] || CITY_TZ[clean.toLowerCase()];
  if (!tz) throw new Error(`לא מכיר את "${clean}". נסה: ירושלים, לונדון, פריז, ניו יורק, טוקיו, דובאי.`);
  const fmt = new Intl.DateTimeFormat('he-IL', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit',
  });
  return `🕐 *השעה ב${clean} עכשיו:*\n${fmt.format(new Date())}`;
}

/* ---------- זמני שבת וחג (Hebcal, חינמי) ---------- */
const SHABBAT_GEO = {
  'ירושלים': 281184, 'תל אביב': 293397, 'תל-אביב': 293397,
  'חיפה': 294801, 'באר שבע': 295530, 'אילת': 295277,
  'נתניה': 294071, 'אשדוד': 295629, 'פתח תקווה': 293918,
  'שדרות': { lat: 31.52647, lon: 34.59697 },
};
function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `יום ${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1} בשעה ${hh}:${mm}`;
}

/* ---------- טווח שבת ירושלים (Hebcal, עם גיבוי סולארי מקומי) ---------- */
const JLM = { lat: 31.768, lon: 35.213 };
const shabbatCache = { at: 0, start: 0, end: 0, src: '' };
function ilNow() { return new Date(); }
function ilWeekday(d) {
  // יום בשבוע לפי Asia/Jerusalem: 5=שישי, 6=שבת
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(d);
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? d.getDay();
  } catch { return d.getDay(); }
}
function ilOffsetMin(d) {
  // הפרש דקות Asia/Jerusalem מול UTC
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour % 24), +p.minute, +p.second);
    return Math.round((asUTC - d.getTime()) / 60000);
  } catch { return 180; }
}
function sunTime(date, isSunset) {
  // שקיעה/זריחה מקורבת (דיוק ~2 דקות) — ללא תלויות
  const rad = Math.PI / 180;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const N = Math.floor((start - new Date(start.getFullYear(), 0, 0)) / 86400000);
  const lngHour = JLM.lon / 15;
  const t = N + ((isSunset ? 18 : 6) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
  L = ((L % 360) + 360) % 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
  RA = ((RA % 360) + 360) % 360;
  const Lq = Math.floor(L / 90) * 90, RAq = Math.floor(RA / 90) * 90;
  RA = RA + (Lq - RAq);
  RA /= 15;
  const sinDec = 0.39782 * Math.sin(L * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(JLM.lat * rad)) / (cosDec * Math.cos(JLM.lat * rad));
  if (cosH < -1 || cosH > 1) return null;
  let H = Math.acos(cosH) / rad;
  if (!isSunset) H = 360 - H;
  H /= 15;
  const T = H + RA - 0.06571 * t - 6.622;
  let UT = T - lngHour;
  UT = ((UT % 24) + 24) % 24;
  const off = ilOffsetMin(date) / 60;
  const out = new Date(start);
  out.setHours(0, 0, 0, 0);
  out.setMinutes(Math.round((((UT + off) % 24 + 24) % 24) * 60));
  return out;
}
function solarShabbatRange(now) {
  // מוצא את שישי-שבת הרלוונטיים סביב now
  const wd = ilWeekday(now);
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  const friday = new Date(day);
  friday.setDate(day.getDate() + ((5 - wd + 7) % 7) - (wd === 6 ? 7 : 0));
  // אם היום שבת — השישי הרלוונטי הוא אתמול
  const friSun = sunTime(friday, true);
  const sat = new Date(friday);
  sat.setDate(friday.getDate() + 1);
  const satSun = sunTime(sat, true);
  if (!friSun || !satSun) return null;
  return {
    start: friSun.getTime() - 50 * 60000, // הדלקה 40 דקות לפני שקיעה + 10 דקות חומרה
    end: satSun.getTime() + 60 * 60000, // הבדלה ~45 דקות אחרי שקיעה + 15 דקות חומרה
    src: 'solar',
  };
}
/** טווח השבת הקרובה/נוכחית בירושלים: {start, end, src} או null */
export async function getShabbatRange() {
  const now = Date.now();
  if (shabbatCache.start && shabbatCache.end && now - shabbatCache.at < 12 * 3600 * 1000 && now < shabbatCache.end + 3600000) {
    return shabbatCache;
  }
  // 1) Hebcal — מדויק
  try {
    const res = await fetch('https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&m=on', { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const j = await res.json();
      const items = (j.items || []).map((i) => ({ ...i, t: new Date(i.date).getTime() })).filter((i) => i.t).sort((a, b) => a.t - b.t);
      const candles = items.filter((i) => i.category === 'candles');
      for (const c of candles) {
        const h = items.find((i) => i.category === 'havdalah' && i.t > c.t);
        if (h) {
          shabbatCache.at = now;
          shabbatCache.start = c.t;
          shabbatCache.end = h.t;
          shabbatCache.src = 'hebcal';
          if (now < h.t + 3600000) return shabbatCache;
        }
      }
    }
  } catch {}
  // 2) גיבוי סולארי
  try {
    const r = solarShabbatRange(new Date());
    if (r) {
      shabbatCache.at = now;
      shabbatCache.start = r.start;
      shabbatCache.end = r.end;
      shabbatCache.src = r.src;
      return shabbatCache;
    }
  } catch {}
  return null;
}
export async function shabbatTimes(city = 'ירושלים') {
  const clean = (city || '').toString().trim().slice(0, 30) || 'ירושלים';
  const geo = SHABBAT_GEO[clean];
  if (!geo) throw new Error(`לא מכיר את "${clean}". ערים נתמכות: ${Object.keys(SHABBAT_GEO).filter((c, i, a) => a.indexOf(c) === i).join(', ')}.`);
  const geoQs = typeof geo === 'number'
    ? `geonameid=${geo}`
    : `latitude=${geo.lat}&longitude=${geo.lon}&tzid=Asia/Jerusalem`;
  const res = await fetch(`https://www.hebcal.com/shabbat?cfg=json&${geoQs}&m=on`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('שירות זמני שבת נכשל');
  const j = await res.json();
  const items = j.items || [];
  const candles = items.find((i) => i.category === 'candles');
  const havdalah = items.find((i) => i.category === 'havdalah');
  const parsha = items.find((i) => i.category === 'parashat');
  const now = new Date();
  const holiday = items.find((i) => i.category === 'holiday' && new Date(i.date) >= new Date(now.toDateString()));
  let out = `🕯️ *זמני שבת — ${clean}*\n\n`;
  if (candles) out += `🕯️ הדלקת נרות: *${fmtTime(candles.date)}*\n`;
  if (havdalah) out += `🌟 הבדלה: *${fmtTime(havdalah.date)}*\n`;
  if (parsha) out += `📖 פרשה: *${parsha.hebrew || parsha.title}*\n`;
  if (holiday) {
    const hd = new Date(holiday.date);
    out += `\n🎉 חג קרוב: *${holiday.hebrew || holiday.title}* (${hd.getDate()}.${hd.getMonth() + 1})\n`;
  }
  return out.trim();
}

/* ---------- מחירי מניות (Yahoo, חינמי, בלי מפתח) ---------- */
export async function stockPrice(symbol) {
  let s = (symbol || '').toString().trim().toUpperCase().slice(0, 20);
  if (!s) throw new Error('איזו מניה? דוגמה: !מניה AAPL');
  const tries = [s];
  if (!/[.=]/.test(s)) tries.push(`${s}.TA`); // ניסיון בורסת תל אביב
  let lastErr = null;
  const YAHOO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  for (const sym of tries) {
    try {
      const res = await fetchRetry(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`, { headers: { 'User-Agent': YAHOO_UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('אין נתונים');
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose || meta.previousClose;
      let chg = '';
      if (typeof prev === 'number' && prev) {
        const pct = ((price - prev) / prev) * 100;
        chg = ` (${pct >= 0 ? '▲' : '▼'} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% היום)`;
      }
      const name = meta.longName || meta.shortName || sym;
      return `📈 *${name}* (${sym})\n\n💰 מחיר: *${Number(price).toLocaleString()} ${meta.currency || ''}*${chg}\n🏛️ בורסה: ${meta.exchangeName || meta.fullExchangeName || ''}`;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`לא מצאתי מניה "${s}". נסה סימול אמריקאי (AAPL) או תל-אביבי.`);
}

/* ---------- קיצור קישורים (is.gd + גיבוי tinyurl, חינמי, בלי מפתח) ---------- */
export async function shortenUrl(raw) {
  const tokens = (raw || '').toString().trim().split(/\s+/).filter(Boolean);
  // מחפש את הטוקן שנראה כמו קישור (לאו דווקא הראשון)
  const u0 = tokens.find((t) => /^(https?:\/\/|www\.)/i.test(t))
    || tokens.find((t) => t.includes('.') && /[\w-]+\.[\w-]{2,}/.test(t))
    || '';
  if (!u0) throw new Error('איזה קישור? דוגמה: !קצר https://example.com/abc/def');
  let u = u0;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    new URL(u);
  } catch {
    throw new Error('קישור לא תקין.');
  }
  // שירות ראשי + גיבוי
  try {
    const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(u)}`);
    const short = (await res.text()).trim();
    if (res.ok && /^https?:\/\/is\.gd\//.test(short)) {
      return `🔗 *קישור מקוצר:*\n${short}\n\nמקור: ${u.slice(0, 120)}`;
    }
  } catch { /* נופל לגיבוי */ }
  try {
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(u)}`);
    const short = (await res.text()).trim();
    if (res.ok && /^https?:\/\/tinyurl\.com\//.test(short)) {
      return `🔗 *קישור מקוצר:*\n${short}\n\nמקור: ${u.slice(0, 120)}`;
    }
  } catch { /* נגמרו הגיבויים */ }
  throw new Error('הקיצור נכשל בשני השירותים. נסה קישור אחר.');
}

/* ---------- רעידות אדמה (USGS, חינמי, בלי מפתח) ---------- */
const IL_CENTER = { lon: 35.2137, lat: 31.7683 };
function haversineKm(lon1, lat1, lon2, lat2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function ago(ts) {
  const min = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 48) return `לפני ${h} שעות`;
  return `לפני ${Math.round(h / 24)} ימים`;
}
export async function earthquakes(arg = '') {
  const near = /ישראל|ארץ|אזור|סובב/i.test(arg || '');
  const res = await fetchRetry('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('שירות רעידות האדמה לא זמין כרגע.');
  const j = await res.json();
  let list = (j.features || []).map((f) => {
    const p = f.properties || {}, c = f.geometry?.coordinates || [];
    return { mag: p.mag, place: p.place || '—', time: p.time, depth: c[2], lon: c[0], lat: c[1] };
  }).filter((e) => typeof e.mag === 'number' && e.time);
  if (!list.length) throw new Error('לא נמצאו רעידות.');
  if (near) {
    list = list.map((e) => ({ ...e, km: haversineKm(e.lon, e.lat, IL_CENTER.lon, IL_CENTER.lat) }))
      .filter((e) => e.km <= 1200)
      .sort((a, b) => a.km - b.km);
    if (!list.length) throw new Error('ב-24 השעות האחרונות לא נרשמו רעידות בטווח של עד 1200 ק״מ מישראל. 🕊️');
  } else {
    list.sort((a, b) => b.mag - a.mag);
  }
  const top = list.slice(0, 5);
  const magIcon = (m) => (m >= 6 ? '🔴' : m >= 5 ? '🟠' : m >= 4 ? '🟡' : '⚪');
  let out = `🌍 *רעידות אדמה — 24 שעות אחרונות${near ? ' (קרוב לישראל)' : ' (החזקות בעולם)'}*\n\n`;
  for (const e of top) {
    const d = typeof e.depth === 'number' ? `עומק ${Math.round(e.depth)} ק״מ` : '';
    const dist = typeof e.km === 'number' ? ` | ${Math.round(e.km)} ק״מ מישראל` : '';
    out += `${magIcon(e.mag)} *מבוסס ${e.mag.toFixed(1)}* — ${e.place}\n    🕐 ${ago(e.time)}${d ? ` | ${d}` : ''}${dist}\n`;
  }
  out += `\nℹ️ מקור: USGS · סף 2.5+ · ${near ? 'סינון לפי מרחק מישראל' : 'לפי עצמה'}`;
  return out.trim();
}

/* ---------- איכות אוויר (Open-Meteo Air Quality, חינמי) ---------- */
const AQI_LEVELS = [
  [50, 'טוב', '🟢'], [100, 'בינוני', '🟡'], [150, 'לא בריא לקבוצות רגישות', '🟠'],
  [200, 'לא בריא', '🔴'], [300, 'רע מאוד', '🟣'], [Infinity, 'מסוכן', '🟤'],
];
export async function airQuality(city = '') {
  const clean = (city || '').toString().trim().slice(0, 60) || 'תל אביב';
  const tries = [clean];
  if (hasHebrew(clean)) { try { tries.push(await translateText(clean, 'en')); } catch {} }
  let geo = null;
  for (const t of tries) {
    try {
      const r = await fetchRetry(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(t)}&count=1&language=he&format=json`);
      const jj = await r.json();
      if (jj?.results?.[0]) { geo = jj.results[0]; break; }
    } catch {}
  }
  if (!geo) throw new Error(`לא מצאתי את העיר "${clean}"`);
  const r = await fetchRetry(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${geo.latitude}&longitude=${geo.longitude}&current=us_aqi,european_aqi,pm2_5,pm10&timezone=auto`);
  if (!r.ok) throw new Error('שירות איכות האוויר לא זמין כרגע.');
  const j = await r.json();
  const c = j?.current;
  if (!c || typeof c.us_aqi !== 'number') throw new Error('אין נתונים על איכות האוויר כרגע.');
  const lvl = AQI_LEVELS.find(([max]) => c.us_aqi <= max) || AQI_LEVELS[AQI_LEVELS.length - 1];
  const name = geo.name || clean;
  let out = `😷 *איכות אוויר — ${name}*\n\n`;
  out += `${lvl[2]} מדד: *${Math.round(c.us_aqi)}* — ${lvl[1]}\n`;
  if (typeof c.european_aqi === 'number') out += `🇪🇺 מדד אירופי: ${Math.round(c.european_aqi)}\n`;
  if (typeof c.pm2_5 === 'number') out += `🔬 PM2.5: ${c.pm2_5} מיקרוגרם/מ״ק | PM10: ${typeof c.pm10 === 'number' ? c.pm10 : '—'}\n`;
  out += `\n0-50 טוב 🟢 · 51-100 בינוני 🟡 · 101+ לא בריא 🟠`;
  return out.trim();
}

/* ---------- מדדים פיננסיים ---------- */
export const INDEX_ALIASES = {
  'ת"א 35': 'TA35.TA', 'תא 35': 'TA35.TA', 'ת״א 35': 'TA35.TA', 'ta35': 'TA35.TA', 'מעו"ז': 'TA35.TA',
  'sp500': '^GSPC', 's&p': '^GSPC', 's&p500': '^GSPC', 'אמריקה': '^GSPC',
  'נאסדא"ק': '^IXIC', 'נאסדק': '^IXIC', 'nasdaq': '^IXIC',
  'זהב': 'GC=F', 'gold': 'GC=F', 'נפט': 'CL=F', 'oil': 'CL=F',
  'דולר': 'DX-Y.NYB', 'יורו': 'EURUSD=X', 'שקל': 'ILS=X',
};
export function resolveIndexSymbol(q) {
  const k = (q || '').trim().toLowerCase();
  if (!k) return null;
  if (INDEX_ALIASES[k]) return INDEX_ALIASES[k];
  for (const [alias, sym] of Object.entries(INDEX_ALIASES)) {
    if (k === alias.toLowerCase() || k.includes(alias.toLowerCase())) return sym;
  }
  return null;
}

/* ---------- כיף מקומי ---------- */
export const rnd = (n) => Math.floor(Math.random() * n);
export const dice = (sides = 6) => `🎲 יצא: *${rnd(sides) + 1}* (מתוך ${sides})`;
export const coin = () => `🪙 יצא: *${Math.random() < 0.5 ? 'עץ 🌳' : 'פלי 🦅'}*`;
export function pickOne(raw) {
  const opts = (raw || '').split(/[|\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (opts.length < 2) throw new Error('EMPTY');
  return `🎯 מבין ${opts.length} אפשרויות בחרתי:\n*${opts[rnd(opts.length)]}*`;
}
export function genPassword(len = 12) {
  const n = Math.min(Math.max(parseInt(len) || 12, 6), 32);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[rnd(chars.length)];
  return `🔑 *סיסמה חזקה (${n} תווים):*\n\`${out}\`\n⚠️ שמור במקום בטוח, אל תשתף!`;
}
export const randNum = (a = 1, b = 100) => {
  const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
  return `🔢 מספר רנדומלי בין ${lo}-${hi}:\n*${lo + rnd(hi - lo + 1)}*`;
};
export function randColor() {
  const h = '#' + Array.from({ length: 6 }, () => '0123456789ABCDEF'[rnd(16)]).join('');
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `🎨 *צבע רנדומלי: ${h}*\nRGB(${r}, ${g}, ${b})`;
}
export function dateHe() {
  const fmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `📅 *היום:*\n${fmt.format(new Date())}`;
}
export function countdown(raw) {
  const m = (raw || '').trim().match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) throw new Error('EMPTY');
  let [, d, mo, y] = m;
  y = y.length === 2 ? '20' + y : y;
  const target = new Date(+y, +mo - 1, +d);
  if (isNaN(target)) throw new Error('EMPTY');
  const days = Math.ceil((target - new Date()) / 86400000);
  if (days < 0) return `⏳ התאריך ${d}.${mo}.${y} כבר עבר (${Math.abs(days)} ימים).`;
  if (days === 0) return `🎉 *זה היום!* ${d}.${mo}.${y} הגיע!`;
  return `⏳ נשארו *${days} ימים* עד ${d}.${mo}.${y}`;
}
