# put.io Audiobooks — Design Handover for Claude Code

Design review of the current build (screenshots in `uploads/`) and the changes to implement. The app targets **mobile and desktop** (PWA). Visual direction is influenced by put.io (dark UI, yellow accent). There is no design system yet, so section 1 defines one; sections 2–7 cover per-screen fixes. Section 8 is the prioritised task list.

> Hex values below are sampled from screenshots. Check them against the existing CSS and keep the current values if they're close.

Reference screenshots:
- `uploads/screencapture-…20_39_24.png`: Library, grid view
- `uploads/screencapture-…20_39_50.png`: Settings modal
- `uploads/screencapture-…20_40_09.png`: Library, list view
- `uploads/screencapture-…20_40_19.png`: Book options sheet
- `uploads/screencapture-…20_40_46.png`: Library, list view (top)
- `uploads/Screenshot 2026-10-13 at 20.40.37.png`: Player
- `uploads/Screenshot 2026-10-13 at 20.41.05.png`: Chapters sheet

---

## 1. Design system foundations

Put these in one place (CSS custom properties or a theme file). Every component should use tokens, with no literal colors or sizes.

### Color
| Token | Value | Use |
|---|---|---|
| `--bg` | `#141414` | App background |
| `--surface-1` | `#1C1C1C` | Cards, mini player, sheets, modals |
| `--surface-2` | `#262626` | Hover, selected row, input fill |
| `--border` | `#2E2E2E` | Outlines, dividers |
| `--text` | `#F2F2F2` | Primary text |
| `--text-2` | `#A3A3A3` | Secondary text (≥ 4.5:1 on `--bg`; current grey is close to the limit on `--surface-1`) |
| `--text-3` | `#6E6E6E` | Disabled and decorative only, never used for information |
| `--accent` | `#FDCB46` | Primary action, active chip, progress fill, links |
| `--on-accent` | `#141414` | Text and icons on accent |
| `--danger` | `#FF6B5A` | Sign out, destructive actions |
| `--scrim` | `rgba(0,0,0,.6)` | Behind modals and sheets |

Rules: use accent for **one primary thing per view** (the play button, the active filter, progress). Right now yellow also appears on the "Sort" and "Show all" text links next to the yellow "All" chip, so they all compete. Make the secondary links `--text-2` with a chevron.

