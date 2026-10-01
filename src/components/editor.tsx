"use client";
// App-wide editing surface: post + collab dialogs and a toast, reachable from anywhere via useEditor().
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { deleteCollab, deletePost, saveCollab, savePost } from "@/app/actions";
import {
  COLOR_PRESETS, PLATFORM_PRESETS, STAGES, STAGE_META,
  type Collab, type Post, type Stage,
} from "@/lib/domain";
import { IconX } from "./icons";

type PostDefaults = { collabId?: string; dueDate?: string; stage?: Stage };
type ToastMsg = { text: string; action?: { label: string; run: () => void } };

type Ctx = {
  openPost: (post: Post | null, defaults?: PostDefaults) => void;
  openCollab: (collab: Collab | null) => void;
  toast: (t: ToastMsg) => void;
};
const EditorCtx = createContext<Ctx | null>(null);

export function useEditor() {
  const ctx = useContext(EditorCtx);
  if (!ctx) throw new Error("useEditor must be used inside <EditorProvider>");
  return ctx;
}

export function EditorProvider({ collabs, today, suggestedCollabId, children }: {
  collabs: Collab[]; today: string; suggestedCollabId?: string; children: React.ReactNode;
}) {
  const [post, setPost] = useState<{ post: Post | null; defaults: PostDefaults } | null>(null);
  const [collab, setCollab] = useState<{ collab: Collab | null } | null>(null);
  const [toastMsg, setToastMsg] = useState<ToastMsg | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((t: ToastMsg) => {
    setToastMsg(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), t.action ? 5000 : 2200);
  }, []);

  const ctx: Ctx = {
    openPost: useCallback((p, defaults = {}) => setPost({ post: p, defaults }), []),
    openCollab: useCallback((c) => setCollab({ collab: c }), []),
    toast,
  };

  // Keyboard: "n" opens a new post (when not typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input,textarea,select,[contenteditable],dialog")) return;
      if (e.key === "n") { e.preventDefault(); setPost({ post: null, defaults: {} }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <EditorCtx.Provider value={ctx}>
      {children}
      {post && (
        <PostDialog
          key={post.post?.id ?? "new"}
          post={post.post}
          defaults={{ collabId: suggestedCollabId, ...post.defaults }}
          collabs={collabs}
          today={today}
          onClose={() => setPost(null)}
          toast={toast}
        />
      )}
      {collab && (
        <CollabDialog key={collab.collab?.id ?? "new"} collab={collab.collab} today={today} onClose={() => setCollab(null)} toast={toast} />
      )}
      <div className={`toast${toastMsg ? " show" : ""}`} role="status" aria-live="polite">
        {toastMsg?.text}
        {toastMsg?.action && (
          <button onClick={() => { toastMsg.action!.run(); setToastMsg(null); }}>{toastMsg.action.label}</button>
        )}
      </div>
    </EditorCtx.Provider>
  );
}

// ─── Dialog shell ────────────────────────────────────────────────────────────
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onMouseDown={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="sheet-h">
        <h3>{title}</h3>
        <button type="button" className="x" onClick={onClose} aria-label="Close"><IconX /></button>
      </div>
      {children}
    </dialog>
  );
}

