// Minimal in-memory stand-in for the subset of the MongoDB driver API this
// codebase actually uses (find/findOne/insertOne/insertMany/updateOne/
// findOneAndUpdate/deleteOne/deleteMany/countDocuments), backed by a plain
// { [collectionName]: Array<doc> } table map a test already owns. Lets tests
// exercise real route handlers (which import lib/mongo's getCollection)
// without a live database.
import { ObjectId } from 'mongodb';

function equalsLoose(a, b) {
  if (a instanceof ObjectId || b instanceof ObjectId) return String(a) === String(b);
  return a === b;
}

function matches(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) return true;
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matches(doc, sub));
    if (key === '$and') return cond.every((sub) => matches(doc, sub));
    const value = doc[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof ObjectId)) {
      if ('$exists' in cond) return cond.$exists ? value !== undefined : value === undefined;
      if ('$ne' in cond) return !equalsLoose(value, cond.$ne);
      if ('$in' in cond) return (cond.$in || []).some((v) => equalsLoose(value, v));
      if ('$type' in cond) return typeof value === (cond.$type === 'string' ? 'string' : typeof value);
    }
    return equalsLoose(value, cond);
  });
}

function project(doc, projection) {
  const clone = { ...doc };
  if (!projection) return clone;
  const keys = Object.keys(projection);
  const include = keys.some((k) => projection[k] === 1 || projection[k] === true);
  if (include) {
    const out = {};
    for (const k of keys) if (projection[k]) out[k] = clone[k];
    if (projection._id !== 0 && !('_id' in projection)) out._id = clone._id;
    return out;
  }
  for (const k of keys) if (!projection[k]) delete clone[k];
  return clone;
}

function applyUpdate(doc, filter, update) {
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$setOnInsert) {
    for (const [k, v] of Object.entries(update.$setOnInsert)) if (!(k in doc)) doc[k] = v;
  }
  if (update.$unset) for (const k of Object.keys(update.$unset)) delete doc[k];
  // Mongo also seeds an upserted document from the query's simple equality
  // fields; mirror that so `{ member_id: x }` filters + upsert work.
  for (const [k, v] of Object.entries(filter || {})) {
    if (k.startsWith('$') || k in doc) continue;
    doc[k] = v;
  }
}

function duplicateKeyError() {
  const error = new Error('E11000 duplicate key error');
  error.code = 11000;
  return error;
}

function makeCollection(tables, name, uniqueFields = []) {
  const rows = () => (tables[name] ||= []);

  function assertNoConflict(candidateDoc, excludeDoc) {
    if (!uniqueFields.length) return;
    for (const field of uniqueFields) {
      if (!(field in candidateDoc)) continue;
      const conflict = rows().some(
        (d) => d !== excludeDoc && equalsLoose(d[field], candidateDoc[field])
      );
      if (conflict) throw duplicateKeyError();
    }
  }

  return {
    find(filter = {}) {
      const results = rows().filter((d) => matches(d, filter));
      let projection = null;
      let sortSpec = null;
      let limitN = null;
      const cursor = {
        project(p) {
          projection = p;
          return cursor;
        },
        sort(s) {
          sortSpec = s;
          return cursor;
        },
        limit(n) {
          limitN = n;
          return cursor;
        },
        async toArray() {
          let out = [...results];
          if (sortSpec) {
            const entries = Object.entries(sortSpec);
            out.sort((a, b) => {
              for (const [k, dir] of entries) {
                if (a[k] < b[k]) return -1 * dir;
                if (a[k] > b[k]) return 1 * dir;
              }
              return 0;
            });
          }
          if (limitN) out = out.slice(0, limitN);
          return out.map((d) => project(d, projection));
        },
      };
      return cursor;
    },
    async findOne(filter = {}, opts = {}) {
      const doc = rows().find((d) => matches(d, filter));
      return doc ? project(doc, opts.projection) : null;
    },
    async countDocuments(filter = {}) {
      return rows().filter((d) => matches(d, filter)).length;
    },
    async insertOne(doc) {
      assertNoConflict(doc, null);
      const _id = doc._id || new ObjectId();
      const record = { ...doc, _id };
      rows().push(record);
      return { acknowledged: true, insertedId: _id };
    },
    async insertMany(docs) {
      for (const doc of docs) assertNoConflict(doc, null);
      const insertedIds = {};
      docs.forEach((doc, i) => {
        const _id = doc._id || new ObjectId();
        rows().push({ ...doc, _id });
        insertedIds[i] = _id;
      });
      return { acknowledged: true, insertedIds };
    },
    async updateOne(filter, update, opts = {}) {
      const doc = rows().find((d) => matches(d, filter));
      if (!doc) {
        if (opts.upsert) {
          const created = { _id: new ObjectId() };
          applyUpdate(created, filter, update);
          assertNoConflict(created, null);
          rows().push(created);
          return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: created._id };
        }
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
      const merged = { ...doc };
      applyUpdate(merged, filter, update);
      assertNoConflict(merged, doc);
      applyUpdate(doc, filter, update);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    },
    async findOneAndUpdate(filter, update, opts = {}) {
      let doc = rows().find((d) => matches(d, filter));
      if (!doc) {
        if (!opts.upsert) return null;
        doc = { _id: new ObjectId() };
        applyUpdate(doc, filter, update);
        assertNoConflict(doc, null);
        rows().push(doc);
      } else {
        const merged = { ...doc };
        applyUpdate(merged, filter, update);
        assertNoConflict(merged, doc);
        applyUpdate(doc, filter, update);
      }
      return project(doc, opts.projection);
    },
    async deleteOne(filter) {
      const idx = rows().findIndex((d) => matches(d, filter));
      if (idx === -1) return { acknowledged: true, deletedCount: 0 };
      rows().splice(idx, 1);
      return { acknowledged: true, deletedCount: 1 };
    },
    async deleteMany(filter) {
      const before = rows().length;
      tables[name] = rows().filter((d) => !matches(d, filter));
      return { acknowledged: true, deletedCount: before - tables[name].length };
    },
  };
}

/**
 * @param {Record<string, any[]>} tables plain object this test already uses as its fixture store
 * @param {Record<string, string[]>} [uniqueIndexes] collection name -> field names that must be
 *   unique across documents, so writes that would collide throw a real-shaped {code: 11000} error
 */
export function createFakeMongo(tables, uniqueIndexes = {}) {
  return {
    async getCollection(name) {
      return makeCollection(tables, name, uniqueIndexes[name] || []);
    },
    async ensureIndexes() {
      // no-op: index creation is meaningless against the in-memory fake
    },
  };
}
