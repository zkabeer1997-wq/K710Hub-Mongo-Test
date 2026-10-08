import 'server-only';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getDriveStorage } from './driveStorage.server.js';
import { createFolderTree } from './driveFolders.mjs';
import { createSiteImages } from './siteImages.mjs';

export { siteImageUrl, publicSiteImage, SiteImageError, CONNECT_DRIVE_MESSAGE } from './siteImages.mjs';

const MEMORY = Symbol.for('k710.driveFolderMemory');

/** Folder tree helper bound to this server's Drive + cached ids. */
export async function getFolderTree(drive) {
  let cacheColl = null;
  try { cacheColl = await getCollection(COLLECTIONS.DRIVE_FOLDERS); } catch { /* cache is optional */ }
  return createFolderTree({ drive, cacheColl, memory: (globalThis[MEMORY] ||= new Map()) });
}

/**
 * The shared image API for routes (admin only; callers authorise first):
 *   const images = await getSiteImages();       // throws SiteImageError(409) when Drive is not connected
 *   const doc = await images.store({ folder: 'hero', file, name, alt, createdBy });
 *   const doc = await images.copyPicked({ folder: 'tool', fileId, alt });
 *   publicSiteImage(doc) -> { id, url: '/api/site-image/<id>', ... }
 */
export async function getSiteImages({ requireConnected = true } = {}) {
  const drive = await getDriveStorage();
  if (requireConnected) {
    const status = await drive.getStatus();
    if (!status.connected) {
      const { SiteImageError, CONNECT_DRIVE_MESSAGE } = await import('./siteImages.mjs');
      throw new SiteImageError(CONNECT_DRIVE_MESSAGE, 409, { needsConnect: true });
    }
  }
  const coll = await getCollection(COLLECTIONS.SITE_IMAGES);
  const tree = await getFolderTree(drive);
  return { drive, tree, ...createSiteImages({ drive, tree, coll }) };
}

/** store({ folder, subfolder, file, name }) one-liner for other server modules. */
export async function storeSiteImage(args) { return (await getSiteImages()).store(args); }
export async function copyPickedImage(args) { return (await getSiteImages()).copyPicked(args); }
