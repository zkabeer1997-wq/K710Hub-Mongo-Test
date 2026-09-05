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
  FLAMEDRAGON_FORMS: 'flamedragon_forms',
  WEBSITE_REQUESTS: 'website_requests',

  // Other
  GALLERY_IMAGES: 'gallery_images',
  GIFT_CODES: 'gift_codes',
  ADMIN_RALLIES: 'admin_rallies',
  FLAMEDRAGON_ADMIN_RALLIES: 'flamedragon_admin_rallies',
  PREP_BACKPACK: 'prep_backpack',
  KVK_MEMBER_AVAILABILITY: 'kvk_member_availability',
  ADMIN_WORKFLOWS: 'admin_workflows',
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
    { keys: { member_id: 1 }, options: { unique: true, name: 'member_id_unique' } },
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
    { keys: { key: 1 }, options: { unique: true, name: 'key_unique' } },
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
  gift_codes: [
    { keys: { code: 1 }, options: { unique: true, name: 'code_unique' } },
  ],
  kvk_member_availability: [
    { keys: { member_id: 1 }, options: { name: 'member_id_idx' } },
  ],
};
