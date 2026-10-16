/**
 * 🛡️ שומר AI למודרציית קבוצות — שכבת שיפוט חכמה מעל הפילטרים המהירים.
 *
 * עקרונות נגד false-positive (לא מוחקים סתם):
 * 1. שלב מהיר וחינמי תמיד קודם (regex / רשימת מילים / פענוח QR מקומי).
 * 2. ה-AI רק *מאשר* מחיקה של מועמד — לעולם לא מוחק על סמך ניחוש.
 * 3. סריקת-AI מלאה של כל הודעה רק כשהטוגל aiguard דלוק (עם מכסה ומטמון).
 * 4. כשה-AI לא זמין — נופלים להתנהגות הישנה (לא משביתים הגנה).
 */
import crypto from 'node:crypto';
import { chatAI } from './ai-chat.js';
import { describeImage } from './aimedia.js';
import { hasBlockedLink, hasCurse } from './admin.js';

const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

/* ---------- פענוח QR/ברקוד מקומי (חינמי, בלי AI) ---------- */
let jsqrMod = null;
async function getJsqr() {
  if (!jsqrMod) {
    const m = await import('jsqr');
    jsqrMod = m.default || m;
  }
  return jsqrMod;
}

/**
 * מפענח QR מתוך באפר תמונה. מחזיר מערך מחרוזות מפוענחות (ריק = אין QR).
 * עובד מקומית דרך sharp (פיקסלים גולמיים) + jsqr — אפס עלות, אפס false-positive
 * (או שזה QR תקין או שלא מפוענח כלום).
 */
export async function decodeQRCodes(buffer) {
  try {
    if (!buffer || buffer.length < 500) return [];
    const { default: sharp } = await import('sharp');
    const jsqr = await getJsqr();
    const out = [];
    // כמה גדלים/סיבובים — QR קטן או הפוך בתמונה
    const variants = [
      { w: 800, rot: 0 }, { w: 1200, rot: 0 },
    ];
    for (const v of variants) {
      try {
        let img = sharp(buffer).rotate().resize({ width: v.w, fit: 'inside', withoutEnlargement: true });
        const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const code = jsqr(new Uint8ClampedArray(data), info.width, info.height);
        if (code?.data) {
          const t = String(code.data).trim();
          if (t && !out.includes(t)) out.push(t.slice(0, 500));
        }
        if (out.length) break;
      } catch { /* וריאנט נכשל — ממשיכים */ }
    }
    return out;
  } catch {
    return [];
  }
}

/* ---------- מטמון שיפוטים (לא שורפים מכסה על אותו טקסט) ---------- */
const judgeCache = new Map(); // hash -> { at, verdict }
const JUDGE_TTL = 10 * 60 * 1000;
function cacheGet(key) {
  const r = judgeCache.get(key);
  if (r && Date.now() - r.at < JUDGE_TTL) return r.verdict;
  judgeCache.delete(key);
  return null;
}
function cacheSet(key, verdict) {
  if (judgeCache.size > 500) judgeCache.delete(judgeCache.keys().next().value);
  judgeCache.set(key, { at: Date.now(), verdict });
}

/* ---------- מכסה שיפוטים (מגן על מכסת Groq/Gemini החינמית) ---------- */
const judgeAt = []; // timestamps
const JUDGE_MAX_PER_MIN = 12;
function judgeBudget() {
  const now = Date.now();
  while (judgeAt.length && now - judgeAt[0] > 60000) judgeAt.shift();
  if (judgeAt.length >= JUDGE_MAX_PER_MIN) return false;
  judgeAt.push(now);
  return true;
}

/**
 * שופט AI לטקסט — מאשר/דוחה מחיקה.
 * @param {string} text — ההודעה
 * @param {object} opts — { stage1: 'link'|'curse'|'spam'|'qr'|null, allowDomains:[], extraWords:[] }
 * @returns {Promise<{del:boolean, kind:string, reason:string}|null>} — null = ה-AI לא זמין
 */
