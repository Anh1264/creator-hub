import { clearStatusCache } from "@/lib/tools/bin";
import { fail, guard } from "@/lib/tools/http";
import { updateYtDlp } from "@/lib/tools/media";

export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  try {
    const message = await updateYtDlp();
    clearStatusCache();
    return Response.json({ message });
  } catch (e) {
    return fail(e);
  }
}
