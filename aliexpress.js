/**
 * 🛒 חיפוש מוצרי AliExpress — בלי מפתח ובלי הרשמה (דף החיפוש הציבורי).
 * מחזיר כותרת + מחיר (₪) + תמונה + קישור.
 */
import { config } from './config.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function unesc(s) {
  return String(s || '')
    .replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/<!--.*?-->/g, '').trim();
}

export async function searchProducts(query, limit = 5) {
  const q = String(query || '').trim().slice(0, 60);
  if (q.length < 2) throw new Error('חיפוש קצר מדי');
  const url = `https://www.aliexpress.com/w/wholesale-${encodeURIComponent(q.replace(/\s+/g, '-'))}.html?searchText=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`ALIEXPRESS ${res.status}`);
  const h = await res.text();
  if (/captcha/i.test(h.slice(0, 2000))) throw new Error('ALIEXPRESS CAPTCHA');
  const parts = h.split(/<a\s/).slice(1).filter((s) => s.includes('search-card-item'));
  const out = [];
  const seen = new Set();
  for (const body of parts) {
    try {
      const href = (body.match(/^[^>]*href="([^"]+)"/) || [])[1] || '';
      const pid = (href.match(/productIds=(\d+)/) || href.match(/\/item\/(\d+)\.html/) || [])[1];
      if (!pid || seen.has(pid)) continue;
      const title = unesc(((body.match(/<h3[^>]*>(.{10,160}?)<\/h3>/) || [])[1] || '')).slice(0, 90);
      const price = (body.match(/aria-label="(₪[\d.,\s-]+)"/) || [])[1] || '';
      const img = (body.match(/<img[^>]+src="((?:https?:)?\/\/[^"]+)"/) || [])[1] || '';
      if (!title) continue;
      seen.add(pid);
      out.push({
        id: pid,
        title,
        price: price.trim().split(/\s+/).slice(0, 2).join(' ') || '—',
        img: img.startsWith('//') ? `https:${img}` : img,
        url: `https://www.aliexpress.com/item/${pid}.html`,
      });
      if (out.length >= limit) break;
    } catch {}
  }
  if (!out.length) throw new Error('לא נמצאו מוצרים — נסה מילים אחרות');
  return out;
}

/** עיטוף קישור במזהה שותפים — כשיהיה (כרגע מחזיר כמו שהוא). */
export function affiliateUrl(url) {
  const tag = (config.ALI_TAG || '').trim();
  if (!tag || !url.includes('aliexpress.com')) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('aff_fcid', tag);
    return u.toString();
  } catch {
    return url;
  }
}
