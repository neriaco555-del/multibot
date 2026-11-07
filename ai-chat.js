/**
 * 🧠 מנוע ה-AI של הבוט — "מולטי בוט"
 *
 * מודלים חזקים + אישיות "בן אדם" בוואטסאפ: אימוג'ים, טון אישי, הבנת כוונה אמיתית.
 *
 * שרשור providers (סדר עדיפויות):
 *   1. OpenAI       — config.OPENAI_MODEL                      (אם יש מפתח)
 *   2. Groq         — openai/gpt-oss-120b → qwen/qwen3.8-27b → openai/gpt-oss-20b
 *   3. Gemini       — gemini-3.8-flash → gemini-3.7-flash → gemini-3.6-flash
 *   4. Pollinations — openai (חינמי, תמיד מחזיר משהו)
 *
 * אפשרויות חשובות של chatAI:
 *   opts.system      — system prompt מותאם (במקום האישיות)
 *   opts.json        — מצב JSON (response_format) למשימות מובנות
 *   opts.quality     — 'smart' (ברירת מחדל) | 'fast' (סיווג/ניתוב)
 *   opts.maxTokens   — מגבלת תשובה
 *   opts.maxPrompt   — מגבלת אורך הפרומפט (ברירת מחדל 12000 — הקודם קיצץ ב-2000 והרוטר לא ראה את ההודעה!)
 *   opts.reasoning   — 'low' | 'medium' | 'high' למודלי gpt-oss
 */
import { config } from './config.js';

/* ================= 🧑 אישיות ================= */

/** סגנון דיבור */
export const STYLE = [
  'אתה "מולטי" — חבר אמיתי בוואטסאפ. לא "עוזר AI", לא "צ׳אטבוט", לא רובוט.',
  'אתה מדבר כמו בן אדם: קצר, טבעי, חם, עם אימוג׳ים — כמו שאתה כותב לחבר.',
  '',
  '• עברית תמיד. אם המשתמש כותב לך באנגלית — ענה באנגלית.',
  '• קצר: ברירת מחדל 1-3 משפטים. ארוך רק כשבאמת צריך.',
  "• אימוג'י חובה בכל הודעה — 1-3 אימוג'י. בלי אימוג'י = תשובה לא תקינה.",
  '• סגנון חופשי ועברי: "אחי", "בוא נגיד", "לעניין", "אי" — כמו אדם.',
  '• בלי כותרות Markdown, בלי "בבקשה"/"אשמח לעזור"/"כמובן"/"בטח!".',
  '• ענה ישר לנקודה בלי הקדמות. בלי "היי, אני כאן כדי לעזור".',
  '• תשיב כמו חבר שמסביר, לא כמו ויקיפדיה. שאלת ידע = 1-3 משפטים.',
  "• כלל ברזל: חייב לפחות אימוג'י אחד בכל תשובה.",
].join('\n');

/* ================= 🪪 זהות הבוט ================= */

/** מי אתה — זהות מלאה */
export const IDENTITY = [
  '══ הזהות שלך ══',
  'שמך: מולטי (MultiBot). בוט וואטסאפ ישראלי, רץ 24/7.',
  'המספר שלך: 050-365-1436 (בינלאומי: +972-50-365-1436).',
  'אתה לא ChatGPT, לא Gemini, לא Claude — אתה "מולטי", בוט שנבנה במיוחד לוואטסאפ עברי.',
  'אתה מולטי בוט — בוט רב-מטרתי שרץ על מכשירים מרובים (Multi-Device).',
  'אתה חם, מצחיק, ישיר — לא רובוט קר.',
  '',
  '══ תשובות לשאלות נפוצות ══',
  '• "מי אתה?" → "מולטי! 😄 בוט וואטסאפ ישראלי — המספר שלי 050-365-1436. מה אני יכול לעשות בשבילך?"',
  '• "מה המספר שלך?" → "050-365-1436 ✅ (בינלאומי +972503651436)"',
  '• "אתה ChatGPT?" / "אתה AI?" → "לא, אני מולטי 😎 — בוט וואטסאפ ישראלי, לא GPT ולא Gemini."',
  '• "מי יצר אותך?" → "בעל הבוט — נבניתי לשירות קבוצות בוואטסאפ 🤖"',
  '• "מה זה מולטי בוט?" → "בוט שרץ על כמה מכשירים במקביל ומשרת הרבה קבוצות 🔥"',
  '• "מה אתה יכול?" → תציג 3-4 יכולות + "כתוב !עזרה לרשימה המלאה 📋"',
].join('\n');

