import Link from "next/link";
import { IconCutout, IconFilm, IconMusic, IconTranscript } from "@/components/icons";
import { StatusPanel } from "@/components/tools/status-panel";

export const metadata = { title: "Tools" };

const TOOLS = [
  { href: "/tools/remove-bg", Icon: IconCutout, name: "Remove background", text: "Cut the subject out of any photo. Transparent PNG or a solid colour, batch-friendly.", chips: ["Images", "On-device AI"] },
  { href: "/tools/youtube-mp3", Icon: IconMusic, name: "YouTube → MP3", text: "Grab the audio from a YouTube video as an MP3 with title, artist and cover art.", chips: ["Audio", "yt-dlp"] },
  { href: "/tools/video-download", Icon: IconFilm, name: "Video downloader", text: "Save videos from YouTube, TikTok, Instagram, X and 1,000+ other sites.", chips: ["Video", "yt-dlp"] },
  { href: "/tools/transcribe", Icon: IconTranscript, name: "Transcribe", text: "Get the transcript of a YouTube video, or of your own audio/video files. Copy, or save as TXT/SRT.", chips: ["Text", "Whisper"] },
];

export default function ToolsPage() {
  return (
    <>
      <div className="crumbs"><span>Hub</span><span>/</span><b>Tools</b></div>
      <div className="page no-cover">
        <h1 className="title">Tools</h1>
        <p className="lede">The little utilities you&apos;d otherwise hunt for online. They run on this computer, so files never touch a third-party site.</p>

        <section className="block">
          <div className="gallery">
            {TOOLS.map(({ href, Icon, name, text, chips }) => (
              <Link key={href} href={href} className="g tool-card">
                <div className="g-top"><Icon /><span className="g-name">{name}</span></div>
                <p>{text}</p>
                <div className="chips">{chips.map((c) => <span key={c} className="tag t-gray">{c}</span>)}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="db-h"><h2 className="h2">Setup</h2></div>
          <StatusPanel />
        </section>
      </div>
    </>
  );
}
