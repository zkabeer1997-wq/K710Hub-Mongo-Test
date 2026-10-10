// Site image store: every image the website shows or collects lives in Google
// Drive (folder tree in lib/driveFolders.mjs); MongoDB keeps metadata only, in
// the `site_images` collection:
//   { _id: <uuid>, folder, subfolder?, drive_file_id, drive_folder_id, name,
//     mime, size, md5, width, height, alt, storage: 'drive'|'reference',
//     created_at, created_by }
//
// Pure/injectable (no Next, no Mongo import) so it is unit tested with the
// fake Drive. The server wiring is lib/siteImages.server.js; use that from
// routes. Shared by gallery, guides, hero images, tool images and applications.
import crypto from 'node:crypto';
import { bytesMatchImageType, sniffImageType } from './interestUploadLimits.mjs';
import { readImageDimensions } from './imageDimensions.mjs';
import { placeholderResponse } from './galleryImageDelivery.mjs';
import { SITE_FOLDERS, FolderNameError } from './driveFolders.mjs';

export const SITE_IMAGE_PROXY_PREFIX = '/api/site-image/';
export const SITE_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const SITE_IMAGE_EXT = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' });
export const SITE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
import { SITE_IMAGE_ID_RE } from './siteImageId.mjs';
export { SITE_IMAGE_ID_RE };
export const CONNECT_DRIVE_MESSAGE = 'Connect Google Drive first (one-time setup).';
export const PICK_ACCESS_MESSAGE = 'Google Drive did not give this site access to that file. Choose it again with the Choose from Drive button, or use Upload Image.';

/**
 * Browsers draw an <img> body even when the status is 404/502, so the SVG placeholder would
 * show as a "real" picture and onError would never fire. Callers that have their own fallback
 * (guide cards) request `?fallback=none`: failures then return an empty error response.
 */
export const NO_PLACEHOLDER_QUERY = 'fallback=none';
export function withoutPlaceholder(response, strict) {
  if (!strict || response.status < 400) return response;
  return new Response(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
}

/** Same-origin URL for a site image (safe in <img src>, never exposes Drive ids). */
export function siteImageUrl(id) { return `${SITE_IMAGE_PROXY_PREFIX}${id}`; }

export class SiteImageError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.name = 'SiteImageError'; this.status = status; Object.assign(this, extra); }
}

/** Browser-safe shape: no Drive ids. */
export function publicSiteImage(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id), folder: doc.folder, url: siteImageUrl(doc._id), name: doc.name, mime: doc.mime,
    size: doc.size, width: doc.width ?? null, height: doc.height ?? null, alt: doc.alt || '', created_at: doc.created_at,
  };
}

async function toBytes(file) {
  if (!file) throw new SiteImageError('Choose an image to upload.');
  if (typeof file.arrayBuffer === 'function') return { bytes: Buffer.from(await file.arrayBuffer()), type: file.type };
  const raw = file.bytes ?? file.buffer;
  if (!raw) throw new SiteImageError('Choose an image to upload.');
  return { bytes: Buffer.from(raw), type: file.type || file.mimeType };
}

function mapDriveError(error) {
  if (error instanceof SiteImageError || error instanceof FolderNameError) return error;
  if (error?.code === 'not_connected' || error?.code === 'reauth') return new SiteImageError('Google Drive needs to be connected or reconnected.', 409, { needsConnect: true });
  return new SiteImageError('Google Drive is unavailable right now. Try again in a minute.', 502);
}

