/**
 * 💼 מודול עבודות — אוסף משרות מ-JobMaster (כל הסוגים/הגילאים) ומ-Job Scouter (אימות פעילות).
 * לא ממציא משרות: כל כרטיס מגיע ממודעה אמיתית עם קישור להגשה/יצירת קשר.
 */
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const JM = 'https://www.jobmaster.co.il';
const JS = 'https://job-scouter.com';
const STORE_PATH = new URL('./jobs-store.json', import.meta.url);

const AGE_TAGS = ['עבודה לנוער', 'עבודה לסטודנטים', 'פנסיונרים', 'בני 50 פלוס', 'ללא נסיון', 'אקדמאים ללא נסיון', 'חיילים משוחררים', 'משרות לאמהות', 'מתאים לאנשים עם מוגבלויות'];

const DEFAULT_QUERIES = [
  { q: 'עבודה', label: 'כללי' },
  { q: 'עבודה לנוער', label: 'נוער' },
  { q: 'עבודה לסטודנטים', label: 'סטודנטים' },
  { q: 'עבודה ללא ניסיון', label: 'ללא ניסיון' },
  { q: 'פנסיונרים', label: 'גיל הזהב' },
  { q: 'בני 50 פלוס', label: '50+' },
  { q: 'עבודה מהבית', label: 'מהבית' },
  { q: 'משרה חלקית', label: 'חלקית' },
];

function decode(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&ndash;/gi, '-')
    .replace(/&mdash;/gi, '-')
    .replace(/&hellip;/gi, '…')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}
