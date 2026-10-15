import { CompressVideo } from "@/components/tools/compress-video";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Compress video" };

export default function CompressVideoPage() {
  return (
    <ToolPage id="compress-video" lede={<>Re-encodes with ffmpeg on this computer. Pick how much to squeeze, or the file size it has to fit under.</>}>
      <CompressVideo />
    </ToolPage>
  );
}
