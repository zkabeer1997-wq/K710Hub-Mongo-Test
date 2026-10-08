import { decodeImageDataUrl } from './imageDataUrl.mjs';
import { readImageDimensions } from './imageDimensions.mjs';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MIGRATION_BATCH_SIZE = 5;

export const legacyFilter = (skipIds = []) => ({
  image_url: /^data:/,
  drive_file_id: { $in: [null, ''] },
  ...(skipIds.length ? { id: { $nin: skipIds } } : {}),
});

export async function countLegacyImages(coll) {
  return coll.countDocuments(legacyFilter());
}

/**
 * Moves up to `batchSize` legacy base64 rows to Drive. Idempotent: rows that
 * already have a drive_file_id are never selected. The base64 is removed only
 * after the uploaded file is re-read from Drive and its size matches.
 */
export async function migrateBatch({ coll, drive, batchSize = MIGRATION_BATCH_SIZE, skipIds = [], now = () => new Date() }) {
  const rows = await coll.find(legacyFilter(skipIds)).sort({ created_at: 1 }).limit(batchSize).toArray();
  const migrated = [];
  const failed = [];
  for (const row of rows) {
    try {
      const decoded = decodeImageDataUrl(row.image_url);
      if (!decoded) throw new Error('Stored image is not a valid image data URL.');
      const up = await drive.uploadFile({ name: `${row.id}.${EXT[decoded.type] || 'bin'}`, mimeType: decoded.type, bytes: decoded.bytes });
      const info = await drive.getInfo(up.id);
      if (info.trashed || (info.size != null && Number(info.size) !== decoded.bytes.length)) {
        try { await drive.trashFile(up.id); } catch { /* ignore */ }
        throw new Error('Drive copy did not verify.');
      }
      const dims = readImageDimensions(decoded.bytes);
      await coll.updateOne(
        { id: row.id, drive_file_id: { $in: [null, ''] } },
        {
          $set: {
            storage: 'drive', drive_file_id: up.id, drive_md5: info.md5Checksum || up.md5Checksum || '',
            mime_type: decoded.type, size: decoded.bytes.length, ...(dims ? { width: dims.width, height: dims.height } : {}),
            updated_at: now(),
          },
          $unset: { image_url: '' },
        }
      );
      migrated.push(row.id);
    } catch (error) {
      failed.push({ id: row.id, error: String(error?.message || error).slice(0, 160) });
    }
  }
  const remaining = await coll.countDocuments(legacyFilter([...skipIds, ...failed.map((f) => f.id)]));
  return { migrated, failed, remaining };
}
