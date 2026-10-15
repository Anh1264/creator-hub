<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Creator Hub — project notes

Creator workspace (collab quotas, Launchpad, Prompts, Characters, local media tools). Multi-user, invite-only in cloud mode; developed by Aiden on two machines (Windows laptop + Mac Mini) via GitHub.

- **Stack:** Next.js 16 (App Router, Turbopack, `src/proxy.ts` not middleware), React 19, Supabase (Postgres + email-code auth, RLS), plain CSS tokens in `src/app/globals.css` (Tailwind v4 is installed but barely used).
- **Design:** "Paper" light theme + "Dusk" dark theme, Newsreader (serif display) + Inter (UI). Notion-like page layout: cover, page icon, property rows, callout, gallery/table views, checklist rows. Keep new UI consistent with these tokens and classes.
- **Data:** collabs/posts go through `src/lib/data` (`repo`); Launchpad/Prompts/Characters through `src/lib/launch/store.ts` / `src/lib/prompts/store.ts`; media through `src/lib/media/assets.ts`. Each has a local backend (no Supabase env → `.tools/data`) and a Supabase backend (RLS, one workspace per user). Schema changes = new file in `supabase/migrations/`, never edit an applied migration.
- **Domain logic** lives in `src/lib/domain.ts` (pure functions: month attribution, pipeline, status). A post counts toward the month of `posted_at`; unposted work belongs to its due month, and overdue/undated work rolls into the current month.
- **Dates** are strings (`YYYY-MM-DD`, `YYYY-MM`); "today" is computed in the viewer's timezone (`userToday()`, tz cookie; fallback `APP_TIMEZONE`). Don't use `new Date()` for month math.
- **Mutations** are server actions in `src/app/actions.ts`; every action calls `requireUser()`.
- Run `npm run typecheck && npm run lint && npm run build` before pushing.

## Project status & history

Read `PROJECT-CONTEXT.md` first: what has been built, current status, open items, and rules for working on this repo. Update its status, open items and change log at the end of any session that changes something.
