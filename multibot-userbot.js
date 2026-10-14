/**
 * 👤 מולטי בוט כיוזרבוט — עונה מהחשבון שלך.
 * מגיב להודעות נכנסות שמתחילות ב-! או / (בכל צ'אט).
 *
 * הרצה: node multibot-userbot.js   (דורש tg-userbot.session — ראה userbot-login.js)
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import fs from 'node:fs';
import { chatAI } from './ai-chat.js';
import { generateImage } from './ai-image.js';
import { searchYouTube, formatMediaResults } from './media-search.js';
import { searchImages, translateText, getWeather } from './web-search.js';
import { textToSpeech } from './ai-voice.js';
import { normalizeNaturalCommand, aiRouteCommand, KNOWN_FIRST } from './nlp.js';
import { resolveAiTool, runAiTool } from './aifun.js';
import {
  currencyRates, cryptoPrices, newsHe, cityTime, dice, coin, pickOne,
  genPassword, randNum, randColor, dateHe, countdown, shabbatTimes,
  stockPrice, shortenUrl, earthquakes, airQuality, resolveIndexSymbol, animalImage,
} from './more.js';

const SESSION_FILE = new URL('./tg-userbot.session', import.meta.url);
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = String(process.env.TG_API_HASH || '').trim();
if (!apiId || !apiHash) { console.error('⛔ חסר TG_API_ID / TG_API_HASH'); process.exit(1); }
let saved = '';
try { saved = fs.readFileSync(SESSION_FILE, 'utf-8').trim(); } catch {}
if (!saved) { console.error('⛔ אין סשן — הרץ קודם userbot-login.js'); process.exit(1); }

const client = new TelegramClient(new StringSession(saved), apiId, apiHash, { connectionRetries: 5 });
const stripCmd = (s) => String(s || '').replace(/^[/!]\s*/, '').trim();
const firstWord = (s) => (String(s || '').split(/\s+/)[0] || '').toLowerCase();

