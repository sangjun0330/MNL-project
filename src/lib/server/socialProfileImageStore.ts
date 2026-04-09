const SOCIAL_PROFILE_IMAGE_BUCKET = "social-profile-images";
const MAX_SOCIAL_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SOCIAL_PROFILE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeImageExtension(file: File) {
  const fromType =
    file.type === "image/jpeg"
      ? "jpg"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "";
  if (fromType) return fromType;

  const rawName = String(file.name ?? "");
  const ext = rawName.split(".").pop()?.trim().toLowerCase() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  return "";
}

export function buildSocialProfileImageUrl(imagePath: string | null) {
  if (!imagePath) return null;
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/${SOCIAL_PROFILE_IMAGE_BUCKET}/${imagePath}`;
}

export async function ensureSocialProfileImageBucket(admin: any) {
  const { data: existing, error } = await admin.storage.getBucket(SOCIAL_PROFILE_IMAGE_BUCKET);
  if (existing && !error) return;

  if (error) {
    const message = String(error.message ?? error).toLowerCase();
    const canCreate =
      message.includes("not found") ||
      message.includes("does not exist") ||
      message.includes("no rows");
    if (!canCreate) throw error;
  }

  const { error: createError } = await admin.storage.createBucket(SOCIAL_PROFILE_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_SOCIAL_PROFILE_IMAGE_BYTES}`,
    allowedMimeTypes: Array.from(ALLOWED_SOCIAL_PROFILE_IMAGE_TYPES),
  });
  if (createError && !String(createError.message ?? createError).toLowerCase().includes("already exists")) {
    throw createError;
  }
}

export async function uploadSocialProfileImage(admin: any, userId: string, file: File) {
  if (!ALLOWED_SOCIAL_PROFILE_IMAGE_TYPES.has(file.type)) {
    throw Object.assign(new Error("invalid_file_type"), { code: "invalid_file_type" });
  }
  if (file.size > MAX_SOCIAL_PROFILE_IMAGE_BYTES) {
    throw Object.assign(new Error("file_too_large"), { code: "file_too_large" });
  }

  const ext = normalizeImageExtension(file);
  if (!ext) {
    throw Object.assign(new Error("invalid_file_type"), { code: "invalid_file_type" });
  }

  await ensureSocialProfileImageBucket(admin);

  const path = `${userId}/avatar-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await admin.storage
    .from(SOCIAL_PROFILE_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;
  return path;
}

export const SOCIAL_PROFILE_IMAGE_LIMIT_BYTES = MAX_SOCIAL_PROFILE_IMAGE_BYTES;