/** יכולות הבוט */
export const CAPABILITIES = [
  '══ הפקודות שלך (! לפני כל פקודה) ══',
  'אפשר גם שפה טבעית: "תצייר חתול" = !תמונה חתול.',
  '',
  '🎨 מדיה: !תמונה [תיאור] / !סטיקר / !רקע [נושא] / !תמונת-פרופיל.',
  '🎵 מוזיקה ווידאו: !שיר [שם] / !וידאו [נושא].',
  '🔊 קול: !דבר [טקסט] — הקראה. !תמלל — קול→טקסט.',
  '',
  '📊 מידע עדכני:',
  '  !מזג [עיר] / !חדשות / !שבת [עיר].',
  '  !דולר / !יורו / !ביטקוין / !מניה [חברה] / !מדד.',
  '  !רעידת-אדמה / !זיהום-אוויר [עיר] / !תרגום [טקסט].',
  '',
  '🎭 כיף ו-AI:',
  '  !בדיחה / !חידה / !עובדה / !מוטיבציה / !סיפור / !מתכון / !אימון / !טיפ.',
  '  !ברכה [מקרה] / !אימייל [נושא] / !שכתוב [טקסט] / !קוד [שפה: תיאור].',
  '  !רעיון / !מילון [מילה] / !מזל [מזל] / !חלום [תיאור].',
  '',
  '🎲 כלים: !בחר [א|ב] / !הגרלה / !קוביה / !מטבע / !סיסמה / !צבע / !מספר / !שעה / !תאריך.',
  '',
  '🎮 משחקים: !טריוויה / !איקס-עיגול / !מילים-מעורבבות / !אמת-או-חובה / !מלחמת-משפטים.',
  '',
  '🛠️ כלי קבוצה:',
  '  !תזכורת [זמן][נושא] / !תזכורות / !סקר [שאלה] / !תורנות / !יומולדת.',
  '  !בריף / !בוקר / !יומן / !סכם-צאט / !פעילות / !טופ / !נקודות / !מעקב [ערוץ].',
  '',
  '🌐 !אתר [תיאור] — בונה אתר ומפרסם online.',
  '🛒 !קנה [מוצר] — חיפוש ב-AliExpress.',
  '',
  '🛡️ ניהול (מנהלים):',
  '  !קישורים / !קללות / !שומר / !ספאם-קשוח / !ברוכים / !חוקים.',
  '  !תייג / !אזהרה / !קיק / !קדם / !הורד-ניהול / !השתק / !שחרר.',
  '  !נעל / !פתח / !שם / !תיאור / !שבת-מוד / !השתק-בוט [דקות] / !נקה.',
  '',
  '🔍 זיהוי: !זהה [מספר] / !me-זהה / !מי-שמר-אותי.',
  '💎 פרו: !פרו [מספר][ימים] / !פרו-מצב / !מנויים.',
  '📋 מידע: !עזרה / !הגדרות / !סטטוס-קבוצה / !id / !מנהלים-רשימה.',
].join('\n');

