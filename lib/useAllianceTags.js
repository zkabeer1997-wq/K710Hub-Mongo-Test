'use client';

import { useEffect, useState } from 'react';
import { LEGACY_ALLIANCE_TAGS } from './alliances.mjs';
import { withCurrentTag } from './allianceTags.mjs';

// Active alliances for the member forms. Starts with the legacy three (so the
// form is usable at once and if the request fails), then upgrades from the DB.
let cached = null;

/** Active alliances ({tag, name, bear_times_utc}) once loaded, otherwise null. */
export function useAlliances() {
  const [alliances, setAlliances] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let live = true;
    fetch('/api/alliance-tags')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.alliances) && data.alliances.length) {
          cached = data.alliances;
          if (live) setAlliances(cached);
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return alliances;
}

/** Tags to offer in an alliance dropdown (legacy three until the list arrives); `current` is kept if saved. */
export function useAllianceTags(current = '') {
  const alliances = useAlliances();
  return withCurrentTag(alliances ? alliances.map((a) => a.tag) : [...LEGACY_ALLIANCE_TAGS], current);
}