### Typography
Use the system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`), which is what the build already uses. Use `font-variant-numeric: tabular-nums` on all times and counts.

| Token | Size / line-height / weight | Use |
|---|---|---|
| `display` | 28/34/700 (mobile 24/30) | Player title |
| `title-lg` | 22/28/700 | Section headers ("Keep listening", "All books"), sheet titles |
| `title` | 17/22/600 | Card and row titles, modal row labels |
| `body` | 15/20/400 | Body, buttons |
| `caption` | 13/18/400 | Author, meta, times |

Section headers and sheet titles are currently close in size to card titles, so the hierarchy reads flat. The book options sheet title (~34px) is larger than the page headers, which is backwards; use `title-lg`.

### Spacing, radius, elevation
- 4px base: `4 8 12 16 24 32 48`.
- Page gutter: 16 (mobile), 24 (tablet), 32 (desktop). Content max-width **1200px**, centered.
- Radius: `--r-sm 6` (list thumbnails), `--r-md 10` (covers, inputs, buttons), `--r-lg 20` (sheets, modals), `--r-pill 999` (chips only).
  - Currently three button shapes coexist: pill (settings and options actions), rounded rect (Speed and Sleep), pill chips. Use **rounded rect for buttons** and **pill for filter chips only**.
- Elevation: sheets and modals use `--surface-1` plus the scrim. Avoid drop shadows except the player cover.

### Iconography
- One icon set (e.g. Lucide), 1.75px stroke, 20px in rows and 24px in toolbars.
- Every icon-only button gets an `aria-label` and a desktop tooltip.
- Fix the **icon collision**: the "bulleted list" glyph currently means "switch to list view" in the library *and* "open chapters" in the player. Use `list-ordered`/`list-music` for chapters and a segmented grid/list toggle in the library.

### Motion
- 150ms for hover and press, 250ms ease-out for sheet and modal enter, 200ms for exit.
- Player open: expand from the mini player (shared cover element) where supported. Otherwise slide up.
- Respect `prefers-reduced-motion` by switching to fades only.

### Breakpoints & layout
| Name | Width | Library grid cols | Overlays |
|---|---|---|---|
| mobile | < 640 | 2 | Bottom sheets |
| tablet | 640–1023 | 3–4 | Bottom sheets |
| desktop | ≥ 1024 | 5–6 (`repeat(auto-fill,minmax(168px,1fr))`) | Centered modal / anchored popover / side panel |

### Interaction baseline
- Minimum hit target 44×44 on touch, including the star, hide and more icons, which are currently ~24px with no padding.
- `:focus-visible` ring: 2px `--accent`, 2px offset, applied everywhere. The book-sheet close button already has one, but it's the only element that does and it shows on open; only show it for keyboard focus.
- Hover states on desktop for cards, rows, chips and buttons (`--surface-2`).

---

## 2. Metadata display (cross-cutting, highest impact)

Every screen shows **raw file and folder names**: `Martha Wells - 2020 - Murderbot Diaries, 5 - Network Effect`, chapter `Network Effect-01 Chapter 1`, subtitle `Audiobooks` (the parent folder). This causes most of the truncation and clutter.

Implement a `parseBookName()` with fallbacks:
```
"{author} - {year} - {series}, {n} - {title}"  → { author, year, series, seriesIndex, title }
"{title} - {author}"  /  "{author} - {title}"   → heuristic; prefer ID3/M4B tags when present
```
- **Prefer embedded tags** (ID3 `album`/`artist`, M4B chapters) over filename parsing. Only parse filenames as a fallback.
- Display: **Title** = `Network Effect`; **Byline** = `Martha Wells · Murderbot Diaries #5`.
- Never show the parent folder name ("Audiobooks") as a byline. If there's no author, show duration instead.
- Chapters: strip the book-title prefix and the leading track number, giving `Chapter 1`. If the stripped name is empty, use `Chapter {n}`.
- Allow a user override (an "Edit details" option in the book menu) and persist it with the progress data.

---

## 3. Library

### Header
- Logo and wordmark are fine. Right side: **grid/list segmented toggle** (moved next to Sort in the "All books" toolbar) and a **settings gear** (replaces `…`; `…` implies a per-item menu).
- The search field is good. Add `/` to focus it on desktop and a clear (×) button when filled. Show "No books match '…'" for empty results.

### Keep listening
Currently a single small card identical to the grid cards, with a large empty area to its right. It also duplicates the mini player when there's one book in progress.
- Make it a **horizontal continue card** on desktop (cover 120px, title, byline, "Chapter 1 · 12h 37m left", progress bar, **Play/Resume button**). On mobile, use a horizontally scrolling row of these cards.
- Pressing Play resumes directly without opening the player.
- Hide the section when nothing is in progress.

