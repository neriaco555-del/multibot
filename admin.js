/**
 * 🛡️ עזרי ניהול קבוצה — קובץ חדש, לא שובר שום דבר קיים.
 * כל ההגדרות נשמרות ב-bot-store.json דרך gdata() מ-advanced.js
 * (עם ברירות מחדל תואמות-לאחור, כך שקבוצות קיימות לא נשברות).
 */

// ---------- זיהוי קישורים ----------
const LINK_RE = /(https?:\/\/|www\.|bit\.ly|t\.me\/|whatsapp\.com\/|chat\.whatsapp\.com\/|instagram\.com\/|tiktok\.com\/|youtube\.com\/|youtu\.be\/)/i;
export function hasLink(text) {
  return LINK_RE.test(text || '');
}
/** כל הדומיינים/כתובות שמופיעים בטקסט. */
export function linkDomains(text) {
  const out = [];
  const re = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z0-9.-]+)(?:[\/?#\s]|$)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    out.push(m[1].toLowerCase());
  }
  return [...new Set(out)];
}
/** true אם יש קישור חסום (דומיין שלא ברשימת המותרים). רשימה ריקה = הכל חסום. */
export function hasBlockedLink(text, allow = []) {
  if (!hasLink(text)) return false;
  const allowList = (Array.isArray(allow) ? allow : []).map((d) => String(d || '').toLowerCase().replace(/^www\./, '').trim()).filter(Boolean);
  if (!allowList.length) return true;
  const doms = linkDomains(text).map((d) => d.replace(/^www\./, ''));
  if (!doms.length) return true; // זוהה כקישור אבל בלי דומיין ברור — חוסמים
  return doms.some((d) => !allowList.some((a) => d === a || d.endsWith(`.${a}`)));
}

// ---------- מילות קללה (רשימת בסיס, ניתנת להרחבה דרך !מילה-אסורה) ----------
const DEFAULT_CURSES = [
  'מזדיין', 'מזדין', 'מזוין', 'בן זונה', 'בת זונה', 'זונה', 'זונות', 'זין', 'זיין',
  'כוס', 'מניאק', 'שרמוטה', 'הומו', 'מפגר',
];
const HEB = 'א-תa-zA-Z0-9_';
function hasWord(t, w) {
  // גבולות עבריים אמיתיים (\b לא עובד בעברית!) + אותיות יחס תחיליות (ב/כ/ל/מ/ש/ה/ו)
  const esc = String(w || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!esc) return false;
  // סיומות נפוצות (נקבה/רבים) — בלי ה' (מכוסה/כוסה חפים!)
  const re = new RegExp(`(^|[^${HEB}])(?:[בכלמשהו]|וה|וב|וכ|ול|ומ|וש)?${esc}(?:ת|ים|ות)?(?![${HEB}])`, 'i');
  return re.test(t || '');
}
export function hasCurse(text, extra = []) {
  const t = String(text || '').toLowerCase();
  const all = [...DEFAULT_CURSES, ...(extra || [])];
  return all.some((w) => w && hasWord(t, String(w).toLowerCase()));
}

// ---------- מטמון מטא-דאטה של קבוצה (למנוע הצפת API) ----------
const metaCache = new Map(); // jid -> { at, data }
const META_TTL = 60 * 1000;

export async function getGroupMeta(sock, jid, force = false) {
  const now = Date.now();
  const cached = metaCache.get(jid);
  if (!force && cached && now - cached.at < META_TTL) return cached.data;
  const data = await sock.groupMetadata(jid);
  metaCache.set(jid, { at: now, data });
  return data;
}
export function invalidateMeta(jid) {
  metaCache.delete(jid);
}

// נרמול מזהה משתתף (תמיכה ב-@lid החדש וב-@s.whatsapp.net הישן)
function normId(id) {
  return String(id || '').split('@')[0].split(':')[0];
}

export function findParticipant(meta, senderId) {
  const want = normId(senderId);
  return (meta?.participants || []).find((p) =>
    normId(p.id) === want || (p.phoneNumber && normId(p.phoneNumber) === want)
  ) || null;
}

// מזהה קנוני: תמיד בצורת participant (LID בקבוצות חדשות) —
// כך שאזהרות/השתקות/הרחקות נשמרות תמיד תחת אותו מפתח, לא משנה
// אם הגיעו ממנשן (PN), מתגובה או ממפתח ההודעה (LID).
export function canonicalId(meta, userId) {
  if (!userId) return userId;
  const p = findParticipant(meta, userId);
  return p?.id || userId;
}

export async function resolveCanonical(sock, jid, userId) {
  try {
    const meta = await getGroupMeta(sock, jid);
    return canonicalId(meta, userId);
  } catch {
    return userId;
  }
}

export async function isSenderAdmin(sock, jid, senderId) {
  try {
    // הבעלים שכותב מהחשבון של הבוט — תמיד מורשה
    if (senderId === 'me') return true;
    const meta = await getGroupMeta(sock, jid);
    const p = findParticipant(meta, senderId);
    return p?.admin === 'admin' || p?.admin === 'superadmin';
  } catch {
    return false; // בלי מידע — לא מאשרים פעולת מנהל
  }
}