/** מוח על הכוונה */
export const BRAIN = [
  'איך לעבוד:',
  '1. הבן את הכוונה האמיתית, לא רק את המילים.',
  '2. "כן/לא/עוד/אותו דבר" מתייחסות להודעה הקודמת — המשך משם.',
  '3. אם הבקשה לא ברורה — שאל שאלה אחת קצרה.',
  '4. יש פקודה לפעולה? הפנה אליה עם דוגמה.',
  '5. אל תמציא עובדות, סטטיסטיקות, ציטוטים.',
  '6. תגובה לרגש — קצרה ואמיתית, לא "איך אני יכול לעזור?".',
  '7. שאלות על עצמך ("מי אתה?", "מה המספר?", "אתה GPT?") — ענה לפי הזהות שלמעלה.',
  '8. "מה אתה יכול?" → 3-4 יכולות + "כתוב !עזרה 📋".',
  '9. "מה !X עושה?" → הסבר קצר + דוגמה.',
  '10. מישהו מבקש משהו שיש לו פקודה — הפנה לפקודה הנכונה.',
  '11. מישהו מקלל/מתנפל — ענה בהומור קל.',
  '12. "איך להשתמש בך?" → "כתוב ! לפני פקודה, או פשוט תגיד לי מה אתה צריך 😊".',
].join('\n');

/** ברירת מחדל לצ׳אט עם המשתמש */
export const PERSONA = `${IDENTITY}\n\n${STYLE}\n\n${CAPABILITIES}\n\n${BRAIN}`;

/** פרומפט ניטרלי למשימות מובנות (JSON, סיכום, סיווג) — בלי אישיות */
export const UTILITY =
  'אתה עוזר טכני מדויק. ענה בדיוק לבקשה, בלי עוד מילות, בלי אימוג׳י, בלי הסברים מיותרים.';

/* ================= 🤖 providers ================= */

const GROQ_SMART_MODELS = () => [
  config.GROQ_SMART_MODEL || 'openai/gpt-oss-120b',
  config.GROQ_MODEL || 'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
];
const GROQ_FAST_MODELS = () => [
  config.GROQ_MODEL || 'qwen/qwen3.8-27b',
  'openai/gpt-oss-20b',
  config.GROQ_SMART_MODEL || 'openai/gpt-oss-120b',
];
const GEMINI_MODELS = () => uniq([
  config.GEMINI_MODEL || 'gemini-3.5-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
]);
const GEMINI_FAST_MODELS = () => uniq([
  config.GEMINI_LITE_MODEL || 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
]);

const uniq = (arr) => arr.filter((v, i, a) => v && a.indexOf(v) === i);

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

/** היסטוריה → מערכים תקינים לכל provider */
function cleanHistory(history = []) {
  const out = [];
  for (const h of (history || [])) {
    if (!h) continue;
    const role = h.role === 'assistant' ? 'assistant' : h.role === 'system' ? 'system' : 'user';
    const content = String(h.content || '').trim().slice(0, 1500);
    if (content) out.push({ role, content });
  }
  return out.slice(-10);
}

async function chatOpenAI(prompt, history, opts, system) {
  const body = {
    model: config.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: prompt }],
    max_tokens: opts.maxTokens ?? 1200,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('OpenAI empty');
  return { text, provider: `OpenAI ${body.model}` };
}

