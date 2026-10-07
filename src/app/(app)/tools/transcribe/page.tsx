import Link from "next/link";
import { Transcribe } from "@/components/tools/transcribe";

export const metadata = { title: "Transcribe" };

export default function TranscribePage() {
  return (
    <>
      <div className="crumbs"><span className="hide-m">Hub</span><span className="hide-m">/</span><Link href="/tools">Tools</Link><span>/</span><b>Transcribe</b></div>
      <div className="page no-cover">
        <h1 className="title">Transcribe</h1>
        <p className="lede">Paste a YouTube link to get its transcript. It grabs the video&apos;s captions instantly when they exist, otherwise Whisper transcribes the audio on this computer. Uploads work too.</p>
        <Transcribe />
      </div>
    </>
  );
}
