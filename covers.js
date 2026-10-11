// Cover art search for the per-book picker. Asks Apple's audiobook search
// and Open Library; both are keyless and CORS-open.

const JUNK = /\b(e?pub|ebook\S*|unabridged|mp3|m4b|\d+\s?kbps)\b/gi;
const words = (s) => s.toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];

// A starting search for a book, made from its messy folder name. Title only:
// the "author" is often just the parent folder ("Audiobooks", a downloader's name).
export const coverTerm = (book) => words(book.title.replace(JUNK, ' ')).join(' ');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cover search failed (${res.status})`);
  return res.json();
}

// Candidates as { thumb, url, title, by }. Throws only when both sources fail.
export async function searchCovers(term) {
  const q = encodeURIComponent(term);
  const [apple, open] = await Promise.allSettled([
    getJson(`https://itunes.apple.com/search?media=audiobook&limit=9&term=${q}`),
    getJson(`https://openlibrary.org/search.json?limit=6&fields=title,author_name,cover_i&q=${q}`),
  ]);
  if (apple.status === 'rejected' && open.status === 'rejected') throw apple.reason;
  return [
    ...(apple.value?.results || []).filter((r) => r.artworkUrl100).map((r) => ({
      thumb: r.artworkUrl100.replace('100x100', '200x200'), url: r.artworkUrl100.replace('100x100', '600x600'),
      title: r.collectionName || '', by: r.artistName || '',
    })),
    ...(open.value?.docs || []).filter((d) => d.cover_i).map((d) => ({
      thumb: `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`, url: `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`,
      title: d.title || '', by: (d.author_name || []).join(', '),
    })),
  ];
}
