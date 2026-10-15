// One place for every tool's name, blurb, icon and colour key. The colour itself lives in
// globals.css under [data-tool="…"], so it can differ between the Paper and Dusk themes.
import type { ComponentType, SVGProps } from "react";
import { IconCutout, IconFilm, IconMusic, IconShrinkImage, IconShrinkVideo, IconSignPdf, IconTranscript } from "@/components/icons";

export type ToolKey = "remove-bg" | "youtube-mp3" | "video-download" | "transcribe" | "compress-video" | "compress-image" | "sign-pdf";

export interface ToolInfo {
  key: ToolKey;
  href: string;
  name: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  card: string;
  chips: string[];
  /** Runs entirely in the browser, so it also works on the hosted site. The others need this computer. */
  browser?: boolean;
}

export const TOOLS: ToolInfo[] = [
  { key: "remove-bg", href: "/tools/remove-bg", name: "Remove background", Icon: IconCutout, card: "Cut the subject out of any photo. Transparent PNG or a solid colour, batch-friendly.", chips: ["Images", "On-device AI"] },
  { key: "youtube-mp3", href: "/tools/youtube-mp3", name: "YouTube → MP3", Icon: IconMusic, card: "Grab the audio from a YouTube video as an MP3 with title, artist and cover art.", chips: ["Audio", "yt-dlp"] },
  { key: "video-download", href: "/tools/video-download", name: "Video downloader", Icon: IconFilm, card: "Save videos from YouTube, TikTok, Instagram, X and 1,000+ other sites.", chips: ["Video", "yt-dlp"] },
  { key: "transcribe", href: "/tools/transcribe", name: "Transcribe", Icon: IconTranscript, card: "Get the transcript of a YouTube video, or of your own audio/video files. Copy, or save as TXT/SRT.", chips: ["Text", "Whisper"] },
  { key: "compress-video", href: "/tools/compress-video", name: "Compress video", Icon: IconShrinkVideo, card: "Shrink a video by quality level or to a target size (8 MB, 25 MB…). Optional resize, 30 fps, H.265.", chips: ["Video", "ffmpeg"] },
  { key: "compress-image", href: "/tools/compress-image", name: "Compress images", Icon: IconShrinkImage, card: "Shrink photos by quality or to a size in KB. Convert to JPG, WebP or AVIF, resize, strip location data.", chips: ["Images", "Batch"] },
  { key: "sign-pdf", href: "/tools/sign-pdf", name: "Sign PDF", Icon: IconSignPdf, card: "Sign, initial, date and tick boxes on any PDF, then download it. Signatures are saved for next time.", chips: ["PDF", "In your browser"], browser: true },
];

/** The tools this deployment can run: all of them on your own computer, only browser tools when hosted. */
export const toolsFor = (hosted: boolean) => TOOLS.filter((t) => !hosted || t.browser);

export const tool = (key: ToolKey) => TOOLS.find((t) => t.key === key)!;
