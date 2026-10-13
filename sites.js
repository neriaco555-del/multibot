/**
 * 🌐 יצירת אתרים מהבוט — מודל חינמי כותב קוד (Groq) והעלאה אוטומטית לגיטהאב Pages.
 * עובד דרך `gh api` (המחשב כבר מחובר לחשבון — בלי טוקנים בקוד).
 * כל אתר = תיקייה sites/<id>/index.html בריפו אחד משותף, עם כתובת תצוגה מקדימה.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chatCode } from './ai-chat.js';

const execFileAsync = promisify(execFile);

export const SITES_REPO = process.env.SITES_REPO || 'whatsapp-sites';

let ownerCache = null;
export async function ghOwner() {
  if (ownerCache) return ownerCache;
  if (process.env.GH_OWNER) {
    ownerCache = process.env.GH_OWNER;
    return ownerCache;
  }
  const r = await execFileAsync('gh', ['api', 'user', '--jq', '.login'], { timeout: 30000 });
  ownerCache = String(r.stdout || '').trim();
  if (!ownerCache) throw new Error('NO_GH_AUTH');
  return ownerCache;
}

/** gh api עם פרמטרים שטוחים (-f מחרוזת, -F טיפוסי, קינון בסוגריים) */
function toGhArgs(obj, out = [], prefix = '') {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') toGhArgs(v, out, key);
    else if (typeof v === 'boolean' || typeof v === 'number') out.push('-F', `${key}=${v}`);
    else out.push('-f', `${key}=${String(v)}`);
  }
  return out;
}

