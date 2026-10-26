// Lines a book's text up with its audio. No DOM in here, so it can be tested.
// A place in the audio is a fraction of the whole book (0 to 1, as in the player's progress);
// a place in the text is a character offset. Anchors are [audio, text] pairs known to line up.

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/* ---------- chapter titles ---------- */

const LABELS = {
  chapter: ['chapter', 'chap', 'ch', 'kapitel', 'capitulo', 'chapitre', 'capitolo', 'hoofdstuk'],
  part: ['part', 'teil', 'parte', 'partie', 'deel'],
  book: ['book', 'buch', 'libro', 'livre', 'boek', 'libro'],
  track: ['track', 'disc', 'disk', 'cd', 'file', 'side'],
};
const LABEL_OF = new Map(Object.entries(LABELS).flatMap(([k, words]) => words.map((w) => [w, k])));
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'to', 'der', 'die', 'das', 'el', 'la', 'le', 'les', 'de', 'il', 'het', 'een', 'o', 'um', 'uma']);
const ROMAN = /^(?=[ivxl]+$)l?x{0,3}(ix|iv|v?i{0,3})$/;
const unroman = (r) => [...r].reduce((n, c, i) => {
  const v = { i: 1, v: 5, x: 10, l: 50 }; return n + (v[c] < v[r[i + 1]] ? -v[c] : v[c]);
}, 0);
function wordNumber(tokens, i) {
  const a = tokens[i];
  if (/^\d+$/.test(a)) return [+a, 1];
  if (ONES.includes(a)) return [ONES.indexOf(a), 1];
  const tens = TENS.indexOf(a);
  if (tens > 1) {
    const b = tokens[i + 1];
    return ONES.indexOf(b) > 0 && ONES.indexOf(b) < 10 ? [tens * 10 + ONES.indexOf(b), 2] : [tens * 10, 1];
  }
  if (ROMAN.test(a) && a !== 'i' || (a === 'i' && i > 0 && LABEL_OF.has(tokens[i - 1]))) return [unroman(a), 1];
  return null;
}

// "Chapter Twenty-One: The Storm" -> { label: 'chapter', num: 21, words: Set{'storm'}, flat: '...' }
export function titleKey(title) {
  const flat = fold(title || '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = flat ? flat.split(' ') : [];
  let label = null, num = null;
  const words = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (label == null && num == null && LABEL_OF.has(tok)) { label = LABEL_OF.get(tok); continue; }
    const n = num == null && wordNumber(tokens, i);
    if (n) { num = n[0]; i += n[1] - 1; continue; }
    if (tok.length > 1 && !STOP.has(tok)) words.add(tok);
  }
  return { label, num, words, flat };
}

// How sure we are that two titles name the same chapter. 0 means not at all.
export function titleScore(a, b) {
  if (a.flat && a.flat === b.flat && a.label !== 'track') return 4;
  let score = 0;
  if (a.num != null && b.num != null) {
    const kinds = a.label === b.label || (!a.label && b.label === 'chapter') || (!b.label && a.label === 'chapter');
    if (a.num !== b.num || !kinds || a.label === 'track') return 0;
    score += 2;
  }
  if (a.words.size && b.words.size) {
    let both = 0;
    for (const w of a.words) if (b.words.has(w)) both++;
    score += (3 * both) / (a.words.size + b.words.size - both);
  }
  return score;
}

/* ---------- where the story is ---------- */

const MATTER = /^(cover|title|title page|half title|copyright|copyright page|contents|table of contents|dedication|epigraph|also by|by the same author|other books|praise|about the authors?|about the publisher|acknowledge?ments?|newsletter|sign up|reading group|discussion|excerpt|preview|frontispiece|index|inhalt|inhaltsverzeichnis|impressum|imprint|colophon|indice|sommaire|table des matieres|inhoud|colofon|danksagung|agradecimientos|remerciements|ringraziamenti)\b/;
const isMatter = (title) => MATTER.test(fold(title).replace(/[^\p{L}\p{N} ]+/gu, '').trim());

