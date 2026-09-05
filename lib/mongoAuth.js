import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';

/**
 * MongoDB equivalent of the Supabase verify_page_pin RPC.
 *
 * Behaviour:
 * - Trims whitespace on both sides of member_id (legacy tolerance)
 * - Only accepts bcrypt hashes that match the $2[aby]$xx$ pattern
 * - Returns a plain boolean, never leaks the hash
 * - Fails closed on any error or missing row
 */

const BCRYPT_RE = /^\$2[aby]\$[0-9]{2}\$/;

/**
 * Compare a plain PIN against a bcrypt hash using the Web Crypto subtle API
 * is not possible for bcrypt. We use the `bcryptjs` pure-JS implementation
 * so it works on both Node and Edge runtimes without native bindings.
 *
 * NOTE: bcryptjs will be added to package.json in the next commit if not present.
 * For now we dynamically import it so the rest of the module can still load.
 */
async function bcryptCompare(plain, hash) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.compare(String(plain || ''), String(hash || ''));
}

export async function verifyMemberPin(memberId, pin) {
  const cleanId = String(memberId || '').trim();
  const cleanPin = String(pin || '');
  if (!cleanId || !cleanPin) return false;

  try {
    const coll = await getCollection(COLLECTIONS.SUBMISSIONS);
    const row = await coll.findOne(
      { member_id: cleanId },
      { projection: { pin_hash: 1 } }
    );

    // Also try a whitespace-tolerant lookup if exact match fails
    // (mirrors the btrim behaviour of the original SQL function)
    let candidate = row;
    if (!candidate) {
      candidate = await coll.findOne(
        { member_id: { $regex: `^\\s*${escapeRegex(cleanId)}\\s*$` } },
        { projection: { pin_hash: 1 } }
      );
    }

    if (!candidate || !candidate.pin_hash) return false;
    if (!BCRYPT_RE.test(candidate.pin_hash)) return false;

    return await bcryptCompare(cleanPin, candidate.pin_hash);
  } catch (err) {
    console.error('[mongoAuth] verifyMemberPin error:', err?.message || err);
    return false;
  }
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hash a plain PIN for storage (used by admin member-create / PIN reset).
 * Cost factor 10 matches typical Supabase extensions.crypt defaults.
 */
export async function hashMemberPin(pin) {
  const bcrypt = await import('bcryptjs');
  return bcrypt.hash(String(pin || ''), 10);
}
