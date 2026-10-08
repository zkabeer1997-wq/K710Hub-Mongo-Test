import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DriveError } from './driveClient.mjs';

// File-backed stand-in for Drive. Used by tests (inject a dir) and by LOCAL
// development only (see driveStorage.server.js). Never selected in production.
export function createFakeDrive(dir) {
  const metaPath = (id) => path.join(dir, `${id}.json`);
  const binPath = (id) => path.join(dir, `${id}.bin`);
  async function readMeta(id) {
    if (!/^[a-z0-9-]{8,64}$/i.test(String(id))) throw new DriveError('not_found', 'File not found.', 404);
    try { return JSON.parse(await fs.readFile(metaPath(id), 'utf8')); }
    catch { throw new DriveError('not_found', 'File not found.', 404); }
  }
  return {
    fake: true,
    async getStatus() { return { connected: true, fake: true, email: 'local fake Drive', folderName: 'K710 Gallery (local)' }; },
    async ensureFolder() { await fs.mkdir(dir, { recursive: true }); return 'fake-folder'; },
    async uploadFile({ name, mimeType, bytes }) {
      await fs.mkdir(dir, { recursive: true });
      const fileId = `fake-${crypto.randomUUID()}`;
      const buf = Buffer.from(bytes);
      const meta = { id: fileId, name, mimeType, size: buf.length, md5Checksum: crypto.createHash('md5').update(buf).digest('hex'), modifiedTime: new Date().toISOString(), trashed: false };
      await fs.writeFile(binPath(fileId), buf);
      await fs.writeFile(metaPath(fileId), JSON.stringify(meta));
      return meta;
    },
    async getInfo(fileId) { return readMeta(fileId); },
    async downloadFile(fileId) {
      const meta = await readMeta(fileId);
      if (meta.trashed) throw new DriveError('not_found', 'File not found.', 404);
      const buf = await fs.readFile(binPath(fileId));
      return { body: new Response(buf).body, mimeType: meta.mimeType, size: buf.length, md5Checksum: meta.md5Checksum };
    },
    async trashFile(fileId) {
      const meta = await readMeta(fileId);
      meta.trashed = true;
      await fs.writeFile(metaPath(fileId), JSON.stringify(meta));
    },
  };
}
