// The K710 Website Drive folder tree: find-or-create with cached ids.
//
//   K710 Website/
//     Gallery images/
//     Guides images/
//     Hero images/
//     Tools and calculators images/
//     Help images/
//     Applications/<Player ID>/        (one subfolder per applicant)
//
// Folder ids are cached in memory and in the `drive_folders` collection so a
// cold server instance does not search Drive again. A cached id that Drive no
// longer knows (deleted/trashed by hand) is dropped and the folder recreated.

export const ROOT_FOLDER_NAME = 'K710 Website';
export const SITE_FOLDERS = Object.freeze({
  gallery: 'Gallery images',
  guide: 'Guides images',
  hero: 'Hero images',
  tool: 'Tools and calculators images',
  help: 'Help images',
  application: 'Applications',
});
export const SITE_FOLDER_KINDS = Object.freeze(Object.keys(SITE_FOLDERS));

export class FolderNameError extends Error {
  constructor(message) { super(message); this.name = 'FolderNameError'; this.status = 400; }
}

/** Applicant folders are named by Player ID: digits only, 1-20 of them. */
export const PLAYER_ID_RE = /^\d{1,20}$/;
/** Fallback folder for legacy applications whose Player ID is not numeric. */
export const UNKNOWN_APPLICANT_FOLDER = 'unknown-player-id';
// Optional subfolders for other kinds (e.g. a hero page name): plain words only.
const SUBFOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/;

/** Returns the safe subfolder name or throws FolderNameError (path tricks, empty, wrong shape). */
export function validateSubfolder(kind, subfolder) {
  if (subfolder == null || subfolder === '') {
    if (kind === 'application') throw new FolderNameError('An applicant folder needs a numeric Player ID.');
    return '';
  }
  const value = String(subfolder);
  if (kind === 'application') {
    if (PLAYER_ID_RE.test(value) || value === UNKNOWN_APPLICANT_FOLDER) return value;
    throw new FolderNameError('Player ID must be 1-20 digits.');
  }
  if (!SUBFOLDER_RE.test(value) || value.includes('..')) throw new FolderNameError('Folder names may only use letters, numbers, spaces, - and _.');
  return value;
}

/** Digits of a typed Player ID, or the shared fallback folder name when it is not numeric. */
export function applicantFolderName(playerId) {
  const digits = String(playerId ?? '').trim().replace(/[\s,]/g, '');
  return PLAYER_ID_RE.test(digits) ? digits : UNKNOWN_APPLICANT_FOLDER;
}

/**
 * @param {object} deps
 * @param {object} deps.drive Drive client (findOrCreateFolder, getInfo)
 * @param {{findOne:Function,updateOne:Function,deleteOne:Function}|null} [deps.cacheColl] `drive_folders`
 * @param {Map<string,string>} [deps.memory] shared across requests on the same instance
 */
export const FOLDER_RECHECK_MS = 10 * 60 * 1000;

export function createFolderTree({ drive, cacheColl = null, memory = new Map(), pending = new Map(), now = Date.now }) {
  const scope = drive.fake ? `fake:${drive.root || ''}` : 'drive';
  const k = (key) => `${scope}|${key}`;

  async function resolve(key, name, parentId) {
    const cached = memory.get(k(key));
    if (cached && now() - cached.at < FOLDER_RECHECK_MS) return cached.id;
    if (pending.has(k(key))) return pending.get(k(key));
    const work = (async () => {
      let id = '';
      // A cached id is re-checked every few minutes so a folder trashed by hand is recreated.
      if (cached) {
        try { const info = await drive.getInfo(cached.id); if (!info.trashed) id = cached.id; } catch { /* recreate below */ }
      }
      if (!id && cacheColl) {
        try {
          const row = await cacheColl.findOne({ _id: k(key) });
          if (row?.folder_id) {
            // Trust but verify once per cold start.
            try { const info = await drive.getInfo(row.folder_id); if (!info.trashed) id = row.folder_id; } catch { /* recreate */ }
          }
        } catch { /* cache is optional */ }
      }
      if (!id) {
        id = await drive.findOrCreateFolder(name, parentId);
        if (cacheColl) {
          try { await cacheColl.updateOne({ _id: k(key) }, { $set: { folder_id: id, name, scope, updated_at: new Date() } }, { upsert: true }); } catch { /* cache is optional */ }
        }
      }
      memory.set(k(key), { id, at: now() });
      return id;
    })().finally(() => pending.delete(k(key)));
    pending.set(k(key), work);
    return work;
  }

  return {
    async rootId() { return resolve('root', ROOT_FOLDER_NAME, null); },
    /** Folder id for a kind (+ optional subfolder). Creates what is missing. */
    async folderId(kind, subfolder) {
      if (!SITE_FOLDERS[kind]) throw new FolderNameError('Unknown image folder.');
      const sub = validateSubfolder(kind, subfolder);
      const root = await this.rootId();
      const kindId = await resolve(kind, SITE_FOLDERS[kind], root);
      if (!sub) return kindId;
      return resolve(`${kind}/${sub}`, sub, kindId);
    },
    /** Forget cached ids (after Drive reported the folder missing). */
    async invalidate() {
      for (const key of [...memory.keys()]) if (key.startsWith(`${scope}|`)) memory.delete(key);
      if (cacheColl) { try { await cacheColl.deleteMany({ scope }); } catch { /* ignore */ } }
    },
    async webViewLink(folderId) {
      try { return (await drive.getInfo(folderId)).webViewLink || ''; } catch { return ''; }
    },
  };
}
