// Turns a put.io folder tree into books. No DOM in here, so the rules can be tested.

export const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
// "Book I" and "Book 1" should sort together, so standalone roman numerals count as numbers.
const ROMAN = { I: 1, V: 5, X: 10 };
const unroman = (s) => s.replace(/\b[IVX]+\b/g, (r) =>
  [...r].reduce((n, c, i) => n + (ROMAN[c] < ROMAN[r[i + 1]] ? -ROMAN[c] : ROMAN[c]), 0));
export const byName = (a, b) => collator.compare(unroman(a.name), unroman(b.name));

const AUDIO_EXT = /\.(mp3|m4b|m4a|aac|ogg|oga|opus|flac|wav)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const ARCHIVE_EXT = /\.(zip|rar)$/i;
const EPUB_EXT = /\.epub$/i;
const DISC_DIR = /^(cd|disc|disk|part|volume|vol)[\s._-]*\d+$/i;
const MAX_DEPTH = 6;

function tidy(name) {
  // Only audio extensions come off: a folder called "11.22.63" keeps its ending.
  let s = name.replace(AUDIO_EXT, '').replace(/_/g, ' ');
  if (!/\s/.test(s)) s = s.replace(/\./g, ' ');
  const bare = s.replace(/\s*[\[(][^\])]*[\])]/g, '').trim();
  return (bare || s).replace(/\s+/g, ' ').trim();
}
export function trackTitle(name, index) {
  const s = tidy(name).replace(/^\d+\s*[-._)]*\s*/, '').trim();
  return s && !/^\d+$/.test(s) ? s : `Part ${index + 1}`;
}
// A book's track titles. "Network Effect-01 Chapter 1" becomes "Chapter 1": whatever every
// file says before its number goes, unless that would leave a track with no name at all.
export function trackTitles(names) {
  let n = 0;
  while (names.length > 1 && names[0][n] && names.every((s) => s[n] === names[0][n])) n++;
  while (/\d/.test(names[0][n - 1] || '')) n--;
  const cut = names.map((s, i) => trackTitle(s.slice(n), i));
  const safe = names.every((s) => /\d/.test(s[n] || '')) && !cut.some((t, i) => t === `Part ${i + 1}`);
  return safe ? cut : names.map(trackTitle);
}
function pickCover(files) {
  const images = files.filter((f) => IMAGE_EXT.test(f.name) && f.screenshot);
  const named = images.find((f) => /cover|folder|front/i.test(f.name));
  return (named || images[0])?.screenshot || null;
}
// The EPUB that goes with a book: the folder's only one, or the one whose name shares most words with the book's.
const words = (s) => new Set(tidy(s.replace(EPUB_EXT, '')).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1));
export function pickEpub(epubs, name, alone) {
  if (alone && epubs.length === 1) return epubs[0];
  const want = words(name);
  let best = null, score = 0;
  for (const e of epubs) {
    const have = words(e.name);
    const both = [...want].filter((w) => have.has(w)).length;
    // Most of the shorter name, and a fair share of both: "Emma" finds "Jane Austen - Emma", "It" not "It Ends With Us".
    const most = both / (Math.min(want.size, have.size) || 1);
    const share = both / (want.size + have.size - both || 1);
    if (most >= 0.5 && share >= 0.3 && most + share > score) { best = e; score = most + share; }
  }
  return best;
}
const epubInfo = (f) => f && { id: f.id, name: f.name, size: f.size || 0 };

function makeBook(id, rawTitle, rawAuthor, files, cover, epub) {
  let title = tidy(rawTitle);
  let author = rawAuthor ? tidy(rawAuthor) : '';
  // "Author - 2020 - Series, 5 - Title" says more than the parent folder does.
  const full = title.match(/^(.+?) - \d{4} - (.+?),? (\d+) - (.+)$/);
  if (full) {
    author = `${full[1]} · ${full[2]} #${full[3]}`;
    title = full[4];
  } else if (!author && title.includes(' - ')) {
    const cut = title.indexOf(' - ');
    author = title.slice(0, cut).trim();
    title = title.slice(cut + 3).trim();
  }
  return {
    id, title, author,
    cover: cover || files.find((f) => f.screenshot)?.screenshot || null,
    tracks: files.map((f) => ({ id: f.id, name: f.name, size: f.size || 0 })),
    added: files.reduce((m, f) => (f.created_at > m ? f.created_at : m), ''),
    ...(epub && { epub: epubInfo(epub) }),
  };
}

