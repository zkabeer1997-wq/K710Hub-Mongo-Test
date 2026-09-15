/**
 * Canonical collection names and indexes for the K710 Hub MongoDB test stack.
 * These map 1-to-1 with the Supabase tables that exist in production.
 *
 * Naming convention: keep the original table name so data-import scripts
 * and mental mapping stay simple.
 */

export const COLLECTIONS = {
  // Core roster + auth
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
  GIFT_CODES: 'gift_codes',
  ADMIN_RALLIES: 'admin_rallies',
  FLAMEDRAGON_ADMIN_RALLIES: 'flamedragon_admin_rallies',
  PREP_BACKPACK: 'prep_backpack',
  KVK_MEMBER_AVAILABILITY: 'kvk_member_availability',
  ADMIN_WORKFLOWS: 'admin_workflows',
  EVENT_CYCLES: 'event_cycles',

  // Kingshot member auth (lib/memberAuthKingshot.js, lib/kingshotAccountBootstrap.js)
  KINGSHOT_USERS: 'kingshot_users',
  KINGSHOT_SESSIONS: 'kingshot_sessions',
  KINGSHOT_PERSONAL_CODES: 'kingshot_personal_codes',
  KINGSHOT_LOGIN_EVENTS: 'kingshot_login_events',
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
  gallery_images: [
    { keys: { position: 1 }, options: { name: 'position_idx' } },
  ],
  interest_submissions: [
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
    { keys: { status: 1, created_at: -1 }, options: { name: 'status_created_idx' } },
    { keys: { player_id: 1 }, options: { name: 'player_id_idx' } },
    { keys: { id: 1 }, options: { unique: true, sparse: true, name: 'id_unique' } },
  ],

  transfer_intake_periods: [
    { keys: { is_active: 1 }, options: { name: 'is_active_idx' } },
    { keys: { created_at: -1 }, options: { name: 'created_at_desc' } },
  ],

  gift_codes: [
    { keys: { code: 1 }, options: { unique: true, name: 'code_unique' } },
  ],
  kvk_member_availability: [
    { keys: { member_id: 1 }, options: { name: 'member_id_idx' } },
  ],
  event_cycles: [
    { keys: { type: 1, is_current: 1 }, options: { name: 'type_current_idx' } },
    { keys: { type: 1, archived: 1, created_at: -1 }, options: { name: 'type_archived_created_idx' } },
  ],

  kingshot_users: [
    { keys: { player_id: 1 }, options: { unique: true, name: 'player_id_unique' } },
  ],
  kingshot_sessions: [
    { keys: { token_hash: 1 }, options: { name: 'token_hash_idx' } },
    { keys: { expires_at: 1 }, options: { name: 'expires_at_ttl', expireAfterSeconds: 0 } },
  ],
  kingshot_personal_codes: [
    { keys: { player_id: 1 }, options: { unique: true, name: 'player_id_unique' } },
  ],
  kingshot_login_events: [
    { keys: { occurred_at: -1 }, options: { name: 'occurred_at_desc' } },
  ],
};