async function chatGroq(prompt, history, models, maxTokens, opts, system) {
  const list = uniq(models && models.length ? models : GROQ_SMART_MODELS());
  let lastErr = null;
  for (const model of list) {
    try {
      const body = {
        model,
        messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.8,
      };
      // מודלי gpt-oss חושבים לפני התשובה — מגבילים את עומק החשיבה כדי לא לבזבז טוקנים
      if (/gpt-oss/.test(model)) body.reasoning_effort = opts.reasoning || 'low';
      if (opts.json) body.response_format = { type: 'json_object' };
      const res = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.GROQ_API_KEY}` },
        body: JSON.stringify(body),
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

async function chatGemini(prompt, history, maxTokens, opts, system, models) {
  // REST ישיר בלי SDK. מודלי Gemini 3+ חושבים ("thinking") — בלי לכבות זה התקציב נאכל
  // והתשובה נחתכת באמצע.
  const list = uniq(models && models.length ? models : GEMINI_MODELS());
  const contents = [];
  for (const h of history) {
    if (h.role === 'system') continue;
    contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] });
  }
  while (contents.length && contents[0].role === 'model') contents.shift();
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  let lastErr = null;
  for (const model of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const gen = {
          maxOutputTokens: maxTokens,
          temperature: opts.temperature ?? 0.8,
        };
        if (opts.json) gen.responseMimeType = 'application/json';
        // ניסיון 1: בלי חשיבה (מהיר). ניסיון 2: עם תקציב חשיבה קטן.
        if (attempt === 0) gen.thinkingConfig = { thinkingBudget: 0 };
        else gen.thinkingConfig = { thinkingBudget: opts.thinkingBudget ?? 512 };

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
          `:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`;
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents,
            generationConfig: gen,
          }),
        });
        if (!res.ok) throw new Error(`Gemini ${model} ${res.status}`);
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts
          ?.filter((p) => !p.thought)
          ?.map((p) => p.text || '')
          .join('')
          .trim();
        if (!text) throw new Error(`Gemini ${model} empty`);
        return { text, provider: `Gemini ${model}` };
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  throw lastErr || new Error('Gemini failed');
}

async function chatPollinations(prompt, history, opts, system) {
  const body = {
    model: config.POLLINATIONS_TEXT_MODEL || 'openai',
    messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: prompt }],
    max_tokens: opts.maxTokens ?? 1200,
    temperature: opts.temperature ?? 0.8,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const headers = { 'Content-Type': 'application/json' };
  if (config.POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${config.POLLINATIONS_API_KEY}`;
  const res = await fetchWithTimeout('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Pollinations ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Pollinations empty');
  return { text, provider: 'Pollinations (חינמי)' };
}

/* ================= 🎯 נקודת כניסה ================= */

/**
 * פונקציה ראשית — מנסה כל provider לפי הסדר, מחזירה {text, provider}.
 * @param {string} prompt  ההודעה למודל
 * @param {Array}  history [{role, content}]
 * @param {Object} opts    { system, json, quality, maxTokens, maxPrompt, temperature, reasoning }
 */
export async function chatAI(prompt, history = [], opts = {}) {
  const maxPrompt = opts.maxPrompt ?? 12000;
  const clean = (prompt || '').toString().trim().slice(0, maxPrompt);
  if (!clean) return { text: 'שלח לי שאלה או בקשה 😊', provider: 'none' };

  const system = (opts.system || PERSONA).toString().slice(0, 8000);
  const hist = cleanHistory(history);
  const smart = (opts.quality || 'smart') !== 'fast';
  const maxTokens = opts.maxTokens ?? (smart ? 1400 : 900);
  const errors = [];

  if (config.OPENAI_API_KEY) {
    try {
      return await chatOpenAI(clean, hist, { ...opts, maxTokens }, system);
    } catch (e) {
      errors.push(`OpenAI: ${e.message}`);
    }
  }
  if (config.GROQ_API_KEY) {
    try {
      const models = smart ? GROQ_SMART_MODELS() : GROQ_FAST_MODELS();
      const o = { ...opts, maxTokens };
      if (smart && !o.reasoning) o.reasoning = 'low';
      return await chatGroq(clean, hist, models, maxTokens, o, system);
    } catch (e) {
      errors.push(`Groq: ${e.message}`);
    }
  }
  if (config.GEMINI_API_KEY) {
    try {
      const models = smart ? GEMINI_MODELS() : GEMINI_FAST_MODELS();
      return await chatGemini(clean, hist, maxTokens, opts, system, models);
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
    }
  }
  // תמיד יש fallback חינמי
  try {
    return await chatPollinations(clean, hist, { ...opts, maxTokens }, system);
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
        uniq([config.GROQ_CODE_MODEL, 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b']),
        8000,
        { reasoning: 'low', temperature: 0.2 },
        UTILITY
      );
    } catch (e) {
      errors.push(`Groq-code: ${e.message}`);
    }
  }
  if (config.GEMINI_API_KEY) {
    try {
      const r = await chatGemini(full.slice(0, 60000), [], 8000, { temperature: 0.2 }, UTILITY, GEMINI_MODELS());
      return { text: r.text, provider: `Gemini-code ${config.GEMINI_MODEL}` };
    } catch (e) {
      errors.push(`Gemini-code: ${e.message}`);
    }
  }
  throw new Error(errors.length ? errors.join(' | ').slice(0, 200) : 'NO_CODE_PROVIDER');
}
