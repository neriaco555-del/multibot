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

// 🏆 מערכת הגרלה/הפניות: לינק אישי, ספירת מצטרפים, כרטיסים, טבלת מובילים
const REFS_PATH = new URL('./waba-refs.json', import.meta.url);
const RAFFLE_DATE = process.env.RAFFLE_DATE || 'תאריך יפורסם בקרוב';
const RAFFLE_INFO = process.env.RAFFLE_INFO || 'הגרלה בין כל המשתתפים שצירפו חברים.';
function loadRefs() {
  try {
    const db = JSON.parse(fs.readFileSync(REFS_PATH, 'utf-8'));
    db.users = db.users || {};
    db.meta = db.meta || {};
    return db;
  } catch { return { users: {}, meta: {} }; }
}
function saveRefs(db) {
  try { fs.writeFileSync(REFS_PATH, JSON.stringify(db)); } catch {}
}
function digitsOf(jid) {
  const d = String(jid || '').split('@')[0].replace(/\D/g, '');
  return d || null;
}
function makeCode(digits) {
  // קוד קצר ויציב לפי מספר (4-6 תווים)
  let h = 0;
  for (const c of String(digits)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().slice(-6).padStart(4, 'A');
}
function ensureUser(db, digits, name) {
  if (!digits) return null;
  let u = db.users[digits];
  if (!u) {
    u = { code: makeCode(digits), invited: [], name: '', joined_at: Date.now() };
    db.users[digits] = u;
  }
  if (name && !u.name) u.name = String(name).slice(0, 40);
  // ודא שהקוד ייחודי
  for (const [d, o] of Object.entries(db.users)) {
    if (d !== digits && o.code === u.code) { u.code = makeCode(digits + d); break; }
  }
  return u;
}
function findByCode(db, code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return null;
  for (const [d, o] of Object.entries(db.users)) {
    if (o.code === code) return d;
  }
  return null;
}
function prettyNum(d) {
  d = String(d || '');
  return (d.startsWith('972') && d.length === 12) ? '0' + d.slice(3) : '+' + d;
}
function inviteLink(db, digits) {
  const u = db.users[digits];
  if (!u) return '';
  const num = db.meta.displayNumber || process.env.WABA_NUMBER || '';
  const text = encodeURIComponent(`הצטרפתי עם קוד ${u.code}`);
  return num ? `https://wa.me/${num}?text=${text}` : `שלחו לבוט: הצטרפתי עם קוד ${u.code}`;
}
const MEDALS = ['🥇', '🥈', '🥉'];
function leaderboardText(db) {
  const rows = Object.entries(db.users)
    .map(([d, u]) => ({ d, n: u.invited.length, name: u.name || '' }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  if (!rows.length || rows[0].n === 0) {
    return `אלו 10 המובילים שהביאו הכי הרבה שיתופים 👇👇👇\n\nעוד אין שיתופים — שלח !תפריט וקבל את הלינק האישי שלך 🔗`;
  }
  let out = `אלו 10 המובילים שהביאו הכי הרבה שיתופים 👇👇👇\n`;
  rows.forEach((r, i) => {
    const medal = MEDALS[i] || '';
    const nm = r.name ? `${r.name} ` : '';
    out += `\n${medal} (${i + 1}) ${nm}עם ${r.n} צירופים`;
  });
  return out;
}
function textMenu() {
  return `🤖 *תפריט ראשי*\n\n` +
    `1️⃣ הלינק הייחודי לשיתוף — כתוב: !הלינק שלי\n` +
    `2️⃣ מי הגיע דרכי? — כתוב: !מי-הגיע\n` +
    `3️⃣ כמה כרטיסים יש לי? — כתוב: !כרטיסים\n` +
    `4️⃣ מתי ההגרלה תתקיים? — כתוב: !מתי-הגרלה\n` +
    `5️⃣ המובילים בהגרלה — כתוב: !מובילים\n\n` +
    `_בצ'אט פרטי נפתח תפריט לחצנים אוטומטי 👇_`;
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
    return sendWaba(to, textMenu(), recipientType);
  }
  try {
    const ok = await sendWabaPayload(to, {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: '🤖 תפריט ראשי' },
        body: { text: 'בחר מה לעשות — הכל בחינם 👇' },
        footer: { text: 'בחר אפשרות' },
        action: {
          button: 'בחר אפשרות',
          sections: [{
            title: 'הגרלה ושיתופים',
            rows: [
              { id: 'mylink', title: '🔗 הלינק שלי לשיתוף', description: 'קבל לינק אישי וצבור כרטיסים' },
              { id: 'myinvites', title: '👥 מי הגיע דרכי?', description: 'רשימת המצטרפים דרך הלינק שלך' },
              { id: 'mytickets', title: '🎟️ כמה כרטיסים יש לי?', description: 'כרטיס על כל צירוף' },
              { id: 'draw_time', title: '⏰ מתי ההגרלה?', description: 'מועד ההגרלה הקרובה' },
              { id: 'leaders', title: '👥 המובילים בהגרלה', description: '10 המובילים בשיתופים' },
              { id: 'info', title: '💬 ייעוץ ושיווק', description: 'פרטים על השירות' },
            ],
          }],
        },
      },
    }, recipientType);
    if (!ok) {
      // אם הרשמי דחה (למשל גרסת API) — נופלים לטקסט
      return sendWaba(to, textMenu(), recipientType);
    }
    return true;
  } catch (e) {
    console.error('interactive fail, fallback לטקסט:', e.message);
    return sendWaba(to, textMenu(), recipientType);
  }
}

