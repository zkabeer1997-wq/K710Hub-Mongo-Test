import 'server-only';
import path from 'node:path';
import fs from 'node:fs';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { createDriveClient } from './driveClient.mjs';
import { createFakeDrive } from './driveFake.mjs';
import { createMongoTokenStore } from './driveTokenStore.mjs';

// Tests (and only tests) replace the drive via setDriveStorageFactory(); there
// is deliberately no production env flag that can switch to a fake.
const CACHE_SLOT = Symbol.for('k710.driveAccessTokenCache');
const SLOT = Symbol.for('k710.driveStorageFactory');

export function setDriveStorageFactory(factory) { globalThis[SLOT] = factory || null; }

export function isDriveOAuthConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET);
}

/**
 * Local-development fake Drive. Only when NODE_ENV === 'development': either
 * DRIVE_STORAGE_FAKE_DIR is set, or the marker file .data/drive-fake/.enable
 * exists (so it can be toggled without restarting the dev server).
 */
function fakeDirForDev() {
  if (process.env.NODE_ENV !== 'development') return null;
  if (process.env.DRIVE_STORAGE_FAKE_DIR) return path.resolve(process.env.DRIVE_STORAGE_FAKE_DIR);
  const dir = path.resolve(process.cwd(), '.data/drive-fake');
  return fs.existsSync(path.join(dir, '.enable')) ? dir : null;
}

export async function getTokenStore() {
  return createMongoTokenStore(await getCollection(COLLECTIONS.INTEGRATION_TOKENS));
}

/** Returns a Drive client (real or injected/fake). Check getStatus().connected before use. */
export async function getDriveStorage() {
  const injected = globalThis[SLOT];
  if (injected) return injected();
  const fakeDir = fakeDirForDev();
  if (fakeDir) return createFakeDrive(fakeDir);
  return createDriveClient({
    store: await getTokenStore(),
    clientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    tokenCache: (globalThis[CACHE_SLOT] ||= {}),
  });
}

export function clearDriveAccessCache() {
  const cache = globalThis[CACHE_SLOT];
  if (cache) cache.access = null;
}
