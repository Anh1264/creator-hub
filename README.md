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

## 2. Go live with Supabase (≈15 minutes, one time)

1. **Create a project** at [supabase.com](https://supabase.com). The free tier is enough. Pick the region closest to you, for example West US.
2. **Create the tables:** open **SQL Editor**, then **New query**, paste all of `supabase/migrations/20260928000000_init.sql`, and click **Run**.
3. **Make the login email include a code.** Go to **Authentication → Emails**. In **both** the *Magic Link* template and the *Confirm signup* template, add this line:
   ```html
   <p>Your code: <strong>{{ .Token }}</strong></p>
   ```
   With a code you can request login on the laptop and read the email on your phone. The link in the email works too, but only in the browser that asked for it.
4. **Allow redirect URLs:** go to **Authentication → URL Configuration**. Set **Site URL** to your Vercel URL once you have one (step 4 below). Under **Redirect URLs**, add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`.
5. **Create `.env.local`** by copying `.env.example`. Fill in the values from **Project Settings → API**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ALLOWED_EMAILS=vuquocanh12052007@gmail.com
   APP_TIMEZONE=America/Los_Angeles
   ```
   If your project only shows an **anon** key, use it as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
6. Run `npm run dev` and sign in with your email.
7. **Lock it down:** after your first successful login, go to **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". The app already rejects emails that aren't in `ALLOWED_EMAILS`, and row-level security means no one else could see your data anyway. Turning off signups closes the door completely.

---

## 3. Two machines (Asus + Mac Mini) with Git

The code lives on GitHub. The data lives in Supabase, so both machines and the live site always see the same collabs. Secrets live in `.env.local` on each machine and are **never committed**.

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

## 4. Deploy to Vercel (so you can use it from your phone)

1. At [vercel.com](https://vercel.com), sign in with GitHub, click **Add New → Project**, and import `creator-hub`.
2. Add the same four environment variables from `.env.local` under **Settings → Environment Variables**.
3. Click **Deploy**. Add the resulting `https://<name>.vercel.app/**` URL to Supabase's redirect URLs (step 2.4 above).
4. From then on, every `git push` to `main` deploys automatically.
5. On your phone, open the URL and use **Add to Home Screen**.

Optional: run `npm i -g vercel`, then `vercel link` and `vercel env pull .env.local`. That fetches the env file onto a new machine without copying it by hand.

---

## How the numbers work

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
    actions.ts                every write (server actions)
    login/, auth/callback/    email code + link sign-in
    globals.css               Paper + Dusk design tokens and all styles
  components/                 editor dialogs, checklist rows, tables, icons
  lib/
    domain.ts                 types + quota/status logic (pure, testable)
    dates.ts                  string-based date math (timezone-safe)
    data/                     repo interface: supabase.ts (live) · demo.ts (sample)
supabase/migrations/          schema + row-level security
```

## Ideas for later

- **Reminders:** a Vercel Cron job that emails or Telegrams you when a collab turns *At risk*.
- **Auto-verify:** pull your recent IG/TikTok posts through their APIs and match them to planned posts, so links fill themselves in.
- **Deal records:** compensation, contract PDFs, brief links, brand contacts.
- **Calendar view** of due and posted dates.
- **Monthly report export** to send each brand as proof of delivery.
