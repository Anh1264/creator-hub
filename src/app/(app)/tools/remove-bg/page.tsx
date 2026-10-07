import Link from "next/link";
import { RemoveBg } from "@/components/tools/remove-bg";

export const metadata = { title: "Remove background" };

export default function RemoveBgPage() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>Remove background</b></div>
      <div className="page no-cover">
        <h1 className="title">Remove background</h1>
        <p className="lede">Runs an open AI model (ISNet) on this computer. Images never leave it.</p>
        <RemoveBg />
      </div>
    </>
  );
}
