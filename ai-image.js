/**
 * יצירת תמונות AI:
 * 1. OpenAI DALL-E 3 (אם יש OPENAI_API_KEY) — איכות מקסימלית
 * 2. Google Gemini Nano Banana (אם יש GEMINI_API_KEY, חינמי) — מעקב הוראות מעולה
 * 3. Pollinations keyed (אם יש יתרת pollen) — מודלים מתחלפים
 * 4. Pollinations sana (חינמי, בלי מפתח) — גיבוי תמידי
 *
 * + יצירה ייעודית לסטיקרים: generateStickerImage() — אותו שרשור,
 *   על רקע כרומה ירוק להסרת רקע אוטומטית → מדבקה עם רקע שקוף.
 *
 * מחזיר Buffer של תמונה (JPEG/PNG) מוכן לשליחה בוואטסאפ.
 */
import { config } from './config.js';
import { translateText } from './web-search.js';

const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s || '');

/** שיפור-כוונה לעיצובים גרפיים: הזמנה/ברכה/לוגו/פוסטר → סיומת שמכוונת לכרטיס ולא לסצנת אנשים */
/** 📷 ברירת מחדל ריאליסטית — רק אם המשתמש לא ביקש סגנון אחר ולא מדובר בעיצוב גרפי */
function realisticSuffix(hebrewOriginal) {
  const h = String(hebrewOriginal || '');
  if (/מצויר|אנימה|אנימציה|קריקטורה|קומיקס|פיקסאר|ציור|איור|סקיצה|cartoon|anime|comic|pixar|drawing|sketch|illustration|הזמנה|ברכה|לוגו|פוסטר|מודעה|כרזה|מזל טוב|יום הולדת|סטיקר|מדבקה/i.test(h)) return '';
  return ', photorealistic, ultra detailed, sharp focus, professional photography, natural lighting';
}

/** שיפור-כוונה לעיצובים גרפיים: הזמנה/ברכה/לוגו/פוסטר → סיומת שמכוונת לכרטיס ולא לסצנת אנשים */
export function enhanceDesignPrompt(hebrewOriginal, englishPrompt) {
  const h = String(hebrewOriginal || '');
  const e = String(englishPrompt || '');
  if (/הזמנה/.test(h)) return `${e}, elegant invitation card design with decorative festive border, ornate, no people, blank center space for text`;
  if (/מזל טוב|ברכה|יום הולדת/.test(h)) return `${e}, beautiful greeting card design, festive decorations, no people, blank space for text`;
  if (/לוגו/.test(h)) return `${e}, minimalist logo design, flat vector style, plain white background, no people, no photo, no letters unless requested`;
  if (/פוסטר|מודעה|כרזה/.test(h)) return `${e}, poster design, bold graphic layout, decorative, no people`;
  return e;
}

async function fetchBuffer(url, timeoutMs = 90000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 140); } catch { /* אין גוף */ }
      throw new Error(`HTTP ${res.status} ${detail}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } finally {
    clearTimeout(t);
  }
}

async function imageViaOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: prompt.slice(0, 1000),
      size: '1024x1024',
      quality: 'standard',
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI image ${res.status}`);
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('OpenAI image empty');
  const buf = await fetchBuffer(url);
  return { buffer: buf, provider: 'DALL-E 3' };
}

/** ☁️ Cloudflare Workers AI — מודלי תמונה חינמיים (10,000 neurons ביום, בלי כרטיס).
 *  חלק מחזירים JSON עם base64 (schnell), חלק בינארי גולמי (sdxl/dreamshaper) — תומך בשניהם. */
