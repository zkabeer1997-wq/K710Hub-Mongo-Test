import { z } from 'zod';
import { GEAR_SLOTS, CHARM_SLOTS } from './kinds/governorProfile/gameData.mjs';
import { TROOPS } from './kinds/heroGear/gameData.mjs';

/** Registry of scan kinds. Extend this list (and lib/scan/kinds/index.mjs) to add one. */
export const SCAN_KINDS = ['governor_profile', 'hero_gear'];
export const ScanKind = z.enum(SCAN_KINDS);

/** Tolerance for profile rects that poke slightly outside 0-1. */
export const RECT_TOLERANCE = 0.005;

export const Rect = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  w: z.number().finite().positive(),
  h: z.number().finite().positive(),
});

export const READERS = ['quality', 'stars', 'number', 'label', 'shape', 'icon'];

export const RegionSpec = z.strictObject({
  id: z.string().min(1).max(64),
  rect: Rect,
  reader: z.enum(READERS),
  options: z.record(z.string(), z.unknown()).default({}),
});

export const AnchorSpec = z.strictObject({
  type: z.enum(['template', 'text', 'rect']),
  expected: Rect,
  hint: z.string().max(200).optional(),
});

function withinUnit(r) {
  return r.x >= -RECT_TOLERANCE && r.y >= -RECT_TOLERANCE
    && r.x + r.w <= 1 + RECT_TOLERANCE && r.y + r.h <= 1 + RECT_TOLERANCE;
}

function buildLayoutProfile(kind) {
  return z.strictObject({
    kind: kind ? z.literal(kind) : ScanKind,
    version: z.number().int().min(1),
    anchor: AnchorSpec,
    regions: z.record(z.string(), RegionSpec),
  }).superRefine((p, ctx) => {
    if (!withinUnit(p.anchor.expected)) ctx.addIssue({ code: 'custom', path: ['anchor', 'expected'], message: 'anchor rect must lie within 0-1' });
    const seen = new Set();
    for (const [key, region] of Object.entries(p.regions)) {
      if (region.id !== key) ctx.addIssue({ code: 'custom', path: ['regions', key, 'id'], message: `region id must equal its key "${key}"` });
      if (seen.has(region.id)) ctx.addIssue({ code: 'custom', path: ['regions', key, 'id'], message: `duplicate region id "${region.id}"` });
      seen.add(region.id);
      if (!withinUnit(region.rect)) ctx.addIssue({ code: 'custom', path: ['regions', key, 'rect'], message: 'region rect must lie within 0-1' });
    }
  });
}

export const LayoutProfile = buildLayoutProfile(null);
/** Profile schema restricted to one kind. */
export const layoutProfileFor = buildLayoutProfile;

/** FieldReading factory: { value, confidence 0-1, alternatives?, flags[] } */
export function fieldReading(valueSchema) {
  return z.strictObject({
    value: valueSchema.nullable(),
    confidence: z.number().min(0).max(1),
    alternatives: z.array(z.strictObject({ value: valueSchema, confidence: z.number().min(0).max(1) })).max(10).optional(),
    flags: z.array(z.string().max(64)).max(20).default([]),
  });
}
export const FieldReading = fieldReading(z.union([z.string(), z.number()]));

const GearSlotKey = z.enum(GEAR_SLOTS);
const CharmSlotKey = z.enum(CHARM_SLOTS);

export const GovernorGearSlotReading = z.strictObject({
  slot: GearSlotKey,
  quality: fieldReading(z.string()),
  tier: fieldReading(z.number().int()),
  stars: fieldReading(z.number().int()),
});

export const CharmReading = z.strictObject({
  slot: CharmSlotKey,
  level: fieldReading(z.number().int()),
});

export const HeroGearPieceReading = z.strictObject({
  index: z.number().int().min(0).max(999).optional(),
  troop: fieldReading(z.enum(TROOPS)),
  rarity: fieldReading(z.string()),
  level: fieldReading(z.number().int()),
  forgery: fieldReading(z.number().int()),
});

