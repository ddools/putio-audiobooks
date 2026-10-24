// Runs before first paint: hides the landing page in index.html from people who are signed in
// (or just back from put.io, or opening the demo), so it doesn't flash before app.js shows their library.
try {
  if (localStorage.getItem('putio-audiobooks:token') || location.hash.includes('access_token=')
    || new URLSearchParams(location.search).has('demo')) {
    document.documentElement.classList.add('signed-in');
  }
} catch {}
// Hides the landing copy from anyone getting another language, until app.js has translated it (see i18n.js).
try {
  const lang = localStorage.getItem('putio-audiobooks:lang')
    || navigator.languages.map((l) => l.slice(0, 2).toLowerCase()).find((l) => /^(en|de|es|fr|it|nl|pt)$/.test(l));
  if (lang && lang !== 'en') document.documentElement.classList.add('i18n-pending');
} catch {}
