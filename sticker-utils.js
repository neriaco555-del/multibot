/**
 * יצירת סטיקרים לוואטסאפ מתוך תמונה (Buffer).
 * משתמש ב-sharp: מקטין ל-512x512, ממיר ל-WebP — הפורמט שוואטסאפ דורש.
 * (sharp אופציונלי: אם לא מותקן — למשל על שרת חינמי קטן — הפקודה מחזירה שגיאה מסודרת והבוט ממשיך לעבוד)
 */
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('sharp לא זמין — !סטיקר מושבת, שאר הבוט עובד רגיל');
}

const WA_MAX_BYTES = 100 * 1024; // לוודא שהמדבקה עוברת את הלימיט של וואטסאפ (~100KB)

/**
 * קולאז' רשת מבאפרים — תמונה אחת עם כולן (עד 9, גריד 3 עמודות).
 * מחזיר JPEG Buffer או null (בלי sharp / כישלון).
 */
export async function collageBuffers(buffers, cols = 3) {
  if (!sharp || !buffers?.length) return null;
  try {
    const cell = 512;
    const list = buffers.slice(0, 9);
    const rows = Math.ceil(list.length / cols);
    const thumbs = await Promise.all(list.map((b) =>
      sharp(b).resize(cell, cell, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer()
    ));
    const comp = thumbs.map((t, k) => ({
      input: t,
      left: (k % cols) * cell,
      top: Math.floor(k / cols) * cell,
    }));
    return await sharp({
      create: { width: cols * cell, height: rows * cell, channels: 3, background: '#111111' },
    }).composite(comp).jpeg({ quality: 85 }).toBuffer();
  } catch (e) {
    console.warn('collage fail:', (e?.message || '').slice(0, 100));
    return null;
  }
}

/**
 * ממיר צינור sharp ל-WebP עד שהוא נכנס ללימיט של וואטסאפ (מוריד איכות בהדרגה)
 */
async function webpCapped(pipeline) {
  let last = null;
  for (const quality of [88, 75, 60, 45]) {
    last = await pipeline.clone().webp({ quality, effort: 4 }).toBuffer();
    if (last.length <= WA_MAX_BYTES) return last;
  }
  return last;
}

export async function toStickerBuffer(imageBuffer) {
  if (!sharp) throw new Error('יצירת סטיקרים לא נתמכת על שרת זה (חסר sharp)');
  if (!imageBuffer || imageBuffer.length < 100) throw new Error('קובץ תמונה ריק');
  const pipeline = sharp(imageBuffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  return webpCapped(pipeline);
}

/* ---------- הסרת רקע מסטיקר שנוצר ב-AI (כרומה ירוק / לבן) → מדבקה שקופה ---------- */

/**
 * מסיר את הרקע האחיד מסטיקר שנוצר ב-AI ומחזיר PNG עם אלфа (רקע שקוף).
 * שיטה: דוגמת צבע הרקע מהפינות + הצפה (flood fill) מהקצוות פנימה —
 * מסיר רק רקע שמחובר לקצוות, ולכן שומר על הלבן הפנימי של המדבקה,
 * וגם על המסגרת/הגבול הלבן של המדבקה כשאפשר.
 * אם הסרה לא הגיונית (מעט מדי / יותר מדי) — מחזיר את המקור כמו שהוא.
 */
export async function removeStickerBackground(imageBuffer) {
  if (!sharp || !imageBuffer || imageBuffer.length < 100) return imageBuffer;
  try {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    if (w * h > 1600 * 1600) return imageBuffer;

    const idx = (x, y) => (y * w + x) * 4;
    const corners = [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2]]
      .map(([x, y]) => { const i = idx(x, y); return [data[i], data[i + 1], data[i + 2]]; });
    const bg = [0, 1, 2].map((k) => Math.round(corners.reduce((s, c) => s + c[k], 0) / 4));
    const isChroma = bg[1] > bg[0] + 40 && bg[1] > bg[2] + 40; // ירוק כרומה
    const TOL = 70;
    const TOL_SOFT = Math.round(TOL * 1.6);
    const dist = (i) => {
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };

    const seen = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    let removed = 0;
    const touch = (p) => {
      const i = p * 4;
      if (seen[p] || data[i + 3] === 0 || dist(i) > TOL) return;
      seen[p] = 1;
      data[i + 3] = 0;
      removed++;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - w);
      if (y < h - 1) stack.push(p + w);
    };
    while (stack.length) touch(stack.pop());

    // ירוק כרומה שנשאר בפנים (בתוך מסגרת לבנה) — מסירים גם הוא בבדיקה צמודה
    if (isChroma) {
      for (let p = 0; p < w * h; p++) {
        const i = p * 4;
        if (data[i + 3] === 0 || dist(i) > TOL) continue;
        const dd = dist(i);
        data[i + 3] = Math.round(255 * ((dd - TOL) / (TOL_SOFT - TOL)));
      }
    }

    const frac = removed / (w * h);
    if (frac < 0.04 || frac > 0.97) return imageBuffer; // לא נראית הסרת רקע תקינה
    return await sharp(data, { raw: { width: w, height: h, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch (e) {
    console.warn('הסרת רקע של סטיקר נכשלה, שולח כמו שהוא:', e.message);
    return imageBuffer;
  }
}

/**
 * סטיקר מם: תמונה + כיתוב עברית עליון/תחתון (כמו בתמונה שהמשתמש שלח) — מודל Stable Diffusion
 */
async function generateStickerFromPrompt(prompt, referenceImageBuffer = null) {
  if (!prompt) {
    throw new Error('תיאור (prompt) דרוש');
  }
  // אם יש תמונה מרצון להשתמש בה, נשתמש בה
  if (referenceImageBuffer) {
    // יצירת סטיקר מרצון מתמונה קיימת
    return await toStickerBuffer(referenceImageBuffer);
  }
  // אחרת, יצירת סטיקר ממשפט
  // Stable Diffusion יוצר סטיקר ממשפט
  const cleaned = String(prompt)
    .replace(/^\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // הפקת תמונה ממשפט (Stable Diffusion)
  const generatedImage = await generateStableDiffusionImage(cleaned);
  // הפקת סטיקר מהתמונה המוצגת
  return await toStickerBuffer(generatedImage);
}

/**
 * יצירת סטיקר ממשפט באמצעות Stable Diffusion (מודל AI)
 * מחזיר Buffer WebP של הסטיקר
 * (לא בשימוש כרגע — נשמר כ-stub כדי לא לשבור יבוא; יצירה מאפס נעשית דרך ai-image.js)
 */
async function generateStableDiffusionImage(prompt) {
  throw new Error('generateStableDiffusionImage אינו נתמך — השתמש ב-generateStickerImage מ-ai-image.js');
}

/**
 * יצירת סטיקר ממשפט באמצעות Stable Diffusion (מודל AI)
 * מחזיר Buffer WebP של הסטיקר
 */
async function generateStableDiffusion(prompt) {
  throw new Error('generateStableDiffusion אינו נתמך — השתמש ב-generateStickerImage מ-ai-image.js');
}

/**
 * סטיקר מם: תמונה + כיתוב עליון/תחתון בעברית (סגנון מם קלאסי).
 * מחזיר Buffer WebP בגודל 512x512.
 */
export async function memeSticker(imageBuffer, top = '', bottom = '') {
  if (!sharp) throw new Error('יצירת סטיקרים לא נתמכת על שרת זה (חסר sharp)');
  if (!imageBuffer || imageBuffer.length < 100) throw new Error('קובץ תמונה ריק');
  const esc = (s) => String(s || '').slice(0, 80)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const t = esc(top);
  const b = esc(bottom);
  const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
<style>.m{font-family:sans-serif;font-size:44px;font-weight:900;fill:#fff;stroke:#000;stroke-width:7px;paint-order:stroke;stroke-linejoin:round;}</style>
${t ? `<text x="256" y="62" text-anchor="middle" class="m" direction="rtl">${t}</text>` : ''}
${b ? `<text x="256" y="478" text-anchor="middle" class="m" direction="rtl">${b}</text>` : ''}
</svg>`;
  const pipeline = sharp(imageBuffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }]);
  return webpCapped(pipeline);
}

/**
 * סטיקר מונפש מתוך וידאו קצר (Buffer) — ffmpeg מקומי:
 * חותך ל-8 שניות, 512x512, עד 12fps, WebP מונפש (הלימיט של וואטסאפ ~500KB).
 */
export async function videoToStickerBuffer(videoBuffer, maxSec = 8) {
  if (!videoBuffer || videoBuffer.length < 1000) throw new Error('קובץ וידאו ריק');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const execFileAsync = promisify(execFile);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vstick-'));
  try {
    const inp = path.join(dir, 'in.mp4');
    const out = path.join(dir, 'out.webp');
    await fs.promises.writeFile(inp, videoBuffer);
    // ניסיון 1: איכות מלאה; ניסיון 2: מוקטן אם חרג מהלימיט
    for (const [fps, q] of [[12, 60], [8, 45]]) {
      await execFileAsync('ffmpeg', [
        '-y', '-i', inp, '-t', String(maxSec),
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=' + fps + ',pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-c:v', 'libwebp_anim', '-loop', '0', '-q:v', String(q), '-an', out,
      ]);
      const buf = await fs.promises.readFile(out);
      if (buf.length > 1000 && buf.length <= 500 * 1024) return buf;
    }
    const buf = await fs.promises.readFile(out);
    if (!buf.length || buf.length < 1000) throw new Error('המרה נכשלה');
    return buf; // חורג קצת — נשלח בכל זאת, וואטסאפ לרוב מקבל
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * האם הודעה מכילה מדיה שניתנת להמרה לסטיקר?
 */
export function getImageLike(msg) {
  return (
    msg.message?.imageMessage ||
    msg.message?.stickerMessage ||
    null
  );
}
