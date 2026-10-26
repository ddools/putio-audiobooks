import * as api from './api.js';
import { audioClip, blobReader } from './clip.js';
import { parseEpub } from './epub.js';
import { httpReader, parseM4b } from './m4b.js';
import { CLIENT_ID as BAKED_ID, DEMO, VERSION } from './config.js';
import { coverTerm, searchCovers } from './covers.js';
import { LANGS, lang, num, setLang, t, translate } from './i18n.js';
import { ROOT as DEMO_ROOT } from './demo.js';
import * as offline from './offline.js';
import { byName, collator, scan, trackTitles } from './scan.js';
import { learn, locate, makeMap, matchChapters, timedWords, wordAt, wordIndex } from './sync.js';
import * as whisper from './whisper.js';

// The baked Client ID only accepts the hosted URL as its callback. On localhost,
// drop it so the connect screen offers a pasted Client ID or OAuth token instead.
const CLIENT_ID = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : BAKED_ID;

/* ---------- small helpers ---------- */

const $ = (sel, root = document) => root.querySelector(sel);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return el;
}

// One-time move from the old 'earful:' prefix, so the rename doesn't sign anyone out.
try {
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('earful:')) continue;
    const next = 'putio-audiobooks:' + k.slice(7);
    if (localStorage.getItem(next) == null) localStorage.setItem(next, localStorage.getItem(k));
    localStorage.removeItem(k);
  }
} catch {}
// The demo has its own storage, so trying it never touches a signed-in library.
const NS = DEMO ? 'putio-audiobooks-demo:' : 'putio-audiobooks:';
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(NS + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); } catch {}
  },
  del(key) { try { localStorage.removeItem(NS + key); } catch {} },
};

const ICONS = {
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>',
  prev: '<path d="M18 6v12l-9-6z" fill="currentColor"/><path d="M6 6v12"/>',
  next: '<path d="M6 6v12l9-6z" fill="currentColor"/><path d="M18 6v12"/>',
  back: '<path d="M4 4v5h5"/><path d="M4.6 9A8.5 8.5 0 1 1 3.5 12"/>',
  fwd: '<path d="M20 4v5h-5"/><path d="M19.4 9A8.5 8.5 0 1 0 20.5 12"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  chapters: '<path d="M12 6h8M12 12h6M12 18h3"/><path d="M4 4h4.5v10l-2.25-2L4 14z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  nyt: '<path d="M21.272,14.815h-0.098c-0.747,2.049-2.335,3.681-4.363,4.483v-4.483l2.444-2.182l-2.444-2.182V7.397 c2.138,0.006,3.885-1.703,3.927-3.84c0-2.629-2.509-3.556-3.927-3.556c-0.367-0.007-0.734,0.033-1.091,0.12v0.131h0.556 c0.801-0.141,1.565,0.394,1.706,1.195C17.99,1.491,17.996,1.537,18,1.583c-0.033,0.789-0.7,1.401-1.488,1.367 c-0.02-0.001-0.041-0.002-0.061-0.004c-2.444,0-5.323-1.985-8.454-1.985C5.547,0.83,3.448,2.692,3.284,5.139 C3.208,6.671,4.258,8.031,5.76,8.346v-0.12C5.301,7.931,5.041,7.407,5.084,6.862c0.074-1.015,0.957-1.779,1.973-1.705 C7.068,5.159,7.08,5.16,7.091,5.161c2.629,0,6.872,2.182,9.501,2.182h0.098v3.142l-2.444,2.182l2.444,2.182v4.549 c-0.978,0.322-2.003,0.481-3.033,0.469c-1.673,0.084-3.318-0.456-4.614-1.516l4.429-1.985V7.451l-6.196,2.727 c0.592-1.75,1.895-3.168,3.589-3.905V6.175c-4.516,1.004-8.138,4.243-8.138,8.705c0,5.193,4.025,9.12,9.818,9.12 c6.011,0,8.727-4.363,8.727-8.814V14.815z M8.858,18.186c-1.363-1.362-2.091-3.235-2.007-5.16c-0.016-0.88,0.109-1.756,0.371-2.596 l2.051-0.938v8.476L8.858,18.186z" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 4v10.5M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  saved: '<path d="M7.5 11l3 3 6-6.5M5 19.5h14"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5z"/><path d="M12 6.5v13"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  file: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/>',
  eyeOff: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M4 4l16 16"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const iconLink = (name, label, href) =>
  h('a', { class: 'icon-btn', href, target: '_blank', rel: 'noopener', 'aria-label': label, title: label, html: icon(name) });
const siteFooter = () => h('footer', { class: 'fine foot' },
  iconLink('github', t('Source on GitHub'), 'https://github.com/ddools/putio-audiobooks'),
  iconLink('nyt', t('NYT audio best sellers'), 'https://www.nytimes.com/books/best-sellers/audio-fiction/'),
  h('a', { class: 'icon-btn', href: 'https://chill.institute', target: '_blank', rel: 'noopener', 'aria-label': 'chill.institute', title: 'chill.institute' },
    h('img', { src: 'icons/chill.png', alt: '', width: 28, height: 28 })),
  langPicker());
// Each language is named in itself, so people can find theirs whatever the page is showing.
const langPicker = () => h('select', { 'aria-label': t('Language'), onchange: (e) => setLang(e.target.value) },
  Object.entries(LANGS).map(([code, name]) => h('option', { value: code, lang: code, selected: code === lang }, name)));
const iconBtn = (name, label, onclick, cls = '') =>
  h('button', { class: 'icon-btn ' + cls, type: 'button', 'aria-label': label, title: label, onclick, html: icon(name) });

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hrs = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return hrs ? `${hrs}:${String(min).padStart(2, '0')}:${s}` : `${min}:${s}`;
}
function fmtLong(sec) {
  const m = Math.round(Math.max(0, sec || 0) / 60);
  const hrs = Math.floor(m / 60);
  const min = m % 60;
  if (hrs) return min ? t('{h}h {m}m', { h: hrs, m: min }) : t('{h}h', { h: hrs });
  return min ? t('{m}m', { m: min }) : t('under a minute');
}
const fmtSize = (bytes) => (bytes > 999e6 ? t('{n} GB', { n: num(+(bytes / 1e9).toFixed(1)) }) : t('{n} MB', { n: Math.ceil(bytes / 1e6) }));

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
}

function sheet(title, build) {
  const dlg = h('dialog', { class: 'sheet' });
  const close = () => dlg.close();
  dlg.append(
    h('div', { class: 'sheet-head' }, h('h3', {}, title), iconBtn('x', t('Close'), close)),
    h('div', { class: 'sheet-body' }, build(close))
  );
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/* ---------- state ---------- */

const settings = Object.assign({ clientId: '', root: null, speed: 1, back: 15, fwd: 30, list: false, sort: 'title', group: false, lockChapters: false, readSize: 19, readSans: false }, store.get('settings', {}));
let library = store.get('library', []);
let positions = store.get('positions', {});
const saveSettings = () => store.set('settings', settings);
const saveLibrary = () => store.set('library', library.map(({ _tried, ...book }) => book));
const savePositions = () => store.set('positions', positions);
// Starred and hidden books, by id. markAt is when each book's marks last changed: the newest change wins across devices.
const marks = { starred: new Set(store.get('starred', [])), hidden: new Set(store.get('hidden', [])) };
const markAt = store.get('markAt', {});
function saveMarks() {
  store.set('starred', [...marks.starred]);
  store.set('hidden', [...marks.hidden]);
  store.set('markAt', markAt);
}
function pushMark(id) {
  api.setConfig('mark_' + id, { s: marks.starred.has(id), h: marks.hidden.has(id), at: markAt[id] }).catch(() => {});
}
function toggleMark(kind, id) {
  if (!marks[kind].delete(id)) marks[kind].add(id);
  markAt[id] = Date.now();
  saveMarks();
  pushMark(id);
  const card = document.activeElement?.closest('[data-book]');
  const at = card && { id: card.dataset.book, strip: !!card.closest('.strip'), i: [...card.querySelectorAll('button')].indexOf(document.activeElement) };
  renderLibrary();
  if (at) $('#shelf')?.querySelectorAll(`${at.strip ? '.strip' : '.grid'} [data-book="${CSS.escape(at.id)}"] button`)[at.i]?.focus();
}

// Reading: where each book was last read ({ c: character offset, at }), EPUBs linked by hand
// ({ id, name, size, at }, or { none: true, at } to drop the one the scan found), and exact spots
// found by speech recognition, as [audio, text] anchors. The first two sync through put.io like positions do.
const reading = store.get('reading', {});
const epubLinks = store.get('epubLinks', {});
const anchors = store.get('anchors', {});
const pushReading = (id) => api.setConfig('read_' + id, reading[id]).catch(() => {});
const pushLink = (id) => api.setConfig('epub_' + id, epubLinks[id]).catch(() => {});
const epubOf = (book) => (epubLinks[book.id] ? (epubLinks[book.id].none ? null : epubLinks[book.id]) : book.epub || null);

const audio = $('#audio');
const app = $('#app');
const landing = $('.connect'); // the landing page from index.html, kept so signing out can show it again
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const redirectUri = location.origin + location.pathname;

function failed(err) {
  if (err?.status === 401) {
    signOut();
    toast(t('put.io signed you out. Connect again.'));
  } else {
    toast(err?.message || t('Something went wrong.'));
  }
}

/* ---------- install ---------- */

let installEvent = null; // Chromium's deferred install prompt. iOS has none, so it gets instructions instead.
const canInstall = () => !(matchMedia('(display-mode: standalone)').matches || navigator.standalone) && (installEvent || isIOS);
async function install() {
  if (!installEvent) return sheet(t('Add to Home Screen'), () => h('p', {}, t('Tap the Share button in your browser, then “Add to Home Screen”.')));
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null; // the browser lets each prompt event be used once
  renderInstall();
}
function renderInstall() {
  const slot = $('#install');
  if (!slot) return;
  if (DEMO) return slot.replaceChildren(h('div', { class: 'setting install' },
    h('div', {}, h('strong', {}, t('Have a put.io account?')), h('small', {}, t('Log in to listen to the audiobooks stored there'))),
    h('a', { class: 'btn primary', href: location.pathname }, t('Log in'))));
  slot.replaceChildren(...(canInstall() && !store.get('installDismissed') ? [h('div', { class: 'setting install' },
    h('div', {}, h('strong', {}, t('Install the app')), h('small', {}, t('Add it to your home screen'))),
    h('span', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: install }, t('Install')),
      iconBtn('x', t('Dismiss'), () => { store.set('installDismissed', true); renderInstall(); })))] : []));
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; renderInstall(); });
addEventListener('appinstalled', () => { installEvent = null; renderInstall(); });

/* ---------- connect ---------- */

