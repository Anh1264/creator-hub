# Creator Hub — project context (read this first)

_Last updated: 2026-10-05. Update this file at the end of any session that changes the app, its data, or the plan._
_Two copies: this file in the repo root, and `claude/PROJECT-CONTEXT.md` in the "creator-hub" Claude project. Keep them identical._

## What it is
Aiden's personal internal web app ("Aiden's Hub") for:
1. **Tracking brand/platform collab posting quotas** (Creative Partner Programs — monthly video/post requirements).
2. **Built-in creator tools** that replace websites he used to visit (background remover, YouTube→MP3, video downloader, transcriber).

Single user. Owner: Aiden Vu (vuquocanh12052007@gmail.com).

## Where things live
- **Code (Mac mini M4):** `/Users/quocanh/Documents/AI_Work/creator-hub`. This is the folder connected to Cowork sessions. In device_bash it's `$HOME/mnt/creator-hub`.
- **GitHub:** `https://github.com/Anh1264/creator-hub`. Only commit "Creator Hub v1" is pushed; **all work below is uncommitted** on the Mac.
- **Second machine:** Asus Zenbook (Windows), which syncs via GitHub. Code must stay cross-platform (Windows + macOS).
- Repo docs: `README.md` (setup, tools, project map) and `AGENTS.md` (coding rules; `CLAUDE.md` just includes it).

## Stack
- Next.js 16.3.6 (App Router, Turbopack, `src/proxy.ts` instead of middleware).
- React 19, TypeScript, plain CSS tokens in `src/app/globals.css`.
  - "Paper" light and "Dusk" dark themes; Newsreader + Inter fonts.
  - Notion-like layout classes: `.page`, `.crumbs`, `.g` cards, `.tbl`, `.tag t-*`, `.btn`, `.callout`, `.seg`, `.opts`, `.job`, `.drop`.
- Supabase (Postgres + email-code auth + RLS) is **not configured yet**, so the app runs in **local mode**:
  - Collabs/posts use the demo repo (`src/lib/data/demo.ts`), now **persisted** to `.tools/data/hub.json`. The seed in demo.ts is only used the first time.
  - Launchpad, characters and uploaded media are also local: `.tools/data/{launchpad,characters,assets}.json` + `.tools/data/assets/<id>/`, via the JSON-file helper `src/lib/local/db.ts`.
  - None of this syncs between machines yet. Aiden wants to decide storage + hosting later (Supabase or something else).
- Data access goes through `src/lib/data` (repo). Domain logic is in `src/lib/domain.ts`.
- Mutations are server actions in `src/app/actions.ts` (each calls `requireUser()`).
- Run locally with `npm install` then `npm run dev`, at http://localhost:3000. Before pushing: `npm run typecheck && npm run lint && npm run build`.

## Collab data (seeded in demo.ts, from Gmail, verified 2026-10-01)
All placeholder data was removed. Tracking starts **2026-10**; real join dates are in each collab's notes. No posts are seeded.

| Collab | Quota/mo | Key rule |
|---|---|---|
| Pollo AI | 6 | ≥5 videos published **public** on the Pollo site + ≥1 social post per calendar month. Earns 2,000 credits/mo, paid on the 5th–10th of the next month. From Oct 10, 2026, Bi-Weekly challenges become Official Theme Challenges (5+ videos → 1,000 credits). |
| Kinovi AI | 5 | Post 5+ pieces/month and submit them via the CPP Google Form before the monthly review. Bio must include "cpp @Kinovi". |
| Dreamina AI | 0 | No minimum; credits are paid per post. ≥30% of content must be made with Dreamina. Captions need #DreaminaCPP and @dreamina_cpp. Keep posts public for 60 days after the season ends. Season ends 2026-12-31 (endMonth set). |
| CapCut | 0 | Joined 2026-08-24; the welcome email lists no requirements. |
| WaveSpeedAI | 0 | Joined 2026-09-11; the welcome email lists no requirements. |

## Launchpad (`/launchpad`) — built 2026-10-05
- **Purpose:** hold prepared posts (media + caption + hashtags + time) for **X, Instagram and Facebook**. Aiden posts **manually**: no auto-posting, he explicitly doesn't want it.
- **Post packet:** `QueueItem` in `src/lib/launch/types.ts`.
  - Fields: assets, master caption, hashtags, first comment, link, collabIds, characterIds.
  - Per-platform plan: enabled, custom caption, hashtags, IG "tags in first comment", scheduledAt (local `YYYY-MM-DDTHH:mm` in APP_TIMEZONE), status pending/posted/skipped, url, loggedPostIds.