export const ScanResult = z.strictObject({
  kind: ScanKind,
  status: z.enum(['ok', 'not_implemented', 'invalid_profile', 'invalid_image', 'failed']),
  engine_version: z.string().max(40),
  profile_version: z.number().int().optional(),
  reasons: z.array(z.string().max(300)).max(50).default([]),
  gear: z.array(GovernorGearSlotReading).max(6).optional(),
  charms: z.array(CharmReading).max(18).optional(),
  heroGear: z.array(HeroGearPieceReading).max(200).optional(),
});

export const ScanCorrection = z.strictObject({
  slot: z.string().min(1).max(64),
  field: z.string().min(1).max(32),
  read_value: z.union([z.string().max(100), z.number(), z.null()]),
  read_confidence: z.number().min(0).max(1),
  corrected_value: z.union([z.string().max(100), z.number(), z.null()]),
});

const GearValue = z.strictObject({
  quality: z.string().min(1).max(20),
  tier: z.number().int().min(0).max(10),
  stars: z.number().int().min(0).max(3),
});

export const LoadoutPayload = z.strictObject({
  kind: ScanKind,
  slots: z.strictObject(Object.fromEntries(GEAR_SLOTS.map((s) => [s, GearValue.optional()]))).optional(),
  charms: z.array(z.strictObject({ slot: CharmSlotKey, level: z.number().int().min(1).max(22) })).max(18).optional(),
  heroGear: z.array(z.strictObject({
    troop: z.enum(TROOPS),
    level: z.number().int().min(1).max(200),
    forgery: z.number().int().min(0).max(20),
  })).max(200).optional(),
  source: z.enum(['scan', 'manual']),
  engine_version: z.string().min(1).max(40),
  profile_version: z.number().int().min(0),
  corrections: z.array(ScanCorrection).max(500).default([]),
}).superRefine((p, ctx) => {
  if (p.kind === 'governor_profile' && p.heroGear) ctx.addIssue({ code: 'custom', path: ['heroGear'], message: 'heroGear belongs to hero_gear' });
  if (p.kind === 'hero_gear' && (p.slots || p.charms)) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'slots/charms belong to governor_profile' });
  if (p.charms) {
    const slots = p.charms.map((c) => c.slot);
    if (new Set(slots).size !== slots.length) ctx.addIssue({ code: 'custom', path: ['charms'], message: 'duplicate charm slot' });
  }
});

const LabelGear = z.strictObject({ quality: z.string(), tier: z.number().int(), stars: z.number().int() });

/** One labelled image inside tests/fixtures/scan/<kind>/labels.json */
export const FixtureImageLabels = z.strictObject({
  device: z.string().max(100).optional(),
  gear: z.strictObject(Object.fromEntries(GEAR_SLOTS.map((s) => [s, LabelGear.optional()]))).optional(),
  charms: z.partialRecord(CharmSlotKey, z.number().int()).optional(),
  heroGear: z.array(z.strictObject({
    troop: z.enum(TROOPS),
    level: z.number().int(),
    forgery: z.number().int(),
  })).optional(),
});

/** labels.json: { version: 1, kind, images: { "file.png": { ... } } } */
export const FixtureLabels = z.strictObject({
  version: z.literal(1),
  kind: ScanKind,
  images: z.record(z.string().min(1), FixtureImageLabels),
});

/**
 * @typedef {z.infer<typeof Rect>} Rect
 * @typedef {z.infer<typeof RegionSpec>} RegionSpec
 * @typedef {z.infer<typeof AnchorSpec>} AnchorSpec
 * @typedef {z.infer<typeof LayoutProfile>} LayoutProfile
 * @typedef {z.infer<typeof FieldReading>} FieldReading
 * @typedef {z.infer<typeof GovernorGearSlotReading>} GovernorGearSlotReading
 * @typedef {z.infer<typeof CharmReading>} CharmReading
 * @typedef {z.infer<typeof HeroGearPieceReading>} HeroGearPieceReading
 * @typedef {z.infer<typeof ScanResult>} ScanResult
 * @typedef {z.infer<typeof LoadoutPayload>} LoadoutPayload
 * @typedef {z.infer<typeof ScanCorrection>} ScanCorrection
 * @typedef {z.infer<typeof FixtureLabels>} FixtureLabels
 */