function showConnect() {
  document.body.dataset.view = 'connect';
  const clientId = CLIENT_ID || settings.clientId;
  const idInput = h('input', { type: 'text', inputmode: 'numeric', placeholder: t('Client ID'), value: clientId || '', autocomplete: 'off', 'aria-label': t('put.io Client ID') });
  const tokenInput = h('input', { type: 'password', placeholder: t('OAuth token'), autocomplete: 'off', 'aria-label': t('put.io OAuth token') });

  const connect = () => {
    const id = (CLIENT_ID || idInput.value).trim();
    if (!id) { idInput.focus(); return toast(t('Enter your Client ID first.')); }
    settings.clientId = id;
    saveSettings();
    store.set('connecting', true);
    location.href = api.authUrl(id, redirectUri);
  };
  const useToken = async () => {
    const token = tokenInput.value.trim();
    if (!token) return tokenInput.focus();
    api.setToken(token);
    try {
      await api.accountInfo();
      store.set('token', token);
      start();
    } catch (err) {
      api.setToken(null);
      toast(err.status === 401 ? t('put.io rejected that token.') : err.message);
    }
  };

  // The copy lives in index.html; only the controls are built here.
  $('#cta', landing).replaceChildren(
    CLIENT_ID
      ? h('button', { class: 'btn primary', type: 'button', onclick: connect }, t('Connect put.io'))
      : h('div', { class: 'setup' },
          h('ol', { class: 'steps' },
            h('li', {}, t('Create an app at '),
              h('a', { href: 'https://app.put.io/oauth/new', target: '_blank', rel: 'noopener' }, t('put.io → OAuth apps')),
              t('. Use this as the callback URL:'),
              h('button', { class: 'copy', type: 'button', onclick: () => navigator.clipboard?.writeText(redirectUri).then(() => toast(t('Callback URL copied.'))) }, redirectUri)),
            h('li', {}, t('Paste the Client ID it gives you.'))),
          h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); connect(); } },
            idInput, h('button', { class: 'btn primary', type: 'submit' }, t('Connect'))),
          h('details', {},
            h('summary', {}, t('Use an OAuth token instead')),
            h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); useToken(); } },
              tokenInput, h('button', { class: 'btn', type: 'submit' }, t('Use token'))))),
    h('a', { class: 'btn outline', href: '?demo' }, t('No put.io account? Try the demo')));
  $('#landing-foot', landing).replaceChildren(siteFooter());
  app.replaceChildren(landing);
}

function signOut() {
  if (DEMO) return void (location.href = location.pathname);
  stopPlayback();
  store.del('token');
  api.setToken(null);
  showConnect();
}

/* ---------- folder picker ---------- */

async function showFolders(trail = [{ id: 0, name: t('Your files') }]) {
  document.body.dataset.view = 'folders';
  const here = trail[trail.length - 1];
  const listEl = h('div', { class: 'folder-list' }, h('p', { class: 'empty' }, t('Loading…')));
  const choose = () => {
    settings.root = { id: here.id, name: here.name };
    saveSettings();
    library = [];
    saveLibrary();
    showLibrary();
    rescan();
  };
  app.replaceChildren(
    h('header', { class: 'bar' },
      trail.length > 1
        ? iconBtn('left', t('Back'), () => showFolders(trail.slice(0, -1)))
        : settings.root ? iconBtn('x', t('Cancel'), showLibrary) : h('span', { class: 'spacer' }),
      h('div', { class: 'bar-title' }, h('small', {}, t('Where are your audiobooks?')), h('strong', {}, here.name)),
      h('span', { class: 'spacer' })),
    listEl,
    siteFooter(),
    h('footer', { class: 'pick' }, h('button', { class: 'btn primary', type: 'button', onclick: choose }, t('Use “{name}”', { name: here.name })))
  );
  try {
    const { files } = await api.listFiles(here.id);
    const dirs = files.filter((f) => f.file_type === 'FOLDER').sort(byName);
    listEl.replaceChildren(
      ...(dirs.length
        ? dirs.map((d) =>
            h('button', { class: 'folder', type: 'button', onclick: () => showFolders([...trail, { id: d.id, name: d.name }]) },
              h('span', { class: 'folder-icon', html: icon('folder') }), h('span', { class: 'folder-name' }, d.name), h('span', { class: 'chev', html: icon('right') })))
        : [h('p', { class: 'empty' }, t('No folders in here.'))])
    );
  } catch (err) {
    listEl.replaceChildren(h('p', { class: 'empty' }, err.message));
    failed(err);
  }
}

/* ---------- library scan ---------- */

let scanning = false;
let zipped = 0; // archives the last scan passed over
const zippedHint = () => (zipped
  ? h('p', { class: 'fine zipped' }, zipped === 1 ? t('1 zipped file skipped. Extract it on put.io, then rescan.') : t('{n} zipped files skipped. Extract them on put.io, then rescan.', { n: zipped }))
  : null);
async function rescan() {
  if (scanning || !settings.root) return;
  scanning = true;
  const root = settings.root;
  renderLibrary();
  try {
    const archives = [];
    const found = await scan(root, api.listFiles, archives);
    if (settings.root !== root) { scanning = false; return rescan(); } // the folder changed mid-scan
    zipped = archives.length;
    const old = new Map(library.map((b) => [b.id, b]));
    for (const book of found) {
      const prev = old.get(book.id);
      if (prev?.chapters && prev.tracks.length === 1 && prev.tracks[0].id === book.tracks[0].id) {
        Object.assign(book, { chapters: prev.chapters, duration: prev.duration, title: prev.title, author: prev.author });
      }
      if (prev?.art || prev?.art === null) Object.assign(book, { art: prev.art, cover: prev.art });
      if (prev?.sought) book.sought = true;
    }
    found.sort((a, b) => collator.compare(a.title, b.title));
    library = found;
    saveLibrary();
    // An empty scan is more likely a glitch than a cleared-out library; don't delete downloads over it.
    if (found.length) offline.keepOnly(new Set(found.flatMap((b) => [...b.tracks.map((t) => String(t.id)), epubOf(b)?.id].filter(Boolean).map(String)))).catch(() => {});
    if (cur) {
      const same = library.find((b) => b.id === cur.book.id);
      if (same) cur.book = same;
    }
  } catch (err) {
    failed(err);
  }
  scanning = false;
  if (api.hasToken()) renderLibrary();
  seekArt();
}

// After a scan: read the tags of every M4B first, so the cover search runs on real titles.
// Then one automatic cover search for each book put.io has no image for. book.sought marks the attempt,
// hit or miss, so a book is never searched twice; the picker stays for wrong guesses.
let seeking = false;
async function seekArt() {
  if (seeking) return;
  seeking = true;
  let book;
  while (api.hasToken() && navigator.onLine && (book = library.find(wantsTags))) await loadChapters(book);
  while (api.hasToken() && (book = library.find((b) => !b.cover && !b.sought && b.art === undefined))) {
    const { id } = book;
    const term = coverTerm(book);
    let found;
    try { found = term ? await searchCovers(term) : []; }
    catch { break; } // offline, or both searches down: the next scan tries again
    book = library.find((b) => b.id === id); // a rescan may have swapped the object meanwhile
    if (book) {
      book.sought = true;
      if (found[0]) setArt(book, found[0].url);
      else saveLibrary();
    }
    await new Promise((r) => setTimeout(r, 3000)); // Apple's search allows about 20 calls a minute
  }
  seeking = false;
}

// book.art is a cover picked by hand: a URL, or null for "no cover". Unset means put.io's own image.
function setArt(book, art) {
  book = library.find((b) => b.id === book.id) || book; // a rescan may have swapped the object meanwhile
  if (art === undefined) { delete book.art; book.cover = null; rescan(); } // the scan puts put.io's image back
  else Object.assign(book, { art, cover: art });
  saveLibrary();
  renderLibrary();
  if (cur?.book.id === book.id) { refreshPlayer(); updateMediaSession(); }
}

function openCoverPicker(book) {
  const input = h('input', { type: 'search', value: coverTerm(book), 'aria-label': t('Search for a cover') });
  const results = h('div', { class: 'cover-picks' });
  let ticket = 0;
  const search = async () => {
    const mine = ++ticket;
    results.replaceChildren(h('p', { class: 'fine' }, t('Searching…')));
    let found;
    try { found = await searchCovers(input.value.trim()); }
    catch { found = null; }
    if (mine !== ticket) return;
    results.replaceChildren(...(found?.length
      ? found.map((c) => h('button', { type: 'button', title: [c.title, c.by].filter(Boolean).join(' · '), onclick: () => { setArt(book, c.url); dlg.close(); } },
          h('img', { class: 'cover', src: c.thumb, alt: [c.title, c.by].filter(Boolean).join(', '), loading: 'lazy', referrerpolicy: 'no-referrer' }),
          h('small', {}, c.title)))
      : [h('p', { class: 'fine' }, found ? t('Nothing found. Try fewer words, or just the title.') : t('Couldn’t reach the cover search. Try again in a minute.'))]));
  };
  const dlg = sheet(t('Cover art'), (close) => [
    h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); search(); } },
      input, h('button', { class: 'btn', type: 'submit' }, t('Search'))),
    results,
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: () => { setArt(book, null); close(); } }, t('No cover')),
      h('button', { class: 'btn', type: 'button', onclick: () => { setArt(book, undefined); close(); } }, t('Use put.io’s image'))),
  ]);
  search();
}

/* ---------- library view ---------- */

let query = '';
let filter = 'all';
let showHidden = false;

