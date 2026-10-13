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
import { chatAI } from './ai-chat.js';

const PORT = Number(process.env.PORT || 3000);
const TOKEN = process.env.WABA_TOKEN || '';
const PHONE_ID = process.env.WABA_PHONE_NUMBER_ID || '';
const VERIFY = process.env.WABA_VERIFY_TOKEN || '';
const CLINIC_NAME = process.env.CLINIC_NAME || 'המרפאה';
const CLINIC_INFO = process.env.CLINIC_INFO || '';

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

async function sendWaba(to, body) {
  if (!TOKEN || !PHONE_ID) {
    console.log('WABA לא מוגדר (חסר TOKEN/PHONE_ID), לא שולח ל:', to);
    return;
  }
  const text = String(body || '').slice(0, 3900) || '...';
  const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('שליחה נכשלה:', res.status, err.slice(0, 300));
  }
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
              console.log(`📩 מ-${from}: ${text.slice(0, 80)}`);

              // 1. תשובה מיידית לשאלות מרפאה נפוצות
              const quick = clinicQuickAnswer(text);
              if (quick) {
                await sendWaba(from, quick).catch((e) => console.error(e.message));
                continue;
              }

              // 2. AI קיים שלך, עם הקשר מרפאה
              const hist = history.get(from) || [];
              const clinicPrompt = CLINIC_INFO
                ? `אתה בוט של ${CLINIC_NAME}. מידע: ${CLINIC_INFO}. ענה קצר, בעברית, בלי אבחנה רפואית. במקרה דחוף הפנה לטלפון. שאלה: ${text}`
                : text;
              try {
                const { text: reply } = await chatAI(clinicPrompt, hist);
                pushHistory(from, 'user', text);
                pushHistory(from, 'assistant', reply);
                const safe = reply + '\n\n⚠️ מידע כללי בלבד, לא מחליף רופא. בדחוף - התקשרו למרפאה.';
                await sendWaba(from, safe);
              } catch (e) {
                console.error('AI fail:', e.message);
                await sendWaba(from, `קיבלתי: "${text.slice(0, 100)}". נציג יחזור אליכם בהקדם. בדחוף התקשרו למרפאה.`);
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
