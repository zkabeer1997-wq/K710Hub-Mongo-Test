import glossary from '../../../i18n/glossary.json';
import { getCollection } from '../../../lib/mongo.js';
import { handleTranslate } from '../../../lib/i18n/translateRoute.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Public, same-origin, rate limited and budget capped. See docs/translation.md.
export async function POST(request) {
  return handleTranslate(request, { glossary, getCollection });
}

export async function GET() {
  return new Response(JSON.stringify({ ok: false, error: 'POST {lang, strings} to translate.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST', 'Cache-Control': 'no-store' },
  });
}