function coverHue(title) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function coverEl(book) {
  const made = h('div', { class: 'cover made', style: `--hue:${coverHue(book.title)}` },
    h('span', { class: 'cover-title' }, book.title), book.author ? h('span', { class: 'cover-author' }, book.author) : null);
  if (!book.cover) return made;
  const img = h('img', { class: 'cover', src: book.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(made));
  return img;
}

function progressLabel(book, withLeft) {
  const p = positions[book.id];
  if (!p) return '';
  if (p.done) return t('Finished');
  if (!(p.p > 0.005)) return '';
  return `${Math.round(p.p * 100)}%` + (withLeft && p.left > 0 ? ` · ${t('{time} left', { time: fmtLong(p.left) })}` : '');
}

// Applied after starred-first; the sort is stable, so ties keep title order.
const SORTS = { title: t('Title'), author: t('Author'), recent: t('Recently played'), added: t('Recently added') };
const sortCmp = {
  title: () => 0,
  author: (a, b) => !a.author - !b.author || collator.compare(a.author, b.author),
  recent: (a, b) => (positions[b.id]?.at || 0) - (positions[a.id]?.at || 0),
  added: (a, b) => (b.added || '') < (a.added || '') ? -1 : (b.added || '') > (a.added || '') ? 1 : 0,
};

// Downloads in progress, by book id.
const downloads = new Map();
function offlineLabel(book) {
  const job = downloads.get(book.id);
  return job ? t('Downloading {n}%', { n: Math.round(job.p * 100) }) : offline.hasBook(book) ? t('Downloaded') : '';
}
async function startDownload(book) {
  if (downloads.has(book.id)) return;
  const job = { p: 0, ctl: new AbortController() };
  downloads.set(book.id, job);
  renderLibrary();
  loadChapters(book); // read them while put.io is in reach
  if (epubOf(book)) epubBlob(epubOf(book)).catch(() => {});
  try {
    await offline.download(book, getUrl, (p) => { if (p - job.p >= 0.02) { job.p = p; refreshCard(library.find((b) => b.id === book.id) || book); } }, job.ctl.signal);
    toast(t('“{title}” is ready to play offline.', { title: book.title }));
  } catch (err) {
    // A cancelled download is thrown away; a failed one keeps its finished tracks so it can resume.
    if (job.ctl.signal.aborted) await offline.remove(book).catch(() => {});
    else toast(err?.name === 'QuotaExceededError' ? t('Not enough space on this device.') : t('Download stopped. Start it again to pick up where it left off.'));
  }
  downloads.delete(book.id);
  renderLibrary();
}
async function removeDownload(book) {
  if (cur?.book.id === book.id) stopPlayback();
  await offline.remove(book).catch(() => {});
  renderLibrary();
}

function bookCard(book, listRow) {
  const p = positions[book.id];
  const starred = marks.starred.has(book.id);
  const hidden = marks.hidden.has(book.id);
  const mark = (name, label, onclick, cls = '') =>
    h('button', { class: 'mark ' + cls, type: 'button', 'aria-label': `${label}: ${book.title}`, title: label, onclick, html: icon(name) });
  const flip = (kind) => () => toggleMark(kind, book.id);
  return h('div', { class: 'book' + (hidden ? ' is-hidden' : ''), 'data-book': book.id },
    h('button', { class: 'book-open', type: 'button', onclick: () => openBook(book, true) },
      coverEl(book),
      epubOf(book) ? h('span', { class: 'has-ebook', title: t('Read along'), html: icon('book') }, h('span', { class: 'sr-only' }, t('Read along'))) : null,
      h('span', { class: 'bar-thin', style: p?.done || p?.p > 0.005 ? '' : 'visibility:hidden' }, h('i', { style: `width:${p ? (p.done ? 100 : p.p * 100) : 0}%` })),
      h('span', { class: 'book-title' }, book.title),
      h('span', { class: 'book-sub' }, [book.author, progressLabel(book, listRow), offlineLabel(book)].filter(Boolean).join(' · '))),
    h('div', { class: 'book-tools' },
      mark('star', starred ? t('Remove star') : t('Star'), flip('starred'), 'mark-star' + (starred ? ' on' : '')),
      mark(hidden ? 'eye' : 'eyeOff', hidden ? t('Show again') : t('Hide'), flip('hidden')),
      // Starts a download in one tap; cancelling or removing one goes through the menu.
      !offline.supported ? null
        : downloads.has(book.id) ? mark('download', offlineLabel(book), () => openBookMenu(book), 'mark-save busy')
        : offline.hasBook(book) ? mark('saved', t('Downloaded'), () => openBookMenu(book), 'mark-save on')
        : mark('download', t('Download'), () => startDownload(book)),
      mark('more', t('More'), () => openBookMenu(book))));
}

// Swap one book's cards in place, so keyboard focus and the strip's scroll survive.
function refreshCard(book) {
  for (const old of $('#shelf')?.querySelectorAll(`[data-book="${CSS.escape(book.id)}"]`) || []) {
    const had = old.contains(document.activeElement);
    const i = [...old.querySelectorAll('button')].indexOf(document.activeElement);
    const fresh = bookCard(book, !!old.closest('.grid.list'));
    old.replaceWith(fresh);
    if (had && i >= 0) fresh.querySelectorAll('button')[i].focus();
  }
}

function showLibrary() {
  document.body.dataset.view = 'library';
  const search = h('input', { type: 'search', placeholder: t('Search your books'), value: query, 'aria-label': t('Search your books') });
  search.addEventListener('input', () => { query = search.value; renderLibrary(); });
  app.replaceChildren(
    h('header', { class: 'bar' },
      h('div', { class: 'wordmark' }, h('img', { src: 'icons/icon.svg', alt: '', width: 28, height: 28 }), 'put.io Audiobooks'),
      h('span', { class: 'spacer grow' }),
      iconBtn(settings.list ? 'grid' : 'list', settings.list ? t('Grid view') : t('List view'),
        () => { settings.list = !settings.list; saveSettings(); showLibrary(); }),
      iconBtn('more', t('Settings'), openSettings)),
    h('label', { class: 'search' }, h('span', { html: icon('search') }), search),
    h('div', { id: 'install' }),
    h('div', { id: 'shelf' }),
    siteFooter()
  );
  renderInstall();
  renderLibrary();
}

function renderLibrary() {
  const shelf = $('#shelf');
  if (!shelf) return;
  if (!library.length) {
    shelf.replaceChildren(scanning
      ? h('p', { class: 'empty' }, t('Looking through “{name}”…', { name: settings.root.name }))
      : h('div', { class: 'empty' },
          h('p', {}, t('No audiobooks found in “{name}”.', { name: settings.root?.name })),
          zippedHint(),
          h('button', { class: 'btn', type: 'button', onclick: () => showFolders() }, t('Pick another folder'))));
    return;
  }
  const q = query.trim().toLowerCase();
  const hiddenCount = library.filter((b) => marks.hidden.has(b.id)).length;
  if (!hiddenCount) showHidden = false;
  const shown = showHidden ? library : library.filter((b) => !marks.hidden.has(b.id));
  const status = (b) => (positions[b.id]?.done ? 'done' : positions[b.id]?.p > 0.005 ? 'going' : 'new');
  const keep = { all: () => true, starred: (b) => marks.starred.has(b.id), saved: offline.hasBook, ebook: (b) => !!epubOf(b) };
  const match = shown.filter((b) => !q || `${b.title} ${b.author}`.toLowerCase().includes(q))
    .filter(keep[filter] || ((b) => status(b) === filter))
    .sort((a, b) => marks.starred.has(b.id) - marks.starred.has(a.id) || sortCmp[settings.sort](a, b));
  const going = q ? [] : shown
    .filter((b) => positions[b.id] && !positions[b.id].done && positions[b.id].p > 0.005)
    .sort((a, b) => positions[b.id].at - positions[a.id].at)
    .slice(0, 6);
  // Native replaceChildren prints null as text, unlike h().
  shelf.replaceChildren(
    ...(going.length ? [h('h2', { class: 'section' }, t('Keep listening')), h('div', { class: 'strip' }, going.map((b) => bookCard(b)))] : []),
    h('h2', { class: 'section' }, q || filter !== 'all' ? t('{n} found', { n: match.length }) : t('All books'),
      scanning ? h('small', {}, ` · ${t('updating…')}`) : h('small', {}, ` · ${shown.length}`),
      hiddenCount ? h('button', { class: 'link', type: 'button', onclick: () => { showHidden = !showHidden; renderLibrary(); } },
        showHidden ? t('Hide hidden') : t('Show all ({n} hidden)', { n: hiddenCount })) : null,
      h('button', { class: 'link', type: 'button', onclick: openSort }, t('Sort: {by}', { by: SORTS[settings.sort] }))),
    h('div', { class: 'filters' }, [['all', t('All')], ['going', t('In progress')], ['new', t('Not started')], ['done', t('Finished')], ['starred', t('Starred')], ...(library.some(epubOf) ? [['ebook', t('Read along')]] : []), ...(offline.supported ? [['saved', t('Downloaded')]] : [])].map(([key, label]) =>
      h('button', { class: key === filter ? 'chip on' : 'chip', type: 'button', 'aria-pressed': String(key === filter), onclick: () => { filter = key; renderLibrary(); } }, label))),
    ...(!match.length ? [h('p', { class: 'empty' }, t('Nothing matches that.'))] : settings.group ? authorGroups(match) : [bookGrid(match)]),
    ...(zipped ? [zippedHint()] : [])
  );
}

const bookGrid = (books) => h('div', { class: settings.list ? 'grid list' : 'grid' }, books.map((b) => bookCard(b, settings.list)));

// Each author's books keep the chosen order; authors go A–Z with unknown last.
function authorGroups(books) {
  const groups = {};
  for (const b of books) (groups[b.author || ''] ||= []).push(b);
  return Object.entries(groups).sort(([a], [b]) => !a - !b || collator.compare(a, b))
    .flatMap(([author, list]) => [h('h3', { class: 'group' }, author || t('Unknown author'), h('small', {}, ` · ${list.length}`)), bookGrid(list)]);
}

function openBookMenu(book) {
  const p = positions[book.id];
  sheet(book.title, (close) => [
    h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Progress')), h('small', {}, progressLabel(book, true) || t('Not started'))),
      h('span', { class: 'row' },
        p?.done ? null : h('button', { class: 'btn', type: 'button', onclick: () => { setProgress(book, true); close(); } }, t('Finished')),
        p?.done || p?.p > 0.005 ? h('button', { class: 'btn', type: 'button', onclick: () => { setProgress(book, false); close(); } }, t('Start over')) : null)),
    h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Cover art')), h('small', {}, t('Search for a different cover'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); openCoverPicker(book); } }, t('Choose'))),
    h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Ebook')), h('small', {}, epubOf(book)?.name || t('Add an EPUB to read along'))),
      h('span', { class: 'row' },
        epubOf(book) ? h('button', { class: 'btn', type: 'button', onclick: () => { close(); openBook(book, false); openPlayer(); openReader(); } }, t('Read')) : null,
        h('button', { class: 'btn', type: 'button', onclick: () => { close(); openEpubPicker(book); } }, epubOf(book) ? t('Change') : t('Choose')))),
    offline.supported ? h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Offline')), h('small', {}, offlineLabel(book) || t('Download to this device · {size}', { size: fmtSize(book.tracks.reduce((n, tr) => n + tr.size, 0)) }))),
      downloads.has(book.id) ? h('button', { class: 'btn', type: 'button', onclick: () => { downloads.get(book.id)?.ctl.abort(); close(); } }, t('Cancel'))
        : offline.hasBook(book) ? h('button', { class: 'btn danger', type: 'button', onclick: () => { removeDownload(book); close(); } }, t('Remove'))
        : h('button', { class: 'btn', type: 'button', onclick: () => { startDownload(book); close(); } }, t('Download'))) : null,
  ]);
}