export async function isBotAdmin(sock, jid) {
  try {
    const meta = await getGroupMeta(sock, jid);
    // הבוט מזוהה לפעמים כ-PN ולפעמים כ-LID — בודקים את שתי הצורות
    const candidates = [sock.user?.id, sock.user?.lid].filter(Boolean);
    for (const c of candidates) {
      const p = findParticipant(meta, c);
      if (p?.admin === 'admin' || p?.admin === 'superadmin') return true;
    }
    return false;
  } catch {
    return false;
  }
}

// הרחקה עם פתרון מזהה קנוני + דיווח סיבה (לא שקט!)
export async function kickParticipant(sock, jid, userId) {
  try {
    const target = await resolveCanonical(sock, jid, userId);
    await sock.groupParticipantsUpdate(jid, [target], 'remove');
    invalidateMeta(jid);
    return { ok: true, target };
  } catch (e) {
    console.error('kick fail:', e?.message?.slice(0, 200));
    return { ok: false, error: e?.message?.slice(0, 120) || 'unknown' };
  }
}

export async function listAdmins(sock, jid) {
  try {
    const meta = await getGroupMeta(sock, jid);
    return (meta?.participants || []).filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
  } catch {
    return [];
  }
}

// ---------- חילוץ משתמש ממנשן או מתגובה ----------
export function extractTarget(msg) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
  if (ctx?.participant) return ctx.participant; // תגובה (Reply) — המשתתף המצוטט
  return null;
}

// ---------- אזהרות (נשמר ב-store של הקבוצה) ----------
export function addWarn(gd, userId) {
  if (!gd.warns) gd.warns = {};
  gd.warns[userId] = (gd.warns[userId] || 0) + 1;
  return gd.warns[userId];
}
export function getWarns(gd, userId) {
  return (gd.warns || {})[userId] || 0;
}
export function clearWarns(gd, userId) {
  if (gd.warns) delete gd.warns[userId];
}
// איחוד אזהרות שנשמרו תחת מזהה ישן (PN) עם המזהה הקנוני (LID)
export function mergeWarnAlias(gd, canonical, raw) {
  if (!gd.warns) gd.warns = {};
  if (raw && raw !== canonical && gd.warns[raw]) {
    gd.warns[canonical] = (gd.warns[canonical] || 0) + gd.warns[raw];
    delete gd.warns[raw];
  }
  return gd.warns[canonical] || 0;
}
export function clearWarnsAll(gd, ...ids) {
  if (!gd.warns) return;
  for (const id of new Set(ids.filter(Boolean))) delete gd.warns[id];
}

// ---------- השתקה מקומית (הבוט מוחק הודעות של מושתקים) ----------
export function isMuted(gd, userId) {
  return (gd.muted || []).includes(userId) || (gd.muted || []).includes(normId(userId));
}
export function muteUser(gd, userId) {
  if (!gd.muted) gd.muted = [];
  if (!isMuted(gd, userId)) gd.muted.push(userId);
}
export function unmuteUser(gd, userId) {
  if (!gd.muted) return;
  const want = normId(userId);
  gd.muted = gd.muted.filter((x) => normId(x) !== want && x !== userId);
}

// ---------- מחיקת הודעה (דורש שהבוט מנהל) ----------
export async function deleteMsg(sock, jid, msg) {
  try {
    await sock.sendMessage(jid, {
      delete: {
        remoteJid: jid,
        fromMe: !!msg.key.fromMe,
        id: msg.key.id,
        participant: msg.key.participant || msg.key.remoteJid,
      },
    });
    return true;
  } catch {
    return false;
  }
}

// ---------- בניית טקסט ברוכים הבאים ----------
export const COMMANDS_BRIEF =
  `🤖 *מה הבוט יודע? (הכל עם !)*\n` +
  `💬 !שאל — צ'אט חכם (מחפש בגוגל אוטומטית)\n` +
  `🎨 !תמונה — יצירת תמונה · ⭐ !סטיקר · 🔊 !דבר\n` +
  `🎵 !שיר · 🎬 !וידאו · 🖼️ !תמונות\n` +
  `🌤️ !מזג · 🕯️ !שבת · 📈 !מניה · 📰 !חדשות\n` +
  `🌍 !תרגום · 🔗 !קצר · 🔳 !qr\n` +
  `🎲 !קוביה · !בחר · 🎯 !טריוויה · ⏰ !תזכורת\n` +
  `🎮 !איקס-עיגול · !אמת-או-חובה · !מלחמת-משפטים\n` +
  `📖 מדריך מלא: !עזרה`;

export const DEFAULT_WELCOME = `👋 ברוך הבא {שם} לקבוצת {קבוצה}! 🎉\n\n{פקודות}`;

export function buildWelcome(text, name, group) {
  return String(text || '')
    .replaceAll('{שם}', name || 'חבר חדש')
    .replaceAll('{קבוצה}', group || '')
    .replaceAll('{פקודות}', COMMANDS_BRIEF)
    .slice(0, 1500);
}
