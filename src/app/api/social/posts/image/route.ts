import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import {
  assertSocialWriteAccess,
  getSocialAccessErrorCode,
} from "@/lib/server/socialAdmin";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { uploadSocialPostImage } from "@/lib/server/socialPostImageStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_form_data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonNoStore({ ok: false, error: "file_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    await assertSocialWriteAccess(admin, userId);
    const imagePath = await uploadSocialPostImage(admin, userId, file);
    return jsonNoStore({ ok: true, data: { imagePath } }, { status: 201 });
  } catch (err: any) {
    const accessCode = getSocialAccessErrorCode(err);
    if (accessCode) {
      return jsonNoStore({ ok: false, error: accessCode }, { status: 403 });
    }
    const message = String(err?.message ?? err);
    if (err?.code === "invalid_file_type") {
      return jsonNoStore({ ok: false, error: "invalid_file_type" }, { status: 400 });
    }
    if (err?.code === "file_too_large") {
      return jsonNoStore({ ok: false, error: "file_too_large" }, { status: 400 });
    }
    console.error("[SocialPostImage/POST] err=%s", message);
    return jsonNoStore({ ok: false, error: "upload_failed" }, { status: 500 });
  }
}