function openSort() {
  sheet(t('Sort by'), (close) => [
    h('div', { class: 'chips wide' }, Object.entries(SORTS).map(([key, label]) =>
      h('button', { type: 'button', class: key === settings.sort ? 'chip on' : 'chip', onclick: () => { settings.sort = key; saveSettings(); close(); renderLibrary(); } }, label))),
    h('label', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Group by author'))),
      h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: settings.group, onchange: (e) => { settings.group = e.target.checked; saveSettings(); renderLibrary(); } })),
  ]);
}

function openSettings() {
  sheet(t('Settings'), (close) => [
    h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Library folder')), h('small', {}, settings.root?.name || t('Not set'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); showFolders(); } }, t('Change'))),
    h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Rescan')), h('small', {}, t('Pick up new books from put.io'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); rescan(); } }, t('Rescan'))),
    canInstall() ? h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Install the app')), h('small', {}, t('Add it to your home screen'))),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); install(); } }, t('Install'))) : null,
    isIOS ? h('label', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Chapter buttons on lock screen')), h('small', {}, t('Instead of skip back and forward'))),
      h('input', { class: 'switch', type: 'checkbox', role: 'switch', checked: settings.lockChapters, onchange: (e) => { settings.lockChapters = e.target.checked; saveSettings(); setupMediaSession(); } })) : null,
    h('label', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Language'))),
      langPicker()),
    whisper.ready() ? h('div', { class: 'setting' },
      h('div', {}, h('strong', {}, t('Speech model')), h('small', {}, t('Finds the exact spot in ebooks · {size}', { size: fmtSize(whisper.DOWNLOAD) }))),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { whisper.forget(); close(); toast(t('Speech model removed.')); } }, t('Remove'))) : null,
    h('div', { class: 'setting' },
      DEMO
        ? h('div', {}, h('strong', {}, t('Demo')), h('small', {}, t('Sample books. Connect put.io to play your own.')))
        : h('div', {}, h('strong', {}, t('put.io account')), h('small', {}, t('Your place in each book stays saved in put.io'))),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { close(); signOut(); } }, DEMO ? t('Exit demo') : t('Sign out'))),
    h('p', { class: 'fine zipped' }, t('Version {v}', { v: VERSION })),
  ]);
}

/* ---------- playback engine ---------- */

let cur = null;           // { book, ti, started, loaded, retries, list }
let pendingSeek = 0;      // where to land once the track's metadata arrives
let lastGood = 0;         // last known position, for recovering from stream errors
let loadTicket = 0;
let pausedAt = 0;
let sleep = null;         // { mode: 'time', until } | { mode: 'chapter', index }
let scrubbing = false;
let shownChapter = -1;
let warm = null;          // { id, el }: the next file loading quietly, so the hand-off doesn't wait on put.io
let pendingFrac = null;   // like pendingSeek, as a fraction of the track, for a file whose length isn't known yet
function coolDown() {
  if (!warm) return;
  warm.el.removeAttribute('src');
  warm.el.load();
  warm = null;
}

const urlCache = new Map();
const URL_TTL = 20 * 60 * 1000;
const cachedUrl = (id) => {
  const hit = urlCache.get(id);
  return hit && Date.now() - hit.at < URL_TTL ? hit.url : null;
};
async function getUrl(id) {
  const local = offline.has(id) && await offline.localUrl(id);
  if (local) return local;
  const hit = cachedUrl(id);
  if (hit) return hit;
  const url = await api.fileUrl(id);
  urlCache.set(id, { url, at: Date.now() });
  return url;
}

const multi = () => cur.book.tracks.length > 1;
const now = () => (cur?.loaded ? audio.currentTime || 0 : pendingSeek || 0);
const trackDuration = () => (cur?.loaded && Number.isFinite(audio.duration) ? audio.duration : (!multi() && cur.book.duration) || 0);

function chapterList() {
  const book = cur.book;
  if (multi()) return (cur.list?.book === book ? cur.list : cur.list = { book, items: trackTitles(book.tracks.map((t) => t.name)).map((title, track) => ({ title, track })) }).items;
  return book.chapters?.length > 1 ? book.chapters : null;
}
function chapterIndex() {
  if (multi()) return cur.ti;
  const list = chapterList();
  if (!list) return 0;
  const t = now() + 0.25;
  let i = 0;
  while (i + 1 < list.length && list[i + 1].start <= t) i++;
  return i;
}
function bounds() {
  const list = chapterList();
  if (list && !multi()) {
    const c = list[chapterIndex()];
    return [c.start, c.end > c.start ? c.end : trackDuration()];
  }
  return [0, trackDuration()];
}
function bookFraction() {
  const d = trackDuration();
  const part = d ? clamp(now() / d, 0, 1) : 0;
  if (!multi()) return part;
  const tracks = cur.book.tracks;
  const total = tracks.reduce((n, t) => n + t.size, 0) || 1;
  const before = tracks.slice(0, cur.ti).reduce((n, t) => n + t.size, 0);
  return (before + part * tracks[cur.ti].size) / total;
}
function bookSecondsLeft() {
  const d = trackDuration();
  if (!d) return null;
  let left = d - now();
  if (multi()) {
    const tracks = cur.book.tracks;
    const perSecond = tracks[cur.ti].size / d;
    if (!perSecond) return null;
    left += tracks.slice(cur.ti + 1).reduce((n, t) => n + t.size, 0) / perSecond;
  }
  return left / (settings.speed || 1);
}

// A fraction of the whole book as a track and a fraction of that track, the way bookFraction counts.
function trackAt(book, frac) {
  if (book.tracks.length === 1) return { ti: 0, within: clamp(frac, 0, 1) };
  const total = book.tracks.reduce((n, t) => n + t.size, 0) || 1;
  let before = 0;
  for (let ti = 0; ti < book.tracks.length; ti++) {
    const size = book.tracks[ti].size;
    if (frac * total < before + size || ti === book.tracks.length - 1) return { ti, within: clamp((frac * total - before) / (size || 1), 0, 1) };
    before += size;
  }
}
function fracOf(book, ti, within) {
  if (book.tracks.length === 1) return within;
  const total = book.tracks.reduce((n, t) => n + t.size, 0) || 1;
  return (book.tracks.slice(0, ti).reduce((n, t) => n + t.size, 0) + within * book.tracks[ti].size) / total;
}
function seekFraction(frac, autoplay) {
  if (!cur) return;
  const { ti, within } = trackAt(cur.book, frac);
  const play = autoplay ?? (cur.started && !audio.paused);
  if (ti === cur.ti && trackDuration()) {
    if (!cur.started) { pendingSeek = within * trackDuration(); if (play) togglePlay(); else tick(); return; }
    seekTo(within * trackDuration());
    if (play && audio.paused) togglePlay();
    return;
  }
  loadTrack(ti, 0, play);
  pendingFrac = within;
}

function startPos(book) {
  const p = positions[book.id];
  if (!p || p.done) return { t: 0, s: 0 };
  const rewind = Date.now() - p.at > 5 * 60 * 1000 ? 10 : 0;
  return { t: clamp(p.t || 0, 0, book.tracks.length - 1), s: Math.max(0, (p.s || 0) - rewind) };
}

async function loadTrack(ti, time = 0, autoplay = false) {
  const ticket = ++loadTicket;
  const track = cur.book.tracks[ti];
  cur.ti = ti;
  cur.started = true;
  cur.loaded = false;
  pendingSeek = time;
  pendingFrac = null;
  lastGood = time;
  shownChapter = -1;
  if (autoplay) lockState('playing');
  refreshPlayer();

  let url = !offline.has(track.id) && cachedUrl(track.id);
  if (!url) {
    try { url = await getUrl(track.id); }
    catch (err) { if (ticket === loadTicket) { lockState('paused'); failed(err); } return; }
    if (ticket !== loadTicket) return;
  }
  audio.defaultPlaybackRate = settings.speed;
  audio.src = time > 1 ? `${url}#t=${Math.floor(time)}` : url;
  audio.playbackRate = settings.speed;
  coolDown();
  if (autoplay) audio.play().catch(() => { if (ticket === loadTicket) lockState('paused'); });
}

function openBook(book, autoplay) {
  if (cur?.book.id === book.id) {
    openPlayer();
    if (autoplay && audio.paused) togglePlay();
    return;
  }
  if (cur) { savePosition(true); audio.pause(); }
  const pos = startPos(book);
  cur = { book, ti: pos.t, started: false, loaded: false, retries: 0 };
  pendingSeek = pos.s;
  shownChapter = -1;
  store.set('last', book.id);
  loadChapters(book);
  if (autoplay) {
    loadTrack(pos.t, pos.s, true);
    openPlayer();
  } else {
    audio.removeAttribute('src');
    getUrl(book.tracks[pos.t].id).catch(() => {});
    refreshPlayer();
  }
}

function stopPlayback() {
  if (cur) savePosition(true);
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  coolDown();
  hideReader();
  cur = null;
  closePlayer();
  refreshPlayer();
}

function togglePlay() {
  if (!cur) return;
  if (!cur.started) {
    loadTrack(cur.ti, pendingSeek, true); // not startPos: a chapter picked before the first play must stick
  } else if (audio.ended && positions[cur.book.id]?.done) {
    loadTrack(0, 0, true); // finished: start the book again
  } else if (audio.paused) {
    if (cur.loaded && pausedAt && Date.now() - pausedAt > 5 * 60 * 1000) audio.currentTime = Math.max(0, audio.currentTime - 10);
    audio.play().catch(() => toast(t('Tap play again to start.')));
  } else {
    audio.pause();
  }
}

function seekTo(time) {
  if (!cur) return;
  if (!cur.loaded) { pendingSeek = Math.max(0, time); if (cur.started) loadTrack(cur.ti, pendingSeek, !audio.paused); tick(); return; }
  const d = trackDuration();
  audio.currentTime = clamp(time, 0, d ? d - 0.25 : time);
  tick();
}
function skip(delta) {
  if (!cur) return;
  const target = now() + delta;
  const d = trackDuration();
  if (multi() && d && target >= d && cur.ti + 1 < cur.book.tracks.length) return loadTrack(cur.ti + 1, 0, !audio.paused);
  seekTo(target);
}
function gotoChapter(i) {
  const list = chapterList();
  if (!cur || !list) return;
  i = clamp(i, 0, list.length - 1);
  if (multi() && i === cur.ti && cur.loaded) seekTo(0);
  else if (multi()) loadTrack(i, 0, cur.started ? !audio.paused : false);
  else seekTo(list[i].start);
  if (sleep?.mode === 'chapter') sleep.index = i;
}
function prevChapter() {
  if (!cur) return;
  if (!chapterList()) return seekTo(0);
  const [start] = bounds();
  const i = chapterIndex();
  gotoChapter(now() - start > 4 || i === 0 ? i : i - 1);
}
function nextChapter() {
  const list = cur && chapterList();
  if (list && chapterIndex() + 1 < list.length) gotoChapter(chapterIndex() + 1);
}

