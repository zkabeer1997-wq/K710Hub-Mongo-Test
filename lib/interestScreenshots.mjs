// Applicant screenshots -> Google Drive: K710 Website/Applications/<Player ID>/.
// interest_submissions keeps metadata only:
//   screenshot_files: [{ idx, drive_file_id, name, mime, size, md5, folder_id }]
//   drive_folder_id, drive_folder_link, screenshot_storage: 'drive'|'db'|'mixed'
// Screenshots that could not reach Drive (not connected / outage) stay as base64
// in `screenshot_urls` (the documented temporary fallback) until
// migrateInterestBatch() moves them; legacy rows look exactly like that.
import { decodeImageDataUrl } from './imageDataUrl.mjs';
import { applicantFolderName } from './driveFolders.mjs';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const INTEREST_MIGRATION_BATCH = 3;
export const WAITING_FILTER = Object.freeze({ screenshot_urls: { $regex: '^data:' } });

const isDataUrl = (u) => typeof u === 'string' && u.startsWith('data:');

async function folderWithRetry(tree, name, run) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const folderId = await tree.folderId('application', name);
    try { return await run(folderId); }
    catch (error) {
      if (attempt === 0 && error?.code === 'not_found') { await tree.invalidate(); continue; }
      throw error;
    }
  }
  return null;
}

/**
 * Uploads screenshots not already in `existing` (retry/resume safe: matches by idx).
 * Stops at the first Drive failure; `failed` lists the indexes that did not make it.
 * @param {{drive:object, tree:object, playerId:string, files:Array<{bytes:Buffer,type:string}>, existing?:Array, onProgress?:(files:Array)=>Promise<void>, now?:()=>number}} a
 */
export async function uploadApplicantScreenshots({ drive, tree, playerId, files, existing = [], onProgress, now = Date.now }) {
  const folderName = applicantFolderName(playerId);
  const done = [...existing];
  const failed = [];
  let folderId = existing[0]?.folder_id || '';
  let stopped = false;
  for (let i = 0; i < files.length; i += 1) {
    if (done.some((f) => f.idx === i)) continue;
    if (stopped) { failed.push(i); continue; }
    try {
      const meta = await folderWithRetry(tree, folderName, async (id) => {
        folderId = id;
        const name = `screenshot-${i + 1}-${now()}.${EXT[files[i].type] || 'jpg'}`;
        const up = await drive.uploadFile({ name, mimeType: files[i].type, bytes: files[i].bytes, folderId: id });
        return { idx: i, drive_file_id: up.id, name, mime: files[i].type, size: files[i].bytes.length, md5: up.md5Checksum || '', folder_id: id };
      });
      done.push(meta);
      if (onProgress) await onProgress(done);
    } catch (error) {
      console.error('applicant screenshot upload failed', error?.code || error?.message);
      stopped = true; failed.push(i);
    }
  }
  return { files: done, failed, folderId, folderName };
}

export function storageLabel({ filesCount, dbCount }) {
  if (filesCount && dbCount) return 'mixed';
  return dbCount ? 'db' : 'drive';
}

/** Screenshot slots as the admin sees them: Drive files (by idx) then remaining stored/legacy URLs. */
export function screenshotSlots(row) {
  const files = [...(row?.screenshot_files || [])].sort((a, b) => a.idx - b.idx).map((f) => ({ kind: 'drive', file: f }));
  const urls = (row?.screenshot_urls || []).map((url) => ({ kind: isDataUrl(url) ? 'data' : 'url', url }));
  return [...files, ...urls];
}

export function screenshotProxyUrl(rowId, index) {
  return `/api/admin-interest-submissions/${encodeURIComponent(rowId)}/screenshot/${index}`;
}

/**
 * Moves up to `batchSize` applications whose screenshots are still base64 to Drive.
 * Idempotent: only rows with data: URLs are selected; base64 is dropped only after
 * every file of the row was re-read from Drive with a matching size.
 */
export async function migrateInterestBatch({ coll, drive, tree, batchSize = INTEREST_MIGRATION_BATCH, skipIds = [], now = () => new Date() }) {
  const rows = await coll.find({ ...WAITING_FILTER, ...(skipIds.length ? { id: { $nin: skipIds } } : {}) }).sort({ created_at: 1 }).limit(batchSize).toArray();
  const migrated = []; const failed = [];
  for (const row of rows) {
    const uploadedIds = [];
    try {
      const urls = row.screenshot_urls || [];
      const toMove = urls.map((url, position) => ({ url, position })).filter((x) => isDataUrl(x.url));
      const decoded = toMove.map((x) => ({ ...x, img: decodeImageDataUrl(x.url) }));
      if (decoded.some((d) => !d.img)) throw new Error('A stored screenshot is not a valid image.');
      const existing = row.screenshot_files || [];
      const prepared = decoded.map((d) => ({ bytes: d.img.bytes, type: d.img.type }));
      // idx = original slot position, offset past existing Drive files so ids never collide.
      const base = Math.max(-1, ...existing.map((f) => f.idx)) + 1;
      const result = await uploadApplicantScreenshots({ drive, tree, playerId: row.player_id, files: prepared, existing: [], now: () => Date.now() });
      result.files.forEach((f) => uploadedIds.push(f.drive_file_id));
      if (result.failed.length) throw new Error('Drive upload failed.');
      for (const f of result.files) {
        const info = await drive.getInfo(f.drive_file_id);
        if (info.trashed || (info.size != null && Number(info.size) !== f.size)) throw new Error('Drive copy did not verify.');
      }
      const newFiles = result.files.map((f) => ({ ...f, idx: base + f.idx }));
      const keptUrls = urls.filter((u) => !isDataUrl(u));
      const link = await tree.webViewLink(result.folderId);
      await coll.updateOne({ id: row.id }, { $set: {
        screenshot_files: [...existing, ...newFiles], screenshot_urls: keptUrls,
        screenshot_storage: storageLabel({ filesCount: 1, dbCount: 0 }), screenshot_state: 'done',
        drive_folder_id: result.folderId, ...(link ? { drive_folder_link: link } : {}), updated_at: now(),
      } });
      migrated.push(row.id);
    } catch (error) {
      for (const id of uploadedIds) { try { await drive.trashFile(id); } catch { /* ignore */ } }
      failed.push({ id: row.id, error: String(error?.message || error).slice(0, 160) });
    }
  }
  const remaining = await coll.countDocuments({ ...WAITING_FILTER, ...(([...skipIds, ...failed.map((f) => f.id)]).length ? { id: { $nin: [...skipIds, ...failed.map((f) => f.id)] } } : {}) });
  return { migrated, failed, remaining };
}