export async function aiJudgeText(text, opts = {}) {
  const clean = String(text || '').trim().slice(0, 500);
  if (clean.length < 1) return { del: false, kind: 'none', reason: 'empty' };
  const key = 't:' + md5(clean + '|' + (opts.stage1 || '') + '|' + (opts.allowDomains || []).join(','));
  const hit = cacheGet(key);
  if (hit) return hit;
  if (!judgeBudget()) return null;

  const stageNote = opts.stage1
    ? `הפילטר המהיר חשד ב-${opts.stage1 === 'link' ? 'קישור חסום' : opts.stage1 === 'curse' ? 'קללה' : opts.stage1 === 'qr' ? 'ברקוד עם קישור' : 'ספאם'}.`
    : 'אין חשד מהפילטר המהיר — סריקה חופשית.';
  const allowNote = (opts.allowDomains || []).length
    ? `דומיינים מותרים בקבוצה (לא למחוק בגללם): ${(opts.allowDomains || []).join(', ')}.`
    : 'אין דומיינים מותרים — כל קישור חיצוני חשוד.';
  const prompt =
    `אתה מנהל קבוצת וואטסאפ. החלט אם למחוק הודעה. ענה JSON בלבד, בדיוק בפורמט: {"del":true/false,"kind":"curse"/"link"/"spam"/"none","reason":"הסבר קצר בעברית"}\n` +
    `כללים:\n` +
    `- מחק קללות אמיתיות, עלבונות, שפה גסה מכוונת. אל תמחק מילים תמימות בהקשר נקי (למשל "כוס קפה", ציטוט חדשות, דיון חינוכי, "מפגר" כחלק ממילה אחרת).\n` +
    `- מחק קישורי ספאם/פרסומת/הזמנות לקבוצות אחרות. אל תמחק קישור אם הוא חלק טבעי משיחה (למשל מישהו שולח סרטון רלוונטי לשאלה) — אלא אם ${opts.stage1 === 'link' || opts.stage1 === 'qr' ? 'הקבוצה במצב אנטי-קישורים ואז מחק כל קישור חיצוני' : 'מדובר בספאם ברור'}.\n` +
    `- ${allowNote}\n` +
    `- ${stageNote}\n` +
    `הודעה לבדיקה: """${clean}"""`;
  try {
    const { text: ans } = await Promise.race([
      chatAI(prompt, []),
      new Promise((_, rej) => setTimeout(() => rej(new Error('judge-timeout')), 20000)),
    ]);
    const m = String(ans || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const verdict = {
      del: j.del === true,
      kind: ['curse', 'link', 'spam'].includes(j.kind) ? j.kind : (j.del ? (opts.stage1 || 'spam') : 'none'),
      reason: String(j.reason || '').slice(0, 120),
    };
    cacheSet(key, verdict);
    return verdict;
  } catch {
    return null;
  }
}

/**
 * שופט AI לתמונה — האם למחוק (עירום/תוכן פוגעני/ברקוד זדוני).
 * קודם מוקטנת מקומית כדי לחסוך רוחב פס.
 * @returns {Promise<{del:boolean, kind:string, reason:string}|null>}
 */
export async function aiJudgeImage(buffer) {
  try {
    if (!buffer || buffer.length < 1000) return { del: false, kind: 'none', reason: 'tiny' };
    const key = 'i:' + crypto.createHash('md5').update(buffer.slice(0, 65536)).digest('hex') + ':' + buffer.length;
    const hit = cacheGet(key);
    if (hit) return hit;
    if (!judgeBudget()) return null;
    const { default: sharp } = await import('sharp');
    const small = await sharp(buffer).rotate().resize({ width: 512, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
    const ans = await Promise.race([
      describeImage(small, 'האם התמונה מכילה עירום/תוכן מיני, אלימות קשה, סמלי שנאה או תוכן פוגעני אחר שמצדיק מחיקה מקבוצה משפחתית? ענה JSON בלבד: {"del":true/false,"reason":"הסבר קצר"}. תמונה רגילה (נוף, אוכל, אנשים לבושים, ממים נקיים, צילומי מסך) = del:false.'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('imgjudge-timeout')), 45000)),
    ]);
    const m = String(ans || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const verdict = { del: j.del === true, kind: j.del ? 'image' : 'none', reason: String(j.reason || '').slice(0, 120) };
    cacheSet(key, verdict);
    return verdict;
  } catch {
    return null;
  }
}

/**
 * בדיקת שלב-1 לטקסט (הפילטרים המהירים הקיימים) — מחזיר 'link'|'curse'|null.
 * (ספאם-הצפה נשאר ב-spamCheck הקיים.)
 */
export function stage1Text(text, { allowDomains = [], extraWords = [] } = {}) {
  if (hasBlockedLink(text, allowDomains)) return 'link';
  if (hasCurse(text, extraWords)) return 'curse';
  return null;
}
