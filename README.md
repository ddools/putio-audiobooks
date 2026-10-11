# put.io Audiobooks

An audiobook player PWA for your put.io files. Static files only. No build step, no backend.

## Use it

1. Open https://putio-audiobooks.vercel.app and tap "Connect put.io".
2. Pick the folder your audiobooks live in.
3. On your phone, use "Add to Home Screen" to install it.

## Host your own copy

The Client ID in `config.js` only works for the URL above, so your own copy needs its own put.io app.

1. Host this folder on any static HTTPS host (Vercel, Netlify, GitHub Pages, your NAS behind HTTPS).
2. In put.io, open https://app.put.io/oauth/new and create an app. Set the callback URL to the exact URL where the app is hosted, including the trailing slash.
3. Put that app's Client ID in `config.js`. Or set it to `''` and the app asks for the Client ID on the connect screen.

## Run it locally

1. Set `CLIENT_ID` to `''` in `config.js`. Don't commit that change.
2. Run `npx serve .` and open the localhost URL.
3. On the connect screen, open "Use an OAuth token instead" and paste a put.io OAuth token.

The token option only shows when `CLIENT_ID` is empty. The service worker only registers over HTTPS, so there is no offline shell on localhost.

## How it reads your library

- A folder of audio files is one book. Files play in natural name order. Each file is a chapter.
- Formats: MP3, M4B, M4A, AAC, OGG, Opus, FLAC, WAV.
- `CD1`, `Disc 2`, `Part 3`, `Vol 4` subfolders are merged into the parent book.
- Each `.m4b` is its own book. Chapter markers and title/author tags are read from the file with small range requests. A single `.m4a` gets the same treatment.
- Several M4Bs whose names differ only by a number are treated as parts of one book.
- An audio file sitting directly in the library folder is a book on its own.
- `Author/Book/` folders and `Author - Title` names both give you an author.
- An image in the folder becomes the cover. One named `cover`, `folder` or `front` is preferred. Without one, the title is looked up with Apple's audiobook search, then Open Library. If nothing fits, the book gets a generated cover.
- Folders are scanned four levels below the library folder.

## What it does

- Library with search and a "Keep listening" shelf.
- Chapter list, chapter-scoped scrubber, previous/next chapter, skip back 15 / forward 30.
- Speed from 0.5x to 3.5x in 0.05 steps, remembered.
- Sleep timer: 5 to 60 minutes, or end of chapter.
- Lock screen and headphone controls.
- Keyboard: space to play or pause, left and right arrows to skip.
- Remembers your place per book. Positions sync between devices through put.io's own per-app config storage.
- Rewinds 10 seconds when you come back after a pause of more than 5 minutes.
- Light and dark themes, following the system.
- App shell works offline. Audio always streams.

## Privacy

The app talks to put.io straight from your browser. Your token and listening positions stay on your device and in your put.io account. The one exception is cover lookup: titles of books without a cover image are sent to Apple and Open Library. A looked-up cover that is wrong can be removed in Settings while that book is loaded.

## Not in this version

- Offline downloads of books.
- Embedded cover art from inside M4B files.
- ID3 tags from MP3s (titles come from file and folder names).

## Files

- `index.html` page shell
- `app.js` UI and playback
- `api.js` put.io client
- `m4b.js` chapter and tag reader
- `covers.js` cover art lookup
- `sw.js` service worker
- `styles.css` styles
- `config.js` put.io Client ID
- `manifest.webmanifest` and `icons/` install metadata