// 🎯 טיפול בבחירה מהתפריט, מחזיר true אם טופל
async function handleMenuChoice(to, id, recipientType, userJid = to) {
  const db = loadRefs();
  const myD = digitsOf(userJid);
  const me = ensureUser(db, myD, '');
  saveRefs(db);
  switch (id) {
    case 'mylink': {
      await sendWaba(to, `🔗 *הלינק הייחודי שלך לשיתוף:*\n${inviteLink(db, myD)}\n\nכל מי שנכנס דרכו — אתה מקבל 🎟️ כרטיס להגרלה!`, recipientType);
      return true;
    }
    case 'myinvites': {
      const list = (me?.invited || []);
      if (!list.length) {
        await sendWaba(to, `🧑‍🤝‍🧑 *מי הגיע דרכך?*\n\nעוד אף אחד לא נכנס דרך הלינק שלך.\nשתף: ${inviteLink(db, myD)}`, recipientType);
      } else {
        await sendWaba(to, `🧑‍🤝‍🧑 *הגיעו דרכך (${list.length}):*\n` + list.slice(0, 20).map((d) => `• ${prettyNum(d)}`).join('\n'), recipientType);
      }
      return true;
    }
    case 'mytickets': {
      await sendWaba(to, `🎟️ *יש לך ${me?.invited.length || 0} כרטיסים!*\n\nכרטיס על כל חבר שנכנס דרך הלינק שלך.`, recipientType);
      return true;
    }
    case 'draw_time': {
      await sendWaba(to, `⏰ *מתי ההגרלה תתקיים?*\n${RAFFLE_DATE}\n${RAFFLE_INFO}`, recipientType);
      return true;
    }
    case 'leaders': {
      await sendWaba(to, leaderboardText(db), recipientType);
      return true;
    }
    case 'info': {
      await sendWaba(to, `💬 *ייעוץ ושיווק*\nכתוב לנו מה אתה צריך ונחזור אליך בהקדם.`, recipientType);
      return true;
    }
  }
  return false;
}

// ⌨️ פקודות טקסט של התפריט (גם לקבוצה), מחזיר true אם טופל
async function handleMenuText(to, cleanText, recipientType, userJid = to) {
  const t = String(cleanText || '').trim();
  const db = loadRefs();
  const myD = digitsOf(userJid);
  const me = ensureUser(db, myD, '');
  const low = t.toLowerCase();
  const isMenu = /^(תפריט|!תפריט|menu|התחל|start|שלום|היי|הי|הי!)$/i.test(t) || low === 'בחר אפשרות';
  if (isMenu) {
    saveRefs(db);
    await sendInteractiveMenu(to, recipientType);
    return true;
  }
  const cmd = t.replace(/^!/, '');
  if (/^(הלינק שלי|הלינק|לינק)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'mylink', recipientType, userJid); }
  if (/^(מי-הגיע|מי הגיע|מי הגיע דרכי)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'myinvites', recipientType, userJid); }
  if (/^(כרטיסים|כמה כרטיסים|כרטיס)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'mytickets', recipientType, userJid); }
  if (/^(מתי-הגרלה|מתי ההגרלה|הגרלה)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'draw_time', recipientType, userJid); }
  if (/^(מובילים|המובילים|טופ)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'leaders', recipientType, userJid); }
  if (/^(ייעוץ|שיווק|מידע|מידע כללי)$/i.test(cmd)) { saveRefs(db); return handleMenuChoice(to, 'info', recipientType, userJid); }
  // 🔗 קליטת קוד הפניה: "הצטרפתי עם קוד XXXX" או "!הצטרף XXXX"
  const m = t.match(/(?:הצטרפתי|הצטרף|הצטרפות|קוד)[^\dA-Za-z]{0,10}([A-Za-z0-9]{4,6})/);
  if (m) {
    const inviter = findByCode(db, m[1]);
    if (inviter && inviter !== myD && !db.users[inviter].invited.includes(myD)) {
      db.users[inviter].invited.push(myD);
      saveRefs(db);
      await sendWaba(to, `✅ נרשמת דרך ${prettyNum(inviter)}! בהצלחה בהגרלה 🍀\n\nכתוב !תפריט לקבלת הלינק האישי שלך.`, recipientType);
      return true;
    }
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
            // שומרים מספר תצוגה ושמות פרופיל לטבלת המובילים
            try {
              const db0 = loadRefs();
              const disp = value.metadata?.display_phone_number || '';
              if (disp) db0.meta.displayNumber = String(disp).replace(/\D/g, '');
              for (const c of value.contacts || []) {
                if (c.wa_id && c.profile?.name) ensureUser(db0, digitsOf(c.wa_id), c.profile.name);
              }
              saveRefs(db0);
            } catch {}
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

              // 0. 📋 תפריט הגרלה/הפניות — תמיד זמין (לפני AI כדי לחסוך)
              try {
                if (await handleMenuText(replyTo, cleanText, replyType, from)) continue;
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
