// Sign PDF: the data model, shared by the editor (components/tools/sign-pdf) and the export (stamp.ts).
// Everything runs in the browser: the PDF never leaves the user's device.
//
// Placed items are stored in *visual* page space — what you see on screen, after the page's /Rotate —
// as fractions of the page's width/height, so zooming or resizing the window never moves them.
// At export (stamp.ts) each item is mapped back to PDF user space with the page's pdf.js viewport transform,
// which accounts for /Rotate and a CropBox that doesn't start at 0,0.

export type Ink = "black" | "blue";
export const INK: Record<Ink, string> = { black: "#111111", blue: "#1A3FA8" };

/** A saved signature or initials: a trimmed transparent PNG. */
export interface SavedMark {
  id: string;
  kind: "signature" | "initials";
  src: string; // data:image/png;base64,…
  w: number; // pixel size of the PNG (aspect ratio is what matters)
  h: number;
  createdAt: number;
}

interface Box { id: string; page: number; x: number; y: number; w: number; h: number } // fractions of the visual page
export type Placed =
  | (Box & { type: "image"; src: string; ratio: number })
  | (Box & { type: "text"; text: string; size: number; ink: Ink; png?: string }) // size in pt; png = fallback render
  | (Box & { type: "mark"; mark: "check" | "cross" | "dot"; ink: Ink });

/** What export needs from pdf.js about each page (at scale 1). */
export interface PageGeom {
  width: number; // visual size in points
  height: number;
  transform: number[]; // viewport.transform: PDF user space → visual space (y down)
}

/** Text baseline as a fraction of the font size from the top of a text box (line-height 1.2, Arial/Helvetica). */
export const TEXT_BASELINE = 0.95;
export const TEXT_LINE = 1.2;
export const TEXT_FONT = "Arial, Helvetica, sans-serif";

export const MARK_PATHS: Record<"check" | "cross" | "dot", string> = {
  check: "M4 12.5 9.5 18 20 6",
  cross: "M6 6 18 18 M18 6 6 18",
  dot: "M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7",
};
