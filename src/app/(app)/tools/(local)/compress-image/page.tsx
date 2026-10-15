import { CompressImage } from "@/components/tools/compress-image";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Compress images" };

export default function CompressImagePage() {
  return (
    <ToolPage id="compress-image" lede={<>Shrinks photos on this computer with libvips. Pick a quality, or the file size it has to fit under.</>}>
      <CompressImage />
    </ToolPage>
  );
}
