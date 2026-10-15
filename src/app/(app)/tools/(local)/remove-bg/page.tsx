import { RemoveBg } from "@/components/tools/remove-bg";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Remove background" };

export default function RemoveBgPage() {
  return (
    <ToolPage id="remove-bg" lede={<>Runs an open AI model (ISNet) on this computer. Images never leave it.</>}>
      <RemoveBg />
    </ToolPage>
  );
}
