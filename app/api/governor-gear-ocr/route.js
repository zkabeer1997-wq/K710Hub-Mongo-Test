import { NextResponse } from 'next/server';
import { normalizePowerProfileOcrPayload } from '../../../lib/governorGearOcr.mjs';
import { readMemberSession } from '../../../lib/memberAuth';
import { clientIp, isRateLimited } from '../../../lib/rateLimit.mjs';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const PRIMARY_ENDPOINT = process.env.GOVERNOR_GEAR_OCR_ENDPOINT
  || 'https://optimizer-ocr.zebrave.workers.dev/api/parse-govgear';
const CHARM_ENDPOINT = process.env.CHARM_OCR_ENDPOINT
  || process.env.GOVERNOR_CHARM_OCR_ENDPOINT
  || '';

async function postImage(endpoint, image, extraHeaders = {}) {
  const upstreamBody = new FormData();
  upstreamBody.append('image', image, image.name || 'governor-profile.png');
  const response = await fetch(endpoint, {
    method: 'POST',
    body: upstreamBody,
    headers: extraHeaders,
    signal: AbortSignal.timeout(28000),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export async function POST(request) {
  if (!(await readMemberSession(request))) {
    return NextResponse.json({ error: 'Member login required.' }, { status: 401 });
  }
  if (isRateLimited(`governor-gear-ocr:${clientIp(request)}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json({ error: 'Too many scans. Please wait a moment and try again.' }, { status: 429 });
  }
  try {
    const formData = await request.formData();
    const image = formData.get('image');
    if (!image || typeof image.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Choose a Governor Profile screenshot first.' }, { status: 400 });
    }
    if (!ACCEPTED_TYPES.has(image.type)) {
      return NextResponse.json({ error: 'Use a PNG, JPEG, or WebP screenshot.' }, { status: 415 });
    }
    if (image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'The screenshot must be smaller than 8 MB.' }, { status: 413 });
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    const primaryFile = new File([bytes], image.name || 'governor-profile.png', { type: image.type });
    const { response, payload } = await postImage(PRIMARY_ENDPOINT, primaryFile);

    if (!response.ok) {
      console.error('Governor Gear OCR service error', response.status, payload?.error || 'Unknown OCR error');
      const status = response.status === 429 ? 429 : 502;
      return NextResponse.json({
        error: status === 429
          ? 'The scanner is busy. Please wait a moment and try again.'
          : 'The scanner could not read this image right now.',
      }, { status });
    }

    let normalized = normalizePowerProfileOcrPayload(payload);

    if (CHARM_ENDPOINT && normalized.charmCount === 0) {
      try {
        const charmFile = new File([bytes], image.name || 'governor-profile.png', { type: image.type });
        const charmResult = await postImage(CHARM_ENDPOINT, charmFile, {
          'X-Expected-Screenshot-Type': 'governor-charms',
        });
        if (charmResult.response.ok) {
          const charmNorm = normalizePowerProfileOcrPayload(charmResult.payload);
          normalized = {
            gear: { ...normalized.gear, ...charmNorm.gear },
            charms: { ...normalized.charms, ...charmNorm.charms },
            review: [...normalized.review, ...charmNorm.review],
            gearCount: 0,
            charmCount: 0,
          };
          normalized.gearCount = Object.keys(normalized.gear).length;
          normalized.charmCount = Object.keys(normalized.charms).length;
        }
      } catch (charmError) {
        console.warn('Charm OCR secondary pass failed', charmError instanceof Error ? charmError.message : charmError);
      }
    }

    if (normalized.gearCount === 0 && normalized.charmCount === 0) {
      return NextResponse.json({
        error: 'No Governor Gear or Charm levels were clear. Use the full, uncropped Governor Profile screen and try again.',
      }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      gear: normalized.gear,
      charms: normalized.charms,
      selections: normalized.gear,
      review: normalized.review,
      gearCount: normalized.gearCount,
      charmCount: normalized.charmCount,
    });
  } catch (error) {
    console.error('Governor Gear / Charm OCR failed', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'The screenshot could not be processed. Please try again.' }, { status: 500 });
  }
}
