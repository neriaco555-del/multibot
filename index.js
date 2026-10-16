/**
 * 🤖 בוט וואטסאפ AI משוכלל — גרסה 2.0
 *
 * יכולות:
 * - 💬 צ'אט AI (OpenAI → Groq → Gemini → Pollinations חינמי, אוטומטי)
 * - 🎨 יצירת תמונות (DALL-E 3 אם יש מפתח, אחרת FLUX חינמי)
 * - 🎵 שירים + 🎬 סרטונים — חיפוש YouTube והחזרת קישורים חוקיים
 * - ⭐ סטיקרים — מתמונה שנשלחת / בתגובה לתמונה
 * - 🔊 דיבור (TTS) — הופך טקסט להודעה קולית
 * - 👥 תמיכה מלאה בקבוצות (עם קידומת ! או תיוג) + צ'אט פרטי
 */
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import http from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';

import { config, isGroupAllowed } from './config.js';
import { chatAI } from './ai-chat.js';
import { generateImage, generateStickerImage } from './ai-image.js';
import { searchYouTube, formatMediaResults, resolveYouTubeChannel } from './media-search.js';
import { toStickerBuffer, videoToStickerBuffer, memeSticker, removeStickerBackground } from './sticker-utils.js';
import { textToSpeech } from './ai-voice.js';
import { createAIVideo } from './ai-video.js';
import { searchProducts, affiliateUrl } from './aliexpress.js';
import {
  animalImage, currencyRates, cryptoPrices, newsHe,
  cityTime, dice, coin, pickOne, genPassword, randNum, randColor, dateHe, countdown, rnd,
  shabbatTimes, stockPrice, shortenUrl, earthquakes, airQuality, resolveIndexSymbol,
} from './more.js';
import {
  renderXO, xoApply, pickScrambleWord, scrambleWord, isScrambleAnswer,
  pickTruthOrDare, shuffleArray, pickBattleSetup,
} from './games.js';
import { AI_TOOLS, resolveAiTool, runAiTool, aiToolUsage } from './aifun.js';
import fs from 'node:fs';
import { searchWeb, searchImages, translateText, getWeather } from './web-search.js';
import {
  gdata, save as saveStore, logMessage, recentChat, addPoint, addPoints, topPoints,
  spamCheck, newTrivia, newPoll, pollResults, setBirthday, todayBirthdays,
  addEvent, listEvents, checkChannel,
  addReminder, listReminders, removeReminder, popDueReminders, fmtReminderTime,
  bumpFreeQuota, getProCache, setProCache, mergeKnownGroups,
  learnPair, listLearned, forgetLearned, matchLearned,
  addContent, listContent, delContent, pickContent, stickerDayDone,
} from './advanced.js';
import {
  hasBlockedLink, hasCurse, isSenderAdmin, isBotAdmin, listAdmins, extractTarget,
  addWarn, getWarns, clearWarns, clearWarnsAll, mergeWarnAlias,
  isMuted, muteUser, unmuteUser,
  deleteMsg, buildWelcome, invalidateMeta, resolveCanonical, kickParticipant, getGroupMeta,
} from './admin.js';
import { transcribeAudio, trimAudio, pitchVoice, downloadYouTubeAudio, downloadYouTubeVideo, describeImage } from './aimedia.js';
import { generateSiteHTML, updateSiteHTML, publishSite, getSite, newSiteId, extractSiteId, waitForSite, SITE_HELP } from './sites.js';
import { subsConfigured, SUBS_SETUP_HELP, normPhone, parseDuration, fmtLeft, grantSub, revokeSub, getSub, readSubs, popExpiredSubs, splitPhoneDur, isPro, proPitch, bgList, bgPick, bgSearch, bgExtra, bgSearchExtra, bgResolve, driveImageUrl } from './subs.js';
import { normalizeNaturalCommand, aiRouteCommand, aiUnderstand, KNOWN_FIRST } from './nlp.js';

const HELP_1 = `🤖 *${config.BOT_NAME} — מדריך מלא (חלק 1: AI ומדיה)*

כל הפקודות מתחילות ב-${config.BOT_PREFIX}. הבוט עונה רק לפקודות מפורשות — הוא לא מתערב בשיחות רגילות.
כתוב פקודה *בלי תוכן* (למשל ${config.BOT_PREFIX}תמונה) להסבר נוסף.
💡 *טיפ:* אפשר לכתוב חופשי — למשל ${config.BOT_PREFIX}צור לי תמונה של חתול · ${config.BOT_PREFIX}תשמיע שיר · ${config.BOT_PREFIX}מה מזג האוויר בחיפה

━━━━━━━━━━━━━━
💬 *${config.BOT_PREFIX}שאל <שאלה> — צ'אט חכם בעברית*
שאל כל דבר: הסברים, רעיונות, עזרה בלימודים, מתכונים, כל נושא.
📅 כשזה שאלה לידע/חדשות/עובדות — הבוט מחפש בגוגל *אוטומטית* ועונה לפי התוצאות.
דוגמאות:
• ${config.BOT_PREFIX}שאל מה ההבדל בין חור שחור לחור תולעת?
• ${config.BOT_PREFIX}שאל תן לי רעיון למתנה לאמא
• ${config.BOT_PREFIX}שאל איך מכינים פנקייק?

━━━━━━━━━━━━━━
🎨 *${config.BOT_PREFIX}תמונה <תיאור> — יצירת תמונת AI*
מתאר מה רוצים לראות והבוט יוצר תמונה חדשה (Gemini Nano Banana אם יש מפתח, אחרת Pollinations חינמי).
אפשר בעברית — מתורגם אוטומטית לאנגלית לאיכות מקסימלית.
טיפים: הוסף צבעים, רקע וסגנון (ריאליסטי / מצויר / פיקסאר / אנימה).
לוקח כדקה (מודל איכותי וחינמי).
דוגמאות:
• ${config.BOT_PREFIX}תמונה ארנב לבן חמוד בדשא
• ${config.BOT_PREFIX}צייר טירת פנטזיה מעל עננים בשקיעה
• ${config.BOT_PREFIX}תמונה מכונית ספורט אדומה בגשם, ריאליסטי
מילים נרדפות: צייר, ציור, תצייר.

━━━━━━━━━━━━━━
🎵 *${config.BOT_PREFIX}שיר <שם + זמר> — חיפוש שיר*
מחפש ביוטיוב ומחזיר קישורים + תמונה (קישורים חוקיים בלבד).
דוגמאות:
• ${config.BOT_PREFIX}שיר עומר אדם מלכת הדור
• ${config.BOT_PREFIX}שיר Imagine Dragons Believer
מילים נרדפות: מוזיקה, נגן.

━━━━━━━━━━━━━━
🎬 *${config.BOT_PREFIX}וידאו <נושא> — חיפוש סרטון*
מחזיר 3 סרטונים מיוטיוב עם קישורים.
דוגמאות:
• ${config.BOT_PREFIX}וידאו איך מכינים חומוס
• ${config.BOT_PREFIX}סרטון שערים של מסי
מילים נרדפות: סרטון, סרטונים, יוטיוב.

━━━━━━━━━━━━━━
 ⭐ *${config.BOT_PREFIX}סטיקר — יצירת מדבקה*
 שלוש דרכים:
 1. שלח תמונה/סרטון קצר וכתוב בכיתוב: ${config.BOT_PREFIX}סטיקר
 2. הגב (Reply) לתמונה/סרטון וכתוב: ${config.BOT_PREFIX}סטיקר
 3. ${config.BOT_PREFIX}סטיקר חתול אסטרונאוט — יצירה מאפס עם מודל חינמי + רקע שקוף! ✨
 4. ${config.BOT_PREFIX}סטיקר חתול | יום יבוא / ותהיה מנגב כמוני — עם כיתוב! 💬
 תמונה → 512x512. יצירה מה-AI יוצאת עם רקע שקוף כמו סטיקר אמיתי. סרטון (עד 8 שניות) → מדבקה מונפשת! 🎞️

━━━━━━━━━━━━━━
🔊 *${config.BOT_PREFIX}דבר <טקסט> — הודעה קולית בעברית*
הבוט מקריא ושולח הקלטה (עד ~900 תווים).
דוגמאות:
• ${config.BOT_PREFIX}דבר שלום לכולם, מה נשמע?
• ${config.BOT_PREFIX}דבר מזל טוב ליום ההולדת!
אפשר לשנות קול: ${config.BOT_PREFIX}קול גברי / נשי / רגיל.


 ━━━━━━━━━━━━━━
 ℹ️ *${config.BOT_PREFIX}מצב — מה פעיל כרגע*
 מציג אילו מנועי AI, חיפוש ותמונות מחוברים עכשיו.`;

const HELP_2 = `🔍 *מדריך מלא (חלק 2: חיפושים, כלים ומידע חי)*

━━━━━━━━━━━━━━
🖼️ *${config.BOT_PREFIX}תמונות <נושא> — תמונות אמיתיות מהרשת*
חיפוש תמונות קיימות (רישיונות פתוחים), לא יצירה.
ליצירת תמונה חדשה עם AI: ${config.BOT_PREFIX}תמונה (יחיד).
דוגמאות:
• ${config.BOT_PREFIX}תמונות שקיעה בים
• ${config.BOT_PREFIX}תמונות ארנב חמוד

━━━━━━━━━━━━━━
🌍 *${config.BOT_PREFIX}תרגם <טקסט> — עברית↔אנגלית*
הכיוון אוטומטי לפי השפה שכתבת.
דוגמאות:
• ${config.BOT_PREFIX}תרגם שלום עולם
• ${config.BOT_PREFIX}תרגם Good morning

━━━━━━━━━━━━━━
🌤️ *${config.BOT_PREFIX}מזג <עיר> — מזג אוויר חי*
טמפרטורה עכשיו + מקסימום/מינימום היום + לחות + רוח. נתונים חיים.
עובד בעברית ובאנגלית.
דוגמאות:
• ${config.BOT_PREFIX}מזג תל אביב
• ${config.BOT_PREFIX}מזג ירושלים

━━━━━━━━━━━━━━
🔳 *${config.BOT_PREFIX}qr <טקסט> — יצירת ברקוד*
מחזיר תמונת QR לסריקה (טוב לקישורים).
דוגמאות:
• ${config.BOT_PREFIX}qr https://example.com
• ${config.BOT_PREFIX}ברקוד שלום לכולם

━━━━━━━━━━━━━━
📰 *${config.BOT_PREFIX}חדשות — החדשות החמות*
5 כותרות עדכניות מישראל עכשיו. בלי תוכן — פשוט ${config.BOT_PREFIX}חדשות.


━━━━━━━━━━━━━━
💵 *${config.BOT_PREFIX}דולר — שערי מטבע*
שערי דולר, יורו וליש״ט בשקלים (מתעדכן יומית). בלי תוכן.
אפשר גם: ${config.BOT_PREFIX}שערים-יומי on — עדכון אוטומטי כל בוקר 9:00.

 ━━━━━━━━━━━━━━
 🪙 *${config.BOT_PREFIX}ביטקוין — מחירי קריפטו*
 ביטקוין, את׳ריום, סולנה ודוג׳קוין בדולר ובשקל. בלי תוכן.

 ━━━━━━━━━━━━━━
 🕯️ *${config.BOT_PREFIX}שבת [עיר] — זמני שבת וחג*
 הדלקת נרות, הבדלה, פרשה וחג קרוב.
 דוגמאות:
 • ${config.BOT_PREFIX}שבת
 • ${config.BOT_PREFIX}שבת תל אביב

 ━━━━━━━━━━━━━━
 📈 *${config.BOT_PREFIX}מניה <סימול> — מחיר חי*
 מניות ארה״ב + תל אביב + קריפטו (BTC-USD).
 דוגמאות:
 • ${config.BOT_PREFIX}מניה AAPL
 • ${config.BOT_PREFIX}מניה TSLA

 ━━━━━━━━━━━━━━
 🔗 *${config.BOT_PREFIX}קצר <קישור> — קיצור קישורים*
 דוגמה: ${config.BOT_PREFIX}קצר https://example.com/abc/def

 ━━━━━━━━━━━━━━
 🌍 *${config.BOT_PREFIX}רעידת-אדמה [ישראל] — רעידות 24 שעות*
 • ${config.BOT_PREFIX}רעידת-אדמה — החזקות בעולם
 • ${config.BOT_PREFIX}רעידת-אדמה ישראל — רק בסביבת ישראל

 ━━━━━━━━━━━━━━
 😷 *${config.BOT_PREFIX}זיהום-אוויר [עיר] — מדד AQI חי*
 דוגמה: ${config.BOT_PREFIX}זיהום-אוויר תל אביב

 ━━━━━━━━━━━━━━
 📊 *${config.BOT_PREFIX}מדדים — TA-35 + S&P500*
 • ${config.BOT_PREFIX}מדד — שני המדדים המובילים
 • ${config.BOT_PREFIX}מדד זהב | נפט | נסד"ק | s&p`;

const HELP_3 = `✨ *מדריך מלא (חלק 3: כלי AI וכיף)*

כל הכלים רצים על ה-AI. חלק דורשים טקסט (מסומן <...>), חלק עובדים גם בלי.

━━━━━━━━━━━━━━
😂 *${config.BOT_PREFIX}בדיחה [נושא]* — בדיחה מצחיקה בעברית.
• ${config.BOT_PREFIX}בדיחה
• ${config.BOT_PREFIX}בדיחה על תכנתים

━━━━━━━━━━━━━━
🧩 *${config.BOT_PREFIX}חידה* — חידת היגיון עם רמזים + פתרון בסוף.

━━━━━━━━━━━━━━
🤯 *${config.BOT_PREFIX}עובדה [נושא]* — עובדה מפתיעה.
• ${config.BOT_PREFIX}עובדה
• ${config.BOT_PREFIX}עובדה על חלל

━━━━━━━━━━━━━━
💪 *${config.BOT_PREFIX}מוטיבציה [נושא]* — משפט מעורר השראה.

━━━━━━━━━━━━━━
📖 *${config.BOT_PREFIX}סיפור <נושא>* — סיפור קצר עד 150 מילים.
• ${config.BOT_PREFIX}סיפור דרקון חברותי

━━━━━━━━━━━━━━
🍳 *${config.BOT_PREFIX}מתכון <מנה>* — מצרכים עם כמויות + שלבי הכנה.
• ${config.BOT_PREFIX}מתכון פנקייק

━━━━━━━━━━━━━━
🏋️ *${config.BOT_PREFIX}אימון [מטרה]* — אימון ביתי עם חזרות.
• ${config.BOT_PREFIX}אימון בטן

━━━━━━━━━━━━━━
💡 *${config.BOT_PREFIX}טיפ [תחום]* — טיפ יומי מעשי.

━━━━━━━━━━━━━━
💌 *${config.BOT_PREFIX}ברכה <אירוע>* — ברכה חמה עד 100 מילים.
• ${config.BOT_PREFIX}ברכה יום הולדת לאבא

━━━━━━━━━━━━━━
📧 *${config.BOT_PREFIX}אימייל <נושא>* — ניסוח אימייל מנומס כולל שורת נושא.
מילה נרדפת: מייל.

━━━━━━━━━━━━━━
📝 *${config.BOT_PREFIX}סיכום <טקסט>* — סיכום ב-3-5 נקודות.
מילה נרדפת: סכם.

━━━━━━━━━━━━━━
✍️ *${config.BOT_PREFIX}שכתוב <טקסט>* — ניסוח מחדש יפה וברור.
מילה נרדפת: נסח.

━━━━━━━━━━━━━━
💻 *${config.BOT_PREFIX}קוד <בקשה>* — כתיבת קוד + הסבר שורה.
• ${config.BOT_PREFIX}קוד פונקציה שמחשבת עצרת בפייתון
מילה נרדפת: תכנת.

━━━━━━━━━━━━━━
🌟 *${config.BOT_PREFIX}רעיון <נושא>* — 3 רעיונות יצירתיים.

━━━━━━━━━━━━━━
🌙 *${config.BOT_PREFIX}חלום <תיאור>* — פירוש חיובי (לבידור בלבד ✨).

━━━━━━━━━━━━━━
🔮 *${config.BOT_PREFIX}מזל <מזל>* — הורוסקופ יומי משעשע (לבידור ✨).
• ${config.BOT_PREFIX}מזל אריה

━━━━━━━━━━━━━━
📖 *${config.BOT_PREFIX}מילון <מילה>* — פירוש + דוגמה במשפט + תרגום.
• ${config.BOT_PREFIX}מילון אהבה

━━━━━━━━━━━━━━
🌍 *${config.BOT_PREFIX}מדינה <שם>* — בירה, אוכלוסייה, שפה, מטבע + עובדה.
• ${config.BOT_PREFIX}מדינה יפן

━━━━━━━━━━━━━━
🎲 *כיף מקומי (בלי אינטרנט):*
• ${config.BOT_PREFIX}קוביה [פאות] — הטלת קוביה (ברירת מחדל 6)
• ${config.BOT_PREFIX}מטבע — עץ או פלי
• ${config.BOT_PREFIX}בחר א | ב | ג — בחירה רנדומלית (מפריד: | או פסיק או שורה)
• ${config.BOT_PREFIX}הגרלה דני, יוסי, נועה — הגרלה בין שמות
• ${config.BOT_PREFIX}סיסמה [אורך] — סיסמה חזקה (ברירת מחדל 12)
• ${config.BOT_PREFIX}מספר [מינימום מקסימום] — מספר רנדומלי
• ${config.BOT_PREFIX}צבע — צבע HEX + RGB
• ${config.BOT_PREFIX}תאריך — התאריך העברי/לועזי היום
• ${config.BOT_PREFIX}שעה <עיר> — שעה נוכחית בעולם (ירושלים, לונדון, ניו יורק, טוקיו ועוד)
 • ${config.BOT_PREFIX}עד <תאריך> — ספירה לאחור. דוגמה: ${config.BOT_PREFIX}עד 25.12.2026
 • ${config.BOT_PREFIX}תזכורת 30 <טקסט> — בעוד דקות
 • ${config.BOT_PREFIX}תזכורת 18:30 <טקסט> — היום/מחר בשעה
 • ${config.BOT_PREFIX}תזכורת 25.12 08:00 <טקסט> — בתאריך
 • ${config.BOT_PREFIX}תזכורת יומית 08:00 <טקסט> — כל יום! (נשמר תמיד)
 • ${config.BOT_PREFIX}תזכורות — רשימה | ${config.BOT_PREFIX}מחק-תזכורת 1 — מחיקה

━━━━━━━━━━━━━━
🐶 *חיות חמודות (בלי תוכן — תמונה מיד!):*
• ${config.BOT_PREFIX}כלב — תמונת כלב רנדומלית
• ${config.BOT_PREFIX}חתול — תמונת חתול רנדומלית
• ${config.BOT_PREFIX}שועל — תמונת שועל רנדומלית

━━━━━━━━━━━━━━
🎮 *${config.BOT_PREFIX}איקס-עיגול — משחק 3x3*
• ${config.BOT_PREFIX}איקס-עיגול @פלוני @אלמוני — משחק מיידי בין שניהם
• ${config.BOT_PREFIX}איקס-עיגול — מזמין למשחק, יריב כותב אותו דבר
• אחר כך: שולחים *מספר 1-9* לתא. המנצח/ת: 10 נקודות.
• ${config.BOT_PREFIX}איקס-עיגול ביטול — ביטול המשחק

━━━━━━━━━━━━━━
🧩 *${config.BOT_PREFIX}מילים-מעורבבות — פיענוח מהיר*
מילה בעברית מעורבבת. עונים *בלי !* — ראשון/ה: 3 נקודות. סבב 5 דקות.

━━━━━━━━━━━━━━
🫢 *${config.BOT_PREFIX}אמת-או-חובה [אמת|חובה]*
רנדומלי אם לא כותבים. בלי AI — מהיר ותמיד עובד.

━━━━━━━━━━━━━━
⚔️ *${config.BOT_PREFIX}מלחמת-משפטים — קרב משפטים קבוצתי*
1) ${config.BOT_PREFIX}מלחמת-משפטים — פתיחה מצחיקה
2) ${config.BOT_PREFIX}משפט <המשפט שלך> — הגשה (90 שניות, עד 4)
3) הצבעה עם *1 / 2 / 3*. המנצח/ת: 10 נקודות.`;
const HELP_TEXT = HELP_1; // תאימות לאחור

// עזרה קצרה: רשימת יכולות בלבד (בלי פירוט פקודות)
const HELP_SHORT = `🤖 *${config.BOT_NAME} — מה אני יודע לעשות?*

כתוב ${config.BOT_PREFIX} + מה שאתה רוצה במילים שלך — אני מבין לבד, לא צריך לזכור פקודות.
💡 *להמשך שיחה:* הגב (↩️ reply) להודעה שלי — גם בלי !, בכל נושא (כולל חיפוש סרטונים).

💬 *לשאול ולשוחח* — כל שאלה, הסבר, רעיון
🎨 *ליצור תמונות* — "תכין לי תמונה של…"
🎵 *מוזיקה וסרטונים* — חיפוש קישורים מיוטיוב
⭐ *סטיקרים* — מתמונה או יצירה מאפס
🔊 *הקראה בקול* — הופך טקסט להודעה קולית
🌤️ *מידע חי* — מזג אוויר, חדשות, מטבע, שבת, מניות
😂 *כיף* — בדיחות, חידות, טריוויה, משחקי קבוצה
📸 *תמונת פרופיל* — תייג מישהו והבוט חושף אותו 😂
⏰ *לקבוצה* — תזכורות, סקרים, תורנויות, ימי הולדת
🌐 *יצירת אתרים* — תיאור במילים שלך, מקבל כתובת לאתר חי
🔍 *זיהוי מספרים* — רק בפרטי: ${config.BOT_PREFIX}זהה (מחזיר שם + קובץ אנשי קשר)
👀 *צפיות בסטטוס* — ${config.BOT_PREFIX}מי-צפה (מי שמר אותך ולא שמור אצלך + קובץ)
🕵️ *מי שמר אותי* — ${config.BOT_PREFIX}מי-שמר-אותי (דו״ח מסודר) · ${config.BOT_PREFIX}סריקה-עמוקה (חברי קבוצות) · ${config.BOT_PREFIX}בדוק-שמירה <מספרים>
📇 *רשת Me* — ${config.BOT_PREFIX}me-התחבר · ${config.BOT_PREFIX}me-זהה <מספרים> (זיהוי עולמי)

📌 דוגמאות:
• ${config.BOT_PREFIX}תכין לי תמונה של חתול אסטרונאוט
• ${config.BOT_PREFIX}מה מזג האוויר בחיפה?
• ${config.BOT_PREFIX}תזכיר לי בעוד שעה להוציא עוף

📖 למדריך המלא: ${config.BOT_PREFIX}מדריך | 🛡️ למנהלים: ${config.BOT_PREFIX}מנהלים`;

const HELP_4 = `🚀 *מדריך מלא (חלק 4: קבוצה מתקדמת)*

━━━━━━━━━━━━━━
🧠 *${config.BOT_PREFIX}אישיות <סגנון> — סגנון דיבור לבוט*
הבוט עונה בסגנון שתבחר עד לביטול.
• ${config.BOT_PREFIX}אישיות פיראט מצחיק
• ${config.BOT_PREFIX}אישיות פרופסור רציני
• ${config.BOT_PREFIX}אישיות — מציג נוכחית
• ${config.BOT_PREFIX}אישיות נקה — ביטול

━━━━━━━━━━━━━━
📝 *${config.BOT_PREFIX}סכם-צאט — סיכום השיחה*
מסכם את 50 ההודעות האחרונות בקבוצה: נושאים, החלטות, שאלות פתוחות.

━━━━━━━━━━━━━━
🎙️ *${config.BOT_PREFIX}תמלל — כתיבת הקלטה*
הגב (Reply) להודעה קולית עם ${config.BOT_PREFIX}תמלל והבוט יכתוב מילה במילה מה נאמר (עברית, Whisper AI).

━━━━━━━━━━━━━━
🎯 *${config.BOT_PREFIX}טריוויה — שאלת ניקוד*
שאלה אמריקאית עם 4 אפשרויות, 90 שניות, 5 נקודות למנצח.
עונים באות (א/ב/ג/ד) או מספר (1-4) — גם בלי !.
תשובה נכונה מקבלת ברכה, שגויה = שקט (לא מתערבים).

 ━━━━━━━━━━━━━━
 🏆 *${config.BOT_PREFIX}טופ — המובילים* | 🎖️ *${config.BOT_PREFIX}נקודות — שלי*
 נקודה לכל הודעה (עד אחת לדקה) + 5 לטריוויה. נשמר תמיד.

 ━━━━━━━━━━━━━━
 📊 *${config.BOT_PREFIX}פעילות — דוח שבועי*
 סיכום 7 ימים: סה״כ הודעות + 5 הכי פעילים.

━━━━━━━━━━━━━━
🎂 *${config.BOT_PREFIX}יומולדת <תאריך> — רישום*
• ${config.BOT_PREFIX}יומולדת 25.12 — רושם אותך, והבוט מברך אוטומטית בבוקר היום הגדול
• ${config.BOT_PREFIX}יומולדת — רשימת הרשומים

━━━━━━━━━━━━━━
📊 *${config.BOT_PREFIX}סקר <שאלה> | א | ב — סקר קבוצתי*
• יצירה: ${config.BOT_PREFIX}סקר איפה נפגשים? | פארק | קניון | ים
• הצבעה: שולחים את מספר האפשרות (1/2/3) — בלי !
• ${config.BOT_PREFIX}סקר-תוצאות — תוצאות | ${config.BOT_PREFIX}סקר-סגור — סגירה

━━━━━━━━━━━━━━
✂️ *${config.BOT_PREFIX}חתוך <שניות> — חיתוך הקלטה*
הגב להודעה קולית עם מספר שניות, מקבל את ההתחלה כהקלטה חדשה.
• ${config.BOT_PREFIX}חתוך 20

━━━━━━━━━━━━━━
⭐ *${config.BOT_PREFIX}אוטו-סטיקר on/off*
כשפעיל — כל תמונה בקבוצה הופכת לסטיקר אוטומטית (בלי פקודה).
• ${config.BOT_PREFIX}אוטו-סטיקר — מציג מצב

━━━━━━━━━━━━━━
🌍 *${config.BOT_PREFIX}אוטו-תרגם on/off*
כשפעיל — כל הודעה באנגלית מתורגמת אוטומטית לעברית.
(רק להודעות רגילות, לא לפקודות — ולא מתערב מעבר לזה).

━━━━━━━━━━━━━━
🎤 *${config.BOT_PREFIX}קול <רגיל|גברי|נשי> — קול ההקראה*
משפיע על ${config.BOT_PREFIX}דבר. בלי תוכן — מציג נוכחי.

━━━━━━━━━━━━━━
📅 *אירועים קבוצתיים*
• הוספה: ${config.BOT_PREFIX}אירוע 25.12 מסיבת חנוכה
• רשימה: ${config.BOT_PREFIX}אירועים (רק עתידיים, מסודר)

━━━━━━━━━━━━━━
🌅 *${config.BOT_PREFIX}בוקר on/off [עיר] — בוקר-טוב יומי*
כל בוקר 8:00: ברכה + מזג אוויר של העיר.
• ${config.BOT_PREFIX}בוקר on תל אביב
• ${config.BOT_PREFIX}בוקר — מציג מצב

 ━━━━━━━━━━━━━━
 💹 *${config.BOT_PREFIX}שערים-יומי on/off*
 כל בוקר 9:00: שערי מטבע + קריפטו אוטומטית.

 ━━━━━━━━━━━━━━
 📰 *${config.BOT_PREFIX}בריף on/off [עיר] — בריף בוקר יומי*
 כל בוקר 7:30: חדשות + מזג אוויר + שערים אוטומטית.
 • ${config.BOT_PREFIX}בריף on תל אביב
 • ${config.BOT_PREFIX}בריף — מציג מצב

━━━━━━━━━━━━━━
 🔔 *${config.BOT_PREFIX}מעקב <ערוץ> — התראה על סרטון חדש*
 • ${config.BOT_PREFIX}מעקב כאן 11 — הוספה לפי שם (גם לא מדויק!)
 • ${config.BOT_PREFIX}מעקב @KAN11 — לפי handle
 • ${config.BOT_PREFIX}מעקב UC_x5XG1OV2P6uZZ5FSM9Ttw — לפי מזהה (מתחיל ב-UC)
 • ${config.BOT_PREFIX}מעקב — רשימת מעקבים
 • ${config.BOT_PREFIX}הסר-מעקב <id> — הסרה
 הבוט בודק כל חצי שעה ומודיע על סרטונים חדשים.

━━━━━━━━━━━━━━
📋 *${config.BOT_PREFIX}תורנות — חלוקת תורנויות שבועית*
• ${config.BOT_PREFIX}תורנות הוסף @משתמש (או שם) — הוספה
• ${config.BOT_PREFIX}תורנות — הרשימה + מי עכשיו
• ${config.BOT_PREFIX}תורנות הבא | ${config.BOT_PREFIX}תורנות הסר | ${config.BOT_PREFIX}תורנות נקה

━━━━━━━━━━━━━━
🔕 *${config.BOT_PREFIX}השתק-בוט <דקות> — שקט זמני*
הבוט לא ענה לכלום ל-X דקות (בתורנות/סרט/אירוע זה נוח).
• ${config.BOT_PREFIX}השתק-בוט 30
• ${config.BOT_PREFIX}פתח-בוט — פתיחה מוקדמת

━━━━━━━━━━━━━━
🗑️ *${config.BOT_PREFIX}נקה — מחיקת תשובה אחרונה של הבוט*
 הגב (Reply) על הודעה של הבוט וכתוב ${config.BOT_PREFIX}נקה.
 (נדרש שהבוט מנהל בקבוצה)

━━━━━━━━━━━━━━
📊 *${config.BOT_PREFIX}סטטוס-קבוצה — מה קורה כאן*
חברים, מנהלים, תאריך יצירה, מעמד הבוט וכל מה שפועל כרגע.

━━━━━━━━━━━━━━
📔 *${config.BOT_PREFIX}יומן — סיכום שיחת היום*
5 שורות משעשעות על מה קרה בקבוצה היום.

━━━━━━━━━━━━━━
🛡️ *כללי התנהגות של הבוט:*
• עונה רק לפקודות עם ${config.BOT_PREFIX} (או תיוג) — לא מתערב בשיחות
• לא עונה בפרטי — רק בקבוצה המורשית
• לא עונה לעצמו — אין לופים
• שקט בתשובות שגויות בטריוויה, שקט בהצבעות — רק תוצאות כשמבקשים`;

// 🛡️ חלק 5 — ניהול קבוצה (חדש, לא שובר את הקיים). עזרה נפרדת: !מנהלים
const HELP_5 = `🛡️ *מדריך מנהלים (חלק 5 — רק למנהלי הקבוצה!)*

⚠️ *הגדרה — רק מנהלים.* צפייה (כמו ${config.BOT_PREFIX}הגדרות / ${config.BOT_PREFIX}חוקים) פתוחה לכולם.
🤖 לפעולות מחיקה / הרחקה / נעילה — *הבוט עצמו חייב להיות מנהל* בקבוצה.

━━━━━━━━━━━━━━
🔗 *הסרת קישורים אוטומטית*
• ${config.BOT_PREFIX}קישורים on — כל קישור מלא-מנהל נמחק + אזהרה (3 אזהרות = הרחקה)
• ${config.BOT_PREFIX}קישורים off — כיבוי
• ${config.BOT_PREFIX}קישורים — מציג מצב

━━━━━━━━━━━━━━
🤬 *סינון קללות* | 🌊 *אנטי-ספאם קשוח*
• ${config.BOT_PREFIX}קללות on / off
• ${config.BOT_PREFIX}מילה-אסורה <מילה> — הוספה לרשימה
• ${config.BOT_PREFIX}מחק-מילה <מילה> — הסרה | ${config.BOT_PREFIX}מילים-אסורות — רשימה
• ${config.BOT_PREFIX}ספאם-קשוח on / off — מחיקת הצפות אוטומטית

━━━━━━━━━━━━━━
👋 *ברוכים הבאים* | 📜 *חוקים*
• ${config.BOT_PREFIX}ברוכים on — הודעה לכל מצטרף חדש (כולל הסבר פקודות)
• ${config.BOT_PREFIX}ברוכים on ברוך הבא {שם} ל{קבוצה}! — טקסט מותאם ({שם} / {קבוצה} / {פקודות})
• ${config.BOT_PREFIX}ברוכים off
• ${config.BOT_PREFIX}חוקים <טקסט> — קביעת חוקים (מנהלים) | ${config.BOT_PREFIX}חוקים — צפייה (כולם)
• ${config.BOT_PREFIX}חוקים נקה — מחיקה

━━━━━━━━━━━━━━
📣 *תיוג כולם (מנהלים)*
• ${config.BOT_PREFIX}תייג [טקסט] — מתייג את כל החברים (מילה נרדפת: ${config.BOT_PREFIX}כולם)

━━━━━━━━━━━━━━
⚠️ *אזהרות (מנהלים)*
• הגב להודעה או תייג: ${config.BOT_PREFIX}אזהרה — אזהרה +1 (3 = הרחקה אוטומטית)
• ${config.BOT_PREFIX}אזהרות — מצב אזהרות | ${config.BOT_PREFIX}נקה-אזהרות @משתמש — איפוס

━━━━━━━━━━━━━━
🔇 *השתקה מקומית (הבוט מוחק הודעות של מושתקים)*
• ${config.BOT_PREFIX}השתק (בתגובה/תיוג) | ${config.BOT_PREFIX}שחרר (בתגובה/תיוג) | ${config.BOT_PREFIX}מושתקים — רשימה

━━━━━━━━━━━━━━
🦵 *הרחקה / קידום (מנהלים + בוט-מנהל)*
• ${config.BOT_PREFIX}קיק (בתגובה/תיוג) — הרחקה מהקבוצה
• ${config.BOT_PREFIX}קדם (בתגובה/תיוג) — הפיכה למנהל
• ${config.BOT_PREFIX}הורד-ניהול (בתגובה/תיוג) — הסרת ניהול

━━━━━━━━━━━━━━
🔒 *נעילה / פתיחה (מנהלים + בוט-מנהל)*
• ${config.BOT_PREFIX}נעל — רק מנהלים יכולים לכתוב
• ${config.BOT_PREFIX}פתח — כולם יכולים לכתוב

━━━━━━━━━━━━━━
✏️ *שם ותיאור (מנהלים + בוט-מנהל)*
• ${config.BOT_PREFIX}שם <שם חדש> | ${config.BOT_PREFIX}תיאור <תיאור חדש>

━━━━━━━━━━━━━━
🧹 *מחיקת הודעה (מנהלים + בוט-מנהל)*
• הגב להודעה וכתוב: ${config.BOT_PREFIX}מחק

 ━━━━━━━━━━━━━━
 💎 *מנויי פרו (Google Sheets)*
 • ${config.BOT_PREFIX}פרו <מספר> <משך> — הענקה/הארכה (ימים/שעות/דקות/שניות)
 • ${config.BOT_PREFIX}פרו 0501234567 30 ימים
 • ${config.BOT_PREFIX}פרו-מצב <מספר> — בדיקה | ${config.BOT_PREFIX}מנויים — רשימה
 • ${config.BOT_PREFIX}פרו-בטל <מספר> — ביטול
 בסיום — הודעה אוטומטית בקבוצה. (בעלים/מנהלים)

 ━━━━━━━━━━━━━━
 👑 *ניהול מרחוק (רק בקבוצת הניהול!)*
 • ${config.BOT_PREFIX}קבוצות — רשימת כל הקבוצות (שמות + מספרים)
 • ${config.BOT_PREFIX}הצטרף <קישור> — צירוף הבוט + אישור · ${config.BOT_PREFIX}אשר / ${config.BOT_PREFIX}בטל-אישור / ${config.BOT_PREFIX}עזוב <שם>
 • ${config.BOT_PREFIX}לקבוצה <מספר/שם> הגדרות — צפייה בהגדרות קבוצה
 • ${config.BOT_PREFIX}לקבוצה 3 קישורים off — כיבוי/הפעלה (קישורים/קללות/ספאם/ברוכים)
 • ${config.BOT_PREFIX}לקבוצה 3 חוקים <טקסט> · פיצרים · פיצר <שם> on/off
 • ${config.BOT_PREFIX}לקבוצה 3 אזהרות · השתק @X · שחרר · נקה-אזהרות
 • ${config.BOT_PREFIX}מערכת · ${config.BOT_PREFIX}לוג [n] · ${config.BOT_PREFIX}גיבוי · ${config.BOT_PREFIX}הפעל-מחדש
 • ${config.BOT_PREFIX}שם-בוט <שם> · ${config.BOT_PREFIX}קידומת <תו> (עם הפעלה מחדש)

 ━━━━━━━━━━━━━━
 📊 *סטטוס ורשימות*
• ${config.BOT_PREFIX}הגדרות — כל מצבי הניהול (פתוח לכולם)
• ${config.BOT_PREFIX}מנהלים-רשימה — מי מנהל בקבוצה`;

const chatHistory = new Map(); // remoteJid -> [{role, content}]

// מזהי הודעות שהבוט עצמו שלח — כדי לא לענות לעצמו בלופ,
// אבל כן לענות להודעות שהבעלים הקליד מהחשבון של הבוט (fromMe שלא נשלחו ע"י הבוט)
const botSentIds = new Set();
const inSeenIds = new Set(); // מזהי הודעות נכנסות שכבר עובדו (מניעת כפילות)
// המפתח (key) של ההודעה האחרונה שה봇 שלח לכל צ'אט — לפקודה !נקה
const lastBotKey = new Map();
// 🏷️ תיוג מדויק לפי הודעה: כל הודעה נכנסת רצה בהקשר משלה (גם במקביל),
// והתשובה הראשונה בהקשר הזה פותחת בתיוג השולח — לעולם לא של מישהו אחר.
const tagALS = new AsyncLocalStorage(); // { sender, jid, at, used }
const warnedAt = {}; // אנטי-ספאם: מתי הזהרנו כל משתמש
const proPromoAt = new Map(); // צ'אט פרטי: מתי שלחנו הזמנה למנוי לכל JID (קירור שעה)
let proTickFails = 0, proTickSkipUntil = 0; // backoff לטיק תפוגות כשהגשר נופל
let lastGroupScan = 0; // סריקת קבוצות שהבוט חבר בהן (לפאנל) — פעם בשעה
let subjQueue = []; // JIDs היסטוריים חסרי שם — משלימים כמה בכל טיק
const subjDone = new Set();
const imgInFlight = new Map(); // 🎨 בקשות תמונה שרצות כרגע (מניעת כפילות)
const videoInFlight = new Map(); // 🎬 בקשות סרטון שרצות כרגע (מניעת כפילות)
/* ---------- 🤖 ממסר Instinct (בוט תמונות חיצוני) ---------- */
const instBare = (j) => String(j || '').split('@')[0].replace(/\D/g, '');
const INSTINCT_BARES = new Set([instBare(config.INSTINCT_JID), '23949492670633']);
let instinctPending = null;
let instinctLate = null; // 🤖 בקשה שפג תוקפה אבל התמונה עוד עשויה להגיע — תימסר באיחור
const instinctQueue = [];
let instinctRunning = false;
let instinctFails = 0; // כשלונות רצופים — אחרי 2 מדלגים זמנית על הממסר (עד הצלחה)
let instinctColdAt = 0;
let activeJob = null; // בקשת Instinct הפעילה כרגע {chatJid, waitingHuman}
function instinctCold() {
  if (instinctFails < 2) return false;
  if (Date.now() - instinctColdAt > 5 * 60 * 1000) {
    instinctFails = 0; // ניסיון חוזר כל 5 דקות
    return false;
  }
  return true;
}
function instinctBumpFail() {
  instinctFails++;
  if (instinctFails === 2) instinctColdAt = Date.now();
}
let instinctSendJid = '23949492670633@lid'; // ה-JID שכן עובד לשליחה (LID בזמן אמת)
let instinctQTimer = null; // טיימאאוט לשאלת הבהרה — לא מחכים לנצח לתשובה אנושית
function isInstinctJid(jid) {
  try {
    const b = instBare(jid);
    if (INSTINCT_BARES.has(b)) return true;
    const mapped = lidPhoneCache.get(jid);
    return !!(mapped && INSTINCT_BARES.has(instBare(mapped)));
  } catch { return false; }
}
async function resolveInstinct(sock) {
  try {
    const r = await sock.onWhatsApp('16508702892');
    const j = r?.[0]?.jid;
    if (j) INSTINCT_BARES.add(instBare(j));
  } catch {}
}
function requestInstinct(sock, prompt, chatJid, mediaBuf = null) {
  return new Promise((resolve, reject) => {
    const pos = instinctQueue.length + (instinctRunning ? 1 : 0);
    instinctQueue.push({ prompt: String(prompt || '').slice(0, 1000), chatJid, mediaBuf, resolve, reject, at: Date.now() });
    // חיווי תור: אם יש בקשה פעילה/ממתינה לפנייך — אומרים, שלא ייראה תקוע
    if (pos > 0 && /@g\.us$|@s\.whatsapp\.net$|@lid$/.test(String(chatJid || ''))) {
      sock.sendMessage(chatJid, { text: `🎨 בתור ליצירה (מקום ${pos + 1}) — אשלח כשמוכן, סבלנות 🙏` }).catch(() => {});
    }
    pumpInstinct(sock).catch(() => {});
  });
}
// תור FIFO: בקשה אחת בכל פעם — מחכה שהקודמת תסתיים (או timeout) לפני הבאה
async function pumpInstinct(sock) {
  if (instinctRunning) return;
  const job = instinctQueue.shift();
  if (!job) return;
  if (Date.now() - job.at > 10 * 60 * 1000) {
    job.reject(new Error('STALE'));
    return pumpInstinct(sock);
  }
  instinctRunning = true;
  activeJob = { chatJid: job.chatJid, waitingHuman: false };
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (instinctPending && instinctPending.id === id) {
          instinctPending = null;
          // שומרים למסירה מאוחרת — אם התמונה תגיע אחרי הטיימאאוט היא תישלח בכל זאת
          instinctLate = { chatJid: job.chatJid, at: Date.now(), prompt: job.prompt };
          reject(new Error('TIMEOUT'));
        }
      }, config.INSTINCT_TIMEOUT_MS);
      instinctPending = {
        id, timer, chatJid: job.chatJid,
        resolve: (buf) => { clearTimeout(timer); try { clearTimeout(instinctQTimer); instinctQTimer = null; } catch {} resolve(buf); },
        reject: (e) => { clearTimeout(timer); try { clearTimeout(instinctQTimer); instinctQTimer = null; } catch {} reject(e); },
      };
      const sendPayload = job.mediaBuf
        ? { image: job.mediaBuf, caption: job.prompt }
        : { text: job.prompt };
      sock.sendMessage(instinctSendJid || config.INSTINCT_JID, sendPayload).then(
        () => console.log('🤖 instinct asked (queue)'),
        (e) => {
          instinctPending = null;
          clearTimeout(timer);
          reject(e);
        }
      );
    })
      .then(job.resolve, job.reject);
  } finally {
    instinctRunning = false;
    activeJob = null;
    if (instinctQueue.length) pumpInstinct(sock).catch(() => {});
  }
}
const lastMedia = new Map(); // 🎬🎵🎨 פקודת מדיה אחרונה לכל צ'אט — ל"עוד" (remoteJid -> {kind, q, at})
const mgmtGroupList = new Map(); // 👑 רשימת קבוצות אחרונה לצ'אט ניהול (לבחירה מספרית)
const tcPending = new Map(); // 🔍 התחברות Truecaller ממתינה ל-OTP (remoteJid -> {phone, loginJson, at})
const mePending = new Map(); // 📇 חיבור Me ממתין לקוד (remoteJid -> {phone, at})
const dmLockAt = new Map(); // 🔒 מתי נשלחה תשובת "רק בקבוצות" לאחרונה לכל צ'אט פרטי (נגד ספאם)
const reactAt = new Map(); // 😀 מתי הגיב באימוג'י לאחרונה לכל קבוצה (שלא יציף)
const lidPnMap = new Map(); // 👀 LID -> ספרות טלפון בינלאומיות (מיפוי מצטבר)
const LIDMAP_PATH = new URL('./lid-map.json', import.meta.url);
const TEST_GROUP_JID = '120363412673174664@g.us'; // 🧪 ניסוי מולטי בוט — פקודות נעולות רק לכאן
const BOT_DIGITS = '972503651436'; // 📱 המספר של הבוט (מולטי בוט)
const OWNER_DIGITS = '972555655217'; // 👑 המספר של הבעלים
try {
  const _lm = JSON.parse(fs.readFileSync(LIDMAP_PATH, 'utf-8'));
  for (const [k, v] of Object.entries(_lm || {})) if (/^\d+$/.test(k) && /^\d{10,15}$/.test(String(v))) lidPnMap.set(k, String(v));
} catch {}
lidPnMap.set('173225392734366', '972555655217'); // ✅ מיפוי ידוע (נשמר גם לקובץ)
let _lidSaveT = null;
function lidMapSave() {
  try {
    clearTimeout(_lidSaveT);
    _lidSaveT = setTimeout(() => {
      try { fs.writeFileSync(LIDMAP_PATH, JSON.stringify(Object.fromEntries(lidPnMap))); } catch {}
    }, 5000);
  } catch {}
}
function lidMapSet(lid, digits) {
  const l = String(lid || '').split('@')[0], d = svDigits(digits);
  if (/^\d+$/.test(l) && d) { lidPnMap.set(l, d); lidMapSave(); }
}
const svNameCache = new Map(); // 👀 jid -> שם אחרון שנראה (pushname/contacts)
const presenceSeen = new Map(); // 🕵️ user -> {at, lastSeen} — נראות לאחרונה (לפי פרטיות הצד השני)
/** ספרות בינלאומיות ממספר/JID (972...), או null. */
function svDigits(raw) {
  let d = String(raw || '').split('@')[0].replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972') && d.length >= 11) return d;
  if (/^0\d{8,9}$/.test(d)) return '972' + d.slice(1);
  if (d.length >= 10) return d;
  return null;
}
/** פתרון JID צופה -> {digits, lid}. */
function svResolve(jid) {
  const u = String(jid || '').split('@')[0];
  const dom = String(jid || '').split('@')[1] || '';
  if (dom === 'lid') {
    const pn = lidPnMap.get(u) || lidPnMap.get(String(jid)) || null;
    return { digits: pn ? svDigits(pn) : null, lid: u };
  }
  return { digits: svDigits(u), lid: null };
}
/** שליפת כל ה-JIDים מאובייקט (סריקה עמוקה, בלי תלות במבנה). */
function scanJids(obj, out = new Set()) {
  try {
    if (typeof obj === 'string') {
      if (/^\d+@(lid|s\.whatsapp\.net)$/.test(obj)) out.add(obj);
    } else if (Array.isArray(obj)) {
      for (const x of obj) scanJids(x, out);
    } else if (obj && typeof obj === 'object') {
      for (const x of Object.values(obj)) scanJids(x, out);
    }
  } catch {}
  return out;
}
/** המספר של בעל הצ'אט הפרטי (PN ישיר או מיפוי LID מצטבר), או null. */
function resolveOwnPhone(jid) {
  const u = String(jid || '').split('@')[0];
  const dom = String(jid || '').split('@')[1] || '';
  if (dom === 'lid') return lidPnMap.get(u) || null;
  return svDigits(u);
}
const SV_VIEWS = new URL('./status-views.json', import.meta.url);
const MY_CONTACTS = new URL('./my-contacts.json', import.meta.url);
function svLoadViews() { try { return JSON.parse(fs.readFileSync(SV_VIEWS, 'utf-8')); } catch { return { items: {} }; } }
function svSaveViews(db) {
  try {
    const cut = Date.now() - 48 * 3600 * 1000;
    for (const [k, v] of Object.entries(db.items || {})) {
      if (!v || (v.firstAt || 0) < cut) delete db.items[k];
    }
    fs.writeFileSync(SV_VIEWS, JSON.stringify(db));
  } catch {}
}
function svRecordView(statusId, viewerJid) {
  try {
    const db = svLoadViews();
    db.items = db.items || {};
    const it = db.items[statusId] || (db.items[statusId] = { firstAt: Date.now(), viewers: {} });
    if (!it.viewers[viewerJid]) {
      it.viewers[viewerJid] = { at: Date.now() };
      svSaveViews(db);
      console.log(`👀 צפייה בסטטוס: ${viewerJid}`);
    }
  } catch {}
}
function myContactsLoad() { try { return JSON.parse(fs.readFileSync(MY_CONTACTS, 'utf-8')); } catch { return { nums: {} }; } }
function myContactsSave(db) { try { fs.writeFileSync(MY_CONTACTS, JSON.stringify(db)); } catch {} }
/** installationId של Truecaller אם חובר (שיתוף בין בלוק הזיהוי לסריקה). */
function tcSessionId() { try { return JSON.parse(fs.readFileSync(new URL('./tc-session.json', import.meta.url), 'utf-8')).installationId || ''; } catch { return ''; } }
// --- 📇 Me bridge (Python meapi) ---
let _meBridgePath = null;
/** קריאה לגשר Me — מחזיר אובייקט JSON או null. session = ספרות הטלפון של בעל החיבור. */
async function meCall(cmd, args = [], timeout = 35000, session = '') {
  try {
    if (!_meBridgePath) {
      const { fileURLToPath } = await import('node:url');
      _meBridgePath = fileURLToPath(new URL('./me-bridge.py', import.meta.url));
    }
    const { execFile } = await import('node:child_process');
    const argv = [_meBridgePath, cmd, ...args];
    if (session) argv.push('--session', session);
    const out = await new Promise((resolve) => {
      execFile('python3', argv, { timeout, maxBuffer: 4 * 1024 * 1024 }, (e, stdout) => {
        if (e && !stdout) return resolve(null);
        resolve(String(stdout || '').trim());
      });
    });
    if (!out) return null;
    return JSON.parse(out.split('\n').filter(Boolean).pop());
  } catch { return null; }
}
/** סשן Me של שולח ההודעה (לפי מספר), או '' — כל אחד מתחבר עם המספר שלו. */
function meSessionFor(jid) {
  try {
    const d = resolveOwnPhone(jid);
    if (!d) return '';
    fs.accessSync(new URL(`./me-sessions/${d}.json`, import.meta.url));
    return d;
  } catch { return ''; }
}
const CC_L2D = { IL: '972', US: '1', CA: '1', GB: '44', FR: '33', DE: '49', IT: '39', ES: '34', NL: '31', BE: '32', CH: '41', AT: '43', GR: '30', PT: '351', IE: '353', SE: '46', NO: '47', DK: '45', FI: '358', PL: '48', UA: '380', RU: '7', TR: '90', IN: '91', BR: '55', AU: '61' };
/** איש קשר מ-Me -> ספרות בינלאומיות או null. */
function meE164(c) {
  const nat = String(c?.phone_number || '').replace(/\D/g, '');
  if (!nat) return null;
  const dial = CC_L2D[String(c?.country_code || '').toUpperCase()];
  if (dial) return nat.startsWith(dial) ? nat : dial + nat;
  if (nat.length === 9) return '972' + nat; // ברירת מחדל ישראלית
  return nat.length >= 10 ? nat : null;
}
/** פענוח VCF -> {digits: name}. */
function parseVcf(text) {
  const out = {};
  const flat = String(text || '').replace(/\r/g, '').replace(/\n[ \t]/g, '');
  for (const card of flat.split(/BEGIN:VCARD/i).slice(1)) {
    const fn = ((card.match(/\nFN[^:]*:(.*)/) || [])[1] || '').trim().slice(0, 60);
    for (const m of card.matchAll(/\nTEL[^:]*:(.*)/g)) {
      const d = svDigits((m[1] || '').trim());
      if (d && !out[d]) out[d] = fn || d;
    }
  }
  return out;
}
/** שמירת מפתח ל-.env (לקישור/שם/קידומת) — בלי לאבד שורות. */
function persistEnv(key, value) {
  try {
    const p = new URL('./.env', import.meta.url);
    let env = '';
    try { env = fs.readFileSync(p, 'utf-8'); } catch {}
    const line = `${key}=${value}`;
    if (new RegExp(`^${key}=.*$`, 'm').test(env)) env = env.replace(new RegExp(`^${key}=.*$`, 'm'), line);
    else env += (env.endsWith('\n') ? '' : '\n') + line + '\n';
    fs.writeFileSync(p, env);
  } catch {}
}
/* ---------- 🧩 פיצ'רים לקבוצה (וי בפאנל על כל פונקציה) ---------- */
const FEATURES = [
  ['chat', '💬 צ׳אט AI'],
  ['image', '🎨 תמונות'],
  ['song', '🎵 שירים'],
  ['video', '🎬 חיפוש סרטונים'],
  ['sticker', '⭐ סטיקרים'],
  ['tts', '🔊 הקראה ותמלול'],
  ['info', '🌤️ מידע (מזג/חדשות/מטבע)'],
  ['qr', '🔳 ברקוד'],
  ['games', '🎮 משחקים'],
  ['fun', '😂 כיף'],
  ['bg', '🖼️ רקעים'],
  ['shop', '🛒 קניות'],
  ['site', '🌐 אתרים'],
  ['tools', '⏰ כלי קבוצה'],
];
const WORD2FEAT = {
  'שאל': 'chat', 'ai': 'chat', 'gpt': 'chat', "צ'אט": 'chat', 'בוט': 'chat',
  'תמונה': 'image', 'תמונות': 'image', 'צייר': 'image', 'ציור': 'image', 'תצייר': 'image',
  'פוסט': 'image', 'מודעה': 'image', 'פרסומת': 'image', 'באנר': 'image', 'פלייר': 'image',
  'שיר': 'song', 'מוזיקה': 'song', 'נגן': 'song', 'song': 'song', 'music': 'song',
  'תמונה': 'image', 'תמונות': 'image', 'צייר': 'image', 'ציור': 'image', 'תצייר': 'image', 'image': 'image', 'draw': 'image',
  'וידאו': 'video', 'סרטון': 'video', 'סרטונים': 'video', 'video': 'video', 'יוטיוב': 'video',
  'סטיקר': 'sticker', 'מדבקה': 'sticker', 'sticker': 'sticker', 'אוטו-סטיקר': 'sticker',
  'דבר': 'tts', 'קול': 'tts', 'קריין': 'tts', 'תקריא': 'tts', 'say': 'tts', 'speak': 'tts', 'תמלל': 'tts',
  'מזג': 'info', 'חדשות': 'info', 'news': 'info', 'דולר': 'info', 'ביטקוין': 'info', 'שבת': 'info', 'מניה': 'info', 'stock': 'info', 'מדד': 'info', 'מדדים': 'info', 'קצר': 'info', 'רעידת-אדמה': 'info', 'זיהום-אוויר': 'info', 'תרגם': 'info', 'תרגום': 'info',
  'qr': 'qr', 'ברקוד': 'qr', 'קיואר': 'qr',
  'טריוויה': 'games', 'איקס-עיגול': 'games', 'xo': 'games', 'מילים-מעורבבות': 'games', 'scramble': 'games', 'אמת-או-חובה': 'games', 'truth': 'games', 'מלחמת-משפטים': 'games', 'battle': 'games', 'משפט': 'games', 'טופ': 'games', 'נקודות': 'games',
  'בדיחה': 'fun', 'חידה': 'fun', 'עובדה': 'fun', 'מוטיבציה': 'fun', 'סיפור': 'fun', 'מתכון': 'fun', 'אימון': 'fun', 'טיפ': 'fun', 'ברכה': 'fun', 'אימייל': 'fun', 'מייל': 'fun', 'שכתוב': 'fun', 'נסח': 'fun', 'קוד': 'fun', 'תכנת': 'fun', 'רעיון': 'fun', 'חלום': 'fun', 'פירוש-חלום': 'fun', 'מזל': 'fun', 'הורוסקופ': 'fun', 'מילון': 'fun', 'פירוש': 'fun', 'מדינה': 'fun', 'קוביה': 'fun', 'מטבע': 'fun', 'בחר': 'fun', 'הגרלה': 'fun', 'סיסמה': 'fun', 'מספר': 'fun', 'צבע': 'fun', 'תאריך': 'fun', 'שעה': 'fun', 'עד': 'fun', 'כלב': 'fun', 'חתול': 'fun', 'שועל': 'fun',
  'רקע': 'bg', 'רקעים': 'bg', 'רשימת-רקעים': 'bg', 'טפט': 'bg', 'טפטים': 'bg', 'wallpaper': 'bg',
  'תמונת-פרופיל': 'fun', 'תמונה-פרופיל': 'fun', 'פרופיל': 'fun', 'pp': 'fun', 'avatar': 'fun',
  'קנה': 'shop', 'קניות': 'shop', 'קנייה': 'shop', 'קני': 'shop', 'aliexpress': 'shop', 'ali': 'shop',
  'אתר': 'site', 'אתרים': 'site', 'website': 'site', 'site': 'site',
  'תזכורת': 'tools', 'תזכורות': 'tools', 'מחק-תזכורת': 'tools', 'סקר': 'tools', 'סקר-תוצאות': 'tools', 'סקר-סגור': 'tools', 'תורנות': 'tools', 'יומולדת': 'tools', 'אירוע': 'tools', 'אירועים': 'tools', 'בוקר': 'tools', 'בריף': 'tools', 'מעקב': 'tools', 'הסר-מעקב': 'tools', 'סכם-צאט': 'tools', 'יומן': 'tools', 'שערים-יומי': 'tools', 'חתוך': 'tools', 'פעילות': 'tools',
};
// פקודות מטא/ניהול — תמיד פעילות (לא חלק מהפיצ'רים)
const META_ALWAYS = new Set(['עזרה', 'תפריט', 'help', 'menu', 'התחל', 'start', 'מדריך', 'מדריך-מלא', 'guide', 'מצב', 'status', 'id', 'מזהה', 'מנהלים', 'מנהלים-רשימה', 'רשימת-מנהלים', 'אדמין', 'ניהול', 'admin', 'הגדרות', 'הגדרות-ניהול', 'settings', 'מנוע', 'קישורים', 'אנטי-קישורים', 'antilink', 'קישורים-מותרים', 'לינקים-מותרים', 'linkallow', 'קללות', 'אנטי-קללות', 'סינון-קללות', 'מילה-אסורה', 'מחק-מילה', 'מילים-אסורות', 'רשימה-אסורה', 'ספאם-קשוח', 'אנטי-ספאם', 'ברוכים', 'ברוכים-הבאים', 'welcome', 'חוקים', 'rules', 'תייג', 'כולם', 'tagall', 'אזהרה', 'אזהרות', 'נקה-אזהרות', 'נקה-אזהרה', 'שחרר', 'מושתקים', 'קיק', 'kick', 'קדם', 'promote', 'הורד-ניהול', 'הסר-ניהול', 'demote', 'נעל', 'lock', 'פתח', 'unlock', 'שם', 'תיאור', 'תיאור-קבוצה', 'נקה', 'מחק-תשובה', 'מחק', 'מחק-הודעה', 'delete', 'סטטוס-קבוצה', 'השתק', 'השתק-בוט', 'כבה-בוט', 'כבה', 'הדלק-בוט', 'הדלק', 'mute-bot', 'mute', 'פתח-בוט', 'בוט-פתח', 'unmute-bot', 'unmute', 'פרו', 'pro', 'פרו-בטל', 'פרו-ביטול', 'pro-cancel', 'פרו-מצב', 'מצב-פרו', 'פרו-סטטוס', 'סטטוס-פרו', 'pro-status', 'מנויים', 'מנוי-רשימה', 'pro-list', 'הורד', 'הורד-וידאו', 'download-video', 'קבוצות', 'רשימת-קבוצות', 'groups', 'לקבוצה', 'לקבוצת', 'לקבוץ', 'togroup', 'מערכת', 'סטטוס-מערכת', 'system', 'לוג', 'יומן-מערכת', 'log', 'logs', 'גיבוי', 'גבה', 'backup', 'שם-בוט', 'botname', 'קידומת', 'פרפיקס', 'prefix', 'הפעל-מחדש', 'ריסטארט', 'restart', 'הצטרף', 'הצטרפות', 'join', 'אשר', 'אשר-קבוצה', 'approve', 'בטל-אישור', 'בטל-אישור-קבוצה', 'unapprove', 'עזוב', 'עזוב-קבוצה', 'leave', 'זהה', 'זיהוי', 'מי-זה', 'truecaller', 'tc', 'זהה-התחבר', 'זיהוי-התחבר', 'tc-login', 'זהה-קוד', 'זיהוי-קוד', 'tc-code', 'זהה-נתק', 'זיהוי-נתק', 'tc-logout', 'מי-צפה', 'מי-צפו', 'צפו', 'צפיות', 'סטטוס-צפיות', 'מי-ראה', 'status-views', 'נקה-צפיות', 'אפס-צפיות', 'נקה-צפיה', 'אנשי-קשר', 'רשימת-קשר', 'my-contacts', 'מי-שמר-אותי', 'מי-שמר', 'בדיקת-שמירה', 'בדוק-שמירה', 'בדוק-שמר', 'סריקה-עמוקה', 'סריקה-מעמיקה', 'deep-scan', 'אמור', 'אמור-בניסוי', 'כבוט', 'בתור-הבוט', 'as-bot', 'ערוץ-עוקבים', 'ערוץ', 'עוקבים', 'עוקבי-ערוץ', 'channel', 'me-התחבר', 'me-חבר', 'me-login', 'me-קוד', 'me-code', 'me-נתק', 'me-logout', 'me-מצב', 'me-סטטוס', 'me-status', 'me-זהה', 'me-זיהוי', 'me-search']);
const featLabel = (f) => (FEATURES.find((x) => x[0] === f) || [])[1] || f;
function isFeatureOn(gd, feat) {
  return ((gd && gd.features) || {})[feat] !== false;
}
const enCache = new Map(); // תרגום שאילתות לאנגלית לחיפוש מאגר נוסף (query -> {en, at})
async function enQuery(he) {
  const k = String(he || '').trim().slice(0, 60);
  if (!k) return '';
  if (/^[a-z0-9\s\-']+$/i.test(k)) return k.toLowerCase();
  const hit = enCache.get(k);
  if (hit && Date.now() - hit.at < 3600000) return hit.en;
  try {
    const en = (await translateText(k, 'en') || '').trim().slice(0, 80) || k;
    if (enCache.size > 300) enCache.clear();
    enCache.set(k, { en, at: Date.now() });
    return en;
  } catch {
    return k;
  }
}
const lidPhoneCache = new Map(); // מיפוי LID פרטי -> טלפון (נלמד מרשימות קבוצות)
// 💎 מטמון מנויים (טלפונים + LID) — נרענן כל 5 דקות, כדי לא לקרוא לגיליון בכל הודעה
const proPhones = new Set();
const proLids = new Set();
let proRefreshAt = 0, proRefreshRun = false;
async function refreshProLists(sock, force = false) {
  if (!subsConfigured() || proRefreshRun) return;
  if (proPhones.size === 0) {
    // זרע ראשוני ממטמון שמור (למקרה שהגשר נפל)
    try {
      const c = getProCache();
      for (const p of c.phones) proPhones.add(p);
      for (const l of c.lids) proLids.add(l);
      for (const [k, v] of Object.entries(c.lidmap || {})) {
        if (!lidPhoneCache.has(k) && !lidPhoneCache.has(`${k}@lid`)) lidPhoneCache.set(`${k}@lid`, v);
      }
    } catch {}
  }
  if (!force && Date.now() - proRefreshAt < 300000) return;
  proRefreshRun = true;
  try {
    const all = await readSubs();
    const now = Date.now();
    const phones = new Set();
    for (const s of all) {
      if (s.status === 'active' && (!s.expiry_ms || s.expiry_ms > now) && s.phone) {
        phones.add(s.phone);
      }
    }
    proPhones.clear();
    for (const p of phones) proPhones.add(p);
    proLids.clear();
    const lidmap = {};
    for (const g of (config.ALLOWED_GROUPS || [])) {
      let meta = null;
      try { meta = await sock.groupMetadata(g); } catch { continue; }
      for (const p of (meta?.participants || [])) {
        const pn = p.phoneNumber || (p.id?.endsWith('@s.whatsapp.net') ? p.id : null);
        const ph = pn ? normPhone(String(pn).split('@')[0]) : null;
        if (ph && phones.has(ph)) {
          const bareId = (p.id || '').split('@')[0];
          proLids.add(bareId);
          lidmap[bareId] = ph;
          if (p.lid) {
            const bareLid = String(p.lid).split('@')[0];
            proLids.add(bareLid);
            lidmap[bareLid] = ph;
          }
        }
      }
    }
    try { setProCache([...phones], [...proLids], lidmap); } catch {}
    proRefreshAt = Date.now();
    try { await bgList(); } catch {} // חימום מטמון רקעים
  } catch (e) { console.error('pro refresh fail:', (e?.message || '').slice(0, 120)); }
  proRefreshRun = false;
}
/** האם JID/טלפון מנוי (לפי מטמון). */
function isProCached(who) {
  try {
    const bare = String(who || '').split('@')[0];
    if (!bare) return false;
    if (proLids.has(bare)) return true;
    const ph = normPhone(bare);
    return !!(ph && proPhones.has(ph));
  } catch { return false; }
}
/** מכסת חינם יומית בקבוצות — מבוטלת: הבוט חינמי לגמרי, תמיד מותר. */
async function checkFreeQuota(sock, chatJid, sender, fromMe, isGroup) {
  return true;
}
function trackBotSent(res) {
  try {
    const id = res?.key?.id;
    if (id) {
      botSentIds.add(id);
      if (botSentIds.size > 500) botSentIds.delete(botSentIds.values().next().value);
    }
  } catch {}
  return res;
}
function pushHistory(jid, role, content) {
  const arr = chatHistory.get(jid) || [];
  arr.push({ role, content: content.slice(0, 1000) });
  while (arr.length > 10) arr.shift();
  chatHistory.set(jid, arr);
}

function getTextMessage(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ''
  ).trim();
}

function getQuotedMessage(msg) {
  return (
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null
  );
}

function isMentioningBot(msg, botJid) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = ctx?.mentionedJid || [];
  if (botJid && mentioned.includes(botJid)) return true;
  return false;
}

/** האם ההודעה היא תשובה (reply/ציטוט) להודעה שהבוט שלח — להמשך שיחה בלי ! */
function isReplyToBot(msg) {
  try {
    const m = msg.message || {};
    const ctx =
      m.extendedTextMessage?.contextInfo ||
      m.imageMessage?.contextInfo ||
      m.videoMessage?.contextInfo ||
      m.audioMessage?.contextInfo ||
      m.pttMessage?.contextInfo ||
      m.documentMessage?.contextInfo ||
      m.stickerMessage?.contextInfo ||
      null;
    const sid = ctx?.stanzaId;
    return !!(sid && botSentIds.has(sid));
  } catch {
    return false;
  }
}

async function sendTyping(sock, jid, ms = 800) {
  try {
    await sock.sendPresenceUpdate('composing', jid);
    await new Promise((r) => setTimeout(r, ms));
  } catch { /* ignore */ }
}

// מהלך אחד באיקס-עיגול + הודעה לקבוצה. מחזיר true אם המהלך בוצע.
async function xoMoveFlow(sock, jid, gd, sender, n) {
  const res = xoApply(gd, sender, n);
  if (!res.ok) {
    await sock.sendMessage(jid, { text: `⚠️ ${res.error}` });
    return false;
  }
  saveStore();
  const w = gd.xo.winner;
  const board = renderXO(gd.xo.board);
  const nmOf = (u) => gd.names[u] || (u === gd.xo?.p1 ? (gd.xo?.name1 || 'המתחיל') : (gd.xo?.name2 || 'היריב'));
  if (w === 'draw') {
    gd.xo = null; saveStore();
    await sock.sendMessage(jid, { text: `❌⭕ *תיקו!*\n\n${board}\n\nלמשחק חדש: ${config.BOT_PREFIX}איקס-עיגול` });
  } else if (w) {
    const nm = nmOf(w);
    addPoints(jid, w, 10);
    gd.xo = null; saveStore();
    await sock.sendMessage(jid, { text: `🏆 *${nm} ניצח/ה!* +10 נקודות 🎉\n\n${board}\n\nלמשחק חדש: ${config.BOT_PREFIX}איקס-עיגול` });
  } else {
    const turnName = nmOf(gd.xo.turn);
    await sock.sendMessage(jid, { text: `${board}\n\nתורו של *${turnName}* — הקלידו מספר 1-9` });
  }
  return true;
}

// עוטף שאלה בסגנון האישיות של הקבוצה (אם הוגדרה)
function styledPrompt(jid, q) {
  try {
    const p = gdata(jid).personality;
    return p ? `[חובה לענות בסגנון הדיבור הבא: ${p}]\n${q}` : q;
  } catch {
    return q;
  }
}

// --- שורת פרו בראש כל הודעת בוט (מוגדרת ב-PRO_PROMO) ---
function proHeader() {
  const promo = (config.PRO_PROMO || '').trim();
  if (!promo) return '';
  return `${promo}\n\n`;
}

// --- שורת קבוצה ראשית בסוף כל הודעת בוט (מוגדרת ב-MAIN_GROUP_URL) ---
function donateFooter() {
  const url = (config.MAIN_GROUP_URL || '').trim();
  if (!url) return '';
  return `\n\n━━━━━━━━━━━━━━\n👥 *הצטרפו לקבוצה הראשית של הבוט:*\n${url}`;
}

// --- חיפוש אינטרנט אוטומטי בשאלה (מחליף את הפקודה הנפרדת שהוסרה) ---
const QUESTION_START = /^(מי|מה|מתי|איפה|למה|איך|כמה|האם|איזה|איזו|היכן|תגיד|ספר|תן|תסביר|הסבר|הבא|חפש|חשוב על)\s/;
const NEWSY_WORDS = ['חדשות', 'היום', 'אתמול', 'מחר', '2025', '2026', 'מזג', 'תוצאות', 'ליגה',
  'נבחרת', 'בחירות', 'מחיר', 'עדכון', 'מצב', 'מעודכן'];
function needsWebSearch(q) {
  const s = (q || '').trim();
  if (s.length < 4 || s.length > 300) return false;
  if (s.includes('?')) return true;
  if (QUESTION_START.test(s)) return true;
  return NEWSY_WORDS.some((w) => s.includes(w));
}
async function enrichWithSearch(q) {
  if (!needsWebSearch(q)) return q;
  try {
    const s = await searchWeb(q);
    if (s && String(s).trim().length > 60) {
      return `תוצאות חיפוש מהאינטרנט:\n${String(s).trim().slice(0, 1500)}\n\nשאלה: ${q}`;
    }
  } catch { /* ממשיכים בלי חיפוש */ }
  return q;
}

// --- כיתוב מם: "עליון / תחתון" → {top, bottom} (בלי / = תחתון) ---
function parseMemeCaption(s) {
  const t = String(s || '').trim();
  const i = t.indexOf('/');
  if (i < 0) return { top: '', bottom: t };
  return { top: t.slice(0, i).trim(), bottom: t.slice(i + 1).trim() };
}

// הורדת מדיה עם ניסיונות חוזרים + לוג מפורט (אבחון כשלים כמו fetch failed)
async function downloadMediaRetry(target, label, tries = 3) {
  const mm = (target && target.message) || {};
  const kind = mm.imageMessage ? `image/${mm.imageMessage.mimetype || ''}`
    : mm.videoMessage ? `video/${mm.videoMessage.mimetype || ''}`
    : mm.stickerMessage ? 'sticker' : 'unknown';
  let lastErr = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const buf = await downloadMediaMessage(target, 'buffer', {});
      console.log(`📥 מדיה (${label}, ${kind}): ${(buf && buf.length) || 0} bytes בניסיון ${i}`);
      if (buf && buf.length > 100) return buf;
      lastErr = new Error(`קובץ ריק (${(buf && buf.length) || 0} bytes)`);
    } catch (e) {
      lastErr = e;
      console.warn(`📥 ניסיון ${i} (${label}, ${kind}) נכשל:`, String((e && e.message) || e).slice(0, 160));
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr || new Error('DOWNLOAD_FAIL');
}

async function handleSticker(sock, remoteJid, msg, quoted, aiPrompt = '') {  // מקור המדיה: ההודעה עצמה (תמונה/וידאו) או הודעה מצוטטת
  let target = null;
  let isVideo = false;
  if (msg.message?.imageMessage) {
    target = msg;
  } else if (msg.message?.videoMessage) {
    target = msg;
    isVideo = true;
  } else if (quoted?.imageMessage || quoted?.stickerMessage) {
    // בונים הודעה מזויפת להורדה
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    target = {
      key: { remoteJid, id: ctx?.stanzaId, fromMe: false, participant: ctx?.participant },
      message: quoted,
    };
  } else if (quoted?.videoMessage) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    target = {
      key: { remoteJid, id: ctx?.stanzaId, fromMe: false, participant: ctx?.participant },
      message: quoted,
    };
    isVideo = true;
  }
  if (!target) {
    // ⭐ יצירה מאפס: !סטיקר <תיאור> [| <עליון> / <תחתון>] → תמונת AI → מדבקה (חינם)
    if ((aiPrompt || '').trim()) {
      const parts = aiPrompt.split('|').map((s) => s.trim());
      const p = (parts[0] || '').slice(0, 200);
      const capStr = parts.slice(1).join('|').trim().slice(0, 120);
      if (!p) {
        await sock.sendMessage(remoteJid, { text: `⭐ *סטיקר עם כיתוב:*\nכתוב תיאור לפני ה-|.\nדוגמה: ${config.BOT_PREFIX}סטיקר חתול | יום יבוא / ותהיה מנגב כמוני` });
        return;
      }
      const cap = parseMemeCaption(capStr);
      const _mkSt = [
        `⭐🎨 מכין לך סטיקר: "${p.slice(0, 100)}"${capStr ? ` עם כיתוב "${capStr.slice(0, 60)}"` : ''}...\n✨🔥 עוד מעט מדביקים!`,
        `⭐💫 יאללה סטיקר: "${p.slice(0, 100)}"${capStr ? ` + "${capStr.slice(0, 60)}"` : ''}...\n😍⏳ כמעט מוכן!`,
      ];
      await sock.sendMessage(remoteJid, { text: _mkSt[Math.floor(Math.random() * _mkSt.length)] });
      await sendTyping(sock, remoteJid, 1500);
      // 🤖 ניסיון קודם דרך Instinct (כמו תמונות) — עם גיבוי מקומי
      try {
        if (instinctCold()) throw new Error('INSTINCT_COLD');
        const relayBuf = await requestInstinct(sock, `סטיקר ${p}`, remoteJid);
        if (relayBuf && relayBuf.length > 5000) {
          const base = await removeStickerBackground(relayBuf);
          const sticker = (cap.top || cap.bottom) ? await memeSticker(base, cap.top, cap.bottom) : await toStickerBuffer(base);
          await sock.sendMessage(remoteJid, { sticker });
          return;
        }
      } catch (e) {
        if (!/INSTINCT_COLD/.test(e?.message || '')) instinctBumpFail();
        console.warn('instinct sticker skip:', (e && e.message || '').slice(0, 100));
      }
      try {
        const { buffer, provider } = await generateStickerImage(p);
        console.log(`sticker by ${provider}: ${p.slice(0, 60)}`);
        // מסירים את הרקע (כרומה) → מדבקה עם רקע שקוף כמו סטיקר אמיתי בוואטסאפ
        const base = await removeStickerBackground(buffer);
        const sticker = (cap.top || cap.bottom) ? await memeSticker(base, cap.top, cap.bottom) : await toStickerBuffer(base);
        await sock.sendMessage(remoteJid, { sticker });
        try { const g = await import('./gallery-log.js'); g.logCreationWithFile({ type: 'sticker', prompt: String(p).slice(0, 300), buffer, ext: 'png', source: 'whatsapp' }); } catch {}
      } catch (e) {
        console.error('ai-sticker fail:', e);
        await sock.sendMessage(remoteJid, { text: `😢 יצירת הסטיקר נכשלה (${(e.message || '').slice(0, 100)}).\nנסה תיאור אחר או שלח תמונה.` });
      }
      return;
    }
    await sock.sendMessage(remoteJid, {
      text:
        `⭐ *יצירת סטיקר — איך משתמשים?*\n\n` +
        `1️⃣ שלח תמונה/סרטון קצר וכתוב בכיתוב: *${config.BOT_PREFIX}סטיקר*\n` +
        `2️⃣ הגב (Reply) לתמונה/סרטון וכתוב: *${config.BOT_PREFIX}סטיקר*\n` +
        `3️⃣ כתוב *${config.BOT_PREFIX}סטיקר <תיאור>* — יצירה מאפס עם מודל חינמי + רקע שקוף! ✨\n` +
        `4️⃣ עם כיתוב (סגנון מם): *${config.BOT_PREFIX}סטיקר חתול | יום יבוא / ותהיה מנגב כמוני*\n` +
        `(אפשר גם בתגובה לתמונה: ${config.BOT_PREFIX}סטיקר | עליון / תחתון)\n\n` +
        `תמונה → מדבקה 512x512. סרטון (עד 8 שניות) → מדבקה מונפשת! 🎞️`,
    });
    return;
  }
  // 🖼️ כיתוב על מדיה קיימת: !סטיקר | עליון / תחתון (בתגובה או בכיתוב)
  {
    const parts = String(aiPrompt || '').split('|').map((s) => s.trim());
    const capStr = parts.length > 1 ? parts.slice(1).join('|').trim().slice(0, 120) : '';
    if (!isVideo && parts[0] === '' && capStr) {
      const cap = parseMemeCaption(capStr);
      if (cap.top || cap.bottom) {
        await sendTyping(sock, remoteJid, 800);
        try {
          const buf = await downloadMediaRetry(target, 'caption');
          const sticker = await memeSticker(buf, cap.top, cap.bottom);
          await sock.sendMessage(remoteJid, { sticker });
        } catch (e) {
          console.error('caption-sticker fail:', (e && e.message) || e);
          await sock.sendMessage(remoteJid, { text: `😢 הוספת הכיתוב נכשלה (${((e && e.message) || '').slice(0, 100)}).` });
        }
        return;
      }
    }
  }
  await sendTyping(sock, remoteJid, 500);
  try {
    const buf = await downloadMediaRetry(target, isVideo ? 'video' : 'image');
    const sticker = isVideo ? await videoToStickerBuffer(buf) : await toStickerBuffer(buf);
    await sock.sendMessage(remoteJid, { sticker });
  } catch (e) {
    console.error('sticker fail:', (e && e.message) || e);
    await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי להפוך לסטיקר. נסה תמונה (JPG/PNG) או סרטון קצר.' });
  }
}

let activeSock = null;
let restartTimer = null;
let pairRetryTimer = null; // ⏳ לולאת צימוד אוטומטית אחרי loggedOut
let pairRetryDelay = 3 * 60 * 1000; // מתחיל מ-3 דקות, גדל עד 30
let groupsListed = false;
let schedulerOn = false;

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${n.getMonth() + 1}-${n.getDate()}`;
}

let lastYtUpdate = '';
async function maybeUpdateYtDlp() {
  // עדכון שבועי (ימי ראשון) כדי שתמיד יעבוד מול יוטיוב
  const n = new Date();
  const week = `${n.getFullYear()}-W${Math.ceil(n.getDate() / 7)}-${n.getMonth() + 1}`;
  if (n.getDay() !== 0 || lastYtUpdate === week) return;
  lastYtUpdate = week;
  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)('/home/cohen/.local/bin/yt-dlp', ['--update-to', 'stable'], { timeout: 120000 });
    console.log('yt-dlp עודכן ✅');
  } catch (e) {
    console.warn('yt-dlp update:', e.message?.slice(0, 100));
  }
}

async function schedulerTick() {
  try {
    const sock = activeSock;
    if (!sock) return;
    maybeUpdateYtDlp().catch(() => {});
    refreshProLists(sock).catch(() => {}); // 💎 רענון מטמון מנויים (כל 5 דקות בפועל)
    if (!globalThis.__instinctResolved) {
      globalThis.__instinctResolved = true;
      resolveInstinct(sock).catch(() => {});
    }
    // 👥 סריקת כל הקבוצות שהבוט חבר בהן (לפאנל — פעם בשעה)
    if (Date.now() - lastGroupScan > 3600000) {
      lastGroupScan = Date.now();
      (async () => {
        try {
          const all = await sock.groupFetchAllParticipating();
          const map = {};
          for (const [jid, meta] of Object.entries(all || {})) {
            map[jid] = { subject: String(meta?.subject || '').slice(0, 80), at: Date.now() };
          }
          mergeKnownGroups(map);
          console.log(`👥 group scan: ${Object.keys(map).length} קבוצות`);
        } catch (e) {
          console.warn('group scan fail:', (e?.message || '').slice(0, 100));
        }
      })().catch(() => {});
    }
    // 📛 השלמת שמות לקבוצות היסטוריות (5 בכל טיק — לא מכביד)
    (async () => {
      try {
        if (!subjQueue.length) {
          const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
          const known = s.knownGroups || {};
          subjQueue = Object.keys(s.groups || {}).filter((j) =>
            j.endsWith('@g.us') && !subjDone.has(j) &&
            !(s.groups[j] || {}).subject && !(known[j] || {}).subject);
        }
        for (let k = 0; k < 5 && subjQueue.length; k++) {
          const jid = subjQueue.shift();
          subjDone.add(jid);
          try {
            const mm = await sock.groupMetadata(jid);
            if (mm?.subject) mergeKnownGroups({ [jid]: { subject: String(mm.subject).slice(0, 80), at: Date.now() } });
          } catch {}
        }
      } catch {}
    })().catch(() => {});
    // 💎 תפוגות מנוי פרו — בדיקה כל דקה, הודעה בקבוצת הרישום
    // (backoff: אחרי 3 כישלונות רצופים מדלגים ~5 דקות — הגשר מקרטע לפעמים)
    try {
      if (subsConfigured()) {
        if (proTickFails >= 3) {
          proTickFails = 0;
          proTickSkipUntil = Date.now() + 5 * 60 * 1000;
        }
        if (Date.now() < proTickSkipUntil) {
          // מדלגים בשקט
        } else {
          const due = await popExpiredSubs(Date.now());
          proTickFails = 0;
          for (const s of due) {
            const target = s.chat_jid || config.ALLOWED_GROUPS[0];
            if (!target) continue;
            await sock.sendMessage(target, {
              text: `💎 *מנוי הפרו הסתיים* ⛔\n📱 ${s.phone}\nלרישום מחדש פנו למנהלים.`,
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      proTickFails++;
      console.warn('pro-expiry tick:', (e && e.message || '').slice(0, 120));
    }
    // 🖥️ פקודות מפאנל הניהול (admin-ops.json) — מיושמות על הסטור החי, בלי דריסה
    try {
      const opsPath = new URL('./admin-ops.json', import.meta.url);
      let ops = null;
      try { ops = JSON.parse(fs.readFileSync(opsPath, 'utf-8')); } catch {}
      if (Array.isArray(ops) && ops.length) {
        try { fs.unlinkSync(opsPath); } catch {}
        const ADMIN_TOGGLES = ['antilink', 'antispam', 'anticurse', 'welcome', 'autoSticker', 'autoTranslate', 'morning', 'rates', 'brief'];
        for (const op of ops) {
          try {
            if (!op || !op.jid) continue;
            const gd = gdata(op.jid);
            if (op.op === 'toggle' && ADMIN_TOGGLES.includes(op.key)) {
              gd.toggles[op.key] = !!op.value;
            } else if (op.op === 'linkAllow' && Array.isArray(op.domains)) {
              gd.linkAllow = op.domains.map((d) => String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()).filter((d) => d.includes('.')).slice(0, 30);
            } else if (op.op === 'clearWarns') {
              if (op.user) clearWarns(gd, op.user);
              else gd.warns = {};
            } else if (op.op === 'mute' && op.user) {
              muteUser(gd, op.user);
            } else if (op.op === 'muteChat') {
              gd.botMutedUntil = Date.now() + 10 * 365 * 24 * 3600 * 1000;
            } else if (op.op === 'unmuteChat') {
              gd.botMutedUntil = 0;
            } else if (op.op === 'unmute' && op.user) {
              unmuteUser(gd, op.user);
            } else if (op.op === 'rules') {
              gd.rules = String(op.text || '').slice(0, 500);
            } else if (op.op === 'features' && op.features && typeof op.features === 'object') {
              const KNOWN = ['chat', 'image', 'song', 'video', 'sticker', 'tts', 'info', 'qr', 'games', 'fun', 'bg', 'site', 'tools', 'shop'];
              gd.features = gd.features || {};
              for (const k of KNOWN) {
                if (op.features[k] !== undefined) gd.features[k] = !!op.features[k];
              }
            } else if (op.op === 'welcome' && op.text !== undefined) {
              if (String(op.text || '').trim()) gd.welcomeText = String(op.text).slice(0, 300);
            }
            console.log(`🖥️ admin-op: ${op.op} ${op.jid}`);
          } catch {}
        }
        saveStore();
      }
    } catch {}
    // ⭐ סטיקר יומי (8:05) — אקראי מהמאגר לכל הקבוצות המורשות
    try {
      const _now = new Date();
      const _today = todayStr();
      if ((_now.getHours() > 8 || (_now.getHours() === 8 && _now.getMinutes() >= 5)) && !stickerDayDone(_today)) {
        let files = [];
        try { files = fs.readdirSync(new URL('./stickers-daily/', import.meta.url)).filter((f) => f.endsWith('.webp')); } catch {}
        if (files.length) {
          const buf = fs.readFileSync(new URL(`./stickers-daily/${files[Math.floor(Math.random() * files.length)]}`, import.meta.url));
          for (const jid of config.ALLOWED_GROUPS) {
            try {
              await sock.sendMessage(jid, { sticker: buf }).catch(() => {});
            } catch {}
            await new Promise((r) => setTimeout(r, 1500));
          }
          console.log(`⭐ daily sticker sent to ${config.ALLOWED_GROUPS.length} groups`);
        }
      }
    } catch {}
    const now = new Date();
    const hour = now.getHours();
    const today = todayStr();
    // רק קבוצות מורשות (אם אין הגבלה — לא שולחים תזמונים אוטומטיים)
    for (const jid of config.ALLOWED_GROUPS) {
      let gd;
      try {
        gd = gdata(jid);
      } catch { continue; }
      // 🎮 משחקי קבוצה — סגירת סבבים, חשיפת תשובות, הצבעות
      {
        const nowMs = Date.now();
        if (gd.xo && nowMs - (gd.xo.lastMove || 0) > 15 * 60000) {
          gd.xo = null; saveStore();
          await sock.sendMessage(jid, { text: `⌛ המשחק באיקס-עיגול נסגר אחרי 15 דקות דומייה.\nלמשחק חדש: ${config.BOT_PREFIX}איקס-עיגול` }).catch(() => {});
        }
        if (gd.scramble && nowMs >= (gd.scramble.until || 0)) {
          const w = gd.scramble.word;
          gd.scramble = null; saveStore();
          await sock.sendMessage(jid, { text: `⏰ הזמן נגמר! התשובה הייתה: *${w}*` }).catch(() => {});
        }
        const b = gd.battle;
        if (b && nowMs >= (b.endsAt || 0)) {
          if (b.phase === 'collect') {
            const keys = Object.keys(b.entries || {});
            if (keys.length < 2) {
              gd.battle = null; saveStore();
              await sock.sendMessage(jid, { text: '⚔️ לא הוגשו מספיק משפטים — הסבב נסגר.' }).catch(() => {});
            } else {
              b.order = shuffleArray(keys).slice(0, 3);
              b.phase = 'vote';
              b.votes = {};
              b.endsAt = nowMs + 60000;
              saveStore();
              let out = `⚔️ *ההצבעה נפתחת!* שלחו *מספר* מהלך אהוב:\n\n`;
              b.order.forEach((k, i) => {
                out += `${i + 1}. ${(b.names[k] || 'חבר').split(' ')[0]}\n   _"${b.entries[k]}"_\n\n`;
              });
              out += `⏰ 60 שניות · המנצח/ת מקבל/ת *10 נקודות*`;
              await sock.sendMessage(jid, { text: out }).catch(() => {});
            }
          } else if (b.phase === 'vote') {
            const order = (b.order && b.order.length ? b.order : Object.keys(b.entries || {}).slice(0, 3));
            const tally = {};
            order.forEach((k) => { tally[k] = 0; });
            for (const v of Object.values(b.votes || {})) if (tally[v] !== undefined) tally[v]++;
            const ranked = order.slice().sort((a, c) => tally[c] - tally[a]);
            const winner = ranked[0];
            const tie = ranked.length > 1 && tally[ranked[1]] === tally[winner];
            let out = `⚔️ *תוצאות מלחמת-משפטים*\n\n`;
            order.forEach((k, i) => {
              out += `${i + 1}. ${(b.names[k] || 'חבר').split(' ')[0]} — ${tally[k]} קולות\n   _"${b.entries[k]}"_\n`;
            });
            if (!tie && tally[winner] > 0) {
              addPoints(jid, winner, 10);
              out += `\n🏆 *${b.names[winner] || 'חבר'}* מנצח/ת! +10 נקודות`;
            } else {
              out += `\n🤝 תיקו — אין ניקוד.`;
            }
            gd.battle = null; saveStore();
            await sock.sendMessage(jid, { text: out }).catch(() => {});
          }
        }
      }
      // 🎂 ימי הולדת (בדיקה כל בוקר 9:00)
      if (hour >= 9 && gd.lastBirth !== today) {
        gd.lastBirth = today;
        saveStore();
        const todays = todayBirthdays(jid);
        for (const b of todays) {
          const who = b.name ? ` ל${b.name}` : '';
          await sock.sendMessage(jid, { text: `🎂🎉 *יום הולדת שמח${who}!* 🎉🎂\nמזל טוב עד 120! 🥳` }).catch(() => {});
        }
      }
      // 🌅 בוקר-טוב + מזג אוויר (8:00)
      if (gd.toggles.morning && hour >= 8 && gd.lastBrief !== today) {
        gd.lastBrief = today;
        saveStore();
        try {
          const w = await getWeather(gd.toggles.morningCity || 'תל אביב');
          await sock.sendMessage(jid, { text: `🌅 *בוקר טוב לכולם!* ☀️\n\n${w}` }).catch(() => {});
        } catch {}
      }
      // 💹 שערים יומיים (9:30)
      if (gd.toggles.rates && (hour > 9 || (hour === 9 && now.getMinutes() >= 30)) && gd.lastRates !== today) {
        gd.lastRates = today;
        saveStore();
        try {
          const fx = await currencyRates();
          const cr = await cryptoPrices().catch(() => '');
          await sock.sendMessage(jid, { text: `${fx}${cr ? `\n\n${cr}` : ''}` }).catch(() => {});
        } catch {}
      }
      // 📰 בריף בוקר (7:30): חדשות + מזג + שערים
      if (gd.toggles.brief && (hour > 7 || (hour === 7 && now.getMinutes() >= 30)) && gd.lastBriefFull !== today) {
        gd.lastBriefFull = today;
        saveStore();
        try {
          const parts = [];
          try {
            parts.push(await newsHe(5));
          } catch {}
          try {
            parts.push(await getWeather(gd.toggles.briefCity || 'תל אביב'));
          } catch {}
          try {
            parts.push(await currencyRates());
          } catch {}
          if (parts.length) {
            await sock.sendMessage(jid, { text: `📰 *בריף בוקר טוב!* ☀️\n\n${parts.join('\n\n━━━━━━━━━━━━━━\n\n')}` }).catch(() => {});
          }
        } catch {}
      }
      // ⏰ תזכורות שהגיע זמנן (כל דקה)
      try {
        const due = popDueReminders(jid, Date.now());
        for (const r of due) {
          await sock.sendMessage(jid, { text: `⏰ *תזכורת:*\n${r.text}` }).catch(() => {});
        }
      } catch {}
      // 🔔 מעקב ערוצים (כל חצי שעה)
      for (const f of gd.follows) {
        if (Date.now() - (f.lastCheck || 0) < 30 * 60000) continue;
        f.lastCheck = Date.now();
        saveStore();
        try {
          const vids = await checkChannel(f.id);
          const newest = vids[0];
          if (newest && newest.id && newest.id !== f.lastVid) {
            f.lastVid = newest.id;
            saveStore();
            await sock.sendMessage(jid, { text: `🔔 *סרטון חדש בערוץ!*\n🎬 ${newest.title}\n🔗 ${newest.url}` }).catch(() => {});
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn('scheduler:', e.message);
  }
}

async function start() {
  // סגירת חיבור ישן לפני פתיחת חדש — מונע מלחמת חיבורים כפולים
  if (activeSock) {
    try { activeSock.end(); } catch {}
    activeSock = null;
  }
  const { state, saveCreds } = await useMultiFileAuthState(config.AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['AI-Bot', 'Chrome', '2.0'],
  });
  activeSock = sock;

  // עטיפת שליחה: כל הודעה שהבוט שולח נרשמת, כדי לזהות אותה ולדלג עליה
  // + שורת קבוצה-ראשית אוטומטית בסוף כל הודעת טקסט/כיתוב (אם MAIN_GROUP_URL הוגדר)
  const rawSend = sock.sendMessage.bind(sock);
  sock.sendMessage = (...args) => {
    try {
      // 🤖 ל-Instinct שולחים נקי לגמרי — בלי כותרות/פוטרים/תיוגים (הוא מסרב לקישורים)
      if (isInstinctJid(String(args[0] || ''))) {
        return rawSend(...args)
          .then((r) => { trackBotSent(r); return r; })
          .catch((e) => { console.error(`❌ שגיאת שליחה -> ${args[0]}: ${e?.message || e}`); throw e; });
      }
      const toJid = String(args[0] || '');
      const isGrp = toJid.endsWith('@g.us');
      let skipAd = false;
      if (!isGrp) {
        // בפרטי — מנויים לא רואים פרסומת
        const bare = toJid.split('@')[0];
        skipAd = proLids.has(bare) || isProCached(bare) ||
          !!(lidPhoneCache.get(toJid) && proPhones.has(lidPhoneCache.get(toJid)));
      }
      const header = skipAd ? '' : proHeader();
      const footer = donateFooter();
      const content = args[1];
      if (content && typeof content === 'object' && !content.poll) {
        if (typeof content.text === 'string') {
          let t = content.text;
          if (header && !t.includes('0555655217')) t = header + t;
          if (footer && !t.includes('whatsapp.com/')) t = t + footer;
          args[1] = { ...content, text: t };
        } else if (typeof content.caption === 'string') {
          let c = content.caption;
          if (header && !c.includes('0555655217')) c = header + c;
          if (footer && !c.includes('whatsapp.com/')) c = c + footer;
          args[1] = { ...content, caption: c };
        }
      }
    } catch {}
    // 🏷️ תיוג מדויק: התשובה הראשונה בהקשר ההודעה הנוכחית פותחת בתיוג השולח שלה
    // (הקשר נשמר לכל הודעה בנפרד — מקביליות בלי תיוגים שגויים; טקסט/כיתוב בלבד)
    try {
      const chat = args[0];
      const content = args[1];
      const tctx = tagALS.getStore();
      if (tctx && !tctx.used && tctx.jid && chat === tctx.jid && Date.now() - tctx.at < 60000 &&
          tctx.sender && tctx.sender !== 'me' && String(tctx.sender).includes('@') &&
          content && typeof content === 'object' &&
          !content.poll && !content.sticker && !content.audio && !(content.mentions && content.mentions.length)) {
        const tag = `@${String(tctx.sender).split('@')[0]}`;
        if (typeof content.text === 'string') {
          args[1] = { ...content, text: `${tag} ${content.text}`, mentions: [...(content.mentions || []), tctx.sender] };
          tctx.used = true;
        } else if (typeof content.caption === 'string') {
          args[1] = { ...content, caption: `${tag} ${content.caption}`, mentions: [...(content.mentions || []), tctx.sender] };
          tctx.used = true;
        }
      }
    } catch {}
    return rawSend(...args)
    .then((r) => {
      trackBotSent(r);
      try {
        if (r?.key?.id && typeof args[0] === 'string') {
          lastBotKey.set(args[0], r.key);
          if (lastBotKey.size > 100) lastBotKey.delete(lastBotKey.keys().next().value);
        }
      } catch {}
      console.log(`📤 נשלח -> ${args[0]}`);
      try {
        // 🔍 דיאגנוסטיקה זמנית: תצוגה מקדימה של תשובות בקבוצה הראשית
        if (String(args[0] || '') === '120363430145058453@g.us' && args[1] && typeof args[1] === 'object') {
          const pv = args[1].text || args[1].caption || '';
          if (pv) console.log(`📤[grp-reply] ${String(pv).slice(0, 150).replace(/\n/g, ' | ')}`);
        }
      } catch {}
      return r;
    })
    .catch((e) => { console.error(`❌ שגיאת שליחה -> ${args[0]}: ${e?.message || e}`); throw e; });
  };

  // 🔢 קוד חיבור (אופציונלי, רק אם PAIR_PHONE הוגדר והסשן טרם נרשם — לא נוגע בזרימה הרגילה)
  let pairTried = false;
  async function tryPairCode() {
    if (pairTried || !config.PAIR_PHONE || state.creds.registered) return;
    pairTried = true;
    try {
      const code = await sock.requestPairingCode(config.PAIR_PHONE);
      console.log(`\n🔢🔢🔢 קוד חיבור לוואטסאפ: ${code} 🔢🔢🔢\nהקלד בוואטסאפ > מכשירים מקושרים > קשר באמצעות מספר טלפון\n`);
    } catch (e) {
      console.log('pair code fail:', e?.message?.slice(0, 120));
      pairTried = false;
    }
  }
  setTimeout(tryPairCode, 5000);

  // ⏰ תזמון יומי (פעם אחת לתהליך): ימי הולדת, בוקר-טוב, שערים, מעקב ערוצים
  if (!schedulerOn) {
    schedulerOn = true;
    setInterval(schedulerTick, 60000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('📱 סרוק QR בוואטסאפ > מכשירים מקושרים > קשר מכשיר:');
      qrcode.generate(qr, { small: false });
      // שמירת ה-QR כקובץ תמונה גדול — פתח את qr.png וסרוק מהמסך
      import('qrcode').then(({ default: QRCode }) =>
        QRCode.toFile('./qr.png', qr, { width: 800, margin: 2 })
          .then(() => console.log('🖼️ QR נשמר כקובץ: qr.png — פתח אותו וסרוק מהמסך'))
          .catch(() => {})
      ).catch(() => {});
    }
    if (connection === 'open') {
      console.log('✅ מחובר לוואטסאפ!');
      clearTimeout(pairRetryTimer);
      pairRetryDelay = 3 * 60 * 1000;
      tryPairCode().catch(() => {});
      console.log(`🤖 מנועים: OpenAI=${config.OPENAI_API_KEY ? 'ON' : 'off'} Groq=${config.GROQ_API_KEY ? 'ON' : 'off'} Gemini=${config.GEMINI_API_KEY ? 'ON' : 'off'} Pollinations=ON (חינמי)`);
      // דגל חד-פעמי לרישום קבוצות: LIST_GROUPS=1 npm start
      if (process.env.LIST_GROUPS === '1' && !groupsListed) {
        groupsListed = true;
        setTimeout(async () => {
          if (activeSock !== sock) return; // החיבור התחלף — לא מושך מחיבור מת
          try {
            const groups = await sock.groupFetchAllParticipating();
            const list = Object.entries(groups);
            console.log(`GROUPS_COUNT=${list.length}`);
            for (const [jid, g] of list) console.log(`GROUP: ${g.subject} | ${jid}`);
          } catch (e) {
            console.log('FETCH_FAIL:', e.message);
            groupsListed = false; // נכשל — ננסה שוב בחיבור הבא
          }
        }, 15000);
      }
    }
    if (connection === 'close') {
      const _code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = _code !== DisconnectReason.loggedOut;
      console.log(`🔌 התנתק (code=${_code ?? '?'}), מנסה להתחבר מחדש:`, shouldReconnect);
      if (!shouldReconnect) console.log('⛔ הסשן מת (loggedOut) — נדרש QR מחדש או שהמספר חסום.');
      // הפעלה מחדש מעוכבת + ביטול כפילויות — רק חיבור אחד חי בכל רגע
      if (shouldReconnect && activeSock === sock) {
        clearTimeout(restartTimer);
        restartTimer = setTimeout(start, 4000);
      } else if (!shouldReconnect && activeSock === sock) {
        // לולאת צימוד אוטומטית: מנסה שוב כל כמה דקות, qr.png מתעדכן לבד בכל ניסיון
        clearTimeout(pairRetryTimer);
        console.log(`🔄 ניסיון צימוד נוסף בעוד ${Math.round(pairRetryDelay / 60000)} דקות — qr.png יתעדכן לבד`);
        pairRetryTimer = setTimeout(() => {
          pairRetryDelay = Math.min(pairRetryDelay * 1.5, 30 * 60 * 1000);
          if (activeSock === sock) { console.log('🔄 מנסה צימוד מחדש...'); start().catch(() => {}); }
        }, pairRetryDelay);
      }
    }
  });

  // 👋 ברוכים הבאים + רענון מטמון מנהלים (חדש — לא נוגע בחיבור הקיים)
  // 👥 עדכון קבוצות בזמן אמת (וואטסאפ דוחף שינויים) — ישר לפאנל
  sock.ev.on('groups.update', async (updates) => {
    try {
      const map = {};
      for (const g of updates || []) {
        if (g?.id && g?.subject) map[g.id] = { subject: String(g.subject).slice(0, 80), at: Date.now() };
      }
      if (Object.keys(map).length) {
        mergeKnownGroups(map);
        console.log(`👥 groups.update: ${Object.keys(map).length} קבוצות`);
      }
    } catch {}
  });
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {    try {
      const pids = (participants || []).map((p) => typeof p === 'object' ? (p.id || p.jid || p.participant || '') : String(p || ''));
      console.log(`👥 participants.update: action=${action} group=${id} users=${pids.join(',')}`);
      invalidateMeta(id);
      // 📛 עדכון מיידי לפאנל: צירוף/שינוי קבוצה מרענן שם ברגע שזה קורה
      (async () => {
        try {
          const mm = await sock.groupMetadata(id).catch(() => null);
          if (mm?.subject) mergeKnownGroups({ [id]: { subject: String(mm.subject).slice(0, 80), at: Date.now() } });
        } catch {}
      })().catch(() => {});
      if (!isGroupAllowed(id, true)) { console.log('👥 skipped: group not allowed'); return; }
      if (action === 'add') {
        const gd = gdata(id);
        if (!gd.toggles.welcome) { console.log('👥 skipped: welcome toggle off'); return; }
        let groupName = '';
        try {
          groupName = (await sock.groupMetadata(id))?.subject || '';
        } catch (e) { console.warn('👥 groupMetadata failed:', e?.message); }
        for (const p of pids) {
          if (!p) continue;
          const name = (gdata(id).names[p] || '').split(' ')[0] || 'חבר חדש';
          let msg = buildWelcome(gd.welcomeText, name, groupName);
          if (gd.rules) msg += `\n\n📜 *חוקי הקבוצה:*\n${gd.rules.slice(0, 400)}`;
          try {
            await sock.sendMessage(id, { text: msg, mentions: [p] });
            console.log(`👥 welcome sent to ${p}`);
          } catch (e) {
            console.warn(`👥 welcome send failed to ${p}:`, e?.message);
          }
        }
      }
    } catch (e) {
      console.warn('welcome:', e.message);
    }
  });

  // --- 👀 מעקב צפיות בסטטוס: מי צפה בסטטוס של החשבון המחובר ---
  // (קבלות קריאה ל-status@broadcast מגיעות רק ממי ששמר את המספר)
  sock.ev.on('lid-mapping.update', ({ lid, pn }) => {
    try {
      const l = String(lid || '').split('@')[0];
      const d = svDigits(pn);
      if (l && d) lidMapSet(l, d);
    } catch {}
  });
  sock.ev.on('contacts.update', (ups) => {
    try {
      for (const u of ups || []) {
        if (u?.id && u?.notify) svNameCache.set(String(u.id), String(u.notify).slice(0, 60));
      }
    } catch {}
  });
  // מאזין קל נוסף — רק למיפוי LID->טלפון מהודעות קבוצה (לא מתערב בטיפול הראשי)
  sock.ev.on('messages.upsert', ({ messages }) => {
    try {
      for (const m of messages || []) {
        const p = m?.key?.participant, alt = m?.key?.participantAlt;
        if (p && alt) {
          const d = svDigits(alt);
          if (d) lidMapSet(String(p).split('@')[0], d);
        }
        const pn2 = m?.key?.participantPn;
        if (p && pn2) {
          const d2 = svDigits(pn2);
          if (d2) lidMapSet(String(p).split('@')[0], d2);
        }
        // צ'אט פרטי עם LID: ההודעות היוצאות נושאות remoteJidAlt עם המספר האמיתי
        const rj = m?.key?.remoteJid, rjAlt = m?.key?.remoteJidAlt;
        if (rj && rjAlt) {
          const d3 = svDigits(rjAlt);
          if (d3) lidMapSet(String(rj).split('@')[0], d3);
        }
        const sndPn = m?.key?.senderPn;
        if (rj && sndPn) {
          const d4 = svDigits(sndPn);
          if (d4) lidMapSet(String(rj).split('@')[0], d4);
        }
      }
    } catch {}
  });
  sock.ev.on('message-receipt.update', (updates) => {
    try {
      for (const u of updates || []) {
        const rjid = u?.key?.remoteJid || '';
        if (rjid !== 'status@broadcast') continue;
        const viewer = u?.receipt?.userJid || u?.key?.participant || '';
        const sid = u?.key?.id || 'unknown';
        if (viewer) svRecordView(sid, String(viewer));
      }
    } catch {}
  });
  // 🕵️ איסוף נראות "נראה לאחרונה" — מגיע רק אם הצד השני מאפשר (אנשי קשר/כולם)
  sock.ev.on('presence.update', ({ id, presences }) => {
    try {
      for (const p of Object.values(presences || {})) {
        const ls = p?.lastSeen || p?.lastActive;
        if (ls) presenceSeen.set(String(id || '').split('@')[0], { at: Date.now(), lastSeen: ls });
      }
    } catch {}
  });

// טיפול בהודעה יחידה — הוצא מלולאת ה-upsert כדי לאפשר מקביליות (כל ה-continue המקוריים הפכו ל-return)
async function handleChatMessage(sock, botJid, msg) {
      try {
        // מדלגים על כל הודעות החשבון עצמו — חוץ מפקודות שליטה (כבה/הדלק/השתק/פתח).
        // מגיב רק לאנשים אחרים.
        if (msg.key.fromMe) {
          try {
            const _r0 = getTextMessage(msg) || '';
            const _t0 = _r0.startsWith(config.BOT_PREFIX) ? _r0.slice(config.BOT_PREFIX.length).trim() : _r0.trim();
            const _t0n = _t0.replace(/[\s־–—-]+/g, '-'); // מי שמר אותי == מי-שמר-אותי
            const _rj0 = msg.key.remoteJid || '';
            const _mp0 = mePending.get(_rj0);
            const _mpFresh = _mp0 && (Date.now() - _mp0.at < 15 * 60 * 1000);
            // פקודות שהבעלים רשאי להריץ מהחשבון של הבוט עצמו (כולל מדריך Me)
            const _selfOk =
              /^(כבה-בוט|כבה בוט|הדלק-בוט|הדלק בוט|השתק-בוט|השתק בוט|פתח-בוט|בוט-פתח)\b/i.test(_t0) ||
              /^(מי-שמר-אותי|מי-שמר|בדיקת-שמירה|סריקה-עמוקה|deep-scan|בדוק-שמירה|בדוק-שמר|מי-צפה|סטטוס-צפיות|נקה-צפיות|אנשי-קשר|me-התחבר|me-חבר|me-login|me-קוד|me-code|me-מצב|me-סטטוס|me-זהה|me-זיהוי|אמור|אמור-בניסוי)\b/i.test(_t0n) ||
              (_mpFresh && _mp0.stage === 'code' && /^\d{4,8}$/.test(_t0)) ||
              (_mpFresh && _mp0.stage === 'phone' && /^\+?[\d\s\-()]{9,16}$/.test(_t0));
            if (!_selfOk) return;
          } catch { return; }
        }
        // 🛡️ אותה הודעה נכנסת לא מעובדת פעמיים (שליחה כפולה של וואטסאפ/Baileys)
        {
          const _mid = msg.key.id;
          if (_mid) {
            if (inSeenIds.has(_mid)) return;
            inSeenIds.add(_mid);
            if (inSeenIds.size > 1500) inSeenIds.delete(inSeenIds.values().next().value);
          }
        }
        const remoteJid = msg.key.remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');
        // 🤖 תשובות Instinct (ממסר תמונות): לכידת תמונה לבקשה ממתינה, שאלות טקסט מועברות למבקש
        if (!isGroup && isInstinctJid(remoteJid) && !msg.key.fromMe) {
          instinctSendJid = remoteJid; // זוכרים מאיפה הוא עונה — לשם שולחים
          if (instinctPending) {
            if (msg.message?.imageMessage || msg.message?.stickerMessage) {
              try {
                const buf = await downloadMediaRetry({ key: msg.key, message: msg.message }, 'instinct', 6);
                const p = instinctPending;
                instinctPending = null;
                instinctFails = 0;
                console.log(`🤖 instinct image captured: ${(buf && buf.length) || 0} bytes`);
                p.resolve(buf);
              } catch (e) {
                console.warn('instinct capture fail:', (e && e.message || '').slice(0, 120));
              }
            } else {
              // שאלת הבהרה מ-Instinct → מעבירים לצ'אט המבקש ומחכים לתשובה אנושית
              const qtext = (getTextMessage(msg) || '').trim().slice(0, 400);
              if (qtext) {
                const p = instinctPending;
                console.log(`🤖 instinct asks: ${qtext.slice(0, 80)}`);
                if (activeJob) activeJob.waitingHuman = true;
                try {
                  await sock.sendMessage(p.chatJid, { text: `🤖 *Instinct שואל:*\n${qtext}\n\n_ענו כאן והתשובה תועבר אליו (3 דקות, אחרת אמשיך אוטומטית)_` });
                } catch {}
                // ⏱️ לא מחכים לנצח: בלי תשובה אנושית תוך 3 דקות — נופלים ליצירה ישירה
                try { clearTimeout(instinctQTimer); } catch {}
                instinctQTimer = setTimeout(() => {
                  try {
                    instinctQTimer = null;
                    if (instinctPending && instinctPending.id === p.id) {
                      const pend = instinctPending;
                      instinctPending = null;
                      if (activeJob) activeJob.waitingHuman = false;
                      sock.sendMessage(pend.chatJid, { text: `🤖 לא עניתם — ממשיך אוטומטית בדרך אחרת... ⏳` }).catch(() => {});
                      pend.reject(new Error('NO_HUMAN_ANSWER'));
                    }
                  } catch {}
                }, 180000);
                if (instinctQTimer.unref) instinctQTimer.unref();
              }
            }
          } else if ((msg.message?.imageMessage || msg.message?.stickerMessage) && instinctLate && Date.now() - instinctLate.at < 15 * 60 * 1000) {
            // תמונה שהגיעה אחרי טיימאאוט — מוסרים באיחור במקום לזרוק
            const late = instinctLate;
            instinctLate = null;
            try {
              const buf = await downloadMediaRetry({ key: msg.key, message: msg.message }, 'instinct-late', 6);
              if (buf && buf.length > 5000) {
                await sock.sendMessage(late.chatJid, { image: buf, caption: `🤖 *Instinct השלים (באיחור):*\n"${late.prompt.slice(0, 150)}"` });
                console.log(`🤖 instinct late image delivered (${buf.length} bytes)`);
              }
            } catch (e) {
              console.warn('instinct late fail:', (e && e.message || '').slice(0, 100));
            }
          }
          return;
        }
        // (הודעות fromMe בפרטי כבר סוננו בכניסה — רק פקודות שליטה עוברות)
        // 📛 שמירת שם הקבוצה לסטור (לפאנל) — לכל קבוצה שהבוט רואה, גם לא-מורשית
        if (isGroup) {
          try {
            if (!gdata(remoteJid).subject) {
              getGroupMeta(sock, remoteJid).then((mm) => {
                try {
                  if (mm?.subject) {
                    gdata(remoteJid).subject = String(mm.subject).slice(0, 80);
                    saveStore();
                  }
                } catch {}
              }).catch(() => {});
            }
          } catch {}
        }
        if (!isGroup) {
          // סטטוסים/ערוצים — מתעלמים לגמרי
          if (!/(@s\.whatsapp\.net|@lid)$/.test(remoteJid)) return;
          // 🎉 חינמי לגמרי — צ'אט פרטי פתוח לכולם, בלי שער מנויים
        }
        if (!isGroupAllowed(remoteJid, isGroup) && remoteJid !== (config.MGMT_GROUP || '')) return;
        const prefix = config.BOT_PREFIX;

        const rawText = getTextMessage(msg);
        const quoted = getQuotedMessage(msg);
        // קריאה לבוט בשמו (בלי תיוג רשמי) — נחשב פנייה, גם בלי !
        const nameCalled = /מולטי[\s-]?בוט|מולטיבוט/i.test(rawText || '');
        const mentioned = isMentioningBot(msg, botJid) || nameCalled;
        const hasImage = !!msg.message?.imageMessage;
        const hasAudio = !!(msg.message?.audioMessage || msg.message?.pttMessage);

        // 🧠 זיכרון + ניקוד + ספאם + טריוויה + סקרים (רץ על כל הודעה בקבוצה)
        {
          const sender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          const gd = gdata(remoteJid);
          // 📛 איסוף שמות תמיד — גם מהודעות בלי טקסט (מדבקות/תמונות/הקלטות)
          if (msg.pushName && !gd.names[sender]) {
            gd.names[sender] = String(msg.pushName).slice(0, 40);
            saveStore();
          }
          if (rawText) logMessage(remoteJid, sender, msg.pushName || '', rawText);
          addPoint(remoteJid, sender);
          // אנטי-ספאם שקט — רק מעקב, בלי להתערב בשיחה
          // (נשמר ב-msg._spam כדי שמצב "ספאם-קשוח" של מנהלים יוכל למחוק)
          if (!msg.key.fromMe) {
            msg._spam = spamCheck(remoteJid, sender, rawText);
          }
          // טריוויה: תשובה באות/מספר (גם בלי !)
          const tr = gd.trivia;
          if (tr && Date.now() < tr.until) {
            const t = rawText.trim();
            let letter = null;
            if (/^[א-ד]$/.test(t)) letter = t;
            else if (/^[1-4]$/.test(t)) letter = ['א', 'ב', 'ג', 'ד'][+t - 1];
            if (letter) {
              if (letter === tr.correct) {
                gd.trivia = null;
                saveStore();
                addPoints(remoteJid, sender, 5);
                await sock.sendMessage(remoteJid, { text: `🎉 *נכון מאוד!* התשובה: ${tr.correct}\n+5 נקודות! (${(msg.pushName || 'שחקן')})` });
              }
              // תשובה שגויה = שקט, לא מתערבים בשיחה
            }
          } else if (tr && Date.now() >= tr.until) {
            gd.trivia = null;
            saveStore();
            await sock.sendMessage(remoteJid, { text: `⏰ הזמן נגמר! התשובה הנכונה: ${tr.correct}` });
          }
          // 🎮 תשובות בלי ! — משחקים (איקס-עיגול / מילים-מעורבבות / מלחמת-משפטים) ואז סקר
          const tRaw = (rawText || '').trim();
          const isPlainNum = !rawText.startsWith(prefix) && /^\d+$/.test(tRaw);
          if (!rawText.startsWith(prefix) && tRaw && gd.scramble && !isPlainNum) {
            if (isScrambleAnswer(tRaw, gd.scramble.word)) {
              const word = gd.scramble.word;
              gd.scramble = null;
              saveStore();
              addPoints(remoteJid, sender, 3);
              const nm = msg.pushName || gd.names[sender] || 'שחקן';
              await sock.sendMessage(remoteJid, { text: `✅ *נכון!* ${nm} פיצח/ה את "*${word}*" — *+3 נקודות!* 🎉` });
            } else {
              gd.scramble.attempts = (gd.scramble.attempts || 0) + 1;
              saveStore();
            }
          }
          if (isPlainNum) {
            const nNum = +tRaw;
            const xoActive = !!gd.xo;
            const xoPlayer = xoActive && (gd.xo.p1 === sender || gd.xo.p2 === sender);
            if (xoActive && xoPlayer) {
              const res = xoApply(gd.xo, sender, nNum);
              if (res.ok) {
                saveStore();
                const w = gd.xo.winner;
                const board = renderXO(gd.xo.board);
                if (w === 'draw') {
                  gd.xo = null; saveStore();
                  await sock.sendMessage(remoteJid, { text: `❌⭕ *תיקו!* \n\n${board}\n\nכתבי ${prefix}איקס-עיגול למשחק חדש.` });
                } else if (w) {
                  const nm = gd.names[w] || 'השחקן';
                  addPoints(remoteJid, w, 10);
                  gd.xo = null; saveStore();
                  await sock.sendMessage(remoteJid, { text: `🏆 *${nm} ניצח/ה!* +10 נקודות 🎉\n\n${board}\n\nכתבי ${prefix}איקס-עיגול למשחק חדש.` });
                } else {
                  const turnName = gd.names[gd.xo.turn] || 'היריב';
                  await sock.sendMessage(remoteJid, { text: `${board}\n\nתורו של *${turnName}* — הקלידי מספר 1-9` });
                }
                return;
              }
              await sock.sendMessage(remoteJid, { text: `⚠️ ${res.error}` });
              return;
            }
            if (gd.battle && gd.battle.phase === 'vote') {
              const keys = (gd.battle.order && gd.battle.order.length)
                ? gd.battle.order
                : Object.keys(gd.battle.entries).slice(0, 3);
              const pick = keys[nNum - 1];
              if (pick) {
                gd.battle.votes[sender] = pick;
                saveStore();
                await sock.sendMessage(remoteJid, { text: `✅ ההצבעה שלך נרשמה (${nNum}).` });
              } else {
                await sock.sendMessage(remoteJid, { text: `⚠️ בחר מספר בין 1 ל-${keys.length}.` });
              }
              return;
            }
            // סקר קבוצתי (כפי שהיה)
            const open = gd.polls.filter((p) => p.open);
            const p = open[open.length - 1];
            const idx = nNum - 1;
            if (p && idx >= 0 && idx < p.options.length) {
              p.votes[sender] = p.options[idx];
              saveStore();
            }
          }
        }

        // 🔕 השתקת בוט זמנית ל הקבוצה — לא עונים לכלום, רק לפקודות הפתיחה
        {
          const gdM = gdata(remoteJid);
          if (gdM.botMutedUntil && Date.now() < gdM.botMutedUntil) {
            const cmdRaw = (rawText || '').startsWith(prefix) ? rawText.slice(prefix.length).trim() : '';
            if (!/^(פתח-בוט|בוט-פתח|השתק-בוט|כבה-בוט|כבה בוט|הדלק-בוט|הדלק בוט)/i.test(cmdRaw)) return;
          }
        }

        // --- 🌐 עדכון אתר בתגובה (Reply) להודעת האתר של הבוט — גם בלי ! ---
        // מזהה לפי #id בהודעה המצוטטת. פקודה מפורשת (עם !) לא נחטפת — עוברת לשרשרת.
        {
          const qm = quoted || null;
          const qtext = qm ? (qm.conversation || qm.extendedTextMessage?.text || qm.imageMessage?.caption || qm.videoMessage?.caption || '') : '';
          const siteId = extractSiteId(qtext);
          const reqText = (rawText || '').trim();
          if (siteId && reqText && !reqText.startsWith(prefix)) {
            await sendTyping(sock, remoteJid, 1500);
            try {
              const cur = await getSite(siteId);
              if (!cur) throw new Error('NO_SITE');
              await sock.sendMessage(remoteJid, { text: `🌐 מעדכן אתר #${siteId} לפי הבקשה...\n🎨 משנה קוד → ☁️ מעלה → 🔗 שולח` });
              const res = await updateSiteHTML(cur.html, reqText);
              if (res.cannot) {
                await sock.sendMessage(remoteJid, { text: `🌐 לא יכול לבצע את השינוי:\n${res.cannot}\n\nנסה בקשה אחרת.` });
                return;
              }
              const { url } = await publishSite(siteId, res.html, `update site ${siteId}: ${reqText.slice(0, 80)}`);
              const live = await waitForSite(url, 90000);
              await sock.sendMessage(remoteJid, { text: `🌐 *האתר עודכן!* #${siteId}\n📝 מה השתנה: ${res.summary || reqText.slice(0, 120)}\n🔗 ${url}${live ? ' (נבדק ✅)' : ''}\n\n✏️ להמשך שינויים — הגב להודעה זו.` });
            } catch (e) {
              console.error('site update fail:', e.message?.slice(0, 200));
              await sock.sendMessage(remoteJid, { text: '😢 עדכון האתר נכשל. נסה שוב בעוד דקה.' });
            }
            return;
          }
        }

        // 🛡️ ניטור מנהלים אוטומטי (חדש — לא נוגע בלוגיקה הקיימת מעלה)
        // מוחק קישורים/קללות/הצפות/מושתקים לפי הגדרות מנהלים. מנהלים פטורים.
        {
          const modSender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          const gdMod = gdata(remoteJid);
          const needMod = gdMod.toggles.antilink || gdMod.toggles.anticurse ||
            gdMod.toggles.antispam || (gdMod.muted || []).length > 0;
          if (needMod && rawText && !msg.key.fromMe) {
            // מושתק — מחיקה שקטה של כל הודעה
            if (isMuted(gdMod, modSender)) {
              await deleteMsg(sock, remoteJid, msg);
              return;
            }
            const isCmd = rawText.startsWith(prefix);
            if (!isCmd) {
              let senderIsAdmin = false;
              try {
                if (gdMod.toggles.antilink || gdMod.toggles.anticurse || gdMod.toggles.antispam) {
                  senderIsAdmin = await isSenderAdmin(sock, remoteJid, modSender);
                }
              } catch { senderIsAdmin = false; }
              if (!senderIsAdmin) {
                // 1) קישורים (למעט דומיינים מותרים)
                if (gdMod.toggles.antilink && hasBlockedLink(rawText, gdMod.linkAllow)) {
                  await deleteMsg(sock, remoteJid, msg);
                  const n = addWarn(gdMod, modSender);
                  saveStore();
                  if (n >= 3) {
                    clearWarns(gdMod, modSender);
                    saveStore();
                    const res = await kickParticipant(sock, remoteJid, modSender);
                    await sock.sendMessage(remoteJid, {
                      text: res.ok
                        ? `🔗 קישור נמחק + @${String(modSender).split('@')[0]} הורחק לאחר 3 אזהרות. 🦵`
                        : `🔗 קישור נמחק (אזהרה 3/3) — ההרחקה נכשלה: ${await isBotAdmin(sock, remoteJid) ? (res.error || 'שגיאה') : 'הבוט חייב להיות מנהל בקבוצה'}. (@${String(modSender).split('@')[0]})`,
                      mentions: [modSender],
                    });
                  } else {
                    await sock.sendMessage(remoteJid, {
                      text: `🔗 קישורים חסומים בקבוצה! ההודעה נמחקה. (אזהרה ${n}/3) (@${String(modSender).split('@')[0]})`,
                      mentions: [modSender],
                    });
                  }
                  return;
                }
                // 2) קללות
                if (gdMod.toggles.anticurse && hasCurse(rawText, gdMod.curseExtra)) {
                  await deleteMsg(sock, remoteJid, msg);
                  const n = addWarn(gdMod, modSender);
                  saveStore();
                  await sock.sendMessage(remoteJid, {
                    text: `🤬 שפה לא נאותה נמחקה. (אזהרה ${n}/3) (@${String(modSender).split('@')[0]})`,
                    mentions: [modSender],
                  });
                  if (n >= 3) {
                    clearWarns(gdMod, modSender);
                    saveStore();
                    const res = await kickParticipant(sock, remoteJid, modSender);
                    await sock.sendMessage(remoteJid, {
                      text: res.ok ? `🦵 הורחק לאחר 3 אזהרות שפה.` : `🦵 ההרחקה נכשלה (${res.error || 'ודא שהבוט מנהל'}).`,
                    });
                  }
                  return;
                }
                // 3) ספאם קשוח (נשען על אותו spamCheck שקט הקיים)
                if (gdMod.toggles.antispam && (msg._spam === 'flood' || msg._spam === 'links')) {
                  await deleteMsg(sock, remoteJid, msg);
                  await sock.sendMessage(remoteJid, {
                    text: `🌊 הצפה נמחקה — slow down! (@${String(modSender).split('@')[0]})`,
                    mentions: [modSender],
                  });
                  return;
                }
              }
            }
          }
        }

        // בקבוצה: להגיב רק עם קידומת / תיוג / תשובה (reply) להודעת הבוט / תמונה עם כיתוב / בקשת סטיקר
        let text = rawText;
        let usedPrefix = false;
        if (text.startsWith(prefix)) {
          usedPrefix = true;
          text = text.slice(prefix.length).trim();
          console.log(`▶️ פקודה ב-${remoteJid}: ${prefix}${text.slice(0, 40)} (fromMe=${!!msg.key.fromMe})`);
        } else if (isGroup && !mentioned && !hasImage && !isReplyToBot(msg)) {
          // חריג: הבעלים מהחשבון עצמו כותב "אמור ..." בקבוצת הניסוי — עובר גם בלי !
          if (msg.key.fromMe && remoteJid === TEST_GROUP_JID && /^אמור[\s-]+/i.test(text)) {
            console.log(`📣 אמור עצמי בקבוצת הניסוי (בלי קידומת)`);
          } else return; // לא להספים קבוצות — המשך שיחה רק בתשובה להודעת הבוט
        }
        // הסר תיוג @בוט / קריאת שם מהטקסט אם יש + תווים בלתי-נראים (וואטסאפ מוסיפה סימני כיווניות)
        text = text.replace(/@\d+/g, '').replace(/מולטי[\s-]?בוט/gi, '').replace(/[\u200e\u200f\u200b\u200c\u200d\ufeff]/g, '').replace(/[\u05be\u2013\u2014]/g, '-').trim();
        // SKIPAI-MARKER
        // 📇 מדריך Me באמצע (ממתין למספר/קוד) — עוקף learned ו-AI, ישר לטיפול
        let skipAI = false;
        if (!isGroup) {
          const _mp = mePending.get(remoteJid);
          if (_mp && Date.now() - _mp.at < 15 * 60 * 1000) {
            const _t = text.trim();
            if (/^\d{4,8}$/.test(_t) && (_mp.stage === 'code' || (_mp.stage === 'phone' && resolveOwnPhone(remoteJid)))) skipAI = true;
            if (_mp.stage === 'phone' && (/^\+?[\d\s\-()]{9,16}$/.test(_t) || (isReplyToBot(msg) && /\d{7,}/.test(_t)))) skipAI = true;
          }
        }
        // 👑 !כבוט <פקודה> — הבעלים מריץ פקודה בזהות המספר של הבוט
        let actAsBot = false;
        {
          const m = text.match(/^(כבוט|בתור-הבוט|as-bot)[\s-]+([\s\S]+)$/is);
          if (m) {
            const ownerD = resolveOwnPhone(msg.key.participant || remoteJid);
            if (ownerD === OWNER_DIGITS) {
              text = (m[2] || '').trim();
              actAsBot = true;
              if (!text) { await sock.sendMessage(remoteJid, { text: `👑 כתוב: ${prefix}כבוט <פקודה>\nלמשל: ${prefix}כבוט מי שמר אותי` }); return; }
            } else {
              await sock.sendMessage(remoteJid, { text: `⛔ פקודת הבעלים בלבד.` });
              return;
            }
          }
        }
        /** זהות לפעולות Me/דו"ח: מספר הבוט במצב כבוט, אחרת השולח. */
        const effJid = () => (actAsBot ? BOT_DIGITS + '@s.whatsapp.net' : (msg.key.participant || remoteJid));
        // --- 🖼️ תמונת פרופיל לבוט עצמו: הבעלים שולח תמונה עם כיתוב "תמונת-בוט" בפרטי ---
        if (!isGroup && hasImage && /תמונת-?בוט/i.test(text) &&
            (msg.key.fromMe || resolveOwnPhone(msg.key.participant || remoteJid) === OWNER_DIGITS)) {
          try {
            const buf = await downloadMediaRetry(msg, 'botpic');
            const meJid = (sock.user && sock.user.id) || null;
            if (!buf || buf.length < 1000 || !meJid) throw new Error('PIC');
            await sock.updateProfilePicture(meJid, buf);
            await sock.sendMessage(remoteJid, { text: '🖼️ תמונת הפרופיל של הבוט עודכנה ✅' });
          } catch (e) {
            console.warn('botpic fail:', (e && e.message || '').slice(0, 100));
            await sock.sendMessage(remoteJid, { text: '😢 עדכון תמונת הפרופיל נכשל.' });
          }
          return;
        }
        // --- 🔒 פרטי נעול: רק הבעלים. כל השאר → קבוצה + קישור ---
        // 🛡️ קודם מתעלמים מהודעות ריקות (ריאקשן/סטיקר/מחיקה) — שלא ישלח DM סתם ככה
        if (!isGroup && !text && !hasImage && !hasAudio) return;
        if (!isGroup) {
          const _dmOwner = msg.key.fromMe || resolveOwnPhone(msg.key.participant || remoteJid) === OWNER_DIGITS;
          if (!_dmOwner) {
            const _last = dmLockAt.get(remoteJid) || 0;
            if (Date.now() - _last > 5 * 60 * 1000) {
              dmLockAt.set(remoteJid, Date.now());
              const _ch = (config.CHANNEL_URL || '').trim();
              await sock.sendMessage(remoteJid, { text:
                `📢 *הקבוצה של מולטי בוט נחסמה ע"י וואטסאפ.*\n\n` +
                `📰 כדי להישאר מעודכנים, עקבו אחרי ערוץ העדכונים:\n${_ch}\n\n` +
                `ברגע שתיפתח קבוצה חדשה — נודיע בערוץ ✅` });
            }
            return;
          }
        }
        if (!text && !hasImage) return;

        const lower = text.toLowerCase();

        // --- 🤖 תשובה אנושית לשאלת Instinct — מעבירים אליו ומחכים לתמונה ---
        if (activeJob && activeJob.chatJid === remoteJid && activeJob.waitingHuman &&
            !msg.key.fromMe && !usedPrefix && !mentioned && text && text.length < 500 &&
            !hasImage && !hasAudio) {
          activeJob.waitingHuman = false;
          try { clearTimeout(instinctQTimer); instinctQTimer = null; } catch {}
          try {
            await sock.sendMessage(instinctSendJid || config.INSTINCT_JID, { text: text.slice(0, 500) });
            await sock.sendMessage(remoteJid, { text: `🤖 הועבר ל-Instinct, מחכה לתוצאה... ⏳` });
            console.log(`🤖 human reply relayed`);
          } catch (e) {
            console.warn('human relay fail:', (e && e.message || '').slice(0, 100));
          }
          return;
        }

        // --- ⏭️ "עוד" — המשך פקודת מדיה אחרונה באותו צ'אט (וידאו/שיר: תוצאות נוספות, תמונה: חדשה) ---
        let moreMode = false;
        {
          if (/^(עוד|תן עוד|תני עוד|עוד כאלה|עוד תוצאות|המשך|תמשיך|next|more)$/i.test(text)) {
            const lm = lastMedia.get(remoteJid);
            if (lm && Date.now() - lm.at < 10 * 60 * 1000) {
              if (lm.kind === 'image') {
                text = `תמונה ${lm.q}`;
                console.log(`⏭️ המשך תמונה ב-${remoteJid}`);
              } else if (lm.kind === 'shop') {
                moreMode = true;
                text = `קנה ${lm.q}`;
                console.log(`⏭️ עוד מוצרים ב-${remoteJid}`);
              } else {
                moreMode = true;
                text = `${lm.kind === 'song' ? 'שיר' : 'וידאו'} ${lm.q}`;
                console.log(`⏭️ עוד תוצאות (${lm.kind}) ב-${remoteJid}`);
              }
            }
          }
        }

        // --- 🧠 זיהוי פקודות בשפה טבעית (לא מנהלים): "צור לי תמונה" → "תמונה ..." ---
        {
          const norm = normalizeNaturalCommand(text);
          if (norm !== text) {
            console.log(`🧠 NL: "${text.slice(0, 40)}" → "${norm.slice(0, 40)}"`);
            text = norm;
          }
        }

        // --- 🧠 תשובה מאומנת קודמת (לפני AI — זול ומדויק; לא חוטף פקודות מפורשות) ---
        {
          const fw0 = (text.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
          if (!KNOWN_FIRST.has(fw0) && !skipAI) {
            const learned = matchLearned(text);
            if (learned) {
              pushHistory(remoteJid, 'user', text);
              pushHistory(remoteJid, 'assistant', learned);
              await sock.sendMessage(remoteJid, { text: learned });
              return;
            }
          }
        }

        // --- 🖼️ שאלה על תמונה בלי תמונה מצורפת — לא מנחשים! מבקשים את התמונה ---
        {
          const fw0q = (text.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
          const hasQuotedImg = !!(quoted && quoted.imageMessage);
          const asksAboutImage = /מה (יש|רואים|זה|זאת|מופיע) בתמונה|תאר(י|ו)?( לי)?( את)? ?התמונה|מה אתה רואה|איזו תמונה|what('| i)s in (the|this) (image|picture|photo)|describe (the|this) (image|picture|photo)/i.test(text);
          if (asksAboutImage && !hasImage && !hasQuotedImg && !KNOWN_FIRST.has(fw0q)) {
            pushHistory(remoteJid, 'user', text);
            const reply = '📷 כדי שאראה את התמונה — שלח/י אותה עם השאלה בכיתוב, או הגב (Reply) עליה עם השאלה 🙂';
            pushHistory(remoteJid, 'assistant', reply);
            await sock.sendMessage(remoteJid, { text: reply });
            return;
          }
        }

        // --- 🧠 הבנה מלאה: פקודה מפורשת → מהיר; אחרת AI עם הקשר (ניתוב או תשובה ישירה) ---
        {
          const _sndU = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          if (!skipAI && !(await checkFreeQuota(sock, remoteJid, _sndU, msg.key.fromMe, isGroup))) return;
          const hist = [...(chatHistory.get(remoteJid) || [])].slice(-12)
            .map((h) => `${h.role === 'user' ? (msg.pushName || 'משתמש') : 'בוט'}: ${h.content}`.slice(0, 220));
          if (!hist.length) {
            try {
              hist.push(...recentChat(remoteJid, 12).filter((l) => l.text).map((l) => `${l.name || ''}: ${l.text}`.slice(0, 220)));
            } catch {}
          }
          let qtxt = '';
          try {
            const qm = quoted || null;
            qtxt = (qm?.conversation || qm?.extendedTextMessage?.text || qm?.imageMessage?.caption || qm?.videoMessage?.caption || '').slice(0, 300);
          } catch {}
          const under = skipAI ? { type: 'cmd', text } : await aiUnderstand(text, { history: hist, sender: msg.pushName || '', quoted: qtxt });
          if (under.type === 'answer' && under.text) {
            pushHistory(remoteJid, 'user', text);
            pushHistory(remoteJid, 'assistant', under.text);
            await sock.sendMessage(remoteJid, { text: under.text });
            return;
          }
          if (under.text !== text) text = under.text;
        }

        // --- 🧩 שער פיצ'רים לקבוצה (וי בפאנל) — מטא/ניהול תמיד פתוח ---
        if (isGroup && !msg.key.fromMe) {
          const fw = (text.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
          if (!META_ALWAYS.has(fw)) {
            const feat = WORD2FEAT[fw];
            const need = feat || (KNOWN_FIRST.has(fw) ? null : 'chat');
            if (need && !isFeatureOn(gdata(remoteJid), need)) {
              const ck = `feat:${remoteJid}:${need}`;
              const last = proPromoAt.get(ck) || 0;
              if (Date.now() - last > 60000) {
                proPromoAt.set(ck, Date.now());
                await sock.sendMessage(remoteJid, { text: `🔇 הפיצ׳ר ${featLabel(need)} כבוי בקבוצה זו.` });
              }
              return;
            }
          }
        }

        // --- 😀 תגובת אימוג'י עם AI — הבוט מחליט לבד מתי ולמה (רק קבוצות מורשות) ---
        {
          try {
            const MGMT_R = config.MGMT_GROUP || '';
            if (isGroup && !msg.key.fromMe && !usedPrefix && !mentioned && remoteJid !== MGMT_R &&
                isGroupAllowed(remoteJid, true) && text.length > 2 && text.length < 300 &&
                Date.now() - (reactAt.get(remoteJid) || 0) > 150000) {
              const R = (a) => a[Math.floor(Math.random() * a.length)];
              const fallbackReact = () => {
                if (/שלום|היי|הי |בוקר טוב|ערב טוב|לילה טוב|מה נשמע|מה קורה|הייוש/i.test(text)) return R(['👋', '🙌']);
                if (/חח|😂|🤣|מצחיק|בדיחה|צחוק|קורע/i.test(text)) return '😂';
                if (/תודה|תודות|מעריך/i.test(text)) return R(['❤️', '🙏']);
                if (/מזל טוב|מזלט|ברכות|בהצלחה/i.test(text)) return R(['🎉', '🥳']);
                if (/עצוב|באסה|משתתף|ניחומים|😢|😭|כואב/i.test(text)) return R(['🫂', '❤️']);
                if (/לילה/i.test(text)) return '🌙';
                if (/בוקר/i.test(text)) return '🌅';
                return R(['🔥', '❤️', '👍', '😮', '👏', '💯']);
              };
              let em = '';
              try {
                const q = `אתה מחליט אם בוט וואטסאפ בקבוצה צריך להגיב באימוג'י (reaction) להודעה הבאה. החזר JSON בלבד, בלי הסברים: {"react":true,"emoji":"🔥"} או {"react":false,"emoji":""}. ` +
                  `הגב true רק אם ההודעה מביעה רגש, הומור, ברכה, תודה, התלהבות, עצב או חיבה — ואימוג'י אחד בלבד שמתאים בדיוק לתוכן. ` +
                  `הגב false על: שאלות, בקשות, פקודות, הודעות טכניות/יבשות/קצרות, קישורים בלבד, ספאם. הודעה: "${text.slice(0, 200)}"`;
                const ans = await Promise.race([
                  chatAI(q, []).then((r) => (r && r.text) || '').catch(() => ''),
                  new Promise((res) => setTimeout(() => res(''), 9000)),
                ]);
                const m = String(ans || '').match(/\{[\s\S]*?\}/);
                if (m) {
                  const j = JSON.parse(m[0]);
                  if (j && j.react === true && typeof j.emoji === 'string') {
                    const e = j.emoji.trim();
                    if (e && !/\s/.test(e) && [...e].length <= 4) em = e;
                  }
                }
              } catch {}
              if (!em) {
                // ה-AI אמר לא או נכשל — לפעמים בכל זאת מגיבים (10%) כדי להישאר חיים
                if (Math.random() < 0.10) em = fallbackReact();
              }
              if (em) {
                reactAt.set(remoteJid, Date.now());
                sock.sendMessage(remoteJid, { react: { text: em, key: msg.key } }).catch(() => {});
                console.log(`😀 תגובה ${em} ב-${remoteJid}`);
              }
            }
          } catch {}
        }

        // --- 👑 ניהול-על — רק בקבוצת הניהול (פרסם/סטיקר-יומי/תוכן/קישור/אמן) ---
        {
          const isMgmt = remoteJid === (config.MGMT_GROUP || '');
          const mgmtOnly = async () => {
            if (isMgmt) return true;
            await sock.sendMessage(remoteJid, { text: `👑 פקודת ניהול — רק בקבוצת הניהול.` });
            return false;
          };
          // 📣 פרסם
          {
            const m = text.match(/^(פרסם|פרסום|broadcast)\s*[:\-]?\s*([\s\S]+)?$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const body = (m[2] || '').trim();
              let media = null;
              try {
                const qm = quoted || null;
                const qsrc = qm?.imageMessage ? { message: qm, kind: 'image' } : null;
                if (qsrc) media = await downloadMediaRetry({ key: { remoteJid, id: 'x', fromMe: false }, message: qm }, 'publish');
              } catch {}
              const targets = (config.ALLOWED_GROUPS || []).filter((j) => j !== remoteJid);
              if (!body && !media) {
                await sock.sendMessage(remoteJid, { text: `📣 *פרסום לכל הקבוצות:*\n${prefix}פרסם <טקסט> (אפשר בתגובה לתמונה)\n\nישלח ל-${targets.length} קבוצות.` });
                return;
              }
              let n = 0;
              for (const jid of targets) {
                try {
                  if (media) await sock.sendMessage(jid, { image: media, caption: body.slice(0, 1000) });
                  else await sock.sendMessage(jid, { text: body.slice(0, 2000) });
                  n++;
                } catch {}
                await new Promise((r) => setTimeout(r, 1200));
              }
              await sock.sendMessage(remoteJid, { text: `📣 פורסם ל-*${n}/${targets.length}* קבוצות.` });
              return;
            }
          }
          // ⭐ סטיקר יומי (מאגר + שליחה יומית 8:05)
          {
            const m = text.match(/^(סטיקר-יומי|סטיקריומי)\s*[:\-]?\s*([\s\S]+)?$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const arg = (m[2] || '').trim();
              const dir = new URL('./stickers-daily/', import.meta.url);
              try { fs.mkdirSync(dir, { recursive: true }); } catch {}
              const files = (() => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).sort(); } catch { return []; } })();
              const qm = quoted || null;
              const hasMedia = !!(msg.message?.imageMessage || msg.message?.stickerMessage || qm?.imageMessage || qm?.stickerMessage);
              if (/^הוסף/.test(arg) && hasMedia) {
                try {
                  const src = msg.message?.imageMessage || msg.message?.stickerMessage ? msg : {
                    key: { remoteJid, id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, fromMe: false, participant: msg.message?.extendedTextMessage?.contextInfo?.participant },
                    message: qm,
                  };
                  const buf = await downloadMediaRetry(src, 'daily-sticker');
                  const sticker = await toStickerBuffer(buf);
                  const fp = new URL(`./stickers-daily/${Date.now()}.webp`, import.meta.url);
                  fs.writeFileSync(fp, sticker);
                  await sock.sendMessage(remoteJid, { text: `⭐ נוסף לסטיקר היומי! (סה"כ ${files.length + 1})` });
                } catch (e) {
                  await sock.sendMessage(remoteJid, { text: `😢 ההוספה נכשלה (${(e.message || '').slice(0, 80)}).` });
                }
                return;
              }
              if (/^נקה|נקי/.test(arg)) {
                for (const f of files) { try { fs.unlinkSync(new URL(`./stickers-daily/${f}`, import.meta.url)); } catch {} }
                await sock.sendMessage(remoteJid, { text: `⭐ המאגר נוקה.` });
                return;
              }
              if (/^מחק/.test(arg)) {
                const n = parseInt((arg.match(/(\d+)/) || [])[1] || '', 10);
                if (n >= 1 && n <= files.length) {
                  try { fs.unlinkSync(new URL(`./stickers-daily/${files[n - 1]}`, import.meta.url)); } catch {}
                  await sock.sendMessage(remoteJid, { text: `⭐ נמחק #${n}.` });
                } else {
                  await sock.sendMessage(remoteJid, { text: `⭐ כתוב מספר 1-${files.length}.` });
                }
                return;
              }
              if (/^(בדיקה|שלח|עכשיו)/.test(arg)) {
                if (!files.length) {
                  await sock.sendMessage(remoteJid, { text: `⭐ המאגר ריק. הגב לסטיקר עם ${prefix}סטיקר-יומי הוסף` });
                  return;
                }
                const pick = files[Math.floor(Math.random() * files.length)];
                const buf = fs.readFileSync(new URL(`./stickers-daily/${pick}`, import.meta.url));
                await sock.sendMessage(remoteJid, { sticker: buf });
                return;
              }
              await sock.sendMessage(remoteJid, { text:
                `⭐ *סטיקר יומי (${files.length} במאגר, נשלח כל בוקר 8:05):*\n` +
                `• הגב לסטיקר/תמונה: ${prefix}סטיקר-יומי הוסף\n` +
                `• ${prefix}סטיקר-יומי בדיקה | רשימה | מחק <n> | נקה` +
                (files.length ? `\n\n1. ${files.slice(0, 10).join('\n2. ').replace(/^/m, '')}` : '') });
              return;
            }
          }
          // 📚 תוכן (סוגי תכנים מותאמים)
          {
            let m = text.match(/^(תוכן-הוסף|הוסף-תוכן)\s+(\S+)\s+([\s\S]+)$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const n = addContent(m[2].trim().slice(0, 20), m[3].trim());
              await sock.sendMessage(remoteJid, { text: `📚 נוסף ל"${m[2].trim()}"! (סה"כ ${n})` });
              return;
            }
          }
          {
            const m = text.match(/^(תוכן-מחק|מחק-תוכן)\s+(\S+)\s+(\d+)$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const ok = delContent(m[2].trim(), parseInt(m[3], 10));
              await sock.sendMessage(remoteJid, { text: ok ? `📚 נמחק.` : `📚 לא נמצא. בדוק מספר עם ${prefix}תוכן-רשימה ${m[2].trim()}` });
              return;
            }
          }
          {
            const m = text.match(/^(תוכן-רשימה|רשימת-תוכן)(?:\s+(\S+))?$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              if (m[2]) {
                const arr = listContent(m[2].trim());
                await sock.sendMessage(remoteJid, { text: arr.length ? `📚 *${m[2].trim()} (${arr.length}):*\n` + arr.slice(-10).map((t, i) => `${arr.length - Math.min(10, arr.length) + i + 1}. ${t.slice(0, 120)}`).join('\n') : `📚 ריק. הוסף: ${prefix}תוכן-הוסף ${m[2].trim()} <טקסט>` });
              } else {
                const lib = listContent();
                const keys = Object.keys(lib);
                await sock.sendMessage(remoteJid, { text: keys.length ? `📚 *סוגים:* ${keys.map((k) => `${k} (${lib[k].length})`).join(' · ')}` : `📚 אין תוכן. הוסף: ${prefix}תוכן-הוסף בדיחה <טקסט>` });
              }
              return;
            }
          }
          {
            const m = text.match(/^(תוכן)(?:\s+(\S+))?$/is);
            if (m) {
              const kind = (m[2] || '').trim() || 'בדיחה';
              const pick = pickContent(kind);
              if (!pick) {
                await sock.sendMessage(remoteJid, { text: `📚 אין תוכן מסוג "${kind}".` + (isMgmt ? ` הוסף: ${prefix}תוכן-הוסף ${kind} <טקסט>` : '') });
              } else {
                await sock.sendMessage(remoteJid, { text: pick });
              }
              return;
            }
          }
          // 🔗 קישור הבוט (עדכון שורת הסיום)
          {
            const m = text.match(/^(קישור-בוט|קישור בוט|לינק-בוט)\s*[:\-]?\s*([\s\S]+)?$/is);
            if (m) {
              const arg = (m[2] || '').trim();
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `🔗 הקישור הנוכחי:\n${config.MAIN_GROUP_URL || '(ריק)'}\n\nעדכון (ניהול): ${prefix}קישור-בוט https://...` });
                return;
              }
              if (!(await mgmtOnly())) return;
              if (!/^https?:\/\//i.test(arg)) {
                await sock.sendMessage(remoteJid, { text: `🔗 כתובת לא תקינה (חייבת להתחיל ב-https://).` });
                return;
              }
              config.MAIN_GROUP_URL = arg.slice(0, 300);
              try {
                const envP = new URL('./.env', import.meta.url);
                let env = fs.readFileSync(envP, 'utf-8');
                if (/^MAIN_GROUP_URL=.*$/m.test(env)) env = env.replace(/^MAIN_GROUP_URL=.*$/m, `MAIN_GROUP_URL=${config.MAIN_GROUP_URL}`);
                else env += `\nMAIN_GROUP_URL=${config.MAIN_GROUP_URL}\n`;
                fs.writeFileSync(envP, env);
              } catch {}
              await sock.sendMessage(remoteJid, { text: `🔗 הקישור עודכן! ✅\n${config.MAIN_GROUP_URL}` });
              return;
            }
          }
          // 🧠 אמן (לימוד תשובות)
          {
            const m = text.match(/^(אמן|למד)(?=\s|:|$)\s*[:\-]?\s*([\s\S]+)?$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const rest = (m[2] || '').trim();
              const parts = rest.split('|').map((s) => s.trim());
              if (parts.length < 2 || !parts[0] || !parts[1]) {
                await sock.sendMessage(remoteJid, { text: `🧠 *אימון הבוט:*\n${prefix}אמן <שאלה> | <תשובה>\n\nדוגמה: ${prefix}אמן מה שעות פעילות | אנחנו פעילים 8-20\n\n${prefix}אימונים — רשימה | ${prefix}שכח <n> — מחיקה` });
                return;
              }
              const n = learnPair(parts[0], parts.slice(1).join('|'));
              await sock.sendMessage(remoteJid, { text: `🧠 נלמד! (${n} תשובות במאגר)` });
              return;
            }
          }
          {
            if (/^(אימונים|רשימת-אימונים)$/i.test(text)) {
              if (!(await mgmtOnly())) return;
              const arr = listLearned();
              await sock.sendMessage(remoteJid, { text: arr.length ? `🧠 *נלמדו (${arr.length}):*\n` + arr.slice(-15).map((L, i) => `${arr.length - Math.min(15, arr.length) + i + 1}. Q: ${L.q.slice(0, 60)}\n   A: ${L.a.slice(0, 60)}`).join('\n') : `🧠 המאגר ריק.` });
              return;
            }
          }
          {
            const m = text.match(/^(שכח|מחק-אימון)\s+(\d+)$/is);
            if (m) {
              if (!(await mgmtOnly())) return;
              const ok = forgetLearned(parseInt(m[2], 10));
              await sock.sendMessage(remoteJid, { text: ok ? `🧠 נשכח #${m[2]}.` : `🧠 לא נמצא #${m[2]}.` });
              return;
            }
          }
        }

        // --- 🔍 זיהוי מספרים (Truecaller) — רק בצ'אט פרטי ---
        // מזהה שם של מספרים ומחזיר קובץ אנשי קשר (VCF). דורש חיבור חד-פעמי עם המספר שלך.
        {
          // לא לחטוף משפטים רגילים שמתחילים ב"זהה..." — רק פקודה עם ! / תיוג / תשובה לבוט
          if (!usedPrefix && !mentioned && !isReplyToBot(msg)) {
            // עדיין לתת לבלוקים הבאים לרוץ
          } else {
          { // scope פנימי ל-decls
          const needPrivate = async () => {
            if (!isGroup) return true;
            await sock.sendMessage(remoteJid, { text: `🔒 פקודת הזיהוי עובדת רק בצ'אט פרטי עם הבוט 🤫` });
            return false;
          };
          const TC_SESS = new URL('./tc-session.json', import.meta.url);
          const tcLoad = () => { try { return JSON.parse(fs.readFileSync(TC_SESS, 'utf-8')); } catch { return {}; } };
          const tcSave = (s) => { try { fs.writeFileSync(TC_SESS, JSON.stringify(s)); } catch {} };
          const CC_MAP = [['972', 'IL'], ['1', 'US'], ['44', 'GB'], ['33', 'FR'], ['49', 'DE'], ['39', 'IT'], ['34', 'ES'], ['31', 'NL'], ['32', 'BE'], ['41', 'CH'], ['43', 'AT'], ['30', 'GR'], ['351', 'PT'], ['353', 'IE'], ['46', 'SE'], ['47', 'NO'], ['45', 'DK'], ['358', 'FI'], ['48', 'PL'], ['380', 'UA'], ['7', 'RU']];
          const parseTcNum = (raw) => {
            const d = String(raw || '').replace(/\D/g, '');
            if (!d) return null;
            if (/^0\d{8,9}$/.test(d)) return { region: 'IL', national: d.slice(1), e164: '+972' + d.slice(1) };
            for (const [cc, region] of CC_MAP) {
              if (d.startsWith(cc) && d.length > cc.length + 6) return { region, national: d.slice(cc.length), e164: '+' + d };
            }
            return null;
          };
          const tcLib = async () => {
            const mod = await import('truecallerjs');
            return mod.default || mod;
          };
          const tcOnboard = () =>
            `🔍 *זיהוי מספרים — חיבור ראשוני (פעם אחת):*\n` +
            `1️⃣ ${prefix}זהה-התחבר <המספר שלך> — למשל ${prefix}זהה-התחבר 0501234567\n` +
            `2️⃣ תקבל SMS עם קוד — שלח ${prefix}זהה-קוד <הקוד>\n` +
            `3️⃣ אחר כך: ${prefix}זהה <מספרים לבדיקה>\n` +
            `(החיבור נשמר אצלך בשרת, אפשר לנתק עם ${prefix}זהה-נתק)`;
          // 🔑 !זהה-התחבר <המספר שלך>
          {
            const m = text.match(/^(זהה-התחבר|זיהוי-התחבר|tc-login)(?:\s+([\s\S]+))?$/is);
            if (m) {
              if (!(await needPrivate())) return;
              const p = parseTcNum(m[2] || '');
              if (!p) { await sock.sendMessage(remoteJid, { text: `🔍 כתוב: ${prefix}זהה-התחבר <המספר שלך>\nלמשל: ${prefix}זהה-התחבר 0501234567` }); return; }
              try {
                const lib = await tcLib();
                const loginJson = await lib.login(p.e164);
                if (!loginJson || (loginJson.status !== 1 && loginJson.status !== 9)) {
                  await sock.sendMessage(remoteJid, { text: `😢 Truecaller לא שלח קוד (${loginJson?.message || 'שגיאה'}). נסה שוב בעוד דקה.` });
                  return;
                }
                tcPending.set(remoteJid, { phone: p.e164, loginJson, at: Date.now() });
                await sock.sendMessage(remoteJid, { text: `📩 נשלח SMS עם קוד ל-${p.e164}.\nשלח: ${prefix}זהה-קוד <הקוד שקיבלת>` });
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: `😢 החיבור נכשל. בדוק שהמספר נכון ונסה שוב.` });
              }
              return;
            }
          }
          // 🔢 !זהה-קוד <otp>
          {
            const m = text.match(/^(זהה-קוד|זיהוי-קוד|tc-code)\s+(\d{4,8})$/is);
            if (m) {
              if (!(await needPrivate())) return;
              const pend = tcPending.get(remoteJid);
              if (!pend || Date.now() - pend.at > 10 * 60 * 1000) {
                tcPending.delete(remoteJid);
                await sock.sendMessage(remoteJid, { text: `🔍 אין בקשת חיבור פעילה.\n` + tcOnboard() });
                return;
              }
              try {
                const lib = await tcLib();
                const res = await lib.verifyOtp(pend.phone, pend.loginJson, m[2]);
                const iid = res?.installationId || res?.data?.installationId;
                if (!iid) { await sock.sendMessage(remoteJid, { text: `😢 הקוד לא התקבל (${res?.message || 'שגיאה'}). נסה שוב או בקש קוד חדש.` }); return; }
                tcSave({ installationId: iid, phone: pend.phone, at: Date.now() });
                tcPending.delete(remoteJid);
                await sock.sendMessage(remoteJid, { text: `✅ *מחובר לזיהוי!*\nעכשיו שלח: ${prefix}זהה <מספרים>\nלמשל: ${prefix}זהה 0501111111 0502222222` });
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: `😢 אימות נכשל. נסה שוב.` });
              }
              return;
            }
          }
          // 🚪 !זהה-נתק
          if (/^(זהה-נתק|זיהוי-נתק|tc-logout)$/i.test(text)) {
            if (!(await needPrivate())) return;
            tcSave({});
            await sock.sendMessage(remoteJid, { text: `🚪 החיבור לזיהוי נותק ונמחק.` });
            return;
          }
          // 🔍 !זהה <מספרים...>
          {
            const m = text.match(/^(זהה|זיהוי|מי-זה|truecaller|tc)(?:\s+([\s\S]+))?$/is);
            if (m) {
              if (!(await needPrivate())) return;
              const iid = tcLoad().installationId || '';
              if (!iid) { await sock.sendMessage(remoteJid, { text: tcOnboard() }); return; }
              const raws = (m[2] || '').match(/\+?[\d][\d\s\-()]{6,}/g) || [];
              const nums = [];
              for (const r of raws) {
                const p = parseTcNum(r);
                if (p && !nums.some((x) => x.e164 === p.e164)) nums.push(p);
                if (nums.length >= 8) break;
              }
              if (!nums.length) {
                await sock.sendMessage(remoteJid, { text: `🔍 כתוב: ${prefix}זהה <מספרים>\nלמשל: ${prefix}זהה 0501111111 0502222222\n(עד 8 מספרים בכל בדיקה)` });
                return;
              }
              await sock.sendMessage(remoteJid, { text: `🔍 מזהה ${nums.length} מספרים...` });
              let lib = null;
              try { lib = await tcLib(); } catch {
                await sock.sendMessage(remoteJid, { text: `😢 שירות הזיהוי לא זמין כרגע.` });
                return;
              }
              const results = new Array(nums.length).fill(null);
              const sameRegion = nums.every((n) => n.region === nums[0].region);
              let bulkOk = false;
              if (sameRegion) {
                try {
                  const b = await lib.bulkSearch(nums.map((n) => n.national).join(','), nums[0].region, iid);
                  const arr = b?.data || b?.json?.()?.data;
                  if (Array.isArray(arr) && arr.length === nums.length) {
                    arr.forEach((e, i) => { results[i] = (e?.name || e?.altName || '').trim(); });
                    bulkOk = true;
                  }
                } catch {}
              }
              if (!bulkOk) {
                for (let i = 0; i < nums.length; i++) {
                  try {
                    const f = await lib.search({ number: nums[i].national, countryCode: nums[i].region, installationId: iid });
                    let nm = '';
                    try { nm = (f.getName() || '').trim(); } catch {}
                    if (!nm || /^unknown/i.test(nm)) {
                      try { nm = (f.json()?.data?.[0]?.name || f.json()?.data?.[0]?.altName || '').trim(); } catch {}
                    }
                    results[i] = nm;
                  } catch { results[i] = ''; }
                  if (i < nums.length - 1) await new Promise((r) => setTimeout(r, 500));
                }
              }
              const lines = nums.map((n, i) => {
                const nm = results[i];
                return (nm ? `✅ ${n.e164} — *${nm}*` : `❓ ${n.e164} — לא נמצא`);
              });
              await sock.sendMessage(remoteJid, { text: `🔍 *זיהוי מספרים:*\n` + lines.join('\n') });
              // 📇 קובץ אנשי קשר VCF
              try {
                const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, ' ');
                const vcf = nums.map((n, i) => {
                  const nm = results[i] || n.e164;
                  return `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(nm)}\nTEL;TYPE=CELL,VOICE:${n.e164}\nEND:VCARD`;
                }).join('\n');
                await sock.sendMessage(remoteJid, {
                  document: Buffer.from(vcf, 'utf-8'),
                  mimetype: 'text/vcard',
                  fileName: 'contacts.vcf',
                });
              } catch {}
              return;
            }
          }
          } // סוף scope פנימי
          } // סוף else (פקודה עם קידומת/תיוג/תשובה)
        }

        // --- 👀 מי צפה בסטטוס — שמרו אותך ולא שמורים אצלך (פרטי/ניהול) ---
        {
          const svOk = !isGroup || remoteJid === (config.MGMT_GROUP || '');
          // 📇 ייבוא קובץ אנשי קשר (VCF) אוטומטי בפרטי — גם בלי קידומת
          const _doc = msg.message?.documentMessage;
          if (!isGroup && _doc && /vcf|vcard/i.test(`${_doc.mimetype || ''} ${_doc.fileName || ''}`)) {
            try {
              const buf = await downloadMediaRetry({ key: msg.key, message: msg.message }, 'vcf');
              const parsed = parseVcf(buf.toString('utf-8'));
              const n = Object.keys(parsed).length;
              if (n) {
                const db = myContactsLoad();
                db.nums = { ...(db.nums || {}), ...parsed };
                myContactsSave(db);
                await sock.sendMessage(remoteJid, { text: `📇 נקלטו *${n}* אנשי קשר!\nעכשיו ${prefix}מי-צפה יגיד לך מי שמר אותך ולא שמור אצלך.` });
              } else {
                await sock.sendMessage(remoteJid, { text: `📇 לא מצאתי מספרים בקובץ. ודא שזה קובץ VCF מאנשי הקשר.` });
              }
            } catch {
              await sock.sendMessage(remoteJid, { text: `😢 לא הצלחתי לקרוא את הקובץ.` });
            }
            return;
          }
          if (!usedPrefix && !mentioned && !isReplyToBot(msg)) {
            // משפט רגיל — לא לחטוף, לתת לבלוקים הבאים
          } else {
          { // scope פנימי
          // 👀 !מי-צפה — דו"ח 24 שעות אחרונות
          if (/^(מי[\s-]+צפה|מי[\s-]+צפו|צפו|צפיות|סטטוס[\s-]+צפיות|מי[\s-]+ראה|status-views)$/i.test(text)) {
            if (!svOk) { await sock.sendMessage(remoteJid, { text: `👀 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            const db = svLoadViews();
            const since = Date.now() - 24 * 3600 * 1000;
            const seen = new Map();
            for (const it of Object.values(db.items || {})) {
              for (const [v, info] of Object.entries((it || {}).viewers || {})) {
                if ((info?.at || 0) >= since && !seen.has(v)) seen.set(v, info.at);
              }
            }
            if (!seen.size) {
              await sock.sendMessage(remoteJid, { text: `👀 *אין צפיות ב-24 השעות האחרונות.*\nפרסם סטטוס מהטלפון שהבוט מחובר אליו, חכה שיצפו — ואז שאל שוב.` });
              return;
            }
            const contacts = myContactsLoad().nums || {};
            let storeNames = {};
            try {
              const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
              for (const g of Object.values(s.groups || {})) Object.assign(storeNames, (g || {}).names || {});
            } catch {}
            const prettyNum = (digits) => {
              if (!digits) return null;
              if (digits.startsWith('972') && digits.length === 12) return '0' + digits.slice(3);
              return '+' + digits;
            };
            const unsaved = [], saved = [];
            for (const [v] of seen) {
              const { digits, lid } = svResolve(v);
              const name = (digits && contacts[digits]) || svNameCache.get(v) || storeNames[v] || (lid ? (svNameCache.get(lid) || '') : '') || '';
              const num = prettyNum(digits);
              (digits && contacts[digits] ? saved : unsaved).push({ label: name || num || v.slice(0, 12), num, digits, name });
            }
            let out = `👀 *מי צפה בסטטוס (24 שעות): ${seen.size}*\n`;
            if (unsaved.length) {
              out += `\n⭐ *שמרו אותך ולא שמורים אצלך (${unsaved.length}):*\n` +
                unsaved.map((u) => `• ${u.label}${u.num && u.label !== u.num ? ` — ${u.num}` : ''}`).join('\n');
            } else {
              out += `\n⭐ כולם שומרים... וכולם שמורים אצלך (או שלא ייבאת אנשי קשר).`;
            }
            out += `\n\n👥 שמורים אצלך שצפו: ${saved.length}`;
            if (!Object.keys(contacts).length) {
              out += `\n\n📇 *טיפ:* ייצא אנשי קשר מהטלפון כקובץ VCF ושלח לי כאן — ואדע בדיוק מי לא שמור אצלך.`;
            }
            await sock.sendMessage(remoteJid, { text: out });
            // 📇 קובץ VCF של הלא-שמורים
            const withNum = unsaved.filter((u) => u.digits);
            if (withNum.length) {
              try {
                const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
                const vcf = withNum.map((u) => `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(u.name || u.num)}\nTEL;TYPE=CELL,VOICE:+${u.digits}\nEND:VCARD`).join('\n');
                await sock.sendMessage(remoteJid, {
                  document: Buffer.from(vcf, 'utf-8'),
                  mimetype: 'text/vcard',
                  fileName: 'saved-me.vcf',
                });
              } catch {}
            }
            return;
          }
          // 🧹 !נקה-צפיות
          if (/^(נקה-צפיות|אפס-צפיות|נקה-צפיה)$/i.test(text)) {
            if (!svOk) { await sock.sendMessage(remoteJid, { text: `👀 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            svSaveViews({ items: {} });
            await sock.sendMessage(remoteJid, { text: `🧹 נוקו נתוני הצפיות.` });
            return;
          }
          // 📇 !אנשי-קשר — כמה נשמרו
          if (/^(אנשי-קשר|רשימת-קשר|my-contacts)$/i.test(text)) {
            if (!svOk) { await sock.sendMessage(remoteJid, { text: `👀 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            const n = Object.keys(myContactsLoad().nums || {}).length;
            await sock.sendMessage(remoteJid, { text:
              n ? `📇 שמורים אצלי *${n}* אנשי קשר שלך.` :
              `📇 עוד לא ייבאת אנשי קשר.\nבטלפון: אנשי קשר > ייצוא > קובץ VCF — ושלח לי אותו כאן בפרטי.` });
            return;
          }
          } // סוף scope פנימי
          } // סוף else
        }

        // --- 📢 עוקבי ערוץ — שלח קישור לערוץ בפרטי, מקבל רשימת עוקבים + קובץ ---
        {
          const m = text.match(/^(ערוץ-עוקבים|ערוץ|עוקבים|עוקבי-ערוץ|channel)(?:\s+([\s\S]+))?$/is);
          // מילים רגילות ("ערוץ 12", "עוקבים יקרים") לא חוטפים — רק פקודה עם ! או קישור או הצורה המפורשת
          if (m && (usedPrefix || /whatsapp\.com\/channel/i.test(text) || /^(ערוץ-עוקבים|עוקבי-ערוץ)/i.test(text))) {
            if (isGroup) { await sock.sendMessage(remoteJid, { text: `📢 הפקודה עובדת רק בפרטי 🤫` }); return; }
            const code = ((m[2] || '').match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/) || [])[1] ||
              (m[2] || '').trim().match(/^([A-Za-z0-9]{10,})$/)?.[1] || '';
            if (!code) {
              await sock.sendMessage(remoteJid, { text: `📢 שלח: ${prefix}ערוץ-עוקבים <קישור לערוץ>\nלמשל: ${prefix}ערוץ-עוקבים https://whatsapp.com/channel/XXXX` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: `📢 שולף עוקבים...` });
            try {
              const meta = await sock.newsletterMetadata('invite', code).catch(() => null);
              const mjids = [...scanJids(meta)];
              const njid = mjids.find((j) => j.endsWith('@newsletter')) || '';
              const mname = (meta && typeof meta === 'object' && (meta.name || meta.title)) || '';
              if (!njid) { await sock.sendMessage(remoteJid, { text: `😢 לא מצאתי ערוץ בקישור. בדוק שהוא תקין וציבורי.` }); return; }
              try { await sock.newsletterFollow(njid); } catch {}
              const subs = await sock.newsletterSubscribers(njid).catch(() => null);
              const followers = [...scanJids(subs)].filter((j) => !j.endsWith('@newsletter'));
              if (!followers.length) {
                await sock.sendMessage(remoteJid, { text: `📢 *${mname || 'הערוץ'}*\nרשימת העוקבים חסומה/ריקה (וואטסאפ מגבילה חשיפה).` });
                return;
              }
              let storeNames = {};
              try {
                const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
                for (const g of Object.values(s.groups || {})) Object.assign(storeNames, (g || {}).names || {});
              } catch {}
              const prettyNum = (d) => (d && d.startsWith('972') && d.length === 12 ? '0' + d.slice(3) : (d ? '+' + d : ''));
              const items = followers.slice(0, 1500).map((j) => {
                const { digits } = svResolve(j);
                const nm = svNameCache.get(j) || storeNames[j] || '';
                return { j, digits, nm };
              });
              const withNum = items.filter((x) => x.digits);
              const CH = 100;
              const shown = items.length;
              await sock.sendMessage(remoteJid, { text:
                `📢 *עוקבי ${mname || 'הערוץ'}:* ${followers.length}${followers.length > shown ? ` (מוצגים ${shown})` : ''}\n` +
                `שולח ${Math.ceil(shown / CH)} הודעות (100 בכל אחת, בהפרש 3 שניות)...` });
              for (let i = 0; i < shown; i += CH) {
                if (i > 0) await new Promise((r) => setTimeout(r, 3000));
                const part = items.slice(i, i + CH);
                await sock.sendMessage(remoteJid, { text:
                  `📢 *${i + 1}–${i + part.length} מתוך ${shown}:*\n` +
                  part.map((x, k) => `${i + k + 1}. ${x.nm ? `*${String(x.nm).split(' ')[0]}* — ` : ''}${prettyNum(x.digits) || x.j.slice(0, 12)}`).join('\n') });
              }
              if (withNum.length) {
                try {
                  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
                  const vcf = withNum.map((x) => `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(x.nm || prettyNum(x.digits))}\nTEL;TYPE=CELL,VOICE:+${x.digits}\nEND:VCARD`).join('\n');
                  await sock.sendMessage(remoteJid, {
                    document: Buffer.from(vcf, 'utf-8'),
                    mimetype: 'text/vcard',
                    fileName: 'channel-followers.vcf',
                  });
                } catch {}
              }
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 נכשל (${String(e?.message || e).slice(0, 100)}). נסה ערוץ ציבורי אחר.` });
            }
            return;
          }
        }

        // --- 🔎 חיפוש ערוצי וואטסאפ לפי שם/נושא ---
        // (אין מאגר עולמי רשמי — מחפשים קישורי ערוצים ציבוריים ברשת ומאמתים מול וואטסאפ)
        {
          const m = text.match(/^(חפש-ערוץ|חיפוש-ערוץ|חפש-ערוצים)(?:\s+([\s\S]+))?$/is);
          if (m && usedPrefix) {
            const q = (m[2] || '').trim().slice(0, 80);
            if (!q) {
              await sock.sendMessage(remoteJid, { text: `🔎 *חיפוש ערוצים — איך?*\nכתוב: ${prefix}חפש-ערוץ <שם או נושא>\nדוגמה: ${prefix}חפש-ערוץ חדשות` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: `🔎 מחפש ערוצים בנושא "${q.slice(0, 50)}"...` });
            async function scrapeChannelCodes(query) {
              const found = [];
              const rx = /whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})/gi;
              const UA2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
              const queries = [`whatsapp.com/channel ${query}`, `ערוץ וואטסאפ ${query}`];
              for (const qq of queries) {
                for (const url of [
                  `https://html.duckduckgo.com/html/?q=${encodeURIComponent(qq)}`,
                  `https://www.bing.com/search?q=${encodeURIComponent(qq)}`,
                ]) {
                  try {
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 15000);
                    const r = await fetch(url, { headers: { 'User-Agent': UA2 }, signal: ctrl.signal });
                    clearTimeout(t);
                    if (!r.ok) continue;
                    const h = await r.text();
                    let mm;
                    rx.lastIndex = 0;
                    while ((mm = rx.exec(h)) && found.length < 12) {
                      if (!found.includes(mm[1])) found.push(mm[1]);
                    }
                  } catch {}
                  if (found.length >= 6) break;
                }
                if (found.length >= 6) break;
              }
              return found;
            }
            try {
              const codes = await scrapeChannelCodes(q);
              if (!codes.length) {
                await sock.sendMessage(remoteJid, { text: `😢 לא מצאתי ערוצים ציבוריים בנושא "${q.slice(0, 50)}".\nנסה שם אחר באנגלית, או הדבק קישור ישיר לערוץ.` });
                return;
              }
              const rows = [];
              for (const code of codes.slice(0, 5)) {
                try {
                  const meta = await sock.newsletterMetadata('invite', code).catch(() => null);
                  const mjids = [...scanJids(meta)];
                  const njid = mjids.find((j) => j.endsWith('@newsletter')) || '';
                  if (!njid) continue;
                  const mname = (meta && typeof meta === 'object' && (meta.name || meta.title)) || '';
                  let subs = 0;
                  try {
                    const s2 = await sock.newsletterSubscribers(njid).catch(() => null);
                    subs = [...scanJids(s2)].filter((j) => !j.endsWith('@newsletter')).length;
                  } catch {}
                  rows.push({ code, name: mname, subs });
                } catch {}
              }
              if (!rows.length) {
                await sock.sendMessage(remoteJid, { text: `😢 מצאתי קישורים אבל אף ערוץ לא אומת (פרטי/חסום).\nנסה נושא אחר.` });
                return;
              }
              rows.sort((a, b) => b.subs - a.subs);
              const fmtN = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
              await sock.sendMessage(remoteJid, { text:
                `🔎 *ערוצים בנושא "${q.slice(0, 50)}":*\n\n` +
                rows.map((r, i) => `${i + 1}. *${r.name || 'ערוץ'}*${r.subs ? ` — ${fmtN(r.subs)} עוקבים` : ''}\n🔗 https://whatsapp.com/channel/${r.code}`).join('\n\n') +
                `\n\n💡 לפרטים על ערוץ: ${prefix}ערוץ-עוקבים <קישור> (בפרטי)` });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 החיפוש נכשל (${String((e && e.message) || e).slice(0, 80)}). נסה שוב.` });
            }
            return;
          }
        }

        // --- 📇 Me — רשת זיהוי עולמית: מי שמר אותך, חיפוש מספרים (פרטי/ניהול) ---
        {
          const svOk4 = !isGroup || remoteJid === (config.MGMT_GROUP || '');
          // 📱 מדריך Me — שלב 1: מספר טלפון (קולט גם תשובה להודעת הבוט, גם בתוך משפט)
          {
            const st = (!isGroup && svOk4) ? mePending.get(remoteJid) : null;
            const replying = isReplyToBot(msg);
            const fresh = st && (Date.now() - st.at < 15 * 60 * 1000 || (replying && Date.now() - st.at < 3600000));
            if (st?.stage === 'phone' && fresh) {
              // קוד שהוקלד כבר בשלב הטלפון + המספר ידוע → קפיצה ישר לאימות (נופל לבלוק הקוד)
              if (/^\d{4,8}$/.test(text.trim())) {
                const own = resolveOwnPhone(remoteJid);
                if (own) { st.phone = own; st.stage = 'code'; st.at = Date.now(); }
                else {
                  await sock.sendMessage(remoteJid, { text: `📱 קודם צריך את *מספר הטלפון שלך* (שלח ספרות, למשל 0501234567)` });
                  return;
                }
              }
              if (st.stage !== 'phone') {
                // עברנו לשלב קוד — לא ממשיכים בחילוץ מספר, נופלים לבלוק הבא
              } else {
              let d = null;
              if (/^\+?[\d\s\-()]{9,16}$/.test(text.trim())) d = svDigits(text);
              else if (replying) {
                const m = text.match(/\+?\d[\d\s\-()]{7,}\d/);
                if (m) d = svDigits(m[0]);
              }
              if (d) {
                st.stage = 'code'; st.phone = d; st.at = Date.now();
                await sock.sendMessage(remoteJid, { text:
                  `✅ קיבלתי: +${d}\n\n` +
                  `📩 *שלב 2:* שלח הודעת וואטסאפ למספר *+44 7427 928793* (כל טקסט, למשל "היי").\n\n` +
                  `🔢 *שלב 3:* תקבל קוד בן 6 ספרות — שלח אותו כאן כהודעה.` });
                return;
              }
              if (replying) {
                await sock.sendMessage(remoteJid, { text: `📱 לא קלטתי מספר בהודעה.\nשלח שוב את *מספר הטלפון שלך* (ספרות, למשל 0501234567)` });
                return;
              }
              } // סוף else (נשארנו בשלב טלפון)
            } else if (st?.stage === 'phone') mePending.delete(remoteJid);
          }
          // 🔢 מדריך Me — שלב 3: קוד (קולט גם תשובה להודעת הבוט)
          {
            const st = (!isGroup && svOk4) ? mePending.get(remoteJid) : null;
            if (st?.stage === 'code' && st.phone) {
              const replying = isReplyToBot(msg);
              let code = null;
              if (/^\d{4,8}$/.test(text.trim())) code = text.trim();
              else if (replying) { const m = text.match(/\d{4,8}/); if (m) code = m[0]; }
              const fresh = Date.now() - st.at < 15 * 60 * 1000 || (replying && Date.now() - st.at < 3600000);
              if (code && fresh) {
                mePending.delete(remoteJid);
                await sock.sendMessage(remoteJid, { text: `📇 מתחבר ל-Me...` });
                const r = await meCall('auth', [st.phone, code], 60000);
                if (r?.ok) {
                  await sock.sendMessage(remoteJid, { text: `✅ *מחובר ל-Me!*\n\nעכשיו שלח *מי שמר אותי* ואביא לך את הרשימה + קובץ לייבוא.` });
                } else {
                  mePending.set(remoteJid, { stage: 'code', phone: st.phone, at: Date.now() });
                  await sock.sendMessage(remoteJid, { text: `😢 הקוד לא התקבל (${(r?.error || 'שגיאה').slice(0, 100)}).\nהקודים פגים תוך דקות — בקש קוד טרי מ-+44 7427 928793 ושלח אותו מיד.` });
                }
                return;
              }
              if (replying && !code) {
                await sock.sendMessage(remoteJid, { text: `🔢 לא קלטתי קוד בהודעה.\nשלח את *הקוד בן 6 הספרות* שקיבלת מ-+44 7427 928793.` });
                return;
              }
              if (!fresh) mePending.delete(remoteJid);
            }
          }
          // 📇 !me-התחבר [מספר] — התחלת מדריך (עם מספר מדלגים לשלב 2)
          if (/^(me-התחבר|me-חבר|me-login)$/i.test((text.split(/\s+/)[0] || ''))) {
            if (!svOk4) { await sock.sendMessage(remoteJid, { text: `📇 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            const ph = svDigits(text.split(/\s+/)[1] || '');
            if (ph) {
              mePending.set(remoteJid, { stage: 'code', phone: ph, at: Date.now() });
              await sock.sendMessage(remoteJid, { text:
                `✅ קיבלתי: +${ph}\n\n` +
                `📩 *שלב 2:* שלח הודעת וואטסאפ למספר *+44 7427 928793* (כל טקסט, למשל "היי").\n\n` +
                `🔢 *שלב 3:* תקבל קוד בן 6 ספרות — שלח אותו כאן כהודעה.` });
            } else {
              mePending.set(remoteJid, { stage: 'phone', phone: '', at: Date.now() });
              await sock.sendMessage(remoteJid, { text:
                `🔍 *מי שמר אותך*\n\n` +
                `⚠️ *חובה להתחבר ל-Me קודם (פעם אחת, בחינם)* — בלי החיבור אין רשימה.\n\n` +
                
                `📱 *שלב 1:* שלח כאן את *מספר הטלפון שלך* (למשל 0501234567)` });
            }
            return;
          }
          // 🔢 !me-קוד <מספר> <קוד>
          {
            const m = text.match(/^(me-קוד|me-code)\s+(\+?[\d][\d\s\-()]{6,})\s+(\d{4,8})$/is);
            if (m) {
              if (!svOk4) { await sock.sendMessage(remoteJid, { text: `📇 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
              const digits = String(m[2]).replace(/\D/g, '');
              await sock.sendMessage(remoteJid, { text: `📇 מתחבר ל-Me...` });
              const r = await meCall('auth', [digits, m[3]], 60000);
              if (r?.ok) {
                mePending.delete(remoteJid);
                await sock.sendMessage(remoteJid, { text: `✅ *מחובר ל-Me${r.name ? ` כ"${r.name}"` : ''}!*\nעכשיו: ${prefix}מי-שמר-אותי לסריקה מלאה, או ${prefix}me-זהה <מספרים>.` });
              } else {
                await sock.sendMessage(remoteJid, { text: `😢 החיבור נכשל (${(r?.error || 'שגיאה').slice(0, 120)}).\nבדקו מספר/קוד ונסו שוב, או בקשו קוד חדש.` });
              }
              return;
            }
          }
          // 🚪 !me-נתק | 📶 !me-מצב
          if (/^(me-נתק|me-logout)$/i.test(text)) {
            if (!svOk4) { await sock.sendMessage(remoteJid, { text: `📇 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            try { fs.unlinkSync(new URL('./me-config.json', import.meta.url)); } catch {}
            try {
              const _sd = meSessionFor(effJid());
              if (_sd) fs.unlinkSync(new URL(`./me-sessions/${_sd}.json`, import.meta.url));
            } catch {}
            mePending.delete(remoteJid);
            await sock.sendMessage(remoteJid, { text: `🚪 החיבור ל-Me נותק ונמחק.` });
            return;
          }
          if (/^(me-מצב|me-סטטוס|me-status)$/i.test(text)) {
            if (!svOk4) { await sock.sendMessage(remoteJid, { text: `📇 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            const _sess0 = meSessionFor(effJid());
            const r = _sess0 ? await meCall('status', [], 25000, _sess0) : null;
            await sock.sendMessage(remoteJid, { text: r?.ok ? `📇 מחובר ל-Me${r.name ? ` כ"${r.name}"` : ''} ✅` : `📇 לא מחובר ל-Me.\nחבר עם: ${prefix}me-התחבר <המספר שלך>` });
            return;
          }
          // 🔍 !me-זהה <מספרים> — זיהוי עולמי (עד 5). בקבוצה מורשית רץ על חשבון ה-Me של הבעלים
          {
            const m = text.match(/^(me-זהה|me-זיהוי|me-search)(?:\s+([\s\S]+))?$/is);
            if (m) {
              const inAllowedGroup = isGroup && isGroupAllowed(remoteJid, true);
              if (!svOk4 && !inAllowedGroup) { await sock.sendMessage(remoteJid, { text: `📇 הפקודה עובדת בפרטי, בקבוצת הניהול או בקבוצה מורשית.` }); return; }
              const _sessZ = inAllowedGroup ? meSessionFor(OWNER_DIGITS + '@s.whatsapp.net') : meSessionFor(effJid());
              const st = _sessZ ? await meCall('status', [], 25000, _sessZ) : null;
              if (!st?.ok) {
                await sock.sendMessage(remoteJid, { text: inAllowedGroup
                  ? `📇 חשבון ה-Me של הבעלים לא מחובר כרגע.\n(הבעלים מתחבר בפרטי עם: ${prefix}me-התחבר <המספר שלו>)`
                  : `📇 קודם מתחברים: ${prefix}me-התחבר <המספר שלך>` });
                return;
              }
              const raws = (m[2] || '').match(/\+?[\d][\d\s\-()]{6,}/g) || [];
              const nums = [];
              for (const r of raws) {
                const d = svDigits(r);
                if (d && !nums.includes(d)) nums.push(d);
                if (nums.length >= 5) break;
              }
              if (!nums.length) { await sock.sendMessage(remoteJid, { text: `📇 כתוב: ${prefix}me-זהה <מספרים>\nלמשל: ${prefix}me-זהה 0501111111 +14155552671` }); return; }
              await sock.sendMessage(remoteJid, { text: `📇 מזהה ${nums.length} מספרים ברשת Me...` });
              const lines = [], vcfN = [];
              for (const d of nums) {
                const s = await meCall('search', [d], 30000, _sessZ);
                if (s?.ok && s?.found) {
                  let extra = '';
                  if (s.uuid) {
                    const p = await meCall('profile', [s.uuid], 30000, _sessZ);
                    if (p?.ok && p?.profile) {
                      const pf = p.profile;
                      if (pf.slogan) extra += `\n   📝 ${pf.slogan}`.slice(0, 100);
                      if (pf.location_name) extra += `\n   📍 ${pf.location_name}`.slice(0, 80);
                    }
                  }
                  lines.push(`✅ +${d} — *${s.name || 'ללא שם'}*${s.is_spam ? ' ⚠️ (דווח כספאם)' : ''}${extra}`);
                  vcfN.push({ digits: d, name: s.name || ('+' + d) });
                } else {
                  lines.push(`❓ +${d} — לא נמצא ברשת Me`);
                }
              }
              await sock.sendMessage(remoteJid, { text: `📇 *זיהוי Me:*\n` + lines.join('\n') });
              if (vcfN.length) {
                try {
                  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
                  await sock.sendMessage(remoteJid, {
                    document: Buffer.from(vcfN.map((v) => `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(v.name)}\nTEL;TYPE=CELL,VOICE:+${v.digits}\nEND:VCARD`).join('\n'), 'utf-8'),
                    mimetype: 'text/vcard',
                    fileName: 'me-identify.vcf',
                  });
                } catch {}
              }
              return;
            }
          }
        }

        // --- 🕵️ מי שמר אותי (דו"ח מהיר) + סריקה עמוקה (פרטי/ניהול) ---
        {
          const svOk2 = !isGroup || remoteJid === (config.MGMT_GROUP || '');
          // 🧠 הבנת כוונה: "מי שמר אותי" בכל ניסוח — גם בלי ! ובלי פקודה מדויקת (בפרטי; בקבוצה רק עם קידומת)
          const ntx = text.replace(/\s+/g, ' ').trim();
          const whoSavedIntent = /מי|מישהו/i.test(ntx) && /שמר|שומר|משמר|נשמר/i.test(ntx) && /אותי|אותך|המספר|עליי|הטלפון|אנשי קשר/i.test(ntx) && !/סטטוס|צפה|צפי|תמונה|הודעה|שיחה/i.test(ntx) && !/^(איך|למה|מתי|הסבר)/i.test(ntx);
          if (!usedPrefix && !mentioned && !isReplyToBot(msg) && !(whoSavedIntent && !isGroup)) {
            // משפט רגיל — לא לחטוף
          } else {
          { // scope פנימי
          // ⚡ !מי-שמר-אותי — דו"ח מהיר ומסודר (נתונים קיימים בלבד: Me + צופי סטטוס)
          if (/^(מי-שמר-אותי|מי-שמר|בדיקת-שמירה)$/i.test(text) || (whoSavedIntent && (!isGroup || usedPrefix))) {
            if (!svOk2) { await sock.sendMessage(remoteJid, { text: `🔍 הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            await sock.sendMessage(remoteJid, { text: `🔍 בודק מי שמר אותך...` });
            const contacts = myContactsLoad().nums || {};
            const selfD = svDigits(botJid) || '';
            const all = new Map(); // digits -> {name, src:Set}
            const put = (digits, name, src) => {
              if (!digits || digits === selfD) return;
              const e = all.get(digits) || { name: '', src: new Set() };
              if (name && !e.name) e.name = String(name).slice(0, 40);
              e.src.add(src);
              all.set(digits, e);
            };
            let delList = [], watList = [], tagsTop = [], meOn = false;
            const mySession = meSessionFor(effJid());
            if (mySession && (await meCall('status', [], 20000, mySession))?.ok) {
              meOn = true;
              const [un, del, wat, tags] = await Promise.all([
                meCall('unsaved', [], 30000, mySession), meCall('deleted', [], 30000, mySession),
                meCall('watched', [], 30000, mySession), meCall('tags', [], 30000, mySession),
              ]);
              for (const c of (un?.contacts || [])) put(meE164(c), (c?.name || '').trim(), 'me');
              const slim = (c) => ({ d: meE164(c), n: (c?.name || '').trim() });
              delList = (del?.contacts || []).map(slim).filter((x) => x.d || x.n);
              watList = (wat?.contacts || []).map(slim).filter((x) => x.d || x.n);
              for (const c of [...delList, ...watList]) if (c.d) put(c.d, c.n, 'me');
              tagsTop = (tags?.groups || []).slice(0, 5);
            }
            try {
              const db = svLoadViews();
              for (const it of Object.values(db.items || {})) {
                for (const v of Object.keys((it || {}).viewers || {})) {
                  const { digits } = svResolve(v);
                  put(digits, svNameCache.get(v) || '', 'status');
                }
              }
            } catch {}
            if (!meOn && all.size === 0) {
              // אין נתונים + לא מחובר — קולטים את המספר לבד; אם לא מצליחים — מבקשים
              const auto = actAsBot ? BOT_DIGITS : resolveOwnPhone(remoteJid);
              if (auto) {
                mePending.set(remoteJid, { stage: 'code', phone: auto, at: Date.now() });
                await sock.sendMessage(remoteJid, { text:
                  `🔍 *מי שמר אותך*\n\n` +
                `⚠️ *חובה להתחבר ל-Me קודם (פעם אחת, בחינם)* — בלי החיבור אין רשימה.\n\n` +
                  `קלטתי את המספר שלך לבד: +${auto} ✅\n\n` +
                  `📩 *שלב 2:* שלח הודעת וואטסאפ למספר *+44 7427 928793* (כל טקסט, למשל "היי").\n\n` +
                  `🔢 *שלב 3:* תקבל קוד בן 6 ספרות — שלח אותו כאן כהודעה (אפשר גם בתגובה להודעה זו).` });
              } else {
                mePending.set(remoteJid, { stage: 'phone', phone: '', at: Date.now() });
                await sock.sendMessage(remoteJid, { text:
                  `🔍 *מי שמר אותך*\n\n` +
                `⚠️ *חובה להתחבר ל-Me קודם (פעם אחת, בחינם)* — בלי החיבור אין רשימה.\n\n` +
                  
                  `📱 *שלב 1:* שלח כאן את *מספר הטלפון שלך* (אפשר גם בתגובה להודעה זו)` });
              }
              return;
            }
            let storeNames = {};
            try {
              const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
              for (const g of Object.values(s.groups || {})) Object.assign(storeNames, (g || {}).names || {});
            } catch {}
            const prettyNum = (d) => (d.startsWith('972') && d.length === 12 ? '0' + d.slice(3) : '+' + d);
            const nameFor = (d) => {
              const e = all.get(d);
              if (e?.name) return e.name;
              if (contacts[d]) return contacts[d];
              for (const [jid, nm] of Object.entries(storeNames)) {
                if (svResolve(jid).digits === d && nm) return String(nm).split(' ')[0];
              }
              return '';
            };
            const unsaved = [], savedN = [];
            for (const d of all.keys()) (contacts[d] ? savedN : unsaved).push(d);
            unsaved.sort((a, b) => ((all.get(b).src.has('status') ? 1 : 0) - (all.get(a).src.has('status') ? 1 : 0)) || String(nameFor(a) || prettyNum(a)).localeCompare(String(nameFor(b) || prettyNum(b)), 'he'));
            // 📌 אנשי קשר קבועים — תמיד בראש הדו"ח והקובץ
            for (const p of [{ d: '972503651436', name: 'מולטי בוט' }, { d: '972555655217', name: 'נריה כהן מפתח בוטים ואפליקציות' }]) {
              if (!all.has(p.d)) all.set(p.d, { name: p.name, src: new Set(['pin']) });
              else if (!all.get(p.d).name) all.get(p.d).name = p.name;
              all.get(p.d).src.add('pin');
              const ix = unsaved.indexOf(p.d);
              if (ix !== -1) unsaved.splice(ix, 1);
              unsaved.unshift(p.d);
            }
            const hh = new Date().toTimeString().slice(0, 5);
            let out = `🔍 *מי שמר אותך* (מעודכן ל־${hh})\n`;
            if (unsaved.length) {
              out += `\n📇 *שמרו אותך ולא שמורים אצלך (${unsaved.length}):*\n` +
                unsaved.slice(0, 20).map((d) => {
                  const nm = nameFor(d);
                  const mark = all.get(d).src.has('status') ? '✅ ' : (all.get(d).src.has('pin') ? '📌 ' : '');
                  return `• ${mark}${nm ? `*${nm}* — ` : ''}${prettyNum(d)}`;
                }).join('\n') + (unsaved.length > 20 ? `\n…ועוד ${unsaved.length - 20} בקובץ המצורף` : '');
            } else {
              out += `\n📇 אין כרגע רשומות על שומרים לא־שמורים.`;
            }
            if (savedN.length) out += `\n\n👥 שמורים אצלך שמזוהים כשומרים: ${savedN.length}`;
            if (delList.length) out += `\n🗑️ מחקו אותך מאנשי קשר: ${delList.length}` + (delList.some((x) => x.n) ? ` (${delList.slice(0, 5).map((x) => x.n || '?').join(', ')})` : '');
            if (watList.length) out += `\n👁️ צפו בפרופיל Me שלך: ${watList.length}`;
            if (tagsTop.length) out += `\n🏷️ קראו לך: ` + tagsTop.map((g) => `"${g.name}" ×${g.count}`).join(' · ');
            if (!meOn) out += `\n\n📇 חבר Me (${prefix}me-התחבר) לרשימת שומרים עולמית.`;
            if (!Object.keys(contacts).length) out += `\n📇 שלח קובץ VCF מאנשי הקשר לדיוק "שמור/לא שמור".`;
            if (!unsaved.length && !delList.length && !watList.length) out += `\n\n💡 פרסם סטטוס מהטלפון ואז בדוק שוב — צופים = ודאי ✅.`;
            out += `\n\n_✅ = צפה בסטטוס (ודאי). לסריקת חברי קבוצות: ${prefix}סריקה-עמוקה_`;
            await sock.sendMessage(remoteJid, { text: out });
            if (unsaved.length) {
              try {
                const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
                const vcf = unsaved.map((d) => `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(nameFor(d) || prettyNum(d))}\nTEL;TYPE=CELL,VOICE:+${d}\nEND:VCARD`).join('\n');
                await sock.sendMessage(remoteJid, {
                  document: Buffer.from(vcf, 'utf-8'),
                  mimetype: 'text/vcard',
                  fileName: 'saved-me.vcf',
                });
              } catch {}
            }
            return;
          }
          const isDeep = /^(סריקה[\s-]+(עמוקה|מעמיקה)|deep-scan)(?:\s+(\d+))?$/i.test(text);
          const mExp = text.match(/^בדוק[\s-]+(שמירה|שמר)(?:\s+([\s\S]+))?$/is);
          if (isDeep || mExp) {
            if (!svOk2) { await sock.sendMessage(remoteJid, { text: `🕵️ הפקודה עובדת רק בפרטי או בקבוצת הניהול.` }); return; }
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            const contacts = myContactsLoad().nums || {};
            const selfD = svDigits(botJid) || '';
            // 1️⃣ מועמדים: צופי סטטוס (ודאיים) + חברי קבוצות לא-שמורים + מספרים מפורשים
            const cand = new Map(); // digits -> {confirmed}
            try {
              const db = svLoadViews();
              for (const it of Object.values(db.items || {})) {
                for (const v of Object.keys((it || {}).viewers || {})) {
                  const { digits } = svResolve(v);
                  if (digits && digits !== selfD) cand.set(digits, { confirmed: true });
                }
              }
            } catch {}
            if (mExp) {
              const raws = (mExp[2] || '').match(/\+?[\d][\d\s\-()]{6,}/g) || [];
              for (const r of raws) {
                const d = svDigits(r);
                if (d && d !== selfD && !cand.has(d)) cand.set(d, { confirmed: false });
              }
            } else {
              try {
                const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
                for (const g of Object.values(s.groups || {})) {
                  for (const jid of Object.keys((g || {}).names || {})) {
                    const dom = String(jid).split('@')[1] || '';
                    if (dom !== 's.whatsapp.net' && dom !== 'lid') continue;
                    const { digits } = svResolve(jid);
                    if (!digits || digits === selfD || contacts[digits] || cand.has(digits)) continue;
                    cand.set(digits, { confirmed: false });
                  }
                }
              } catch {}
            }
            let list = [...cand.entries()].map(([digits, v]) => ({ digits, jid: `${digits}@s.whatsapp.net`, ...v }));
            // ודאיים קודם, אחר כך לפי סדר
            list.sort((a, b) => (b.confirmed ? 1 : 0) - (a.confirmed ? 1 : 0));
            const maxN = mExp ? 15 : Math.min(80, Math.max(5, parseInt((text.match(/(\d+)\s*$/) || [])[1] || '30', 10)));
            list = list.slice(0, maxN);
            if (!list.length) {
              await sock.sendMessage(remoteJid, { text: `🕵️ אין את מי לבדוק.\n• פרסם סטטוס ואז ${prefix}מי-שמר-אותי (צופים = ודאי)\n• או: ${prefix}בדוק-שמירה <מספרים>` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: `🕵️ סורק ${list.length} מספרים... (כחצי דקה)` });
            // 📇 שכבת Me (רשת עולמית — שמרו אותך / מחקו / צפו / תגיות) — רק בסריקה מלאה
            let meSection = '';
            const meGoodsMap = new Map();
            if (!mExp) {
              const _sessD = meSessionFor(effJid());
              const meSt = _sessD ? await meCall('status', [], 20000, _sessD) : null;
              if (meSt?.ok) {
                const un = await meCall('unsaved', [], 30000, _sessD);
                const del = await meCall('deleted', [], 30000, _sessD);
                const wat = await meCall('watched', [], 30000, _sessD);
                const tags = await meCall('tags', [], 30000, _sessD);
                const meNum = (d) => (d.startsWith('972') && d.length === 12 ? '0' + d.slice(3) : '+' + d);
                if (un?.ok && Array.isArray(un.contacts) && un.contacts.length) {
                  const fresh = un.contacts.filter((c) => {
                    const d = meE164(c);
                    return d && !contacts[d] && !meGoodsMap.has(d);
                  });
                  for (const c of fresh) {
                    const d = meE164(c);
                    meGoodsMap.set(d, (c?.name || '').trim() || meNum(d));
                  }
                  if (fresh.length) {
                    meSection += `\n\n📇 *רשת Me — שמרו אותך ולא שמורים אצלך (${fresh.length}):*\n` +
                      fresh.slice(0, 20).map((c) => {
                        const d = meE164(c);
                        const nm = (c?.name || '').trim();
                        return `• ${nm ? `*${nm}* — ` : ''}${meNum(d)}`;
                      }).join('\n') + (fresh.length > 20 ? `\n...ועוד ${fresh.length - 20}` : '');
                  }
                }
                if (del?.ok && Array.isArray(del.contacts) && del.contacts.length) {
                  meSection += `\n\n🗑️ *מחקו אותך מאנשי קשר (${del.contacts.length}):*\n` +
                    del.contacts.slice(0, 10).map((c) => `• ${(c?.name || '').trim() || 'ללא שם'}`).join('\n') +
                    (del.contacts.length > 10 ? `\n...ועוד ${del.contacts.length - 10}` : '');
                }
                if (wat?.ok && Array.isArray(wat.contacts) && wat.contacts.length) {
                  meSection += `\n\n👁️ *צפו בפרופיל Me שלך (${wat.contacts.length}):*\n` +
                    wat.contacts.slice(0, 10).map((c) => `• ${(c?.name || '').trim() || 'ללא שם'}`).join('\n') +
                    (wat.contacts.length > 10 ? `\n...ועוד ${wat.contacts.length - 10}` : '');
                }
                if (tags?.ok && Array.isArray(tags.groups) && tags.groups.length) {
                  meSection += `\n\n🏷️ *איך אחרים קראו לך:*\n` +
                    tags.groups.slice(0, 8).map((g) => `• "${g.name}" ×${g.count}`).join('\n');
                }
                if (!meSection) meSection = `\n\n📇 *רשת Me:* אין נתונים חדשים.`;
              } else {
                meSection = `\n\n📇 *רשת Me:* לא מחובר — חבר עם ${prefix}me-התחבר לסריקת רשת עולמית.`;
              }
            }
            // 2️⃣ הרשמה לנוכחות (נראות "אחרונה" תיאסף תוך כדי הבדיקות)
            for (const c of list) {
              try { await sock.presenceSubscribe(c.jid); } catch {}
              await sleep(120);
            }
            // 3️⃣ בדיקות לכל מספר
            const res = [];
            for (const c of list) {
              const r = { ...c, photo: 0, about: '', seen: false };
              try { await sock.profilePictureUrl(c.jid, 'preview', 12000); r.photo = 2; }
              catch (e) { r.photo = /401|403/.test(String(e?.message || e)) ? -2 : 0; }
              try {
                const st = await sock.fetchStatus(c.jid).catch(() => null);
                const arr = Array.isArray(st) ? st : (st ? [st] : []);
                const t = (arr[0]?.status || '').trim();
                if (t) r.about = t.slice(0, 60);
              } catch {}
              res.push(r);
              await sleep(600);
            }
            await sleep(4000);
            const now = Date.now();
            for (const r of res) {
              const ps = presenceSeen.get(r.digits);
              if (ps && now - ps.at < 120000) r.seen = true;
              r.score = (r.confirmed ? 10 : 0) + r.photo + (r.about ? 1 : 0) + (r.seen ? 3 : 0);
            }
            // 4️⃣ שמות
            let storeNames = {};
            try {
              const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
              for (const g of Object.values(s.groups || {})) Object.assign(storeNames, (g || {}).names || {});
            } catch {}
            const nameOf = (r) => {
              if (contacts[r.digits]) return contacts[r.digits];
              for (const [jid, nm] of Object.entries(storeNames)) {
                const { digits } = svResolve(jid);
                if (digits === r.digits && nm) return String(nm).split(' ')[0];
              }
              return svNameCache.get(r.jid) || '';
            };
            // Truecaller לשמות חסרים (אם מחובר) — רק לודאיים/סבירים
            const needTc = res.filter((r) => r.score >= 3 && !nameOf(r)).slice(0, 8);
            if (needTc.length) {
              try {
                const iid = tcSessionId();
                if (iid) {
                  const mod = await import('truecallerjs');
                  const lib = mod.default || mod;
                  for (const r of needTc) {
                    try {
                      const f = await lib.search({ number: r.digits.startsWith('972') ? r.digits.slice(3) : r.digits, countryCode: r.digits.startsWith('972') ? 'IL' : 'IL', installationId: iid });
                      let nm = '';
                      try { nm = (f.getName() || '').trim(); } catch {}
                      if (nm && !/^unknown/i.test(nm)) { r.tcName = nm; }
                    } catch {}
                    await sleep(500);
                  }
                }
              } catch {}
            }
            const prettyNum = (d) => (d.startsWith('972') && d.length === 12 ? '0' + d.slice(3) : '+' + d);
            const sure = res.filter((r) => r.score >= 10);
            const likely = res.filter((r) => r.score >= 3 && r.score < 10);
            const unclear = res.filter((r) => r.score > 0 && r.score < 3);
            const not = res.filter((r) => r.score <= 0);
            const line = (r) => {
              const nm = r.tcName || nameOf(r);
              return `• ${nm ? `*${nm}* — ` : ''}${prettyNum(r.digits)}`;
            };
            let out = `🕵️ *מי שמר אותך (נבדקו ${res.length}):*\n`;
            if (sure.length) out += `\n✅ *ודאי — צפו בסטטוס (${sure.length}):*\n` + sure.map(line).join('\n');
            if (likely.length) out += `\n\n🟡 *כנראה שמרו (${likely.length}):*\n` + likely.map(line).join('\n');
            if (unclear.length) out += `\n\n⚪ *לא ברור (${unclear.length}):*\n` + unclear.map(line).join('\n');
            if (not.length) out += `\n\n❌ *כנראה לא שמרו (${not.length}):*\n` + not.slice(0, 15).map(line).join('\n') + (not.length > 15 ? `\n...ועוד ${not.length - 15}` : '');
            out += meSection + `\n\n_ודאי = צפה בסטטוס. השאר משוער לפי נראות פרופיל/אודות/אחרונה._`;
            await sock.sendMessage(remoteJid, { text: out });
            // 📇 קובץ לייבוא — ודאיים + סבירים + רשת Me
            const goodMap = new Map();
            for (const r of [...sure, ...likely]) {
              if (r.digits && !goodMap.has(r.digits)) goodMap.set(r.digits, r.tcName || nameOf(r) || prettyNum(r.digits));
            }
            for (const [d, nm] of meGoodsMap) if (!goodMap.has(d)) goodMap.set(d, nm);
            const good = [...goodMap.entries()].map(([digits, nm]) => ({ digits, nm }));
            if (good.length) {
              try {
                const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
                const vcf = good.map((r) => `BEGIN:VCARD\nVERSION:3.0\nFN:${esc(r.nm)}\nTEL;TYPE=CELL,VOICE:+${r.digits}\nEND:VCARD`).join('\n');
                await sock.sendMessage(remoteJid, {
                  document: Buffer.from(vcf, 'utf-8'),
                  mimetype: 'text/vcard',
                  fileName: 'saved-me.vcf',
                });
              } catch {}
            }
            return;
          }
          } // סוף scope פנימי
          } // סוף else
        }

        // --- 📣 אמור — שליחה דרך הבוט, רק בקבוצת הניסוי ---
        {
          const TEST_JID = TEST_GROUP_JID; // ניסוי מולטי בוט — בלבד
          const sender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          const senderIsTestAdmin = async () => {
            try { return await isSenderAdmin(sock, TEST_JID, sender); } catch { return false; }
          };
          // בתוך קבוצת הניסוי: !אמור <טקסט> (מנהלים בלבד; מקבל גם אמור-בניסוי בטעות)
          {
            const m = text.match(/^אמור(?:-בניסוי)?[\s-]+([\s\S]+)$/is);
            if (m && isGroup && remoteJid === TEST_JID) {
              if (!(await senderIsTestAdmin())) { await sock.sendMessage(remoteJid, { text: `⛔ רק מנהלים.` }); return; }
              const body = (m[1] || '').trim().slice(0, 1000);
              if (!body) { await sock.sendMessage(remoteJid, { text: `📣 כתוב: ${prefix}אמור <טקסט>` }); return; }
              try { await sock.sendMessage(remoteJid, { delete: msg.key }); } catch {}
              await sock.sendMessage(TEST_JID, { text: body });
              return;
            }
          }
          // מבחוץ (פרטי/ניהול): !אמור-בניסוי <טקסט> — רק מנהל של קבוצת הניסוי
          {
            const m = text.match(/^אמור-בניסוי[\s-]+([\s\S]+)$/is);
            if (m) {
              if (isGroup) { await sock.sendMessage(remoteJid, { text: `📣 הפקודה הזו לפרטי/ניהול. בתוך הקבוצה: ${prefix}אמור <טקסט>` }); return; }
              if (!(await senderIsTestAdmin())) { await sock.sendMessage(remoteJid, { text: `⛔ רק מנהל של קבוצת הניסוי.` }); return; }
              const body = (m[1] || '').trim().slice(0, 1000);
              if (!body) { await sock.sendMessage(remoteJid, { text: `📣 כתוב: ${prefix}אמור-בניסוי <טקסט>` }); return; }
              await sock.sendMessage(TEST_JID, { text: body });
              await sock.sendMessage(remoteJid, { text: `✅ נשלח לקבוצת הניסוי.` });
              return;
            }
          }
        }

        // --- 👑👑 ניהול מרחוק — שליטה בכל קבוצה מקבוצת הניהול ---
        {
          const MGMT = config.MGMT_GROUP || '';
          const isMgmt = MGMT && remoteJid === MGMT;
          const needMgmt = async () => {
            if (isMgmt) return true;
            await sock.sendMessage(remoteJid, { text: `👑 פקודה זו רק בקבוצת הניהול.` });
            return false;
          };
          const allGroups = () => {
            let store = {};
            try { store = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8')); } catch {}
            const out = new Map();
            for (const [jid, g] of Object.entries(store.groups || {})) {
              if (!jid.endsWith('@g.us')) continue;
              out.set(jid, { subject: g.subject || '', live: !!(store.knownGroups || {})[jid] });
            }
            for (const [jid, k] of Object.entries(store.knownGroups || {})) {
              if (!out.has(jid)) out.set(jid, { subject: (k || {}).subject || '', live: true });
            }
            return [...out.entries()].map(([jid, v]) => ({ jid, ...v }));
          };
          const resolveGroup = (qq) => {
            const q = String(qq || '').trim();
            if (!q) return { err: 'empty' };
            if (/^\d+@g\.us$/.test(q)) return { jid: q };
            if (/^\d{1,3}$/.test(q)) {
              const arr = mgmtGroupList.get(remoteJid);
              if (arr && arr[+q - 1]) return { jid: arr[+q - 1] };
              return { err: 'no-list' };
            }
            const all = allGroups();
            const hits = all.filter((g) => (g.subject || '').includes(q));
            if (hits.length === 1) return { jid: hits[0].jid };
            if (!hits.length) return { err: 'none' };
            return { err: 'many', hits: hits.slice(0, 8) };
          };
          const resolveUser = () => {
            try {
              const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
              const men = (ctx.mentionedJid || []).filter((j) => j && j !== botJid);
              if (men[0]) return men[0];
              if (ctx.participant) return ctx.participant;
            } catch {}
            return null;
          };
          const pOnOff = (s) => {
            const t = (s || '').trim();
            if (/^(on|הפעל|כן|פעיל)$/i.test(t)) return true;
            if (/^(off|כבה|לא|כבוי)$/i.test(t)) return false;
            return null;
          };
          const settingsText = (tjid) => {
            const gd = gdata(tjid);
            const on = (v) => (v ? 'פעיל ✅' : 'כבוי');
            const subj = gd.subject || gname(tjid) || tjid;
            if (!gd.subject) gnameLive(tjid).catch(() => {});
            return `🛡️ *${subj}:*\n\n` +
              `🔗 קישורים: *${on(gd.toggles.antilink)}*\n` +
              `🤬 קללות: *${on(gd.toggles.anticurse)}*\n` +
              `🌊 ספאם: *${on(gd.toggles.antispam)}*\n` +
              `👋 ברוכים: *${on(gd.toggles.welcome)}*\n` +
              `🔗 מותרים: ${gd.linkAllow.length ? gd.linkAllow.join(', ') : '—'}\n` +
              `⚠️ מוזהרים: ${Object.keys(gd.warns || {}).length} · 🔇 מושתקים: ${gd.muted.length}\n` +
              `📜 חוקים: ${gd.rules ? 'מוגדר ✅' : 'לא מוגדר'}`;
          };
          // 📋 !קבוצות — רשימת כל הקבוצות עם מספרים
          if (/^(קבוצות|רשימת-קבוצות|groups)$/i.test(text)) {
            if (!(await needMgmt())) return;
            const all = allGroups().sort((a, b) => String(a.subject || a.jid).localeCompare(String(b.subject || b.jid), 'he'));
            mgmtGroupList.set(remoteJid, all.map((g) => g.jid));
            setTimeout(() => { if (mgmtGroupList.get(remoteJid)) mgmtGroupList.delete(remoteJid); }, 10 * 60 * 1000).unref?.();
            // רענון שמות ברקע (שלא יוצגו id-ים)
            (async () => {
              try {
                for (const g of all.slice(0, 40)) {
                  if (g.subject) continue;
                  const mm = await sock.groupMetadata(g.jid).catch(() => null);
                  if (mm?.subject) mergeKnownGroups({ [g.jid]: { subject: String(mm.subject).slice(0, 80), at: Date.now() } });
                }
              } catch {}
            })().catch(() => {});
            const allowed = new Set(config.ALLOWED_GROUPS || []);
            await sock.sendMessage(remoteJid, { text:
              `👥 *קבוצות (${all.length}):*\n` +
              all.slice(0, 40).map((g, i) => `${i + 1}. ${g.subject || '(טוען שם...)'}${allowed.has(g.jid) ? ' ✅' : ''}`).join('\n') +
              (all.length > 40 ? `\n...ועוד ${all.length - 40}` : '') +
              `\n\nשליטה: ${prefix}לקבוצה <מספר/שם> <פקודה>` });
            return;
          }
          /** שם קבוצה מהמטמון (לעולם לא id גולמי אם יש שם). */
          const gname = (jid) => {
            try {
              const s = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8'));
              const n = (s.groups?.[jid]?.subject) || (s.knownGroups?.[jid]?.subject) || '';
              if (n) return n;
            } catch {}
            return '';
          };
          /** שם קבוצה טרי (עם שליפה חיה + שמירה). */
          const gnameLive = async (jid) => {
            const c = gname(jid);
            if (c) return c;
            try {
              const mm = await sock.groupMetadata(jid);
              if (mm?.subject) {
                mergeKnownGroups({ [jid]: { subject: String(mm.subject).slice(0, 80), at: Date.now() } });
                return String(mm.subject).slice(0, 80);
              }
            } catch {}
            return jid;
          };
          const setAllowed = (jid, on) => {
            const arr = (config.ALLOWED_GROUPS || []).filter(Boolean);
            const has = arr.includes(jid);
            if (on && !has) arr.push(jid);
            if (!on && has) arr.splice(arr.indexOf(jid), 1);
            config.ALLOWED_GROUPS = arr;
            persistEnv('ALLOWED_GROUPS', arr.join(','));
            saveStore();
            return { arr, changed: on !== has };
          };
          // ➕ !הצטרף <קישור> — הבוט מצטרף לקבוצה ומאשר אותה מיד
          {
            const m = text.match(/^(הצטרף|הצטרפות|join)(?:\s+([\s\S]+))?$/is);
            if (m) {
              if (!(await needMgmt())) return;
              const link = m[2] || (msg.message?.extendedTextMessage?.contextInfo ? '' : '');
              const code = (link.match(/(?:chat\.whatsapp\.com\/|invite\/)([A-Za-z0-9]{10,})/) || [])[1] || '';
              if (!code) {
                await sock.sendMessage(remoteJid, { text: `➕ שלח: ${prefix}הצטרף <קישור הזמנה>\nלמשל: ${prefix}הצטרף https://chat.whatsapp.com/XXXX` });
                return;
              }
              try {
                await sock.sendMessage(remoteJid, { text: `➕ מצטרף...` });
                const jid = await sock.groupAcceptInvite(code);
                const nm = await gnameLive(jid);
                setAllowed(jid, true);
                await sock.sendMessage(remoteJid, { text: `✅ הצטרפתי ל"${nm}" ואישרתי אותה.\nשליטה: ${prefix}לקבוצה ${nm.slice(0, 20)} הגדרות` });
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: `😢 ההצטרפות נכשלה (${String(e?.message || e).slice(0, 100)}).\nבדוק שהקישור תקין ולא פג תוקף.` });
              }
              return;
            }
          }
          // ✅❌ !אשר / !בטל-אישור <מספר/שם>
          {
            const m = text.match(/^(אשר|אשר-קבוצה|approve)(?:\s+([\s\S]+))?$|^(בטל-אישור|בטל-אישור-קבוצה|unapprove)(?:\s+([\s\S]+))?$/is);
            if (m) {
              if (!(await needMgmt())) return;
              const on = !!m[1];
              const r = resolveGroup(m[2] || m[4] || '');
              if (r.err) { await sock.sendMessage(remoteJid, { text: `😢 לא זוהתה קבוצה. קודם ${prefix}קבוצות.` }); return; }
              const nm = await gnameLive(r.jid);
              setAllowed(r.jid, on);
              await sock.sendMessage(remoteJid, { text: on ? `✅ "${nm}" אושרה — הבוט פעיל בה.` : `🚫 האישור של "${nm}" בוטל.` });
              return;
            }
          }
          // 🚪 !עזוב <מספר/שם> — יציאה + הסרת אישור
          {
            const m = text.match(/^(עזוב|עזוב-קבוצה|leave)(?:\s+([\s\S]+))?$/is);
            if (m) {
              if (!(await needMgmt())) return;
              const r = resolveGroup(m[2] || '');
              if (r.err) { await sock.sendMessage(remoteJid, { text: `😢 לא זוהתה קבוצה. קודם ${prefix}קבוצות.` }); return; }
              const nm = await gnameLive(r.jid);
              try { await sock.groupLeave(r.jid); } catch {}
              setAllowed(r.jid, false);
              await sock.sendMessage(remoteJid, { text: `🚪 יצאתי מ"${nm}" והסרתי אישור.` });
              return;
            }
          }
          // 🎯 !לקבוצה <יעד> <פקודה>
          {
            const m = text.match(/^(לקבוצה|לקבוצת|לקבוץ|togroup)\s+(\S+)\s+([\s\S]+)$/is);
            if (m) {
              if (!(await needMgmt())) return;
              const r = resolveGroup(m[2]);
              if (r.err === 'empty' || r.err === 'no-list') {
                await sock.sendMessage(remoteJid, { text: `🎯 כתוב: ${prefix}לקבוצה <מספר מהרשימה / שם / JID> <פקודה>\nקודם ${prefix}קבוצות לרשימה.` });
                return;
              }
              if (r.err === 'none') {
                await sock.sendMessage(remoteJid, { text: `🎯 לא נמצאה קבוצה בשם "${m[2].slice(0, 40)}".\n${prefix}קבוצות לרשימה.` });
                return;
              }
              if (r.err === 'many') {
                await sock.sendMessage(remoteJid, { text: `🎯 כמה תוצאות, דייק:\n` + r.hits.map((h) => `• ${h.subject || h.jid}`).join('\n') });
                return;
              }
              const tjid = r.jid;
              const gd = gdata(tjid);
              const parts = m[3].trim().split(/\s+/);
              const cmd = (parts[0] || '').replace(/^[!\-/]/, '');
              const rest = m[3].trim().slice(parts[0].length).trim();
              const done = async (t) => { await sock.sendMessage(remoteJid, { text: t }); };
              const tg = { 'קישורים': 'antilink', 'קללות': 'anticurse', 'ספאם-קשוח': 'antispam', 'ספאם': 'antispam', 'ברוכים': 'welcome', 'ברוכים-הבאים': 'welcome' };
              if (cmd === 'הגדרות') { await done(settingsText(tjid)); return; }
              if (tg[cmd] !== undefined) {
                if (!rest) { await done(`${tg[cmd]}: ${gd.toggles[tg[cmd]] ? 'פעיל ✅' : 'כבוי'} (${prefix}לקבוצה ... ${cmd} on/off)`); return; }
                const v = pOnOff(rest);
                if (v === null) { await done(`😢 כתוב on/off.`); return; }
                gd.toggles[tg[cmd]] = v;
                saveStore();
                await done(`✅ ${cmd} ${v ? 'הופעל' : 'כובה'} בקבוצה.`);
                return;
              }
              if (cmd === 'קישורים-מותרים' || cmd === 'לינקים-מותרים') {
                if (!rest || /^(הצג|רשימה)$/i.test(rest)) {
                  await done(`🔗 מותרים: ${gd.linkAllow.length ? gd.linkAllow.join(', ') : '—'}`);
                  return;
                }
                if (/^(נקה|נקי|clear)$/i.test(rest)) gd.linkAllow = [];
                else gd.linkAllow = rest.split(/[,|\s]+/).map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()).filter((d) => d.includes('.')).slice(0, 30);
                saveStore();
                await done(`🔗 מותרים: ${gd.linkAllow.length ? gd.linkAllow.join(', ') : '—'}`);
                return;
              }
              if (cmd === 'אזהרות' || cmd === 'אזהרה') {
                const w = gd.warns || {};
                const keys = Object.keys(w);
                await done(keys.length ? `⚠️ מוזהרים:\n` + keys.map((u) => `• ${gd.names?.[u]?.split(' ')[0] || u.split('@')[0]} — ${w[u]}/3`).join('\n') : `⚠️ אין מוזהרים.`);
                return;
              }
              if (cmd === 'נקה-אזהרות' || cmd === 'נקה-אזהרה') {
                const u = resolveUser();
                if (u && gd.warns?.[u]) { delete gd.warns[u]; saveStore(); await done(`⚠️ נוקה.`); }
                else { gd.warns = {}; saveStore(); await done(`⚠️ נוקו כל האזהרות.`); }
                return;
              }
              if (cmd === 'השתק' || cmd === 'השתקה') {
                const u = resolveUser();
                if (!u) { await done(`🔇 תייג משתמש להשתקה.`); return; }
                if (!gd.muted) gd.muted = [];
                if (!gd.muted.includes(u)) gd.muted.push(u);
                saveStore();
                await done(`🔇 הושתק.`);
                return;
              }
              if (cmd === 'שחרר' || cmd === 'שחרור') {
                const u = resolveUser();
                if (u) gd.muted = (gd.muted || []).filter((x) => x !== u);
                else gd.muted = [];
                saveStore();
                await done(`🔊 שוחרר.`);
                return;
              }
              if (cmd === 'חוקים') {
                if (!rest) { await done(`📜 חוקים:\n${gd.rules || '(לא מוגדר)'}`); return; }
                gd.rules = rest.slice(0, 500);
                saveStore();
                await done(`📜 החוקים עודכנו.`);
                return;
              }
              if (cmd === 'פיצרים' || cmd === 'פיצ׳רים') {
                const f = gd.features || {};
                await done(`🧩 *פיצ׳רים (ברירת מחדל הכל פעיל):*\n` + FEATURES.map(([k, label]) => `${f[k] === false ? '❌' : '✅'} ${label} (\`${k}\`)`).join('\n') + `\n\nשינוי: ${prefix}לקבוצה ... פיצר ${'<name>'} on/off`);
                return;
              }
              if (cmd === 'פיצר' || cmd === 'פיצ׳ר') {
                const [k, v] = rest.split(/\s+/);
                const known = FEATURES.map(([kk]) => kk);
                if (!k || !known.includes(k)) { await done(`🧩 שמות: ${known.join(', ')}`); return; }
                if (!v) { await done(`🧩 ${k}: ${((gd.features || {})[k] !== false) ? 'פעיל ✅' : 'כבוי ❌'}`); return; }
                const vv = pOnOff(v);
                if (vv === null) { await done(`😢 on/off.`); return; }
                gd.features = gd.features || {};
                gd.features[k] = vv;
                saveStore();
                await done(`🧩 ${k} ${vv ? 'הופעל ✅' : 'כובה ❌'}.`);
                return;
              }
              await done(`🎯 פקודות: הגדרות · קישורים/קללות/ספאם/ברוכים on/off · קישורים-מותרים · אזהרות · נקה-אזהרות · השתק/שחרר (עם תיוג) · חוקים · פיצרים · פיצר`);
              return;
            }
          }
          // 📊 !מערכת — מצב הבוט
          if (/^(מערכת|סטטוס-מערכת|system)$/i.test(text)) {
            if (!(await needMgmt())) return;
            let store = {};
            try { store = JSON.parse(fs.readFileSync(new URL('./bot-store.json', import.meta.url), 'utf-8')); } catch {}
            const mem = process.memoryUsage();
            const up = Math.floor(process.uptime());
            const uh = Math.floor(up / 3600), um = Math.floor((up % 3600) / 60);
            await sock.sendMessage(remoteJid, { text:
              `📊 *מערכת:*\n` +
              `⏱️ פעיל: ${uh} שע׳ ${um} דק׳\n` +
              `🧠 זיכרון: ${Math.round(mem.rss / 1048576)}MB\n` +
              `🟢 Node ${process.version}\n` +
              `👥 קבוצות בסטור: ${Object.keys(store.groups || {}).length}\n` +
              `✅ מורשות: ${(config.ALLOWED_GROUPS || []).length}\n` +
              `🧠 נלמדו: ${(store.learned || []).length} · 📚 תוכן: ${Object.values(store.contentLib || {}).reduce((a, b) => a + b.length, 0)}` });
            return;
          }
          // 📜 !לוג — שורות אחרונות
          {
            const m = text.match(/^(לוג|יומן-מערכת|logs?)(?:\s+(\d+))?$/is);
            if (m) {
              if (!(await needMgmt())) return;
              try {
                const { exec: _exec } = await import('node:child_process');
                const n = Math.min(40, Math.max(5, parseInt(m[2] || '15', 10)));
                _exec(`journalctl --user -u whatsapp-ai-bot.service --no-pager -n ${n} 2>&1 | tail -${n}`, (e, out) => {
                  sock.sendMessage(remoteJid, { text: `📜 *לוג (${n} אחרונות):*\n\`\`\`\n${String(out || e?.message || '').slice(-1500)}\n\`\`\`` }).catch(() => {});
                });
              } catch {
                await sock.sendMessage(remoteJid, { text: `📜 הלוג לא זמין.` });
              }
              return;
            }
          }
          // 💾 !גיבוי — שמירת bot-store
          if (/^(גיבוי|גבה|backup)$/i.test(text)) {
            if (!(await needMgmt())) return;
            try {
              const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
              const src = new URL('./bot-store.json', import.meta.url);
              const dst = new URL(`./bot-store.bak-${stamp}.json`, import.meta.url);
              fs.copyFileSync(src, dst);
              const sz = Math.round(fs.statSync(dst).size / 1024);
              await sock.sendMessage(remoteJid, { text: `💾 גובה! (${sz}KB)\nbot-store.bak-${stamp}.json` });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 הגיבוי נכשל.` });
            }
            return;
          }
          // ✏️ !שם-בוט / !קידומת — עם הפעלה מחדש אוטומטית
          {
            const m = text.match(/^(שם-בוט|שם בוט|botname)\s+([\s\S]+)$/is);
            if (m) {
              if (!(await needMgmt())) return;
              persistEnv('BOT_NAME', m[2].trim().slice(0, 40));
              config.BOT_NAME = m[2].trim().slice(0, 40);
              await sock.sendMessage(remoteJid, { text: `✏️ השם עודכן ל"${config.BOT_NAME}". מפעיל מחדש...` });
              setTimeout(() => process.exit(0), 1500);
              return;
            }
          }
          {
            const m = text.match(/^(קידומת|פרפיקס|prefix)\s+(\S)$/is);
            if (m) {
              if (!(await needMgmt())) return;
              persistEnv('BOT_PREFIX', m[2]);
              config.BOT_PREFIX = m[2];
              await sock.sendMessage(remoteJid, { text: `✏️ הקידומת עודכנה ל"${m[2]}". מפעיל מחדש...` });
              setTimeout(() => process.exit(0), 1500);
              return;
            }
          }
          // 🔄 !הפעל-מחדש
          if (/^(הפעל-מחדש|ריסטארט|restart)$/i.test(text)) {
            if (!(await needMgmt())) return;
            await sock.sendMessage(remoteJid, { text: `🔄 מפעיל מחדש...` });
            setTimeout(() => process.exit(0), 1200);
            return;
          }
        }

        // --- עזרה ---
        if (/^(עזרה|תפריט|help|menu|התחל|start)$/i.test(text)) {
          // עזרה קצרה — רשימת יכולות בלבד
          await sock.sendMessage(remoteJid, { text: HELP_SHORT });
          return;
        }
        // 📖 מדריך מלא (4 חלקים) — למי שרוצה פירוט פקודות
        if (/^(מדריך|מדריך-מלא|guide)$/i.test(text)) {
          await sock.sendMessage(remoteJid, { text: HELP_1 + '\n\n' + HELP_2 + '\n\n' + HELP_3 + '\n\n' + HELP_4 });
          return;
        }
        // 🛡️ עזרת מנהלים (חדש — הודעה נפרדת כדי לא לשבור את !עזרה הקיים)
        if (/^(מנהלים|אדמין|ניהול|admin)$/i.test(text)) {
          await sock.sendMessage(remoteJid, { text: HELP_5 });
          return;
        }
        if (/^(id|מזהה)$/i.test(text)) {
          await sock.sendMessage(remoteJid, { text: `🆔 מזהה הצ'אט:\n${remoteJid}\n\nהדבק אותו ב-.env תחת ALLOWED_GROUPS כדי להגביל לקבוצה זו.` });
          return;
        }
        if (/^(מצב|status|מנוע)$/i.test(text)) {
          await sock.sendMessage(remoteJid, {
            text:
              `🔧 *מצב מנועים:*\n` +
              `• OpenAI: ${config.OPENAI_API_KEY ? 'פעיל ✅' : 'כבוי (אין מפתח)'}\n` +
              `• Groq (חינמי): ${config.GROQ_API_KEY ? 'פעיל ✅' : 'כבוי'}\n` +
              `• Gemini (חינמי): ${config.GEMINI_API_KEY ? 'פעיל ✅' : 'כבוי'}\n` +
              `• Pollinations (חינמי, בלי מפתח): פעיל ✅\n` +
              `• YouTube API: ${config.YOUTUBE_API_KEY ? 'רשמי ✅' : 'yt-search חינמי ✅'}\n` +
              `• תמונות: ${config.OPENAI_API_KEY ? 'DALL-E 3' : `Pollinations ${config.POLLINATIONS_IMAGE_MODEL || 'אוטומטי'} (חינמי)`}`,
          });
          return;
        }

        // --- סטיקר (תמונה או וידאו; כולל אוטו-סטיקר לכל תמונה אם הופעל; + יצירה מאפס עם טקסט) ---
        const hasVideo = !!msg.message?.videoMessage;
        const stim = text.match(/^(סטיקר|מדבקה|sticker)( |$)/i);
        if (stim || ((hasImage || hasVideo) && /סטיקר|sticker/i.test(text)) ||
            (hasImage && !text && gdata(remoteJid).toggles.autoSticker)) {
          const aiPrompt = stim ? text.slice(stim[0].length).trim() : '';
          await handleSticker(sock, remoteJid, msg, quoted, aiPrompt);
          return;
        }
        // תמונה שצורפה בלי פקודה מפורשת אבל בקבוצה עם תיוג — מתעלמים (מונע ספאם)

        // --- 🎨 בקשת עריכה: מדיה מצוטטת/מצורפת + פועל עריכה → שולח מדיה + הוראה ל-Instinct ---
        {
          const eFirst = (text.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
          const eMedia = msg.message?.imageMessage ? { target: msg, kind: 'image' }
            : msg.message?.stickerMessage ? { target: msg, kind: 'sticker' }
            : (quoted?.imageMessage ? { target: {
              key: { remoteJid, id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, fromMe: false, participant: msg.message?.extendedTextMessage?.contextInfo?.participant },
              message: quoted,
            }, kind: 'image' } : null);
          const eMediaSt = (!eMedia && quoted?.stickerMessage) ? { target: {
            key: { remoteJid, id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, fromMe: false, participant: msg.message?.extendedTextMessage?.contextInfo?.participant },
            message: quoted,
          }, kind: 'sticker' } : null;
          const em = eMedia || eMediaSt;
          if (em && text && !/סטיקר|sticker/i.test(text) &&
              /^(ערוך|ערכי|תערוך|תערכי|שנה|שני|תשנה|תשני|החלף|החליפי|תחליף|הוסף|הוסיפי|תוסיף|הסר|הסירי|תסיר|תקן|תקני|תתקן|הפוך|הפכי|תהפוך|עשה|עשי|תעשה|תערוך|תוסיפי|שים|תשים|תצייר|צייר)/i.test(text)) {
            await sendTyping(sock, remoteJid, 1500);
            await sock.sendMessage(remoteJid, { text: `🎨 שולח לעריכה: "${text.slice(0, 100)}"...\n⏳ מחכה לתוצאה מ-Instinct` });
            try {
              let buf = await downloadMediaRetry(em.target, 'edit-src');
              // סטיקר (webp) → JPEG לשליחה
              try {
                if (buf[0] === 0x52 && buf[1] === 0x49) {
                  const { default: sharp } = await import('sharp');
                  buf = await sharp(buf).jpeg({ quality: 88 }).toBuffer();
                }
              } catch {}
              const out = await requestInstinct(sock, text.slice(0, 500), remoteJid, buf);
              if (out && out.length > 5000) {
                if (em.kind === 'sticker') {
                  const sticker = await toStickerBuffer(out).catch(() => null);
                  if (sticker) {
                    await sock.sendMessage(remoteJid, { sticker });
                    return;
                  }
                }
                let imgBuf = out;
                try {
                  if (out[0] === 0x52 && out[1] === 0x49) {
                    const { default: sharp } = await import('sharp');
                    imgBuf = await sharp(out).jpeg({ quality: 88 }).toBuffer();
                  }
                } catch {}
                await sock.sendMessage(remoteJid, { image: imgBuf, caption: `🎨 עריכה: "${text.slice(0, 150)}"` });
              } else {
                throw new Error('EDIT_EMPTY');
              }
            } catch (e) {
              console.error('edit fail:', (e && e.message || '').slice(0, 120));
              await sock.sendMessage(remoteJid, { text: '😢 העריכה נכשלה — Instinct לא החזיר תוצאה. נסה ניסוח אחר.' });
            }
            return;
          }
        }

        // --- 👁️ שאלה על תמונה (מצורפת או מצוטטת + טקסט שאינו סטיקר/פקודה) — הבוט רואה ועונה ---
        // !שאל עם תמונה כן נכנס (שאלה על התמונה); פקודות אחרות (תמונה/שיר/...) ממשיכות כרגיל.
        {
          const vFirst = (text.split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
          const qImg = msg.message?.imageMessage ? msg
            : (quoted?.imageMessage ? {
              key: { remoteJid, id: msg.message?.extendedTextMessage?.contextInfo?.stanzaId, fromMe: false, participant: msg.message?.extendedTextMessage?.contextInfo?.participant },
              message: quoted,
            } : null);
          if (qImg && text && !/סטיקר|sticker/i.test(text) && (!KNOWN_FIRST.has(vFirst) || vFirst === 'שאל')) {
            const _snd = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
            if (!(await checkFreeQuota(sock, remoteJid, _snd, msg.key.fromMe, isGroup))) return;
            await sendTyping(sock, remoteJid, 1500);
            try {
              const buf = await downloadMediaRetry(qImg, 'vision');
              const ans = await describeImage(buf, text);
              const history = chatHistory.get(remoteJid) || [];
              pushHistory(remoteJid, 'user', `[תמונה] ${text}`);
              pushHistory(remoteJid, 'assistant', ans);
              await sock.sendMessage(remoteJid, { text: `👁️ ${ans}` });
            } catch (e) {
              console.error('vision fail:', (e && e.message || '').slice(0, 120));
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי לראות את התמונה. נסה שוב.' });
            }
            return;
          }
        }

        // --- תמונה ---
        {
          const m = text.match(/^(תמונה|צייר|ציור|image|draw|תצייר)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const prompt = (m[2] || '').trim();
            if (!prompt) {
              await sock.sendMessage(remoteJid, { text:
                `🎨 *יצירת תמונת AI — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}תמונה ואחריו תיאור מפורט של מה שאתה רוצה לראות.\n` +
                `אפשר לכתוב בעברית — הבוט מתרגם אוטומטית לאנגלית כי מודלי התמונה מבינים אנגלית הרבה יותר טוב.\n\n` +
                `📌 *דוגמאות טובות:*\n` +
                `• ${prefix}תמונה ארנב לבן חמוד יושב בדשא, אור שמש\n` +
                `• ${prefix}צייר טירת פנטזיה מעל עננים בשקיעה, סגנון דיסני\n` +
                `• ${prefix}תמונה מכונית ספורט אדומה בגשם, צילום ריאליסטי\n\n` +
                `💡 *טיפים לתוצאה טובה:*\n` +
                `• כמה שיותר פרטים (צבעים, רקע, סגנון) — ככה יוצא מדויק\n` +
                `• אפשר להוסיף סגנון: ריאליסטי / מצויר / פיקסאר / אנימה\n` +
                `• היצירה לוקחת כדקה-דקה וחצי (איכות לפני מהירות), סבלנות 🙏` });
              return;
            }
            {
              const _snd = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
              if (!(await checkFreeQuota(sock, remoteJid, _snd, msg.key.fromMe, isGroup))) return;
            }
            // 🎨 מניעת כפילות: אותה בקשת תמונה באותו צ'אט לא רצה פעמיים במקביל
            const _imgKey = `img:${remoteJid}:${prompt.slice(0, 120)}`;
            {
              const _last = imgInFlight.get(_imgKey) || 0;
              if (Date.now() - _last < 120000) {
                await sock.sendMessage(remoteJid, { text: `🎨 כבר יוצר את התמונה הזו — שניה, היא בדרך... ⏳` });
                return;
              }
              imgInFlight.set(_imgKey, Date.now());
            }
            await sendTyping(sock, remoteJid, 1500);
            const _mkImg = [
              `🎨✨ מבשל לך תמונה: "${prompt.slice(0, 120)}"...\n🤌🔥 סבלנות, יוצא משהו טעים!`,
              `🎨💫 קולט את הוויב: "${prompt.slice(0, 120)}"...\n✨⏳ עוד שניה הקסם קורה!`,
              `🖌️😍 על זה! "${prompt.slice(0, 120)}"...\n🔥🎨 מכין לך משהו יפהפה!`,
            ];
            await sock.sendMessage(remoteJid, { text: _mkImg[Math.floor(Math.random() * _mkImg.length)] });
            // 🤖 ניסיון קודם דרך Instinct (שולח את הפקודה המלאה כפי שנכתבה)
            // מדלגים אם 2 כשלונות רצופים (חוזר לעבוד אחרי הצלחה)
            try {
              if (instinctCold()) throw new Error('INSTINCT_COLD');
              const relayBuf = await requestInstinct(sock, text, remoteJid);
              if (relayBuf && relayBuf.length > 5000) {
                // אם חזר סטיקר (webp) — ממירים לתמונה רגילה
                let imgBuf = relayBuf;
                try {
                  if (relayBuf[0] === 0x52 && relayBuf[1] === 0x49) {
                    const { default: sharp } = await import('sharp');
                    imgBuf = await sharp(relayBuf).jpeg({ quality: 88 }).toBuffer();
                  }
                } catch {}
                const _doneCap = [`😍🔥 קבל/י!`, `✨🎉 תתחדש/י!`, `🤩💥 יצא אש!`];
                await sock.sendMessage(remoteJid, { image: imgBuf, caption: `🎨 "${prompt.slice(0, 200)}"\n${_doneCap[Math.floor(Math.random() * _doneCap.length)]}` });
                lastMedia.set(remoteJid, { kind: 'image', q: prompt.slice(0, 200), at: Date.now() });
                try { const g = await import('./gallery-log.js'); g.logCreationWithFile({ type: 'image', prompt: prompt.slice(0, 300), buffer: imgBuf, ext: 'jpg', source: 'whatsapp' }); } catch {}
                return;
              }
            } catch (e) {
              if (!/INSTINCT_COLD/.test(e?.message || '')) instinctBumpFail();
              console.warn('instinct relay skip:', (e && e.message || '').slice(0, 100));
            }
            try {
              const { buffer, englishPrompt } = await generateImage(prompt);
              let caption = `🎨 "${prompt.slice(0, 200)}"`;
              if (englishPrompt && englishPrompt !== prompt.slice(0, 800)) {
                caption += `\n🔤 תורגם ל: "${englishPrompt.slice(0, 200)}"`;
              }
              caption += `\n${['😍🔥 קבל/י!', '✨🎉 תתחדש/י!', '🤩💥 יצא אש!'][Math.floor(Math.random() * 3)]}\n\nלא אהבת? נסה להוסיף פרטים (צבע, רקע, סגנון) ושלח שוב.`;
              await sock.sendMessage(remoteJid, { image: buffer, caption });
              lastMedia.set(remoteJid, { kind: 'image', q: prompt.slice(0, 200), at: Date.now() });
              try { const g = await import('./gallery-log.js'); g.logCreationWithFile({ type: 'image', prompt: prompt.slice(0, 300), buffer, ext: 'jpg', source: 'whatsapp' }); } catch {}
            } catch (e) {
              console.error('image fail:', e);
              await sock.sendMessage(remoteJid, { text: `😢 יצירת התמונה נכשלה (${(e.message || '').slice(0, 120)}).\n\nנסה:\n• תיאור אחר עם יותר פרטים\n• שוב בעוד דקה (השרת החינמי עמוס לפעמים)` });
            } finally {
              imgInFlight.delete(_imgKey);
            }
            return;
          }
        }

        // --- שיר ---
        {
          const m = text.match(/^(שיר|מוזיקה|song|music|נגן)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const q = (m[2] || '').trim();
            if (!q) {
              await sock.sendMessage(remoteJid, { text:
                `🎵 *חיפוש שירים — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}שיר ואחריו שם השיר + הזמר.\n` +
                `הבוט מחפש ביוטיוב ומחזיר קישורים + תמונה (חוקי בלבד, לא הורדה).\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}שיר עומר אדם שלום לך\n` +
                `• ${prefix}שיר Imagine Dragons Believer\n` +
                `• ${prefix}מוזיקה אייל גולן` });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            const results = await searchYouTube(`${q} שיר`, moreMode ? 6 : 3);
            const list = moreMode ? results.slice(3) : results;
            if (moreMode && !list.length) {
              await sock.sendMessage(remoteJid, { text: `🎵 אין תוצאות נוספות — נסה לחדד את החיפוש.` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: formatMediaResults(list, '🎵') });
            lastMedia.set(remoteJid, { kind: 'song', q, at: Date.now() });
            if (results[0]?.thumbnail) {
              try {
                await sock.sendMessage(remoteJid, {
                  image: { url: results[0].thumbnail },
                  caption: `🎵 *${results[0].title}*\n🔗 ${results[0].url}`,
                });
              } catch { /* thumbnail אופציונלי */ }
            }
            return;
          }
        }

        // --- 🖼️ רקעים לטלפון מתיקיית Drive ---
        {
          const m = text.match(/^(רקעים|רקע|רשימת-רקעים|טפט|טפטים|wallpaper)(?=\s|:|$)\s*[:\-]?\s*([\s\S]+)?$/is);
          if (m) {
            const q = (m[2] || '').trim();
            try {
              const files = await bgList();
              if (!files.length) {
                await sock.sendMessage(remoteJid, { text: `🖼️ תיקיית הרקעים ריקה כרגע.` });
                return;
              }
              if (!q) {
                const show = files.slice(0, 40);
                await sock.sendMessage(remoteJid, { text:
                  `🖼️ *רקעים לטלפון (${files.length}):*\n` +
                  show.map((f, i) => `${i + 1}. ${String(f.name || '').replace(/\.[a-z0-9]+$/i, '')}`).join('\n') +
                  (files.length > 40 ? `\n...ועוד ${files.length - 40}` : '') +
                  `\n\nכתוב: ${prefix}רקע <מספר> · ${prefix}רקע אקראי 🎲` });
                return;
              }
              let hit = bgPick(files, q);
              // אקראי: לפעמים מהמאגר הנוסף
              if (hit && /^(אקראי|רנדומלי|random|הפתע)/i.test(q)) {
                try {
                  const pool = bgExtra();
                  if (pool.length && Math.random() < 0.5) {
                    const r = pool[Math.floor(Math.random() * pool.length)];
                    const rurl = await bgResolve(r.page || r.u).catch(() => null);
                    if (rurl) {
                      const rr = await fetch(rurl, {
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                          Referer: 'https://widget-club.com/',
                        },
                        signal: AbortSignal.timeout(30000),
                      }).catch(() => null);
                      const bb = rr && rr.ok ? Buffer.from(await rr.arrayBuffer()) : null;
                      if (bb && bb.length > 5000) {
                        await sock.sendMessage(remoteJid, {
                          image: bb,
                          caption: `🖼️ ${r.t || 'רקע'} 🎲`,
                        });
                        return;
                      }
                    }
                  }
                } catch {}
              }
              if (!hit) {
                // חיפוש סמנטי: התיקייה שלך (תגיות AI) + מאגר WidgetClub (תיאורים)
                const found = bgSearch(files, q);
                let extra = [];
                try {
                  extra = bgSearchExtra(await enQuery(q), 50);
                } catch (e) {
                  console.warn('bg extra fail:', (e?.message || '').slice(0, 80));
                }
                const total = found.length + extra.length;
                if (total) {
                  console.log(`🖼️ bg search "${q.slice(0, 30)}" → drive:${found.length} extra:${extra.length}`);
                  // פתרון כתובות עדכניות למאגר הנוסף (במקביל)
                  const exResolved = (await Promise.all(
                    extra.slice(0, 4).map((x) => bgResolve(x.key).then((url) => ({ url })).catch(() => null))
                  )).filter(Boolean);
                  // עד 4 בהודעה: קודם מהתיקייה שלך, אחר כך מהמאגר
                  const send = [
                    ...found.slice(0, 4).map((f) => ({ url: driveImageUrl(f.file.id), fetch: false })),
                    ...exResolved.slice(0, Math.max(0, 4 - Math.min(4, found.length))).map((x) => ({ url: x.url, fetch: true })),
                  ].slice(0, 4);
                  if (!send.length) throw new Error('BG_RESOLVE_EMPTY');
                  const WC_HEADERS = {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
                    Referer: 'https://widget-club.com/',
                  };
                  await sock.sendMessage(remoteJid, { text:
                    `🖼️ *${send.length} רקעים ל-"${q.slice(0, 30)}" (מתוך ${total}):*` });
                  // שליחה רצופה (עם ניסיונות חוזרים — הרשת לגוגל מקרטעת) — וואטסאפ מקבץ לאלבום אחד
                  let sent = 0;
                  for (let k = 0; k < send.length; k++) {
                    // המאגר הנוסף חוסם הורדות לא-דפדפן — מורידים כאן ושולחים באפר
                    let payload = null;
                    if (send[k].fetch) {
                      for (let d = 0; d < 2 && !payload; d++) {
                        try {
                          const rr = await fetch(send[k].url, { headers: WC_HEADERS, signal: AbortSignal.timeout(30000) });
                          if (!rr.ok) throw new Error(`WC img ${rr.status}`);
                          const bb = Buffer.from(await rr.arrayBuffer());
                          if (bb.length < 5000) throw new Error('WC img קטנה מדי');
                          payload = { image: bb };
                        } catch (e) {
                          console.error(`bg dl ${k} try${d} fail:`, (e?.message || '').slice(0, 100));
                        }
                      }
                      if (!payload) continue;
                    } else {
                      payload = { image: { url: send[k].url } };
                    }
                    if (k === 0) payload.caption = `🖼️ רקעי "${q.slice(0, 30)}"`;
                    let ok = false;
                    for (let a = 0; a < 3 && !ok; a++) {
                      try {
                        await sock.sendMessage(remoteJid, payload);
                        ok = true;
                        sent++;
                      } catch (e) {
                        console.error(`bg send ${k} try${a} fail:`, (e?.message || '').slice(0, 100));
                        await new Promise((r) => setTimeout(r, 2500));
                      }
                    }
                    if (k < send.length - 1) await new Promise((r) => setTimeout(r, 300));
                  }
                  console.log(`🖼️ bg sent ${sent}/${send.length}`);
                  return;
                }
              }
              if (!hit) {
                await sock.sendMessage(remoteJid, { text: `🖼️ לא מצאתי רקע ל-"${q.slice(0, 40)}".\nנסה מילה אחרת (שקיעה, ים, הרים, חיות...) · ${prefix}רקעים · ${prefix}רקע אקראי 🎲` });
                return;
              }
              await sock.sendMessage(remoteJid, {
                image: { url: driveImageUrl(hit.file.id) },
                caption: `🖼️ ${String(hit.file.name || '').replace(/\.[a-z0-9]+$/i, '')} (${hit.i + 1}/${files.length})`,
              });
            } catch (e) {
              console.error('bg fail:', (e && e.message || '').slice(0, 120));
              await sock.sendMessage(remoteJid, { text: '😢 שליפת הרקעים נכשלה — נסה שוב בעוד דקה.' });
            }
            return;
          }
        }

        // --- 🎬 יצירת סרטון AI — מבוטלת (הוסרה לבקשת הבעלים) ---

        // --- וידאו ---
        {
          const m = text.match(/^(וידאו|סרטון|סרטונים|video|יוטיוב)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const q = (m[2] || '').trim();
            if (!q) {
              await sock.sendMessage(remoteJid, { text:
                `🎬 *חיפוש סרטונים — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}וידאו ואחריו הנושא שמעניין אותך.\n` +
                `הבוט מחזיר 3 סרטונים מיוטיוב עם קישורים.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}וידאו איך מכינים חומוס\n` +
                `• ${prefix}סרטון שערים של מסי\n` +
                `• ${prefix}וידאו מדיטציה להרגעה` });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            const results = await searchYouTube(q, moreMode ? 6 : 3);
            const list = moreMode ? results.slice(3) : results;
            if (moreMode && !list.length) {
              await sock.sendMessage(remoteJid, { text: `🎬 אין תוצאות נוספות — נסה לחדד את החיפוש.` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: formatMediaResults(list, '🎬') });
            lastMedia.set(remoteJid, { kind: 'video', q, at: Date.now() });
            return;
          }
        }

        // --- 🛒 קניות AliExpress (בלי מפתח ובלי הרשמה) ---
        {
          const m = text.match(/^(קנה|קניות|קנייה|קני|aliexpress|ali)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const q = (m[2] || '').trim().slice(0, 60);
            if (!q) {
              await sock.sendMessage(remoteJid, { text:
                `🛒 *קניות AliExpress — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}קנה ואחריו מה שמחפשים.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}קנה אוזניות בלוטות\n` +
                `• ${prefix}קנה מנורת לילה\n` +
                `• ${prefix}קנה נעל ספורט` });
              return;
            }
            await sendTyping(sock, remoteJid, 1500);
            try {
              const items = await searchProducts(q, moreMode ? 10 : 5);
              const list = moreMode ? items.slice(5) : items;
              if (moreMode && !list.length) {
                await sock.sendMessage(remoteJid, { text: `🛒 אין תוצאות נוספות — נסה לחדד את החיפוש.` });
                return;
              }
              const first = list[0];
              if (first.img) {
                await sock.sendMessage(remoteJid, {
                  image: { url: first.img },
                  caption: `🛒 *${first.title}*\n💰 ${first.price}\n🔗 ${affiliateUrl(first.url)}`,
                }).catch(() => {});
              }
              const rest = first.img ? items.slice(1) : items;
              if (rest.length) {
                await sock.sendMessage(remoteJid, { text:
                  `🛒 *עוד תוצאות ל-"${q.slice(0, 40)}":*\n` +
                  rest.map((p, i) => `${i + 2}. *${p.title.slice(0, 60)}*\n   💰 ${p.price}\n   🔗 ${affiliateUrl(p.url)}`).join('\n\n') });
              }
              lastMedia.set(remoteJid, { kind: 'shop', q: q.slice(0, 60), at: Date.now() });
            } catch (e) {
              console.error('shop fail:', (e && e.message || '').slice(0, 120));
              await sock.sendMessage(remoteJid, { text: `😢 החיפוש נכשל (${(e.message || '').slice(0, 100)}).\nנסה מילים אחרות בעוד דקה.` });
            }
            return;
          }
        }
        // --- דיבור / TTS ---
        {
          const m = text.match(/^(דבר|קריין|תקריא|say|speak)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const t = (m[2] || '').trim();
            if (!t) {
              await sock.sendMessage(remoteJid, { text:
                `🔊 *הקראה קולית — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}דבר ואחריו הטקסט, והבוט ישלח הודעה קולית בעברית.\n` +
                `עד ~900 תווים (כמה משפטים).\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}דבר שלום לכולם, מה נשמע?\n` +
                `• ${prefix}דבר מזל טוב ליום ההולדת!` });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            try {
              let audio = await textToSpeech(t);
              const voice = gdata(remoteJid).toggles.voice;
              if (voice === 'גברי') audio = await pitchVoice(audio, 0.82);
              else if (voice === 'נשי') audio = await pitchVoice(audio, 1.25);
              await sock.sendMessage(remoteJid, { audio, mimetype: 'audio/ogg; codecs=opus', ptt: true });
            } catch (e) {
              console.error('tts fail:', e);
              await sock.sendMessage(remoteJid, { text: `😢 ההקראה נכשלה (${(e.message || '').slice(0, 100)}). נסה טקסט קצר יותר (עד כמה משפטים).` });
            }
            return;
          }
        }



        // --- חיפוש תמונות מהרשת (לא יצירה!) ---
        {
          const m = text.match(/^(תמונות|חפש תמונה|images)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const q = (m[2] || '').trim();
            if (!q) {
              await sock.sendMessage(remoteJid, { text:
                `🖼️ *חיפוש תמונות מהרשת — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}תמונות ואחריו הנושא, והבוט מביא תמונות אמיתיות מהאינטרנט (רישיונות פתוחים).\n` +
                `שים לב: זה *חיפוש*, לא יצירה. ליצירת תמונה חדשה עם AI כתוב ${prefix}תמונה (יחיד).\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}תמונות שקיעה בים\n` +
                `• ${prefix}תמונות ארנב חמוד` });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            try {
              const imgs = await searchImages(q, 3);
              if (!imgs.length) {
                await sock.sendMessage(remoteJid, { text: '😢 לא מצאתי תמונות. נסה באנגלית.' });
              } else {
                try {
                  await sock.sendMessage(remoteJid, { image: { url: imgs[0].url }, caption: `🖼️ *${imgs[0].title}*${imgs[0].author ? ` — ${imgs[0].author}` : ''}\n🔗 ${imgs[0].page}` });
                } catch {
                  await sock.sendMessage(remoteJid, { text: `🖼️ *${imgs[0].title}*\n🔗 ${imgs[0].url}` });
                }
                if (imgs.length > 1) {
                  let extra = '🖼️ *עוד תוצאות:*\n';
                  imgs.slice(1).forEach((r, i) => { extra += `${i + 2}. ${r.title}\n🔗 ${r.url}\n`; });
                  await sock.sendMessage(remoteJid, { text: extra.trim() });
                }
              }
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: '😢 חיפוש התמונות נכשל. נסה שוב בעוד דקה.' });
            }
            return;
          }
        }

        // --- תרגום ---
        {
          const m = text.match(/^(תרגם|תרגום|translate)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const t = (m[2] || '').trim();
            if (!t) {
              await sock.sendMessage(remoteJid, { text:
                `🌍 *תרגום — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}תרגם ואחריו הטקסט.\n` +
                `הכיוון אוטומטי: עברית→אנגלית, אנגלית→עברית.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}תרגם שלום עולם\n` +
                `• ${prefix}תרגם Good morning` });
              return;
            }
            await sendTyping(sock, remoteJid, 800);
            try {
              await sock.sendMessage(remoteJid, { text: `🌍 *תרגום:*\n${await translateText(t)}` });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 התרגום נכשל. נסה טקסט קצר יותר.' });
            }
            return;
          }
        }

        // --- מזג אוויר ---
        {
          const m = text.match(/^(מזג אוויר|מזגאוויר|מזג|weather)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const c = (m[2] || '').trim();
            if (!c) {
              await sock.sendMessage(remoteJid, { text:
                `🌤️ *מזג אוויר — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}מזג ואחריו שם העיר (בעברית או אנגלית).\n` +
                `הבוט מחזיר טמפרטורה, תיאור, לחות ורוח — נתונים חיים.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}מזג תל אביב\n` +
                `• ${prefix}מזג ירושלים` });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            try {
              await sock.sendMessage(remoteJid, { text: await getWeather(c) });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 ${e.message}` });
            }
            return;
          }
        }

        // --- זמני שבת וחג ---
        {
          const m = text.match(/^(שבת|כניסת-שבת|זמני-שבת)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const c = (m[2] || '').trim() || 'ירושלים';
            await sendTyping(sock, remoteJid, 800);
            try {
              await sock.sendMessage(remoteJid, { text: await shabbatTimes(c) });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 ${e.message}` });
            }
            return;
          }
        }

        // --- מחיר מניה ---
        {
          const m = text.match(/^(מניה|מניות|stock)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const s = (m[2] || '').trim();
            if (!s) {
              await sock.sendMessage(remoteJid, { text:
                `📈 *מחיר מניה — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}מניה <סימול>\n` +
                `דוגמאות: ${prefix}מניה AAPL · ${prefix}מניה TSLA · ${prefix}מניה BTC-USD` });
              return;
            }
            await sendTyping(sock, remoteJid, 800);
            try {
              await sock.sendMessage(remoteJid, { text: await stockPrice(s) });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 ${e.message}` });
            }
            return;
          }
        }

        // --- קיצור קישור ---
        {
          const m = text.match(/^(קצר-קישור|קיצור|קצר|short)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const u = (m[2] || '').trim();
            if (!u) {
              await sock.sendMessage(remoteJid, { text:
                `🔗 *קיצור קישור — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}קצר <קישור ארוך>\n` +
                `דוגמה: ${prefix}קצר https://example.com/abc/def` });
              return;
            }
            await sendTyping(sock, remoteJid, 500);
            try {
              await sock.sendMessage(remoteJid, { text: await shortenUrl(u) });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 ${e.message}` });
            }
            return;
          }
        }


        // --- יצירת QR ---
        {
          const m = text.match(/^(qr|קיואר|ברקוד)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const t = (m[2] || '').trim().slice(0, 300);
            if (!t) {
              await sock.sendMessage(remoteJid, { text:
                `🔳 *יצירת ברקוד QR — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}qr ואחריו טקסט או קישור, והבוט מחזיר תמונת ברקוד לסריקה.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}qr https://example.com\n` +
                `• ${prefix}ברקוד שלום לכולם` });
              return;
            }
            try {
              const { default: QRCode } = await import('qrcode');
              const buf = await QRCode.toBuffer(t, { width: 600, margin: 2 });
              await sock.sendMessage(remoteJid, { image: buf, caption: `🔳 QR עבור:\n${t.slice(0, 200)}` });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 יצירת ה-QR נכשלה.' });
            }
            return;
          }
        }

        // --- 📸 תמונת פרופיל של משתמש (פיצ'ר מצחיק) ---
        {
          const m = text.match(/^(תמונת-פרופיל|תמונת פרופיל|תמונה-פרופיל|תמונה פרופיל|פרופיל|pp|avatar)(?=\s|:|$|@)\s*[:\-]?\s*([\s\S]+)?$/is);
          if (m) {
            const ctx = msg.message?.extendedTextMessage?.contextInfo || {};
            const mentioned = (ctx.mentionedJid || []).filter((j) => j && j !== botJid);
            const qPart = ctx.participant || null;
            let target = mentioned[0] || null;
            if (!target && qPart && !msg.key.fromMe) target = qPart; // תשובה להודעה של מישהו
            if (!target && !isGroup) target = remoteJid; // בפרטי: הצד השני
            if (!target) {
              // 🔍 זיהוי לפי שם כטקסט (כולל סמיילי): "תמונת פרופיל נריה כהן 😎"
              const q = (m[2] || '').trim();
              if (q && isGroup) {
                const strip = (s) => String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, '').trim();
                const cands = Object.entries(gdata(remoteJid).names || {});
                let hit = cands.find(([jid, nm]) => nm && (nm.includes(q) || q.includes(nm)));
                if (!hit) {
                  const sq = strip(q);
                  hit = sq ? cands.find(([jid, nm]) => nm && strip(nm).includes(sq)) : null;
                }
                if (hit) {
                  target = hit[0];
                  console.log(`📸 profile by name "${q.slice(0, 30)}" → ${target}`);
                }
              }
            }
            if (!target) {
              await sock.sendMessage(remoteJid, { text:
                `📸 *תמונת פרופיל — איך משתמשים?*\n\nתייג מישהו או הגב להודעה שלו:\n• ${prefix}תמונת-פרופיל @דני` });
              return;
            }
            try {
              await sendTyping(sock, remoteJid, 1000);
              console.log(`📸 pp target: ${target}`);
              const url = await sock.profilePictureUrl(target, 'image', 15000).catch((e) => {
                console.warn('pp url fail:', (e?.message || '').slice(0, 100));
                return null;
              });
              if (!url) throw new Error('NO_PHOTO');
              // מורידים כאן (עם ניסיונות) במקום לתת לבייליס — הרשת מקרטעת
              let buf = null;
              for (let a = 0; a < 3 && !buf; a++) {
                try {
                  const rr = await fetch(url, { signal: AbortSignal.timeout(25000) });
                  if (!rr.ok) throw new Error(`PP ${rr.status}`);
                  const bb = Buffer.from(await rr.arrayBuffer());
                  if (bb.length > 2000) buf = bb;
                } catch (e) {
                  console.warn(`pp dl try${a} fail:`, (e?.message || '').slice(0, 80));
                  await new Promise((r) => setTimeout(r, 2000));
                }
              }
              if (!buf) throw new Error('DL_FAIL');
              const selfJid = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
              const nm = ((target === selfJid ? msg.pushName : '') || gdata(remoteJid).names[target] || '').trim().slice(0, 30);
              const jokes = nm ? [
                `📸 *תמונת הפרופיל של ${nm} — נתפס!* 😂`,
                `📸 הנה הוא/היא במלוא הדרו: *${nm}* ✨`,
                `📸 *${nm}* — ככה נראה אושר 😎`,
              ] : [
                `📸 *נתפס!* 😂 — מי זה החתיך/היפה הזאת?`,
                `📸 הנה התמונה — שווה אלף מילים ✨😎`,
              ];
              await sock.sendMessage(remoteJid, {
                image: buf,
                caption: jokes[Math.floor(Math.random() * jokes.length)],
                mentions: [target],
              });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 אין תמונת פרופיל ציבורית למשתמש הזה (פרטיות וואטסאפ).' });
            }
            return;
          }
        }

        // --- ✨ כלי AI (18 פקודות בבלוק אחד) ---
        {
          const first = (text.split(/\s+/)[0] || '').replace(/^[:\-]+|[:\-]+$/g, '');
          const tool = resolveAiTool(first);
          if (tool) {
            const q = text.slice(text.indexOf(first) + first.length).replace(/^[:\-\s]+/, '').trim();
            if (AI_TOOLS[tool].needQ && !q) {
              await sock.sendMessage(remoteJid, { text:
                `✨ *${tool} — איך משתמשים?*\n\nכתוב: ${prefix}${tool} <טקסט>\n\n${aiToolUsage(prefix)}` });
              return;
            }
            await sendTyping(sock, remoteJid, 1500);
            try {
              await sock.sendMessage(remoteJid, { text: await runAiTool(tool, q) });
            } catch (e) {
              console.error('aitool fail:', e);
              await sock.sendMessage(remoteJid, { text: '😢 נכשלתי. נסה שוב בעוד דקה.' });
            }
            return;
          }
          if (/^(כלים|כלי-ai)$/i.test(text)) {
            await sock.sendMessage(remoteJid, { text: aiToolUsage(prefix) });
            return;
          }
        }

        // --- 🎲 כיף ושימושי מקומי ---
        {
          const m = text.match(/^(קוביה|מטבע|בחר|הגרלה|סיסמה|מספר|צבע|תאריך|שעה|עד|תזכורת)(?=\s|:|$)\s*[:\-]?\s*([\s\S]*)$/i);
          if (m) {
            const cmd = m[1];
            const arg = (m[2] || '').trim();
            const USAGE = {
              'קוביה': `🎲 *קוביה — איך משתמשים?*\nכתוב: ${prefix}קוביה [מספר פאות]\nדוגמה: ${prefix}קוביה 20`,
              'בחר': `🎯 *בחירה רנדומלית — איך משתמשים?*\nכתוב: ${prefix}בחר ואפשרויות מופרדות ב-| או פסיק או שורה חדשה\nדוגמה: ${prefix}בחר פיצה | סושי | המבורגר`,
              'הגרלה': `🎯 *הגרלה — איך משתמשים?*\nכתוב: ${prefix}הגרלה ואפשרויות מופרדות ב-| או פסיק\nדוגמה: ${prefix}הגרלה דני, יוסי, נועה`,
              'עד': `⏳ *ספירה לאחור — איך משתמשים?*\nכתוב: ${prefix}עד <תאריך>\nדוגמה: ${prefix}עד 25.12.2026`,
              'תזכורת': `⏰ *תזכורת — איך משתמשים? (נשמר גם אחרי הפעלה מחדש)*\n• ${prefix}תזכורת 30 להוציא עוף — בעוד X דקות\n• ${prefix}תזכורת 18:30 להתקשר — היום/מחר בשעה\n• ${prefix}תזכורת 25.12 08:00 מסיבה — בתאריך ושעה\n• ${prefix}תזכורת יומית 08:00 ויטמינים — כל יום!\n• ${prefix}תזכורות — רשימה | ${prefix}מחק-תזכורת 1 — מחיקה`,
              'שעה': `🕐 *שעה בעולם — איך משתמשים?*\nכתוב: ${prefix}שעה <עיר>\nדוגמה: ${prefix}שעה לונדון`,
              'סיסמה': `🔑 *יצירת סיסמה — איך משתמשים?*\nכתוב: ${prefix}סיסמה [אורך]\nדוגמה: ${prefix}סיסמה 16`,
              'מספר': `🔢 *מספר רנדומלי — איך משתמשים?*\nכתוב: ${prefix}מספר [מינימום מקסימום]\nדוגמה: ${prefix}מספר 1 50`,
            };
            try {
              switch (cmd) {
                case 'קוביה': {
                  const n = Math.min(Math.max(parseInt(arg) || 6, 2), 100);
                  await sock.sendMessage(remoteJid, { text: dice(n) });
                  break;
                }
                case 'מטבע':
                  await sock.sendMessage(remoteJid, { text: coin() });
                  break;
                case 'בחר':
                case 'הגרלה':
                  await sock.sendMessage(remoteJid, { text: pickOne(arg) });
                  break;
                case 'סיסמה':
                  await sock.sendMessage(remoteJid, { text: genPassword(arg) });
                  break;
                case 'מספר': {
                  const nums = arg.match(/-?\d+/g)?.map(Number) || [];
                  await sock.sendMessage(remoteJid, { text: nums.length >= 2 ? randNum(nums[0], nums[1]) : randNum(1, 100) });
                  break;
                }
                case 'צבע':
                  await sock.sendMessage(remoteJid, { text: randColor() });
                  break;
                case 'תאריך':
                  await sock.sendMessage(remoteJid, { text: dateHe() });
                  break;
                case 'שעה':
                  await sock.sendMessage(remoteJid, { text: cityTime(arg) });
                  break;
                case 'עד':
                  await sock.sendMessage(remoteJid, { text: countdown(arg) });
                  break;
                case 'תזכורת': {
                  // סדר: "יומית HH:MM" → תאריך מלא → "HH:MM" → דקות (נשמר — שורד הפעלה מחדש!)
                  const daily = arg.match(/^יומית\s+(\d{1,2}):(\d{2})\s+([\s\S]+)/);
                  if (daily) {
                    const hh = String(Math.min(Math.max(+daily[1], 0), 23)).padStart(2, '0');
                    const mm = String(Math.min(Math.max(+daily[2], 0), 59)).padStart(2, '0');
                    const rtext = daily[3].trim().slice(0, 200);
                    if (!rtext) throw new Error('EMPTY');
                    addReminder(remoteJid, { text: rtext, daily: `${hh}:${mm}`, by: msg.key.participant || 'me' });
                    await sock.sendMessage(remoteJid, { text: `⏰ תזכורת יומית נקבעה ל-${hh}:${mm}:\n"${rtext.slice(0, 150)}"` });
                    break;
                  }
                  const dtm = arg.match(/^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\s+(?:(\d{1,2}):(\d{2})\s+)?([\s\S]+)/);
                  if (dtm) {
                    let y = dtm[3] ? (dtm[3].length === 2 ? '20' + dtm[3] : dtm[3]) : String(new Date().getFullYear());
                    const hh = dtm[4] || '09', mm = dtm[5] || '00';
                    const at = new Date(+y, +dtm[2] - 1, +dtm[1], +hh, +mm).getTime();
                    const rtext = (dtm[6] || '').trim().slice(0, 200);
                    if (!rtext || isNaN(at) || at <= Date.now()) throw new Error('EMPTY');
                    addReminder(remoteJid, { text: rtext, at, by: msg.key.participant || 'me' });
                    const d = new Date(at);
                    await sock.sendMessage(remoteJid, { text: `⏰ תזכורת נקבעה ל-${d.getDate()}.${d.getMonth() + 1} ${hh}:${mm}:\n"${rtext.slice(0, 150)}"` });
                    break;
                  }
                  const tm = arg.match(/^(\d{1,2}):(\d{2})\s+([\s\S]+)/);
                  if (tm) {
                    const now = new Date();
                    let at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +tm[1], +tm[2]).getTime();
                    if (at <= Date.now()) at += 86400000; // עבר להיום — קובעים למחר
                    const rtext = tm[3].trim().slice(0, 200);
                    if (!rtext) throw new Error('EMPTY');
                    addReminder(remoteJid, { text: rtext, at, by: msg.key.participant || 'me' });
                    const d = new Date(at);
                    const when = d.getDate() === now.getDate() ? 'היום' : 'מחר';
                    await sock.sendMessage(remoteJid, { text: `⏰ תזכורת נקבעה ל${when} ${tm[1]}:${tm[2]}:\n"${rtext.slice(0, 150)}"` });
                    break;
                  }
                  const rm = arg.match(/^(\d+)\s*(דקות|דקה|דק׳|דק|שעות|שעה|ש׳)?\s+([\s\S]+)/);
                  if (!rm) throw new Error('EMPTY');
                  let mins = parseInt(rm[1]);
                  if (/שע/.test(rm[2] || '')) mins *= 60;
                  if (mins < 1 || mins > 43200) {
                    await sock.sendMessage(remoteJid, { text: '⏰ זמן חוקי: 1-43200 דקות (30 יום).' });
                    break;
                  }
                  const rtext = rm[3].trim().slice(0, 200);
                  addReminder(remoteJid, { text: rtext, at: Date.now() + mins * 60000, by: msg.key.participant || 'me' });
                  await sock.sendMessage(remoteJid, { text: `⏰ תזכורת נקבעה לעוד ${mins} דקות:\n"${rtext.slice(0, 150)}"` });
                  break;
                }
              }
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: USAGE[cmd] || '😢 משהו נכשל. נסה שוב.' });
            }
            return;
          }
        }

        // --- רשימת תזכורות / מחיקה ---
        {
          if (/^(תזכורות)(?=\s|:|$)/i.test(text)) {
            const list = listReminders(remoteJid);
            if (!list.length) {
              await sock.sendMessage(remoteJid, { text: `⏰ אין תזכורות.\nהוספה: ${prefix}תזכורת 30 <טקסט> · ${prefix}תזכורת יומית 08:00 <טקסט>` });
            } else {
              let out = '⏰ *תזכורות:*\n\n';
              list.slice(0, 15).forEach((r, i) => { out += `${i + 1}. ${fmtReminderTime(r)} — ${r.text.slice(0, 80)}\n`; });
              out += `\nמחיקה: ${prefix}מחק-תזכורת <מספר>`;
              await sock.sendMessage(remoteJid, { text: out.trim() });
            }
            return;
          }
          const dm = text.match(/^(מחק-תזכורת|מחק-תזכורות)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (dm) {
            const res = removeReminder(remoteJid, (dm[2] || '').trim());
            if (res === 'all') await sock.sendMessage(remoteJid, { text: '⏰ כל התזכורות נמחקו.' });
            else if (res) await sock.sendMessage(remoteJid, { text: `⏰ נמחקה: "${res.text.slice(0, 80)}"` });
            else await sock.sendMessage(remoteJid, { text: `😢 מספר לא תקין. כתוב ${prefix}תזכורות לרשימה.` });
            return;
          }
        }

        // --- 🐶🐱🦊 חיות חמודות ---
        {
          const m = text.match(/^(כלב|חתול|שועל|dog|cat|fox)\s*$/i);
          if (m) {
            const kind = /כלב|dog/i.test(m[1]) ? 'dog' : /חתול|cat/i.test(m[1]) ? 'cat' : 'fox';
            await sendTyping(sock, remoteJid, 1000);
            try {
              const { imageUrl, caption } = await animalImage(kind);
              try {
                await sock.sendMessage(remoteJid, { image: { url: imageUrl }, caption });
              } catch {
                await sock.sendMessage(remoteJid, { text: `${caption}\n🔗 ${imageUrl}` });
              }
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי להביא תמונה. נסה שוב.' });
            }
            return;
          }
        }


        // --- 💵 מט"ח ---
        {
          if (/^(דולר|מטח|שער|מטבע-חוץ|יורו)$/i.test(text)) {
            await sendTyping(sock, remoteJid, 800);
            try {
              await sock.sendMessage(remoteJid, { text: await currencyRates() });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 שירות השערים נכשל. נסה מאוחר יותר.' });
            }
            return;
          }
        }

        // --- 🪙 קריפטו ---
        {
          if (/^(ביטקוין|קריפטו|bitcoin|crypto)$/i.test(text)) {
            await sendTyping(sock, remoteJid, 800);
            try {
              await sock.sendMessage(remoteJid, { text: await cryptoPrices() });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 שירות הקריפטו נכשל. נסה מאוחר יותר.' });
            }
            return;
          }
        }

        // --- 📰 חדשות ---
        {
          if (/^(חדשות|news)$/i.test(text)) {
            await sendTyping(sock, remoteJid, 1000);
            try {
              await sock.sendMessage(remoteJid, { text: await newsHe(5) });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 החדשות נכשלו. נסה מאוחר יותר.' });
            }
            return;
          }
        }



        // --- אישיות ---
        {
          const m = text.match(/^(אישיות)\s*[:\-]?\s*([\s\S]*)$/i);
          if (m) {
            const p = (m[2] || '').trim().slice(0, 200);
            const gd = gdata(remoteJid);
            if (!p) {
              await sock.sendMessage(remoteJid, { text: gd.personality ? `🎭 האישיות כרגע: "${gd.personality}"\nלשינוי: ${prefix}אישיות <סגנון>\nלביטול: ${prefix}אישיות נקה` : `🎭 אין אישיות מיוחדת.\nדוגמאות:\n• ${prefix}אישיות פיראט מצחיק\n• ${prefix}אישיות פרופסור רציני` });
              return;
            }
            if (/^(נקה|בטל|רגיל)$/i.test(p)) {
              gd.personality = '';
              saveStore();
              await sock.sendMessage(remoteJid, { text: '🎭 האישיות אופסה ✅' });
            } else {
              gd.personality = p;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🎭 מעכשיו אני בסגנון: "${p}"\nנסה: ${prefix}שאל מה שלומך?` });
            }
            return;
          }
        }

        // --- סיכום שיחה ---
        {
          if (/^(סכם-צאט)$/i.test(text)) {
            const log = recentChat(remoteJid, 50).filter((l) => l.text);
            if (log.length < 3) {
              await sock.sendMessage(remoteJid, { text: '📝 אין מספיק שיחה לסיכום עדיין.' });
              return;
            }
            {
              const _snd = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
              if (!(await checkFreeQuota(sock, remoteJid, _snd, msg.key.fromMe, isGroup))) return;
            }
            await sendTyping(sock, remoteJid, 1500);
            const convo = log.map((l) => `${l.name || 'מישהו'}: ${l.text}`).join('\n').slice(0, 4000);
            try {
              const { text: ans } = await chatAI(`סכם בעברית ב-5-8 נקודות קצרות את השיחה הבאה (נושאים, החלטות, שאלות פתוחות):\n${convo}`, []);
              await sock.sendMessage(remoteJid, { text: `📝 *סיכום השיחה:*\n\n${ans}` });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 הסיכום נכשל. נסה שוב.' });
            }
            return;
          }
        }

        // --- תמלול הקלטה (כולל שגיאות כתיב נפוצות) ---
        {
          if (/^(תמלל|תמלול|תמללי|תמללו|תמלות)$/i.test(text)) {
            const qm = quoted?.audioMessage ? { key: { remoteJid, id: 'q', fromMe: false }, message: quoted } : null;
            const target = msg.message?.audioMessage ? msg : qm;
            if (!target) {
              await sock.sendMessage(remoteJid, { text: `🎙️ הגב להודעה קולית עם: ${config.BOT_PREFIX}תמלל` });
              return;
            }
            await sendTyping(sock, remoteJid, 1500);
            try {
              const buf = await downloadMediaMessage(target, 'buffer', {});
              const t = await transcribeAudio(buf);
              await sock.sendMessage(remoteJid, { text: `🎙️ *מה שנאמר:*\n${t}` });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 התמלול נכשל (${(e.message || '').slice(0, 80)}).` });
            }
            return;
          }
        }

        // --- טריוויה ---
        {
          if (/^(טריוויה)$/i.test(text)) {
            const gd = gdata(remoteJid);
            if (gd.trivia && Date.now() < gd.trivia.until) {
              await sock.sendMessage(remoteJid, { text: `🎯 *טריוויה פעילה:*\n\n${gd.trivia.question}\n\nענו: א / ב / ג / ד` });
              return;
            }
            await sendTyping(sock, remoteJid, 1500);
            try {
              const tr = await newTrivia(chatAI);
              if (!tr) throw new Error('parse');
              gd.trivia = tr;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🎯 *טריוויה! (90 שניות, 5 נקודות)*\n\n${tr.question}\n\nענו: א / ב / ג / ד` });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי לחבר שאלה. נסה שוב.' });
            }
            return;
          }
        }

        // --- טופ ונקודות ---
        {
          if (/^(טופ)$/i.test(text)) {
            const top = topPoints(remoteJid, 10);
            if (!top.length) {
              await sock.sendMessage(remoteJid, { text: '🏆 עוד אין ניקוד. כתבו הודעות וצברו נקודות!' });
              return;
            }
            const medals = ['🥇', '🥈', '🥉'];
            let out = '🏆 *הפעילים המובילים:*\n\n';
            top.forEach((u, i) => { out += `${medals[i] || `${i + 1}.`} ${u.name || 'משתמש'} — ${u.points} נק׳\n`; });
            await sock.sendMessage(remoteJid, { text: out.trim() });
            return;
          }
          if (/^(נקודות)$/i.test(text)) {
            const sender = msg.key.participant || 'me';
            await sock.sendMessage(remoteJid, { text: `🎖️ יש לך *${gdata(remoteJid).points[sender] || 0}* נקודות!` });
            return;
          }
          // 📊 פעילות שבועית (מהלוג, 7 ימים אחרונים)
          if (/^(פעילות|סטטיסטיקה|סטטס-קבוצה)$/i.test(text)) {
            const week = recentChat(remoteJid, 200).filter((l) => l.text && Date.now() - (l.time || 0) < 7 * 86400000);
            if (week.length < 3) {
              await sock.sendMessage(remoteJid, { text: '📊 אין מספיק נתונים מהשבוע האחרון.' });
              return;
            }
            const counts = {};
            for (const l of week) counts[l.sender] = (counts[l.sender] || 0) + 1;
            const gd = gdata(remoteJid);
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
            const medals = ['🥇', '🥈', '🥉'];
            let out = `📊 *פעילות הקבוצה — 7 ימים:*\n\n💬 ${week.length} הודעות\n\n`;
            top.forEach(([s, n], i) => {
              out += `${medals[i] || `${i + 1}.`} ${(gd.names[s] || '').split(' ')[0] || 'משתמש'} — ${n} הודעות\n`;
            });
            await sock.sendMessage(remoteJid, { text: out.trim() });
            return;
          }
        }

        // --- ימי הולדת ---
        {
          const m = text.match(/^(יומולדת)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            if (!arg) {
              const list = Object.entries(gd.birthdays);
              if (!list.length) {
                await sock.sendMessage(remoteJid, { text: `🎂 כתוב: ${prefix}יומולדת 25.12\nואברך אותך אוטומטית ביום הגדול! 🎉` });
              } else {
                let out = '🎂 *ימי הולדת רשומים:*\n\n';
                for (const [, b] of list) out += `• ${b.name || 'מישהו'} — ${b.d}.${b.m}\n`;
                await sock.sendMessage(remoteJid, { text: out.trim() });
              }
              return;
            }
            const sender = msg.key.participant || 'me';
            if (setBirthday(remoteJid, sender, msg.pushName || '', arg)) {
              await sock.sendMessage(remoteJid, { text: `🎂 נרשם! אברך בזמן 🎉` });
            } else {
              await sock.sendMessage(remoteJid, { text: `😢 תאריך לא תקין. דוגמה: ${prefix}יומולדת 25.12` });
            }
            return;
          }
        }

        // === 🎮 משחקים, 📊 מידע חי, 🛠️ תפעול קבוצה ===
        // --- איקס-עיגול ---
        {
          const m = text.match(/^(איקס-עיגול|איקסועיגול|XO|xo)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            const sender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
            const name = msg.pushName || gd.names[sender] || 'שחקן';
            if (/^(ביטול|בטל|וותר|וויתור|ניקוי|סגור|cancel)$/i.test(arg)) {
              if (gd.xo) { gd.xo = null; saveStore(); await sock.sendMessage(remoteJid, { text: '❌ המשחק בוטל.' }); }
              else await sock.sendMessage(remoteJid, { text: 'אין משחק פעיל.' });
              return;
            }
            if (!gd.xo) {
              // 🎮 פתיחה עם שני שחקנים מתויגים: !איקס-עיגול @פלוני @אלמוני
              const mentioned = (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])
                .filter((j) => j && j !== botJid);
              const players = [...new Set(mentioned)].slice(0, 2);
              if (players.length >= 2) {
                const [pa, pb] = players;
                const nm = (u) => (gd.names[u] || '').split(' ')[0] || 'שחקן';
                gd.xo = { p1: pa, p2: pb, board: Array(9).fill(''), turn: pa, lastMove: Date.now(), name1: nm(pa), name2: nm(pb) };
                saveStore();
                await sock.sendMessage(remoteJid, {
                  text: `❌⭕ *איקס-עיגול מתחיל!* 🎮\n\n*${gd.xo.name1}* (❌) נגד *${gd.xo.name2}* (⭕)\n\n${renderXO(gd.xo.board)}\n\nתורו של *${gd.xo.name1}* — הקלידו *מספר 1-9*. 10 נקודות למנצח!`,
                  mentions: [pa, pb],
                });
                return;
              }
              gd.xo = { p1: sender, p2: null, board: Array(9).fill(''), turn: sender, lastMove: Date.now(), name1: name };
              saveStore();
              await sock.sendMessage(remoteJid, { text: `❌⭕ *אתגר איקס-עיגול!* 🎮\n\n*${name}* (❌) מזמין/ה למשחק.\nיריב כותב: ${prefix}איקס-עיגול\nאו תייגו שניים: ${prefix}איקס-עיגול @פלוני @אלמוני\n\nאחרי ההצטרפות: הקלידו *מספר 1-9* לתא. 10 נקודות למנצח!` });
              return;
            }
            if (gd.xo.p1 !== sender && !gd.xo.p2) {
              gd.xo.p2 = sender;
              gd.xo.name2 = name;
              gd.xo.turn = gd.xo.p1;
              gd.xo.lastMove = Date.now();
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🎮 *${name}* (⭕) הצטרף/ה למשחק!\n\n${renderXO(gd.xo.board)}\n\nתורו של *${gd.xo.name1 || 'המתחיל'}* (❌) — הקלידו מספר 1-9` });
              return;
            }
            if (/^[1-9]$/.test(arg)) {
              const ok = await xoMoveFlow(sock, remoteJid, gd, sender, +arg);
              if (ok) return;
            }
            const turnName = gd.xo.turn === gd.xo.p1 ? (gd.xo.name1 || 'המתחיל') : (gd.xo.name2 || gd.names[gd.xo.p2] || 'היריב');
            await sock.sendMessage(remoteJid, { text: `🎮 *משחק פעיל:*\n\n${renderXO(gd.xo.board)}\n\nתורו של *${turnName}*\nהקלידו מספר 1-9 | ${prefix}איקס-עיגול ביטול` });
            return;
          }
        }

        // --- מילים-מעורבבות ---
        {
          const m = text.match(/^(מילים-מעורבבות|מילה-מבולבלת|מלה-מבולבלת|scramble)(?=\s|:|-|$)/i);
          if (m) {
            const gd = gdata(remoteJid);
            if (gd.scramble) {
              await sock.sendMessage(remoteJid, { text: `🧩 *סבב פעיל:*\n\n➡️ \`${scrambleWord(gd.scramble.word)}\`\n\nהתשובה היא מילה בעברית. ${gd.scramble.attempts || 0} ניסיונות עד כה.\nבלי ! — רשמו את התשובה במסר רגיל.` });
              return;
            }
            const word = pickScrambleWord();
            gd.scramble = { word, started: Date.now(), until: Date.now() + 5 * 60000, attempts: 0 };
            saveStore();
            await sock.sendMessage(remoteJid, { text: `🧩 *מילים-מעורבבות!*\n\n➡️ \`${scrambleWord(word)}\`\n\nמה המילה? רשמו את התשובה *בלי !* — מי שמгад ראשון/ה מקבל/ת *3 נקודות*!\n⏰ הסבב נסגר בעוד 5 דקות.\n(סבב חדש: ${prefix}מילים-מעורבבות)` });
            return;
          }
        }

        // --- אמת-או-חובה ---
        {
          const m = text.match(/^(אמת-או-חובה|אמת או חובה|truth)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const r = pickTruthOrDare(arg);
            const label = r.kind === 'truth' ? '🫢 *אמת*' : '😈 *חובה*';
            await sock.sendMessage(remoteJid, { text: `${label}\n\n${r.text}\n\n_(מי שמסרב/ת — כותב/ת "וויתרתי" 😄)_` });
            return;
          }
        }

        // --- מלחמת-משפטים: הגשה ---
        {
          const m = text.match(/^משפט\s+([\s\S]+)$/);
          if (m) {
            const gd = gdata(remoteJid);
            const b = gd.battle;
            const sender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
            if (!b || b.phase !== 'collect') {
              await sock.sendMessage(remoteJid, { text: `⚔️ אין סבב פתוח ל submission.\nכתבי ${prefix}מלחמת-משפטים כדי להתחיל.` });
              return;
            }
            if (Object.keys(b.entries).length >= 4 && !b.entries[sender]) {
              await sock.sendMessage(remoteJid, { text: '⚔️ נותרו 4 מקומות בלבד לסבב הזה.' });
              return;
            }
            b.entries[sender] = m[1].trim().slice(0, 200);
            b.names[sender] = msg.pushName || gd.names[sender] || 'משתתפ/ת';
            saveStore();
            const left = Math.max(0, Math.round((b.endsAt - Date.now()) / 1000));
            await sock.sendMessage(remoteJid, { text: `✅ *ההגשה התקבלה!* (${Object.keys(b.entries).length}/4) — נותרו ${left} שניות.` });
            return;
          }
        }

        // --- מלחמת-משפטים: התחלה ---
        {
          const m = text.match(/^(מלחמת-משפטים|מלחמת משפטים|battle)(?=\s|:|-|$)/i);
          if (m) {
            const gd = gdata(remoteJid);
            if (gd.battle && gd.battle.phase === 'collect' && Date.now() < gd.battle.endsAt) {
              await sock.sendMessage(remoteJid, { text: `⚔️ הסבב כבר פתוח!组合 ${Math.round((gd.battle.endsAt - Date.now()) / 1000)} שניות נותרו.\nהגישי: ${prefix}משפט <המשפט שלך>` });
              return;
            }
            let setup = '';
            try {
              const { text: t } = await chatAI('כתוב פתיחה מצחיקה אחת ל"מלחמת משפטים" בקבוצה (משפט קצר אחד, עברית, קורע, בלי הסברים).', []);
              setup = (t || '').trim().split('\n')[0].slice(0, 160);
            } catch {}
            if (!setup) setup = pickBattleSetup();
            gd.battle = { phase: 'collect', setup, entries: {}, names: {}, votes: {}, endsAt: Date.now() + 90000 };
            saveStore();
            await sock.sendMessage(remoteJid, { text: `⚔️ *מלחמת-משפטים!* 🔥\n\nכתבו המשך ל: _${setup}_\n\nמגישים משפט מצחיק: ${prefix}משפט <המשפט>\n⏰ 90 שניות · מקסימום 4 הגשות\nבסיום — ההצבעה ב-1 / 2 / 3. המנצח/ת: *10 נקודות*!` });
            return;
          }
        }

        // --- רעידות אדמה ---
        {
          const m = text.match(/^(רעידת-אדמה|רעידת אדמה|רעידות)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            await sendTyping(sock, remoteJid, 700);
            try {
              await sock.sendMessage(remoteJid, { text: await earthquakes(m[2] || '') });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `🌍 ${e.message}` });
            }
            return;
          }
        }

        // --- איכות אוויר ---
        {
          const m = text.match(/^(זיהום-אוויר|זיהום אוויר|זיהום|AQI|air)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            await sendTyping(sock, remoteJid, 700);
            try {
              await sock.sendMessage(remoteJid, { text: await airQuality(m[2] || '') });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😷 ${e.message}` });
            }
            return;
          }
        }

        // --- מדדים ---
        {
          const m = text.match(/^(מדד|מדדים|index)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            const q = (m[2] || '').trim();
            await sendTyping(sock, remoteJid, 800);
            const show = async (sym) => { try { return await stockPrice(sym); } catch { return null; } };
            if (q) {
              const sym = resolveIndexSymbol(q) || q;
              const out = await show(sym);
              await sock.sendMessage(remoteJid, { text: out || `⚠️ לא מצאתי מדד ל"${q}". נסה: ${prefix}מדד` });
              return;
            }
            const [ta, sp] = await Promise.all([show('TA35.TA'), show('^GSPC')]);
            const parts = [ta, sp].filter(Boolean);
            if (!parts.length) {
              await sock.sendMessage(remoteJid, { text: `⚠️ שרות המדדים לא זמין כרגע. נסה שוב בעוד דקה.\nשמות לתיבה: ${prefix}מדד ת"א 35 | s&p | נאסד"ק | זהב | נפט` });
            } else {
              await sock.sendMessage(remoteJid, { text: `${parts.join('\n\n')}\n\n💡 ${prefix}מדד <שם> — מדד ספציפי` });
            }
            return;
          }
        }

        // --- תורנות ---
        {
          const m = text.match(/^(תורנות|תורן)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            const d = gd.duty;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctx?.mentionedJid || [];
            const fmt = (u) => gd.names[u] || String(u).split('@')[0].split(':').slice(-1)[0];
            if (/^(הוסף|הוספה|\+|join)/i.test(arg)) {
              const list = mentioned.length
                ? mentioned.map(fmt)
                : arg.replace(/^(הוסף|הוספה|\+|join)\s*/i, '').trim().split(/[,|]+/).map((s) => s.trim()).filter(Boolean);
              if (!list.length) { await sock.sendMessage(remoteJid, { text: `⚠️ כתוב: ${prefix}תורנות הוסף @משתמש` }); return; }
              for (const nm of list) if (!d.members.includes(nm)) d.members.push(nm.slice(0, 40));
              saveStore();
              await sock.sendMessage(remoteJid, { text: `✅ נוסף/ו: ${list.join(', ')}\n📊 בסה״כ ${d.members.length} בתורנות.` });
              return;
            }
            if (/^(הסר|הסרה|-|leave)/i.test(arg)) {
              const list = mentioned.length ? mentioned.map(fmt)
                : arg.replace(/^(הסר|הסרה|-|leave)\s*/i, '').trim().split(/[,|]+/).map((s) => s.trim()).filter(Boolean);
              if (!list.length) { await sock.sendMessage(remoteJid, { text: `⚠️ כתוב: ${prefix}תורנות הסר @משתמש` }); return; }
              d.members = d.members.filter((x) => !list.includes(x));
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🗑️ הוסרו: ${list.join(', ')}` });
              return;
            }
            if (/^(הבא|הבא-תורן|next)/i.test(arg)) {
              if (!d.members.length) { await sock.sendMessage(remoteJid, { text: 'רשימה ריקה.' }); return; }
              d.idx = (d.idx + 1) % d.members.length;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🔁 *התור הבא:* ${d.members[d.idx]}\n\n📊 רשימת התורנות:\n${d.members.map((x, i) => `${i === d.idx ? '👉 ' : '• '}${x}`).join('\n')}` });
              return;
            }
            if (/^(נקה|איפוס|clear)/i.test(arg)) {
              d.members = []; d.idx = 0;
              saveStore();
              await sock.sendMessage(remoteJid, { text: '🧹 רשימת התורנות נוקתה.' });
              return;
            }
            if (!d.members.length) {
              await sock.sendMessage(remoteJid, { text: `📋 *תורנות* — עדיין ריקה.\n\n${prefix}תורנות הוסף @משתמש (או שם)\n${prefix}תורנות הבא — החלפת תורן\n${prefix}תורנות` });
              return;
            }
            const cur = d.members[d.idx % d.members.length];
            await sock.sendMessage(remoteJid, { text: `📋 *תורנות שבועית*\n\n👉 *עכשיו:* ${cur}\n🔁 הבא: ${d.members[(d.idx + 1) % d.members.length]}\n\n${d.members.map((x, i) => `${i === d.idx ? '👉 ' : '• '}${x}`).join('\n')}\n\nפקודות: ${prefix}תורנות הוסף | הסר | הבא | נקה` });
            return;
          }
        }

        // --- השתקת בוט זמנית / כיבוי מלא לצ'אט הזה ---
        {
          const m = text.match(/^(השתק-בוט|השתק בוט|כבה-בוט|כבה בוט|mute-bot)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            const mins = parseInt(arg, 10);
            if (!arg || !Number.isFinite(mins) || mins <= 0) {
              if (/^כבה/.test(m[1])) {
                // !כבה בוט בלי מספר = כיבוי מלא (עד להדלקה)
                gd.botMutedUntil = Date.now() + 10 * 365 * 24 * 3600 * 1000;
                saveStore();
                await sock.sendMessage(remoteJid, { text: `🔕 הבוט *כובה* בצ'אט הזה.\nלהדלקה: ${prefix}הדלק-בוט` });
                return;
              }
              const on = gd.botMutedUntil && Date.now() < gd.botMutedUntil;
              await sock.sendMessage(remoteJid, { text: `🔕 *השתק-בוט* — ${on ? `מושתק עד ${new Date(gd.botMutedUntil).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'לא מושתק'}\n\nכיבוי מלא: ${prefix}כבה-בוט\nהפעלה: ${prefix}השתק-בוט 30 (דקות)` });
              return;
            }
            gd.botMutedUntil = Date.now() + mins * 60000;
            saveStore();
            await sock.sendMessage(remoteJid, { text: `🔕 הבוט מושתק ל-*${mins} דקות*.\nלפתיחה מוקדמת: ${prefix}פתח-בוט` });
            return;
          }
        }
        {
          const m = text.match(/^(פתח-בוט|בוט-פתח|הדלק-בוט|הדלק בוט|unmute-bot)(?=\s|:|-|$)/i);
          if (m) {
            const gd = gdata(remoteJid);
            gd.botMutedUntil = 0;
            saveStore();
            await sock.sendMessage(remoteJid, { text: '🔔 הבוט חזר לפעול.' });
            return;
          }
        }

        // --- נקה (מחיקת התשובה האחרונה של הבוט) ---
        {
          if (/^(נקה|מחק-תשובה)$/i.test(text)) {
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            let key = null;
            if (ctx?.quotedMessage && ctx.stanzaId) {
              key = { remoteJid, fromMe: true, id: ctx.stanzaId, participant: ctx.participant || remoteJid };
            } else {
              key = lastBotKey.get(remoteJid) || null;
            }
            if (!key?.id) {
              await sock.sendMessage(remoteJid, { text: `🗑️ אין הודעת בוט למחיקה.\nהגיב/י (Reply) על הודעה של הבוט וכתוב: ${prefix}נקה` });
              return;
            }
            try {
              await sock.sendMessage(remoteJid, { delete: key });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי למחוק — הבוט צריך להיות מנהל בקבוצה.' });
            }
            return;
          }
        }

        // --- סטטוס הקבוצה ---
        {
          const m = text.match(/^(סטטוס-קבוצה|סטטוס קבוצה|פרטי-קבוצה)(?=\s|:|-|$)/i);
          if (m) {
            try {
              const meta = await getGroupMeta(sock, remoteJid, true);
              const parts = meta?.participants || [];
              const admins = parts.filter((p) => p.admin === 'admin' || p.admin === 'superadmin');
              const botId = sock.user?.id?.split(':')[0];
              const botP = parts.find((p) => p.id && String(p.id).split(':')[0] === botId);
              const gd = gdata(remoteJid);
              const created = meta?.creation ? new Date(meta.creation * 1000).toLocaleDateString('he-IL') : '—';
              const active = [
                gd.toggles.antilink && 'אנטי-לינק', gd.toggles.anticurse && 'אנטי-קללות',
                gd.toggles.antispam && 'אנטי-ספאם', gd.toggles.welcome && 'ברוכים-הבאים',
                gd.toggles.morning && 'בוקר-טוב', gd.toggles.rates && 'שערים', gd.toggles.brief && 'בריף',
                (gd.botMutedUntil > Date.now()) && 'בוט-מושתק', gd.xo && 'משחק-XO', gd.scramble && 'סבב-מילים',
                gd.battle && 'מלחמת-משפטים', (gd.duty.members || []).length && 'תורנות',
                (gd.follows || []).length && `מעקב(${gd.follows.length})`, (gd.reminders || []).length && `תזכורות(${gd.reminders.length})`,
              ].filter(Boolean);
              let out = `📊 *סטטוס הקבוצה*\n\n📛 שם: ${meta?.subject || '—'}\n👥 חברים: ${parts.length}\n🛡️ מנהלים: ${admins.length}\n📅 נוצרה: ${created}\n🤖 מעמד הבוט: ${botP?.admin ? 'מנהל ✅' : 'חבר רגיל ⚠️'}\n\n🎯 פעיל כרגע: ${active.length ? active.join(' · ') : 'כלום'}\n\n📣 ${config.BOT_PREFIX}עזרה — כל הפקודות`;
              await sock.sendMessage(remoteJid, { text: out });
            } catch (e) {
              await sock.sendMessage(remoteJid, { text: `😢 לא הצלחתי לשלוף פרטים: ${e.message}` });
            }
            return;
          }
        }

        // --- יומן (סיכום שיחה של היום) ---
        {
          const m = text.match(/^(יומן|סיכום-יום|יומן-יום)(?=\s|:|-|$)/i);
          if (m) {
            const logs = recentChat(remoteJid, 200).filter((l) => l.text && Date.now() - (l.time || 0) < 20 * 3600000);
            if (logs.length < 5) {
              await sock.sendMessage(remoteJid, { text: '📔 אין מספיק שיחות היום לסיכום (נדרשות 5 הודעות).' });
              return;
            }
            await sendTyping(sock, remoteJid, 1200);
            const gd = gdata(remoteJid);
            const transcript = logs.slice(-70).map((l) => `${(gd.names[l.sender] || l.name || 'חבר').split(' ')[0]}: ${l.text}`).join('\n').slice(0, 4000);
            try {
              const { text: sum } = await chatAI(
                `אלה הודעות מקבוצת וואטסאפ היום. כתוב יומן קצר ומשעשע בעברית: 5 שורות מקסימום, עם שמות מי דיבר ומה קרה. בלי הקדמות.\n\n${transcript}`,
                [],
              );
              await sock.sendMessage(remoteJid, { text: `📔 *יומן הקבוצה — היום*\n\n${(sum || '').trim()}` });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי לסכם את היום.' });
            }
            return;
          }
        }

        // --- סקרים (תוצאות/סגור נבדקים קודם כדי שלא ייחטפו ע"י "סקר") ---
        {
          if (/^(סקר-תוצאות)(?=\s|:|-|$)/i.test(text)) {
            const open = gdata(remoteJid).polls.filter((p) => p.open);
            await sock.sendMessage(remoteJid, { text: open.length ? pollResults(open[open.length - 1]) : '📊 אין סקר פעיל.' });
            return;
          }
          if (/^(סקר-סגור)(?=\s|:|-|$)/i.test(text)) {
            const gd = gdata(remoteJid);
            const open = gd.polls.filter((p) => p.open);
            if (!open.length) {
              await sock.sendMessage(remoteJid, { text: '📊 אין סקר פעיל.' });
            } else {
              const p = open[open.length - 1];
              p.open = false;
              saveStore();
              await sock.sendMessage(remoteJid, { text: pollResults(p) });
            }
            return;
          }
          const m = text.match(/^(סקר)(?=\s|:|\||$)\s*[:\-]?\s*([\s\S]+)?$/i);
          if (m) {
            const rest = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            if (!rest) {
              const open = gd.polls.filter((p) => p.open);
              if (!open.length) {
                await sock.sendMessage(remoteJid, { text: `📊 כתוב: ${prefix}סקר <שאלה> | <אופציה> | <אופציה>\nדוגמה: ${prefix}סקר איפה נפגשים? | פארק | ים\nהצבעה: מספר האפשרות. ${prefix}סקר-סגור לסגירה` });
              } else {
                await sock.sendMessage(remoteJid, { text: pollResults(open[open.length - 1]) });
              }
              return;
            }
            const parts = rest.split('|').map((s) => s.trim()).filter(Boolean);
            if (parts.length < 3) {
              await sock.sendMessage(remoteJid, { text: `😢 צריך שאלה + 2 אפשרויות עם |.\nדוגמה: ${prefix}סקר איפה? | פארק | ים` });
              return;
            }
            gd.polls.forEach((p) => { p.open = false; });
            const poll = newPoll(parts[0].slice(0, 200), parts.slice(1, 7));
            gd.polls.push(poll);
            saveStore();
            await sock.sendMessage(remoteJid, { text: pollResults(poll) });
            return;
          }
        }

        // --- חיתוך הקלטה ---
        {
          const m = text.match(/^(חתוך)\s*[:\-]?\s*(\d+)?/i);
          if (m) {
            const secs = Math.min(Math.max(parseInt(m[2]) || 30, 5), 300);
            const qm = quoted?.audioMessage ? { key: { remoteJid, id: 'q', fromMe: false }, message: quoted } : null;
            const target = msg.message?.audioMessage ? msg : qm;
            if (!target) {
              await sock.sendMessage(remoteJid, { text: `✂️ הגב להודעה קולית עם: ${prefix}חתוך <שניות>\nדוגמה: ${prefix}חתוך 20` });
              return;
            }
            await sendTyping(sock, remoteJid, 1000);
            try {
              const buf = await downloadMediaMessage(target, 'buffer', {});
              const out = await trimAudio(buf, secs, 'ogg');
              await sock.sendMessage(remoteJid, { audio: out, mimetype: 'audio/ogg; codecs=opus', ptt: true });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 החיתוך נכשל.' });
            }
            return;
          }
        }

        // --- טוגלים ---
        {
          const m = text.match(/^(אוטו-סטיקר|אוטו-תרגם)\s*[:\-]?\s*(on|off|הפעל|כבה)?$/i);
          if (m) {
            const key = m[1] === 'אוטו-סטיקר' ? 'autoSticker' : 'autoTranslate';
            const gd = gdata(remoteJid);
            const arg = (m[2] || '').trim();
            if (!arg) {
              await sock.sendMessage(remoteJid, { text: `${m[1]} כרגע: *${gd.toggles[key] ? 'פעיל ✅' : 'כבוי'}*\n${prefix}${m[1]} on / off` });
              return;
            }
            gd.toggles[key] = /^(on|הפעל)$/i.test(arg);
            saveStore();
            await sock.sendMessage(remoteJid, { text: `${m[1]} ${gd.toggles[key] ? 'הופעל ✅' : 'כובה'}` });
            return;
          }
        }

        // --- בחירת קול ---
        {
          const m = text.match(/^(קול)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            if (!arg) {
              await sock.sendMessage(remoteJid, { text: `🎤 הקול כרגע: *${gd.toggles.voice}*\n${prefix}קול רגיל | ${prefix}קול גברי | ${prefix}קול נשי` });
              return;
            }
            if (/^(רגיל|גברי|נשי)$/.test(arg)) {
              gd.toggles.voice = arg;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🎤 הקול הוגדר: *${arg}* ✅` });
            } else {
              await sock.sendMessage(remoteJid, { text: `😢 בחר: רגיל / גברי / נשי` });
            }
            return;
          }
        }

        // --- אירועים ("אירועים" נבדק קודם כדי שלא ייחטף ע"י "אירוע") ---
        {
          if (/^(אירועים)(?=\s|:|-|$)/i.test(text)) {
            const evs = listEvents(remoteJid, 10);
            if (!evs.length) {
              await sock.sendMessage(remoteJid, { text: '📅 אין אירועים קרובים.' });
            } else {
              let out = '📅 *אירועים קרובים:*\n\n';
              evs.forEach((e) => { out += `• ${e.d}.${e.m}.${e.y} — ${e.text}\n`; });
              await sock.sendMessage(remoteJid, { text: out.trim() });
            }
            return;
          }
          const m = text.match(/^(אירוע)(?=\s|:|-|$)\s*[:\-]?\s*([\s\S]+)?$/i);
          if (m) {
            const rest = (m[2] || '').trim();
            if (!rest) {
              await sock.sendMessage(remoteJid, { text: `📅 הוספה: ${prefix}אירוע 25.12 מסיבה\nרשימה: ${prefix}אירועים` });
              return;
            }
            const dm = rest.match(/^(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\s+([\s\S]+)/);
            if (!dm || !addEvent(remoteJid, dm[1], dm[2])) {
              await sock.sendMessage(remoteJid, { text: `😢 פורמט לא תקין. דוגמה: ${prefix}אירוע 25.12 מסיבה` });
              return;
            }
            await sock.sendMessage(remoteJid, { text: `📅 האירוע נוסף! ✅` });
            return;
          }
        }

        // --- בוקר-טוב ושערים יומיים ---
        {
          let m = text.match(/^(בוקר)\s*[:\-]?\s*(on|off|הפעל|כבה)?\s*(.*)$/i);
          if (m) {
            const gd = gdata(remoteJid);
            const arg = (m[2] || '').trim();
            const city = (m[3] || '').trim().slice(0, 40) || gd.toggles.morningCity;
            if (!arg) {
              await sock.sendMessage(remoteJid, { text: `🌅 בוקר-טוב יומי: *${gd.toggles.morning ? `פעיל ✅ (${gd.toggles.morningCity})` : 'כבוי'}*\n${prefix}בוקר on [עיר] — כל בוקר 8:00 + מזג אוויר` });
              return;
            }
            gd.toggles.morning = /^(on|הפעל)$/i.test(arg);
            gd.toggles.morningCity = city;
            saveStore();
            await sock.sendMessage(remoteJid, { text: `🌅 בוקר-טוב ${gd.toggles.morning ? `הופעל ✅ (${city})` : 'כובה'}` });
            return;
          }
          m = text.match(/^(שערים-יומי)\s*[:\-]?\s*(on|off|הפעל|כבה)?$/i);
          if (m) {
            const gd = gdata(remoteJid);
            const arg = (m[2] || '').trim();
            if (!arg) {
              await sock.sendMessage(remoteJid, { text: `💹 עדכון שערים יומי: *${gd.toggles.rates ? 'פעיל ✅ (9:00)' : 'כבוי'}*\n${prefix}שערים-יומי on` });
              return;
            }
            gd.toggles.rates = /^(on|הפעל)$/i.test(arg);
            saveStore();
            await sock.sendMessage(remoteJid, { text: `💹 עדכון שערים ${gd.toggles.rates ? 'הופעל ✅' : 'כובה'}` });
            return;
          }
          // 📰 בריף בוקר: חדשות + מזג + שערים — כל בוקר 7:30
          m = text.match(/^(בריף|בריף-בוקר)\s*[:\-]?\s*(on|off|הפעל|כבה)?\s*(.*)$/i);
          if (m) {
            const gd = gdata(remoteJid);
            const arg = (m[2] || '').trim();
            const city = (m[3] || '').trim().slice(0, 40) || gd.toggles.briefCity;
            if (!arg) {
              await sock.sendMessage(remoteJid, { text: `📰 בריף בוקר: *${gd.toggles.brief ? `פעיל ✅ (7:30, ${gd.toggles.briefCity})` : 'כבוי'}*\n${prefix}בריף on [עיר] — חדשות + מזג אוויר + שערים כל בוקר` });
              return;
            }
            gd.toggles.brief = /^(on|הפעל)$/i.test(arg);
            gd.toggles.briefCity = city;
            saveStore();
            await sock.sendMessage(remoteJid, { text: `📰 בריף בוקר ${gd.toggles.brief ? `הופעל ✅ (7:30, ${city})` : 'כובה'}` });
            return;
          }
        }

        // --- מעקב יוטיוב ---
        {
          const m = text.match(/^(מעקב)\s*[:\-]?\s*([\s\S]+)?$/i);
          if (m) {
            const arg = (m[2] || '').trim();
            const gd = gdata(remoteJid);
            if (!arg) {
              const f = gd.follows;
              await sock.sendMessage(remoteJid, { text: f.length ? `🔔 *במעקב:*\n${f.map((x) => `• ${x.title ? `${x.title} (${x.id})` : x.id}`).join('\n')}\n\nלהסרה: ${prefix}הסר-מעקב <id>` : `🔔 כתוב: ${prefix}מעקב <שם ערוץ / קישור / @handle / מזהה UC>\nאפשר גם שם לא מדויק — אחפש לבד! 🎬` });
              return;
            }
            await sendTyping(sock, remoteJid, 1500);
            try {
              // זיהוי גמיש: UC / קישור / @handle / שם (גם לא מדויק)
              const found = await resolveYouTubeChannel(arg);
              if (!found) {
                await sock.sendMessage(remoteJid, { text: `😢 לא מצאתי ערוץ בשם "${arg.slice(0, 60)}".\nנסה שם אחר, קישור לערוץ או @handle.` });
                return;
              }
              const vids = await checkChannel(found.id);
              if (!vids.length) {
                await sock.sendMessage(remoteJid, { text: `😢 לא מצאתי ערוץ בשם "${arg.slice(0, 60)}".\nנסה שם אחר, קישור לערוץ או @handle.` });
                return;
              }
              if (gd.follows.some((x) => x.id === found.id)) {
                await sock.sendMessage(remoteJid, { text: '🔔 הערוץ כבר במעקב.' });
              } else {
                gd.follows.push({ id: found.id, title: found.title || '', lastVid: vids[0]?.id || '', lastCheck: Date.now() });
                saveStore();
                const who = found.title ? `"${found.title}"` : found.id;
                await sock.sendMessage(remoteJid, { text: `🔔 נוסף למעקב: ${who} ✅\nאחרון: "${(vids[0]?.title || '').slice(0, 80)}"` });
              }
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא מצאתי את הערוץ. נסה שם אחר או קישור.' });
            }
            return;
          }
          const rm = text.match(/^(הסר-מעקב)(?=\s|:|-|$)\s*[:\-]?\s*(.*)?$/is);
          if (rm) {
            const id = (rm[2] || '').trim();
            if (!id) {
              await sock.sendMessage(remoteJid, { text: `🔕 כתוב: ${prefix}הסר-מעקב <מזהה ערוץ>` });
              return;
            }
            const gd = gdata(remoteJid);
            gd.follows = gd.follows.filter((x) => x.id !== id);
            saveStore();
            await sock.sendMessage(remoteJid, { text: '🔕 הוסר מהמעקב.' });
            return;
          }
        }

        // --- 🌐 יצירת אתר + העלאה אוטומטית לגיטהאב Pages ---
        {
          const m = text.match(/^(אתר|אתרים|website|site)(?=\s|:|$)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const desc = (m[2] || '').trim();
            if (!desc) {
              await sock.sendMessage(remoteJid, { text: SITE_HELP });
              return;
            }
            await sock.sendMessage(remoteJid, { text: `🌐 יוצר אתר: "${desc.slice(0, 80)}"...\n🎨 כותב קוד → ☁️ מעלה לגיטהאב → 🔗 שולח כתובת` });
            await sendTyping(sock, remoteJid, 1500);
            try {
              const res = await generateSiteHTML(desc);
              if (res.cannot) {
                await sock.sendMessage(remoteJid, { text: `🌐 לא יכול לבנות את זה כאתר סטטי:\n${res.cannot}\n\nנסה בקשה אחרת — למשל דף נחיתה, תפריט או גלריה.` });
                return;
              }
              const id = newSiteId();
              await sock.sendMessage(remoteJid, { text: `🌐 הקוד מוכן, מעלה לגיטהאב Pages...` });
              const { url } = await publishSite(id, res.html, `new site ${id}: ${desc.slice(0, 80)}`);
              await sock.sendMessage(remoteJid, { text: `🌐 הועלה! מחכה שהכתובת תתעדכן בגיטהאב (עד דקה)...` });
              const live = await waitForSite(url, 120000);
              await sock.sendMessage(remoteJid, { text: `🌐 *האתר מוכן!* #${id}\n${desc.slice(0, 120)}\n\n📝 מה נבנה: ${res.summary || 'דף יחיד בעברית'}\n\n🔗 *תצוגה מקדימה${live ? ' (נבדק ✅ עובד)' : ''}:*\n${url}\n\n✏️ לשינויים — הגב (Reply) להודעה זו עם הבקשה.` });
            } catch (e) {
              console.error('site create fail:', e.message?.slice(0, 200));
              await sock.sendMessage(remoteJid, { text: '😢 יצירת האתר נכשלה (גיטהאב או AI). נסה שוב בעוד דקה.' });
            }
            return;
          }
        }

// הודעת איסור הורדות (שירים/סרטונים מבוטלים — זכויות יוצרים)
const DOWNLOAD_DISABLED =
  `⛔ *הורדת שירים וסרטונים מבוטלת*\n` +
  `הורדת קבצי אודיו/וידאו מיוטיוב אסורה (זכויות יוצרים ותנאי השימוש של יוטיוב).\n\n` +
  `✅ במקום זה אפשר:\n` +
  `• ${config.BOT_PREFIX}שיר <שם> — קישור חוקי לצפייה\n` +
  `• ${config.BOT_PREFIX}וידאו <נושא> — קישורים חוקיים`;

        // --- הורדות מבוטלות (אודיו/וידאו — lookahead כדי לא לחטוף "הורד-ניהול") ---
        {
          const m = text.match(/^(הורד)(?=\s|:|$)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            await sock.sendMessage(remoteJid, { text: DOWNLOAD_DISABLED });
            return;
          }
        }
        {
          const m = text.match(/^(הורד-וידאו|הורד וידאו|הורד סרטון|download-video)(?=\s|:|$)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            await sock.sendMessage(remoteJid, { text: DOWNLOAD_DISABLED });
            return;
          }
        }

        // --- 💎 מנויי פרו (Google Sheets מקור אמת; ניהול — בעל הבוט/מנהלים) ---
        {
          const proSender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          const proCheck = async (allowSelf) => {
            if (msg.key.fromMe) return true;
            if (allowSelf) return true;
            try {
              if (await isSenderAdmin(sock, remoteJid, proSender)) return true;
            } catch {}
            await sock.sendMessage(remoteJid, { text: '⛔ ניהול מנויים — למנהלי הקבוצה/בעל הבוט בלבד.' });
            return false;
          };
          // כינויים: מצב-פרו / פרו מצב X → פרו-מצב X (לפני בלוק הפיצ' וההענקה)
          if (/^(מצב-פרו|מצב פרו|סטטוס-פרו)$/i.test(text)) text = 'פרו-מצב';
          {
            const pm = text.match(/^פרו\s+(מצב|סטטוס|status)\s*(.+)?$/is);
            if (pm) text = `פרו-מצב ${pm[2] || ''}`.trim();
          }
          // !פרו — הבוט חינמי לגמרי (הודעת PRO הישנה הוסרה)
          {
            const m = text.match(/^(פרו|pro)(?=\s|:|$)\s*$/is);
            if (m) {
              await sock.sendMessage(remoteJid, { text: `🎉 *הבוט חינמי לגמרי!*\nכל הפקודות פתוחות לכולם — בקבוצה ובפרטי, בלי הגבלה ובלי תשלום.` });
              return;
            }
          }
          // !פרו <מספר> <משך> — הענקה/הארכה. דוגמה: !פרו 0501234567 30 ימים / !פרו 0501234567 5 דקות
          {
            const m = text.match(/^(פרו|pro)(?=\s|:|$)\s*[:\-]?\s*([\s\S]+)$/is);
            if (m) {
              if (!subsConfigured()) {
                await sock.sendMessage(remoteJid, { text: SUBS_SETUP_HELP });
                return;
              }
              if (!(await proCheck(false))) return;
              const { phoneRaw, durText } = splitPhoneDur(m[2]);
              const phone = normPhone(phoneRaw);
              const dur = parseDuration(durText);
              if (!phone) {
                await sock.sendMessage(remoteJid, { text: `💎 מספר לא תקין.\nדוגמה: ${prefix}פרו 0501234567 30 ימים` });
                return;
              }
              if (!dur.totalSec || dur.totalSec <= 0) {
                await sock.sendMessage(remoteJid, { text: `💎 ציין משך: ימים / שעות / דקות / שניות.\nדוגמה: ${prefix}פרו 0501234567 5 דקות` });
                return;
              }
              try {
                const by = msg.pushName || proSender.split('@')[0];
                const { sub, extended } = await grantSub({ phone, name: '', dur, chatJid: remoteJid, grantedBy: by });
                proPhones.add(phone); // עדכון מטמון מיידי (בלי לחכות לרענון)
                await sock.sendMessage(remoteJid, { text:
                  `💎 *מנוי פרו ${extended ? 'הוארך' : 'נרשם'}!*\n📱 ${phone}\n⏳ בתוקף עד: ${new Date(sub.expiry_ms).toLocaleString('he-IL')}\n⏱️ נשאר: ${fmtLeft(sub.expiry_ms - Date.now())}` });
              } catch (e) {
                console.error('pro grant fail:', (e && e.message || '').slice(0, 160));
                await sock.sendMessage(remoteJid, { text: '😢 רישום המנוי נכשל (בדוק גישה לגיליון).' });
              }
              return;
            }
          }
          // !פרו-בטל <מספר> — ביטול
          {
            const m = text.match(/^(פרו-בטל|פרו-ביטול|pro-cancel)(?=\s|:|$)\s*[:\-]?\s*(.+)?$/is);
            if (m) {
              if (!subsConfigured()) {
                await sock.sendMessage(remoteJid, { text: SUBS_SETUP_HELP });
                return;
              }
              if (!(await proCheck(false))) return;
              const phone = normPhone(m[2] || '');
              if (!phone) {
                await sock.sendMessage(remoteJid, { text: `💎 מספר לא תקין.\nדוגמה: ${prefix}פרו-בטל 0501234567` });
                return;
              }
              try {
                const cur = await revokeSub(phone);
                if (cur) { proPhones.delete(phone); refreshProLists(sock, true).catch(() => {}); }
                await sock.sendMessage(remoteJid, { text: cur ? `💎 מנוי ${phone} בוטל.` : `💎 לא נמצא מנוי ל-${phone}.` });
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: '😢 הביטול נכשל (בדוק גישה לגיליון).' });
              }
              return;
            }
          }
          // !פרו-מצב [מספר] — בדיקת מנוי (כולם; מספר ספציפי — מנהלים/בעלים)
          {
            const m = text.match(/^(פרו-מצב|פרו-סטטוס|pro-status)(?=\s|:|$)\s*[:\-]?\s*(.+)?$/is);
            if (m) {
              if (!subsConfigured()) {
                await sock.sendMessage(remoteJid, { text: SUBS_SETUP_HELP });
                return;
              }
              const arg = (m[2] || '').trim();
              if (arg && !(await proCheck(false))) return;
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `💎 כתוב מספר לבדיקה.\nדוגמה: ${prefix}פרו-מצב 0501234567` });
                return;
              }
              const phone = normPhone(arg);
              if (!phone) {
                await sock.sendMessage(remoteJid, { text: '💎 מספר לא תקין.' });
                return;
              }
              try {
                const s = await getSub(phone);
                if (!s) {
                  await sock.sendMessage(remoteJid, { text: `💎 אין מנוי רשום ל-${phone}.` });
                } else {
                  const noLimit = s.status === 'active' && !s.expiry_ms;
                  const left = s.status === 'active' ? (s.expiry_ms ? s.expiry_ms - Date.now() : Infinity) : -1;
                  await sock.sendMessage(remoteJid, { text:
                    `💎 *מנוי ${phone}*\nסטטוס: ${left > 0 ? 'פעיל ✅' : 'פג תוקף ⛔'}\n${noLimit ? 'תוקף: ללא הגבלה ♾️' : (left > 0 ? `נשאר: ${fmtLeft(left)}\nעד: ${new Date(s.expiry_ms).toLocaleString('he-IL')}` : '')}` });
                }
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: '😢 הבדיקה נכשלה (בדוק גישה לגיליון).' });
              }
              return;
            }
          }
          // !מנויים — רשימת פעילים (מנהלים/בעלים)
          {
            if (/^(מנויים|מנוי-רשימה|pro-list)$/i.test(text)) {
              if (!subsConfigured()) {
                await sock.sendMessage(remoteJid, { text: SUBS_SETUP_HELP });
                return;
              }
              if (!(await proCheck(false))) return;
              try {
                const all = await readSubs();
                const now = Date.now();
                const act = all.filter((s) => s.status === 'active' && (!s.expiry_ms || s.expiry_ms > now))
                  .sort((a, b) => (a.expiry_ms || Infinity) - (b.expiry_ms || Infinity)).slice(0, 30);
                if (!act.length) {
                  await sock.sendMessage(remoteJid, { text: '💎 אין מנויים פעילים כרגע.' });
                } else {
                  await sock.sendMessage(remoteJid, { text:
                    `💎 *מנויים פעילים (${act.length}):*\n` +
                    act.map((s) => `• ${s.phone} — ${s.expiry_ms ? `נשאר ${fmtLeft(s.expiry_ms - now)}` : 'ללא הגבלה ♾️'}`).join('\n') });
                }
              } catch (e) {
                await sock.sendMessage(remoteJid, { text: '😢 השליפה נכשלה (בדוק גישה לגיליון).' });
              }
              return;
            }
          }
        }

        // --- 🛡️ ניהול קבוצה (חדש — רק מנהלים מגדירים; צפייה פתוחה לכולם) ---
        {
          const sender = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
          const parseOnOff = (s) => {
            const t = (s || '').trim();
            if (/^(on|הפעל|כן|פעיל)$/i.test(t)) return true;
            if (/^(off|כבה|לא|כבוי)$/i.test(t)) return false;
            return null;
          };
          const needAdmin = async () => {
            try {
              if (await isSenderAdmin(sock, remoteJid, sender)) return true;
            } catch {}
            await sock.sendMessage(remoteJid, { text: `⛔ הפקודה הזו למנהלי הקבוצה בלבד.` });
            return false;
          };
          const needBotAdmin = async () => {
            try {
              if (await isBotAdmin(sock, remoteJid)) return true;
            } catch {}
            await sock.sendMessage(remoteJid, { text: `🤖 כדי לבצע זאת הבוט עצמו חייב להיות מנהל בקבוצה.\nהפוך אותו למנהל ונסה שוב.` });
            return false;
          };

          // 📊 הגדרות — צפייה פתוחה לכולם
          if (/^(הגדרות|הגדרות-ניהול|settings)$/i.test(text)) {
            const gd = gdata(remoteJid);
            const on = (v) => (v ? 'פעיל ✅' : 'כבוי');
            await sock.sendMessage(remoteJid, {
              text:
                `🛡️ *הגדרות ניהול:*\n\n` +
                `🔗 קישורים: *${on(gd.toggles.antilink)}*\n` +
                `🤬 סינון קללות: *${on(gd.toggles.anticurse)}*\n` +
                `🌊 ספאם-קשוח: *${on(gd.toggles.antispam)}*\n` +
                `👋 ברוכים: *${on(gd.toggles.welcome)}*\n` +
                `📜 חוקים: ${gd.rules ? 'מוגדר ✅' : 'לא מוגדר'}\n` +
                `🔇 מושתקים: ${gd.muted.length}\n` +
                `⚠️ מוזהרים: ${Object.keys(gd.warns || {}).length}\n\n` +
                `_שינוי — מנהלים בלבד (${prefix}מנהלים לעזרה)_`,
            });
            return;
          }

          // 🔗 קישורים on/off
          {
            const m = text.match(/^(קישורים|אנטי-קישורים|antilink)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const arg = (m[2] || '').trim();
              const gd = gdata(remoteJid);
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `🔗 הסרת קישורים: *${gd.toggles.antilink ? 'פעילה ✅' : 'כבויה'}*\n${prefix}קישורים on / off\n(מנהלים בלבד לשינוי — 3 אזהרות = הרחקה)` });
                return;
              }
              if (!(await needAdmin())) return;
              const v = parseOnOff(arg);
              if (v === null) {
                await sock.sendMessage(remoteJid, { text: `😢 כתוב: ${prefix}קישורים on / off` });
                return;
              }
              gd.toggles.antilink = v;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🔗 הסרת קישורים ${v ? 'הופעלה ✅ (קישור = מחיקה + אזהרה)' : 'כובה'}` });
              return;
            }
          }

          // 🔗 דומיינים מותרים (רשימה לבנה כשהאנטי-לינק פעיל)
          {
            const m = text.match(/^(קישורים-מותרים|לינקים-מותרים|linkallow)\s*[:\-]?\s*([\s\S]+)?$/is);
            if (m) {
              const arg = (m[2] || '').trim();
              const gd = gdata(remoteJid);
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `🔗 *דומיינים מותרים:* ${gd.linkAllow.length ? gd.linkAllow.join(', ') : '— (הכל נחסם)'}\n${prefix}קישורים-מותרים youtube.com, facebook.com\n${prefix}קישורים-מותרים נקה` });
                return;
              }
              if (!(await needAdmin())) return;
              if (/^(נקה|נקי|clear|off)$/i.test(arg)) {
                gd.linkAllow = [];
              } else {
                gd.linkAllow = arg.split(/[,|\s]+/).map((d) => d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].trim()).filter((d) => d.includes('.')).slice(0, 30);
              }
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🔗 *דומיינים מותרים:* ${gd.linkAllow.length ? gd.linkAllow.join(', ') : '— (הכל נחסם)'}` });
              return;
            }
          }

          // 🤬 קללות on/off + רשימת מילים
          {
            const m = text.match(/^(קללות|אנטי-קללות|סינון-קללות)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const arg = (m[2] || '').trim();
              const gd = gdata(remoteJid);
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `🤬 סינון קללות: *${gd.toggles.anticurse ? 'פעיל ✅' : 'כבוי'}*\n${prefix}קללות on / off` });
                return;
              }
              if (!(await needAdmin())) return;
              const v = parseOnOff(arg);
              if (v === null) {
                await sock.sendMessage(remoteJid, { text: `😢 כתוב: ${prefix}קללות on / off` });
                return;
              }
              gd.toggles.anticurse = v;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🤬 סינון קללות ${v ? 'הופעל ✅' : 'כובה'}` });
              return;
            }
          }
          {
            const m = text.match(/^(מילה-אסורה)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const w = (m[2] || '').trim().slice(0, 40);
              if (!w) {
                await sock.sendMessage(remoteJid, { text: `🤬 כתוב: ${prefix}מילה-אסורה <מילה>\nדוגמה: ${prefix}מילה-אסורה ספאם` });
                return;
              }
              if (!(await needAdmin())) return;
              const gd = gdata(remoteJid);
              if (!gd.curseExtra.includes(w)) {
                gd.curseExtra.push(w);
                saveStore();
              }
              await sock.sendMessage(remoteJid, { text: `🤬 "${w}" נוספה לרשימה האסורה ✅` });
              return;
            }
          }
          {
            const m = text.match(/^(מחק-מילה)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const w = (m[2] || '').trim();
              if (!w) {
                await sock.sendMessage(remoteJid, { text: `🤬 כתוב: ${prefix}מחק-מילה <מילה>` });
                return;
              }
              if (!(await needAdmin())) return;
              const gd = gdata(remoteJid);
              gd.curseExtra = (gd.curseExtra || []).filter((x) => x !== w);
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🤬 "${w}" הוסרה מהרשימה.` });
              return;
            }
          }
          if (/^(מילים-אסורות|רשימה-אסורה)$/i.test(text)) {
            const gd = gdata(remoteJid);
            const extra = gd.curseExtra || [];
            await sock.sendMessage(remoteJid, {
              text: extra.length
                ? `🤬 *מילים אסורות נוספות:*\n• ${extra.join('\n• ')}\n\n(יש גם רשימת בסיס מובנית)`
                : `🤬 אין מילים נוספות — פעיל סינון בסיס מובנה.\nהוספה: ${prefix}מילה-אסורה <מילה> (מנהלים)`,
            });
            return;
          }

          // 🌊 ספאם-קשוח on/off
          {
            const m = text.match(/^(ספאם-קשוח|אנטי-ספאם)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const arg = (m[2] || '').trim();
              const gd = gdata(remoteJid);
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: `🌊 ספאם-קשוח: *${gd.toggles.antispam ? 'פעיל ✅ (הצפות נמחקות)' : 'כבוי'}*\n${prefix}ספאם-קשוח on / off` });
                return;
              }
              if (!(await needAdmin())) return;
              const v = parseOnOff(arg);
              if (v === null) {
                await sock.sendMessage(remoteJid, { text: `😢 כתוב: ${prefix}ספאם-קשוח on / off` });
                return;
              }
              gd.toggles.antispam = v;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `🌊 ספאם-קשוח ${v ? 'הופעל ✅' : 'כובה'}` });
              return;
            }
          }

          // 👋 ברוכים on/off [טקסט] — מקבל גם "ברוכים הבאים" עם רווח
          {
            const t = text.replace(/^ברוכים הבאים(?=\s|:|$)/i, 'ברוכים');
            const m = t.match(/^(ברוכים-הבאים|ברוכים|welcome)\s*[:\-]?\s*(on|off|הפעל|כבה|כן|לא)?\s*([\s\S]*)$/i);
            if (m && (/^(ברוכים-הבאים|ברוכים|welcome)$/i.test(t.split(/\s+/)[0]))) {
              const opt = (m[2] || '').trim();
              const custom = (m[3] || '').trim().slice(0, 800);
              const gd = gdata(remoteJid);
              if (!opt && !custom) {
                await sock.sendMessage(remoteJid, {
                  text: `👋 ברוכים הבאים: *${gd.toggles.welcome ? 'פעיל ✅' : 'כבוי'}*\nנוכחי: "${gd.welcomeText.slice(0, 120)}"\n\n${prefix}ברוכים on [טקסט עם {שם} {קבוצה} {פקודות}]\n${prefix}ברוכים off`,
                });
                return;
              }
              if (!(await needAdmin())) return;
              if (opt) {
                const v = parseOnOff(opt);
                gd.toggles.welcome = !!v;
                if (custom) gd.welcomeText = custom;
                saveStore();
                await sock.sendMessage(remoteJid, { text: gd.toggles.welcome ? `👋 ברוכים הבאים הופעל ✅\n"${gd.welcomeText.slice(0, 150)}"` : `👋 ברוכים הבאים כובה.` });
                return;
              }
              if (custom) {
                gd.welcomeText = custom;
                gd.toggles.welcome = true;
                saveStore();
                await sock.sendMessage(remoteJid, { text: `👋 הטקסט נשמר והופעל ✅\n"${custom.slice(0, 150)}"` });
                return;
              }
            }
          }

          // 👋 בדיקת ברכה (מנהלים) — שולח אליך את הברכה כמו שמצטרף היה מקבל
          {
            if (/^(ברוכים-טסט|ברוכים-בדיקה|welcome-test)$/i.test(text)) {
              if (!(await needAdmin())) return;
              const gd = gdata(remoteJid);
              const me = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
              const myName = (msg.pushName || gd.names[me] || '').split(' ')[0] || 'חבר חדש';
              let groupName = '';
              try {
                groupName = (await sock.groupMetadata(remoteJid))?.subject || '';
              } catch {}
              let msg2 = buildWelcome(gd.welcomeText, myName, groupName);
              if (gd.rules) msg2 += `\n\n📜 *חוקי הקבוצה:*\n${gd.rules.slice(0, 400)}`;
              await sock.sendMessage(remoteJid, { text: `🧪 *תצוגה מקדימה (ברוכים ${gd.toggles.welcome ? 'פעיל ✅' : 'כבוי ⛔'}):*\n\n${msg2}`, mentions: [me] });
              return;
            }
          }

          // 📜 חוקים — צפייה לכולם, קביעה למנהלים
          {
            const m = text.match(/^(חוקים|rules)\s*[:\-]?\s*([\s\S]*)$/i);
            if (m) {
              const arg = (m[2] || '').trim().slice(0, 800);
              const gd = gdata(remoteJid);
              if (!arg) {
                await sock.sendMessage(remoteJid, { text: gd.rules ? `📜 *חוקי הקבוצה:*\n\n${gd.rules}` : `📜 אין חוקים מוגדרים.\nמנהל יכול לקבוע: ${prefix}חוקים <טקסט>` });
                return;
              }
              if (!(await needAdmin())) return;
              if (/^(נקה|בטל|מחק)$/i.test(arg)) {
                gd.rules = '';
                saveStore();
                await sock.sendMessage(remoteJid, { text: `📜 החוקים נמחקו.` });
                return;
              }
              gd.rules = arg;
              saveStore();
              await sock.sendMessage(remoteJid, { text: `📜 החוקים נשמרו ✅\n\n${arg.slice(0, 300)}` });
              return;
            }
          }

          // 📣 תייג כולם — מנהלים בלבד
          {
            const m = text.match(/^(תייג|כולם|tagall)\s*[:\-]?\s*([\s\S]*)$/i);
            if (m) {
              if (!(await needAdmin())) return;
              const custom = (m[2] || '').trim().slice(0, 300) || '📣 כולם להתפקד!';
              try {
                const meta = await sock.groupMetadata(remoteJid);
                const parts = (meta.participants || []).slice(0, 100);
                let out = `${custom}\n\n`;
                const mentions = [];
                for (const p of parts) {
                  out += `@${String(p.id).split('@')[0]} `;
                  mentions.push(p.id);
                }
                await sock.sendMessage(remoteJid, { text: out.trim().slice(0, 3000), mentions });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 התיוג נכשל. נסה שוב.' });
              }
              return;
            }
          }

          // ⚠️ אזהרה — מנהלים (בתגובה או תיוג)
          {
            const m = text.match(/^(אזהרה|אזהרות-הוסף)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `⚠️ כתוב בתגובה להודעה או עם תיוג:\n${prefix}אזהרה @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              const gd = gdata(remoteJid);
              mergeWarnAlias(gd, target, raw);
              const n = addWarn(gd, target);
              saveStore();
              if (n >= 3) {
                clearWarns(gd, target);
                saveStore();
                const res = await kickParticipant(sock, remoteJid, target);
                await sock.sendMessage(remoteJid, {
                  text: res.ok ? `🦵 @${String(target).split('@')[0]} הורחק לאחר 3 אזהרות.` : `⚠️ @${String(target).split('@')[0]} הגיע ל-3 אזהרות — ההרחקה נכשלה (${res.error || 'ודא שהבוט מנהל'}).`,
                  mentions: [target],
                });
              } else {
                await sock.sendMessage(remoteJid, { text: `⚠️ אזהרה ${n}/3 ל-@${String(target).split('@')[0]}`, mentions: [target] });
              }
              return;
            }
          }
          if (/^(אזהרות)(?=\s|:|-|@|$)/i.test(text)) {
            const gd = gdata(remoteJid);
            const raw = extractTarget(msg);
            if (raw) {
              const target = await resolveCanonical(sock, remoteJid, raw);
              await sock.sendMessage(remoteJid, { text: `⚠️ ל-@${String(target).split('@')[0]} יש *${getWarns(gd, target)}* אזהרות.`, mentions: [target] });
              return;
            }
            const entries = Object.entries(gd.warns || {});
            if (!entries.length) {
              await sock.sendMessage(remoteJid, { text: '⚠️ אין מוזהרים כרגע. ✅' });
            } else {
              let out = '⚠️ *מוזהרים:*\n\n';
              entries.slice(0, 20).forEach(([u, n]) => { out += `• @${String(u).split('@')[0]} — ${n}/3\n`; });
              await sock.sendMessage(remoteJid, { text: out.trim(), mentions: entries.map(([u]) => u).slice(0, 20) });
            }
            return;
          }
          {
            const m = text.match(/^(נקה-אזהרות|נקה-אזהרה)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `⚠️ כתוב בתגובה או עם תיוג:\n${prefix}נקה-אזהרות @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              clearWarnsAll(gdata(remoteJid), target, raw);
              saveStore();
              await sock.sendMessage(remoteJid, { text: `⚠️ האזהרות של @${String(target).split('@')[0]} אופסו ✅`, mentions: [target] });
              return;
            }
          }

          // 🔇 השתק / שחרר / מושתקים — מנהלים
          {
            const m = text.match(/^(השתק|שחרר|mute|unmute)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `🔇 כתוב בתגובה להודעה או עם תיוג:\n${prefix}${m[1]} @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              if (!target) {
                await sock.sendMessage(remoteJid, { text: `🔇 כתוב בתגובה להודעה או עם תיוג:\n${prefix}${m[1]} @משתמש` });
                return;
              }
              const gd = gdata(remoteJid);
              if (/^(השתק|mute)$/i.test(m[1])) {
                muteUser(gd, target);
                saveStore();
                await sock.sendMessage(remoteJid, { text: `🔇 @${String(target).split('@')[0]} הושתק (הודעותיו יימחקו) ✅`, mentions: [target] });
              } else {
                unmuteUser(gd, target);
                saveStore();
                await sock.sendMessage(remoteJid, { text: `🔊 @${String(target).split('@')[0]} שוחרר ✅`, mentions: [target] });
              }
              return;
            }
          }
          if (/^(מושתקים)$/i.test(text)) {
            const gd = gdata(remoteJid);
            if (!gd.muted.length) {
              await sock.sendMessage(remoteJid, { text: '🔊 אין מושתקים. ✅' });
            } else {
              await sock.sendMessage(remoteJid, {
                text: `🔇 *מושתקים (${gd.muted.length}):*\n${gd.muted.map((u) => `• @${String(u).split('@')[0]}`).join('\n')}`,
                mentions: gd.muted.slice(0, 20),
              });
            }
            return;
          }

          // 🦵 קיק / קדם / הורד-ניהול — מנהלים + בוט-מנהל
          {
            const m = text.match(/^(קיק|הרחק|kick)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `🦵 כתוב בתגובה להודעה או עם תיוג:\n${prefix}קיק @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              try {
                if (await isSenderAdmin(sock, remoteJid, target)) {
                  await sock.sendMessage(remoteJid, { text: `😢 לא מרחיק מנהל אחר — הורד לו ניהול קודם.` });
                  return;
                }
                const res = await kickParticipant(sock, remoteJid, target);
                await sock.sendMessage(remoteJid, { text: res.ok ? `🦵 @${String(target).split('@')[0]} הורחק מהקבוצה.` : `😢 ההרחקה נכשלה (${res.error || 'שגיאה'}).` });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 ההרחקה נכשלה.' });
              }
              return;
            }
          }
          {
            const m = text.match(/^(קדם|promote)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `⬆️ כתוב בתגובה או עם תיוג:\n${prefix}קדם @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              if (!target) {
                await sock.sendMessage(remoteJid, { text: `⬆️ כתוב בתגובה או עם תיוג:\n${prefix}קדם @משתמש` });
                return;
              }
              try {
                await sock.groupParticipantsUpdate(remoteJid, [target], 'promote');
                invalidateMeta(remoteJid);
                await sock.sendMessage(remoteJid, { text: `⬆️ @${String(target).split('@')[0]} קודם למנהל ✅`, mentions: [target] });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 הקידום נכשל.' });
              }
              return;
            }
          }
          {
            const m = text.match(/^(הורד-ניהול|הסר-ניהול|demote)(?=\s|:|-|@|$)/i);
            if (m) {
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              const raw = extractTarget(msg);
              if (!raw) {
                await sock.sendMessage(remoteJid, { text: `⬇️ כתוב בתגובה או עם תיוג:\n${prefix}הורד-ניהול @משתמש` });
                return;
              }
              const target = await resolveCanonical(sock, remoteJid, raw);
              if (!target) {
                await sock.sendMessage(remoteJid, { text: `⬇️ כתוב בתגובה או עם תיוג:\n${prefix}הורד-ניהול @משתמש` });
                return;
              }
              try {
                await sock.groupParticipantsUpdate(remoteJid, [target], 'demote');
                invalidateMeta(remoteJid);
                await sock.sendMessage(remoteJid, { text: `⬇️ הניהול של @${String(target).split('@')[0]} הוסר.` });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 ההסרה נכשלה.' });
              }
              return;
            }
          }

          // 🔒 נעל / פתח — מנהלים + בוט-מנהל
          {
            const m = text.match(/^(נעל|נעילה|lock|פתח|פתיחה|unlock)\s*$/i);
            if (m) {
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              const lock = /^(נעל|נעילה|lock)$/i.test(m[1]);
              try {
                await sock.groupSettingUpdate(remoteJid, lock ? 'announcement' : 'not_announced');
                await sock.sendMessage(remoteJid, { text: lock ? `🔒 הקבוצה ננעלה — רק מנהלים יכולים לכתוב ✅` : `🔓 הקבוצה נפתחה — כולם יכולים לכתוב ✅` });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 הפעולה נכשלה.' });
              }
              return;
            }
          }

          // ✏️ שם / תיאור — מנהלים + בוט-מנהל (הארוך קודם כדי ש"שם-קבוצה" לא ייחתך)
          {
            const m = text.match(/^(שם-קבוצה|שם)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const name = (m[2] || '').trim().slice(0, 100);
              if (!name) {
                await sock.sendMessage(remoteJid, { text: `✏️ כתוב: ${prefix}שם <שם חדש לקבוצה>\nדוגמה: ${prefix}שם הקבוצה הכי טובה` });
                return;
              }
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              try {
                await sock.groupUpdateSubject(remoteJid, name);
                await sock.sendMessage(remoteJid, { text: `✏️ שם הקבוצה שונה ל: "${name}" ✅` });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 שינוי השם נכשל.' });
              }
              return;
            }
          }
          {
            const m = text.match(/^(תיאור-קבוצה|תיאור)(?=\s|:|-|$)\s*[:\-]?\s*(.*)$/is);
            if (m) {
              const desc = (m[2] || '').trim().slice(0, 500);
              if (!desc) {
                await sock.sendMessage(remoteJid, { text: `✏️ כתוב: ${prefix}תיאור <תיאור חדש לקבוצה>` });
                return;
              }
              if (!(await needAdmin())) return;
              if (!(await needBotAdmin())) return;
              try {
                await sock.groupUpdateDescription(remoteJid, desc);
                await sock.sendMessage(remoteJid, { text: `✏️ התיאור עודכן ✅` });
              } catch {
                await sock.sendMessage(remoteJid, { text: '😢 עדכון התיאור נכשל.' });
              }
              return;
            }
          }

          // 🧹 מחק (בתגובה) — מנהלים + בוט-מנהל
          if (/^(מחק|מחק-הודעה|delete)$/i.test(text)) {
            if (!(await needAdmin())) return;
            if (!(await needBotAdmin())) return;
            const ctx = msg.message?.extendedTextMessage?.contextInfo;
            if (!ctx?.stanzaId) {
              await sock.sendMessage(remoteJid, { text: `🧹 הגב להודעה שברצונך למחוק וכתוב:\n${prefix}מחק` });
              return;
            }
            try {
              await sock.sendMessage(remoteJid, {
                delete: {
                  remoteJid,
                  fromMe: false,
                  id: ctx.stanzaId,
                  participant: ctx.participant,
                },
              });
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 המחיקה נכשלה (אולי הודעה ישנה מדי).' });
            }
            return;
          }

          // 👑 מנהלים-רשימה — פתוח לכולם
          if (/^(מנהלים-רשימה|רשימת-מנהלים)$/i.test(text)) {
            try {
              const admins = await listAdmins(sock, remoteJid);
              if (!admins.length) {
                await sock.sendMessage(remoteJid, { text: '👑 לא נמצאו מנהלים.' });
              } else {
                let out = '👑 *מנהלי הקבוצה:*\n\n';
                const mentions = [];
                admins.forEach((p) => {
                  out += `• @${String(p.id).split('@')[0]}${p.admin === 'superadmin' ? ' (יוצר 👑)' : ''}\n`;
                  mentions.push(p.id);
                });
                await sock.sendMessage(remoteJid, { text: out.trim(), mentions });
              }
            } catch {
              await sock.sendMessage(remoteJid, { text: '😢 לא הצלחתי לשלוף מנהלים.' });
            }
            return;
          }
        }


        // --- צ'אט AI מפורש ---
        {
          const m = text.match(/^(שאל|ai|gpt|צ['׳]אט|בוט)\s*[:\-]?\s*(.+)?$/is);
          if (m) {
            const q = (m[2] || '').trim();
            if (!q) {
              await sock.sendMessage(remoteJid, { text:
                `💬 *צ'אט חכם — איך משתמשים?*\n\n` +
                `כתוב: ${prefix}שאל ואחריו כל שאלה — הבוט עונה בעברית עם AI.\n` +
                `אפשר לשאול על כל נושא: הסברים, רעיונות, מתכונים, עזרה בלימודים ועוד.\n\n` +
                `📌 *דוגמאות:*\n` +
                `• ${prefix}שאל מה ההבדל בין חור שחור לחור תולעת?\n` +
                `• ${prefix}שאל תן לי רעיון למתנה לאמא\n` +
                `• ${prefix}שאל איך מכינים פנקייק?` });
              return;
            }
            {
              const _snd = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
              if (!(await checkFreeQuota(sock, remoteJid, _snd, msg.key.fromMe, isGroup))) return;
            }
            await sendTyping(sock, remoteJid, 1200);
            const history = chatHistory.get(remoteJid) || [];
            const { text: ans } = await chatAI(styledPrompt(remoteJid, await enrichWithSearch(q)), history);
            pushHistory(remoteJid, 'user', q);
            pushHistory(remoteJid, 'assistant', ans);
            await sock.sendMessage(remoteJid, { text: ans });
            return;
          }
        }

        // --- תרגום אוטומטי לאנגלית (אם הופעל) ---
        if (gdata(remoteJid).toggles.autoTranslate && !usedPrefix && !mentioned &&
            rawText && rawText.length > 8 && !/[\u0590-\u05FF]/.test(rawText) && !msg.key.fromMe) {
          try {
            await sock.sendMessage(remoteJid, { text: `🌍 *תרגום אוטומטי:*\n${await translateText(rawText, 'he')}` });
          } catch {}
          return;
        }

        // --- ברירת מחדל ---
        // בפרטי (או עם קידומת/תיוג בקבוצה): כל טקסט חופשי = צ'אט AI
        // בקבוצה בלי קידומת כבר סיננו למעלה, אז לכאן מגיעים רק עם prefix/mention.
        if (text.length >= 1) {
          // אם זה נראה כמו שם סרט קצר בלי פקודה? נשאיר ל-AI, והוא ידריך.
          {
            const _snd = msg.key.participant || (msg.key.fromMe ? 'me' : remoteJid);
            if (!(await checkFreeQuota(sock, remoteJid, _snd, msg.key.fromMe, isGroup))) return;
          }
          await sendTyping(sock, remoteJid, 1000);
          const history = chatHistory.get(remoteJid) || [];
          const { text: ans } = await chatAI(styledPrompt(remoteJid, await enrichWithSearch(text)), history);
          pushHistory(remoteJid, 'user', text);
          pushHistory(remoteJid, 'assistant', ans);
          await sock.sendMessage(remoteJid, { text: ans });
        }
      } catch (e) {
        console.error('שגיאה בהודעה:', e);
      }
}

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    try {
      const _fm = (messages || []).filter((m) => m?.key?.fromMe).length;
      if (_fm || type !== 'notify') console.log(`📡 upsert: type=${type} total=${(messages || []).length} fromMe=${_fm}`);
    } catch {}
    let list = messages || [];
    if (type !== 'notify') {
      // הודעות עצמיות מהטלפון (החשבון של הבוט) מגיעות לפעמים כ-append ולא כ-notify.
      // מקבלים רק הודעות עצמיות טריות (90 שניות) — למנוע עיבוד-מחדש של היסטוריה ישנה.
      const now = Math.floor(Date.now() / 1000);
      list = list.filter((m) => m?.key?.fromMe && Number(m.messageTimestamp || 0) > now - 90);
      if (!list.length) return;
      console.log(`📩 fromMe-append: ${list.length} הודעות עצמיות טריות`);
    }
    const botJid = sock.user?.id?.split(':')[0] + '@s.whatsapp.net';

    for (const msg of list) {
      // מעבדים במקביל — כל הודעה בהקשר תיוג משלה (דיוק מלא גם בעומס)
      const mj = (msg && msg.key && msg.key.remoteJid) || 'none';
      const ms = (msg && msg.key && (msg.key.participant || (msg.key.fromMe ? 'me' : mj))) || '';
      tagALS.run({ sender: ms, jid: mj, at: Date.now(), used: false }, () => {
        handleChatMessage(sock, botJid, msg).catch((e) => console.error('שגיאה בהודעה מקבילית:', (e && e.message) || e));
      });
    }
  });
}

start();

/* ---------- 🌉 ממסר מקומי: טלגרם/שרת → בוט וואטסאפ (0503651436) → Instinct וחזרה ----------
   איך זה עובד בוואטסאפ: requestInstinct שולח את הפרומפט ל-+16508702892 דרך תור FIFO,
   ומחכה שהתמונה תחזור בהודעה — אותו מסלול בדיוק משמש כאן, רק המבקש הוא HTTP מקומי.
   מאזין על 127.0.0.1 בלבד + סוד (x-relay-secret). */
{
  const SECRET = (process.env.RELAY_SECRET || '').trim();
  const PORT = Number(process.env.RELAY_PORT || 3888);
  if (SECRET) {
    const srv = http.createServer((req, res) => {
      if (req.headers['x-relay-secret'] !== SECRET) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
        return;
      }
      const u = new URL(req.url || '/', 'http://x');
      if (u.pathname === '/api/relay-health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, connected: !!activeSock }));
        return;
      }
      if (u.pathname === '/api/relay-image' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 5000) req.destroy(); });
        req.on('end', async () => {
          try {
            const { prompt } = JSON.parse(body || '{}');
            if (!prompt || String(prompt).trim().length < 2) throw new Error('empty');
            if (!activeSock) throw new Error('offline');
            const buf = await Promise.race([
              requestInstinct(activeSock, String(prompt).slice(0, 1000), 'tg-relay'),
              new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 240000)),
            ]);
            if (!buf || buf.length < 5000) throw new Error('empty');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, image: buf.toString('base64') }));
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: String((e && e.message) || '').slice(0, 100) }));
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"ok":false}');
    });
    srv.listen(PORT, '127.0.0.1', () => console.log(`🌉 ממסר מקומי: http://127.0.0.1:${PORT}`));
  }
}
