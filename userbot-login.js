/**
 * 🔑 התחברות חד-פעמית לחשבון הטלגרם שלך (יוזרבוט).
 *
 * שימוש:
 *   1. TG_API_ID=... TG_API_HASH=... TG_PHONE=+972... node userbot-login.js send
 *      → קוד נשלח לטלגרם שלך
 *   2. TG_API_ID=... TG_API_HASH=... TG_PHONE=+972... TG_CODE=12345 node userbot-login.js sign
 *      → מתחבר ושומר סשן ב-tg-userbot.session
 *   (אם יש סיסמת אימות דו-שלבי: TG_PASSWORD=... באותה פקודה)
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import fs from 'node:fs';

const SESSION_FILE = new URL('./tg-userbot.session', import.meta.url);
const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = String(process.env.TG_API_HASH || '').trim();
const phone = String(process.env.TG_PHONE || '').trim();
const mode = (process.argv[2] || '').trim();
const PENDING_FILE = new URL('./tg-userbot.pending.json', import.meta.url);

if (!apiId || !apiHash || !phone) {
  console.error('⛔ חסר TG_API_ID / TG_API_HASH / TG_PHONE ב-.env');
  console.error('   מוציאים api_id + api_hash פעם אחת ב-https://my.telegram.org (Tools → API development)');
  process.exit(1);
}
const saved = (() => { try { return fs.readFileSync(SESSION_FILE, 'utf-8').trim(); } catch { return ''; } })();
const client = new TelegramClient(new StringSession(saved), apiId, apiHash, { connectionRetries: 3 });

if (mode === 'send') {
  await client.connect();
  const sent = await client.sendCode({ apiId, apiHash }, phone);
  fs.writeFileSync(PENDING_FILE, JSON.stringify({ phoneCodeHash: sent.phoneCodeHash, at: Date.now() }));
  console.log('📲 קוד נשלח לטלגרם שלך. שלח לי אותו כאן ואמשיך.');
  await client.disconnect();
} else if (mode === 'sign') {
  const code = String(process.env.TG_CODE || '').replace(/\D/g, '');
  if (!code) { console.error('⛔ חסר TG_CODE'); process.exit(1); }
  let pending = {};
  try { pending = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf-8')); } catch {}
  if (!pending.phoneCodeHash) { console.error('⛔ הרץ קודם send'); process.exit(1); }
  await client.connect();
  const { Api } = await import('telegram');
  try {
    await client.invoke(new Api.auth.SignIn({
      phoneNumber: phone, phoneCodeHash: pending.phoneCodeHash, phoneCode: code,
    }));
  } catch (e) {
    const msg = String(e?.errorMessage || e?.message || e);
    if (/SESSION_PASSWORD_NEEDED/i.test(msg)) {
      const pw = String(process.env.TG_PASSWORD || '');
      if (!pw) { console.error('⛔ יש אימות דו-שלבי — הוסף TG_PASSWORD והרץ שוב sign'); process.exit(1); }
      const { password } = await import('telegram/Password.js');
      const pwd = await client.invoke(new Api.account.GetPassword());
      await client.invoke(new Api.auth.CheckPassword({ password: await password.computeCheck(pwd, pw) }));
    } else throw e;
  }
  fs.writeFileSync(SESSION_FILE, client.session.save());
  try { fs.unlinkSync(PENDING_FILE); } catch {}
  const me = await client.getMe();
  console.log(`✅ מחובר כ-${me.firstName || me.username} — הסשן נשמר. אפשר להפעיל את היוזרבוט.`);
  await client.disconnect();
} else {
  console.error('שימוש: node userbot-login.js [send|sign]');
  process.exit(1);
}
