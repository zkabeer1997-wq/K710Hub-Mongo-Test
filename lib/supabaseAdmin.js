/**
 * DEPRECATED — MongoDB test stack does not use Supabase.
 */
export function createSupabaseAdminClient() {
  throw new Error(
    'Supabase is disabled on the MongoDB test stack. Convert this route to lib/mongo.js.'
  );
}
