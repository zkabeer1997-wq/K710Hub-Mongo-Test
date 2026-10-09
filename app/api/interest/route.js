import { NextResponse, after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { checkRateLimit, clientIp } from '../../../lib/rateLimit.mjs';
import { getActiveIntakePeriod } from '../../../lib/transferIntakePeriods.server';
import {
  INTEREST_UPLOAD_LIMITS,
  bytesMatchImageType,
  isAcceptedInterestImage,
  validateProcessedInterestFiles,
} from '../../../lib/interestUploadLimits.mjs';
import { migrateInterestBatch, storageLabel, uploadApplicantScreenshots } from '../../../lib/interestScreenshots.mjs';
import { readApplicantFromRequest } from '../../../lib/applicantAuth.js';
import {
  applyVerifiedSnapshot,
  buildOverwriteUpdate,
  findResubmitTarget,
  verificationMarkers,
} from '../../../lib/interestApplication.mjs';
import {
  NUMERIC_RULES,
  REQUIRED_FIELD_LABELS,
  normalizeDiscordUsername,
  normalizePlayerId,
  validateNumericAnswer,
} from '../../../lib/interestForm.mjs';

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MIN_FILL_TIME_MS = 3000;
const MAX_TEXT_FIELD_LENGTH = 300;

/** Text answers are short; cap them so a hostile body cannot store huge strings. */
function cap(value, max = MAX_TEXT_FIELD_LENGTH) {
  return String(value || '').trim().slice(0, max);
}


/** Uploads screenshots to Drive, falls back to base64 for whatever could not be uploaded. */
async function storeScreenshots({ coll, id, playerId, prepared, existing }) {
  let files = existing;
  let failedIdx = prepared.map((_, i) => i).filter((i) => !existing.some((f) => f.idx === i));
  let folderId = existing[0]?.folder_id || '';
  let folderLink = '';
  let driveWorked = false;
  try {
    const { getDriveStorage } = await import('../../../lib/driveStorage.server');
    const { getFolderTree } = await import('../../../lib/siteImages.server');
    const drive = await getDriveStorage();
    if ((await drive.getStatus()).connected) {
      const tree = await getFolderTree(drive);
      const result = await uploadApplicantScreenshots({
        drive, tree, playerId, files: prepared, existing,
        onProgress: (done) => coll.updateOne({ id }, { $set: { screenshot_files: done } }),
      });
      files = result.files; failedIdx = result.failed; folderId = result.folderId || folderId;
      driveWorked = result.files.length > 0 || !result.failed.length;
      if (folderId) folderLink = await tree.webViewLink(folderId);
    }
  } catch (error) {
    console.error('interest screenshots: Drive unavailable, using the temporary database fallback', error?.code || error?.message);
  }
  const urls = failedIdx.map((i) => `data:${prepared[i].type};base64,${prepared[i].bytes.toString('base64')}`);
  await coll.updateOne({ id }, { $set: {
    screenshot_files: files,
    screenshot_urls: urls,
    screenshot_storage: storageLabel({ filesCount: files.length, dbCount: urls.length }),
    screenshot_state: 'done',
    ...(folderId ? { drive_folder_id: folderId } : {}),
    ...(folderLink ? { drive_folder_link: folderLink } : {}),
  } });
  return { driveWorked, files, urls };
}

/** After a successful Drive upload, move older fallback screenshots too (never delays or fails this request). */
function scheduleWaitingRetry(coll) {
  const run = async () => {
    try {
      const { getDriveStorage } = await import('../../../lib/driveStorage.server');
      const { getFolderTree } = await import('../../../lib/siteImages.server');
      const drive = await getDriveStorage();
      await migrateInterestBatch({ coll, drive, tree: await getFolderTree(drive), batchSize: 2 });
    } catch (error) { console.error('interest screenshot retry failed', error?.message); }
  };
  try { after(run); } catch { /* no request scope (tests); the admin button still works */ }
}

export async function POST(request) {
  try {
    if (await checkRateLimit(`interest-submit:${clientIp(request)}`, { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX })) {
      return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
    }

    const formData = await request.formData();

    // Bots fill the hidden honeypot. A fast fill alone is NOT proof of a bot
    // (password managers and saved drafts fill a form in under 3 seconds), so
    // the timing rule only counts when the honeypot is also filled. A human
    // submission is never silently dropped.
    const honeypotFilled = Boolean(String(formData.get('website') || '').trim());
    const renderedAt = Number(formData.get('rendered_at')) || 0;
    const tooFast = Boolean(renderedAt) && Date.now() - renderedAt < MIN_FILL_TIME_MS;
    if (honeypotFilled && tooFast) {
      console.warn('interest submission dropped as spam (honeypot filled, too fast)');
      return NextResponse.json({ ok: true });
    }
    if (honeypotFilled) {
      console.warn('interest submission dropped as spam (honeypot filled)');
      return NextResponse.json({ ok: true });
    }
    if (tooFast) {
      console.warn('interest submission was very fast; kept (no honeypot)');
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

    const activePeriod = await getActiveIntakePeriod();
    if (!activePeriod) {
      return NextResponse.json(
        { error: 'Transfer intake is currently closed. Check back soon.' },
        { status: 409 }
      );
    }

    // Who is applying: ONLY the signed applicant cookie counts (never the member
    // session, never a client-sent flag). No/invalid/expired cookie = unverified.
    const snapshot = readApplicantFromRequest(request);

    let fields = {
      intake_period: activePeriod.label,
      intake_period_id: activePeriod.id,
      in_game_name: cap(formData.get('in_game_name')),
      // Digits only, so the "same player" match below cannot be dodged with spaces or prefixes.
      player_id: normalizePlayerId(cap(formData.get('player_id'))),
      discord_username: cap(normalizeDiscordUsername(formData.get('discord_username'))),
      current_server: cap(formData.get('current_server')),
      current_alliance: cap(formData.get('current_alliance')),
      migrate_alliance: cap(formData.get('migrate_alliance')),
      highest_troop_level: cap(formData.get('highest_troop_level')),
      current_tg: cap(formData.get('current_tg')),
      t11_units: formData.getAll('t11_units').slice(0, 20).map((v) => cap(v, 100)),
      // Older cached pages still send the legacy name; the value is read as the score.
      mystic_trial_score: cap(formData.get('mystic_trial_score') ?? formData.get('mystic_trial_stages')),
      total_power: cap(formData.get('total_power')),
      willing_reduce_power: cap(formData.get('willing_reduce_power')),
      passes_required: cap(formData.get('passes_required')),
      current_passes: cap(formData.get('current_passes')),
      active_commit: cap(formData.get('active_commit')),
      willing_save_resources: cap(formData.get('willing_save_resources')),
      participates_battles: cap(formData.get('participates_battles')),
      spending_archetype: cap(formData.get('spending_archetype')),
      main_language: cap(formData.get('main_language')),
    };

    // Verified applicant: the game's values replace whatever the browser sent.
    let locked = new Set();
    let markers = verificationMarkers(null);
    if (snapshot) {
      const applied = applyVerifiedSnapshot(fields, snapshot);
      fields = applied.fields;
      locked = applied.locked;
      markers = verificationMarkers(snapshot, applied);
    }

    // Every question is required. The server is the authority: it names the
    // first missing answer in plain words.
    const REQUIRED_FIELDS = [
      'in_game_name',
      'player_id',
      'discord_username',
      'current_server',
      'current_alliance',
      'migrate_alliance',
      'highest_troop_level',
      'current_tg',
      't11_units',
      'mystic_trial_score',
      'total_power',
      'willing_reduce_power',
      'passes_required',
      'current_passes',
      'active_commit',
      'willing_save_resources',
      'participates_battles',
      'spending_archetype',
      'main_language',
    ];
    const isMissing = (key) => (key === 't11_units' ? !fields.t11_units.length : !fields[key]);
    const missingField = REQUIRED_FIELDS.find(isMissing);
    if (missingField) {
      return NextResponse.json(
        {
          error: missingField === 't11_units'
            ? 'Select at least one T11 option.'
            : `Missing required answer: ${REQUIRED_FIELD_LABELS[missingField]}.`,
          field: missingField,
        },
        { status: 400 }
      );
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

    // Numbers: parsed, range-checked and stored as plain digits.
    for (const key of Object.keys(NUMERIC_RULES)) {
      if (locked.has(key)) continue; // read from the game, not typed
      const checked = validateNumericAnswer(key, fields[key]);
      if (!checked.ok) {
        return NextResponse.json({ error: checked.error || 'Please check the numbers.', field: key }, { status: 400 });
      }
      fields[key] = checked.digits;
    }

    // Validated, ready-to-store screenshots (bytes are checked once, here).
    const prepared = [];
    for (const file of screenshots) {
      const buffer = Buffer.from(await file.arrayBuffer());
      // The client converts HEIC and recompresses, so what arrives must be a
      // genuine JPEG/PNG/WebP whose header matches its declared type.
      if (!bytesMatchImageType(buffer, file.type)) {
        return NextResponse.json(
          { error: 'One file is not a valid JPG, PNG, or WebP image.' },
          { status: 415 }
        );
      }
      prepared.push({ bytes: buffer, type: file.type });
    }

    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    // Idempotent retry: the form sends one random id per application. If the
    // first attempt was stored but the reply was lost (bad connection), the
    // retry gets the same reference instead of creating a duplicate row. A row
    // still marked 'pending' (the first attempt died while uploading) resumes
    // its uploads into the same Drive folder instead of starting over.
    const clientRequestId = cap(formData.get('client_request_id'), 64);
    let doc = null;
    if (clientRequestId) {
      const existing = await coll.findOne({ client_request_id: clientRequestId });
      if (existing?.id && existing.screenshot_state !== 'pending') {
        return NextResponse.json({ ok: true, reference: 'K710-' + String(existing.id).replace(/-/g, '').slice(0, 8).toUpperCase() });
      }
      doc = existing || null;
    }

    // Same player, same intake window: the latest application replaces the
    // earlier one (see lib/interestApplication.mjs). An unverified submission
    // never overwrites a verified one.
    let id = doc?.id || '';
    let resubmitted = false;
    if (!doc) {
      const { target, duplicateOf } = await findResubmitTarget(coll, {
        playerId: fields.player_id,
        periodId: fields.intake_period_id,
        verified: markers.verified,
      });
      const now = new Date();
      if (target) {
        id = target.id;
        resubmitted = true;
        await coll.updateOne(
          { _id: target._id },
          buildOverwriteUpdate(target, { fields, markers, clientRequestId, duplicateOf, now })
        );
      } else {
        id = randomUUID();
        await coll.insertOne({
          id,
          ...fields,
          ...markers,
          ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
          ...(duplicateOf ? { unverified_duplicate_of: duplicateOf } : {}),
          screenshot_urls: [],
          screenshot_files: [],
          screenshot_state: 'pending',
          status: 'pending',
          created_at: now,
          first_submitted_at: now,
          updated_at: now,
          resubmitted_count: 0,
        });
      }
    }

    // Screenshots go to Google Drive (K710 Website/Applications/<Player ID>/).
    // If Drive is not connected or is down the application must NOT be lost:
    // the screenshots that could not be uploaded are kept in MongoDB as base64
    // (storage 'db', a temporary fallback) and the admin sees a warning with a
    // "Move to Drive" action. They are retried on the next submission.
    const stored = await storeScreenshots({ coll, id, playerId: fields.player_id, prepared, existing: doc?.screenshot_files || [] });
    if (stored.driveWorked) scheduleWaitingRetry(coll);

    const reference = 'K710-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
    return NextResponse.json({ ok: true, reference, verified: markers.verified, resubmitted });
  } catch (error) {
    console.error('interest submission failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
