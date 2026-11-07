/**
 * התחברות חד-פעמית ל-Suno MCP (OAuth).
 * הרצה: npm run suno-login
 * הטוקן נשמר ב-suno-auth.json ומתחדש אוטומטית.
 */
import { sunoLogin, sunoAuthFile } from './suno-mcp.js';

console.log('🎵 Suno MCP — התחברות חד-פעמית');
try {
  await sunoLogin();
  console.log(`\n✨ נשמר ב-${sunoAuthFile()}`);
  console.log('עכשיו אפשר לבקש מהבוט שיר או מנגינה בשפה חופשית.');
  process.exit(0);
} catch (e) {
  const msg = (e && e.message) || String(e);
  console.error('\n❌ ההתחברות נכשלה:', msg);
  if (/SUNO_OAUTH_TIMEOUT/.test(msg)) {
    console.error('נגמר הזמן (10 דקות). נסה שוב והתחבר מהר יותר.');
  } else if (/access_denied|SUNO_OAUTH/.test(msg)) {
    console.error('ודא שאישרת את החיבור בדפדפן, ושאין חסימה של הפורט המקומי.');
  } else if (/SUNO_REGISTER|SUNO_DISCOVERY/.test(msg)) {
    console.error('לא הצלחתי לדבר עם שרת האימות של Suno. בדוק אינטרנט/חומת אש ונסה שוב.');
  }
  process.exit(1);
}
