<p align="center">
  <img src="icons/connect-art.svg" alt="Pixel art of a cloud streaming sound to a book wearing headphones" width="468">
</p>

<h1 align="center">put.io Audiobooks</h1>

<p align="center">
  Your put.io audiobooks, played like audiobooks.<br>
  Chapters, speed, a sleep timer, and it remembers your place on every device.
</p>

<p align="center">
  <a href="https://putio-audiobooks.vercel.app"><b>Open the app</b></a>
</p>

<p align="center">
  <img src="screenshots/library.png" alt="Library as a cover grid, with a Keep listening shelf" width="260">
  <img src="screenshots/player.png" alt="Player with chapter, skip, speed and sleep timer controls" width="260">
  <img src="screenshots/list.png" alt="Library as a compact list showing time left" width="260">
</p>

An audiobook player you install from the browser. It is static files only: no build step, no backend, no account other than your put.io one.

This is an unofficial app. It is not affiliated with or endorsed by put.io.

## Use it

1. Open https://putio-audiobooks.vercel.app and tap "Connect put.io".
2. Pick the folder your audiobooks live in.
3. On your phone, tap **Install** in the app (or use "Add to Home Screen") to install it.

## What it does

**Library**

- Search, and a "Keep listening" shelf for books you have started.
- Cover grid or compact list. The list also shows the time left in each started book.
- Filter by in progress, not started, finished, starred or downloaded.
- Sort by title, author, recently played or recently added.
- Star a book to move it to the front. Hide one to take it off the shelf; "Show all" brings hidden books back.
- The "…" button under a book opens its menu: mark it finished, start it over, pick cover art, or download it.

**Player**

- Chapter list, a scrubber scoped to the current chapter, previous and next chapter.
- Skip back 15 seconds or forward 30.
- Speed from 0.5x to 3.5x in 0.05 steps, remembered.
- Sleep timer: 5 to 60 minutes, or the end of the chapter.
- Lock screen and headphone controls.
- Keyboard: space to play or pause, left and right arrows to skip.
- Rewinds 10 seconds when you come back after a pause of more than 5 minutes.

**Sync and offline**

- Remembers your place in every book. Positions, stars and hidden books sync between devices through put.io's own per-app config storage.
- Download a book to listen without a connection. Downloads are kept in the browser's storage on that device, and only run while the app is open.
- The app itself opens offline. Audio streams unless the book is downloaded.
- Light and dark themes, following the system.

## How it reads your library

| In your put.io folder | What you get |
| --- | --- |
| A folder of audio files | One book. Files play in natural name order, and each file is a chapter. |
| `CD1`, `Disc 2`, `Part 3`, `Vol 4` subfolders | Merged into the parent book. |
| An `.m4b` file | A book of its own, with chapter markers and title and author tags read from the file. A single `.m4a` gets the same treatment. |
| Several M4Bs whose names differ only by a number | Parts of one book. |
| An audio file directly in the library folder | A book on its own. |
| `Author/Book/` folders, or an `Author - Title` name | The author. |
| An image in the folder | The cover. One named `cover`, `folder` or `front` is preferred. |
| Zip and RAR files | Skipped. The library tells you how many; extract them on put.io and rescan. |

- **Formats:** MP3, M4B, M4A, AAC, OGG, Opus, FLAC, WAV.
- **Depth:** folders are scanned six levels below the library folder.
- **M4B tags:** read with small range requests, in the background after a scan.
- **Missing covers:** the app searches Apple's audiobooks and Open Library once for that book, after a scan, and takes the first match. If nothing turns up, the book gets a generated cover. "Cover art" in a book's menu runs the same search so you can pick one yourself.

Not in this version: embedded cover art from inside M4B files, and ID3 tags from MP3s (titles come from file and folder names).

## Privacy

- The app talks to put.io straight from your browser. There is no server in between.
- Connecting gives the app a token for your whole put.io account, not just one folder. The app only lists files, reads audio and stores its own settings.
- Your token, listening positions, stars and hidden books stay on your device and in your put.io account. Downloaded books stay in the browser's storage on the device.
- The one exception is cover art: the title of each book without a cover is sent to Apple and Open Library once, after a scan, and so is whatever you search for in the cover picker.
- The hosted copy counts page views with Vercel Web Analytics: no cookies, and nothing about your library or put.io account.

## Host your own copy

The Client ID in `config.js` only works for the URL above, so your own copy needs its own put.io app.

1. Host this folder on any static HTTPS host (Vercel, Netlify, GitHub Pages, your NAS behind HTTPS).
2. In put.io, open https://app.put.io/oauth/new and create an app. Set the callback URL to the exact URL where the app is hosted, including the trailing slash.
3. Put that app's Client ID in `config.js`. Or set it to `''` and the app asks for the Client ID on the connect screen.

## Run it locally

1. Run `npx serve .` and open the localhost URL.
2. On the connect screen, open "Use an OAuth token instead" and paste a put.io OAuth token.

On localhost the Client ID in `config.js` is ignored, because put.io only accepts the hosted URL as its callback. The service worker only registers over HTTPS, so there is no offline shell on localhost.

Run the checks with `node --test`.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | Page shell |
| `app.js` | UI and playback |
| `api.js` | put.io client |
| `scan.js` | Turns put.io folders into books |
| `m4b.js` | Chapter and tag reader |
| `covers.js` | Cover art search |
| `offline.js` | Downloaded books |
| `sw.js` | Service worker |
| `styles.css` | Styles |
| `config.js` | put.io Client ID |
| `manifest.webmanifest`, `icons/` | Install metadata |
| `test/` | Checks |

## Licence

MIT. See [LICENSE](LICENSE).
