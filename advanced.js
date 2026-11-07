/**
 * 🚀 פיצ'רים מתקדמים לקבוצה — אחסון מקומי בקובץ JSON (בלי שרת/DB):
 * - זיכרון: היסטוריית שיחה לקבוצה + שמות + אישיות
 * - ניקוד פעילות + !טופ
 * - אנטי-ספאם בסיסי (הצפות/קישורים)
 * - טריוויה עם ניקוד
 * - ימי הולדת + תזכורת יומית
 * - אירועים קבוצתיים (לוח שנה מקומי)
 * - סקרים עם ספירת קולות
 * - מעקב ערוצי יוטיוב (RSS, בלי מפתח ✅)
 * - טוגלים: אוטו-סטיקר, אוטו-תרגם, בוקר-טוב יומי, שערים יומיים, קול
 */
import fs from 'node:fs';
import { DEFAULT_WELCOME } from './admin.js';

const STORE_PATH = new URL('./bot-store.json', import.meta.url);

function blank() {
  return {
    groups: {}, // jid -> { toggles, points:{}, names:{}, birthdays:{}, events:[], polls:[], trivia:null, follows:[], lastBrief:'', lastRates:'', lastBirth:'' }
    chatLog: {}, // jid -> [{sender, name, text, time}]
    knownGroups: {}, // jid -> {subject, at} — כל הקבוצות שהבוט חבר בהן (סריקה, לפאנל)
  };
}
/** מיזוג קבוצות שנסרקו (לא דורס — רק מוסיף/מרענן). */
export function mergeKnownGroups(map) {
  const s = load();
  s.knownGroups = { ...(s.knownGroups || {}), ...(map || {}) };
  save();
}

let store = null;
function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    store = blank();
  }
  return store;
}
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(store));
    } catch {}
  }, 2000);
}

export function gdata(jid) {
  const s = load();
  if (!s.groups[jid]) {
    s.groups[jid] = {
      toggles: { autoSticker: false, autoTranslate: false, morning: false, morningCity: 'תל אביב', rates: false, voice: 'רגיל' },
      personality: '',
      points: {}, names: {}, birthdays: {}, events: [], polls: [], trivia: null,
      follows: [], lastBrief: '', lastRates: '', lastBirth: '',
    };
  }
  const g = s.groups[jid];
  // --- תזכורות ובריף בוקר (תוספת תואמת-לאחור) ---
  if (!Array.isArray(g.reminders)) g.reminders = [];
  if (!g.toggles) g.toggles = {};
  if (typeof g.toggles.brief !== 'boolean') g.toggles.brief = false;
  if (typeof g.toggles.briefCity !== 'string' || !g.toggles.briefCity) g.toggles.briefCity = 'תל אביב';
  if (typeof g.toggles.autoTranscribe !== 'boolean') g.toggles.autoTranscribe = false;
  if (typeof g.toggles.onlyTranscribe !== 'boolean') g.toggles.onlyTranscribe = false;
  if (typeof g.lastBriefFull !== 'string') g.lastBriefFull = '';
  // --- ברירות מחדל לניהול (הכל פעיל — מסירים מה שלא רוצים בפאנל) ---
  const ADMIN_TOGGLE_DEFAULTS = {
    antilink: true,       // הסרת קישורים אוטומטית (לא-מנהלים)
    antispam: true,       // אנטי-ספאם קשוח עם מחיקה
    anticurse: true,      // סינון קללות
    welcome: true,        // הודעת ברוכים הבאים
    antiSticker: false,   // הסרת סטיקרים (כבוי כברירת מחדל)
  };
  g.toggles = Object.assign(
    { autoSticker: false, autoTranslate: false, morning: false, morningCity: 'תל אביב', rates: false, voice: 'רגיל' },
    ADMIN_TOGGLE_DEFAULTS,
    g.toggles || {},
  );
  if (typeof g.welcomeText !== 'string' || g.welcomeText === '👋 ברוך הבא {שם} לקבוצת {קבוצה}! 🎉\nכתוב !עזרה למדריך.') g.welcomeText = DEFAULT_WELCOME;
  if (typeof g.rules !== 'string') g.rules = '';
  if (!g.warns || typeof g.warns !== 'object') g.warns = {};
  if (!Array.isArray(g.muted)) g.muted = [];
  if (!Array.isArray(g.curseExtra)) g.curseExtra = [];
  if (!Array.isArray(g.linkAllow)) g.linkAllow = []; // דומיינים מותרים כשהאנטי-לינק פעיל
  if (typeof g.subject !== 'string') g.subject = '';
  if (!g.features || typeof g.features !== 'object') g.features = {}; // פיצ'רים כבויים בלבד; חסר = פעיל
  // --- משחקים קבוצתיים + תורנות + השתקת בוט (תואם-לאחור) ---
  if (!g.xo || typeof g.xo !== 'object') g.xo = null;
  if (!g.scramble || typeof g.scramble !== 'object') g.scramble = null;
  if (!g.battle || typeof g.battle !== 'object') g.battle = null;
  if (!g.duty || !Array.isArray(g.duty.members)) g.duty = { members: [], idx: 0, week: '' };
  if (typeof g.botMutedUntil !== 'number') g.botMutedUntil = 0;
  return g;
}

