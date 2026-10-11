// Admin-added real-money packs (Admin > Packs/Tools > Pack editing). Pure helpers: validation and
// the mapping from a stored pack to the exact pack shape the member shop tools already consume.
// Only the two shop tools can take extra packs without redesign (their optimizers iterate a
// keyed pack list); the charm and pet pack tools have fixed pack tables and are not supported.
import { PACKS as ADVENTURE_PACKS } from './adventureStall.mjs';
import { PACKS as DRAGON_PACKS } from './flamedragonShop.mjs';

export const MAX_CUSTOM_PACKS_PER_TOOL = 12;
export const CUSTOM_PACK_NAME_MAX = 40;
export const CUSTOM_PACK_PRICE_MIN = 0.01;
export const CUSTOM_PACK_PRICE_MAX = 999.99;

// Contents are expressed exactly like the built-in packs of the same tool.
export const CUSTOM_PACK_TOOLS = Object.freeze({
  'adventure-stall': {
    label: 'Adventure Stall',
    currency: 'shells',
    amountLabel: 'Shells in the pack',
    amountMin: 5,
    amountStep: 5,
    amountMax: 20000,
    limitLabel: 'Purchase limit per day',
    limitMin: 1,
    limitMax: 20,
    builtInNames: ADVENTURE_PACKS.map((p) => p.name),
  },
  'flamedragon-shop': {
    label: "Dragon's Caravan Optimizer",
    currency: 'essence',
    amountLabel: 'Dragon Essence in the pack',
    amountMin: 20,
    amountStep: 20,
    amountMax: 20000,
    limitLabel: 'Purchase limit',
    limitMin: 1,
    limitMax: 20,
    builtInNames: DRAGON_PACKS.map((p) => p.name),
  },
});

export function isCustomPackTool(tool) {
  return typeof tool === 'string' && Object.hasOwn(CUSTOM_PACK_TOOLS, tool);
}

const cleanName = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const CONTROL = /[\u0000-\u001f\u007f<>]/;
const sameName = (a, b) => a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en');

/**
 * Validate a custom pack. `others` = names of the other packs of this tool (custom ones, excluding
 * the pack being edited). Returns { value: { name, price, amount, limit } } or { error }.
 */
export function validateCustomPack(tool, input, others = []) {
  const spec = CUSTOM_PACK_TOOLS[tool];
  if (!spec) return { error: 'This tool cannot take extra packs.' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Invalid pack.' };
  const name = cleanName(input.name);
  if (!name) return { error: 'Enter a pack name.' };
  if (name.length > CUSTOM_PACK_NAME_MAX) return { error: `The pack name can be at most ${CUSTOM_PACK_NAME_MAX} characters.` };
  if (CONTROL.test(name)) return { error: 'The pack name cannot contain < > or control characters.' };
  if ([...spec.builtInNames, ...others].some((n) => sameName(n, name))) return { error: `A pack named "${name}" already exists in this tool.` };

  const price = input.price;
  if (typeof price !== 'number' || !Number.isFinite(price)) return { error: 'Price: enter a number.' };
  if (price <= 0) return { error: 'Price: must be more than $0.00.' };
  if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) return { error: 'Price: use at most 2 decimals (for example 4.99).' };
  if (price < CUSTOM_PACK_PRICE_MIN || price > CUSTOM_PACK_PRICE_MAX) return { error: `Price: enter an amount from $${CUSTOM_PACK_PRICE_MIN.toFixed(2)} to $${CUSTOM_PACK_PRICE_MAX.toFixed(2)}.` };

  const whole = (v) => typeof v === 'number' && Number.isInteger(v);
  const { amount, limit } = input;
  if (!whole(amount) || amount < spec.amountMin || amount > spec.amountMax || amount % spec.amountStep !== 0) {
    return { error: `${spec.amountLabel}: enter a whole number from ${spec.amountMin} to ${spec.amountMax.toLocaleString('en-US')} in multiples of ${spec.amountStep}.` };
  }
  if (!whole(limit) || limit < spec.limitMin || limit > spec.limitMax) {
    return { error: `${spec.limitLabel}: enter a whole number from ${spec.limitMin} to ${spec.limitMax}.` };
  }
  return { value: { name, price: Math.round(price * 100) / 100, amount, limit } };
}

/** Stored pack -> the pack object the member tool reads (same fields as the built-in packs). */
export function customPackToToolPack(tool, doc) {
  const spec = CUSTOM_PACK_TOOLS[tool];
  const cents = Math.round(doc.price * 100);
  const key = `custom-${doc.id}`;
  return tool === 'adventure-stall'
    ? { key, name: doc.name, shells: doc.amount, cents, perDay: doc.limit, custom: true }
    : { key, name: doc.name, [spec.currency]: doc.amount, cents, defaultMax: doc.limit, custom: true };
}

/** Append the enabled custom packs of `tool` to a tool configuration's pack list. */
export function withCustomPacks(tool, configuration, docs = []) {
  if (!isCustomPackTool(tool) || !configuration?.packs) return configuration;
  const extra = docs
    .filter((d) => d && d.tool_key === tool && d.enabled !== false)
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    .map((d) => customPackToToolPack(tool, d));
  return extra.length ? { ...configuration, packs: [...configuration.packs, ...extra] } : configuration;
}

export function newPackId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function isPackId(id) {
  return typeof id === 'string' && /^[a-z0-9]{6,24}$/.test(id);
}

/** Shape sent to the admin page. */
export function publicCustomPack(doc) {
  return {
    id: doc.id,
    tool_key: doc.tool_key,
    name: doc.name,
    price: doc.price,
    amount: doc.amount,
    limit: doc.limit,
    enabled: doc.enabled !== false,
    created_at: doc.created_at ? new Date(doc.created_at).toISOString() : null,
    updated_at: doc.updated_at ? new Date(doc.updated_at).toISOString() : null,
  };
}
