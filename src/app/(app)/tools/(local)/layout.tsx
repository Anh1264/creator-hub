import { notFound } from "next/navigation";
import { IS_HOSTED } from "@/lib/env";

/**
 * Tools in this (local) group need ffmpeg, yt-dlp, Whisper… on your own computer, so they don't exist on
 * the hosted site. Browser-only tools (Sign PDF) live outside the group and work everywhere.
 */
export default function LocalToolsLayout({ children }: { children: React.ReactNode }) {
  if (IS_HOSTED) notFound();
  return children;
}
