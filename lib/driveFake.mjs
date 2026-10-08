import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DriveError } from './driveClient.mjs';

// File-backed stand-in for Drive. Used by tests (inject a dir) and by LOCAL
// development only (see driveStorage.server.js). Never selected in production.
//
// Layout (so a developer can browse it like a real Drive):
//   <dir>/<id>.json            metadata for every file/folder (flat index)
//   <dir>/<id>.bin             bytes of files uploaded without a folder (legacy)
//   <dir>/tree/<folder path>/  real directories mirroring the folder tree;
//                              files inside are stored as "<name>" (or
//                              "<id>-<name>" when the name is taken).
const FOLDER = 'application/vnd.google-apps.folder';
const ID_RE = /^[a-z0-9-]{8,80}$/i;

function safeSegment(name) {
  const clean = String(name).replace(/[\\/\0]/g, '_').replace(/^\.+$/, '_').trim();
  return clean.slice(0, 120) || '_';
}

export function createFakeDrive(dir) {
  const metaPath = (id) => path.join(dir, `${id}.json`);
  const legacyBin = (id) => path.join(dir, `${id}.bin`);

  async function readMeta(id) {
    if (!ID_RE.test(String(id))) throw new DriveError('not_found', 'File not found.', 404);
    try { return JSON.parse(await fs.readFile(metaPath(id), 'utf8')); }
    catch { throw new DriveError('not_found', 'File not found.', 404); }
  }
  async function writeMeta(meta) { await fs.writeFile(metaPath(meta.id), JSON.stringify(meta)); }
  async function allMeta() {
    let names = [];
    try { names = await fs.readdir(dir); } catch { return []; }
    const out = [];
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      try { out.push(JSON.parse(await fs.readFile(path.join(dir, n), 'utf8'))); } catch { /* skip */ }
    }
    return out;
  }
  async function folderDir(folderId) {
    if (!folderId) return null;
    const meta = await readMeta(folderId);
    if (meta.mimeType !== FOLDER) throw new DriveError('not_found', 'Folder not found.', 404);
    return path.join(dir, 'tree', ...meta.pathSegments);
  }
  async function storeBytes(meta, buf, folderId) {
    const target = await folderDir(folderId);
    if (!target) { await fs.writeFile(legacyBin(meta.id), buf); return; }
    await fs.mkdir(target, { recursive: true });
    let file = safeSegment(meta.name);
    try { await fs.access(path.join(target, file)); file = `${meta.id}-${file}`; } catch { /* name free */ }
    await fs.writeFile(path.join(target, file), buf);
    meta.binRel = path.relative(dir, path.join(target, file));
  }
  async function readBytes(meta) {
    return fs.readFile(meta.binRel ? path.join(dir, meta.binRel) : legacyBin(meta.id));
  }

  return {
    fake: true,
    root: dir,
    async getStatus() { return { connected: true, fake: true, email: 'local fake Drive', folderName: 'K710 Website (local)' }; },
    async ensureFolder() { await fs.mkdir(dir, { recursive: true }); return 'fake-folder'; },
    async findOrCreateFolder(name, parentId = null) {
      await fs.mkdir(dir, { recursive: true });
      const existing = (await allMeta()).find((m) => m.mimeType === FOLDER && !m.trashed && m.name === name && (m.parentId || null) === (parentId || null));
      if (existing) return existing.id;
      const parent = parentId ? await readMeta(parentId) : null;
      const id = `fake-folder-${crypto.randomUUID()}`;
      const pathSegments = [...(parent?.pathSegments || []), safeSegment(name)];
      await fs.mkdir(path.join(dir, 'tree', ...pathSegments), { recursive: true });
      await writeMeta({ id, name, mimeType: FOLDER, parentId: parentId || null, pathSegments, trashed: false, modifiedTime: new Date().toISOString(), webViewLink: `https://drive.google.com/drive/folders/${id}` });
      return id;
    },
    async uploadFile({ name, mimeType, bytes, folderId }) {
      await fs.mkdir(dir, { recursive: true });
      const fileId = `fake-${crypto.randomUUID()}`;
      const buf = Buffer.from(bytes);
      const meta = { id: fileId, name, mimeType, size: buf.length, md5Checksum: crypto.createHash('md5').update(buf).digest('hex'), modifiedTime: new Date().toISOString(), trashed: false, parentId: folderId || null, webViewLink: `https://drive.google.com/file/d/${fileId}/view` };
      await storeBytes(meta, buf, folderId);
      await writeMeta(meta);
      return meta;
    },
    async copyFile(fileId, { name, folderId }) {
      const src = await readMeta(fileId);
      if (src.mimeType === FOLDER || src.trashed) throw new DriveError('not_found', 'File not found.', 404);
      return this.uploadFile({ name: name || src.name, mimeType: src.mimeType, bytes: await readBytes(src), folderId });
    },
    async getAccessToken() { return 'fake-access-token'; },
    async getInfo(fileId) { return readMeta(fileId); },
    async downloadFile(fileId) {
      const meta = await readMeta(fileId);
      if (meta.trashed || meta.mimeType === FOLDER) throw new DriveError('not_found', 'File not found.', 404);
      const buf = await readBytes(meta);
      return { body: new Response(buf).body, mimeType: meta.mimeType, size: buf.length, md5Checksum: meta.md5Checksum };
    },
    async trashFile(fileId) {
      const meta = await readMeta(fileId);
      meta.trashed = true;
      await writeMeta(meta);
    },
    /** Fake-only helper for the local picker: every live image with its folder path. */
    async listImages() {
      const metas = await allMeta();
      const byId = new Map(metas.map((m) => [m.id, m]));
      return metas
        .filter((m) => m.mimeType !== FOLDER && !m.trashed && /^image\//.test(m.mimeType || ''))
        .map((m) => ({ id: m.id, name: m.name, mimeType: m.mimeType, size: m.size, folderPath: (byId.get(m.parentId)?.pathSegments || []).join(' / '), modifiedTime: m.modifiedTime }))
        .sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    },
  };
}