export function createSiteImages({ drive, tree, coll = null, now = () => new Date(), uuid = () => crypto.randomUUID() }) {
  async function withFolder(kind, subfolder, run) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const folderId = await tree.folderId(kind, subfolder);
      try { return await run(folderId); }
      catch (error) {
        if (attempt === 0 && error?.code === 'not_found') { await tree.invalidate(); continue; } // folder deleted by hand
        throw error;
      }
    }
    return null;
  }

  async function record({ folder, subfolder, uploaded, folderId, name, alt, createdBy, mime, size, dims, storage }) {
    const doc = {
      _id: uuid(), folder, ...(subfolder ? { subfolder } : {}), storage,
      drive_file_id: uploaded.id, drive_folder_id: folderId, name, mime, size,
      md5: uploaded.md5Checksum || '', width: dims?.width ?? null, height: dims?.height ?? null,
      alt: alt || '', created_at: now(), created_by: createdBy || 'admin',
    };
    if (coll) await coll.insertOne({ ...doc });
    return doc;
  }

  return {
    /**
     * Upload an image to Drive and record its metadata.
     * @param {{folder:string, subfolder?:string, file:(File|{bytes:Buffer,type:string}), name?:string, alt?:string, createdBy?:string, maxBytes?:number}} args
     * @returns the stored metadata doc (use publicSiteImage() before sending to a browser)
     */
    async store({ folder, subfolder, file, name, alt, createdBy, maxBytes = SITE_IMAGE_MAX_BYTES }) {
      if (!SITE_FOLDERS[folder]) throw new SiteImageError('Unknown image folder.');
      const { bytes, type } = await toBytes(file);
      if (!SITE_IMAGE_TYPES.includes(type)) throw new SiteImageError('Use a JPG, PNG, WebP, or GIF image.', 415);
      if (!bytes.length || bytes.length > maxBytes) throw new SiteImageError(`Images must be ${Math.round(maxBytes / 1048576)} MB or smaller.`, 413);
      if (!bytesMatchImageType(bytes, type)) throw new SiteImageError('This file is not a valid image of the selected type.', 415);
      const fileName = String(name || `image-${Date.now()}.${SITE_IMAGE_EXT[type]}`).replace(/[\\/\0]/g, '_').slice(0, 120);
      try {
        return await withFolder(folder, subfolder, async (folderId) => {
          const uploaded = await drive.uploadFile({ name: fileName, mimeType: type, bytes, folderId });
          return record({ folder, subfolder, uploaded, folderId, name: fileName, alt, createdBy, mime: type, size: bytes.length, dims: readImageDimensions(bytes), storage: 'drive' });
        });
      } catch (error) { throw mapDriveError(error); }
    },

    /**
     * Copy a file the admin picked in the Google Picker into the destination
     * folder (so the site never depends on a file the picker user may delete).
     * Falls back to a reference when copy fails for a non-permission reason.
     */
    async copyPicked({ folder, subfolder, fileId, name, alt, createdBy, maxBytes = SITE_IMAGE_MAX_BYTES }) {
      if (!SITE_FOLDERS[folder]) throw new SiteImageError('Unknown image folder.');
      if (!/^[A-Za-z0-9_-]{6,200}$/.test(String(fileId || ''))) throw new SiteImageError('Choose a file from Google Drive.');
      let info;
      try { info = await drive.getInfo(fileId); }
      catch (error) {
        if (error?.code === 'not_found' || error?.code === 'reauth') throw new SiteImageError(PICK_ACCESS_MESSAGE, 403);
        throw mapDriveError(error);
      }
      if (info.trashed) throw new SiteImageError('That file is in the Drive trash.', 404);
      if (!SITE_IMAGE_TYPES.includes(info.mimeType)) throw new SiteImageError('Only JPG, PNG, WebP or GIF images can be used.', 415);
      if (Number(info.size) > maxBytes) throw new SiteImageError(`Images must be ${Math.round(maxBytes / 1048576)} MB or smaller.`, 413);
      const fileName = String(name || info.name || `image-${Date.now()}`).replace(/[\\/\0]/g, '_').slice(0, 120);
      try {
        return await withFolder(folder, subfolder, async (folderId) => {
          let uploaded; let storage = 'drive';
          try { uploaded = await drive.copyFile(fileId, { name: fileName, folderId }); }
          catch (error) {
            if (error?.code === 'not_found' || error?.code === 'reauth') throw new SiteImageError(PICK_ACCESS_MESSAGE, 403);
            if (error?.code !== 'upstream') throw error;
            uploaded = info; storage = 'reference'; // copy impossible: keep a reference
          }
          // Verify what we will serve really is an image, and read its size.
          const file = await drive.downloadFile(uploaded.id);
          const bytes = Buffer.from(await new Response(file.body).arrayBuffer());
          if (!bytes.length || bytes.length > maxBytes || sniffImageType(bytes) !== info.mimeType) {
            if (storage === 'drive') { try { await drive.trashFile(uploaded.id); } catch { /* ignore */ } }
            throw new SiteImageError('That file is not a valid image.', 415);
          }
          return record({ folder, subfolder, uploaded, folderId, name: fileName, alt, createdBy, mime: info.mimeType, size: bytes.length, dims: readImageDimensions(bytes), storage });
        });
      } catch (error) { throw mapDriveError(error); }
    },

    /** Move the Drive file to the Drive trash (references are left alone) and drop the record. */
    async remove(id, { folders } = {}) {
      if (!coll) return false;
      const doc = await coll.findOne({ _id: id });
      if (!doc || (folders && !folders.includes(doc.folder))) return false;
      if (doc.storage !== 'reference') { try { await drive.trashFile(doc.drive_file_id); } catch { /* already gone */ } }
      await coll.deleteOne({ _id: id });
      return true;
    },
  };
}

