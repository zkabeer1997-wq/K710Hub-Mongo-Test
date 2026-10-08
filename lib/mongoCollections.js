/**
 * Canonical collection names and indexes for the K710 Hub MongoDB test stack.
 * These keep the original table names from the retired Supabase schema (archived in docs/archive/supabase/).
 *
 * Naming convention: keep the original table name so data-import scripts
 * and mental mapping stay simple.
 */

export const COLLECTIONS = {
  // Core roster + auth
  ROUTE_ALIASES: 'route_aliases',       // SuperAdmin page address overrides
  SUBMISSIONS: 'submissions',           // member roster + pin_hash
  POWER_PROFILES: 'power_profiles',
  MEMBER_TOOL_STATE: 'member_tool_state',

  // Content
  CONTENT_BLOCKS: 'content_blocks',
  KINGDOM_GUIDES: 'kingdom_guides',
  GUIDE_CONTENT: 'guide_content',       // from guide_content_v2 / guide_editor

  // Alliances & events
  ALLIANCES: 'alliances',
  ALLIANCE_EVENTS: 'alliance_events',
  ALLIANCE_BEAR_TIMES: 'alliance_bear_times',
  EVENTS: 'events',
  EVENT_RECURRENCE: 'event_recurrence',

  // Forms & gates
  FORM_GATES: 'form_gates',
  FORM_FIELD_META: 'form_field_meta',
  FLAMEDRAGON_FORMS: 'flamedragon_forms',
  WEBSITE_REQUESTS: 'website_requests',
  INTEREST_SUBMISSIONS: 'interest_submissions',
  TRANSFER_INTAKE_PERIODS: 'transfer_intake_periods',

  // Other
  GALLERY_IMAGES: 'gallery_images',
  // Metadata for every image stored in Google Drive (lib/siteImages.mjs) and the cached Drive folder ids.
  SITE_IMAGES: 'site_images',
  HELP_SECTION_IMAGES: 'help_section_images',
  DRIVE_FOLDERS: 'drive_folders',
  // Admin-set image per tool tile: {tool_key (unique), site_image_id, alt, updated_at, updated_by}. Absent = built-in icon.
  TOOL_IMAGES: 'tool_images',
  INTEGRATION_TOKENS: 'integration_tokens',
  GIFT_CODES: 'gift_codes',
  // Admin-edited public page text (lib/pageText.mjs): one doc per page {page (unique), values, updated_at, updated_by}.
  PAGE_TEXT: 'page_text',
  // Heroes offered on the KvK + Flamedragon forms (lib/heroCatalog.mjs); seeded lazily from code defaults.
  HERO_CATALOG: 'hero_catalog',
  // Last-good snapshots of third-party data (lib/external/**): {_id: key, key, fetched_at, source_url, payload, hash, last_attempt_at}; _id is the key so no index is needed.
  EXTERNAL_SNAPSHOTS: 'external_snapshots',
  ADMIN_RALLIES: 'admin_rallies',
  FLAMEDRAGON_ADMIN_RALLIES: 'flamedragon_admin_rallies',
  PREP_BACKPACK: 'prep_backpack',
  KVK_MEMBER_AVAILABILITY: 'kvk_member_availability',
  ADMIN_WORKFLOWS: 'admin_workflows',
  EVENT_CYCLES: 'event_cycles',
  // Frozen copies of roster rows per cycle so history survives members resubmitting.
  EVENT_CYCLE_SNAPSHOTS: 'event_cycle_snapshots',
  NOBLE_ADVISOR: 'noble_advisor_submissions',
  // Per-event participation votes (Swordland Summit / Tri-Alliance Clash; legacy Castle Battle rows are ignored).
  EVENT_PARTICIPATION: 'event_participation',
  // KvK minister/advisor appointments (lib/kvkAppointments.mjs): member applications,
  // admin slot assignments, and a per-cycle published flag.
  KVK_APPOINTMENT_APPLICATIONS: 'kvk_appointment_applications',
  KVK_APPOINTMENT_ASSIGNMENTS: 'kvk_appointment_assignments',
  KVK_APPOINTMENT_CYCLES: 'kvk_appointment_cycles',

  // Kingshot member auth (lib/memberAuthKingshot.js, lib/kingshotAccountBootstrap.js)
  KINGSHOT_USERS: 'kingshot_users',
  KINGSHOT_SESSIONS: 'kingshot_sessions',
  KINGSHOT_PERSONAL_CODES: 'kingshot_personal_codes',
  KINGSHOT_LOGIN_EVENTS: 'kingshot_login_events',
};

