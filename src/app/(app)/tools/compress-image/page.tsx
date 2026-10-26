import { CompressImage } from "@/components/tools/compress-image";
import { ToolPage } from "@/components/tools/tool-page";
import { IS_HOSTED } from "@/lib/env";

export const metadata = { title: "Compress images" };

export default function CompressImagePage() {
  return (
    <ToolPage id="compress-image" lede={IS_HOSTED
      ? <>Shrinks photos right in your browser with MozJPEG, WebP and AVIF encoders. Pick a quality, or the file size it has to fit under.</>
      : <>Shrinks photos on this computer with libvips. Pick a quality, or the file size it has to fit under.</>}>
      {/* online it runs in the browser (no upload); on your own computer the server does it (HEIC, keep EXIF) */}
      <CompressImage engine={IS_HOSTED ? "browser" : "server"} />
    </ToolPage>
  );
}
