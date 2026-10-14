/**
 * בוט WhatsApp רשמי (Cloud API) - שרת Webhook לניסיון
 * משתמש באותה לוגיקת AI שלך מ-ai-chat.js, בלי Baileys ובלי סיכון חסימה.
 *
 * הרצה: node waba-server.js
 * דרישות: Node 18+, בלי תלויות חדשות.
 *
 * env נדרש (.env):
 *   WABA_TOKEN=... (Access Token זמני/קבוע מ-Meta)
 *   WABA_PHONE_NUMBER_ID=... (Phone Number ID, לא מספר הטלפון)
 *   WABA_VERIFY_TOKEN=... (מחרוזת שאתה בוחר, למשל clinic123)
 *   PORT=3000
 *   CLINIC_NAME=מרפאה (אופציונלי)
 *   CLINIC_INFO=שעות: א-ה 8-19... כתובת:... (אופציונלי, עונה מיידית על שאלות נפוצות)
 */

import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import { chatAI } from './ai-chat.js';
import { generateImage } from './ai-image.js';
import { textToSpeech } from './ai-voice.js';
import { searchYouTube, formatMediaResults } from './media-search.js';
import { getWeather } from './web-search.js';
import { currencyRates, cryptoPrices, newsHe } from './more.js';

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.WABA_TOKEN || '';
const PHONE_ID = process.env.WABA_PHONE_NUMBER_ID || '';
const VERIFY = process.env.WABA_VERIFY_TOKEN || '';
const CLINIC_NAME = process.env.CLINIC_NAME || 'המרפאה';
const CLINIC_INFO = process.env.CLINIC_INFO || '';
// 🛡️ הגנת 0 שקל: עוצר לפני 1000 החינמיות (900 = מרווח ביטחון)
const MAX_MONTHLY = Number(process.env.WABA_MAX_MONTHLY || '900');
const BOT_PREFIX = process.env.BOT_PREFIX || '!';
const USAGE_PATH = new URL('./waba-usage.json', import.meta.url);

function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function loadUsage() {
  try { return JSON.parse(fs.readFileSync(USAGE_PATH, 'utf-8')); }
  catch { return {}; }
}
function usageCount() {
  return loadUsage()[monthKey()] || 0;
}
function bumpUsage() {
  try {
    const db = loadUsage();
    const k = monthKey();
    db[k] = (db[k] || 0) + 1;
    fs.writeFileSync(USAGE_PATH, JSON.stringify(db));
    return db[k];
  } catch { return 0; }
}

// 🤖 תפריט מולטי בוט — כל היכולות האמיתיות של הבוט, בלי הגרלות
function digitsOf(jid) {
  const d = String(jid || '').split('@')[0].replace(/\D/g, '');
  return d || null;
}
const pendingMb = new Map(); // digits -> {action, at} — מחכה לקלט אחרי בחירה בתפריט

