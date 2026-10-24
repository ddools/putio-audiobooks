// Translations. The English text is the key, so a string missing from a language file shows in English.
// Each language file in locales/ maps English to that language; only the chosen one loads.
export const LANGS = { en: 'English', de: 'Deutsch', es: 'Español', fr: 'Français', it: 'Italiano', nl: 'Nederlands', pt: 'Português' };
const KEY = 'putio-audiobooks:lang'; // outside the demo namespace, so the demo and a signed-in library share it
const saved = (() => { try { return localStorage.getItem(KEY); } catch {} })();
export const lang = saved in LANGS ? saved
  : navigator.languages.map((l) => l.slice(0, 2).toLowerCase()).find((l) => l in LANGS) || 'en';
const dict = lang === 'en' ? {} : (await import(`./locales/${lang}.js`)).default;

export const t = (s, vars = {}) => (dict[s] ?? s).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
export const num = (n, decimals = 0) => n.toLocaleString(lang, { minimumFractionDigits: decimals, maximumFractionDigits: 2 });

// Reloading is simpler than re-rendering every view, and positions are saved on pagehide.
export function setLang(code) {
  try { localStorage.setItem(KEY, code); } catch {}
  location.reload();
}

// The landing page's copy lives in index.html: elements marked data-i18n get their text swapped,
// data-i18n-html their markup (for copy with a link in it), data-i18n-alt their alt text.
export function translate(root) {
  document.documentElement.lang = lang;
  if (lang !== 'en') {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.textContent.trim());
    for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.innerHTML.trim());
    for (const el of root.querySelectorAll('[data-i18n-alt]')) el.alt = t(el.alt);
  }
  document.documentElement.classList.remove('i18n-pending');
}
