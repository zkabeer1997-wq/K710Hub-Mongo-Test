import { randomUUID } from 'node:crypto';
import { bytesMatchImageType } from './interestUploadLimits.mjs';
import { readImageDimensions } from './imageDimensions.mjs';

export const GALLERY_MAX_FILE_SIZE = 4 * 1024 * 1024;
export const GALLERY_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const CONNECT_DRIVE_MESSAGE = 'Connect Google Drive first (one-time setup).';
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

/** Validates upload fields + bytes. Returns { error, status } or { value, bytes }. */
export function validateGalleryUpload({ file, buffer, title, caption, altText, position }) {
  if (!file) return { error: 'Choose an image to upload.', status: 400 };
  if (!GALLERY_ALLOWED_TYPES.has(file.type)) return { error: 'Use a JPG, PNG, WebP, or GIF image.', status: 415 };
  if (file.size > GALLERY_MAX_FILE_SIZE || buffer.length > GALLERY_MAX_FILE_SIZE) return { error: 'Images must be 4 MB or smaller.', status: 413 };
  if (!altText || altText.length > 240) return { error: 'Image description is required and must be 240 characters or fewer.', status: 400 };
  if (title.length > 120 || caption.length > 500) return { error: 'Title or caption is too long.', status: 400 };
  if (!Number.isInteger(position) || position < 0 || position > 100000) return { error: 'Position must be a whole number between 0 and 100000.', status: 400 };
  if (!bytesMatchImageType(buffer, file.type)) return { error: 'This file is not a valid image of the selected type.', status: 415 };
  return { ok: true };
}

/** Metadata-only validation (for the "Choose from Google Drive" path, where there are no local bytes yet). */
export function validateGalleryFields({ title, caption, altText, position }) {
  if (!altText || altText.length > 240) return { error: 'Image description is required and must be 240 characters or fewer.', status: 400 };
  if (title.length > 120 || caption.length > 500) return { error: 'Title or caption is too long.', status: 400 };
  if (!Number.isInteger(position) || position < 0 || position > 100000) return { error: 'Position must be a whole number between 0 and 100000.', status: 400 };
  return { ok: true };
}

/** Builds the gallery_images document from a stored site image record (lib/siteImages.mjs). */
export function galleryDocFromSiteImage(record, { title, caption, altText, position, isPublished, now = new Date() }) {
  return {
    id: randomUUID(),
    storage: 'drive',
    drive_file_id: record.drive_file_id,
    drive_md5: record.md5 || '',
    ...(record.storage === 'reference' ? { drive_reference: true } : {}),
    site_image_id: String(record._id),
    mime_type: record.mime,
    size: record.size,
    ...(record.width ? { width: record.width, height: record.height } : {}),
    title, caption, alt_text: altText, position,
    is_published: isPublished,
    created_at: now,
    updated_at: now,
  };
}

/** Uploads to Drive and builds the metadata-only document (no image bytes). */
export async function storeGalleryImageInDrive({ drive, folderId, buffer, mimeType, title, caption, altText, position, isPublished, now = new Date() }) {
  const id = randomUUID();
  const uploaded = await drive.uploadFile({ name: `${id}.${EXT[mimeType] || 'bin'}`, mimeType, bytes: buffer, ...(folderId ? { folderId } : {}) });
  const dims = readImageDimensions(buffer);
  const doc = {
    id,
    storage: 'drive',
    drive_file_id: uploaded.id,
    drive_md5: uploaded.md5Checksum || '',
    mime_type: mimeType,
    size: buffer.length,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
    title, caption, alt_text: altText, position,
    is_published: isPublished,
    created_at: now,
    updated_at: now,
  };
  return doc;
}
