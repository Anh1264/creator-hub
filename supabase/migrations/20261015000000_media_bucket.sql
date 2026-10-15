-- Creator Hub — media bucket in Supabase Storage
-- Run AFTER 20261014000000_workspace.sql, in Supabase → SQL Editor. (Skip it if you use Cloudflare R2 instead.)
-- A private bucket: no public access and no storage policies. Only the app server touches it, with the
-- service-role key, after public.assets (row level security) has confirmed the file is the user's;
-- browsers get short-lived signed upload/view URLs. Files live under <user_id>/<asset id>/.
-- No file_size_limit here: the plan's own cap applies (50 MB per file on Free), and MAX_UPLOAD_MB in the
-- app rejects bigger files before they're sent.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
