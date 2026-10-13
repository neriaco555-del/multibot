/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.multibot.chat',
  appName: 'מולטי בוט',
  webDir: 'www',
  server: {
    // שרת ציבורי קבוע — עובד מכל מקום
    url: 'https://multibot-zuk0.onrender.com',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

module.exports = config;
