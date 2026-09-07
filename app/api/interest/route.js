import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import {
  INTEREST_UPLOAD_LIMITS,
  isAcceptedInterestImage,
  validateProcessedInterestFiles,
} from '../../../lib/interestUploadLimits.mjs';

// Best-effort in-memory rate limit: 5 submissions per 10 minutes per IP.
// Honest limitation, not overclaimed: this Map lives in one warm serverless
// instance's memory. Vercel can and does route requests to multiple
// instances, and a cold start clears it, so this does not guarantee a
// global cap under real distributed load - it only raises the cost of a
// casual scripted flood on a single warm instance. A durable limiter needs
// a shared store (e.g. Upstash Redis), which is a real infra dependency
// this PR does not introduce unasked.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  // Bound the map itself so a flood of distinct spoofed IPs cannot grow it
  // without limit for the lifetime of the warm instance.
  if (rateLimitHits.size > 5000) {
    const oldestKey = rateLimitHits.keys().next().value;
    rateLimitHits.delete(oldestKey);
  }
  return hits.length > RATE_LIMIT_MAX;
}

function clientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// A human reading and filling five paginated steps takes more than this;
// a bot posting straight to the endpoint (or filling the form via script
// with no render delay) typically does not.
const MIN_FILL_TIME_MS = 3000;

