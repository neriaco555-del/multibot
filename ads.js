/**
 * 📣 מודול פרסומות — שולח פרסומות/מוצרי שותפים לקבוצות שנבחרו בפאנל.
 * יעדי הפרסום = tag-broadcast.json (הקבוצות שסומנו "תיוג פרסום" בפאנל).
 * הגדרות התנהגות = ads-config.json. מצב/מונים = ads-state.json.
 * כל שליחה מוגבלת: רשימת יעדים מפורשת, שעות פעילות, מרווח מינימלי ומכסה יומית.
 */
import fs from 'node:fs';
import { searchProducts, affiliateUrl } from './aliexpress.js';

const CFG_PATH = new URL('./ads-config.json', import.meta.url);
const STATE_PATH = new URL('./ads-state.json', import.meta.url);
const TARGETS_PATH = new URL('./tag-broadcast.json', import.meta.url);

const DEFAULT_CFG = {
  enabled: false,
  categories: ["גאדג'טים לבית", 'אביזרים לטלפון', 'מוצרי מטבח'],
  customAds: [],
  intervalMinutes: 180,
  maxPerDay: 3,
  activeHours: [9, 22],
  productsPerAd: 3,
  header: '🛒 *מבצעים חמים*',
  footer: '📌 קישורי שותפים — הרכישה שלך תומכת בנו ❤️',
  sendDelayMs: 2000,
};

