// Runs before first paint: hides the landing page in index.html from people who are signed in
// (or just back from put.io), so it doesn't flash before app.js shows their library.
try {
  if (localStorage.getItem('putio-audiobooks:token') || location.hash.includes('access_token=')) {
    document.documentElement.classList.add('signed-in');
  }
} catch {}
