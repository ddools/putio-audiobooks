// Turns an EPUB into plain blocks of text the reader can lay out, with a character offset on each,
// so a place in the book is one number. Markup is rebuilt from text and a few inline styles, never copied.
import { openZip } from './zip.js';

const SKIP = new Set(['head', 'script', 'style', 'svg', 'math', 'img', 'image', 'video', 'audio', 'iframe', 'object', 'noscript', 'rt', 'rp']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'blockquote', 'figure', 'figcaption',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'hr', 'address', 'center',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body']);
const ITALIC = new Set(['em', 'i', 'cite', 'var', 'dfn']);
const BOLD = new Set(['strong', 'b']);

const dirOf = (path) => path.slice(0, path.lastIndexOf('/') + 1);
// Resolves an href against the file it appears in, as a path inside the zip, keeping any #fragment.
function resolve(base, href) {
  const [file, frag] = href.split('#');
  let path = file ? dirOf(base) + safeDecode(file) : base;
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  path = out.join('/');
  return frag ? `${path}#${safeDecode(frag)}` : path;
}
function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

function parse(text, type) {
  const parser = new DOMParser();
  if (type !== 'text/html') {
    const doc = parser.parseFromString(text, type || 'application/xhtml+xml');
    if (!doc.getElementsByTagName('parsererror').length) return doc;
  }
  return parser.parseFromString(text, 'text/html'); // forgiving, for the many EPUBs that aren't valid XML
}
const all = (root, name) => [...root.getElementsByTagNameNS('*', name)];
const first = (root, name) => all(root, name)[0];
const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// One spine file to blocks. pos is where its text starts in the whole book; ids collects element ids.
function blocksOf(doc, file, pos, ids) {
  const blocks = [];
  let runs = [];
  let len = 0;
  let tag = 'p';
  const flush = () => {
    // Trim the block's edges, run by run, so offsets stay true to the text that is kept.
    while (runs.length && !runs[0][0].trim()) { len -= runs[0][0].length; runs.shift(); }
    while (runs.length && !runs.at(-1)[0].trim()) { len -= runs.at(-1)[0].length; runs.pop(); }
    if (runs.length) {
      runs[0][0] = runs[0][0].replace(/^ +/, '');
      runs.at(-1)[0] = runs.at(-1)[0].replace(/ +$/, '');
      const text = runs.map((r) => r[0]).join('');
      blocks.push({ tag, runs, pos, text });
      pos += text.length + 1; // blocks join with a newline in the book's text
    }
    runs = [];
    len = 0;
  };
  const add = (s, style, pre) => {
    if (!pre) {
      s = s.replace(/\s+/g, ' ');
      const last = runs.at(-1)?.[0];
      if ((!last || /[ \n]$/.test(last)) && s.startsWith(' ')) s = s.slice(1); // collapse across runs too
    }
    if (!s) return;
    const prev = runs.at(-1);
    if (prev && prev[1] === style) prev[0] += s;
    else runs.push([s, style]);
    len += s.length;
  };
  const walk = (el, style, ctx) => {
    for (const node of el.childNodes) {
      if (node.nodeType === 3) { add(node.nodeValue, style, ctx.pre); continue; }
      if (node.nodeType !== 1) continue;
      const name = node.localName.toLowerCase();
      if (SKIP.has(name)) continue;
      const id = node.getAttribute('id') || (name === 'a' && node.getAttribute('name'));
      if (id) ids.set(`${file}#${id}`, pos + len);
      if (name === 'br') { add('\n', style, true); continue; }
      if (BLOCK.has(name)) {
        flush();
        const inner = { ...ctx };
        if (/^h[1-6]$/.test(name)) inner.tag = name;
        else if (name === 'li' || name === 'dt' || name === 'dd') inner.tag = 'li';
        else if (name === 'pre') { inner.tag = 'pre'; inner.pre = true; }
        else if (name === 'blockquote') inner.tag = 'q';
        tag = inner.tag;
        walk(node, style, inner);
        flush();
        tag = ctx.tag;
        continue;
      }
      const next = ITALIC.has(name) ? (style === 'b' ? 'bi' : 'i') : BOLD.has(name) ? (style === 'i' ? 'bi' : 'b') : style;
      walk(node, next, ctx);
    }
  };
  const body = doc.body || first(doc, 'body') || doc.documentElement;
  walk(body, '', { tag: 'p', pre: false });
  flush();
  return { blocks, end: pos };
}

// Nested lists of links, from an EPUB 3 nav document or an EPUB 2 NCX. Hrefs come back resolved.
function tocOf(doc, file, ncx) {
  const out = [];
  if (ncx) {
    const walk = (el, depth) => {
      for (const np of el.children) {
        if (np.localName !== 'navPoint') continue;
        const label = clean(first(np, 'text')?.textContent);
        const src = first(np, 'content')?.getAttribute('src');
        if (src) out.push({ title: label, href: resolve(file, src), depth });
        walk(np, depth + 1);
      }
    };
    const map = first(doc, 'navMap');
    if (map) walk(map, 0);
    return out;
  }
  const navs = all(doc, 'nav');
  const nav = navs.find((n) => /\btoc\b/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) || navs[0];
  if (!nav) return out;
  const walk = (list, depth) => {
    for (const li of list.children) {
      if (li.localName !== 'li') continue;
      const a = [...li.children].find((c) => c.localName === 'a' || c.localName === 'span');
      const href = a?.getAttribute('href');
      if (href) out.push({ title: clean(a.textContent), href: resolve(file, href), depth });
      const sub = [...li.children].find((c) => c.localName === 'ol' || c.localName === 'ul');
      if (sub) walk(sub, depth + 1);
    }
  };
  const list = [...nav.children].find((c) => c.localName === 'ol' || c.localName === 'ul');
  if (list) walk(list, 0);
  return out;
}

// u8: the .epub file. Resolves to { title, author, lang, text, sections, toc }:
// sections are spine files, each { title, pos, end, blocks: [{ tag, runs: [[text, style]], pos, text }] };
// toc entries are { title, pos, depth }, with pos a character offset into text.
export async function parseEpub(u8) {
  const zip = openZip(u8);
  const container = await zip.text('META-INF/container.xml');
  if (!container) throw new Error('No META-INF/container.xml: not an EPUB');
  const opfPath = first(parse(container, 'application/xml'), 'rootfile')?.getAttribute('full-path');
  const opfText = opfPath && await zip.text(opfPath);
  if (!opfText) throw new Error('EPUB has no package file');
  const opf = parse(opfText, 'application/xml');

  const manifest = new Map();
  for (const item of all(opf, 'item')) {
    manifest.set(item.getAttribute('id'), {
      path: resolve(opfPath, item.getAttribute('href') || ''),
      type: item.getAttribute('media-type') || '',
      props: item.getAttribute('properties') || '',
    });
  }
  const spineEl = first(opf, 'spine');
  const spine = all(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref')))
    .filter((m) => m && /html|xml/.test(m.type));

  const ids = new Map();
  const starts = new Map();
  const sections = [];
  let pos = 0;
  for (const item of spine) {
    const text = await zip.text(item.path);
    if (text == null) continue;
    starts.set(item.path, pos);
    const { blocks, end } = blocksOf(parse(text, item.type === 'text/html' ? 'text/html' : 'application/xhtml+xml'), item.path, pos, ids);
    if (!blocks.length) continue;
    sections.push({ path: item.path, title: '', pos, end, blocks });
    pos = end;
  }
  const text = sections.flatMap((s) => s.blocks.map((b) => b.text)).join('\n');

  const navItem = [...manifest.values()].find((m) => /\bnav\b/.test(m.props));
  const ncxItem = manifest.get(spineEl?.getAttribute('toc')) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml');
  let rawToc = [];
  try {
    if (navItem) rawToc = tocOf(parse(await zip.text(navItem.path), 'application/xhtml+xml'), navItem.path, false);
    if (!rawToc.length && ncxItem) rawToc = tocOf(parse(await zip.text(ncxItem.path), 'application/xml'), ncxItem.path, true);
  } catch {}
  const toc = [];
  for (const e of rawToc) {
    const at = ids.get(e.href) ?? starts.get(e.href.split('#')[0]);
    if (at == null || !e.title) continue;
    if (toc.length && toc.at(-1).pos === at) continue; // a part and its first chapter can share a spot
    toc.push({ title: e.title, pos: Math.min(at, text.length), depth: e.depth });
  }
  toc.sort((a, b) => a.pos - b.pos);
  for (const s of sections) {
    s.title = toc.find((e) => e.pos >= s.pos && e.pos < s.end)?.title
      || s.blocks.find((b) => /^h[1-6]$/.test(b.tag))?.text.slice(0, 120) || '';
  }

  const meta = (name) => clean(first(opf, name)?.textContent);
  return { title: meta('title'), author: meta('creator'), lang: meta('language').slice(0, 2).toLowerCase(), text, sections, toc };
}
