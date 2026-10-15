import { Transcribe } from "@/components/tools/transcribe";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Transcribe" };

export default function TranscribePage() {
  return (
    <ToolPage id="transcribe" lede={<>Paste a YouTube link to get its transcript. It grabs the video&apos;s captions instantly when they exist, otherwise Whisper transcribes the audio on this computer. Uploads work too.</>}>
      <Transcribe />
    </ToolPage>
  );
}
