// Tiny JSON-file persistence for local mode: everything lives in <project>/.tools/data/ (git-ignored).
// One file per collection, cached in memory, written atomically (temp file + rename) on every change.
// Swap for Supabase later: callers only see load()/save().
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { TOOLS_DIR } from "../tools/bin";

export const DATA_DIR = path.join(TOOLS_DIR, "data");

const g = globalThis as unknown as { __localDb?: Map<string, unknown> };
const cache = () => (g.__localDb ??= new Map());

/** Returns the stored value for `name`, or `init()` (written to disk) the first time. */
export function load<T>(name: string, init: () => T): T {
  const c = cache();
  if (c.has(name)) return c.get(name) as T;
  const file = path.join(DATA_DIR, `${name}.json`);
  let value: T;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      // unreadable file: keep a copy instead of silently overwriting it
      try { fs.copyFileSync(file, `${file}.broken-${Date.now()}`); } catch { /* ignore */ }
    }
    value = init();
    c.set(name, value);
    save(name);
    return value;
  }
  c.set(name, value);
  return value;
}

/** Persists the cached value of `name`. Fails soft (read-only disks, e.g. Vercel) — data stays in memory. */
export function save(name: string) {
  const c = cache();
  if (!c.has(name)) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, `${name}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(c.get(name), null, 1));
    fs.renameSync(tmp, file);
  } catch (e) {
    console.warn(`[local-db] couldn't save ${name}:`, (e as Error).message);
  }
}
