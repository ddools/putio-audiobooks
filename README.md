# put.io Audiobooks

An audiobook player PWA for your put.io files. Static files only. No build step, no backend.

## Run it

1. Host this folder on any static HTTPS host (Vercel, Netlify, GitHub Pages, your NAS behind HTTPS).
2. In put.io, open https://app.put.io/oauth/new and create an app. Set the callback URL to the exact URL where the app is hosted, including the trailing slash.
3. Open the app, paste the app's Client ID, and connect. Or put the Client ID in `config.js` to skip that step.
4. Pick the folder your audiobooks live in.
5. On your phone, use "Add to Home Screen" to install it.

For a quick local try: `npx serve .` then open the localhost URL and use "Use an OAuth token instead".

## How it reads your library

- A folder of MP3s (or M4A, FLAC, OGG, Opus) is one book. Files play in natural name order. Each file is a chapter.
- `CD1`, `Disc 2`, `Part 3` subfolders are merged into the parent book.
- Each `.m4b` is its own book. Chapter markers and title/author tags are read from the file with small range requests.
- `Author/Book/` folders and `Author - Title` names both give you an author.
- An image in the folder (`cover.jpg` preferred) becomes the cover. Without one, the title is looked up with Apple's audiobook search, then Open Library.

## What it does

- Chapter list, chapter-scoped scrubber, skip back 15 / forward 30.
- Speed from 0.5x to 3.5x, remembered.
- Sleep timer: minutes, or end of chapter.
- Lock screen and headphone controls.
- Remembers your place per book. Positions sync between devices through put.io's own per-app config storage.
- App shell works offline. Audio always streams.

## Not in this version

- Offline downloads of books.
- Embedded cover art from inside M4B files.
- ID3 tags from MP3s (titles come from file and folder names).

## Files

- `app.js` UI and playback
- `api.js` put.io client
- `m4b.js` chapter and tag reader
- `covers.js` cover art lookup
- `sw.js` service worker
- `config.js` optional Client ID
