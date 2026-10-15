import { SignPdf } from "@/components/tools/sign-pdf";
import { ToolPage } from "@/components/tools/tool-page";

export const metadata = { title: "Sign PDF" };

export default function SignPdfPage() {
  return (
    <ToolPage id="sign-pdf" lede={<>Sign, initial, date and tick boxes on a PDF, then download the signed copy. It all happens in this browser: the file is never uploaded.</>}>
      <SignPdf />
    </ToolPage>
  );
}
