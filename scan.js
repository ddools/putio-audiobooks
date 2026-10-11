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
function pickCover(files) {
  const images = files.filter((f) => IMAGE_EXT.test(f.name) && f.screenshot);
  const named = images.find((f) => /cover|folder|front/i.test(f.name));
  return (named || images[0])?.screenshot || null;
}
function makeBook(id, rawTitle, rawAuthor, files, cover) {
  let title = tidy(rawTitle);
  let author = rawAuthor ? tidy(rawAuthor) : '';
  if (!author && title.includes(' - ')) {
    const cut = title.indexOf(' - ');
    author = title.slice(0, cut).trim();
    title = title.slice(cut + 3).trim();
  }
  return {
    id, title, author,
    cover: cover || files.find((f) => f.screenshot)?.screenshot || null,
    tracks: files.map((f) => ({ id: f.id, name: f.name, size: f.size || 0 })),
    added: files.reduce((m, f) => (f.created_at > m ? f.created_at : m), ''),
  };
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
      for (const f of tracks) out.push(makeBook('f' + f.id, f.name, '', [f], null));
    } else if (tracks.length) {
      // MP3s (and friends) in one folder are one book. Each M4B is its own
      // book, unless they are clearly numbered parts of the same thing.
      const m4bs = tracks.filter((f) => /\.m4b$/i.test(f.name));
      const rest = tracks.filter((f) => !/\.m4b$/i.test(f.name));
      const numberedParts = m4bs.length > 1 && new Set(m4bs.map((f) => f.name.toLowerCase().replace(/\d+/g, '#'))).size === 1;
      if (rest.length) out.push(makeBook('d' + folder.id, folder.name, parentName, rest, cover));
      if (!rest.length && numberedParts) out.push(makeBook('d' + folder.id, folder.name, parentName, m4bs, cover));
      else if (!rest.length && m4bs.length === 1 && !shelf) out.push(makeBook('f' + m4bs[0].id, folder.name, parentName, m4bs, cover));
      else for (const f of m4bs) out.push(makeBook('f' + f.id, f.name, folder.name, [f], cover));
    }
    return shelf || tracks.length > 0;
  }

  await scanFolder(root, '', 0);
  return out;
}
