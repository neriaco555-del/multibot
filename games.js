/**
 * 🎮 משחקים קבוצתיים — לוגיקה טהורה (ללא שליחה, ללא אחסון):
 * - איקס-עיגול (XO) 3x3
 * - מילים-מעורבבות (scramble) עם רשימת מילים Hebrew
 * - אמת-או-חובה (רשימות מובנות, בלי AI — מהיר ותמיד עובד)
 * - מלחמת-משפטים (הכנת קטעי טקסט)
 */

/* ================= איקס-עיגול ================= */
export const XO_EMOJI = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

export function renderXO(board) {
  const cell = (i) => (board[i] === 'X' ? '❌' : board[i] === 'O' ? '⭕' : XO_EMOJI[i + 1]);
  return [0, 1, 2, 3, 4, 5, 6, 7, 8]
    .reduce((rows, i, idx) => {
      if (idx % 3 === 0) rows.push([]);
      rows[rows.length - 1].push(cell(i));
      return rows;
    }, [])
    .map((r) => r.join(' '))
    .join('\n');
}

const XO_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function xoWinner(board) {
  for (const [a, b, c] of XO_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every((c) => c) ? 'draw' : null;
}

/** בדיקת מהלך. מחזיר {ok, error?} */
export function xoApply(game, sender, n) {
  const idx = n - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx > 8) return { ok: false, error: 'מספר בין 1 ל-9 בלבד.' };
  if (game.p1 !== sender && game.p2 !== sender) return { ok: false, error: 'אתה לא במשחק הזה.' };
  if (game.turn !== sender) return { ok: false, error: 'לא התור שלך — חכה ליריב.' };
  if (game.board[idx]) return { ok: false, error: 'התא הזה תפוס. נסה תא אחר.' };
  game.board[idx] = sender === game.p1 ? 'X' : 'O';
  const w = xoWinner(game.board);
  if (w === 'X') game.winner = game.p1;
  else if (w === 'O') game.winner = game.p2;
  else if (w === 'draw') game.winner = 'draw';
  else game.turn = sender === game.p1 ? game.p2 : game.p1;
  game.lastMove = Date.now();
  return { ok: true };
}

/* ================= מילים-מעורבבות ================= */
const WORDS = [
  'מחשב', 'בית ספר', 'כדורגל', 'ענבים',   'מזרקה', 'אופניים', 'שענבל',
  'פיצה', 'שעון', 'מפלצת', 'גיטרה', 'יקינטון', 'תמנון', 'מטאוריט',
  'מגלשה', 'במבוק', 'קרוקודיל', 'טלפון', 'חלון', 'מרפסת', 'יערות',
  'סירה', 'מטוס', 'שועל', 'נמר', 'דולפין', 'עכביש', 'פרפר', 'בזוקה',
  'כישרון', 'הרפתקה', 'מגדלור', 'אקווריום', 'כביש', 'גשר', 'מנהרה', 'מדרכה',
  'גלידה', 'שעועית', 'גבינה', 'pastila', 'שוקולד', 'פנקייק', 'מאפה', 'לחמניה',
].filter((w) => /^[\u0590-\u05FF ]+$/.test(w));

export function pickScrambleWord() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  return w;
}

export function scrambleWord(word) {
  const chars = [...word];
  let out;
  let guard = 0;
  do {
    out = [...chars];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    guard++;
  } while (out.join('') === word && guard < 8);
  return out.join('');
}

/** נרמול טקסט להשוואה: מוחק ניקוד, כפל רווחים, עיברית/אנגליית */
export function normWord(s) {
  return String(s || '')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isScrambleAnswer(text, word) {
  const a = normWord(text);
  const b = normWord(word);
  if (!a || !b) return false;
  if (a === b) return true;
  // "`בית ספר`" וגם "`ביתספר`" נחשבים
  return a.replace(/ /g, '') === b.replace(/ /g, '');
}

/* ================= אמת-או-חובה ================= */
const TRUTHS = [
  'מה הדבר המביך ביותר שקרה לך בבית ספר?',
  'מה הסוד הכי קטן שאתה שומר מהחברים?',
  'את מי מהקבוצה אתה מעריך הכי הרבה ולמה?',
  'מה האחרון שחיפשת בגוגל ב3 בלילה?',
  'מה השקר הקטן האחרון שאמרת?',
  'מה החלום המוזר ביותר שהיה לך?',
  'מה הדבר שאתה מתחרט עליו הכי הרבה?',
  'מי מהקבוצה היית לוקח לאי בודד ולמה?',
  'מה עשית ב10 דקות האחרונות לפני שכתבת את זה?',
  'מה התכונה הכי גרועה שלך?',
  'מה הכי קרוב שהגעת לקראש?',
  'מה המשפט הכי מטופש שאמרת בקול?',
  'מה הדבר שהכי מפחיד אותך?',
  'מה הפרה הכי גדולה שלך?',
  'מה לא אמרת לכולם ואתה חייב להגיד עכשיו?',
];
const DARES = [
  'שלח הודעה עם שלוש שורות בלבד לשלושה אנשים מהקבוצה ותצלם.',
  'כתוב בקבוצה מחמאה אמיתית למישהו שעוד לא דיברת איתו היום.',
  'החלף את תמונת הפרופיל שלך לעשרים דקות.',
  'שיר קורקוע/שיר של דודו טופז או כל שיר מטופש — 15 שניות בקול.',
  'תעשה פוזת טיקטוק ותצלם את עצמך (בתמונה).',
  'שלח לאנשים מהקבוצה אימוג׳י אחד רק — בלי הסבר.',
  'תכתוב קומפלימנט לכל מי שמופיע בקבוצה עכשיו.',
  'תגיד בקול (הקלטה) "אני הכי טוב בקבוצה הזאת".',
  'תצלם מהחלון ותכתוב מה הכי יפה שרואים שם.',
  'תשבור רגע שקט — כתוב שיר על הקבוצה בשורות.',
  'תחליף את שם הקבוצה לכינוי מצחיק לשעתיים.',
  'תכתוב ברכה קורעת לב של שורה אחת לקבוצה.',
];

export function pickTruthOrDare(kind = '') {
  const want = /אמת/i.test(kind) ? 'truth' : /חובה/i.test(kind) ? 'dare' : (Math.random() < 0.5 ? 'truth' : 'dare');
  const list = want === 'truth' ? TRUTHS : DARES;
  const q = list[Math.floor(Math.random() * list.length)];
  return { kind: want, text: q };
}

/* ================= מלחמת-משפטים ================= */
export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const BATTLE_SETUPS = [
  'כשהתכוננת למבחן אבל גילית שמדובר על נושא אחר:',
  'הרגע הזה שבו אתה נכנס לחדר ושוכח למה באת:',
  'כשהחבר הכי טוב שלך אומר "רק עוד שורה אחת" בתכנות:',
  'כשהמנהל אומר "יש לנו שיחת צוות בוקר"',
  'כשאתה פותח מקרר ואין כלום חוץ מפרוסת גבינה אחת:',
  'כשאתה נכנס לישון והשכנים מחליטים לערוך מסיבה:',
  'כשהטלפון שלך הגיע ל1% ואין מטען בסביבה:',
  'כשאתה כותב "לא משנה" ומתחיל לכתוב עוד שלוש שורות:',
];

export function pickBattleSetup() {
  return BATTLE_SETUPS[Math.floor(Math.random() * BATTLE_SETUPS.length)];
}