/* ---------- לוג שיחה (לסיכום/זיכרון) ---------- */
export function logMessage(jid, sender, name, text) {
  const s = load();
  if (!s.chatLog[jid]) s.chatLog[jid] = [];
  s.chatLog[jid].push({ sender, name: name || '', text: (text || '').slice(0, 300), time: Date.now() });
  if (s.chatLog[jid].length > 200) s.chatLog[jid] = s.chatLog[jid].slice(-200);
  if (name) gdata(jid).names[sender] = name.slice(0, 40);
  save();
}
export function recentChat(jid, n = 60) {
  return (load().chatLog[jid] || []).slice(-n);
}

/* ---------- ניקוד ---------- */
const lastPoint = {};
export function addPoint(jid, sender) {
  const key = jid + '|' + sender;
  if (Date.now() - (lastPoint[key] || 0) < 60000) return; // נקודה לדקה לכל היותר
  lastPoint[key] = Date.now();
  const g = gdata(jid);
  g.points[sender] = (g.points[sender] || 0) + 1;
  save();
}
export function addPoints(jid, sender, n) {
  const g = gdata(jid);
  g.points[sender] = (g.points[sender] || 0) + n;
  save();
}
export function topPoints(jid, limit = 10) {
  const g = gdata(jid);
  return Object.entries(g.points).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([jid2, pts]) => ({ jid: jid2, name: g.names[jid2] || '', points: pts }));
}

/* ---------- אנטי-ספאם ---------- */
// ספים שמרניים: שיחה רגילה וקצבית בקבוצה פעילה לא נחשבת הצפה.
// "flood" רק על חזרה אובססיבית של אותה הודעה, ו"links" רק על ריבוי קישורים אמיתי.
const spamTrack = {}; // jid|sender -> [{ t, text, link }]
export function spamCheck(jid, sender, text) {
  const key = jid + '|' + sender;
  const now = Date.now();
  const clean = String(text || '').trim().slice(0, 160);
  const hasLink = /(https?:\/\/|www\.|bit\.ly|t\.me\/)/i.test(clean);
  const arr = (spamTrack[key] || []).filter((x) => now - x.t < 15000);
  arr.push({ t: now, text: clean, link: hasLink });
  spamTrack[key] = arr;
  const linkCount = arr.filter((x) => x.link).length;
  if (arr.length >= 9 && linkCount >= 3) return 'links';
  const repeated = clean ? arr.filter((x) => x.text && x.text.toLowerCase() === clean.toLowerCase()).length : 0;
  if (arr.length >= 10 && repeated >= 4) return 'flood';
  if (arr.length >= 15) return 'flood';
  return null;
}