// The stretch of text between the front matter (cover, copyright, contents) and the back matter
// (acknowledgements, adverts). An audiobook usually reads only this part.
export function bodyRange(toc, length) {
  const story = toc.filter((e) => !isMatter(e.title));
  if (!story.length) return [0, length];
  const start = story[0].pos;
  let end = length;
  for (let i = toc.length - 1; i >= 0 && isMatter(toc[i].title) && toc[i].pos > start; i--) end = toc[i].pos;
  return [start, end];
}

/* ---------- matching chapters ---------- */

// The best in-order pairing of audio chapters with text entries, as [i, j] index pairs.
function pairUp(n, m, score) {
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = score(i - 1, j - 1);
      dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], s > 0 ? dp[i - 1][j - 1] + s : -1);
    }
  }
  const out = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    if (dp[i][j] === dp[i - 1][j]) i--;
    else if (dp[i][j] === dp[i][j - 1]) j--;
    else { out.push([i - 1, j - 1]); i--; j--; }
  }
  return out.reverse();
}

// audio: [{ title, a }] chapter starts as book fractions. toc: [{ title, pos }]. Returns anchors.
export function matchChapters(audio, toc, length) {
  const [start, end] = bodyRange(toc, length);
  const story = toc.filter((e) => e.pos >= start && e.pos < end);
  const span = Math.max(1, end - start);
  const frac = (e) => (e.pos - start) / span;
  const ak = audio.map((c) => titleKey(c.title));
  const tk = story.map((e) => titleKey(e.title));
  // A title match that is far from where the proportions put it is more likely a repeated name than the chapter.
  let pairs = pairUp(audio.length, story.length, (i, j) => {
    const s = titleScore(ak[i], tk[j]);
    return s >= 1.5 && Math.abs(audio[i].a - frac(story[j])) < 0.2 ? s : 0;
  });
  // Files named only by number, one per chapter: the counts agree, so go by where each one falls.
  if (pairs.length < 2 && audio.length >= 3 && Math.abs(audio.length - story.length) <= 2) {
    const near = pairUp(audio.length, story.length, (i, j) => 1 - Math.abs(audio[i].a - frac(story[j])) / 0.03);
    if (near.length >= 0.6 * Math.min(audio.length, story.length)) pairs = near;
  }
  return { anchors: pairs.map(([i, j]) => [audio[i].a, story[j].pos]), body: [start, end] };
}

/* ---------- the map ---------- */

// Keeps anchors that rise in both audio and text, preferring earlier entries in the list.
function monotone(list) {
  const kept = [];
  for (const p of list) {
    const i = kept.findIndex((q) => q[0] > p[0]);
    const before = i < 0 ? kept.at(-1) : kept[i - 1];
    const after = i < 0 ? null : kept[i];
    if (before && !(p[0] > before[0] && p[1] > before[1])) continue;
    if (after && !(p[0] < after[0] && p[1] < after[1])) continue;
    kept.splice(i < 0 ? kept.length : i, 0, p);
  }
  return kept;
}

// learned: anchors from exact snaps, which outrank chapter matches. Returns { toText(a), toAudio(c) }.
export function makeMap({ learned = [], chapters = [], body = [0, 1], length = 1 }) {
  const pts = monotone([...learned, ...chapters]);
  // Before the first anchor and after the last, the text waits at the story's edge: that's the credits playing.
  if (!pts.length || pts[0][0] > 0) pts.unshift([0, Math.min(body[0], pts[0]?.[1] ?? body[0])]);
  if (pts.at(-1)[0] < 1) pts.push([1, Math.max(body[1], pts.at(-1)[1])]);
  const lerp = (x, xi, yi) => {
    let k = 1;
    while (k < pts.length - 1 && pts[k][xi] < x) k++;
    const [p, q] = [pts[k - 1], pts[k]];
    const d = q[xi] - p[xi];
    return d > 0 ? p[yi] + ((x - p[xi]) / d) * (q[yi] - p[yi]) : q[yi];
  };
  return {
    points: pts,
    toText: (a) => Math.round(Math.min(length, Math.max(0, lerp(Math.min(1, Math.max(0, a)), 0, 1)))),
    toAudio: (c) => Math.min(1, Math.max(0, lerp(Math.min(length, Math.max(0, c)), 1, 0))),
  };
}

