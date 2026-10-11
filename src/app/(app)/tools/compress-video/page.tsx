import Link from "next/link";
import { CompressVideo } from "@/components/tools/compress-video";

export const metadata = { title: "Compress video" };

export default function CompressVideoPage() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>Compress video</b></div>
      <div className="page no-cover">
        <h1 className="title">Compress video</h1>
        <p className="lede">Re-encodes with ffmpeg on this computer. Pick how much to squeeze, or the file size it has to fit under.</p>
        <CompressVideo />
      </div>
    </>
  );
}
