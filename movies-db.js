import fs from 'node:fs';

const DB_PATH = new URL('./movies.json', import.meta.url);

export function loadMovies() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalize(s = '') {
  return s.toString().trim().toLowerCase()
    .replace(/[״״"']/g, '')
    .replace(/\s+/g, ' ');
}

// חיפוש מטושטש פשוט: כל המילים או חלק מהן
export function searchPersonalLibrary(query, limit = 5) {
  const movies = loadMovies();
  const q = normalize(query);
  if (!q || q.length < 2) return [];
  const qWords = q.split(' ').filter(Boolean);

  const scored = movies.map((m) => {
    const hay = normalize(`${m.title || ''} ${m.englishTitle || ''} ${m.year || ''}`);
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const w of qWords) {
      if (w.length >= 2 && hay.includes(w)) score += 2;
    }
    return { movie: m, score };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.movie);
}