// Adds a snap to the learned list. Ones from the same few seconds of audio are replaced, not stacked.
export function learn(learned, anchor, near = 0.0005) {
  return monotone([anchor, ...learned.filter((p) => Math.abs(p[0] - anchor[0]) > near)]).slice(0, 200);
}

/* ---------- finding spoken words in the text ---------- */

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const norm = (w) => fold(w).replace(/['’]/g, '');

// The book's words as numbers, with where each starts in the text.
export function wordIndex(text) {
  const dict = new Map();
  const ids = [];
  const starts = [];
  for (const m of text.matchAll(WORD)) {
    const w = norm(m[0]);
    if (!dict.has(w)) dict.set(w, dict.size);
    ids.push(dict.get(w));
    starts.push(m.index);
  }
  return { dict, ids: Int32Array.from(ids), starts: Int32Array.from(starts) };
}
export const wordAt = (index, pos) => {
  let lo = 0, hi = index.starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (index.starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo;
};

// Whisper's segments to words, each timed by sharing out its segment's time by length.
// chunks: [{ text, timestamp: [from, to] }] in seconds from the clip's start.
export function timedWords(chunks, offset, clipLength) {
  const out = [];
  for (const c of chunks) {
    const from = c.timestamp?.[0] ?? 0;
    const to = c.timestamp?.[1] ?? clipLength;
    const words = [...(c.text || '').matchAll(WORD)].map((m) => m[0]);
    const total = words.reduce((n, w) => n + w.length + 1, 0) || 1;
    let at = 0;
    for (const w of words) {
      out.push({ w: norm(w), t: offset + from + ((at + w.length / 2) / total) * Math.max(0, to - from) });
      at += w.length + 1;
    }
  }
  return out;
}

// Smith-Waterman over words: the stretch of the book that best matches what was heard.
// Searches near word `around` first and the whole book only if that finds nothing.
export function locate(index, heard, around) {
  const q = heard.map((h) => index.dict.get(h.w) ?? -1);
  const n = q.length;
  if (n < 4) return null;
  const run = (from, to) => {
    const H = new Int32Array(n + 1), O = new Int32Array(n + 1), M = new Int32Array(n + 1);
    const pH = new Int32Array(n + 1), pO = new Int32Array(n + 1), pM = new Int32Array(n + 1);
    let best = { score: 0 };
    for (let i = from; i < to; i++) {
      const w = index.ids[i];
      for (let j = 1; j <= n; j++) {
        const hit = q[j - 1] === w;
        let s = 0, o = i * 1024 + j - 1, m = 0;
        const diag = pH[j - 1] + (hit ? 2 : -1);
        if (diag > s) { s = diag; o = pH[j - 1] > 0 ? pO[j - 1] : i * 1024 + j - 1; m = (pH[j - 1] > 0 ? pM[j - 1] : 0) + (hit ? 1 : 0); }
        if (pH[j] - 1 > s) { s = pH[j] - 1; o = pO[j]; m = pM[j]; }
        if (H[j - 1] - 1 > s) { s = H[j - 1] - 1; o = O[j - 1]; m = M[j - 1]; }
        H[j] = s; O[j] = o; M[j] = m;
        if (hit && s > best.score) best = { score: s, end: i, qEnd: j - 1, origin: o, matches: m };
      }
      pH.set(H); pO.set(O); pM.set(M);
    }
    return best;
  };
  const N = index.ids.length;
  const enough = (b) => b.score > 0 && b.matches >= Math.max(4, 0.45 * n);
  let best = run(Math.max(0, around - 6000), Math.min(N, around + 6000));
  if (!enough(best)) best = run(0, N);
  if (!enough(best)) return null;
  const start = Math.floor(best.origin / 1024);
  const qStart = best.origin % 1024;
  return { start, end: best.end, qStart, qEnd: best.qEnd, matches: best.matches, of: n };
}