export const CF_MODELS = {
  photo: '@cf/stabilityai/stable-diffusion-xl-base-1.0', // איכות כללית מעולה
  cartoon: '@cf/lykon/dreamshaper-8-lcm', // מצוין לסטיקרים/קריקטורה
  fast: '@cf/black-forest-labs/flux-1-schnell', // מהיר וחד
};
async function imageViaCloudflare(prompt, model = CF_MODELS.fast) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180000);
  // SDXL צריך ~25 צעדים לאיכות מלאה; מודלי LCM/schnell תוכננו לצעדים בודדים
  const steps = /stable-diffusion-xl/i.test(model) ? 25 : 8;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.CF_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.CF_API_TOKEN}`,
        },
        body: JSON.stringify({ prompt: prompt.slice(0, 1500), steps }),
      }
    );
    if (!res.ok) throw new Error(`Cloudflare HTTP ${res.status}`);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    let buf;
    if (ct.includes('application/json')) {
      const data = await res.json();
      const b64 = data?.result?.image;
      if (!b64) throw new Error('Cloudflare: אין תמונה בתשובה');
      buf = Buffer.from(b64, 'base64');
    } else {
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (!buf || buf.length < 5000) throw new Error('Cloudflare: תמונה קטנה מדי');
    const short = String(model).split('/').pop();
    return { buffer: buf, provider: `Cloudflare ${short} (חינמי)` };
  } finally {
    clearTimeout(t);
  }
}

/** 🔌 תואם-OpenAI כללי לתמונות (SiliconFlow / Together / אחרים) — /images/generations */
async function imageViaOpenAICompat(prompt, baseUrl, apiKey, model, label) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/images/generations`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt: prompt.slice(0, 1000), n: 1 }),
    });
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    const data = await res.json();
    const item = data?.data?.[0];
    let buf = null;
    if (item?.b64_json) buf = Buffer.from(item.b64_json, 'base64');
    else if (item?.url) buf = await fetchBuffer(item.url);
    if (!buf || buf.length < 5000) throw new Error(`${label}: אין תמונה`);
    return { buffer: buf, provider: label };
  } finally {
    clearTimeout(t);
  }
}

/** 🌙 Google Gemini Nano Banana — יצירת תמונה ממפתח חינמי (AI Studio) */
// מפסק: אחרי 3 כישלונות 429 רצופים מדלגים על Gemini ל-15 דקות (חוסך שניות בכל בקשה)
let geminiSkipUntil = 0, geminiFails = 0;
function geminiCircuit(open429) {
  if (open429) {
    geminiFails++;
    if (geminiFails >= 3) geminiSkipUntil = Date.now() + 15 * 60 * 1000;
  } else {
    geminiFails = 0;
    geminiSkipUntil = 0;
  }
}
async function imageViaGemini(prompt) {
  const models = [config.GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-image', 'gemini-2.5-flash-image']
    .filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr = null;
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt.slice(0, 1500) }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini-image ${model} HTTP ${res.status}`);
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p) => p.inlineData && p.inlineData.data);
      if (!img) {
        const reason = data?.candidates?.[0]?.finishReason || 'NO_IMAGE';
        throw new Error(`Gemini-image ${model}: ${reason}`);
      }
      const buf = Buffer.from(img.inlineData.data, 'base64');
      if (!buf || buf.length < 5000) throw new Error(`Gemini-image ${model}: תמונה קטנה מדי`);
      return { buffer: buf, provider: `Gemini ${model}` };
    } catch (e) {
      lastErr = e;
      console.warn(`ניסיון תמונה (Gemini ${model}) נכשל:`, (e.message || '').slice(0, 120));
    }
  }
  throw lastErr || new Error('Gemini-image failed');
}

async function imageViaPollinations(prompt, model) {
  // enhance=true משפר פרומפטים בעברית/קצרים אוטומטית.
  // model ריק = מודל ברירת המחדל של Pollinations (לא שולחים פרמטר).
  const encoded = encodeURIComponent(prompt.slice(0, 800));
  const seed = Math.floor(Math.random() * 999999);
  const modelParam = model ? `&model=${encodeURIComponent(model)}` : '';
  const url =
    `https://image.pollinations.ai/prompt/${encoded}` +
    `?width=1024&height=1024&seed=${seed}&enhance=true&nologo=false${modelParam}`;
  const buf = await fetchBuffer(url, 120000);
  const label = model || 'default';
  if (!buf || buf.length < 5000) throw new Error(`Pollinations ${label}: תמונה קטנה מדי`);
  return { buffer: buf, provider: `Pollinations ${label}` };
}

