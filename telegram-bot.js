/**
 * 🤖 מולטי בוט לטלגרם — אותם מנועים כמו בוואטסאפ/אתר.
 * (node-telegram-bot-api v2)
 *
 * הרצה: TELEGRAM_BOT_TOKEN=... node telegram-bot.js
 * - פרטי: אפשר לכתוב חופשי (עם / או ! או בלי כלום)
 * - קבוצות: רק עם ! או / או בתשובה (Reply) לבוט
 */
import 'dotenv/config';
import { Bot, InputFile } from 'node-telegram-bot-api';
import { config } from './config.js';
import { chatAI } from './ai-chat.js';
import { generateImage, generateStickerImage } from './ai-image.js';
import { searchYouTube, formatMediaResults } from './media-search.js';
import { searchImages, translateText, getWeather } from './web-search.js';
import { textToSpeech } from './ai-voice.js';
import { transcribeAudio } from './aimedia.js';
import { normalizeNaturalCommand, aiRouteCommand, KNOWN_FIRST } from './nlp.js';
import { resolveAiTool, runAiTool } from './aifun.js';
import { searchProducts, affiliateUrl } from './aliexpress.js';
import { toStickerBuffer } from './sticker-utils.js';
import {
  animalImage, currencyRates, cryptoPrices, newsHe,
  cityTime, dice, coin, pickOne, genPassword, randNum, randColor, dateHe, countdown,
  shabbatTimes, stockPrice, shortenUrl, earthquakes, airQuality, resolveIndexSymbol,
} from './more.js';
import fs from 'node:fs';

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!TOKEN) {
  console.error('⛔ חסר TELEGRAM_BOT_TOKEN ב-.env (משיגים מ-@BotFather בטלגרם)');
  process.exit(1);
}
const bot = new Bot(TOKEN);
const api = bot.api;
const BOT_NAME = config.BOT_NAME || 'מולטי בוט 🤖';
let botUsername = '';
const fileUrl = (p) => `https://api.telegram.org/file/bot${TOKEN}/${p}`;
const up = (buf, name) => new InputFile(buf, name);