export async function POST(request) {
try {
const ip = clientIp(request);
if (isRateLimited(ip)) {
  return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
}

const formData = await request.formData();

// Honeypot: a real applicant never sees or fills this field (hidden via
// CSS in InterestForm.js, not disabled/hidden by input type, since some
// bots specifically skip those). A filled value means a bot filled every
// field it could find. Return success without writing anything, so the
// bot's script sees no signal to adjust its behavior.
if (String(formData.get('website') || '').trim()) {
  return NextResponse.json({ ok: true });
}

const renderedAt = Number(formData.get('rendered_at')) || 0;
if (renderedAt && Date.now() - renderedAt < MIN_FILL_TIME_MS) {
  return NextResponse.json({ ok: true });
}

const supabase = createAdminSupabaseClient();

const screenshots = formData.getAll('screenshots').filter((f) => f && typeof f.arrayBuffer === 'function');
if (!screenshots.length) {
  return NextResponse.json({ error: 'Upload at least one battle report screenshot.' }, { status: 400 });
}
if (screenshots.length > INTEREST_UPLOAD_LIMITS.maxFiles) {
  return NextResponse.json({ error: `Upload no more than ${INTEREST_UPLOAD_LIMITS.maxFiles} screenshots.` }, { status: 400 });
}
if (screenshots.some((file) => !isAcceptedInterestImage(file))) {
  return NextResponse.json({ error: 'One image type is not supported. Use JPG, PNG, WebP, HEIC, or HEIF.' }, { status: 415 });
}
const processedFileError = validateProcessedInterestFiles(screenshots);
if (processedFileError) {
  return NextResponse.json({ error: processedFileError }, { status: 413 });
}

const fields = {
intake_period: String(formData.get('intake_period') || ''),
in_game_name: String(formData.get('in_game_name') || ''),
player_id: String(formData.get('player_id') || ''),
discord_username: String(formData.get('discord_username') || ''),
current_server: String(formData.get('current_server') || ''),
current_alliance: String(formData.get('current_alliance') || ''),
migrate_alliance: String(formData.get('migrate_alliance') || ''),
highest_troop_level: String(formData.get('highest_troop_level') || ''),
current_tg: String(formData.get('current_tg') || ''),
t11_units: formData.getAll('t11_units').map(String),
mystic_trial_stages: String(formData.get('mystic_trial_stages') || ''),
total_power: String(formData.get('total_power') || ''),
willing_reduce_power: String(formData.get('willing_reduce_power') || ''),
passes_required: String(formData.get('passes_required') || ''),
current_passes: String(formData.get('current_passes') || ''),
active_commit: String(formData.get('active_commit') || ''),
willing_save_resources: String(formData.get('willing_save_resources') || ''),
participates_battles: String(formData.get('participates_battles') || ''),
spending_archetype: String(formData.get('spending_archetype') || ''),
main_language: String(formData.get('main_language') || ''),
};

// Mirrors InterestForm.js's ACTS[*].required lists (in camelCase there,
// snake_case on the wire here) so a submission posted straight to this
// endpoint - skipping the 5-step wizard's own required-field checks -
// can't reach the review queue missing the vetting data admins rely on.
// Checked before the (slow, per-file) storage upload below so an
// incomplete submission fails fast instead of leaving orphaned files.
const REQUIRED_FIELDS = [
  'in_game_name', 'player_id', 'discord_username', 'current_server', 'current_alliance',
  'intake_period', 'migrate_alliance',
  'highest_troop_level', 'current_tg', 'mystic_trial_stages', 'total_power',
  'active_commit', 'willing_save_resources', 'participates_battles', 'spending_archetype', 'main_language',
];
const missingField = REQUIRED_FIELDS.find((key) => !fields[key]);
if (missingField) {
return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
}
if (!fields.t11_units.length) {
return NextResponse.json({ error: 'Select at least one T11 option.' }, { status: 400 });
}

// InterestForm.js sends the "Other" radio options as "Other: <detail>" -
// catches a blank detail that would otherwise pass the presence check
// above (the literal string "Other:" is still truthy).
const OTHER_MISSING_DETAIL = /^other:\s*$/i;
if (OTHER_MISSING_DETAIL.test(fields.migrate_alliance.trim())) {
return NextResponse.json({ error: 'Please specify which alliance you want to migrate to.' }, { status: 400 });
}
if (OTHER_MISSING_DETAIL.test(fields.main_language.trim())) {
return NextResponse.json({ error: 'Please specify your main language.' }, { status: 400 });
}

// Digits with optional thousands commas - mirrors InterestForm.js's
// isNumericValue. Only checked when present, since passes_required/
// current_passes are optional.
const NUMERIC_FIELDS = ['current_tg', 'mystic_trial_stages', 'total_power', 'passes_required', 'current_passes'];
const NUMERIC_RE = /^[0-9][0-9,]*$/;
const invalidNumericField = NUMERIC_FIELDS.find((key) => fields[key] && !NUMERIC_RE.test(fields[key].trim()));
if (invalidNumericField) {
return NextResponse.json({ error: 'Troop and power fields should contain numbers only.' }, { status: 400 });
}

const screenshotUrls = [];
for (const file of screenshots) {
const arrayBuffer = await file.arrayBuffer();
const originalName = file.name || 'screenshot.png';
const ext = originalName.includes('.') ? originalName.split('.').pop() : 'png';
const path = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
const { error: uploadError } = await supabase.storage
.from('interest-screenshots')
.upload(path, Buffer.from(arrayBuffer), { contentType: file.type || 'application/octet-stream' });
if (uploadError) {
console.error('interest screenshot upload failed', uploadError);
return NextResponse.json({ error: 'Could not upload your screenshot. Please try again.' }, { status: 500 });
}
const { data: publicUrlData } = supabase.storage.from('interest-screenshots').getPublicUrl(path);
screenshotUrls.push(publicUrlData.publicUrl);
}

const payload = { ...fields, screenshot_urls: screenshotUrls };

const { data: insertedRow, error } = await supabase
  .from('interest_submissions')
  .insert(payload)
  .select('id')
  .single();
if (error) {
console.error('interest_submissions insert failed', error);
return NextResponse.json({ error: 'Something went wrong saving your petition. Please try again.' }, { status: 500 });
}

// A short, applicant-facing reference so they have something concrete to
// confirm receipt with (or quote if they need to follow up) - not a lookup
// key for a status page, just derived from the row id.
const reference = insertedRow?.id
  ? 'K710-' + String(insertedRow.id).replace(/-/g, '').slice(0, 8).toUpperCase()
  : null;

return NextResponse.json({ ok: true, reference });
} catch (error) {
console.error('interest submission failed', error);
return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}
}