async function ghApi(method, path, payload) {
  const args = ['api', '--method', method, path, ...toGhArgs(payload)];
  return execFileAsync('gh', args, { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
}

/** מוודא שהריפו קיים (יוצר ציבורי אם חסר) ושה-Pages מופעל. מחזיר {owner, repo}. */
export async function ensureSitesRepo() {
  const owner = await ghOwner();
  try {
    await ghApi('GET', `repos/${owner}/${SITES_REPO}`);
  } catch (e) {
    if (!String(e.message || '').includes('404')) throw e;
    await ghApi('POST', 'user/repos', {
      name: SITES_REPO,
      private: false,
      auto_init: true,
      description: 'אתרים שנוצרו אוטומטית מבוט הוואטסאפ 🌐',
    });
    // נותנים לגיטהאב שנייה להתארגן אחרי יצירה
    await new Promise((r) => setTimeout(r, 3000));
  }
  // הפעלת Pages (אם כבר פעיל — מתעלמים מהשגיאה)
  try {
    await ghApi('POST', `repos/${owner}/${SITES_REPO}/pages`, {
      source: { branch: 'main', path: '/' },
    });
  } catch {
    /* כבר מופעל או עדיין נבנה — לא קריטי */
  }
  return { owner, repo: SITES_REPO };
}

export const siteIdPath = (id) => `sites/${id}/index.html`;
export const siteUrl = (owner, id) => `https://${owner}.github.io/${SITES_REPO}/sites/${id}/`;

export function newSiteId() {
  return Math.random().toString(36).slice(2, 8).toLowerCase().replace(/[^a-z0-9]/g, 'x');
}

/** מזהה אתר מתוך טקסט מצוטט של הבוט (פורמט: 🌐 ... #abc123) */
export function extractSiteId(qtext) {
  const m = String(qtext || '').match(/🌐[\s\S]{0,300}#([a-z0-9]{4,12})/i);
  return m ? m[1].toLowerCase() : null;
}

function extractHtml(raw) {
  const t = String(raw || '');
  const m = t.match(/```html\s*([\s\S]*?)```/i) || t.match(/```\s*([\s\S]*?)```/);
  const code = (m ? m[1] : t).trim();
  if (!code.includes('<html')) throw new Error('NO_HTML');
  return code.slice(0, 120000);
}

const GEN_SYSTEM =
  'אתה בונה אתרים. החזר קובץ HTML יחיד, עצמאי לחלוטין (CSS ו-JS מוטבעים בתוך הקובץ, בלי ספריות חיצוניות), ' +
  'בעברית עם dir="rtl", מעוצב יפה ומודרני, מותאם למובייל. החזר קוד בלבד בתוך בלוק ```html — בלי הסברים לפני ואחרי. ' +
  'אחרי בלוק הקוד הוסף שורה בדיוק בפורמט: סיכום: <משפט אחד בעברית — מה האתר כולל, בלי קוד>. ' +
  'אם אי אפשר לבנות את מה שהתבקש (צריך שרת, מסד נתונים, תשלומים אמיתיים, התחברות וכדומה) — החזר בדיוק: CANNOT: <הסבר קצר בעברית מה חסר ולמה>.';

function parseCodeResponse(raw) {
  const t = String(raw || '');
  const cant = t.match(/^\s*CANNOT\s*:\s*(.+)$/im);
  if (cant) return { cannot: cant[1].trim().slice(0, 300) };
  const html = extractHtml(t); // זורק NO_HTML אם אין קוד
  const sm = t.match(/סיכום\s*:\s*(.+?)(?:\n|$)/);
  let summary = sm ? sm[1].trim().slice(0, 300) : '';
  // הגנה: הסיכום לעולם לא יכיל קוד
  summary = summary.replace(/```[\s\S]*```/g, '').replace(/<[^>]{3,}>/g, '').trim().slice(0, 300);
  return { html, summary };
}

/** יוצר HTML לאתר חדש לפי תיאור (מודל קוד חינמי). מחזיר {html, summary} או {cannot}. */
export async function generateSiteHTML(desc) {
  const d = String(desc || '').trim().slice(0, 500);
  if (!d) throw new Error('EMPTY');
  const { text } = await chatCode(`${GEN_SYSTEM}\nנושא האתר: ${d}`);
  return parseCodeResponse(text);
}

const UPDATE_SYSTEM =
  'אתה בונה אתרים. קיבלת קובץ HTML קיים ובקשת שינוי. החזר את הקובץ המלא המעודכן ' +
  '(HTML יחיד ועצמאי, עברית RTL), קוד בלבד בתוך בלוק ```html — בלי הסברים. ' +
  'אחרי בלוק הקוד הוסף שורה בדיוק בפורמט: סיכום: <משפט אחד בעברית — מה השתנה, בלי קוד>. ' +
  'אם אי אפשר לבצע את השינוי (צריך שרת, מסד נתונים, תשלומים אמיתיים, התחברות וכדומה) — החזר בדיוק: CANNOT: <הסבר קצר בעברית מה חסר ולמה>. ' +
  'הקפד ליישם בדיוק את מה שהתבקש — תקשיב לעריכה ותערוך רק אותה, בלי לשנות דברים אחרים.';

/** מעדכן HTML קיים לפי בקשת שינוי. מחזיר {html, summary} או {cannot}. */
export async function updateSiteHTML(currentHtml, changeReq) {
  const q = String(changeReq || '').trim().slice(0, 500);
  if (!q) throw new Error('EMPTY');
  const { text } = await chatCode(
    `${UPDATE_SYSTEM}\n\n--- קוד נוכחי ---\n${String(currentHtml).slice(0, 60000)}\n\n--- בקשת שינוי ---\n${q}`
  );
  return parseCodeResponse(text);
}

/** מעלה/מעדכן אתר בריפו. מחזיר {url, id}. */
export async function publishSite(id, html, message) {
  const { owner, repo } = await ensureSitesRepo();
  const contentPath = siteIdPath(id);
  const body = {
    message: String(message || `site ${id}`).replace(/\s+/g, ' ').slice(0, 200),
    content: Buffer.from(html, 'utf8').toString('base64'),
  };
  // עדכון? צריך sha קיים
  try {
    const cur = await ghApi('GET', `repos/${owner}/${repo}/contents/${contentPath}`);
    const sha = JSON.parse(String(cur.stdout || '{}')).sha;
    if (sha) body.sha = sha;
  } catch {
    /* קובץ חדש — בלי sha */
  }
  await ghApi('PUT', `repos/${owner}/${repo}/contents/${contentPath}`, body);
  return { url: siteUrl(owner, id), id, owner, repo };
}

/** מחכה שהכתובת תחזיר 200 (גיטהאב Pages מתעדכן באיחור) — עד timeoutMs. מחזיר true אם חי. */
export async function waitForSite(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 10000));
  }
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

/** שולף אתר קיים (html) או null אם לא נמצא. */
export async function getSite(id) {
  const { owner, repo } = await ensureSitesRepo();
  try {
    const cur = await ghApi('GET', `repos/${owner}/${repo}/contents/${siteIdPath(id)}`);
    const j = JSON.parse(String(cur.stdout || '{}'));
    if (!j.content) return null;
    const html = Buffer.from(String(j.content).replace(/\n/g, ''), 'base64').toString('utf8');
    return { html, owner, repo };
  } catch {
    return null;
  }
}

export const SITE_HELP =
  `🌐 *יצירת אתרים — איך משתמשים?*\n\n` +
  `• !אתר <תיאור> — יוצר אתר + כתובת תצוגה מקדימה\n` +
  `• הגב (Reply) להודעת האתר עם בקשת שינוי — מעדכן ושולח מחדש\n\n` +
  `📌 דוגמה:\n` +
  `• !אתר דף נחיתה לפיצרייה "טוני" עם תפריט וטלפון`;
