import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { resolveToolStorageKey, TOOL_SLUG_RENAMES } from '../../../lib/toolKeys.mjs';
import { TOOL_CATALOG, TOOL_KINDS, defaultQuantities, validateToolQuantities } from '../../../lib/toolCatalog.mjs';

const headers = { 'Cache-Control': 'no-store' };

// One settings document per tool (collection tool_settings, key tool_key) holds every
// editable value in `quantities`. Each value is owned by exactly one admin page (`kind`):
//   kind=pack -> Pack editing   (USD prices, pack contents, purchase limits)
//   kind=calc -> Tool database  (per-level / per-tier requirements, chest rewards, shop rates)
// GET ?kind=pack|calc lists only the tools and values of that page.
// PUT {tool, kind, quantities} saves only keys of that kind (anything else is rejected, so
// a pack page can never overwrite calculator data and vice versa). PUT {tool, kind, reset:true}
// restores that kind's defaults. `kind_updated_at.{pack|calc}` records the last save per page.

// Other member pages that read the same tool configuration.
const ALSO_REVALIDATE = { 'charm-pack-optimizer': ['charms', 'governor-charm-optimizer'], 'pet-pack-optimizer': ['pets'] };

function toolsFor(kind, rows) {
  return Object.entries(TOOL_CATALOG)
    .map(([key, tool]) => {
      const fields = tool.fields.filter((f) => !kind || f.kind === kind);
      if (!fields.length) return null;
      const row = rows?.find((r) => r.tool_key === key);
      const merged = { ...defaultQuantities(key), ...(row?.quantities || {}) };
      const quantities = Object.fromEntries(fields.map((f) => [f.key, merged[f.key]]));
      const defaults = Object.fromEntries(fields.map((f) => [f.key, f.value]));
      const stamp = kind ? row?.kind_updated_at?.[kind] : row?.updated_at;
      return { key, label: tool.label, fields, quantities, defaults, updated_at: stamp || null };
    })
    .filter(Boolean);
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  let kind = null;
  try { kind = new URL(request.url).searchParams.get('kind'); } catch { /* no query string */ }
  if (kind && !TOOL_KINDS.includes(kind)) return NextResponse.json({ error: 'kind must be pack or calc.' }, { status: 400, headers });
  try {
    const coll = await getCollection('tool_settings');
    const rows = await coll.find({}).project({ tool_key: 1, quantities: 1, updated_at: 1, kind_updated_at: 1, _id: 0 }).toArray();
    return NextResponse.json({ tools: toolsFor(kind, rows) }, { headers });
  } catch {
    return NextResponse.json({ tools: toolsFor(kind, []) }, { headers });
  }
}

export async function PUT(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
  }
  const toolKey = resolveToolStorageKey(body?.tool);
  const kind = body?.kind;
  if (!TOOL_CATALOG[toolKey]) return NextResponse.json({ error: 'Choose a supported tool.' }, { status: 400, headers });
  if (!TOOL_KINDS.includes(kind)) return NextResponse.json({ error: 'kind must be pack or calc.' }, { status: 400, headers });
  const ownKeys = new Set(TOOL_CATALOG[toolKey].fields.filter((f) => f.kind === kind).map((f) => f.key));
  const incoming = body?.reset === true
    ? Object.fromEntries(TOOL_CATALOG[toolKey].fields.filter((f) => f.kind === kind).map((f) => [f.key, f.value]))
    : body?.quantities;
  if (!incoming || Array.isArray(incoming) || typeof incoming !== 'object') {
    return NextResponse.json({ error: 'Choose a supported tool and valid quantities.' }, { status: 400, headers });
  }
  const foreign = Object.keys(incoming).filter((k) => !ownKeys.has(k));
  if (foreign.length) {
    const other = kind === 'pack' ? 'Tool database' : 'Pack editing';
    const known = TOOL_CATALOG[toolKey].fields.some((f) => foreign.includes(f.key));
    return NextResponse.json(
      { error: known ? `${foreign.slice(0, 3).join(', ')} belongs to ${other}, not here.` : `Unknown setting: ${foreign.slice(0, 3).join(', ')}.` },
      { status: 400, headers }
    );
  }
  try {
    const coll = await getCollection('tool_settings');
    const existing = await coll.findOne({ tool_key: toolKey }, { projection: { quantities: 1, kind_updated_at: 1, _id: 0 } });
    const { quantities, error } = validateToolQuantities(toolKey, { ...(existing?.quantities || {}), ...incoming });
    if (error) return NextResponse.json({ error }, { status: 400, headers });
    const now = new Date();
    await coll.updateOne(
      { tool_key: toolKey },
      { $set: { tool_key: toolKey, quantities, updated_at: now, kind_updated_at: { ...(existing?.kind_updated_at || {}), [kind]: now } } },
      { upsert: true }
    );
    for (const slug of new Set([TOOL_SLUG_RENAMES[toolKey] || toolKey, ...(ALSO_REVALIDATE[toolKey] || [])])) revalidatePath(`/tools/${slug}`);
    const tool = toolsFor(kind, [{ tool_key: toolKey, quantities, kind_updated_at: { [kind]: now } }]).find((t) => t.key === toolKey);
    return NextResponse.json({ ok: true, quantities: tool.quantities, updated_at: now.toISOString() }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to save tool settings.' }, { status: 500, headers });
  }
}
