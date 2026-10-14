/**
 * 📷 התחברות QR לחשבון הטלגרם (יוזרבוט) — בלי קודים.
 * שומר QR מתחלף ב-tg-qr.png. סרוק מהטלפון:
 * טלגרם ← הגדרות ← מכשירים ← קשר מכשיר.
 */
import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import fs from 'node:fs';

const apiId = Number(process.env.TG_API_ID || 0);
const apiHash = String(process.env.TG_API_HASH || '').trim();
if (!apiId || !apiHash) { console.error('⛔ חסר TG_API_ID / TG_API_HASH'); process.exit(1); }
const SESSION_FILE = new URL('./tg-userbot.session', import.meta.url);
const QR_FILE = '/home/cohen/tg-qr.png';

const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
await client.connect();
console.log('QR-READY');
const user = await client.signInUserWithQrCode(
  { apiId, apiHash },
  {
    qrCode: async (qr) => {
      try {
        const { default: QRCode } = await import('qrcode');
        const url = 'tg://login?token=' + Buffer.from(qr.token).toString('base64url');
        await QRCode.toFile(QR_FILE, url, { width: 600, margin: 2 });
        console.log('QR-SAVED');
      } catch (e) { console.error('qr-save fail', e.message); }
    },
    password: async () => {
      const pw = String(process.env.TG_PASSWORD || '');
      if (!pw) throw new Error('NEED_PASSWORD');
      return pw;
    },
    onError: async (e) => {
      console.error('qr-err', String(e?.message || e).slice(0, 120));
      return false;
    },
  }
);
fs.writeFileSync(SESSION_FILE, client.session.save());
console.log(`✅ מחובר כ-${user.firstName || user.username}`);
await client.disconnect();
process.exit(0);