// cyrb53: a 53-bit string hash, plenty for one person's files.
function hash(s) {
  let a = 0xdeadbeef, b = 0x41c6ce57;
  for (const c of s) { const k = c.codePointAt(0); a = Math.imul(a ^ k, 2654435761); b = Math.imul(b ^ k, 1597334677); }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return 'l' + (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}
// A folder picked on this device (Files with webkitRelativePath) as a tree scan() can walk, and each file by id.
// Ids come from the path and size, so picking the same folder again finds the same books.
// Images point at offline/<id>, where sw.js serves them once they are saved.
export function fromFiles(list) {
  const kids = new Map([['l', []]]);
  const files = new Map();
  for (const file of list) {
    const parts = (file.webkitRelativePath || file.name).split('/');
    let parent = 'l';
    for (let i = 0; i < parts.length - 1; i++) {
      const id = hash(parts.slice(0, i + 1).join('/'));
      if (!kids.has(id)) { kids.set(id, []); kids.get(parent).push({ id, name: parts[i], file_type: 'FOLDER' }); }
      parent = id;
    }
    const id = hash(`${parts.join('/')}:${file.size}`);
    files.set(id, file);
    kids.get(parent).push({ id, name: file.name, file_type: 'FILE', size: file.size, created_at: new Date(file.lastModified || 0).toISOString(),
      ...(IMAGE_EXT.test(file.name) && { screenshot: `offline/${id}` }) });
  }
  // Phones have no folder picker, so picked files come without paths. Loose MP3s (and friends) picked together are
  // one book, the way a folder of them is, named for what their names share; M4Bs stay a book each.
  const loose = kids.get('l');
  const parts = loose.filter((f) => AUDIO_EXT.test(f.name) && !/\.m4b$/i.test(f.name));
  if (parts.length > 1 && !loose.some((f) => f.file_type === 'FOLDER')) {
    const names = parts.map((f) => f.name);
    let n = 0;
    while (names[0][n] && names.every((s) => s[n] === names[0][n])) n++;
    const name = names[0].slice(0, n).replace(/[\s\d._-]+$/, '') || names[0].replace(AUDIO_EXT, '');
    const id = hash('/' + name);
    const book = loose.filter((f) => !/\.m4b$/i.test(f.name)); // the audio, and the cover and EPUB that go with it
    kids.set(id, book);
    kids.set('l', [...loose.filter((f) => !book.includes(f)), { id, name, file_type: 'FOLDER' }]);
  }
  // The picked folder is the library, like put.io's, unless it holds audio itself: then it is one book.
  const top = kids.get('l').length === 1 && kids.get('l')[0].file_type === 'FOLDER' && kids.get('l')[0];
  const root = top && !kids.get(top.id).some((f) => AUDIO_EXT.test(f.name)) ? top : { id: 'l', name: '' };
  return { root, listFiles: async (id) => ({ files: kids.get(id) }), files };
}

// Every book under root. listFiles(id) resolves to { files }, as api.listFiles does.
// Archives can't be played; their names go into `archives` so the caller can say so.
export async function scan(root, listFiles, archives = []) {
  const out = [];
  // One limit of 4 listings for the whole scan. A limit per folder would multiply at each level.
  let active = 0;
  const waiting = [];
  const list = async (id) => {
    if (active < 4) active++;
    else await new Promise((go) => waiting.push(go)); // woken by a finished call, which hands its slot over
    try {
      const files = (await listFiles(id)).files;
      archives.push(...files.filter((f) => ARCHIVE_EXT.test(f.name)).map((f) => f.name));
      return files;
    }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };

  async function scanFolder(folder, parentName, depth) {
    const isRoot = depth === 0;
    const files = await list(folder.id);
    const dirs = files.filter((f) => f.file_type === 'FOLDER');
    const discs = isRoot ? [] : dirs.filter((d) => DISC_DIR.test(d.name)).sort(byName);
    let cover = pickCover(files);
    let tracks = files.filter((f) => f.file_type !== 'FOLDER' && AUDIO_EXT.test(f.name)).sort(byName);
    const epubs = files.filter((f) => f.file_type !== 'FOLDER' && EPUB_EXT.test(f.name));
    for (const disc of discs) {
      const sub = await list(disc.id);
      tracks = tracks.concat(sub.filter((f) => AUDIO_EXT.test(f.name)).sort(byName));
      cover = cover || pickCover(sub);
    }

    // Subfolders first: if they hold books, this folder is a shelf, not one book's own folder.
    let shelf = false;
    if (depth < MAX_DEPTH) {
      const deeper = dirs.filter((d) => !discs.includes(d));
      shelf = (await Promise.all(deeper.map((d) => scanFolder(d, isRoot ? '' : folder.name, depth + 1)))).some(Boolean);
    }

    if (isRoot) {
      for (const f of tracks) out.push(makeBook('f' + f.id, f.name, '', [f], null, pickEpub(epubs, f.name, false)));
    } else if (tracks.length) {
      // MP3s (and friends) in one folder are one book. Each M4B is its own
      // book, unless they are clearly numbered parts of the same thing.
      const m4bs = tracks.filter((f) => /\.m4b$/i.test(f.name));
      const rest = tracks.filter((f) => !/\.m4b$/i.test(f.name));
      const numberedParts = m4bs.length > 1 && new Set(m4bs.map((f) => f.name.toLowerCase().replace(/\d+/g, '#'))).size === 1;
      const one = (rest.length ? 1 : 0) + (numberedParts || m4bs.length === 1 ? 1 : m4bs.length) === 1; // the folder holds a single book
      const epub = pickEpub(epubs, folder.name, one);
      if (rest.length) out.push(makeBook('d' + folder.id, folder.name, parentName, rest, cover, epub));
      if (!rest.length && numberedParts) out.push(makeBook('d' + folder.id, folder.name, parentName, m4bs, cover, epub));
      else if (!rest.length && m4bs.length === 1 && !shelf) out.push(makeBook('f' + m4bs[0].id, folder.name, parentName, m4bs, cover, epub));
      else for (const f of m4bs) out.push(makeBook('f' + f.id, f.name, folder.name, [f], cover, pickEpub(epubs, f.name, false)));
    }
    return shelf || tracks.length > 0;
  }

  await scanFolder(root, '', 0);
  return out;
}