export async function generateImage(prompt) {
  const clean = (prompt || '').toString().trim().replace(/^(של|את|על|עם|ל|the|of|a|an)\s+/i, '');
  if (clean.length < 2) throw new Error('תיאור קצר מדי — כתוב למשל: !תמונה חתול אסטרונאוט על הירח');

  // מודלי תמונה מבינים אנגלית הרבה יותר טוב — מתרגמים אוטומטית
  let english = clean;
  if (hasHebrew(clean)) {
    try {
      english = await translateText(clean, 'en');
      console.log(`תורגם לאנגלית: "${clean}" → "${english}"`);
    } catch (e) {
      console.warn('תרגום פרומפט נכשל, משתמש במקור:', e.message);
    }
  }
  // כוונון לעיצובים גרפיים (הזמנה/ברכה/לוגו/פוסטר) — שלא יצא בן אדם
  english = enhanceDesignPrompt(clean, english) + realisticSuffix(clean);

  if (config.OPENAI_API_KEY) {
    try {
      return { ...(await imageViaOpenAI(english)), englishPrompt: english };
    } catch (e) {
      console.warn('DALL-E נכשל, עובר הלאה:', e.message);
    }
  }
  // 🌙 Gemini Nano Banana (מפתח חינמי מ-AI Studio) — מעקב הוראות מעולה
  if (config.GEMINI_API_KEY && Date.now() >= geminiSkipUntil) {
    try {
      const r = await imageViaGemini(english);
      geminiCircuit(false);
      return { ...r, englishPrompt: english };
    } catch (e) {
      if (/429/.test(e.message || '')) geminiCircuit(true);
      console.warn('Gemini-image נכשל, עובר הלאה:', (e.message || '').slice(0, 100));
    }
  }
  // ☁️ Cloudflare חינמי — SDXL לאיכות, FLUX לגיבוי מהיר
  if (config.CF_ACCOUNT_ID && config.CF_API_TOKEN) {
    for (const model of [CF_MODELS.photo, CF_MODELS.fast]) {
      try {
        return { ...(await imageViaCloudflare(english, model)), englishPrompt: english };
      } catch (e) {
        console.warn(`Cloudflare (${model}) נכשל, עובר הלאה:`, (e.message || '').slice(0, 100));
      }
    }
  }
  // 🔌 SiliconFlow / Together (קרדיטים חינמיים בהרשמה)
  if (config.SILICONFLOW_API_KEY) {
    try {
      return {
        ...(await imageViaOpenAICompat(english, 'https://api.siliconflow.com/v1', config.SILICONFLOW_API_KEY, 'black-forest-labs/FLUX.1-schnell', 'SiliconFlow FLUX')),
        englishPrompt: english,
      };
    } catch (e) {
      console.warn('SiliconFlow נכשל, עובר הלאה:', (e.message || '').slice(0, 100));
    }
  }
  if (config.TOGETHER_API_KEY) {
    try {
      return {
        ...(await imageViaOpenAICompat(english, 'https://api.together.xyz/v1', config.TOGETHER_API_KEY, 'black-forest-labs/FLUX.1-schnell', 'Together FLUX')),
        englishPrompt: english,
      };
    } catch (e) {
      console.warn('Together נכשל, עובר הלאה:', (e.message || '').slice(0, 100));
    }
  }
  // שרשור ניסיונות חינמיים: ברירת מחדל → sana → ניסיון חוזר עם seed חדש
  const models = [config.POLLINATIONS_IMAGE_MODEL, 'sana'].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const model = models[attempt % models.length];
    try {
      return { ...(await imageViaPollinations(english, model)), englishPrompt: english };
    } catch (e) {
      lastErr = e;
      console.warn(`ניסיון תמונה ${attempt + 1} (${model}) נכשל:`, e.message);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`יצירת התמונה נכשלה 3 פעמים (${lastErr?.message || 'שגיאה'}). נסה תיאור אחר בעוד דקה.`);
}

/* ================= ⭐ סטיקר לוואטסאפ ================= */

/**
 * מודלים חינמיים (Pollinations) שנבחרו בבדיקה ויזואלית כטובים ביותר לסטיקרים:
 * gpt-image-1-mini — דיוק הוראות מצוין + צורה של מדבקת die-cut;
 * z-image-turbo / flux.1-schnell — מהירים וחדים כגיבוי.
 * כולם `paid=false` (חינם) בחשבון Pollinations עם POLLINATIONS_API_KEY.
 */
const STICKER_MODELS = ['openai/gpt-image-1-mini', 'tongyi-mai/z-image-turbo', 'black-forest-labs/flux.1-schnell'];

/** פרומפט סטיקר: "מתכנת" את המודל — נושא יחיד ממורכז, מסגרת die-cut, רקע כרומה אחיד */
function stickerPrompt(desc) {
  return (
    `Single die-cut sticker design, exactly one centered character: ${desc}. ` +
    `Thick bold black outline with a clean white sticker border around the shape, ` +
    `flat vector cartoon illustration, bold simple shapes, vibrant colors, ` +
    `isolated on a completely solid uniform #00FF00 bright green background ` +
    `filling the entire image edge to edge, no shadow, no gradient, no scenery, ` +
    `no other objects, no text, no letters, no watermark`
  );
}

