import { MediaTool } from "@/components/tools/media-tool";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "YouTube → MP3" };

export default function YoutubeMp3Page() {
  return (
    <ToolPage id="youtube-mp3" title={<>YouTube <em>→</em> MP3</>} lede={<>Paste a link, get an MP3 with the title, channel and cover art filled in. Works for SoundCloud, Bandcamp and most other sites too. Only download what you have the rights to use.</>}>
      <MediaTool kind="audio" />
    </ToolPage>
  );
}
