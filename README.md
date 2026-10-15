# Creator Hub

Aiden's internal hub for brand collaborations. It tracks monthly post quotas, where each post is in the pipeline, and the links that prove a post went live.

**Stack:** Next.js 16 · React 19 · Supabase (Postgres + email login) · deployed on Vercel.

---

## 1. Run it locally (demo mode, 2 minutes)

With no Supabase keys, the app runs on **in-memory sample data** and has no login. Use it to try the UI.

```bash
node -v          # must be 22+ (24 LTS recommended) on both machines (see .nvmrc); npm install refuses older versions
npm install
npm run dev      # → http://localhost:3000
```

A yellow banner at the top means you're in demo mode. Demo data resets whenever the server restarts.

---

## 2. Go live: Supabase + Vercel (multi-user, invite-only)

Cloud mode = Supabase for login, the database (every user only sees their own rows) and media files (a private
Storage bucket; the browser uploads straight to it with signed URLs), Vercel for hosting. The media **tools** stay
local-only (hidden on Vercel), except **Sign PDF**, which runs in the browser. Cloudflare R2 is an optional swap for
media later (section B).

**A. Supabase** ([supabase.com](https://supabase.com), free tier is fine to start)
1. New project (region close to your users, e.g. West US). Keep the database password.
2. **SQL Editor → New query**: paste and run, one after the other, `supabase/migrations/20260928000000_init.sql`,
   `20261014000000_workspace.sql` (invites `vuquocanh12052007@gmail.com` as admin) and `20261015000000_media_bucket.sql`
   (creates the private `media` bucket).
3. **Sign-in is email + password.** Invited people click *Create account* on the login page; the server creates the
   account (already confirmed), so no confirmation email is involved. Turn **Authentication → Sign In / Providers →
   "Allow new users to sign up" off**: that blocks sign-ups straight through Supabase's API, and the app's own
   *Create account* (service role, invite-checked) keeps working.
4. **Authentication → Emails → SMTP** (optional): email is only used for *Forgot password?*. The built-in sender allows
   just a few emails per hour, which is fine for resets; plug in a real sender (e.g. Resend) if that becomes a problem.
5. **Authentication → URL Configuration**: Site URL = your Vercel URL; Redirect URLs = `https://<app>.vercel.app/**`
   and `http://localhost:3000/**` (needed for the password-reset link).
6. **Project Settings → API**: copy the Project URL, the publishable/anon key and the **service_role** key (secret).

**B. Media storage**: nothing to do, the `media` bucket from A.2 is it. Limits on Supabase **Free**: 1 GB in total and
**50 MB per file**, so the app defaults to 200 MB per invited user and 50 MB per file (admins: no total cap). Free
projects also **pause after a week with no activity** (un-pause in the dashboard). On **Pro** ($25/mo: 100 GB, big files,
no pausing) raise the limits with `STORAGE_LIMIT_MB` / `MAX_UPLOAD_MB` in Vercel.

<details><summary>Optional: Cloudflare R2 instead (10 GB free, no download fees, no 50 MB cap)</summary>

Setting the four `R2_*` variables switches media to R2 (defaults become 2 GB per user, 500 MB per file). Files already
in Supabase Storage aren't moved automatically.
1. dash.cloudflare.com → **R2** → enable it (asks for a card) → create bucket `creator-hub-media`.
2. Bucket → **Settings → CORS policy**, paste (with your real Vercel URL):
   ```json
   [{ "AllowedOrigins": ["https://<app>.vercel.app", "http://localhost:3000"],
      "AllowedMethods": ["GET", "PUT", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. **R2 → Manage API tokens → Create token**: *Object Read & Write*, only this bucket. Add `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` to Vercel and `.env.local`.
</details>

**C. Vercel**
1. **Add New → Project** → import `creator-hub` from GitHub.
2. **Environment Variables** (all environments): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` (and the `R2_*` ones only if you chose R2).
   Without the Supabase ones the site refuses to run (it never serves the login-less local mode publicly).
3. Deploy, then put the URL into Supabase (A.5) (and the R2 CORS rule if you use R2).
4. Vercel's free Hobby plan is for non-commercial use; move to Pro if you start charging.

**D. Your existing local data → your account**
Create your account on the live site (*Create account*, with the invited email), put the same keys in `.env.local` on the Mac, then:
```bash
node --env-file=.env.local scripts/import-local.mjs vuquocanh12052007@gmail.com
```
It copies collabs, posts, Launchpad, hashtag sets, program tags, Characters, prompts and all media (to Supabase Storage,
or R2). Files over the per-file limit are skipped and listed. Local files are untouched.

**E. Inviting creators**: sidebar → **Invites** (admins only). Add their email and send them the site's link; they click
*Create account* and pick a password. Only invited emails can create one. They start with an empty workspace.
Each user gets 200 MB of media and 50 MB per file by default (2 GB / 500 MB with R2); change with `STORAGE_LIMIT_MB` / `MAX_UPLOAD_MB`.

**Running locally with cloud data:** with the keys in `.env.local`, `npm run dev` on the Mac uses the same database and
media as the live site **and** keeps the local tools. Without them it's local mode (`.tools/data`, no login).

---

## 3. Two machines (Asus + Mac Mini) with Git

The code lives on GitHub. In cloud mode the data lives in Supabase + R2, so both machines and the live site see the same data. Secrets live in `.env.local` on each machine and are **never committed**.

### First time, on the Asus (where the project is now)

```bash
cd C:\Users\ASUS\Documents\Personal_Hub
git init -b main
git add .
git commit -m "Creator Hub v1"
# Create an EMPTY private repo on github.com called creator-hub, then:
git remote add origin https://github.com/<you>/creator-hub.git
git push -u origin main
```

With the GitHub CLI installed, you can replace the last two lines with `gh repo create creator-hub --private --source . --push`.

### First time, on the Mac Mini

```bash
cd ~/Projects                      # anywhere NOT inside iCloud Drive
git clone https://github.com/<you>/creator-hub.git
cd creator-hub
npm install
# Create .env.local — copy it from the Asus, or run `vercel env pull .env.local` after step 4
npm run dev
```

### Every session, on either machine

```bash
git pull                    # always first
npm install                 # only if package-lock.json changed in the pull
npm run dev
# … work …
git add -A && git commit -m "what changed" && git push    # before you leave the machine
```

Rules that prevent pain:

- **Push before you walk away**, even half-finished work (`git commit -m "wip"`). Unpushed work stranded on the other machine is the most common failure.
- **Never put the repo in OneDrive, iCloud Drive or Dropbox.** They sync `.git` and `node_modules` halfway through changes and corrupt them.
- **Rename files with `git mv`.** Windows ignores case in file names and macOS/Linux don't, so `button.tsx` → `Button.tsx` can break the build on the other machine.
- `node_modules` is built separately on each machine; it is never committed.
- Line endings are normalized by `.gitattributes`, so Windows and Mac produce identical diffs.

---

## 4. Deploy to Vercel

See section 2. After the first deploy, every `git push` to `main` deploys automatically. On your phone, open the URL and use **Add to Home Screen**.

---

## 5. Tools (remove background · YouTube → MP3 · video downloader · transcribe · compressors · sign PDF)

Under **Tools** in the sidebar. Most run on **your own computer** and are hidden on Vercel. **Sign PDF** runs entirely in the browser, so it works on the hosted site too.

**Setup (once per machine):** `npm install`. That installs ffmpeg/ffprobe and the background-removal model from npm, then downloads the official standalone **yt-dlp** for your OS into `.tools/bin/` (checksum-verified). If that last step fails (offline, say), run `npm run tools:setup` later. The **Setup** box on `/tools` shows what's installed.

| Tool | What it does |
|---|---|
| **Remove background** | Drop, choose or paste images → transparent PNG (or white / black / any colour). Runs the ISNet model locally via onnxruntime; images never leave the machine. "Best" ≈ 88 MB model, "Fast" ≈ 44 MB. |
| **YouTube → MP3** | Paste a link → MP3 (128–320 kbps) with title, channel and square cover art embedded. Works on most sites yt-dlp supports, not just YouTube. |
| **Video downloader** | Any yt-dlp site (YouTube, TikTok, Instagram, X, Vimeo…). Pick a max resolution and either **MP4 · H.264** (opens in CapCut/Premiere/phones) or **max quality** (VP9/AV1, may be MKV). |
| **Transcribe** | Paste a link → transcript. Uses the video's own captions when it has them (instant), otherwise **Whisper** transcribes the audio on this computer (whisper.cpp, Metal GPU on the Mac mini). Also takes uploaded audio/video files. Copy, or save TXT / SRT / VTT; transcripts are kept in `.tools/transcripts/` until you delete them. |
| **Compress video** | Drop videos → smaller MP4. Pick **how much** (Light / Balanced / Strong / Max, i.e. x264 CRF 20/24/28/32) or a **target size** in MB (two-pass; lowers the resolution itself if the size is too tight to stay sharp, and re-encodes once more if it overshoots). Optional max resolution, 30/24 fps cap, H.265 (≈40% smaller, uses whichever encoders this machine's ffmpeg has), audio 128/64 kbps or none. One video at a time. |
| **Compress images** | Drop, choose or paste images → smaller files. **Quality** slider or **target size** in KB (searches for the highest quality that fits, shrinks the image if it must). Keep the format or convert to JPG / WebP / AVIF / PNG, cap the longest side, strip or keep EXIF/location. HEIC (iPhone) photos work on the Mac via `sips`. If the result would be bigger than the original, you get the original back. |
| **Sign PDF** | Open a PDF → place your **signature**, **initials**, **text**, **today's date** and **✓ / ✗ / •** marks → drag to move, corner to resize, *All pages* for initials → **Download signed PDF** (`name-signed.pdf`). Make a signature by drawing (mouse, trackpad, finger, Apple Pencil pressure), typing (4 handwriting fonts, Vietnamese OK) or a photo of it on paper (the paper is removed). Saved signatures live in **this browser only** (localStorage), never on the server. Everything runs in the browser (pdf.js renders, pdf-lib writes); the PDF is never uploaded. Handles rotated pages and crop boxes. It's a visible e-signature, not a certificate-based digital signature. Locked (encrypted) PDFs: Print → Save as PDF first. |

- **Whisper models** are downloaded once from the Transcribe page (*Large v3 Turbo* ≈574 MB, recommended; *Small* ≈190 MB for the laptop) into `.tools/models/`.
- Finished files download to your browser's Downloads folder automatically. Working copies sit in `.tools/work/` and are deleted after 6 hours (or when you click ✕).
- **When YouTube downloads break** (it changes often): click **Update yt-dlp** on `/tools`, or run `npm run tools:update`.
- **Private / age-restricted / members-only videos:** set *Sign-in cookies* to the browser you're logged into. yt-dlp reads that browser's cookies (read-only; macOS may ask for Keychain access the first time).
- Everything the tools write stays inside this folder: `.tools/` (git-ignored) and `node_modules/`.
- Only download content you have the rights to use.

---

## 6. Prompts

`/prompts` (sidebar + phone tab bar): a library of the prompts behind your videos and images. Each entry has the prompt (plus an optional negative prompt), the model, video/image, the **links where the result was posted** (TikTok, Instagram, YouTube, X, Facebook, Threads, Pollo, Dreamina — detected from the URL), media (reference images, a cover frame, or the result clip), tags, which collabs it was for, and notes. Search across everything, filter by model/tag/favourites, copy a prompt in one click, or **New version** to iterate on one without touching the original. Stored in `.tools/data/prompts.json`; media use the same asset store as the Launchpad.

## 7. Launchpad & Characters

- **Launchpad** (`/launchpad`) — prep posts ahead and post them by hand when it's time.
  - Each post holds its media, one caption (with optional per-platform versions for X / Instagram / Facebook), hashtags, a first comment, a link and a time per platform.
  - Live checks: character limits, Instagram's 5-hashtag limit, and missing **program tags** (e.g. `#DreaminaCPP @dreamina_cpp`), with a one-click fix. Hashtag sets save reusable tags.
  - When a post is due it appears under **Due now**, with a count badge in the sidebar and the browser tab. Desktop alerts are optional. Each post gets a copy kit: save media, copy caption / hashtags / first comment, and open the app (X opens with the text already filled in).
  - **Mark posted** + the live link → the post counts toward each collab it's tagged with. Undo removes the entry again.
  - List and calendar views, filtered by platform and collab, plus a this-month strip for quota collabs.
- **Characters** (`/characters`) — a photo album of your character images. Drop, choose or paste images. Click one to view it full size (← → to browse), **Copy image** to paste it straight into an AI tool, download or delete.
- **Storage:** with no Supabase keys, everything (collabs, posts, Launchpad, characters, uploaded media) is saved on this computer in `.tools/data/`. It survives restarts but doesn't sync to the laptop. Moving this to Supabase/cloud storage is the next decision.


- A post **counts toward the month it went live** (`posted_at`), not the month it was planned.
- **Up next** for the current month is everything due this month, plus anything overdue or undated.
- Status per collab:

| Status | Meaning |
|---|---|
| **Done** | Quota met |
| **On track** | Posts marked *Ready* cover what's left |
| **On pace** | Posted count is at or above an even pace for today's date |
| **Tight** | Behind pace; only makes it if the drafts get finished |
| **At risk** | Behind pace, and ready + drafting posts can't cover the gap |
| **Missed** | A past month that closed under quota |

- Tick the checkbox when a post goes live. That sets it to *Posted* with today's date, and you can undo it from the toast. Then add the live link: the overview flags posts that are **missing links**, because the link is your proof to the brand.
- Keyboard: **N** opens a new post.

---

## Project map

```
src/
  proxy.ts                    auth gate (Next 16's name for middleware)
  app/
    (app)/page.tsx            overview (month view, ?m=YYYY-MM, ?view=table)
    (app)/collabs/…           collab list + collab page (6-month history)
    (app)/posts/page.tsx      all posts with filters
    (app)/prompts/…           prompt library (list + editor)
    (app)/tools/(local)/…     Tools that need this computer (remove background, YouTube → MP3, video downloader, transcribe, compressors); 404 on Vercel
    (app)/tools/sign-pdf/     Sign PDF (browser-only, also works hosted)
    api/pdfjs/…               serves pdf.js's worker, fonts and CMaps from node_modules
    api/tools/…               tool endpoints (local only): status, yt-dlp jobs, background removal, transcripts, compressors
    actions.ts                every write (server actions)
    login/, auth/callback/    email + password sign-in, invite-only Create account, Forgot password → login/reset
    globals.css               Paper + Dusk design tokens and all styles
  components/                 editor dialogs, checklist rows, tables, icons
  components/tools/           client UI for the tools (sign-pdf/: editor, signature pad, canvas helpers)
  lib/
    domain.ts                 types + quota/status logic (pure, testable)
    dates.ts                  string-based date math (timezone-safe)
    data/                     repo interface: supabase.ts (live) · demo.ts (sample)
    tools/                    yt-dlp/ffmpeg discovery + job runner, background removal, transcripts (captions + Whisper), video/image compression
    pdf/                      Sign PDF data model (sign.ts) + export with pdf-lib (stamp.ts)
scripts/setup-tools.mjs       downloads yt-dlp into .tools/ (runs after npm install)
supabase/migrations/          schema + row-level security
```

## Ideas for later

- **Reminders:** a Vercel Cron job that emails or Telegrams you when a collab turns *At risk*.
- **Auto-verify:** pull your recent IG/TikTok posts through their APIs and match them to planned posts, so links fill themselves in.
- **Deal records:** compensation, contract PDFs, brief links, brand contacts.
- **Calendar view** of due and posted dates.
- **Monthly report export** to send each brand as proof of delivery.