### All books toolbar
- `All books · 9` with `Show all (10 hidden)` is confusing because more books are hidden than shown. Change to `9 books` plus a quiet `10 hidden · Show` toggle.
- `Sort: Title` becomes a dropdown button (`Sort: Title ▾`) with options Title, Author, Recently played, Recently added, Progress.
- Filter chips: keep them. On mobile they should **scroll horizontally** in one row without wrapping. Reduce desktop height to 36px (they're ~48px now, which is heavy). Optionally add counts (`In progress 1`).

### Grid card
Current problems: title truncated at ~1.5 lines, a meaningless byline, a grey progress bar even at 0%, and three action icons repeated under every card (27 icons for 9 books).
- Cover: 1:1, `object-fit: cover`, `--r-md`. Use a generated placeholder (initials on a tinted surface) when there's no art.
- Title: `title`, **2-line clamp**. Byline: `caption --text-2`, 1 line.
- Progress: show only when 0 < p < 100%, as a 3px bar overlaid on the bottom of the cover plus `42% · 6h left` in the byline. Finished books get a small check badge on the cover and are dimmed to 70% opacity.
- Starred books get a filled-star badge on the cover corner.
- **Actions:** remove the always-visible star, hide and more row.
  - Desktop: on hover or focus, show a `…` button over the cover's top-right corner.
  - Mobile: long-press or a `…` on the card opens the book sheet.
  - Star and Hide live in that menu.
- The eye-slash icon reads as "this is hidden" instead of "hide this". Inside the menu, use text labels.

### List row
The list view is closer to right (it shows `Martha Wells - The Murderbot Diaries · 1% · 12h 37m left`). Apply the same rules:
- 56px thumbnail, title, byline + meta, progress only when started, single `…` at the end (star and hide go into it).
- Remove the full-width grey divider bar under unstarted books. A 1px `--border` divider between rows is enough.

### Footer
The three unlabeled icons (GitHub, a "T" mark, a pink app icon) are unclear. Move them into Settings → About with text labels, or add visible labels and tooltips.

### Mini player
- **Bug:** it overlaps content. Cards and rows scroll under it and are cut off with no way to reveal them. Add `padding-bottom: calc(var(--mini-h) + env(safe-area-inset-bottom))` to the scroll container.
- **Desktop alignment:** it spans the full viewport while content is capped at ~1000px. Either constrain it to the content max-width (floating bar, `--r-lg`, 16px from the bottom) or keep it full-width and align its inner content to the same 1200px container.
- Content: cover, parsed title, `Chapter 1 · 12h 37m left`, then **skip-back-15** and **play/pause** (44px each). Keep the progress line along the top edge.
- Tapping anywhere except the buttons opens the player. Swiping up on mobile also opens it.
- Hide it on the player screen itself.

---

## 4. Player

### Mobile
- Top bar: `chevron-down` (close) · centered context `Murderbot Diaries #5` · `list-music` (chapters).
- Cover: as large as fits, `--r-md`, a soft shadow, and optionally a background tint sampled from the cover's dominant color (very low opacity) to give each book identity.
- Title `display` (parsed: "Network Effect"), byline `body --text-2` ("Martha Wells"). The current title wraps to 2 lines of 48px and pushes the controls down.
- Chapter pill: `Chapter 1 · 1 of 22 ▾` opens chapters. This is good; keep it with the parsed name.
- Scrubber: chapter-scoped, as now. Make the thumb 16px with a 44px hit area, show a time tooltip while dragging, and support keyboard arrows (±15s) and Home/End.
- Times: `6:43` / `-15:30`. **Remaining time should account for playback speed.**
- **Book progress is duplicated and unlabeled.** "About 12h 37m left" is in the top bar and an unlabeled thin bar sits at the very bottom. Merge them into one labeled line under the controls: `Book · 3% · 12h 37m left` with the thin bar.
- Transport: prev chapter · −15 · **Play (accent, 72px)** · +30 · next chapter. Skip amounts are configurable in Settings.
- Speed / Sleep: keep as two equal buttons.
  - Speed opens a sheet with presets (0.8–3.0 in 0.1 steps, a slider plus chips for 1.0/1.25/1.5/2.0).
  - Sleep opens a sheet with 5/15/30/45/60 min and "End of chapter". **When active, the button shows the countdown (`12:04`) in accent.**
- Add a bookmark/note button (P2).

### Desktop (≥1024)
The player is currently a narrow mobile column in a wide black field. Use a **two-pane layout**: left pane with cover, title and controls (max 480px), right pane with a **persistent chapter list** (scrolls to the current chapter). This removes the need for the chapters sheet on desktop.
- Keyboard: Space play/pause, ←/→ ±15/30s, Shift+←/→ prev/next chapter, `[`/`]` speed, Esc close.

### Platform
- Use the **Media Session API** (title, artist, artwork, play/pause/seek/previoustrack/nexttrack handlers) so lock-screen and hardware keys work.
- Save the position on pause, every 10s, and on `visibilitychange` (it already syncs to put.io; make sure the sync is debounced and retries offline).

---

## 5. Chapters

Currently a sheet that covers the player. Rows repeat the `Network Effect-0X` prefix, and there are no durations.
- Row: index (or the accent ▶ for the current chapter) · parsed name · **duration** right-aligned (`tabular-nums`).
- Played chapters: name in `--text-2` with a small check. Current chapter: `--surface-2` background plus elapsed (`6:43 / 22:13`).
- On open, **auto-scroll to the current chapter**.
- Mobile: bottom sheet with a drag handle, swipe-down to dismiss, and the close × kept for accessibility. Desktop: the side panel described above.
- If the book has a single file with embedded chapters, the same list applies.

---

## 6. Book options (the `…` menu)

Currently a wide bottom sheet even on desktop, with an oversized 2-line title, "Start over" shown for a book that hasn't started, and size shown as `1663 MB`.
- Desktop: **anchored popover menu** from the `…` button (280px). Mobile: bottom sheet.
- Header: small cover + title (`title`, 2-line clamp) + byline + `14h 2m · 1.6 GB`.
- Actions as a list (icon + label, one row each, 48px):
  - Play / Resume
  - Star / Unstar
  - Mark as finished / Mark as not started (contextual; never show "Start over" when progress is 0)
  - Start over (only when progress > 0, with a confirm)
  - Download for offline · 1.6 GB, showing a progress ring while downloading; once downloaded it becomes "Remove download"
  - Change cover art
  - Edit details (title/author override, see §2)
  - Hide from library (`--danger` not needed; it's reversible. Show an undo toast.)
- Format bytes humanely (`1.6 GB`, `820 MB`).

---

## 7. Settings

The structure is good. Changes:
- Mobile: bottom sheet. Desktop: centered modal (as now), 480px wide.
- Group into sections with small `caption` headers: **Library**, **Playback**, **App**, **Account**, **About**.
  - Library folder: show the actual path (`/Audiobooks`), not "Your files". Change button.
  - Rescan: show `Last scanned 2 hours ago`. While running, the button shows a spinner and `Scanning… 4 found`.
  - Playback (new): skip back amount, skip forward amount, default speed, auto-rewind on resume (e.g. 3s).
  - Install the app: only show when `beforeinstallprompt` is available or on iOS (with instructions).
  - Account: `Signed in as {username}` + Sign out (`--danger` text, confirm).
  - About: version, and the GitHub and other links moved from the footer.
- Buttons: secondary style (outline, `--r-md`), consistent width.

---

## 8. Task list (prioritised)

**P0 — bugs / clarity**
1. Add mini-player bottom padding so content isn't hidden behind it (§3).
2. Metadata parsing and display: title, byline, chapter names (§2).
3. Merge the duplicate book-progress indicators in the player into one labeled line (§4).
4. Resolve the chapters vs list-view icon collision (§1, Iconography).
5. Make the book menu contextual (no "Start over" at 0%), use human-readable sizes, and "Mark as finished" wording (§6).
6. 44px hit targets, `aria-label`s and focus-visible on all icon buttons (§1).

**P1 — system & layout**
7. Implement tokens (color, type, spacing, radius) and replace literals (§1).
8. Grid/list cards: remove per-card action rows, add a hover/long-press menu, progress only when started, badges (§3).
9. Keep listening as a continue card with a direct Resume (§3).
10. Desktop player two-pane layout with a persistent chapter list, plus keyboard shortcuts (§4).
11. Book menu: popover on desktop, sheet on mobile (§6).
12. Chapters: durations, played state, auto-scroll to current (§5).
13. Mini player: skip-back button, alignment to the content container on desktop (§3).
14. Media Session API (§4).

**P2 — polish**
15. Sleep timer countdown state, speed sheet (§4).
16. Settings regrouping, playback preferences, last-scanned info (§7).
17. Sort dropdown, chip counts, "/" search shortcut, empty states (§3).
18. Cover-tinted player background, open/close shared-element transition (§1, §4).
19. Bookmarks, edit-details override (§2, §4).

## Acceptance checks
- At 375px wide, no text overlaps, chips scroll horizontally, and every interactive element is ≥ 44px.
- At 1440px wide, the content is centered at ≤1200px, the mini player is aligned to it, and the player uses two panes.
- Keyboard only: you can reach and operate search, filters, cards, the menu, the player and the scrubber, with a visible focus ring.
- Text contrast is ≥ 4.5:1 (check `--text-2` on `--surface-1`).
- No raw filenames are visible anywhere when tags or a parse succeed.
