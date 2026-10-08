import 'server-only';
import { MongoClient } from 'mongodb';

/**
 * Shared MongoDB client for the K710 Hub MongoDB test stack.
 * Marked server-only so Turbopack never bundles it into client components.
 */

const DEFAULT_DB_NAME = 'k710hub';

// In development, hot module reloading re-evaluates this module on every edit and
// would open a fresh connection pool each time. Keep the client on globalThis so
// it survives reloads. In production the module scope is already stable.
const globalCache = globalThis.__k710Mongo || (globalThis.__k710Mongo = { client: null, db: null, promise: null });

let cachedClient = globalCache.client;
let cachedDb = globalCache.db;

function getUri() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured.');
  }
  return uri;
}

function getDbName() {
  return process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;
}

export async function getMongoClient() {
  if (cachedClient) return cachedClient;
  // Share one in-flight connect between concurrent first requests.
  if (!globalCache.promise) {
    const client = new MongoClient(getUri(), {
      maxPoolSize: 10,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8_000,
    });
    globalCache.promise = client.connect().then(
      () => {
        cachedClient = globalCache.client = client;
        return client;
      },
      (error) => {
        globalCache.promise = null;
        throw error;
      }
    );
  }
  return globalCache.promise;
}

export async function getDb() {
  if (cachedDb) return cachedDb;
  const client = await getMongoClient();
  cachedDb = globalCache.db = client.db(getDbName());
  return cachedDb;
}

export async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

export async function ensureIndexes() {
  const { INDEXES, OBSOLETE_INDEXES } = await import('./mongoCollections.js');
  const db = await getDb();
  const failures = [];

  for (const [collName, names] of Object.entries(OBSOLETE_INDEXES || {})) {
    for (const name of names) {
      try {
        await db.collection(collName).dropIndex(name);
      } catch {
        // Already gone (or the collection does not exist yet): nothing to drop.
      }
    }
  }

  // Collections whose historic duplicates would block a unique index get cleaned first (idempotent, keeps the best row).
  const { dedupeHeroCollection } = await import('./heroCatalog.mjs');
  const DEDUPE_FIRST = { hero_catalog: (c) => dedupeHeroCollection(c, { apply: true }) };

  for (const [collName, indexSpecs] of Object.entries(INDEXES)) {
    const coll = db.collection(collName);
    if (DEDUPE_FIRST[collName]) {
      try { await DEDUPE_FIRST[collName](coll); } catch (error) {
        failures.push({ collection: collName, name: 'dedupe', message: error?.message || String(error) });
      }
    }
    for (const spec of indexSpecs) {
      try {
        await coll.createIndex(spec.keys, spec.options || {});
      } catch (error) {
        if (DEDUPE_FIRST[collName] && error?.code === 11000) {
          // Rows were written between the cleanup and the index build (a racing seed): clean once more and retry.
          try { await DEDUPE_FIRST[collName](coll); await coll.createIndex(spec.keys, spec.options || {}); continue; } catch (retryError) { error = retryError; }
        }
        // A unique index fails when historic duplicates exist (E11000). Keep going
        // so the remaining indexes are still applied, and let the caller report it.
        failures.push({ collection: collName, name: spec.options?.name, message: error?.message || String(error) });
      }
    }
  }
  return failures;
}
