/** Matches the `files` storage bucket limit (50 MB, the Supabase free-plan maximum). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Preview images for approvals (the "previews" bucket allows 10 MB). */
export const MAX_PREVIEW_BYTES = 10 * 1024 * 1024;
export const PREVIEW_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
