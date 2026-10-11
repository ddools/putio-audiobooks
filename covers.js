// Cover art lookup for books put.io has no image for. Asks Apple's
// audiobook search first, then Open Library. Both are keyless and CORS-open.

const JUNK = /\b(e?pub|ebook\S*|unabridged|mp3|m4b|\d+\s?kbps)\b/gi;
const words = (s) => s.toLowerCase().replace(/['’]/g, '').match(/[\p{L}\p{N}]+/gu) || [];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cover lookup failed (${res.status})`);
  return res.json();
}

// Returns an image URL, or '' when nothing convincing turns up.
// Throws on network trouble or rate limits, so the caller can try again later.
export async function findCover(book) {
  const title = book.title.replace(JUNK, ' ');
  // A book sitting directly in "Audiobooks" gets that as its author. Not useful to search on.
  const author = /^(audio)?books?$/i.test(book.author) ? '' : book.author;
  const mine = words(title);
  const ours = new Set(words(`${title} ${author}`));
  // Folder names are messy, so a hit must have its main title inside our name,
  // and either cover half of it or share a word with the author we can see.
  const fits = (name, by) => {
    const w = words(String(name || '').split(/[:(\[]/)[0]).filter((x) => !/^(the|a|an)$/.test(x));
    if (!w.length || !w.every((x) => ours.has(x))) return false;
    return w.length * 2 >= mine.length || words(String(by || '')).some((x) => x.length > 2 && ours.has(x));
  };

  for (const term of new Set([`${title} ${author}`, title].map((t) => words(t).join(' ')))) {
    if (!term) continue;
    const { results = [] } = await getJson(`https://itunes.apple.com/search?media=audiobook&limit=5&term=${encodeURIComponent(term)}`);
    const hit = results.find((r) => r.artworkUrl100 && fits(r.collectionName, r.artistName));
    if (hit) return hit.artworkUrl100.replace('100x100', '600x600');
  }
  if (!mine.length) return '';
  const { docs = [] } = await getJson(`https://openlibrary.org/search.json?limit=5&fields=title,author_name,cover_i&q=${encodeURIComponent(mine.join(' '))}`);
  const doc = docs.find((d) => d.cover_i && fits(d.title, (d.author_name || []).join(' ')));
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '';
}
