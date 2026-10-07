import Link from "next/link";
import { MediaTool } from "@/components/tools/media-tool";

export const metadata = { title: "Video downloader" };

export default function VideoDownloadPage() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>Video downloader</b></div>
      <div className="page no-cover">
        <h1 className="title">Video downloader</h1>
        <p className="lede">Powered by yt-dlp: YouTube, TikTok, Instagram, X, Vimeo and 1,000+ more. Only download what you have the rights to use.</p>
        <MediaTool kind="video" />
      </div>
    </>
  );
}
