/**
 * Pure completion logic for the member dashboard "Getting Started" checklist.
 *
 * Intentionally has no I/O: the page fetches whatever data is already cheaply
 * available (session profile, and the same power-profile / KvK-availability
 * rows the individual form pages already load) and hands it to
 * getChecklistState(). Items whose completion cannot be determined without a
 * heavy new query are marked alwaysActionable and simply always render as an
 * open action link rather than a checkbox.
 */

/**
 * A gear/power profile row is considered "on file" once the member has saved
 * any of the fields the Power Profile form collects. `updated_at` alone is
 * the strongest signal (it is only set once a save has happened), but we
 * also accept a populated governor_gear / charms / mystic trial value so a
 * profile written before `updated_at` existed still counts.
 */
export function hasGearProfile(powerProfile) {
  if (!powerProfile || typeof powerProfile !== 'object') return false;
  if (powerProfile.updated_at) return true;
  const signalFields = [
    'governor_gear',
    'charms',
    'hero_gear',
    'pet_power',
    'masters_power',
    'mystic_trial_score',
  ];
  return signalFields.some((field) => {
    const value = powerProfile[field];
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

/**
 * A KvK availability submission is "on file" once the member has chosen an
 * availability window (the row itself exists from the moment a member's
 * roster entry is created, so presence alone is not a reliable signal).
 */
export function hasKvkSubmission(kvkAvailability) {
  if (!kvkAvailability || typeof kvkAvailability !== 'object') return false;
  return Boolean(String(kvkAvailability.availability || '').trim());
}

/**
 * @param {object} memberData
 * @param {object|null} [memberData.powerProfile] - row from GET /api/power-profile
 * @param {object|null} [memberData.kvkAvailability] - row from GET /api/kvk-availability
 * @returns {Array<{key:string,label:string,description:string,complete:boolean,alwaysActionable:boolean}>}
 */
export function getChecklistState(memberData = {}) {
  const { powerProfile = null, kvkAvailability = null } = memberData || {};

  return [
    {
      key: 'gear-profile',
      label: 'Update your gear profile',
      description: 'Add your Governor Gear, Charms, Pets, Masters and Mystic Trial score.',
      complete: hasGearProfile(powerProfile),
      alwaysActionable: false,
    },
    {
      key: 'kvk-form',
      label: 'Complete a KvK form',
      description: 'Submit your alliance and battle availability so rally planners can count on you.',
      complete: hasKvkSubmission(kvkAvailability),
      alwaysActionable: false,
    },
    {
      key: 'bear-hunt',
      label: 'Check the Bear Hunt schedule',
      description: 'See upcoming Bear Hunt windows and other kingdom events.',
      // No member-specific "seen the schedule" signal exists without a new
      // query, so this item is always an open action rather than a checkbox.
      complete: false,
      alwaysActionable: true,
    },
  ];
}