/* ---------- עזר ---------- */
async function sendSafe(chatId, text, extra = {}) {
  const t = String(text || '').slice(0, 4000) || '…';
  try {
    return await api.sendMessage({ chat_id: chatId, text: t, parse_mode: 'Markdown', ...extra });
  } catch {
    return api.sendMessage({ chat_id: chatId, text: t.replace(/[*_`]/g, ''), ...extra });
  }
}
const stripCmd = (s) => String(s || '').replace(/^[/!]\s*/, '').replace(/@\w+\s*$/, '').trim();
const firstWord = (s) => (String(s || '').split(/\s+/)[0] || '').toLowerCase().replace(/^[:\-]+|[:\-]+$/g, '');
async function fileBuf(fileId) {
  const f = await api.getFile({ file_id: fileId });
  const r = await fetch(fileUrl(f.file_path));
  if (!r.ok) throw new Error('dl ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/* ---------- ניקוד ---------- */
const PTS_FILE = new URL('./tg-points.json', import.meta.url);
let points = {};
try { points = JSON.parse(fs.readFileSync(PTS_FILE, 'utf-8')); } catch {}
let ptsTimer = null;
function savePts() {
  clearTimeout(ptsTimer);
  ptsTimer = setTimeout(() => { try { fs.writeFileSync(PTS_FILE, JSON.stringify(points)); } catch {} }, 3000);
}
const lastPt = new Map();
const ptNames = {};
function addPoint(uid, name, n = 1) {
  const now = Date.now();
  if (n === 1 && now - (lastPt.get(uid) || 0) < 60000) return;
  lastPt.set(uid, now);
  if (name) ptNames[uid] = String(name).slice(0, 40);
  points[uid] = (points[uid] || 0) + n;
  savePts();
}

/* ---------- טריוויה / איקס-עיגול / תזכורות ---------- */
const trivia = new Map(); // chatId -> {a, timer}
const TRIVIA_BANK = [
  { q: 'מהי בירת ישראל?', opts: ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע'], a: 1 },
  { q: 'כמה ימים יש בשבוע?', opts: ['5', '6', '7', '8'], a: 2 },
  { q: 'כמה זה 7 כפול 8?', opts: ['54', '56', '63', '48'], a: 1 },
  { q: 'איזה חג חוגגים עם סופגניות?', opts: ['פסח', 'סוכות', 'חנוכה', 'פורים'], a: 2 },
];
const LET = ['א', 'ב', 'ג', 'ד'];
const XO = new Map(); // chatId -> {x, o, board, turn, turnName}
const XO_WIN = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function xoText(g, xn, on) {
  const c = g.board.map((v, i) => v || (i + 1));
  return `🎮 ❌ ${xn} נגד ⭕ ${on || '...'} — תור: ${g.turnName}\n\n${c[0]} | ${c[1]} | ${c[2]}\n${c[3]} | ${c[4]} | ${c[5]}\n${c[6]} | ${c[7]} | ${c[8]}\n\nמהלך: !xo מספר (1-9)`;
}
const reminders = new Map();
let remSeq = 1;

const HELP = `🤖 *מולטי בוט — כל הפקודות (גם בעברית חופשית!)*

🎨 יצירה: /תמונה · /סטיקר · /דבר (הקראה)
🎵 מדיה: /שיר · /וידאו · /תמונות
🌤️ מידע: /מזג · /חדשות · /דולר · /ביטקוין · /שבת · /מניה · /מדד · /קצר · /רעידת-אדמה · /זיהום-אוויר · /תרגם
😂 כיף: /בדיחה · /חידה · /עובדה · /סיפור · /מתכון · /ברכה · /קוד · ועוד
🎲 מהיר: /קוביה · /מטבע · /בחר · /הגרלה · /סיסמה · /מספר · /צבע · /תאריך · /שעה · /עד
🐶 חיות: /כלב · /חתול · /שועל · 🛒 /קנה · 🔳 /qr
🎮 משחקים: /טריוויה · /איקס-עיגול · /סקר · /תזכורת · /נקודות · /טופ
💬 או פשוט כתוב שאלה — אני מבין לבד!`;

/* ---------- דיספאצ'ר ---------- */
async function handleCommand(chatId, from, uid, cmdRaw, args, msg) {
  const cmd = String(cmdRaw || '').trim();
  const q = String(args || '').trim().slice(0, 500);
  const say = (t, extra) => sendSafe(chatId, t, extra);
  const needQ = (usage) => say(usage || '❓ חסר טקסט. כתוב /עזרה.');
  const act = (a) => api.sendChatAction({ chat_id: chatId, action: a }).catch(() => {});

  // 🎨 תמונה
  if (['תמונה', 'צייר', 'ציור', 'תצייר', 'image', 'draw'].includes(cmd)) {
    if (q.length < 2) return needQ('🎨 תאר מה ליצור. דוגמה: /תמונה חתול אסטרונאוט');
    await act('upload_photo');
    try {
      const { buffer } = await Promise.race([
        generateImage(q.slice(0, 300)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 120000)),
      ]);
      if (buffer && buffer.length > 5000) return api.sendPhoto({ chat_id: chatId, photo: up(buffer, 'img.jpg'), caption: q.slice(0, 200) });
      return say('😢 יצירת התמונה נכשלה — נסה תיאור אחר.');
    } catch { return say('😢 יצירת התמונה נכשלה כרגע.'); }
  }
  // ⭐ סטיקר
  if (['סטיקר', 'מדבקה', 'sticker'].includes(cmd)) {
    const rep = msg.reply_to_message;
    const doc = rep && rep.document && String(rep.document.mime_type || '').startsWith('image/') ? rep.document : null;
    const ph = (rep && rep.photo && rep.photo.length ? rep.photo[rep.photo.length - 1] : null) || doc;
    if (ph) {
      try {
        const webp = await toStickerBuffer(await fileBuf(ph.file_id));
        return api.sendSticker({ chat_id: chatId, sticker: up(webp, 's.webp') });
      } catch { return say('😢 יצירת הסטיקר נכשלה.'); }
    }
    if (q.length < 2) return needQ('⭐ הגב לתמונה עם /סטיקר, או תאר סטיקר ליצירה מאפס.');
    try {
      const { buffer } = await Promise.race([
        generateStickerImage(q.slice(0, 200)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 120000)),
      ]);
      if (buffer && buffer.length > 3000) {
        const webp = await toStickerBuffer(buffer).catch(() => null);
        if (webp) return api.sendSticker({ chat_id: chatId, sticker: up(webp, 's.webp') });
        return api.sendPhoto({ chat_id: chatId, photo: up(buffer, 's.png'), caption: '⭐ הסטיקר שלך:' });
      }
      return say('😢 יצירת הסטיקר נכשלה.');
    } catch { return say('😢 יצירת הסטיקר נכשלה כרגע.'); }
  }
  // 🎵🎬 שיר / וידאו
  if (['שיר', 'מוזיקה', 'נגן', 'song', 'music'].includes(cmd)) {
    if (q.length < 2) return needQ('🎵 שם שיר + זמר.');
    return say(formatMediaResults(await searchYouTube(q, 3), '🎵'));
  }
  if (['וידאו', 'סרטון', 'סרטונים', 'יוטיוב', 'video'].includes(cmd)) {
    if (q.length < 2) return needQ('🎬 נושא לסרטון.');
    return say(formatMediaResults(await searchYouTube(q, 3), '🎬'));
  }
  // 🔊 דיבור
  if (['דבר', 'קול', 'say', 'speak'].includes(cmd)) {
    if (q.length < 2) return needQ('🔊 טקסט להקראה.');
    await act('record_voice');
    try {
      const ogg = await textToSpeech(q);
      return api.sendVoice({ chat_id: chatId, voice: up(ogg, 'v.ogg') });
    } catch { return say('😢 ההקראה נכשלה — נסה טקסט קצר יותר.'); }
  }
  // 🖼️ תמונות
  if (['תמונות', 'images'].includes(cmd)) {
    if (q.length < 2) return needQ('🖼️ נושא לחיפוש.');
    const imgs = await searchImages(q, 3).catch(() => []);
    if (!imgs.length) return say('😢 לא מצאתי תמונות.');
    await api.sendPhoto({ chat_id: chatId, photo: imgs[0].url, caption: (imgs[0].title || '').slice(0, 200) }).catch(() => {});
    return say('🖼️ *מצאתי:*\n' + imgs.map((r) => r.page || r.url).join('\n'));
  }
  if (['תרגם', 'תרגום', 'translate'].includes(cmd)) {
    if (q.length < 2) return needQ('🌍 טקסט לתרגום.');
    try { return say(await translateText(q)); } catch (e) { return say('😢 ' + String(e.message || '').slice(0, 150)); }
  }
  if (['מזג', 'weather'].includes(cmd)) {
    if (q.length < 2) return needQ('🌤️ עיר. דוגמה: /מזג תל אביב');
    try { return say(await getWeather(q)); } catch (e) { return say('😢 ' + String(e.message || '').slice(0, 150)); }
  }
  if (['חדשות', 'news'].includes(cmd)) return say(await newsHe(5).catch((e) => '😢 ' + e.message));
  if (['דולר'].includes(cmd)) return say(await currencyRates().catch((e) => '😢 ' + e.message));
  if (['ביטקוין', 'קריפטו', 'bitcoin', 'crypto'].includes(cmd)) return say(await cryptoPrices().catch((e) => '😢 ' + e.message));
  if (['שבת'].includes(cmd)) return say(await shabbatTimes(q || 'ירושלים').catch((e) => '😢 ' + e.message));
  if (['מניה', 'מניות', 'stock'].includes(cmd)) {
    if (!q) return needQ('📈 סימול, למשל: /מניה AAPL');
    return say(await stockPrice(resolveIndexSymbol(q) || q).catch((e) => '😢 ' + e.message));
  }
  if (['מדד', 'מדדים'].includes(cmd)) return say(await stockPrice(resolveIndexSymbol(q || 'TA-35') || 'TA-35').catch((e) => '😢 ' + e.message));
  if (['קצר', 'קיצור', 'short'].includes(cmd)) {
    if (q.length < 4) return needQ('🔗 קישור ארוך לקיצור.');
    return say(await shortenUrl(q).catch((e) => '😢 ' + e.message));
  }
  if (['רעידת-אדמה', 'רעידות'].includes(cmd)) return say(await earthquakes(q).catch((e) => '😢 ' + e.message));
  if (['זיהום-אוויר', 'זיהום'].includes(cmd)) return say(await airQuality(q).catch((e) => '😢 ' + e.message));
  if (['qr', 'ברקוד', 'קיואר'].includes(cmd)) {
    if (!q) return needQ('🔳 טקסט/קישור לברקוד.');
    try {
      const { default: QRCode } = await import('qrcode');
      const buf = await QRCode.toBuffer(q.slice(0, 500), { width: 600, margin: 2 });
      return api.sendPhoto({ chat_id: chatId, photo: up(buf, 'qr.png'), caption: '🔳 הברקוד שלך:' });
    } catch { return say('😢 יצירת הברקוד נכשלה.'); }
  }
  // 🎲 מהיר
  if (cmd === 'קוביה') return say(dice(Math.min(1000, Math.max(2, parseInt(q) || 6))));
  if (cmd === 'מטבע') return say(coin());
  if (cmd === 'בחר' || cmd === 'הגרלה') {
    if (q.length < 2) return needQ('🎲 אפשרויות עם | ביניהן.');
    return say(pickOne(q));
  }
  if (cmd === 'סיסמה') return say(genPassword(Math.min(64, Math.max(4, parseInt(q) || 12))));
  if (cmd === 'מספר') {
    const nums = (q.match(/-?\d+/g) || []).map(Number);
    return say(nums.length >= 2 ? randNum(nums[0], nums[1]) : randNum());
  }
  if (cmd === 'צבע') return say(randColor());
  if (cmd === 'תאריך') return say(dateHe());
  if (cmd === 'שעה') return say(cityTime(q || 'ירושלים'));
  if (cmd === 'עד') {
    if (q.length < 4) return needQ('⏳ תאריך, למשל: /עד 25.12.2026');
    return say(countdown(q));
  }
  // 🐶 חיות
  if (['כלב', 'dog'].includes(cmd) || ['חתול', 'cat'].includes(cmd) || ['שועל', 'fox'].includes(cmd)) {
    const kind = ['כלב', 'dog'].includes(cmd) ? 'dog' : (['חתול', 'cat'].includes(cmd) ? 'cat' : 'fox');
    try {
      const { imageUrl, caption } = await animalImage(kind);
      return api.sendPhoto({ chat_id: chatId, photo: imageUrl, caption });
    } catch { return say('😢 לא מצאתי תמונה כרגע.'); }
  }
  // 🛒 קניות
  if (['קנה', 'קניות', 'קנייה', 'קני', 'ali'].includes(cmd)) {
    if (q.length < 2) return needQ('🛒 מוצר לחיפוש.');
    try {
      const items = await searchProducts(q, 5);
      return say('🛒 *מצאתי:*\n\n' + items.map((p, i) => `${i + 1}. *${p.title}*\n💰 ${p.price}\n🔗 ${affiliateUrl(p.url)}`).join('\n\n'));
    } catch (e) { return say('😢 ' + String(e.message || '').slice(0, 150)); }
  }
  // ✨ כלי AI
  const tool = resolveAiTool(cmd);
  if (tool) {
    try {
      const out = await Promise.race([
        runAiTool(tool, q),
        new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 30000)),
      ]);
      return say((out || '').trim().slice(0, 3000) || 'נסה שוב.');
    } catch (e) {
      if (e && e.message === 'EMPTY') return needQ('✍️ הוסף טקסט לכלי הזה.');
      return say('😢 נכשל — נסה שוב.');
    }
  }
  // 🎯 טריוויה
  if (cmd === 'טריוויה') {
    if (trivia.has(chatId)) return say('🎯 כבר רצה טריוויה — ענו עליה!');
    let t = null;
    try {
      const { text } = await Promise.race([
        chatAI('כתוב שאלת טריוויה בעברית עם 4 אפשרויות. JSON בלבד: {"q":"...","opts":["...","...","...","..."],"a":0}', []),
        new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 20000)),
      ]);
      const j = JSON.parse((String(text || '').match(/\{[\s\S]*\}/) || [])[0] || 'null');
      if (j && j.q && Array.isArray(j.opts) && j.opts.length === 4 && j.a >= 0 && j.a <= 3) t = j;
    } catch {}
    if (!t) t = TRIVIA_BANK[Math.floor(Math.random() * TRIVIA_BANK.length)];
    const rec = { ...t, timer: setTimeout(() => {
      trivia.delete(chatId);
      sendSafe(chatId, `⏰ הזמן עבר! התשובה: *${LET[t.a]}. ${t.opts[t.a]}*`);
    }, 90000) };
    trivia.set(chatId, rec);
    return say(`🎯 *טריוויה!* (5 נקודות)\n\n❓ ${t.q}\n\n` + t.opts.map((o, i) => `${LET[i]}. ${o}`).join('\n') + '\n\nענו באות או מספר.');
  }
  if (['נקודות'].includes(cmd)) return say(`🎖️ *${from}:* ${points[uid] || 0} נקודות`);
  if (['טופ'].includes(cmd)) {
    const top = Object.entries(points).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return say(top.length ? '🏆 *המובילים:*\n' + top.map(([u, c], i) => `${i + 1}. ${ptNames[u] || u} — ${c}`).join('\n') : '🏆 אין ניקוד עדיין.');
  }
  // 🎮 איקס-עיגול
  if (['איקס-עיגול', 'xo'].includes(cmd) && !/^xo\s+\d/i.test(`${cmdRaw} ${q}`)) {
    if (/ביטול/.test(q)) {
      if (XO.has(chatId)) { XO.delete(chatId); return say('🎮 בוטל.'); }
      return say('אין משחק פעיל.');
    }
    const g = XO.get(chatId);
    if (!g) {
      XO.set(chatId, { x: uid, xn: from, o: null, on: '', board: Array(9).fill(''), turn: uid, turnName: from });
      return say(`🎮 ${from} פתח משחק! יריב כותב /איקס-עיגול להצטרפות.`);
    }
    if (g.x !== uid && !g.o) {
      g.o = uid; g.on = from;
      return say(xoText(g, g.xn, g.on));
    }
    return say('🎮 משחק רץ — מהלך עם /xo מספר.');
  }
  {
    const mm = `${cmdRaw} ${q}`.match(/^xo\s+(\d)/i);
    if (mm) {
      const g = XO.get(chatId);
      if (!g) return say('אין משחק. פתח עם /איקס-עיגול');
      if (!g.o) return say('מחכים ליריב.');
      if (uid !== g.turn) return say(`לא תורך! תור: ${g.turnName}`);
      const i = parseInt(mm[1], 10) - 1;
      if (!(i >= 0 && i < 9) || g.board[i]) return say('תא תפוס — בחר 1-9 פנוי.');
      g.board[i] = (uid === g.x) ? 'X' : 'O';
      let w = null;
      for (const [a, b, c] of XO_WIN) if (g.board[a] && g.board[a] === g.board[b] && g.board[a] === g.board[c]) w = g.board[a];
      if (w) {
        const winner = w === 'X' ? g.xn : g.on;
        XO.delete(chatId);
        addPoint(uid, from, 10);
        return say(xoText(g, g.xn, g.on) + `\n\n🏆 *${winner} ניצח/ה!* (+10)`);
      }
      if (g.board.every(Boolean)) { XO.delete(chatId); return say(xoText(g, g.xn, g.on) + '\n\n🤝 תיקו!'); }
      g.turn = (uid === g.x) ? g.o : g.x;
      g.turnName = (uid === g.x) ? g.on : g.xn;
      return say(xoText(g, g.xn, g.on));
    }
  }
  // 📊 סקר (טלגרם מקורי!)
  if (cmd === 'סקר') {
    const parts = q.split('|').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 3) return needQ('📊 שימוש: /סקר שאלה | א | ב\n(טלגרם פותח סקר מקורי עם כפתורים!)');
    const [qq, ...opts] = parts;
    return api.sendPoll({ chat_id: chatId, question: qq.slice(0, 200), options: opts.slice(0, 9).map((o) => ({ text: o.slice(0, 60) })) });
  }
  // ⏰ תזכורת
  if (cmd === 'תזכורת') {
    const m = q.match(/^(\d{1,4}|[0-2]?\d:[0-5]\d)\s+([\s\S]{2,200})$/);
    if (!m) return needQ('⏰ שימוש: /תזכורת 30 טקסט · /תזכורת 18:30 טקסט');
    let at = 0;
    if (/^\d{1,4}$/.test(m[1])) at = Date.now() + Math.min(1440, Math.max(1, parseInt(m[1], 10))) * 60000;
    else {
      const [hh, mm] = m[1].split(':').map(Number);
      const d = new Date();
      d.setHours(hh, mm, 0, 0);
      at = d.getTime() <= Date.now() ? d.getTime() + 86400000 : d.getTime();
    }
    const id = remSeq++;
    const timer = setTimeout(() => {
      reminders.delete(id);
      sendSafe(chatId, `⏰ *תזכורת:* ${m[2]}`);
    }, Math.min(Math.max(at - Date.now(), 1000), 2147483647));
    reminders.set(id, { to: uid, text: m[2], at, timer });
    return say(`⏰ נרשם! אזכיר "${m[2].slice(0, 80)}" ב־${new Date(at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
  }
  if (cmd === 'תזכורות') {
    const mine = [...reminders.entries()].filter(([, r]) => r.to === uid);
    if (!mine.length) return say('⏰ אין תזכורות פעילות.');
    return say('⏰ *שלך:*\n' + mine.map(([, r]) => `• ${r.text.slice(0, 80)} — ${new Date(r.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`).join('\n'));
  }
  // 📖 עזרה / מצב / שאל
  if (['עזרה', 'help', 'start', 'תפריט'].includes(cmd)) return say(HELP);
  if (['מצב', 'status'].includes(cmd)) {
    return say(`🤖 *מצב מנועים:*\nGroq=${config.GROQ_API_KEY ? 'ON' : 'off'} · Gemini=${config.GEMINI_API_KEY ? 'ON' : 'off'} · Pollinations=ON ✅`);
  }
  if (['שאל', 'ai', 'gpt'].includes(cmd)) {
    if (q.length < 2) return needQ('💬 מה השאלה?');
    await api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(() => {});
    const { text } = await chatAI(q, []).catch(() => ({ text: '' }));
    return say((text || '').trim().slice(0, 3000) || 'נסה שוב.');
  }
  return null; // לא טופל → צ'אט חופשי
}

/* ---------- כניסה ---------- */
bot.on('message', async (ctx) => {
  const msg = ctx.message;
  try {
    if (!msg || !ctx.chat || ctx.from?.is_bot) return;
    const chatId = ctx.chat.id;
    const uid = ctx.from.id;
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    const f = ctx.from;
    const from = `${f.first_name || ''} ${f.last_name || ''}`.trim() || f.username || 'חבר';
    addPoint(uid, from);

    // 🎤 הודעה קולית → תמלול → תשובה
    if (msg.voice || msg.audio) {
      try {
        await api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(() => {});
        const buf = await fileBuf((msg.voice || msg.audio).file_id);
        const heard = await transcribeAudio(buf.slice(0, 8 * 1024 * 1024), 'voice.ogg');
        if (!heard || heard.trim().length < 2) return sendSafe(chatId, '😢 לא שמעתי טוב — נסה שוב.');
        const { text } = await chatAI(heard.slice(0, 500), []).catch(() => ({ text: '' }));
        return sendSafe(chatId, `🎤 שמעתי: "${heard.slice(0, 120)}"\n\n${(text || '').trim().slice(0, 2500) || 'נסה שוב.'}`);
      } catch {
        return sendSafe(chatId, '😢 התמלול נכשל כרגע.');
      }
    }
    // 🖼️ תמונה עם כיתוב שאלה → תיאור
    if (msg.photo && msg.caption) {
      const c = stripCmd(msg.caption);
      if (/שאל|מה|תאר|רואים/i.test(c)) {
        try {
          const { describeImage } = await import('./aimedia.js');
          const ph = msg.photo[msg.photo.length - 1];
          const ans = await describeImage(await fileBuf(ph.file_id), c);
          return sendSafe(chatId, `👁️ ${ans}`);
        } catch { return sendSafe(chatId, '😢 לא הצלחתי לראות.'); }
      }
    }

    const raw = (msg.text || '').trim();
    if (!raw) return;
    const isReplyToBot = !!(msg.reply_to_message && botUsername && msg.reply_to_message.from?.username === botUsername);
    const mentioned = botUsername && raw.includes('@' + botUsername);
    let text = raw;
    let usedPrefix = false;
    if (/^[/!]/.test(text)) { usedPrefix = true; text = stripCmd(text); }
    if (isGroup && !usedPrefix && !mentioned && !isReplyToBot && !msg.photo) return;

    // משחקים: תשובות חופשיות
    const t = text.trim();
    const tr = trivia.get(chatId);
    if (tr && /^[א-ד1-4]$/.test(t)) {
      const idx = /^[א-ד]$/.test(t) ? LET.indexOf(t) : parseInt(t, 10) - 1;
      if (idx === tr.a) {
        clearTimeout(tr.timer);
        trivia.delete(chatId);
        addPoint(uid, from, 5);
        return sendSafe(chatId, `🎉 *נכון, ${from}!* (+5 נקודות)`);
      }
      return;
    }

    // ניתוב טבעי
    let line = text;
    try { line = normalizeNaturalCommand(text) || text; } catch {}
    const fw = firstWord(line);
    if (!KNOWN_FIRST.has(fw) && line.length <= 300 && !trivia.get(chatId)) {
      try {
        line = await Promise.race([
          aiRouteCommand(line, []),
          new Promise((res) => setTimeout(() => res(line), 15000)),
        ]) || line;
      } catch {}
    }
    const sp = line.indexOf(' ');
    const cmd = sp === -1 ? line : line.slice(0, sp);
    const args = sp === -1 ? '' : line.slice(sp + 1);
    const done = await handleCommand(chatId, from, uid, cmd, args, msg);
    if (done !== null && done !== undefined) return;
    // צ'אט חופשי
    await api.sendChatAction({ chat_id: chatId, action: 'typing' }).catch(() => {});
    const { text: ans } = await chatAI(line.slice(0, 500), []).catch(() => ({ text: '' }));
    return sendSafe(chatId, (ans || '').trim().slice(0, 3000) || 'שמעתי 🙂 נסה לשאול שוב.');
  } catch (e) {
    console.error('tg-msg fail:', (e && e.message || '').slice(0, 150));
  }
});

bot.catch((err) => console.warn('tg-handler:', (err && err.message || '').slice(0, 150)));

try {
  const me = await bot.api.getMe();
  botUsername = me.username || '';
  console.log(`✅ מחובר לטלגרם כ-@${botUsername} (${me.first_name})`);
  console.log(`🤖 מנועים: Groq=${config.GROQ_API_KEY ? 'ON' : 'off'} Gemini=${config.GEMINI_API_KEY ? 'ON' : 'off'} Pollinations=ON`);
} catch (e) {
  console.error('⛔ טוקן לא תקין:', (e && e.message || '').slice(0, 120));
  process.exit(1);
}
for (;;) {
  try {
    await bot.startPolling();
  } catch (e) {
    console.warn('tg-poll restart:', (e && e.message || '').slice(0, 120));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
