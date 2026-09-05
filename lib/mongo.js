import { MongoClient } from 'mongodb';

/**
 * Shared MongoDB client for the K710 Hub MongoDB test stack.
 * Cached as a module-level singleton per warm serverless instance
 * (same pattern as the old Supabase admin client).
 */

const DEFAULT_DB_NAME = 'k710hub';

let cachedClient = null;
let cachedDb = null;

function getUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not configured.');
  }
  return uri;
}

function getDbName() {
  return process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME;
}

/**
 * Returns a connected MongoClient (singleton).
 * Safe to call repeatedly inside API routes / server components.
 */
export async function getMongoClient() {
  if (cachedClient) return cachedClient;

  const client = new MongoClient(getUri(), {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 8_000,
  });

  await client.connect();
  cachedClient = client;
  return client;
}

/**
 * Returns the application database (singleton).
 */
export async function getDb() {
  if (cachedDb) return cachedDb;
  const client = await getMongoClient();
  cachedDb = client.db(getDbName());
  return cachedDb;
}

/**
 * Convenience helper — returns a collection by name.
 * @param {string} name
 */
export async function getCollection(name) {
  const db = await getDb();
  return db.collection(name);
}

/**
 * Ensure indexes exist. Call once at startup or from a one-off script.
 * Idempotent.
 */
export async function ensureIndexes() {
  const { INDEXES } = await import('./mongoCollections.js');
  const db = await getDb();

  for (const [collName, indexSpecs] of Object.entries(INDEXES)) {
    const coll = db.collection(collName);
    for (const spec of indexSpecs) {
      await coll.createIndex(spec.keys, spec.options || {});
    }
  }
}
