import { cookies } from 'next/headers';
import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from './adminAuth';

export async function getBlocks(page) {
  try {
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    const data = await coll.find({ page }).sort({ position: 1 }).toArray();
    return (data || []).map(({ _id, ...rest }) => ({
      ...rest,
      id: rest.id || String(_id),
    }));
  } catch (error) {
    console.error('getBlocks failed', error);
    return [];
  }
}

export async function checkIsAdmin() {
  try {
    const cookieStore = await cookies();
    const cookie = cookieStore.get(ADMIN_COOKIE_NAME);
    return isValidAdminToken(cookie && cookie.value);
  } catch {
    return false;
  }
}