function setSpeed(value) {
  settings.speed = clamp(Math.round(value * 20) / 20, 0.5, 3.5);
  saveSettings();
  audio.defaultPlaybackRate = settings.speed;
  audio.playbackRate = settings.speed;
  tick();
}

function setSleep(next) {
  sleep = next;
  tick();
}

/* ---------- M4B chapters ---------- */

const wantsTags = (book) => book.tracks.length === 1 && /\.(m4b|m4a)$/i.test(book.tracks[0].name) && !book.chapters && !book._tried;
async function loadChapters(book) {
  const file = book.tracks[0];
  if (!wantsTags(book)) return;
  book._tried = true;
  try {
    const info = await parseM4b(httpReader(await getUrl(file.id), file.size));
    book = library.find((b) => b.id === book.id) || book; // a rescan may have swapped the object meanwhile
    book.chapters = info.chapters;
    book.duration = info.duration;
    if (info.tags.album || info.tags.title) book.title = info.tags.album || info.tags.title;
    if (info.tags.artist || info.tags.albumArtist) book.author = info.tags.artist || info.tags.albumArtist;
    saveLibrary();
    renderLibrary();
    if (cur?.book.id === book.id) { shownChapter = -1; refreshPlayer(); }
    if (rd.open && ebook && cur?.book.id === book.id) rd.map = textMap(cur.book); // the chapters line the text up better
  } catch (err) {
    console.warn('Could not read chapters for', book.title, err);
  }
}

/* ---------- positions and marks: local, plus put.io config for other devices ---------- */

let lastSave = 0;
let lastPush = 0;

function savePosition(force) {
  if (!cur || !cur.loaded) return;
  if (audio.ended && positions[cur.book.id]?.done) return; // finished stays finished
  const t = Date.now();
  if (!force && t - lastSave < 5000) return;
  lastSave = t;
  positions[cur.book.id] = { t: cur.ti, s: Math.floor(audio.currentTime), at: t, p: +bookFraction().toFixed(4) };
  const left = bookSecondsLeft();
  if (left != null) positions[cur.book.id].left = Math.round(left * settings.speed);
  savePositions();
  if (force || t - lastPush > 30000) pushPosition(cur.book.id);
}
function pushPosition(bookId) {
  lastPush = Date.now();
  api.setConfig('pos_' + bookId, positions[bookId]).catch(() => {});
}
// Set by hand from the book menu. A reset is stored, not deleted, so it wins over other devices.
function setProgress(book, done) {
  if (cur?.book.id === book.id) stopPlayback();
  positions[book.id] = { t: 0, s: 0, at: Date.now(), p: done ? 1 : 0, ...(done && { done: true }) };
  savePositions();
  pushPosition(book.id);
  renderLibrary();
}
async function pullPositions() {
  if (!api.hasToken()) return;
  let remote;
  try { remote = await api.getConfig(); } catch { return; }
  let changed = false;
  let marked = false;
  let read = false;
  for (const [key, value] of Object.entries(remote)) {
    if (!value || typeof value.at !== 'number') continue;
    if (key.startsWith('mark_')) {
      const id = key.slice(5);
      if (markAt[id] >= value.at) continue;
      marks.starred[value.s ? 'add' : 'delete'](id);
      marks.hidden[value.h ? 'add' : 'delete'](id);
      markAt[id] = value.at;
      marked = true;
      continue;
    }
    if (key.startsWith('read_') || key.startsWith('epub_')) {
      const [list, id] = key.startsWith('read_') ? [reading, key.slice(5)] : [epubLinks, key.slice(5)];
      if (list[id]?.at >= value.at) continue;
      list[id] = value;
      read = true;
      continue;
    }
    if (!key.startsWith('pos_')) continue;
    const id = key.slice(4);
    if (positions[id] && positions[id].at >= value.at) continue;
    if (cur?.book.id === id && !audio.paused) continue;
    positions[id] = value;
    changed = true;
    if (cur?.book.id === id) {
      const pos = startPos(cur.book);
      if (cur.started) loadTrack(pos.t, pos.s, false);
      else { cur.ti = pos.t; pendingSeek = pos.s; refreshPlayer(); }
    }
  }
  // Marks made before they synced have no time yet. Stamp them now that put.io's own have been applied.
  for (const id of new Set([...marks.starred, ...marks.hidden])) {
    if (markAt[id]) continue;
    markAt[id] = Date.now();
    marked = true;
  }
  // Whatever put.io lacks or holds an older copy of goes up now: sends that failed offline are not retried elsewhere.
  for (const [id, p] of Object.entries(positions)) if (!(remote['pos_' + id]?.at >= p.at)) pushPosition(id);
  for (const id of Object.keys(markAt)) if (!(remote['mark_' + id]?.at >= markAt[id])) pushMark(id);
  for (const [id, r] of Object.entries(reading)) if (!(remote['read_' + id]?.at >= r.at)) pushReading(id);
  for (const [id, l] of Object.entries(epubLinks)) if (!(remote['epub_' + id]?.at >= l.at)) pushLink(id);
  if (marked) saveMarks();
  if (changed) savePositions();
  if (read) { store.set('reading', reading); store.set('epubLinks', epubLinks); refreshPlayer(); }
  if (changed || marked) renderLibrary();
}

/* ---------- player UI ---------- */

const ui = {};
const skipBtn = (dir, secs, onclick) =>
  h('button', { class: 'skip', type: 'button', 'aria-label': dir === 'back' ? t('Back {n} seconds', { n: secs }) : t('Forward {n} seconds', { n: secs }), onclick },
    h('span', { html: icon(dir) }), h('b', {}, String(secs)));

function buildPlayer() {
  const player = $('#player');
  ui.range = h('input', { type: 'range', min: 0, max: 1000, value: 0, step: 1, 'aria-label': t('Position in chapter') });
  ui.range.addEventListener('input', () => { scrubbing = true; tick(); });
  ui.range.addEventListener('change', () => {
    const [a, b] = bounds();
    scrubbing = false;
    seekTo(a + (ui.range.value / 1000) * (b - a));
  });
  player.append(
    h('header', { class: 'p-top' },
      iconBtn('down', t('Close player'), closePlayer),
      ui.bookText = h('span', { class: 'p-left' }),
      iconBtn('chapters', t('Chapters'), openChapters)),
    ui.cover = h('div', { class: 'p-cover' }),
    h('div', { class: 'p-meta' }, ui.title = h('h2'), ui.author = h('p'),
      ui.readHint = h('button', { class: 'read-hint', type: 'button', hidden: true, onclick: () => listenFromText(reading[cur.book.id].c) }, t('Listen from where you read'))),
    ui.chapter = h('button', { class: 'p-chapter', type: 'button', onclick: openChapters }),
    h('div', { class: 'p-scrub' }, ui.range, h('div', { class: 'p-times' }, ui.elapsed = h('span'), ui.remain = h('span'))),
    h('div', { class: 'p-controls' },
      iconBtn('prev', t('Previous chapter'), prevChapter),
      skipBtn('back', settings.back, () => skip(-settings.back)),
      ui.play = h('button', { class: 'play', type: 'button', 'aria-label': t('Play'), onclick: togglePlay }),
      skipBtn('fwd', settings.fwd, () => skip(settings.fwd)),
      iconBtn('next', t('Next chapter'), nextChapter)),
    h('div', { class: 'p-tools' },
      ui.speed = h('button', { class: 'tool', type: 'button', onclick: openSpeed }, ui.speedValue = h('b'), h('small', {}, t('Speed'))),
      ui.sleep = h('button', { class: 'tool', type: 'button', onclick: openSleep }, h('b', { html: icon('moon') }), ui.sleepValue = h('small')),
      ui.read = h('button', { class: 'tool', type: 'button', hidden: true, onclick: openReader }, h('b', { html: icon('book') }), h('small', {}, t('Read'))))
  );

  const mini = $('#mini');
  mini.append(
    ui.miniBar = h('div', { class: 'bar-thin' }, h('i')),
    h('button', { class: 'mini-open', type: 'button', 'aria-label': t('Open player'), onclick: openPlayer },
      ui.miniCover = h('span', { class: 'mini-cover' }),
      h('span', { class: 'mini-text' }, ui.miniTitle = h('strong'), ui.miniSub = h('small'))),
    ui.miniPlay = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('Play'), onclick: togglePlay })
  );
}

const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

// Things that change when the book or chapter changes.
function refreshPlayer() {
  const mini = $('#mini');
  mini.hidden = !cur;
  document.body.classList.toggle('has-mini', !!cur);
  if (!cur) return;
  const book = cur.book;
  if (ui.shownBook !== book.id || ui.shownCover !== book.cover) {
    ui.shownBook = book.id;
    ui.shownCover = book.cover;
    ui.cover.replaceChildren(coverEl(book));
    ui.miniCover.replaceChildren(coverEl(book));
  }
  ui.title.textContent = book.title;
  ui.author.textContent = book.author || '';
  ui.miniTitle.textContent = book.title;
  ui.read.hidden = !epubOf(book);
  tick();
}

