import crypto from 'node:crypto';
import { decodeImageDataUrl } from './imageDataUrl.mjs';

// Same-origin image delivery for gallery rows. Drive ids / tokens never leave
// the server; errors yield a placeholder image rather than a broken page.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CACHE = 'public, max-age=86400, stale-while-revalidate=604800';
const SMALL_LIMIT = 512 * 1024;
const LRU_MAX_ENTRIES = 40;
const LRU_MAX_BYTES = 16 * 1024 * 1024;

const lru = new Map(); // key -> { bytes, type }
let lruBytes = 0;
export function clearGalleryImageCache() { lru.clear(); lruBytes = 0; }
function lruGet(key) {
  const hit = lru.get(key);
  if (hit) { lru.delete(key); lru.set(key, hit); }
  return hit;
}
function lruSet(key, value) {
  if (lru.has(key)) { lruBytes -= lru.get(key).bytes.length; lru.delete(key); }
  lru.set(key, value); lruBytes += value.bytes.length;
  while (lru.size > LRU_MAX_ENTRIES || lruBytes > LRU_MAX_BYTES) {
    const oldest = lru.keys().next().value;
    lruBytes -= lru.get(oldest).bytes.length; lru.delete(oldest);
  }
}

const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="Image unavailable"><rect width="400" height="300" fill="#17191e"/><path d="M120 200l50-60 40 44 30-30 40 46z" fill="#2c313a"/><circle cx="150" cy="110" r="18" fill="#2c313a"/></svg>`;
export function placeholderResponse(status) {
  return new Response(PLACEHOLDER, {
    status,
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function etagFor(parts) { return `"${crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 24)}"`; }

function imageHeaders({ type, etag, size, isPublic }) {
  const h = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    ETag: etag,
    'Cache-Control': isPublic ? PUBLIC_CACHE : 'private, no-store',
  };
  if (size != null) h['Content-Length'] = String(size);
  return h;
}

/**
 * @param {object} args
 * @param {string} args.id gallery_images public id (uuid)
 * @param {object} args.coll gallery_images collection
 * @param {() => Promise<object>} args.getDrive lazily resolves the Drive client
 * @param {() => Promise<boolean>} args.isAdmin
 * @param {string|null} args.ifNoneMatch
 */
export async function deliverGalleryImage({ id, coll, getDrive, isAdmin, ifNoneMatch }) {
  if (!ID_RE.test(id || '')) return placeholderResponse(404);
  let row;
  try { row = await coll.findOne({ id }); } catch { return placeholderResponse(502); }
  if (!row) return placeholderResponse(404);

  let isPublic = row.is_published === true;
  if (!isPublic) {
    // Unpublished images exist only for admins previewing them.
    if (!(await isAdmin())) return placeholderResponse(404);
  }
  const matches = (etag) => ifNoneMatch && ifNoneMatch.split(',').map((s) => s.trim().replace(/^W\//, '')).includes(etag);

  // Drive-backed.
  if (row.drive_file_id) {
    const etag = etagFor(['drive', row.drive_file_id, row.drive_md5 || '', row.size || '']);
    if (matches(etag)) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': isPublic ? PUBLIC_CACHE : 'private, no-store' } });
    const key = `${id}:${etag}`;
    if (isPublic) {
      const hit = lruGet(key);
      if (hit) return new Response(hit.bytes, { status: 200, headers: imageHeaders({ type: hit.type, etag, size: hit.bytes.length, isPublic }) });
    }
    try {
      const drive = await getDrive();
      const file = await drive.downloadFile(row.drive_file_id);
      const type = row.mime_type || file.mimeType;
      const size = file.size ?? row.size ?? null;
      if (isPublic && size != null && size <= SMALL_LIMIT) {
        const bytes = Buffer.from(await new Response(file.body).arrayBuffer());
        lruSet(key, { bytes, type });
        return new Response(bytes, { status: 200, headers: imageHeaders({ type, etag, size: bytes.length, isPublic }) });
      }
      return new Response(file.body, { status: 200, headers: imageHeaders({ type, etag, size, isPublic }) });
    } catch (error) {
      if (error?.code === 'not_found') return placeholderResponse(404);
      console.error('gallery image Drive fetch failed', error?.code || error?.message);
      return placeholderResponse(502);
    }
  }

  // Legacy rows.
  const url = String(row.image_url || '');
  const decoded = decodeImageDataUrl(url);
  if (decoded) {
    const etag = etagFor(['db', id, decoded.bytes.length, row.updated_at ? new Date(row.updated_at).getTime() : '']);
    if (matches(etag)) return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': isPublic ? PUBLIC_CACHE : 'private, no-store' } });
    return new Response(decoded.bytes, { status: 200, headers: imageHeaders({ type: decoded.type, etag, size: decoded.bytes.length, isPublic }) });
  }
  if (/^https:\/\//i.test(url)) {
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': isPublic ? PUBLIC_CACHE : 'private, no-store' } });
  }
  return placeholderResponse(404);
}
