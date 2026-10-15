# Creator Hub — project context (read this first)

_Last updated: 2026-10-15._ Update this file at the end of any session that changes the app, its data, or the plan._
_Two copies: this file in the repo root, and `claude/PROJECT-CONTEXT.md` in the "creator-hub" Claude project. Keep them identical._

## What it is
Aiden's personal internal web app ("Aiden's Hub") for:
1. **Tracking brand/platform collab posting quotas** (Creative Partner Programs — monthly video/post requirements).
2. **Built-in creator tools** that replace websites he used to visit (background remover, YouTube→MP3, video downloader, transcriber, compressors, Sign PDF).

Owner: Aiden Vu (vuquocanh12052007@gmail.com). **Since 2026-10-14 it's becoming a multi-user product**: Aiden wants to host it and let other creators use it, each with their own data (invite-only beta). See "Cloud mode" below.

## Where things live
- **Code (Mac mini M4):** `/Users/quocanh/Documents/AI_Work/creator-hub`. This is the folder connected to Cowork sessions. In device_bash it's `$HOME/mnt/creator-hub`.
- **GitHub:** `https://github.com/Anh1264/creator-hub`. Pushed up to `d514603` "Video + image compressors, fix 10MB upload cap". The tool colours + Prompts work (2026-10-11) is **uncommitted** until Aiden commits it.
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

