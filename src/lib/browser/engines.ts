"use client";
// Runs the in-browser tool engines in Web Workers, so the page stays responsive while they work.
import type { CompressReply, CompressSettings } from "./compress-image.worker";
import type { RemoveBgReply } from "./remove-bg.worker";

type Pending<R> = { resolve: (r: R) => void; reject: (e: Error) => void; onProgress?: (loaded: number, total: number) => void };

function pool<Req extends { id: number }, Rep extends { id: number; type: string }>(make: () => Worker) {
  let worker: Worker | null = null;
  let seq = 0;
  const waiting = new Map<number, Pending<Rep>>();
  const get = () => {
    if (worker) return worker;
    worker = make();
    worker.onmessage = (e: MessageEvent<Rep & { loaded?: number; total?: number; message?: string }>) => {
      const p = waiting.get(e.data.id);
      if (!p) return;
      if (e.data.type === "progress") return p.onProgress?.(e.data.loaded ?? 0, e.data.total ?? 0);
      waiting.delete(e.data.id);
      if (e.data.type === "error") p.reject(new Error(e.data.message || "Failed."));
      else p.resolve(e.data);
    };
    worker.onerror = (e) => {
      for (const p of waiting.values()) p.reject(new Error(e.message || "The tool crashed (the image may be too big for this device)."));
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
    return worker;
  };
  return (req: Omit<Req, "id">, onProgress?: Pending<Rep>["onProgress"]) =>
    new Promise<Rep>((resolve, reject) => {
      const id = ++seq;
      waiting.set(id, { resolve, reject, onProgress });
      get().postMessage({ ...req, id });
    });
}

const compressPool = pool<{ id: number; file: Blob; name: string; settings: CompressSettings }, CompressReply>(
  () => new Worker(new URL("./compress-image.worker.ts", import.meta.url), { type: "module" }),
);
const removeBgPool = pool<{ id: number; file: Blob }, RemoveBgReply>(
  () => new Worker(new URL("./remove-bg.worker.ts", import.meta.url), { type: "module" }),
);

export async function compressInBrowser(file: File, settings: CompressSettings) {
  const r = await compressPool({ file, name: file.name, settings });
  if (r.type !== "done") throw new Error("Failed.");
  return r;
}

export async function removeBgInBrowser(file: File, onProgress?: (loaded: number, total: number) => void) {
  const r = await removeBgPool({ file }, onProgress);
  if (r.type !== "done") throw new Error("Failed.");
  return r;
}