// Things that change as the audio plays.
function tick() {
  if (!cur) return;
  const time = now();
  if (cur.loaded) lastGood = time;
  const list = chapterList();
  const idx = chapterIndex();

  if (idx !== shownChapter) {
    shownChapter = idx;
    const label = list ? list[idx].title : t('No chapters');
    ui.chapter.replaceChildren(h('span', {}, label), ...(list ? [h('small', {}, t('{n} of {total}', { n: idx + 1, total: list.length }))] : []));
    ui.chapter.disabled = !list;
    ui.miniSub.textContent = list ? label : cur.book.author || '';
    updateMediaSession();
    updatePositionState();
  }

  const [a, b] = bounds();
  const span = Math.max(0, b - a);
  let rel = clamp(time - a, 0, span || Infinity);
  if (scrubbing) rel = (ui.range.value / 1000) * span;
  else ui.range.value = span ? Math.round((rel / span) * 1000) : 0;
  ui.range.style.setProperty('--fill', `${ui.range.value / 10}%`);
  setText(ui.elapsed, fmt(rel));
  setText(ui.remain, span ? `-${fmt(span - rel)}` : '');

  const frac = bookFraction();
  const left = bookSecondsLeft();
  ui.miniBar.firstChild.style.width = `${frac * 100}%`;
  setText(ui.bookText, left == null ? '' : `${Math.round(frac * 100)}% · ${multi() ? t('About {time} left', { time: fmtLong(left) }) : t('{time} left', { time: fmtLong(left) })}`);

  const playing = !audio.paused && cur.started;
  if (ui.playing !== playing) {
    ui.playing = playing;
    for (const b of [ui.play, ui.miniPlay]) {
      b.innerHTML = icon(playing ? 'pause' : 'play');
      b.setAttribute('aria-label', playing ? t('Pause') : t('Play'));
    }
  }
  setText(ui.speedValue, `${num(settings.speed, 1)}×`);
  // Read further than listened, on this device or another: offer to carry on from there.
  ui.readHint.hidden = !epubOf(cur.book) || !(reading[cur.book.id]?.at > (positions[cur.book.id]?.at || 0));

  let sleepLabel = '';
  if (sleep?.mode === 'time') {
    const ms = sleep.until - Date.now();
    if (ms <= 0) { sleep = null; audio.pause(); }
    else sleepLabel = ms > 90000 ? t('{n} min', { n: Math.round(ms / 60000) }) : fmt(ms / 1000);
  } else if (sleep?.mode === 'chapter') {
    sleepLabel = t('End of chapter');
    if (!multi() && idx > sleep.index) { sleep = null; audio.pause(); sleepLabel = ''; }
  }
  setText(ui.sleepValue, sleepLabel || t('Sleep timer'));
  ui.sleep.classList.toggle('on', !!sleep);

  if (playing) savePosition(false);
  readerTick();

  // Line up the next file early so the hand-off works with the screen locked and starts without a stall.
  const d = trackDuration();
  const next = multi() && cur.book.tracks[cur.ti + 1];
  if (next && d && d - time < 120 && warm?.id !== next.id) {
    const w = warm = { id: next.id, el: new Audio() };
    w.el.muted = true;
    w.el.preload = 'auto';
    getUrl(next.id).then((url) => { if (warm === w) w.el.src = url; }).catch(() => { if (warm === w) warm = null; });
  }
}

function openPlayer() {
  if (!cur) return;
  const player = $('#player');
  if (document.body.classList.contains('player-open')) return;
  player.hidden = false;
  player.inert = false;
  requestAnimationFrame(() => document.body.classList.add('player-open'));
  history.pushState({ player: true }, '');
}
function hidePlayer() {
  document.body.classList.remove('player-open');
  $('#player').inert = true;
}
function closePlayer() {
  if (history.state?.player) history.back();
  else hidePlayer();
}
addEventListener('popstate', (e) => {
  if (!e.state?.reader) hideReader();
  if (!e.state?.player && !e.state?.reader) hidePlayer();
});

function openChapters() {
  const list = cur && chapterList();
  if (!list) return;
  const current = chapterIndex();
  const dlg = sheet(t('Chapters'), (close) =>
    h('ol', { class: 'chapters' }, list.map((c, i) =>
      h('li', {}, h('button', { type: 'button', class: i === current ? 'current' : '', onclick: () => { gotoChapter(i); close(); } },
        h('span', { class: 'num' }, i === current ? h('span', { html: icon('play') }) : String(i + 1)),
        h('span', { class: 'name' }, c.title),
        c.start != null ? h('span', { class: 'at' }, fmt(c.start)) : null)))));
  $('.current', dlg)?.scrollIntoView({ block: 'center' });
}

function openSpeed() {
  sheet(t('Speed'), () => {
    const value = h('output', {}, '');
    const presets = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2, 2.5, 3];
    const chips = h('div', { class: 'chips' });
    const paint = () => {
      value.textContent = `${num(settings.speed, 2)}×`;
      chips.replaceChildren(...presets.map((p) =>
        h('button', { type: 'button', class: Math.abs(p - settings.speed) < 0.001 ? 'chip on' : 'chip', onclick: () => { setSpeed(p); paint(); } }, `${num(p)}×`)));
    };
    paint();
    return [
      h('div', { class: 'stepper' },
        h('button', { class: 'btn', type: 'button', 'aria-label': t('Slower'), onclick: () => { setSpeed(settings.speed - 0.05); paint(); } }, '−'),
        value,
        h('button', { class: 'btn', type: 'button', 'aria-label': t('Faster'), onclick: () => { setSpeed(settings.speed + 0.05); paint(); } }, '+')),
      chips,
    ];
  });
}

function openSleep() {
  sheet(t('Sleep timer'), (close) => {
    const pick = (next) => () => { setSleep(next); close(); };
    const options = [5, 10, 15, 30, 45, 60].map((m) =>
      h('button', { class: 'chip', type: 'button', onclick: pick({ mode: 'time', until: Date.now() + m * 60000 }) }, t('{n} min', { n: m })));
    return [
      h('div', { class: 'chips' }, options),
      h('div', { class: 'chips wide' },
        h('button', { class: sleep?.mode === 'chapter' ? 'chip on' : 'chip', type: 'button', onclick: pick({ mode: 'chapter', index: chapterIndex() }) }, t('End of this chapter')),
        sleep ? h('button', { class: 'chip', type: 'button', onclick: pick(null) }, t('Turn off')) : null),
    ];
  });
}

/* ---------- reader ---------- */

// The open EPUB: { id (put.io file id), data (from parseEpub), index (its words, built on the first snap) }.
let ebook = null;
// The reader's state. following: the text keeps up with the audio. picked: a tapped paragraph. flat: [{ pos, el }] in order.
const rd = { open: false, following: false, picked: null, now: null, busy: '', flat: [], map: null, lastTick: 0, saveTimer: 0 };

// The EPUB's bytes, kept on the device after the first fetch so it opens again without put.io.
async function epubBlob(file) {
  const kept = offline.has(file.id) && await offline.blob(file.id);
  if (kept) return kept;
  const res = await fetch(await getUrl(file.id));
  if (!res.ok) throw new Error(t('put.io returned {status}', { status: res.status }));
  const blob = await res.blob();
  await offline.save(file.id, blob, 'application/epub+zip').catch(() => {});
  return blob;
}
async function loadEbook(book) {
  const file = epubOf(book);
  if (!file) return null;
  if (ebook?.id === file.id) return ebook;
  const data = await parseEpub(new Uint8Array(await (await epubBlob(file)).arrayBuffer()));
  ebook = { id: file.id, data, index: null };
  return ebook;
}

// The book's chapters as fractions of the whole, for lining up with the EPUB's table of contents.
function audioChapters(book) {
  if (book.tracks.length > 1) {
    const titles = trackTitles(book.tracks.map((tr) => tr.name));
    return book.tracks.map((tr, ti) => ({ title: titles[ti], a: fracOf(book, ti, 0) }));
  }
  const d = book.duration || (cur?.book === book ? trackDuration() : 0);
  return d && book.chapters?.length > 1 ? book.chapters.map((c) => ({ title: c.title, a: c.start / d })) : [];
}
function textMap(book) {
  const { text, toc } = ebook.data;
  const { anchors: chapters, body } = matchChapters(audioChapters(book), toc, text.length);
  return makeMap({ learned: anchors[book.id] || [], chapters, body, length: text.length });
}

// Listens to about 24 seconds of audio at `frac` and finds those words in the text, then keeps the
// match as anchors, so this spot and the ones near it line up from now on. before: the clip ends at
// frac (what was just heard) instead of being centred on it. Resolves to whether it found them.
const CLIP = 24;
async function snap(book, frac, before, onProgress) {
  const { ti, within } = trackAt(book, frac);
  const track = book.tracks[ti];
  const local = offline.has(track.id) && await offline.blob(track.id);
  const reader = local ? blobReader(local) : httpReader(await getUrl(track.id), track.size);
  const clip = await audioClip(reader, track.name, (d) => within * d - (before ? CLIP : CLIP / 2), CLIP);
  const pcm = await whisper.pcm16k(clip.data, CLIP);
  const heard = timedWords(await whisper.transcribe(pcm, ebook.data.lang, onProgress), clip.start, pcm.length / 16000);
  ebook.index ||= wordIndex(ebook.data.text);
  const hit = locate(ebook.index, heard, wordAt(ebook.index, textMap(book).toText(frac)));
  if (!hit) return false;
  const total = book.tracks.reduce((n, tr) => n + tr.size, 0) || 1;
  const bookSecs = clip.duration / (book.tracks.length > 1 ? track.size / total : 1);
  const at = (q, w) => [fracOf(book, ti, clamp(heard[q].t / clip.duration, 0, 1)), ebook.index.starts[w]];
  let list = learn(anchors[book.id] || [], at(hit.qStart, hit.start), 3 / bookSecs);
  if (hit.end - hit.start > 3) list = learn(list, at(hit.qEnd, hit.end), 3 / bookSecs);
  anchors[book.id] = list;
  store.set('anchors', anchors);
  return true;
}

// The first time, ask before the speech model downloads.
function askForModel() {
  if (whisper.ready()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let yes = false;
    const dlg = sheet(t('Find the exact spot'), (close) => [
      h('p', {}, t('This listens to a few seconds of the book on this device and finds them in the text. It needs a one-time download of a speech model ({size}). The audio never leaves this device.', { size: fmtSize(whisper.DOWNLOAD) })),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { yes = true; close(); } }, t('Download')),
        h('button', { class: 'btn', type: 'button', onclick: close }, t('Not now'))),
    ]);
    dlg.addEventListener('close', () => resolve(yes));
  });
}

// Runs a snap with its progress in the reader's bar. Resolves to whether it found the spot.
async function findExact(frac, before, asked) {
  if (!cur || !ebook || rd.busy || !whisper.supported) return false;
  if (!whisper.ready() && !(asked && await askForModel())) return false;
  const book = cur.book;
  const progress = (p) => setBusy(p < 1 ? t('Downloading speech model {n}%', { n: Math.round(p * 100) }) : t('Finding the exact spot…'));
  setBusy(t('Finding the exact spot…'));
  if (!rd.open) toast(t('Finding the exact spot…'));
  let found = false;
  try {
    await whisper.prepare(progress);
    setBusy(t('Finding the exact spot…'));
    found = await snap(book, frac, before, progress);
    if (!found && asked) toast(t('Couldn’t find these words in the book. Is it the same edition?'));
  } catch (err) {
    console.warn('Exact spot failed', err);
    if (asked) toast(/Unsupported|Not an MP3/.test(err?.message) ? t('The exact spot isn’t available for this audio format.') : t('Couldn’t find the exact spot. Try again in a moment.'));
  }
  setBusy('');
  if (found && cur?.book === book) rd.map = textMap(book);
  return found;
}
function setBusy(text) {
  rd.busy = text;
  renderBar();
}

