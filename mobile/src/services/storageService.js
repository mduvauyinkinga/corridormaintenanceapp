/**
 * services/storageService.js
 * ------------------------------------------------------------------
 * Complaint photo preparation — mobile port of the website's `js/upload.js`.
 *
 * Same validation  : jpg/jpeg/png/webp and <= 5 MB per image.
 * Storage model    : like the website, photos are prepared client-side
 *                    and sent INLINE as base64 data-URLs with
 *                    POST /api/complaints (the server enforces ~1.5 MB
 *                    decoded per photo, max 5 photos, and re-serves them
 *                    from /api/complaints/:id/photos/:pid). There is no
 *                    separate upload step and no Firebase Storage.
 *
 * React Native note: there is no <canvas> here, so instead of re-encoding
 * we read the picked file (already JPEG-compressed by expo-image-picker's
 * `quality` option) as base64. Oversized results are rejected with a
 * friendly error rather than failing server-side.
 */

import { validateImageAsset } from "../utils/validation";

/** Maximum decoded bytes per photo the server accepts. */
const MAX_PHOTO_BYTES = 1500000; // ~1.5MB, matches server/src/controllers

/** Content type for the data-URL prefix (server sniffs it too). */
function resolveContentType(asset) {
  if (asset.mimeType && asset.mimeType.startsWith("image/")) return asset.mimeType;
  const source = asset.fileName || asset.uri || "";
  const ext = (source.split(".").pop() || "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

/** Convert a local file URI into a base64 data-URL (React Native fetch). */
async function uriToDataUrl(asset, onProgress) {
  if (onProgress) onProgress(30);
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  if (onProgress) onProgress(60);

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("This image could not be read."));
    reader.readAsDataURL(blob);
  });
  if (onProgress) onProgress(100);
  return dataUrl;
}

/**
 * Prepare one complaint photo as a base64 data-URL ready for the
 * `photos` array of POST /api/complaints.
 * @param {object} asset expo-image-picker asset ({ uri, fileName, mimeType, fileSize }).
 * @param {string} uid   the signed-in user's uid (kept for call parity; unused).
 * @param {(percent:number)=>void} [onProgress] 0-100 progress callback.
 * @returns {Promise<string>} a "data:image/jpeg;base64,..." URL.
 */
export async function uploadComplaintPhoto(asset, uid, onProgress) {
  const validationError = validateImageAsset(asset);
  if (validationError) throw new Error(validationError);

  const dataUrl = await uriToDataUrl(asset, onProgress);

  // Reject payloads the server would refuse (decoded size ≈ base64 * 0.75).
  const approxDecodedBytes = Math.floor(String(dataUrl).length * 0.75);
  if (approxDecodedBytes > MAX_PHOTO_BYTES) {
    throw new Error(
      "This photo is too large after picking. Please choose a smaller photo."
    );
  }

  // Normalise to the declared MIME type so the data-URL prefix matches
  // what the picker reported (jpg/png/webp).
  const contentType = resolveContentType(asset);
  const base64 = String(dataUrl).replace(/^data:[^;]+;base64,/, "");
  return `data:${contentType};base64,${base64}`;
}
