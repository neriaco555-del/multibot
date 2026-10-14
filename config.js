// קונפיג מרכזי לבוט — קורא משתני סביבה עם ברירות מחדל חכמות
import 'dotenv/config';

export const config = {
  // --- AI צ'אט (נבחר אוטומטית לפי מה שקיים, לפי סדר איכות) ---
  // 1. OpenAI — הכי איכותי, בתשלום: https://platform.openai.com/api-keys
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  // 2. Groq — חינמי ומהיר מאוד: https://console.groq.com
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  // 💻 מודל לפיתוח/קוד (אתרים, קוד) — נבחר אוטומטית החזק ביותר הזמין בחינמי
  GROQ_CODE_MODEL: process.env.GROQ_CODE_MODEL || 'openai/gpt-oss-120b',
  // 3. Gemini — חינמי של גוגל: https://aistudio.google.com/app/apikey
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
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

  // --- Instinct (בוט תמונות חיצוני — ממסרים אליו בקשות) ---
  INSTINCT_JID: process.env.INSTINCT_JID || '16508702892@s.whatsapp.net',
  INSTINCT_TIMEOUT_MS: parseInt(process.env.INSTINCT_TIMEOUT_MS || '600000', 10) || 600000,
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
  // --- התנהגות בקבוצות ---
  // קידומת לפקודות בקבוצה. בפרטי אפשר גם בלי קידומת.
  BOT_PREFIX: process.env.BOT_PREFIX || '!',
  // רשימת JID-ים מורשים, מופרדים בפסיק. ריק = כל הקבוצות/פרטי מורשים
  // (מגלים JID מהלוג כשהבוט מקבל הודעה, או עם הפקודה !id).
  // דוגמה: ALLOWED_GROUPS=120363123456789@g.us,120363987654321@g.us
  ALLOWED_GROUPS: (process.env.ALLOWED_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean),
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
