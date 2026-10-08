import { decryptSecret, deriveTokenKey, encryptSecret } from './driveCrypto.mjs';

export const DRIVE_TOKEN_DOC_ID = 'google_drive_gallery';

/** Token store over an `integration_tokens` Mongo collection (passed in, so this file stays testable). */
export function createMongoTokenStore(coll, { key = deriveTokenKey() } = {}) {
  return {
    async load() {
      const doc = await coll.findOne({ _id: DRIVE_TOKEN_DOC_ID });
      if (!doc?.refresh_token_enc) return null;
      try {
        return { refreshToken: decryptSecret(doc.refresh_token_enc, key), email: doc.email || '', folderId: doc.folder_id || '', folderName: doc.folder_name || '' };
      } catch { return null; }
    },
    async save({ refreshToken, email }) {
      await coll.updateOne(
        { _id: DRIVE_TOKEN_DOC_ID },
        { $set: { refresh_token_enc: encryptSecret(refreshToken, key), email: email || '', folder_id: '', folder_name: '', updated_at: new Date() }, $setOnInsert: { created_at: new Date() } },
        { upsert: true }
      );
    },
    async patch({ folderId, folderName }) {
      await coll.updateOne({ _id: DRIVE_TOKEN_DOC_ID }, { $set: { folder_id: folderId ?? '', folder_name: folderName ?? '', updated_at: new Date() } });
    },
    async clear() { await coll.deleteOne({ _id: DRIVE_TOKEN_DOC_ID }); },
  };
}
