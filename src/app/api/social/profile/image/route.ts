import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import {
  uploadSocialProfileImage,
} from "@/lib/server/socialProfileImageStore";
import { setSocialProfileImage } from "@/lib/server/socialHub";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  const formData = await req.formData();
  const rawFile = formData.get("file");
  if (!(rawFile instanceof File)) {
    return jsonNoStore({ ok: false, error: "file_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  try {
    const imagePath = await uploadSocialProfileImage(admin, userId, rawFile);
    const profile = await setSocialProfileImage(admin, userId, imagePath);
    return jsonNoStore({ ok: true, data: { imagePath, profile } }, { status: 201 });
  } catch (err: any) {
    if (err?.code === "invalid_file_type") {
      return jsonNoStore({ ok: false, error: "invalid_file_type" }, { status: 400 });
    }
    if (err?.code === "file_too_large") {
      return jsonNoStore({ ok: false, error: "file_too_large" }, { status: 400 });
    }
    console.error("[SocialProfileImage/POST] err=%s", String(err?.message ?? err));
    return jsonNoStore({ ok: false, error: "failed_to_upload_profile_image" }, { status: 500 });
  }
}