- **Checks:** X 280 chars (URLs count as 23), IG 2,200 chars + **max 5 hashtags**, FB 63,206. Missing **program tags** (seeded: Pollo `#PolloAI`, Dreamina `#DreaminaCPP @dreamina_cpp`; editable on the page). Hashtag sets.
- **Copy kit:** `components/launch/kit.tsx`. Save media, copy caption/hashtags/comment, open the composer (X uses `x.com/intent/post?text=` so the text is prefilled), Web Share to apps on phones.
- **Mark posted:** creates posted entries in each tagged collab with the live URL as proof, so it counts toward the quota. Undo deletes them.
- **Due-now:** sidebar badge + tab title count + optional desktop notifications (`DueWatcher`, polls `/api/launchpad/due`).
- **Views:** list view (Due now / Coming up / Drafts / Posted) and month calendar, with platform/collab filters and a quota strip.
- **Server-side files:** server actions in `src/app/launch-actions.ts`; uploads via `POST /api/assets` (raw body streamed, ffprobe/sharp metadata + thumbnail); files served by `GET /api/assets/[id]` (Range support, `?thumb=1`, `?download=1`).

## Characters (`/characters`) — photo album (changed 2026-10-05)
- Aiden wants **just images for now, no descriptions** ("more like a photo album"). The earlier character-sheet version (token, costume inventory, prompt block) was removed at his request. Don't re-add fields unless he asks.
- Drop / choose / paste images → masonry grid (newest first) → lightbox with ←/→, **Copy image** (to clipboard as PNG, for pasting into AI tools), Download and Delete.
- Data: `characters.json` = `{ album: [{ assetId, addedAt }] }`. Old character sheets were migrated by keeping their images. `/characters/[id]` redirects to the album.
- Code: `components/characters/gallery.tsx` (`CharacterAlbum`), actions `addToAlbum` / `removeFromAlbum` in `launch-actions.ts`. `QueueItem.characterIds` still exists in the type but isn't used in the UI.

## Tools (Tools section in the sidebar; `/tools`)
Local-only: they run on the user's own computer. On Vercel they return 501 and show a "run locally" note. Everything they write stays inside `.tools/` (git-ignored).

- **Remove background** (`/tools/remove-bg`): `@imgly/background-removal-node` (ISNet, models bundled in npm, via onnxruntime-node).
  - Server route `/api/tools/remove-bg` returns a transparent PNG; the client can composite a white, black or custom background.
  - Processes one image at a time and honours EXIF rotation.
- **YouTube → MP3** (`/tools/youtube-mp3`) and **Video downloader** (`/tools/video-download`): yt-dlp jobs in `src/lib/tools/media.ts`.
  - MP3: 128–320 kbps, embedded tags, square-cropped cover art.
  - Video: max-resolution picker; "MP4 · H.264 edit-friendly" or "max quality (mp4/mkv)" mode.
  - Optional `--cookies-from-browser`. Up to 2 concurrent jobs, with progress and auto-download.
  - Work files are kept 6 h.
- **Transcribe** (`/tools/transcribe`): built 2026-10-05.
  - Uses the video's captions first (yt-dlp subs; parser in `captions.ts` handles YouTube rolling auto-captions).
  - Otherwise uses local **Whisper** via `@fugood/whisper.node` 1.1.3 (whisper.cpp, Metal on Apple Silicon).
  - Models are downloaded in-app into `.tools/models/`: Large v3 Turbo q5_0 (574 MB, recommended) or Small q5_1 (190 MB, for the laptop).
  - Also accepts file uploads (streamed to disk).
  - Output: copy, TXT, SRT or VTT; clickable YouTube timestamps; "Redo with Whisper" button.
  - Transcripts persist in `.tools/transcripts/`. The model is released after 10 idle minutes.
  - **Language handling:**
    - With "Auto-detect", audio is split into ≤28 s windows at pauses (ffmpeg silencedetect). Each window is language-detected separately, so mixed Korean/English videos work, and silent windows are skipped.
    - With a fixed language, the whole file is done in one pass.
    - Both modes use `maxContext: 0` + `temperatureInc: 0.2`, and `cleanLoops()` collapses repeated sentences.
- **Setup:**
  - `npm install` runs `scripts/setup-tools.mjs` (postinstall), which downloads the official standalone yt-dlp into `.tools/bin` (SHA-256 verified) and links the npm ffmpeg/ffprobe (`@ffmpeg-installer`, `@ffprobe-installer`) into `.tools/ffmpeg`.
  - `npm run tools:update` updates yt-dlp; there's also an "Update yt-dlp" button on `/tools`.
- **Key files:**
  - `src/lib/tools/{bin,media,removebg,whisper,transcribe,captions,shared,http}.ts`
  - `src/app/api/tools/**`
  - `src/components/tools/*`
  - `src/app/(app)/tools/**`
  - `next.config.ts` (serverExternalPackages + outputFileTracingExcludes keep native packages out of Vercel bundles)