/* ---------- טריוויה ---------- */
export async function newTrivia(chatAI) {
  const { text } = await chatAI(
    'כתוב שאלת טריוויה אחת בעברית בפורמט המדויק:\nשאלה: <השאלה>\nא) <תשובה>\nב) <תשובה>\nג) <תשובה>\nד) <תשובה>\nתשובה נכונה: <אות אחת>\nהנושא: כללי ומעניין.',
    []
  );
  const m = text.match(/תשובה נכונה:\s*([א-דA-D])/);
  const letter = (m?.[1] || '').toUpperCase();
  const map = { A: 'א', B: 'ב', C: 'ג', D: 'ד' };
  const correct = map[letter] || (/[א-ד]/.test(letter) ? letter : null);
  if (!correct) return null;
  const question = text.split(/תשובה נכונה:/)[0].trim();
  return { question, correct, until: Date.now() + 90000 };
}

/* ---------- סקרים ---------- */
export function newPoll(question, options) {
  return { question, options, votes: {}, created: Date.now(), open: true };
}
export function pollResults(poll, names = {}) {
  const counts = poll.options.map(() => 0);
  for (const v of Object.values(poll.votes)) {
    const i = poll.options.findIndex((o) => o === v);
    if (i >= 0) counts[i]++;
  }
  let out = `📊 *${poll.question}*\n\n`;
  poll.options.forEach((o, i) => {
    out += `${i + 1}. ${o} — *${counts[i]}* קולות\n`;
  });
  const total = counts.reduce((a, b) => a + b, 0);
  out += `\n🗳️ סה״כ: ${total} מצביעים${poll.open ? '\n\nהצבעה: שלח את מספר האפשרות' : '\n\n🔒 הסקר נסגר'}`;
  return out;
}

/* ---------- ימי הולדת ---------- */
export function setBirthday(jid, sender, name, dateStr) {
  const m = (dateStr || '').trim().match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (!m) return false;
  const g = gdata(jid);
  g.birthdays[sender] = { d: +m[1], m: +m[2], name: (name || '').slice(0, 40) };
  save();
  return true;
}
export function todayBirthdays(jid) {
  const now = new Date();
  const g = gdata(jid);
  return Object.entries(g.birthdays)
    .filter(([, b]) => b.d === now.getDate() && b.m === now.getMonth() + 1)
    .map(([jid2, b]) => ({ jid: jid2, ...b }));
}

/* ---------- אירועים ---------- */
export function addEvent(jid, dateStr, text) {
  const m = (dateStr || '').trim().match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (!m || !text?.trim()) return false;
  let y = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear());
  const g = gdata(jid);
  g.events.push({ d: +m[1], m: +m[2], y: +y, text: text.trim().slice(0, 200), by: '' });
  g.events.sort((a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d));
  save();
  return true;
}
export function listEvents(jid, limit = 10) {
  const now = new Date();
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return gdata(jid).events
    .filter((e) => (e.y * 10000 + e.m * 100 + e.d) >= today)
    .slice(0, limit);
}