function blockEl(b) {
  const el = h(b.tag === 'li' ? 'p' : b.tag === 'q' ? 'blockquote' : b.tag, { 'data-pos': b.pos, class: b.tag === 'li' ? 'li' : null });
  for (const [text, style] of b.runs) {
    text.split('\n').forEach((part, i) => {
      if (i) el.append(h('br'));
      if (!part) return;
      const node = document.createTextNode(part);
      el.append(style === 'i' ? h('em', {}, node) : style === 'b' ? h('strong', {}, node) : style === 'bi' ? h('strong', {}, h('em', {}, node)) : node);
    });
  }
  rd.flat.push({ pos: b.pos, el });
  return el;
}
const blockIndex = (pos) => {
  let lo = 0, hi = rd.flat.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (rd.flat[mid].pos <= pos) lo = mid; else hi = mid - 1; }
  return lo;
};
// The first paragraph showing at the top of the reader.
function topPos() {
  const top = rd.scroll.getBoundingClientRect().top + 8;
  let lo = 0, hi = rd.flat.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rd.flat[mid].el.getBoundingClientRect().bottom < top) lo = mid + 1; else hi = mid; }
  return rd.flat[lo]?.pos ?? 0;
}
// The audio's paragraph goes in the middle of the screen; a place to read from (top) at the top.
function showPos(pos, smooth, top) {
  const el = rd.flat[blockIndex(pos)]?.el;
  if (!el) return;
  const block = top ? 'start' : 'center';
  el.scrollIntoView({ block, behavior: smooth ? 'smooth' : 'auto' });
  // Sections off screen are laid out at a guessed height; once they're real, the first jump can be off.
  if (!smooth) requestAnimationFrame(() => el.scrollIntoView({ block }));
}
function markNow(pos) {
  const el = pos == null ? null : rd.flat[blockIndex(pos)]?.el;
  if (el === rd.now) return false;
  rd.now?.classList.remove('now');
  rd.now = el;
  el?.classList.add('now');
  return true;
}
const sectionAt = (pos) => ebook?.data.sections.findLast((sec) => sec.pos <= pos);

function buildReader() {
  const el = $('#reader');
  rd.text = h('article', { class: 'r-text' });
  rd.scroll = h('div', { class: 'r-scroll' }, rd.text);
  rd.title = h('strong');
  rd.sub = h('small');
  rd.bar = h('footer', { class: 'r-bar' });
  rd.play = h('button', { class: 'play', type: 'button', 'aria-label': t('Play'), onclick: readerPlay });
  el.append(
    h('header', { class: 'r-top' },
      iconBtn('down', t('Close reader'), closeReader),
      h('div', { class: 'r-title' }, rd.title, rd.sub),
      iconBtn('chapters', t('Contents'), openToc),
      h('button', { class: 'icon-btn r-aa', type: 'button', 'aria-label': t('Text size'), title: t('Text size'), onclick: openTextSize }, 'Aa')),
    rd.scroll,
    rd.bar);
  // Any scroll of the reader's own counts as reading; the ones that follow the audio come from code.
  const mine = () => { rd.userAt = Date.now(); if (rd.following) { rd.following = false; renderBar(); } };
  for (const ev of ['wheel', 'touchmove', 'keydown']) rd.scroll.addEventListener(ev, mine, { passive: true });
  rd.scroll.addEventListener('scroll', () => {
    if (Date.now() - (rd.userAt || 0) > 1500) return;
    clearTimeout(rd.saveTimer);
    rd.saveTimer = setTimeout(() => { saveReading(false); renderBar(); }, 500);
  }, { passive: true });
  rd.text.addEventListener('click', (e) => {
    if (getSelection()?.toString()) return;
    const p = e.target.closest('[data-pos]');
    rd.picked?.classList.remove('picked');
    rd.picked = p && p !== rd.picked ? p : null;
    rd.picked?.classList.add('picked');
    renderBar();
  });
  el.inert = true;
}
function applyTextSize() {
  rd.text.style.setProperty('--size', `${settings.readSize}px`);
  rd.text.classList.toggle('sans', settings.readSans);
}

function renderBar() {
  if (!rd.open) return;
  const pos = rd.picked ? +rd.picked.dataset.pos : rd.following && rd.map ? rd.map.toText(bookFraction()) : rd.flat.length ? topPos() : 0;
  const sec = sectionAt(pos);
  setText(rd.title, cur?.book.title || '');
  setText(rd.sub, sec?.title || '');
  const len = ebook?.data.text.length || 1;
  let status, action;
  if (rd.busy) status = [rd.busy, ''];
  else if (rd.picked) {
    status = [t('Start the audio here?'), ''];
    action = h('button', { class: 'btn primary', type: 'button', onclick: () => listenFromText(+rd.picked.dataset.pos) }, t('Listen from here'));
  } else if (rd.following) {
    status = [t('Following the audio'), whisper.ready() ? '' : t('Spot estimated from chapters')];
    action = whisper.supported ? iconBtn('target', t('Find the exact spot'), () => audioToText(true)) : null;
  } else {
    status = [t('Reading · {n}%', { n: Math.round((pos / len) * 100) }), t('Tap a paragraph to listen from there')];
    action = h('button', { class: 'btn', type: 'button', onclick: () => audioToText(false) }, t('Back to the audio'));
  }
  rd.bar.replaceChildren(rd.play, h('div', { class: 'r-status' }, h('strong', {}, status[0]), status[1] ? h('small', {}, status[1]) : ''), ...(action ? [action] : []));
}

// Shows the audio's spot in the text: an estimate at once, then the exact spot if the model is here (or, asked, after the download).
async function audioToText(asked) {
  if (!cur || !ebook) return;
  rd.following = true;
  rd.picked?.classList.remove('picked');
  rd.picked = null;
  rd.map = textMap(cur.book);
  const go = () => { const c = rd.map.toText(bookFraction()); markNow(c); showPos(c, false); renderBar(); };
  go();
  const before = Date.now();
  if ((asked || whisper.ready()) && await findExact(bookFraction(), true, asked) && rd.open && (rd.following || (rd.userAt || 0) < before)) {
    rd.following = true;
    go();
  }
}

// Moves the audio to the text at character c: through the map, then the exact spot when the model is here.
async function listenFromText(c) {
  if (!cur) return;
  const book = cur.book;
  try { await loadEbook(book); } catch (err) { return failed(err); }
  rd.picked?.classList.remove('picked');
  rd.picked = null;
  let frac = textMap(book).toAudio(c);
  if (whisper.ready() && await findExact(frac, false, false)) frac = textMap(book).toAudio(c);
  if (cur?.book !== book) return;
  seekFraction(frac, true);
  reading[book.id] = { c, at: (positions[book.id]?.at || 0) - 1 }; // listening is now the newer of the two
  store.set('reading', reading);
  ui.readHint.hidden = true;
  if (rd.open) { rd.following = true; rd.map = textMap(book); markNow(c); showPos(c, true); renderBar(); }
}

function readerPlay() {
  if (!cur) return;
  const wasPaused = audio.paused || !cur.started;
  togglePlay();
  if (wasPaused && !rd.following) audioToText(false);
}

function readerTick() {
  if (!rd.open || !cur) return;
  const playing = !audio.paused && cur.started;
  if (rd.playing !== playing) {
    rd.playing = playing;
    rd.play.innerHTML = icon(playing ? 'pause' : 'play');
    rd.play.setAttribute('aria-label', playing ? t('Pause') : t('Play'));
  }
  if (!rd.map || !rd.following || Date.now() - rd.lastTick < 500) return;
  rd.lastTick = Date.now();
  const c = rd.map.toText(bookFraction());
  if (markNow(c)) { showPos(c, true); renderBar(); }
}

function saveReading(push) {
  if (!cur || !ebook || !rd.flat.length || rd.following) return;
  const id = cur.book.id;
  reading[id] = { c: topPos(), at: Date.now() };
  store.set('reading', reading);
  const now = Date.now();
  if (push || now - (rd.pushedAt || 0) > 30000) { rd.pushedAt = now; pushReading(id); }
}

async function openReader() {
  if (!cur || !epubOf(cur.book) || rd.open) return;
  const book = cur.book;
  const el = $('#reader');
  rd.open = true;
  rd.following = false;
  rd.picked = null;
  rd.now = null;
  rd.map = null;
  rd.flat = [];
  applyTextSize();
  rd.text.replaceChildren(h('p', { class: 'r-note' }, t('Opening the book…')));
  el.hidden = false;
  el.inert = false;
  requestAnimationFrame(() => document.body.classList.add('reader-open'));
  history.pushState({ reader: true }, '');
  renderBar();
  readerTick();
  try { await loadEbook(book); }
  catch (err) {
    console.warn('Could not open the EPUB', err);
    rd.text.replaceChildren(h('p', { class: 'r-note' }, t('Couldn’t open this EPUB. It may be protected by DRM, or not an EPUB at all.')));
    return;
  }
  if (!rd.open || cur?.book !== book) return;
  rd.text.replaceChildren(...ebook.data.sections.map((sec) => h('section', {}, sec.blocks.map(blockEl))));
  rd.map = textMap(book);
  // Whichever happened last, listening or reading, is where the book opens.
  const r = reading[book.id];
  if (r && r.at > (positions[book.id]?.at || 0)) {
    showPos(r.c, false, true);
    renderBar();
  } else audioToText(false);
}
function hideReader() {
  if (!rd.open) return;
  saveReading(true);
  rd.open = false;
  document.body.classList.remove('reader-open');
  $('#reader').inert = true;
  refreshPlayer();
}
function closeReader() {
  if (history.state?.reader) history.back();
  else hideReader();
}

function openToc() {
  if (!ebook) return;
  const entries = ebook.data.toc.length ? ebook.data.toc : ebook.data.sections.filter((sec) => sec.title).map((sec) => ({ title: sec.title, pos: sec.pos, depth: 0 }));
  const here = topPos();
  const current = entries.findLastIndex((e) => e.pos <= here);
  const dlg = sheet(t('Contents'), (close) =>
    h('ol', { class: 'toc' }, entries.map((e, i) =>
      h('li', {}, h('button', { type: 'button', class: i === current ? 'current' : '', style: e.depth ? `padding-left:${10 + e.depth * 18}px` : null,
        onclick: () => { close(); rd.following = false; rd.userAt = Date.now(); showPos(e.pos, false, true); requestAnimationFrame(() => { saveReading(false); renderBar(); }); } }, e.title)))));
  $('.current', dlg)?.scrollIntoView({ block: 'center' });
}

function openTextSize() {
  sheet(t('Text size'), () => {
    const value = h('output', {}, '');
    const fonts = h('div', { class: 'chips wide' });
    const paint = () => {
      value.textContent = String(settings.readSize);
      fonts.replaceChildren(...[[false, t('Serif')], [true, t('Sans serif')]].map(([sans, label]) =>
        h('button', { type: 'button', class: settings.readSans === sans ? 'chip on' : 'chip', onclick: () => set(settings.readSize, sans) }, label)));
    };
    const set = (size, sans) => {
      const keep = rd.flat.length ? topPos() : null;
      settings.readSize = clamp(size, 14, 30);
      settings.readSans = sans;
      saveSettings();
      applyTextSize();
      if (keep != null) showPos(keep, false, true);
      paint();
    };
    paint();
    return [
      h('div', { class: 'stepper' },
        h('button', { class: 'btn', type: 'button', 'aria-label': t('Smaller'), onclick: () => set(settings.readSize - 1, settings.readSans) }, '−'),
        value,
        h('button', { class: 'btn', type: 'button', 'aria-label': t('Larger'), onclick: () => set(settings.readSize + 1, settings.readSans) }, '+')),
      fonts,
    ];
  });
}

