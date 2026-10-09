import { LEGACY_ALLIANCE_TAGS } from './alliances.mjs';

/** Tags a form may offer: the active alliances in sort order (the old three if none are known). */
export function offeredAllianceTags(activeTags) {
  const tags = [...new Set((Array.isArray(activeTags) ? activeTags : []).map((t) => String(t ?? '').trim()).filter(Boolean))];
  return tags.length ? tags : [...LEGACY_ALLIANCE_TAGS];
}

/** Tags a form submission may carry: active alliances plus the legacy three, so saved answers never break. */
export function acceptedAllianceTags(activeTags) {
  return [...new Set([...offeredAllianceTags(activeTags), ...LEGACY_ALLIANCE_TAGS])];
}

// The transfer form stores this exact string in the Inbox, so the original three keep their stored wording.
const LEGACY_MIGRATE = {
  '710': { value: '710 (Bear 0200UTC and 1300UTC)', hint: 'Bear Hunt at 02:00 and 13:00 UTC' },
  RED: { value: 'RED (Bear 1105UTC, 1900UTC and 2320UTC)', hint: 'Bear Hunt at 11:05, 19:00 and 23:20 UTC' },
  SKY: { value: 'SKY (Bear 1200UTC and 2000UTC)', hint: 'Bear Hunt at 12:00 and 20:00 UTC' },
};

function joinList(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Options for "Which alliance do you want to join?" from public alliance summaries ({tag, bear_times_utc}). */
export function migrateOptionsFor(alliances) {
  const list = Array.isArray(alliances) && alliances.length ? alliances : LEGACY_ALLIANCE_TAGS.map((tag) => ({ tag }));
  const options = list.map((a) => {
    const tag = String(a.tag);
    const times = (Array.isArray(a.bear_times_utc) ? a.bear_times_utc : []).filter((t) => /^\d{2}:\d{2}$/.test(t));
    const legacy = LEGACY_MIGRATE[tag];
    const hint = times.length ? `Bear Hunt at ${joinList(times)} UTC` : legacy?.hint;
    const value = legacy ? legacy.value : times.length ? `${tag} (Bear ${joinList(times.map((t) => `${t.replace(':', '')}UTC`))})` : tag;
    return { value, label: tag, ...(hint ? { hint } : {}) };
  });
  return [...options, { value: 'Other', label: 'Another alliance', hint: 'You will type its name' }];
}

/** Make sure a saved value that is no longer offered still shows in a dropdown. */
export function withCurrentTag(options, current) {
  const value = String(current ?? '').trim();
  return value && !options.includes(value) ? [...options, value] : options;
}
