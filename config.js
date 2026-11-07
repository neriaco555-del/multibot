// קונפיג מרכזי לבוט — קורא משתני סביבה עם ברירות מחדל חכמות
import 'dotenv/config';

// 🤖 בוטי-התמונות החיצוניים (Instinct) — כל המוכרים, ורק הפעילים משמשים ליצירה.
// INSTINCT_JIDS = כל המספרים המוכרים (גם אם כבויים — כדי לא לענות להם).
// INSTINCT_ACTIVE_JIDS = רק אלה שמקבלים בקשות (ברירת מחדל: הראשון בלבד).
const _instList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const INSTINCT_JIDS = _instList(
  process.env.INSTINCT_JIDS ||
  [
    process.env.INSTINCT_JID || '16508702892@s.whatsapp.net',
    process.env.INSTINCT_JID_2 || '12512765320@s.whatsapp.net',
  ].join(',')
);
const INSTINCT_ACTIVE_JIDS = _instList(process.env.INSTINCT_ACTIVE_JIDS || INSTINCT_JIDS[0] || '');

export const config = {
  // --- AI צ'אט (נבחר אוטומטית לפי מה שקיים, לפי סדר איכות) ---
  // 1. OpenAI — הכי איכותי, בתשלום: https://platform.openai.com/api-keys
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  // 2. Groq — חינמי ומהיר מאוד: https://console.groq.com
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  // מודל "חכם" (לצ'אט ולניתוב מורכב) — החזק ביותר הזמין בחינמי ב-Groq
  GROQ_SMART_MODEL: process.env.GROQ_SMART_MODEL || 'openai/gpt-oss-120b',
  // מודל "מהיר" (ניתוב, סיווג, תגובות קצרות)
  GROQ_MODEL: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
  // 💻 מודל לפיתוח/קוד (אתרים, קוד) — נבחר אוטומטית החזק ביותר הזמין בחינמי
  GROQ_CODE_MODEL: process.env.GROQ_CODE_MODEL || 'openai/gpt-oss-120b',
  // 3. Gemini — חינמי של גוגל: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  // מודל קל/מהיר של Gemini (fallback לניתוב ולמשימות קצרות)
  GEMINI_LITE_MODEL: process.env.GEMINI_LITE_MODEL || 'gemini-3.1-flash-lite',
  // 🌙 מודל תמונות Gemini (Nano Banana) — חינמי עם אותו מפתח
  GEMINI_IMAGE_MODEL: process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
  // ☁️ Cloudflare Workers AI — FLUX חינמי יומי: https://dash.cloudflare.com
  // (Account ID מהדשבורד + API Token מתבנית Workers AI)
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || '',
  CF_API_TOKEN: process.env.CF_API_TOKEN || '',
  // 🔌 SiliconFlow — קרדיטים חינמיים בהרשמה: https://cloud.siliconflow.com
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY || '',
  // 🔌 Together AI — $5 מתנה בהרשמה: https://api.together.ai
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY || '',
  // 4. Pollinations — חינמי לגמרי, בלי מפתח (fallback אוטומטי)
  POLLINATIONS_TEXT_MODEL: process.env.POLLINATIONS_TEXT_MODEL || 'openai',
  POLLINATIONS_IMAGE_MODEL: process.env.POLLINATIONS_IMAGE_MODEL || '',
  // --- מוזיקה חינמית (Hugging Face — הרשמה חינמית, בלי כרטיס) ---
  // יוצרים טוקן חינמי ב-https://huggingface.co/settings/tokens ומדביקים כאן.
  // בלי טוקן: צ'אט/תמונות עובדים; מוזיקה מחזירה הודעת הסבר.
  HF_TOKEN: process.env.HF_TOKEN || '',
  // מפתח Pollinations (אופציונלי, גיבוי): https://enter.pollinations.ai
  POLLINATIONS_API_KEY: process.env.POLLINATIONS_API_KEY || '',

  // --- 🎵 Suno MCP (יצירת שירים/מנגינות אמיתיות בחשבון Suno) ---
  // חיבור חד-פעמי: npm run suno-login (OAuth, בלי מפתח API).
  // SUNO_MCP_TOKEN מאפשר לעקוף את ה-OAuth עם Bearer ידני (אופציונלי).
  SUNO_MCP_URL: (process.env.SUNO_MCP_URL || 'https://api.suno.com/mcp').trim(),
  SUNO_MCP_TOKEN: (process.env.SUNO_MCP_TOKEN || '').trim(),
  SUNO_AUTH_FILE: (process.env.SUNO_AUTH_FILE || 'suno-auth.json').trim(),
  SUNO_OAUTH_PORT: parseInt(process.env.SUNO_OAUTH_PORT || '53682', 10) || 53682,
  SUNO_OAUTH_AS: (process.env.SUNO_OAUTH_AS || '').trim(),
  SUNO_SCOPE: (process.env.SUNO_SCOPE || '').trim(),
  // בחירה ידנית של כלי MCP (אופציונלי — הבוט מזהה לבד כברירת מחדל)
  SUNO_GENERATE_TOOL: (process.env.SUNO_GENERATE_TOOL || '').trim(),
  SUNO_WAIT_TOOL: (process.env.SUNO_WAIT_TOOL || '').trim(),
  SUNO_MODEL: (process.env.SUNO_MODEL || '').trim(),
  // זמן המתנה מקסימלי ליצירת השיר (ברירת מחדל: 8 דקות)
  SUNO_TIMEOUT_MS: parseInt(process.env.SUNO_TIMEOUT_MS || '480000', 10) || 480000,
  // מגבלת שירים ליום לכל משתמש (0 = ללא הגבלה)
  SUNO_DAILY_PER_USER: Math.max(0, parseInt(process.env.SUNO_DAILY_PER_USER || '0', 10) || 0),

  // --- Instinct (בוטי תמונות חיצוניים — בקשות רק לפעילים, ברוטציה) ---
  INSTINCT_JID: INSTINCT_JIDS[0] || '16508702892@s.whatsapp.net',
  INSTINCT_JID_2: INSTINCT_JIDS[1] || '',
  INSTINCT_JIDS,
  INSTINCT_ACTIVE_JIDS,
  INSTINCT_TIMEOUT_MS: parseInt(process.env.INSTINCT_TIMEOUT_MS || '180000', 10) || 180000,
  // --- 🎬 ממסר יצירת סרטונים דרך וואטסאפ (בוט וידאו חיצוני) ---
  // כבוי כברירת מחדל. להפעלה: VIDEO_ENABLED=true ב-.env
  VIDEO_ENABLED: /^(1|true|on|yes)$/i.test(String(process.env.VIDEO_ENABLED || '').trim()),
  // הראשי: 251. גיבוי אופציונלי (ריק = בלי גיבוי).
  VIDEO_JID: process.env.VIDEO_JID || '12512765320@s.whatsapp.net',
  VIDEO_FALLBACK_JID: process.env.VIDEO_FALLBACK_JID !== undefined
    ? process.env.VIDEO_FALLBACK_JID.trim()
    : '16508702892@s.whatsapp.net',
  // 100 דקות המתנה לכל ניסיון (אין הגבלת דקות קצרה)
  VIDEO_TIMEOUT_MS: parseInt(process.env.VIDEO_TIMEOUT_MS || '6000000', 10) || 6000000,
  // ניסיון אחד לכל בקשה/משתמש ביום, וניסיון אחד לכל בוט-סרטונים ביום
  VIDEO_DAILY_PER_USER: parseInt(process.env.VIDEO_DAILY_PER_USER || '1', 10) || 1,
  VIDEO_DAILY_PER_BOT: parseInt(process.env.VIDEO_DAILY_PER_BOT || '1', 10) || 1,
  // --- JSON2Video (יצירת סרטוני AI, ~1 קרדיט/שנייה) ---
  JSON2VIDEO_API_KEY: process.env.JSON2VIDEO_API_KEY || '',
  // --- AliExpress (מזהה שותפים לעיטוף קישורים — אופציונלי) ---
  ALI_TAG: process.env.ALI_TAG || '',
  // --- Vivideo (וידאו AI פרימיום — חינם: preview בלבד) ---
  VIVIDEO_API_KEY: process.env.VIVIDEO_API_KEY || '',
  // --- Pexels (פוטג' וידאו אמיתי כרקע לסרטונים, מפתח חינמי) ---
  PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
  // --- Pixabay (גיבוי לפוטג' אמיתי, מפתח חינמי) ---
  PIXABAY_API_KEY: process.env.PIXABAY_API_KEY || '',
  // --- YouTube (שירים / סרטונים — קישורים חוקיים בלבד) ---
  // מפתח רשמי (אופציונלי): https://console.cloud.google.com/apis/library/youtube.googleapis.com
  // בלי מפתח הבוט משתמש ב-yt-search (scraping חינמי, ללא מפתח).
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',

  // --- TMDB (ספריית סרטים אישית קיימת) ---
  TMDB_API_KEY: process.env.TMDB_API_KEY || '',
  TMDB_LANG: process.env.TMDB_LANG || 'he-IL',

  // --- קבוצת ניהול-על (פקודות מאסטר: פרסם/אמן/סטיקר-יומי/תוכן/קישור) ---
  MGMT_GROUP: process.env.MGMT_GROUP || '120363411454298973@g.us',
  // --- 💼 קבוצת העבודות + פרסום אוטומטי ---
  JOBS_GROUP: (process.env.JOBS_GROUP || '').trim(),
  JOBS_AUTO: String(process.env.JOBS_AUTO || 'true').toLowerCase() !== 'false',
  JOBS_HOURS: (process.env.JOBS_HOURS || '9,19').split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 23),
  JOBS_CHECK_MINUTES: Math.max(5, parseInt(process.env.JOBS_CHECK_MINUTES || '20', 10) || 20),
  JOBS_MAX_PER_CHECK: Math.max(1, Math.min(10, parseInt(process.env.JOBS_MAX_PER_CHECK || '3', 10) || 3)),
  JOBS_ACTIVE_HOURS: (() => {
    const m = String(process.env.JOBS_ACTIVE_HOURS || '8-23').match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (!m) return [8, 23];
    const a = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const b = Math.max(0, Math.min(24, parseInt(m[2], 10)));
    return [Math.min(a, b), Math.max(a, b)];
  })(),
  // --- התנהגות בקבוצות ---
  // קידומת לפקודות בקבוצה. בפרטי אפשר גם בלי קידומת.
  BOT_PREFIX: process.env.BOT_PREFIX || '!',
  // רשימת JID-ים מורשים, מופרדים בפסיק. ריק = כל הקבוצות/פרטי מורשים
  // (מגלים JID מהלוג כשהבוט מקבל הודעה, או עם הפקודה !id).
  // דוגמה: ALLOWED_GROUPS=120363123456789@g.us,120363987654321@g.us
  ALLOWED_GROUPS: (process.env.ALLOWED_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // קבוצת "בוט הורדת סרטונים": כל הודעה חופשית בה נחשבת לחיפוש סרטון (בלי צורך ב-!)
  MOVIE_GROUP: (process.env.MOVIE_GROUP || '').trim(),
  // גודל מקסימלי להורדה (MB). מעל MOVIE_WA_SEND_MB — נשלח קישור הורדה במקום קובץ
  MOVIE_MAX_MB: Math.max(5, Math.min(1024, parseInt(process.env.MOVIE_MAX_MB || '100', 10) || 100)),
  // גודל מקסימלי לשליחה ישירה בוואטסאפ (MB). גדול מזה עולה ל-Litterbox כקישור
  MOVIE_WA_SEND_MB: Math.max(5, Math.min(100, parseInt(process.env.MOVIE_WA_SEND_MB || '16', 10) || 16)),
  // שם הבוט לתפריטים
  BOT_NAME: process.env.BOT_NAME || 'בוט AI 🤖',
  // --- מודל חינמי/PRO: מכסת תשובות AI יומית למשתמש לא-מנוי בקבוצות ---
  FREE_DAILY_LIMIT: parseInt(process.env.FREE_DAILY_LIMIT || '20', 10) || 20,
  // --- שורת פרו בראש כל הודעה (ריק ב-.env = בלי שורה; שים לב: מחרוזת ריקה תקפה!) ---
  PRO_PROMO: process.env.PRO_PROMO !== undefined ? process.env.PRO_PROMO : '💎 *כדי לעשות מנוי פרו פנו אלי:* 0555655217',
  // --- קבוצה ראשית (שורת סיום אוטומטית בסוף כל הודעת בוט) ---
  // קישור הזמנה לקבוצה הראשית של הבוט. ריק = בלי שורה.
  MAIN_GROUP_URL: (process.env.MAIN_GROUP_URL || '').trim(),
  // --- ערוץ עדכונים (נשלח בהודעות פרטיות כשהקבוצה חסומה) ---
  CHANNEL_URL: (process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029Vb8quoG7Noa0OoPO281B').trim(),
  // --- קישור הקבוצה שנשלח למי שכותב לבוט בצ'אט פרטי (הבוט עובד רק בקבוצה) ---
  DM_GROUP_URL: (process.env.DM_GROUP_URL || 'https://chat.whatsapp.com/DLMwZWRGxBeLEAacGsiPl9').trim(),
  // --- סשן נוסף / חיבור חשבון אחר (אופציונלי, לא שובר את הקיים) ---
  // תיקיית התחברות (ברירת מחדל auth_info). לסשן שני מריצים עם AUTH_DIR=./auth_tablet
  AUTH_DIR: process.env.AUTH_DIR || './auth_info',
  // קוד חיבור בן 8 ספרות במקום QR (אופציונלי): מספר הטלפון של החשבון הראשי, ספרות בלבד
  // דוגמה: PAIR_PHONE=972501234567 — הקוד יודפס בלוג, מקלידים אותו בוואטסאפ > מכשירים מקושרים
  PAIR_PHONE: (process.env.PAIR_PHONE || '').replace(/\D/g, ''),
};

export function isGroupAllowed(remoteJid, isGroup) {
  if (!isGroup) return true;
  if (config.ALLOWED_GROUPS.length === 0) return true;
  return config.ALLOWED_GROUPS.includes(remoteJid);
}