### Status as of 2026-10-05
- Aiden ran `npm install`. yt-dlp is installed, and he has already used the downloaders.
- Aiden downloaded the Turbo model and ran a real mixed Korean/English video (37 min). The English parts came out as a Korean loop ("이것은 이것을 사용하는 일을 하고요…").
  - Cause: whisper.cpp auto-detects the language once, from the first 30 s, then forces it on the whole file; context conditioning then made it loop.
  - Fixed with per-window detection + anti-loop settings (see Transcribe). **Not yet re-verified on his Mac.**
- **Never verified against real YouTube.** The Claude sandboxes block YouTube and Hugging Face. Tests used synthetic media served on localhost, public-domain images, and a random-weights Whisper stand-in model.
  - The first real YouTube / Whisper run is Aiden's. Ask how it went and fix any issues.

## How to work on this project (rules for Claude)
- Only create or change files **inside the creator-hub folder**. Never touch anything else on his computer.
- **Edit flow:** stage → work in the cloud container (it has npm/pip network) → write back with `device_commit_files`.
  - Before overwriting, check the device file's mtime or sha. He may have changed it, e.g. `package-lock.json` after `npm install`.
- **Don't run `npm install` from the device VM.** It's Linux arm64 and would put Linux binaries into his macOS `node_modules`. Let Aiden run it.
- **Don't run git commands from the device VM.** They leave `.git/index.lock` behind (the VM can't delete it without permission). Aiden commits and pushes himself.
- **Testing in the container:**
  - Google Fonts are blocked, so build with `next build --webpack` and set `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` to a mock file. Alternatively, temporarily strip the fonts to test a Turbopack build.
  - Use Playwright (Python) for UI screenshots.
  - Only use synthetic or public-domain test media.
- Keep the UI consistent with the existing tokens and classes, and check it on mobile (the tab bar has 6 items: Overview / Launch / Collabs / Posts / Cast / Tools).
- **Aiden's preferences:** direct, concise, brutally honest feedback (challenge ideas, name avoidance). He infers scope from short prompts, so infer it fully too.

## Open items / next steps
- [ ] Aiden: re-run the mixed-language video with Language = Auto-detect (mixed OK) and check the English parts. If a part is still wrong, set Language explicitly.
- [ ] Commit and push all the uncommitted work to GitHub so the Asus laptop gets it.
- [ ] **Decide storage + hosting** (Aiden deferred this, 2026-10-05). Options: Supabase (Postgres + Storage; the free storage tier is small for video), or keep local on the Mac mini and reach it from the phone over Wi-Fi/Tailscale. Migrating means porting `.tools/data/*.json` + `assets/` and adding a Supabase repo for Launchpad/characters (schema migration in `supabase/migrations/`).
- [ ] Optional: deploy to Vercel (README §4). The tools stay local-only. **Launchpad uploads also need real storage before hosting.**
- [ ] Launchpad phase 2/3 ideas not built yet: deadline reminders for program submissions (Dreamina 7-day performance claim, Kinovi monthly form), asset fixes (reframe 9:16/4:5, compress, cover frame), batch scheduling, post history with view counts, phone access over the LAN.
- [ ] Suggested next tools, agreed as highest value but not built yet:
  1. **Video toolkit** on ffmpeg: grab the last frame (for chaining Seedance shots), reframe 16:9→9:16 with a blurred background, compress, trim, join, GIF.
  2. **CPP caption builder + quick-log**: pick a collab, get the correct hashtags and mentions, and log the post against its quota in one click.
  3. Later: auto-captions to SRT for his own shorts (now covered by Transcribe → upload), an AI upscaler (Real-ESRGAN), and an image converter (HEIC→JPG, resize).

## Change log
- **2026-10-01:** Replaced the placeholder collabs with the 5 real CPPs from Gmail (demo.ts).
- **2026-10-05:** Added Tools: remove background, YouTube→MP3, video downloader (plus setup script and README section).
- **2026-10-05:** Added Transcribe (captions + local Whisper, uploads, TXT/SRT/VTT). Fixed the UX by adding an inline model-download button.
- **2026-10-05:** Added this context file (repo root + Claude project doc); AGENTS.md points to it.
- **2026-10-05:** Added **Launchpad** (post queue + copy kit + checks + calendar + due alerts + mark posted → quota) and **Characters** database. Local mode now persists everything to `.tools/data/`.
- **2026-10-05:** Characters simplified to an image-only photo album (his request).
- **2026-10-05:** Transcribe fix: per-window language detection for mixed-language audio, silent-window skipping, anti-repetition (maxContext 0, temperature fallback, cleanLoops), and multiple languages shown (e.g. "Korean + English").