/* ---------- תזכורות (נשמרות — שורדות הפעלה מחדש) ---------- */
// rem: {id, text, at? (timestamp חד-פעמי), daily? ('HH:MM' יומי), by, lastFired? ('YYYY-M-D')}
export function addReminder(jid, rem) {
  const g = gdata(jid);
  rem.id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  // לא יורים מיד תזכורת שזה עתה נוצרה אחרי שהשעה שלה כבר עברה היום
  const now = new Date();
  if (rem.everyHour && !rem.lastFiredHour) rem.lastFiredHour = `${dayKey(now)} ${now.getHours()}`;
  if (rem.daily) {
    const curHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (curHM >= rem.daily && rem.lastFired !== dayKey(now)) rem.lastFired = dayKey(now);
  }
  g.reminders.push(rem);
  if (g.reminders.length > 30) g.reminders = g.reminders.slice(-30);
  save();
  return rem;
}
export function listReminders(jid) {
  return [...(gdata(jid).reminders || [])].sort((a, b) => {
    const ta = a.at || 0, tb = b.at || 0;
    return ta - tb;
  });
}
export function removeReminder(jid, idxOrAll) {
  const g = gdata(jid);
  if (/^(הכל|נקה|all)$/i.test(idxOrAll || '')) {
    g.reminders = [];
    save();
    return 'all';
  }
  const i = parseInt(idxOrAll) - 1;
  if (isNaN(i) || i < 0 || i >= g.reminders.length) return null;
  const [rm] = g.reminders.splice(i, 1);
  save();
  return rm;
}
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/* ---------- 🧠 פענוח זמן בשפה חופשית לתזכורות ---------- */
const HE_HOURS = [
  ['אחת עשרה', 11], ['שתים עשרה', 12], ['שתיים עשרה', 12], ['אחת', 1], ['שתיים', 2], ['שתים', 2],
  ['שלוש', 3], ['ארבע', 4], ['חמש', 5], ['שש', 6], ['שבע', 7], ['שמונה', 8], ['תשע', 9],
  ['עשרה', 10], ['עשר', 10],
];
const MINUTE_WORDS = { 'חצי': 30, 'רבע': 15, 'עשרה': 10, 'עשר': 10, 'עשרים': 20, 'חמש': 5 };
const DAY_PART_RE = /(אחר\s+הצהריים|אחה["״']?צ|בצהריים|בבוקר|בערב|בלילה)/i;

const pad2 = (n) => String(n).padStart(2, '0');
const minuteFromWord = (w) => (w && MINUTE_WORDS[w]) || 0;
function partDefaultHour(part) {
  if (/בוקר/.test(part)) return 8;
  if (/צהריים/.test(part)) return 12;
  if (/אחה|אחר\s+הצהריים/.test(part)) return 16;
  if (/ערב/.test(part)) return 20;
  if (/לילה/.test(part)) return 0;
  return 9;
}
function applyDayPart(hour, part) {
  if (!part) return hour;
  if (/לילה/.test(part)) {
    if (hour === 12) return 0;
    if (hour <= 5) return hour;
    return hour < 12 ? hour + 12 : hour;
  }
  if (/ערב|אחה|אחר\s+הצהריים|צהריים/.test(part)) {
    return hour < 12 ? hour + 12 : hour;
  }
  return hour;
}

/** מחלץ שעה/יום מתוך טקסט חופשי. מחזיר {hour,minute,dayOffset,text} או null. */
function extractReminderTime(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  let dayOffset = 0;
  const dm = text.match(/^(מחרתיים|מחר|היום)\s+/);
  if (dm) {
    dayOffset = dm[1] === 'מחרתיים' ? 2 : dm[1] === 'מחר' ? 1 : 0;
    text = text.slice(dm[0].length);
  }
  let part = '';
  const pm = text.match(DAY_PART_RE);
  if (pm) {
    part = pm[1];
    text = text.replace(pm[1], ' ');
  }
  let hour = null;
  let minute = 0;
  let explicit = false;

  // HH:MM (עם או בלי "בשעה"/"ב-")
  let m = text.match(/(?:^|\s)(?:בשעה\s+|בשעת\s+|ב-?\s*)?(\d{1,2}):(\d{1,2})(?=\s|$)/);
  if (m) {
    hour = +m[1]; minute = +m[2]; explicit = true;
    text = text.replace(m[0], ' ');
  }
  // מספר שעה עם סימן זמן (בבוקר / בשעה / מחר / ב-)
  if (hour == null) {
    m = text.match(/(?:^|\s)(?:בשעה\s+|בשעת\s+|ב-?\s*)?(\d{1,2})(?:\s*ו?(חצי|רבע|עשרה|עשר|עשרים|חמש))?(?=\s|$)/);
    if (m) {
      const marked = /בשעה|בשעת|ב-/.test(m[0]) || !!(part || dm);
      if (marked) {
        hour = +m[1]; minute = minuteFromWord(m[2]); explicit = true;
        text = text.replace(m[0], ' ');
      }
    }
  }
  // שעה במילים: "בשמונה", "בשמונה וחצי"
  if (hour == null) {
    const words = HE_HOURS.map(([w]) => w).sort((a, b) => b.length - a.length).join('|');
    const hre = new RegExp(`(?:^|\\s)(?:בשעה\\s+|בשעת\\s+|ב)?(${words})(?:\\s*ו?(חצי|רבע|עשרה|עשר|עשרים|חמש))?(?=\\s|$)`);
    m = text.match(hre);
    if (m) {
      const found = HE_HOURS.find(([w]) => w === m[1]);
      hour = found ? found[1] : null;
      minute = minuteFromWord(m[2]);
      explicit = hour != null;
      if (explicit) text = text.replace(m[0], ' ');
    }
  }
  // "מחר בבוקר" / "היום בערב" בלי שעה מפורשת
  if (hour == null && part) {
    hour = partDefaultHour(part);
    explicit = true;
  }
  if (!explicit || hour == null) return null;
  hour = Math.max(0, Math.min(23, applyDayPart(hour, part)));
  minute = Math.max(0, Math.min(59, minute || 0));
  text = text.replace(/[ \t]+/g, ' ').replace(/^[\s:\-]+|[\s:\-]+$/g, '').trim();
  return { hour, minute, dayOffset, text };
}

/**
 * פענוח תזכורת בשפה חופשית.
 * מחזיר {at}|{daily}|{everyHour}|{needsTime}|{past} + text, או null.
 */
export function parseReminderInput(arg, now = new Date()) {
  let raw = String(arg || '').trim();
  if (!raw) return null;
  // ניקוי מילות פנייה/יחס נפוצות: "תזכורת לקבוצה למחר בבוקר..." → "מחר בבוקר..."
  raw = raw.replace(/^(?:לקבוצה|בקבוצה|לנו|לי)\s+/i, '').trim();
  raw = raw.replace(/^ל(?=(?:מחרתיים|מחר|היום)(?:\s|$))/i, '').trim();

  // כל שעה / כל יום כל שעה
  let m = raw.match(/^(?:כל\s+יום\s+)?כל\s+שעה(?:\s+|$)([\s\S]*)$/i);
  if (m && m[1].trim()) return { everyHour: true, text: m[1].trim() };

  // יומית / כל יום / בכל יום + שעה
  m = raw.match(/^(?:יומית|כל\s+יום|בכל\s+יום)\s+([\s\S]+)$/i);
  if (m) {
    const rest = m[1].trim();
    const t = extractReminderTime(rest);
    if (!t) return { needsTime: true, text: rest };
    if (!t.text) return null;
    return { daily: `${pad2(t.hour)}:${pad2(t.minute)}`, text: t.text };
  }

  // תאריך ISO: 2026-10-27 08:00 ...
  m = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s+([\s\S]+)$/);
  if (m) {
    const rest = m[4].trim();
    const t = extractReminderTime(rest);
    const hour = t ? t.hour : 9;
    const minute = t ? t.minute : 0;
    const rtext = (t ? t.text : rest).trim();
    if (!rtext) return null;
    const at = new Date(+m[1], +m[2] - 1, +m[3], hour, minute).getTime();
    if (!Number.isFinite(at)) return null;
    if (at <= now.getTime()) return { past: true, text: rtext };
    return { at, text: rtext };
  }

  // תאריך מפורש: 25.12 / 25.12.2026 + שעה (ברירת מחדל 09:00)
  m = raw.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\s+([\s\S]+)$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(now.getFullYear());
    const rest = m[4].trim();
    const t = extractReminderTime(rest);
    const hour = t ? t.hour : 9;
    const minute = t ? t.minute : 0;
    const rtext = (t ? t.text : rest).trim();
    if (!rtext) return null;
    const at = new Date(+y, +m[2] - 1, +m[1], hour, minute).getTime();
    if (!Number.isFinite(at)) return null;
    if (at <= now.getTime()) return { past: true, text: rtext };
    return { at, text: rtext };
  }

  // משך במילים: חצי שעה / שעה / שעתיים
  m = raw.match(/^(?:בעוד\s+)?(חצי\s+שעה|שעתיים|שעה)\s+([\s\S]+)$/i);
  if (m) {
    const mins = /שעתיים/.test(m[1]) ? 120 : /חצי/.test(m[1]) ? 30 : 60;
    return { at: now.getTime() + mins * 60000, text: m[2].trim(), durationMin: mins };
  }

  // משך: 30 דקות / 2 שעות
  const dur = raw.match(/^(?:בעוד\s+)?(\d+)\s*(דקות|דקה|דק׳|דק|שעות|שעה|ש׳)?\s*([\s\S]+)$/);
  if (dur && !DAY_PART_RE.test(raw) && !/(?:בשעה|ב-|\d{1,2}:\d{2})/.test(raw)) {
    let mins = parseInt(dur[1], 10);
    if (/שע/.test(dur[2] || '')) mins *= 60;
    const rtext = dur[3].trim();
    if (!rtext) return null;
    if (mins >= 1 && mins <= 43200) return { at: now.getTime() + mins * 60000, text: rtext, durationMin: mins };
  }

  // שעה חופשית: "8 בבוקר", "בשמונה", "מחר ב-8", "18:30"
  const t = extractReminderTime(raw);
  if (t && t.text) {
    const d = new Date(now);
    d.setDate(d.getDate() + (t.dayOffset || 0));
    d.setHours(t.hour, t.minute, 0, 0);
    if (!t.dayOffset && d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return { at: d.getTime(), text: t.text };
  }
  return null;
}

export function fmtReminderTime(r) {
  if (r.everyHour) return 'כל שעה';
  if (r.daily) return `יומית ${r.daily}`;
  if (r.at) {
    const d = new Date(r.at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()}.${d.getMonth() + 1} ${hh}:${mm}`;
  }
  return '';
}
// מחזיר תזכורות שהגיע זמנן (ומוחק חד-פעמיות שנשלחו)
export function popDueReminders(jid, now = Date.now()) {
  const g = gdata(jid);
  const due = [];
  const keep = [];
  const today = dayKey(new Date(now));
  const cur = new Date(now);
  const curHM = `${String(cur.getHours()).padStart(2, '0')}:${String(cur.getMinutes()).padStart(2, '0')}`;
  const curHourKey = `${today} ${cur.getHours()}`;
  for (const r of g.reminders) {
    if (r.at && now >= r.at) {
      due.push(r); // חד-פעמית — לא נשמרת
    } else if (r.everyHour && r.lastFiredHour !== curHourKey) {
      r.lastFiredHour = curHourKey;
      due.push(r);
      keep.push(r);
    } else if (r.daily && curHM >= r.daily && r.lastFired !== today) {
      r.lastFired = today;
      due.push(r);
      keep.push(r);
    } else {
      keep.push(r);
    }
  }
  if (due.length) {
    g.reminders = keep;
    save();
  }
  return due;
}

/* ---------- מכסת AI יומית לחינמיים (נשמרת בסטור) ---------- */
export function bumpFreeQuota(key, limit, day) {
  const s = load();
  if (!s.freeQuota || s.freeQuota.day !== day) s.freeQuota = { day, users: {} };
  const cur = s.freeQuota.users[key] || 0;
  if (cur >= limit) return { allowed: false, left: 0, used: cur };
  s.freeQuota.users[key] = cur + 1;
  save();
  return { allowed: true, left: limit - cur - 1, used: cur + 1 };
}
export function freeQuotaLeft(key, limit, day) {
  const s = load();
  if (!s.freeQuota || s.freeQuota.day !== day) return limit;
  return Math.max(0, limit - (s.freeQuota.users[key] || 0));
}

/* ---------- מטמון PRO persistent (שריד להפעלה מחדש בזמן תקלת גשר) ---------- */
export function getProCache() {
  const s = load();
  const c = s?.proCache || {};
  return {
    at: c.at || 0,
    phones: Array.isArray(c.phones) ? c.phones : [],
    lids: Array.isArray(c.lids) ? c.lids : [],
    lidmap: (c.lidmap && typeof c.lidmap === 'object') ? c.lidmap : {},
  };
}
export function setProCache(phones, lids = [], lidmap = {}) {
  const s = load();
  s.proCache = { at: Date.now(), phones: [...new Set(phones)], lids: [...new Set(lids)], lidmap: { ...lidmap } };
  save();
}

/* ---------- אימון בוט (שאלה→תשובה) + תוכן מותאם + סטיקר יומי ---------- */
export function learnPair(q, a) {
  const s = load();
  if (!Array.isArray(s.learned)) s.learned = [];
  s.learned.push({ q: String(q || '').slice(0, 200), a: String(a || '').slice(0, 800), at: Date.now() });
  if (s.learned.length > 200) s.learned = s.learned.slice(-200);
  save();
  return s.learned.length;
}
export function listLearned() {
  return (load().learned || []).slice();
}
export function forgetLearned(idx) {
  const s = load();
  if (!Array.isArray(s.learned) || idx < 1 || idx > s.learned.length) return false;
  s.learned.splice(idx - 1, 1);
  save();
  return true;
}
/** התאמה: כל מילות השאלה המאומנת (2+) מופיעות בהודעה. מחזיר תשובה או null. */
export function matchLearned(text) {
  const norm = (x) => String(x || '').toLowerCase().replace(/[^א-תa-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const tw = norm(text);
  if (tw.length < 2) return null;
  for (const L of (load().learned || [])) {
    const qw = norm(L.q).filter((w, i, a) => a.indexOf(w) === i);
    if (qw.length >= 2 && qw.every((w) => tw.some((t) => t === w || (t.length > 4 && w.length > 4 && (t.includes(w) || w.includes(t)))))) {
      return L.a;
    }
  }
  return null;
}
export function addContent(kind, text) {
  const s = load();
  if (!s.contentLib) s.contentLib = {};
  if (!Array.isArray(s.contentLib[kind])) s.contentLib[kind] = [];
  s.contentLib[kind].push(String(text || '').slice(0, 500));
  if (s.contentLib[kind].length > 100) s.contentLib[kind] = s.contentLib[kind].slice(-100);
  save();
  return s.contentLib[kind].length;
}
export function listContent(kind) {
  const lib = load().contentLib || {};
  return kind ? (lib[kind] || []) : lib;
}
export function delContent(kind, idx) {
  const s = load();
  if (!s.contentLib?.[kind] || idx < 1 || idx > s.contentLib[kind].length) return false;
  s.contentLib[kind].splice(idx - 1, 1);
  save();
  return true;
}
export function pickContent(kind) {
  const arr = listContent(kind);
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
export function stickerDayDone(today) {
  const s = load();
  if (s.lastStickerDay === today) return true;
  s.lastStickerDay = today;
  save();
  return false;
}

/* ---------- מעקב יוטיוב (RSS) ---------- */
export async function checkChannel(channelId) {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error('RSS נכשל');
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3);
  return entries.map((e) => {
    const b = e[1];
    const id = (b.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1] || '';
    const title = (b.match(/<title>(.*?)<\/title>/) || [])[1] || '';
    const pub = (b.match(/<published>(.*?)<\/published>/) || [])[1] || '';
    return { id, title, published: pub, url: `https://www.youtube.com/watch?v=${id}` };
  }).filter((v) => v.id);
}
export function extractChannelId(text) {
  const m = (text || '').match(/(?:channel\/|channel_id=|@)([A-Za-z0-9_\-@.]+)/) || (text || '').match(/UC[A-Za-z0-9_\-]{20,}/);
  if (!m) return null;
  let v = m[1] || m[0];
  if (v.startsWith('UC')) return v;
  return '@' + v.replace(/^@/, ''); // handle לשם משתמש — דורש המרה, נשמר כמזהה
}
