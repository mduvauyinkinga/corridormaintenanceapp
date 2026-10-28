/**
 * upload.js
 * ------------------------------------------------------------------
 * Complaint photo helpers (self-coded backend version).
 *
 * - Validates file type (jpg / jpeg / png / webp) and size (max 5 MB).
 * - prepareImageForUpload() draws the file onto a canvas, downscales it
 *   to a max dimension and re-encodes it as a JPEG data URL. The backend
 *   accepts base64 photos inline on POST /api/complaints and enforces
 *   ~1.5 MB per decoded photo, so client-side compression keeps uploads
 *   small and fast (replaces the Firebase Storage upload).
 */

/** Allowed image MIME types. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Allowed file extensions. */
export const ALLOWED_IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

/** Maximum file size per image before compression (bytes). */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Longest edge of an uploaded photo after downscaling (pixels). */
const MAX_DIMENSION = 1600;

/** Maximum size of the compressed JPEG the server will accept (bytes). */
const MAX_OUTPUT_BYTES = 1_400_000;

/**
 * Validate a single image file.
 * Returns an error message string, or null if the file is acceptable.
 */
export function validateImageFile(file) {
  if (!file) return "No file selected.";

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const okType = ALLOWED_IMAGE_TYPES.includes(file.type);
  const okExt = ALLOWED_IMAGE_EXT.includes(ext);

  if (!okType && !okExt) {
    return "Only JPG, JPEG, PNG or WEBP images are allowed.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Each image must be 5 MB or smaller.";
  }
  return null;
}

/** Load a File into an HTMLImageElement. */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read."));
    };
    img.src = url;
  });
}

/**
 * Compress an image file into a JPEG data URL ready for
 * POST /api/complaints (photos array).
 * @param {File} file - The image file to upload.
 * @param {function(number):void} [onProgress] - Called with 0-100 percent.
 * @returns {Promise<string>} a "data:image/jpeg;base64,..." URL.
 */
export async function prepareImageForUpload(file, onProgress) {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const img = await loadImage(file);
  if (onProgress) onProgress(25);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  if (onProgress) onProgress(75);

  // Step quality down until the payload fits the server's limit.
  let dataURL = canvas.toDataURL("image/jpeg", 0.85);
  let quality = 0.85;
  while (dataURL.length > MAX_OUTPUT_BYTES && quality > 0.4) {
    quality -= 0.2;
    dataURL = canvas.toDataURL("image/jpeg", quality);
  }

  if (onProgress) onProgress(100);
  return dataURL;
}
