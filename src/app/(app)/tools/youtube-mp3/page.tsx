import Link from "next/link";
import { MediaTool } from "@/components/tools/media-tool";

export const metadata = { title: "YouTube → MP3" };

export default function YoutubeMp3Page() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>YouTube → MP3</b></div>
      <div className="page no-cover">
        <h1 className="title">YouTube <em>→</em> MP3</h1>
        <p className="lede">Paste a link, get an MP3 with the title, channel and cover art filled in. Works for SoundCloud, Bandcamp and most other sites too. Only download what you have the rights to use.</p>
        <MediaTool kind="audio" />
      </div>
    </>
  );
}