/** Pollinations gateway (נדרש מפתח חינמי POLLINATIONS_API_KEY) */
async function imageViaGenPollinations(prompt, model) {
  const seed = Math.floor(Math.random() * 999999);
  const url =
    `https://gen.pollinations.ai/image/${encodeURIComponent(prompt.slice(0, 900))}` +
    `?width=512&height=512&nologo=true&seed=${seed}&model=${encodeURIComponent(model)}`;
  const buf = await fetchBuffer(url, 75000, { Authorization: `Bearer ${config.POLLINATIONS_API_KEY}` });
  if (!buf || buf.length < 5000) throw new Error(`${model}: תמונה קטנה מדי`);
  return { buffer: buf, provider: model };
}

/** גיבוי חינמי לגמרי — בלי מפתח (האנדפוינט הקלאסי של Pollinations) */
async function imageViaStickerFree(prompt) {
  const seed = Math.floor(Math.random() * 999999);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}` +
    `?width=512&height=512&nologo=true&seed=${seed}&model=sana`;
  const buf = await fetchBuffer(url, 110000);
  if (!buf || buf.length < 5000) throw new Error('Pollinations sana: תמונה קטנה מדי');
  return { buffer: buf, provider: 'Pollinations sana (חינמי, בלי מפתח)' };
}

/**
 * ⭐ תמונה ייעודית לסטיקר — רק מודלים חינמיים (בלי DALL-E).
 * מחזיר { buffer, provider, englishPrompt }.
 */
export async function generateStickerImage(desc) {
  const clean = (desc || '').toString().trim().replace(/^(של|את|על|עם|ל)\s+/, '');
  if (clean.length < 2) throw new Error('תיאור קצר מדי — כתוב למשל: !סטיקר חתול אסטרונאוט');

  // מודלי תמונה מבינים אנגלית טוב יותר — מתרגמים עברית אוטומטית
  let english = clean;
  if (hasHebrew(clean)) {
    try {
      english = await translateText(clean, 'en');
      console.log(`סטיקר: תורגם "${clean}" → "${english}"`);
    } catch (e) {
      console.warn('תרגום פרומפט סטיקר נכשל, משתמש במקור:', e.message);
    }
  }
  const prompt = stickerPrompt(english);
  const errors = [];

  // 🌙 Gemini קודם (אם יש מפתח חינמי) — דיוק הוראות מעולה לסטיקרים
  if (config.GEMINI_API_KEY && Date.now() >= geminiSkipUntil) {
    try {
      const r = await imageViaGemini(prompt);
      geminiCircuit(false);
      return { ...r, englishPrompt: english };
    } catch (e) {
      if (/429/.test(e.message || '')) geminiCircuit(true);
      errors.push(`gemini: ${(e.message || '').slice(0, 60)}`);
      console.warn('ניסיון סטיקר (Gemini) נכשל:', e.message);
    }
  }

  // ☁️ בסיס הסטיקר = FLUX מהיר (דיוק הוראות) ואז SDXL איכותי — ואז המרה אוטומטית לסטיקר
  if (config.CF_ACCOUNT_ID && config.CF_API_TOKEN) {
    for (const model of [CF_MODELS.fast, CF_MODELS.photo]) {
      try {
        return { ...(await imageViaCloudflare(prompt, model)), englishPrompt: english };
      } catch (e) {
        errors.push(`cloudflare-${String(model).split('/').pop()}: ${(e.message || '').slice(0, 60)}`);
        console.warn(`ניסיון סטיקר (Cloudflare ${model}) נכשל:`, e.message);
      }
    }
  }

  if (config.POLLINATIONS_API_KEY) {
    for (const model of STICKER_MODELS) {
      try {
        return { ...(await imageViaGenPollinations(prompt, model)), englishPrompt: english };
      } catch (e) {
        errors.push(`${model}: ${(e.message || '').slice(0, 60)}`);
        console.warn(`ניסיון סטיקר (${model}) נכשל:`, e.message);
      }
    }
  }
  // גיבוי חינמי בלי מפתח
  try {
    return { ...(await imageViaStickerFree(prompt)), englishPrompt: english };
  } catch (e) {
    errors.push((e.message || '').slice(0, 60));
    console.warn('ניסיון סטיקר חינמי (sana) נכשל:', e.message);
  }
  throw new Error(`כל המודלים החינמיים נכשלו — ${errors.join(' · ')}`);
}
