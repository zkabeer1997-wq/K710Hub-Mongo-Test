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
  const { INDEXES } = await import('./mongoCollections.js');
  const db = await getDb();
  const failures = [];

  for (const [collName, indexSpecs] of Object.entries(INDEXES)) {
    const coll = db.collection(collName);
    for (const spec of indexSpecs) {
      try {
        await coll.createIndex(spec.keys, spec.options || {});
      } catch (error) {
        // A unique index fails when historic duplicates exist (E11000). Keep going
        // so the remaining indexes are still applied, and let the caller report it.
        failures.push({ collection: collName, name: spec.options?.name, message: error?.message || String(error) });
      }
    }
  }
  return failures;
}
