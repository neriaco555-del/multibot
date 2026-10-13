/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: 'com.multibot.chat',
  appName: 'מולטי בוט',
  webDir: 'www',
  server: {
    // שרת הצ'אט ברשת הביתית — הטלפון חייב להיות על אותו WiFi
    url: 'http://10.84.231.34:3002',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

module.exports = config;