// ---- Delivery ---------------------------------------------------------------

export const PUBLIC_IMAGE_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';
export const IMMUTABLE_IMAGE_CACHE = 'public, max-age=31536000, immutable';

function etagFor(parts) { return `"${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24)}"`; }

/**
 * Streams one Drive file as an image response. Used by every Drive-backed
 * proxy (site images, guide images, applicant screenshots). Drive errors turn
 * into a placeholder, never a raw error page.
 */
export async function streamDriveImage({ fileId, mime, md5 = '', size = null, cacheControl, ifNoneMatch, getDrive }) {
  const etag = etagFor(['drive', fileId, md5, size ?? '']);
  const baseHeaders = { ETag: etag, 'Cache-Control': cacheControl };
  const matches = ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag);
  if (matches) return new Response(null, { status: 304, headers: baseHeaders });
  try {
    const drive = await getDrive();
    const file = await drive.downloadFile(fileId);
    const length = file.size ?? size;
    return new Response(file.body, {
      status: 200,
      headers: {
        ...baseHeaders, 'Content-Type': mime || file.mimeType || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        ...(length != null ? { 'Content-Length': String(length) } : {}),
      },
    });
  } catch (error) {
    if (error?.code === 'not_found') return placeholderResponse(404);
    console.error('drive image fetch failed', error?.code || error?.message);
    return placeholderResponse(502);
  }
}

/** Folders whose images are public site content; the rest are admin-only. */
export const PUBLIC_SITE_FOLDERS = Object.freeze(['hero', 'tool', 'guide', 'help', 'alliance', 'lore']);

/**
 * `guideAccess(id)` (optional) says who may see a folder 'guide' picture: 'public' | 'members' | 'admin'
 * (see guideImageAccess in guideImages.mjs). Members-only pictures need a member session or admin, are
 * never publicly cacheable, and answer everyone else exactly like a missing image.
 */
export async function deliverSiteImage({ id, coll, getDrive, isAdmin, isMember, guideAccess, ifNoneMatch }) {
  if (!SITE_IMAGE_ID_RE.test(id || '')) return placeholderResponse(404);
  let doc;
  try { doc = await coll.findOne({ _id: id }); } catch { return placeholderResponse(502); }
  if (!doc) return placeholderResponse(404);
  let isPublic = PUBLIC_SITE_FOLDERS.includes(doc.folder);
  let authorized = isPublic;
  if (isPublic && doc.folder === 'guide' && guideAccess) {
    let level;
    try { level = await guideAccess(id); } catch { return placeholderResponse(502); }
    if (level !== 'public') {
      isPublic = false; // never publicly cacheable
      authorized = (await isAdmin()) || (level === 'members' && isMember ? Boolean(await isMember()) : false);
    }
  } else if (!isPublic) authorized = await isAdmin();
  if (!authorized) return placeholderResponse(404);
  return streamDriveImage({
    fileId: doc.drive_file_id, mime: doc.mime, md5: doc.md5, size: doc.size, ifNoneMatch, getDrive,
    cacheControl: isPublic ? PUBLIC_IMAGE_CACHE : 'private, no-store',
  });
}