/** Indexes that earlier versions created and that must be removed (they forbid per-cycle rows). */
export const OBSOLETE_INDEXES = {
  prep_backpack: ['member_id_unique'],
  noble_advisor_submissions: ['member_id_unique'],
};

/**
 * Index definitions. Keys match collection names (string values of COLLECTIONS).
 * Options follow the MongoDB createIndex signature.
 */
export const INDEXES = {
  submissions: [
    { keys: { member_id: 1 }, options: { unique: true, name: 'member_id_unique' } },
    { keys: { current_alliance: 1 }, options: { name: 'current_alliance_idx' } },
    { keys: { updated_at: -1 }, options: { name: 'updated_at_desc' } },
  ],
  power_profiles: [
    { keys: { member_id: 1 }, options: { unique: true, name: 'member_id_unique' } },
  ],
  member_tool_state: [
    // One row per (member, tool) - not one row per member. A member can have
    // many saved tool plans (verified live: several members have 2-4 rows).
    { keys: { member_id: 1, tool_key: 1 }, options: { unique: true, name: 'member_tool_unique' } },
  ],
  content_blocks: [
    { keys: { page: 1, position: 1 }, options: { name: 'page_position_idx' } },
    { keys: { page: 1, 'content.key': 1 }, options: { unique: true, partialFilterExpression: { 'content.key': { $type: 'string' } }, name: 'page_content_key_uniq' } },
  ],
  alliances: [
    { keys: { tag: 1 }, options: { unique: true, name: 'tag_unique' } },
    { keys: { sort_order: 1 }, options: { name: 'sort_order_idx' } },
  ],
  events: [
    { keys: { slug: 1 }, options: { unique: true, sparse: true, name: 'slug_unique' } },
    { keys: { starts_at: 1 }, options: { name: 'starts_at_idx' } },
  ],
  page_text: [
    { keys: { page: 1 }, options: { unique: true, name: 'page_unique' } },
  ],
  form_gates: [
    { keys: { form_key: 1 }, options: { unique: true, name: 'form_key_unique' } },
  ],
  form_field_meta: [
    { keys: { form_key: 1 }, options: { unique: true, name: 'form_key_unique' } },
  ],
  flamedragon_forms: [
    { keys: { member_id: 1 }, options: { name: 'member_id_idx' } },
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
  ],
  website_requests: [
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
  ],
  tool_images: [
    { keys: { tool_key: 1 }, options: { unique: true, name: 'tool_key_unique' } },
  ],
  help_section_images: [
    { keys: { section_id: 1 }, options: { unique: true, name: 'section_id_unique' } },
  ],
  gallery_images: [
    { keys: { position: 1 }, options: { name: 'position_idx' } },
    { keys: { id: 1 }, options: { name: 'id_idx' } },
    { keys: { is_published: 1, position: 1, created_at: -1 }, options: { name: 'published_position_idx' } },
  ],
  kingdom_guides: [
    { keys: { slug: 1 }, options: { name: 'slug_idx' } },
  ],
  guide_content: [
    { keys: { slug: 1 }, options: { name: 'slug_idx' } },
  ],
  guide_attachments: [
    { keys: { path: 1 }, options: { name: 'path_idx' } },
  ],
  interest_submissions: [
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
    { keys: { status: 1, created_at: -1 }, options: { name: 'status_created_idx' } },
    { keys: { player_id: 1 }, options: { name: 'player_id_idx' } },
    { keys: { id: 1 }, options: { unique: true, sparse: true, name: 'id_unique' } },
    { keys: { intake_period_id: 1, created_at: -1 }, options: { name: 'intake_period_created_idx' } },
  ],

  transfer_intake_periods: [
    { keys: { is_active: 1 }, options: { name: 'is_active_idx' } },
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
  ],

  hero_catalog: [
    { keys: { key: 1 }, options: { unique: true, name: 'key_unique' } },
  ],
  gift_codes: [
    { keys: { code: 1 }, options: { unique: true, name: 'code_unique' } },
  ],
  kvk_member_availability: [
    { keys: { member_id: 1 }, options: { name: 'member_id_idx' } },
  ],
  // One row per (member, form, cycle): the saved vote is an upsert, never a duplicate.
  event_participation: [
    { keys: { member_id: 1, form_id: 1, cycle_id: 1 }, options: { unique: true, name: 'member_form_cycle_unique' } },
    { keys: { form_id: 1, cycle_id: 1, updated_at: -1 }, options: { name: 'form_cycle_updated_idx' } },
  ],
  // Per-cycle forms: one row per (member, cycle). The partial filter keeps legacy untagged
  // rows (see backfillCycleTags) from ever colliding. The old one-row-per-member unique
  // index is listed in OBSOLETE_INDEXES and dropped by ensureIndexes().
  prep_backpack: [
    { keys: { member_id: 1, event_cycle_id: 1 }, options: { unique: true, name: 'member_cycle_unique', partialFilterExpression: { event_cycle_id: { $type: 'string' } } } },
    { keys: { event_cycle_id: 1 }, options: { name: 'event_cycle_idx' } },
  ],
  noble_advisor_submissions: [
    { keys: { member_id: 1, event_cycle_id: 1 }, options: { unique: true, name: 'member_cycle_unique', partialFilterExpression: { event_cycle_id: { $type: 'string' } } } },
    { keys: { event_cycle_id: 1 }, options: { name: 'event_cycle_idx' } },
  ],
  // One application per (member, day, buff, cycle): saving again overwrites it.
  kvk_appointment_applications: [
    { keys: { member_id: 1, day: 1, buff: 1, cycle_id: 1 }, options: { unique: true, name: 'member_day_buff_cycle_unique' } },
    { keys: { cycle_id: 1, day: 1, buff: 1 }, options: { name: 'cycle_day_buff_idx' } },
  ],
  // A slot is never double-booked and a member holds at most one slot per day/buff/cycle.
  kvk_appointment_assignments: [
    { keys: { cycle_id: 1, day: 1, buff: 1, slot: 1 }, options: { unique: true, name: 'cycle_day_buff_slot_unique' } },
    { keys: { cycle_id: 1, day: 1, buff: 1, member_id: 1 }, options: { unique: true, name: 'cycle_day_buff_member_unique' } },
    { keys: { member_id: 1, cycle_id: 1 }, options: { name: 'member_cycle_idx' } },
  ],
  kvk_appointment_cycles: [
    { keys: { cycle_id: 1 }, options: { unique: true, name: 'cycle_id_unique' } },
  ],
  event_cycle_snapshots: [
    { keys: { event_type: 1, event_cycle_id: 1, member_id: 1 }, options: { unique: true, name: 'type_cycle_member_unique' } },
    { keys: { event_type: 1, event_cycle_id: 1 }, options: { name: 'type_cycle_idx' } },
    { keys: { member_id: 1 }, options: { name: 'member_id_idx' } },
  ],
  event_cycles: [
    { keys: { type: 1, is_current: 1 }, options: { name: 'type_current_idx' } },
    { keys: { type: 1, archived: 1, created_at: -1 }, options: { name: 'type_archived_created_idx' } },
    { keys: { seed_key: 1 }, options: { name: 'seed_key_unique', unique: true, sparse: true } },
  ],

  // Shared rate limiter windows (lib/rateLimit.mjs); expired windows are reaped by TTL.
  rate_limits: [
    { keys: { expires_at: 1 }, options: { name: 'expires_at_ttl', expireAfterSeconds: 0 } },
  ],

  route_aliases: [
    { keys: { from: 1 }, options: { unique: true, name: 'from_unique' } },
    { keys: { to: 1 }, options: { unique: true, name: 'to_unique' } },
  ],

  kingshot_users: [
    { keys: { player_id: 1 }, options: { unique: true, name: 'player_id_unique' } },
    { keys: { access_role: 1 }, options: { name: 'access_role_idx' } },
  ],
  kingshot_sessions: [
    { keys: { token_hash: 1 }, options: { name: 'token_hash_idx' } },
    { keys: { player_id: 1 }, options: { name: 'player_id_idx' } },
    { keys: { token_hash: 1, revoked_at: 1 }, options: { name: 'token_revoked_idx' } },
    { keys: { expires_at: 1 }, options: { name: 'expires_at_ttl', expireAfterSeconds: 0 } },
  ],
  kingshot_personal_codes: [
    { keys: { player_id: 1 }, options: { unique: true, name: 'player_id_unique' } },
  ],
  kingshot_login_events: [
    { keys: { occurred_at: -1 }, options: { name: 'occurred_at_desc' } },
    { keys: { event_type: 1, player_id_fingerprint: 1, occurred_at: -1 }, options: { name: 'event_player_time_idx' } },
    { keys: { event_type: 1, source_fingerprint: 1, occurred_at: -1 }, options: { name: 'event_source_time_idx' } },
    // Login audit rows only matter for the 1h throttle windows; keep 30 days.
    { keys: { occurred_at: 1 }, options: { name: 'occurred_at_ttl', expireAfterSeconds: 30 * 24 * 60 * 60 } },
  ],
};
