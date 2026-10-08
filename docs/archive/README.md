# Archive

Archived reference material. Nothing here is used by the running application.

- `supabase/` holds the historical Supabase (Postgres) schema and migration SQL from the previous production stack. The app now runs on MongoDB (see `lib/mongoCollections.js`). Keep it only as a reference when mapping old tables to collections or importing legacy data; do not apply it to any database.
