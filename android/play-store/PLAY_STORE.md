# Google Play submission: Audiobooks for put.io

Everything needed to create the app in the [Play Console](https://play.google.com/console), in the order the Console asks for it. Image paths are relative to this file.

## Before you start

- [ ] Merge [PR #6](https://github.com/ddools/putio-audiobooks/pull/6) (the expanded privacy policy) so the policy URL below shows the full version.
- [ ] Back up `android/android.keystore` somewhere off this machine. It is git-ignored and exists only here. The password is in the macOS Keychain: `security find-generic-password -s putio-audiobooks-keystore -w`.
- [ ] Optional: sideload and check the build first: `adb install android/app-release-signed.apk`. It should open full screen with no URL bar.
- [ ] If your developer account is a **personal account created after 13 November 2023**, production access needs a closed test with **at least 12 testers opted in for 14 days in a row**. Plan for that.

## Key facts

| | |
|---|---|
| Package name | `app.vercel.putio_audiobooks` |
| Version | `1.0.0` (version code `1`) |
| Min Android | 7.0 (API 24) |
| App bundle | `android/app-release-bundle.aab` |
| Privacy policy | `https://putio-audiobooks.vercel.app/privacy.html` |
| Website | `https://putio-audiobooks.vercel.app` |
| Source | `https://github.com/ddools/putio-audiobooks` |

---

## 1. Create app

| Field | Value |
|---|---|
| App name | `Audiobooks for put.io` |
| Default language | English (United States) – en-US |
| App or game | App |
| Free or paid | Free |
| Declarations | Tick both: Developer Program Policies, US export laws |

## 2. Main store listing (Grow users → Store presence → Main store listing)

**App name** (21 of 30 characters)

```
Audiobooks for put.io
```

**Short description** (79 of 80 characters)

```
Your put.io audiobooks with chapters, speed, a sleep timer and synced progress.
```

**Full description** (1,910 of 4,000 characters)

```
Your put.io audiobooks, played like audiobooks.

put.io plays your files one at a time, like any other audio. This app turns the folder your audiobooks live in into a library, and plays each book as a book: with chapters, speed control, a sleep timer, and your place remembered on every device.

LIBRARY
• Cover grid or compact list, with the time left in each book you have started
• A "Keep listening" shelf for books in progress
• Search, plus filters for in progress, not started, finished, starred and downloaded
• Sort by title, author, recently played or recently added
• Star a book to move it to the front, or hide it from the shelf

PLAYER
• Chapters from M4B files, or one chapter per MP3, with previous and next chapter
• Skip back 15 seconds or forward 30
• Speed from 0.5x to 3.5x, remembered between sessions
• Sleep timer from 5 to 60 minutes, or at the end of the chapter
• Lock screen, notification and headphone controls
• Rewinds 10 seconds when you come back after a break

SYNC AND OFFLINE
• Your place in every book, your stars and hidden books sync between devices through your own put.io account
• Download a book to listen without a connection

WORKS WITH THE FOLDERS YOU ALREADY HAVE
• A folder of audio files becomes one book; CD and disc subfolders are merged
• Multi-part M4Bs are joined into one book
• Authors are read from Author/Book folders or "Author - Title" names
• Covers come from images in the folder, or are looked up for you
• Plays MP3, M4B, M4A, AAC, OGG, Opus, FLAC and WAV

PRIVATE BY DESIGN
The app talks to put.io directly from your phone. There is no server in between and no account other than your put.io one. No ads, no cookies.

No put.io account? Tap "Try the demo" to listen to three public-domain LibriVox recordings.

Free and open source: github.com/ddools/putio-audiobooks

This is an unofficial app. It is not affiliated with or endorsed by put.io.
```

**Graphics**

| Slot | File | Size |
|---|---|---|
| App icon | `icon-512.png` | 512 × 512 |
| Feature graphic | `feature-graphic.png` | 1024 × 500 |
| Phone screenshots | `phone-library.png`, `phone-player.png`, `phone-list.png` | 844 × 1688 |

The tablet screenshots are optional, so leave them empty.

## 3. Store settings (Grow users → Store presence → Store settings)

| Field | Value |
|---|---|
| App category | Books & Reference |
| Tags | Pick the closest audiobook and audio-player tags from Play's list |
| Email | Required and **shown publicly** on the listing. Use an address you're happy to publish. |
| Phone | Leave blank |
| Website | `https://putio-audiobooks.vercel.app` |

## 4. App content (Policy and programs → App content)

### Privacy policy

```
https://putio-audiobooks.vercel.app/privacy.html
```

### App access

Choose **All or some functionality is restricted**. Add one instruction set:

- **Name:** `Demo library (no account needed)`
- **Username / password:** leave blank (tick "No other information is required" if Play offers it)
- **Instructions:**

```
The app plays audiobooks stored in the user's own put.io account, so full use needs a put.io login. To review without an account, tap "No put.io account? Try the demo" on the first screen. That opens a sample library of three public-domain LibriVox audiobooks with every player feature: chapters, speed, sleep timer, downloads and lock-screen controls.
```

### Ads

No, my app does not contain ads.

### Content rating

- **Category:** All Other App Types
- **Answers:** No to every question: violence, sexual content, profanity, controlled substances, gambling, users interacting or sharing content, sharing the user's location, digital purchases, unrestricted internet or web browsing.
- **Expected rating:** Everyone / PEGI 3.

### Target audience and content

- **Target age:** 18 and over. Including any age under 13 brings in the Families policy.
- **Could the app unintentionally appeal to children?** No.

### Data safety

**Overview**

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes |
| Which methods of account creation does your app support? | My app does not allow users to create an account. People sign in with a put.io account made on put.io's site. Choosing OAuth would make Play ask for an account-deletion URL, which can't exist for put.io accounts. |
| Do you provide a way for users to request that their data is deleted? | Optional for apps without their own accounts. Skip it, or link to the "Keeping and deleting your data" section of the privacy policy. |

**Data types.** Declare these two. Leave everything else unticked.

| Data type | Collected | Shared | Processed ephemerally | Required or optional | Purpose | Why |
|---|---|---|---|---|---|---|
| App activity → **App interactions** | Yes | No | No | Required | Analytics | Vercel Web Analytics counts page views |
| App activity → **In-app search history** | Yes | Yes | No | Required | App functionality | Book titles and cover-picker searches go to Apple and Open Library |

### Advertising ID

No. The app doesn't use it.

### Other declarations

| Declaration | Answer |
|---|---|
| Government app | No |
| Financial features | None |
| Health | None |
| News app | No |
| Sensitive permissions | None requested |

## 5. First release (Test and release → Testing → Internal testing)

1. Create a tester list with your own Google account and save it.
2. **Create new release.** When asked, accept **Play App Signing**.
3. Upload `android/app-release-bundle.aab`.
4. **Release name:**

   ```
   1.0.0 (1)
   ```

5. **Release notes:**

   ```
   <en-US>
   First release: your put.io audiobook library with chapters, speed control, a sleep timer, offline downloads and synced listening positions.
   </en-US>
   ```

6. Review and roll out. Open the opt-in link on your phone and install the app from Play.

## 6. After the first upload: fix the URL bar

Play re-signs the app with its own key, so the copy installed from Play shows a browser URL bar until the site trusts that key too.

1. Go to **Test and release → Setup → App integrity → App signing** and copy the **App signing key certificate SHA-256 fingerprint**.
2. Add it to `.well-known/assetlinks.json`, next to the existing upload-key fingerprint:

   ```json
   "sha256_cert_fingerprints": [
     "09:0C:1A:2F:2F:CA:2D:17:AE:4C:33:E2:85:4F:F7:57:C4:FC:91:6A:97:86:84:2B:59:DD:70:38:EB:5E:1B:54",
     "<PLAY APP SIGNING SHA-256>"
   ]
   ```

3. Deploy, then check that it returns `"linked": true` (replace the fingerprint at the end of the URL):

   ```
   https://digitalassetlinks.googleapis.com/v1/assetlinks:check?source.web.site=https://putio-audiobooks.vercel.app&relation=delegate_permission/common.handle_all_urls&target.android_app.package_name=app.vercel.putio_audiobooks&target.android_app.certificate.sha256_fingerprint=<PLAY APP SIGNING SHA-256>
   ```

4. Reinstall from Play. The URL bar should be gone.

## 7. Closed testing, then production

For personal accounts created after 13 November 2023:

1. **Testing → Closed testing:** create a track, add at least 12 testers (a Google Group or an email list), and promote the internal release to it.
2. Keep at least 12 testers opted in for 14 days in a row.
3. **Dashboard → Apply for production:** answer the questions about your testing.
4. Once approved, promote the release to **Production**. The first review usually takes a few days.

For organisation accounts, or personal accounts created earlier, go straight from internal testing to production.

## Later releases

Web changes reach the app without a new build, because the app opens the live site. Rebuild only when the Android wrapper changes (name, icon, colours, Bubblewrap update):

1. Bump `appVersionCode` (and `appVersionName` if you want) in `android/twa-manifest.json`.
2. In `android/`, run `npx @bubblewrap/cli update`.
3. Build with the Keychain password:

   ```sh
   PW=$(security find-generic-password -s putio-audiobooks-keystore -w)
   BUBBLEWRAP_KEYSTORE_PASSWORD="$PW" BUBBLEWRAP_KEY_PASSWORD="$PW" npx @bubblewrap/cli build
   ```

4. Upload the new `app-release-bundle.aab` to a new release.

## Watch out for

- **Impersonation review.** "put.io" is someone else's trademark. The listing says "for put.io" and that the app is unofficial, which is the usual pattern. If Play still rejects it, the feature graphic (it shows "put.io Audiobooks" next to the icon) and the screenshots are the first things to change.
- **Lost upload key.** If `android.keystore` or its password is lost, you can ask for an upload-key reset in the Play Console. Thanks to Play App Signing, existing installs keep working.
