// Shared module-hook pieces for tests that import routes using the Drive layer
// (lib/driveStorage.server.js, lib/siteImages.server.js). Call from your own
// registerHooks({ resolve, load }):
//   resolve: const r = driveHookResolve(s, c, next); if (r) return r;
//   load:    const l = driveHookLoad(u); if (l) return l;
// `server-only` becomes an empty module and the extensionless .server imports resolve.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFakeDrive } from '../../lib/driveFake.mjs';

export function driveHookResolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'test:server-only', shortCircuit: true };
  if (/\/(siteImages|driveStorage)\.server$/.test(specifier)) return nextResolve(`${specifier}.js`, context);
  return null;
}
export function driveHookLoad(url) {
  if (url === 'test:server-only') return { format: 'module', shortCircuit: true, source: '' };
  return null;
}
export async function tmpFakeDrive() {
  return createFakeDrive(await fs.mkdtemp(path.join(os.tmpdir(), 'k710-fake-')));
}
