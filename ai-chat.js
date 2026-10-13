/**
 * צ'אט AI משוכלל עם שרשור providers אוטומטי (2026):
 * 1. OpenAI (אם יש OPENAI_API_KEY) — הכי איכותי
 * 2. Groq (אם יש GROQ_API_KEY) — חינמי + מהיר בטירוף
 * 3. Gemini (אם יש GEMINI_API_KEY) — חינמי של גוגל
 * 4. Pollinations (בלי מפתח בכלל) — fallback חינמי תמיד עובד
 *
 * הכל בעברית, עם system prompt מותאם לוואטסאפ.
 */
import { config } from './config.js';

const SYSTEM_PROMPT =
  'אתה עוזר AI ישראלי חכם וחברותי בוואטסאפ. ענה בעברית (אלא אם שואלים בשפה אחרת). ' +
  'תשובות קצרות, ברורות, עם אימוג׳ים מתונים. ' +
  'אתה כן יכול ליצור מדיה דרך פקודות הבוט: !תמונה (יצירת תמונה), !שיר (חיפוש שיר), ' +
  '!סטיקר (יצירת מדבקה), !רקע (רקע לטלפון), !תמונת-פרופיל (של משתמש מתויג), !וידאו (חיפוש סרטונים). ' +
  'יצירת סרטוני AI אינה זמינה כרגע — אם מבקשים, הצע חיפוש !וידאו במקום. ' +
  'אם מבקשים ליצור משהו כזה — אל תגיד שאין לך אפשרות! הפנה בקצרה לפקודה המתאימה עם דוגמה.';

async function chatOpenAI(prompt, history = []) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-8),
        { role: 'user', content: prompt },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI empty');
  return { text, provider: `OpenAI ${config.OPENAI_MODEL}` };
}

async function chatGroq(prompt, history = [], models = null, maxTokens = 4000) {
  // qwen קודם (מהיר, עוקב הוראות, עברית טובה) — gpt-oss איטי ושורף טוקני חשיבה
  const list = (models && models.length ? models : ['qwen/qwen3.8-27b', config.GROQ_MODEL]).filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr = null;
  for (const model of list) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history.slice(-8),
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new Error(`Groq ${model} ${res.status}`);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error(`Groq ${model} empty`);
      return { text, provider: `Groq ${model}` };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Groq failed');
}

async function chatGemini(prompt, maxTokens = 1000) {
  // REST ישיר בלי SDK — פחות תלויות. עם גיבוי דגמים + ניסיון חוזר על 503.
  const models = [config.GEMINI_MODEL, 'gemini-3.7-flash', 'gemini-3.6-flash'].filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
          `:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
          }),
        });
        if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
        if (!text) throw new Error(`Gemini ${model} empty`);
        return { text, provider: `Gemini ${model}` };
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  throw lastErr || new Error('Gemini failed');
}

async function chatPollinations(prompt) {
  // OpenAI-compatible, חינמי, בלי מפתח
  const res = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.POLLINATIONS_TEXT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt.slice(0, 2000) },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Pollinations empty');
  return { text, provider: 'Pollinations (חינמי)' };
}

/** פונקציה ראשית — מנסה כל provider לפי הסדר, מחזירה {text, provider} */
export async function chatAI(prompt, history = []) {
  const clean = (prompt || '').toString().trim().slice(0, 2000);
  if (!clean) return { text: 'שלח לי שאלה או בקשה 😊', provider: 'none' };

  const errors = [];

  if (config.OPENAI_API_KEY) {
    try {
      return await chatOpenAI(clean, history);
    } catch (e) {
      errors.push(`OpenAI: ${e.message}`);
    }
  }
  if (config.GROQ_API_KEY) {
    try {
      return await chatGroq(clean, history);
    } catch (e) {
      errors.push(`Groq: ${e.message}`);
    }
  }
  if (config.GEMINI_API_KEY) {
    try {
      return await chatGemini(clean);
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
    }
  }
  // תמיד יש fallback חינמי
  try {
    return await chatPollinations(clean);
  } catch (e) {
    errors.push(`Pollinations: ${e.message}`);
  }

  return {
    text:
      '😢 כל שירותי ה-AI נכשלו כרגע.\n' +
      (errors.length ? `פירוט: ${errors.join(' | ').slice(0, 300)}\n` : '') +
      'נסה שוב בעוד דקה, או הגדר מפתח חינמי (GROQ / GEMINI) ב-.env.',
    provider: 'error',
  };
}

/**
 * 💻 מודל לפיתוח/קוד — חינמי, עם תקציב טוקנים גדול ובלי קיצוץ פרומפט.
 * שרשור: Groq (מודל קוד ייעודי) → Gemini (אם יש מפתח) — זורק אם הכל נכשל.
 */
export async function chatCode(prompt) {
  const full = (prompt || '').toString().trim();
  if (!full) throw new Error('EMPTY');
  const errors = [];
  if (config.GROQ_API_KEY) {
    try {
      return await chatGroq(
        full,
        [],
        [config.GROQ_CODE_MODEL, 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
        8000
      );
    } catch (e) {
      errors.push(`Groq-code: ${e.message}`);
    }
  }
  if (config.GEMINI_API_KEY) {
    try {
      const r = await chatGemini(full.slice(0, 60000), 8000);
      return { text: r.text, provider: `Gemini-code ${config.GEMINI_MODEL}` };
    } catch (e) {
      errors.push(`Gemini-code: ${e.message}`);
    }
  }
  throw new Error(errors.length ? errors.join(' | ').slice(0, 200) : 'NO_CODE_PROVIDER');
}