function strip(s) {
  return decode(String(s || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function cleanUrl(u, base) {
  try { return new URL(decode(u), base).toString(); } catch { return ''; }
}
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }
function normKey(s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 120); }

async function fetchText(url, ms = 25000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.6' },
    signal: AbortSignal.timeout(ms),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const _cache = new Map(); // url -> { at, value }
const CACHE_TTL = 8 * 60 * 1000;
function cacheGet(key) {
  const x = _cache.get(key);
  if (x && Date.now() - x.at < CACHE_TTL) return x.value;
  _cache.delete(key);
  return null;
}
function cacheSet(key, value) {
  if (_cache.size > 120) _cache.delete(_cache.keys().next().value);
  _cache.set(key, { at: Date.now(), value });
}

/* ================= אחסון וסטטוסים ================= */
export function loadJobsStore() {
  try {
    const s = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    if (!s || typeof s !== 'object') throw 0;
    s.posted = s.posted && typeof s.posted === 'object' ? s.posted : {};
    s.status = s.status && typeof s.status === 'object' ? s.status : {};
    if (typeof s.auto !== 'boolean') s.auto = true;
    if (typeof s.queryIndex !== 'number') s.queryIndex = 0;
    return s;
  } catch {
    return { posted: {}, status: {}, auto: true, queryIndex: 0, lastDigest: '' };
  }
}
export function saveJobsStore(s) {
  try { fs.writeFileSync(STORE_PATH, JSON.stringify(s)); } catch {}
}
export function setJobStatus(key, status) {
  const s = loadJobsStore();
  if (status === 'open') delete s.status[key];
  else s.status[key] = status;
  saveJobsStore(s);
  return s.status[key] || 'open';
}
export function getJobStatus(key) {
  return loadJobsStore().status[key] || '';
}
export function isPosted(key, days = 7) {
  const s = loadJobsStore();
  const p = s.posted[key];
  return !!(p && Date.now() - (p.at || 0) < days * 86400000);
}
export function recordPosted(jobs) {
  const s = loadJobsStore();
  for (const j of jobs || []) s.posted[j.key] = { at: Date.now(), title: j.title, company: j.company || '', source: j.source || '' };
  // ניקוי רשומות ישנות
  const cut = Date.now() - 30 * 86400000;
  for (const [k, v] of Object.entries(s.posted)) if (!v || (v.at || 0) < cut) delete s.posted[k];
  saveJobsStore(s);
}
export function markSeen(jobs) {
  const s = loadJobsStore();
  for (const j of jobs || []) {
    if (!s.posted[j.key]) s.posted[j.key] = { at: Date.now(), title: j.title, company: j.company || '', source: j.source || '', silent: true };
  }
  saveJobsStore(s);
}

export function markUnavailable(jobs) {
  const s = loadJobsStore();
  for (const j of jobs || []) s.status[j.key] = 'taken';
  saveJobsStore(s);
}

export function setJobsAuto(on) {
  const s = loadJobsStore();
  s.auto = !!on;
  saveJobsStore(s);
  return s.auto;
}
export function jobsAutoOn() { return loadJobsStore().auto !== false; }

/* ================= JobMaster ================= */
function parseJobMasterCards(html, young = false) {
  const out = [];
  const splitter = young ? /(?=<li id="misra\d+" class="job-card")/ : /(?=<article id="misra\d+" class="CardStyle JobItem)/;
  const chunks = String(html || '').split(splitter).slice(1);
  for (const chunk of chunks) {
    const idm = chunk.match(/id="misra(\d+)"/);
    if (!idm) continue;
    const id = idm[1];
    let title = '', company = '', location = '', types = [], suitable = [], snippet = '', posted = '';
    if (young) {
      title = strip((chunk.match(/<h2 class="job-card__content-title">([\s\S]*?)<\/h2>/) || [])[1]);
      company = strip((chunk.match(/<span class="brand-company__info-title">([\s\S]*?)<\/span>/) || [])[1]);
      location = strip((chunk.match(/<span class="brand-company__info-address">([\s\S]*?)<\/span>/) || [])[1]);
      const typeBlock = (chunk.match(/<li tabindex="0" class="jobType">([\s\S]*?)<\/li>/) || [])[1];
      types = typeBlock ? [strip(typeBlock)] : [];
      suitable = ['נוער'];
    } else {
      title = strip((chunk.match(/<a class="CardHeader[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
      company = strip((chunk.match(/<a[^>]*class="[^"]*CompanyNameLink[^"]*"[^>]*>[\s\S]*?<span>([\s\S]*?)<\/span>/) || [])[1]);
      location = strip((chunk.match(/<li class="jobLocation">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
      const typeBlock = (chunk.match(/<li tabindex="0" class="jobType">([\s\S]*?)<\/li>/) || [])[1];
      if (typeBlock) types = uniq([...typeBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1])));
      const suitBlock = (chunk.match(/<li tabindex="0" class="jobSuitableFor">([\s\S]*?)<\/li>/) || [])[1];
      if (suitBlock) suitable = uniq([...suitBlock.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1])));
      snippet = strip((chunk.match(/<div class="jobShortDescription[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]).slice(0, 300);
      posted = strip((chunk.match(/<span class="Gray">\s*([\s\S]*?)\s*<\/span>/) || [])[1]).slice(0, 80);
    }
    if (!title) continue;
    const detailUrl = young ? `${JM}/young/job/?num=${id}` : `${JM}/jobs/checknum.asp?key=${id}`;
    out.push({
      key: `jm:${id}`,
      id,
      provider: 'jobmaster',
      source: 'JobMaster',
      title,
      company,
      location,
      types,
      ageTags: suitable.filter((x) => AGE_TAGS.includes(x) || /נוער|סטודנט|פנסי|50|ללא נסיון|אמהות|מוגבל|משוחרר/.test(x)),
      snippet,
      posted,
      detailUrl,
      applyUrl: detailUrl,
      active: null,
      scouterStatus: '',
    });
  }
  return out;
}

export async function fetchJobMaster({ q = 'עבודה', young = false, limit = 30 } = {}) {
  const url = young
    ? `${JM}/young/jobs/${q && q !== 'עבודה' ? `?q=${encodeURIComponent(q)}` : ''}`
    : `${JM}/jobs/?q=${encodeURIComponent(q || 'עבודה')}`;
  const cached = cacheGet(url);
  if (cached) return cached.slice(0, limit);
  const html = await fetchText(url);
  const out = parseJobMasterCards(html, young);
  cacheSet(url, out);
  return out.slice(0, limit);
}

async function enrichJobMaster(job) {
  try {
    const html = await fetchText(job.detailUrl, 20000);
    const young = /young\/job/.test(job.detailUrl);
    let title = '';
    let desc = '';
    let req = '';
    if (young) {
      title = strip((html.match(/<h1 class="job-page__content-title">([\s\S]*?)<\/h1>/) || [])[1]);
      desc = strip((html.match(/<div class="job-page__content-description">[\s\S]*?<div class="content">([\s\S]*?)<\/div>/) || [])[1]);
      req = strip((html.match(/<div class="job-page__content-requirements">[\s\S]*?<div class="content">([\s\S]*?)<\/div>/) || [])[1]);
    } else {
      title = strip((html.match(/<div class="CardHeader"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
      desc = strip((html.match(/<div id="jobDescriptionContent"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
      req = strip((html.match(/<div id="jobRequirementsContent"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    }
    const attrs = strip((html.match(/<div class="job-page__content-attributs">([\s\S]*?)<\/div>/) || [])[1]);
    job.active = !!(desc || (title && normKey(title).slice(0, 30) === normKey(job.title).slice(0, 30)));
    if (title) job.title = title;
    if (desc) job.description = desc.slice(0, 1200);
    if (req) job.requirements = req.slice(0, 800);
    if (attrs) job.attributes = attrs.slice(0, 300);
    const contactText = `${desc}\n${req}`;
    job.emails = uniq([...contactText.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0])).filter((e) => !/jobmaster|example/i.test(e));
    if (/טלפון|נייד|וואטסאפ|צור קשר|לפנות|קורות חיים|אימייל|מייל/i.test(contactText)) {
      job.phones = uniq([...contactText.matchAll(/(?:\+972|0)(?:[-\s]?\d){8,10}/g)].map((m) => m[0].replace(/\s+/g, ' ').trim()));
    }
    return job;
  } catch {
    job.active = null;
    return job;
  }
}

/* ================= Job Scouter ================= */
function parseScouterCards(html) {
  const out = [];
  const cards = [...String(html || '').matchAll(/<article class="jcard" data-card-job="(\d+)">([\s\S]*?)<\/article>/g)];
  for (const m of cards) {
    const id = m[1];
    const b = m[2];
    const title = strip((b.match(/<h3 class="jcard-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!title) continue;
    const postedM = b.match(/<p class="jcard-posted">[\s\S]*?<time[^>]*>([\s\S]*?)<\/time>[\s\S]*?<span class="jcard-co">([\s\S]*?)<\/span>/);
    const posted = strip(postedM?.[1] || '');
    const source = strip(postedM?.[2] || (b.match(/<li class="jcard-fact jcard-fact-src">[\s\S]*?<span dir="auto">([\s\S]*?)<\/span>/) || [])[1] || 'Job Scouter');
    const company = /אצל/.test((b.match(/<p class="jcard-posted">([\s\S]*?)<\/p>/) || [])[1] || '')
      ? strip((b.match(/<a class="jcard-co[^"]*"[^>]*>([\s\S]*?)<\/a>/) || [])[1]) : '';
    const locBlock = (b.match(/<li class="jcard-fact">([\s\S]*?)<\/li>/) || [])[1] || '';
    const location = uniq(strip(locBlock).split(/\n+/).map((x) => x.trim())).join(', ');
    const statusM = b.match(/<li class="tchip (tchip-[a-z]+)">[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const statusType = statusM?.[1] || '';
    const statusText = strip(statusM?.[2] || '');
    const snippet = strip((b.match(/<p class="jcard-snip"[^>]*>([\s\S]*?)<\/p>/) || [])[1]).slice(0, 300);
    const applyUrl = cleanUrl((b.match(/<a class="jcard-apply" href="([^"]+)"/) || [])[1] || '', JS);
    const detailUrl = `${JS}/jobs/${id}`;
    const liRaw = (b.match(/href="(https:\/\/www\.linkedin\.com\/search\/results\/people\/[^"]+)"/) || [])[1] || '';
    const linkedin = liRaw ? cleanUrl(liRaw, JS) : '';
    out.push({
      key: `js:${id}`,
      id,
      provider: 'jobscouter',
      source: source || 'Job Scouter',
      company,
      title,
      location,
      types: [],
      ageTags: [],
      snippet,
      posted,
      detailUrl,
      applyUrl: applyUrl || detailUrl,
      linkedin,
      active: statusType === 'tchip-ok' ? true : statusType === 'tchip-mut' ? null : false,
      scouterStatus: statusType === 'tchip-ok' ? 'verified' : statusType === 'tchip-mut' ? 'checked' : 'inactive',
      statusText,
    });
  }
  return out;
}

export async function fetchJobScouter({ q = 'עבודה', verified = false, limit = 30 } = {}) {
  const url = `${JS}/search?q=${encodeURIComponent(q || 'עבודה')}${verified ? '&verified=1' : ''}`;
  const cached = cacheGet(url);
  if (cached) return cached.slice(0, limit);
  const html = await fetchText(url);
  const out = parseScouterCards(html);
  cacheSet(url, out);
  return out.slice(0, limit);
}

/* ================= איחוד ובחירה ================= */
function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const k = `${normKey(j.title)}|${normKey(j.company || j.source)}`;
    if (seen.has(k) || seen.has(j.key)) continue;
    seen.add(k); seen.add(j.key);
    out.push(j);
  }
  return out;
}

function pickDiverse(jobs, limit) {
  const out = [];
  const usedLabels = new Set();
  const usedCompanies = new Set();
  // קודם כל משרה אחת מכל קטגוריית גיל/מקור — מבטיח "כל הסוגים והגילאים"
  for (const j of jobs) {
    const lab = j.queryLabel || 'כללי';
    if (usedLabels.has(lab)) continue;
    if (out.some((x) => x.key === j.key)) continue;
    out.push(j);
    usedLabels.add(lab);
    usedCompanies.add(normKey(j.company || j.source));
    if (out.length >= limit) return out;
  }
  // השלמה: משרות נוספות, עדיפות לחברות חדשות
  for (const j of jobs) {
    if (out.some((x) => x.key === j.key)) continue;
    const co = normKey(j.company || j.source);
    if (usedCompanies.has(co) && out.length < limit - 1) continue;
    out.push(j);
    if (out.length >= limit) break;
  }
  if (out.length < limit) {
    for (const j of jobs) {
      if (out.length >= limit) break;
      if (!out.some((x) => x.key === j.key)) out.push(j);
    }
  }
  return out;
}

export async function getJobs({ query = '', limit = 5, includeSeen = false, digest = false } = {}) {
  const q = String(query || '').trim();
  const groups = [];
  if (q) {
    const qTag = /נוער/.test(q) ? 'עבודה לנוער' : /סטודנט/.test(q) ? 'עבודה לסטודנטים' : /פנסי/.test(q) ? 'פנסיונרים' : /ללא ניסיון/.test(q) ? 'ללא נסיון' : '';
    const tag = (j) => { j.queryLabel = q; if (qTag) j.ageTags = uniq([qTag, ...(j.ageTags || [])]); };
    const jm = await fetchJobMaster({ q, limit: 25 }).catch(() => []);
    jm.forEach(tag);
    const js = await fetchJobScouter({ q, verified: true, limit: 15 }).catch(() => []);
    js.forEach(tag);
    groups.push({ label: q, jobs: [...jm, ...js] });
  } else {
    const items = [
      { q: 'עבודה', label: 'כללי' },
      { q: 'עבודה לנוער', label: 'נוער' },
      { q: 'עבודה לסטודנטים', label: 'סטודנטים' },
      { q: 'פנסיונרים', label: 'גיל הזהב' },
      { q: 'עבודה ללא ניסיון', label: 'ללא ניסיון' },
    ];
    const store = loadJobsStore();
    const start = ((store.queryIndex || 0) % items.length + items.length) % items.length;
    const ordered = [...items.slice(start), ...items.slice(0, start)];
    store.queryIndex = (start + 2) % items.length;
    saveJobsStore(store);
    // כללים + 3 קטגוריות גיל מתחלפות
    const picked = [ordered[0], ordered[1], ordered[2], ordered[3]];
    const LABEL_TAG = { 'נוער': 'עבודה לנוער', 'סטודנטים': 'עבודה לסטודנטים', 'גיל הזהב': 'פנסיונרים', 'ללא ניסיון': 'ללא נסיון' };
    for (const item of picked) {
      const arr = await fetchJobMaster({ q: item.q, limit: 10 }).catch(() => []);
      arr.forEach((j) => {
        j.queryLabel = item.label;
        const tag = LABEL_TAG[item.label];
        if (tag) j.ageTags = uniq([tag, ...(j.ageTags || [])]);
      });
      groups.push({ label: item.label, jobs: arr });
    }
    const young = await fetchJobMaster({ q: 'עבודה', young: true, limit: 8 }).catch(() => []);
    young.forEach((j) => { j.queryLabel = 'נוער'; j.ageTags = ['נוער']; });
    groups.push({ label: 'נוער', jobs: young });
    const js = await fetchJobScouter({ q: 'עבודה', verified: true, limit: 10 }).catch(() => []);
    js.forEach((j) => { j.queryLabel = 'מאומת'; });
    groups.push({ label: 'מאומת', jobs: js });
  }
  let merged = dedupe(groups.flatMap((g) => g.jobs));
  if (!includeSeen) merged = merged.filter((j) => !isPosted(j.key));
  merged = merged.filter((j) => getJobStatus(j.key) !== 'taken');
  for (const j of merged) j.manualStatus = getJobStatus(j.key);
  let selected = pickDiverse(merged, Math.max(limit, 1));
  // העשרת כל המשרות הנבחרות מ-JobMaster (תיאור/אימות/אימייל)
  await Promise.all(selected.filter((j) => j.provider === 'jobmaster').map((j) => enrichJobMaster(j)));
  return selected.slice(0, limit);
}

/** משרות חדשות לבדיקה תקופתית: כללי + נוער + מאומת, רק מה שטרם פורסם. */
export async function getNewJobs({ limit = 5 } = {}) {
  const [jm, young, js] = await Promise.all([
    fetchJobMaster({ q: 'עבודה', limit: 40 }).catch(() => []),
    fetchJobMaster({ q: 'עבודה', young: true, limit: 20 }).catch(() => []),
    fetchJobScouter({ q: 'עבודה', verified: true, limit: 20 }).catch(() => []),
  ]);
  jm.forEach((j) => { j.queryLabel = 'כללי'; });
  young.forEach((j) => { j.queryLabel = 'נוער'; j.ageTags = uniq(['נוער', ...(j.ageTags || [])]); });
  js.forEach((j) => { j.queryLabel = 'מאומת'; });
  const all = dedupe([...jm, ...young, ...js]);
  const unposted = all.filter((j) => !isPosted(j.key) && getJobStatus(j.key) !== 'taken');
  const selected = pickDiverse(unposted, Math.max(1, limit));
  await Promise.all(selected.filter((j) => j.provider === 'jobmaster').map((j) => enrichJobMaster(j)));
  // רק משרות שנבדקו עכשיו והן עדיין פתוחות
  const verified = [];
  const unavailable = [];
  for (const j of selected) {
    const ok = j.provider === 'jobscouter'
      ? j.scouterStatus === 'verified'
      : j.active === true;
    if (ok) verified.push(j);
    else if (j.provider === 'jobmaster' && j.active === false) unavailable.push(j);
    else if (j.provider === 'jobscouter' && j.scouterStatus === 'inactive') unavailable.push(j);
  }
  if (unavailable.length) markUnavailable(unavailable);
  return { jobs: verified, all, unposted };
}

/* ================= תצוגה ================= */
function statusLine(j) {
  if (j.manualStatus === 'taken') return '🔴 *סטטוס: נתפסה* — לא זמינה (עודכן ע״י מנהל)';
  if (j.scouterStatus === 'verified') return '✅ *סטטוס: לא נתפסה* — אומתה כפעילה באתר';
  if (j.scouterStatus === 'checked') return `🟡 *סטטוס: לא אומתה לאחרונה*${j.statusText ? ` (${j.statusText})` : ''} — ייתכן שנתפסה`;
  if (j.active === true) return '✅ *סטטוס: לא נתפסה* — נבדקה עכשיו באתר';
  if (j.active === false) return '🔴 *סטטוס: נתפסה / לא זמינה* — לא נמצאה בעמוד המשרה';
  return '🟡 *סטטוס: לא ידוע* — כדאי לוודא מול המעסיק';
}

export function formatJob(j, n = 1) {
  const bits = [];
  bits.push(`${n}. *${j.title}*`);
  const meta = [];
  if (j.company) meta.push(`🏢 ${j.company}`);
  if (j.location) meta.push(`📍 ${j.location}`);
  if (j.provider === 'jobscouter' && j.source) meta.push(`🏷️ ${j.source}`);
  if (j.types?.length) meta.push(`⏱️ ${j.types.slice(0, 2).join(' / ')}`);
  if (meta.length) bits.push(meta.join(' · '));
  if (j.ageTags?.length) bits.push(`👥 מתאים ל: ${j.ageTags.slice(0, 5).join(', ')}`);
  bits.push(statusLine(j));
  const desc = (j.description || j.snippet || '').replace(/\s+/g, ' ').trim();
  if (desc) bits.push(`📝 ${desc.slice(0, 220)}${desc.length > 220 ? '…' : ''}`);
  if (j.emails?.length) bits.push(`📧 ${j.emails.slice(0, 2).join(' · ')}`);
  if (j.phones?.length) bits.push(`📱 ${j.phones.slice(0, 2).join(' · ')}`);
  bits.push(`📩 *הגשה / יצירת קשר:* ${j.applyUrl}`);
  if (j.detailUrl && j.detailUrl !== j.applyUrl) bits.push(`ℹ️ פרטים: ${j.detailUrl}`);
  if (j.linkedin) bits.push(`👤 מגייסים בלינקדאין: ${j.linkedin}`);
  bits.push(`🆔 \`${j.key}\``);
  return bits.join('\n');
}

/** הודעה אחת בלבד (עד maxLen) — מחזיר גם את המשרות שנכללו בפועל. */
export function formatJobsSingle(jobs, title = 'עבודות חדשות', maxLen = 3800) {
  const header = `💼 *${title}*\n_הבוט בודק אוטומטית שהמשרה עדיין פתוחה. רק משרות שלא נתפסו._\n`;
  const footer = '\n\n━━━━━━━━━━━━━━\n✅ סטטוס נבדק אוטומטית · משרות חדשות נשלחות לכאן אוטומטית';
  const included = [];
  let text = header;
  for (const j of jobs || []) {
    const block = `\n${formatJob(j, included.length + 1)}\n`;
    if (text.length + block.length + footer.length > maxLen) break;
    text += block;
    included.push(j);
  }
  if (!included.length && jobs && jobs.length) {
    const j = jobs[0];
    const room = Math.max(500, maxLen - header.length - footer.length - 20);
    included.push(j);
    text += `\n${formatJob(j, 1).slice(0, room)}\n`;
  }
  return { text: `${text.trim()}${footer}`.trim(), included };
}

export function formatJobsDigest(jobs, title = 'עבודות חדשות') {
  if (!jobs.length) return [`💼 *${title}*\n\nלא מצאתי משרות חדשות כרגע. נסו: \`!עבודה <מילה>\` (למשל: נוער / סטודנטים / מהבית / בנייה).`];
  const header = `💼 *${title}*\n_הבוט בודק אוטומטית שהמשרה עדיין פתוחה. רק משרות שלא נתפסו._\n`;
  const chunks = [];
  let cur = header;
  jobs.forEach((j, i) => {
    const block = `\n${formatJob(j, i + 1)}\n`;
    if ((cur + block).length > 3300) { chunks.push(cur.trim()); cur = `💼 *${title} (המשך)*\n`; }
    cur += block;
  });
  if (cur.trim()) chunks.push(cur.trim());
  if (chunks.length) {
    chunks[chunks.length - 1] += '\n\n━━━━━━━━━━━━━━\n✅ סטטוס נבדק אוטומטית · משרות חדשות נשלחות לכאן אוטומטית';
  }
  return chunks;
}

/** בודק אם משרה עדיין קיימת ומחזיר סטטוס מעודכן. */
export async function verifyJob(job) {
  if (!job) return job;
  if (job.provider === 'jobmaster') return enrichJobMaster(job);
  try {
    const html = await fetchText(job.detailUrl, 15000);
    const hasTitle = html.includes(job.title.slice(0, 25));
    const removed = /המשרה (נמחקה|הוסרה|לא נמצאה)|no longer available|job not found/i.test(html);
    job.active = removed ? false : (hasTitle ? true : null);
  } catch { job.active = null; }
  return job;
}

export { DEFAULT_QUERIES, AGE_TAGS };
