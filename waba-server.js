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

async function sendWaba(to, body, recipientType = 'individual') {
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
  const text = String(body || '').slice(0, 3900) || '...';
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };
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
              if (msg.type !== 'text' || !msg.text?.body) continue;
              const from = msg.from;
              const text = msg.text.body.trim().slice(0, 1000);
              if (!from || !text) continue;
              // 👥 הודעה קבוצתית רשמית: יש group_id, עונים לקבוצה עם recipient_type=group
              const groupId = msg.group_id || msg.context?.group_id || null;
              const isGroup = !!groupId;
              const replyTo = isGroup ? groupId : from;
              const replyType = isGroup ? 'group' : 'individual';
              // 💰 חיסכון: בקבוצה עונים רק ל-! כדי לא לשרוף את ה-1000 החינמיות
              if (isGroup && !text.startsWith(BOT_PREFIX)) continue;
              const cleanText = isGroup && text.startsWith(BOT_PREFIX) ? text.slice(BOT_PREFIX.length).trim() : text;
              if (!cleanText) continue;
              const histKey = isGroup ? `${replyTo}:${from}` : from;
              console.log(`📩 מ-${from}${isGroup ? ` בקבוצה ${replyTo}` : ''}: ${cleanText.slice(0, 80)}`);

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
