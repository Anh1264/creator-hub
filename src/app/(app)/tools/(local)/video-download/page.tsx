import { MediaTool } from "@/components/tools/media-tool";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Video downloader" };

export default function VideoDownloadPage() {
  return (
    <ToolPage id="video-download" lede={<>Powered by yt-dlp: YouTube, TikTok, Instagram, X, Vimeo and 1,000+ more. Only download what you have the rights to use.</>}>
      <MediaTool kind="video" />
    </ToolPage>
  );
}
