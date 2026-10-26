import { notFound } from "next/navigation";
import { IS_HOSTED } from "@/lib/env";

/**
 * Tools in this (local) group need ffmpeg, yt-dlp, Whisper… on your own computer, so they don't exist on
 * the hosted site. Tools that can also run in the browser (Sign PDF, Compress images, Remove background) live outside the group.
 */
export default function LocalToolsLayout({ children }: { children: React.ReactNode }) {
  if (IS_HOSTED) notFound();
  return children;
}