async function runCmd(chat, cmd, q) {
  const say = (t) => client.sendMessage(chat, { message: String(t || '').slice(0, 4000) });
  if (['עזרה', 'help', 'start', 'תפריט'].includes(cmd)) {
    return say('🤖 *מולטי בוט (מהחשבון שלי)*\n🎨 /תמונה · 🎵 /שיר /וידאו · 🔊 /דבר · 🌤️ /מזג /חדשות /דולר /ביטקוין /שבת · 😂 /בדיחה /חידה /עובדה · 🎲 /קוביה /מטבע · 🐶 /כלב /חתול · 💬 או שאלה חופשית');
  }
  if (['תמונה', 'צייר', 'תצייר'].includes(cmd)) {
    if (q.length < 2) return say('🎨 תאר מה ליצור.');
    try {
      const { buffer } = await generateImage(q.slice(0, 300));
      if (buffer?.length > 5000) return client.sendFile(chat, { file: buffer, caption: q.slice(0, 200) });
    } catch {}
    return say('😢 יצירת התמונה נכשלה.');
  }
  if (['שיר', 'מוזיקה', 'נגן'].includes(cmd)) {
    if (q.length < 2) return say('🎵 שם שיר + זמר.');
    return say(formatMediaResults(await searchYouTube(q, 3), '🎵'));
  }
  if (['וידאו', 'סרטון', 'סרטונים'].includes(cmd)) {
    if (q.length < 2) return say('🎬 נושא.');
    return say(formatMediaResults(await searchYouTube(q, 3), '🎬'));
  }
  if (['דבר', 'קול'].includes(cmd)) {
    if (q.length < 2) return say('🔊 טקסט להקראה.');
    try {
      const ogg = await textToSpeech(q);
      return client.sendFile(chat, { file: ogg, caption: '🔊', attributes: [] });
    } catch { return say('😢 ההקראה נכשלה.'); }
  }
  if (['תרגם', 'תרגום'].includes(cmd)) {
    if (q.length < 2) return say('🌍 טקסט לתרגום.');
    try { return say(await translateText(q)); } catch (e) { return say('😢 ' + e.message); }
  }
  if (cmd === 'מזג') {
    if (q.length < 2) return say('🌤️ עיר.');
    try { return say(await getWeather(q)); } catch (e) { return say('😢 ' + e.message); }
  }
  if (cmd === 'חדשות') return say(await newsHe(5).catch((e) => '😢 ' + e.message));
  if (cmd === 'דולר') return say(await currencyRates().catch((e) => '😢 ' + e.message));
  if (['ביטקוין', 'קריפטו'].includes(cmd)) return say(await cryptoPrices().catch((e) => '😢 ' + e.message));
  if (cmd === 'שבת') return say(await shabbatTimes(q || 'ירושלים').catch((e) => '😢 ' + e.message));
  if (cmd === 'qr' || cmd === 'ברקוד') {
    if (!q) return say('🔳 טקסט לברקוד.');
    try {
      const { default: QRCode } = await import('qrcode');
      return client.sendFile(chat, { file: await QRCode.toBuffer(q.slice(0, 500), { width: 600 }), caption: '🔳' });
    } catch { return say('😢 נכשל.'); }
  }
  const tool = resolveAiTool(cmd);
  if (tool) {
    try {
      const out = await runAiTool(tool, q);
      return say((out || '').trim().slice(0, 3000) || 'נסה שוב.');
    } catch { return say('😢 נכשל — נסה שוב.'); }
  }
  if (cmd === 'קוביה') return say(dice(Math.min(1000, Math.max(2, parseInt(q) || 6))));
  if (cmd === 'מטבע') return say(coin());
  if (cmd === 'בחר' || cmd === 'הגרלה') {
    if (q.length < 2) return say('🎲 אפשרויות עם |.');
    return say(pickOne(q));
  }
  if (cmd === 'סיסמה') return say(genPassword(12));
  if (cmd === 'שעה') return say(cityTime(q || 'ירושלים'));
  if (cmd === 'תאריך') return say(dateHe());
  if (['כלב', 'חתול', 'שועל'].includes(cmd)) {
    try {
      const kind = cmd === 'כלב' ? 'dog' : cmd === 'חתול' ? 'cat' : 'fox';
      const { imageUrl, caption } = await animalImage(kind);
      return say(`${caption}\n${imageUrl}`);
    } catch { return say('😢 נכשל.'); }
  }
  if (['שאל', 'ai'].includes(cmd)) {
    if (q.length < 2) return say('💬 מה השאלה?');
    const { text } = await chatAI(q, []).catch(() => ({ text: '' }));
    return say((text || '').trim().slice(0, 3000) || 'נסה שוב.');
  }
  return null;
}

async function handler(event) {
  try {
    const m = event.message;
    if (!m || m.out) return; // רק נכנסות
    const raw = (m.message || '').trim();
    if (!raw || !/^[/!]/.test(raw)) return;
    const chat = await event.getChat();
    let line = stripCmd(raw);
    try { line = normalizeNaturalCommand(line) || line; } catch {}
    const fw = firstWord(line);
    if (!KNOWN_FIRST.has(fw) && line.length <= 300) {
      try {
        line = (await Promise.race([
          aiRouteCommand(line, []),
          new Promise((res) => setTimeout(() => res(line), 15000)),
        ])) || line;
      } catch {}
    }
    const sp = line.indexOf(' ');
    const cmd = sp === -1 ? line : line.slice(0, sp);
    const args = sp === -1 ? '' : line.slice(sp + 1);
    const done = await runCmd(chat, cmd, args.trim().slice(0, 500));
    if (done === null || done === undefined) {
      const { text } = await chatAI(line.slice(0, 500), []).catch(() => ({ text: '' }));
      await client.sendMessage(chat, { message: (text || '').trim().slice(0, 3000) || 'שמעתי 🙂 נסה שוב.' });
    }
  } catch (e) {
    console.error('userbot-msg:', (e?.message || e || '').toString().slice(0, 150));
  }
}

await client.connect();
client.addEventHandler(handler, new NewMessage({}));
const me = await client.getMe();
console.log(`✅ יוזרבוט מחובר כ-${me.firstName || me.username} — מאזין לפקודות ! ו-/`);
for (;;) await new Promise((r) => setTimeout(r, 60000));
