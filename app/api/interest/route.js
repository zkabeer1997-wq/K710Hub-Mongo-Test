import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import {
  INTEREST_UPLOAD_LIMITS,
  isAcceptedInterestImage,
  validateProcessedInterestFiles,
} from '../../../lib/interestUploadLimits.mjs';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map();
const MIN_FILL_TIME_MS = 3000;

function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
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

export async function POST(request) {
  try {
    const ip = clientIp(request);
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }

    const formData = await request.formData();

    if (String(formData.get('website') || '').trim()) {
      return NextResponse.json({ ok: true });
    }

    const renderedAt = Number(formData.get('rendered_at')) || 0;
    if (renderedAt && Date.now() - renderedAt < MIN_FILL_TIME_MS) {
      return NextResponse.json({ ok: true });
    }

    const screenshots = formData
      .getAll('screenshots')
      .filter((f) => f && typeof f.arrayBuffer === 'function');
    if (!screenshots.length) {
      return NextResponse.json(
        { error: 'Upload at least one battle report screenshot.' },
        { status: 400 }
      );
    }
    if (screenshots.length > INTEREST_UPLOAD_LIMITS.maxFiles) {
      return NextResponse.json(
        { error: `Upload no more than ${INTEREST_UPLOAD_LIMITS.maxFiles} screenshots.` },
        { status: 400 }
      );
    }
    if (screenshots.some((file) => !isAcceptedInterestImage(file))) {
      return NextResponse.json(
        { error: 'One image type is not supported. Use JPG, PNG, WebP, HEIC, or HEIF.' },
        { status: 415 }
      );
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

    const REQUIRED_FIELDS = [
      'in_game_name',
      'player_id',
      'discord_username',
      'current_server',
      'current_alliance',
      'intake_period',
      'migrate_alliance',
      'highest_troop_level',
      'current_tg',
      'mystic_trial_stages',
      'total_power',
      'active_commit',
      'willing_save_resources',
      'participates_battles',
      'spending_archetype',
      'main_language',
    ];
    const missingField = REQUIRED_FIELDS.find((key) => !fields[key]);
    if (missingField) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    if (!fields.t11_units.length) {
      return NextResponse.json({ error: 'Select at least one T11 option.' }, { status: 400 });
    }

    const OTHER_MISSING_DETAIL = /^other:\s*$/i;
    if (OTHER_MISSING_DETAIL.test(fields.migrate_alliance.trim())) {
      return NextResponse.json(
        { error: 'Please specify which alliance you want to migrate to.' },
        { status: 400 }
      );
    }
    if (OTHER_MISSING_DETAIL.test(fields.main_language.trim())) {
      return NextResponse.json({ error: 'Please specify your main language.' }, { status: 400 });
    }

    const NUMERIC_FIELDS = [
      'current_tg',
      'mystic_trial_stages',
      'total_power',
      'passes_required',
      'current_passes',
    ];
    const NUMERIC_RE = /^[0-9][0-9,]*$/;
    const invalidNumericField = NUMERIC_FIELDS.find(
      (key) => fields[key] && !NUMERIC_RE.test(fields[key].trim())
    );
    if (invalidNumericField) {
      return NextResponse.json(
        { error: 'Troop and power fields should contain numbers only.' },
        { status: 400 }
      );
    }

    const screenshotUrls = [];
    for (const file of screenshots) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = file.type || 'application/octet-stream';
      screenshotUrls.push(`data:${mime};base64,${buffer.toString('base64')}`);
    }

    const id = randomUUID();
    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    await coll.insertOne({
      id,
      ...fields,
      screenshot_urls: screenshotUrls,
      status: 'pending',
      created_at: new Date(),
    });

    const reference = 'K710-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
    return NextResponse.json({ ok: true, reference });
  } catch (error) {
    console.error('interest submission failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
