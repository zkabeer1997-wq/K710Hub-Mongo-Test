import { createClient } from '@supabase/supabase-js';

// DEPRECATED during MongoDB migration.
// Routes that still call this will throw until they are converted.
// Prefer lib/mongo.js + lib/mongoCollections.js.

let cachedClient = null;

export function createAdminSupabaseClient() {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'This route still expects Supabase. It has not been migrated to MongoDB yet. ' +
        'Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY temporarily, or wait for the Mongo conversion of this route.'
    );
  }
  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cachedClient;
}
