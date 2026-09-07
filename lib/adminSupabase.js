/**
 * DEPRECATED — MongoDB test stack does not use Supabase.
 * Any remaining import of this module indicates a route that still needs conversion.
 */
export function createAdminSupabaseClient() {
  throw new Error(
    'Supabase is disabled on the MongoDB test stack. Convert this route to lib/mongo.js.'
  );
}