// 📤 העלאת מדיה ל-Meta (חינם, לא נספר במכסה) ואז שליחה
async function uploadMedia(buf, mime, filename) {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', new Blob([buf], { type: mime }), filename);
  const res = await fetch(`https://graph.facebook.com/v26.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error('upload ' + res.status + ' ' + err.slice(0, 200));
  }
  return (await res.json()).id;
}
async function sendMbImage(to, buf, caption, rt = 'individual') {
  const id = await uploadMedia(buf, 'image/jpeg', 'img.jpg');
  return sendWabaPayload(to, { type: 'image', image: { id, caption: String(caption || '').slice(0, 1000) } }, rt);
}
async function sendMbAudio(to, buf, rt = 'individual') {
  const id = await uploadMedia(buf, 'audio/ogg', 'voice.ogg');
  return sendWabaPayload(to, { type: 'audio', audio: { id } }, rt);
}

const MB_PROMPTS = {
  mb_chat: '💬 *שאל את ה-AI*\nכתוב את השאלה שלך:',
  mb_image: '🎨 *יצירת תמונה*\nכתוב תיאור (אפשר בעברית):',
  mb_song: '🎵 *חיפוש שיר*\nכתוב שם שיר + זמר:',
  mb_video: '🎬 *חיפוש סרטון*\nכתוב נושא:',
  mb_tts: '🔊 *הקראה בקול*\nכתוב טקסט (עד 900 תווים):',
  mb_weather: '🌤️ *מזג אוויר*\nכתוב שם עיר:',
};
function mbTextMenu() {
  return `🤖 *מולטי בוט — תפריט*\n\n` +
    `💬 !שאל <שאלה> — צ'אט AI\n` +
    `🎨 !תמונה <תיאור> — יצירת תמונה\n` +
    `🎵 !שיר <שם> — חיפוש שיר\n` +
    `🎬 !וידאו <נושא> — חיפוש סרטון\n` +
    `🔊 !דבר <טקסט> — הקראה בקול\n` +
    `🌤️ !מזג <עיר> • 📰 !חדשות • 💵 !מטבע\n\n` +
    `_בצ'אט פרטי: !תפריט פותח תפריט לחצנים_`;
}
const MB_HINT = `\n\n_!תפריט לתפריט 📋_`;
// 🎯 הרצת פיצ'ר של מולטי בוט
async function runMbFeature(to, action, input, rt, histKey) {
  const q = String(input || '').trim().slice(0, 900);
  if (q.length < 2 && action !== 'mb_news' && action !== 'mb_rates' && action !== 'mb_help') {
    await sendWaba(to, 'כתוב טקסט כלשהו כדי שאפעיל את זה 🙂' + MB_HINT, rt);
    return true;
  }
  try {
    if (action === 'mb_chat') {
      const hist = history.get(histKey) || [];
      const { text: reply } = await chatAI(q, hist);
      pushHistory(histKey, 'user', q);
      pushHistory(histKey, 'assistant', reply);
      await sendWaba(to, reply + MB_HINT, rt);
    } else if (action === 'mb_image') {
      const { buffer, provider } = await generateImage(q);
      await sendMbImage(to, buffer, `🎨 ${q.slice(0, 200)}\n(${provider})` + MB_HINT, rt);
    } else if (action === 'mb_song' || action === 'mb_video') {
      const results = await searchYouTube(q, 3);
      if (!results.length) await sendWaba(to, `לא מצאתי תוצאות ל"${q.slice(0, 100)}" 😕` + MB_HINT, rt);
      else await sendWaba(to, formatMediaResults(results, action === 'mb_song' ? '🎵' : '🎬') + MB_HINT, rt);
    } else if (action === 'mb_tts') {
      const ogg = await textToSpeech(q);
      await sendMbAudio(to, ogg, rt);
    } else if (action === 'mb_weather') {
      await sendWaba(to, (await getWeather(q)) + MB_HINT, rt);
    } else if (action === 'mb_news') {
      await sendWaba(to, (await newsHe(5)) + MB_HINT, rt);
    } else if (action === 'mb_rates') {
      await sendWaba(to, (await currencyRates()) + '\n\n' + (await cryptoPrices()) + MB_HINT, rt);
    } else if (action === 'mb_help') {
      await sendWaba(to, mbTextMenu(), rt);
    } else {
      return false;
    }
  } catch (e) {
    console.error('feature fail:', action, (e.message || '').slice(0, 150));
    await sendWaba(to, `תקלה זמנית 😕 נסה שוב בעוד דקה.` + MB_HINT, rt);
  }
  return true;
}

const history = new Map(); // sender -> [{role, content}]

function pushHistory(sender, role, content) {
  const arr = history.get(sender) || [];
  arr.push({ role, content: String(content).slice(0, 1000) });
  while (arr.length > 10) arr.shift();
  history.set(sender, arr);
}

// מענה מיידי לשאלות נפוצות של מרפאה, לפני AI - חוסך כסף ועונה מהר
function clinicQuickAnswer(text) {
  const t = (text || '').trim();
  if (!t || t.length > 200) return null;
  if (!CLINIC_INFO) return null;
  if (/שעות|פתוח|מתי|סגור/.test(t)) return `🕗 ${CLINIC_NAME}\n${CLINIC_INFO}`;
  if (/כתובת|איפה|מיקום|להגיע|חניה/.test(t)) return `📍 ${CLINIC_NAME}\n${CLINIC_INFO}`;
  if (/תור|לקבוע|זימון|הזמנה/.test(t)) return `📅 לקביעת תור ב${CLINIC_NAME}:\nכתבו "תור" + יום ושעה רצויה, ונציג יחזור אליכם.\n${CLINIC_INFO ? CLINIC_INFO + '\n' : ''}במקרה דחוף התקשרו למרפאה, לא לחכות לוואטסאפ.`;
  if (/מחיר|עלות|כמה עולה/.test(t)) return `💰 למחירון מדויק כתבו מה הטיפול, ונציג יחזור אליכם.\n${CLINIC_INFO}`;
  return null;
}

async function sendWabaPayload(to, data, recipientType = 'individual') {
  if (!TOKEN || !PHONE_ID) {
    console.log('WABA לא מוגדר (חסר TOKEN/PHONE_ID), לא שולח ל:', to);
    return false;
  }
  // 🛡️ לא עוברים את החינם בחיים
  const used = usageCount();
  if (used >= MAX_MONTHLY) {
    console.log(`🛑 מכסה חודשית ${used}/${MAX_MONTHLY} — לא שולח כדי לא לחייב (0 שקל).`);
    return false;
  }
  const payload = { messaging_product: 'whatsapp', to, ...data };
  if (recipientType === 'group') {
    payload.recipient_type = 'group';
  }
  const res = await fetch(`https://graph.facebook.com/v26.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('שליחה נכשלה:', res.status, err.slice(0, 300));
    return false;
  }
  const n = bumpUsage();
  console.log(`📤 נשלח (${n}/${MAX_MONTHLY} החודש) ל-${to} [${recipientType}]`);
  return true;
}

async function sendWaba(to, body, recipientType = 'individual') {
  const text = String(body || '').slice(0, 3900) || '...';
  return sendWabaPayload(to, { type: 'text', text: { body: text } }, recipientType);
}

// 📋 תפריט לחצנים "בחר אפשרות" — עובד בצ'אט פרטי, בקבוצה נופל לטקסט
async function sendInteractiveMenu(to, recipientType = 'individual') {
  if (recipientType !== 'individual') {
    return sendWaba(to, mbTextMenu(), recipientType);
  }
  try {
    const ok = await sendWabaPayload(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: '🤖 מולטי בוט' },
        body: { text: 'בחר מה לעשות 👇' },
        footer: { text: 'בחר אפשרות' },
        action: {
          button: 'בחר אפשרות',
          sections: [
            {
              title: 'AI ומדיה',
              rows: [
                { id: 'mb_chat', title: '💬 לשאול את ה-AI', description: 'שאלות, הסברים, רעיונות' },
                { id: 'mb_image', title: '🎨 ליצור תמונה', description: 'תמונת AI מתיאור שלך' },
                { id: 'mb_song', title: '🎵 לחפש שיר', description: 'קישורים מיוטיוב' },
                { id: 'mb_video', title: '🎬 לחפש סרטון', description: 'סרטונים מיוטיוב' },
                { id: 'mb_tts', title: '🔊 להקריא בקול', description: 'הודעה קולית בעברית' },
              ],
            },
            {
              title: 'מידע',
              rows: [
                { id: 'mb_weather', title: '🌤️ מזג אוויר', description: 'תחזית לפי עיר' },
                { id: 'mb_news', title: '📰 חדשות', description: 'הכותרות החמות' },
                { id: 'mb_rates', title: '💵 מטבע וקריפטו', description: 'שערים עדכניים' },
                { id: 'mb_help', title: '❓ עזרה', description: 'כל הפקודות' },
              ],
            },
          ],
        },
      },
    }, recipientType);
    if (!ok) {
      // אם הרשמי דחה — נופלים לטקסט
      return sendWaba(to, mbTextMenu(), recipientType);
    }
    return true;
  } catch (e) {
    console.error('interactive fail, fallback לטקסט:', e.message);
    return sendWaba(to, mbTextMenu(), recipientType);
  }
}

// 🎯 לחיצה בתפריט מולטי בוט — פעולות מיידיות או בקשת קלט
async function handleMenuChoice(to, id, recipientType, userJid = to) {
  const myD = digitsOf(userJid);
  if (id === 'mb_news' || id === 'mb_rates' || id === 'mb_help') {
    return runMbFeature(to, id, '', recipientType, String(userJid));
  }
  if (MB_PROMPTS[id]) {
    pendingMb.set(myD, { action: id, at: Date.now() });
    await sendWaba(to, MB_PROMPTS[id], recipientType);
    return true;
  }
  return false;
}

// ⌨️ פקודות טקסט של מולטי בוט (גם לקבוצה), מחזיר true אם טופל
async function handleMenuText(to, cleanText, recipientType, userJid = to, histKey = String(userJid)) {
  const t = String(cleanText || '').trim();
  const myD = digitsOf(userJid);
  const low = t.toLowerCase();
  // פתיחת תפריט
  if (/^(תפריט|!תפריט|menu|התחל|start)$/i.test(t) || low === 'בחר אפשרות') {
    pendingMb.delete(myD);
    await sendInteractiveMenu(to, recipientType);
    return true;
  }
  const cmd = t.replace(/^!/, '');
  // פקודות ישירות עם תוכן: !שאל מה זה... / !תמונה חתול ...
  const direct = [
    [/^(שאל|שאלה)\s+([\s\S]+)/i, 'mb_chat', 2],
    [/^(תמונה|צייר|ציור)\s+([\s\S]+)/i, 'mb_image', 2],
    [/^(שיר|מוזיקה|נגן)\s+([\s\S]+)/i, 'mb_song', 2],
    [/^(וידאו|סרטון|סרטונים|יוטיוב)\s+([\s\S]+)/i, 'mb_video', 2],
    [/^(דבר|הקרא|קריין)\s+([\s\S]+)/i, 'mb_tts', 2],
    [/^(מזג|מזג-אוויר)\s+([\s\S]+)/i, 'mb_weather', 2],
  ];
  for (const [re, action, gi] of direct) {
    const m = t.match(re);
    if (m) {
      pendingMb.delete(myD);
      await runMbFeature(to, action, m[gi], recipientType, histKey);
      return true;
    }
  }
  // פקודות בלי תוכן — שואלות קלט (בקבוצה: הסבר קצר במקום)
  const needInput = [
    [/^(שאל|שאלה)$/i, 'mb_chat'],
    [/^(תמונה|צייר|ציור)$/i, 'mb_image'],
    [/^(שיר|מוזיקה|נגן)$/i, 'mb_song'],
    [/^(וידאו|סרטון|סרטונים|יוטיוב)$/i, 'mb_video'],
    [/^(דבר|הקרא|קריין)$/i, 'mb_tts'],
    [/^(מזג|מזג-אוויר)$/i, 'mb_weather'],
  ];
  for (const [re, action] of needInput) {
    if (re.test(cmd)) {
      pendingMb.set(myD, { action, at: Date.now() });
      await sendWaba(to, MB_PROMPTS[action], recipientType);
      return true;
    }
  }
  if (/^(חדשות)$/i.test(cmd)) { pendingMb.delete(myD); await runMbFeature(to, 'mb_news', '', recipientType, histKey); return true; }
  if (/^(מטבע|דולר|שערים|ביטקוין|קריפטו)$/i.test(cmd)) { pendingMb.delete(myD); await runMbFeature(to, 'mb_rates', '', recipientType, histKey); return true; }
  if (/^(עזרה|עזרה-פקודות|help)$/i.test(cmd)) { pendingMb.delete(myD); await runMbFeature(to, 'mb_help', '', recipientType, histKey); return true; }
  // ⏳ קלט ממתין אחרי בחירה בתפריט (5 דקות, לא פקודה אחרת)
  const pend = pendingMb.get(myD);
  if (pend && Date.now() - pend.at < 5 * 60 * 1000 && !t.startsWith(BOT_PREFIX)) {
    pendingMb.delete(myD);
    await runMbFeature(to, pend.action, t, recipientType, histKey);
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // בדיקת Webhook של Meta (פעם אחת בהגדרה)
    if (req.method === 'GET' && url.pathname === '/webhook') {
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');
      if (mode === 'subscribe' && token === VERIFY) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(challenge || '');
        return;
      }
      res.writeHead(403); res.end('verify failed');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('WABA bot running. GET /webhook for verify, POST /webhook for messages.');
      return;
    }

    // 📊 כמה הודעות בזבזנו מה-1000 החינמיות
    if (req.method === 'GET' && url.pathname === '/usage') {
      const used = usageCount();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ month: monthKey(), used, max: MAX_MONTHLY, free_left: Math.max(0, MAX_MONTHLY - used) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/webhook') {
      const raw = await readBody(req);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('EVENT_RECEIVED');
      // מעבדים אחרי התשובה כדי לענות מהר
      try {
        const payload = JSON.parse(raw || '{}');
        for (const entry of payload.entry || []) {
          for (const change of entry.changes || []) {
            const value = change.value || {};
            for (const msg of value.messages || []) {
              const from = msg.from;
              if (!from) continue;
              // 👥 הודעה קבוצתית רשמית: יש group_id, עונים לקבוצה עם recipient_type=group
              const groupId = msg.group_id || msg.context?.group_id || null;
              const isGroup = !!groupId;
              const replyTo = isGroup ? groupId : from;
              const replyType = isGroup ? 'group' : 'individual';

              // 📋 לחיצה בתפריט (list / button)
              const choiceId = msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || null;
              if (msg.type === 'interactive' && choiceId) {
                console.log(`📋 בחירה מ-${from}: ${choiceId}`);
                await handleMenuChoice(replyTo, choiceId, replyType, from).catch((e) => console.error(e.message));
                continue;
              }
              if (msg.type !== 'text' || !msg.text?.body) continue;
              const text = msg.text.body.trim().slice(0, 1000);
              if (!text) continue;
              // 💰 חיסכון: בקבוצה עונים רק ל-! כדי לא לשרוף את ה-1000 החינמיות
              if (isGroup && !text.startsWith(BOT_PREFIX)) continue;
              const cleanText = isGroup && text.startsWith(BOT_PREFIX) ? text.slice(BOT_PREFIX.length).trim() : text;
              if (!cleanText) continue;
              const histKey = isGroup ? `${replyTo}:${from}` : from;
              console.log(`📩 מ-${from}${isGroup ? ` בקבוצה ${replyTo}` : ''}: ${cleanText.slice(0, 80)}`);

              // 0. 📋 תפריט מולטי בוט — תמיד זמין (לפני AI כדי לחסוך)
              try {
                if (await handleMenuText(replyTo, cleanText, replyType, from, histKey)) continue;
              } catch (e) { console.error('menu fail:', e.message); }

              // 1. תשובה מיידית לשאלות מרפאה נפוצות
              const quick = clinicQuickAnswer(cleanText);
              if (quick) {
                await sendWaba(replyTo, quick, replyType).catch((e) => console.error(e.message));
                continue;
              }

              // 2. AI קיים שלך, עם הקשר מרפאה
              const hist = history.get(histKey) || [];
              const clinicPrompt = CLINIC_INFO
                ? `אתה בוט של ${CLINIC_NAME}. מידע: ${CLINIC_INFO}. ענה קצר, בעברית, בלי אבחנה רפואית. במקרה דחוף הפנה לטלפון. שאלה: ${cleanText}`
                : cleanText;
              try {
                const { text: reply } = await chatAI(clinicPrompt, hist);
                pushHistory(histKey, 'user', cleanText);
                pushHistory(histKey, 'assistant', reply);
                const safe = reply + '\n\n⚠️ מידע כללי בלבד, לא מחליף רופא. בדחוף - התקשרו למרפאה.';
                await sendWaba(replyTo, safe, replyType);
              } catch (e) {
                console.error('AI fail:', e.message);
                await sendWaba(replyTo, `קיבלתי: "${cleanText.slice(0, 100)}". נציג יחזור אליכם בהקדם. בדחוף התקשרו למרפאה.`, replyType);
              }
            }
          }
        }
      } catch (e) {
        console.error('webhook parse:', e.message);
      }
      return;
    }

    res.writeHead(404); res.end('not found');
  } catch (e) {
    console.error(e);
    try { res.writeHead(500); res.end('error'); } catch {}
  }
});

server.listen(PORT, () => {
  console.log(`WABA webhook מאזין על פורט ${PORT}`);
  if (!TOKEN) console.log('⚠️ חסר WABA_TOKEN ב-.env - קבל מ-Meta Developers > WhatsApp > API Setup');
  if (!PHONE_ID) console.log('⚠️ חסר WABA_PHONE_NUMBER_ID ב-.env');
  if (!VERIFY) console.log('⚠️ חסר WABA_VERIFY_TOKEN ב-.env - בחר מחרוזת, למשל clinic123');
});
