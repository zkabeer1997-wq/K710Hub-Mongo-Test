import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { RENAMEABLE_ROUTES, buildAliasMap, validateAlias, renameableRoute } from '../../../lib/routeAliases.mjs';
import { invalidateRouteAliases, listRouteAliasRows } from '../../../lib/routeAliases.server';
import { requireRouteSuperadmin } from '../../../lib/routeAliasesAccess.server';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

const DENIED = { error: 'Superadmin access required.' };

async function payload() {
  const map = buildAliasMap(await listRouteAliasRows());
  return {
    pages: RENAMEABLE_ROUTES.map((r) => ({ path: r.path, label: r.label, current: map[r.path] || r.path, isDefault: !map[r.path] })),
  };
}

export async function GET(request) {
  if (!(await requireRouteSuperadmin(request))) return json(DENIED, { status: 403 });
  try {
    return json(await payload());
  } catch {
    return json({ error: 'Page addresses could not be loaded.' }, { status: 500 });
  }
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return null;
  }
}

async function save(request) {
  const actor = await requireRouteSuperadmin(request);
  if (!actor) return json(DENIED, { status: 403 });
  const body = await readBody(request);
  if (!body) return json({ error: 'Invalid request.' }, { status: 400 });
  try {
    const rows = await listRouteAliasRows();
    const check = validateAlias(body.from, body.to, rows);
    if (!check.ok) return json({ error: check.error }, { status: 400 });
    const coll = await getCollection(COLLECTIONS.ROUTE_ALIASES);
    await coll.updateOne(
      { from: check.from },
      { $set: { from: check.from, to: check.to, updated_by: actor.playerId, updated_at: new Date() } },
      { upsert: true }
    );
    invalidateRouteAliases();
    return json(await payload());
  } catch (error) {
    if (error?.code === 11000) return json({ error: 'Another page already uses that address.' }, { status: 400 });
    return json({ error: 'The address could not be saved.' }, { status: 500 });
  }
}

export const PUT = save;
export const POST = save;

export async function DELETE(request) {
  const actor = await requireRouteSuperadmin(request);
  if (!actor) return json(DENIED, { status: 403 });
  const body = (await readBody(request)) || {};
  const from = String(body.from || new URL(request.url).searchParams.get('from') || '').trim();
  if (!renameableRoute(from)) return json({ error: 'That page cannot be renamed.' }, { status: 400 });
  try {
    const coll = await getCollection(COLLECTIONS.ROUTE_ALIASES);
    await coll.deleteOne({ from });
    invalidateRouteAliases();
    return json(await payload());
  } catch {
    return json({ error: 'The address could not be reset.' }, { status: 500 });
  }
}
