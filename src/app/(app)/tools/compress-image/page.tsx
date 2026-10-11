import Link from "next/link";
import { CompressImage } from "@/components/tools/compress-image";

export const metadata = { title: "Compress images" };

export default function CompressImagePage() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>Compress images</b></div>
      <div className="page no-cover">
        <h1 className="title">Compress images</h1>
        <p className="lede">Shrinks photos on this computer with libvips. Pick a quality, or the file size it has to fit under.</p>
        <CompressImage />
      </div>
    </>
  );
}
