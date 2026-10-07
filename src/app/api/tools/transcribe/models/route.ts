import { fail, guard } from "@/lib/tools/http";
import { WHISPER_MODELS, type WhisperModel } from "@/lib/tools/shared";
import { downloadModel, modelStatuses } from "@/lib/tools/whisper";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  return Response.json(modelStatuses());
}

/** { model: "turbo" | "small" } → starts the download; poll GET for progress. */
export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const { model } = await req.json().catch(() => ({}));
    if (!(model in WHISPER_MODELS)) return Response.json({ error: "Unknown model." }, { status: 400 });
    downloadModel(model as WhisperModel);
    return Response.json(modelStatuses(), { status: 202 });
  } catch (e) {
    return fail(e);
  }
}
