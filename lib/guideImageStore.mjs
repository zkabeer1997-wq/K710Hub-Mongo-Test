// Guide builder images: stored in Drive "K710 Website/Guides images"; the
// guide_attachments row keeps metadata only and the public URL stays
// /api/guide-images/<uuid>.<ext> (same-origin proxy, long cache). Legacy rows
// (data_url base64) keep working until migrated.
import { randomUUID } from 'node:crypto';
import { decodeImageDataUrl } from './imageDataUrl.mjs';
import { SITE_IMAGE_EXT } from './siteImages.mjs';

export const GUIDE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const GUIDE_FILE_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
export const GUIDE_MIGRATION_BATCH = 5;
export const guideLegacyFilter = (skipPaths = []) => ({
  data_url: /^data:/,
  drive_file_id: { $in: [null, ''] },
  ...(skipPaths.length ? { path: { $nin: skipPaths } } : {}),
});

/** Builds the guide_attachments metadata row from a stored site image record. */
export function guideAttachmentFromSiteImage(record, { guide, now = new Date() }) {
  return {
    path: `${randomUUID()}.${SITE_IMAGE_EXT[record.mime] || 'bin'}`,
    storage: 'drive',
    content_type: record.mime,
    drive_file_id: record.drive_file_id,
    drive_md5: record.md5 || '',
    ...(record.storage === 'reference' ? { drive_reference: true } : {}),
    site_image_id: String(record._id),
    size: record.size,
    guide,
    created_at: now,
  };
}

export async function migrateGuideBatch({ coll, drive, tree, batchSize = GUIDE_MIGRATION_BATCH, skipPaths = [] }) {
  const rows = await coll.find(guideLegacyFilter(skipPaths)).sort({ created_at: 1 }).limit(batchSize).toArray();
  const migrated = []; const failed = [];
  for (const row of rows) {
    let uploadedId = '';
    try {
      const decoded = decodeImageDataUrl(row.data_url);
      if (!decoded) throw new Error('Stored image is not a valid image data URL.');
      const folderId = await tree.folderId('guide');
      const up = await drive.uploadFile({ name: row.path, mimeType: decoded.type, bytes: decoded.bytes, folderId });
      uploadedId = up.id;
      const info = await drive.getInfo(up.id);
      if (info.trashed || (info.size != null && Number(info.size) !== decoded.bytes.length)) throw new Error('Drive copy did not verify.');
      await coll.updateOne(
        { path: row.path, drive_file_id: { $in: [null, ''] } },
        { $set: { storage: 'drive', drive_file_id: up.id, drive_md5: info.md5Checksum || up.md5Checksum || '', content_type: decoded.type, size: decoded.bytes.length }, $unset: { data_url: '' } }
      );
      migrated.push(row.path);
    } catch (error) {
      if (uploadedId) { try { await drive.trashFile(uploadedId); } catch { /* ignore */ } }
      failed.push({ path: row.path, error: String(error?.message || error).slice(0, 160) });
    }
  }
  const remaining = await coll.countDocuments(guideLegacyFilter([...skipPaths, ...failed.map((f) => f.path)]));
  return { migrated, failed, remaining };
}