## Cloud mode (multi-user) — built 2026-10-14, not deployed yet
- **Decided with Aiden:** Vercel + Supabase (**media in Supabase Storage since 2026-10-15**: Aiden didn't want to learn R2; R2 stays as an optional backend). Invite-only beta. The tools are local-only (hidden on Vercel: they live in the `(app)/tools/(local)/` route group whose `layout.tsx` 404s when `VERCEL` is set), **except Sign PDF**, which runs in the browser and is shown hosted too (`browser: true` in the registry, `toolsFor(IS_HOSTED)`). YouTube→MP3 / video downloader stay private to Aiden's Mac (ToS/DMCA risk, and YouTube blocks cloud IPs). Phase 2: port remove-bg + compressors to run in the browser.
- **Modes** (`src/lib/env.ts`): no Supabase env → local mode (`.tools/data`, no login, refuses to run on Vercel: proxy returns 503 and `currentUser()` returns null). Supabase env → cloud data. `IS_HOSTED` (= `VERCEL`) hides tools. On the Mac with cloud keys in `.env.local` = cloud data + local tools.
- **Schema:** `supabase/migrations/20261014000000_workspace.sql` → `invites` (service role only), `profiles` (is_admin, program_tags_seeded; users can only update display_name/program_tags_seeded), `assets` (metadata; 16-hex ids; bytes in storage at `<user_id>/<id>/original.ext` + `thumb.jpg`), `launch_items` (platforms jsonb), `hashtag_sets`, `program_tags`, `album`, `prompts` (`prompts_touch` keeps updated_at when only `favorite` changes). RLS = own rows; program_tags/album also check the referenced collab/asset is yours. Trigger `enforce_invite` (BEFORE INSERT on auth.users) rejects uninvited emails; `handle_new_user` creates the profile (is_admin from the invite). Seeds Aiden's invite as admin.
  - Tested on Postgres 16 with Supabase-like stubs: RLS isolation, invite gate, is_admin escalation blocked, cascade delete.
- **Data layer:** `lib/launch/store.ts` and `lib/prompts/store.ts` are async facades over `local-store.ts` / `cloud-store.ts`. Media: `lib/media/assets.ts` (listAssets/startUpload/finishUpload/deleteAssets/sweepOrphans/assetRedirect) + `lib/media/storage.ts`, which picks **`supabase-storage.ts`** (default: private bucket `media` from `supabase/migrations/20261015000000_media_bucket.sql`, service-role client, `createSignedUploadUrl` / `createSignedUrl` / `info` / `remove`; no storage policies needed because only the server touches it after `assets` RLS) or **`r2.ts`** when the `R2_*` env vars are set (aws4fetch, presigned URLs; `R2_ENDPOINT` override for tests). Upload tickets carry `headers` (Supabase: the publishable `apikey`). Download names are folded to ASCII for Supabase because supabase-js `encodeURI`s the signed URL (double-encodes non-ASCII). `lib/media/housekeeping.ts` sweeps unreferenced uploads >24 h (called after saves).
- **Uploads (cloud):** `POST /api/assets/upload` → signed PUT URLs for file + thumb → browser PUTs to storage (XHR progress) and renders its own ≤640 px JPEG preview + size/duration (`components/launch/uploader.tsx`) → `POST /api/assets/[id]/complete` (checks the object exists). `GET /api/assets/[id]` → 302 to a signed GET. Quota per non-admin: `STORAGE_LIMIT_MB` / `MAX_UPLOAD_MB`, defaults **200 MB / 50 MB on Supabase** (Free = 1 GB total, 50 MB per file, pauses after 7 idle days), 2048 / 500 with R2. A 413 from storage shows a "compress it first" message. R2 (if used) needs a CORS rule (README §2.B).
- **Auth (changed 2026-10-15 at Aiden's request: "email and password only"):** `login/actions.ts` → `signIn` (signInWithPassword), `signUp` (invite check, then `auth.admin.createUser({ email_confirm: true })` with the service role, then signs in: no confirmation email), `sendReset` (resetPasswordForEmail → `/auth/callback?next=/login/reset`; same answer whether or not the account exists), `setNewPassword` (`/login/reset`, updateUser). Passwords 8–72 chars. Supabase "Allow new users to sign up" is meant to be **off** so nobody can sign up through the raw API; admin createUser ignores it. Known trade-off: no email confirmation, so whoever creates the account first for an invited email owns it (fine for invite-only; fix later with invite tokens if needed). The old OTP/code login is gone. Proxy: any session = signed in. `lib/auth.ts`: `currentUser()` {id,email,isAdmin}, `userTimezone()` from a `tz` cookie set by `TimezoneCookie` (nav.tsx), `userToday()`. `ALLOWED_EMAILS` is gone (`ADMIN_EMAILS` only as a fallback when no service key).
- **Admin:** `/admin` ("Invites" in the sidebar for admins): add/remove invites, see who joined + storage used, optionally delete an account (cascades all data). `app/admin-actions.ts`.
- **Import:** `scripts/import-local.mjs` copies `.tools/data` (collabs, posts with id remapping, Launchpad incl. loggedPostIds, sets, program tags, album, prompts, media → Supabase Storage or R2; files over MAX_UPLOAD_MB are skipped and listed) into a user (must have signed in once). Refuses if the account already has collabs (`--force`).
- **End-to-end tested in the cloud sandbox** with PostgREST + a fake GoTrue `/user` endpoint + moto S3: two users, uploads (image + video), prompts, album, Launchpad edit, admin invites, B can't see or fetch A's data/media, import script. Not tested: real Supabase email delivery, real Supabase Storage (the storage module was only checked against a mock of the storage API), real R2, Vercel build/runtime. Headless Chromium can't decode H.264, so video previews weren't verified (real browsers can).
- **Live setup (2026-10-15):** Supabase project `creator-hub` (ref `raaammzrehouaigwzgtw`, org QAI, Free plan, us-east-2). Claude ran the three migrations via the dashboard SQL editor in the browser pane and verified them (10 tables with RLS, private `media` bucket, admin invite, both auth triggers). Site URL = https://creator-hub-olive.vercel.app, redirect URLs = that `/**` + `http://localhost:3000/**`. `.env.local` on the Mac holds the URL, publishable key and Aiden's secret key (he pasted the secret himself). Vercel deploy: https://creator-hub-olive.vercel.app. Email templates are locked until custom SMTP is set up (only matters for reset emails now).
- **Waiting on Aiden:** push the password-login change, create his account on the live site, run the import script.
- Known gaps: Supabase built-in email is rate-limited (only password resets use email now); Vercel Hobby is non-commercial; no account settings page yet (display name unused); new users start empty (no CPP templates).

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

## Prompts (`/prompts`) — built 2026-10-11
- Aiden asked to "store my prompts and link that to the video I created" via its social media link.
- `PromptEntry` (`src/lib/prompts/types.ts`): title, kind video/image, model (free text + suggestions), prompt, negative, links `{url, platform}` (platform detected from the host), assetIds (shared asset store; first image = cover), tags, collabIds, notes, favorite.
- Store `src/lib/prompts/store.ts` → `.tools/data/prompts.json`. **The Launchpad orphan sweep includes `promptAssetIds()`**, otherwise prompt media would be deleted after 24 h.
- Actions `src/app/prompt-actions.ts`: savePrompt (title defaults to the first words of the prompt), deletePrompt (deletes its media), toggleFavorite, newVersion (copy titled "(v2)", "(v3)"… without links/media).
- UI: `components/prompts/{library,editor,copy}`. Library = search + kind/favourite/model/tag chips + cards (cover, excerpt, platform link pills, Copy prompt). Editor = monospace prompt box with Copy, links list (paste several at once), media uploader with "Make cover", tags, "Made for" collab chips, notes, ⌘S.
- Nav: sidebar under Characters, and a 7th phone tab ("Prompts"); checked at 390 px wide.

## Per-tool colours — 2026-10-11
- Each tool page (and Prompts) has its own colour and cover pattern via `ToolPage` (`components/tools/tool-page.tsx`) + `components/tools/registry.tsx` (single list of tools used by the sidebar, the /tools gallery and the pages).
- Colours in `globals.css` under `[data-tool="…"]` with a light (`--tool-l`) and dark (`--tool-d`) version, mixed by `--dark` (0% Paper / 100% Dusk). Inside `.tool-page` the colour becomes `--accent`, so buttons, drop zones, focus rings and bars follow it.
- Remove bg = violet checkerboard · MP3 = red equaliser bars · Video downloader = blue film strip · Transcribe = green ruled paper · Compress video = pink rings · Compress images = teal pixel grid · Prompts = gold dots · Sign PDF = slate cheque cross-hatch. Sidebar icons and gallery cards use the same colours.

## Tools (Tools section in the sidebar; `/tools`)
All but Sign PDF are local-only: they run on the user's own computer, live in `src/app/(app)/tools/(local)/` and 404 on Vercel (their APIs return 501). Everything they write stays inside `.tools/` (git-ignored).

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
- **Compress video** (`/tools/compress-video`): built 2026-10-11. `src/lib/tools/compress-video.ts`.
  - Upload is streamed to `.tools/work/c-<id>/` (XHR on the client for upload progress), ffprobe'd, poster frame made, then queued. **One encode at a time.** Jobs in memory, kept 6 h.
  - **Quality mode:** Light/Balanced/Strong/Max = x264 CRF 20/24/28/32 (x265 = +4).
  - **Target-size mode:** two-pass at `(MB × 1e6 × 8 × 0.96) / duration − audio`. Auto-lowers resolution when bits-per-pixel drops below 0.055 (H.264) / 0.038 (H.265), drops audio to 64k if tight, errors if < 80 kbps of video. If the file overshoots, the last pass re-runs at a scaled bitrate (≤ 2 tries). If the input is already under the target → Balanced quality instead (with a note).
  - Options: max shorter side 1080/720/480, fps cap 30/24, H.264/H.265 (`hvc1` tag), audio 128/64/none, speed veryfast/medium/slow.
  - **Encoders are detected at run time** (`ffmpeg -encoders`): libx264 → h264_videotoolbox fallback; libx265 → hevc_videotoolbox. VideoToolbox can't do CRF, so quality levels map to bits-per-pixel. The bundled ffmpeg on the Mac is `@ffmpeg-installer/darwin-arm64` 4.1.5, **which encoders it has is unverified** (Linux build has libx264 + libx265).
  - Output `<name>-compressed.mp4` (faststart, yuv420p, even dims). Flags `bigger` when the result isn't smaller. Auto-saves when done unless bigger. The uploaded original is deleted after a successful encode.
  - Known limit: HDR (iPhone Dolby Vision/HLG) gets converted to 8-bit without tone-mapping, so colours may look washed out.
- **Compress images** (`/tools/compress-image`): built 2026-10-11. `src/lib/tools/compress-image.ts` (sharp 0.35).
  - Format same/JPG (mozjpeg)/WebP/AVIF/PNG (palette quantization below q100). Quality slider or **target KB** (encode at q10 first; if too big shrink by √(target/size); otherwise binary-search q 11–95). Max longest side 4096…720. EXIF stripped by default (rotation applied); "Keep camera & location data" keeps EXIF + ICC.
  - **HEIC:** sharp's prebuilt can't decode it → on macOS converts with `/usr/bin/sips`; on Windows it errors with a clear message.
  - Same format + no resize + result not smaller → returns the original bytes (`X-Kept-Original`). Animated GIF stays animated (GIF/WebP). One image at a time server-side.
  - Client: batch grid like Remove background, hold to compare, totals, "Redo with new settings", Save all.
- **Sign PDF** (`/tools/sign-pdf`): built 2026-10-15. **Browser-only**, works hosted; the PDF is never uploaded.
  - pdf.js (`pdfjs-dist` **6.3.289, pinned, legacy build** for older Safari/iOS) renders pages; **pdf-lib** 1.17.1 writes the result. Both are dynamically imported, so they only load on this page.
  - pdf.js worker + CMaps + standard fonts + wasm decoders are served from `node_modules` by `src/app/api/pdfjs/[...path]/route.ts` (whitelisted paths, no auth: public library files; `outputFileTracingIncludes` in next.config.ts keeps them in the Vercel bundle).
  - Model `src/lib/pdf/sign.ts`: items stored in **visual page space as fractions** (x, y, w, h of the rotated page). Export `src/lib/pdf/stamp.ts` maps back with the inverse of pdf.js `viewport.transform` (handles /Rotate 90/180/270 and CropBox offsets; draws rotated so it looks upright). Verified on rotated + cropped pages.
  - Item types: image (signature/initials PNG), text (Helvetica, vector; **falls back to a 6× PNG when the text has non-WinAnsi chars**, e.g. Vietnamese), mark (✓ ✗ • as vector SVG paths).
  - UI `src/components/tools/sign-pdf/`: `index.tsx` (editor: sticky toolbar, pick → click to place, drag/resize, floating item bar with Edit / ink black-blue / **All pages** / delete, ⌘Z undo, arrows nudge, ⌫ delete, Esc), `pad.tsx` (new signature/initials: Draw with velocity/pressure width, Type in 4 handwriting fonts from `fonts.ts` (Ms Madi, Great Vibes, Dancing Script, Square Peg; all with Vietnamese), Upload photo → paper removed by luminance threshold), `ink.ts` (trim, photo→ink, text→PNG, saved-signature store).
  - Saved signatures: **localStorage `hub.sign.marks.v1`** (per browser, via `useSyncExternalStore`, synced across tabs). Deliberately not in Supabase (privacy).
  - Pages render lazily (IntersectionObserver, 1200 px margin) and free their canvas when far off-screen. Encrypted PDFs are refused with a "Print → Save as PDF first" message (pdf-lib can't write them). Warns before leaving with undownloaded signatures. The new-post FAB is hidden on this page.
  - It's a visible e-signature, not a certificate-based (PAdES) digital signature; the page says so.
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

### Status as of 2026-10-11
- **Fixed a latent upload bug:** with `src/proxy.ts` in front of `/api/*`, Next.js buffers request bodies and **cuts them off at 10 MB** (`proxyClientMaxBodySize`). Launchpad uploads, Transcribe file uploads and Remove-background images over 10 MB were silently truncated. The proxy matcher now skips `api/`; every API route already checks sign-in itself (`guard()` / `isSignedIn()`). If Supabase is turned on later, check that long-open pages' API calls still refresh the session.
- Compressors tested in the cloud container (Linux ffmpeg 4.1, synthetic media): quality levels, 2-pass size targets (1 MB / 2 MB hit), H.265 overshoot → re-fit, auto-resolution, rotated phone video, invalid file, image quality/target/AVIF/WebP/PNG/EXIF-rotation. **Not yet run on the Mac** (encoder set, `sips` HEIC path) or Windows.
- Also fixed the Turbopack "whole project traced" warning at `media.ts:254` (`turbopackIgnore`).

## Hosting plan (proposed to Aiden 2026-10-11, awaiting his go)
- Constraint: the Tools need a real computer (ffmpeg, yt-dlp, Whisper, onnxruntime), so they stay on the Mac mini whatever the host.
- **Recommended: all Cloudflare, two phases.**
  - **Phase 1:** the Mac mini runs the hub (`npm run build && npm start`, kept alive). **Cloudflare Tunnel** publishes it at e.g. `hub.<domain>`, and **Cloudflare Access** (email one-time PIN, only Aiden's address) sits in front. No code or data changes; everything works from the phone. Downside: Mac must be on.
  - **Phase 2:** app on **Cloudflare Workers** via `@opennextjs/cloudflare` (supports Next 16, but **not Node middleware**, so `src/proxy.ts` goes away and Access does auth). Data → **D1**, media → **R2** (10 GB free, no egress fees). Tools pages hand off to the Mac through the tunnel. Needs Workers Paid ($5/mo; the free plan's 3 MiB Worker limit is too small).
  - Rejected: Vercel Hobby (non-commercial only; 4.5 MB function body limit) + Supabase free (1 GB storage, pauses after 7 days idle). The existing Supabase repo code would be unused under this plan.
- Waiting on Aiden: does he own a domain (Cloudflare Registrar if not), Cloudflare account, and a "go" for phase 1.

## Open items / next steps
- [ ] Aiden: re-run the mixed-language video with Language = Auto-detect (mixed OK) and check the English parts. If a part is still wrong, set Language explicitly.
- [ ] Aiden: try both compressors on real footage/photos on the Mac (esp. a big iPhone video and a HEIC photo), then commit + push.
- [ ] Aiden: `npm install` (adds pdf-lib + pdfjs-dist), then try Sign PDF on a real contract in Safari and Chrome, incl. drawing with a finger on the phone. Then commit + push. Note the tool folders moved into `src/app/(app)/tools/(local)/` (git sees renames; URLs unchanged).
- [ ] Optional Sign PDF follow-ups: fill existing PDF form fields, certificate-based signing, remember last ink/size.
- [ ] Remove `Claude outputs/` from the repo (`git rm -r --cached "Claude outputs"` + .gitignore).
- [x] ~~Decide storage + hosting~~ → Vercel + Supabase (+ Supabase Storage for media since 2026-10-15), multi-user (2026-10-14). Old notes: Options: Supabase (Postgres + Storage; the free storage tier is small for video), or keep local on the Mac mini and reach it from the phone over Wi-Fi/Tailscale. Migrating means porting `.tools/data/*.json` + `assets/` and adding a Supabase repo for Launchpad/characters (schema migration in `supabase/migrations/`).
- [ ] Optional: deploy to Vercel (README §4). The tools stay local-only. **Launchpad uploads also need real storage before hosting.**
- [ ] Launchpad phase 2/3 ideas not built yet: deadline reminders for program submissions (Dreamina 7-day performance claim, Kinovi monthly form), asset fixes (reframe 9:16/4:5, compress, cover frame), batch scheduling, post history with view counts, phone access over the LAN.
- [ ] Suggested next tools, agreed as highest value but not built yet:
  1. **Video toolkit** on ffmpeg: grab the last frame (for chaining Seedance shots), reframe 16:9→9:16 with a blurred background, trim, join, GIF. (Compress is done.)
  2. **CPP caption builder + quick-log**: pick a collab, get the correct hashtags and mentions, and log the post against its quota in one click.
  3. Later: auto-captions to SRT for his own shorts (now covered by Transcribe → upload), an AI upscaler (Real-ESRGAN), and an image converter (HEIC→JPG, resize) — mostly covered by Compress images now.

## Change log
- **2026-10-01:** Replaced the placeholder collabs with the 5 real CPPs from Gmail (demo.ts).
- **2026-10-05:** Added Tools: remove background, YouTube→MP3, video downloader (plus setup script and README section).
- **2026-10-05:** Added Transcribe (captions + local Whisper, uploads, TXT/SRT/VTT). Fixed the UX by adding an inline model-download button.
- **2026-10-05:** Added this context file (repo root + Claude project doc); AGENTS.md points to it.
- **2026-10-05:** Added **Launchpad** (post queue + copy kit + checks + calendar + due alerts + mark posted → quota) and **Characters** database. Local mode now persists everything to `.tools/data/`.
- **2026-10-05:** Characters simplified to an image-only photo album (his request).
- **2026-10-05:** Transcribe fix: per-window language detection for mixed-language audio, silent-window skipping, anti-repetition (maxContext 0, temperature fallback, cleanLoops), and multiple languages shown (e.g. "Korean + English").
- **2026-10-11:** Added **Compress video** (quality levels or target MB, 2-pass, auto-resolution, H.264/H.265, fps/audio/speed) and **Compress images** (quality or target KB, JPG/WebP/AVIF/PNG, resize, EXIF, HEIC via sips). Proxy no longer runs on `/api/*` (fixes 10 MB upload truncation). README updated.
- **2026-10-11:** Added per-tool colours/cover patterns (`ToolPage` + registry) and the **Prompts** library (prompts ↔ posted links, media, tags, collabs, versions). Proposed the Cloudflare hosting plan.
- **2026-10-14:** Multi-user cloud mode: Supabase schema + RLS + invite-only sign-up, async local/cloud stores for Launchpad/Prompts/Characters/media, R2 direct uploads, /admin invites, per-browser timezone, import script, tools hidden on Vercel. Hosting plan changed from Cloudflare Tunnel to Vercel + Supabase + R2.
- **2026-10-15:** Added **Sign PDF** (browser-only: pdf.js + pdf-lib; draw/type/photo signatures saved per browser, initials, text, date, ✓/✗/• marks, all-pages, undo, rotated pages). Local-only tools moved into the `tools/(local)` route group so Sign PDF also works on Vercel; sidebar/tab bar/`/tools` show `toolsFor(IS_HOSTED)`. New `/api/pdfjs/*` route.
- **2026-10-15:** Media storage switched to **Supabase Storage** by default (`lib/media/storage.ts` → `supabase-storage.ts`; R2 only when `R2_*` is set), new migration `20261015000000_media_bucket.sql`, limits default to 200 MB/user + 50 MB/file, import script uploads to Supabase Storage. Next.js 16.3.6 → **16.3.8** (6 security advisories).
- **2026-10-15:** Login switched to **email + password** (invite-only Create account via service-role createUser, Forgot password → /login/reset). Supabase project set up from the browser pane (migrations, URLs); site live on Vercel at creator-hub-olive.vercel.app.
