const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_LANG = process.env.TMDB_LANG || 'he-IL';

export async function searchTMDB(query) {
  if (!TMDB_API_KEY || TMDB_API_KEY.includes('PUT_YOUR')) return null;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(query)}&language=${encodeURIComponent(TMDB_LANG)}&include_adult=false&page=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const first = data?.results?.[0];
    if (!first) return null;
    return {
      title: first.title,
      originalTitle: first.original_title,
      year: (first.release_date || '').slice(0, 4),
      overview: first.overview || '',
      rating: first.vote_average,
      poster: first.poster_path ? `https://image.tmdb.org/t/p/w500${first.poster_path}` : null,
    };
  } catch {
    return null;
  }
}
