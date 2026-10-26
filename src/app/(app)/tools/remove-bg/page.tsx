import { RemoveBg } from "@/components/tools/remove-bg";
import { ToolPage } from "@/components/tools/tool-page";
import { IS_HOSTED } from "@/lib/env";

export const metadata = { title: "Remove background" };

export default function RemoveBgPage() {
  return (
    <ToolPage id="remove-bg" lede={IS_HOSTED
      ? <>Runs an open AI model (ormbg) right in your browser. Images are never uploaded.</>
      : <>Runs an open AI model (ISNet) on this computer. Images never leave it.</>}>
      {/* online: ormbg in the browser; on your own computer: ISNet on the server (better on objects) */}
      <RemoveBg engine={IS_HOSTED ? "browser" : "server"} />
    </ToolPage>
  );
}