// Picks the EPUB for a book from put.io, starting in the book's own folder.
function openEpubPicker(book) {
  sheet(t('Choose an EPUB'), (close) => {
    const where = h('p', { class: 'fine' });
    const list = h('div', { class: 'picker-list' });
    const pick = (f) => {
      epubLinks[book.id] = f ? { id: f.id, name: f.name, size: f.size || 0, at: Date.now() } : { none: true, at: Date.now() };
      store.set('epubLinks', epubLinks);
      pushLink(book.id);
      close();
      renderLibrary();
      if (cur?.book.id === book.id) refreshPlayer();
      if (f) toast(t('“{name}” will open from the player.', { name: f.name }));
    };
    const row = (name, label, onclick) => h('button', { type: 'button', onclick }, h('span', { html: icon(name) }), h('span', {}, label));
    const show = async (folder) => {
      where.textContent = folder.name || t('Your files');
      list.replaceChildren(h('p', { class: 'fine' }, t('Loading…')));
      try {
        const { files, parent } = await api.listFiles(folder.id);
        const dirs = files.filter((f) => f.file_type === 'FOLDER').sort(byName);
        const epubs = files.filter((f) => f.file_type !== 'FOLDER' && /\.epub$/i.test(f.name)).sort(byName);
        list.replaceChildren(...[
          folder.id ? row('left', t('Up a folder'), () => show({ id: parent?.parent_id ?? 0, name: '' })) : null,
          ...dirs.map((d) => row('folder', d.name, () => show(d))),
          ...epubs.map((f) => row('file', f.name, () => pick(f))),
          dirs.length || epubs.length ? null : h('p', { class: 'empty' }, t('No folders or EPUBs in here.')),
        ].filter(Boolean));
      } catch (err) {
        list.replaceChildren(h('p', { class: 'fine' }, err.message));
      }
    };
    show(book.id.startsWith('d') ? { id: Number(book.id.slice(1)), name: book.title } : settings.root);
    return [where, list, epubOf(book) ? h('button', { class: 'btn danger', type: 'button', onclick: () => pick(null) }, t('Don’t use an EPUB')) : null];
  });
}

/* ---------- lock screen / headphone controls ---------- */

// The made-up cover from coverEl (.cover.made in styles.css), drawn as an image
// the lock screen can show. Null where the canvas can't do oklch colours.
function madeArt(book) {
  const key = `${book.title}\n${book.author}`;
  if (madeArt.key === key) return madeArt.src;
  let src = null;
  try {
    const S = 512, hue = coverHue(book.title), x = S * 0.15, w = S * 0.75;
    const canvas = Object.assign(document.createElement('canvas'), { width: S, height: S });
    const g = canvas.getContext('2d');
    const bg = g.createLinearGradient(144, -52, 368, 564); // 160deg across the square
    bg.addColorStop(0, `oklch(0.46 0.09 ${hue})`);
    bg.addColorStop(1, `oklch(0.3 0.07 ${hue})`);
    g.fillStyle = bg;
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(0 0 0 / 0.28)';
    g.fillRect(0, 0, S * 0.05, S);
    g.fillStyle = 'rgb(255 255 255 / 0.08)';
    g.fillRect(S * 0.05, 0, S * 0.015, S);

    g.fillStyle = `oklch(0.95 0.03 ${hue})`;
    g.textBaseline = 'top';
    g.font = '600 50px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const lines = [];
    for (const word of book.title.split(/\s+/)) {
      const joined = `${lines[lines.length - 1]} ${word}`;
      if (lines.length && g.measureText(joined).width <= w) lines[lines.length - 1] = joined;
      else lines.push(word);
    }
    if (lines.length > 4) lines[3] += '…';
    lines.slice(0, 4).forEach((line, i) => g.fillText(line, x, S * 0.11 + i * 56, w));
    if (book.author) {
      g.globalAlpha = 0.8;
      g.textBaseline = 'alphabetic';
      g.font = '500 25px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      g.letterSpacing = '2px';
      g.fillText(book.author.toUpperCase(), x, S * 0.89, w);
    }
    src = canvas.toDataURL('image/png');
  } catch {}
  Object.assign(madeArt, { key, src });
  return src;
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !cur) return;
  const list = chapterList();
  const art = cur.book.cover
    ? [{ src: cur.book.cover }]
    : [{ src: madeArt(cur.book) || new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' }];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: list ? list[chapterIndex()].title : cur.book.title,
      // iOS shows only title and artist, so the book's name rides along with the author.
      artist: list ? [cur.book.title, cur.book.author].filter(Boolean).join(' · ') : cur.book.author || 'put.io Audiobooks',
      album: cur.book.title,
      artwork: art,
    });
  } catch {}
}
// Said out loud so the controls don't drop to "paused" in the gap between two files.
function lockState(state) {
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = state;
}
function updatePositionState() {
  if (!('mediaSession' in navigator) || !cur?.loaded || !Number.isFinite(audio.duration)) return;
  // The bar covers the chapter, like the one in the player.
  const [a, b] = bounds();
  try {
    navigator.mediaSession.setPositionState({
      duration: b - a,
      playbackRate: audio.playbackRate || 1,
      position: clamp(audio.currentTime - a, 0, b - a),
    });
  } catch {}
}
function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const on = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch {} };
  on('play', () => { if (audio.paused) togglePlay(); });
  on('pause', () => audio.pause());
  on('seekto', (e) => seekTo(bounds()[0] + e.seekTime));
  // iOS shows either skip buttons or track buttons on the lock screen, never
  // both. Skips matter more for audiobooks, so a setting has to ask for chapters.
  const chapters = !isIOS || settings.lockChapters;
  const skips = !isIOS || !settings.lockChapters;
  on('seekbackward', skips ? (e) => skip(-(e.seekOffset || settings.back)) : null);
  on('seekforward', skips ? (e) => skip(e.seekOffset || settings.fwd) : null);
  on('previoustrack', chapters ? prevChapter : null);
  on('nexttrack', chapters ? nextChapter : null);
}

/* ---------- audio events ---------- */

audio.addEventListener('loadedmetadata', () => {
  if (!cur) return;
  const d = Number.isFinite(audio.duration) ? audio.duration : 0;
  if (pendingFrac != null && d) audio.currentTime = pendingFrac * d;
  else if (pendingSeek > 0) audio.currentTime = d ? Math.min(pendingSeek, Math.max(0, d - 1)) : pendingSeek;
  pendingSeek = 0;
  pendingFrac = null;
  cur.loaded = true;
  audio.playbackRate = settings.speed;
  if (!multi() && d && !cur.book.duration) { cur.book.duration = d; saveLibrary(); }
  tick();
  updatePositionState();
});
audio.addEventListener('timeupdate', tick);
audio.addEventListener('playing', () => { if (cur) cur.retries = 0; pausedAt = 0; lockState('playing'); tick(); updatePositionState(); });
audio.addEventListener('ratechange', updatePositionState);
audio.addEventListener('seeked', updatePositionState);
audio.addEventListener('pause', () => {
  pausedAt = Date.now();
  lockState('paused');
  savePosition(true);
  tick();
});
audio.addEventListener('ended', () => {
  if (!cur) return;
  const book = cur.book;
  if (cur.ti + 1 < book.tracks.length) {
    const stopHere = sleep?.mode === 'chapter';
    if (stopHere) sleep = null;
    loadTrack(cur.ti + 1, 0, !stopHere);
    positions[book.id] = { t: cur.ti, s: 0, at: Date.now(), p: +bookFraction().toFixed(4) };
  } else {
    positions[book.id] = { t: 0, s: 0, at: Date.now(), p: 1, done: true };
    sleep = null;
  }
  savePositions();
  pushPosition(book.id);
  renderLibrary();
  tick();
});
audio.addEventListener('error', () => {
  if (!cur || !cur.started || !audio.getAttribute('src')) return;
  const track = cur.book.tracks[cur.ti];
  urlCache.delete(track.id);
  if (cur.retries++ < 2) {
    // Stream links expire and are tied to an IP address. Ask for a fresh one.
    loadTrack(cur.ti, lastGood, true);
  } else {
    toast(t('Couldn’t play this file. Check your connection and try again.'));
    lockState('paused');
    cur.started = false;
    pendingSeek = lastGood;
    tick();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) savePosition(true);
  else pullPositions();
});
addEventListener('pagehide', () => savePosition(true));
setInterval(() => { if (cur && sleep && !audio.paused) tick(); }, 1000);

addEventListener('keydown', (e) => {
  if (!cur || e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, dialog, button, a')) return;
  if (rd.open && /^(Space|ArrowUp|ArrowDown|PageUp|PageDown)$/.test(e.code)) return; // those scroll the text
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.code === 'ArrowLeft') e.shiftKey ? prevChapter() : skip(-settings.back);
  else if (e.code === 'ArrowRight') e.shiftKey ? nextChapter() : skip(settings.fwd);
  else if (e.key === '[') setSpeed(settings.speed - 0.05);
  else if (e.key === ']') setSpeed(settings.speed + 0.05);
});

/* ---------- boot ---------- */

function start() {
  api.setToken(store.get('token'));
  if (DEMO && !settings.root) settings.root = DEMO_ROOT;
  if (!settings.root) return showFolders();
  showLibrary();
  const last = library.find((b) => b.id === store.get('last'));
  if (last && !cur && !positions[last.id]?.done) { openBook(last, false); openPlayer(); }
  if (navigator.onLine) rescan();
  pullPositions();
}

function boot() {
  translate(landing);
  buildPlayer();
  buildReader();
  setupMediaSession();
  offline.init().then(renderLibrary, () => {});
  $('#player').inert = true;
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // Coming back from put.io: the token arrives in the URL fragment.
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.get('access_token') || fragment.get('error')) {
    // Only accept a token this app asked for; a crafted link must not replace the session.
    const asked = store.get('connecting');
    store.del('connecting');
    history.replaceState(null, '', location.pathname + location.search);
    if (asked && fragment.get('access_token')) store.set('token', fragment.get('access_token'));
    else if (asked) toast(t('put.io didn’t grant access.'));
  } else store.del('connecting'); // an abandoned sign-in must not leave the door open

  if (DEMO || store.get('token')) start();
  else showConnect();
}

boot();