// ─── Post dialog ─────────────────────────────────────────────────────────────
function PostDialog({ post, defaults, collabs, today, onClose, toast }: {
  post: Post | null; defaults: PostDefaults; collabs: Collab[]; today: string;
  onClose: () => void; toast: (t: ToastMsg) => void;
}) {
  const selectable = collabs.filter((c) => !c.archived || c.id === post?.collabId).sort((a, b) => a.name.localeCompare(b.name));
  const [collabId, setCollabId] = useState(post?.collabId ?? defaults.collabId ?? selectable[0]?.id ?? "");
  const [stage, setStageState] = useState<Stage>(post?.stage ?? defaults.stage ?? "idea");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const current = collabs.find((c) => c.id === collabId);
  const platformOptions = [...new Set([...(current?.platforms ?? []), ...PLATFORM_PRESETS])];

  if (selectable.length === 0) {
    return (
      <Sheet title="New post" onClose={onClose}>
        <div className="sheet-b"><p className="muted">Add a collab first — posts belong to a collab.</p></div>
        <div className="sheet-f"><span className="sp" /><button className="btn ghost" onClick={onClose}>OK</button></div>
      </Sheet>
    );
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await savePost(fd);
      if (!res.ok) return setError(res.error);
      onClose();
      toast({ text: post ? "Saved" : "Post added" });
    });
  }

  function remove() {
    if (!post) return;
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      await deletePost(post.id);
      onClose();
      toast({ text: "Post deleted" });
    });
  }

  return (
    <Sheet title={post ? "Edit post" : "New post"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="sheet-b">
          {post && <input type="hidden" name="id" value={post.id} />}
          <input className="input big" name="title" placeholder="Untitled post" defaultValue={post?.title ?? ""} autoFocus required maxLength={200} />
          <div className="row2">
            <label className="field"><span>Collab</span>
              <select className="select" name="collabId" value={collabId} onChange={(e) => setCollabId(e.target.value)}>
                {selectable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Platform / format</span>
              <input className="input" name="platform" list="platform-options" placeholder="e.g. IG Reel" defaultValue={post?.platform ?? current?.platforms[0] ?? ""} maxLength={60} />
              <datalist id="platform-options">{platformOptions.map((p) => <option key={p} value={p} />)}</datalist>
            </label>
          </div>
          <div className="field"><span>Stage</span>
            <div className="seg" role="radiogroup">
              {STAGES.map((s) => (
                <label key={s}>
                  <input type="radio" name="stage" value={s} checked={stage === s} onChange={() => setStageState(s)} />
                  <span className={`tag dot t-${STAGE_META[s].tone}`}>{STAGE_META[s].label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="row2">
            <label className="field"><span>Due</span>
              <input className="input" type="date" name="dueDate" defaultValue={post?.dueDate ?? defaults.dueDate ?? ""} />
            </label>
            {stage === "posted" ? (
              <label className="field"><span>Went live on</span>
                <input className="input" type="date" name="postedAt" defaultValue={post?.postedAt ?? today} required />
              </label>
            ) : <div />}
          </div>
          <label className="field"><span>Link to the live post {stage === "posted" ? "(proof for the brand)" : "(optional)"}</span>
            <input className="input" name="url" type="text" inputMode="url" placeholder="https://" defaultValue={post?.url ?? ""} />
          </label>
          <label className="field"><span>Notes</span>
            <textarea className="textarea" name="notes" placeholder="Brief, hashtags, @mentions…" defaultValue={post?.notes ?? ""} />
          </label>
          {error && <p className="err">{error}</p>}
        </div>
        <div className="sheet-f">
          {post && (
            <button type="button" className="btn danger" onClick={remove} disabled={pending}>
              {confirmDelete ? "Click again to delete" : "Delete"}
            </button>
          )}
          <span className="sp" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : post ? "Save" : "Add post"}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ─── Collab dialog ───────────────────────────────────────────────────────────
function CollabDialog({ collab, today, onClose, toast }: {
  collab: Collab | null; today: string; onClose: () => void; toast: (t: ToastMsg) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const initialColor = collab?.color ?? COLOR_PRESETS[0];
  const colors = COLOR_PRESETS.includes(initialColor) ? COLOR_PRESETS : [initialColor, ...COLOR_PRESETS];
  const known = new Set(PLATFORM_PRESETS);
  const other = (collab?.platforms ?? []).filter((p) => !known.has(p)).join(", ");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveCollab(fd);
      if (!res.ok) return setError(res.error);
      onClose();
      toast({ text: collab ? "Collab saved" : "Collab added" });
      if (!collab && res.id) router.push(`/collabs/${res.id}`);
    });
  }

  function remove() {
    if (!collab) return;
    if (!confirmDelete) return setConfirmDelete(true);
    start(async () => {
      await deleteCollab(collab.id);
      onClose();
      toast({ text: `${collab.name} deleted` });
      router.push("/");
    });
  }

  return (
    <Sheet title={collab ? "Edit collab" : "New collab"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="sheet-b">
          {collab && <input type="hidden" name="id" value={collab.id} />}
          <input className="input big" name="name" placeholder="Brand or platform name" defaultValue={collab?.name ?? ""} autoFocus required maxLength={80} />
          <div className="field"><span>Color</span>
            <div className="swatches">
              {colors.map((c) => (
                <label key={c} style={{ "--c": c } as CSSProperties} title={c}>
                  <input type="radio" name="color" value={c} defaultChecked={c === initialColor} />
                  <i />
                </label>
              ))}
            </div>
          </div>
          <div className="row2">
            <label className="field"><span>Posts per month</span>
              <input className="input" type="number" name="monthlyQuota" min={0} max={500} step={1} defaultValue={collab?.monthlyQuota ?? 4} required />
            </label>
            <div />
          </div>
          <div className="row2">
            <label className="field"><span>Starts</span>
              <input className="input" type="month" name="startMonth" defaultValue={collab?.startMonth ?? today.slice(0, 7)} required />
            </label>
            <label className="field"><span>Ends (leave empty if ongoing)</span>
              <input className="input" type="month" name="endMonth" defaultValue={collab?.endMonth ?? ""} />
            </label>
          </div>
          <div className="field"><span>Platforms</span>
            <div className="seg">
              {PLATFORM_PRESETS.map((p) => (
                <label key={p}>
                  <input type="checkbox" name="platforms" value={p} defaultChecked={collab?.platforms.includes(p)} />
                  <span className="tag t-gray">{p}</span>
                </label>
              ))}
            </div>
            <input className="input" name="otherPlatforms" placeholder="Other, comma-separated (e.g. Pinterest, Lemon8)" defaultValue={other} />
          </div>
          <label className="field"><span>Deal notes</span>
            <textarea className="textarea" name="notes" placeholder="Compensation, required tags, contact, brief link…" defaultValue={collab?.notes ?? ""} />
          </label>
          {collab && (
            <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="archived" defaultChecked={collab.archived} />
              <span style={{ fontSize: 13 }}>Archived — hide from overview and stop counting quota</span>
            </label>
          )}
          {error && <p className="err">{error}</p>}
        </div>
        <div className="sheet-f">
          {collab && (
            <button type="button" className="btn danger" onClick={remove} disabled={pending}>
              {confirmDelete ? "Deletes all its posts — click again" : "Delete"}
            </button>
          )}
          <span className="sp" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={pending}>{pending ? "Saving…" : collab ? "Save" : "Add collab"}</button>
        </div>
      </form>
    </Sheet>
  );
}

// ─── Buttons server components can drop in ───────────────────────────────────
export function NewPostButton({ className = "btn", label = "+ New", defaults }: { className?: string; label?: React.ReactNode; defaults?: PostDefaults }) {
  const { openPost } = useEditor();
  return <button type="button" className={className} onClick={() => openPost(null, defaults)}>{label}</button>;
}
export function NewCollabButton({ className = "btn", label = "+ New collab" }: { className?: string; label?: React.ReactNode }) {
  const { openCollab } = useEditor();
  return <button type="button" className={className} onClick={() => openCollab(null)}>{label}</button>;
}
export function EditCollabButton({ collab, className = "btn ghost", label = "Edit" }: { collab: Collab; className?: string; label?: React.ReactNode }) {
  const { openCollab } = useEditor();
  return <button type="button" className={className} onClick={() => openCollab(collab)}>{label}</button>;
}
