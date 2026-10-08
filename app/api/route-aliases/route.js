import { NextResponse } from 'next/server';
import { getRouteAliasMap } from '../../../lib/routeAliases.server';

// Public, read-only {from: to} map. Used by the proxy (which cannot reach
// Mongo itself) and available to navigation helpers. Fails open to {}.
export async function GET() {
  const map = await getRouteAliasMap();
  const res = NextResponse.json({ aliases: map });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