function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}
function writeJson(path, obj) {
  try {
    fs.writeFileSync(path, JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

export function loadAdsConfig() {
  const raw = readJson(CFG_PATH, {}) || {};
  const cfg = { ...DEFAULT_CFG, ...raw };
  if (!Array.isArray(cfg.categories) || !cfg.categories.length) cfg.categories = DEFAULT_CFG.categories.slice();
  cfg.categories = cfg.categories.map((c) => String(c || '').trim()).filter(Boolean).slice(0, 30);
  if (!Array.isArray(cfg.activeHours) || cfg.activeHours.length < 2) cfg.activeHours = DEFAULT_CFG.activeHours.slice();
  cfg.intervalMinutes = Math.max(15, Number(cfg.intervalMinutes) || DEFAULT_CFG.intervalMinutes);
  cfg.maxPerDay = Math.max(1, Math.min(50, Number(cfg.maxPerDay) || DEFAULT_CFG.maxPerDay));
  cfg.productsPerAd = Math.max(1, Math.min(6, Number(cfg.productsPerAd) || DEFAULT_CFG.productsPerAd));
  cfg.sendDelayMs = Math.max(1000, Number(cfg.sendDelayMs) || DEFAULT_CFG.sendDelayMs);
  cfg.customAds = Array.isArray(cfg.customAds)
    ? cfg.customAds
        .filter((a) => a && typeof a.text === 'string' && a.text.trim())
        .map((a) => ({ text: String(a.text).slice(0, 2000), image: a.image ? String(a.image).trim() : '' }))
        .slice(0, 100)
    : [];
  cfg.enabled = !!cfg.enabled;
  return cfg;
}

export function saveAdsConfig(patch = {}) {
  const cur = loadAdsConfig();
  const next = { ...cur, ...(patch && typeof patch === 'object' ? patch : {}) };
  writeJson(CFG_PATH, next);
  return loadAdsConfig();
}

/** יעדי הפרסום — רק קבוצות שסומנו מפורשות, לא כל הקבוצות. */
export function adTargets() {
  const t = readJson(TARGETS_PATH, {}) || {};
  const targets = Array.isArray(t.targets) ? t.targets.filter((s) => typeof s === 'string' && s.endsWith('@g.us')) : [];
  return { enabled: t.enabled !== false, targets: [...new Set(targets)] };
}

function loadState() {
  const s = readJson(STATE_PATH, {}) || {};
  return {
    dayKey: typeof s.dayKey === 'string' ? s.dayKey : '',
    dayCount: Number(s.dayCount) || 0,
    lastPostAt: Number(s.lastPostAt) || 0,
    customIndex: Number(s.customIndex) || 0,
    categoryIndex: Number(s.categoryIndex) || 0,
  };
}
function saveState(s) {
  writeJson(STATE_PATH, s);
}

function dayKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function composeText(head, body, cfg) {
  const parts = [];
  if (cfg.header) parts.push(cfg.header);
  if (head) parts.push(head);
  if (body) parts.push(body);
  if (cfg.footer) parts.push(cfg.footer);
  return parts.join('\n\n').slice(0, 2000);
}

/** בונה פרסומת אחת — מוצרי AliExpress עם קישורי שותפים, או פרסומת ידנית שהגדרת. */
export async function buildAd(cfg = loadAdsConfig()) {
  if (cfg.customAds.length) {
    const st = loadState();
    const i = st.customIndex % cfg.customAds.length;
    const ad = cfg.customAds[i];
    saveState({ ...st, customIndex: i + 1 });
    return { text: ad.text.slice(0, 2000), image: ad.image || null };
  }
  if (!cfg.categories.length) throw new Error('אין קטגוריות פרסום מוגדרות');
  const st = loadState();
  const catIndex = st.categoryIndex % cfg.categories.length;
  const category = cfg.categories[catIndex];
  saveState({ ...st, categoryIndex: catIndex + 1 });
  const products = await searchProducts(category, cfg.productsPerAd);
  const first = products[0];
  const lines = products.map((p, i) => `${i + 1}. *${p.title}*\n   💰 ${p.price}\n   🔗 ${affiliateUrl(p.url)}`);
  return { text: composeText(`🔥 ${category}`, lines.join('\n\n'), cfg), image: first && first.img ? first.img : null };
}

async function deliver(sock, jid, ad) {
  if (ad.image) {
    try {
      await sock.sendMessage(jid, { image: { url: ad.image }, caption: ad.text });
      return true;
    } catch {}
  }
  await sock.sendMessage(jid, { text: ad.text });
  return true;
}

let adsBusy = false;

/** נקרא מה-scheduler כל דקה. שולח פרסומת רק כשהיא "בתור" ולפי כל המגבלות. */
export async function adsTick(sock) {
  if (adsBusy || !sock) return;
  const cfg = loadAdsConfig();
  const { enabled, targets } = adTargets();
  if (!cfg.enabled || !enabled || !targets.length) return;

  const now = new Date();
  const [startH, endH] = cfg.activeHours;
  if (now.getHours() < startH || now.getHours() >= endH) return;

  const st = loadState();
  const today = dayKeyNow();
  if (st.dayKey !== today) {
    st.dayKey = today;
    st.dayCount = 0;
  }
  if (st.dayCount >= cfg.maxPerDay) return;
  if (Date.now() - st.lastPostAt < cfg.intervalMinutes * 60000) return;

  adsBusy = true;
  try {
    const ad = await buildAd(cfg);
    if (!ad || !ad.text) return;
    let sent = 0;
    for (const jid of targets) {
      try {
        await deliver(sock, jid, ad);
        sent++;
      } catch (e) {
        console.warn(`📣 ad fail ${jid}:`, (e?.message || '').slice(0, 100));
      }
      await new Promise((r) => setTimeout(r, cfg.sendDelayMs));
    }
    st.lastPostAt = Date.now();
    st.dayCount += 1;
    saveState(st);
    console.log(`📣 ad sent to ${sent}/${targets.length} groups (${st.dayCount}/${cfg.maxPerDay} today)`);
  } catch (e) {
    console.warn('ads tick fail:', (e?.message || '').slice(0, 120));
  } finally {
    adsBusy = false;
  }
}

/** שליחה מיידית (מפקודת ניהול/פאנל) — מתעלמת מהמרווח, מכבדת את המכסה היומית. */
export async function sendAdNow(sock, { force = false } = {}) {
  if (!sock) return { ok: false, error: 'הבוט לא מחובר' };
  const cfg = loadAdsConfig();
  const { targets } = adTargets();
  if (!targets.length) return { ok: false, error: 'אין קבוצות מסומנות לפרסום' };
  const st = loadState();
  const today = dayKeyNow();
  if (st.dayKey !== today) {
    st.dayKey = today;
    st.dayCount = 0;
  }
  if (!force && st.dayCount >= cfg.maxPerDay) return { ok: false, error: `הגעת למכסה היומית (${cfg.maxPerDay})` };
  const ad = await buildAd(cfg);
  let sent = 0;
  for (const jid of targets) {
    try {
      await deliver(sock, jid, ad);
      sent++;
    } catch (e) {
      console.warn(`📣 ad-now fail ${jid}:`, (e?.message || '').slice(0, 100));
    }
    await new Promise((r) => setTimeout(r, cfg.sendDelayMs));
  }
  st.lastPostAt = Date.now();
  st.dayCount += 1;
  saveState(st);
  return { ok: true, sent, total: targets.length };
}

export function adsStatus() {
  const cfg = loadAdsConfig();
  const t = adTargets();
  const st = loadState();
  const today = dayKeyNow();
  return {
    ...cfg,
    targetsEnabled: t.enabled,
    targetCount: t.targets.length,
    todayCount: st.dayKey === today ? st.dayCount : 0,
    lastPostAt: st.lastPostAt,
  };
}
